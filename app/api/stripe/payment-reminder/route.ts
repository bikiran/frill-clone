import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// Send a reminder for a still-pending payment: re-share the pay link over the
// customer's own channel (SMS / email / Messenger), and drop a note in the
// thread so the team sees the nudge went out.
export async function POST(req: NextRequest) {
  try {
    const { companyId, paymentId } = await req.json()
    if (!companyId || !paymentId) return NextResponse.json({ error: 'Missing companyId or paymentId' }, { status: 400 })

    const db = admin()
    const { data: pay } = await db.from('chat_payments').select('*').eq('id', paymentId).eq('company_id', companyId).maybeSingle()
    if (!pay) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    if (pay.status !== 'pending') return NextResponse.json({ error: 'Only pending payments can be reminded' }, { status: 400 })
    const payLink = pay.checkout_url
    if (!payLink) return NextResponse.json({ error: 'No payment link on this record' }, { status: 400 })
    if (!pay.conversation_id) return NextResponse.json({ error: 'No conversation to send through' }, { status: 400 })

    const { data: conv } = await db.from('conversations').select('channel, sms_number, subject, contact_id').eq('id', pay.conversation_id).maybeSingle()
    let phone = String(conv?.sms_number || ''), email = '', channel = String(conv?.channel || '').toLowerCase()
    if (conv?.contact_id) {
      const { data: ct } = await db.from('contacts').select('phone, email').eq('id', conv.contact_id).maybeSingle()
      if (!phone) phone = String(ct?.phone || '')
      email = String(ct?.email || '')
    }
    const { data: co } = await db.from('companies').select('name').eq('id', companyId).maybeSingle()
    const senderName = String(co?.name || 'Support')
    const amt = pay.amount_cents ? `$${(pay.amount_cents / 100).toFixed(2)} ${String(pay.currency || 'AUD').toUpperCase()}` : 'your payment'
    const text = `Reminder: your payment of ${amt}${pay.description ? ` for ${pay.description}` : ''} is still awaiting. You can pay securely here: ${payLink}`
    const base = String(process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').replace(/\/$/, '')

    let sent = ''
    try {
      if (channel === 'email' && email) {
        await fetch(`${base}/api/email/send`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, conversationId: pay.conversation_id, to: email, subject: conv?.subject || 'Payment reminder', text, senderName }),
        })
        sent = 'email'
      } else if (['facebook', 'instagram', 'messenger'].includes(channel)) {
        await fetch(`${base}/api/meta/send`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: pay.conversation_id, content: text, agentName: senderName }),
        })
        sent = channel
      } else if (phone) {
        await fetch(`${base}/api/telnyx/sms/send`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, conversationId: pay.conversation_id, to: phone, text, senderName }),
        })
        sent = 'sms'
      } else {
        return NextResponse.json({ error: 'No phone or email to send the reminder to' }, { status: 400 })
      }
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'Could not send reminder' }, { status: 500 })
    }

    try {
      await db.from('conversation_events').insert({
        conversation_id: pay.conversation_id, company_id: companyId, event_type: 'payment_reminder',
        detail: `Payment reminder sent — ${amt}`,
      })
    } catch {}

    return NextResponse.json({ ok: true, channel: sent })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not send reminder' }, { status: 500 })
  }
}
