'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser, readCache, resolveCompanyUser, writeCache } from '@/lib/client-cache'
import { useEntitlements } from '@/lib/entitlements-client'
import ProGate from '@/components/ProGate'
import { BarList, Card, InsightsPage, InsightsSkeleton, Kpi, RangePills } from '@/components/insights/InsightsUI'

// Analytics: ideas, the Help Centre and support, the widget and tasks by
// outlet for a date range. Totals are counted by the database (head counts)
// rather than downloading every row, so the page stays quick however much
// history a workspace has.

type Range = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'all' | 'custom'
const RANGES: [Range, string][] = [['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['month', 'This month'], ['all', 'All time'], ['custom', 'Custom']]

type Snapshot = {
  stats: { totalIdeas: number; totalVotes: number; totalComments: number; topIdeas: any[] }
  helpStats: { totalArticles: number; totalViews: number; totalLikes: number; totalTickets: number; openTickets: number; topArticles: any[] }
  widgetStats: { totalViews: number; byTab: Record<string, number>; avgViewsPerDay: number }
  taskStats: { total: number; open: number; overdue: number; completed: number; byOutlet: any[] }
}

const n = (v: number) => (v || 0).toLocaleString('en-AU')
const db = supabase as any

function dateRange(range: Range, customStart: string, customEnd: string) {
  const now = new Date()
  let start: Date, end: Date
  if (range === 'today') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  } else if (range === 'yesterday') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  } else if (range === '7d') {
    start = new Date(now.getTime() - 7 * 86400000); end = now
  } else if (range === '30d') {
    start = new Date(now.getTime() - 30 * 86400000); end = now
  } else if (range === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1)
    end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  } else if (range === 'custom' && customStart && customEnd) {
    start = new Date(customStart); end = new Date(customEnd + 'T23:59:59')
  } else {
    start = new Date('2000-01-01'); end = new Date('2099-12-31')
  }
  const days = Math.max(1, Math.ceil((Math.min(end.getTime(), now.getTime()) - start.getTime()) / 86400000))
  return { start: start.toISOString(), end: end.toISOString(), days }
}

async function loadIdeas(cid: string, start: string, end: string, allTime: boolean): Promise<Snapshot['stats']> {
  const [{ data: ideas }, allIdeas] = await Promise.all([
    db.from('ideas').select('id,title,votes,status,created_at').eq('company_id', cid).gte('created_at', start).lte('created_at', end),
    // "All time" also counts votes stored on the ideas (includes guest votes).
    allTime ? db.from('ideas').select('votes').eq('company_id', cid) : Promise.resolve({ data: null }),
  ])
  const list: any[] = ideas || []
  const ids = list.map(i => i.id)
  let totalVotes = 0, totalComments = 0
  if (ids.length) {
    // Vote rows in the window, scoped to this workspace's ideas; summing
    // ideas.votes would ignore the date range.
    const [{ count: votes }, { count: comments }] = await Promise.all([
      db.from('votes').select('*', { count: 'exact', head: true }).in('idea_id', ids).gte('created_at', start).lte('created_at', end),
      db.from('comments').select('*', { count: 'exact', head: true }).in('idea_id', ids).gte('created_at', start).lte('created_at', end),
    ])
    totalVotes = votes || 0; totalComments = comments || 0
  }
  if (allIdeas?.data) totalVotes = Math.max(totalVotes, allIdeas.data.reduce((s: number, i: any) => s + (i.votes || 0), 0))
  return { totalIdeas: list.length, totalVotes, totalComments, topIdeas: [...list].sort((a, b) => (b.votes || 0) - (a.votes || 0)).slice(0, 6) }
}

