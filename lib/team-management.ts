// Team management rules (server only — pass a service-role Supabase client).
//
// The Team page used to write team_members straight from the browser: role
// changes, permission maps, removals, default outlets, invites. That only
// worked because the table's rule was "Anyone can manage team members" — so
// any signed-in person, or anyone holding the public key that ships in the web
// bundle and the mobile app, could make themselves an admin of any workspace.
//
// Every change now goes through /api/team/members (and /api/admin/create-user),
// and these are the rules both apply:
//   • only the owner or an admin may change the team;
//   • nobody may raise their own role;
//   • admins can't change or remove an owner;
//   • the workspace owner (companies.owner_id) can't be demoted or removed from
//     here, and a workspace always keeps at least one owner;
//   • a member can only be changed through the workspace they belong to.
// The database (COLVY_V364) now refuses direct writes from the browser, so
// these checks are the only way in.

import type { NextRequest } from 'next/server'
import { verifyToken, bearerToken, SUPER_ADMIN } from '@/lib/company-access'
import { ALL_FEATURE_KEYS } from '@/lib/permissions'
import { logActivity, type ActivityType } from '@/lib/activity-logging'

export type TeamRole = 'owner' | 'admin' | 'editor' | 'viewer'

export const ROLE_RANK: Record<TeamRole, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 }

// Roles the Team page hands out. Ownership isn't given away from here.
export const ASSIGNABLE_ROLES: TeamRole[] = ['admin', 'editor', 'viewer']

// The names people see ('editor' has been shown as "Agent" for a long time).
export const ROLE_LABEL: Record<TeamRole, string> = { owner: 'Owner', admin: 'Admin', editor: 'Agent', viewer: 'Viewer' }

export type TeamCompany = { id: string; owner_id: string | null; name?: string | null; slug?: string | null }
export type TeamCaller = { userId: string; email: string; role: TeamRole; platformAdmin: boolean }
// A team_members row. Only the columns the rules read are named; the rest
// (permissions, phone, outlet, profile…) ride along untyped.
export type TeamRow = {
  id?: string; company_id?: string | null; user_id?: string | null
  email?: string | null; role?: string | null; status?: string | null
  [column: string]: unknown
}
// `rows` is NOT the whole team: only the caller's own rows and every owner row,
// which is all the rules below read (see teamContextFor).
export type TeamContext = { company: TeamCompany; rows: TeamRow[]; caller: TeamCaller }

// One shape rather than a union: this project compiles with strict off, which
// stops a { ok: true } | { ok: false } union from narrowing.
export type Verdict = { ok: boolean; status?: number; error?: string }
const OK: Verdict = { ok: true }
const deny = (status: number, error: string): Verdict => ({ ok: false, status, error })

export const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

export function normRole(r: unknown): TeamRole {
  const v = String(r ?? '').trim().toLowerCase()
  if (v === 'owner' || v === 'admin' || v === 'editor' || v === 'viewer') return v
  // A blank role is the column's default ('editor'); anything we don't
  // recognise gets the least access.
  return v === '' ? 'editor' : 'viewer'
}

const isRemoved = (r: TeamRow | null | undefined) => String(r?.status || '').toLowerCase() === 'removed'
const lower = (v: unknown) => String(v || '').trim().toLowerCase()

/** A member's effective role. The company's owner of record is always an owner. */
export function roleOf(row: TeamRow | null | undefined, company: TeamCompany): TeamRole {
  if (row?.user_id && company.owner_id && row.user_id === company.owner_id) return 'owner'
  return normRole(row?.role)
}

