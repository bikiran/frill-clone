'use client'

import { useState, useEffect, useRef } from 'react'

// A checklist item's text. Typing stays local and saves once the person pauses
// or leaves the field — saving per keystroke refreshed the whole board each
// time, and an in-flight refresh could revert letters and jump the cursor.
export default function ChecklistItemText({ value, done, onCommit }: { value: string; done: boolean; onCommit: (text: string) => void }) {
  const [draft, setDraft] = useState(value)
  const editing = useRef(false)
  const timer = useRef<any>(null)
  const latest = useRef({ value, draft, onCommit })
  latest.current = { value, draft, onCommit }
  // Take changes made elsewhere (a teammate, another tab) unless mid-edit.
  useEffect(() => { if (!editing.current) setDraft(value) }, [value])
  const flush = () => {
    clearTimeout(timer.current); timer.current = null
    const { value: v, draft: d, onCommit: commit } = latest.current
    if (d !== v) commit(d)
  }
  // Closing the task mid-word still saves it.
  useEffect(() => () => { if (timer.current) flush() }, [])
  return (
    <input value={draft}
      onFocus={() => { editing.current = true }}
      onChange={e => {
        setDraft(e.target.value); latest.current.draft = e.target.value
        clearTimeout(timer.current); timer.current = setTimeout(flush, 700)
      }}
      onBlur={() => { editing.current = false; flush() }}
      onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur() }}
      style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', fontSize: 13, background: 'transparent', color: 'var(--ink)', textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.6 : 1 }} />
  )
}
