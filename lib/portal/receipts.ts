// Receipts on the customer portal: an in-store sale (Prexty, through
// WooCommerce), an online order (WooCommerce, Shopify) or a payment link,
// as a receipt the customer can print or save as a PDF. A "Tax invoice" when
// the business has an ABN and the sale carries GST, else a "Receipt".
//
// The order is read again here and must belong to the signed-in contact (their
// email exactly, or their mobile's last nine digits; a payment link through one
// of their conversations). Amounts are shown including GST, as Australian
// customers expect; WooCommerce stores line totals before tax, so tax is added.
// No addresses or card numbers.

import { phoneKey } from '@/lib/phone'
import type { PortalCompany } from '@/lib/portal/auth'

export type ReceiptLine = { name: string; qty: number; cents: number | null }
export type PortalReceipt = {
  title: 'Tax invoice' | 'Receipt'
  number: string
  /** "Receipt R1001 · Order #5012" style extra reference, when there is one. */
  ref: string | null
  date: string
  business: { name: string; abn: string | null; address: string | null; phone: string | null; email: string | null; website: string | null; logoUrl: string | null; accent: string | null }
  customer: string | null
  lines: ReceiptLine[]
  adjustments: { label: string; cents: number }[]
  totalCents: number
  currency: string
  gstCents: number | null
  status: 'paid' | 'unpaid' | 'refunded' | 'cancelled'
  statusLabel: string
  paymentMethod: string | null
  paidAt: string | null
  where: string | null
  /** Online orders: the shop's own page for this order (returns, changes). */
  shopUrl: string | null
  /** Payment links: the card receipt Stripe sent. */
  cardReceiptUrl: string | null
}

const cents = (v: any) => Math.round((Number(v) || 0) * 100)
const num = (v: any) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

export function parseReceiptKey(key: any): { src: 'woo' | 'shop' | 'pay'; id: string } | null {
  const m = /^(woo|shop|pay):([A-Za-z0-9-]{1,64})$/.exec(String(key || ''))
  return m ? { src: m[1] as any, id: m[2] } : null
}

async function businessOf(db: any, companyId: string) {
  const { data: c } = await db.from('companies').select('*').eq('id', companyId).maybeSingle()
  const s = (v: any) => (String(v || '').trim() || null)
  return {
    name: String(c?.name || ''), abn: s(c?.abn_acn), address: s(c?.business_address), phone: s(c?.business_phone || c?.business_mobile),
    email: s(c?.business_email), website: s(c?.website), logoUrl: s(c?.logo_url), accent: s(c?.accent_color),
  }
}

/** Is this order the signed-in contact's? Their email exactly, or their mobile's last nine digits. */
function theirs(contact: any, email: any, phoneNorm: any): boolean {
  const e = String(contact?.email || '').trim().toLowerCase()
  const k = phoneKey(contact?.phone)
  return (!!e && String(email || '').trim().toLowerCase() === e) || (k.length >= 9 && String(phoneNorm || '') === k)
}

