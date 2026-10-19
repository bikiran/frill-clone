// WhatsApp Business messaging through Twilio: the rules that don't touch the
// database or the network, so the browser, the API routes and the tests all
// agree on them. Server-side sending and storage live in lib/whatsapp.ts.
//
// Colvy sends WhatsApp through its own (master) Twilio account, exactly like
// SMS: the Messages API with `whatsapp:+61…` addresses, a WhatsApp Sender per
// business (registered with Meta from Colvy's Twilio console), and Content
// Templates (ContentSid + ContentVariables) for anything outside the customer
// service window. See migrations/COLVY_V402_WHATSAPP.sql for the set-up steps.

// ── Sender status ───────────────────────────────────────────────────────────

export const SENDER_STATUSES = ['not_requested', 'pending', 'approved', 'rejected', 'disabled'] as const
export type SenderStatus = typeof SENDER_STATUSES[number]

export const SENDER_STATUS_LABEL: Record<SenderStatus, string> = {
  not_requested: 'Not requested',
  pending: 'Pending approval',
  approved: 'Connected',
  rejected: 'Not approved',
  disabled: 'Switched off',
}

export const isSenderStatus = (v: unknown): v is SenderStatus => SENDER_STATUSES.includes(v as SenderStatus)

// ── Templates ───────────────────────────────────────────────────────────────

export const TEMPLATE_CATEGORIES = ['utility', 'marketing', 'authentication'] as const
export type TemplateCategory = typeof TEMPLATE_CATEGORIES[number]
export const TEMPLATE_CATEGORY_LABEL: Record<TemplateCategory, string> = { utility: 'Utility', marketing: 'Marketing', authentication: 'Authentication' }

export const TEMPLATE_STATUSES = ['draft', 'pending', 'approved', 'rejected', 'paused', 'disabled'] as const
export type TemplateStatus = typeof TEMPLATE_STATUSES[number]
export const TEMPLATE_STATUS_LABEL: Record<TemplateStatus, string> = {
  draft: 'Draft', pending: 'Waiting for Meta', approved: 'Approved', rejected: 'Rejected', paused: 'Paused by Meta', disabled: 'Disabled',
}

/**
 * The categories a business may send from Colvy in this version. Utility only
 * (order updates, booking changes, "we've replied to your enquiry"): sending
 * marketing over WhatsApp (and broadcasts) is not part of v1, and
 * authentication templates are one-time codes, which Colvy doesn't send.
 */
export const SENDABLE_CATEGORIES: readonly TemplateCategory[] = ['utility']

export type WhatsAppTemplate = {
  id: string
  name: string
  language: string
  category: TemplateCategory
  body: string
  content_sid: string
  status: TemplateStatus
  variable_labels?: string[] | null
}

/** A template that may be sent from the inbox right now. */
export const templateSendable = (t: Pick<WhatsAppTemplate, 'status' | 'category' | 'content_sid'> | null | undefined): boolean =>
  !!t && t.status === 'approved' && SENDABLE_CATEGORIES.includes(t.category) && CONTENT_SID_RE.test(String(t.content_sid || ''))

export const CONTENT_SID_RE = /^HX[0-9a-fA-F]{32}$/
// WhatsApp Sender SIDs from Twilio's Senders API (XE…); older consoles show
// other two-letter prefixes, so any two letters + 32 hex is accepted.
export const SENDER_SID_RE = /^[A-Z]{2}[0-9a-fA-F]{32}$/
export const TEMPLATE_NAME_RE = /^[a-z0-9_]{1,512}$/
export const LANGUAGE_RE = /^[a-z]{2,3}(_[A-Z]{2})?$/
export const TEMPLATE_BODY_MAX = 1024
const VAR_RE = /\{\{\s*(\d{1,2})\s*\}\}/g

/** The numbered variables in a template body ({{1}}, {{2}}…), in order, each once. */
export function templateVariables(body: string | null | undefined): string[] {
  const seen = new Set<string>()
  for (const m of String(body || '').matchAll(VAR_RE)) seen.add(String(Number(m[1])))
  return Array.from(seen).sort((a, b) => Number(a) - Number(b))
}

/**
 * Problems with a template body as Meta would see them, or [] when it's fine:
 * not empty, at most 1,024 characters, variables numbered 1, 2, 3… with no
 * gaps, and not starting or ending with a variable (Meta rejects both).
 */
