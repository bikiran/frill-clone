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
  /** Leave the field's look to `className` (no built-in padding/border). */
  unstyled?: boolean
  id?: string
  ariaLabel?: string
}

/**
 * "@everyone" names the whole team at once, like a group chat. It's a word of
 * its own (start of the text or after a space / bracket, not glued to a
 * following letter), so "@everyones" or an email address isn't one.
 */
export const EVERYONE_HANDLE = 'everyone'
const EVERYONE_RE = /(^|[\s(])@everyone(?![\w])/i
export function mentionsEveryone(text: string): boolean {
  return EVERYONE_RE.test(String(text || ''))
}

/** Does a half-typed "@token" fit "everyone"? (An empty token does.) */
export function everyoneMatches(query: string | null | undefined): boolean {
  return query != null && EVERYONE_HANDLE.startsWith(String(query).toLowerCase())
}

/** Everyone named with @ in the text, matched against the team list. "@everyone" is the whole list. */
export function resolveMentions(text: string, team: TeamMember[]): TeamMember[] {
  if (!text) return []
  if (mentionsEveryone(text)) {
    const seen = new Set<string>()
    return team.filter(m => {
      if (!m?.name || !m.id || seen.has(m.id)) return false
      seen.add(m.id)
      return true
    })
  }
  const found: TeamMember[] = []
  // Longest names first, each match used up, so "@Amit Panta" doesn't also
  // count as "@Amit" (the app's rule).
  let rest = text
  for (const m of [...team].filter(x => x?.name).sort((a, b) => b.name.length - a.name.length)) {
    // "@Name" (spaces allowed, as in "Jane Smith") that starts the text or
    // follows a space / bracket, so an email like bob@amit.com isn't a
    // mention, and isn't glued to a following letter or digit.
    const escaped = m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(^|[\\s(])@${escaped}(?![\\w])`, 'i')
    if (re.test(rest)) { found.push(m); rest = rest.replace(re, '$1 ') }
  }
  return found
}

const MentionInput = forwardRef<HTMLTextAreaElement | HTMLInputElement, Props>(function MentionInput(
  { value, onChange, team, placeholder, multiline, rows = 3, style, className, onSubmit, disabled, autoFocus, unstyled, id, ariaLabel },
  forwardedRef
) {
  const innerRef = useRef<any>(null)
  const ref = (forwardedRef as any) || innerRef
  const wrapRef = useRef<HTMLDivElement | null>(null)

  const [query, setQuery] = useState<string | null>(null)
  const [index, setIndex] = useState(0)

  const people = query === null ? [] : team.filter(m =>
    (m.name || '').toLowerCase().includes(query.toLowerCase())).slice(0, 6)
  // "@everyone" leads the list while the token still fits it, once there's
  // more than one person to tell.
  const withEveryone = team.length > 1 && everyoneMatches(query)
  const matches: (TeamMember & { everyone?: boolean })[] = withEveryone
    ? [{ id: '__everyone', name: EVERYONE_HANDLE, everyone: true }, ...people]
    : people

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
    if (at !== 0 && !/[\s(]/.test(charBefore)) { setQuery(null); return }
    const fragment = before.slice(at + 1)
    // A newline or a second @ means they've moved on.
    if (/[\n@]/.test(fragment)) { setQuery(null); return }
    setQuery(fragment)
    setIndex(0)
  }

  const apply = (m: TeamMember & { everyone?: boolean }) => {
    const el = ref.current
    const caret = el?.selectionStart ?? value.length
    const before = value.slice(0, caret)
    const at = before.lastIndexOf('@')
    if (at === -1) return
    const handle = m.everyone ? EVERYONE_HANDLE : m.name
    const next = value.slice(0, at) + `@${handle} ` + value.slice(caret)
    onChange(next, resolveMentions(next, team))
    setQuery(null)
    // Put the caret after the inserted name.
    requestAnimationFrame(() => {
      const pos = at + handle.length + 2
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
    // A multi-line field sends with ⌘ / Ctrl + Enter (Enter is a new line).
    if (onSubmit && multiline && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault(); onSubmit()
    }
  }

  const baseStyle: React.CSSProperties = unstyled ? { ...style } : {
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
          placeholder={placeholder} className={className} style={baseStyle} id={id} aria-label={ariaLabel}
        />
      ) : (
        <input
          ref={ref} value={value} disabled={disabled} autoFocus={autoFocus}
          onChange={e => handleChange(e.target.value)} onKeyDown={onKeyDown}
          placeholder={placeholder} className={className} style={baseStyle} id={id} aria-label={ariaLabel}
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
              {m.everyone ? <EveryoneRow count={team.length} /> : (
                <>
                  <span style={{ width: 25, height: 25, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                    {(m.name || '?').charAt(0).toUpperCase()}
                  </span>
                  {m.name}
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
})

/** The "@everyone" row in a mention picker: a group icon, the handle, and who it reaches. */
export function EveryoneRow({ count, size = 25 }: { count: number; size?: number }) {
  return (
    <>
      <span aria-hidden style={{ width: size, height: size, borderRadius: '50%', background: 'var(--ink, #0f1119)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width={Math.round(size * 0.56)} height={Math.round(size * 0.56)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.25 }}>
        <span style={{ fontWeight: 700 }}>@everyone</span>
        <span style={{ fontSize: 11.5, color: '#6b7280' }}>Notify the whole team{count > 1 ? ` · ${count} people` : ''}</span>
      </span>
    </>
  )
}

export default MentionInput
