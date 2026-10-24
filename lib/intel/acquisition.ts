// Where a business first found Colvy, from its sign-up record
// (signup_attempts, which carries the visit that first found Colvy since
// V415; before that, the sign-up page's own referrer and address). Pure:
// builds the company_acquisition row; lib/intel/business-job writes it.

import { channelOf, refHost } from '@/lib/intel/channel'
import { cleanPath } from '@/lib/analytics-privacy'

export type AcquisitionRow = {
  company_id: string
  channel: string
  source: string | null
  medium: string | null
  campaign: string | null
  term: string | null
  content: string | null
  referrer_host: string | null
  landing_path: string | null
  click_id_type: string | null
  first_seen_at: string | null
  country: string | null
  device: string | null
  captured_from: 'signup_first_visit' | 'signup_page' | 'posthog'
}

const s = (v: any, max = 120): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

/** The landing page without its query string, ids masked; null for the sign-up page itself. */
function landingOf(raw: any): string | null {
  const v = s(raw, 300)
  if (!v) return null
  let path = v
  try { path = new URL(v, 'https://colvy.com').pathname } catch { path = v.split(/[?#]/)[0] }
  return cleanPath(path).slice(0, 200)
}

export function acquisitionFromSignup(companyId: string, a: any): AcquisitionRow {
  const utm = a?.utm && typeof a.utm === 'object' ? a.utm : {}
  const ref = refHost(a?.referrer)
  const landing = landingOf(a?.landing_path)
  const click = ['google', 'meta', 'microsoft'].includes(a?.click_id_type) ? a.click_id_type : null
  return {
    company_id: companyId,
    channel: channelOf({ src: utm.source, med: utm.medium, ref, click }),
    source: s(utm.source), medium: s(utm.medium), campaign: s(utm.campaign), term: s(utm.term), content: s(utm.content),
    referrer_host: ref && !/(^|\.)colvy\.com$/.test(ref) ? ref : null,
    landing_path: landing,
    click_id_type: click,
    first_seen_at: s(a?.first_touch_at, 40),
    country: s(a?.ip_country, 8),
    device: s(a?.device, 40),
    // Rows from before the first-visit capture only know the sign-up page.
    captured_from: a?.first_touch_at ? 'signup_first_visit' : 'signup_page',
  }
}

/** From a PostHog person's first-visit properties ($initial_*), when there's no sign-up record. */
export function acquisitionFromPosthog(companyId: string, p: any): AcquisitionRow {
  const ref = refHost(p?.ref === '$direct' ? '' : p?.ref)
  const click = p?.gclid ? 'google' : p?.fbclid ? 'meta' : p?.msclkid ? 'microsoft' : null
  return {
    company_id: companyId,
    channel: channelOf({ src: p?.src, med: p?.med, ref, click }),
    source: s(p?.src), medium: s(p?.med), campaign: s(p?.camp), term: null, content: null,
    referrer_host: ref && !/(^|\.)colvy\.com$/.test(ref) ? ref : null,
    landing_path: landingOf(p?.landing),
    click_id_type: click,
    first_seen_at: s(p?.first_seen, 40),
    country: s(p?.country, 8),
    device: null,
    captured_from: 'posthog',
  }
}
