import { NextRequest } from 'next/server'
import { audit } from '@/lib/activity-logging'
import { floorProblem } from '@/lib/restaurant/tables'
import {
  restaurantDb, reservationsAccess, loadFloor, json, isUuid, isManager, clip, isMissingTablesSchema, TABLES_HINT, FLOOR_TABLE_COLS,
} from '@/lib/restaurant/server'

export const dynamic = 'force-dynamic'

// The floor plan (docs/plans/restaurants.md, Phase 2).
//   GET   ?companyId                          areas, tables, combos
//   POST  { companyId, areas, tables, combos } save the whole plan (owners and admins). New
//         rows carry a temporary id ("new-…"); tables and combos point at areas and tables by
//         those ids. A table taken off the plan is switched off, never deleted, so past
//         reservations keep it; upcoming ones lose it and are counted back.
//   PATCH { companyId, tableId, unavailableUntil: ISO | null, note? }   anyone on the floor:
//         "out of action until…" (a wobbly leg, a staff meal)

const setup = () => json({ error: TABLES_HINT, setup: true }, 503)
const num = (v: any, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d }
const int = (v: any, lo: number, hi: number, d: number) => Math.round(num(v, lo, hi, d))
const bool = (v: any, d: boolean) => (typeof v === 'boolean' ? v : d)

