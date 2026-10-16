'use client'

// Small presentational pieces of the public form, shared by the
// one-question-at-a-time and list layouts. Styles (ff-*) live in the page.

import type { ReactNode, Ref } from 'react'
import { OTHER_TEXT_MAX, countLine } from './form-runtime'

export function Tick({ size = 18 }: { size?: number }) {
  return (
    <svg className="ff-tick" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

/**
 * One choice row, Typeform style: a key badge (A, B, C… or Y / N), the label,
 * and a tick that is only rendered on a picked row. `blink` plays the double
 * flash before auto-advance.
 */
export function ChoiceRow({ k, label, on, blink, onClick }: {
  k: string; label: ReactNode; on: boolean; blink?: boolean; onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`ff-choice${on ? ' on' : ''}${blink ? ' ff-blink' : ''}`}>
      <span className="ff-key"><span className="ff-keyword">Key </span>{k}</span>
      <span className="ff-label">{label}</span>
      {on && <Tick />}
    </button>
  )
}

/** The inline "Type your answer" box under a picked "Other" option. */
export function OtherInput({ value, onChange, inputRef, autoFocus, invalid }: {
  value: string; onChange: (v: string) => void; inputRef?: Ref<HTMLInputElement>; autoFocus?: boolean; invalid?: boolean
}) {
  return (
    <input ref={inputRef} autoFocus={autoFocus} value={value} maxLength={OTHER_TEXT_MAX}
      onChange={e => onChange(e.target.value)}
      className="ff-input ff-other" placeholder="Type your answer" aria-label="Type your answer"
      aria-invalid={invalid || undefined} />
  )
}

/** Welcome image or video, in the question media style. */
export function MediaBlock({ url, type }: { url: string; type?: string }) {
  const style = { width: '100%', borderRadius: 10, marginBottom: 24, maxHeight: 300, objectFit: 'cover' as const, display: 'block' }
  return type === 'video'
    ? <video src={url} controls style={style} />
    : <img src={url} alt="" style={style} />
}

const lineStyle = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: '#6b6b70' } as const

/**
 * "Takes N minutes" (when shown) and "N people have filled this out" (when the
 * count is above 0). The count fades in and reserves no space beforehand.
 */
export function WelcomeMeta({ minutes, count }: { minutes: number | null; count: number | null }) {
  const people = countLine(count)
  return (
    <>
      {minutes !== null && (
        <p style={{ ...lineStyle, marginTop: 18 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
          Takes {minutes} minute{minutes === 1 ? '' : 's'}
        </p>
      )}
      {people && (
        <p className="ff-fade" style={{ ...lineStyle, marginTop: minutes !== null ? 6 : 18 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          {people}
        </p>
      )}
    </>
  )
}
