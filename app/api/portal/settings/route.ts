import { NextRequest, NextResponse } from 'next/server'
import { requireCompanyAdmin } from '@/lib/company-access'
import { audit } from '@/lib/activity-logging'
import { companyBase } from '@/lib/booking'
import { portalDb, isMissingPortalSchema, PORTAL_HINT } from '@/lib/portal/auth'
import { resolvePortalSettings, cleanPortalSettings } from '@/lib/portal/settings'

export const dynamic = 'force-dynamic'

// Settings → Customer accounts (owners and admins).
//   GET   ?companyId             the settings, the page's address, and the last 30 days' numbers
//   PATCH { companyId, settings } turn it on or off, choose the sections

const json = (d: any, status = 200) => NextResponse.json(d, { status })
const deny = (a: { unavailable?: boolean; notAdmin?: boolean }) =>
  json({ error: a.unavailable ? 'Colvy couldn’t check your access just now. Please try again.' : a.notAdmin ? 'Only the owner or an admin can change customer accounts.' : 'Not authorized.' }, a.unavailable ? 503 : 403)

async function stats(db: any, companyId: string) {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data, error } = await db.from('portal_events').select('kind, contact_id').eq('company_id', companyId).gte('created_at', since).limit(20000)
  if (error) throw error
  const rows = data || []
  const n = (k: string | string[]) => rows.filter((r: any) => (Array.isArray(k) ? k.includes(r.kind) : r.kind === k)).length
  return {
    visits: n('visit'),
    signIns: n(['sign_in', 'link_sign_in']),
    people: new Set(rows.filter((r: any) => r.contact_id && (r.kind === 'sign_in' || r.kind === 'link_sign_in')).map((r: any) => r.contact_id)).size,
    actions: n(['reply', 'prefs', 'open_booking', 'open_quote', 'pay', 'pay_deposit', 'book_again', 'open_order', 'open_receipt']),
    messages: n('reply'),
    duplicates: n('duplicate_contacts'),
  }
}

export async function GET(req: NextRequest) {
  try {
    const db = portalDb()
    const companyId = req.nextUrl.searchParams.get('companyId')
    const a = await requireCompanyAdmin(req, db, companyId)
    if (!a.ok) return deny(a)
    const { data: co, error } = await db.from('companies').select('id, slug, name, portal_settings').eq('id', companyId).maybeSingle()
    if (error) { if (isMissingPortalSchema(error)) return json({ error: PORTAL_HINT, setup: true }, 503); throw error }
    if (!co) return json({ error: 'Workspace not found.' }, 404)
    return json({
      settings: resolvePortalSettings(co.portal_settings),
      url: co.slug ? `${companyBase(co).base}/account` : null,
      stats: await stats(db, co.id).catch(() => null),
    })
  } catch (e: any) {
    if (isMissingPortalSchema(e)) return json({ error: PORTAL_HINT, setup: true }, 503)
    return json({ error: e?.message || 'Could not load the settings.' }, 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const db = portalDb()
    const body = await req.json().catch(() => ({}))
    const companyId = String(body.companyId || '')
    const a = await requireCompanyAdmin(req, db, companyId)
    if (!a.ok) return deny(a)
    const { data: co, error } = await db.from('companies').select('id, portal_settings').eq('id', companyId).maybeSingle()
    if (error) { if (isMissingPortalSchema(error)) return json({ error: PORTAL_HINT, setup: true }, 503); throw error }
    if (!co) return json({ error: 'Workspace not found.' }, 404)
    const before = resolvePortalSettings(co.portal_settings)
    const next = cleanPortalSettings(body.settings, co.portal_settings)
    const { error: e2 } = await db.from('companies').update({ portal_settings: next }).eq('id', companyId)
    if (e2) { if (isMissingPortalSchema(e2)) return json({ error: PORTAL_HINT, setup: true }, 503); throw e2 }
    const what = before.enabled !== next.enabled ? `Customer accounts turned ${next.enabled ? 'on' : 'off'}` : 'Customer account sections changed'
    await audit(req, db, companyId, 'settings_updated', what, { area: 'customer_accounts', sections: next.sections })
    return json({ settings: next })
  } catch (e: any) {
    if (isMissingPortalSchema(e)) return json({ error: PORTAL_HINT, setup: true }, 503)
    return json({ error: e?.message || 'Could not save the settings.' }, 500)
  }
}
