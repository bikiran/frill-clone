// Super Admin → Intelligence → Business and Customer health. Read from
// Supabase (V415's company_milestones, company_acquisition and
// company_health_daily, filled by the hourly intel job, plus companies and
// the live integrations list), so these pages work without PostHog. Every
// number is a count of real rows; nothing is estimated. Demo workspaces are
// left out everywhere.

import { effectivePlan, normalizePlan, PLAN_NAMES } from '@/lib/plan'
import { collectIntegrations } from '@/app/api/platform-admin/_lib/integrations'
import { BAND_LABEL } from '@/lib/intel/health'

const DAY = 86_400_000
const PAID = new Set(['feedback', 'omnichannel', 'everything', 'pro', 'enterprise'])

// Every milestone, in the order a business usually reaches them, with the
// words the dashboard uses.
export const MILESTONES: { key: string; label: string; group: 'Setup' | 'Channels' | 'Use' | 'Automation' | 'Billing' }[] = [
  { key: 'workspace_created', label: 'Workspace created', group: 'Setup' },
  { key: 'channel_connected', label: 'Any channel connected', group: 'Channels' },
  { key: 'email_connected', label: 'Email connected', group: 'Channels' },
  { key: 'phone_connected', label: 'Phone number', group: 'Channels' },
  { key: 'social_connected', label: 'Facebook / Instagram', group: 'Channels' },
  { key: 'whatsapp_connected', label: 'WhatsApp', group: 'Channels' },
  { key: 'widget_live', label: 'Website chat live', group: 'Channels' },
  { key: 'store_connected', label: 'Store connected', group: 'Setup' },
  { key: 'google_connected', label: 'Google Business Profile', group: 'Setup' },
  { key: 'teammate_joined', label: 'Teammate joined', group: 'Setup' },
  { key: 'first_contact', label: 'First customer added', group: 'Use' },
  { key: 'first_customer_message', label: 'First customer message', group: 'Use' },
  { key: 'first_team_reply', label: 'First team reply', group: 'Use' },
  { key: 'first_ai_reply', label: 'First AI reply', group: 'Automation' },
  { key: 'activated', label: 'Activated', group: 'Use' },
  { key: 'agent_enabled', label: 'AI agent turned on', group: 'Automation' },
  { key: 'agent_live', label: 'AI agent handled a live message', group: 'Automation' },
  { key: 'first_order', label: 'First order', group: 'Use' },
  { key: 'first_booking', label: 'First booking', group: 'Use' },
  { key: 'first_payment', label: 'First payment taken', group: 'Use' },
  { key: 'first_review_request', label: 'First review request', group: 'Automation' },
  { key: 'first_campaign', label: 'First campaign sent', group: 'Automation' },
  { key: 'first_ticket', label: 'First ticket', group: 'Use' },
  { key: 'first_call', label: 'First call', group: 'Use' },
  { key: 'subscribed', label: 'Started paying', group: 'Billing' },
]

