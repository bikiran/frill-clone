// The hourly business-analytics job (/api/cron/intel), server only:
//
//   1. Milestones: intel_refresh_milestones() (V415) records the first time
//      each business did something that matters, from the tables that already
//      hold it. New ones go to PostHog too (milestone_reached), at the time
//      they happened, with a stable id so a rerun never doubles them.
//   2. Acquisition: businesses with no record get one from their sign-up
//      (signup_attempts), or failing that their PostHog person's first visit.
//   3. Health: today's score for every live business (lib/intel/health),
//      upserted, so the day's row is always the latest; rows older than 400
//      days are pruned.
//
// Counts and ids only: no message text, names or contact details are read.
// Before V415 runs it reports "not set up" and does nothing.

import { captureServerBatch } from '@/lib/analytics-server'
import { collectIntegrations } from '@/app/api/platform-admin/_lib/integrations'
import { acquisitionFromSignup, acquisitionFromPosthog, type AcquisitionRow } from '@/lib/intel/acquisition'
import { scoreHealth } from '@/lib/intel/health'
import { hogql, posthogConfig } from '@/lib/intel/posthog'

const DAY = 86_400_000
const HEALTH_KEEP_DAYS = 400

const missingFn = (e: any) => /^(42883|PGRST202|42P01|PGRST205)$/.test(String(e?.code || '')) || /could not find the function|does not exist/i.test(String(e?.message || ''))

/** Every row of a select, 1,000 at a time (PostgREST's page size). */
async function all<T = any>(make: () => any, max = 50_000): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await make().range(from, from + 999)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

export type BusinessJobResult = {
  ok: boolean
  setup?: false
  milestones?: { added: number; errors: { milestone: string; error: string }[] }
  acquisition?: { added: number; fromPosthog: number }
  health?: { scored: number; pruned: boolean }
  posthog?: { sent: number }
  error?: string
}