export async function portalReceipt(db: any, pc: PortalCompany, contact: any, key: string): Promise<PortalReceipt | null> {
  const k = parseReceiptKey(key)
  if (!k || !contact) return null
  const companyId = pc.company.id

  if (k.src === 'woo') {
    const { data: o } = await db.from('woocommerce_orders').select('*').eq('id', k.id).eq('company_id', companyId).maybeSingle()
    if (!o || !theirs(contact, o.customer_email, o.billing_phone_norm)) return null
    const d = o.detail && typeof o.detail === 'object' ? o.detail : {}
    const pos = o.pos_source === 'prexty' || !!o.pos_sale_id
    const st = String(o.status || '').toLowerCase()
    const lines: ReceiptLine[] = (Array.isArray(o.line_items) ? o.line_items : []).map((li: any) => {
      const t = num(li.total), tx = num(li.total_tax)
      return { name: String(li.name || 'Item').slice(0, 120), qty: Number(li.quantity) || 1, cents: t == null ? null : cents(t + (tx || 0)) }
    })
    const adjustments: { label: string; cents: number }[] = []
    const disc = (Number(d.discount_total) || 0) + (Number(d.discount_tax) || 0)
    if (disc > 0) {
      const codes = (Array.isArray(d.coupon_lines) ? d.coupon_lines : []).map((c: any) => String(c.code || '').toUpperCase()).filter(Boolean)
      adjustments.push({ label: `Discount${codes.length ? ` (${codes.join(', ')})` : ''}`, cents: -cents(disc) })
    }
    for (const f of Array.isArray(d.fee_lines) ? d.fee_lines : []) {
      const v = (Number(f.total) || 0) + (Number(f.total_tax) || 0)
      if (v) adjustments.push({ label: String(f.name || 'Fee').slice(0, 60), cents: cents(v) })
    }
    const ship = (Number(o.shipping_total) || 0) + (Number(d.shipping_tax) || 0)
    if (ship > 0) adjustments.push({ label: `Shipping${d.shipping_method ? ` (${String(d.shipping_method).slice(0, 40)})` : ''}`, cents: cents(ship) })
    const lineTax = (Array.isArray(o.line_items) ? o.line_items : []).reduce((n: number, li: any) => n + (Number(li.total_tax) || 0), 0)
    const gst = num(d.total_tax) ?? (lineTax || null)
    const business = await businessOf(db, companyId)
    const status: PortalReceipt['status'] = st === 'refunded' ? 'refunded' : st === 'cancelled' || st === 'failed' ? 'cancelled' : pos || ['completed', 'processing'].includes(st) ? 'paid' : 'unpaid'
    let shopUrl: string | null = null
    if (!pos && o.woo_order_id != null) {
      const { data: wi } = await db.from('woocommerce_integrations').select('store_url').eq('company_id', companyId).limit(1)
      const store = String(wi?.[0]?.store_url || '').replace(/\/+$/, '')
      if (/^https?:\/\//.test(store)) shopUrl = `${store}/my-account/view-order/${o.woo_order_id}/`
    }
    return {
      title: business.abn && gst && gst > 0 ? 'Tax invoice' : 'Receipt',
      number: pos && o.pos_sale_id ? String(o.pos_sale_id) : o.woo_order_id != null ? `#${o.woo_order_id}` : String(o.id).slice(0, 8),
      ref: pos && o.pos_sale_id && o.woo_order_id != null ? `Order #${o.woo_order_id}` : null,
      date: o.order_date || d.date_created || o.created_at, business, customer: contact.name || null,
      lines, adjustments, totalCents: cents(o.total), currency: String(o.currency || 'AUD').toUpperCase(), gstCents: gst ? cents(gst) : null,
      status, statusLabel: { paid: 'Paid', unpaid: 'Not paid yet', refunded: 'Refunded', cancelled: 'Cancelled' }[status],
      paymentMethod: d.payment_method_title ? String(d.payment_method_title).slice(0, 60) : null, paidAt: d.date_paid || (pos ? o.order_date : null),
      where: pos ? `In store${o.pos_outlet ? ` at ${String(o.pos_outlet).slice(0, 60)}` : ''}` : 'Online order', shopUrl, cardReceiptUrl: null,
    }
  }

  if (k.src === 'shop') {
    const { data: o } = await db.from('orders').select('id, order_number, status, payment_status, subtotal, shipping_total, tax_total, discount_total, total, currency, order_date, created_at, customer_email, customer_phone_norm, sales_channel')
      .eq('id', k.id).eq('company_id', companyId).maybeSingle()
    if (!o || !theirs(contact, o.customer_email, o.customer_phone_norm)) return null
    const { data: items } = await db.from('order_items').select('product_name, quantity, unit_price, total_price').eq('order_id', o.id).eq('company_id', companyId).limit(100)
    const lines: ReceiptLine[] = (items || []).map((i: any) => {
      const qty = Number(i.quantity) || 1
      const t = num(i.total_price) ?? (num(i.unit_price) == null ? null : Number(i.unit_price) * qty)
      return { name: String(i.product_name || 'Item').slice(0, 120), qty, cents: t == null ? null : cents(t) }
    })
    const adjustments: { label: string; cents: number }[] = []
    if (Number(o.discount_total) > 0) adjustments.push({ label: 'Discount', cents: -cents(o.discount_total) })
    if (Number(o.shipping_total) > 0) adjustments.push({ label: 'Shipping', cents: cents(o.shipping_total) })
    const pay = String(o.payment_status || '').toLowerCase()
    const status: PortalReceipt['status'] = pay === 'refunded' ? 'refunded' : o.status === 'cancelled' ? 'cancelled' : ['paid', 'captured', 'succeeded'].includes(pay) ? 'paid' : 'unpaid'
    const gst = num(o.tax_total)
    const business = await businessOf(db, companyId)
    return {
      title: business.abn && gst && gst > 0 ? 'Tax invoice' : 'Receipt', number: o.order_number ? `#${String(o.order_number).replace(/^#/, '')}` : String(o.id).slice(0, 8), ref: null,
      date: o.order_date || o.created_at, business, customer: contact.name || null, lines, adjustments, totalCents: cents(o.total),
      currency: String(o.currency || 'AUD').toUpperCase(), gstCents: gst ? cents(gst) : null, status,
      statusLabel: { paid: 'Paid', unpaid: 'Not paid yet', refunded: 'Refunded', cancelled: 'Cancelled' }[status],
      paymentMethod: null, paidAt: null, where: 'Online order', shopUrl: null, cardReceiptUrl: null,
    }
  }

  // A payment link, through one of their conversations.
  const { data: p } = await db.from('chat_payments').select('id, conversation_id, amount_cents, refunded_cents, currency, description, status, receipt_url, paid_at, created_at')
    .eq('id', k.id).eq('company_id', companyId).maybeSingle()
  if (!p || !p.conversation_id) return null
  const { data: conv } = await db.from('conversations').select('id').eq('id', p.conversation_id).eq('company_id', companyId).eq('contact_id', contact.id).maybeSingle()
  if (!conv) return null
  const business = await businessOf(db, companyId)
  const status: PortalReceipt['status'] = p.status === 'refunded' ? 'refunded' : p.status === 'paid' ? 'paid' : p.status === 'failed' ? 'cancelled' : 'unpaid'
  const adjustments = Number(p.refunded_cents) > 0 && p.status !== 'refunded' ? [{ label: 'Refunded', cents: -Number(p.refunded_cents) }] : []
  return {
    title: 'Receipt', number: String(p.id).replace(/-/g, '').slice(0, 8).toUpperCase(), ref: null, date: p.paid_at || p.created_at, business, customer: contact.name || null,
    lines: [{ name: String(p.description || 'Payment').slice(0, 120), qty: 1, cents: Number(p.amount_cents) || 0 }], adjustments,
    totalCents: (Number(p.amount_cents) || 0) - (adjustments.length ? Number(p.refunded_cents) : 0), currency: String(p.currency || 'aud').toUpperCase(), gstCents: null,
    status, statusLabel: { paid: 'Paid', unpaid: 'Not paid yet', refunded: 'Refunded', cancelled: 'Payment failed' }[status],
    paymentMethod: status === 'paid' || status === 'refunded' ? 'Card' : null, paidAt: p.paid_at || null, where: null, shopUrl: null,
    cardReceiptUrl: /^https:\/\//.test(String(p.receipt_url || '')) ? p.receipt_url : null,
  }
}
