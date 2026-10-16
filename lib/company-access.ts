// Server-side check that the caller may act for a company. Used by API routes
// that read/write company data with the service-role key.

import type { NextRequest } from 'next/server'
import { loadStaffRows } from '@/lib/team-list'

export const SUPER_ADMIN = 'bishalstha76@gmail.com'

// Checking a sign-in token is a round trip to Supabase Auth. A page like AI
// Agents fires several requests at once with the same token, so a verified
// token is remembered for a few seconds on this server instance. Short enough
// that signing out still takes effect almost straight away.
const VERIFIED_TTL_MS = 20_000
const verified = new Map<string, { user: any; at: number }>()

// An error that isn't a 4xx answer: the service didn't answer (network, a
// timeout, a 5xx), as opposed to turning the request down.
const noAnswer = (error: any, status?: number) => {
  if (!error) return false
  const s = Number(status ?? error?.status)
  return !(s >= 400 && s < 500)
}

// The token's user; with no user, `unavailable` says Supabase Auth didn't
// answer rather than rejecting the token.
async function checkToken(db: any, token: string): Promise<{ user: any | null; unavailable: boolean }> {
  if (!token) return { user: null, unavailable: false }
  const hit = verified.get(token)
  if (hit && Date.now() - hit.at < VERIFIED_TTL_MS) return { user: hit.user, unavailable: false }
  const { data, error } = await db.auth.getUser(token)
  const user = data?.user || null
  if (user) {
    if (verified.size > 500) verified.clear()
    verified.set(token, { user, at: Date.now() })
  } else verified.delete(token)
  return { user, unavailable: !user && noAnswer(error) }
}

/** The user behind an access token (checked with Supabase Auth), or null. */
export async function verifyToken(db: any, token: string): Promise<any | null> {
  return (await checkToken(db, token)).user
}

export const bearerToken = (req: NextRequest) => (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')

// The caller (Bearer access token) must be the company's owner, one of its team
// members, or the platform super-admin.
//
// A refusal carries `unavailable: true` when the answer is really "couldn't
// check just now" (Supabase Auth or the database didn't answer). Most routes
// refuse either way; one that must not mistake a blip for "not a member"
// (GET /api/setup/status, which /onboarding uses to pick a workspace) can
// answer 503 instead of 403.
export async function requireCompanyAccess(req: NextRequest, db: any, companyId: string | null | undefined): Promise<{ ok: boolean; userId?: string; unavailable?: boolean }> {
  try {
    const token = bearerToken(req)
    if (!token || !companyId) return { ok: false }
    const { user, unavailable } = await checkToken(db, token)
    if (!user) return unavailable ? { ok: false, unavailable } : { ok: false }
    if (user.email === SUPER_ADMIN) return { ok: true, userId: user.id }
    // Owner and team checks run together rather than one after the other.
    const read = async (q: () => PromiseLike<any>) => { try { return await q() } catch (error) { return { data: null, error } } }
    const [own, team] = await Promise.all([
      read(() => db.from('companies').select('id').eq('id', companyId).eq('owner_id', user.id).maybeSingle()),
      read(() => db.from('team_members').select('id, role, status').eq('company_id', companyId).eq('user_id', user.id).limit(5)),
    ])
    if (own?.data || (team?.data || []).some(isStaffRow)) return { ok: true, userId: user.id }
    if (noAnswer(own?.error, own?.status) || noAnswer(team?.error, team?.status)) return { ok: false, unavailable: true }
    return { ok: false }
  } catch { return { ok: false, unavailable: true } }
}

// Staff are team rows that aren't board visitors and haven't been removed.
// Anyone who signs up on a business's subdomain is added to its team as a
// 'viewer' (app/auth/callback), and the admin already keeps viewers out
// (only owner / admin / editor get in), so a viewer row is not membership.
export function isStaffRow(r: any): boolean {
  if (!r) return false
  const role = String(r.role || '').toLowerCase()
  const status = String(r.status || '').toLowerCase()
  return role !== 'viewer' && status !== 'removed'
}

/**
 * A workspace's staff by user id: its owner and everyone with a staff row (not
 * a board visitor, not a removed member). Who a company-wide notification,
 * email or push may reach. If the team can't be read, just the owner.
 */
export async function staffUserIds(db: any, companyId: string): Promise<Set<string>> {
  const [{ data: co }, rows] = await Promise.all([
    db.from('companies').select('owner_id').eq('id', companyId).maybeSingle(),
    loadStaffRows(db, companyId, 'user_id, role, status').catch((e: Error) => {
      console.error('[staffUserIds] could not read the team', e?.message)
      return [] as any[]
    }),
  ])
  const ids = new Set<string>()
  if (co?.owner_id) ids.add(co.owner_id)
  for (const r of rows) if (r.user_id && isStaffRow(r)) ids.add(r.user_id)
  return ids
}

export async function isStaffMember(db: any, companyId: string | null | undefined, userId: string | null | undefined): Promise<boolean> {
  if (!companyId || !userId) return false
  try {
    const { data } = await db.from('team_members').select('id, role, status')
      .eq('company_id', companyId).eq('user_id', userId).limit(5)
    return (data || []).some(isStaffRow)
  } catch { return false }
}

// The signed-in user behind the request's Bearer token, or null.
export async function callerUser(req: NextRequest, db: any): Promise<{ id: string; email?: string } | null> {
  try {
    const user = await verifyToken(db, bearerToken(req))
    return user ? { id: user.id, email: user.email || undefined } : null
  } catch { return null }
}

// The caller's own Stripe billing customer (subscriptions.stripe_customer_id).
export async function callerStripeCustomer(req: NextRequest, db: any): Promise<string | null> {
  const user = await callerUser(req, db)
  if (!user) return null
  const { data } = await db.from('subscriptions').select('stripe_customer_id').eq('user_id', user.id).maybeSingle()
  return data?.stripe_customer_id || null
}

// For routes without a db client at hand: a 403 response unless the caller is
// a workspace member (or our own server, when allowInternal), else null.
export async function memberOr403(req: NextRequest, companyId: string | null | undefined, opts?: { allowInternal?: boolean }) {
  const { NextResponse } = await import('next/server')
  if (opts?.allowInternal) {
    const { isInternalCall } = await import('@/lib/internal-call')
    if (isInternalCall(req)) return null
  }
  const { createClient } = await import('@supabase/supabase-js')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
  if ((await requireCompanyAccess(req, db, companyId)).ok) return null
  return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
}
