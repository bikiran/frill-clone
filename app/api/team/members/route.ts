import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { newInviteToken } from '@/lib/invite-token'
import {
  loadTeam, checkInvite, checkUpdate, checkRemove, guardTarget, canManageTeamRole,
  cleanPermissions, cleanPhone, cleanText, cleanUrl, cleanEmail, isUuid,
  roleOf, normRole, memberLabel, logTeamEvent, ROLE_LABEL,
  type TeamContext, type TeamRow,
} from '@/lib/team-management'

export const dynamic = 'force-dynamic'

/**
 * Team management — the only way to change who is in a workspace and what they
 * can do. The Team page used to write team_members straight from the browser,
 * which needed a database rule letting ANYONE write that table (so anyone could
 * make themselves an admin of any business). The rules live in
 * lib/team-management.ts; every change is written to the audit log.
 *
 *   GET    ?companyId=                       → the caller's role, and whether they can manage
 *   POST   { companyId, email, role }         → invite (returns the link's code once)
 *   POST   { companyId, action: 'resend', memberId } → fresh invite code
 *   PATCH  { companyId, memberId, ...fields } → role, permissions, default_location_id,
 *                                               phone, name, avatar_url, department
 *   DELETE { companyId, memberId }            → remove from the team
 */

const service = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
) as any

const fail = (status: number, error: string) => NextResponse.json({ error }, { status })

// The bits of a row the page needs back (never the invite hash).
const publicRow = (r: TeamRow | null | undefined) => {
  if (!r) return null
  const rest: TeamRow = { ...r }
  delete rest.invite_token_hash
  return rest
}

const findMember = (ctx: TeamContext, memberId: unknown): TeamRow | null =>
  isUuid(memberId) ? ctx.rows.find(r => r.id === memberId) || null : null

const missingColumn = (msg: string) => /column|schema cache/i.test(msg || '')

export async function GET(req: NextRequest) {
  const db = service()
  const t = await loadTeam(req, db, req.nextUrl.searchParams.get('companyId'))
  if (!t.ok) return fail(t.status!, t.error!)
  return NextResponse.json({ role: t.ctx!.caller.role, canManage: canManageTeamRole(t.ctx!.caller.role) })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const db = service()
    const t = await loadTeam(req, db, body?.companyId)
    if (!t.ok) return fail(t.status!, t.error!)
    const ctx = t.ctx!
    const company = { id: ctx.company.id, name: ctx.company.name || null, slug: ctx.company.slug || null }

    // ── Resend: a fresh code, so the old link stops working ────────────────
    if (body?.action === 'resend') {
      const target = findMember(ctx, body.memberId)
      const v = guardTarget(ctx, target)
      if (!v.ok) return fail(v.status!, v.error!)
      if (String(target!.status || '').toLowerCase() === 'active') return fail(400, 'They’ve already joined.')
      const invite = await newInviteToken()
      const { error } = await db.from('team_members').update({ invite_token_hash: invite.hash })
        .eq('id', target!.id).eq('company_id', ctx.company.id)
      if (error) return fail(500, error.message)
      await logTeamEvent(db, ctx, 'team_member_invite_resent', `Re-sent the invite to ${target!.email}`, target, {}, req)
      return NextResponse.json({ ok: true, token: invite.token, company, member: publicRow(target) })
    }

    // ── Invite ─────────────────────────────────────────────────────────────
    const role = normRole(body?.role || 'editor')
    const v = checkInvite(ctx, body?.role || 'editor')
    if (!v.ok) return fail(v.status!, v.error!)
    const email = cleanEmail(body?.email)
    if (!email) return fail(400, 'That email address doesn’t look right.')

    const already = ctx.rows.find(r => String(r.email || '').toLowerCase() === email)
    if (already) {
      const joined = String(already.status || '').toLowerCase() === 'active'
      return fail(409, joined ? `${email} is already on the team.` : `${email} already has an invite — use Resend to send a new link.`)
    }

    const invite = await newInviteToken()
    const { data: row, error } = await db.from('team_members').insert({
      email,
      role,
      status: 'invited',
      invited_by: ctx.caller.userId,
      company_id: ctx.company.id,
      invite_token_hash: invite.hash,
    }).select('*').maybeSingle()
    if (error) {
      if (error.code === '23505') return fail(409, `${email} is already on the team.`)
      return fail(500, error.message)
    }
    await logTeamEvent(db, ctx, 'team_member_invited', `Invited ${email} as ${ROLE_LABEL[role]}`, row || { email }, { after: { role, status: 'invited' } }, req)
    return NextResponse.json({ ok: true, token: invite.token, company, member: publicRow(row) })
  } catch (e) {
    console.error('[team/members POST]', (e as Error)?.message || e)
    return fail(500, 'Could not save that change.')
  }
}

