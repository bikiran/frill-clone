// Which Resend key reads RECEIVED email, and what to say when it can't.
//
// Resend has two kinds of API key: "Full access" and "Sending access". A
// sending-access key can only POST /emails; every other endpoint, including
// the Receiving API (GET /emails/receiving, /emails/receiving/{id} and its
// attachments), answers 401 `restricted_api_key` ("This API key is restricted
// to only send emails"). So a sending-only RESEND_API_KEY sends fine while
// every customer reply arrives blank.
//
// RESEND_RECEIVING_API_KEY (a Full access key) is used for every receiving
// read; it falls back to RESEND_API_KEY when it isn't set. Sending keeps using
// RESEND_API_KEY. Server only.

type Env = Record<string, string | undefined>

const val = (v: string | undefined) => String(v || '').trim() || null

/** The key for reading received email: RESEND_RECEIVING_API_KEY, else RESEND_API_KEY. */
export function resendReceivingKey(env: Env = process.env): string | null {
  return val(env.RESEND_RECEIVING_API_KEY) || val(env.RESEND_API_KEY)
}

/** Which env var resendReceivingKey() came from, for the health pages. */
export function resendReceivingKeyName(env: Env = process.env): 'RESEND_RECEIVING_API_KEY' | 'RESEND_API_KEY' | null {
  return val(env.RESEND_RECEIVING_API_KEY) ? 'RESEND_RECEIVING_API_KEY' : val(env.RESEND_API_KEY) ? 'RESEND_API_KEY' : null
}

/** Why a received email couldn't be read. */
export type ReceivingFailure = 'unauthorised' | 'not-found' | 'unavailable' | 'over-quota' | 'no-key'

/** Resend's answer → why. 401, or a 403 about the key, means the key can't read received mail. */
export function receivingFailureOf(status: number, errorName?: string | null): ReceivingFailure {
  const name = String(errorName || '')
  if (status === 403 && name === 'email_above_quota') return 'over-quota'
  if (status === 401 || status === 403) return 'unauthorised'
  if (status === 404) return 'not-found'
  return 'unavailable'
}

/** Resend's error JSON is { statusCode, name, message }. Never throws. */
export async function resendErrorOf(res: Response): Promise<{ name: string | null; message: string | null }> {
  try {
    const j: any = await res.clone().json()
    return { name: j?.name ? String(j.name) : null, message: j?.message ? String(j.message).slice(0, 200) : null }
  } catch { return { name: null, message: null } }
}

/** The fix, for the owner (super admin pages and the dry-run reasons). */
export function receivingKeyHelp(env: Env = process.env): string {
  if (val(env.RESEND_RECEIVING_API_KEY)) {
    return 'The RESEND_RECEIVING_API_KEY in Vercel can’t read the replies customers send back (Resend refused it). In Resend → API Keys, create a key with Full access, replace RESEND_RECEIVING_API_KEY in Vercel with it, then redeploy and run this again.'
  }
  return 'Colvy’s Resend API key can only send email, so it can’t read the replies customers send back. In Resend → API Keys, create a key with Full access and add it in Vercel as RESEND_RECEIVING_API_KEY, then redeploy and run this again.'
}

/** Short version for the inbox bubble (owners and super admins only). */
export const RECEIVING_KEY_SHORT = 'Resend key can’t read received mail'

export type ReceivingCheck = {
  status: 'working' | 'blocked' | 'no-key' | 'error'
  /** Plain words for the status line. */
  label: string
  keyName: 'RESEND_RECEIVING_API_KEY' | 'RESEND_API_KEY' | null
  httpStatus?: number
  /** Resend's error name, e.g. restricted_api_key. */
  errorName?: string | null
  help?: string
  checkedAt: string
}

/**
 * The cheap check: GET /emails/receiving?limit=1 with the receiving key.
 * 200 → working; 401/403 → blocked (the key can only send). Never throws.
 */
