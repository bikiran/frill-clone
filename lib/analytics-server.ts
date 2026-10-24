// Server-side events for Colvy's own analytics (PostHog), for the moments the
// browser can't be trusted to report: an account really created, a workspace
// really made, a Stripe event really received.
//
// Each event carries a stable id (`insertId`, e.g. "account_created:<user>"),
// turned into the event's uuid, so a retried request or a redelivered webhook
// is stored once. Never sends message text, passwords or payment details: pass
// ids, codes and counts only. A no-op without NEXT_PUBLIC_POSTHOG_KEY, and it
// never throws or holds up the response for long.

import { createHash } from 'crypto'

export type ServerEvent =
  | 'account_created'     // signup route: the user row exists (props: via)
  | 'business_created'    // a business's workspace row was created (props: company_id, via, plan) — the client's workspace_created stays as is
  | 'milestone_reached'   // a business did something for the first time (props: milestone, company_id) — lib/intel/business-job
  | 'billing_event'       // Colvy billing changed (props: kind, product, plan, mrr_before/after in AUD cents) — lib/intel/billing

const INGEST = (process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/$/, '')

/** A UUID derived from a stable key, so the same event always gets the same id. */
function uuidFrom(key: string): string {
  const h = createHash('sha1').update(key).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${h.slice(18, 20)}-${h.slice(20, 32)}`
}

export async function captureServer(event: ServerEvent, distinctId: string, properties: Record<string, any> = {}, insertId?: string): Promise<void> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key || !distinctId) return
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 2500)
    await fetch(`${INGEST}/i/v0/e/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        event,
        distinct_id: distinctId,
        uuid: uuidFrom(insertId || `${event}:${distinctId}:${Date.now()}`),
        timestamp: new Date().toISOString(),
        properties: { ...properties, $lib: 'colvy-server', source: 'server' },
      }),
      signal: ctrl.signal,
    }).catch(() => null)
    clearTimeout(timer)
  } catch { /* analytics must never break a request */ }
}

/**
 * Several events in one request, each at the time it happened (PostHog's
 * batch endpoint). Same stable ids as captureServer. Never throws.
 */
export async function captureServerBatch(events: { event: ServerEvent; distinctId: string; properties?: Record<string, any>; insertId: string; timestamp?: string }[]): Promise<{ sent: number }> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const list = events.filter(e => e.distinctId)
  if (!key || !list.length) return { sent: 0 }
  let sent = 0
  for (let i = 0; i < list.length; i += 500) {
    const chunk = list.slice(i, i + 500)
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 8000)
      const res = await fetch(`${INGEST}/batch/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: key,
          batch: chunk.map(e => ({
            event: e.event,
            distinct_id: e.distinctId,
            uuid: uuidFrom(e.insertId),
            timestamp: e.timestamp || new Date().toISOString(),
            properties: { ...(e.properties || {}), $lib: 'colvy-server', source: 'server' },
          })),
        }),
        signal: ctrl.signal,
      }).catch(() => null)
      clearTimeout(timer)
      if (res?.ok) sent += chunk.length
    } catch { /* analytics must never break a job */ }
  }
  return { sent }
}

/**
 * Delete a person and their events from PostHog (account deletion, privacy
 * requests). Needs the personal API key and project id the Intelligence
 * Centre uses (POSTHOG_API_KEY, POSTHOG_PROJECT_ID); without them it does
 * nothing and says so. Never throws.
 */
export async function deleteAnalyticsPerson(distinctId: string): Promise<{ ok: boolean; skipped?: string }> {
  const key = process.env.POSTHOG_API_KEY
  const project = process.env.POSTHOG_PROJECT_ID
  if (!key || !project) return { ok: false, skipped: 'PostHog API key not configured' }
  try {
    const host = (process.env.POSTHOG_API_HOST || INGEST.replace('://us.i.posthog.com', '://us.posthog.com').replace('://eu.i.posthog.com', '://eu.posthog.com')).replace(/\/$/, '')
    const auth = { Authorization: `Bearer ${key}` }
    const found = await fetch(`${host}/api/projects/${project}/persons/?distinct_id=${encodeURIComponent(distinctId)}`, { headers: auth })
    const j = await found.json().catch(() => ({}))
    const person = j?.results?.[0]
    if (!person?.id) return { ok: true, skipped: 'no person' }
    const del = await fetch(`${host}/api/projects/${project}/persons/${person.id}/?delete_events=true`, { method: 'DELETE', headers: auth })
    return { ok: del.ok }
  } catch { return { ok: false } }
}