/** The signed-in person's role in this workspace, or null when they aren't in it. */
export function callerRole(user: { id: string; email?: string | null }, company: TeamCompany, rows: TeamRow[]): { role: TeamRole | null; platformAdmin: boolean } {
  if (lower(user.email) === SUPER_ADMIN) return { role: 'owner', platformAdmin: true }
  if (company.owner_id && company.owner_id === user.id) return { role: 'owner', platformAdmin: false }
  let best: TeamRole | null = null
  for (const r of rows || []) {
    if (r.user_id !== user.id || isRemoved(r)) continue
    const role = normRole(r.role)
    if (!best || ROLE_RANK[role] > ROLE_RANK[best]) best = role
  }
  return { role: best, platformAdmin: false }
}

export const canManageTeamRole = (role: TeamRole | null | undefined) => !!role && ROLE_RANK[role] >= ROLE_RANK.admin

/** Is this team row the caller's own? (An invite not yet accepted matches on email.) */
export function isSelf(caller: TeamCaller, row: TeamRow | null | undefined): boolean {
  if (row?.user_id) return row.user_id === caller.userId
  return !!caller.email && lower(row?.email) === lower(caller.email)
}

/**
 * Everyone who counts as an owner: the owner of record plus signed-up members
 * whose row says 'owner'. An owner invite nobody has accepted yet doesn't
 * count — it can't run the workspace.
 */
export function ownerIds(company: TeamCompany, rows: TeamRow[]): Set<string> {
  const ids = new Set<string>()
  if (company.owner_id) ids.add(company.owner_id)
  for (const r of rows || []) {
    if (!r.user_id || isRemoved(r) || normRole(r.role) !== 'owner') continue
    ids.add(r.user_id)
  }
  return ids
}

export function isLastOwner(target: TeamRow | null | undefined, company: TeamCompany, rows: TeamRow[]): boolean {
  if (!target?.user_id || roleOf(target, company) !== 'owner') return false
  const ids = ownerIds(company, rows)
  if (!ids.has(target.user_id)) return false
  ids.delete(target.user_id)
  return ids.size === 0
}

const isOwnerOfRecord = (target: TeamRow | null | undefined, company: TeamCompany) =>
  !!target?.user_id && !!company.owner_id && target.user_id === company.owner_id

/** May the caller touch this member at all? */
export function guardTarget(ctx: TeamContext, target: TeamRow | null | undefined): Verdict {
  if (!canManageTeamRole(ctx.caller.role)) return deny(403, 'Only the owner or an admin can change the team.')
  // Looked up within the caller's own workspace, so a member of another
  // workspace simply isn't found.
  if (!target || target.company_id !== ctx.company.id) return deny(404, 'That person isn’t in this workspace.')
  if (roleOf(target, ctx.company) === 'owner' && ctx.caller.role !== 'owner') return deny(403, 'Only an owner can change another owner.')
  return OK
}

/** A role change. allowOwner is for the platform admin's own tools only. */
export function checkRoleChange(ctx: TeamContext, target: TeamRow | null | undefined, nextRole: unknown, opts?: { allowOwner?: boolean }): Verdict {
  const g = guardTarget(ctx, target)
  if (!g.ok) return g
  const raw = lower(nextRole)
  const allowed: string[] = opts?.allowOwner ? ['owner', ...ASSIGNABLE_ROLES] : ASSIGNABLE_ROLES
  if (!allowed.includes(raw)) return deny(400, 'Choose Admin, Agent or Viewer.')
  const next = raw as TeamRole
  const current = roleOf(target, ctx.company)
  if (next === current) return OK
  if (isSelf(ctx.caller, target) && ROLE_RANK[next] > ROLE_RANK[ctx.caller.role]) return deny(403, 'You can’t raise your own role.')
  if (ROLE_RANK[next] > ROLE_RANK[ctx.caller.role]) return deny(403, 'You can’t give someone more access than you have.')
  if (isOwnerOfRecord(target, ctx.company)) return deny(403, 'The workspace owner can’t be demoted here.')
  if (current === 'owner' && isLastOwner(target, ctx.company, ctx.rows)) return deny(403, 'A workspace needs at least one owner.')
  return OK
}

