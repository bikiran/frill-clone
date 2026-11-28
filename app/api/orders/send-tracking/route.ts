import { isStaffMember } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { deliverAutomatedMessage } from '@/lib/channel-fallback'
import { readSmsOptIn, smsConsentFor } from '@/lib/channel-choice-server'

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
    const tm = (await isStaffMember(db, companyId, uid)) ? { id: true } : null
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

    // What the order itself lacks, from its conversation: the thread's number,
    // else its contact's phone; and the contact's email. Only the order's own
    // phone / email were used, so an order without them answered "no mobile or
    // email on file" while its conversation had the customer's number.
    // A number found this way is only used when the customer may be texted on
    // it: never a website chat visitor who typed a mobile and didn't tick
    // "Continue this conversation by text" (sms_enabled false on their chat),
    // nor anyone the opt-in rule (readSmsOptIn) or an opt-out / block
    // (smsConsentFor) rules out.
    // deliverAutomatedMessage and /api/telnyx/sms/send check again on the way.
    // Nothing is taken from a conversation that belongs to a different
    // contact than the order's.
    let threadPhone: string | null = null
    let threadEmail: string | null = null
    if ((!phone || !email) && order.conversation_id) {
      try {
        const { data: found } = await db.from('conversations').select('*').eq('id', order.conversation_id).eq('company_id', companyId).maybeSingle()
        const cv = found && (!order.contact_id || !found.contact_id || found.contact_id === order.contact_id) ? found : null
        const ct = cv?.contact_id ? (await db.from('contacts').select('*').eq('id', cv.contact_id).eq('company_id', companyId).maybeSingle()).data : null
        if (!email) threadEmail = ct?.email || null
        const websiteChat = !!cv?.visitor_id || ['widget', 'live_chat'].includes(String(cv?.channel || '').toLowerCase())
        const noOptIn = websiteChat && !!cv?.sms_number && cv.sms_enabled === false
        const n: string | null = !phone && !noOptIn ? cv?.sms_number || ct?.phone || null : null
        if (n && (await smsConsentFor(db, companyId, n, cv?.contact_id || order.contact_id || null)) === 'ok'
          && (await readSmsOptIn(db, { companyId, conv: cv, contact: ct, phone: n })) !== false) threadPhone = n
      } catch { /* couldn't be read or checked: nothing from the thread */ }
    }

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

    const send = {
      companyId, conversationId, text,
      senderName: body.senderName || 'Team',
      subject: `Tracking for order ${order.order_number}`,
      origin: req.nextUrl.origin,
      // The shared rule (lib/channel-choice): their last channel; a customer
      // who hasn't messaged gets order updates by email, else SMS. No texts at night.
      preferChannel: 'auto' as const, newCustomerDefault: 'email' as const, sendingHours: true,
      db,
    }
    // The order's own phone / email first, exactly as before.
    let result = await deliverAutomatedMessage({ ...send, phone, email })
    // That reached nobody (nothing sent, nothing held for the morning): once
    // more, with only what the order lacked, from its conversation. Whatever
    // already reaches the customer on the order's own details is untouched.
    if (!result?.sent && !result?.deferredUntil && (threadPhone || threadEmail)) {
      const again = await deliverAutomatedMessage({ ...send, phone: threadPhone, email: threadEmail })
      // Its answer stands when it went (or is held), or when the order had
      // nothing of its own to try; otherwise the order's own reason does.
      if (again?.sent || again?.deferredUntil || (!phone && !email)) result = again
    }
    // How it really went: sent (texted, emailed, or seen in the open chat), a
    // text held for sending hours, or nothing at all. The thread row, the
    // timeline and the answer below each say which, instead of always "sent".
    const held = !result?.sent && !!result?.deferredUntil
    const notSent = !result?.sent && !held

    // Record the message in the thread so it shows in the inbox. deliverAutomated-
    // Message sends the SMS/email with skipChatMessage:true (to avoid a duplicate),
    // so nothing was being written here — the tracking looked unsent on the board
    // and staff re-sent it from the inbox, double-messaging the customer.
    try {
      await db.from('messages').insert({
        conversation_id: conversationId, company_id: companyId,
        sender_type: 'agent', sender_name: body.senderName || 'Team',
        content: text, message_type: 'text', is_read: true,
        delivery_channel: result?.channel === 'email' ? 'email' : result?.channel === 'sms' ? 'sms' : 'chat',
        metadata: {
          auto: true, tracking: true,
          ...(held ? { deferred_until: result.deferredUntil } : {}),
          ...(notSent ? { delivery_failed: true, delivery_error: result?.error || null } : {}),
        },
      })
      await db.from('conversations').update({
        last_message: text.slice(0, 200), last_message_at: new Date().toISOString(),
      }).eq('id', conversationId)
    } catch {}

    // Record tracking fields + a timeline event.
    const patch: any = { updated_at: new Date().toISOString() }
    if (body.trackingNumber) patch.tracking_number = body.trackingNumber
    if (body.trackingUrl) patch.tracking_url = body.trackingUrl
    if (body.carrier) patch.carrier = body.carrier
    try { await db.from('orders').update(patch).eq('id', orderId) } catch {}
    try {
      await db.from('order_events').insert({
        order_id: orderId, company_id: companyId, type: 'tracking_sent', actor_id: uid,
        // The type stays 'tracking_sent' whatever happened: the Completed order
        // message reads it (lib/order-messages trackingAlreadySent).
        detail: `${notSent ? 'Tracking saved, but not sent to the customer' : held ? 'Tracking saved, the text is held until sending hours (9am–8pm)' : 'Tracking sent to customer'}${body.trackingNumber ? ` · ${body.trackingNumber}` : ''}${notSent && result?.error ? ` · ${result.error}` : ''}`,
      })
    } catch {}

    // `channel` is unchanged ('sms' also for a held text, 'none' when nothing
    // went). Not named `error`: callers read that as the request having failed.
    return NextResponse.json({
      ok: true, channel: result?.channel || null, conversationId,
      sent: !!result?.sent,
      deliveryError: notSent ? (result?.error || 'Not sent.') : null,
      deferredUntil: result?.deferredUntil || null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
