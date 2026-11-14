// Class packs and memberships: the rules shared by the server, the booking
// page, the customer account page and the admin screens. Pure: no database.
//
// A pack: N classes for a price, to use within D days (or no expiry).
// A membership: a price every N weeks or months, with unlimited classes or N
// classes in each billing period. Either can cover every class or only some.

export type PassKind = 'pack' | 'membership'
export type PassUnit = 'week' | 'month'
export type PassStatus = 'pending' | 'active' | 'past_due' | 'cancelled' | 'expired'

export type PassProduct = {
  id: string; kind: PassKind; name: string; description: string | null
  price_cents: number; currency: string
  credits: number | null; valid_days: number | null
  every_n: number | null; unit: PassUnit | null
  service_ids: string[]; sell_online: boolean; active: boolean; sort_order: number
}

export type CustomerPass = {
  id: string; kind: PassKind; name: string; status: PassStatus
  service_ids: string[]; credits_total: number | null; credits_used: number
  price_cents: number; currency: string; every_n: number | null; unit: PassUnit | null
  activated_at: string | null; expires_at: string | null
  period_start: string | null; period_end: string | null; cancel_at_period_end: boolean
  cancelled_at?: string | null
}

export const MAX_CREDITS = 1000
const DAY = 86_400_000
/** A membership still works this long after its period ends, while Stripe retries a renewal. */
export const RENEWAL_GRACE_MS = 3 * DAY

export const PASS_PRESETS: { key: string; label: string; every: number; unit: PassUnit }[] = [
  { key: 'weekly', label: 'Every week', every: 1, unit: 'week' },
  { key: 'fortnightly', label: 'Every 2 weeks', every: 2, unit: 'week' },
  { key: 'monthly', label: 'Every month', every: 1, unit: 'month' },
]

const int = (v: any) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : NaN }
const uuids = (a: any) => (Array.isArray(a) ? a : []).filter((x: any) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 100)

/** An admin's form into a pass_products row. Throws a readable message. */
export function cleanProduct(input: any): Omit<PassProduct, 'id'> {
  const kind: PassKind = input?.kind === 'membership' ? 'membership' : 'pack'
  const name = String(input?.name || '').trim().slice(0, 120)
  if (!name) throw new Error('Give it a name, like “10-class pack” or “Unlimited monthly”.')
  const price = Math.round(Number(input?.price_cents))
  if (!Number.isFinite(price) || price < 0) throw new Error('Set a price.')
  if (price > 0 && price < 100) throw new Error('The price has to be at least $1 (or $0 for a free pass).')
  if (price > 10_000_00) throw new Error('That price looks too high. Check it and try again.')
  if (kind === 'membership' && price < 100) throw new Error('A membership needs a price of at least $1: it’s billed by card.')
  let credits: number | null = null
  if (kind === 'pack' || (input?.credits != null && input.credits !== '')) {
    credits = int(input?.credits)
    if (!Number.isFinite(credits) || credits < 1 || credits > MAX_CREDITS) throw new Error(kind === 'pack' ? 'How many classes are in the pack? (1 to 1,000)' : 'Classes each period: 1 to 1,000, or leave it empty for unlimited.')
  }
  let validDays: number | null = null
  if (kind === 'pack' && input?.valid_days != null && input.valid_days !== '') {
    validDays = int(input.valid_days)
    if (!Number.isFinite(validDays) || validDays < 1 || validDays > 3650) throw new Error('Days to use it: 1 to 3,650, or leave it empty for no expiry.')
  }
  let every: number | null = null, unit: PassUnit | null = null
  if (kind === 'membership') {
    unit = input?.unit === 'week' ? 'week' : input?.unit === 'month' ? 'month' : null
    every = int(input?.every_n)
    if (!unit || !Number.isFinite(every) || every < 1 || every > (unit === 'week' ? 4 : 12)) throw new Error('Pick how often it’s billed.')
  }
  return {
    kind, name,
    description: String(input?.description || '').trim().slice(0, 1000) || null,
    price_cents: price,
    currency: /^[a-z]{3}$/i.test(String(input?.currency || '')) ? String(input.currency).toLowerCase() : 'aud',
    credits, valid_days: validDays, every_n: every, unit,
    service_ids: uuids(input?.service_ids),
    sell_online: input?.sell_online !== false,
    active: input?.active !== false,
    sort_order: Math.max(0, Math.min(10000, int(input?.sort_order) || 0)),
  }
}

