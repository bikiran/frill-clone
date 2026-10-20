// Which Colvy location a Prexty POS sale belongs to.
//
// Prexty tags each in-store sale with the outlet it was rung up at
// (`_prexty_outlet` on the WooCommerce order, or `outlet`/`outlet_id` on its
// own webhook). A business with two shops — Roxy Aquarium in Somerton and in
// Oakleigh — has two Colvy locations too, so each sale's conversation should
// land under the shop it happened in.
//
// The owner can pin each Prexty outlet to a location on the Prexty settings
// page (prexty_integrations.outlet_map, V409). Until they do, an outlet whose
// name clearly names one location ("Oakleigh", "Roxy Aquarium Somerton") is
// matched by name. Anything ambiguous stays unassigned rather than guessed.

export type Location = { id: string; label?: string | null; suburb?: string | null }
/** Normalised Prexty outlet → Colvy location id ('' = deliberately none). */
export type OutletMap = Record<string, string>

export const outletKey = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

const words = (s: unknown) => outletKey(s).split(/[^a-z0-9]+/).filter(w => w.length > 2)

/** Name-only match: the outlet and exactly one location share a distinctive word. */
export function matchOutletByName(outlet: unknown, locations: Location[]): string | null {
  const ow = new Set(words(outlet))
  if (!ow.size) return null
  // Words every location shares ("roxy", "aquarium") don't tell them apart.
  const counts = new Map<string, number>()
  const locWords = locations.map(l => new Set([...words(l.label), ...words(l.suburb)]))
  for (const ws of locWords) ws.forEach(w => counts.set(w, (counts.get(w) || 0) + 1))
  const hits = locations.filter((_, i) => Array.from(locWords[i]).some(w => ow.has(w) && (locations.length === 1 || counts.get(w) === 1)))
  return hits.length === 1 ? hits[0].id : null
}

/** The location for a sale at `outlet` (name or id), or null when unknown. */
export function locationForOutlet(outlet: unknown, locations: Location[], map?: OutletMap | null): string | null {
  const key = outletKey(outlet)
  if (!key) return null
  if (map && Object.prototype.hasOwnProperty.call(map, key)) {
    const id = map[key]
    return id && locations.some(l => l.id === id) ? id : null
  }
  return matchOutletByName(key, locations)
}

/** Readable store name for a location id, for the chat line ("Roxy Aquarium Somerton"). */
export function locationName(id: string | null | undefined, locations: Location[]): string | null {
  const l = id ? locations.find(x => x.id === id) : null
  return l ? (l.label || l.suburb || null) : null
}

/** The company's locations and saved outlet map (an empty map before V409). */
export async function outletRouting(db: any, companyId: string): Promise<{ locations: Location[]; map: OutletMap }> {
  const [locs, integ] = await Promise.all([
    db.from('company_locations').select('id, label, suburb').eq('company_id', companyId),
    db.from('prexty_integrations').select('outlet_map').eq('company_id', companyId).maybeSingle(),
  ])
  const raw = integ?.data?.outlet_map
  return { locations: locs?.data || [], map: raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {} }
}
