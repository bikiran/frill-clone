import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { linkedContacts } from '@/lib/identity'
import { phoneKey, emailKey } from '@/lib/phone'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET /api/contacts/timeline?contactId=…
//
// Every message this person has exchanged, across EVERY channel — live chat,
// SMS, email, Messenger, Instagram — merged into one time-ordered stream. The
// person may be several linked contacts (identity_group_id); we gather all
// their conversations and interleave the messages, tagging each with its
// channel and which conversation it belongs to.
export async function GET(req: NextRequest) {
  const contactId = new URL(req.url).searchParams.get('contactId')
  if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 })

  const db = admin()

  // All contacts that are the same person (falls back to just this one).
  const linked = await linkedContacts(db, contactId)
  const contactIds = linked.length ? linked.map((c: any) => c.id) : [contactId]

  // Their conversations.
  const { data: convs } = await db.from('conversations')
    .select('id, channel, subject').in('contact_id', contactIds)
  const convById: Record<string, any> = {}
  for (const c of convs || []) convById[c.id] = c
  const convIds = Object.keys(convById)
  if (convIds.length === 0) return NextResponse.json({ messages: [], conversations: [] })

  // Messages across all of them, oldest first.
  const { data: msgs } = await db.from('messages')
    .select('id, conversation_id, sender_type, sender_name, content, delivery_channel, created_at, attachments')
    .in('conversation_id', convIds)
    .order('created_at', { ascending: true })
    .limit(500)

  const messages = (msgs || []).map((m: any) => {
    const conv = convById[m.conversation_id] || {}
    return {
      ...m,
      // Prefer the message's own delivery_channel, else the conversation's.
      channel: String(m.delivery_channel || conv.channel || 'chat').toLowerCase(),
      conversation_subject: conv.subject || null,
    }
  })

  // ── Non-message activity, merged into the same stream, source-labelled ──────
  const companyId = linked[0]?.company_id
    || (await db.from('contacts').select('company_id').eq('id', contactId).maybeSingle()).data?.company_id
  const emails = Array.from(new Set(linked.map((c: any) => c.email).filter(Boolean).map((e: string) => emailKey(e)).filter(Boolean)))
  const phones = Array.from(new Set(linked.map((c: any) => c.phone).filter(Boolean).map((p: string) => phoneKey(p)).filter((k: string) => k.length >= 8)))
  const money = (n: any, cur?: string) => { const v = Number(n); if (isNaN(v)) return ''; try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: (cur || 'aud').toUpperCase() }).format(v) } catch { return `$${v.toFixed(2)}` } }

  const activity: any[] = []
  const pushOrder = (o: any) => activity.push({ id: 'order-' + o.id, kind: 'order', source: 'WooCommerce', date: o.order_date || o.created_at, title: `Order #${o.woo_order_id}`, detail: [money(o.total, o.currency), o.status].filter(Boolean).join(' · ') })

  if (companyId && (emails.length || phones.length)) {
    try {
      const seen = new Set<string>()
      if (emails.length) {
        const orExpr = emails.map(e => `customer_email.ilike.${e.replace(/,/g, '')}`).join(',')
        const { data } = await db.from('woocommerce_orders').select('id, woo_order_id, total, currency, status, order_date').eq('company_id', companyId).or(orExpr).order('order_date', { ascending: false }).limit(50)
        for (const o of (data || [])) if (!seen.has(o.id)) { seen.add(o.id); pushOrder(o) }
      }
      if (phones.length) {
        const { data } = await db.from('woocommerce_orders').select('id, woo_order_id, total, currency, status, order_date').eq('company_id', companyId).in('billing_phone_norm', phones).order('order_date', { ascending: false }).limit(50)
        for (const o of (data || [])) if (!seen.has(o.id)) { seen.add(o.id); pushOrder(o) }
      }
    } catch {}
  }
  // Reviews (legacy generic table, keyed on contact).
  try {
    const { data } = await db.from('reviews').select('id, platform, rating, review_text, review_date, created_at').in('contact_id', contactIds).limit(50)
    for (const r of (data || [])) activity.push({ id: 'review-' + r.id, kind: 'review', source: r.platform || 'Review', date: r.review_date || r.created_at, title: `${r.rating ? r.rating + '★ ' : ''}Review`, detail: (r.review_text || '').slice(0, 160) })
  } catch {}
  // Real synced Google reviews (google_reviews, keyed on contact via V244).
  try {
    const { data } = await db.from('google_reviews').select('id, star_rating, comment, review_created_at, created_at').in('contact_id', contactIds).limit(50)
    for (const r of (data || [])) activity.push({ id: 'greview-' + r.id, kind: 'review', source: 'Google', date: r.review_created_at || r.created_at, title: `${r.star_rating ? r.star_rating + '★ ' : ''}Google review`, detail: (r.comment || '').slice(0, 160), link: `/admin/reviews?review=${r.id}` })
  } catch {}
  // Facebook/Instagram comments on a post or ad (social_comments, keyed on
  // contact via V313).
  try {
    const { data } = await db.from('social_comments').select('id, platform, message, commented_at, created_at').in('contact_id', contactIds).limit(50)
    for (const c of (data || [])) activity.push({ id: 'comment-' + c.id, kind: 'comment', source: c.platform === 'instagram' ? 'Instagram' : 'Facebook', date: c.commented_at || c.created_at, title: `Commented on ${c.platform === 'instagram' ? 'Instagram' : 'Facebook'}`, detail: (c.message || '').slice(0, 160), link: `/admin/social?comment=${c.id}` })
  } catch {}
  // In-chat payments (keyed on conversation).
  try {
    const { data } = await db.from('chat_payments').select('*').in('conversation_id', convIds).limit(50)
    for (const p of (data || [])) {
      const amt = p.amount_cents != null ? p.amount_cents / 100 : p.amount
      activity.push({ id: 'pay-' + p.id, kind: 'payment', source: 'Payment', date: p.paid_at || p.created_at, title: p.status === 'paid' ? 'Payment received' : `Payment ${p.status || 'requested'}`, detail: money(amt, p.currency) })
    }
  } catch {}
  // Identity / customer-detail changes (audit).
  try {
    const { data } = await db.from('customer_identity_audit').select('id, action, detail, actor_name, created_at').in('contact_id', contactIds).order('created_at', { ascending: false }).limit(50)
    for (const a of (data || [])) activity.push({ id: 'audit-' + a.id, kind: 'audit', source: 'System', date: a.created_at, title: String(a.action || '').replace(/_/g, ' '), detail: [a.detail, a.actor_name ? `by ${a.actor_name}` : ''].filter(Boolean).join(' · ') })
  } catch {}

  return NextResponse.json({
    messages,
    activity: activity.filter(a => a.date).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    conversations: Object.values(convById),
    linkedCount: linked.length,
  })
}
