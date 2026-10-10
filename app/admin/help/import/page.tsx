'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { authFetch } from '@/lib/auth-fetch'
import { useEntitlements } from '@/lib/entitlements-client'
import { renderMarkdown } from '@/lib/markdown'
import { StatusMark } from '@/components/StatusMark'
import { confirmDialog } from '@/components/ConfirmDialog'

// Help Centre → Import from your website.
//
// Enter a website; Colvy finds its pages, reads them one by one, has Colvy AI
// organise what it read into topics and write an article for each customer
// question, then shows everything for review. Nothing is saved until the
// person picks what to keep and saves it as drafts or publishes it.

type PageState = 'queued' | 'reading' | 'read' | 'skipped'
type SitePage = { url: string; reason: string; state: PageState; id?: string; title?: string; words?: number; text?: string; error?: string }
type Category = { name: string; icon: string; description: string }
type Draft = {
  key: string; title: string; category: string; summary: string; sources: string[]; featured: boolean
  content: string; include: boolean; state: 'pending' | 'writing' | 'done' | 'failed'
}
type Stage = 'start' | 'scan' | 'review' | 'saving' | 'done'
type Phase = 'discover' | 'read' | 'plan' | 'write'

const EASE = 'cubic-bezier(.32,.72,0,1)'
const slugify = (s: string) => s.toLowerCase().trim().replace(/&/g, 'and').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'general'
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u } }
const pathOf = (u: string) => { try { const x = new URL(u); return (x.pathname === '/' ? '/' : x.pathname.replace(/\/$/, '')) } catch { return u } }

async function pool<T>(items: T[], size: number, run: (item: T) => Promise<void>) {
  const queue = [...items]
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) { const next = queue.shift()!; await run(next) }
  }))
}

async function api(body: any) {
  const res = await authFetch('/api/help/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Something went wrong. Please try again.')
  return data
}

