'use client'

// The business's public updates page (<slug>.colvy.com/announcements, or its
// own board domain): a clean timeline of live announcements with cover
// pictures, categories, reactions and a link to the roadmap idea a post
// delivers. Everything comes from /api/announcements/public, which only
// returns live posts with their bodies cleaned to safe HTML; this page never
// reads or writes the announcements table itself.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { authFetch } from '@/lib/auth-fetch'
import { supabase } from '@/lib/supabase'
import { CATEGORIES, formatDate, type CategoryKey, type PublicAnnouncement } from '@/lib/announcements'
import { PublicPost, POST_CSS } from '@/components/announcements/PublicPost'
import { AnnIcon } from '@/components/announcements/icons'
import { trackAnnouncementView } from '@/components/announcements/WidgetBoost'

type Data = { company: { name: string; slug: string; logo_url?: string | null; accent_color?: string | null } | null; announcements: PublicAnnouncement[]; ideas: Record<string, string>; private?: boolean }

const MINE_KEY = 'colvy_ann_reactions'
function readMine(): Record<string, string[]> {
  try { const v = JSON.parse(localStorage.getItem(MINE_KEY) || '{}'); return v && typeof v === 'object' ? v : {} } catch { return {} }
}
function writeMine(v: Record<string, string[]>) { try { localStorage.setItem(MINE_KEY, JSON.stringify(v)) } catch {} }
// The server's receipt for each reaction, needed to take it back.
const TOKENS_KEY = 'colvy_ann_reaction_tokens'
function readTokens(): Record<string, string> {
  try { const v = JSON.parse(localStorage.getItem(TOKENS_KEY) || '{}'); return v && typeof v === 'object' ? v : {} } catch { return {} }
}
function writeToken(k: string, t: string | null) {
  try { const v = readTokens(); if (t) v[k] = t; else delete v[k]; localStorage.setItem(TOKENS_KEY, JSON.stringify(v)) } catch {}
}

/** Which board this is: its host, or (on colvy.com / a preview) ?slug= or your own workspace. */
async function boardQuery(slugParam: string | null): Promise<string> {
  const h = window.location.hostname.toLowerCase()
  const main = h === 'colvy.com' || h === 'www.colvy.com' || h === 'localhost' || h.endsWith('.vercel.app') || /^[\d.]+$/.test(h)
  if (!main) return `host=${encodeURIComponent(h)}`
  if (slugParam) return `slug=${encodeURIComponent(slugParam)}`
  try {
    const { resolveCompanyUser } = await import('@/lib/client-cache')
    const { companyId } = await resolveCompanyUser()
    if (companyId) return `companyId=${encodeURIComponent(companyId)}`
  } catch {}
  return ''
}

