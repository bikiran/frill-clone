'use client'

import { useEffect, useState } from 'react'

export type PickedMedia = { url: string; name?: string; type?: string; kind?: string }

// Pick existing media from the company's Colvy Gallery to attach, instead of
// re-uploading. Returns the chosen items as attachments.
export default function GalleryPicker({ companyId, onClose, onPick }: {
  companyId: string | null
  onClose: () => void
  onPick: (items: PickedMedia[]) => void
}) {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!companyId) { setLoading(false); return }
    ;(async () => {
      try {
        // Go through the service-role API (same as the Gallery page) — a direct
        // browser query to media_items is blocked by RLS and comes back empty.
        const res = await fetch(`/api/media?companyId=${companyId}`)
        const d = await res.json()
        setItems(Array.isArray(d.items) ? d.items : [])
      } catch { /* empty gallery */ } finally { setLoading(false) }
    })()
  }, [companyId])

  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const filtered = q.trim() ? items.filter(i => (i.title || '').toLowerCase().includes(q.trim().toLowerCase())) : items
  const add = () => {
    const picked = items.filter(i => sel.has(i.id)).map(i => ({
      url: i.url, name: i.title || 'File',
      kind: i.kind || ((i.type || '').startsWith('video/') ? 'video' : 'image'),
      type: i.type,
    }))
    if (picked.length) onPick(picked)
    onClose()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 620, maxWidth: '96vw', maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ink)', flex: 1 }}>Choose from Gallery</h3>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
            style={{ padding: '8px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, width: 180, boxSizing: 'border-box' }} />
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', display: 'flex', padding: 4 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          {loading ? (
            <p style={{ padding: 30, textAlign: 'center', color: 'var(--slate)', fontSize: 13.5 }}>Loading your gallery…</p>
          ) : filtered.length === 0 ? (
            <p style={{ padding: 30, textAlign: 'center', color: 'var(--slate)', fontSize: 13.5 }}>{items.length === 0 ? 'Your gallery is empty.' : 'Nothing matches your search.'}</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 10 }}>
              {filtered.map(it => {
                const on = sel.has(it.id)
                const isVid = it.kind === 'video' || (it.type || '').startsWith('video/')
                return (
                  <button key={it.id} type="button" onClick={() => toggle(it.id)} title={it.title || ''}
                    style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', padding: 0, border: on ? '2px solid var(--coral)' : '1px solid var(--border)', background: '#000' }}>
                    {isVid
                      ? (it.thumbnail_url
                          ? <img src={it.thumbnail_url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <video src={it.url + '#t=0.1'} preload="metadata" muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />)
                      : <img src={it.thumbnail_url || it.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                    {isVid && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,0.6)', pointerEvents: 'none' }}>▶</span>}
                    {on && <span style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    </span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div style={{ padding: 14, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12.5, color: 'var(--slate)', flex: 1 }}>{sel.size ? `${sel.size} selected` : 'Select photos or videos to attach'}</span>
          <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 9, border: '1px solid var(--border)', background: '#fff', color: 'var(--slate)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          <button onClick={add} disabled={sel.size === 0}
            style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: sel.size ? 'var(--coral)' : '#eef0f2', color: sel.size ? '#fff' : '#9aa1ab', fontSize: 13.5, fontWeight: 700, cursor: sel.size ? 'pointer' : 'default' }}>Add{sel.size ? ` ${sel.size}` : ''}</button>
        </div>
      </div>
    </div>
  )
}
