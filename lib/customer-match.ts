// Deterministic, evidence-based customer matching for cross-channel identity.
//
// Given the signals we have about the person on one side of a conversation
// (their platform id, any email/phone they've shared, their name/username, a
// suburb, an order number they mentioned…) and a set of candidate customers we
// gathered from the DB, decide:
//   • a CONFIRMED auto-match (a previously-confirmed platform identity, or a
//     unique exact email/phone), or
//   • up to three SUGGESTED matches that a human must confirm, each with the
//     evidence behind it, or
//   • nothing reliable.
//
// The scoring is explainable: every point comes from a named signal, never an
// opaque model number. Thresholds are configurable (see DEFAULT_THRESHOLDS) but
// the bands mirror the product spec:
//   100      previously-confirmed platform identity
//   95–99    unique exact phone / email
//   70–94    suggested (needs confirmation)
//   < 70     not reliable — do not recommend
//
// This module is intentionally pure (no DB, no network) so it can be unit
// tested and reused on client or server. The caller gathers Candidates.

import { phoneKey, emailKey } from './phone'

export type IdentityKind = 'instagram' | 'facebook' | 'whatsapp' | 'email' | 'phone' | 'woo' | 'pos' | 'stripe'

// What we know about the person we're trying to identify.
export interface MatchSignals {
  platform?: 'instagram' | 'facebook' | 'whatsapp'
  platformUserId?: string          // the durable IGSID / PSID — the permanent key
  username?: string                // @handle / display name on the platform
  name?: string                    // best display name we have
  emails?: string[]                // emails seen in the conversation/contact
  phones?: string[]                // phones seen in the conversation/contact
  suburb?: string
  postcode?: string
  orderNumbers?: string[]          // order numbers mentioned in the conversation
  products?: string[]              // product names mentioned
}

// A customer we might match to, with the identifiers we could gather for them.
export interface Candidate {
  contactId: string
  name?: string | null
  emails?: string[]                // all known emails (contact + orders + identities)
  phones?: string[]                // all known phones
  usernames?: string[]             // handles confirmed/seen for this contact
  suburbs?: string[]
  postcodes?: string[]
  orderNumbers?: string[]          // order numbers belonging to this customer
  products?: string[]
  channels?: string[]              // channels this customer has used before
  // A platform identity already CONFIRMED to this contact (kind+value), if any.
  confirmedPlatformIds?: { kind: IdentityKind; value: string }[]
}

export interface Evidence { signal: string; detail: string; points: number }

export interface MatchResult {
  contactId: string
  confidence: number               // 0–100
  evidence: Evidence[]
  band: 'confirmed' | 'suggested' | 'weak'
  ambiguous?: boolean              // an exact identifier hit more than one customer
}

export interface MatchOutcome {
  // A single auto-match safe to load without asking (confirmed identity, or a
  // unique exact email/phone). Absent when nothing is certain.
  confirmed?: MatchResult
  // Up to three human-confirm suggestions (never includes `confirmed`).
  suggestions: MatchResult[]
}

export interface Thresholds {
  confirmedIdentity: number        // 100
  exactPhone: number               // 96
  exactEmail: number               // 98
  suggestFloor: number             // 70 — below this, don't recommend
  confirmFloor: number             // 95 — at/above this AND unique → auto-confirm
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  confirmedIdentity: 100,
  exactPhone: 96,
  exactEmail: 98,
  suggestFloor: 70,
  confirmFloor: 95,
}

// Signal weights for a probable (no exact identifier) match. Deliberately tuned
// so NO single soft signal reaches the 70 suggest floor on its own — a match
// must combine evidence. Name/username/photo alone must never be enough.
const W = {
  orderNumber: 55,   // they quoted an order number that is this customer's
  fullName: 40,
  product: 12,
  username: 22,
  suburb: 16,
  postcode: 18,
  priorChannel: 12,
}
// Bonus that lifts a UNIQUE exact-name match (name 40 + 32 = 72) over the 70
// suggest floor, so it appears as a "possible match" to confirm — while a name
// shared by several customers stays at 40 and is not surfaced on its own.
const W_UNIQUE_NAME = 32