export function money(cents: number, cur = 'aud'): string {
  const n = (cents || 0) / 100
  try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: cur.toUpperCase(), minimumFractionDigits: n % 1 ? 2 : 0 }).format(n) } catch { return `$${n}` }
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : /(s|x|ch|sh)$/.test(w) ? 'es' : 's'}`

/** "a week", "every 2 weeks", "a month" */
export function billingWords(every: number | null, unit: PassUnit | null): string {
  if (!unit) return ''
  const n = every || 1
  return n === 1 ? `a ${unit}` : `every ${n} ${unit}s`
}

/** What it gives: "10 classes", "Unlimited classes", "8 classes a month" */
export function creditsWords(p: { kind: PassKind; credits?: number | null; credits_total?: number | null; every_n: number | null; unit: PassUnit | null }): string {
  const c = p.credits !== undefined ? p.credits : p.credits_total
  if (p.kind === 'pack') return plural(c || 0, 'class')
  if (c == null) return 'Unlimited classes'
  return `${plural(c, 'class')} ${billingWords(p.every_n, p.unit)}`
}

/** "$150", "$39 a week" */
export function priceWords(p: { kind: PassKind; price_cents: number; currency: string; every_n: number | null; unit: PassUnit | null }): string {
  if (p.price_cents === 0) return 'Free'
  return p.kind === 'membership' ? `${money(p.price_cents, p.currency)} ${billingWords(p.every_n, p.unit)}` : money(p.price_cents, p.currency)
}

/** One line for a product: "10 classes · use within 90 days" / "Unlimited classes · cancel any time" */
export function productTerms(p: PassProduct): string {
  if (p.kind === 'pack') return [creditsWords(p), p.valid_days ? `use within ${p.valid_days % 365 === 0 ? plural(p.valid_days / 365, 'year') : p.valid_days % 7 === 0 && p.valid_days <= 84 ? plural(p.valid_days / 7, 'week') : plural(p.valid_days, 'day')}` : 'no expiry'].join(' · ')
  return [creditsWords(p), 'billed by card', 'cancel any time'].join(' · ')
}

/** Covers this class? Empty list = every class. */
export const coversService = (p: { service_ids: string[] }, serviceId: string) => !p.service_ids?.length || p.service_ids.includes(serviceId)

const daysInMonth = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate()

/** `iso` moved on by n weeks or months (months keep the day, or the month's last day). */
export function addPeriods(iso: string, every: number, unit: PassUnit, n: number): string {
  const t = new Date(iso)
  if (unit === 'week') return new Date(t.getTime() + n * every * 7 * DAY).toISOString()
  const total = t.getUTCMonth() + n * every
  const y = t.getUTCFullYear() + Math.floor(total / 12), m = ((total % 12) + 12) % 12
  const d = Math.min(t.getUTCDate(), daysInMonth(y, m))
  return new Date(Date.UTC(y, m, d, t.getUTCHours(), t.getUTCMinutes(), t.getUTCSeconds())).toISOString()
}

/**
 * The billing period a class at `atMs` falls in, counting from the current
 * period's start: the window a limited membership's classes are counted in.
 */
export function periodWindow(p: { period_start: string | null; period_end: string | null; every_n: number | null; unit: PassUnit | null }, atMs: number): { from: string; to: string } | null {
  if (!p.period_start || !p.unit) return null
  const every = p.every_n || 1
  let k = 0
  // Walk forward (or back) from the current period to the one holding atMs.
  for (let i = 0; i < 600; i++) {
    const from = addPeriods(p.period_start, every, p.unit, k), to = addPeriods(p.period_start, every, p.unit, k + 1)
    if (atMs < Date.parse(from)) { k--; continue }
    if (atMs >= Date.parse(to)) { k++; continue }
    return { from, to }
  }
  return null
}

export type PassState = {
  usable: boolean
  /** Why not, in words for the customer (or the team). */
  reason: string | null
  /** Classes left: a pack's; a limited membership's this period; null = unlimited. */
  left: number | null
  /** "6 of 10 left", "Unlimited", "3 of 8 left this month" */
  label: string
  /** "Expires 3 March", "Renews 1 March", "Ends 1 March" */
  when: string | null
}

const dayWords = (iso: string, tz?: string) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', ...(tz ? { timeZone: tz } : {}) })

/**
 * Where a pass stands now. `usedInPeriod`: a limited membership's classes in
 * the current period (from pass_uses). Doesn't look at any particular class:
 * `canBook` does that.
 */
export function passState(p: CustomerPass, now = Date.now(), usedInPeriod = 0, tz?: string): PassState {
  const when = p.kind === 'pack'
    ? (p.expires_at ? `${Date.parse(p.expires_at) < now ? 'Expired' : 'Expires'} ${dayWords(p.expires_at, tz)}` : null)
    : p.status === 'cancelled' ? ((p.cancelled_at || p.period_end) ? `Ended ${dayWords((p.cancelled_at || p.period_end)!, tz)}` : null)
    : (p.period_end ? `${p.cancel_at_period_end ? 'Ends' : 'Renews'} ${dayWords(p.period_end, tz)}` : null)
  const base = { when }
  if (p.status === 'pending') return { ...base, usable: false, reason: 'Waiting for payment.', left: null, label: 'Not paid yet' }
  if (p.status === 'cancelled') return { ...base, usable: false, reason: 'This membership has been cancelled.', left: null, label: 'Cancelled' }
  if (p.status === 'past_due') return { ...base, usable: false, reason: 'The last payment didn’t go through. Update your card or contact us.', left: null, label: 'Payment failed' }
  if (p.status === 'expired' || (p.kind === 'pack' && p.expires_at && Date.parse(p.expires_at) < now)) return { ...base, usable: false, reason: 'This pass has expired.', left: 0, label: 'Expired' }
  if (p.kind === 'pack') {
    const total = p.credits_total || 0, left = Math.max(0, total - p.credits_used)
    return { ...base, usable: left > 0, reason: left > 0 ? null : 'All the classes in this pack have been used.', left, label: left > 0 ? `${left} of ${total} left` : 'Used up' }
  }
  if (p.period_end && Date.parse(p.period_end) + RENEWAL_GRACE_MS < now) {
    return { ...base, usable: false, reason: p.cancel_at_period_end ? 'This membership has ended.' : 'This membership hasn’t renewed yet. Contact us if that’s a surprise.', left: null, label: p.cancel_at_period_end ? 'Ended' : 'Not renewed' }
  }
  if (p.credits_total == null) return { ...base, usable: true, reason: null, left: null, label: 'Unlimited classes' }
  const left = Math.max(0, p.credits_total - usedInPeriod)
  return { ...base, usable: true, reason: null, left, label: `${left} of ${p.credits_total} left this ${p.unit === 'week' && (p.every_n || 1) === 1 ? 'week' : p.unit === 'month' && (p.every_n || 1) === 1 ? 'month' : 'period'}` }
}

/**
 * Can this pass pay for this class? `usedInWindow`: a limited membership's
 * classes in the period the class falls in. The database (colvy_pass_use)
 * checks again under a lock; this is for showing the choice and a clear reason.
 */
export function canBook(p: CustomerPass, serviceId: string, classAtMs: number, now = Date.now(), usedInWindow = 0): { ok: true } | { ok: false; reason: string } {
  const s = passState(p, now, usedInWindow)
  if (!coversService(p, serviceId)) return { ok: false, reason: `Your ${p.name} doesn’t cover this class.` }
  if (p.kind === 'pack') {
    if (!s.usable) return { ok: false, reason: s.reason || 'This pass can’t be used.' }
    if (p.expires_at && classAtMs > Date.parse(p.expires_at)) return { ok: false, reason: `Your ${p.name} expires before this class.` }
    return { ok: true }
  }
  if (!['active'].includes(p.status) || (!s.usable && s.reason)) return { ok: false, reason: s.reason || 'This membership can’t be used.' }
  if (p.cancel_at_period_end && p.period_end && classAtMs >= Date.parse(p.period_end)) return { ok: false, reason: `Your membership ends before this class.` }
  if (p.credits_total != null && usedInWindow >= p.credits_total) return { ok: false, reason: `You’ve booked all ${p.credits_total} classes for that ${p.unit === 'week' ? 'week' : 'period'}.` }
  return { ok: true }
}

/** The RPC's refusal in words. */
export function useRefusal(reason: string | undefined, name: string): string {
  switch (reason) {
    case 'none_left': return `There are no classes left on your ${name}.`
    case 'expires_first': return `Your ${name} expires before this class.`
    case 'ends_first': return 'Your membership ends before this class.'
    case 'period_full': return 'You’ve booked all your classes for that period.'
    case 'pending': return 'That pass hasn’t been paid for yet.'
    case 'past_due': return 'Your membership’s last payment didn’t go through.'
    case 'cancelled': return 'That membership has been cancelled.'
    case 'expired': return `Your ${name} has expired.`
    default: return 'That pass can’t be used for this booking.'
  }
}
