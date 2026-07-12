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

      // Find an existing conversation for this mobile, else create one
      let { data: conv } = await db.from('conversations')
        .select('*').eq('company_id', companyId).eq('sms_number', from)
        .order('last_message_at', { ascending: false }).limit(1).maybeSingle()

      if (!conv) {
        const { data: newConv } = await db.from('conversations').insert({
          company_id: companyId,
          channel: 'sms',
          subject: from,
          sms_number: from,
          sms_enabled: true,
          channel_number: to,
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
      const direction = payload?.direction // 'incoming' | 'outgoing'
      const fromNum = payload?.from
      const toNum = payload?.to

      // Inbound call just started — create a call row + link the caller's contact
      if (eventType === 'call.initiated' && direction === 'incoming') {
        const { data: integ } = await db.from('telnyx_integrations').select('company_id').eq('phone_number', toNum).maybeSingle()
        const companyId = integ?.company_id
        if (companyId) {
          // Match caller to an existing contact by phone
          let contactId: string | null = null
          let callerName: string | null = null
          const { data: contacts } = await db.from('contacts').select('id, name, phone').eq('company_id', companyId).limit(500)
          const digitsOf = (s: string) => (s || '').replace(/\D/g, '').slice(-9)
          const match = (contacts || []).find((c: any) => c.phone && digitsOf(c.phone) === digitsOf(fromNum))
          if (match) { contactId = match.id; callerName = match.name }

          await db.from('calls').insert({
            company_id: companyId,
            contact_id: contactId,
            direction: 'inbound',
            from_number: fromNum,
            to_number: toNum,
            status: 'ringing',
            telnyx_call_control_id: callControlId,
            telnyx_call_session_id: sessionId,
            caller_name: callerName,
          })
        }
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
          if (payload?.call_duration_secs) update.duration_seconds = payload.call_duration_secs
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
