'use client'

import { useEffect, useRef, useState } from 'react'
import RichTextEditor from '@/components/RichTextEditor'

type ChecklistItem = { id: string; text: string; done: boolean }
const rid = () => Math.random().toString(36).slice(2, 9)

// Renders a shared note's body + checklist. When the owner allowed it, viewers
// can edit and their changes autosave back through the public API.
export default function NoteView({ code, accent, allowEdit, initialBody, initialChecklist }: {
  code: string; accent: string; allowEdit: boolean; initialBody: string; initialChecklist: ChecklistItem[]
}) {
  const [body, setBody] = useState(initialBody || '')
  const [checklist, setChecklist] = useState<ChecklistItem[]>(Array.isArray(initialChecklist) ? initialChecklist : [])
  const [status, setStatus] = useState('')
  const timer = useRef<any>(null)

  const save = (nextBody: string, nextList: ChecklistItem[]) => {
    if (!allowEdit) return
    setStatus('Saving…')
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/notes/public', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, body: nextBody, checklist: nextList }) })
        setStatus(res.ok ? 'Saved' : 'Couldn’t save')
      } catch { setStatus('Couldn’t save') }
      setTimeout(() => setStatus(''), 1600)
    }, 700)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  const setB = (html: string) => { setBody(html); save(html, checklist) }
  const setL = (next: ChecklistItem[]) => { setChecklist(next); save(body, next) }
  const done = checklist.filter(c => c.done).length

  if (!allowEdit) {
    return (
      <>
        {body ? (
          <div className="note-body" dangerouslySetInnerHTML={{ __html: body }} />
        ) : <p style={{ color: '#9ca3af', fontSize: 15 }}>This note has no text yet.</p>}
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 14px', padding: '8px 12px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', fontSize: 13, fontWeight: 600 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        You can edit this note — changes save automatically.
        <span style={{ marginLeft: 'auto', color: '#6b7280', fontWeight: 500 }}>{status}</span>
      </div>

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
    </>
  )
}