export async function runBusinessIntel(db: any, now = new Date()): Promise<BusinessJobResult> {
  // ── 1. Milestones ──────────────────────────────────────────────────────────
  const ms = await db.rpc('intel_refresh_milestones')
  if (ms.error) {
    if (missingFn(ms.error)) return { ok: true, setup: false }
    return { ok: false, error: `milestones: ${ms.error.message}` }
  }
  const added: { company_id: string; milestone: string; reached_at: string }[] = ms.data?.added || []
  const msErrors = ms.data?.errors || []

  const companies = await all<any>(() => db.from('companies').select('id, owner_id, created_at, is_demo, closed_at').order('id'))
  const byId = new Map(companies.map(c => [c.id, c]))

  let sent = 0
  if (added.length && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    const r = await captureServerBatch(added.flatMap(a => {
      const owner = byId.get(a.company_id)?.owner_id
      return owner ? [{
        event: 'milestone_reached' as const, distinctId: owner, timestamp: a.reached_at,
        insertId: `milestone:${a.company_id}:${a.milestone}`,
        properties: { milestone: a.milestone, company_id: a.company_id, $groups: { company: a.company_id } },
      }] : []
    }))
    sent = r.sent
  }

  // ── 2. Acquisition ─────────────────────────────────────────────────────────
  const have = new Set((await all<any>(() => db.from('company_acquisition').select('company_id').order('company_id'))).map(r => r.company_id))
  const need = companies.filter(c => !c.is_demo && !have.has(c.id)).map(c => c.id)
  const rows: AcquisitionRow[] = []
  for (const ids of chunks(need, 200)) {
    const { data } = await db.from('signup_attempts')
      .select('company_id, utm, referrer, landing_path, first_touch_at, click_id_type, ip_country, device')
      .in('company_id', ids).limit(400)
    for (const a of data || []) if (a.company_id && !rows.some(r => r.company_id === a.company_id)) rows.push(acquisitionFromSignup(a.company_id, a))
  }
  // No sign-up record (older workspaces, Google sign-in before V390): the
  // owner's PostHog person, if PostHog is connected.
  let fromPosthog = 0
  const left = need.filter(id => !rows.some(r => r.company_id === id))
  if (left.length && posthogConfig().ok) {
    const ownerOf = new Map<string, string>()
    for (const id of left.slice(0, 500)) { const o = byId.get(id)?.owner_id; if (o) ownerOf.set(String(o), id) }
    if (ownerOf.size) {
      try {
        const found = await hogql(
          `SELECT distinct_id,
                  person.properties.$initial_utm_source AS src, person.properties.$initial_utm_medium AS med,
                  person.properties.$initial_utm_campaign AS camp, person.properties.$initial_referring_domain AS ref,
                  person.properties.$initial_pathname AS landing, person.properties.$initial_gclid AS gclid,
                  person.properties.$initial_fbclid AS fbclid, person.properties.$initial_msclkid AS msclkid,
                  person.properties.$initial_geoip_country_code AS country, person.created_at AS first_seen
             FROM person_distinct_ids WHERE distinct_id IN {ids} LIMIT 1000`, { ids: [...ownerOf.keys()] })
        for (const p of found) {
          const id = ownerOf.get(String(p.distinct_id))
          if (!id || rows.some(r => r.company_id === id)) continue
          if (!p.src && !p.ref && !p.landing) continue
          rows.push(acquisitionFromPosthog(id, p)); fromPosthog++
        }
      } catch { /* PostHog lookups are a bonus; try again next hour */ }
    }
  }
  for (const part of chunks(rows, 500)) {
    const { error } = await db.from('company_acquisition').upsert(part, { onConflict: 'company_id', ignoreDuplicates: true })
    if (error) return { ok: false, error: `acquisition: ${error.message}` }
  }

  // ── 3. Health ──────────────────────────────────────────────────────────────
  const act = await db.rpc('intel_company_activity', { p_now: now.toISOString() })
  if (act.error) return { ok: false, error: `activity: ${act.error.message}` }
  const activity: any[] = act.data || []
  const reached = new Map<string, Set<string>>()
  for (const r of await all<any>(() => db.from('company_milestones').select('company_id, milestone').order('company_id').order('milestone'), 200_000)) {
    let s = reached.get(r.company_id); if (!s) reached.set(r.company_id, (s = new Set())); s.add(r.milestone)
  }
  const issues = new Map<string, string[]>()
  try {
    for (const r of (await collectIntegrations(db)).rows) {
      if (!r.company_id || !r.active || !r.note) continue
      const list = issues.get(r.company_id) || []; list.push(`${r.type}: ${r.note}`); issues.set(r.company_id, list)
    }
  } catch { /* the score just goes without it */ }
  const owners = [...new Set(activity.map(a => byId.get(a.company_id)?.owner_id).filter(Boolean))] as string[]
  const subOf = new Map<string, string>()
  for (const ids of chunks(owners, 200)) {
    const { data } = await db.from('subscriptions').select('user_id, status').in('user_id', ids)
    for (const s of data || []) subOf.set(s.user_id, s.status)
  }

  const day = now.toISOString().slice(0, 10)
  const health = activity.map(a => {
    const co = byId.get(a.company_id)
    const ageDays = co?.created_at ? Math.floor((now.getTime() - new Date(co.created_at).getTime()) / DAY) : 999
    const input = {
      ageDays,
      inboundRecent: Number(a.inbound_recent || 0), inboundPrevious: Number(a.inbound_previous || 0),
      repliesRecent: Number(a.replies_recent || 0), aiRepliesRecent: Number(a.ai_replies_recent || 0),
      lastSignInAt: a.last_sign_in_at || null, lastInboundAt: a.last_inbound_at || null,
      orders30d: Number(a.orders_30d || 0), bookings30d: Number(a.bookings_30d || 0), payments30d: Number(a.payments_30d || 0),
      agentFailed7d: Number(a.agent_failed_7d || 0), staff: Number(a.staff || 0),
      integrationIssues: issues.get(a.company_id) || [],
      subscriptionStatus: co?.owner_id ? subOf.get(co.owner_id) || null : null,
      milestones: reached.get(a.company_id) || new Set<string>(),
    }
    const h = scoreHealth(input, now.getTime())
    const { milestones: _m, integrationIssues, ...counts } = input
    return {
      company_id: a.company_id, day, score: h.score, band: h.band, reasons: h.reasons,
      signals: { ...counts, issues: integrationIssues, parts: h.parts, last_reply_at: a.last_reply_at || null },
      updated_at: now.toISOString(),
    }
  })
  for (const part of chunks(health, 500)) {
    const { error } = await db.from('company_health_daily').upsert(part, { onConflict: 'company_id,day' })
    if (error) return { ok: false, error: `health: ${error.message}` }
  }
  const cutoff = new Date(now.getTime() - HEALTH_KEEP_DAYS * DAY).toISOString().slice(0, 10)
  const pr = await db.from('company_health_daily').delete().lt('day', cutoff)

  return {
    ok: true,
    milestones: { added: added.length, errors: msErrors },
    acquisition: { added: rows.length, fromPosthog },
    health: { scored: health.length, pruned: !pr.error },
    posthog: { sent },
  }
}