async function loadHelp(cid: string, start: string, end: string): Promise<Snapshot['helpStats']> {
  const tickets = () => db.from('support_tickets').select('*', { count: 'exact', head: true }).eq('company_id', cid).gte('created_at', start).lte('created_at', end)
  const [{ data: articles }, { count: totalTickets }, { count: openTickets }] = await Promise.all([
    db.from('help_articles').select('id, title, views, likes').eq('company_id', cid).gte('created_at', start).lte('created_at', end),
    tickets(),
    tickets().eq('status', 'open'),
  ])
  const list: any[] = articles || []
  let totalViews = list.reduce((s, a) => s + (a.views || 0), 0)
  if (list.length) {
    // help_article_views, where it exists, is the accurate count for the window.
    try {
      const { count } = await db.from('help_article_views').select('*', { count: 'exact', head: true })
        .in('article_id', list.map(a => a.id)).gte('viewed_at', start).lte('viewed_at', end)
      if (count != null) totalViews = count
    } catch {}
  }
  return {
    totalArticles: list.length, totalViews, totalLikes: list.reduce((s, a) => s + (a.likes || 0), 0),
    totalTickets: totalTickets || 0, openTickets: openTickets || 0,
    topArticles: [...list].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 6),
  }
}

async function loadWidget(cid: string, start: string, end: string, days: number): Promise<Snapshot['widgetStats']> {
  const count = () => db.from('widget_analytics').select('*', { count: 'exact', head: true }).eq('company_id', cid).gte('created_at', start).lte('created_at', end)
  try {
    // The tabs in use come from the latest events; each tab is then counted.
    const [{ count: views }, { data: recent }] = await Promise.all([
      count().eq('event', 'view'),
      db.from('widget_analytics').select('tab').eq('company_id', cid).gte('created_at', start).lte('created_at', end)
        .not('tab', 'is', null).order('created_at', { ascending: false }).limit(1000),
    ])
    const tabs = [...new Set<string>((recent || []).map((r: any) => r.tab).filter(Boolean))].slice(0, 12)
    const perTab = await Promise.all(tabs.map(t => count().eq('tab', t).then((r: any) => [t, r.count || 0] as const)))
    return { totalViews: views || 0, byTab: Object.fromEntries(perTab), avgViewsPerDay: Math.round((views || 0) / days) }
  } catch {
    return { totalViews: 0, byTab: {}, avgViewsPerDay: 0 }
  }
}

// Tasks created in the window, per outlet. A task tied to several outlets
// counts toward each; tasks with no outlet land under "No outlet".
async function loadTasks(cid: string, start: string, end: string): Promise<Snapshot['taskStats']> {
  const empty = { total: 0, open: 0, overdue: 0, completed: 0, byOutlet: [] as any[] }
  try {
    // Prefer location_ids (V227); fall back if the column isn't there.
    const run = (cols: string) => db.from('conversation_tasks').select(cols).eq('company_id', cid).gte('created_at', start).lte('created_at', end)
    const [{ data: locs }, first] = await Promise.all([
      db.from('company_locations').select('id, label, suburb').eq('company_id', cid),
      run('id, done, due_date, location_id, location_ids'),
    ])
    const locName: Record<string, string> = {}
    for (const l of locs || []) locName[l.id] = l.label || l.suburb || 'Outlet'
    let res = first
    if (res.error) res = await run('id, done, due_date, location_id')
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const acc: Record<string, { open: number; overdue: number; completed: number; total: number }> = {}
    let total = 0, open = 0, overdue = 0, completed = 0
    for (const t of res.data || []) {
      const done = !!t.done
      const due = t.due_date ? new Date(String(t.due_date).replace(' ', 'T')).getTime() : null
      const late = !done && due != null && !isNaN(due) && due < today
      total++
      if (done) completed++; else { open++; if (late) overdue++ }
      const outs: string[] = Array.isArray(t.location_ids) && t.location_ids.length ? t.location_ids : t.location_id ? [t.location_id] : ['']
      for (const o of outs) {
        const a = (acc[o] ||= { open: 0, overdue: 0, completed: 0, total: 0 })
        a.total++
        if (done) a.completed++; else { a.open++; if (late) a.overdue++ }
      }
    }
    const byOutlet = Object.entries(acc).map(([id, v]) => ({ id, name: id ? locName[id] || 'Outlet' : 'No outlet', ...v })).sort((a, b) => b.total - a.total)
    return { total, open, overdue, completed, byOutlet }
  } catch {
    return empty
  }
}

