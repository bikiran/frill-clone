// Shared bits for the admin pass routes (app/api/passes/*).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess, requireCompanyAdmin } from '@/lib/company-access'
import { isMissingPassSchema, PASS_HINT } from '@/lib/passes/server'

export const passDb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

export const json = (d: any, status = 200) => NextResponse.json(d, { status, headers: { 'Cache-Control': 'no-store' } })

/** Anyone on the team may look and sell; owners and admins change products, credits and memberships. */
export async function passAccess(req: NextRequest, db: any, companyId: any, level: 'staff' | 'admin') {
  const id = typeof companyId === 'string' && /^[0-9a-f-]{36}$/i.test(companyId) ? companyId : null
  if (!id) return { ok: false as const, res: json({ error: 'companyId required' }, 400) }
  const a = level === 'admin' ? await requireCompanyAdmin(req, db, id) : await requireCompanyAccess(req, db, id)
  if (!a.ok) return { ok: false as const, res: json({ error: (a as any).notAdmin ? 'Ask an owner or admin to do this.' : 'Not authorized' }, 403) }
  let name: string | null = null
  if (a.userId) {
    try {
      const { data } = await db.from('team_members').select('name').eq('company_id', id).eq('user_id', a.userId).maybeSingle()
      name = data?.name || null
    } catch {}
  }
  return { ok: true as const, companyId: id, userId: a.userId || null, name }
}

export function passError(e: any, fallback: string) {
  if (isMissingPassSchema(e)) return json({ error: PASS_HINT, setupNeeded: true }, 503)
  return json({ error: e?.message || fallback }, 500)
}

export const COMPANY_PAY_COLS = 'id, name, slug, logo_url, accent_color, owner_id, booking_settings, portal_settings, stripe_mode, stripe_connected, stripe_account_id'
