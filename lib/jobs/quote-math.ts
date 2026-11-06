// Quote maths for Jobs & Services: line totals, the quote discount, Australian
// GST and the deposit, all in integer cents so nothing drifts by a cent.
// Pure (no database), used by the editor for the live totals and by the API,
// which recomputes on every save and never trusts totals sent by a browser.

export const LINE_KINDS = ['labour', 'material', 'travel', 'fee', 'other'] as const
export type LineKind = typeof LINE_KINDS[number]
export const LINE_KIND_LABEL: Record<LineKind, string> = { labour: 'Labour', material: 'Materials', travel: 'Travel', fee: 'Fee', other: 'Other' }

export type QuoteLine = {
  id: string
  kind: LineKind
  description: string
  quantity: number
  unit: string
  unit_price_cents: number
  taxable: boolean
}
export type Discount = { type: 'none' | 'fixed' | 'percent'; value: number }
export type Deposit = { type: 'none' | 'fixed' | 'percent'; value: number }

export type QuoteTotals = {
  lines: (QuoteLine & { line_total_cents: number })[]
  gross_cents: number          // all lines, before the discount
  discount_cents: number
  taxable_cents: number        // the GST-bearing part, after its share of the discount
  subtotal_cents: number       // excluding GST, after the discount
  tax_cents: number
  total_cents: number          // what the customer pays
  deposit_cents: number
}

export const MAX_LINES = 100
const MAX_QTY = 100_000
const MAX_UNIT_CENTS = 100_000_000   // $1,000,000 a unit
const MAX_DESC = 300

/** Round half away from zero (so 0.5c becomes 1c, and -0.5c becomes -1c). */
export const roundCents = (n: number) => (n < 0 ? -Math.round(-n) : Math.round(n))

const num = (v: any, d = 0) => { const n = typeof v === 'string' ? Number(v.replace(/[^0-9.\-]/g, '')) : Number(v); return Number.isFinite(n) ? n : d }
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** One line from anything (an editor row, a template, a price-list item), tidied and bounded. */
export function cleanLine(raw: any, i = 0): QuoteLine {
  const kind = (LINE_KINDS as readonly string[]).includes(raw?.kind) ? raw.kind as LineKind : 'other'
  const qty = Math.round(clamp(num(raw?.quantity, 1), 0, MAX_QTY) * 1000) / 1000
  const price = Math.round(clamp(num(raw?.unit_price_cents, 0), 0, MAX_UNIT_CENTS))
  return {
    id: String(raw?.id || `l${i + 1}`).slice(0, 40),
    kind,
    description: String(raw?.description ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_DESC),
    quantity: qty,
    unit: String(raw?.unit ?? 'each').trim().slice(0, 20) || 'each',
    unit_price_cents: price,
    taxable: raw?.taxable !== false,
  }
}

/** The quote's lines, tidied: at most MAX_LINES, empty rows (no description and no price) dropped. */
export function cleanLines(raw: any): QuoteLine[] {
  const list = Array.isArray(raw) ? raw : []
  return list.slice(0, MAX_LINES).map(cleanLine).filter(l => l.description || l.unit_price_cents > 0)
}

export function cleanDiscount(raw: any): Discount {
  const type = raw?.type === 'fixed' || raw?.type === 'percent' ? raw.type : 'none'
  if (type === 'none') return { type, value: 0 }
  const v = num(raw?.value, 0)
  return { type, value: type === 'percent' ? clamp(Math.round(v * 100) / 100, 0, 100) : Math.round(clamp(v, 0, 1e10)) }
}

export function cleanDeposit(raw: any): Deposit {
  const type = raw?.type === 'fixed' || raw?.type === 'percent' ? raw.type : 'none'
  if (type === 'none') return { type, value: 0 }
  const v = num(raw?.value, 0)
  return { type, value: type === 'percent' ? clamp(Math.round(v * 100) / 100, 0, 100) : Math.round(clamp(v, 0, 1e10)) }
}

/**
 * The totals. Fixed discounts and deposits are in cents; percentages are 0-100.
 *
 * - Prices excluding GST: GST is added on top of the GST-bearing lines.
 * - Prices including GST: GST is the 1/11th (at 10%) already inside them.
 * - The discount comes off before GST, shared between GST and GST-free lines
 *   in proportion to their value, so GST-free items never carry GST.
 * - taxRate 0 means not registered for GST: no GST at all.
 */
export function computeQuote(input: { lines: any; discount?: any; deposit?: any; pricesIncludeTax?: boolean; taxRate?: number }): QuoteTotals {
  const lines = cleanLines(input.lines).map(l => ({ ...l, line_total_cents: roundCents(l.quantity * l.unit_price_cents) }))
  const rate = clamp(num(input.taxRate, 10), 0, 100)
  const gross = lines.reduce((s, l) => s + l.line_total_cents, 0)
  const taxableGross = lines.filter(l => l.taxable).reduce((s, l) => s + l.line_total_cents, 0)

  const d = cleanDiscount(input.discount)
  const discount = d.type === 'fixed' ? Math.min(d.value, gross) : d.type === 'percent' ? roundCents(gross * d.value / 100) : 0
  const taxableDiscount = gross > 0 ? roundCents(discount * taxableGross / gross) : 0
  const taxable = Math.max(0, taxableGross - taxableDiscount)
  const afterDiscount = gross - discount

  let tax = 0, subtotal = 0, total = 0
  if (input.pricesIncludeTax) {
    total = afterDiscount
    tax = rate > 0 ? roundCents(taxable * rate / (100 + rate)) : 0
    subtotal = total - tax
  } else {
    subtotal = afterDiscount
    tax = rate > 0 ? roundCents(taxable * rate / 100) : 0
    total = subtotal + tax
  }

  const dep = cleanDeposit(input.deposit)
  const deposit = dep.type === 'fixed' ? Math.min(dep.value, total) : dep.type === 'percent' ? roundCents(total * dep.value / 100) : 0

  return {
    lines,
    gross_cents: gross,
    discount_cents: discount,
    taxable_cents: input.pricesIncludeTax ? taxable - tax : taxable,
    subtotal_cents: subtotal,
    tax_cents: tax,
    total_cents: total,
    deposit_cents: Math.max(0, deposit),
  }
}

/** $1,234.50 */
export function fmtMoney(cents: number | null | undefined, currency = 'AUD'): string {
  const n = Number(cents || 0) / 100
  try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n) }
  catch { return `$${n.toFixed(2)}` }
}

/** "12.50" from cents, for an input box. */
export const centsToInput = (cents: number) => (Number(cents || 0) / 100).toFixed(2)
/** Cents from what someone typed ("$1,250.5" → 125050). */
export const inputToCents = (s: string) => Math.max(0, Math.round(num(s, 0) * 100))
