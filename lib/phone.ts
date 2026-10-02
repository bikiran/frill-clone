// Shared phone/email normalization for cross-channel customer matching.
//
// Colvy historically normalized phones inconsistently — identity grouping used
// the last 8 digits, contact-matching and the DB `phone_norm` column use the
// last 9. This module is the single source of truth going forward; it keeps the
// last-9 convention so it lines up with the indexed `contacts.phone_norm` /
// `woocommerce_orders.billing_phone_norm` columns that already exist.

// Digits only.
function digits(raw?: string | null): string {
  return String(raw || '').replace(/\D/g, '')
}

// The matching key for a phone number: its last 9 significant digits. This makes
// "+61 412 345 678", "0412 345 678" and "412345678" all compare equal, matching
// the DB `phone_norm` column (RIGHT(digits, 9)).
export function phoneKey(raw?: string | null): string {
  const d = digits(raw)
  return d.length >= 9 ? d.slice(-9) : d
}

// A best-effort E.164-ish display form, defaulting to Australia (the product's
// primary market) for local formats. Used for display/storage, NOT matching —
// matching always goes through phoneKey so country-code differences don't split
// the same person.
export function toE164(raw?: string | null, defaultCountry: 'AU' = 'AU'): string {
  const d = digits(raw)
  if (!d) return ''
  if (String(raw || '').trim().startsWith('+')) return '+' + d
  if (defaultCountry === 'AU') {
    if (d.startsWith('61')) return '+' + d
    if (d.startsWith('0')) return '+61' + d.slice(1)
    if (d.length === 9) return '+61' + d          // bare AU mobile without leading 0
  }
  return '+' + d
}

// Case-insensitive, trimmed email key. Empty string when not a plausible email.
export function emailKey(raw?: string | null): string {
  const e = String(raw || '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : ''
}

// Pull the first email / phone out of a free-text message (a customer replying
// with "it's sarah@gmail.com" or "0412 345 678"). Returns normalized keys plus
// the raw match for display.
export function detectContactInfo(text?: string | null): { email?: { raw: string; key: string }; phone?: { raw: string; key: string } } {
  const out: { email?: { raw: string; key: string }; phone?: { raw: string; key: string } } = {}
  const t = String(text || '')
  const em = t.match(/[^\s@]+@[^\s@]+\.[^\s@]{2,}/)
  if (em) { const key = emailKey(em[0]); if (key) out.email = { raw: em[0], key } }
  // A phone-like run: optional +, then 8+ digits allowing spaces/dashes/parens.
  const ph = t.match(/\+?\d[\d\s().-]{7,}\d/)
  if (ph) { const key = phoneKey(ph[0]); if (key.length >= 8) out.phone = { raw: ph[0].trim(), key } }
  return out
}
