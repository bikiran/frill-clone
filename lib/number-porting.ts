// Moving an existing Australian number to Colvy ("porting"). Safe for the
// browser and the server: the rules, wording and validation only. The database
// side is lib/number-porting-server.ts.
//
// Porting an Australian number to Colvy's carrier (Twilio) isn't self-serve:
// the losing carrier needs a Letter of Authority signed by the account holder,
// the account details exactly as they hold them, and usually a recent bill.
// So a port is a REQUEST: the business fills in one form in Colvy, our team
// checks it and lodges it with the carriers, and the number is attached to the
// business in Colvy once it has moved. Typically 1 to 3 weeks.
//
// Status, and who moves it:
//   submitted              the business sent the request
//   in_review              Colvy is checking the details and documents
//   submitted_to_carrier   lodged with the carriers
//   scheduled              the carriers gave a port date (scheduled_for)
//   completed              the number is on Colvy and attached to the business
//   rejected               it can't go ahead (rejection_reason says why)
//   cancelled              the business withdrew it before it was lodged
//
// The platform admin moves every step except `cancelled`, which only the
// business can choose (and only before the request goes to the carriers).
// `completed` is reached by attaching the numbers (attachPortedNumber), never
// by a bare status change, so a "completed" port always has working numbers.

export const PORT_STATUSES = ['submitted', 'in_review', 'submitted_to_carrier', 'scheduled', 'completed', 'rejected', 'cancelled'] as const
export type PortStatus = typeof PORT_STATUSES[number]

