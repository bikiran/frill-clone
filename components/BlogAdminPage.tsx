'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { renderMarkdown } from '@/lib/markdown'

// Super-admin blog CMS: list, create, edit, publish/unpublish and delete the
// posts that power colvy.com/blog (blog_posts table, written via the service-role
// API). Matches the console's --sa-* dark chrome.

type Post = {
  id?: string; slug?: string; title?: string; excerpt?: string; content?: string
  cover_url?: string | null; category?: string; author_name?: string; accent?: string
  icon?: string; seo_title?: string | null; seo_description?: string | null
  status?: string; published_at?: string | null; updated_at?: string
  // Built-in article from lib/blog (live on the public blog, not in the DB).
  // Editing one saves a DB copy that overrides it by slug.
  seed?: boolean
}

const CORAL = '#ff6a4d'
const CATEGORIES = ['Playbooks', 'Buyer’s guide', 'Customer support', 'Growth', 'Product', 'Company']
const ICONS = ['inbox', 'bolt', 'star', 'chat', 'phone', 'idea', 'target', 'shield']

const blank = (): Post => ({ title: '', slug: '', excerpt: '', content: '', category: 'Playbooks', author_name: 'The Colvy Team', accent: CORAL, icon: 'inbox', status: 'draft' })

const slugify = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)