/** companies.created_at has no time zone: it's UTC. */
export const utc = (v: any): number => {
  if (!v) return NaN
  const s = String(v)
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(' ', 'T')}Z`)
}

async function all<T = any>(make: () => any, max = 100_000): Promise<{ rows: T[]; missing: boolean }> {
  const rows: T[] = []
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await make().range(from, from + 999)
    if (error) {
      if (/^(42P01|PGRST205|42703|PGRST204)$/.test(String(error.code || '')) || /does not exist|schema cache/i.test(String(error.message || ''))) return { rows, missing: true }
      throw error
    }
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return { rows, missing: false }
}

const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

async function companiesLive(db: any) {
  const { rows } = await all<any>(() => db.from('companies').select('id, name, slug, plan, trial_ends_at, is_complimentary, is_demo, created_at, closed_at, owner_id').order('id'))
  return rows.filter(c => !c.is_demo)
}

export async function businessReport(db: any, p: { from: Date; to: Date; prevFrom: Date; prevTo: Date }) {
  const [companies, ms, acq] = await Promise.all([
    companiesLive(db),
    all<any>(() => db.from('company_milestones').select('company_id, milestone, reached_at').order('company_id').order('milestone'), 300_000),
    all<any>(() => db.from('company_acquisition').select('company_id, channel, source, medium, campaign, referrer_host, landing_path, captured_from').order('company_id')),
  ])
  const migrated = !ms.missing && !acq.missing
  const reached = new Map<string, Map<string, number>>()
  for (const r of ms.rows) {
    let m = reached.get(r.company_id); if (!m) reached.set(r.company_id, (m = new Map()))
    m.set(r.milestone, Date.parse(r.reached_at))
  }
  const acqOf = new Map(acq.rows.map(r => [r.company_id, r]))
  const createdAt = (c: any) => utc(c.created_at)
  const inRange = (c: any, a: Date, b: Date) => { const t = createdAt(c); return t >= a.getTime() && t < b.getTime() }
  const live = companies.filter(c => !c.closed_at)
  const cohort = companies.filter(c => inRange(c, p.from, p.to))
  const prevCohort = companies.filter(c => inRange(c, p.prevFrom, p.prevTo))
  const has = (c: any, k: string) => reached.get(c.id)?.has(k) || false
  const within = (c: any, k: string, days: number) => { const t = reached.get(c.id)?.get(k); return t != null && t - createdAt(c) <= days * DAY }
  const rate = (xs: any[], f: (c: any) => boolean) => (xs.length ? xs.filter(f).length / xs.length : null)
  const paying = (c: any) => PAID.has(effectivePlan(c.plan, c.trial_ends_at)) && !c.is_complimentary

  // Onboarding funnel for businesses created in the period: how many reached
  // each step, and the median time from sign-up.
  const funnelSteps = ['workspace_created', 'channel_connected', 'first_customer_message', 'first_team_reply', 'activated', 'subscribed']
  const funnel = funnelSteps.map(k => {
    const done = cohort.filter(c => k === 'workspace_created' || has(c, k))
    const hours = done.map(c => ((reached.get(c.id)?.get(k) ?? createdAt(c)) - createdAt(c)) / 3600_000).filter(h => h >= 0)
    return { key: k, label: MILESTONES.find(m => m.key === k)!.label, count: done.length, medianHours: k === 'workspace_created' ? null : median(hours) }
  })
  // "First reply" counts the AI's too.
  funnel[3] = { ...funnel[3], label: 'First reply (team or AI)', count: cohort.filter(c => has(c, 'first_team_reply') || has(c, 'first_ai_reply')).length }

  // Weekly sign-up cohorts, last 12 weeks (Monday starts, UTC).
  const monday = (t: number) => { const d = new Date(t); const wd = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - wd) }
  const thisWeek = monday(Date.now())
  const cohorts = Array.from({ length: 12 }, (_, i) => thisWeek - (11 - i) * 7 * DAY).map(start => {
    const xs = companies.filter(c => { const t = createdAt(c); return t >= start && t < start + 7 * DAY })
    const age = (Date.now() - start) / DAY
    return {
      week: new Date(start).toISOString().slice(0, 10), signups: xs.length,
      channel7d: age >= 7 ? rate(xs, c => within(c, 'channel_connected', 7)) : null,
      activated14d: age >= 14 ? rate(xs, c => within(c, 'activated', 14)) : null,
      paying: rate(xs, paying),
    }
  })

  // Where businesses came from (created in the period).
  const groupBy = (key: (a: any) => string | null) => {
    const m = new Map<string, { key: string; workspaces: number; activated: number; paying: number }>()
    for (const c of cohort) {
      const k = key(acqOf.get(c.id)) || '(unknown)'
      const e = m.get(k) || { key: k, workspaces: 0, activated: 0, paying: 0 }
      e.workspaces++; if (has(c, 'activated')) e.activated++; if (paying(c)) e.paying++
      m.set(k, e)
    }
    return [...m.values()].sort((a, b) => b.workspaces - a.workspaces).slice(0, 25)
  }

  // Adoption across every live business.
  const adoption = MILESTONES.filter(m => m.key !== 'workspace_created').map(m => ({
    key: m.key, label: m.label, group: m.group, count: live.filter(c => has(c, m.key)).length,
  }))

  const plans = new Map<string, number>()
  for (const c of live) { const k = PLAN_NAMES[effectivePlan(c.plan, c.trial_ends_at)] || normalizePlan(c.plan); plans.set(k, (plans.get(k) || 0) + 1) }

  const activationDays = companies.filter(c => has(c, 'activated') && Date.now() - createdAt(c) <= 90 * DAY)
    .map(c => (reached.get(c.id)!.get('activated')! - createdAt(c)) / DAY).filter(d => d >= 0)

  const recent = [...cohort].sort((a, b) => createdAt(b) - createdAt(a)).slice(0, 25).map(c => {
    const m = reached.get(c.id)
    return {
      id: c.id, name: c.name || c.slug || 'Unnamed', slug: c.slug, createdAt: new Date(createdAt(c)).toISOString(),
      plan: PLAN_NAMES[effectivePlan(c.plan, c.trial_ends_at)], channel: acqOf.get(c.id)?.channel || null,
      source: acqOf.get(c.id)?.source || acqOf.get(c.id)?.referrer_host || null,
      steps: m ? [...m.keys()].filter(k => k !== 'workspace_created').length : 0,
      activated: !!m?.has('activated'), closed: !!c.closed_at,
    }
  })

  return {
    migrated,
    kpis: {
      live: live.length,
      created: cohort.length, createdPrev: prevCohort.length,
      activation: rate(cohort, c => has(c, 'activated')), activationPrev: rate(prevCohort, c => has(c, 'activated')),
      channelRate: rate(cohort, c => has(c, 'channel_connected')), channelRatePrev: rate(prevCohort, c => has(c, 'channel_connected')),
      medianDaysToActivate: median(activationDays),
      paying: live.filter(paying).length,
      closed: cohort.filter(c => c.closed_at).length,
      unknownSource: cohort.filter(c => !acqOf.get(c.id)).length,
    },
    funnel,
    cohorts,
    channels: groupBy(a => a?.channel),
    sources: groupBy(a => a?.source || a?.referrer_host || null),
    campaigns: groupBy(a => a?.campaign).filter(r => r.key !== '(unknown)'),
    landing: groupBy(a => (a?.captured_from === 'signup_page' ? null : a?.landing_path)),
    adoption,
    plans: [...plans.entries()].map(([key, n]) => ({ key, workspaces: n })).sort((a, b) => b.workspaces - a.workspaces),
    recent,
  }
}

export async function healthReport(db: any) {
  const latest = await db.from('company_health_daily').select('day').order('day', { ascending: false }).limit(1)
  if (latest.error) return { migrated: false, ran: false }
  const day: string | undefined = latest.data?.[0]?.day
  const [companies, integ] = await Promise.all([companiesLive(db), collectIntegrations(db).catch(() => ({ rows: [], missing: [] as string[] }))])
  const byId = new Map(companies.map(c => [c.id, c]))
  const problems = integ.rows.filter(r => r.active && r.note && r.company_id && byId.has(r.company_id) && !byId.get(r.company_id)!.closed_at)
    .map(r => ({ company_id: r.company_id, company: byId.get(r.company_id!)?.name || 'Unnamed', type: r.type, note: r.note, detail: r.detail, last: r.last }))
    .sort((a, b) => a.type.localeCompare(b.type))
  if (!day) return { migrated: true, ran: false, problems }

  const weekAgo = new Date(Date.parse(`${day}T00:00:00Z`) - 7 * DAY).toISOString().slice(0, 10)
  const [today, before] = await Promise.all([
    all<any>(() => db.from('company_health_daily').select('company_id, score, band, reasons, signals, updated_at').eq('day', day).order('company_id')),
    all<any>(() => db.from('company_health_daily').select('company_id, score, band').eq('day', weekAgo).order('company_id')),
  ])
  const prev = new Map(before.rows.map(r => [r.company_id, r]))
  const rows = today.rows.filter(r => byId.has(r.company_id)).map(r => {
    const c = byId.get(r.company_id)
    const was = prev.get(r.company_id)
    return {
      id: r.company_id, name: c?.name || c?.slug || 'Unnamed', slug: c?.slug, plan: PLAN_NAMES[effectivePlan(c?.plan, c?.trial_ends_at)],
      score: r.score, band: r.band, bandLabel: BAND_LABEL[r.band as keyof typeof BAND_LABEL] || r.band,
      change: was ? r.score - was.score : null, wasBand: was?.band || null,
      reasons: r.reasons || [],
      lastSignInAt: r.signals?.lastSignInAt || null, inbound: r.signals?.inboundRecent ?? 0,
      replies: (r.signals?.repliesRecent ?? 0) + (r.signals?.aiRepliesRecent ?? 0), ageDays: r.signals?.ageDays ?? null,
    }
  }).sort((a, b) => a.score - b.score)
  const count = (b: string) => rows.filter(r => r.band === b).length
  return {
    migrated: true, ran: true, day, updatedAt: today.rows[0]?.updated_at || null,
    bands: { healthy: count('healthy'), attention: count('attention'), at_risk: count('at_risk'), new: count('new') },
    worsened: rows.filter(r => r.wasBand && r.wasBand !== 'at_risk' && r.band === 'at_risk').length,
    improved: rows.filter(r => r.wasBand === 'at_risk' && r.band !== 'at_risk').length,
    avgScore: rows.length ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : null,
    rows,
    problems,
  }
}
