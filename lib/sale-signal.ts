// "Record this as a Colvy sale?" — when to ask, and what to fill in.
//
// Colvy credits a sale to the team when Colvy was how it happened: the
// customer chatted or rang the business through Colvy, then paid (often off
// the books for Colvy: a bank transfer for a quote rung up in the shop system).
// Website orders and walk-in shop sales aren't Colvy sales and never ask.
//
// Two triggers, from the conversation alone (pure, no network, tested in
// scripts/sale-signal.test.mjs):
//   • claim  — the customer says they've paid ("Payment is now made", "done the
//              bank transfer", "sent the funds"), or the team thanks them for
//              it. Questions and promises ("how do I pay?", "I'll transfer it
//              tomorrow") don't count.
//   • pos    — an in-store (Prexty POS) sale lands in a conversation where the
//              customer chatted or called in the two weeks before it.
// Either is skipped once a sale has been recorded after it. What's offered:
// the amount (the in-store sale's, else the last amount the team quoted), how
// they paid (from what they said) and a note naming the receipt.

export type SaleMsg = {
  id: string
  sender_type: string
  content?: string | null
  created_at: string
  is_internal?: boolean | null
  is_ai?: boolean | null
  metadata?: any
}

export type SaleSuggestion = {
  reason: 'claim' | 'pos' | 'both'
  /** The message the prompt is about (dismissing it is per message). */
  messageId: string
  at: string
  amount: number | null
  method: string | null
  note: string | null
  /** One plain line: "Hamid says the payment is made (bank transfer)." */
  summary: string
}

const DAY = 86_400_000

const norm = (s: any) => String(s || '').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[ \t]+/g, ' ').trim()

