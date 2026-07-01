'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'


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
  const [tab, setTab] = useState<'ideas' | 'help' | 'announcements' | 'forms' | 'widget'>('ideas')
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d')

  // Ideas stats
  const [stats, setStats] = useState({ totalIdeas: 0, totalVotes: 0, totalComments: 0, topIdeas: [] as any[], recentIdeas: [] as any[] })
  // Help stats
  const [helpStats, setHelpStats] = useState({ totalArticles: 0, totalViews: 0, totalLikes: 0, totalTickets: 0, openTickets: 0, topArticles: [] as any[], ticketsByStatus: {} as any })
  // Announcement stats
  const [annStats, setAnnStats] = useState({ total: 0, totalViews: 0, totalImpressions: 0, topAnnouncements: [] as any[] })
  // Form stats
  const [formStats, setFormStats] = useState({ totalForms: 0, totalResponses: 0, avgPerForm: 0, topForms: [] as any[] })
  // Widget stats
  const [widgetStats, setWidgetStats] = useState({ totalViews: 0, byTab: {} as Record<string, number>, avgViewsPerDay: 0 })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => {
      const u = data?.session?.user
      setUser(u)
      loadAll()
    })
  }, [router, timeRange])

  const loadAll = async () => {
    try {
      const cid = await getMyCompanyId()
      const f = (q: any) => cid ? q.eq('company_id', cid) : q
      
      // Calculate date range for widget analytics
      const now = new Date()
      const daysBack = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90
      const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000).toISOString()
      
      // Ideas
      const { count: ic } = await f((supabase as any).from('ideas').select('*', { count: 'exact', head: true }))
      const { count: vc } = await f((supabase as any).from('votes').select('*', { count: 'exact', head: true }))
      const { count: cc } = await f((supabase as any).from('comments').select('*', { count: 'exact', head: true }))
      const { data: top } = await f((supabase as any).from('ideas').select('id,title,votes,status').order('votes', { ascending: false }).limit(5))
      const { data: recent } = await f((supabase as any).from('ideas').select('id,title,created_at,votes').order('created_at', { ascending: false }).limit(5))
      setStats({ totalIdeas: ic || 0, totalVotes: vc || 0, totalComments: cc || 0, topIdeas: top || [], recentIdeas: recent || [] })

      // Help
      const { data: articles } = await f((supabase as any).from('help_articles').select('*'))
      const { data: tickets } = await f((supabase as any).from('support_tickets').select('*'))
      const artList = articles || []
      const ticketList = tickets || []
      const byStatus: Record<string, number> = {}
      ticketList.forEach((t: any) => { byStatus[t.status] = (byStatus[t.status] || 0) + 1 })
      setHelpStats({
        totalArticles: artList.length,
        totalViews: artList.reduce((s: number, a: any) => s + (a.views || 0), 0),
        totalLikes: artList.reduce((s: number, a: any) => s + (a.likes || 0), 0),
        totalTickets: ticketList.length,
        openTickets: byStatus['open'] || 0,
        topArticles: [...artList].sort((a: any, b: any) => (b.views || 0) - (a.views || 0)).slice(0, 5),
        ticketsByStatus: byStatus,
      })

      // Announcements
      const { data: anns } = await (supabase as any).from('announcements').select('*')
      const annList = anns || []
      setAnnStats({
        total: annList.length,
        totalViews: annList.reduce((s: number, a: any) => s + (a.views || 0), 0),
        totalImpressions: annList.reduce((s: number, a: any) => s + (a.impressions || 0), 0),
        topAnnouncements: [...annList].sort((a: any, b: any) => (b.views || 0) - (a.views || 0)).slice(0, 5),
      })

      // Forms
      if (cid) {
        const { data: formsList } = await (supabase as any).from('forms').select('id, title, created_at').eq('company_id', cid)
        const { data: responsesList } = await (supabase as any).from('form_responses').select('form_id')
        
        const forms = formsList || []
        const responses = responsesList || []
        const responsesByForm: Record<string, number> = {}
        responses.forEach((r: any) => {
          responsesByForm[r.form_id] = (responsesByForm[r.form_id] || 0) + 1
        })
        
        const topForms = forms.map((f: any) => ({
          ...f,
          responseCount: responsesByForm[f.id] || 0
        })).sort((a: any, b: any) => b.responseCount - a.responseCount).slice(0, 5)

        setFormStats({
          totalForms: forms.length,
          totalResponses: responses.length,
          avgPerForm: forms.length > 0 ? Math.round(responses.length / forms.length) : 0,
          topForms,
        })

        // Widget analytics
        const { data: widgetEvents } = await (supabase as any).from('widget_analytics').select('tab, event').eq('company_id', cid).gte('created_at', startDate)
        const events = widgetEvents || []
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
      }
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  if (!user || loading) return <div className="p-8" style={{ color: 'var(--slate)' }}>Loading...</div>

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <h1 className="text-3xl font-bold" style={{ color: 'var(--ink)' }}>Analytics</h1>
        <div className="flex gap-1 p-1 rounded-xl flex-wrap" style={{ background: 'var(--canvas)', border: '1px solid var(--border)' }}>
          {(['ideas', 'help', 'announcements', 'forms', 'widget'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold cursor-pointer capitalize transition-all"
              style={{ background: tab === t ? 'white' : 'transparent', color: tab === t ? 'var(--coral)' : 'var(--slate)', boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
              {t === 'widget' ? 'Widget' : t}
            </button>
          ))}
        </div>
      </div>

      {/* Time range selector for time-based analytics */}
      {(tab === 'forms' || tab === 'widget') && (
        <div className="flex gap-2 mb-6">
          {(['7d', '30d', '90d'] as const).map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-all"
              style={{
                background: timeRange === range ? 'var(--coral)' : '#fff',
                color: timeRange === range ? '#fff' : 'var(--slate)',
                border: `1px solid ${timeRange === range ? 'var(--coral)' : 'var(--border)'}`,
              }}>
              {range === '7d' ? '7d' : range === '30d' ? '30d' : '90d'}
            </button>
          ))}
        </div>
      )}

      {tab === 'ideas' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
            <StatCard label="Total Ideas" value={stats.totalIdeas} />
            <StatCard label="Total Votes" value={stats.totalVotes} color="var(--ink)" />
            <StatCard label="Comments" value={stats.totalComments} color="#7c3aed" />
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-bold mb-4" style={{ color: 'var(--ink)' }}>Top Ideas by Votes</h3>
              {stats.topIdeas.length === 0 ? <p style={{ color: 'var(--slate)' }} className="text-sm">No ideas yet</p> : (
                <div className="space-y-3">
                  {stats.topIdeas.map((idea, i) => (
                    <div key={idea.id} className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: i === 0 ? 'var(--coral)' : 'var(--slate)' }}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{idea.title}</p>
                        <p className="text-xs" style={{ color: 'var(--slate)' }}>{idea.status}</p>
                      </div>
                      <span className="text-sm font-bold" style={{ color: 'var(--coral)' }}>▲{idea.votes || 0}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-bold mb-4" style={{ color: 'var(--ink)' }}>Recent Ideas</h3>
              {stats.recentIdeas.length === 0 ? <p style={{ color: 'var(--slate)' }} className="text-sm">No ideas yet</p> : (
                <div className="space-y-3">
                  {stats.recentIdeas.map((idea) => (
                    <div key={idea.id} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{idea.title}</p>
                        <p className="text-xs" style={{ color: 'var(--slate)' }}>{new Date(idea.created_at).toLocaleDateString()}</p>
                      </div>
                      <span className="text-sm font-bold" style={{ color: 'var(--coral)' }}>▲{idea.votes || 0}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'help' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard label="Articles" value={helpStats.totalArticles} />
            <StatCard label="Total Views" value={helpStats.totalViews} color="var(--ink)" />
            <StatCard label="Helpful Votes" value={helpStats.totalLikes} color="#7c3aed" />
            <StatCard label="Open Tickets" value={helpStats.openTickets} sub={`${helpStats.totalTickets} total`} color="#ef4444" />
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-bold mb-4" style={{ color: 'var(--ink)' }}>Most Viewed Articles</h3>
              {helpStats.topArticles.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--slate)' }}>No articles yet. <Link href="/admin/help/new" style={{ color: 'var(--coral)' }}>Create one →</Link></p>
              ) : (
                <div className="space-y-3">
                  {helpStats.topArticles.map((a, i) => (
                    <div key={a.id} className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: i === 0 ? 'var(--coral)' : 'var(--slate)' }}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{a.title}</p>
                        <p className="text-xs" style={{ color: 'var(--slate)' }}>{a.category} · {a.likes || 0} helpful</p>
                      </div>
                      <span className="text-sm font-bold" style={{ color: 'var(--coral)' }}>{a.views || 0} views</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold" style={{ color: 'var(--ink)' }}>Ticket Status</h3>
                <Link href="/admin/support" className="text-xs font-semibold" style={{ color: 'var(--coral)' }}>View all →</Link>
              </div>
              {helpStats.totalTickets === 0 ? (
                <p className="text-sm" style={{ color: 'var(--slate)' }}>No tickets yet</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(helpStats.ticketsByStatus).map(([status, count]: any) => (
                    <div key={status} className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm capitalize" style={{ color: 'var(--ink)' }}>{status.replace('_', ' ')}</span>
                          <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{count}</span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                          <div className="h-full rounded-full" style={{ width: `${(count / helpStats.totalTickets) * 100}%`, background: 'var(--coral)' }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'announcements' && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-8">
            <StatCard label="Announcements" value={annStats.total} />
            <StatCard label="Total Views" value={annStats.totalViews} color="var(--ink)" />
            <StatCard label="Impressions" value={annStats.totalImpressions} color="#7c3aed" />
          </div>
          <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
            <h3 className="font-bold mb-4" style={{ color: 'var(--ink)' }}>Top Announcements</h3>
            {annStats.topAnnouncements.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--slate)' }}>No announcements yet. <Link href="/admin/announcements/new" style={{ color: 'var(--coral)' }}>Create one →</Link></p>
            ) : (
              <div className="space-y-3">
                {annStats.topAnnouncements.map((a, i) => (
                  <div key={a.id} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: i === 0 ? 'var(--coral)' : 'var(--slate)' }}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{a.title}</p>
                      <p className="text-xs" style={{ color: 'var(--slate)' }}>{a.tag} · {new Date(a.created_at).toLocaleDateString()}</p>
                    </div>
                    <span className="text-sm font-bold" style={{ color: 'var(--coral)' }}>{a.views || 0} views</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'forms' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard label="Forms Created" value={formStats.totalForms} />
            <StatCard label="Total Responses" value={formStats.totalResponses} color="var(--ink)" />
            <StatCard label="Avg Responses/Form" value={formStats.avgPerForm} color="#10b981" />
            <StatCard label="Response Rate" value={formStats.totalForms > 0 ? `${Math.round((formStats.totalResponses / (formStats.totalForms * 5)) * 100)}%` : '—'} color="#7c3aed" />
          </div>
          <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
            <h3 className="font-bold mb-6" style={{ color: 'var(--ink)' }}>Top Performing Forms</h3>
            {formStats.topForms.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--slate)' }}>No forms yet. <Link href="/admin/forms/new" style={{ color: 'var(--coral)' }}>Create one →</Link></p>
            ) : (
              <div className="space-y-4">
                {formStats.topForms.map((f: any, i: number) => (
                  <div key={f.id} className="p-4 rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--canvas)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: 'var(--coral)' }}>{i + 1}</span>
                        <p className="font-medium" style={{ color: 'var(--ink)' }}>{f.title}</p>
                      </div>
                      <span className="font-bold" style={{ color: 'var(--coral)' }}>{f.responseCount} {f.responseCount === 1 ? 'response' : 'responses'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'widget' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
            <StatCard label="Widget Views" value={widgetStats.totalViews} />
            <StatCard label="Avg Views/Day" value={widgetStats.avgViewsPerDay} color="var(--ink)" />
            <StatCard label="Active Tabs" value={Object.keys(widgetStats.byTab).length} color="#10b981" />
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-bold mb-6" style={{ color: 'var(--ink)' }}>Views by Tab</h3>
              {Object.keys(widgetStats.byTab).length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--slate)' }}>No widget views yet</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(widgetStats.byTab)
                    .sort((a: any, b: any) => b[1] - a[1])
                    .map(([tab, count]: any) => (
                      <div key={tab}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-medium capitalize" style={{ color: 'var(--ink)' }}>{tab}</span>
                          <span className="text-xs font-bold" style={{ color: 'var(--coral)' }}>{count}</span>
                        </div>
                        <div style={{ width: '100%', height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              background: 'var(--coral)',
                              width: `${(count / (widgetStats.totalViews || 1)) * 100}%`,
                              transition: 'width 0.3s ease',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-bold mb-4" style={{ color: 'var(--ink)' }}>Widget Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span style={{ color: 'var(--slate)' }}>Time Range</span>
                  <span className="font-medium" style={{ color: 'var(--ink)' }}>Last {timeRange === '7d' ? '7 days' : timeRange === '30d' ? '30 days' : '90 days'}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--slate)' }}>Total Views</span>
                  <span className="font-bold" style={{ color: 'var(--coral)' }}>{widgetStats.totalViews}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--slate)' }}>Daily Average</span>
                  <span className="font-bold" style={{ color: 'var(--coral)' }}>{widgetStats.avgViewsPerDay}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
