// Pay links: what the Stripe checkout asks for, and what we keep afterwards.
//
// The business picks (Settings → Payments → Payment links):
//   • fill     — fill the customer's EMPTY name / email / phone from what they
//                typed at checkout (never overwrites; the payer can be a
//                partner or parent paying on their own card)
//   • address  — ask for no address, a billing address or a delivery address
//                (each extra box costs a few checkouts, so it's a choice; the
//                person sending a link can change it per link)
//   • phone    — ask for a phone number
//   • saveCard — 'ask': a "save my card" tick box on the Stripe page (only
//                customers who tick it get a saved card); 'always': every card
//                is kept, with Stripe's consent wording; 'off'.
// Card numbers never touch Colvy: Stripe keeps the card, we keep its id,
// brand and last 4 (saved_cards) so "Charge saved card" works in the chat.

import { chatStripe } from '@/lib/chat-checkout'
import { recordAddress, formatAddress, type AddressInput } from '@/lib/contact-addresses'

export type PayLinkAddress = 'none' | 'billing' | 'shipping'
export type PayLinkSaveCard = 'off' | 'ask' | 'always'
export type PayLinkSettings = { fill: boolean; address: PayLinkAddress; phone: boolean; saveCard: PayLinkSaveCard; countries: string[] }

export const PAYLINK_DEFAULTS: PayLinkSettings = { fill: true, address: 'none', phone: false, saveCard: 'ask', countries: ['AU'] }

const ADDRESS_MODES: PayLinkAddress[] = ['none', 'billing', 'shipping']
const SAVE_MODES: PayLinkSaveCard[] = ['off', 'ask', 'always']

export function isPayLinkAddress(v: any): v is PayLinkAddress { return ADDRESS_MODES.includes(v) }

export function payLinkSettings(company: any): PayLinkSettings {
  const p = company?.payment_settings || {}
  const countries = Array.isArray(p.paylink_countries)
    ? p.paylink_countries.map((c: any) => String(c).trim().toUpperCase()).filter((c: string) => /^[A-Z]{2}$/.test(c))
    : []
  return {
    fill: p.paylink_fill_contact !== false,
    address: isPayLinkAddress(p.paylink_address) ? p.paylink_address : PAYLINK_DEFAULTS.address,
    phone: p.paylink_phone === true,
    saveCard: SAVE_MODES.includes(p.paylink_save_card) ? p.paylink_save_card : PAYLINK_DEFAULTS.saveCard,
    countries: countries.length ? countries : PAYLINK_DEFAULTS.countries,
  }
}

/** What one pay link's checkout asks for (carried in the session metadata so a regenerated session asks the same). */
export type PayLinkCollect = { address: PayLinkAddress; phone: boolean; saveCard: PayLinkSaveCard; countries: string[]; customerId?: string | null }

/**
 * The checkout options for a pay link in this conversation: the business's
 * settings, an optional per-link address choice, and the customer's Stripe
 * customer (when a card might be saved) so a saved card lands on them.
 */
export async function payLinkCollect(db: any, company: any, conversationId: string | null, opts: { address?: any; meta?: Record<string, string> } = {}): Promise<PayLinkCollect> {
  const st = payLinkSettings(company)
  const m = opts.meta || {}
  const address: PayLinkAddress = isPayLinkAddress(opts.address) ? opts.address : isPayLinkAddress(m.collectAddress) ? m.collectAddress as PayLinkAddress : st.address
  const phone = m.collectPhone ? m.collectPhone === '1' : st.phone
  const saveCard: PayLinkSaveCard = SAVE_MODES.includes(m.saveCard as any) ? m.saveCard as PayLinkSaveCard : st.saveCard
  let customerId: string | null = null
  if (saveCard !== 'off' && conversationId) {
    try {
      const { data: conv } = await db.from('conversations').select('contact_id').eq('id', conversationId).maybeSingle()
      if (conv?.contact_id) {
        const { data: ct } = await db.from('contacts').select('stripe_customer_id').eq('id', conv.contact_id).maybeSingle()
        customerId = ct?.stripe_customer_id || null
      }
    } catch {}
  }
  return { address, phone, saveCard, countries: st.countries, customerId }
}

