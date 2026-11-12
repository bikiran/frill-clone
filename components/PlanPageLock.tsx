'use client'

// The "on the Inbox plan" card above a page whose feature this workspace's plan
// doesn't include (lib/plan-gate). The page itself still opens, so people can
// see what they'd get; its actions answer with the same message. The chat
// widget's own pages stay open: the widget also carries the feedback, roadmap
// and help tabs every plan has (only its chat tab locks, in /api/widget-data).

import PlanLockCard from '@/components/PlanLockCard'
import { useEntitlements } from '@/lib/entitlements-client'
import type { GatedFeature } from '@/lib/plan-gate'

const PAGES: [RegExp, GatedFeature][] = [
  [/^\/admin\/(campaigns|crm-settings\/campaigns)(\/|$)/, 'campaigns'],
  [/^\/admin\/(reviews|social)(\/|$)/, 'reviewDashboard'],
  [/^\/admin\/crm-settings\/channels\/google-reviews(\/|$)/, 'reviewDashboard'],
  [/^\/admin\/crm-settings\/channels\/(email|meta)(\/|$)/, 'inbox'],
  [/^\/admin\/integrations\/(woocommerce|prexty)(\/|$)/, 'ecommerceSync'],
  [/^\/admin\/crm-settings\/(auto-replies|power-ups|conversation-actions)(\/|$)/, 'aiAutomation'],
]

/** The plan feature a page needs, if any. */
export function featureForPage(pathname: string | null | undefined): GatedFeature | null {
  const p = String(pathname || '')
  for (const [re, f] of PAGES) if (re.test(p)) return f
  return null
}

export default function PlanPageLock({ pathname }: { pathname: string | null }) {
  const ent = useEntitlements()
  const feature = featureForPage(pathname)
  if (!feature || !ent.ready || !ent.companyId || ent.hasFeature(feature)) return null
  return (
    <div className="ppl">
      <PlanLockCard feature={feature} />
      <style>{`.ppl{max-width:1160px;margin:18px auto 0;padding:0 24px}@media (max-width:640px){.ppl{padding:0 14px;margin-top:12px}}`}</style>
    </div>
  )
}
