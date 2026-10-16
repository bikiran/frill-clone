// Adding a customer to a back-in-stock waitlist on the AI's behalf (server only).
//
// Shared by the agents' add_to_waitlist action (lib/agent/waitlist-actions.ts)
// and Colvy AI's tool of the same name (lib/ai-assistant/tools.ts), so both
// follow the same rules:
//
//   • only a real catalogue product (WooCommerce product or variation, Shopify
//     product or variant) — never a guess. A name only counts when it IS one
//     product's name; otherwise the close matches come back for someone to pick
//   • never for something in stock right now (the customer can just buy it)
//   • one open entry per customer per item (an existing one is reported back)
//   • a customer who opted out of texts (STOP) or is blocked isn't texted:
//     they're added by email if there is one, otherwise not at all. The notify
//     path checks again when it sends (lib/waitlist.ts → /api/telnyx/sms/send).
//
// The entry is marked as added by AI (source 'ai_agent' / 'colvy_ai', the run
// and who in added_by — V385) and a staff-only note goes in the conversation.

import { describeShopifyItem } from '@/lib/shopify-waitlist'
import { variationStock, shopifyItemStock, priceNum } from '@/lib/waitlist-stock'
import { textOptOut } from '@/lib/sms-consent'
import { WooCommerceService } from '@/lib/woocommerce-service'
import { phoneKey, toE164, emailKey } from '@/lib/phone'
import { waitlistEntryHref } from '@/lib/waitlist-ai'

export type WaitlistProduct = {
  source: 'woocommerce' | 'shopify'
  wooProductId: number | null
  shopifyProductId: number | null
  shopifyVariantId: number | null
  name: string
  image: string | null
  url: string | null
  stockStatus: string | null
  stockQty: number | null
  price: number | null
}

/** A catalogue product shown as a close match, with the id to pass back. */
export type ProductMatch = { productId: string; name: string; inStock: boolean | null; price: number | null }

export type ResolveResult =
  | { ok: true; product: WaitlistProduct }
  | { ok: false; reason: 'not_found' | 'no_match' | 'mismatch'; matches: ProductMatch[]; idName?: string }
  // A product with sizes/options and none chosen: which one? (stock is per option)
  | { ok: false; reason: 'needs_variation'; product: string; options: ProductMatch[]; matches: ProductMatch[] }

// Letters and digits only, so "Red Long-Fin Bristlenose" = "red longfin bristlenose".
export const normName = (s: string) => String(s || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '')

export const isInStock = (p: { stockStatus: string | null; stockQty: number | null }) =>
  p.stockStatus === 'instock' && (p.stockQty == null || p.stockQty > 0)

const num = (v: any) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null }

/** "Size: Small, Sex: Male" (a Woo variation's attributes) → "Small, Male". */
export const optionText = (attrs: string) => String(attrs || '').split(', ').map(a => a.split(': ').slice(1).join(': ') || a).filter(Boolean).join(', ')

/**
 * The live WooCommerce store, when one is connected — the same source
 * check_stock reads, so an add and a stock check never disagree.
 */
export async function wooStore(db: any, companyId: string): Promise<WooCommerceService | null> {
  try {
    const { data } = await db.from('woocommerce_integrations').select('store_url, consumer_key, consumer_secret')
      .eq('company_id', companyId).eq('is_active', true).order('created_at', { ascending: true }).limit(1)
    const s = data?.[0]
    return s?.store_url && s.consumer_key ? new WooCommerceService({ storeUrl: s.store_url, consumerKey: s.consumer_key, consumerSecret: s.consumer_secret, companyId }) : null
  } catch { return null }
}

/** A variable product's options, live (empty when the store can't be reached). */
export async function wooOptions(store: WooCommerceService | null, parentId: number): Promise<ProductMatch[]> {
  if (!store) return []
  const vars = await store.getProductVariations(parentId).catch(() => [])
  return (vars || []).map((v: any) => ({
    productId: String(v.id), name: optionText(v.attributes) || `Option ${v.id}`,
    inStock: v.stock_status ? isInStock({ stockStatus: v.stock_status, stockQty: v.manage_stock ? v.stock_quantity ?? null : null }) : null,
    price: priceNum(v.price),
  }))
}

