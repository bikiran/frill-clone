import { companyHasFeature, effectivePlan } from '@/lib/plan'

/**
 * Whether a workspace's public pages should hide the "Powered by Colvy" badge.
 *
 * Plans that include branding removal (removeBranding entitlement) hide it by
 * default; the White Labeling toggle saves `showPoweredBy: true` only when the
 * workspace chooses to show it anyway. Plans without the entitlement always
 * show it, whatever was saved.
 */
export async function hidesPoweredBy(db: any, companyId: string, company?: { plan?: string | null; trial_ends_at?: string | null }): Promise<boolean> {
  if (!companyId) return false
  try {
    const plan = company && 'plan' in company ? effectivePlan(company.plan, company.trial_ends_at) : undefined
    if (!(await companyHasFeature(db, companyId, 'removeBranding', plan))) return false
    const { data } = await db.from('site_settings').select('value')
      .eq('key', 'general').eq('company_id', companyId)
      .order('updated_at', { ascending: false }).limit(1)
    return data?.[0]?.value?.showPoweredBy !== true
  } catch { return false }
}
