// Which outlets each person takes bookings at (Bookings → Availability).
// Pure, so the admin page can use it too. Settings shape: booking_settings.staff
// = { [userId]: { bookable, locations: [outletId…] } }; no outlets = any outlet.

type OutletSettings = { staff?: Record<string, { bookable?: boolean; locations?: string[] } | undefined> }

/** The outlets this person is set to that still exist (empty = any outlet). */
export function staffOutlets(settings: OutletSettings, staffId: string, outletIds?: Set<string> | null): string[] {
  const locs = settings.staff?.[staffId]?.locations || []
  return outletIds ? locs.filter(id => outletIds.has(id)) : locs
}

/** Does this person take bookings at that outlet? No outlets set (or only deleted ones) = every outlet. */
export function worksAt(settings: OutletSettings, staffId: string, locationId: string | null | undefined, outletIds?: Set<string> | null): boolean {
  const locs = staffOutlets(settings, staffId, outletIds)
  return !locationId || !locs.length || locs.includes(locationId)
}

/**
 * Outlets nobody takes bookings at, when outlets are set for some people:
 * there everyone is offered (resourcesFor's fallback), which Availability
 * shows as a warning.
 */
export function outletGaps(settings: OutletSettings, staffIds: string[], outlets: { id: string; label: string }[]): { id: string; label: string }[] {
  const ids = new Set(outlets.map(o => o.id))
  const bookable = staffIds.filter(id => settings.staff?.[id]?.bookable)
  if (!bookable.some(id => staffOutlets(settings, id, ids).length)) return []
  return outlets.filter(o => !bookable.some(id => worksAt(settings, id, o.id, ids)))
}
