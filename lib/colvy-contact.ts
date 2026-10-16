// Colvy's own public contact details: the one place the marketing site, the
// structured data and Colvy's own emails read them from. Never a business's
// (tenant's) details; those come from the company's own settings.
//
// The phone is Colvy's Twilio mobile ("Colvy - 61485059215"). Override it with
// NEXT_PUBLIC_COLVY_PHONE (any common format: 0485 059 215, +61 485 059 215).
// Calls and texts to it reach the Colvy workspace once the number is assigned
// there (super admin → Companies → Colvy → Edit → Assign an existing Twilio
// number), which also points its Twilio webhooks at Colvy.

const DEFAULT_PHONE = '+61485059215'

/** An Australian number in E.164 (+61…), or '' if it isn't one we can read. */
export function toE164Au(raw: string | null | undefined): string {
  const s = String(raw || '').trim()
  if (!s) return ''
  const digits = s.replace(/[^\d]/g, '')
  let e164 = ''
  if (s.startsWith('+')) e164 = `+${digits}`
  else if (digits.startsWith('61')) e164 = `+${digits}`
  else if (digits.startsWith('0')) e164 = `+61${digits.slice(1)}`
  else if (/^1[38]00\d{6}$/.test(digits) || /^13\d{4}$/.test(digits)) e164 = `+61${digits}`
  else return ''
  // +61 then 9 digits (mobile / geographic), 1300/1800 + 6, or 13 + 4.
  return /^\+61(\d{9}|1[38]00\d{6}|13\d{4})$/.test(e164) ? e164 : (/^\+[1-9]\d{6,14}$/.test(e164) && !e164.startsWith('+61') ? e164 : '')
}

/** How an Australian sees a number: 0485 059 215, (03) 9123 4567, 1300 123 456. */
export function formatAuPhone(e164: string): string {
  const m = /^\+61(\d+)$/.exec(e164 || '')
  if (!m) return e164 || ''
  const n = m[1]
  if (/^4\d{8}$/.test(n)) return `0${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`
  if (/^[2378]\d{8}$/.test(n)) return `(0${n[0]}) ${n.slice(1, 5)} ${n.slice(5)}`
  if (/^1[38]00\d{6}$/.test(n)) return `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}`
  if (/^13\d{4}$/.test(n)) return `${n.slice(0, 2)} ${n.slice(2, 4)} ${n.slice(4)}`
  return `0${n}`
}

const PHONE_E164 = toE164Au(process.env.NEXT_PUBLIC_COLVY_PHONE) || DEFAULT_PHONE

export const COLVY_CONTACT = {
  /** +61485059215: tel:/sms: links, JSON-LD, Twilio. */
  phoneE164: PHONE_E164,
  /** 0485 059 215: what people read. */
  phoneDisplay: formatAuPhone(PHONE_E164),
  /** The same number for people dialling from overseas: +61 485 059 215. */
  phoneIntl: PHONE_E164.replace(/^\+61(\d)(\d{2,3})(\d{3})(\d{3})$/, '+61 $1$2 $3 $4'),
  telHref: `tel:${PHONE_E164}`,
  smsHref: `sms:${PHONE_E164}`,
  email: 'support@colvy.com',
  mailHref: 'mailto:support@colvy.com',
} as const

/** Is this (any format) Colvy's own number? */
export function isColvyNumber(raw: string | null | undefined): boolean {
  const d = String(raw || '').replace(/\D/g, '')
  return d.length >= 9 && COLVY_CONTACT.phoneE164.replace(/\D/g, '').endsWith(d.slice(-9))
}

/** A one-line contact footer for Colvy's own emails (HTML, already escaped). */
export function colvyEmailContactHtml(): string {
  const c = COLVY_CONTACT
  return `<p style="font-size:12px;color:#9ca3af;margin:12px 0 0">Questions? Call or text us on <a href="${c.telHref}" style="color:#6b7280;text-decoration:none;font-weight:600">${c.phoneDisplay}</a> or email <a href="${c.mailHref}" style="color:#6b7280;text-decoration:none;font-weight:600">${c.email}</a>.</p>`
}

/** The same footer as plain text. */
export function colvyEmailContactText(): string {
  return `Questions? Call or text us on ${COLVY_CONTACT.phoneDisplay} or email ${COLVY_CONTACT.email}.`
}
