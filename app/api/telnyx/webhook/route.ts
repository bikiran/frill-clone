import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyCompany } from '@/lib/notify'
import { runKeywordReply } from '@/lib/keyword-reply'
import { TelnyxService } from '@/lib/telnyx-service'

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

    // ── Inbound SMS ──────────────────────────────────────────────────────────
    if (eventType === 'message.received') {
      const payload = event.payload
      const from = payload?.from?.phone_number
      const to = Array.isArray(payload?.to) ? payload.to[0]?.phone_number : payload?.to?.phone_number
      const text = payload?.text || ''

      // Which company owns the receiving number?
      const { data: integ } = await db.from('telnyx_integrations').select('company_id').eq('phone_number', to).maybeSingle()
      const companyId = integ?.company_id
      if (!companyId) return NextResponse.json({ ok: true }) // not ours

      // Normalise phone numbers to their last 9 digits so E.164 (+61407207207)
      // and local (0407207207) forms match.
      const digits = (s: string) => (s || '').replace(/\D/g, '').slice(-9)
      const fromDigits = digits(from)

      // 1) Exact sms_number match (fast path).
      let { data: conv } = await db.from('conversations')
        .select('*').eq('company_id', companyId).eq('sms_number', from)
        .order('last_message_at', { ascending: false }).limit(1).maybeSingle()

      // 2) Match the sender to an existing CONTACT by phone, then reuse that
      //    contact's most recent conversation — so a reply to an abandoned-cart
      //    or any prior thread lands there instead of spawning a "+61…" chat.
      let matchedContactId: string | null = conv?.contact_id || null
      if (!conv && fromDigits) {
        const { data: contacts } = await db.from('contacts')
          .select('id, phone, name').eq('company_id', companyId).limit(1000)
        const contact = (contacts || []).find((c: any) => c.phone && digits(c.phone) === fromDigits)
        if (contact) {
          matchedContactId = contact.id
          const { data: contactConv } = await db.from('conversations')
            .select('*').eq('company_id', companyId).eq('contact_id', contact.id)
            .order('last_message_at', { ascending: false }).limit(1).maybeSingle()
          if (contactConv) conv = contactConv
        }
      }

      if (!conv) {
        const { data: newConv } = await db.from('conversations').insert({
          company_id: companyId,
          channel: 'sms',
          subject: from,
          sms_number: from,
          sms_enabled: true,
          channel_number: to,
          contact_id: matchedContactId,
          status: 'open',
          is_unread: true,
          unread_count: 1,
          last_message: text,
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
        await db.from('messages').insert({
          conversation_id: conv.id,
          company_id: companyId,
          sender_type: 'visitor',
          sender_name: from,
          content: text,
          delivery_channel: 'sms',
          telnyx_message_id: payload?.id || null,
        })
        await db.from('conversations').update({
          last_message: text,
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
          fetch(`${origin}/api/push/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, title: `New SMS from ${from}`, body: text, conversationId: conv.id }) })
          fetch(`${origin}/api/inbox/smart-trigger`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: conv.id, text }) })
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

        try { await notifyCompany({ db, companyId, type: 'sms', message: `New SMS from ${from}: ${(text || '').slice(0, 80)}`, actorName: from }) } catch {}
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
      const isInbound = direction === 'incoming' || direction === 'inbound'
      const isOutbound = direction === 'outgoing' || direction === 'outbound'

      console.log('[telnyx call event]', { eventType, direction, from: fromNum, to: toNum, hasCC: !!callControlId })

      // Inbound call just started — answer it and ring the online agents.
      if (eventType === 'call.initiated' && isInbound) {
        const { data: integ } = await db.from('telnyx_integrations').select('*').eq('phone_number', toNum).maybeSingle()
        const companyId = integ?.company_id
        if (companyId && integ) {
          // Match caller to a contact by phone.
          let contactId: string | null = null
          let callerName: string | null = null
          const { data: contacts } = await db.from('contacts').select('id, name, phone').eq('company_id', companyId).limit(500)
          const digitsOf = (s: string) => (s || '').replace(/\D/g, '').slice(-9)
          const match = (contacts || []).find((c: any) => c.phone && digitsOf(c.phone) === digitsOf(fromNum))
          if (match) { contactId = match.id; callerName = match.name }

          await db.from('calls').insert({
            company_id: companyId, contact_id: contactId,
            direction: 'inbound', from_number: fromNum, to_number: toNum,
            status: 'ringing',
            telnyx_call_control_id: callControlId,
            telnyx_call_session_id: sessionId,
            caller_name: callerName,
          })

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

            // Every agent's browser connects with the company SIP credential, so
            // dialing that one SIP address rings all connected clients at once.
            const sipUser = integ.sip_username
            const onlineCount = (online || []).length
            const anyOnline = onlineCount > 0 && !!sipUser

            console.log('[telnyx inbound] routing decision', {
              companyId, onlineAgents: onlineCount, hasSipUsername: !!sipUser,
              sipUser: sipUser ? sipUser.slice(0, 6) + '…' : null,
              willRing: anyOnline,
            })

            // Answer the call so we can control it either way.
            await svc.answerCall(callControlId, JSON.stringify({ role: 'inbound', companyId, contactId }))

            if (anyOnline) {
              // Ring the agents' WebRTC client. Telnyx dials the SIP URI as a new
              // leg; when the agent answers we bridge (handled on call.answered of
              // the child leg). timeout_secs controls how long before no-answer.
              const ring = Number(integ.ring_seconds || 25)
              const sipTarget = `sip:${sipUser}@sip.telnyx.com`
              console.log('[telnyx inbound] dialing agent client', { sipTarget, connection_id: integ.connection_id })
              try {
                const child = await svc.createChildCall({
                  connection_id: integ.connection_id,
                  to: sipTarget,
                  from: fromNum,
                  timeout_secs: ring,
                  link_to: callControlId,
                  webhook_url: `${new URL(req.url).origin}/api/telnyx/webhook`,
                })
                console.log('[telnyx inbound] child call created', { id: (child as any)?.data?.call_control_id })
                await db.from('calls').update({ status: 'ringing_agents', transcription: `[ringing ${sipTarget}]` })
                  .eq('telnyx_call_control_id', callControlId)
              } catch (dialErr: any) {
                console.error('[telnyx inbound] createChildCall failed', dialErr?.message || dialErr)
                // Fall back to voicemail so the caller isn't left hanging.
                if (integ.voicemail_enabled !== false) {
                  await svc.speak(callControlId, integ.voicemail_greeting || 'Please leave a message after the tone.')
                  await db.from('calls').update({ status: 'voicemail_greeting', is_voicemail: true, transcription: `[ring failed: ${dialErr?.message || 'dial error'}]` })
                    .eq('telnyx_call_control_id', callControlId)
                }
              }
            } else {
              // Nobody online (or no SIP credential) — straight to voicemail.
              const reason = !sipUser ? 'no sip_username on integration (open Colvy to provision it)' : 'no agents online (heartbeat in last 2 min)'
              console.log('[telnyx inbound] going to voicemail —', reason)
              if (integ.voicemail_enabled !== false) {
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

      // A child (agent) leg was answered — bridge it to the caller.
      if (eventType === 'call.answered' && isOutbound) {
        try {
          // The parent call is linked; find it by session or client_state.
          const { data: integRow } = await db.from('telnyx_integrations')
            .select('*').eq('company_id', (event.payload?.client_state ? JSON.parse(Buffer.from(event.payload.client_state, 'base64').toString()).companyId : '') || '___').maybeSingle()
          // Fall back: look up the ringing parent for this number.
          const { data: parent } = await db.from('calls')
            .select('*').eq('status', 'ringing_agents').order('created_at', { ascending: false }).limit(1)
          const parentRow = parent?.[0]
          if (parentRow?.telnyx_call_control_id && integRow?.api_key) {
            const svc = new TelnyxService(integRow.api_key)
            await svc.bridgeCalls(callControlId, parentRow.telnyx_call_control_id)
            await db.from('calls').update({ status: 'in_progress', answered_at: new Date().toISOString() })
              .eq('id', parentRow.id)
          }
        } catch (e) { console.error('[telnyx bridge] failed', e) }
        return NextResponse.json({ ok: true })
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
          if (url) {
            await db.from('calls').update({
              recording_url: url,
              status: 'voicemail',
              is_voicemail: true,
            }).eq('telnyx_call_control_id', callControlId)
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
            .select('status, is_voicemail').or(`telnyx_call_control_id.eq.${callControlId},telnyx_call_session_id.eq.${sessionId}`).maybeSingle()
          if (existing?.is_voicemail || String(existing?.status || '').startsWith('voicemail')) {
            update.status = 'voicemail'
          } else if (isInbound && !answered && !dur) {
            update.status = 'missed'
          } else if (dur > 0) {
            update.status = 'completed'
          }
        }
        await db.from('calls').update(update).or(`telnyx_call_control_id.eq.${callControlId},telnyx_call_session_id.eq.${sessionId}`)
      }
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('Telnyx webhook error:', err)
    // Always 200 so Telnyx doesn't retry-storm us
    return NextResponse.json({ ok: true })
  }
}