export default function AnalyticsPage() {
  const ent = useEntitlements()
  const seededCid = peekCompanyUser()?.companyId || null
  const [range, setRange] = useState<Range>('30d')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const cacheKey = (cid: string | null) => (cid ? `analytics:v2:${cid}:${range}:${customStart}:${customEnd}` : '')
  const [snap, setSnap] = useState<Snapshot | null>(() => (seededCid ? readCache<Snapshot>(cacheKey(seededCid)) ?? null : null))
  const [stale, setStale] = useState(false)

  useEffect(() => {
    let live = true
    ;(async () => {
      const cid = peekCompanyUser()?.companyId || (await resolveCompanyUser().catch(() => null))?.companyId
      if (!cid || !live) return
      const key = cacheKey(cid)
      const hit = readCache<Snapshot>(key)
      if (hit) { setSnap(hit); setStale(false) } else setStale(true)
      const { start, end, days } = dateRange(range, customStart, customEnd)
      // The four sections don't depend on each other: load them side by side.
      const [stats, helpStats, widgetStats, taskStats] = await Promise.all([
        loadIdeas(cid, start, end, range === 'all').catch(() => ({ totalIdeas: 0, totalVotes: 0, totalComments: 0, topIdeas: [] })),
        loadHelp(cid, start, end).catch(() => ({ totalArticles: 0, totalViews: 0, totalLikes: 0, totalTickets: 0, openTickets: 0, topArticles: [] })),
        loadWidget(cid, start, end, days),
        loadTasks(cid, start, end),
      ])
      if (!live) return
      const next = { stats, helpStats, widgetStats, taskStats }
      writeCache(key, next)
      setSnap(next); setStale(false)
    })()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, customStart, customEnd])

  // Advanced analytics is an Everything-plan feature: lower plans see an
  // upgrade wall instead of the dashboard.
  if (ent.ready && ('advancedAnalytics' in ent.features) && !ent.hasFeature('advancedAnalytics')) {
    return (
      <InsightsPage title="Workspace" accent="analytics" sub="Ideas, your Help Centre, the widget and your team’s tasks, in one place.">
        <div style={{ maxWidth: 520 }}><ProGate feature="advancedAnalytics"><div /></ProGate></div>
      </InsightsPage>
    )
  }

  const controls = (
    <>
      <RangePills value={range} options={RANGES} onChange={setRange} />
      {range === 'custom' && (
        <span className="aly-dates">
          <input className="ins-field" type="date" aria-label="From" value={customStart} onChange={e => setCustomStart(e.target.value)} />
          <span>to</span>
          <input className="ins-field" type="date" aria-label="To" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
        </span>
      )}
    </>
  )

  const s = snap
  return (
    <InsightsPage title="Workspace" accent="analytics" sub="Ideas, your Help Centre, the widget and your team’s tasks, in one place." controls={controls}>
      <style>{ALY_CSS}</style>
      {!s ? <InsightsSkeleton /> : (
        <div className={`ins-body${stale ? ' stale' : ''}`}>
          <div className="ins-kpis">
            <Kpi icon="bulb" label="Ideas" value={n(s.stats.totalIdeas)} sub={`${n(s.stats.totalComments)} comments`} tone="#f59e0b" />
            <Kpi icon="vote" label="Votes" value={n(s.stats.totalVotes)} sub="On your ideas" tone="#6366f1" />
            <Kpi icon="eye" label="Help Centre views" value={n(s.helpStats.totalViews)} sub={`${n(s.helpStats.totalArticles)} articles · ${n(s.helpStats.totalLikes)} likes`} tone="#0ea5e9" />
            <Kpi icon="ticket" label="Open tickets" value={n(s.helpStats.openTickets)} sub={`${n(s.helpStats.totalTickets)} in this period`} tone="#ff6a4d" />
            <Kpi icon="megaphone" label="Widget views" value={n(s.widgetStats.totalViews)} sub={`About ${n(s.widgetStats.avgViewsPerDay)} a day`} tone="#d946ef" />
            <Kpi icon="check" label="Open tasks" value={n(s.taskStats.open)} sub={s.taskStats.overdue ? `${n(s.taskStats.overdue)} overdue` : `${n(s.taskStats.completed)} done`} tone={s.taskStats.overdue ? '#ef4444' : '#16a34a'} />
          </div>

          <div className="ins-grid2">
            <Card title="Most voted ideas" sub={`${n(s.stats.totalIdeas)} ideas in this period`}>
              <BarList color="#6366f1" fmt={v => `${n(v)} vote${v === 1 ? '' : 's'}`} empty="No ideas in this period yet."
                rows={s.stats.topIdeas.map((i: any) => ({ name: i.title || 'Untitled idea', value: i.votes || 0, meta: i.status ? String(i.status).replace(/[_-]/g, ' ').replace(/^\w/, c => c.toUpperCase()) : undefined }))} />
            </Card>
            <Card title="Most read articles" sub={`${n(s.helpStats.totalArticles)} articles in this period`}>
              <BarList color="#0ea5e9" fmt={v => `${n(v)} view${v === 1 ? '' : 's'}`} empty="No Help Centre articles in this period."
                rows={s.helpStats.topArticles.map((a: any) => ({ name: a.title || 'Untitled article', value: a.views || 0, meta: a.likes ? `${n(a.likes)} like${a.likes === 1 ? '' : 's'}` : undefined }))} />
            </Card>
            <Card title="Widget tabs" sub="Where visitors spend their time">
              <BarList color="#d946ef" fmt={v => n(v)} empty="No widget activity in this period."
                rows={Object.entries(s.widgetStats.byTab).sort((a, b) => b[1] - a[1]).map(([tab, v]) => ({ name: tab.replace(/[_-]/g, ' ').replace(/^\w/, c => c.toUpperCase()), value: v }))} />
            </Card>
            <Card title="Tasks by outlet" sub="Tasks tied to more than one outlet count under each">
              {s.taskStats.byOutlet.length === 0 ? <p className="ins-empty">No tasks in this period.</p> : (
                <div className="aly-tasks" role="table">
                  <div className="aly-tr aly-th" role="row"><span role="columnheader">Outlet</span><span role="columnheader">Open</span><span role="columnheader">Overdue</span><span role="columnheader">Done</span></div>
                  {s.taskStats.byOutlet.map((o: any) => (
                    <div key={o.id || 'none'} className="aly-tr" role="row">
                      <span role="cell" className={o.id ? '' : 'none'}>{o.name}</span>
                      <span role="cell">{n(o.open)}</span>
                      <span role="cell">{o.overdue ? <em>{n(o.overdue)}</em> : '0'}</span>
                      <span role="cell" className="done">{n(o.completed)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </InsightsPage>
  )
}

const ALY_CSS = `
.aly-dates{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#8e8e93}
.aly-tasks{display:flex;flex-direction:column}
.aly-tr{display:grid;grid-template-columns:minmax(0,1.8fr) repeat(3,minmax(54px,.6fr));align-items:center;gap:8px;padding:11px 2px;border-top:1px solid #f1f1f3;font-size:14px;color:#18181b;font-variant-numeric:tabular-nums}
.aly-tr>span:not(:first-child){text-align:right}
.aly-tr>span:first-child{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aly-tr>span.none{color:#8e8e93;font-weight:500}
.aly-tr em{font-style:normal;font-weight:700;color:#dc2626;background:#fef2f2;padding:2px 8px;border-radius:999px}
.aly-tr .done{color:#16a34a;font-weight:600}
.aly-th{border-top:none;padding-top:0;font-size:12.5px;font-weight:600;color:#8e8e93}
.aly-th>span:first-child{font-weight:600}
`