export function templateBodyProblems(body: string | null | undefined): string[] {
  const b = String(body || '').trim()
  const out: string[] = []
  if (!b) return ['Add the template’s text.']
  if (b.length > TEMPLATE_BODY_MAX) out.push(`Keep it to ${TEMPLATE_BODY_MAX.toLocaleString('en-AU')} characters.`)
  const vars = templateVariables(b)
  if (vars.some((v, i) => Number(v) !== i + 1)) out.push('Number the variables {{1}}, {{2}}, {{3}}… with none skipped.')
  if (/^\{\{\s*\d+\s*\}\}/.test(b) || /\{\{\s*\d+\s*\}\}$/.test(b)) out.push('Meta doesn’t accept a template that starts or ends with a variable.')
  return out
}

/**
 * One variable as WhatsApp accepts it: no line breaks or tabs, no runs of
 * spaces (Meta refuses more than four in a row), trimmed, at most 1,024
 * characters.
 */
export function cleanVariable(v: unknown): string {
  return String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, 1024)
}

/**
 * Fill a template's variables. `values` is keyed by number ("1", "2"…) or is
 * a list ({{1}} first). Returns the text the customer will read, the
 * ContentVariables JSON Twilio takes, and the variables still empty.
 */
export function fillTemplate(body: string, values: Record<string, unknown> | unknown[] | null | undefined): { text: string; contentVariables: string; missing: string[]; variables: Record<string, string> } {
  const vars = templateVariables(body)
  const variables: Record<string, string> = {}
  const missing: string[] = []
  for (const k of vars) {
    const raw = Array.isArray(values) ? values[Number(k) - 1] : (values as any)?.[k]
    const v = cleanVariable(raw)
    if (!v) missing.push(k)
    variables[k] = v
  }
  const text = String(body || '').replace(VAR_RE, (_m, n) => variables[String(Number(n))] || `{{${Number(n)}}}`)
  return { text, contentVariables: JSON.stringify(variables), missing, variables }
}

// ── Addresses ───────────────────────────────────────────────────────────────

/** "whatsapp:+61412345678" → "+61412345678". Anything else comes back as given (trimmed). */
export function stripWhatsApp(addr: string | null | undefined): string {
  return String(addr || '').trim().replace(/^whatsapp:/i, '').trim()
}

/** "+61412345678" → "whatsapp:+61412345678". */
export function whatsAppAddress(e164: string): string {
  const n = stripWhatsApp(e164)
  return n ? `whatsapp:${n}` : ''
}

export const isWhatsAppAddress = (addr: string | null | undefined) => /^whatsapp:/i.test(String(addr || '').trim())

export const E164_RE = /^\+[1-9][0-9]{7,14}$/

// ── The customer service window ─────────────────────────────────────────────
//
// WhatsApp lets a business send free-form messages (text, photos, files) only
// within 24 hours of the customer's last message to it. After that, only an
// approved template can start the conversation again. Colvy closes its own
// window a minute early: the time it has is when the message reached Colvy,
// which is a little after the customer sent it.

export const WINDOW_MS = 24 * 3600 * 1000
export const WINDOW_MARGIN_MS = 60 * 1000

export type ServiceWindow = { open: boolean; lastInboundAt: string | null; closesAt: string | null; msLeft: number }

export function serviceWindow(lastInbound: string | number | Date | null | undefined, now: number = Date.now()): ServiceWindow {
  const t = lastInbound == null || lastInbound === '' ? NaN : new Date(lastInbound as any).getTime()
  if (!Number.isFinite(t)) return { open: false, lastInboundAt: null, closesAt: null, msLeft: 0 }
  const start = Math.min(t, now)    // a timestamp from the future (clock skew) counts as now
  const closes = start + WINDOW_MS - WINDOW_MARGIN_MS
  const msLeft = Math.max(0, closes - now)
  return { open: now < closes, lastInboundAt: new Date(t).toISOString(), closesAt: new Date(closes).toISOString(), msLeft }
}

/** "3h 12m left", "45m left", "under a minute left". */
export function windowLeftWords(msLeft: number): string {
  if (msLeft <= 0) return 'closed'
  const m = Math.floor(msLeft / 60000)
  if (m < 1) return 'under a minute left'
  const h = Math.floor(m / 60)
  return h ? `${h}h ${m % 60}m left` : `${m}m left`
}

