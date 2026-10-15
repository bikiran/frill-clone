// The business's own phone numbers, as last-9-digit keys (lib/phone phoneKey).
//
// Two sets:
//   • lines — numbers the business calls and texts FROM: its Colvy numbers
//     (phone_numbers) and the number on each call provider's settings row.
//   • team  — numbers of the people who work there: each team member's phone,
//     the business's own contact numbers, and its stores' phones.
//
// A call from any of these is the team, not a customer: it's never texted back
// and never counted as a missed call to return. Server only; never throws.

import { phoneKey } from '@/lib/phone'

export type BusinessNumbers = { lines: Set<string>; team: Set<string>; all: Set<string> }

export async function businessNumbers(db: any, companyId: string): Promise<BusinessNumbers> {
  const lines = new Set<string>(), team = new Set<string>()
  const add = (set: Set<string>, n: any) => { const k = phoneKey(String(n || '')); if (k.length >= 8) set.add(k) }
  // Each read is on its own: a table or column this business doesn't have
  // (an older migration) just contributes nothing.
  const rows = async (q: any): Promise<any[]> => { try { const { data, error } = await q; return error ? [] : (data || []) } catch { return [] } }
  const [nums, twilio, telnyx, members, company, locations] = await Promise.all([
    rows(db.from('phone_numbers').select('phone_number').eq('company_id', companyId).limit(200)),
    rows(db.from('twilio_integrations').select('phone_number').eq('company_id', companyId).limit(5)),
    rows(db.from('telnyx_integrations').select('phone_number').eq('company_id', companyId).limit(5)),
    rows(db.from('team_members').select('phone').eq('company_id', companyId).limit(500)),
    rows(db.from('companies').select('business_phone, business_mobile').eq('id', companyId).limit(1)),
    rows(db.from('company_locations').select('phone').eq('company_id', companyId).limit(50)),
  ])
  for (const r of [...nums, ...twilio, ...telnyx]) add(lines, r.phone_number)
  for (const r of members) add(team, r.phone)
  for (const r of company) { add(team, r.business_phone); add(team, r.business_mobile) }
  for (const r of locations) add(team, r.phone)
  return { lines, team, all: new Set([...lines, ...team]) }
}