export async function checkResendReceiving(o: { fetchImpl?: typeof fetch; env?: Env } = {}): Promise<ReceivingCheck> {
  const env = o.env || process.env
  const key = resendReceivingKey(env)
  const keyName = resendReceivingKeyName(env)
  const checkedAt = new Date().toISOString()
  if (!key) return { status: 'no-key', label: 'not set up: no Resend API key', keyName, help: 'Add a Full access Resend key in Vercel as RESEND_RECEIVING_API_KEY, then redeploy.', checkedAt }
  try {
    const res = await (o.fetchImpl || fetch)('https://api.resend.com/emails/receiving?limit=1', { headers: { Authorization: `Bearer ${key}` } })
    if (res.ok) return { status: 'working', label: 'working', keyName, httpStatus: res.status, checkedAt }
    const err = await resendErrorOf(res)
    if (receivingFailureOf(res.status, err.name) === 'unauthorised') {
      return { status: 'blocked', label: 'blocked: key can only send', keyName, httpStatus: res.status, errorName: err.name, help: receivingKeyHelp(env), checkedAt }
    }
    return { status: 'error', label: `couldn’t check (Resend answered ${res.status})`, keyName, httpStatus: res.status, errorName: err.name, checkedAt }
  } catch (e: any) {
    return { status: 'error', label: `couldn’t check (${String(e?.message || 'network error').slice(0, 80)})`, keyName, checkedAt }
  }
}

// The health pages poll; one Resend call every few minutes is plenty.
let cached: { at: number; key: string; result: ReceivingCheck } | null = null
/** checkResendReceiving, remembered for `ttlMs` (default 5 minutes) per key. */
export async function checkResendReceivingCached(o: { fetchImpl?: typeof fetch; env?: Env; ttlMs?: number } = {}): Promise<ReceivingCheck> {
  const k = `${resendReceivingKeyName(o.env || process.env)}:${(resendReceivingKey(o.env || process.env) || '').slice(-6)}`
  const ttl = o.ttlMs ?? 5 * 60_000
  if (cached && cached.key === k && Date.now() - cached.at < ttl) return cached.result
  const result = await checkResendReceiving(o)
  // Don't remember a network blip for long.
  cached = { at: result.status === 'error' ? Date.now() - ttl + 30_000 : Date.now(), key: k, result }
  return result
}
/** Tests only. */
export function resetReceivingCheckCache() { cached = null }

export const RECEIVING_ALERT_SETTING = 'resend_receiving_alert'

/**
 * Tell the Colvy team (super admin), at most once a day, that a customer's
 * email arrived but its text couldn't be read from Resend. Same channel as the
 * billing alert (bell in Colvy's workspace + email). Never throws.
 */
export async function alertEmailBodyPending(db: any, info: { reason: ReceivingFailure; status?: number; companyId?: string | null; detail?: string | null }, deps: { notify?: (db: any, message: string) => Promise<void>; email?: (subject: string, text: string) => Promise<void>; now?: Date } = {}): Promise<boolean> {
  try {
    const { alertColvyTeamOncePerDay } = await import('@/lib/billing-alert')
    const message = info.reason === 'unauthorised'
      ? `Customer email replies are arriving without their text: Resend refused Colvy’s key when reading a received email (Resend answered ${info.status || 401}). ${receivingKeyHelp()} The replies are kept as “pending” and filled in automatically once the key works (or use super admin → Overview → Email health → Recover empty email replies).`
      : `A customer email arrived but Colvy couldn’t load its text from Resend yet (${info.reason}${info.status ? `, Resend answered ${info.status}` : ''}). Colvy will try again automatically; see super admin → Overview → Email health.`
    return await alertColvyTeamOncePerDay(db, {
      key: RECEIVING_ALERT_SETTING, message,
      subject: info.reason === 'unauthorised' ? 'Colvy can’t read customer email replies: Resend key can only send' : 'Colvy couldn’t load a customer email’s text',
      value: { reason: info.reason, status: info.status || null, companyId: info.companyId || null, detail: info.detail || null },
      updatedBy: 'inbound-email',
    }, deps)
  } catch { return false }
}
