'use client'

// Help Center Reporting — Overview / Articles / Searches / Feedback
// Modeled on Ferndesk's reporting layout.

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

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
    <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: '#fff', padding: '18px 20px', flex: 1, minWidth: 200 }}>
      <p style={{ margin: '0 0 8px 0', fontSize: 13, color: 'var(--slate)' }}>{label}</p>
      <p style={{ margin: '0 0 6px 0', fontSize: 30, fontWeight: 700, color: accent ? 'var(--coral)' : 'var(--ink)', fontFamily: 'Georgia, serif' }}>{value}</p>
      <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>{desc}</p>
    </div>
  )
}

function DailyBars({ data, colorA = '#93c5fd', colorB = '#c4b5fd', legendA = 'Views', legendB = '' }: { data: { day: string; a: number; b?: number }[]; colorA?: string; colorB?: string; legendA?: string; legendB?: string }) {
  const max = Math.max(1, ...data.map(d => (d.a || 0) + (d.b || 0)))
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, fontSize: 12, color: 'var(--slate)', marginBottom: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, background: colorA, borderRadius: 2 }} />{legendA}</span>
        {legendB && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, background: colorB, borderRadius: 2 }} />{legendB}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120 }}>
        {data.map((d, i) => (
          <div key={i} title={`${d.day}: ${d.a}${d.b !== undefined ? ` / ${d.b}` : ''}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%', background: 'repeating-linear-gradient(0deg, #fafafa 0 2px, transparent 2px 6px)', borderRadius: 2 }}>
            {d.b !== undefined && d.b > 0 && <div style={{ height: `${(d.b / max) * 100}%`, background: colorB, borderRadius: '2px 2px 0 0' }} />}
            {d.a > 0 && <div style={{ height: `${(d.a / max) * 100}%`, background: colorA, borderRadius: d.b ? 0 : '2px 2px 0 0' }} />}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
        <span>{data[0]?.day}</span>
        <span>{data[Math.floor(data.length / 2)]?.day}</span>
        <span>{data[data.length - 1]?.day}</span>
      </div>
    </div>
  )
}

export default function HelpAnalyticsPage() {
  const [tab, setTab] = useState('overview')
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
        const cid = await getCompanyId()
        if (!cid) return
        const start = range === 'all' ? new Date(0).toISOString() : new Date(Date.now() - parseInt(range) * 864e5).toISOString()

        const [{ data: arts }, { data: vws }, { data: srch }, { data: fdbk }] = await Promise.all([
          (supabase as any).from('help_articles').select('*').eq('company_id', cid),
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

  const sectionHeading = (kicker: string, title: string, desc: string) => (
    <div style={{ marginBottom: 28 }}>
      <p style={{ margin: '0 0 6px 0', fontSize: 12, fontWeight: 700, letterSpacing: 2, color: 'var(--coral)', textTransform: 'uppercase' }}>{kicker}</p>
      <h1 style={{ margin: '0 0 8px 0', fontSize: 32, fontWeight: 700, fontFamily: 'Georgia, serif', color: 'var(--ink)' }}>{title}</h1>
      <p style={{ margin: 0, fontSize: 15, color: 'var(--slate)' }}>{desc}</p>
    </div>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100%', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      {/* Sub nav */}
      <div style={{ width: 210, flexShrink: 0, borderRight: '1px solid var(--border)', padding: '20px 12px', background: '#fafafa' }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: '#9ca3af', textTransform: 'uppercase', margin: '0 0 10px 8px' }}>Help Center</p>
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: tab === t.key ? 700 : 500, background: tab === t.key ? '#fff' : 'transparent', color: tab === t.key ? 'var(--ink)' : 'var(--slate)', boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', marginBottom: 2 }}>
            {t.icon}{t.label}
          </button>
        ))}
        <div style={{ borderTop: '1px solid var(--border)', margin: '14px 0' }} />
        <Link href="/admin/help" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', fontSize: 13.5, color: 'var(--slate)', textDecoration: 'none' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Manage Articles
        </Link>
        <Link href="/admin/help/settings" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', fontSize: 13.5, color: 'var(--slate)', textDecoration: 'none' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Help Settings
        </Link>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '28px 36px', maxWidth: 1050, position: 'relative' }}>
        {/* Range picker */}
        <div style={{ position: 'absolute', top: 24, right: 36 }}>
          <button type="button" onClick={() => setShowRangeMenu(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', fontSize: 13, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            {RANGES.find(r => r.key === range)?.label}
          </button>
          {showRangeMenu && (
            <div style={{ position: 'absolute', top: '110%', right: 0, width: 200, background: '#fff', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.12)', zIndex: 50, overflow: 'hidden' }}>
              {RANGES.map(r => (
                <button key={r.key} type="button" onClick={() => { setRange(r.key); setShowRangeMenu(false) }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', fontSize: 13.5, border: 'none', cursor: 'pointer', background: range === r.key ? 'var(--peach)' : '#fff', color: range === r.key ? 'var(--coral)' : 'var(--ink)', fontWeight: range === r.key ? 700 : 500 }}>
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--slate)' }}>Loading analytics…</div>
        ) : (
          <>
            {tab === 'overview' && (
              <>
                {sectionHeading('Help Center', 'Overview', 'Monitor performance and understand how users interact with your help center.')}
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
                  <StatCard label="Article views" value={views.length} desc="Views across your help center and widgets" />
                  <StatCard label="Searches" value={searches.length} desc="Searches across your help center" />
                  <StatCard label="Search CTR" value={`${ctr}%`} desc="Searches that led to an article click" />
                </div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 32 }}>
                  <StatCard label="Upvotes" value={upvotes} desc="Positive reactions in this range" />
                  <StatCard label="Downvotes" value={downvotes} desc="Negative reactions worth reviewing" />
                  <StatCard label="Satisfaction" value={satisfaction === null ? '—' : `${satisfaction}%`} desc="Share of readers who found articles useful" />
                </div>
                <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: '#fff', padding: 20, marginBottom: 32 }}>
                  <h3 style={{ margin: '0 0 14px 0', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Daily activity</h3>
                  <DailyBars data={dayKeys.map(d => ({ day: d.label, a: viewsByDay[d.key] || 0, b: searchByDay[d.key] || 0 }))} legendA="Article views" legendB="Searches" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, fontFamily: 'Georgia, serif', color: 'var(--ink)' }}>Most viewed articles</h3>
                  <button type="button" onClick={() => setTab('articles')} style={{ fontSize: 13, color: 'var(--slate)', background: 'none', border: 'none', cursor: 'pointer' }}>View more ›</button>
                </div>
                {sortedArticles.slice(0, 5).map(a => (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 4px', borderBottom: '1px solid var(--border)' }}>
                    <div><p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{a.title}</p>{a.category && <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#9ca3af' }}>{a.category}</p>}</div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{viewsPerArticle[a.id] || 0}</span>
                  </div>
                ))}
              </>
            )}

            {tab === 'articles' && (
              <>
                {sectionHeading('Help Center', 'Articles', 'Track article performance, views, and engagement across your help center.')}
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 32 }}>
                  <StatCard label="Article views" value={views.length} desc="Views on articles in your help center and widgets" />
                  <StatCard label="Satisfaction" value={satisfaction === null ? '—' : `${satisfaction}%`} desc="Share of article feedback that was positive" />
                  <StatCard label="Published articles" value={published.length} desc="Articles currently live in your help center" />
                </div>
                <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: '#fff', padding: 20, marginBottom: 32 }}>
                  <h3 style={{ margin: '0 0 14px 0', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Daily article views</h3>
                  <DailyBars data={dayKeys.map(d => ({ day: d.label, a: viewsByDay[d.key] || 0 }))} legendA="Views" />
                </div>
                <h3 style={{ margin: '0 0 12px 0', fontSize: 20, fontWeight: 700, fontFamily: 'Georgia, serif', color: 'var(--ink)' }}>All articles</h3>
                <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: '#fff', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', padding: '10px 18px', background: 'var(--canvas)', fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: '#9ca3af', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ flex: 1 }}>Article</span><span style={{ width: 80, textAlign: 'right' }}>Views</span><span style={{ width: 120, textAlign: 'right' }}>Feedback</span>
                  </div>
                  {sortedArticles.map(a => {
                    const fb = feedbackPerArticle[a.id] || { up: 0, down: 0 }
                    return (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'center', padding: '13px 18px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{a.title}</p>
                          {a.category && <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>{a.category}
                          </p>}
                        </div>
                        <span style={{ width: 80, textAlign: 'right', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{viewsPerArticle[a.id] || 0}</span>
                        <span style={{ width: 120, textAlign: 'right', fontSize: 13, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                          <span style={{ color: '#059669' }}>👍{fb.up}</span><span style={{ color: '#d97706' }}>👎{fb.down}</span>
                        </span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {tab === 'searches' && (
              <>
                {sectionHeading('Help Center', 'Searches', 'Understand what users are searching for and where gaps exist.')}
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 32 }}>
                  <StatCard label="Searches" value={searches.length} desc="Help center searches in the selected range" />
                  <StatCard label="Missed searches" value={missedSearches.length} desc="Questions that returned zero results" accent={missedSearches.length > 0} />
                  <StatCard label="Search CTR" value={`${ctr}%`} desc="Searches that led to an article click" />
                </div>
                <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: '#fff', padding: 20, marginBottom: 32 }}>
                  <h3 style={{ margin: '0 0 14px 0', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Daily searches</h3>
                  <DailyBars data={dayKeys.map(d => ({ day: d.label, a: searchByDay[d.key] || 0 }))} legendA="Searches" colorA="#93c5fd" />
                </div>
                <h3 style={{ margin: '0 0 12px 0', fontSize: 20, fontWeight: 700, fontFamily: 'Georgia, serif', color: 'var(--ink)' }}>Search terms</h3>
                {topTerms.length === 0 ? (
                  <div style={{ padding: 50, textAlign: 'center', color: '#9ca3af', border: '1px dashed var(--border)', borderRadius: 12 }}>
                    <p style={{ margin: '0 0 4px 0', fontWeight: 600, color: 'var(--slate)' }}>No searches yet</p>
                    <p style={{ margin: 0, fontSize: 13 }}>Queries visitors type into your help center search will show up here.</p>
                  </div>
                ) : (
                  <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: '#fff', overflow: 'hidden' }}>
                    {topTerms.map(([term, stat]) => (
                      <div key={term} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 14, color: 'var(--ink)' }}>"{term}"</span>
                        <span style={{ fontSize: 13, display: 'flex', gap: 14 }}>
                          <span style={{ color: 'var(--slate)' }}>{stat.count}×</span>
                          {stat.missed > 0 && <span style={{ color: '#d97706', fontWeight: 600 }}>{stat.missed} missed</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {tab === 'feedback' && (
              <>
                {sectionHeading('Help Center', 'Feedback', 'Review user feedback and sentiment on your help center content.')}
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 32 }}>
                  <StatCard label="Upvotes" value={upvotes} desc="Positive reactions during the selected range" />
                  <StatCard label="Downvotes" value={downvotes} desc="Negative reactions worth reviewing" />
                  <StatCard label="Satisfaction" value={satisfaction === null ? '—' : `${satisfaction}%`} desc="Share of readers who found articles useful" />
                </div>
                <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: '#fff', padding: 20, marginBottom: 32 }}>
                  <h3 style={{ margin: '0 0 14px 0', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Daily feedback</h3>
                  <DailyBars data={dayKeys.map(d => ({ day: d.label, a: upByDay[d.key] || 0, b: downByDay[d.key] || 0 }))} legendA="Upvotes" legendB="Downvotes" colorA="#6ee7b7" colorB="#fcd34d" />
                </div>
                <h3 style={{ margin: '0 0 12px 0', fontSize: 20, fontWeight: 700, fontFamily: 'Georgia, serif', color: 'var(--ink)' }}>Recent feedback</h3>
                {feedback.length === 0 ? (
                  <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af', border: '1px dashed var(--border)', borderRadius: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--canvas)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z"/></svg>
                    </div>
                    <p style={{ margin: '0 0 4px 0', fontWeight: 600, color: 'var(--slate)' }}>No feedback yet</p>
                    <p style={{ margin: 0, fontSize: 13 }}>Reactions readers leave on your articles will show up here as they come in.</p>
                  </div>
                ) : (
                  <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: '#fff', overflow: 'hidden' }}>
                    {feedback.slice(0, 20).map((f: any) => {
                      const art = articles.find(a => a.id === f.article_id)
                      return (
                        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ fontSize: 18 }}>{f.helpful ? '👍' : '👎'}</span>
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{art?.title || 'Unknown article'}</p>
                            {f.comment && <p style={{ margin: '2px 0 0 0', fontSize: 13, color: 'var(--slate)' }}>"{f.comment}"</p>}
                          </div>
                          <span style={{ fontSize: 12, color: '#9ca3af' }}>{new Date(f.created_at).toLocaleDateString()}</span>
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
    </div>
  )
}
