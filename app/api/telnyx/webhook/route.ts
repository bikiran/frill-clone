import { NextRequest, NextResponse } from 'next/server'
import { log } from '@/lib/log'
import { createClient } from '@supabase/supabase-js'
import { notifyCompany } from '@/lib/notify'
import { runKeywordReply } from '@/lib/keyword-reply'
import { TelnyxService } from '@/lib/telnyx-service'
import { logWebhookEvent } from '@/lib/webhook-log'
import { ensureCallCard, setCallPreview } from '@/lib/call-card'
import { logEnquiryReopened } from '@/lib/conversation-timeline'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Single webhook endpoint for Telnyx — handles inbound SMS and call status events.
// Configure this URL in the Telnyx Messaging Profile and Voice Connection:
//   https://<your-domain>/api/telnyx/webhook
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const event = body?.data
    const eventType: string = event?.event_type || ''
    const db = admin()

    // Record the event for the Super Admin webhook explorer (best-effort).
    logWebhookEvent({ source: 'telnyx', eventType, payload: body })

    // ── Delivery receipts ────────────────────────────────────────────────────
    // Telnyx reports the outcome of an outbound message with message.finalized
    // (and message.sent for the initial hand-off). Without this, campaign
    // recipients stayed on "sent" forever and the delivered figure in reports
    // was really just a count of messages accepted by the carrier.
    if (eventType === 'message.finalized' || eventType === 'message.sent') {
      try {
        const providerId = event?.payload?.id || event?.id
        const to = event?.payload?.to
        const status = Array.isArray(to) && to.length
          ? String(to[0]?.status || '').toLowerCase()
          : ''
        if (providerId && status) {
          const delivered = status === 'delivered'
          const failed = ['delivery_failed', 'failed', 'undelivered', 'expired'].includes(status)
          if (delivered || failed) {
            const errText = event?.payload?.errors?.[0]?.detail
              || event?.payload?.errors?.[0]?.title
              || null
            await db.from('campaign_recipients').update({
              status: delivered ? 'delivered' : 'failed',
              delivered_at: delivered ? new Date().toISOString() : null,
              error: failed ? String(errText || status).slice(0, 300) : null,
            }).eq('provider_id', providerId)

            // Keep the campaign's counters in step with its recipients.
            const { data: rec } = await db.from('campaign_recipients')
              .select('campaign_id').eq('provider_id', providerId).maybeSingle()
            if (rec?.campaign_id) {
              const { count: deliveredCount } = await db.from('campaign_recipients')
                .select('*', { count: 'exact', head: true })
                .eq('campaign_id', rec.campaign_id).eq('status', 'delivered')
              const { count: failedCount } = await db.from('campaign_recipients')
                .select('*', { count: 'exact', head: true })
                .eq('campaign_id', rec.campaign_id).eq('status', 'failed')
              await db.from('campaigns').update({
                delivered_count: deliveredCount || 0,
                failed_count: failedCount || 0,
              }).eq('id', rec.campaign_id)
            }
          }
        }
      } catch (e) {
        console.error('[telnyx] delivery receipt handling failed', e)
      }
      return NextResponse.json({ ok: true })
    }

    // ── Inbound SMS ──────────────────────────────────────────────────────────
    if (eventType === 'message.received') {
      const payload = event.payload
      const from = payload?.from?.phone_number
      const to = Array.isArray(payload?.to) ? payload.to[0]?.phone_number : payload?.to?.phone_number
      const text = payload?.text || ''

      // Inbound MMS media. Telnyx puts each attachment in payload.media
      // [{ url, content_type, size }]. Carriers rarely deliver MMS on Australian
      // numbers, but when they DO (or on a US/CA number), capture it so the
      // customer's photo appears in the thread instead of being silently dropped.
      const inboundMedia = (Array.isArray(payload?.media) ? payload.media : [])
        .map((m: any) => {
          const url = m?.url
          if (!url) return null
          const ct = String(m?.content_type || '')
          const kind = ct.startsWith('image/') ? 'image'
            : ct.startsWith('video/') ? 'video'
            : ct.startsWith('audio/') ? 'audio' : 'file'
          return { url, kind, type: ct || undefined, name: (kind === 'file' ? 'attachment' : kind) }
        })
        .filter(Boolean)
      const mediaPreview = inboundMedia.length
        ? (inboundMedia[0].kind === 'image' ? '📷 Photo'
          : inboundMedia[0].kind === 'video' ? '🎥 Video'
          : inboundMedia[0].kind === 'audio' ? '🎤 Voice message' : '📎 Attachment')
        : ''

      // The customer TRIED to send media but the carrier couldn't hand it to us
      // (common on Australian numbers, which don't carry MMS). Telnyx still marks
      // the message as MMS, or includes media metadata with no fetchable url — so
      // when we see that signal but captured nothing usable, flag the attempt so
      // the agent can one-tap back a secure upload link instead of the photo
      // silently vanishing.
      const rawMediaCount = Array.isArray(payload?.media) ? payload.media.length : 0
      const isMmsType = String(payload?.type || '').toUpperCase() === 'MMS'
      const mediaAttemptFailed = (isMmsType || rawMediaCount > 0) && inboundMedia.length === 0

      // What the conversation list / notifications show when there's no caption.
      const summary = text || mediaPreview || (mediaAttemptFailed ? '📷 Tried to send media' : '')

      // Which company owns the receiving number?
      const { data: integ } = await db.from('telnyx_integrations').select('company_id').eq('phone_number', to).maybeSingle()
      const companyId = integ?.company_id
      if (!companyId) return NextResponse.json({ ok: true }) // not ours

      // Normalise phone numbers to their last 9 digits so E.164 (+61407207207)
      // and local (0407207207) forms match.
      const digits = (s: string) => (s || '').replace(/\D/g, '').slice(-9)
      const fromDigits = digits(from)

      // ── Opt-out / opt-in keywords ────────────────────────────────────────
      // Honouring STOP is a legal requirement for marketing SMS, and it has to
      // work regardless of what else happens to the message. Handled here,
      // before any conversation routing, so a malformed thread can't swallow it.
      const keyword = String(text).trim().toUpperCase().replace(/[^A-Z]/g, '')
      const STOP_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT']
      const START_WORDS = ['START', 'SUBSCRIBE', 'YES', 'OPTIN', 'UNSTOP']
      if (fromDigits && (STOP_WORDS.includes(keyword) || START_WORDS.includes(keyword))) {
        const optingOut = STOP_WORDS.includes(keyword)
        try {
          const { data: all } = await db.from('contacts')
            .select('id, phone').eq('company_id', companyId).limit(2000)
          const match = (all || []).find((c: any) => c.phone && digits(c.phone) === fromDigits)
          if (match) {
            await db.from('contacts').update(
              optingOut
                ? {
                    subscribed_to_marketing: false,
                    consent_basis: 'none',
                    consent_source: `replied ${keyword} by SMS`,
                    unsubscribed_at: new Date().toISOString(),
                    unsubscribe_method: 'sms_keyword',
                  }
                : {
                    subscribed_to_marketing: true,
                    consent_basis: 'express',
                    consent_source: `replied ${keyword} by SMS`,
                    consent_recorded_at: new Date().toISOString(),
                    unsubscribed_at: null,
                    unsubscribe_method: null,
                  }
            ).eq('id', match.id)

            await db.from('consent_events').insert({
              company_id: companyId,
              contact_id: match.id,
              action: optingOut ? 'unsubscribed' : 'subscribed',
              basis: optingOut ? 'none' : 'express',
              source: `SMS keyword: ${keyword}`,
              actor: 'customer',
            })
          }
        } catch (e) {
          console.error('[telnyx] consent keyword handling failed', e)
        }
        // The message still falls through to be stored in the thread, so staff
        // can see the opt-out happened rather than it vanishing silently.
      }

      // 1) Exact sms_number match (fast path).
      let { data: conv } = await db.from('conversations')
        .select('*').eq('company_id', companyId).eq('sms_number', from)
        .order('last_message_at', { ascending: false }).limit(1).maybeSingle()

      // 2) Match the sender to an existing CONTACT by phone, then reuse that
      //    contact's most recent conversation — so a reply to an order,
      //    abandoned-cart or any prior thread lands there instead of spawning a
      //    "+61…" chat.
      //
      //    This used to pull the first 1000 contacts and scan them in memory,
      //    which silently failed for any company with more contacts than that —
      //    the customer simply wasn't in the page we fetched. Ask the database
      //    for the number instead. Phones are stored in mixed formats
      //    (0455…, +61455…), so match on the last 9 digits and then confirm.
      let matchedContactId: string | null = conv?.contact_id || null
      let matchedContactName: string | null = null
      if (!conv && fromDigits && fromDigits.length >= 8) {
        const tail = fromDigits.slice(-9)
        const { data: contacts } = await db.from('contacts')
          .select('id, phone, name').eq('company_id', companyId)
          .ilike('phone', `%${tail}%`).limit(10)
        const contact = (contacts || []).find((c: any) => c.phone && digits(c.phone).endsWith(tail))
        if (contact) {
          matchedContactId = contact.id
          matchedContactName = contact.name || null
          const { data: contactConv } = await db.from('conversations')
            .select('*').eq('company_id', companyId).eq('contact_id', contact.id)
            .order('last_message_at', { ascending: false }).limit(1).maybeSingle()
          if (contactConv) {
            conv = contactConv
            // Stamp the number on the thread so the fast path catches the next
            // reply without needing this lookup at all.
            if (!contactConv.sms_number) {
              try {
                await db.from('conversations')
                  .update({ sms_number: from, sms_enabled: true, channel_number: to })
                  .eq('id', contactConv.id)
              } catch { /* not fatal */ }
            }
          }
        }
      }

      if (!conv) {
        const { data: newConv } = await db.from('conversations').insert({
          company_id: companyId,
          channel: 'sms',
          // Show who it is when we recognise the number, rather than a bare "+61…".
          subject: matchedContactName || from,
          sms_number: from,
          sms_enabled: true,
          channel_number: to,
          contact_id: matchedContactId,
          status: 'open',
          is_unread: true,
          unread_count: 1,
          last_message: summary,
          last_message_at: new Date().toISOString(),
        }).select().maybeSingle()
        conv = newConv
        // Auto-reply for brand-new SMS conversations
        if (newConv) {
          try {
            const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
            fetch(`${origin}/api/inbox/auto-reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: newConv.id }) })
          } catch {}
        }
      } else if (!conv.sms_number || conv.contact_id !== matchedContactId) {
        // We reused an existing conversation — make sure it now carries the SMS
        // number (so future replies fast-path match) and the contact link.
        await db.from('conversations').update({
          sms_number: conv.sms_number || from,
          sms_enabled: true,
          channel_number: conv.channel_number || to,
          ...(matchedContactId && !conv.contact_id ? { contact_id: matchedContactId } : {}),
        }).eq('id', conv.id)
      }

      if (conv) {
        // Customer texted a closed enquiry — log the reopen before we flip it.
        await logEnquiryReopened(db, { conversationId: conv.id, companyId, prevStatus: conv.status })
        await db.from('messages').insert({
          conversation_id: conv.id,
          company_id: companyId,
          sender_type: 'visitor',
          sender_name: from,
          content: text,
          ...(inboundMedia.length ? { attachments: inboundMedia } : {}),
          ...(mediaAttemptFailed ? { metadata: { media_attempt: true } } : {}),
          delivery_channel: 'sms',
          telnyx_message_id: payload?.id || null,
        })
        await db.from('conversations').update({
          last_message: summary,
          last_message_at: new Date().toISOString(),
          is_unread: true,
          // Inbound text ⇒ this is an SMS conversation now, whatever it started as.
          channel: 'sms',
          // An inbound message reopens a closed enquiry — the customer is back,
          // so they shouldn't stay buried in the Closed tab.
          status: 'open',
          unread_count: (conv.unread_count || 0) + 1,
          updated_at: new Date().toISOString(),
        }).eq('id', conv.id)
        // Alert agents' phones
        try {
          const origin = req.headers.get('host') ? `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('host')}` : (process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com')
          fetch(`${origin}/api/push/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, title: `New SMS from ${from}`, body: summary, conversationId: conv.id }) })
          fetch(`${origin}/api/inbox/smart-trigger`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: conv.id, text }) })
          // Colvy AI: extract the sender's name/suburb and create/link their
          // contact (fire-and-forget — never delays ingestion).
          if (text) fetch(`${origin}/api/inbox/capture-contact`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, conversationId: conv.id, from, text }) })
        } catch {}

        // Answer common questions automatically — and TEXT the answer back, so
        // an SMS customer actually receives it (not just the chat thread).
        try {
          const { data: integ } = await db.from('telnyx_integrations')
            .select('api_key, phone_number, messaging_profile_id')
            .eq('company_id', companyId).maybeSingle()

          await runKeywordReply({
            conversationId: conv.id, text, companyId,
            deliver: async (reply) => {
              if (!integ?.api_key || !integ.phone_number) return
              const svc = new TelnyxService(integ.api_key)
              await svc.sendSMS({
                from: integ.phone_number,
                to: from,
                text: reply,
                messaging_profile_id: integ.messaging_profile_id || undefined,
              })
            },
          })
        } catch (e) { console.error('[sms keyword reply]', e) }

        // Auto-reply to a failed media attempt: text the customer a secure upload
        // link so their photo isn't lost. Throttled to once per conversation per
        // 6h (checks recent media_request messages) so repeated failed MMS don't
        // spam them.
        if (mediaAttemptFailed) {
          try {
            const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000).toISOString()
            const { data: recentReq } = await db.from('messages')
              .select('id').eq('conversation_id', conv.id)
              .eq('message_type', 'media_request').gte('created_at', sixHoursAgo).limit(1)
            if (!recentReq || recentReq.length === 0) {
              const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
              const mr = await fetch(`${origin}/api/media-requests`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  companyId, conversationId: conv.id, contactId: conv.contact_id || matchedContactId || null,
                  prompt: 'It looks like you tried to send us a photo or video. Please upload it here.',
                  accept: ['image', 'video'], maxFiles: 10, expiryHours: null, createdBy: 'Auto-reply',
                }),
              })
              const mrData = await mr.json().catch(() => ({}))
              if (mr.ok && mrData.link) {
                const { data: integ2 } = await db.from('telnyx_integrations')
                  .select('api_key, phone_number, messaging_profile_id')
                  .eq('company_id', companyId).maybeSingle()
                if (integ2?.api_key && integ2.phone_number) {
                  const svc = new TelnyxService(integ2.api_key)
                  await svc.sendSMS({
                    from: integ2.phone_number, to: from,
                    text: `It looks like you tried to send a photo — our number can't receive picture messages. Please upload it here: ${mrData.link}`,
                    messaging_profile_id: integ2.messaging_profile_id || undefined,
                  })
                }
              }
            }
          } catch (e) { console.error('[media attempt auto-reply]', e) }
        }

        try { await notifyCompany({ db, companyId, type: 'sms', message: `New SMS from ${from}: ${summary.slice(0, 80)}`, actorName: from }) } catch {}
      }
      return NextResponse.json({ ok: true })
    }

    // ── Call status events ───────────────────────────────────────────────────
    if (eventType.startsWith('call.')) {
      const payload = event.payload
      const callControlId = payload?.call_control_id
      const sessionId = payload?.call_session_id
      const direction = payload?.direction // Telnyx: 'incoming' | 'outgoing' (sometimes 'inbound'/'outbound')
      const fromNum = payload?.from
      const toNum = payload?.to
      // The connection_id ON THE INBOUND EVENT is the Voice API (Call Control)
      // App the call arrived through — which is the ONLY valid connection_id to
      // originate the child call to the browser. Using integ.connection_id
      // (which may hold the WebRTC/credential connection) makes Telnyx reject
      // the dial with "requested connection_id is invalid or does not exist".
      const eventConnectionId = payload?.connection_id
      const isInbound = direction === 'incoming' || direction === 'inbound'
      const isOutbound = direction === 'outgoing' || direction === 'outbound'

      log.info('[telnyx call event]', { eventType, direction, from: fromNum, to: toNum, hasCC: !!callControlId })

      // Inbound call just started — answer it and ring the online agents.
      if (eventType === 'call.initiated' && isInbound) {
        const { data: integ } = await db.from('telnyx_integrations').select('*').eq('phone_number', toNum).maybeSingle()
        const companyId = integ?.company_id
        if (companyId && integ) {
          // Match caller to a contact by phone. Query by the last-9-digit tail
          // in the DB rather than scanning a capped page of contacts — a big
          // contact list would otherwise leave a saved caller unmatched (and
          // then unnamed on the call log / card / voicemail alert).
          let contactId: string | null = null
          let callerName: string | null = null
          const digitsOf = (s: string) => (s || '').replace(/\D/g, '').slice(-9)
          const fromTail = digitsOf(fromNum)
          if (fromTail) {
            const { data: contacts } = await db.from('contacts')
              .select('id, name, phone').eq('company_id', companyId).ilike('phone', `%${fromTail}%`).limit(10)
            const match = (contacts || []).find((c: any) => c.phone && digitsOf(c.phone) === fromTail)
            if (match) { contactId = match.id; callerName = match.name }
          }

          // No saved contact — fall back to WooCommerce so a shopper still shows
          // a name on the call log, card and voicemail alert.
          if (!callerName) {
            const t = digitsOf(fromNum)
            try {
              const { data: wooC } = await db.from('woocommerce_customers')
                .select('first_name, last_name, phone').eq('company_id', companyId).not('phone', 'is', null).limit(1000)
              const c = (wooC || []).find((x: any) => digitsOf(x.phone) === t)
              if (c) callerName = `${c.first_name || ''} ${c.last_name || ''}`.trim() || null
            } catch {}
            if (!callerName) {
              try {
                const { data: wooO } = await db.from('woocommerce_orders')
                  .select('billing').eq('company_id', companyId).eq('billing_phone_norm', t)
                  .order('created_at', { ascending: false }).limit(1)
                const b = (wooO || [])[0]?.billing
                if (b) callerName = `${b.first_name || ''} ${b.last_name || ''}`.trim() || null
              } catch {}
            }
          }

          // Remember which Voice API App the number rings through, so other code
          // paths (and the diag) know the valid Call Control connection.
          if (eventConnectionId && (integ as any).voice_api_application_id !== eventConnectionId) {
            try { await db.from('telnyx_integrations').update({ voice_api_application_id: eventConnectionId }).eq('company_id', companyId) } catch {}
          }

          // Bump the caller's conversation to the top of the inbox — an incoming
          // call is a fresh, notable event.
          let conversationId: string | null = null
          if (contactId) {
            try {
              const { data: conv } = await db.from('conversations')
                .select('id').eq('company_id', companyId).eq('contact_id', contactId)
                .order('last_message_at', { ascending: false }).limit(1).maybeSingle()
              conversationId = conv?.id || null
              if (conv?.id) {
                await db.from('conversations').update({
                  last_message: `📞 Incoming call`,
                  last_message_at: new Date().toISOString(),
                  is_unread: true,
                }).eq('id', conv.id)
              }
            } catch {}
          }

          // Create the call row.
          //
          // Nothing in this webhook ever INSERTED one — every other path only
          // updates — so inbound calls had no row at all. That's why they never
          // appeared in the call logs, why the bridge reported
          // "missing parent" (parentId: null), and why recordings had nothing
          // to attach to.
          try {
            const { data: already } = await db.from('calls')
              .select('id').eq('telnyx_call_control_id', callControlId).maybeSingle()

            if (!already) {
              const { error: insErr } = await db.from('calls').insert({
                company_id: companyId,
                direction: 'inbound',
                from_number: fromNum,
                to_number: toNum,
                caller_name: callerName,
                contact_id: contactId,
                conversation_id: conversationId,
                status: 'ringing',
                telnyx_call_control_id: callControlId,
                telnyx_call_session_id: (payload as any)?.call_session_id || null,
                created_at: new Date().toISOString(),
              })
              if (insErr) console.error('[telnyx inbound] could not create call row', insErr.message)
              else log.info('[telnyx inbound] call row created', { callControlId })
            }
          } catch (e: any) {
            console.error('[telnyx inbound] call row insert threw', e?.message || e)
          }

          try {
            const svc = new TelnyxService(integ.api_key)

            // Who's online right now? (heartbeat in the last 2 minutes.) We do
            // NOT require available=true — a recent heartbeat means the browser
            // is connected and can receive the call. Requiring available=true
            // silently sent every call to voicemail because the heartbeat never
            // set that column.
            const cutoff = new Date(Date.now() - 120000).toISOString()
            const { data: online } = await db.from('agent_presence')
              .select('sip_username').eq('company_id', companyId)
              .gte('last_seen_at', cutoff)
              .neq('available', false)

            // Build the FULL set of SIP identities to ring.
            //
            // Every client — the browser AND the mobile app — now logs in with
            // its own per-user credential (both pass `userId` to
            // /api/telnyx/token), so each device is reachable at
            // sip:<per-user sip_username>@sip.telnyx.com. The shared
            // integ.sip_username is only used by a client that logged in WITHOUT
            // a userId, which in practice is nobody.
            //
            // The old code dialled ONLY the shared credential as its "primary"
            // leg and gated the entire ring decision on it (`&& !!sipUser`). Once
            // agents moved to per-user credentials the shared one went stale/empty,
            // so `anyOnline` was false and every inbound call went straight to
            // voicemail without ringing a single device. Ring every per-user
            // credential AND the shared one, de-duplicated, and gate on having
            // ANY target rather than on the shared credential specifically.
            const { data: userCreds, error: credsErr } = await db.from('telnyx_user_credentials')
              .select('sip_username, user_id')
              .eq('company_id', companyId)
              .not('sip_username', 'is', null)

            if (credsErr) {
              // Migration V190 not applied — we can still ring the shared
              // credential, but say so plainly rather than failing silently.
              console.error('[telnyx inbound] telnyx_user_credentials unavailable (run migration V190):', credsErr.message)
            }

            // Don't ring an agent who's already on a call — they report
            // available:false while busy, so the call rings the OTHERS instead of
            // interrupting them. (Their client also rejects a second leg as a
            // backstop, but skipping the dial entirely is cleaner.)
            const { data: busy } = await db.from('agent_presence')
              .select('user_id').eq('company_id', companyId)
              .gte('last_seen_at', cutoff).eq('available', false)
            const busyUsers = new Set<string>(((busy || []).map((b: any) => b.user_id)).filter(Boolean))

            const sharedSip = integ.sip_username || (integ as any).sip_conn_username || null
            const sipUsernames = Array.from(new Set([
              ...((userCreds || []).filter((c: any) => !busyUsers.has(c.user_id)).map((c: any) => c.sip_username).filter(Boolean)),
              ...(sharedSip ? [sharedSip] : []),
            ]))
            const sipTargets = sipUsernames.map((u: string) => `sip:${u}@sip.telnyx.com`)

            const onlineCount = (online || []).length

            // A phone running the app can be woken by Telnyx's own VoIP push
            // even with no heartbeat — the heartbeat only exists while the app
            // is open. Gating purely on it sent every call to voicemail the
            // moment the last browser tab closed, without so much as ringing.
            const { data: mobileDevices } = await db.from('push_tokens')
              .select('id').eq('company_id', companyId).limit(1)
            const anyMobile = (mobileDevices || []).length > 0

            // Ring whenever we have at least one SIP identity to dial and anyone
            // plausibly reachable (a live browser heartbeat, or a registered
            // mobile device Telnyx can wake by push).
            const anyOnline = (onlineCount > 0 || anyMobile) && sipTargets.length > 0

            log.info('[telnyx inbound] routing decision', {
              companyId, onlineAgents: onlineCount, mobileDevices: anyMobile,
              sipTargetCount: sipTargets.length,
              perUserCreds: (userCreds || []).length,
              hasShared: !!sharedSip,
              willRing: anyOnline,
            })

            // Do NOT answer the caller here. In Call Control, answering the
            // caller and THEN dialing the agent means the caller is "connected"
            // to a leg that plays either dead air or ringback we control — and
            // playing media on that leg held its audio path, causing ONE-WAY
            // audio after bridge. Instead we leave the caller RINGING on the
            // network (they hear real ringback) and dial the agents. The bridge
            // (on agent answer) auto-answers the caller and connects both ways.
            if (anyOnline) {
              const ring = Number(integ.ring_seconds || 25)
              const dialConnectionId = eventConnectionId || (integ as any).voice_api_application_id || integ.connection_id

              // Dial every registered identity as a sibling child leg. Whichever
              // answers first gets bridged; the rest are hung up (see
              // call.answered). No artificial "primary vs fan-out" split — that
              // asymmetry is what let a stale shared credential veto the whole
              // ring.
              const legIds: string[] = []
              for (const sipTarget of sipTargets) {
                try {
                  const child = await svc.createChildCall({
                    connection_id: dialConnectionId,
                    to: sipTarget,
                    from: fromNum,
                    timeout_secs: ring,
                    link_to: callControlId,
                    webhook_url: `${new URL(req.url).origin}/api/telnyx/webhook`,
                  })
                  const legId = (child as any)?.data?.call_control_id || null
                  if (legId) legIds.push(legId)
                  log.info('[telnyx inbound] dialing agent', { sipTarget, legId })
                } catch (e: any) {
                  console.error('[telnyx inbound] dial leg failed', sipTarget, e?.message || e)
                }
              }

              if (legIds.length > 0) {
                // agent_call_control_id keeps the first leg for backwards-compat
                // with the bridge's primary lookup; ringing_leg_ids holds ALL of
                // them so any leg that answers can be matched and the losers
                // cancelled.
                const { error: updErr } = await db.from('calls')
                  .update({
                    status: 'ringing_agents',
                    transcription: `[ringing ${legIds.length} device(s)]`,
                    agent_call_control_id: legIds[0],
                    ringing_leg_ids: legIds,
                  })
                  .eq('telnyx_call_control_id', callControlId)
                if (updErr) console.error('[telnyx inbound] could not store ringing legs', updErr.message)
                log.info('[telnyx inbound] ringing devices', { count: legIds.length })
              } else {
                // Every dial attempt failed — fall back to voicemail so the
                // caller isn't left hanging on dead air.
                console.error('[telnyx inbound] all dial attempts failed, going to voicemail')
                if (integ.voicemail_enabled !== false) {
                  try { await svc.answerCall(callControlId) } catch {}
                  await svc.speak(callControlId, integ.voicemail_greeting || 'Please leave a message after the tone.')
                  await db.from('calls').update({ status: 'voicemail_greeting', is_voicemail: true, transcription: `[ring failed: all dial attempts failed]` })
                    .eq('telnyx_call_control_id', callControlId)
                } else {
                  try { await svc.hangupCall(callControlId) } catch {}
                }
              }
            } else {
              // No SIP identity to ring, or nobody reachable — straight to voicemail.
              const reason = sipTargets.length === 0
                ? 'no SIP credential to ring (open Colvy or the mobile app to provision one)'
                : `no agents reachable — browser heartbeats: ${onlineCount}, mobile devices: ${anyMobile ? 'yes' : 'none registered'}`
              log.info('[telnyx inbound] going to voicemail —', reason)
              if (integ.voicemail_enabled !== false) {
                try { await svc.answerCall(callControlId) } catch {}
                await svc.speak(callControlId, integ.voicemail_greeting || 'Please leave a message after the tone.')
                await db.from('calls').update({ status: 'voicemail_greeting', is_voicemail: true, transcription: `[to voicemail: ${reason}]` })
                  .eq('telnyx_call_control_id', callControlId)
              } else {
                await svc.hangupCall(callControlId)
              }
            }
          } catch (e) {
            console.error('[telnyx inbound] call control failed', e)
          }
        }
        return NextResponse.json({ ok: true })
      }

      // A child (agent) leg was answered — bridge it to the caller. Fire on ANY
      // call.answered whose call_control_id is NOT the caller's own leg, because
      // the browser-answered SIP leg's direction can be reported as inbound OR
      // outbound depending on Telnyx's perspective — gating on isOutbound made
      // the bridge silently never run when the browser answered.
      if (eventType === 'call.answered') {
        log.info('[telnyx call.answered]', { callControlId, direction, isOutbound })
        // Is this the caller's own leg being answered by our bridge? If so, skip.
        const { data: selfRow } = await db.from('calls')
          .select('id, status').eq('telnyx_call_control_id', callControlId).maybeSingle()
        const isCallerLeg = !!selfRow && selfRow.status !== 'ringing_agents'
        if (isCallerLeg) {
          log.info('[telnyx call.answered] this is the caller leg, not bridging')
          return NextResponse.json({ ok: true })
        }
        try {
          // Find the caller leg to bridge to.
          //
          // The reliable link is agent_call_control_id: when the child leg was
          // created we stored ITS id on the parent row, so this is an exact
          // match rather than a guess.
          //
          // The old lookup took the most recent 'ringing_agents' row across ALL
          // companies with no time bound — so it found nothing whenever the
          // status had already moved on (timeout, voicemail, a second call),
          // leaving the caller connected to silence. It could also have bridged
          // a different company's call.
          let parentRow: any = null

          const { data: linked } = await db.from('calls')
            .select('*').eq('agent_call_control_id', callControlId).limit(1)
          parentRow = linked?.[0] || null

          if (!parentRow) {
            // With several devices ringing, the answering leg is usually one of
            // the extra ones rather than the first agent leg.
            const { data: byFanout } = await db.from('calls')
              .select('*').contains('ringing_leg_ids', [callControlId]).limit(1)
            parentRow = byFanout?.[0] || null
            if (parentRow) log.info('[telnyx bridge] matched parent via fan-out leg')
          }

          if (!parentRow) {
            // Fallback: a recent ringing leg, now scoped to the last two
            // minutes so a stale row can't be picked up.
            const since = new Date(Date.now() - 2 * 60 * 1000).toISOString()
            const { data: recent } = await db.from('calls')
              .select('*')
              .in('status', ['ringing_agents', 'ringing'])
              .gte('created_at', since)
              .order('created_at', { ascending: false }).limit(1)
            parentRow = recent?.[0] || null
            if (parentRow) {
              log.info('[telnyx bridge] matched parent by recency, not by agent leg id', { callId: parentRow.id })
            }
          }
          // Get the api_key from that call's company (reliable), not client_state.
          let apiKey: string | null = null
          if (parentRow?.company_id) {
            const { data: integRow } = await db.from('telnyx_integrations')
              .select('api_key').eq('company_id', parentRow.company_id).maybeSingle()
            apiKey = integRow?.api_key || null
          }
          if (parentRow?.telnyx_call_control_id && apiKey) {
            const svc = new TelnyxService(apiKey)
            // Bridge the agent leg to the caller. This auto-answers the caller
            // (who was ringing on the network) and connects two-way audio.
            await svc.bridgeCalls(callControlId, parentRow.telnyx_call_control_id)
            // Remember BOTH leg ids on the call so a hangup from either side can
            // tear down the other.
            await db.from('calls').update({
              status: 'in_progress',
              answered_at: new Date().toISOString(),
              agent_call_control_id: callControlId,
            }).eq('id', parentRow.id)

            // Move the inbox list off "Incoming call" now that it's answered.
            try { await setCallPreview(db as any, parentRow.conversation_id, '📞 Call answered') } catch {}

            // Record the answered call. Until now recordStart only ran for
            // voicemail greetings, so real conversations produced no audio —
            // and therefore no transcript, summary, sentiment or action items.
            // Dual channels keep agent and caller on separate tracks, which
            // makes the transcript read as a dialogue.
            try {
              await svc.recordStart(parentRow.telnyx_call_control_id, {
                format: 'mp3',
                channels: 'dual',
              })
              log.info('[telnyx record] started for answered call', { callId: parentRow.id })
            } catch (e: any) {
              console.error('[telnyx record] could not start', e?.message || e)
            }
            log.info('[telnyx bridge] bridged agent leg to caller', { agent: callControlId, caller: parentRow.telnyx_call_control_id })

            // First answer wins: stop the other devices ringing. Without this
            // every other phone keeps ringing for the full timeout after a
            // colleague has already picked up.
            try {
              const legs: string[] = Array.isArray((parentRow as any).ringing_leg_ids)
                ? (parentRow as any).ringing_leg_ids
                : []
              const losers = [
                ...legs,
                (parentRow as any).agent_call_control_id,
              ].filter((id: string) => id && id !== callControlId)

              for (const legId of losers) {
                try { await svc.hangupCall(legId) } catch {}
              }
              if (losers.length > 0) {
                log.info('[telnyx bridge] cancelled other ringing devices', { count: losers.length })
              }
            } catch (e: any) {
              console.error('[telnyx bridge] could not cancel other legs', e?.message || e)
            }
          } else {
            console.error('[telnyx bridge] could not bridge — missing parent or api_key', {
              hasParent: !!parentRow,
              hasKey: !!apiKey,
              agentLeg: callControlId,
              parentId: parentRow?.id || null,
              parentStatus: parentRow?.status || null,
            })
          }
        } catch (e) { console.error('[telnyx bridge] failed', e) }
        return NextResponse.json({ ok: true })
      }

      // A leg hung up. What that means depends on which leg and what phase the
      // call is in:
      //   • Caller hung up  → tear down EVERY agent leg (the answered/first one
      //     AND every other device still ringing). Only cancelling
      //     agent_call_control_id left all the other fanned-out phones ringing.
      //   • Answered agent hung up (call already bridged) → drop the caller.
      //   • A ringing agent declined/timed out before anyone answered → just let
      //     that leg die; the caller must keep ringing the others. Previously,
      //     declining the FIRST agent leg (which is agent_call_control_id) tore
      //     down the caller and killed the call for everyone.
      if (eventType === 'call.hangup') {
        try {
          const { data: rows } = await db.from('calls')
            .select('*').or(`telnyx_call_control_id.eq.${callControlId},agent_call_control_id.eq.${callControlId}`)
            .order('created_at', { ascending: false }).limit(1)
          const row = rows?.[0]
          if (row?.company_id) {
            const { data: integRow } = await db.from('telnyx_integrations').select('api_key').eq('company_id', row.company_id).maybeSingle()
            if (integRow?.api_key) {
              const svc = new TelnyxService(integRow.api_key)
              const isCallerLeg = row.telnyx_call_control_id === callControlId
              const legs: string[] = Array.isArray(row.ringing_leg_ids) ? row.ringing_leg_ids : []
              const bridged = ['in_progress', 'answered'].includes(String(row.status || ''))

              if (isCallerLeg) {
                // Cancel the answered/first agent leg plus every device still ringing.
                const targets = Array.from(new Set([row.agent_call_control_id, ...legs].filter(Boolean)))
                for (const t of targets) { try { await svc.hangupCall(t) } catch {} }
                if (targets.length) log.info('[telnyx hangup] caller gone — cancelled all agent legs', { count: targets.length })
              } else {
                // An agent leg hung up. Drop the caller only if this leg was the
                // one that had answered (a bridged call ending), not a decline
                // during ringing.
                const isAnsweredLeg = row.agent_call_control_id === callControlId && bridged
                if (isAnsweredLeg && row.telnyx_call_control_id) {
                  try { await svc.hangupCall(row.telnyx_call_control_id) } catch {}
                  log.info('[telnyx hangup] answered agent ended — dropped caller')
                } else {
                  log.info('[telnyx hangup] a ringing agent leg ended — leaving the call up', { callControlId })
                }
              }
            }
          }
        } catch (e) { console.error('[telnyx hangup teardown] failed', e) }
        // Fall through to the normal hangup status handling below.
      }


      // The greeting finished playing — start recording the voicemail.
      if (eventType === 'call.speak.ended') {
        try {
          const { data: row } = await db.from('calls')
            .select('*, telnyx_integrations!inner(api_key)').eq('telnyx_call_control_id', callControlId).maybeSingle()
          const { data: c } = await db.from('calls').select('company_id, status').eq('telnyx_call_control_id', callControlId).maybeSingle()
          if (c?.status === 'voicemail_greeting') {
            const { data: integ2 } = await db.from('telnyx_integrations').select('api_key').eq('company_id', c.company_id).maybeSingle()
            if (integ2?.api_key) {
              const svc = new TelnyxService(integ2.api_key)
              await svc.recordStart(callControlId, { max_length_secs: 180 })
              await db.from('calls').update({ status: 'recording_voicemail' }).eq('telnyx_call_control_id', callControlId)
            }
          }
        } catch (e) { console.error('[telnyx voicemail record] failed', e) }
        return NextResponse.json({ ok: true })
      }

      // Voicemail recording is ready — attach it to the call.
      if (eventType === 'call.recording.saved') {
        try {
          const url = event.payload?.recording_urls?.mp3 || event.payload?.recording_urls?.wav || event.payload?.public_recording_urls?.mp3

          // A recording can now belong to either a voicemail or an answered
          // call, so check before marking it as voicemail — otherwise every
          // recorded conversation would be filed as one.
          const { data: recRow } = await db.from('calls')
            .select('id, company_id, conversation_id, status, is_voicemail')
            .or(`telnyx_call_control_id.eq.${callControlId},agent_call_control_id.eq.${callControlId}`)
            .maybeSingle()

          const isVoicemail = recRow?.is_voicemail ||
            ['voicemail_greeting', 'recording_voicemail'].includes(String(recRow?.status || ''))

          if (url && recRow && !isVoicemail) {
            await db.from('calls').update({ recording_url: url }).eq('id', recRow.id)

            // A recording proves the call connected — post its thread card now
            // (idempotent) so answered inbound calls appear in the inbox even
            // when the browser never posted one and the row's duration is 0.
            await ensureCallCard(db, recRow.id)

            // Transcribe, then summarise. Fire-and-forget: the recording is
            // already saved, and transcription can take a while.
            try {
              fetch(`${req.nextUrl.origin}/api/telnyx/transcribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  callId: recRow.id,
                  companyId: recRow.company_id,
                  conversationId: recRow.conversation_id,
                }),
              }).catch(() => {})
            } catch {}

            log.info('[telnyx record] saved for answered call', { callId: recRow.id })
            return NextResponse.json({ ok: true })
          }

          if (url) {
            await db.from('calls').update({
              recording_url: url,
              status: 'voicemail',
              is_voicemail: true,
            }).eq('telnyx_call_control_id', callControlId)
            try { await setCallPreview(db as any, recRow?.conversation_id, '📞 Voicemail') } catch {}
            // Notify the company there's a new voicemail.
            const { data: c } = await db.from('calls').select('company_id, from_number, caller_name, contact_id').eq('telnyx_call_control_id', callControlId).maybeSingle()
            if (c?.company_id) {
              try { await notifyCompany({ db, companyId: c.company_id, type: 'call', message: `New voicemail from ${c.caller_name || c.from_number}`, actorName: c.caller_name || c.from_number }) } catch {}
            }
          }
        } catch (e) { console.error('[telnyx voicemail save] failed', e) }
        return NextResponse.json({ ok: true })
      }

      // No agent answered in time — Telnyx sends call.hangup on the child leg.
      // If the parent is still ringing agents, fall through to voicemail.
      if (eventType === 'call.hangup' && isOutbound) {
        try {
          const { data: parent } = await db.from('calls')
            .select('*').eq('status', 'ringing_agents').order('created_at', { ascending: false }).limit(1)
          const parentRow = parent?.[0]
          if (parentRow) {
            const { data: integ3 } = await db.from('telnyx_integrations').select('*').eq('company_id', parentRow.company_id).maybeSingle()
            if (integ3?.api_key && parentRow.telnyx_call_control_id) {
              const svc = new TelnyxService(integ3.api_key)
              if (integ3.voicemail_enabled !== false) {
                await svc.speak(parentRow.telnyx_call_control_id, integ3.voicemail_greeting || 'Please leave a message after the tone.')
                await db.from('calls').update({ status: 'voicemail_greeting', is_voicemail: true }).eq('id', parentRow.id)
              } else {
                await svc.hangupCall(parentRow.telnyx_call_control_id)
              }
            }
          }
        } catch (e) { console.error('[telnyx no-answer voicemail] failed', e) }
        return NextResponse.json({ ok: true })
      }

      if (callControlId || sessionId) {
        const statusMap: Record<string, string> = {
          'call.initiated': 'initiated',
          'call.ringing': 'ringing',
          'call.answered': 'answered',
          'call.hangup': 'completed',
        }
        const status = statusMap[eventType] || eventType.replace('call.', '')
        const update: any = { status }
        let hangupCallRowId = ''
        if (eventType === 'call.hangup') {
          update.ended_at = new Date().toISOString()
          const dur = payload?.call_duration_secs || payload?.duration_secs || 0
          if (dur) update.duration_seconds = dur
          // A hangup with no talk time and that was never answered is a MISSED
          // call, not "completed". Telnyx sends hangup_cause / hangup_source we
          // can lean on, but duration 0 + not-answered is the reliable signal.
          const answered = payload?.hangup_cause === 'normal_clearing' && dur > 0
          // Only downgrade to missed for inbound calls that never connected;
          // don't clobber a voicemail state the inbound flow already set.
          const { data: existing } = await db.from('calls')
            .select('id, status, is_voicemail, conversation_id').or(`telnyx_call_control_id.eq.${callControlId},telnyx_call_session_id.eq.${sessionId}`).maybeSingle()
          if (existing?.is_voicemail || String(existing?.status || '').startsWith('voicemail')) {
            update.status = 'voicemail'
          } else if (isInbound && !answered && !dur) {
            update.status = 'missed'
          } else if (dur > 0) {
            update.status = 'completed'
          }
          hangupCallRowId = existing?.id || ''
          // Reflect the outcome in the inbox list. A voicemail hangup shows
          // "Missed call" provisionally; call.recording.saved upgrades it to
          // "Voicemail" if the caller actually left a message.
          if (isInbound && existing?.conversation_id) {
            const preview = update.status === 'completed'
              ? (dur ? `📞 Call ended · ${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}` : '📞 Call ended')
              : '📞 Missed call'
            try { await setCallPreview(db as any, existing.conversation_id, preview) } catch {}
          }
        }
        await db.from('calls').update(update).or(`telnyx_call_control_id.eq.${callControlId},telnyx_call_session_id.eq.${sessionId}`)
        // On hangup, ensure a connected call has its thread card (idempotent).
        // ensureCallCard re-reads the freshly-updated row, so it sees the final
        // status/duration. Skipped internally for voicemail/missed/unconnected.
        if (hangupCallRowId) await ensureCallCard(db, hangupCallRowId)
      }
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('Telnyx webhook error:', err)
    await logWebhookEvent({ source: 'telnyx', status: 'error', error: err?.message })
    // Always 200 so Telnyx doesn't retry-storm us
    return NextResponse.json({ ok: true })
  }
}