function UpdatesPage() {
  const params = useSearchParams()
  const focusId = params?.get('id') || null
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState<CategoryKey | 'all'>('all')
  const [mine, setMine] = useState<Record<string, string[]>>({})
  const [copied, setCopied] = useState<string | null>(null)
  const [isStaff, setIsStaff] = useState(false)
  const scrolled = useRef(false)

  const load = useCallback(async () => {
    setError(false)
    try {
      const q = await boardQuery(params?.get('slug') || null)
      if (!q) { setData({ company: null, announcements: [], ideas: {} }); return }
      const res = await authFetch(`/api/announcements/public?${q}`)
      if (!res.ok) throw new Error('load')
      setData(await res.json())
    } catch { setError(true) }
  }, [params])

  useEffect(() => {
    setMine(readMine())
    load()
    supabase.auth.getSession().then(({ data: s }) => {
      const u = s?.session?.user
      if (u) import('@/lib/board').then(({ isCompanyAdminUser }) => isCompanyAdminUser(u).then(setIsStaff)).catch(() => {})
    })
  }, [load])

  const posts = data?.announcements || []
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return posts.filter(p => (cat === 'all' || p.category === cat) && (!q || `${p.title} ${p.excerpt}`.toLowerCase().includes(q)))
  }, [posts, cat, query])
  const usedCats = useMemo(() => CATEGORIES.filter(c => posts.some(p => p.category === c.key)), [posts])
  const onNow = useMemo(() => posts.filter(p => p.expires_at && new Date(p.expires_at).getTime() > Date.now())
    .sort((a, b) => new Date(a.expires_at!).getTime() - new Date(b.expires_at!).getTime()).slice(0, 4), [posts])
  const months = useMemo(() => {
    const m = new Map<string, { label: string; first: string; n: number }>()
    for (const p of posts.filter(x => !x.is_pinned)) {
      const d = new Date(p.date)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      const e = m.get(key)
      if (e) e.n++
      else m.set(key, { label: d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }), first: p.id, n: 1 })
    }
    return [...m.values()].slice(0, 12)
  }, [posts])

  // Open on ?id=: scroll to it once it's on the page.
  useEffect(() => {
    if (!focusId || scrolled.current || !posts.length) return
    const el = document.getElementById(`post-${focusId}`)
    if (el) { scrolled.current = true; setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80) }
  }, [focusId, posts.length])

  // A view is a post someone actually had on screen for a moment (once per browser).
  useEffect(() => {
    if (!shown.length || typeof IntersectionObserver === 'undefined') return
    const timers = new Map<string, any>()
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        const id = (e.target as HTMLElement).dataset.annId
        if (!id) continue
        if (e.isIntersecting) { if (!timers.has(id)) timers.set(id, setTimeout(() => trackAnnouncementView(id), 1200)) }
        else { clearTimeout(timers.get(id)); timers.delete(id) }
      }
    }, { threshold: 0.4 })
    document.querySelectorAll('[data-ann-id]').forEach(el => io.observe(el))
    return () => { io.disconnect(); timers.forEach(t => clearTimeout(t)) }
  }, [shown])

  const react = async (id: string, key: string) => {
    const had = (mine[id] || []).includes(key)
    const next = { ...mine, [id]: had ? (mine[id] || []).filter(k => k !== key) : [...(mine[id] || []), key] }
    setMine(next); writeMine(next)
    setData(d => d && ({ ...d, announcements: d.announcements.map(p => p.id === id ? { ...p, reactions: { ...p.reactions, [key]: Math.max(0, (p.reactions as any)[key] + (had ? -1 : 1)) } } : p) }))
    const tk = `${id}:${key}`
    // A reaction made before receipts existed can't be taken back on the server.
    if (had && !readTokens()[tk]) return
    try {
      const res = await fetch('/api/announcements/public', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: had ? 'unreact' : 'react', reaction: key, token: had ? readTokens()[tk] : undefined }) })
      const j = await res.json().catch(() => ({}))
      writeToken(tk, had ? null : (j.token || null))
      if (res.ok && j.reactions) setData(d => d && ({ ...d, announcements: d.announcements.map(p => p.id === id ? { ...p, reactions: j.reactions } : p) }))
    } catch {}
  }
  const copyLink = (id: string) => {
    const url = `${window.location.origin}/announcements?id=${id}`
    navigator.clipboard?.writeText(url).then(() => { setCopied(id); setTimeout(() => setCopied(c => (c === id ? null : c)), 1800) }).catch(() => {})
  }
  const jump = (id: string) => document.getElementById(`post-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const company = data?.company
  const pinned = shown.filter(p => p.is_pinned)
  const rest = shown.filter(p => !p.is_pinned)

  // The business's own colour, even where the board chrome hasn't set it yet.
  const accent = /^#[0-9a-f]{6}$/i.test(company?.accent_color || '') ? company!.accent_color! : null
  return (
    <div className="ap-root" style={accent ? ({ '--coral': accent } as React.CSSProperties) : undefined}>
      <style>{POST_CSS + PAGE_CSS}</style>
      <header className="ap-hero">
        <div className="ap-hero-text">
          <p className="ap-kicker">{company?.name || 'Updates'}</p>
          <h1 className="ap-h1">What’s new</h1>
          <p className="ap-lede">News, new arrivals, events and offers{company?.name ? ` from ${company.name}` : ''}.</p>
        </div>
        <div className="ap-hero-tools">
          <label className="ap-search">
            <AnnIcon name="search" size={16} />
            <span className="ap-sr">Search updates</span>
            <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search updates" />
          </label>
          {isStaff && (
            <Link href="/admin/announcements/new" className="ap-new"><AnnIcon name="plus" size={16} /> New</Link>
          )}
        </div>
      </header>

      {usedCats.length > 1 && (
        <nav className="ap-cats" aria-label="Categories">
          <button type="button" className={`ap-catbtn${cat === 'all' ? ' on' : ''}`} onClick={() => setCat('all')}>All</button>
          {usedCats.map(c => (
            <button key={c.key} type="button" className={`ap-catbtn${cat === c.key ? ' on' : ''}`} onClick={() => setCat(c.key)}>
              <span className="ap-dot" style={{ background: c.color }} />{c.label}
            </button>
          ))}
        </nav>
      )}

      <div className="ap-layout">
        <main className="ap-main">
          {!data && !error && (
            <div className="ap-skel-list">{[0, 1, 2].map(i => <div key={i} className="ap-skel" />)}</div>
          )}
          {error && (
            <div className="ap-empty-state">
              <p className="ap-empty-title">Updates didn’t load</p>
              <p className="ap-empty-text">Check your connection and try again.</p>
              <button type="button" className="ap-btn" onClick={load}>Try again</button>
            </div>
          )}
          {data?.private && (
            <div className="ap-empty-state">
              <p className="ap-empty-title">This board is private</p>
              <p className="ap-empty-text">Sign in to see its updates.</p>
            </div>
          )}
          {data && !data.private && !error && shown.length === 0 && (
            <div className="ap-empty-state">
              <span className="ap-empty-art"><AnnIcon name="megaphone" size={28} /></span>
              <p className="ap-empty-title">{posts.length ? 'Nothing matches that' : 'No updates yet'}</p>
              <p className="ap-empty-text">{posts.length ? 'Try another word or category.' : 'News and offers will show here.'}</p>
            </div>
          )}
          {pinned.length > 0 && (
            <section aria-label="Pinned" className="ap-section">
              {pinned.map(p => (
                <div key={p.id} className="ap-item">
                  <div className="ap-when"><time dateTime={p.date}><span className="ap-when-label">Pinned</span><span className="ap-when-year">{new Date(p.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span></time></div>
                  <div className="ap-rail"><span className="ap-node is-pin"><AnnIcon name="pin" size={12} /></span></div>
                  <PublicPost post={p} ideaTitle={data?.ideas?.[p.idea_id || '']} mine={mine[p.id]} onReact={k => react(p.id, k)} onCopy={() => copyLink(p.id)} copied={copied === p.id} highlight={focusId === p.id} />
                </div>
              ))}
            </section>
          )}
          {rest.length > 0 && (
            <section aria-label="Timeline" className="ap-section">
              {rest.map(p => (
                <div key={p.id} className="ap-item">
                  <div className="ap-when">
                    <time dateTime={p.date}>
                      <span className="ap-when-day">{new Date(p.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
                      <span className="ap-when-year">{new Date(p.date).getFullYear()}</span>
                    </time>
                  </div>
                  <div className="ap-rail"><span className="ap-node" /></div>
                  <PublicPost post={p} ideaTitle={data?.ideas?.[p.idea_id || '']} mine={mine[p.id]} onReact={k => react(p.id, k)} onCopy={() => copyLink(p.id)} copied={copied === p.id} highlight={focusId === p.id} />
                </div>
              ))}
            </section>
          )}
        </main>

        {posts.length > 0 && (
          <aside className="ap-aside" aria-label="More">
            {onNow.length > 0 && (
              <div className="ap-panel">
                <p className="ap-panel-title"><AnnIcon name="hourglass" size={15} /> On now</p>
                {onNow.map(p => (
                  <button key={p.id} type="button" className="ap-panel-row" onClick={() => jump(p.id)}>
                    {p.cover_image ? <img src={p.cover_image} alt="" /> : <span className="ap-panel-ph"><AnnIcon name="calendar" size={16} /></span>}
                    <span className="ap-panel-text"><strong>{p.title}</strong><span>Ends {formatDate(p.expires_at)}</span></span>
                  </button>
                ))}
              </div>
            )}
            {months.length > 1 && (
              <div className="ap-panel">
                <p className="ap-panel-title"><AnnIcon name="calendar" size={15} /> Browse</p>
                {months.map(m => (
                  <button key={m.first} type="button" className="ap-month" onClick={() => jump(m.first)}>
                    <span>{m.label}</span><span className="ap-month-n">{m.n}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="ap-panel ap-panel-soft">
              <p className="ap-panel-title"><AnnIcon name="idea" size={15} /> Got an idea?</p>
              <p className="ap-panel-copy">Tell {company?.name || 'us'} what you’d like to see next.</p>
              <Link href="/" className="ap-btn">Share an idea</Link>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

export default function AnnouncementsPage() {
  return <Suspense fallback={null}><UpdatesPage /></Suspense>
}

const PAGE_CSS = `
.ap-root { --ap-card: var(--card, #fff); width: 100%; min-width: 0; box-sizing: border-box; padding: 22px 16px 64px; background: var(--canvas, #fafafa); min-height: calc(100vh - 56px); color: var(--ink); }
.ap-root *, .ap-root *::before, .ap-root *::after { box-sizing: border-box; }
@media (min-width: 768px) { .ap-root { padding: 36px 32px 80px; } }
@media (min-width: 1280px) { .ap-root { padding: 44px 48px 96px; } }
.ap-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.ap-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; flex-wrap: wrap; margin-bottom: 22px; }
.ap-hero-text { min-width: 0; }
.ap-kicker { margin: 0 0 6px; font-size: 14px; font-weight: 600; color: var(--coral); }
.ap-h1 { margin: 0; font-size: 34px; line-height: 1.08; font-weight: 800; letter-spacing: -0.03em; color: var(--ink); }
@media (min-width: 768px) { .ap-h1 { font-size: 48px; } }
.ap-lede { margin: 10px 0 0; font-size: 17px; color: var(--slate); line-height: 1.5; }
.ap-hero-tools { display: flex; gap: 10px; align-items: center; flex: 0 1 420px; min-width: 0; }
.ap-search { flex: 1; display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--ap-card); color: var(--slate); min-width: 0; }
.ap-search:focus-within { border-color: var(--coral); }
.ap-search input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: 16px; color: var(--ink); }
.ap-new { display: inline-flex; align-items: center; gap: 6px; height: 44px; padding: 0 16px; border-radius: 12px; background: var(--coral); color: #fff; font-size: 14px; font-weight: 600; text-decoration: none; white-space: nowrap; }
.ap-cats { display: flex; gap: 8px; overflow-x: auto; padding: 2px 0 6px; margin: 0 0 22px; scrollbar-width: none; }
.ap-cats::-webkit-scrollbar { display: none; }
.ap-catbtn { display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0; height: 36px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--border); background: var(--ap-card); color: var(--ink); font-size: 14px; font-weight: 600; cursor: pointer; }
.ap-catbtn:hover { border-color: #d4d4d8; }
.ap-catbtn.on { background: var(--ink); border-color: var(--ink); color: var(--ap-card); }
.ap-dot { width: 8px; height: 8px; border-radius: 50%; }
.ap-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 28px; }
@media (min-width: 1100px) { .ap-layout { grid-template-columns: minmax(0, 1fr) clamp(280px, 24vw, 420px); gap: 36px; } }
.ap-main { min-width: 0; }
.ap-section + .ap-section { margin-top: 8px; }
.ap-item { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0; padding-bottom: 22px; position: relative; }
.ap-when, .ap-rail { display: none; }
@media (min-width: 900px) {
  .ap-item { grid-template-columns: 96px 36px minmax(0, 1fr); padding-bottom: 32px; }
  .ap-when { display: block; text-align: right; padding-top: 22px; }
  .ap-when time { display: flex; flex-direction: column; }
  .ap-when-day { font-size: 15px; font-weight: 700; color: var(--ink); }
  .ap-when-year { font-size: 13px; color: var(--slate); margin-top: 2px; }
  .ap-when-label { font-size: 13px; font-weight: 700; color: var(--coral); }
  .ap-rail { display: flex; justify-content: center; position: relative; }
  .ap-rail::before { content: ''; position: absolute; top: 0; bottom: -32px; width: 2px; background: var(--border); }
  .ap-item:last-child .ap-rail::before { bottom: 0; }
  .ap-node { position: relative; margin-top: 26px; width: 12px; height: 12px; border-radius: 50%; background: var(--ap-card); border: 2.5px solid var(--coral); }
  .ap-node.is-pin { width: 24px; height: 24px; margin-top: 20px; border: none; background: var(--coral); color: #fff; display: inline-flex; align-items: center; justify-content: center; }
  .ap-item .ap-date { display: none; }
}
.ap-aside { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
@media (min-width: 1100px) { .ap-aside { position: sticky; top: 80px; align-self: start; } }
.ap-panel { background: var(--ap-card); border: 1px solid var(--border); border-radius: 18px; padding: 16px; }
.ap-panel-soft { background: color-mix(in srgb, var(--coral) 6%, var(--ap-card)); border-color: color-mix(in srgb, var(--coral) 20%, var(--border)); }
.ap-panel-title { display: flex; align-items: center; gap: 7px; margin: 0 0 10px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--slate); }
.ap-panel-copy { margin: 0 0 12px; font-size: 14.5px; color: var(--ink); line-height: 1.5; }
.ap-panel-row { display: flex; align-items: center; gap: 12px; width: 100%; padding: 8px; margin: 0 -8px; border: none; border-radius: 12px; background: none; text-align: left; cursor: pointer; width: calc(100% + 16px); }
.ap-panel-row:hover { background: var(--canvas); }
.ap-panel-row img, .ap-panel-ph { width: 48px; height: 48px; border-radius: 10px; object-fit: cover; flex-shrink: 0; }
.ap-panel-ph { display: inline-flex; align-items: center; justify-content: center; background: var(--canvas); color: var(--slate); }
.ap-panel-text { display: flex; flex-direction: column; min-width: 0; font-size: 13px; color: var(--slate); }
.ap-panel-text strong { font-size: 14px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ap-month { display: flex; justify-content: space-between; width: 100%; padding: 8px 10px; margin: 0 -10px; width: calc(100% + 20px); border: none; border-radius: 10px; background: none; font-size: 14.5px; color: var(--ink); cursor: pointer; }
.ap-month:hover { background: var(--canvas); }
.ap-month-n { color: var(--slate); font-variant-numeric: tabular-nums; }
.ap-btn { display: inline-flex; align-items: center; justify-content: center; height: 40px; padding: 0 16px; border-radius: 11px; border: 1px solid var(--border); background: var(--ap-card); color: var(--ink); font-size: 14px; font-weight: 600; text-decoration: none; cursor: pointer; }
.ap-btn:hover { border-color: #d4d4d8; }
.ap-empty-state { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding: 64px 20px; border: 1px dashed var(--border); border-radius: 22px; background: var(--ap-card); }
.ap-empty-art { display: inline-flex; align-items: center; justify-content: center; width: 60px; height: 60px; border-radius: 18px; background: color-mix(in srgb, var(--coral) 10%, transparent); color: var(--coral); margin-bottom: 8px; }
.ap-empty-title { margin: 0; font-size: 18px; font-weight: 700; color: var(--ink); }
.ap-empty-text { margin: 0 0 10px; font-size: 14.5px; color: var(--slate); }
.ap-skel-list { display: flex; flex-direction: column; gap: 20px; }
.ap-skel { height: 320px; border-radius: 22px; background: var(--ap-card); border: 1px solid var(--border); animation: apPulse 1.2s ease-in-out infinite; }
@keyframes apPulse { 50% { opacity: .55; } }
@media (prefers-reduced-motion: reduce) { .ap-skel { animation: none; } }
`