// ── Delivery status ─────────────────────────────────────────────────────────

export const MESSAGE_STATUSES = ['queued', 'accepted', 'sending', 'sent', 'delivered', 'read', 'undelivered', 'failed'] as const
export type MessageStatus = typeof MESSAGE_STATUSES[number]

const RANK: Record<string, number> = { accepted: 0, queued: 0, scheduled: 0, sending: 1, sent: 2, delivered: 3, read: 4, undelivered: 5, failed: 5, canceled: 5 }
const FINAL_FAIL = new Set(['undelivered', 'failed', 'canceled'])

/**
 * Should a status callback replace the status already stored? Twilio's
 * callbacks can arrive out of order (a "read" before its "delivered"), so a
 * status never moves backwards, a failure is final, and a message already
 * delivered or read doesn't become failed. Unknown statuses are ignored.
 */
export function statusAdvances(current: string | null | undefined, incoming: string | null | undefined): boolean {
  const inc = String(incoming || '').toLowerCase()
  if (!(inc in RANK)) return false
  const cur = String(current || '').toLowerCase()
  if (!cur || !(cur in RANK)) return true
  if (FINAL_FAIL.has(cur)) return false
  // Delivered or read means it arrived: a later failure report doesn't undo that.
  if (FINAL_FAIL.has(inc) && RANK[cur] >= RANK.delivered) return false
  return RANK[inc] > RANK[cur]
}

export const STATUS_LABEL: Record<string, string> = {
  queued: 'Sending', accepted: 'Sending', sending: 'Sending', sent: 'Sent', delivered: 'Delivered', read: 'Read', undelivered: 'Not delivered', failed: 'Not delivered',
}

// Twilio / WhatsApp error codes → what to tell the team. Anything not listed
// says the code, so it can still be looked up.
const ERRORS: Record<string, string> = {
  '63016': 'The 24-hour window has closed, so WhatsApp only accepts an approved template now.',
  '63003': 'This number isn’t on WhatsApp.',
  '63024': 'WhatsApp says this isn’t a valid recipient.',
  '63018': 'Too many WhatsApp messages too quickly. Try again in a minute.',
  '63049': 'Meta held this marketing message back from the customer.',
  '63007': 'This business’s WhatsApp number isn’t set up on Colvy’s Twilio account.',
  '63013': 'WhatsApp refused it under its messaging policy.',
  '63005': 'WhatsApp didn’t accept this message’s content.',
  '63019': 'WhatsApp couldn’t download the attached file.',
  '63021': 'WhatsApp found the message content invalid.',
  '63015': 'WhatsApp sandbox: this number hasn’t joined the sandbox.',
  '63112': 'Meta has disabled this business’s WhatsApp account.',
  '21655': 'The template’s Content SID isn’t valid.',
  '21656': 'The template’s variables weren’t accepted.',
  '21211': 'That isn’t a valid phone number.',
}

export function friendlyWhatsAppError(code: string | number | null | undefined, fallback?: string | null): string {
  const c = code == null ? '' : String(code).trim()
  if (c && ERRORS[c]) return ERRORS[c]
  if (c) return `WhatsApp couldn’t deliver it (Twilio error ${c}).`
  return fallback ? String(fallback) : 'WhatsApp couldn’t deliver it.'
}

/** Why sending is refused, worded for the team. */
export const BLOCK_WORDS: Record<string, string> = {
  not_ready: 'WhatsApp needs a database update first (COLVY_V402_WHATSAPP.sql).',
  not_approved: 'WhatsApp isn’t connected for this business yet.',
  flag_off: 'WhatsApp sending is switched off for this business. Contact Colvy.',
  plan: 'WhatsApp needs a plan with messaging channels.',
  platform: 'WhatsApp isn’t available right now (Colvy’s Twilio account isn’t configured).',
  opted_out: 'This customer replied STOP on WhatsApp, so they can’t be messaged there until they send START.',
  unknown: 'Couldn’t check whether this customer opted out of WhatsApp, so it wasn’t sent.',
  window_closed: 'The 24-hour window has closed. Send an approved template instead.',
  no_number: 'This conversation has no WhatsApp number.',
  template: 'That template can’t be sent.',
  demo: 'Sending is turned off for this demo workspace.',
}