export const PORT_STATUS_LABEL: Record<PortStatus, string> = {
  submitted: 'Submitted',
  in_review: 'In review',
  submitted_to_carrier: 'Submitted to carrier',
  scheduled: 'Scheduled',
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

/** One line for the business on what each status means. */
export const PORT_STATUS_HELP: Record<PortStatus, string> = {
  submitted: 'We have your request and will check it within one business day.',
  in_review: 'We are checking your details and documents against your current provider’s records.',
  submitted_to_carrier: 'Your request has been lodged with the carriers. Keep your current service active.',
  scheduled: 'The carriers have set a date to move your number. Keep your current service active until then.',
  completed: 'Your number is now on Colvy. Calls to it ring in Colvy.',
  rejected: 'This request couldn’t go ahead. The reason is below; you can send a new request once it’s fixed.',
  cancelled: 'You cancelled this request.',
}

/** Admin-driven transitions (completed is reached by attaching the numbers). */
export const PORT_TRANSITIONS: Record<PortStatus, PortStatus[]> = {
  submitted: ['in_review', 'rejected'],
  in_review: ['submitted_to_carrier', 'rejected'],
  submitted_to_carrier: ['scheduled', 'in_review', 'rejected'],
  scheduled: ['scheduled', 'submitted_to_carrier', 'rejected'],
  completed: [],
  rejected: ['in_review'],
  cancelled: [],
}

export const isPortStatus = (s: unknown): s is PortStatus => (PORT_STATUSES as readonly string[]).includes(String(s))

/** Whether the platform admin may move a request from one status to another. */
export function canTransition(from: string, to: string): boolean {
  if (!isPortStatus(from) || !isPortStatus(to)) return false
  return PORT_TRANSITIONS[from].includes(to)
}

/** The business may withdraw a request until it has been lodged with the carriers. */
export const businessCanCancel = (status: string) => status === 'submitted' || status === 'in_review'

/** A request still open (files can be added, attach is possible). */
export const isOpenPort = (status: string) => !['completed', 'rejected', 'cancelled'].includes(status)

/** Attaching numbers is possible once the carriers are involved. */
export const canAttach = (status: string) => status === 'submitted_to_carrier' || status === 'scheduled'

export const PORT_TIMELINE = 'Most ports take 1 to 3 weeks, depending on your current provider.'
export const KEEP_SERVICE = 'Keep your current service active until we tell you the move is complete, and don’t cancel with your old provider. Cancelling first can lose the number for good. Your old provider closes the service for that number when the port completes; ask them about any other services on the same account.'

// ── Fees ─────────────────────────────────────────────────────────────────────

const money = (v: unknown, fallback: number) => {
  const n = parseFloat(String(v ?? ''))
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

/** One-off porting fee per request, A$ (COLVY_PORT_FEE_AUD, default 0). Server only reads the env. */
export function portFeeAud(env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {}): number {
  return money(env.COLVY_PORT_FEE_AUD, 0)
}

// ── Numbers, ABN ─────────────────────────────────────────────────────────────

/**
 * An Australian number a business can port to Colvy, as E.164, or an error.
 * Landlines (02/03/07/08), mobiles (04) and 1800 numbers. 13 / 1300 numbers
 * can't be hosted on Colvy yet.
 */
export function parsePortNumber(raw: string): { e164: string } | { error: string } {
  const s = String(raw || '').trim()
  if (!s) return { error: 'Enter a number.' }
  let d = s.replace(/[\s().-]/g, '')
  if (/[^+\d]/.test(d)) return { error: `“${s}” isn’t a phone number.` }
  if (d.startsWith('+61')) d = d.slice(3)
  else if (d.startsWith('0061')) d = d.slice(4)
  else if (d.startsWith('61') && d.length === 11) d = d.slice(2)
  else if (d.startsWith('+')) return { error: `${s}: only Australian numbers can be moved to Colvy.` }
  if (d.startsWith('0')) d = d.slice(1)
  if (/^13/.test(d) || /^1300/.test(d)) return { error: `${s}: 13 and 1300 numbers can’t be moved to Colvy yet.` }
  if (/^1800\d{6}$/.test(d)) return { e164: `+61${d}` }
  if (/^[2378]\d{8}$/.test(d)) return { e164: `+61${d}` }
  if (/^4\d{8}$/.test(d)) return { e164: `+61${d}` }
  return { error: `${s} isn’t a complete Australian number. Include the area code, e.g. 03 9123 4567 or 0412 345 678.` }
}

/** Australian Business Number check digit (ATO algorithm). Returns the 11 digits or null. */
export function cleanAbn(raw: string): string | null {
  const d = String(raw || '').replace(/[\s-]/g, '')
  if (!/^\d{11}$/.test(d)) return null
  const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
  const digits = d.split('').map(Number)
  digits[0] -= 1
  const sum = digits.reduce((s, n, i) => s + n * w[i], 0)
  return sum % 89 === 0 ? d : null
}

export const formatAbn = (abn: string) => abn.replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3 $4')

/** Display an E.164 AU number the local way. */
export function formatAuNumber(e164: string): string {
  const d = String(e164 || '').replace(/^\+61/, '')
  if (/^1800\d{6}$/.test(d)) return `1800 ${d.slice(4, 7)} ${d.slice(7)}`
  if (/^4\d{8}$/.test(d)) return `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
  if (/^[2378]\d{8}$/.test(d)) return `(0${d[0]}) ${d.slice(1, 5)} ${d.slice(5)}`
  return e164
}

// ── Letter of Authority ──────────────────────────────────────────────────────

export const LOA_VERSION = 'colvy-loa-2026-10'

/** The authority the account holder gives, shown on the form and stored with the request. */
export function loaText(o: { accountHolder?: string; carrier?: string; numbers?: string[] }): string {
  const holder = (o.accountHolder || '').trim() || 'the account holder'
  const carrier = (o.carrier || '').trim() || 'my current provider'
  const nums = (o.numbers || []).filter(Boolean)
  const list = nums.length ? nums.map(formatAuNumber).join(', ') : 'the numbers listed'
  return [
    `I confirm that I am ${holder}, or am authorised to act for ${holder}, the account holder for ${list} with ${carrier}.`,
    `I authorise Colvy and its carrier partners to arrange for ${list} to be transferred (ported) from ${carrier} to Colvy, and to give ${carrier} the details in this request to do so.`,
    `I understand that when the port completes, ${carrier} will stop providing service on ${list}, that I remain responsible for any charges owing to ${carrier} up to then, and that I should not cancel my service with ${carrier} before the port completes.`,
    'The details I have given are correct and match my current provider’s records.',
  ].join(' ')
}

// ── Validation ───────────────────────────────────────────────────────────────

export type PortInput = {
  numbers?: string[] | string
  carrier?: string
  accountHolder?: string
  accountNumber?: string
  serviceAddress?: string
  abn?: string
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  signedName?: string
  consent?: boolean
  preferredDate?: string | null
}

export type PortRequestValue = {
  numbers: string[]
  current_carrier: string
  account_holder: string
  account_number: string
  service_address: string
  abn: string | null
  contact_name: string
  contact_email: string
  contact_phone: string
  loa_signed_name: string
  preferred_date: string | null
}

export type FileInfo = { name: string; type: string; size: number } | null | undefined

export const MAX_PORT_NUMBERS = 20
export const MAX_FILE_BYTES = 4 * 1024 * 1024   // a serverless request body tops out near 4.5 MB
export const FILE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/heic', 'image/heif', 'image/webp']

const trimmed = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** A bill or other document is acceptable: present, a PDF or photo, not too big. */
export function checkPortFile(file: FileInfo): string | null {
  if (!file || !file.size) return 'Attach a recent bill from your current provider (PDF or photo).'
  if (!FILE_TYPES.includes(String(file.type || '').toLowerCase())) return 'The bill must be a PDF or a photo (PNG, JPG, HEIC or WebP).'
  if (file.size > MAX_FILE_BYTES) return 'The bill must be under 4 MB. Try a PDF, or a smaller photo.'
  return null
}

/**
 * Check a port request. `errors` is keyed by field (shown beside it); `value`
 * is the cleaned row when there are none. `today` (YYYY-MM-DD) bounds the
 * preferred date.
 */
export function validatePortRequest(input: PortInput, file: FileInfo, today: string = new Date().toISOString().slice(0, 10)): { ok: boolean; errors: Record<string, string>; value: PortRequestValue | null } {
  const errors: Record<string, string> = {}
  const rawNumbers = (Array.isArray(input.numbers) ? input.numbers : String(input.numbers || '').split(/[\n,;]+/)).map(s => String(s).trim()).filter(Boolean)
  const numbers: string[] = []
  if (!rawNumbers.length) errors.numbers = 'Enter the number you want to move.'
  for (const r of rawNumbers) {
    const p = parsePortNumber(r)
    if ('error' in p) { errors.numbers = p.error; break }
    if (!numbers.includes(p.e164)) numbers.push(p.e164)
  }
  if (numbers.length > MAX_PORT_NUMBERS) errors.numbers = `Up to ${MAX_PORT_NUMBERS} numbers per request. Send another request for the rest.`

  const carrier = trimmed(input.carrier, 120)
  if (carrier.length < 2) errors.carrier = 'Who is your current provider (e.g. Telstra, Optus, TPG)?'
  const holder = trimmed(input.accountHolder, 160)
  if (holder.length < 2) errors.accountHolder = 'Enter the account holder’s name exactly as it appears on the bill.'
  const accountNumber = trimmed(input.accountNumber, 60)
  if (!/^[A-Za-z0-9][A-Za-z0-9 \-/]{2,59}$/.test(accountNumber)) errors.accountNumber = 'Enter the account number from your bill.'
  const address = trimmed(input.serviceAddress, 300)
  if (address.length < 8 || !/\d/.test(address)) errors.serviceAddress = 'Enter the full service address on the account, including the street number and postcode.'
  else if (!/\b(ACT|NSW|NT|QLD|SA|TAS|VIC|WA)\b/i.test(address) && !/\b\d{4}\b/.test(address)) errors.serviceAddress = 'Include the state and postcode.'

  let abn: string | null = null
  const abnRaw = trimmed(input.abn, 20)
  if (abnRaw) {
    abn = cleanAbn(abnRaw)
    if (!abn) errors.abn = 'That ABN isn’t valid. It has 11 digits, e.g. 51 824 753 556.'
  }

  const contactName = trimmed(input.contactName, 120)
  if (contactName.length < 2) errors.contactName = 'Who should we contact about this port?'
  const contactEmail = trimmed(input.contactEmail, 200).toLowerCase()
  if (!EMAIL_RE.test(contactEmail)) errors.contactEmail = 'Enter an email address for updates.'
  const contactPhone = trimmed(input.contactPhone, 30)
  if (contactPhone.replace(/\D/g, '').length < 8) errors.contactPhone = 'Enter a phone number we can reach them on.'

  const signedName = trimmed(input.signedName, 160)
  if (signedName.length < 2) errors.signedName = 'Type your full name to sign the authority.'
  if (input.consent !== true) errors.consent = 'Tick the box to give the authority.'

  let preferred: string | null = null
  const pd = trimmed(input.preferredDate, 20)
  if (pd) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pd) || isNaN(Date.parse(pd + 'T00:00:00Z'))) errors.preferredDate = 'Choose a valid date.'
    else if (pd < today) errors.preferredDate = 'Choose a date from today onwards.'
    else preferred = pd
  }

  const fileErr = checkPortFile(file)
  if (fileErr) errors.bill = fileErr

  const ok = Object.keys(errors).length === 0
  return {
    ok, errors,
    value: ok ? {
      numbers, current_carrier: carrier, account_holder: holder, account_number: accountNumber,
      service_address: address, abn, contact_name: contactName, contact_email: contactEmail,
      contact_phone: contactPhone, loa_signed_name: signedName, preferred_date: preferred,
    } : null,
  }
}
