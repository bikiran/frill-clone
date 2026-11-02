import { randomBytes, scrypt, timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'
import { callerUser, isStaffRow } from '@/lib/company-access'
import { isInternalCall } from '@/lib/internal-call'
import { canUseFeature, hasFullAccess } from '@/lib/permissions'
import { audit } from '@/lib/activity-logging'

// Who may refund, and the workspace's refund PIN. Every route that moves money
// back to a customer (order refunds, DOA refunds and store credit, payment-link
// refunds) calls guardRefund before it does anything:
//
//   1. The caller is a signed-in staff member of the workspace (owner of
//      record, or a team row that isn't a board visitor or removed). A
//      server-to-server call (the AI assistant) must say which person it acts
//      for, and that person is checked the same way.
//   2. They may issue refunds: owners and admins always; anyone else only when
//      "Issue refunds" is turned on for them on the Team page. Members can't
//      change their own permissions (lib/team-management) or their own row
//      (V364), so they can't grant this to themselves.
//   3. If the workspace has a refund PIN (set by the owner), the request carries
//      it and it matches. Five wrong tries in a row lock refunds for 15 minutes.
//      The PIN is a salted scrypt hash in refund_pins, a table only the server
//      can read (V423).

const PIN_RE = /^\d{4,8}$/
const MAX_TRIES = 5
const LOCK_MS = 15 * 60 * 1000
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 96 * 1024 * 1024 }

const scryptAsync = (pin: string, salt: Buffer) => new Promise<Buffer>((resolve, reject) =>
  scrypt(pin, salt, 32, SCRYPT, (err, key) => (err ? reject(err) : resolve(key))))

export const isValidPinFormat = (pin: unknown): pin is string => typeof pin === 'string' && PIN_RE.test(pin)

/** All one digit (1111), or a run up or down (1234, 9876): too easy to guess. */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true
  const d = pin.split('').map(Number)
  const up = d.every((v, i) => i === 0 || v === (d[i - 1] + 1) % 10)
  const down = d.every((v, i) => i === 0 || v === (d[i - 1] + 9) % 10)
  return up || down
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scryptAsync(pin, salt)
  return `s1$${salt.toString('base64')}$${key.toString('base64')}`
}

async function pinMatches(pin: string, stored: string): Promise<boolean> {
  const [v, s, h] = String(stored || '').split('$')
  if (v !== 's1' || !s || !h) return false
  const want = Buffer.from(h, 'base64')
  const got = await scryptAsync(pin, Buffer.from(s, 'base64'))
  return want.length === got.length && timingSafeEqual(want, got)
}

const missingTable = (e: any) => !!e && /refund_pins|does not exist|schema cache|relation/i.test(String(e.message || e))

export type PinRow = { company_id: string; pin_hash: string; set_by: string | null; set_at: string; failed_count: number; locked_until: string | null }

/** The workspace's PIN row: { ready:false } until V423 has been run. */
export async function loadPin(db: any, companyId: string): Promise<{ ready: boolean; row: PinRow | null }> {
  try {
    const { data, error } = await db.from('refund_pins').select('*').eq('company_id', companyId).maybeSingle()
    if (error) return { ready: !missingTable(error), row: null }
    return { ready: true, row: data || null }
  } catch { return { ready: false, row: null } }
}

export type PinCheck =
  | { ok: true; required: boolean }
  | { ok: false; code: 'refund_pin_required' | 'refund_pin_wrong' | 'refund_pin_locked'; error: string; attemptsLeft?: number; lockedUntil?: string }

const lockedMsg = (until: string) => {
  const mins = Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / 60000))
  return `Too many wrong PINs. Refunds are locked for ${mins} more minute${mins === 1 ? '' : 's'}.`
}

/**
 * Checks a PIN against the workspace's. No PIN set (or V423 not run yet) →
 * nothing required. Counts wrong tries and locks after MAX_TRIES.
 */
export async function checkRefundPin(db: any, companyId: string, pin: unknown, meta?: { req?: Request; who?: string }): Promise<PinCheck> {
  const { row } = await loadPin(db, companyId)
  if (!row) return { ok: true, required: false }
  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    return { ok: false, code: 'refund_pin_locked', error: lockedMsg(row.locked_until), lockedUntil: row.locked_until }
  }
  if (!isValidPinFormat(pin)) {
    if (pin == null || pin === '') return { ok: false, code: 'refund_pin_required', error: 'Enter the refund PIN.' }
    // A malformed PIN still counts as a try, so it can't be used to probe.
  } else if (await pinMatches(pin, row.pin_hash)) {
    if (row.failed_count || row.locked_until) {
      await db.from('refund_pins').update({ failed_count: 0, locked_until: null }).eq('company_id', companyId)
    }
    return { ok: true, required: true }
  }
  const tries = (row.failed_count || 0) + 1
  if (tries >= MAX_TRIES) {
    const until = new Date(Date.now() + LOCK_MS).toISOString()
    await db.from('refund_pins').update({ failed_count: 0, locked_until: until }).eq('company_id', companyId)
    if (meta?.req) await audit(meta.req, db, companyId, 'refund_pin_locked', `Refunds locked for 15 minutes after ${MAX_TRIES} wrong refund PINs${meta.who ? ` (last try by ${meta.who})` : ''}`)
    return { ok: false, code: 'refund_pin_locked', error: lockedMsg(until), lockedUntil: until }
  }
  await db.from('refund_pins').update({ failed_count: tries }).eq('company_id', companyId)
  if (meta?.req) await audit(meta.req, db, companyId, 'refund_pin_failed', `Wrong refund PIN${meta.who ? ` from ${meta.who}` : ''} (${MAX_TRIES - tries} tr${MAX_TRIES - tries === 1 ? 'y' : 'ies'} left)`)
  const left = MAX_TRIES - tries
  return { ok: false, code: 'refund_pin_wrong', error: `That PIN isn’t right. ${left} tr${left === 1 ? 'y' : 'ies'} left before refunds lock for 15 minutes.`, attemptsLeft: left }
}