/** Stripe Checkout params for a pay link's collect options. */
export function collectParams(c: PayLinkCollect): Record<string, any> {
  const out: Record<string, any> = {}
  if (c.address === 'billing') out.billing_address_collection = 'required'
  if (c.address === 'shipping') out.shipping_address_collection = { allowed_countries: c.countries.length ? c.countries : ['AU'] }
  if (c.phone) out.phone_number_collection = { enabled: true }
  if (c.saveCard !== 'off') {
    // A saved card needs a Stripe customer: theirs if we know it, else a new one.
    if (c.customerId) out.customer = c.customerId
    else out.customer_creation = 'always'
    if (c.saveCard === 'ask') out.saved_payment_method_options = { payment_method_save: 'enabled' }
    else out.payment_intent_data = { setup_future_usage: 'off_session' }
  }
  return out
}

export function collectMetadata(c: PayLinkCollect): Record<string, string> {
  return { collectAddress: c.address, collectPhone: c.phone ? '1' : '0', saveCard: c.saveCard }
}

const str = (v: any) => (v == null ? '' : String(v).trim())
// A "name" that's really a phone number or an email is a placeholder.
const placeholderName = (n: string) => !n || /^[+\d\s()-]{6,}$/.test(n) || n.includes('@') || /^unknown|^visitor|^guest/i.test(n)

function toAddress(a: any): AddressInput | null {
  if (!a || !(a.line1 || a.city || a.postal_code)) return null
  return { line1: a.line1 || null, line2: a.line2 || null, city: a.city || null, state: a.state || null, postcode: a.postal_code || null, country: a.country || null }
}

export type CaptureResult = { contactId: string | null; filled: string[]; created: boolean; addresses: number; card: { brand: string | null; last4: string | null } | null; receipt?: string | null }

/**
 * After a pay link is paid (called once, by whichever of the webhook or the
 * verify poll confirmed it): fill the customer's empty details, keep any
 * address they gave, and record a card they agreed to save. Best-effort —
 * never throws.
 */