const WOO_COLS = 'woo_product_id, name, image, permalink, price, regular_price, sale_price, on_sale, stock_status, stock_quantity, type, variation_ids'
const isVariable = (p: any) => p?.type === 'variable' || (Array.isArray(p?.variation_ids) && p.variation_ids.length > 0)

type ById = { product: WaitlistProduct } | { needsVariation: { product: string; options: ProductMatch[] } } | null

async function wooVariation(db: any, companyId: string, store: WooCommerceService | null, parent: any, vid: number): Promise<WaitlistProduct | null> {
  const listed = (Array.isArray(parent.variation_ids) ? parent.variation_ids : []).map(Number)
  const live = store ? await store.getProductVariations(Number(parent.woo_product_id)).catch(() => []) : []
  const v = (live || []).find((x: any) => Number(x.id) === vid)
  if (!v && (live?.length ? true : !listed.includes(vid))) return null
  let stockStatus: string | null = null, stockQty: number | null = null, price: number | null = null
  if (v) { stockStatus = v.stock_status ?? null; stockQty = v.manage_stock ? v.stock_quantity ?? null : null; price = priceNum(v.price) }
  else {
    // The store didn't answer: the cached/variation lookup Waitlists uses.
    const vs = await variationStock(db, companyId, [vid]).catch(() => ({} as Record<string, any>))
    const c = vs[String(vid)]
    if (c && !c.approx) { stockStatus = c.stock_status ?? null; stockQty = c.stock_quantity ?? null }
    price = c?.price ?? null
  }
  const opt = v ? optionText(v.attributes) : ''
  return {
    source: 'woocommerce', wooProductId: vid, shopifyProductId: null, shopifyVariantId: null,
    name: opt ? `${parent.name} - ${opt}` : parent.name, image: v?.image || parent.image || null, url: parent.permalink || null,
    stockStatus, stockQty, price,
  }
}

async function wooById(db: any, companyId: string, id: number, variantId: number | null): Promise<ById> {
  const store = await wooStore(db, companyId)
  const { data: p } = await db.from('woocommerce_products').select(WOO_COLS).eq('company_id', companyId).eq('woo_product_id', id).maybeSingle()
  if (p) {
    if (isVariable(p)) {
      if (variantId) { const v = await wooVariation(db, companyId, store, p, variantId); return v ? { product: v } : null }
      return { needsVariation: { product: p.name, options: await wooOptions(store, id) } }
    }
    // Simple product: live stock where the store answers (as check_stock), else the synced catalogue.
    const live = store ? await store.getProductOrVariation(id).catch(() => null) : null
    return {
      product: {
        source: 'woocommerce', wooProductId: id, shopifyProductId: null, shopifyVariantId: null,
        name: p.name, image: p.image || null, url: p.permalink || null,
        stockStatus: live ? live.stock_status ?? null : p.stock_status || null,
        stockQty: live ? (live.manage_stock ? live.stock_quantity ?? null : null) : p.stock_quantity ?? null,
        price: priceNum(live?.price) ?? priceNum(p.price) ?? priceNum(p.regular_price),
      },
    }
  }
  // A size/variation id: the synced catalogue only has its parent.
  const { data: parents } = await db.from('woocommerce_products').select(WOO_COLS).eq('company_id', companyId).contains('variation_ids', [id]).limit(1)
  const parent = parents?.[0]
  if (!parent) return null
  const v = await wooVariation(db, companyId, store, parent, id)
  return v ? { product: v } : null
}

