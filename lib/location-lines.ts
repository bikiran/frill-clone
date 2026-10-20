// Which business line belongs to which location, for a business with more than
// one shop. A number is tied to a shop by phone_numbers.location_id (set when
// the number is assigned to a location). While two shops share one number,
// that number has no single location, so nothing here changes anything: texts
// keep going out from the main number and new threads aren't placed.

import { phoneKey } from '@/lib/phone'

/** The location a dialled business number belongs to, or null when it's shared or unassigned. */
export async function locationForLine(db: any, companyId: string, line: string | null | undefined): Promise<string | null> {
  const key = phoneKey(line)
  if (!key) return null
  const { data } = await db.from('phone_numbers').select('phone_number, location_id, status')
    .eq('company_id', companyId).not('location_id', 'is', null)
  const hits = (data || []).filter((r: any) => String(r.status || 'active').toLowerCase() !== 'released' && phoneKey(r.phone_number) === key)
  const locs = Array.from(new Set(hits.map((r: any) => r.location_id)))
  return locs.length === 1 ? (locs[0] as string) : null
}

/**
 * The line a reply in this conversation should go out on: the number the
 * customer texted, else their location's own number. Null means "the usual
 * texting number". The caller still checks the line can text.
 */
export async function replyLineFor(db: any, companyId: string, conversationId: string): Promise<string | null> {
  const { data: c } = await db.from('conversations').select('channel_number, assigned_location_id, location_id')
    .eq('id', conversationId).eq('company_id', companyId).maybeSingle()
  if (!c) return null
  if (c.channel_number) return c.channel_number
  const loc = c.assigned_location_id || c.location_id
  if (!loc) return null
  const { data } = await db.from('phone_numbers').select('phone_number, status').eq('company_id', companyId).eq('location_id', loc)
  const live = (data || []).filter((r: any) => String(r.status || 'active').toLowerCase() !== 'released')
  return live.length === 1 ? live[0].phone_number : null
}

/** Conversation fields placing a new thread under the dialled line's shop (empty when unknown). */
export async function placeByLine(db: any, companyId: string, line: string | null | undefined): Promise<Record<string, any>> {
  try {
    const loc = await locationForLine(db, companyId, line)
    return loc ? { assigned_location_id: loc, assigned_auto: true } : {}
  } catch { return {} }
}
