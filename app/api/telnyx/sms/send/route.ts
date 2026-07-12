import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TelnyxService, toE164 } from '@/lib/telnyx-service'

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
    const { data: integ } = await db.from('telnyx_integrations').select('*').eq('company_id', companyId).maybeSingle()
    if (!integ?.api_key || !integ.phone_number) {
      return NextResponse.json({ error: 'Telnyx SMS not configured (need API key + number)' }, { status: 400 })
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
    if (atts.length > 0) {
      const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
      const links: string[] = []
      for (const a of atts) {
        try {
          const code = Math.random().toString(36).slice(2, 8)
          await db.from('short_links').insert({
            code, company_id: companyId, target_url: a.url, label: a.name,
            kind: 'media', conversation_id: conversationId || null,
          })
          links.push(`${origin}/m/${code}`)
        } catch {
          links.push(a.url) // fall back to the raw URL if the shortlink insert fails
        }
      }
      body = (body ? body + '\n' : '') + links.join('\n')
    }
    if (!body.trim()) return NextResponse.json({ error: 'Nothing to send' }, { status: 400 })

    const svc = new TelnyxService(integ.api_key)
    const result = await svc.sendSMS({
      from: integ.phone_number,
      to: e164,
      text: body,
      messaging_profile_id: integ.messaging_profile_id || undefined,
    })

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
        telnyx_message_id: result?.data?.id || null,
      })
      await db.from('conversations').update({
        last_message: text || '📎 Attachment',
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', conversationId)
    }

    return NextResponse.json({ ok: true, id: result?.data?.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