async function shopifyById(db: any, companyId: string, id: number, variantId: number | null): Promise<ById> {
  const { data: p } = await db.from('shopify_products').select('shopify_product_id, name, image, permalink, price, compare_at_price, stock_status, stock_quantity, has_variations, variants, status')
    .eq('company_id', companyId).eq('shopify_product_id', id).maybeSingle()
  if (!p || p.status === 'ARCHIVED' || p.status === 'DRAFT') return null
  const item = describeShopifyItem(p, variantId)
  const variants = Array.isArray(p.variants) ? p.variants : []
  if (variantId && !item.variant) return null
  if (!item.variant && p.has_variations && variants.length > 1) {
    return {
      needsVariation: {
        product: p.name,
        options: variants.map((v: any) => ({ productId: `shopify:${id}:${v.id}`, name: String(v.title || `Option ${v.id}`), inStock: !!v.available, price: priceNum(v.price) })),
      },
    }
  }
  const vid = item.variant ? variantId : null
  const s = shopifyItemStock(p, vid)
  return {
    product: {
      source: 'shopify', wooProductId: null, shopifyProductId: id, shopifyVariantId: vid,
      name: item.name, image: item.image, url: item.url, stockStatus: s.stock_status, stockQty: s.stock_quantity, price: s.price,
    },
  }
}

// Significant words, for "does this id look like what they asked for?".
const words = (s: string) => new Set((String(s || '').toLowerCase().normalize('NFKD').match(/[a-z0-9]{3,}/g) || []).filter(w => !STOP.has(w)).map(stem))

const STOP = new Set(['the', 'and', 'for', 'with', 'when', 'back', 'stock', 'please', 'any', 'some', 'let', 'know', 'comes', 'come', 'have', 'got'])
const stem = (w: string) => w.replace(/ies$/, 'y').replace(/([^s])s$/, '$1')

/**
 * Products whose names share words with what was asked, best first — the close
 * matches someone can choose from. Both catalogues, live (not archived/draft).
 */
export async function catalogueMatches(db: any, companyId: string, asked: string, limit = 5): Promise<any[]> {
  const words = Array.from(new Set((String(asked).toLowerCase().normalize('NFKD').match(/[a-z0-9]{3,}/g) || []).filter(w => !STOP.has(w)).map(stem))).slice(0, 8)
  if (!words.length) return []
  const ors = words.map(w => `name.ilike.%${w.replace(/[%,()]/g, '')}%`).join(',')
  const [{ data: woo }, { data: shop }] = await Promise.all([
    db.from('woocommerce_products').select('woo_product_id, name, price, sale_price, on_sale, stock_status, stock_quantity').eq('company_id', companyId).or(ors).limit(100),
    db.from('shopify_products').select('shopify_product_id, name, price, stock_status, stock_quantity, status').eq('company_id', companyId).or(ors).limit(100),
  ]).catch(() => [{ data: [] }, { data: [] }])
  const target = normName(asked)
  return [...(woo || []), ...(shop || []).filter((p: any) => p.status !== 'ARCHIVED' && p.status !== 'DRAFT')]
    .map((p: any) => {
      const name = String(p.name || '').toLowerCase()
      return { ...p, score: words.filter(w => name.includes(w)).length + (normName(p.name) === target ? 100 : 0) }
    })
    .filter((p: any) => p.score > 0)
    .sort((a: any, b: any) => b.score - a.score || String(a.name).length - String(b.name).length)
    .slice(0, limit)
}

/**
 * The catalogue product a customer means. By id (from check_stock or a close
 * match; a size/option id, or a product id plus variantId), or by name — a name
 * only resolves when exactly one product has that name. A product with options
 * needs one chosen. Anything else returns the close matches to choose from.
 */