export async function GET(req: NextRequest) {
  try {
    const db = restaurantDb()
    const companyId = req.nextUrl.searchParams.get('companyId')
    const access = await reservationsAccess(req, db, companyId)
    if (!access.ok) return access.response
    const fl = await loadFloor(db, companyId!)
    if (fl.missing) return setup()
    return json({ areas: fl.areas, tables: fl.floor.tables, combos: fl.floor.combos, canManage: isManager(access.role) })
  } catch (e: any) {
    if (isMissingTablesSchema(e)) return setup()
    return json({ error: e?.message || 'Could not load the floor plan.' }, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = restaurantDb()
    const body = await req.json().catch(() => ({}))
    const companyId = String(body.companyId || '')
    const access = await reservationsAccess(req, db, companyId)
    if (!access.ok) return access.response
    if (!isManager(access.role)) return json({ error: 'Only owners and admins can change the floor plan.' }, 403)
    const inAreas: any[] = Array.isArray(body.areas) ? body.areas.slice(0, 50) : []
    const inTables: any[] = Array.isArray(body.tables) ? body.tables.slice(0, 300) : []
    const inCombos: any[] = Array.isArray(body.combos) ? body.combos.slice(0, 100) : []

    const tables = inTables.map((t, i) => ({
      key: String(t.id || `new-${i}`), id: isUuid(t.id) ? t.id : null, area: t.area_id ? String(t.area_id) : null,
      label: clip(t.label, 20), min_party: int(t.min_party, 1, 100, 1), max_party: int(t.max_party, 1, 100, 2),
      x: num(t.x, 0, 400, 0), y: num(t.y, 0, 400, 0), w: num(t.w, 0.5, 20, 2), h: num(t.h, 0.5, 20, 2),
      shape: t.shape === 'round' ? 'round' : 'rect', rotation: ((int(t.rotation, -720, 720, 0) % 360) + 360) % 360,
      combinable: bool(t.combinable, true), online: bool(t.online, true), sort: i,
    }))
    const combos = inCombos.map(c => ({
      id: isUuid(c.id) ? c.id : null, name: clip(c.name, 40), table_ids: (Array.isArray(c.table_ids) ? c.table_ids : []).map(String).slice(0, 8),
      min_party: int(c.min_party, 1, 200, 1), max_party: int(c.max_party, 1, 200, 2), online: bool(c.online, true),
    }))
    const problem = floorProblem({ tables: tables.map(t => ({ id: t.key, label: t.label, min_party: t.min_party, max_party: t.max_party })), combos })
    if (problem) return json({ error: problem }, 400)
    if (combos.some(c => !c.name)) return json({ error: 'Give each combination a name, like “Tables 4 + 5”.' }, 400)

    // What's there now (only this restaurant's rows can be updated).
    const [ea, et, ec] = await Promise.all([
      db.from('restaurant_areas').select('id').eq('company_id', companyId).eq('active', true),
      db.from('restaurant_tables').select('id, label').eq('company_id', companyId).eq('active', true),
      db.from('restaurant_table_combos').select('id').eq('company_id', companyId).eq('active', true),
    ])
    const err = ea.error || et.error || ec.error
    if (err) { if (isMissingTablesSchema(err)) return setup(); throw err }
    const haveAreas = new Set((ea.data || []).map((r: any) => r.id))
    const haveTables = new Set((et.data || []).map((r: any) => r.id))
    const haveCombos = new Set((ec.data || []).map((r: any) => r.id))
    const now = new Date().toISOString()

    // 1. Areas.
    const areaId = new Map<string, string>()
    const keepAreas = new Set<string>()
    for (let i = 0; i < inAreas.length; i++) {
      const a = inAreas[i], name = clip(a.name, 60) || `Area ${i + 1}`
      if (isUuid(a.id) && haveAreas.has(a.id)) {
        await db.from('restaurant_areas').update({ name, sort: i, updated_at: now }).eq('id', a.id).eq('company_id', companyId)
        areaId.set(a.id, a.id); keepAreas.add(a.id)
      } else {
        const { data, error } = await db.from('restaurant_areas').insert({ company_id: companyId, name, sort: i }).select('id').maybeSingle()
        if (error) throw error
        areaId.set(String(a.id || `new-area-${i}`), data.id); keepAreas.add(data.id)
      }
    }
    const goneAreas = [...haveAreas].filter(id => !keepAreas.has(id))
    if (goneAreas.length) await db.from('restaurant_areas').update({ active: false, updated_at: now }).in('id', goneAreas).eq('company_id', companyId)

    // 2. Tables. Off the plan first (frees their labels), then a short-lived
    // label on the ones being kept so two can swap names.
    const keepIds = new Set(tables.filter(t => t.id && haveTables.has(t.id)).map(t => t.id as string))
    const goneTables = [...haveTables].filter(id => !keepIds.has(id))
    let lostTables = 0
    if (goneTables.length) {
      await db.from('restaurant_tables').update({ active: false, updated_at: now }).in('id', goneTables).eq('company_id', companyId)
      const { data: lost } = await db.from('reservation_tables').update({ active: false }).in('table_id', goneTables).eq('company_id', companyId).eq('active', true).select('booking_id')
      lostTables = new Set((lost || []).map((r: any) => r.booking_id)).size
    }
    // "~3-1a2b3c4d": unique per table (labels are 20 characters at most). If
    // anything below fails, the kept tables get their old names back.
    const oldLabel = new Map<string, string>((et.data || []).map((r: any) => [r.id, r.label]))
    const tableId = new Map<string, string>()
    try {
      let n = 0
      for (const id of keepIds) {
        const { error } = await db.from('restaurant_tables').update({ label: `~${n++}-${id.replace(/-/g, '').slice(-8)}` }).eq('id', id).eq('company_id', companyId)
        if (error) throw error
      }
      for (const t of tables) {
        const row = {
          area_id: t.area ? areaId.get(t.area) || null : null, label: t.label, min_party: t.min_party, max_party: t.max_party,
          x: t.x, y: t.y, w: t.w, h: t.h, shape: t.shape, rotation: t.rotation, combinable: t.combinable, online: t.online, sort: t.sort, updated_at: now,
        }
        if (t.id && keepIds.has(t.id)) {
          const { error } = await db.from('restaurant_tables').update(row).eq('id', t.id).eq('company_id', companyId)
          if (error) throw error
          tableId.set(t.key, t.id)
        } else {
          const { data, error } = await db.from('restaurant_tables').insert({ company_id: companyId, ...row }).select('id').maybeSingle()
          if (error) throw error
          tableId.set(t.key, data.id)
        }
      }
    } catch (e) {
      for (const id of keepIds) { try { await db.from('restaurant_tables').update({ label: oldLabel.get(id) }).eq('id', id).eq('company_id', companyId).like('label', '~%') } catch {} }
      throw e
    }

    // 3. Combos, pointing at the real table ids.
    const keepCombos = new Set<string>()
    for (const c of combos) {
      const row = { name: c.name, table_ids: c.table_ids.map(k => tableId.get(k)).filter(Boolean), min_party: c.min_party, max_party: c.max_party, online: c.online, updated_at: now }
      if (c.id && haveCombos.has(c.id)) {
        await db.from('restaurant_table_combos').update(row).eq('id', c.id).eq('company_id', companyId)
        keepCombos.add(c.id)
      } else {
        const { data, error } = await db.from('restaurant_table_combos').insert({ company_id: companyId, ...row }).select('id').maybeSingle()
        if (error) throw error
        keepCombos.add(data.id)
      }
    }
    const goneCombos = [...haveCombos].filter(id => !keepCombos.has(id))
    if (goneCombos.length) await db.from('restaurant_table_combos').update({ active: false, updated_at: now }).in('id', goneCombos).eq('company_id', companyId)

    await audit(req, db, companyId, 'settings_updated', `Floor plan saved: ${tables.length} table${tables.length === 1 ? '' : 's'}, ${combos.length} combination${combos.length === 1 ? '' : 's'}`, { area: 'reservations' })
    const fl = await loadFloor(db, companyId)
    return json({ areas: fl.areas, tables: fl.floor.tables, combos: fl.floor.combos, lostTables, canManage: true })
  } catch (e: any) {
    if (isMissingTablesSchema(e)) return setup()
    if (e?.code === '23505') return json({ error: 'Two tables have the same name. Give each one its own.' }, 400)
    return json({ error: e?.message || 'Could not save the floor plan.' }, 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const db = restaurantDb()
    const body = await req.json().catch(() => ({}))
    const companyId = String(body.companyId || '')
    const access = await reservationsAccess(req, db, companyId)
    if (!access.ok) return access.response
    if (!isUuid(body.tableId)) return json({ error: 'Table not found.' }, 404)
    const until = body.unavailableUntil ? Date.parse(String(body.unavailableUntil)) : null
    if (until != null && (!Number.isFinite(until) || until > Date.now() + 30 * 86_400_000)) return json({ error: 'Pick when it’s back (within 30 days).' }, 400)
    const patch = until && until > Date.now()
      ? { unavailable_until: new Date(until).toISOString(), unavailable_note: clip(body.note, 120) || null }
      : { unavailable_until: null, unavailable_note: null }
    const { data, error } = await db.from('restaurant_tables').update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', body.tableId).eq('company_id', companyId).eq('active', true).select(FLOOR_TABLE_COLS).maybeSingle()
    if (error) { if (isMissingTablesSchema(error)) return setup(); throw error }
    if (!data) return json({ error: 'Table not found.' }, 404)
    await audit(req, db, companyId, 'reservation_updated', patch.unavailable_until ? `Table ${data.label} out of action until ${patch.unavailable_until}${patch.unavailable_note ? ` (${patch.unavailable_note})` : ''}` : `Table ${data.label} back in action`, { table_id: data.id })
    return json({ table: data })
  } catch (e: any) {
    if (isMissingTablesSchema(e)) return setup()
    return json({ error: e?.message || 'That didn’t work. Please try again.' }, 500)
  }
}
