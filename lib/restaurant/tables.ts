// Tables (Phase 2): which table a party gets, the same way
// claim_table_reservation() (V430) picks it, so the times a guest is offered
// are times the database will accept. Pure; tested in scripts/restaurant.test.mjs.
//
//   1. the smallest single table whose party range fits (the preferred area
//      first, then size, then the floor plan's order, then the label);
//   2. else the smallest combo whose tables are all free.
// A table is free when it's active, not marked unavailable at that time, and
// no live reservation holds it for any part of the visit.

export type FloorTable = {
  id: string
  label: string
  area_id: string | null
  min_party: number
  max_party: number
  online: boolean
  active: boolean
  combinable?: boolean
  unavailable_until: string | null
  sort: number
  x?: number; y?: number; w?: number; h?: number; shape?: 'rect' | 'round'; rotation?: number
}
export type FloorCombo = { id: string; name: string; table_ids: string[]; min_party: number; max_party: number; online: boolean; active: boolean }
export type TableHold = { table_id: string; booking_id: string; starts: number; ends: number }
export type Floor = { tables: FloorTable[]; combos: FloorCombo[] }

const unavailableAt = (t: FloorTable, at: number) => !!t.unavailable_until && Date.parse(t.unavailable_until) > at

/** Is this table free for [start, end)? */
export function tableFree(t: FloorTable, holds: TableHold[], start: number, end: number, excludeId?: string | null): boolean {
  if (!t.active || unavailableAt(t, start)) return false
  return !holds.some(h => h.table_id === t.id && h.booking_id !== excludeId && h.starts < end && h.ends > start)
}

/** The table (or combo) a party would get, or null when none is free. */
export function pickTable(floor: Floor, holds: TableHold[], opts: { party: number; start: number; end: number; onlineOnly?: boolean; area?: string | null; excludeId?: string | null }): { tables: string[]; combo: string | null } | null {
  const { party, start, end } = opts
  const singles = floor.tables
    .filter(t => (!opts.onlineOnly || t.online) && party >= t.min_party && party <= t.max_party && tableFree(t, holds, start, end, opts.excludeId))
    .sort((a, b) => (Number(!!opts.area && b.area_id === opts.area) - Number(!!opts.area && a.area_id === opts.area))
      || a.max_party - b.max_party || a.sort - b.sort || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
  if (singles.length) return { tables: [singles[0].id], combo: null }
  const byId = new Map(floor.tables.map(t => [t.id, t]))
  const combos = floor.combos
    .filter(c => c.active && (!opts.onlineOnly || c.online) && party >= c.min_party && party <= c.max_party
      && c.table_ids.every(id => { const t = byId.get(id); return !!t && tableFree(t, holds, start, end, opts.excludeId) }))
    .sort((a, b) => a.max_party - b.max_party || a.table_ids.length - b.table_ids.length || a.name.localeCompare(b.name))
  return combos.length ? { tables: [...combos[0].table_ids], combo: combos[0].id } : null
}

/** Does the restaurant seat by table right now (the setting is on and there are tables)? */
export function seatsByTable(useTables: boolean, floor: Floor | null | undefined): boolean {
  return !!useTables && !!floor && floor.tables.some(t => t.active)
}

/** The tables a party could sit at for [start, end): free ones first (fits, then bigger), then taken ones. For the team's table picker. */
export function tableChoices(floor: Floor, holds: TableHold[], opts: { party: number; start: number; end: number; excludeId?: string | null }) {
  return floor.tables.filter(t => t.active).map(t => ({
    id: t.id, label: t.label, area_id: t.area_id, min_party: t.min_party, max_party: t.max_party,
    free: tableFree(t, holds, opts.start, opts.end, opts.excludeId),
    fits: opts.party >= t.min_party && opts.party <= t.max_party,
    unavailable: unavailableAt(t, opts.start),
  })).sort((a, b) => Number(b.free) - Number(a.free) || Number(b.fits) - Number(a.fits) || a.max_party - b.max_party || a.label.localeCompare(b.label, undefined, { numeric: true }))
}

/** Check a floor plan before saving: labels, party ranges, combos naming real tables. Returns a problem in words, or null. */
export function floorProblem(floor: { tables: { id?: string; label: string; min_party: number; max_party: number }[]; combos: { name: string; table_ids: string[]; min_party: number; max_party: number }[] }): string | null {
  const seen = new Set<string>()
  for (const t of floor.tables) {
    const l = String(t.label || '').trim().toLowerCase()
    if (!l) return 'Every table needs a name or number.'
    if (seen.has(l)) return `Two tables are called “${t.label}”. Give each one its own name.`
    seen.add(l)
    if (!(t.min_party >= 1 && t.max_party >= t.min_party)) return `Table ${t.label}: the most guests can’t be fewer than the fewest.`
  }
  const ids = new Set(floor.tables.map(t => t.id).filter(Boolean))
  for (const c of floor.combos) {
    if (c.table_ids.length < 2) return `“${c.name || 'A combination'}” needs at least two tables.`
    if (c.table_ids.some(id => !ids.has(id))) return `“${c.name || 'A combination'}” uses a table that’s no longer on the plan.`
    if (!(c.min_party >= 1 && c.max_party >= c.min_party)) return `“${c.name || 'A combination'}”: the most guests can’t be fewer than the fewest.`
  }
  return null
}
