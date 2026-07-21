'use client'

import { useState, useRef, useEffect } from 'react'

export interface Assignee { id: string; name: string }
interface Member { id: string; user_id?: string; name: string }

/**
 * A searchable multi-select for team members, styled like the chat's mention
 * picker (a search field that filters a dropdown), which reads much better than
 * a wall of toggle chips once there are more than a handful of people.
 *
 * Selected people show as removable chips above the field; typing filters the
 * dropdown; clicking adds them.
 */
export default function AssigneePicker({
  members, value, onChange, placeholder = 'Search team members…',
}: {
  members: Member[]
  value: Assignee[]
  onChange: (next: Assignee[]) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const chosenIds = new Set(value.map(v => v.id))
  const matches = members.filter(m => {
    const uid = m.user_id || m.id
    if (chosenIds.has(uid)) return false
    return !query || m.name.toLowerCase().includes(query.toLowerCase())
  })

  const add = (m: Member) => {
    onChange([...value, { id: m.user_id || m.id, name: m.name }])
    setQuery('')
    setOpen(true)
  }
  const remove = (id: string) => onChange(value.filter(v => v.id !== id))

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 7 }}>
          {value.map(a => (
            <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 6px 4px 11px', borderRadius: 20, background: 'var(--peach)', color: 'var(--coral)', fontSize: 12.5, fontWeight: 700 }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 800 }}>
                {a.name.charAt(0).toUpperCase()}
              </span>
              {a.name}
              <button type="button" onClick={() => remove(a.id)}
                style={{ border: 'none', background: 'none', padding: 0, color: 'var(--coral)', cursor: 'pointer', display: 'flex' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </span>
          ))}
        </div>
      )}

      <div style={{ position: 'relative' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--slate)', pointerEvents: 'none' }}>
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={value.length ? 'Add another…' : placeholder}
          style={{ width: '100%', padding: '9px 12px 9px 33px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box' }}
        />
      </div>

      {open && matches.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 50,
          background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 10px 28px rgba(0,0,0,0.14)', maxHeight: 240, overflowY: 'auto',
        }}>
          {matches.map(m => (
            <button key={m.id} type="button" onClick={() => add(m)}
              style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', cursor: 'pointer', fontSize: 13.5, background: '#fff', color: 'var(--ink)' }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                {m.name.charAt(0).toUpperCase()}
              </span>
              {m.name}
            </button>
          ))}
        </div>
      )}

      {open && matches.length === 0 && query && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 50, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, color: 'var(--slate)' }}>
          No matches
        </div>
      )}
    </div>
  )
}
