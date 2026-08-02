'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser, readCache, writeCache } from '@/lib/client-cache'

function StatCard({ label, value, sub, color }: any) {
  return (
    <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--border)' }}>
      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--slate)' }}>{label}</p>
      <p className="text-3xl font-black" style={{ color: color || 'var(--coral)' }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{sub}</p>}
    </div>
  )
}

export default function AnalyticsPage() {
  const getMyCompanyId = async () => {
    // Resolve once per session from the shared identity cache when possible.
    const peeked = peekCompanyUser()?.companyId
    if (peeked) return peeked
    if (typeof window !== 'undefined') {
      const h = window.location.hostname
      if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
        const slug = h.replace('.colvy.com', '')
        const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle()
        if (co?.id) return co.id
      }
    }
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      const { data: co } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
      return co?.id || null
    }
    return null
  }

  const router = useRouter()
  const seededCu = peekCompanyUser()
  // The last snapshot we rendered for the default (30d) view, if any — lets a
  // revisit paint the stat cards instantly instead of flashing zeros.
  const seededAnalytics = seededCu?.companyId ? readCache<any>(`analytics:${seededCu.companyId}:30d::`) : undefined
  const [user, setUser] = useState<any>(seededCu?.user ?? null)
  const [loading, setLoading] = useState(!seededAnalytics)
  const [timeRange, setTimeRange] = useState<'today' | 'yesterday' | '7d' | '30d' | 'month' | 'all' | 'custom'>('30d')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  // Ideas stats
  const [stats, setStats] = useState(seededAnalytics?.stats ?? { totalIdeas: 0, totalVotes: 0, totalComments: 0, topIdeas: [] as any[], recentIdeas: [] as any[] })
  // Help stats
  const [helpStats, setHelpStats] = useState(seededAnalytics?.helpStats ?? { totalArticles: 0, totalViews: 0, totalLikes: 0, totalTickets: 0, openTickets: 0, topArticles: [] as any[], ticketsByStatus: {} as any })
  // Widget stats
  const [widgetStats, setWidgetStats] = useState(seededAnalytics?.widgetStats ?? { totalViews: 0, byTab: {} as Record<string, number>, avgViewsPerDay: 0 })
  // Task stats, broken down per outlet. A task tied to several outlets counts
  // toward each; tasks with no outlet fall under "No outlet".
  const [taskStats, setTaskStats] = useState(seededAnalytics?.taskStats ?? { total: 0, open: 0, overdue: 0, completed: 0, byOutlet: [] as any[] })

  // Calculate date range
  const getDateRange = () => {
    const now = new Date()
    let start: Date, end: Date

    if (timeRange === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    } else if (timeRange === 'yesterday') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    } else if (timeRange === '7d') {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      end = now
    } else if (timeRange === '30d') {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      end = now
    } else if (timeRange === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    } else if (timeRange === 'custom' && customStart && customEnd) {
      start = new Date(customStart)
      end = new Date(customEnd)
    } else {
      start = new Date('2000-01-01')
      end = new Date('2099-12-31')
    }

    return { start: start.toISOString(), end: end.toISOString(), daysBack: Math.ceil((now.getTime() - new Date(start).getTime()) / (24 * 60 * 60 * 1000)) }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => {
      const u = data?.session?.user
      setUser(u)
      loadAll()
    })
  }, [router, timeRange, customStart, customEnd])

  // Build the per-outlet task breakdown for the selected window. Filtered by
  // created_at (same basis as the other sections). A multi-outlet task is
  // counted once per outlet it touches; outlet-less tasks land in "No outlet".
  const loadTaskStats = async (cid: string, start: string, end: string) => {
    const empty = { total: 0, open: 0, overdue: 0, completed: 0, byOutlet: [] as any[] }
    try {
      const { data: locs } = await (supabase as any)
        .from('company_locations').select('id, label, suburb').eq('company_id', cid)
      const locName: Record<string, string> = {}
      for (const l of locs || []) locName[l.id] = l.label || l.suburb || 'Outlet'

      // Prefer selecting location_ids (V227); fall back if the column isn't there.
      const run = (cols: string) => (supabase as any)
        .from('conversation_tasks').select(cols)
        .eq('company_id', cid).gte('created_at', start).lte('created_at', end)
      let res = await run('id, done, due_date, created_at, location_id, location_ids')
      if (res.error) res = await run('id, done, due_date, created_at, location_id')
      const tasks: any[] = res.data || []

      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      // key '' = no outlet; otherwise the outlet id
      const acc: Record<string, { open: number; overdue: number; completed: number; total: number }> = {}
      const bump = (key: string, done: boolean, overdue: boolean) => {
        const a = acc[key] || (acc[key] = { open: 0, overdue: 0, completed: 0, total: 0 })
        a.total++
        if (done) a.completed++
        else { a.open++; if (overdue) a.overdue++ }
      }

      let total = 0, open = 0, overdue = 0, completed = 0
      for (const t of tasks) {
        const done = !!t.done
        const dueTs = t.due_date ? new Date(String(t.due_date).replace(' ', 'T')).getTime() : null
        const isOverdue = !done && dueTs != null && !isNaN(dueTs) && dueTs < today
        total++
        if (done) completed++; else { open++; if (isOverdue) overdue++ }
        const outs: string[] = (Array.isArray(t.location_ids) && t.location_ids.length)
          ? t.location_ids : (t.location_id ? [t.location_id] : [])
        if (outs.length === 0) bump('', done, isOverdue)
        else for (const o of outs) bump(o, done, isOverdue)
      }

      const byOutlet = Object.entries(acc)
        .map(([id, v]) => ({ id, name: id ? (locName[id] || 'Outlet') : 'No outlet', ...v }))
        .sort((a, b) => b.total - a.total)

      return { total, open, overdue, completed, byOutlet }
    } catch {
      return empty
    }
  }

  const loadAll = async () => {
    try {
      const cid = await getMyCompanyId()
      if (!cid) return

      const { start, end, daysBack } = getDateRange()

      // Instant paint on revisit / range switch: hydrate the stat cards from the
      // last snapshot for this exact range while fresh numbers load behind them.
      const cacheKey = `analytics:${cid}:${timeRange}:${customStart}:${customEnd}`
      const cachedA = readCache<any>(cacheKey)
      if (cachedA) {
        setStats(cachedA.stats)
        setHelpStats(cachedA.helpStats)
        setWidgetStats(cachedA.widgetStats)
        if (cachedA.taskStats) setTaskStats(cachedA.taskStats)
        setLoading(false)
      }

      // Ideas with proper company_id filtering
      const { data: ideas } = await (supabase as any)
        .from('ideas')
        .select('id,title,votes,status,created_at')
        .eq('company_id', cid)
        .gte('created_at', start)
        .lte('created_at', end)

      const ideasList = ideas || []
      
      // Total votes: count actual vote rows in the time window, scoped to this company's ideas.
      // Summing ideas.votes would miss the date filter and double-count with the period picker.
      const ideaIds = ideasList.map((i: any) => i.id)
      let totalVotes = 0
      let commentsCount = 0
      if (ideaIds.length > 0) {
        // Votes in this period on this company's ideas
        const { count: voteCount } = await (supabase as any)
          .from('votes')
          .select('*', { count: 'exact', head: true })
          .in('idea_id', ideaIds)
          .gte('created_at', start)
          .lte('created_at', end)
        totalVotes = voteCount || 0

        // Comments in this period
        const { count } = await (supabase as any)
          .from('comments')
          .select('*', { count: 'exact', head: true })
          .in('idea_id', ideaIds)
          .gte('created_at', start)
          .lte('created_at', end)
        commentsCount = count || 0
      }
      
      // For "All Time" — also show total accumulated votes on the ideas (includes guest votes)
      // These are already stored on ideas.votes
      if (timeRange === 'all') {
        const { data: allIdeasForVotes } = await (supabase as any)
          .from('ideas')
          .select('votes')
          .eq('company_id', cid)
        const accum = (allIdeasForVotes || []).reduce((s: number, i: any) => s + (i.votes || 0), 0)
        // Use the higher number — accumulated covers guest votes not in votes table
        totalVotes = Math.max(totalVotes, accum)
      }

      const top = [...ideasList].sort((a: any, b: any) => (b.votes || 0) - (a.votes || 0)).slice(0, 5)
      const recent = [...ideasList].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5)

      const statsObj = {
        totalIdeas: ideasList.length,
        totalVotes,
        totalComments: commentsCount,
        topIdeas: top,
        recentIdeas: recent,
      }
      setStats(statsObj)

      // Help articles
      const { data: articles } = await (supabase as any)
        .from('help_articles')
        .select('*')
        .eq('company_id', cid)
        .gte('created_at', start)
        .lte('created_at', end)

      const artList = articles || []

      // Support tickets
      const { data: tickets } = await (supabase as any)
        .from('support_tickets')
        .select('*')
        .eq('company_id', cid)
        .gte('created_at', start)
        .lte('created_at', end)

      const ticketList = tickets || []
      const byStatus: Record<string, number> = {}
      ticketList.forEach((t: any) => { byStatus[t.status] = (byStatus[t.status] || 0) + 1 })

      // help_article_views table may exist for accurate tracking
      let helpViews = artList.reduce((s: number, a: any) => s + (a.views || 0), 0)
      let helpLikes = artList.reduce((s: number, a: any) => s + (a.likes || 0), 0)
      try {
        const { count: viewCount } = await (supabase as any)
          .from('help_article_views')
          .select('*', { count: 'exact', head: true })
          .in('article_id', artList.map((a: any) => a.id))
          .gte('viewed_at', start)
          .lte('viewed_at', end)
        if (viewCount !== null) helpViews = viewCount
      } catch {}

      const helpObj = {
        totalArticles: artList.length,
        totalViews: helpViews,
        totalLikes: helpLikes,
        totalTickets: ticketList.length,
        openTickets: byStatus['open'] || 0,
        topArticles: [...artList].sort((a: any, b: any) => (b.views || 0) - (a.views || 0)).slice(0, 5),
        ticketsByStatus: byStatus,
      }
      setHelpStats(helpObj)

      // Widget analytics — created_at is the tracked timestamp column
      let widgetEvents: any[] = []
      try {
        const { data: we1 } = await (supabase as any)
          .from('widget_analytics')
          .select('tab, event, created_at')
          .eq('company_id', cid)
          .gte('created_at', start)
          .lte('created_at', end)
        widgetEvents = we1 || []
      } catch { widgetEvents = [] }

      const events = widgetEvents
      const viewEvents = events.filter((e: any) => e.event === 'view')
      const byTab: Record<string, number> = {}
      events.forEach((e: any) => {
        if (e.tab) byTab[e.tab] = (byTab[e.tab] || 0) + 1
      })

      const widgetObj = {
        totalViews: viewEvents.length,
        byTab,
        avgViewsPerDay: daysBack > 0 ? Math.round(viewEvents.length / daysBack) : 0,
      }
      setWidgetStats(widgetObj)

      // Tasks by outlet — a task with several outlets counts toward each.
      const taskObj = await loadTaskStats(cid, start, end)
      setTaskStats(taskObj)

      writeCache(cacheKey, { stats: statsObj, helpStats: helpObj, widgetStats: widgetObj, taskStats: taskObj })
    } catch (err) {
      console.error('Analytics error:', err)
    }
    setLoading(false)
  }

  if (!user || loading) return <div className="p-8" style={{ color: 'var(--slate)' }}>Loading...</div>

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Analytics</h1>
        <p style={{ color: 'var(--slate)' }}>Platform performance and engagement metrics</p>
      </div>

      {/* Date Range Filter */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '24px',
        flexWrap: 'wrap',
        alignItems: 'center',
        padding: '16px',
        borderRadius: '12px',
        background: 'var(--peach)',
        border: '1px solid var(--border)'
      }}>
        {(['today', 'yesterday', '7d', '30d', 'month', 'all', 'custom'] as const).map(range => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              border: timeRange === range ? 'none' : '1px solid var(--border)',
              background: timeRange === range ? 'var(--coral)' : '#fff',
              color: timeRange === range ? '#fff' : 'var(--ink)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {range === 'today' && 'Today'}
            {range === 'yesterday' && 'Yesterday'}
            {range === '7d' && 'Last 7 Days'}
            {range === '30d' && 'Last 30 Days'}
            {range === 'month' && 'This Month'}
            {range === 'all' && 'All Time'}
            {range === 'custom' && 'Custom'}
          </button>
        ))}
      </div>

      {/* Custom Date Range */}
      {timeRange === 'custom' && (
        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '24px',
          alignItems: 'center'
        }}>
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              fontSize: '13px'
            }}
          />
          <span style={{ color: 'var(--slate)' }}>to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              fontSize: '13px'
            }}
          />
        </div>
      )}

      {/* Ideas Section */}
      <div style={{ marginBottom: '48px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px', color: 'var(--ink)' }}>Ideas</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          <StatCard label="Total Ideas" value={stats.totalIdeas} />
          <StatCard label="Total Votes" value={stats.totalVotes} />
          <StatCard label="Total Comments" value={stats.totalComments} />
        </div>
      </div>

      {/* Help & Support Section */}
      <div style={{ marginBottom: '48px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px', color: 'var(--ink)' }}>Help Center & Support</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          <StatCard label="Total Articles" value={helpStats.totalArticles} />
          <StatCard label="Total Views" value={helpStats.totalViews} />
          <StatCard label="Total Likes" value={helpStats.totalLikes} />
          <StatCard label="Open Tickets" value={helpStats.openTickets} sub={`${helpStats.totalTickets} total`} color="var(--coral)" />
        </div>
      </div>

      {/* Widget Analytics Section */}
      <div style={{ marginBottom: '48px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px', color: 'var(--ink)' }}>Widget Analytics</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          <StatCard label="Widget Views" value={widgetStats.totalViews} />
          <StatCard label="Avg Views/Day" value={widgetStats.avgViewsPerDay} />
          <StatCard label="Active Tabs" value={Object.keys(widgetStats.byTab).length} />
        </div>

        {Object.keys(widgetStats.byTab).length > 0 && (
          <div style={{
            marginTop: '24px',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            background: '#fff'
          }}>
            <p style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--ink)' }}>Views by Tab</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
              {Object.entries(widgetStats.byTab).map(([tab, count]) => (
                <div key={tab} style={{
                  padding: '12px',
                  borderRadius: '8px',
                  background: 'var(--peach)',
                  textAlign: 'center'
                }}>
                  <p style={{ margin: '0', fontSize: '13px', color: 'var(--slate)' }}>{tab}</p>
                  <p style={{ margin: '4px 0 0 0', fontSize: '20px', fontWeight: 700, color: 'var(--coral)' }}>{count}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tasks by Outlet Section */}
      <div style={{ marginBottom: '48px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px', color: 'var(--ink)' }}>Tasks by Outlet</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          <StatCard label="Total Tasks" value={taskStats.total} />
          <StatCard label="Open" value={taskStats.open} />
          <StatCard label="Overdue" value={taskStats.overdue} color={taskStats.overdue > 0 ? '#dc2626' : undefined} />
          <StatCard label="Completed" value={taskStats.completed} color="#16a34a" />
        </div>

        {taskStats.byOutlet.length > 0 ? (
          <div style={{ marginTop: '24px', borderRadius: '12px', border: '1px solid var(--border)', background: '#fff', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr', gap: 0, padding: '12px 16px', background: 'var(--peach)', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--slate)' }}>
              <span>Outlet</span>
              <span style={{ textAlign: 'right' }}>Open</span>
              <span style={{ textAlign: 'right' }}>Overdue</span>
              <span style={{ textAlign: 'right' }}>Completed</span>
            </div>
            {taskStats.byOutlet.map((o: any) => (
              <div key={o.id || 'none'} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr', gap: 0, padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: '14px', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, color: o.id ? 'var(--ink)' : 'var(--slate)' }}>{o.name}</span>
                <span style={{ textAlign: 'right', color: 'var(--ink)' }}>{o.open}</span>
                <span style={{ textAlign: 'right', fontWeight: o.overdue > 0 ? 700 : 400, color: o.overdue > 0 ? '#dc2626' : 'var(--slate)' }}>{o.overdue}</span>
                <span style={{ textAlign: 'right', color: '#16a34a' }}>{o.completed}</span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ marginTop: '16px', fontSize: '13px', color: 'var(--slate)' }}>No tasks in this period.</p>
        )}
        <p style={{ marginTop: '10px', fontSize: '12px', color: 'var(--slate)' }}>Tasks tied to more than one outlet are counted under each of them.</p>
      </div>
    </div>
  )
}