export async function resolveWaitlistProduct(db: any, companyId: string, q: { productId?: any; variantId?: any; name?: any }): Promise<ResolveResult> {
  // "shopify:<product>[:<variant>]" (as close matches list them), or a WooCommerce id.
  const rawId = String(q.productId ?? '').trim()
  const isShopify = /^shopify/i.test(rawId)
  const [idPart, variantPart] = rawId.replace(/^(woo|shopify)[:#-]?/i, '').split(':')
  const id = num(idPart)
  const variantId = num(variantPart) || num(q.variantId)
  const name = String(q.name || '').trim()
  const found: any[] = name ? await catalogueMatches(db, companyId, name).catch(() => []) : []
  const matches: ProductMatch[] = found.map((p: any) => ({
    productId: p.woo_product_id ? String(p.woo_product_id) : `shopify:${p.shopify_product_id}`,
    name: p.name,
    inStock: p.stock_status ? isInStock({ stockStatus: p.stock_status, stockQty: p.stock_quantity ?? null }) : null,
    price: priceNum(p.on_sale ? p.sale_price : p.price) ?? priceNum(p.price),
  }))
  const settle = (r: ById): ResolveResult | null => {
    if (!r) return null
    if ('needsVariation' in r) return { ok: false, reason: 'needs_variation', product: r.needsVariation.product, options: r.needsVariation.options, matches }
    return { ok: true, product: r.product }
  }
  if (id) {
    const r = (!isShopify ? await wooById(db, companyId, id, variantId) : null) || await shopifyById(db, companyId, id, variantId)
    if (r) {
      // An id that names something else than what was asked — no word in common, or the
      // name is exactly another product's — don't trust it: ask.
      const pname = 'product' in r ? r.product.name : r.needsVariation.product
      const asked = words(name)
      const other = name && found.some((p: any) => normName(p.name) === normName(name) && !normName(pname).startsWith(normName(p.name)))
      if (other || (asked.size && ![...words(pname)].some(w => asked.has(w)))) return { ok: false, reason: 'mismatch', matches, idName: pname }
      return settle(r)!
    }
  }
  if (!id && name) {
    const exact = found.filter((p: any) => normName(p.name) === normName(name))
    if (exact.length === 1) {
      const e = exact[0]
      const r = settle(e.woo_product_id ? await wooById(db, companyId, Number(e.woo_product_id), variantId) : await shopifyById(db, companyId, Number(e.shopify_product_id), variantId))
      if (r) return r
    }
  }
  return { ok: false, reason: id ? 'not_found' : 'no_match', matches }
}

/** The words for a product that couldn't be resolved — shared by the agents and Colvy AI. */
export function unresolvedText(r: Exclude<ResolveResult, { ok: true }>, asked: string, fmt: (m: ProductMatch) => string): string {
  const list = (ms: ProductMatch[]) => ms.slice(0, 12).map(fmt).join('; ')
  if (r.reason === 'needs_variation') {
    return `${r.product} comes in different options, and stock is per option${r.options.length ? `: ${list(r.options)}` : ' (couldn’t load them from the store)'}. Ask which one they want, then use that option’s productId.`
  }
  const head = r.reason === 'mismatch' ? `That productId is “${r.idName}”, which doesn’t look like “${asked}”.`
    : r.reason === 'not_found' ? 'That productId isn’t in the catalogue.'
      : `No catalogue product clearly matches “${asked}”.`
  return `${head} ${r.matches.length ? `Closest: ${list(r.matches)}.` : 'Nothing close either.'}`
}

export type AddInput = {
  companyId: string
  product: WaitlistProduct
  contactId?: string | null
  conversationId?: string | null
  customerName?: string | null
  phone?: string | null
  email?: string | null
  note?: string | null
  source: 'ai_agent' | 'colvy_ai'
  addedBy: string
  agentRunId?: string | null
  createdBy?: string | null           // the team member who asked (Colvy AI)
  siteOrigin?: string
  exact?: boolean                     // only phone/email as given (see waitlistRecipient)
}

export type AddResult =
  | { ok: true; added: true; entry: any; notifyBy: 'sms' | 'email'; smsOptedOut: boolean; customerName: string | null }
  | { ok: true; added: false; duplicate: true; entry: any; customerName: string | null }
  | { ok: false; error: string; code: 'blocked' | 'opted_out' | 'no_contact' | 'failed' }

const isMissingTable = (e: any) => /does not exist|schema cache|PGRST205/i.test(String(e?.message || e || ''))
const firstName = (n?: string | null) => String(n || '').trim().split(/\s+/)[0] || ''

/** Who to tell, after the opt-out checks. Shared with validation before an approval. */
export async function waitlistRecipient(db: any, companyId: string, i: { contactId?: string | null; conversationId?: string | null; customerName?: string | null; phone?: string | null; email?: string | null; exact?: boolean }) {
  let contact: any = null
  if (i.contactId) {
    const { data } = await db.from('contacts').select('id, name, phone, email, is_blocked').eq('company_id', companyId).eq('id', i.contactId).maybeSingle()
    contact = data
  }
  let smsNumber: string | null = null
  // exact: only the number/email given (a website chat's own opted-in number) — never the contact's saved ones.
  if (i.exact) contact = contact ? { ...contact, phone: null, email: null } : null
  if (!i.exact && !contact?.phone && !i.phone && i.conversationId) {
    const { data: cv } = await db.from('conversations').select('sms_number').eq('company_id', companyId).eq('id', i.conversationId).maybeSingle()
    smsNumber = cv?.sms_number || null
  }
  const name = String(i.customerName || contact?.name || '').trim() || null
  const rawPhone = String(i.phone || contact?.phone || smsNumber || '').trim()
  let phone = rawPhone && phoneKey(rawPhone).length >= 8 ? toE164(rawPhone) : null
  const email = emailKey(i.email || contact?.email) ? String(i.email || contact?.email).trim().toLowerCase() : null
  const who = name || phone || email || 'This customer'
  if (contact?.is_blocked) return { ok: false as const, code: 'blocked' as const, error: `${who} is blocked, so they weren’t added to the waiting list.` }
  let smsOptedOut = false
  if (phone) {
    const { state, contacts } = await textOptOut(db, companyId, phone, contact?.id || null)
    // Anyone with that number blocked (a typed number too): not added at all, not even by email.
    if ((contacts || []).some((c: any) => c.is_blocked)) return { ok: false as const, code: 'blocked' as const, error: `${who} is blocked, so they weren’t added to the waiting list.` }
    // Couldn't read their opt-out state: try again later rather than quietly dropping their number.
    if (state === 'unknown') return { ok: false as const, code: 'failed' as const, error: `Couldn’t check whether ${who} opted out of texts just now, so they weren’t added yet. Try again in a moment.` }
    if (state === 'opted_out') {
      if (!email) return { ok: false as const, code: 'opted_out' as const, error: `${who} has opted out of texts (replied STOP) and there’s no email on file, so they can’t be told when it’s back. Not added to the waiting list.` }
      phone = null; smsOptedOut = true
    }
  }
  if (!phone && !email) return { ok: false as const, code: 'no_contact' as const, error: `There’s no mobile number or email for ${who}, so they can’t be told when it’s back.` }
  return { ok: true as const, contact, name, phone, email, smsOptedOut }
}

/** Their open entry for this item, if they're already waiting. */
async function findOpenEntry(db: any, companyId: string, product: WaitlistProduct, who: { contactId: string | null; phone: string | null; email: string | null }) {
  let q = db.from('stock_waitlist').select('*').eq('company_id', companyId).in('status', ['waiting', 'queued'])
  if (product.wooProductId) q = q.eq('woo_product_id', product.wooProductId)
  else if (product.shopifyVariantId) q = q.eq('shopify_variant_id', product.shopifyVariantId)
  else q = q.eq('shopify_product_id', product.shopifyProductId).is('shopify_variant_id', null)
  const { data } = await q.limit(500)
  const key = phoneKey(who.phone)
  return (data || []).find((e: any) =>
    (who.contactId && e.contact_id === who.contactId)
    || (key.length >= 8 && phoneKey(e.phone) === key)
    || (who.email && String(e.email || '').toLowerCase() === who.email)) || null
}

export async function addToWaitlist(db: any, i: AddInput): Promise<AddResult> {
  const { companyId, product } = i
  let conversationId = i.conversationId || null
  if (conversationId) {
    const { data: cv } = await db.from('conversations').select('id').eq('company_id', companyId).eq('id', conversationId).maybeSingle()
    if (!cv) conversationId = null
  }
  const r = await waitlistRecipient(db, companyId, { ...i, conversationId })
  if ('error' in r) return { ok: false, code: r.code, error: r.error }
  const contactId = r.contact?.id || null

  const existing = await findOpenEntry(db, companyId, product, { contactId, phone: r.phone, email: r.email })
  if (existing) return { ok: true, added: false, duplicate: true, entry: existing, customerName: r.name }

  const row: Record<string, any> = {
    company_id: companyId, contact_id: contactId, conversation_id: conversationId,
    woo_product_id: product.wooProductId,
    ...(product.shopifyProductId ? { shopify_product_id: product.shopifyProductId, shopify_variant_id: product.shopifyVariantId } : {}),
    item_name: String(product.name).slice(0, 200), item_image: product.image, item_url: product.url,
    customer_name: r.name, phone: r.phone, email: r.email,
    note: i.note ? String(i.note).trim().slice(0, 500) || null : null,
    status: 'waiting', source: i.source, created_by: i.createdBy || null,
    agent_run_id: i.agentRunId || null, added_by: i.addedBy,
  }
  let res = await db.from('stock_waitlist').insert(row).select('*').maybeSingle()
  // Before V385: no agent_run_id / added_by yet. Still add them (the source says it was AI).
  if (res.error && /agent_run_id|added_by/.test(String(res.error.message || ''))) {
    const rest = { ...row }
    delete rest.agent_run_id; delete rest.added_by
    res = await db.from('stock_waitlist').insert(rest).select('*').maybeSingle()
  }
  if (res.error) {
    if (res.error.code === '23505') {
      const dup = await findOpenEntry(db, companyId, product, { contactId, phone: r.phone, email: r.email })
      return { ok: true, added: false, duplicate: true, entry: dup, customerName: r.name }
    }
    return { ok: false, code: 'failed', error: isMissingTable(res.error) ? 'Waitlists aren’t set up for this business yet.' : (res.error.message || 'Couldn’t add them to the waiting list.') }
  }
  const entry = res.data
  const notifyBy: 'sms' | 'email' = r.phone ? 'sms' : 'email'

  // A staff-only note in their conversation: who added them, and where to see it.
  if (conversationId && entry?.id) {
    const origin = String(i.siteOrigin || process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').replace(/\/$/, '')
    const href = waitlistEntryHref(entry.id)
    const who = firstName(r.name) || r.phone || r.email || 'the customer'
    try {
      await db.from('messages').insert({
        conversation_id: conversationId, company_id: companyId, sender_type: 'system', sender_name: i.addedBy, is_internal: true,
        content: `${i.addedBy} added ${who} to the waitlist for ${product.name}. They’ll get ${notifyBy === 'sms' ? 'a text' : 'an email'} when it’s back in stock${r.smsOptedOut ? ' (they opted out of texts)' : ''}.\n${origin}${href}`,
        metadata: { internal: true, waitlist: true, waitlist_ai: true, waitlist_id: entry.id, waitlist_href: href, added_by: i.addedBy, agent_run_id: i.agentRunId || null, item_name: product.name, notify_by: notifyBy },
      })
    } catch {}
  }
  return { ok: true, added: true, entry, notifyBy, smsOptedOut: r.smsOptedOut, customerName: r.name }
}

/** Link an entry to the run that recorded it (Colvy AI records after acting). */
export async function linkWaitlistRun(db: any, companyId: string, entryId: string | null | undefined, runId: string | null | undefined, addedBy?: string | null) {
  if (!entryId || !runId) return
  try {
    // Only an AI-added entry that isn't linked yet: never relabel one a person or another run added.
    const { data: linked, error } = await db.from('stock_waitlist').update({ agent_run_id: runId, ...(addedBy ? { added_by: addedBy } : {}) })
      .eq('company_id', companyId).eq('id', entryId).in('source', ['ai_agent', 'colvy_ai']).is('agent_run_id', null).select('id')
    if (error || !linked?.length) return
    const { data: notes } = await db.from('messages').select('id, metadata').eq('company_id', companyId).contains('metadata', { waitlist_id: entryId, waitlist_ai: true }).limit(5)
    for (const m of notes || []) {
      await db.from('messages').update({ metadata: { ...(m.metadata || {}), agent_run_id: runId, ...(addedBy ? { added_by: addedBy } : {}) } }).eq('id', m.id)
    }
  } catch {}
}
