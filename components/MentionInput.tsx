'use client'

import { useState, useRef, useEffect, forwardRef } from 'react'

export interface TeamMember {
  id: string
  name: string
  email?: string | null
}

/**
 * A text input/textarea with @mention support.
 *
 * The composer grew its own mention picker first; this pulls that behaviour out
 * so any field can have it without each one reimplementing the caret maths and
 * keyboard handling. Callers get the resolved mentions back rather than having
 * to re-parse the text.
 */
interface Props {
  value: string
  onChange: (value: string, mentions: TeamMember[]) => void
  team: TeamMember[]
  placeholder?: string
  multiline?: boolean
  rows?: number
  style?: React.CSSProperties
  className?: string
  onSubmit?: () => void
  disabled?: boolean
  autoFocus?: boolean
}

/** Everyone named with @ in the text, matched against the team list. */
export function resolveMentions(text: string, team: TeamMember[]): TeamMember[] {
  if (!text) return []
  const found: TeamMember[] = []
  for (const m of team) {
    if (!m.name) continue
    // Match @Name allowing the space in "Jane Smith", stopping at punctuation.
    const escaped = m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`@${escaped}\\b`, 'i').test(text)) found.push(m)
  }
  return found
}

const MentionInput = forwardRef<HTMLTextAreaElement | HTMLInputElement, Props>(function MentionInput(
  { value, onChange, team, placeholder, multiline, rows = 3, style, className, onSubmit, disabled, autoFocus },
  forwardedRef
) {
  const innerRef = useRef<any>(null)
  const ref = (forwardedRef as any) || innerRef
  const wrapRef = useRef<HTMLDivElement | null>(null)

  const [query, setQuery] = useState<string | null>(null)
  const [index, setIndex] = useState(0)

  const matches = query === null ? [] : team.filter(m =>
    (m.name || '').toLowerCase().includes(query.toLowerCase())).slice(0, 6)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setQuery(null)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const handleChange = (text: string) => {
    onChange(text, resolveMentions(text, team))

    // Look backwards from the caret for an unfinished @word.
    const el = ref.current
    const caret = el?.selectionStart ?? text.length
    const before = text.slice(0, caret)
    const at = before.lastIndexOf('@')
    if (at === -1) { setQuery(null); return }
    // Only treat it as a mention if @ starts a word.
    const charBefore = at > 0 ? before[at - 1] : ' '
    if (!/\s|^/.test(charBefore) && at !== 0) { setQuery(null); return }
    const fragment = before.slice(at + 1)
    // A newline or a second @ means they've moved on.
    if (/[\n@]/.test(fragment)) { setQuery(null); return }
    setQuery(fragment)
    setIndex(0)
  }

  const apply = (m: TeamMember) => {
    const el = ref.current
    const caret = el?.selectionStart ?? value.length
    const before = value.slice(0, caret)
    const at = before.lastIndexOf('@')
    if (at === -1) return
    const next = value.slice(0, at) + `@${m.name} ` + value.slice(caret)
    onChange(next, resolveMentions(next, team))
    setQuery(null)
    // Put the caret after the inserted name.
    requestAnimationFrame(() => {
      const pos = at + m.name.length + 2
      try { el?.setSelectionRange(pos, pos); el?.focus() } catch {}
    })
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (query !== null && matches.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => (i + 1) % matches.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => (i - 1 + matches.length) % matches.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); apply(matches[index]); return }
      if (e.key === 'Escape') { setQuery(null); return }
    }
    if (onSubmit && e.key === 'Enter' && !e.shiftKey && !multiline) {
      e.preventDefault(); onSubmit()
    }
  }

  const baseStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 9,
    border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box',
    fontFamily: 'inherit', resize: multiline ? 'vertical' : 'none',
    ...style,
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {multiline ? (
        <textarea
          ref={ref} value={value} rows={rows} disabled={disabled} autoFocus={autoFocus}
          onChange={e => handleChange(e.target.value)} onKeyDown={onKeyDown}
          placeholder={placeholder} className={className} style={baseStyle}
        />
      ) : (
        <input
          ref={ref} value={value} disabled={disabled} autoFocus={autoFocus}
          onChange={e => handleChange(e.target.value)} onKeyDown={onKeyDown}
          placeholder={placeholder} className={className} style={baseStyle}
        />
      )}

      {query !== null && matches.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 200,
          background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 10px 28px rgba(0,0,0,0.14)', maxHeight: 220, overflowY: 'auto',
        }}>
          <p style={{ margin: 0, padding: '7px 12px 3px', fontSize: 10.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>
            Mention a team member
          </p>
          {matches.map((m, i) => (
            <button key={m.id} type="button" onClick={() => apply(m)}
              onMouseEnter={() => setIndex(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
                padding: '8px 12px', border: 'none', cursor: 'pointer', fontSize: 13,
                background: i === index ? 'var(--peach)' : '#fff', color: 'var(--ink)',
              }}>
              <span style={{ width: 25, height: 25, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                {(m.name || '?').charAt(0).toUpperCase()}
              </span>
              {m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
})

export default MentionInput