const lc = (s?: string | null) => String(s || '').trim().toLowerCase()
const uniqLc = (arr?: (string | null | undefined)[]) => Array.from(new Set((arr || []).map(lc).filter(Boolean)))

function scoreProbable(signals: MatchSignals, c: Candidate): Evidence[] {
  const ev: Evidence[] = []

  // Order number quoted in the conversation belongs to this customer — strong.
  const sOrders = uniqLc(signals.orderNumbers).map(o => o.replace(/^#/, ''))
  const cOrders = uniqLc(c.orderNumbers).map(o => o.replace(/^#/, ''))
  const orderHit = sOrders.find(o => o && cOrders.includes(o))
  if (orderHit) ev.push({ signal: 'order_number', detail: `Mentioned order #${orderHit}, which is this customer's`, points: W.orderNumber })

  // Full name exact (case-insensitive).
  const sName = lc(signals.name)
  if (sName && (uniqLc([c.name, ...(c.usernames || [])]).includes(sName))) {
    ev.push({ signal: 'name', detail: `Name matches “${c.name}”`, points: W.fullName })
  }

  // Instagram username / display handle.
  const sUser = lc(signals.username)
  if (sUser && sUser !== sName && uniqLc([c.name, ...(c.usernames || [])]).includes(sUser)) {
    ev.push({ signal: 'username', detail: `Handle matches “@${signals.username}”`, points: W.username })
  }

  // Suburb / postcode.
  if (signals.suburb && uniqLc(c.suburbs).includes(lc(signals.suburb))) {
    ev.push({ signal: 'suburb', detail: `Suburb matches ${signals.suburb}`, points: W.suburb })
  }
  if (signals.postcode && uniqLc(c.postcodes).includes(lc(signals.postcode))) {
    ev.push({ signal: 'postcode', detail: `Postcode matches ${signals.postcode}`, points: W.postcode })
  }

  // Product purchased mentioned.
  const sProd = uniqLc(signals.products)
  const cProd = uniqLc(c.products)
  const prodHit = sProd.find(p => p && cProd.some(cp => cp.includes(p) || p.includes(cp)))
  if (prodHit) ev.push({ signal: 'product', detail: `Mentioned a product this customer bought`, points: W.product })

  // Previously interacted on another channel.
  if (signals.platform && (c.channels || []).some(ch => lc(ch) && lc(ch) !== signals.platform)) {
    ev.push({ signal: 'prior_channel', detail: `Known on ${(c.channels || []).join(', ')}`, points: W.priorChannel })
  }

  return ev
}

// Core: turn signals + candidates into an outcome. Pure.
export function computeMatches(signals: MatchSignals, candidates: Candidate[], t: Thresholds = DEFAULT_THRESHOLDS): MatchOutcome {
  const results: MatchResult[] = []

  // 1) Confirmed platform identity — the durable key. Highest confidence.
  if (signals.platform && signals.platformUserId) {
    const owners = candidates.filter(c =>
      (c.confirmedPlatformIds || []).some(p => p.kind === signals.platform && p.value === signals.platformUserId))
    if (owners.length === 1) {
      return {
        confirmed: {
          contactId: owners[0].contactId, confidence: t.confirmedIdentity, band: 'confirmed',
          evidence: [{ signal: 'confirmed_identity', detail: `Previously confirmed ${signals.platform} identity`, points: t.confirmedIdentity }],
        },
        suggestions: [],
      }
    }
  }

  // 2) Exact identifier match (email / phone). Unique → auto-confirm; multiple → ambiguous suggestion.
  const sEmails = uniqLc(signals.emails).map(emailKey).filter(Boolean)
  const sPhones = (signals.phones || []).map(phoneKey).filter(p => p.length >= 8)

  const emailOwners = sEmails.length
    ? candidates.filter(c => (c.emails || []).map(emailKey).some(e => e && sEmails.includes(e)))
    : []
  const phoneOwners = sPhones.length
    ? candidates.filter(c => (c.phones || []).map(phoneKey).some(p => p.length >= 8 && sPhones.includes(p)))
    : []

  if (emailOwners.length === 1 && phoneOwners.length <= 1) {
    const c = emailOwners[0]
    const hitEmail = (c.emails || []).map(emailKey).find(e => sEmails.includes(e))
    return {
      confirmed: { contactId: c.contactId, confidence: t.exactEmail, band: 'confirmed',
        evidence: [{ signal: 'email', detail: `Email ${hitEmail} matches this customer`, points: t.exactEmail }] },
      suggestions: [],
    }
  }
  if (phoneOwners.length === 1 && emailOwners.length === 0) {
    const c = phoneOwners[0]
    return {
      confirmed: { contactId: c.contactId, confidence: t.exactPhone, band: 'confirmed',
        evidence: [{ signal: 'phone', detail: `Phone number matches this customer`, points: t.exactPhone }] },
      suggestions: [],
    }
  }

  // Ambiguous exact identifier → surface as suggestions needing confirmation.
  const ambiguousOwners = new Map<string, MatchResult>()
  const addAmbiguous = (list: Candidate[], label: string, pts: number) => {
    if (list.length > 1) for (const c of list) {
      const prev = ambiguousOwners.get(c.contactId)
      const e: Evidence = { signal: label, detail: `${label} matches (also matches other customers)`, points: pts }
      if (prev) prev.evidence.push(e)
      else ambiguousOwners.set(c.contactId, { contactId: c.contactId, confidence: Math.min(94, pts), band: 'suggested', ambiguous: true, evidence: [e] })
    }
  }
  addAmbiguous(emailOwners, 'email', 90)
  addAmbiguous(phoneOwners, 'phone', 88)
  for (const r of ambiguousOwners.values()) results.push(r)

  // 3) Probable matches from soft signals.
  const probable: MatchResult[] = []
  for (const c of candidates) {
    if (ambiguousOwners.has(c.contactId)) continue
    const ev = scoreProbable(signals, c)
    if (!ev.length) continue
    const confidence = Math.min(94, ev.reduce((s, e) => s + e.points, 0))
    probable.push({ contactId: c.contactId, confidence, band: 'suggested', evidence: ev })
  }

  // A UNIQUE exact-name match is worth surfacing as a suggestion (never an
  // auto-confirm) — if there's exactly one customer with this name and nothing
  // else is going on for them, a human should still get the chance to confirm
  // it. A name shared by several customers stays below the floor so we don't
  // guess between namesakes (the "never merge on name alone" rule).
  const nameMatches = probable.filter(r => r.evidence.some(e => e.signal === 'name'))
  if (nameMatches.length === 1) {
    const r = nameMatches[0]
    if (!r.evidence.some(e => e.signal === 'unique_name')) {
      r.evidence.push({ signal: 'unique_name', detail: 'The only customer with this exact name', points: W_UNIQUE_NAME })
      r.confidence = Math.min(94, r.confidence + W_UNIQUE_NAME)
    }
  }
  for (const r of probable) results.push(r)

  // Keep only reliable suggestions, best first, top 3.
  const suggestions = results
    .filter(r => r.confidence >= t.suggestFloor)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3)

  return { suggestions }
}

// Mask helpers for pre-confirmation display (reveal only after confirm/perms).
export function maskEmail(email?: string | null): string {
  const e = String(email || '')
  const [u, d] = e.split('@')
  if (!u || !d) return e ? '•••' : ''
  return `${u.slice(0, 2)}${'•'.repeat(Math.max(1, u.length - 2))}@${d}`
}
export function maskPhone(phone?: string | null): string {
  const d = String(phone || '').replace(/\D/g, '')
  if (d.length < 4) return phone ? '•••' : ''
  return `${d.slice(0, 2)}•• ••• ${d.slice(-3)}`
}