// "how do I pay", "can I transfer", "I'll pay tomorrow", "haven't paid yet",
// "once I've paid", "do you take bank transfer?" — not a payment.
const NOT_YET = /\b(how|can|could|may|where|when|should|shall|would|do (i|we|you)|does|will|i'?ll|we'?ll|going to|gonna|want to|wanna|need to|have to|haven'?t|have not|hasn'?t|not yet|didn'?t|did not|yet to|before (i|we)|once (i|we)|after (i|we)|if (i|we)|until|unable|can'?t|cannot|couldn'?t|trying to|tried to|about to|planning)\b[^.!\n]{0,40}\b(pay|paid|payment|transfer|deposit|send|sent)/

const DONE: RegExp[] = [
  // "I've paid", "just paid", "already transferred", "we have sent the money"
  /\b(i'?ve|i have|we'?ve|we have|i|we|just|already|now|finally)\s+(just\s+|now\s+|already\s+|finally\s+)?(paid|transferred|deposited|sent (the |you |over |through )?(money|funds|payment|deposit|transfer|it))\b/,
  // "payment is now made", "payment has been sent", "payment done", "payment's gone through"
  /\bpayment('?s|\s+is|\s+has\s+been|\s+has|\s+was|\s+have\s+been)?\s+(now\s+|just\s+|already\s+)?(made|done|sent|completed?|processed|gone through|through|transferred|paid)\b/,
  // "made the payment", "did the bank transfer", "done a transfer"
  /\b(made|sent|done|did|completed|processed)\s+(the\s+|a\s+|my\s+|our\s+|that\s+|over\s+the\s+)?(full\s+)?(payment|transfer|bank transfer|deposit|eft|payid|osko|funds|money)\b/,
  // "transfer is done", "deposit has gone through"
  /\b(transfer|bank transfer|deposit|eft|payid|osko)\s+(is\s+|has\s+been\s+|was\s+|'?s\s+)?(now\s+|just\s+)?(done|made|sent|completed?|through|gone through)\b/,
  // "paid in full", "all paid", "paid via bank transfer", "paid it"
  /\b(paid in full|all paid|paid (it|now|today|via|by|with|through|the (invoice|balance|deposit|quote|bill|rest)))\b/,
  // a receipt sent over
  /\b(receipt|remittance|proof of (payment|transfer))\s+(is\s+)?(attached|sent|uploaded|below|here)\b|\b(attached|here is|here's|sent|uploaded) (the |my |a )?(receipt|remittance|proof of (payment|transfer))\b/,
]

// The team saying thanks for it counts too.
const THANKED = /\bthanks? (you )?(so much )?for (the|your) (payment|transfer|deposit)\b|\bpayment (received|has arrived|came through)\b/

/** Does this customer message say they've paid? Returns how, when it says. */
export function paymentClaim(text: string | null | undefined): { method: string | null } | null {
  const t = norm(text)
  if (!t || t.length > 2000) return null
  const sentences = t.split(/(?<=[.!?])\s+|\n+/).map(x => x.trim()).filter(Boolean)
  const hit = sentences.some(s => !NOT_YET.test(s) && !/\?\s*$/.test(s) && DONE.some(re => re.test(s)))
  if (!hit) return null
  return { method: methodIn(t) }
}

/** "Bank transfer" | "Cash" | "Card" | "PayPal" | "Afterpay"… from the words used. */
export function methodIn(text: string | null | undefined): string | null {
  const t = norm(text)
  if (/\b(bank transfer|transfer(red)?|eft|direct (deposit|credit)|bsb|payid|pay id|osko|deposited|internet banking|netbank|online banking)\b/.test(t)) return 'Bank transfer'
  if (/\bpaypal\b/.test(t)) return 'PayPal'
  if (/\bafterpay\b/.test(t)) return 'Afterpay'
  if (/\bzip ?(pay|money)?\b/.test(t)) return 'Zip'
  if (/\b(cash)\b/.test(t)) return 'Cash'
  if (/\b(card|credit card|debit card|visa|mastercard|amex|tap(ped)?)\b/.test(t)) return 'Card'
  return null
}

const isPosSale = (m: SaleMsg) => {
  const md = m.metadata || {}
  if (!(md.order_event || md.prexty_order)) return false
  const status = String(md.status || '').toLowerCase()
  if (['refunded', 'cancelled', 'failed'].includes(status)) return false
  return md.pos === 'prexty' || !!md.prexty_order || !!md.pos_sale_id
}

/** "$2,295.00" → 2295. The last amount in the text. */
export function amountIn(text: string | null | undefined): number | null {
  const all = Array.from(String(text || '').matchAll(/\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g))
  if (!all.length) return null
  const n = parseFloat(all[all.length - 1][1].replace(/,/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

const firstName = (n?: string | null) => String(n || '').trim().split(/\s+/)[0] || 'The customer'
const ms = (iso: string) => Date.parse(iso) || 0

/**
 * The prompt to show for this conversation, or null. `lastSaleAt`: the newest
 * sale recorded for it (conversation_sales), so a sale already logged after the
 * trigger never asks again.
 */
export function suggestSale(messages: SaleMsg[], opts: { now?: number; lastSaleAt?: string | null; contactName?: string | null } = {}): SaleSuggestion | null {
  const now = opts.now ?? Date.now()
  const list = (messages || []).filter(m => m && !m.is_internal).slice().sort((a, b) => ms(a.created_at) - ms(b.created_at))
  // A sale logged in the thread counts as recorded, too (the pill lands before the list reloads).
  const saleMsgAt = Math.max(0, ...list.filter(m => m.metadata?.sale_event).map(m => ms(m.created_at)))
  const recordedAt = Math.max(ms(opts.lastSaleAt || ''), saleMsgAt)
  const fresh = (m: SaleMsg) => ms(m.created_at) > recordedAt && now - ms(m.created_at) <= 7 * DAY

  // The customer saying they've paid (or the team thanking them for it).
  let claim: SaleMsg | null = null, claimMethod: string | null = null
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i]
    if (!fresh(m)) continue
    if (m.sender_type === 'visitor') { const c = paymentClaim(m.content); if (c) { claim = m; claimMethod = c.method; break } }
    else if (m.sender_type === 'agent' && !m.is_ai && THANKED.test(norm(m.content))) { claim = m; claimMethod = methodIn(m.content); break }
  }

  // An in-store sale after they'd been in touch through Colvy (a message or a call).
  let pos: SaleMsg | null = null
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i]
    if (!fresh(m) || !isPosSale(m)) continue
    const at = ms(m.created_at)
    const touched = list.some(x => {
      const t = ms(x.created_at)
      return t < at && at - t <= 14 * DAY && (x.sender_type === 'visitor' || (x.metadata?.call_event && x.metadata?.call_id))
    })
    if (touched) { pos = m; break }
  }
  if (!claim && !pos) return null

  // The amount: the in-store sale's (near the claim), else the last one the team quoted before the claim.
  const posNear = pos || (claim ? list.filter(m => isPosSale(m) && Math.abs(ms(m.created_at) - ms(claim!.created_at)) <= 7 * DAY && ms(m.created_at) > recordedAt).pop() || null : null)
  let amount: number | null = null
  if (posNear) amount = Number(posNear.metadata?.amount) > 0 ? Number(posNear.metadata.amount) : amountIn(posNear.content)
  if (amount == null && claim) {
    amount = amountIn(claim.content)
    if (amount == null) {
      const before = list.filter(m => ms(m.created_at) <= ms(claim!.created_at) && m.sender_type === 'agent' && !m.is_internal).slice(-6).reverse()
      for (const m of before) { const a = amountIn(m.content); if (a != null) { amount = a; break } }
    }
  }
  const md = posNear?.metadata || {}
  const orderNo = md.order_number || (String(posNear?.content || '').match(/#\s*([\w-]+)/) || [])[1] || ''
  const note = posNear ? [md.pos_sale_id ? `Prexty receipt ${md.pos_sale_id}` : 'Prexty sale', orderNo ? `order #${orderNo}` : ''].filter(Boolean).join(' · ') : null
  // Not said? The team's own messages before it often are: "bank details are on the quote", a BSB, a PayID.
  let method = claimMethod
  if (!method && claim) {
    const before = list.filter(m => ms(m.created_at) <= ms(claim!.created_at) && m.sender_type === 'agent' && now - ms(m.created_at) <= 14 * DAY).slice(-8)
    if (before.some(m => /\b(bank details|account (number|details)|bsb|acc(oun)?t? no|payid|pay id|osko|direct deposit|transfer)\b/i.test(String(m.content || '')))) method = 'Bank transfer'
  }
  const who = firstName(opts.contactName)
  const trig = claim && pos ? (ms(claim.created_at) >= ms(pos.created_at) ? claim : pos) : (claim || pos)!
  const summary = claim
    ? `${who} says ${claim.sender_type === 'visitor' ? 'they’ve paid' : 'the payment came through'}${method ? ` by ${method.toLowerCase()}` : ''}${md.pos_sale_id ? ` for receipt ${md.pos_sale_id}` : ''}.`
    : `${who} bought in store${md.pos_sale_id ? ` (receipt ${md.pos_sale_id})` : ''} after talking to you on Colvy.`
  return { reason: claim && pos ? 'both' : claim ? 'claim' : 'pos', messageId: trig.id, at: trig.created_at, amount, method, note, summary }
}
