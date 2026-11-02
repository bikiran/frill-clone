import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { callerUser, requireCompanyAccess, SUPER_ADMIN } from '@/lib/company-access'
import { canRefund, checkRefundPin, isPinRefused, hashPin, isValidPinFormat, isWeakPin, loadPin, refundActor } from '@/lib/refund-guard'
import { audit } from '@/lib/activity-logging'

export const dynamic = 'force-dynamic'

/**
 * The workspace's refund PIN (lib/refund-guard.ts).
 *
 *   GET    ?companyId=                         → { ready, pinSet, canRefund, isOwner, locked }
 *   POST   { companyId, pin, currentPin? }      → set it, or change it (the current PIN is needed)
 *   DELETE { companyId, currentPin }            → remove it
 *
 * Only the owner sets, changes or removes it, and changing or removing needs
 * the current PIN, so a stolen session can't quietly swap it. If the owner
 * forgets it, Colvy support (the platform admin) can clear it.
 */

const service = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
) as any

const fail = (status: number, error: string, extra?: Record<string, unknown>) => NextResponse.json({ error, ...(extra || {}) }, { status })
const NEEDS_DB = 'Refund PINs need a database update first (migration COLVY_V423).'

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId') || ''
  const db = service()
  const access = await requireCompanyAccess(req, db, companyId)
  if (!access.ok || !access.userId) return fail(403, 'Not authorized')
  const [actor, pin] = await Promise.all([refundActor(db, companyId, access.userId), loadPin(db, companyId)])
  const locked = !!(pin.row?.locked_until && new Date(pin.row.locked_until).getTime() > Date.now())
  return NextResponse.json({
    ready: pin.ready,
    pinSet: !!pin.row,
    canRefund: canRefund(actor),
    isOwner: actor?.role === 'owner',
    locked,
    setAt: pin.row?.set_at || null,
  })
}

async function ownerOnly(req: NextRequest, db: any, companyId: string) {
  const user = await callerUser(req, db)
  if (!user || !companyId) return { ok: false as const, res: fail(403, 'Not authorized') }
  const actor = await refundActor(db, companyId, user.id)
  if (actor?.role !== 'owner') return { ok: false as const, res: fail(403, 'Only the workspace owner can change the refund PIN.') }
  return { ok: true as const, user, actor }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const companyId = String(body?.companyId || '')
    const db = service()
    const o = await ownerOnly(req, db, companyId)
    if (!o.ok) return o.res
    const pin = String(body?.pin ?? '')
    if (!isValidPinFormat(pin)) return fail(400, 'Use 4 to 8 digits.')
    if (isWeakPin(pin)) return fail(400, 'That PIN is too easy to guess. Avoid repeated digits and runs like 1234.')

    const existing = await loadPin(db, companyId)
    if (!existing.ready) return fail(409, NEEDS_DB)
    if (existing.row) {
      const c = await checkRefundPin(db, companyId, body?.currentPin, { req, who: o.actor.name || undefined })
      if (isPinRefused(c)) return fail(c.code === 'refund_pin_locked' ? 429 : 403, c.code === 'refund_pin_required' ? 'Enter the current PIN to change it.' : c.error, { code: c.code })
    }
    const pin_hash = await hashPin(pin)
    const { error } = await db.from('refund_pins').upsert({
      company_id: companyId, pin_hash, set_by: o.user.id, set_at: new Date().toISOString(), failed_count: 0, locked_until: null,
    }, { onConflict: 'company_id' })
    if (error) return fail(500, error.message)
    await audit(req, db, companyId, existing.row ? 'refund_pin_changed' : 'refund_pin_set',
      existing.row ? 'Changed the refund PIN' : 'Turned on the refund PIN: every refund now needs it')
    return NextResponse.json({ ok: true, pinSet: true })
  } catch (e: any) {
    return fail(500, e?.message || 'Could not save the PIN.')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const companyId = String(body?.companyId || '')
    const db = service()
    const user = await callerUser(req, db)
    if (!user || !companyId) return fail(403, 'Not authorized')
    const support = (user.email || '').toLowerCase() === SUPER_ADMIN
    const actor = await refundActor(db, companyId, user.id)
    if (actor?.role !== 'owner' && !support) return fail(403, 'Only the workspace owner can remove the refund PIN.')

    const existing = await loadPin(db, companyId)
    if (!existing.ready) return fail(409, NEEDS_DB)
    if (!existing.row) return NextResponse.json({ ok: true, pinSet: false })
    // The owner proves they know it; Colvy support can clear a forgotten one.
    if (actor?.role === 'owner') {
      const c = await checkRefundPin(db, companyId, body?.currentPin, { req, who: actor.name || undefined })
      if (isPinRefused(c)) return fail(c.code === 'refund_pin_locked' ? 429 : 403, c.code === 'refund_pin_required' ? 'Enter the current PIN to remove it.' : c.error, { code: c.code })
    }
    const { error } = await db.from('refund_pins').delete().eq('company_id', companyId)
    if (error) return fail(500, error.message)
    await audit(req, db, companyId, 'refund_pin_removed', actor?.role === 'owner' ? 'Turned off the refund PIN' : 'Colvy support cleared the refund PIN')
    return NextResponse.json({ ok: true, pinSet: false })
  } catch (e: any) {
    return fail(500, e?.message || 'Could not remove the PIN.')
  }
}