/** Any change to a member through PATCH. `patch` has already been cleaned. */
export function checkUpdate(ctx: TeamContext, target: TeamRow | null | undefined, patch: Record<string, unknown>): Verdict {
  const g = guardTarget(ctx, target)
  if (!g.ok) return g
  if ('role' in patch) {
    const v = checkRoleChange(ctx, target, patch.role)
    if (!v.ok) return v
  }
  // Owners and admins always have full access, so this only ever matters to
  // someone trying to widen their own — refuse it outright.
  if ('permissions' in patch && isSelf(ctx.caller, target)) return deny(403, 'You can’t change your own permissions.')
  return OK
}

export function checkRemove(ctx: TeamContext, target: TeamRow | null | undefined): Verdict {
  const g = guardTarget(ctx, target)
  if (!g.ok) return g
  if (isOwnerOfRecord(target, ctx.company)) return deny(403, 'The workspace owner can’t be removed.')
  if (isLastOwner(target, ctx.company, ctx.rows)) return deny(403, 'A workspace needs at least one owner.')
  return OK
}

export function checkInvite(ctx: TeamContext, role: unknown): Verdict {
  if (!canManageTeamRole(ctx.caller.role)) return deny(403, 'Only the owner or an admin can invite people.')
  if (!ASSIGNABLE_ROLES.includes(lower(role) as TeamRole)) return deny(400, 'Choose Admin, Agent or Viewer.')
  return OK
}

// ── Cleaning what the browser sends ─────────────────────────────────────────
// `undefined` means "not valid"; null means "clear it".

/** A permissions map: only known feature keys, only true/false. */
export function cleanPermissions(v: unknown): Record<string, boolean> | null | undefined {
  if (v === null) return null
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  const map = v as Record<string, unknown>
  const out: Record<string, boolean> = {}
  for (const k of ALL_FEATURE_KEYS) if (typeof map[k] === 'boolean') out[k] = map[k] as boolean
  return out
}

/**
 * Australian mobiles to E.164, the same way the Team page always has:
 * "0405 636 304" and "405636304" both become "+61405636304".
 */
export function cleanPhone(raw: unknown): string | null | undefined {
  if (raw == null) return null
  const t = String(raw).trim()
  if (!t) return null
  let d = t.replace(/[^\d+]/g, '')
  let out: string
  if (d.startsWith('+')) out = '+' + d.slice(1).replace(/\D/g, '')
  else {
    d = d.replace(/\D/g, '')
    if (d.startsWith('61')) out = `+${d}`
    else if (d.startsWith('0')) out = `+61${d.slice(1)}`
    else if (d.length === 9) out = `+61${d}`
    else out = `+${d}`
  }
  return /^\+\d{6,15}$/.test(out) ? out : undefined
}

export function cleanText(raw: unknown, max: number): string | null | undefined {
  if (raw == null) return null
  if (typeof raw !== 'string') return undefined
  const t = raw.trim()
  if (!t) return null
  return t.length > max ? undefined : t
}

export function cleanUrl(raw: unknown): string | null | undefined {
  const t = cleanText(raw, 1000)
  if (t == null) return t
  return /^https?:\/\//i.test(t) ? t : undefined
}

export const cleanEmail = (raw: unknown): string | null => {
  const e = lower(raw)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254 ? e : null
}

// ── Loading who's asking ────────────────────────────────────────────────────

/**
 * The workspace, the caller's role in it, and the team rows the rules read:
 * the caller's own (their role) and every owner's ("at least one owner").
 * Not the whole team: every visitor who signs in on a board gets a 'viewer'
 * row, and past 1,000 rows one query stops returning them all, so callers and
 * members further down would go missing. Look a member up on its own instead.
 */
