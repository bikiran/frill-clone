import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { deliverAutomatedMessage } from '@/lib/channel-fallback'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function member(db: any, req: NextRequest, companyId: string): Promise<{ ok: boolean; uid: string | null }> {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return { ok: false, uid: null }
  try {
    const { data } = await db.auth.getUser(token)
    const uid = data?.user?.id
    if (!uid) return { ok: false, uid: null }
    const { data: co } = await db.from('companies').select('owner_id').eq('id', companyId).maybeSingle()
    if (co?.owner_id === uid) return { ok: true, uid }
    const { data: tm } = await db.from('team_members').select('id').eq('company_id', companyId).eq('user_id', uid).maybeSingle()
    return { ok: !!tm?.id, uid }
  } catch { return { ok: false, uid: null } }
}

/**
 * POST /api/orders/send-tracking
 * Body: { companyId, orderId, text, trackingNumber?, trackingUrl?, carrier?, senderName? }
 *
 * Delivers a tracking message to the order's customer (SMS or email, with the
 * channel-fallback rules), creating a conversation for the order if one doesn't
 * exist yet so the message + history live somewhere. Records the tracking fields
 * and a timeline event on the order.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { companyId, orderId, text } = body
    if (!companyId || !orderId || !text) return NextResponse.json({ error: 'companyId, orderId and text required' }, { status: 400 })
    const db = admin()
    const { ok, uid } = await member(db, req, companyId)
    if (!ok) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

    const { data: order } = await db.from('orders').select('*').eq('id', orderId).eq('company_id', companyId).maybeSingle()
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    const phone = order.customer_phone || null
    const email = order.customer_email || null
    if (!phone && !email && !order.conversation_id) return NextResponse.json({ error: 'No phone or email on this order to send tracking to.' }, { status: 400 })

    // Ensure a conversation exists (delivery + inbox thread hang off it).
    let conversationId: string | null = order.conversation_id || null
    if (!conversationId) {
      const channel = phone ? 'sms' : 'email'
      const { data: conv } = await db.from('conversations').insert({
        company_id: companyId, contact_id: order.contact_id || null, status: 'open',
        channel, sms_number: phone, subject: `Order ${order.order_number}`,
        last_message: 'Tracking sent', last_message_at: new Date().toISOString(),
      }).select('id').maybeSingle()
      conversationId = conv?.id || null
      if (conversationId) { try { await db.from('orders').update({ conversation_id: conversationId }).eq('id', orderId) } catch {} }
    }
    if (!conversationId) return NextResponse.json({ error: 'Could not create a conversation to send on.' }, { status: 500 })

    const result = await deliverAutomatedMessage({
      companyId, conversationId, text, phone, email,
      senderName: body.senderName || 'Team',
      subject: `Tracking for order ${order.order_number}`,
      origin: req.nextUrl.origin,
      preferChannel: phone ? 'sms' : 'email',
      db,
    })

    // Record tracking fields + a timeline event.
    const patch: any = { updated_at: new Date().toISOString() }
    if (body.trackingNumber) patch.tracking_number = body.trackingNumber
    if (body.trackingUrl) patch.tracking_url = body.trackingUrl
    if (body.carrier) patch.carrier = body.carrier
    try { await db.from('orders').update(patch).eq('id', orderId) } catch {}
    try {
      await db.from('order_events').insert({
        order_id: orderId, company_id: companyId, type: 'tracking_sent', actor_id: uid,
        detail: `Tracking sent to customer${body.trackingNumber ? ` · ${body.trackingNumber}` : ''}`,
      })
    } catch {}

    return NextResponse.json({ ok: true, channel: result?.channel || null, conversationId })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