// Field name → how to clean it. Anything else in the body is ignored.
const FIELDS: Record<string, (v: unknown) => unknown> = {
  role: v => (typeof v === 'string' ? v.trim().toLowerCase() : undefined),
  permissions: cleanPermissions,
  default_location_id: v => (v == null || v === '' ? null : isUuid(v) ? v : undefined),
  phone: cleanPhone,
  name: v => cleanText(v, 120),
  avatar_url: cleanUrl,
  department: v => cleanText(v, 60),
}
const FIELD_LABEL: Record<string, string> = {
  default_location_id: 'default outlet', phone: 'mobile', name: 'name', avatar_url: 'photo', department: 'department',
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const db = service()
    const t = await loadTeam(req, db, body?.companyId)
    if (!t.ok) return fail(t.status!, t.error!)
    const ctx = t.ctx!
    const target = findMember(ctx, body?.memberId)

    const patch: Record<string, unknown> = {}
    for (const [k, clean] of Object.entries(FIELDS)) {
      if (!(k in (body || {}))) continue
      const v = clean(body[k])
      if (v === undefined) return fail(400, k === 'phone' ? 'That doesn’t look like a mobile number.' : `That ${FIELD_LABEL[k] || k} isn’t valid.`)
      patch[k] = v
    }
    if (!Object.keys(patch).length) return fail(400, 'Nothing to change.')

    const v = checkUpdate(ctx, target, patch)
    if (!v.ok) return fail(v.status!, v.error!)

    // An outlet has to be one of this workspace's own.
    if (patch.default_location_id) {
      const { data: loc } = await db.from('company_locations').select('id')
        .eq('id', patch.default_location_id).eq('company_id', ctx.company.id).maybeSingle()
      if (!loc) return fail(400, 'That outlet isn’t part of this workspace.')
    }

    const { data: updated, error } = await db.from('team_members').update(patch)
      .eq('id', target!.id).eq('company_id', ctx.company.id).select('*').maybeSingle()
    if (error) {
      return fail(500, missingColumn(error.message)
        ? `Could not save: ${error.message} — a database update is needed first (see migrations COLVY_V213, V306–V308).`
        : error.message)
    }

    // The audit trail: one entry per kind of change, with before and after.
    const who = memberLabel(target)
    if ('role' in patch && normRole(patch.role) !== roleOf(target, ctx.company)) {
      const before = roleOf(target, ctx.company)
      const after = normRole(patch.role)
      await logTeamEvent(db, ctx, 'team_member_role_changed',
        `Changed ${who}’s role from ${ROLE_LABEL[before]} to ${ROLE_LABEL[after]}`, target,
        { before: { role: before }, after: { role: after } }, req)
    }
    if ('permissions' in patch) {
      const before = target!.permissions && typeof target!.permissions === 'object' ? target!.permissions : null
      const after = patch.permissions as Record<string, boolean> | null
      const off = after ? Object.keys(after).filter(k => after[k] === false) : []
      await logTeamEvent(db, ctx, 'team_member_permissions_changed',
        after ? `Changed ${who}’s permissions (${off.length ? `${off.length} feature${off.length === 1 ? '' : 's'} off` : 'everything on'})` : `Gave ${who} full access`,
        target, { before: { permissions: before }, after: { permissions: after } }, req)
    }
    const other = Object.keys(patch).filter(k => k !== 'role' && k !== 'permissions' && patch[k] !== (target![k] ?? null))
    if (other.length) {
      await logTeamEvent(db, ctx, 'team_member_updated',
        `Updated ${who}’s ${other.map(k => FIELD_LABEL[k] || k).join(', ')}`, target,
        { before: Object.fromEntries(other.map(k => [k, target![k] ?? null])), after: Object.fromEntries(other.map(k => [k, patch[k]])) }, req)
    }

    return NextResponse.json({ ok: true, member: publicRow(updated || { ...target, ...patch }) })
  } catch (e) {
    console.error('[team/members PATCH]', (e as Error)?.message || e)
    return fail(500, 'Could not save that change.')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const db = service()
    const t = await loadTeam(req, db, body?.companyId)
    if (!t.ok) return fail(t.status!, t.error!)
    const ctx = t.ctx!
    const target = findMember(ctx, body?.memberId)
    const v = checkRemove(ctx, target)
    if (!v.ok) return fail(v.status!, v.error!)

    const { error } = await db.from('team_members').delete().eq('id', target!.id).eq('company_id', ctx.company.id)
    if (error) return fail(500, error.message)

    const role = roleOf(target, ctx.company)
    await logTeamEvent(db, ctx, 'team_member_removed', `Removed ${memberLabel(target)} (${ROLE_LABEL[role]}) from the team`, target, {
      before: { role, status: target!.status || null, permissions: target!.permissions ?? null, default_location_id: target!.default_location_id ?? null },
    }, req)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[team/members DELETE]', (e as Error)?.message || e)
    return fail(500, 'Could not remove them.')
  }
}
