'use client'

// Help Center Reporting — Overview / Articles / Searches / Feedback
// Modeled on Ferndesk's reporting layout.

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { resolveCompanyUser } from '@/lib/client-cache'
import HelpShell from '@/components/help/HelpShell'

const RANGES = [
  { key: '7', label: 'Past 7 Days' },
  { key: '14', label: 'Past 14 Days' },
  { key: '30', label: 'Past 30 Days' },
  { key: '90', label: 'Past Quarter' },
  { key: '365', label: 'Past Year' },
  { key: 'all', label: 'All Time' },
]

const TABS = [
  { key: 'overview', label: 'Overview', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
  { key: 'articles', label: 'Articles', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg> },
  { key: 'searches', label: 'Searches', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> },
  { key: 'feedback', label: 'Feedback', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg> },
]

function StatCard({ label, value, desc, accent }: { label: string; value: string | number; desc: string; accent?: boolean }) {
  return (
    <div className="hc-card" style={{ padding: '18px 20px', flex: '1 1 200px', minWidth: 0 }}>
      <p style={{ margin: '0 0 8px', fontSize: 13.5, color: '#71717a' }}>{label}</p>
      <p style={{ margin: '0 0 6px', fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', color: accent ? 'var(--coral)' : '#111' }}>{value}</p>
      <p style={{ margin: 0, fontSize: 12.5, color: '#a1a1aa', lineHeight: 1.45 }}>{desc}</p>
    </div>
  )
}

function DailyBars({ data, colorA = 'var(--coral)', colorB = '#c4b5fd', legendA = 'Views', legendB = '' }: { data: { day: string; a: number; b?: number }[]; colorA?: string; colorB?: string; legendA?: string; legendB?: string }) {
  const max = Math.max(1, ...data.map(d => (d.a || 0) + (d.b || 0)))
  const dot = (c: string) => <span style={{ width: 8, height: 8, background: c, borderRadius: '50%' }} />
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, fontSize: 12.5, color: '#71717a', marginBottom: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{dot(colorA)}{legendA}</span>
        {legendB && <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{dot(colorB)}{legendB}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 140, borderBottom: '1px solid #f0f0f2' }}>
        {data.map((d, i) => (
          <div key={i} title={`${d.day}: ${d.a}${d.b !== undefined ? ` / ${d.b}` : ''}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
            {d.b !== undefined && d.b > 0 && <div style={{ height: `${(d.b / max) * 100}%`, background: colorB, borderRadius: '5px 5px 0 0' }} />}
            {d.a > 0 && <div style={{ height: `${(d.a / max) * 100}%`, background: colorA, opacity: .85, borderRadius: d.b ? 0 : '5px 5px 0 0' }} />}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#a1a1aa', marginTop: 8 }}>
        <span>{data[0]?.day}</span>
        <span>{data[Math.floor(data.length / 2)]?.day}</span>
        <span>{data[data.length - 1]?.day}</span>
      </div>
    </div>
  )
}

const Thumb = ({ up, size = 15 }: { up: boolean; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label={up ? 'Helpful' : 'Not helpful'} style={{ transform: up ? undefined : 'scaleY(-1)', flexShrink: 0 }}>
    <path d="M7 10v11" /><path d="M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 18.4 21H7V10l4.4-7.6A1.9 1.9 0 0 1 15 5.9z" />
  </svg>
)

export default function HelpAnalyticsPage() {
  const [tab, setTabState] = useState('overview')
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t && TABS.some(x => x.key === t)) setTabState(t)
  }, [])
  const setTab = (t: string) => {
    setTabState(t)
    const u = new URL(window.location.href); u.searchParams.set('tab', t)
    window.history.replaceState(null, '', u.toString())
  }
  const [range, setRange] = useState('30')
  const [showRangeMenu, setShowRangeMenu] = useState(false)
  const [loading, setLoading] = useState(true)
  const [articles, setArticles] = useState<any[]>([])
  const [views, setViews] = useState<any[]>([])
  const [searches, setSearches] = useState<any[]>([])
  const [feedback, setFeedback] = useState<any[]>([])

  const getCompanyId = async (): Promise<string | null> => {
    if (typeof window !== 'undefined') {
      const h = window.location.hostname
      if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
        const { data } = await (supabase as any).from('companies').select('id').eq('slug', h.replace('.colvy.com', '')).maybeSingle()
        if (data?.id) return data.id
      }
    }
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      const { data } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
      if (data?.id) return data.id
    }
    return null
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        // The workspace is resolved once per session (lib/client-cache); the
        // local lookup is only a fallback.
        const cid = (await resolveCompanyUser()).companyId || await getCompanyId()
        if (!cid) return
        const start = range === 'all' ? new Date(0).toISOString() : new Date(Date.now() - parseInt(range) * 864e5).toISOString()

        const [{ data: arts }, { data: vws }, { data: srch }, { data: fdbk }] = await Promise.all([
          // Only what the tables show — not every article body and media blob.
          (supabase as any).from('help_articles').select('id, title, category, status').eq('company_id', cid),
          (supabase as any).from('help_article_views').select('*').eq('company_id', cid).gte('viewed_at', start).limit(10000),
          (supabase as any).from('help_searches').select('*').eq('company_id', cid).gte('created_at', start).limit(10000),
          (supabase as any).from('help_article_feedback').select('*').eq('company_id', cid).gte('created_at', start).limit(10000),
        ])
        setArticles(arts || [])
        setViews(vws || [])
        setSearches(srch || [])
        setFeedback(fdbk || [])
      } catch {}
      setLoading(false)
    }
    load()
  }, [range])

  // Aggregations
  const days = range === 'all' ? 30 : Math.min(parseInt(range) || 30, 60)
  const dayKeys = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * 864e5)
    return { key: d.toISOString().slice(0, 10), label: d.toLocaleDateString('en', { day: 'numeric', month: 'short' }) }
  })
  const byDay = (rows: any[], field: string) => {
    const m: Record<string, number> = {}
    rows.forEach(r => { const k = (r[field] || '').slice(0, 10); m[k] = (m[k] || 0) + 1 })
    return m
  }
  const viewsByDay = byDay(views, 'viewed_at')
  const searchByDay = byDay(searches, 'created_at')
  const upByDay = byDay(feedback.filter(f => f.helpful), 'created_at')
  const downByDay = byDay(feedback.filter(f => !f.helpful), 'created_at')

  const viewsPerArticle: Record<string, number> = {}
  views.forEach(v => { if (v.article_id) viewsPerArticle[v.article_id] = (viewsPerArticle[v.article_id] || 0) + 1 })
  const feedbackPerArticle: Record<string, { up: number; down: number }> = {}
  feedback.forEach(f => {
    if (!f.article_id) return
    if (!feedbackPerArticle[f.article_id]) feedbackPerArticle[f.article_id] = { up: 0, down: 0 }
    if (f.helpful) feedbackPerArticle[f.article_id].up++; else feedbackPerArticle[f.article_id].down++
  })

  const missedSearches = searches.filter(s => (s.results_count || 0) === 0)
  const clickedSearches = searches.filter(s => s.clicked_article_id)
  const ctr = searches.length > 0 ? Math.round((clickedSearches.length / searches.length) * 100) : 0
  const upvotes = feedback.filter(f => f.helpful).length
  const downvotes = feedback.length - upvotes
  const satisfaction = feedback.length > 0 ? Math.round((upvotes / feedback.length) * 100) : null
  const published = articles.filter(a => a.status === 'published')

  // Search terms aggregated
  const termCounts: Record<string, { count: number; missed: number }> = {}
  searches.forEach(s => {
    const q = (s.query || '').toLowerCase().trim()
    if (!q) return
    if (!termCounts[q]) termCounts[q] = { count: 0, missed: 0 }
    termCounts[q].count++
    if ((s.results_count || 0) === 0) termCounts[q].missed++
  })
  const topTerms = Object.entries(termCounts).sort((a, b) => b[1].count - a[1].count).slice(0, 15)

  const sortedArticles = [...articles].sort((a, b) => (viewsPerArticle[b.id] || 0) - (viewsPerArticle[a.id] || 0))

  const tabInfo: Record<string, [string, string]> = {
    overview: ['Overview', 'How people use your help centre: what they read, search for and find useful.'],
    articles: ['Articles', 'Views and feedback on every article.'],
    searches: ['Searches', 'What people search for, and where they come up empty.'],
    feedback: ['Feedback', 'How readers rate your articles.'],
  }
  const h3 = (t: string) => <h3 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 750, letterSpacing: '-0.01em', color: '#111' }}>{t}</h3>
  const empty = (title: string, line: string) => (
    <div style={{ padding: '44px 20px', textAlign: 'center', borderRadius: 16, background: '#f6f6f7' }}>
      <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 650, color: '#18181b' }}>{title}</p>
      <p style={{ margin: 0, fontSize: 13.5, color: '#71717a' }}>{line}</p>
    </div>
  )
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', borderTop: '1px solid #f0f0f2' }
  const stats = (cards: React.ReactNode) => <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>{cards}</div>

  return (
    <HelpShell nav={
      <>
        <p className="hc-group">Reports</p>
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`hc-item${tab === t.key ? ' on' : ''}`} aria-current={tab === t.key ? 'page' : undefined}>
            <span className="hc-ic">{t.icon}</span>{t.label}
          </button>
        ))}
      </>
    }>
      <div style={{ padding: '36px 44px 48px', maxWidth: 1040 }} className="hc-page">
        <style>{`@media (max-width: 860px) { .hc-page { padding: 20px 16px 32px !important; } }`}</style>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: '0 0 6px' }}>{tabInfo[tab]?.[0]}</h1>
            <p style={{ margin: 0, fontSize: 15, color: '#71717a' }}>{tabInfo[tab]?.[1]}</p>
          </div>
          {/* Range picker */}
          <div style={{ position: 'relative' }}>
            <button type="button" onClick={() => setShowRangeMenu(v => !v)} className="cv-btn" aria-haspopup="menu" aria-expanded={showRangeMenu}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              {RANGES.find(r => r.key === range)?.label}
              <svg className="cv-chev" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {showRangeMenu && (
              <>
                <div onClick={() => setShowRangeMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div className="hc-menu" role="menu" style={{ top: 'calc(100% + 6px)', right: 0, width: 200, transformOrigin: 'top right' }}>
                  {RANGES.map(r => (
                    <button key={r.key} type="button" role="menuitemradio" aria-checked={range === r.key} onClick={() => { setRange(r.key); setShowRangeMenu(false) }} className={`hc-menu-row${range === r.key ? ' cur' : ''}`}>
                      <span style={{ flex: 1 }}>{r.label}</span>
                      {range === r.key && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#18181b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12"/></svg>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {[0, 1, 2].map(i => <div key={i} style={{ height: 118, borderRadius: 16, background: 'linear-gradient(90deg, #f4f4f5 25%, #fafafa 50%, #f4f4f5 75%)', backgroundSize: '200% 100%', animation: 'hcShim 1.2s ease-in-out infinite' }} />)}
            <style>{`@keyframes hcShim { from { background-position: 200% 0 } to { background-position: -200% 0 } }`}</style>
          </div>
        ) : (
          <>
            {tab === 'overview' && (
              <>
                {stats(<>
                  <StatCard label="Article views" value={views.length} desc="Views across your help centre and widgets" />
                  <StatCard label="Searches" value={searches.length} desc="Searches across your help centre" />
                  <StatCard label="Search click-through" value={`${ctr}%`} desc="Searches that led to an article" />
                </>)}
                {stats(<>
                  <StatCard label="Helpful" value={upvotes} desc="Thumbs up in this range" />
                  <StatCard label="Not helpful" value={downvotes} desc="Thumbs down worth reviewing" />
                  <StatCard label="Satisfaction" value={satisfaction === null ? '—' : `${satisfaction}%`} desc="Readers who found articles useful" />
                </>)}
                <div className="hc-card" style={{ padding: 20, margin: '12px 0 32px' }}>
                  {h3('Daily activity')}
                  <DailyBars data={dayKeys.map(d => ({ day: d.label, a: viewsByDay[d.key] || 0, b: searchByDay[d.key] || 0 }))} legendA="Article views" legendB="Searches" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  {h3('Most viewed articles')}
                  <button type="button" onClick={() => setTab('articles')} style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--coral)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>See all</button>
                </div>
                {sortedArticles.length === 0 ? empty('No articles yet', 'Write or import articles and their views show up here.') : (
                  <div className="hc-card" style={{ overflow: 'hidden' }}>
                    {sortedArticles.slice(0, 5).map((a, i) => (
                      <div key={a.id} style={{ ...row, borderTop: i ? row.borderTop : 'none' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: '#18181b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</p>
                          {a.category && <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#8e8e93' }}>{a.category}</p>}
                        </div>
                        <span style={{ fontSize: 14.5, fontWeight: 700, color: '#111' }}>{viewsPerArticle[a.id] || 0}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {tab === 'articles' && (
              <>
                {stats(<>
                  <StatCard label="Article views" value={views.length} desc="Views on articles in your help centre and widgets" />
                  <StatCard label="Satisfaction" value={satisfaction === null ? '—' : `${satisfaction}%`} desc="Feedback that was positive" />
                  <StatCard label="Published articles" value={published.length} desc="Articles live in your help centre" />
                </>)}
                <div className="hc-card" style={{ padding: 20, margin: '12px 0 32px' }}>
                  {h3('Daily article views')}
                  <DailyBars data={dayKeys.map(d => ({ day: d.label, a: viewsByDay[d.key] || 0 }))} legendA="Views" />
                </div>
                {h3('All articles')}
                {sortedArticles.length === 0 ? empty('No articles yet', 'Write or import articles and their views show up here.') : (
                  <div className="hc-card" style={{ overflow: 'hidden' }}>
                    <div style={{ display: 'flex', gap: 12, padding: '11px 18px', background: '#fafafa', fontSize: 12.5, fontWeight: 600, color: '#71717a' }}>
                      <span style={{ flex: 1 }}>Article</span><span style={{ width: 70, textAlign: 'right' }}>Views</span><span style={{ width: 110, textAlign: 'right' }}>Feedback</span>
                    </div>
                    {sortedArticles.map(a => {
                      const fb = feedbackPerArticle[a.id] || { up: 0, down: 0 }
                      return (
                        <div key={a.id} style={row}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: '#18181b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</p>
                            {a.category && <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#8e8e93' }}>{a.category}</p>}
                          </div>
                          <span style={{ width: 70, textAlign: 'right', fontSize: 14.5, fontWeight: 600, color: '#111' }}>{viewsPerArticle[a.id] || 0}</span>
                          <span style={{ width: 110, display: 'flex', justifyContent: 'flex-end', gap: 12, fontSize: 13.5, fontWeight: 600 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#16a34a' }}><Thumb up />{fb.up}</span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#d97706' }}><Thumb up={false} />{fb.down}</span>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            {tab === 'searches' && (
              <>
                {stats(<>
                  <StatCard label="Searches" value={searches.length} desc="Help centre searches in this range" />
                  <StatCard label="No results" value={missedSearches.length} desc="Searches that found nothing" accent={missedSearches.length > 0} />
                  <StatCard label="Search click-through" value={`${ctr}%`} desc="Searches that led to an article" />
                </>)}
                <div className="hc-card" style={{ padding: 20, margin: '12px 0 32px' }}>
                  {h3('Daily searches')}
                  <DailyBars data={dayKeys.map(d => ({ day: d.label, a: searchByDay[d.key] || 0 }))} legendA="Searches" colorA="#6366f1" />
                </div>
                {h3('What people search for')}
                {topTerms.length === 0 ? empty('No searches yet', 'What visitors type into your help centre search will show up here.') : (
                  <div className="hc-card" style={{ overflow: 'hidden' }}>
                    {topTerms.map(([term, stat], i) => (
                      <div key={term} style={{ ...row, borderTop: i ? row.borderTop : 'none' }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, color: '#18181b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>“{term}”</span>
                        {stat.missed > 0 && <span className="hc-tag" style={{ ['--tag' as any]: '#d97706' }}>{stat.missed} found nothing</span>}
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: '#52525b' }}>{stat.count}×</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {tab === 'feedback' && (
              <>
                {stats(<>
                  <StatCard label="Helpful" value={upvotes} desc="Thumbs up in this range" />
                  <StatCard label="Not helpful" value={downvotes} desc="Thumbs down worth reviewing" />
                  <StatCard label="Satisfaction" value={satisfaction === null ? '—' : `${satisfaction}%`} desc="Readers who found articles useful" />
                </>)}
                <div className="hc-card" style={{ padding: 20, margin: '12px 0 32px' }}>
                  {h3('Daily feedback')}
                  <DailyBars data={dayKeys.map(d => ({ day: d.label, a: upByDay[d.key] || 0, b: downByDay[d.key] || 0 }))} legendA="Helpful" legendB="Not helpful" colorA="#22c55e" colorB="#fbbf24" />
                </div>
                {h3('Recent feedback')}
                {feedback.length === 0 ? empty('No feedback yet', 'How readers rate your articles will show up here as it comes in.') : (
                  <div className="hc-card" style={{ overflow: 'hidden' }}>
                    {feedback.slice(0, 20).map((f: any, i: number) => {
                      const art = articles.find(a => a.id === f.article_id)
                      return (
                        <div key={f.id} style={{ ...row, borderTop: i ? row.borderTop : 'none' }}>
                          <span style={{ width: 32, height: 32, flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: f.helpful ? '#dcfce7' : '#fef3c7', color: f.helpful ? '#16a34a' : '#d97706' }}><Thumb up={!!f.helpful} /></span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: '#18181b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{art?.title || 'An article that has since been removed'}</p>
                            {f.comment && <p style={{ margin: '2px 0 0', fontSize: 13.5, color: '#52525b' }}>“{f.comment}”</p>}
                          </div>
                          <span style={{ fontSize: 12.5, color: '#a1a1aa', whiteSpace: 'nowrap' }}>{new Date(f.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </HelpShell>
  )
}
