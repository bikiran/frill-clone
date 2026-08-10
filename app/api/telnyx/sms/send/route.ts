import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { toE164 } from '@/lib/telnyx-service'
import { resolveSmsSender } from '@/lib/sms-provider'
import { trackLinksInText } from '@/lib/link-tracking'
import { isExternalSendBlocked, DEMO_BLOCK_MESSAGE, logBlockedSend } from '@/lib/demo-guard'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Send an SMS to a conversation's visitor and log it in the thread.
// Attachments are sent as short Colvy links (not raw MMS media) so large
// videos aren't rejected and images aren't downscaled by the carrier.
export async function POST(req: NextRequest) {
  try {
    // skipChatMessage: deliver the SMS but DON'T log it as a chat message. Used
    // when the chat already shows a richer version (e.g. a payment card), so the
    // customer doesn't see the same thing twice with a long raw link.
    const { companyId, conversationId, to, text, senderName, attachments, skipChatMessage } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const db = admin()
    if (await isExternalSendBlocked(companyId, db)) { logBlockedSend(companyId, 'sms', db); return NextResponse.json({ error: DEMO_BLOCK_MESSAGE }, { status: 403 }) }

    // Resolve whichever provider this company sends SMS through (Telnyx by
    // default, Twilio when selected). One uniform sender — the rest of this
    // route no longer cares which carrier is underneath.
    const sender = await resolveSmsSender(db, companyId)
    if (!sender) {
      return NextResponse.json({ error: 'SMS not configured (connect Telnyx or Twilio with a number)' }, { status: 400 })
    }

    // Resolve destination number
    let dest = to
    if (!dest && conversationId) {
      const { data: conv } = await db.from('conversations').select('sms_number').eq('id', conversationId).maybeSingle()
      dest = conv?.sms_number
    }
    const e164 = toE164(dest || '')
    if (!e164) return NextResponse.json({ error: 'No valid destination mobile number' }, { status: 400 })

    // Build the message body — append short links for any attachments.
    // Media goes to /m/<code> (a friendly viewer that renders the image/video on
    // mobile) rather than a raw storage URL, which often just downloads or looks
    // like spam in a text message.
    let body = text || ''
    const atts = Array.isArray(attachments) ? attachments : []
    // When the provider carries real MMS (Twilio), photos go as actual picture
    // messages; everything else (and every attachment on Telnyx) still goes as a
    // short /m/ link. Videos/large files stay link-based even on MMS providers so
    // they can't be rejected for exceeding the carrier's MMS size cap.
    const mmsUrls: string[] = []
    const isImageAtt = (a: any) => a?.kind === 'image' || String(a?.type || '').startsWith('image/')
    if (atts.length > 0) {
      // Send media links on the COMPANY's own subdomain (roxyaquarium.colvy.com)
      // rather than the bare Colvy domain — it looks like the business, which
      // matters a lot for trust in an SMS.
      const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
      let origin = base
      try {
        const { data: co } = await db.from('companies').select('slug').eq('id', companyId).maybeSingle()
        const u = new URL(base)
        if (co?.slug && u.hostname.endsWith('colvy.com')) {
          origin = `${u.protocol}//${co.slug}.colvy.com`
        }
      } catch {}
      const links: string[] = []
      for (const a of atts) {
        // Photo on an MMS-capable provider → send the real image, no link needed.
        if (sender.supportsMms && isImageAtt(a) && a.url) { mmsUrls.push(a.url); continue }
        try {
          // A per-attachment expiry (set in the composer's media preview) makes
          // the /m/ viewer stop serving the file after the deadline. 'access'
          // mode just revokes access; 'delete' also purges the media via the
          // expire-media cron. Patched separately so a pre-migration DB still
          // creates the link.
          const expiresAt: string | null = a.expires_at || null
          const expiryMode: string = a.expiry_mode === 'delete' ? 'delete' : 'access'
          // Reuse an existing link for this exact file in this conversation,
          // so the same image can't go out as two different links. A fresh
          // expiry choice still updates the existing link's deadline.
          const { data: existing } = await db.from('short_links')
            .select('code').eq('company_id', companyId).eq('target_url', a.url).limit(1)
          if (existing?.[0]?.code) {
            if (expiresAt) {
              try { await db.from('short_links').update({ expires_at: expiresAt, expiry_mode: expiryMode }).eq('code', existing[0].code).eq('company_id', companyId) } catch {}
            }
            links.push(`${origin}/m/${existing[0].code}`)
            continue
          }
          const code = Math.random().toString(36).slice(2, 8)
          await db.from('short_links').insert({
            code, company_id: companyId, target_url: a.url, label: a.name,
            kind: 'media', conversation_id: conversationId || null,
          })
          if (expiresAt) {
            try { await db.from('short_links').update({ expires_at: expiresAt, expiry_mode: expiryMode }).eq('code', code).eq('company_id', companyId) } catch {}
          }
          links.push(`${origin}/m/${code}`)
        } catch {
          links.push(a.url) // fall back to the raw URL if the shortlink insert fails
        }
      }
      // De-dupe in case the same file was passed twice.
      const uniqueLinks = Array.from(new Set(links))
      if (uniqueLinks.length) body = (body ? body + '\n' : '') + uniqueLinks.join('\n')
    }
    // Allow a bare photo (real MMS) with no caption; otherwise require some text.
    if (!body.trim() && mmsUrls.length === 0) return NextResponse.json({ error: 'Nothing to send' }, { status: 400 })

    // Rewrite any URLs in the message to trackable {company}.colvy.com/l/<code>
    // links so we can report on clicks. Fail-safe: on any error the original
    // URL is kept, so tracking can never block the message going out.
    try {
      // Pull the conversation's contact/outlet so clicks can be attributed to a
      // customer, agent and outlet in Link Reports.
      let convMeta: any = null
      if (conversationId) {
        const { data } = await db.from('conversations')
          .select('contact_id, assigned_location_id').eq('id', conversationId).maybeSingle()
        convMeta = data
      }
      body = await trackLinksInText(body, {
        companyId,
        conversationId: conversationId || undefined,
        contactId: convMeta?.contact_id || undefined,
        locationId: convMeta?.assigned_location_id || undefined,
        sentBy: senderName || undefined,
        channel: 'sms',
      })
    } catch {}

    // Twilio delivery receipts (for campaign reporting) come back to the Twilio
    // webhook, so give it a public status-callback URL.
    const statusCallback = sender.provider === 'twilio'
      ? `${(process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').replace(/\/$/, '')}/api/twilio/webhook`
      : undefined
    const result = await sender.send({
      to: e164,
      text: body,
      mediaUrls: mmsUrls.length ? mmsUrls : undefined,
      statusCallback,
    })
    const providerMessageId = result.id

    // Log into the conversation thread as an agent message sent via SMS
    if (conversationId && !skipChatMessage) {
      await db.from('messages').insert({
        conversation_id: conversationId,
        company_id: companyId,
        sender_type: 'agent',
        sender_name: senderName || 'Agent',
        content: text || (atts.length ? '📎 Sent attachment link' : ''),
        attachments: atts,
        delivery_channel: 'sms',
        telnyx_message_id: providerMessageId,
      })
      await db.from('conversations').update({
        last_message: text || 'Attachment',
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // The conversation has MOVED to SMS. Without this it kept claiming to be
        // a live-chat enquiry forever — so the inbox badge, the sidebar channel
        // and the "Currently on: <page>" banner all showed stale web-widget data
        // for someone who is actually texting.
        channel: 'sms',
        // Record the mobile we texted, so the customer's REPLY fast-path matches
        // back to THIS conversation instead of spawning a new "+61…" thread.
        sms_number: dest,
        sms_enabled: true,
      }).eq('id', conversationId)
    } else if (!conversationId && dest && !skipChatMessage) {
      // Brand-new outbound message (from the composer) — find or create a
      // conversation for this number so the sent SMS shows as a thread.
      const norm = (p: string) => (p || '').replace(/\D/g, '').slice(-9)
      let convId: string | null = null
      // Try to match an existing contact + their most recent conversation.
      const { data: cts } = await db.from('contacts').select('id, name, phone').eq('company_id', companyId).limit(500)
      const contact = (cts || []).find((c: any) => c.phone && norm(c.phone) === norm(dest))
      if (contact) {
        const { data: existing } = await db.from('conversations')
          .select('id').eq('company_id', companyId).eq('contact_id', contact.id)
          .order('last_message_at', { ascending: false }).limit(1).maybeSingle()
        if (existing?.id) convId = existing.id
      }
      if (!convId) {
        const { data: created } = await db.from('conversations').insert({
          company_id: companyId,
          contact_id: contact?.id || null,
          subject: contact?.name || dest,
          channel: 'sms',
          status: 'open',
          sms_number: e164,
          last_message: body.slice(0, 120),
          last_message_at: new Date().toISOString(),
        }).select('id').maybeSingle()
        convId = created?.id || null
      }
      if (convId) {
        await db.from('messages').insert({
          conversation_id: convId, company_id: companyId, sender_type: 'agent',
          content: body, delivery_channel: 'sms',
        })
        await db.from('conversations').update({
          last_message: body.slice(0, 120), last_message_at: new Date().toISOString(),
          channel: 'sms', sms_number: e164, status: 'open',
        }).eq('id', convId)
      }
      return NextResponse.json({ ok: true, id: providerMessageId, conversationId: convId })
    }

    return NextResponse.json({ ok: true, id: providerMessageId })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