async function authed(url: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession()
  return fetch(url, { ...init, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}`, ...(init?.headers || {}) } })
}

const label: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--sa-muted)', margin: '0 0 5px' }
const input: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--sa-border)', background: 'var(--sa-bg)', color: 'var(--sa-text)', fontSize: 13.5, boxSizing: 'border-box' }

export default function BlogAdminPage() {
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState<Post | null>(null)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(false)
  const [slugTouched, setSlugTouched] = useState(false)

  const load = async () => {
    setErr('')
    try {
      const r = await authed('/api/platform-admin/blog')
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Failed to load'); setPosts([]); return }
      setMissing(!!d.missing)
      setPosts(d.posts || [])
    } catch (e: any) { setErr(e?.message || 'Failed to load'); setPosts([]) }
  }
  useEffect(() => { load() }, [])

  const startNew = () => { setEditing(blank()); setSlugTouched(false); setPreview(false); setErr('') }
  const startEdit = (p: Post) => { setEditing({ ...p }); setSlugTouched(true); setPreview(false); setErr('') }

  const save = async () => {
    if (!editing) return
    setSaving(true); setErr('')
    try {
      const post = { ...editing, slug: editing.slug || slugify(editing.title || '') }
      const r = await authed('/api/platform-admin/blog', { method: 'POST', body: JSON.stringify({ action: 'save', post }) })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Save failed'); setSaving(false); return }
      setEditing(null); await load()
    } catch (e: any) { setErr(e?.message || 'Save failed') }
    setSaving(false)
  }

  const act = async (action: string, id?: string) => {
    if (action === 'delete' && !confirm('Delete this post? This cannot be undone.')) return
    try {
      const r = await authed('/api/platform-admin/blog', { method: 'POST', body: JSON.stringify({ action, id }) })
      const d = await r.json(); if (!r.ok) { setErr(d.error || 'Action failed'); return }
      await load()
    } catch (e: any) { setErr(e?.message || 'Action failed') }
  }

  // ── Editor ────────────────────────────────────────────────────────────────
  if (editing) {
    const e = editing
    const set = (patch: Partial<Post>) => setEditing({ ...e, ...patch })
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--sa-text)', margin: 0 }}>{e.id ? 'Edit post' : 'New post'}</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setEditing(null)} style={{ padding: '9px 14px', borderRadius: 9, border: '1px solid var(--sa-border)', background: 'var(--sa-card)', color: 'var(--sa-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: CORAL, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
        {err && <div style={{ marginBottom: 14, padding: '10px 13px', borderRadius: 9, background: '#fee2e2', color: '#b91c1c', fontSize: 13 }}>{err}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 18, alignItems: 'start' }} className="blogadmin-grid">
          {/* Main column */}
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <label style={label}>Title</label>
              <input style={input} value={e.title || ''} onChange={ev => set({ title: ev.target.value, ...(slugTouched ? {} : { slug: slugify(ev.target.value) }) })} placeholder="How to…" />
            </div>
            <div>
              <label style={label}>Slug</label>
              <input style={input} value={e.slug || ''} onChange={ev => { setSlugTouched(true); set({ slug: slugify(ev.target.value) }) }} placeholder="how-to" />
              <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--sa-muted)' }}>/blog/{e.slug || slugify(e.title || '') || '…'}</p>
            </div>
            <div>
              <label style={label}>Excerpt</label>
              <textarea style={{ ...input, minHeight: 56, resize: 'vertical' }} value={e.excerpt || ''} onChange={ev => set({ excerpt: ev.target.value })} placeholder="One or two sentences shown on cards and in search." />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <label style={{ ...label, margin: 0 }}>Content (Markdown)</label>
                <button onClick={() => setPreview(v => !v)} style={{ fontSize: 12, fontWeight: 700, color: CORAL, background: 'none', border: 'none', cursor: 'pointer' }}>{preview ? 'Edit' : 'Preview'}</button>
              </div>
              {preview
                ? <div style={{ ...input, minHeight: 320, overflow: 'auto' }} className="blog-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(e.content || '') }} />
                : <textarea style={{ ...input, minHeight: 320, resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, lineHeight: 1.6 }} value={e.content || ''} onChange={ev => set({ content: ev.target.value })} placeholder={'## A heading\n\nA paragraph with **bold** and a [link](https://colvy.com).\n\n- a list item\n- another'} />}
            </div>
          </div>

          {/* Sidebar */}
          <div style={{ display: 'grid', gap: 14, padding: 16, borderRadius: 12, border: '1px solid var(--sa-border)', background: 'var(--sa-card)' }}>
            <div>
              <label style={label}>Status</label>
              <select style={input} value={e.status || 'draft'} onChange={ev => set({ status: ev.target.value })}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
            <div>
              <label style={label}>Category</label>
              <select style={input} value={e.category || 'Playbooks'} onChange={ev => set({ category: ev.target.value })}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Cover image URL</label>
              <input style={input} value={e.cover_url || ''} onChange={ev => set({ cover_url: ev.target.value })} placeholder="/blog/cover.jpg (optional)" />
              <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--sa-muted)' }}>Blank = an accent gradient tile with the icon.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={label}>Accent</label>
                <input type="color" style={{ ...input, padding: 4, height: 38 }} value={e.accent || CORAL} onChange={ev => set({ accent: ev.target.value })} />
              </div>
              <div>
                <label style={label}>Icon</label>
                <select style={input} value={e.icon || 'inbox'} onChange={ev => set({ icon: ev.target.value })}>
                  {ICONS.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={label}>Author</label>
              <input style={input} value={e.author_name || ''} onChange={ev => set({ author_name: ev.target.value })} />
            </div>
            <div>
              <label style={label}>SEO title (optional)</label>
              <input style={input} value={e.seo_title || ''} onChange={ev => set({ seo_title: ev.target.value })} placeholder="Defaults to the title" />
            </div>
            <div>
              <label style={label}>SEO description (optional)</label>
              <textarea style={{ ...input, minHeight: 52, resize: 'vertical' }} value={e.seo_description || ''} onChange={ev => set({ seo_description: ev.target.value })} placeholder="Defaults to the excerpt" />
            </div>
          </div>
        </div>
        <style>{`@media (max-width: 860px){ .blogadmin-grid{ grid-template-columns: 1fr !important; } }`}</style>
      </div>
    )
  }

  // ── List ──────────────────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--sa-text)', margin: 0 }}>Blog</h1>
          <p style={{ fontSize: 13, color: 'var(--sa-muted)', margin: '3px 0 0' }}>Write and manage colvy.com/blog articles.</p>
        </div>
        <button onClick={startNew} style={{ padding: '10px 16px', borderRadius: 9, border: 'none', background: CORAL, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ New post</button>
      </div>

      {missing && <div style={{ marginBottom: 14, padding: '11px 14px', borderRadius: 9, background: '#fef3c7', color: '#92400e', fontSize: 13 }}>The <code>blog_posts</code> table doesn’t exist yet — run <code>migrations/COLVY_V302_BLOG_POSTS.sql</code> in Supabase, then reload.</div>}
      {err && <div style={{ marginBottom: 14, padding: '10px 13px', borderRadius: 9, background: '#fee2e2', color: '#b91c1c', fontSize: 13 }}>{err}</div>}

      {posts === null ? (
        <p style={{ color: 'var(--sa-muted)', fontSize: 14 }}>Loading…</p>
      ) : posts.length === 0 ? (
        <div style={{ padding: '34px 24px', borderRadius: 12, border: '1px dashed var(--sa-border)', textAlign: 'center', color: 'var(--sa-muted)' }}>
          <p style={{ margin: 0, fontWeight: 700, color: 'var(--sa-text)' }}>No posts yet</p>
          <p style={{ margin: '4px 0 0', fontSize: 13 }}>Create your first article — it goes live on colvy.com/blog when published.</p>
        </div>
      ) : (
        <div style={{ borderRadius: 12, border: '1px solid var(--sa-border)', overflow: 'hidden' }}>
          {posts.map((p, i) => (
            <div key={p.id || `seed-${p.slug}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: i ? '1px solid var(--sa-border)' : 'none', background: 'var(--sa-card)', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--sa-text)' }}>{p.title || '(untitled)'}</div>
                <div style={{ fontSize: 12, color: 'var(--sa-muted)', marginTop: 2 }}>/{p.slug} · {p.category} · updated {p.updated_at ? new Date(p.updated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '—'}</div>
              </div>
              {p.seed
                ? <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '3px 9px', borderRadius: 999, background: '#e0e7ff', color: '#4338ca' }} title="Built-in article shipped with the site. Editing it saves an editable copy that overrides it.">Built-in · Live</span>
                : <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '3px 9px', borderRadius: 999, background: p.status === 'published' ? '#dcfce7' : '#e5e7eb', color: p.status === 'published' ? '#15803d' : '#6b7280' }}>{p.status}</span>}
              <div style={{ display: 'flex', gap: 6 }}>
                {p.status === 'published' && <a href={`/blog/${p.slug}`} target="_blank" rel="noopener" style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--sa-border)', color: 'var(--sa-text)', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>View</a>}
                {!p.seed && <button onClick={() => act(p.status === 'published' ? 'unpublish' : 'publish', p.id)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--sa-border)', background: 'var(--sa-bg)', color: 'var(--sa-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{p.status === 'published' ? 'Unpublish' : 'Publish'}</button>}
                <button onClick={() => startEdit(p)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--sa-border)', background: 'var(--sa-bg)', color: 'var(--sa-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{p.seed ? 'Edit copy' : 'Edit'}</button>
                {!p.seed && <button onClick={() => act('delete', p.id)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--sa-border)', background: 'var(--sa-bg)', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Delete</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
