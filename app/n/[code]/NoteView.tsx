'use client'

import { useEffect, useRef, useState } from 'react'
import RichTextEditor from '@/components/RichTextEditor'

type ChecklistItem = { id: string; text: string; done: boolean }
type EditEntry = { name: string; email?: string; at: string }
const rid = () => Math.random().toString(36).slice(2, 9)
const ago = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Renders a shared note's body + checklist. When the owner allowed it, viewers
// can edit — but first they identify themselves (name + optional email), which
// is logged with each contribution so the owner sees who changed what.
export default function NoteView({ code, accent, allowEdit, initialBody, initialChecklist, editLog = [] }: {
  code: string; accent: string; allowEdit: boolean; initialBody: string; initialChecklist: ChecklistItem[]; editLog?: EditEntry[]
}) {
  const [body, setBody] = useState(initialBody || '')
  const [checklist, setChecklist] = useState<ChecklistItem[]>(Array.isArray(initialChecklist) ? initialChecklist : [])
  const [status, setStatus] = useState('')
  const [log, setLog] = useState<EditEntry[]>(Array.isArray(editLog) ? editLog : [])
  const [identity, setIdentity] = useState<{ name: string; email: string } | null>(null)
  const [ask, setAsk] = useState(false)
  const [nm, setNm] = useState('')
  const [em, setEm] = useState('')
  const timer = useRef<any>(null)
  const pending = useRef<{ body: string; list: ChecklistItem[] } | null>(null)

  useEffect(() => {
    try { const g = JSON.parse(localStorage.getItem('colvy_guest') || 'null'); if (g?.name) { setIdentity(g); setNm(g.name); setEm(g.email || '') } } catch {}
    return () => clearTimeout(timer.current)
  }, [])

  const flush = (who: { name: string; email: string }) => {
    const p = pending.current; if (!p) return
    setStatus('Saving…')
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/notes/public', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, body: p.body, checklist: p.list, editor: who }) })
        if (res.ok) { setStatus('Saved'); setLog(l => { const last = l[l.length - 1]; const e = { name: who.name, email: who.email, at: new Date().toISOString() }; return (last && last.name === who.name && last.email === who.email) ? [...l.slice(0, -1), e] : [...l, e] }) }
        else setStatus('Couldn’t save')
      } catch { setStatus('Couldn’t save') }
      setTimeout(() => setStatus(''), 1600)
    }, 700)
  }

  const save = (nextBody: string, nextList: ChecklistItem[]) => {
    if (!allowEdit) return
    pending.current = { body: nextBody, list: nextList }
    if (!identity) { setAsk(true); return }
    flush(identity)
  }
  const submitIdentity = () => {
    if (!nm.trim()) return
    const who = { name: nm.trim(), email: em.trim() }
    setIdentity(who); setAsk(false)
    try { localStorage.setItem('colvy_guest', JSON.stringify(who)) } catch {}
    flush(who)
  }

  const setB = (html: string) => { setBody(html); save(html, checklist) }
  const setL = (next: ChecklistItem[]) => { setChecklist(next); save(body, next) }
  const done = checklist.filter(c => c.done).length
  const lastEdit = log[log.length - 1]

  if (!allowEdit) {
    return (
      <>
        {body ? <div className="note-body" dangerouslySetInnerHTML={{ __html: body }} />
          : <p style={{ color: '#9ca3af', fontSize: 15 }}>This note has no text yet.</p>}
        {checklist.length > 0 && (
          <div style={{ marginTop: 22 }}>
            {checklist.map(c => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', fontSize: 15.5, color: c.done ? '#9ca3af' : '#1a1a1a' }}>
                <input type="checkbox" checked={c.done} readOnly style={{ width: 17, height: 17, accentColor: accent }} />
                <span style={{ textDecoration: c.done ? 'line-through' : 'none' }}>{c.text}</span>
              </label>
            ))}
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 14px', padding: '8px 12px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', fontSize: 13, fontWeight: 600, flexWrap: 'wrap' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        {identity ? <>You’re editing as <strong>{identity.name}</strong> — changes save automatically.</> : <>You can edit this note — changes save automatically.</>}
        <span style={{ marginLeft: 'auto', color: '#6b7280', fontWeight: 500 }}>{status}</span>
      </div>

      {lastEdit && (
        <p style={{ margin: '0 0 12px', fontSize: 12, color: '#9ca3af' }}>Last edited by {lastEdit.name} · {ago(lastEdit.at)}{log.length > 1 ? ` · ${log.length} contributions` : ''}</p>
      )}

      <RichTextEditor value={body} onChange={setB} placeholder="Start writing…" />

      <div style={{ marginTop: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#1a1a1a' }}>Checklist</h3>
          {checklist.length > 0 && <span style={{ fontSize: 12, color: '#6b7280' }}>{done}/{checklist.length}</span>}
        </div>
        {checklist.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '3px 0' }}>
            <input type="checkbox" checked={c.done} onChange={() => setL(checklist.map(x => x.id === c.id ? { ...x, done: !x.done } : x))} style={{ width: 17, height: 17, accentColor: accent, flexShrink: 0 }} />
            <input value={c.text} onChange={e => setL(checklist.map(x => x.id === c.id ? { ...x, text: e.target.value } : x))} placeholder="List item"
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, color: c.done ? '#9ca3af' : '#1a1a1a', textDecoration: c.done ? 'line-through' : 'none', background: 'transparent' }} />
            <button onClick={() => setL(checklist.filter(x => x.id !== c.id))} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 17 }}>×</button>
          </div>
        ))}
        <button onClick={() => setL([...checklist, { id: rid(), text: '', done: false }])} style={{ marginTop: 6, background: 'none', border: 'none', color: accent, fontSize: 14, fontWeight: 700, cursor: 'pointer', padding: 0 }}>+ Add item</button>
      </div>

      {ask && (
        <div onMouseDown={e => { if (e.target === e.currentTarget) setAsk(false) }}
          style={{ position: 'fixed', inset: 0, zIndex: 100200, background: 'rgba(17,17,17,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ width: 'min(430px, 100%)', background: '#fff', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.28)', padding: 22 }}>
            <p style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: '#1a1a1a' }}>Before you edit</p>
            <p style={{ margin: '0 0 14px', fontSize: 13.5, color: '#6b7280' }}>Add your name so the owner knows who contributed. Your changes are logged.</p>
            <input autoFocus value={nm} onChange={e => setNm(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submitIdentity() }} placeholder="Your name"
              style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14.5, outline: 'none', marginBottom: 9 }} />
            <input value={em} onChange={e => setEm(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submitIdentity() }} placeholder="Email (optional)"
              style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14.5, outline: 'none' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button onClick={() => setAsk(false)} style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button onClick={submitIdentity} style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: accent, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Start editing</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
