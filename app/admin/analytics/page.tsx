'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<'today' | 'yesterday' | '7d' | '30d' | 'month' | 'all' | 'custom'>('30d')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  // Ideas stats
  const [stats, setStats] = useState({ totalIdeas: 0, totalVotes: 0, totalComments: 0, topIdeas: [] as any[], recentIdeas: [] as any[] })
  // Help stats
  const [helpStats, setHelpStats] = useState({ totalArticles: 0, totalViews: 0, totalLikes: 0, totalTickets: 0, openTickets: 0, topArticles: [] as any[], ticketsByStatus: {} as any })
  // Widget stats
  const [widgetStats, setWidgetStats] = useState({ totalViews: 0, byTab: {} as Record<string, number>, avgViewsPerDay: 0 })

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

  const loadAll = async () => {
    try {
      const cid = await getMyCompanyId()
      if (!cid) return

      const { start, end, daysBack } = getDateRange()

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

      setStats({ 
        totalIdeas: ideasList.length, 
        totalVotes, 
        totalComments: commentsCount, 
        topIdeas: top, 
        recentIdeas: recent 
      })

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

      setHelpStats({
        totalArticles: artList.length,
        totalViews: helpViews,
        totalLikes: helpLikes,
        totalTickets: ticketList.length,
        openTickets: byStatus['open'] || 0,
        topArticles: [...artList].sort((a: any, b: any) => (b.views || 0) - (a.views || 0)).slice(0, 5),
        ticketsByStatus: byStatus,
      })

      // Widget analytics — the insert uses both 'timestamp' and 'created_at' columns
      // Try created_at first, fall back to timestamp column
      let widgetEvents: any[] = []
      try {
        const { data: we1 } = await (supabase as any)
          .from('widget_analytics')
          .select('tab, event, created_at, timestamp')
          .eq('company_id', cid)
          .or(`created_at.gte.${start},timestamp.gte.${start}`)
        widgetEvents = we1 || []
      } catch {
        const { data: we2 } = await (supabase as any)
          .from('widget_analytics')
          .select('tab, event')
          .eq('company_id', cid)
        widgetEvents = we2 || []
      }

      const events = widgetEvents
      const viewEvents = events.filter((e: any) => e.event === 'view')
      const byTab: Record<string, number> = {}
      events.forEach((e: any) => {
        if (e.tab) byTab[e.tab] = (byTab[e.tab] || 0) + 1
      })

      setWidgetStats({
        totalViews: viewEvents.length,
        byTab,
        avgViewsPerDay: daysBack > 0 ? Math.round(viewEvents.length / daysBack) : 0,
      })
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
    </div>
  )
}
