// Read Colvy's own analytics from PostHog's Query API for Super Admin →
// Intelligence. Server-side only: the personal API key never reaches a
// browser. Results are cached in memory per server instance (short for live
// data, longer for reports), so several Super Admin tabs or refreshes share one
// PostHog query and the database is never involved.

const INGEST = (process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/$/, '')

export function posthogApiHost(): string {
  const explicit = process.env.POSTHOG_API_HOST
  if (explicit) return explicit.replace(/\/$/, '')
  return INGEST.replace('://us.i.posthog.com', '://us.posthog.com').replace('://eu.i.posthog.com', '://eu.posthog.com')
}

export function posthogConfig(): { ok: boolean; collecting: boolean; missing: string[] } {
  const missing: string[] = []
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) missing.push('NEXT_PUBLIC_POSTHOG_KEY')
  if (!process.env.POSTHOG_API_KEY) missing.push('POSTHOG_API_KEY')
  if (!process.env.POSTHOG_PROJECT_ID) missing.push('POSTHOG_PROJECT_ID')
  return { ok: !!process.env.POSTHOG_API_KEY && !!process.env.POSTHOG_PROJECT_ID, collecting: !!process.env.NEXT_PUBLIC_POSTHOG_KEY, missing }
}

async function runQuery(query: any): Promise<any> {
  const key = process.env.POSTHOG_API_KEY
  const project = process.env.POSTHOG_PROJECT_ID
  if (!key || !project) throw new Error('PostHog API key not configured')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 25_000)
  try {
    const res = await fetch(`${posthogApiHost()}/api/projects/${project}/query/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query }),
      signal: ctrl.signal,
      cache: 'no-store',
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      throw new Error(`PostHog ${res.status}: ${t.slice(0, 180)}`)
    }
    return await res.json()
  } finally { clearTimeout(timer) }
}

/** A HogQL query; rows come back as objects keyed by column name. */
export async function hogql(sql: string, values: Record<string, any> = {}): Promise<Record<string, any>[]> {
  const j = await runQuery({ kind: 'HogQLQuery', query: sql, values })
  const cols: string[] = j?.columns || []
  return (j?.results || []).map((r: any[]) => Object.fromEntries(cols.map((c, i) => [c, r[i]])))
}

/** A PostHog FunnelsQuery; returns each step's name and count. */
export async function funnel(steps: { event: string; label: string; properties?: any[] }[], from: string, to: string, windowDays = 14): Promise<{ label: string; count: number }[]> {
  const j = await runQuery({
    kind: 'FunnelsQuery',
    series: steps.map(s => ({ kind: 'EventsNode', event: s.event, name: s.event, ...(s.properties ? { properties: s.properties } : {}) })),
    dateRange: { date_from: from, date_to: to },
    funnelsFilter: { funnelWindowInterval: windowDays, funnelWindowIntervalUnit: 'day' },
  })
  const res = Array.isArray(j?.results?.[0]) ? j.results[0] : (j?.results || [])
  return steps.map((s, i) => ({ label: s.label, count: Number(res[i]?.count || 0) }))
}

// ── Cache ────────────────────────────────────────────────────────────────────

const cache = new Map<string, { at: number; data: any }>()

export async function cached<T>(key: string, ttlMs: number, fresh: boolean, fn: () => Promise<T>): Promise<T & { cachedAt?: string }> {
  const hit = cache.get(key)
  if (!fresh && hit && Date.now() - hit.at < ttlMs) return { ...hit.data, cachedAt: new Date(hit.at).toISOString() }
  const data: any = await fn()
  cache.set(key, { at: Date.now(), data })
  if (cache.size > 200) { const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0]; if (oldest) cache.delete(oldest[0]) }
  return { ...data, cachedAt: new Date().toISOString() }
}
