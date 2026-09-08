import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const SUPER_ADMIN = 'bishalstha76@gmail.com'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// The Query API lives on the APP host (e.g. us.posthog.com), NOT the ingest host
// (us.i.posthog.com) that the browser SDK points at. Derive it from the ingest
// host by dropping the ".i." segment, or take POSTHOG_API_HOST if set.
function apiHost(): string {
  const explicit = process.env.POSTHOG_API_HOST
  if (explicit) return explicit.replace(/\/$/, '')
  const ingest = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'
  return ingest.replace(/\/$/, '').replace('://us.i.posthog.com', '://us.posthog.com').replace('://eu.i.posthog.com', '://eu.posthog.com')
}

// Run one PostHog Query-API query (HogQL / TrendsQuery / FunnelsQuery). Returns
// the parsed JSON or throws with a short message.
async function phQuery(host: string, projectId: string, key: string, query: any): Promise<any> {
  const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`PostHog ${res.status}: ${t.slice(0, 200)}`)
  }
  return res.json()
}

/**
 * GET /api/platform-admin/posthog-insights
 *
 * Super-admin only. Pulls LIVE product analytics from PostHog's Query API so the
 * platform-admin Analytics tab can show real funnels/trends (not our DB mirror).
 * Needs server-side secrets — never the browser ingest key:
 *   POSTHOG_API_KEY     personal API key with query read scope
 *   POSTHOG_PROJECT_ID  the project's numeric id
 *   POSTHOG_API_HOST    optional; defaults derived from NEXT_PUBLIC_POSTHOG_HOST
 * Returns { configured:false } when the secrets are absent so the UI can prompt.
 */
export async function GET(req: NextRequest) {
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const { data: auth } = await admin().auth.getUser(token)
    if ((auth?.user?.email || '').toLowerCase() !== SUPER_ADMIN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const key = process.env.POSTHOG_API_KEY
    const projectId = process.env.POSTHOG_PROJECT_ID
    if (!key || !projectId) {
      return NextResponse.json({ configured: false })
    }
    const host = apiHost()

    // Fulfilment funnel: packed → shipped over the last 30 days.
    const statusStep = (status: string) => ({
      kind: 'EventsNode', event: 'order_status_set',
      properties: [{ key: 'status', value: status, operator: 'exact', type: 'event' }],
    })
    const funnelQuery = {
      kind: 'FunnelsQuery',
      series: [statusStep('packed'), statusStep('shipped')],
      dateRange: { date_from: '-30d' },
    }
    // Shipped events per day, last 14 days.
    const trendQuery = {
      kind: 'TrendsQuery',
      series: [{ kind: 'EventsNode', event: 'order_status_set', math: 'total', properties: [{ key: 'status', value: 'shipped', operator: 'exact', type: 'event' }] }],
      interval: 'day',
      dateRange: { date_from: '-14d' },
    }
    // Totals (30d) via HogQL.
    const totalsQuery = {
      kind: 'HogQLQuery',
      query: `
        SELECT
          countIf(event = 'order_status_set' AND properties.status = 'shipped') AS shipped,
          countIf(event = 'order_labels_printed') AS labels,
          countIf(event = '$pageview') AS pageviews,
          count(DISTINCT if(event = '$pageview', person_id, NULL)) AS visitors
        FROM events
        WHERE timestamp > now() - INTERVAL 30 DAY
      `,
    }

    const settle = async (q: any) => { try { return await phQuery(host, projectId, key, q) } catch (e: any) { return { _error: e?.message || 'query failed' } } }
    const [funnel, trend, totals] = await Promise.all([settle(funnelQuery), settle(trendQuery), settle(totalsQuery)])

    // Parse defensively — shapes vary by PostHog version.
    let funnelSteps: { name: string; count: number }[] = []
    try {
      const rows = funnel?.results || []
      funnelSteps = rows.map((r: any) => ({ name: r.custom_name || r.name || r.action_id || 'step', count: Number(r.count) || 0 }))
    } catch {}

    let trendDays: { label: string; value: number }[] = []
    try {
      const r0 = (trend?.results || [])[0] || {}
      const data: number[] = r0.data || []
      const labels: string[] = r0.labels || r0.days || []
      trendDays = data.map((v, i) => ({ label: String(labels[i] ?? i), value: Number(v) || 0 }))
    } catch {}

    let totalsRow: Record<string, number> = {}
    try {
      const cols: string[] = totals?.columns || []
      const row: any[] = (totals?.results || [])[0] || []
      cols.forEach((c, i) => { totalsRow[c] = Number(row[i]) || 0 })
    } catch {}

    return NextResponse.json({
      configured: true,
      funnel: funnelSteps,
      trend: trendDays,
      totals: totalsRow,
      errors: [funnel?._error, trend?._error, totals?._error].filter(Boolean),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}