export async function teamContextFor(db: any, user: { id: string; email?: string | null }, companyId: string): Promise<{ ok: boolean; status?: number; error?: string; ctx?: TeamContext }> {
  const team = () => db.from('team_members').select('*').eq('company_id', companyId)
  const [{ data: company }, mine, owners] = await Promise.all([
    db.from('companies').select('id, owner_id, name, slug').eq('id', companyId).maybeSingle(),
    team().eq('user_id', user.id),
    team().ilike('role', 'owner'),
  ])
  if (!company) return { ok: false, status: 404, error: 'Workspace not found.' }
  const error = mine.error || owners.error
  if (error) return { ok: false, status: 500, error: error.message }
  const rows: TeamRow[] = [...(mine.data || [])]
  for (const r of owners.data || []) if (!rows.some(x => x.id === r.id)) rows.push(r)
  const { role, platformAdmin } = callerRole(user, company, rows)
  if (!role) return { ok: false, status: 403, error: 'Not authorized' }
  return { ok: true, ctx: { company, rows, caller: { userId: user.id, email: lower(user.email), role, platformAdmin } } }
}

/** One member of this workspace by id. A member of another workspace isn't found. */
export async function findTeamMember(db: any, ctx: TeamContext, memberId: unknown): Promise<TeamRow | null> {
  if (!isUuid(memberId)) return null
  const { data, error } = await db.from('team_members').select('*')
    .eq('id', memberId).eq('company_id', ctx.company.id).maybeSingle()
  if (error) throw new Error(error.message)
  return data || null
}

/**
 * An email address as an ilike pattern, so 'Jane@Roxy.Example' still matches.
 * LIKE's wildcards (% and _, and * for PostgREST) can be part of an address, so
 * each is sent as "any one character": 'j_smith@x' would otherwise also match
 * 'j.smith@x', and 'j%' every address starting with j. The pattern can still
 * match a little more than the address, so ALWAYS keep only the rows that pass
 * sameEmail().
 */
export const emailPattern = (email: string) => String(email || '').replace(/[\\%_*]/g, '_')

/** The same address, ignoring case and surrounding spaces. */
export const sameEmail = (a: unknown, b: unknown) => !!lower(a) && lower(a) === lower(b)

/** This workspace's rows for an email address, whatever case they were saved in. */
export async function findTeamMembersByEmail(db: any, ctx: TeamContext, email: string): Promise<TeamRow[]> {
  const { data, error } = await db.from('team_members').select('*')
    .eq('company_id', ctx.company.id).ilike('email', emailPattern(email))
  if (error) throw new Error(error.message)
  return (data || []).filter((r: TeamRow) => sameEmail(r.email, email))
}

/** Same, for a route: the caller comes from the request's Bearer token. */
export async function loadTeam(req: NextRequest, db: any, companyId: unknown): Promise<{ ok: boolean; status?: number; error?: string; ctx?: TeamContext }> {
  if (!isUuid(companyId)) return { ok: false, status: 400, error: 'Missing workspace.' }
  const user = await verifyToken(db, bearerToken(req))
  if (!user) return { ok: false, status: 401, error: 'Please sign in again.' }
  return teamContextFor(db, user, companyId)
}

// ── Audit log ───────────────────────────────────────────────────────────────

export const memberLabel = (m: TeamRow | null | undefined): string => String(m?.name || m?.email || 'a team member')

/** One activity_logs row for a team change: who did it, to whom, before and after. */
export async function logTeamEvent(db: any, ctx: TeamContext, type: ActivityType, description: string, target: TeamRow | null | undefined, extra: Record<string, unknown>, req?: Request) {
  await logActivity(db, {
    company_id: ctx.company.id,
    user_id: ctx.caller.userId,
    activity_type: type,
    description,
    metadata: {
      actor_email: ctx.caller.email || null,
      actor_role: ctx.caller.role,
      ...(ctx.caller.platformAdmin ? { platform_admin: true } : {}),
      member_id: target?.id || null,
      member_user_id: target?.user_id || null,
      member_email: target?.email || null,
      ...extra,
    },
  }, req)
}
