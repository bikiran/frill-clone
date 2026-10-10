'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useEffect, useRef, useState } from 'react'
import RichTextEditor from '@/components/RichTextEditor'
import NoteAttachments from './NoteAttachments'
import { toPublicUrl } from '@/lib/storage-url'

// The whole item, as the app and the web editor store it — a product line
// carries its photo, SKU, price and quantity; any step can have its own photos,
// a due date and a flag. Edits here spread the item, so nothing is dropped.
type ChecklistItem = {
  id: string; text: string; done: boolean
  flagged?: boolean; due?: string | null
  attachments?: { url: string; name?: string; type?: string; kind?: string }[]
  qty?: number; image?: string; sku?: string; price?: string; productId?: number | string
}
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
        const res = await authFetch('/api/notes/public', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, body: p.body, checklist: p.list, editor: who }) })
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
            <ChecklistHead done={done} total={checklist.length} accent={accent} />
            {checklist.map(c => <ItemRow key={c.id} item={c} accent={accent} />)}
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
        <ChecklistHead done={done} total={checklist.length} accent={accent} />
        {checklist.map(c => (
          <ItemRow key={c.id} item={c} accent={accent}
            onToggle={() => setL(checklist.map(x => x.id === c.id ? { ...x, done: !x.done } : x))}
            onText={text => setL(checklist.map(x => x.id === c.id ? { ...x, text } : x))}
            onQty={qty => setL(checklist.map(x => x.id === c.id ? { ...x, qty } : x))}
            onRemove={() => setL(checklist.filter(x => x.id !== c.id))} />
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

function ChecklistHead({ done, total, accent }: { done: number; total: number; accent: string }) {
  if (!total) return null
  const pct = Math.round((done / total) * 100)
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6b7280' }}>Checklist — {done}/{total}</p>
      <div style={{ height: 5, borderRadius: 3, background: '#f1f1f3', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: accent, transition: 'width .25s' }} />
      </div>
    </div>
  )
}

function dueText(due?: string | null): { text: string; overdue: boolean } | null {
  if (!due) return null
  const d = new Date(due); if (isNaN(d.getTime())) return null
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((day(d) - day(new Date())) / 86400000)
  if (days === 0) return { text: 'Due today', overdue: false }
  if (days === 1) return { text: 'Due tomorrow', overdue: false }
  if (days === -1) return { text: 'Due yesterday', overdue: true }
  if (days < 0) return { text: `Due ${-days} days ago`, overdue: true }
  return { text: `Due ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`, overdue: false }
}

// One checklist step, as rich as the editor shows it: product photo, name, SKU
// and price, quantity, due date, flag, and the step's own photos underneath.
// Read-only unless handlers are passed (the owner allowed contributions).
function ItemRow({ item: c, accent, onToggle, onText, onQty, onRemove }: {
  item: ChecklistItem; accent: string
  onToggle?: () => void; onText?: (t: string) => void; onQty?: (q: number) => void; onRemove?: () => void
}) {
  const editable = !!onToggle
  const media = (Array.isArray(c.attachments) ? c.attachments : []).filter(a => a?.url)
  const due = dueText(c.due)
  const isProduct = !!(c.productId || c.image || c.qty != null)
  const qty = c.qty ?? 1
  const meta = [c.sku ? `SKU ${c.sku}` : '', c.price || ''].filter(Boolean).join(' · ')
  const qtyBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: accent, fontSize: 17, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }
  return (
    <div style={{ border: '1px solid #ececef', borderRadius: 14, padding: '10px 12px', marginBottom: 8, background: c.done ? '#fafafa' : '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <input type="checkbox" checked={c.done} readOnly={!editable} onChange={onToggle}
          style={{ width: 19, height: 19, accentColor: accent, flexShrink: 0, cursor: editable ? 'pointer' : 'default' }} />
        {c.image ? <img src={c.image} alt="" style={{ width: 48, height: 48, borderRadius: 9, objectFit: 'cover', flexShrink: 0, background: '#f4f4f5' }} /> : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          {editable
            ? <input value={c.text} onChange={e => onText?.(e.target.value)} placeholder="List item"
                style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15.5, color: c.done ? '#9ca3af' : '#1a1a1a', textDecoration: c.done ? 'line-through' : 'none', background: 'transparent', padding: 0 }} />
            : <div style={{ fontSize: 15.5, lineHeight: 1.35, color: c.done ? '#9ca3af' : '#1a1a1a', textDecoration: c.done ? 'line-through' : 'none', wordBreak: 'break-word' }}>{c.text}</div>}
          {(meta || due || c.flagged) ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 }}>
              {meta ? <span style={{ fontSize: 12.5, color: '#6b7280' }}>{meta}</span> : null}
              {due ? <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: due.overdue ? '#fef2f2' : '#f1f5f9', color: due.overdue ? '#dc2626' : '#475569' }}>{due.text}</span> : null}
              {c.flagged ? <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#fff7ed', color: '#ea580c' }}>⚑ Flagged</span> : null}
            </div>
          ) : null}
        </div>
        {isProduct ? (
          editable && onQty ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <button type="button" onClick={() => onQty(Math.max(1, qty - 1))} style={{ ...qtyBtn, color: qty <= 1 ? '#d0d0d4' : accent }} aria-label="Fewer">−</button>
              <span style={{ minWidth: 18, textAlign: 'center', fontSize: 16, fontWeight: 800, color: '#1a1a1a' }}>{qty}</span>
              <button type="button" onClick={() => onQty(qty + 1)} style={qtyBtn} aria-label="More">+</button>
            </div>
          ) : (
            <span style={{ flexShrink: 0, fontSize: 14, fontWeight: 800, color: '#1a1a1a', background: '#f4f4f5', borderRadius: 8, padding: '4px 9px' }}>× {qty}</span>
          )
        ) : null}
        {onRemove ? <button onClick={onRemove} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 18, flexShrink: 0 }} aria-label="Remove">×</button> : null}
      </div>
      {media.length > 0 ? (
        <div style={{ marginTop: 9, paddingLeft: 30 }}>
          <NoteAttachments compact accent={accent} items={media.map(a => ({ url: toPublicUrl(a.url), name: a.name, type: a.type, kind: a.kind }))} />
        </div>
      ) : null}
    </div>
  )
}
