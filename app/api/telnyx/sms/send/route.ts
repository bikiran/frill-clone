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
export async function POST(req: NextRequest) {
  try {
    const { companyId, conversationId, to, text, senderName } = await req.json()
    if (!companyId || !text) return NextResponse.json({ error: 'Missing companyId or text' }, { status: 400 })

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

    const svc = new TelnyxService(integ.api_key)
    const result = await svc.sendSMS({
      from: integ.phone_number,
      to: e164,
      text,
      messaging_profile_id: integ.messaging_profile_id || undefined,
    })

    // Log into the conversation thread as an agent message sent via SMS
    if (conversationId) {
      await db.from('messages').insert({
        conversation_id: conversationId,
        company_id: companyId,
        sender_type: 'agent',
        sender_name: senderName || 'Agent',
        content: text,
        delivery_channel: 'sms',
        telnyx_message_id: result?.data?.id || null,
      })
      await db.from('conversations').update({
        last_message: text,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', conversationId)
    }

    return NextResponse.json({ ok: true, id: result?.data?.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
