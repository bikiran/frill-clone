// The Business number plan (lib/plan `phone`) includes one Australian number.
//
// It reuses the free number credits a super admin can grant
// (lib/free-number-credits): when the plan starts, a business with no number
// and no credit gets one credit, so Settings → Calls & SMS shows "Free on your
// plan" and the number is bought without a second payment. The grant is
// remembered in platform_settings (`plan-number:<companyId>`), so it's given
// once per plan start and can be taken back if the plan ends before it's used.
//
// When the plan ends (cancelled, or a lapsed payment): an unused credit is taken
// back, and a number bought with it is still live on Colvy's Twilio account
// with nothing paying for it, so the Colvy team is told to release it or move
// it to a paid number. Numbers are never released automatically: a business can
// lose calls if its number disappears without warning.

import { alertColvyTeamOncePerDay } from './billing-alert'

const grantKey = (companyId: string) => `plan-number:${companyId}`

export type GrantResult = 'granted' | 'has_number' | 'has_credit' | 'already' | 'error'

/** The plan started: give the business its included number (a free number credit), once. */
export async function grantIncludedNumber(db: any, companyId: string): Promise<GrantResult> {
  try {
    const { data: prior } = await db.from('platform_settings').select('value').eq('key', grantKey(companyId)).maybeSingle()
    if (prior?.value?.state === 'granted') return 'already'
    const [{ data: co }, { count }] = await Promise.all([
      db.from('companies').select('free_number_credits').eq('id', companyId).maybeSingle(),
      db.from('phone_numbers').select('id', { count: 'exact', head: true }).eq('company_id', companyId).neq('status', 'released'),
    ])
    const record = (state: string) => db.from('platform_settings').upsert({
      key: grantKey(companyId), value: { state, at: new Date().toISOString() },
      updated_by: 'business-number-plan', updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })
    // A number they already have (bought or ported) stays as it is.
    if ((count || 0) > 0) { await record('has_number'); return 'has_number' }
    if (Number(co?.free_number_credits || 0) > 0) { await record('has_credit'); return 'has_credit' }
    const { error } = await db.from('companies').update({ free_number_credits: 1 }).eq('id', companyId).eq('free_number_credits', Number(co?.free_number_credits || 0))
    if (error) return 'error'
    await record('granted')
    return 'granted'
  } catch { return 'error' }
}

/** The plan ended: take back an unused included number, or tell the Colvy team about a used one. */
export async function endIncludedNumber(db: any, companyId: string): Promise<'revoked' | 'flagged' | 'nothing' | 'error'> {
  try {
    const { data: prior } = await db.from('platform_settings').select('value').eq('key', grantKey(companyId)).maybeSingle()
    if (prior?.value?.state !== 'granted') return 'nothing'
    const done = (state: string) => db.from('platform_settings').upsert({
      key: grantKey(companyId), value: { ...prior.value, state, endedAt: new Date().toISOString() },
      updated_by: 'business-number-plan', updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })
    const { data: co } = await db.from('companies').select('name, free_number_credits').eq('id', companyId).maybeSingle()
    const credits = Number(co?.free_number_credits || 0)
    if (credits > 0) {
      await db.from('companies').update({ free_number_credits: credits - 1 }).eq('id', companyId).eq('free_number_credits', credits)
      await done('revoked')
      return 'revoked'
    }
    // Used: the number bought with the credit since the plan started (a free
    // number is saved with a monthly cost of 0 by number-finalize).
    const { data: nums } = await db.from('phone_numbers').select('phone_number, monthly_cost, provisioned_by_colvy, created_at')
      .eq('company_id', companyId).neq('status', 'released')
    const since = Date.parse(prior.value.at || '') || 0
    const unpaid = (nums || [])
      .filter((n: any) => n.provisioned_by_colvy && !Number(n.monthly_cost) && Date.parse(n.created_at || '') >= since)
      .map((n: any) => n.phone_number)
    await done('ended')
    if (unpaid.length) {
      await alertColvyTeamOncePerDay(db, {
        key: `alert:plan-number-ended:${companyId}`,
        subject: 'Business number plan ended with a live number',
        message: `${co?.name || 'A business'} is no longer on the Business number plan, but the number that came with it (${unpaid.join(', ')}) is still live on Colvy’s Twilio account with nothing paying for it. Release it, or ask them to keep it as a paid number (A$15/month).`,
      })
      return 'flagged'
    }
    return 'nothing'
  } catch { return 'error' }
}
