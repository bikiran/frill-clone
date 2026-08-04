'use client'

import { useEffect, useRef, useState } from 'react'

// A lightweight discussion thread shown at the bottom of a note — the owner and
// any shared viewers can leave notes and @mention people. Works in two modes:
//   • public  : pass `code` (posts to /api/notes/public); asks a guest for a
//               name (+ optional email), remembered in localStorage.
//   • admin   : pass `noteId` + `companyId` + `authorName` (posts to /api/notes).
export type NoteComment = { id: string; name: string; email?: string; body: string; at: string }

const ago = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
const initials = (n: string) => (n || '?').trim().slice(0, 1).toUpperCase()

function Body({ text, accent }: { text: string; accent: string }) {
  // Render @mentions in the accent colour; everything else as plain text.
  const parts = text.split(/(@[\w][\w.-]*)/g)
  return <>{parts.map((p, i) => /^@[\w]/.test(p)
    ? <span key={i} style={{ color: accent, fontWeight: 700 }}>{p}</span>
    : <span key={i}>{p}</span>)}</>
}

export default function NoteComments({ code, noteId, companyId, accent = '#ff7a6b', authorName, members = [], initial = [] }: {
  code?: string; noteId?: string; companyId?: string; accent?: string
  authorName?: string; members?: { id: string; name: string }[]; initial?: NoteComment[]
}) {
  const isPublic = !!code
  const [list, setList] = useState<NoteComment[]>(Array.isArray(initial) ? initial : [])
  const [text, setText] = useState('')
  const [name, setName] = useState(authorName || '')
  const [email, setEmail] = useState('')
  const [askIdentity, setAskIdentity] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mention, setMention] = useState<{ q: string; items: { id: string; name: string }[] } | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!isPublic) return
    try { const g = JSON.parse(localStorage.getItem('colvy_guest') || 'null'); if (g?.name) { setName(g.name); setEmail(g.email || '') } } catch {}
  }, [isPublic])

  const onText = (v: string) => {
    setText(v)
    const m = v.slice(0, taRef.current?.selectionStart ?? v.length).match(/(?:^|\s)@([\w .-]*)$/)
    if (m && members.length) {
      const q = m[1].toLowerCase()
      const items = members.filter(x => x.name.toLowerCase().includes(q)).slice(0, 5)
      setMention(items.length ? { q: m[1], items } : null)
    } else setMention(null)
  }
  const pickMention = (nm: string) => {
    const el = taRef.current; if (!el) return
    const caret = el.selectionStart
    const before = text.slice(0, caret), after = text.slice(caret)
    const rep = before.replace(/@([\w .-]*)$/, `@${nm} `)
    setText(rep + after); setMention(null)
    requestAnimationFrame(() => { el.focus(); const pos = rep.length; el.setSelectionRange(pos, pos) })
  }

  const post = async () => {
    const bodyText = text.trim(); if (!bodyText || busy) return
    if (isPublic && !name.trim()) { setAskIdentity(true); return }
    setBusy(true)
    try {
      const res = isPublic
        ? await fetch('/api/notes/public', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, action: 'comment', comment: { name: name.trim(), email: email.trim(), body: bodyText } }) })
        : await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'comment', id: noteId, companyId, name: name.trim() || authorName || 'Me', body: bodyText }) })
      const d = await res.json()
      if (d.comment) { setList(l => [...l, d.comment]); setText('') }
      if (isPublic) { try { localStorage.setItem('colvy_guest', JSON.stringify({ name: name.trim(), email: email.trim() })) } catch {} }
      setAskIdentity(false)
    } catch {}
    setBusy(false)
  }

  return (
    <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border,#e5e7eb)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink,#1a1a1a)' }}>Notes</h3>
        {list.length > 0 && <span style={{ fontSize: 12, color: 'var(--slate,#6b7280)' }}>{list.length}</span>}
      </div>

      {list.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          {list.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 10 }}>
              <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%', background: accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800 }}>{initials(c.name)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink,#1a1a1a)' }}>{c.name}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--slate,#9ca3af)' }}>{ago(c.at)}</span>
                </div>
                <div style={{ fontSize: 14, color: 'var(--ink,#1a1a1a)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}><Body text={c.body} accent={accent} /></div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ position: 'relative', border: '1px solid var(--border,#e5e7eb)', borderRadius: 14, padding: 10, background: '#fff' }}>
        {isPublic && askIdentity && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Your name"
              style={{ flex: 1, minWidth: 130, padding: '8px 11px', borderRadius: 9, border: '1px solid var(--border,#e5e7eb)', fontSize: 13.5, outline: 'none' }} />
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email (optional)"
              style={{ flex: 1, minWidth: 130, padding: '8px 11px', borderRadius: 9, border: '1px solid var(--border,#e5e7eb)', fontSize: 13.5, outline: 'none' }} />
          </div>
        )}
        <textarea ref={taRef} value={text} onChange={e => onText(e.target.value)} rows={2}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); post() } }}
          placeholder={members.length ? 'Leave a note… use @ to mention someone' : 'Leave a note…'}
          style={{ width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', resize: 'vertical', fontSize: 14.5, lineHeight: 1.5, background: 'transparent', color: 'var(--ink,#1a1a1a)', fontFamily: 'inherit' }} />
        {mention && (
          <div style={{ position: 'absolute', left: 12, bottom: 46, zIndex: 30, background: '#fff', border: '1px solid var(--border,#e5e7eb)', borderRadius: 10, boxShadow: '0 12px 30px rgba(0,0,0,0.16)', padding: 5, minWidth: 170 }}>
            {mention.items.map(it => (
              <button key={it.id} type="button" onMouseDown={e => { e.preventDefault(); pickMention(it.name) }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '7px 9px', border: 'none', borderRadius: 7, background: 'transparent', color: 'var(--ink,#1a1a1a)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f4f5f7')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{initials(it.name)}</span>
                {it.name}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button onClick={post} disabled={busy || !text.trim()}
            style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: (busy || !text.trim()) ? 'var(--border,#e5e7eb)' : accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: (busy || !text.trim()) ? 'default' : 'pointer' }}>
            {busy ? 'Posting…' : 'Post note'}
          </button>
        </div>
      </div>
    </div>
  )
}
