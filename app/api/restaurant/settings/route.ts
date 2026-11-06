import { NextRequest } from 'next/server'
import { audit } from '@/lib/activity-logging'
import { reservePageUrl } from '@/lib/booking'
import { readModules, restaurantEnabled } from '@/lib/modules'
import { resolveRestaurantSettings } from '@/lib/restaurant/settings'
import {
  restaurantDb, reservationsAccess, loadRestaurant, settingsOf, ensureReservationService, json, setupNeeded, isMissingRestaurantSchema, isManager, loadFloor,
} from '@/lib/restaurant/server'

export const dynamic = 'force-dynamic'

// Reservation settings.
//   GET   ?companyId            settings, whether reservations are on, the booking page link
//   PATCH { companyId, settings?, module? }   owners and admins

export async function GET(req: NextRequest) {
  try {
    const db = restaurantDb()
    const companyId = req.nextUrl.searchParams.get('companyId')
    const access = await reservationsAccess(req, db, companyId)
    if (!access.ok) return access.response
    const { company, error } = await loadRestaurant(db, companyId!)
    if (error) return isMissingRestaurantSchema(error) ? setupNeeded() : json({ error: error.message }, 500)
    if (!company) return json({ error: 'Workspace not found.' }, 404)
    const { rs, tz } = settingsOf(company)
    const fl = await loadFloor(db, companyId!).catch(() => ({ floor: { tables: [], combos: [] }, areas: [], missing: true }))
    return json({
      settings: rs, enabled: restaurantEnabled(company), modules: readModules(company.modules), industry: company.industry || null, name: company.name || '',
      timezone: tz, pageUrl: reservePageUrl(company), canManage: isManager(access.role),
      // Phase 2: deposits need Stripe; tables need V430 and a floor plan.
      stripeReady: !!(company.stripe_connected && company.stripe_account_id),
      tables: fl.missing ? null : fl.floor.tables.length,
    })
  } catch (e: any) {
    if (isMissingRestaurantSchema(e)) return setupNeeded()
    return json({ error: e?.message || 'Could not load the settings.' }, 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const db = restaurantDb()
    const body = await req.json().catch(() => ({}))
    const companyId = String(body.companyId || '')
    const access = await reservationsAccess(req, db, companyId)
    if (!access.ok) return access.response
    if (!isManager(access.role)) return json({ error: 'Only owners and admins can change reservation settings.' }, 403)
    const { company, error } = await loadRestaurant(db, companyId)
    if (error) return isMissingRestaurantSchema(error) ? setupNeeded() : json({ error: error.message }, 500)
    if (!company) return json({ error: 'Workspace not found.' }, 404)
    const patch: any = {}
    if (body.settings && typeof body.settings === 'object') patch.restaurant_settings = resolveRestaurantSettings({ ...settingsOf(company).rs, ...body.settings })
    if (typeof body.module === 'boolean') patch.modules = { ...readModules(company.modules), restaurant: body.module }
    if (!Object.keys(patch).length) return json({ error: 'Nothing to save.' }, 400)
    const { data, error: uErr } = await db.from('companies').update(patch).eq('id', companyId).select('id, name, slug, industry, modules, restaurant_settings').maybeSingle()
    if (uErr) { if (isMissingRestaurantSchema(uErr)) return setupNeeded(); throw uErr }
    const rs = resolveRestaurantSettings(data?.restaurant_settings)
    const enabled = restaurantEnabled(data)
    // Keep the table service (Calendar, messages) in step with the settings.
    if (enabled) { try { await ensureReservationService(db, { ...company, ...data }, rs) } catch {} }
    await audit(req, db, companyId, 'settings_updated', typeof body.module === 'boolean' ? `Table reservations turned ${body.module ? 'on' : 'off'}` : 'Reservation settings updated', { area: 'reservations' })
    return json({ settings: rs, enabled, modules: readModules(data?.modules) })
  } catch (e: any) {
    if (isMissingRestaurantSchema(e)) return setupNeeded()
    return json({ error: e?.message || 'Could not save the settings.' }, 500)
  }
}