export default function HelpImportPage() {
  const ent = useEntitlements()
  const companyId = ent.companyId
  const [stage, setStage] = useState<Stage>('start')
  const [phase, setPhase] = useState<Phase>('discover')
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [pages, setPages] = useState<SitePage[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [saved, setSaved] = useState<{ count: number; status: 'draft' | 'published'; capped: number } | null>(null)
  const runId = useRef(0)
  // The pages as read, for the AI steps and for retrying one article later.
  const payloadRef = useRef<{ id?: string; url: string; title?: string; text?: string }[]>([])

  useEffect(() => {
    try { const last = localStorage.getItem('colvy-help-import-url'); if (last) setUrl(last) } catch {}
  }, [])

  const readPages = pages.filter(p => p.state === 'read')
  const settled = pages.filter(p => p.state === 'read' || p.state === 'skipped').length
  const written = drafts.filter(d => d.state === 'done' || d.state === 'failed').length

  // One number for the whole run: finding 5%, reading to 55%, organising to 65%, writing to 100%.
  const progress = useMemo(() => {
    if (stage !== 'scan') return stage === 'start' ? 0 : 100
    if (phase === 'discover') return 4
    if (phase === 'read') return 5 + (pages.length ? (settled / pages.length) * 50 : 0)
    if (phase === 'plan') return 58
    return 65 + (drafts.length ? (written / drafts.length) * 35 : 0)
  }, [stage, phase, pages.length, settled, drafts.length, written])

  const start = async () => {
    if (!companyId) { setError('Still loading your workspace. Try again in a second.'); return }
    if (!url.trim()) { setError('Enter your website address.'); return }
    const my = ++runId.current
    const alive = () => runId.current === my
    setError(''); setStage('scan'); setPhase('discover'); setPages([]); setCategories([]); setDrafts([]); setSelected(null)
    try { localStorage.setItem('colvy-help-import-url', url.trim()) } catch {}

    try {
      // 1. Find the pages.
      const found = await api({ action: 'discover', companyId, url: url.trim(), max: 40 })
      if (!alive()) return
      const list: SitePage[] = (found.pages || []).map((p: any) => ({ url: p.url, reason: p.reason, state: 'queued' as PageState }))
      setPages(list)
      setPhase('read')

      // 2. Read them, a few at a time.
      const got = new Map<string, SitePage>()
      const batches: string[][] = []
      for (let i = 0; i < list.length; i += 3) batches.push(list.slice(i, i + 3).map(p => p.url))
      await pool(batches, 3, async (urls) => {
        if (!alive()) return
        setPages(prev => prev.map(p => urls.includes(p.url) ? { ...p, state: 'reading' } : p))
        let res: any = { pages: [] }
        try { res = await api({ action: 'read', companyId, urls }) } catch {}
        if (!alive()) return
        const byUrl = new Map<string, any>((res.pages || []).map((r: any) => [r.url, r]))
        const results = new Map<string, SitePage>()
        for (const u of urls) {
          const base = list.find(p => p.url === u)!
          const r = byUrl.get(u)
          const next: SitePage = r?.ok
            ? { ...base, state: 'read', title: r.title, words: r.words, text: r.text }
            : { ...base, state: 'skipped', title: r?.title, error: r?.error || 'Couldn’t read this page' }
          results.set(u, next)
          if (next.state === 'read') got.set(u, next)
        }
        setPages(prev => prev.map(p => results.get(p.url) || p))
      })
      if (!alive()) return
      const readable = list.map(p => got.get(p.url)).filter(Boolean) as SitePage[]
      if (!readable.length) throw new Error('We couldn’t read any pages on that website. Check the address, or try your FAQ or help page directly.')
      readable.forEach((p, i) => { p.id = `P${i + 1}` })
      setPages(prev => prev.map(p => { const r = readable.find(x => x.url === p.url); return r ? { ...p, id: r.id } : p }))
      const payload = readable.map(p => ({ id: p.id, url: p.url, title: p.title, text: p.text }))
      payloadRef.current = payload

      // 3. Organise into topics and plan the articles.
      setPhase('plan')
      const plan = await api({ action: 'plan', companyId, pages: payload })
      if (!alive()) return
      if (!plan.articles?.length) throw new Error('We read your pages but didn’t find content that would make good help articles. Try pointing at your FAQ, shipping or policy pages.')
      setCategories(plan.categories || [])
      const list2: Draft[] = plan.articles.map((a: any) => ({ ...a, content: '', include: true, state: 'pending' as const }))
      setDrafts(list2)
      setPhase('write')

      // 4. Write the articles, three per request.
      const groups: Draft[][] = []
      for (let i = 0; i < list2.length; i += 3) groups.push(list2.slice(i, i + 3))
      await pool(groups, 3, async (group) => {
        if (!alive()) return
        const keys = group.map(g => g.key)
        setDrafts(prev => prev.map(d => keys.includes(d.key) ? { ...d, state: 'writing' } : d))
        const ids = new Set(group.flatMap(g => g.sources))
        try {
          const res = await api({ action: 'write', companyId, articles: group, pages: payload.filter(p => ids.has(p.id!)) })
          if (!alive()) return
          const byKey = new Map((res.articles || []).map((a: any) => [a.key, a]))
          setDrafts(prev => prev.map(d => {
            if (!keys.includes(d.key)) return d
            const w: any = byKey.get(d.key)
            return w ? { ...d, title: w.title || d.title, content: w.content, state: 'done' } : { ...d, state: 'failed', include: false }
          }))
        } catch {
          if (!alive()) return
          setDrafts(prev => prev.map(d => keys.includes(d.key) ? { ...d, state: 'failed', include: false } : d))
        }
      })
      if (!alive()) return
      setTimeout(() => { if (alive()) setStage('review') }, 700)
    } catch (e: any) {
      if (!alive()) return
      setError(e?.message || 'Something went wrong. Please try again.')
      setStage('start')
    }
  }

  const cancel = () => { runId.current++; setStage('start') }

  // Write one article again (from the review screen).
  const retry = async (key: string) => {
    const d = drafts.find(x => x.key === key)
    const payload = payloadRef.current
    if (!d || !companyId) return
    setDrafts(prev => prev.map(x => x.key === key ? { ...x, state: 'writing' } : x))
    try {
      const res = await api({ action: 'write', companyId, articles: [d], pages: payload.filter(p => p.id && d.sources.includes(p.id)) })
      const w = (res.articles || [])[0]
      setDrafts(prev => prev.map(x => x.key === key ? (w ? { ...x, title: w.title || x.title, content: w.content, state: 'done', include: true } : { ...x, state: 'failed' }) : x))
    } catch { setDrafts(prev => prev.map(x => x.key === key ? { ...x, state: 'failed' } : x)) }
  }

  const save = async (status: 'draft' | 'published') => {
    if (!companyId) return
    const keep = drafts.filter(d => d.include && d.state === 'done' && d.title.trim() && d.content.trim())
    if (!keep.length) return
    if (status === 'published' && !await confirmDialog({ title: `Publish ${keep.length} article${keep.length === 1 ? '' : 's'}?`, message: 'They’ll be live in your Help Centre straight away. You can edit or unpublish them any time.', confirmLabel: 'Publish', tone: 'primary' })) return
    setStage('saving')
    try {
      const db = supabase as any
      // Plan limit: articles beyond it are left out rather than failing the lot.
      const limit = ent.limitOf('helpArticles')
      let room = Infinity
      if (typeof limit === 'number' && isFinite(limit)) {
        const { count } = await db.from('help_articles').select('id', { count: 'exact', head: true }).eq('company_id', companyId)
        room = Math.max(0, limit - (count || 0))
      }
      const batch = keep.slice(0, room === Infinity ? keep.length : room)

      // Categories: reuse ones with the same name or slug, create the rest.
      const { data: existing } = await db.from('help_categories').select('id, name, slug, position').eq('company_id', companyId)
      const slugFor = new Map<string, string>()
      let pos = Math.max(0, ...(existing || []).map((c: any) => Number(c.position) || 0))
      for (const name of Array.from(new Set(batch.map(d => d.category)))) {
        const slug = slugify(name)
        const hit = (existing || []).find((c: any) => c.slug === slug || String(c.name).toLowerCase() === name.toLowerCase())
        if (hit) { slugFor.set(name, hit.slug); continue }
        const icon = categories.find(c => c.name === name)?.icon || '📁'
        const { error } = await db.from('help_categories').insert({ company_id: companyId, name, slug, icon, position: ++pos })
        slugFor.set(name, slug)
        if (error && !/duplicate|unique/i.test(error.message || '')) console.warn('[help-import] category', error.message)
      }

      let count = 0
      for (const d of batch) {
        const { error } = await db.from('help_articles').insert({
          company_id: companyId, title: d.title.trim(), content: d.content.trim(),
          category: slugFor.get(d.category) || slugify(d.category), status, featured: !!d.featured,
          media: [], views: 0, likes: 0,
        })
        if (error) { if (/PLAN_LIMIT/i.test(error.message || '')) break; throw error }
        count++
      }
      setSaved({ count, status, capped: keep.length - count })
      setStage('done')
    } catch (e: any) {
      setError(`Couldn’t save: ${e?.message || 'please try again'}`)
      setStage('review')
    }
  }

  const sel = drafts.find(d => d.key === selected) || null
  const update = (key: string, patch: Partial<Draft>) => setDrafts(prev => prev.map(d => d.key === key ? { ...d, ...patch } : d))
  const readyCount = drafts.filter(d => d.include && d.state === 'done').length

  useEffect(() => {
    if (stage === 'review' && !selected) setSelected(drafts.find(d => d.state === 'done')?.key || null)
  }, [stage, drafts, selected])

  return (
    <div className="hi-root" style={{ minHeight: '100%', background: 'var(--canvas, #f6f7f9)' }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: stage === 'review' ? 1180 : 860, margin: '0 auto', padding: '20px 16px 120px', transition: `max-width .5s ${EASE}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
          <Link href="/admin/help" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--coral)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            Help Centre
          </Link>
          {stage === 'scan' && <button type="button" onClick={cancel} className="hi-ghost">Cancel</button>}
          {stage === 'review' && <button type="button" onClick={async () => { if (await confirmDialog({ title: 'Start over?', message: 'The articles written so far will be discarded.', confirmLabel: 'Start over', tone: 'danger' })) { setStage('start'); setDrafts([]) } }} className="hi-ghost">Start over</button>}
        </div>

        {stage === 'start' && (
          <div className="hi-fade" style={{ textAlign: 'center', paddingTop: 'min(8vh, 64px)' }}>
            <div className="hi-orb" aria-hidden>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
            </div>
            <h1 style={{ margin: '22px 0 0', fontSize: 'clamp(26px, 4.4vw, 38px)', fontWeight: 800, letterSpacing: '-0.025em', color: 'var(--ink)', lineHeight: 1.1 }}>Build your Help Centre<br />from your website</h1>
            <p style={{ margin: '14px auto 0', maxWidth: 520, fontSize: 15.5, color: 'var(--slate)', lineHeight: 1.55 }}>
              Colvy AI reads your website, sorts what it finds into topics and writes a help article for each customer question. You review everything before anything goes live.
            </p>
            <form onSubmit={e => { e.preventDefault(); start() }} className="hi-field" style={{ margin: '30px auto 0' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
              <input value={url} onChange={e => { setUrl(e.target.value); setError('') }} placeholder="yourstore.com or a page like yourstore.com/faq" autoFocus inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 16, color: 'var(--ink)', fontFamily: 'inherit' }} />
              <button type="submit" disabled={!ent.ready} className="hi-primary">Scan website</button>
            </form>
            {error && <p className="hi-fade" style={{ margin: '14px auto 0', maxWidth: 520, fontSize: 13.5, color: '#dc2626' }}>{error}</p>}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 26 }}>
              {['Reads up to 40 pages', 'Groups them into topics', 'Writes from your own words', 'Saved as drafts until you publish'].map((t, i) => (
                <span key={t} className="hi-chip" style={{ animationDelay: `${120 + i * 70}ms` }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>{t}
                </span>
              ))}
            </div>
          </div>
        )}

        {stage === 'scan' && (
          <ScanView phase={phase} progress={progress} pages={pages} drafts={drafts} categories={categories} host={hostOf(pages[0]?.url || url)} />
        )}

        {stage === 'review' && (
          <div className="hi-fade">
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Review your articles</h1>
                <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--slate)' }}>
                  {drafts.filter(d => d.state === 'done').length} articles in {categories.length} topics, written from {readPages.length} pages of {hostOf(pages[0]?.url || url)}. Edit anything, untick what you don’t want.
                </p>
              </div>
            </div>
            {error && <p style={{ margin: '0 0 12px', fontSize: 13, color: '#dc2626' }}>{error}</p>}
            <div className="hi-review">
              <div className="hi-list">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px 10px' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate)' }}>{readyCount} selected</span>
                  <button type="button" className="hi-link" onClick={() => { const all = drafts.filter(d => d.state === 'done').every(d => d.include); setDrafts(prev => prev.map(d => d.state === 'done' ? { ...d, include: !all } : d)) }}>
                    {drafts.filter(d => d.state === 'done').every(d => d.include) ? 'Select none' : 'Select all'}
                  </button>
                </div>
                {categories.filter(c => drafts.some(d => d.category === c.name)).map(c => (
                  <div key={c.name} style={{ marginBottom: 14 }}>
                    <p style={{ margin: '0 4px 6px', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--slate)' }}>{c.name}</p>
                    {drafts.filter(d => d.category === c.name).map(d => (
                      <div key={d.key} onClick={() => d.state === 'done' && setSelected(d.key)} className={`hi-row${selected === d.key ? ' on' : ''}`} style={{ opacity: d.state === 'failed' ? 0.7 : 1 }}>
                        <input type="checkbox" checked={d.include} disabled={d.state !== 'done'} onClick={e => e.stopPropagation()} onChange={e => update(d.key, { include: e.target.checked })}
                          style={{ width: 16, height: 16, accentColor: 'var(--coral)', flexShrink: 0, cursor: 'pointer' }} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                        {d.featured && d.state === 'done' && <span title="Featured" style={{ fontSize: 10, fontWeight: 800, color: '#b45309', background: '#fef3c7', padding: '1px 6px', borderRadius: 20 }}>Featured</span>}
                        {d.state === 'failed' && <button type="button" className="hi-link" onClick={e => { e.stopPropagation(); retry(d.key) }}>Retry</button>}
                        {d.state === 'writing' && <span className="hi-spin" />}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div className="hi-editor">
                {sel ? (
                  <div key={sel.key} className="hi-fade">
                    <input value={sel.title} onChange={e => update(sel.key, { title: e.target.value })}
                      style={{ width: '100%', border: 'none', outline: 'none', fontSize: 22, fontWeight: 800, letterSpacing: '-0.015em', color: 'var(--ink)', background: 'transparent', padding: 0, fontFamily: 'inherit' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '12px 0 14px' }}>
                      <select value={sel.category} onChange={e => update(sel.key, { category: e.target.value })} className="hi-select">
                        {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                      </select>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={sel.featured} onChange={e => update(sel.key, { featured: e.target.checked })} style={{ accentColor: 'var(--coral)' }} /> Featured
                      </label>
                      <div className="hi-seg" style={{ marginLeft: 'auto' }}>
                        <button type="button" className={!preview ? 'on' : ''} onClick={() => setPreview(false)}>Edit</button>
                        <button type="button" className={preview ? 'on' : ''} onClick={() => setPreview(true)}>Preview</button>
                      </div>
                    </div>
                    {preview
                      ? <div className="hi-preview" dangerouslySetInnerHTML={{ __html: renderMarkdown(sel.content) }} />
                      : <textarea value={sel.content} onChange={e => update(sel.key, { content: e.target.value })} className="hi-textarea" />}
                    <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 11.5, color: 'var(--slate)' }}>Written from</span>
                      {sel.sources.map(id => { const p = pages.find(x => x.id === id); return p ? <a key={id} href={p.url} target="_blank" rel="noreferrer" className="hi-src">{pathOf(p.url)}</a> : null })}
                    </div>
                  </div>
                ) : <p style={{ color: 'var(--slate)', fontSize: 13.5 }}>Select an article to edit it.</p>}
              </div>
            </div>

            <div className="hi-bar">
              <span style={{ fontSize: 13, color: 'var(--slate)', fontWeight: 600 }}>{readyCount} of {drafts.filter(d => d.state === 'done').length} articles selected</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="hi-secondary" disabled={!readyCount} onClick={() => save('draft')}>Save as drafts</button>
                <button type="button" className="hi-primary" disabled={!readyCount} onClick={() => save('published')}>Publish</button>
              </div>
            </div>
          </div>
        )}

        {stage === 'saving' && (
          <div className="hi-fade" style={{ textAlign: 'center', paddingTop: '14vh' }}>
            <span className="hi-spin" style={{ width: 28, height: 28, borderWidth: 3 }} />
            <p style={{ marginTop: 14, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Adding articles to your Help Centre…</p>
          </div>
        )}

        {stage === 'done' && saved && (
          <div className="hi-fade" style={{ textAlign: 'center', paddingTop: '10vh' }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}><StatusMark kind="success" size={88} celebrate /></div>
            <h1 style={{ margin: '22px 0 0', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
              {saved.count} article{saved.count === 1 ? '' : 's'} {saved.status === 'published' ? 'published' : 'saved as drafts'}
            </h1>
            <p style={{ margin: '10px auto 0', maxWidth: 460, fontSize: 14.5, color: 'var(--slate)', lineHeight: 1.55 }}>
              {saved.status === 'published' ? 'They’re live in your Help Centre now.' : 'Open any of them to polish it, then publish when you’re ready.'}
              {saved.capped > 0 ? ` ${saved.capped} more didn’t fit your plan’s article limit.` : ''}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 26, flexWrap: 'wrap' }}>
              <Link href="/admin/help" className="hi-primary" style={{ textDecoration: 'none' }}>Go to Help Centre</Link>
              {saved.capped > 0 && <Link href="/admin/billing" className="hi-secondary" style={{ textDecoration: 'none' }}>See plans</Link>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ScanView({ phase, progress, pages, drafts, categories, host }: { phase: Phase; progress: number; pages: SitePage[]; drafts: Draft[]; categories: Category[]; host: string }) {
  const reading = pages.filter(p => p.state === 'reading')
  const done = pages.filter(p => p.state === 'read' || p.state === 'skipped')
  const current = reading[reading.length - 1] || [...pages].reverse().find(p => p.state === 'read') || null
  const read = pages.filter(p => p.state === 'read').length
  const writtenN = drafts.filter(d => d.state === 'done').length
  const title = phase === 'discover' ? `Finding pages on ${host}`
    : phase === 'read' ? 'Reading your pages'
    : phase === 'plan' ? 'Organising into topics'
    : 'Writing your articles'
  const sub = phase === 'discover' ? 'Looking at your sitemap and menus'
    : phase === 'read' ? `${done.length} of ${pages.length} pages · ${read} with useful content`
    : phase === 'plan' ? `Working out the questions your customers ask, from ${read} pages`
    : `${writtenN} of ${drafts.length} articles written`
  const steps: { key: Phase; label: string }[] = [{ key: 'discover', label: 'Find' }, { key: 'read', label: 'Read' }, { key: 'plan', label: 'Organise' }, { key: 'write', label: 'Write' }]
  const stepIdx = steps.findIndex(s => s.key === phase)

  return (
    <div className="hi-fade">
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <h1 key={title} className="hi-swap" style={{ margin: 0, fontSize: 'clamp(22px, 3.6vw, 30px)', fontWeight: 800, letterSpacing: '-0.022em', color: 'var(--ink)' }}>{title}</h1>
        <p key={sub.split(' ')[0] + phase} className="hi-swap" style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--slate)' }}>{sub}</p>
        <div style={{ maxWidth: 420, margin: '18px auto 0', height: 5, borderRadius: 5, background: 'color-mix(in srgb, var(--slate) 14%, transparent)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, borderRadius: 5, background: 'linear-gradient(90deg, var(--coral), color-mix(in srgb, var(--coral) 70%, #a855f7))', transition: `width .7s ${EASE}` }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginTop: 14 }}>
          {steps.map((s, i) => (
            <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: i <= stepIdx ? 'var(--ink)' : 'var(--slate)', opacity: i <= stepIdx ? 1 : 0.55, transition: `opacity .4s ${EASE}` }}>
              <span className={`hi-step${i < stepIdx ? ' done' : i === stepIdx ? ' now' : ''}`}>
                {i < stepIdx && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
              </span>
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {(phase === 'discover' || phase === 'read') && (
        <div className="hi-scan">
          <div className="hi-stage">
            {/* Two pages waiting behind the one being read. */}
            <div className="hi-card back2" />
            <div className="hi-card back1" />
            <div key={current?.url || 'none'} className="hi-card front">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5f57' }} /><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#febc2e' }} /><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#28c840' }} />
                <span style={{ marginLeft: 8, flex: 1, minWidth: 0, fontSize: 11, color: 'var(--slate)', background: 'color-mix(in srgb, var(--slate) 9%, transparent)', borderRadius: 6, padding: '3px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {current ? `${hostOf(current.url)}${pathOf(current.url) === '/' ? '' : pathOf(current.url)}` : host}
                </span>
              </div>
              <p style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.01em', minHeight: 22, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {current?.title || (phase === 'discover' ? 'Finding pages…' : 'Opening page…')}
              </p>
              {current?.text
                ? current.text.split('\n').map(l => l.trim()).filter(l => l.length > 2).slice(0, 9).map((l, i) => {
                    const head = /^#{1,4} /.test(l)
                    return <p key={i} className="hi-text" style={{ animationDelay: `${i * 70}ms`, fontWeight: head ? 800 : 500, color: head ? 'var(--ink)' : 'var(--slate)', fontSize: head ? 12.5 : 11.5 }}>{l.replace(/^#{1,4} |^- |\*\*/g, '')}</p>
                  })
                : [92, 78, 86, 60, 84, 70, 48].map((w, i) => <div key={i} className="hi-line" style={{ width: `${w}%`, animationDelay: `${i * 90}ms` }} />)}
              <div className="hi-beam" />
            </div>
          </div>
          <div className="hi-feed">
            {pages.length === 0 && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)' }}>Waiting for the page list…</p>}
            {[...pages].sort((a, b) => order(a.state) - order(b.state)).slice(0, 14).map(p => (
              <div key={p.url} className="hi-feed-row">
                <span className={`hi-dot ${p.state}`}>
                  {p.state === 'read' && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: p.state === 'skipped' ? 'var(--slate)' : 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title || pathOf(p.url)}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.state === 'read' ? `${p.words?.toLocaleString()} words` : p.state === 'skipped' ? (p.error || 'Skipped') : p.state === 'reading' ? 'Reading…' : pathOf(p.url)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {phase === 'plan' && (
        <div className="hi-cloud">
          {pages.filter(p => p.state === 'read').slice(0, 18).map((p, i) => (
            <span key={p.url} className="hi-float" style={{ animationDelay: `${(i % 9) * 0.35}s`, ['--dx' as any]: `${((i * 37) % 21) - 10}px` }}>{p.title || pathOf(p.url)}</span>
          ))}
          <div className="hi-core"><span /><span /><span /></div>
        </div>
      )}

      {phase === 'write' && (
        <div className="hi-topics">
          {categories.map((c, ci) => {
            const list = drafts.filter(d => d.category === c.name)
            if (!list.length) return null
            return (
              <div key={c.name} className="hi-topic" style={{ animationDelay: `${ci * 90}ms` }}>
                <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{c.name}</p>
                {list.map(d => (
                  <div key={d.key} className={`hi-art ${d.state}`}>
                    <span className={`hi-dot ${d.state === 'done' ? 'read' : d.state === 'writing' ? 'reading' : d.state === 'failed' ? 'skipped' : 'queued'}`}>
                      {d.state === 'done' && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: d.state === 'pending' ? 'var(--slate)' : 'var(--ink)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const order = (s: PageState) => s === 'reading' ? 0 : s === 'read' ? 1 : s === 'skipped' ? 2 : 3

const CSS = `
.hi-fade{animation:hiFade .55s ${EASE} both}
.hi-swap{animation:hiSwap .45s ${EASE} both}
@keyframes hiFade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes hiSwap{from{opacity:0;transform:translateY(6px);filter:blur(4px)}to{opacity:1;transform:none;filter:none}}
.hi-orb{width:76px;height:76px;margin:0 auto;border-radius:24px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--coral),color-mix(in srgb,var(--coral) 55%,#a855f7));box-shadow:0 18px 40px color-mix(in srgb,var(--coral) 35%,transparent);animation:hiOrb 4s ease-in-out infinite}
@keyframes hiOrb{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-6px) rotate(-3deg)}}
.hi-field{display:flex;align-items:center;gap:10px;max-width:600px;background:#fff;border:1px solid var(--border);border-radius:18px;padding:8px 8px 8px 16px;box-shadow:0 10px 30px rgba(15,23,42,.08);transition:box-shadow .25s ease,border-color .25s ease}
.hi-field input,.hi-field input:focus{border:none!important;box-shadow:none!important;outline:none!important;padding:6px 0!important}
.hi-text{margin:0 0 7px;line-height:1.45;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;animation:hiFade .45s ${EASE} both}
.hi-field:focus-within{border-color:color-mix(in srgb,var(--coral) 55%,var(--border));box-shadow:0 0 0 4px color-mix(in srgb,var(--coral) 14%,transparent),0 12px 34px rgba(15,23,42,.1)}
.hi-primary{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:11px 20px;border-radius:13px;border:none;background:var(--coral);color:#fff;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap;font-family:inherit;transition:transform .15s ${EASE},opacity .2s ease,box-shadow .2s ease;box-shadow:0 6px 16px color-mix(in srgb,var(--coral) 30%,transparent)}
.hi-primary:hover{transform:translateY(-1px)}.hi-primary:active{transform:scale(.97)}.hi-primary:disabled{opacity:.45;cursor:default;transform:none}
.hi-secondary{display:inline-flex;align-items:center;justify-content:center;padding:11px 18px;border-radius:13px;border:1px solid var(--border);background:#fff;color:var(--ink);font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap;font-family:inherit;transition:transform .15s ${EASE},background .2s ease}
.hi-secondary:hover{background:#fafafa}.hi-secondary:active{transform:scale(.97)}.hi-secondary:disabled{opacity:.45;cursor:default}
.hi-ghost{border:none;background:none;color:var(--slate);font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit}
.hi-link{border:none;background:none;color:var(--coral);font-size:12px;font-weight:700;cursor:pointer;padding:0;font-family:inherit}
.hi-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:20px;background:#fff;border:1px solid var(--border);font-size:12.5px;font-weight:600;color:var(--ink);animation:hiFade .5s ${EASE} both}
.hi-step{width:14px;height:14px;border-radius:50%;border:1.5px solid color-mix(in srgb,var(--slate) 45%,transparent);display:inline-flex;align-items:center;justify-content:center;transition:all .35s ${EASE}}
.hi-step.now{border-color:var(--coral);box-shadow:0 0 0 4px color-mix(in srgb,var(--coral) 16%,transparent);animation:hiPulse 1.6s ease-in-out infinite}
.hi-step.done{background:var(--coral);border-color:var(--coral)}
@keyframes hiPulse{0%,100%{box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 18%,transparent)}50%{box-shadow:0 0 0 7px color-mix(in srgb,var(--coral) 6%,transparent)}}
.hi-scan{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:22px;align-items:start}
@media (max-width: 760px){.hi-scan{grid-template-columns:minmax(0,1fr)}}
.hi-stage{position:relative;height:300px}
.hi-card{position:absolute;inset:0;background:#fff;border:1px solid var(--border);border-radius:20px;padding:16px 18px;overflow:hidden}
.hi-card.back2{transform:translateY(22px) scale(.9);opacity:.45;box-shadow:0 4px 14px rgba(15,23,42,.05)}
.hi-card.back1{transform:translateY(11px) scale(.95);opacity:.75;box-shadow:0 6px 18px rgba(15,23,42,.06)}
.hi-card.front{box-shadow:0 22px 50px rgba(15,23,42,.12);animation:hiCardIn .6s ${EASE} both}
@keyframes hiCardIn{from{opacity:0;transform:translateY(26px) scale(.94)}to{opacity:1;transform:none}}
.hi-line{height:9px;border-radius:6px;margin:0 0 11px;background:linear-gradient(90deg,color-mix(in srgb,var(--slate) 12%,transparent),color-mix(in srgb,var(--slate) 20%,transparent),color-mix(in srgb,var(--slate) 12%,transparent));background-size:200% 100%;animation:hiShimmer 1.6s linear infinite,hiFade .5s ${EASE} both}
@keyframes hiShimmer{from{background-position:200% 0}to{background-position:-200% 0}}
.hi-beam{position:absolute;left:0;right:0;top:0;height:70px;background:linear-gradient(180deg,transparent,color-mix(in srgb,var(--coral) 14%,transparent) 60%,color-mix(in srgb,var(--coral) 45%,transparent) 96%,transparent);border-bottom:2px solid color-mix(in srgb,var(--coral) 70%,transparent);animation:hiBeam 2.2s ${EASE} infinite;pointer-events:none}
@keyframes hiBeam{0%{transform:translateY(-80px)}100%{transform:translateY(310px)}}
.hi-feed{background:#fff;border:1px solid var(--border);border-radius:20px;padding:10px;max-height:300px;overflow:hidden;-webkit-mask-image:linear-gradient(180deg,#000 82%,transparent);mask-image:linear-gradient(180deg,#000 82%,transparent)}
.hi-feed-row{display:flex;align-items:center;gap:10px;padding:7px 6px;border-radius:10px;animation:hiFade .45s ${EASE} both}
.hi-dot{width:16px;height:16px;flex-shrink:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;transition:all .35s ${EASE}}
.hi-dot.queued{border:1.5px solid color-mix(in srgb,var(--slate) 35%,transparent)}
.hi-dot.reading{border:2px solid color-mix(in srgb,var(--coral) 25%,transparent);border-top-color:var(--coral);animation:hiSpin .8s linear infinite}
.hi-dot.read{background:#22c55e;animation:hiPop .4s ${EASE} both}
.hi-dot.skipped{background:color-mix(in srgb,var(--slate) 25%,transparent)}
@keyframes hiPop{0%{transform:scale(.4)}70%{transform:scale(1.15)}100%{transform:scale(1)}}
@keyframes hiSpin{to{transform:rotate(360deg)}}
.hi-spin{display:inline-block;width:14px;height:14px;border-radius:50%;border:2px solid color-mix(in srgb,var(--coral) 25%,transparent);border-top-color:var(--coral);animation:hiSpin .8s linear infinite;flex-shrink:0}
.hi-cloud{position:relative;min-height:320px;display:flex;flex-wrap:wrap;justify-content:center;align-content:center;gap:10px;padding:20px 0}
.hi-float{padding:7px 13px;border-radius:20px;background:#fff;border:1px solid var(--border);font-size:12.5px;font-weight:600;color:var(--ink);box-shadow:0 6px 16px rgba(15,23,42,.06);animation:hiDrift 3.2s ease-in-out infinite,hiFade .6s ${EASE} both;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@keyframes hiDrift{0%,100%{transform:translate(0,0)}50%{transform:translate(var(--dx),-8px)}}
.hi-core{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:0;height:0;pointer-events:none}
.hi-core span{position:absolute;left:-90px;top:-90px;width:180px;height:180px;border-radius:50%;border:1.5px solid color-mix(in srgb,var(--coral) 30%,transparent);animation:hiRing 3s ${EASE} infinite}
.hi-core span:nth-child(2){animation-delay:1s}.hi-core span:nth-child(3){animation-delay:2s}
@keyframes hiRing{0%{transform:scale(.3);opacity:.9}100%{transform:scale(2.4);opacity:0}}
.hi-topics{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}
.hi-topic{background:#fff;border:1px solid var(--border);border-radius:18px;padding:14px 16px;box-shadow:0 6px 18px rgba(15,23,42,.05);animation:hiCardIn .55s ${EASE} both}
.hi-art{display:flex;align-items:center;gap:9px;padding:5px 0;transition:opacity .3s ease}
.hi-art.writing span:last-child{background:linear-gradient(90deg,var(--ink) 40%,color-mix(in srgb,var(--ink) 35%,transparent) 50%,var(--ink) 60%);background-size:250% 100%;-webkit-background-clip:text;background-clip:text;color:transparent!important;animation:hiShimmer 1.4s linear infinite}
.hi-review{display:grid;grid-template-columns:320px minmax(0,1fr);gap:16px;align-items:start}
@media (max-width: 860px){.hi-review{grid-template-columns:minmax(0,1fr)}}
.hi-list{background:#fff;border:1px solid var(--border);border-radius:18px;padding:12px;max-height:calc(100vh - 230px);overflow-y:auto;position:sticky;top:12px}
@media (max-width: 860px){.hi-list{position:static;max-height:none}}
.hi-row{display:flex;align-items:center;gap:9px;padding:8px 8px;border-radius:10px;cursor:pointer;transition:background .18s ease}
.hi-row:hover{background:color-mix(in srgb,var(--slate) 6%,transparent)}
.hi-row.on{background:var(--peach)}
.hi-editor{background:#fff;border:1px solid var(--border);border-radius:18px;padding:20px 22px;min-height:420px}
.hi-select{padding:7px 10px;border-radius:9px;border:1px solid var(--border);background:#fff;font-size:12.5px;font-weight:600;color:var(--ink);font-family:inherit}
.hi-seg{display:inline-flex;padding:3px;border-radius:10px;background:color-mix(in srgb,var(--slate) 10%,transparent)}
.hi-seg button{border:none;background:none;padding:5px 12px;border-radius:8px;font-size:12px;font-weight:700;color:var(--slate);cursor:pointer;font-family:inherit;transition:background .2s ease,color .2s ease,box-shadow .2s ease}
.hi-seg button.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.1)}
.hi-textarea{width:100%;min-height:420px;border:1px solid var(--border);border-radius:12px;padding:14px;font-size:13.5px;line-height:1.65;color:var(--ink);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical;outline:none;box-sizing:border-box}
.hi-textarea:focus{border-color:color-mix(in srgb,var(--coral) 50%,var(--border))}
.hi-preview{font-size:14.5px;line-height:1.7;color:var(--ink)}
.hi-preview h2{font-size:18px;margin:20px 0 8px}.hi-preview h3{font-size:15.5px;margin:16px 0 6px}.hi-preview ul,.hi-preview ol{padding-left:20px}.hi-preview a{color:var(--coral)}
.hi-src{font-size:11.5px;font-weight:600;color:var(--coral);background:var(--peach);padding:2px 8px;border-radius:20px;text-decoration:none;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hi-bar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);width:min(760px,calc(100vw - 32px));display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:10px 10px 10px 18px;border-radius:18px;background:rgba(255,255,255,.86);backdrop-filter:saturate(180%) blur(18px);-webkit-backdrop-filter:saturate(180%) blur(18px);border:1px solid var(--border);box-shadow:0 18px 40px rgba(15,23,42,.14);z-index:30;animation:hiBar .5s ${EASE} both}
@keyframes hiBar{from{opacity:0;transform:translate(-50%,16px)}to{opacity:1;transform:translate(-50%,0)}}
@media (prefers-reduced-motion: reduce){.hi-root *{animation-duration:.001s!important;animation-iteration-count:1!important;transition:none!important}}
`