export type RefundActor = { userId: string; role: string; name: string; perms: Record<string, boolean> | null }

/** The person's standing in the workspace, or null when they aren't staff. */
export async function refundActor(db: any, companyId: string, userId: string): Promise<RefundActor | null> {
  const [{ data: co }, { data: rows }] = await Promise.all([
    db.from('companies').select('owner_id').eq('id', companyId).maybeSingle(),
    db.from('team_members').select('role, status, permissions, name, email').eq('company_id', companyId).eq('user_id', userId).limit(5),
  ])
  const staff = (rows || []).filter(isStaffRow)
  const named = staff[0]?.name || staff[0]?.email || ''
  if (co?.owner_id && co.owner_id === userId) return { userId, role: 'owner', name: named, perms: null }
  if (!staff.length) return null
  const rank = (r: any) => ({ owner: 0, admin: 1 } as Record<string, number>)[String(r.role || '').toLowerCase()] ?? 2
  const best = staff.slice().sort((a: any, b: any) => rank(a) - rank(b))[0]
  const perms = best.permissions && typeof best.permissions === 'object' ? best.permissions : null
  return { userId, role: String(best.role || '').toLowerCase(), name: best.name || best.email || '', perms }
}

export const canRefund = (a: RefundActor | null) => !!a && (hasFullAccess(a.role) || canUseFeature(a.role, a.perms, 'refunds'))

export type RefundGuard =
  | { ok: true; actor: RefundActor; pinRequired: boolean }
  | { ok: false; status: number; error: string; code?: string; attemptsLeft?: number; lockedUntil?: string }

/**
 * The one check before any refund. `actorUserId` is only honoured on a
 * server-to-server call (it can't be supplied from a browser).
 */
export async function guardRefund(req: NextRequest, db: any, companyId: string, opts: { pin?: unknown; actorUserId?: unknown } = {}): Promise<RefundGuard> {
  if (!companyId) return { ok: false, status: 400, error: 'Missing companyId' }
  let userId: string | null = null
  if (isInternalCall(req)) userId = typeof opts.actorUserId === 'string' && opts.actorUserId ? opts.actorUserId : null
  else userId = (await callerUser(req, db))?.id || null
  if (!userId) return { ok: false, status: 403, error: 'Not authorized' }

  const actor = await refundActor(db, companyId, userId)
  if (!actor) return { ok: false, status: 403, error: 'Not authorized' }
  if (!canRefund(actor)) {
    await audit(req, db, companyId, 'refund_denied', `Refund refused: ${actor.name || 'a team member'} doesn’t have “Issue refunds”`)
    return { ok: false, status: 403, code: 'refund_not_allowed', error: 'You don’t have permission to issue refunds. The owner can turn on “Issue refunds” for you on the Team page.' }
  }
  const pin = await checkRefundPin(db, companyId, opts.pin, { req, who: actor.name || undefined })
  if (isPinRefused(pin)) return { ok: false, status: pin.code === 'refund_pin_locked' ? 429 : 403, code: pin.code, error: pin.error, attemptsLeft: pin.attemptsLeft, lockedUntil: pin.lockedUntil }
  return { ok: true, actor, pinRequired: (pin as Extract<PinCheck, { ok: true }>).required }
}

type Refused = Extract<RefundGuard, { ok: false }>
type PinRefused = Extract<PinCheck, { ok: false }>
/** Type guards (this project doesn't narrow `ok` unions on its own). */
export const isRefused = (g: RefundGuard): g is Refused => !g.ok
export const isPinRefused = (c: PinCheck): c is PinRefused => !c.ok

/** A refused guard as a JSON body (the code lets the app ask for the PIN). */
export const guardBody = (g: Refused) =>
  ({ error: g.error, ...(g.code ? { code: g.code } : {}), ...(g.attemptsLeft != null ? { attemptsLeft: g.attemptsLeft } : {}), ...(g.lockedUntil ? { lockedUntil: g.lockedUntil } : {}) })
