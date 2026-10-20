import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { outletKey, locationForOutlet, matchOutletByName, outletRouting, type OutletMap } from '@/lib/prexty-outlets'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const missingColumn = (e: any) => /outlet_map|pos_location_id|pos_outlet|pos_source/i.test(String(e?.message || ''))

// Every Prexty outlet seen on an in-store sale, keyed by its normalised name,
// with the spellings it arrived as (so updates can match the stored values).
async function seenOutlets(db: any, companyId: string) {
  const seen = new Map<string, { name: string; raw: Set<string>; sales: number }>()
  const { data, error } = await db.from('woocommerce_orders').select('pos_outlet')
    .eq('company_id', companyId).eq('pos_source', 'prexty').not('pos_outlet', 'is', null).limit(20000)
  if (error && !missingColumn(error)) throw error
  for (const r of data || []) {
    const key = outletKey(r.pos_outlet)
    if (!key) continue
    const s = seen.get(key) || { name: String(r.pos_outlet).trim(), raw: new Set<string>(), sales: 0 }
    s.raw.add(r.pos_outlet); s.sales++
    seen.set(key, s)
  }
  return seen
}

/**
 * GET /api/prexty/outlets?companyId=
 * The Prexty outlets seen on in-store sales, the Colvy locations, and which
 * location each outlet's sales go to (pinned in the map, or matched by name).
 */
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const [{ locations, map }, seen] = await Promise.all([outletRouting(db, companyId), seenOutlets(db, companyId)])
    for (const key of Object.keys(map)) if (!seen.has(key)) seen.set(key, { name: key, raw: new Set(), sales: 0 })
    const outlets = Array.from(seen.entries()).map(([key, s]) => ({
      key, name: s.name, sales: s.sales,
      locationId: locationForOutlet(key, locations, map),
      pinned: Object.prototype.hasOwnProperty.call(map, key),
      suggested: matchOutletByName(key, locations),
    })).sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name))
    return NextResponse.json({ outlets, locations })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not load outlets' }, { status: 500 })
  }
}

/**
 * POST /api/prexty/outlets  { companyId, map: { [outletKey]: locationId | '' } }
 * Saves the map, then files earlier in-store sales under their shop: each
 * order records its location, and a sale's conversation that has no location
 * yet gets this one. Conversations someone already placed are left alone.
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, map: input } = await req.json()
    if (!companyId || !input || typeof input !== 'object') return NextResponse.json({ error: 'Missing companyId or map' }, { status: 400 })
    const db = admin()
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const { locations } = await outletRouting(db, companyId)
    const ids = new Set(locations.map(l => l.id))
    const map: OutletMap = {}
    for (const [k, v] of Object.entries(input).slice(0, 200)) {
      const key = outletKey(k).slice(0, 120)
      if (!key) continue
      const id = typeof v === 'string' ? v : ''
      if (id && !ids.has(id)) return NextResponse.json({ error: 'That location is not in this workspace.' }, { status: 400 })
      map[key] = id
    }

    const { error } = await db.from('prexty_integrations').update({ outlet_map: map, updated_at: new Date().toISOString() }).eq('company_id', companyId)
    if (error) {
      if (missingColumn(error)) return NextResponse.json({ error: 'Run migration COLVY_V410 first, then save again.' }, { status: 409 })
      return NextResponse.json({ error: 'Could not save the shop mapping' }, { status: 500 })
    }

    // File earlier sales under their shop.
    let orders = 0, conversations = 0
    try {
      const seen = await seenOutlets(db, companyId)
      for (const [key, s] of Array.from(seen.entries())) {
        if (!s.raw.size) continue
        const loc = locationForOutlet(key, locations, map)
        const raw = Array.from(s.raw)
        const { data: rows, error: upErr } = await db.from('woocommerce_orders').update({ pos_location_id: loc })
          .eq('company_id', companyId).eq('pos_source', 'prexty').in('pos_outlet', raw).select('conversation_id')
        if (upErr) { if (missingColumn(upErr)) break; throw upErr }
        orders += (rows || []).length
        const convIds = Array.from(new Set((rows || []).map((r: any) => r.conversation_id).filter(Boolean)))
        if (!loc || !convIds.length) continue
        for (let i = 0; i < convIds.length; i += 200) {
          const { data: moved } = await db.from('conversations').update({ assigned_location_id: loc, assigned_auto: true })
            .eq('company_id', companyId).in('id', convIds.slice(i, i + 200)).is('assigned_location_id', null).is('location_id', null).select('id')
          conversations += (moved || []).length
        }
      }
    } catch (e) { console.error('[prexty outlets] backfill failed', e) }

    return NextResponse.json({ success: true, map, orders, conversations })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not save' }, { status: 500 })
  }
}