export async function captureFromPayLink(db: any, args: { companyId: string; sessionId: string; paymentId?: string | null }): Promise<CaptureResult | null> {
  try {
    const { data: company } = await db.from('companies').select('*').eq('id', args.companyId).maybeSingle()
    if (!company) return null
    const { s, connectOpts } = await chatStripe(company)
    const session: any = await s.checkout.sessions.retrieve(args.sessionId, { expand: ['payment_intent.payment_method', 'payment_intent.latest_charge'] } as any, connectOpts as any)
    const meta = session?.metadata || {}
    if (meta.kind !== 'chat_payment' || !meta.conversationId) return null
    const st = payLinkSettings(company)
    const res: CaptureResult = { contactId: null, filled: [], created: false, addresses: 0, card: null }

    const d = session.customer_details || {}
    const name = str(d.name), email = str(d.email).toLowerCase(), phone = str(d.phone)
    const shipping = session.shipping_details || session.collected_information?.shipping_details || null
    const billingAddr = meta.collectAddress === 'billing' ? toAddress(d.address) : null
    const shippingAddr = toAddress(shipping?.address)
    const pm: any = typeof session.payment_intent === 'object' ? session.payment_intent?.payment_method : null
    const savedCard = pm && typeof pm === 'object' && pm.customer && pm.card ? pm : null

    // ── A receipt for the customer. Checkout only emails one when the
    // business switched receipts on in Stripe; giving the charge a receipt
    // address makes Stripe send it either way (once — skipped if one was
    // already requested).
    const charge: any = typeof session.payment_intent === 'object' ? session.payment_intent?.latest_charge : null
    if (email && company.payment_settings?.paylink_receipt !== false && charge && typeof charge === 'object' && !charge.receipt_email) {
      try { await s.charges.update(charge.id, { receipt_email: email }, connectOpts as any); res.receipt = email } catch { /* best-effort */ }
    }

    // ── The customer this payment belongs to
    const { data: conv } = await db.from('conversations').select('id, contact_id').eq('id', meta.conversationId).maybeSingle()
    let contact: any = null
    if (conv?.contact_id) {
      const { data } = await db.from('contacts').select('*').eq('id', conv.contact_id).maybeSingle()
      contact = data
    }
    if (!contact && st.fill && (email || name || phone)) {
      // No customer on the chat yet: use the one with this email, else add them.
      if (email) {
        const { data } = await db.from('contacts').select('*').eq('company_id', args.companyId).ilike('email', email).limit(1)
        contact = data?.[0] || null
      }
      if (!contact) {
        const { data } = await db.from('contacts').insert({ company_id: args.companyId, name: name || null, email: email || null, phone: phone || null, source: 'payment' }).select('*').maybeSingle()
        contact = data
        if (contact) { res.created = true; res.filled.push(...(['name', 'email', 'phone'] as const).filter(k => ({ name, email, phone })[k])) }
      }
      if (contact && conv) await db.from('conversations').update({ contact_id: contact.id }).eq('id', conv.id)
    }
    if (!contact) return res
    res.contactId = contact.id

    // ── Fill empty details only
    if (st.fill && !res.created) {
      const patch: Record<string, any> = {}
      if (name && placeholderName(str(contact.name))) patch.name = name
      if (email && !str(contact.email)) patch.email = email
      if (phone && !str(contact.phone)) patch.phone = phone
      if (Object.keys(patch).length) {
        await db.from('contacts').update(patch).eq('id', contact.id)
        res.filled.push(...Object.keys(patch))
      }
    }

    // ── Addresses they gave go in the customer's address book (never overwrite)
    const source = 'Payment link'
    for (const [a, label] of [[shippingAddr, 'Delivery'], [billingAddr, 'Billing']] as const) {
      if (!a) continue
      await recordAddress(db, args.companyId, contact.id, { ...a, label }, source, args.paymentId || args.sessionId)
      res.addresses++
    }
    const first = shippingAddr || billingAddr
    if (first && !str(contact.address)) {
      const flat = { address: [first.line1, first.line2].filter(Boolean).join(', '), city: first.city, country: first.country }
      try {
        const { error } = await db.from('contacts').update({ ...flat, state: first.state, postcode: first.postcode }).eq('id', contact.id)
        if (error) await db.from('contacts').update(flat).eq('id', contact.id)
      } catch {}
    }

    // ── A card they agreed to save
    const custId = savedCard ? String(savedCard.customer) : (typeof session.customer === 'string' ? session.customer : session.customer?.id) || null
    if (custId && !contact.stripe_customer_id) {
      try { await db.from('contacts').update({ stripe_customer_id: custId }).eq('id', contact.id) } catch {}
    }
    if (savedCard) {
      const { data: existing } = await db.from('saved_cards').select('id').eq('company_id', args.companyId).eq('stripe_payment_method_id', String(savedCard.id)).maybeSingle()
      if (!existing) {
        const { data: others } = await db.from('saved_cards').select('id').eq('company_id', args.companyId).eq('contact_id', contact.id).limit(1)
        await db.from('saved_cards').insert({
          company_id: args.companyId, contact_id: contact.id,
          stripe_customer_id: String(savedCard.customer), stripe_payment_method_id: String(savedCard.id),
          brand: savedCard.card?.brand || null, last4: savedCard.card?.last4 || null,
          exp_month: savedCard.card?.exp_month || null, exp_year: savedCard.card?.exp_year || null,
          is_default: !(others && others.length),
        })
      }
      res.card = { brand: savedCard.card?.brand || null, last4: savedCard.card?.last4 || null }
    }

    // ── A note for the team (internal, never sent to the customer)
    const bits: string[] = []
    if (res.filled.length) bits.push(`${res.created ? 'Added the customer' : 'Filled in'}: ${res.filled.map(k => ({ name, email, phone } as any)[k]).join(' · ')}`)
    if (first) bits.push(`${shippingAddr ? 'Delivery' : 'Billing'} address saved: ${formatAddress(first)}`)
    if (res.card) bits.push(`Card saved for later: ${res.card.brand ? res.card.brand[0].toUpperCase() + res.card.brand.slice(1) : 'Card'} ending ${res.card.last4}`)
    if (bits.length) {
      try {
        await db.from('messages').insert({
          conversation_id: meta.conversationId, company_id: args.companyId,
          sender_type: 'system', is_internal: true,
          content: `From the payment — ${bits.join('. ')}.`,
          metadata: { paylink_capture: true, filled: res.filled, addresses: res.addresses, card_saved: !!res.card },
        })
      } catch {}
    }
    return res
  } catch (e) {
    console.error('[paylink-capture]', e)
    return null
  }
}
