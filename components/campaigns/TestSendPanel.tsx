'use client'

// "Send a test" to the people you choose: up to 5 email addresses or mobile
// numbers, typed or pasted (commas, new lines), or picked from yourself, your
// team and the ones you used last time. Each one shows whether it went.
// Used by the campaign wizard (email and SMS) and the email designer.

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { authFetch } from '@/lib/auth-fetch'
import { MAX_TEST_RECIPIENTS, cleanRecipient, fmtMobile, splitRecipients, type TestResult } from '@/lib/test-recipients'

type Kind = 'email' | 'sms'
type Person = { name: string; email: string; phone: string; me?: boolean }

const RECENT_MAX = 6
const recentKey = (kind: Kind, companyId: string) => `colvy:test-to:${kind}:${companyId}`
const readRecent = (kind: Kind, companyId: string): string[] => {
  try { const v = JSON.parse(localStorage.getItem(recentKey(kind, companyId)) || '[]'); return Array.isArray(v) ? v.map(String).filter(x => cleanRecipient(kind, x)).slice(0, RECENT_MAX) : [] } catch { return [] }
}
const writeRecent = (kind: Kind, companyId: string, list: string[]) => {
  try { localStorage.setItem(recentKey(kind, companyId), JSON.stringify(list.slice(0, RECENT_MAX))) } catch {}
}

// You and your team, once per business per page load.
const peopleCache = new Map<string, Promise<Person[]>>()
function loadPeople(companyId: string): Promise<Person[]> {
  let p = peopleCache.get(companyId)
  if (!p) {
    p = (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      const { data } = await (supabase as any).from('team_members').select('user_id, name, email, phone, status').eq('company_id', companyId).limit(40)
      const rows: any[] = (data || []).filter((r: any) => !r.status || r.status === 'active')
      const out: Person[] = []
      const mine = rows.find(r => r.user_id && r.user_id === uid)
      out.push({ name: 'Me', email: cleanRecipient('email', session?.user?.email || mine?.email), phone: cleanRecipient('sms', mine?.phone), me: true })
      for (const r of rows) if (r !== mine) out.push({ name: String(r.name || '').trim().split(/\s+/)[0] || '', email: cleanRecipient('email', r.email), phone: cleanRecipient('sms', r.phone) })
      return out
    })().catch(() => [])
    peopleCache.set(companyId, p)
  }
  return p
}

/** POST a test and hand back each recipient's result (a whole-request problem throws). */
export async function postTest(url: string, body: any): Promise<{ results: TestResult[] }> {
  const r = await authFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j: any = await r.json().catch(() => ({}))
  if (Array.isArray(j.results)) return { results: j.results }
  if (!r.ok) throw new Error(j.error || 'The test didn’t send')
  return { results: j.to ? [{ to: j.to, ok: true }] : [] }
}

export function TestSendPanel({ kind, companyId, send, disabled, disabledText, note, compact, autoFocus }: {
  kind: Kind
  companyId: string
  send: (to: string[]) => Promise<{ results: TestResult[] }>
  disabled?: boolean
  disabledText?: string
  note?: string
  compact?: boolean
  autoFocus?: boolean
}) {
  const [list, setList] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [bad, setBad] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<TestResult[] | null>(null)
  const [error, setError] = useState('')
  const [recent, setRecent] = useState<string[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const touched = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const field = kind === 'email' ? 'email' : 'phone'

  useEffect(() => {
    const r = readRecent(kind, companyId)
    setRecent(r)
    let live = true
    loadPeople(companyId).then(ps => {
      if (!live) return
      setPeople(ps)
      // Start with yourself (email), or the number used last time (SMS).
      const start = (ps.find(p => p.me)?.[field]) || (kind === 'sms' ? r[0] : '') || ''
      if (start && !touched.current) setList(l => (l.length ? l : [start]))
    })
    return () => { live = false }
  }, [kind, companyId, field])

  const show = (v: string) => (kind === 'sms' ? fmtMobile(v) : v)
  const label = (v: string) => people.find(p => p[field] === v)?.name || ''
  const full = list.length >= MAX_TEST_RECIPIENTS

  /** Add what was typed; whatever isn't valid stays in the box to fix. */
  const commit = (raw: string, base = list) => {
    touched.current = true
    const next = [...base]
    const invalid: string[] = []
    for (const part of splitRecipients(kind, raw)) {
      const c = cleanRecipient(kind, part)
      if (!c) invalid.push(part)
      else if (!next.includes(c) && next.length < MAX_TEST_RECIPIENTS) next.push(c)
    }
    setList(next); setResults(null); setError('')
    setDraft(invalid.join(kind === 'email' ? ' ' : ', ')); setBad(invalid[0] || '')
    return { next, invalid: invalid.length > 0 }
  }
  const remove = (v: string) => { touched.current = true; setList(l => l.filter(x => x !== v)); setResults(null); input.current?.focus() }
  const pick = (v: string) => { if (!list.includes(v) && !full) { touched.current = true; setList(l => [...l, v]); setResults(null) } }

  const doSend = async () => {
    let target = list
    if (draft.trim()) { const r = commit(draft); if (r.invalid) return; target = r.next }
    if (!target.length || busy || disabled) return
    setBusy(true); setError(''); setResults(null)
    try {
      const out = await send(target)
      setResults(out.results)
      const ok = out.results.filter(r => r.ok).map(r => cleanRecipient(kind, r.to)).filter(Boolean)
      if (ok.length) {
        const next = [...ok, ...recent.filter(x => !ok.includes(x))].slice(0, RECENT_MAX)
        setRecent(next); writeRecent(kind, companyId, next)
      }
    } catch (e: any) { setError(e.message || 'The test didn’t send') }
    finally { setBusy(false) }
  }

  // Quick picks: you, the ones used last time, then your team.
  const picks: { value: string; text: string; title: string }[] = []
  const seen = new Set(list)
  const offer = (value: string, text: string) => { if (value && !seen.has(value) && picks.length < 6) { seen.add(value); picks.push({ value, text, title: show(value) }) } }
  const me = people.find(p => p.me)
  if (me?.[field]) offer(me[field], 'Me')
  for (const r of recent) offer(r, label(r) && label(r) !== 'Me' ? `${label(r)}` : show(r))
  for (const p of people) if (!p.me && p.name) offer(p[field], p.name)

  const sentAll = !!results?.length && results.every(r => r.ok)
  const count = list.length + (draft.trim() && !bad ? splitRecipients(kind, draft).length : 0)

  return (
    <div className={`ts${compact ? ' compact' : ''}`}>
      <style>{TS_CSS}</style>
      <div className="ts-row">
        <div className={`ts-field${bad ? ' bad' : ''}`} onClick={() => input.current?.focus()} role="group" aria-label="Send the test to">
          {list.map(v => (
            <span key={v} className="ts-chip" title={show(v)}>
              {label(v) && <b>{label(v)}</b>}<span>{show(v)}</span>
              <button type="button" onClick={e => { e.stopPropagation(); remove(v) }} aria-label={`Remove ${show(v)}`}>
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2 2 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              </button>
            </span>
          ))}
          {!full && (
            <input ref={input} value={draft} autoFocus={autoFocus} inputMode={kind === 'sms' ? 'tel' : 'email'} type={kind === 'sms' ? 'tel' : 'email'}
              placeholder={list.length ? (kind === 'email' ? 'Add another address' : 'Add another number') : (kind === 'email' ? 'name@example.com' : '04XX XXX XXX')}
              aria-label={kind === 'email' ? 'Email address to send the test to' : 'Mobile number to send the test to'} aria-invalid={!!bad}
              onChange={e => {
                const v = e.target.value
                setBad('')
                // A paste (or typing a separator) adds what's complete.
                if ((kind === 'email' ? /[\s,;]/ : /[,;\n]/).test(v)) commit(v); else setDraft(v)
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); if (draft.trim()) commit(draft); else doSend() }
                else if (e.key === 'Backspace' && !draft && list.length) { e.preventDefault(); remove(list[list.length - 1]) }
              }}
              onBlur={() => { if (draft.trim()) commit(draft) }} />
          )}
        </div>
        <button type="button" className="ts-send" onClick={doSend} disabled={busy || disabled || !count}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
          {busy ? 'Sending…' : count > 1 ? `Send to ${count}` : 'Send test'}
        </button>
      </div>
      {bad && <p className="ts-msg bad" role="alert">“{bad}” isn’t {kind === 'email' ? 'an email address' : 'an Australian mobile number'}.</p>}
      {!full && picks.length > 0 && (
        <div className="ts-picks" aria-label="Quick add">
          {picks.map(p => (
            <button key={p.value} type="button" onClick={() => pick(p.value)} title={p.title}>
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1.5v7M1.5 5h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              {p.text}
            </button>
          ))}
        </div>
      )}
      <p className="ts-note">{disabled && disabledText ? disabledText : note || `Up to ${MAX_TEST_RECIPIENTS} at a time. It never touches the campaign audience.`}{full ? ` That’s the most for one test.` : ''}</p>
      {error && <p className="ts-msg bad" role="alert">Could not send: {error}</p>}
      {results && results.length > 0 && (
        <ul className="ts-results" aria-live="polite">
          {results.map(r => (
            <li key={r.to} className={r.ok ? 'ok' : 'no'}>
              {r.ok
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>}
              <span><b>{r.ok ? 'Sent to' : 'Not sent to'} {show(cleanRecipient(kind, r.to) || r.to)}</b>{!r.ok && r.error ? <small>{r.error}</small> : null}</span>
            </li>
          ))}
          {sentAll && results.length > 1 && <li className="ok sum"><span>All {results.length} sent. {kind === 'email' ? 'Check the inboxes (and spam folders).' : 'They should arrive in a few seconds.'}</span></li>}
        </ul>
      )}
    </div>
  )
}

const TS_CSS = `
.ts{display:flex;flex-direction:column;gap:8px;min-width:0}
.ts button::before{display:none!important}
.ts-row{display:flex;gap:8px;align-items:flex-start;min-width:0}
.ts.compact .ts-row{flex-direction:column;align-items:stretch}
.ts-field{flex:1;min-width:0;display:flex;flex-wrap:wrap;align-items:center;gap:5px;min-height:42px;box-sizing:border-box;padding:5px 6px;border-radius:14px;background:#f4f4f5;border:1.5px solid transparent;cursor:text}
.ts-field:focus-within{background:#fff;border-color:#ececef;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 14%,transparent)}
.ts-field.bad{border-color:#fca5a5;box-shadow:0 0 0 3px rgba(239,68,68,.12)}
.ts-chip{display:inline-flex;align-items:center;gap:5px;max-width:100%;height:28px;padding:0 4px 0 10px;border-radius:999px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.08);font-size:13px;color:var(--ink);min-width:0}
.ts-chip b{font-weight:650}
.ts-chip span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#52525b}
.ts-chip b+span{color:#8e8e93}
.ts-chip button{flex-shrink:0;width:20px;height:20px;display:flex;align-items:center;justify-content:center;border:none;border-radius:50%;background:transparent;color:#71717a;cursor:pointer;padding:0}
.ts-chip button:hover{background:#f4f4f5;color:#18181b}
.ts-field input{flex:1;min-width:150px;height:30px;border:none!important;outline:none!important;box-shadow:none!important;background:transparent!important;border-radius:0;font:inherit;font-size:13.5px;color:var(--ink);padding:0 6px;margin:0}
/* The global input:focus glow (app/globals.css) mustn't draw a second box inside the field. */
.ts .ts-field input,.ts .ts-field input:focus,.ts .ts-field input:focus-visible,.ts .ts-field input:hover{border:none!important;border-color:transparent!important;outline:none!important;box-shadow:none!important;background:transparent!important}
.ts-send{flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;gap:7px;height:42px;padding:0 18px;border:none;border-radius:999px;background:var(--ink);color:#fff;font:inherit;font-size:13.5px;font-weight:650;cursor:pointer;white-space:nowrap}
.ts-send:disabled{opacity:.45;cursor:default}
.ts-picks{display:flex;flex-wrap:wrap;gap:6px}
.ts-picks button{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 11px;border:none;border-radius:999px;background:#f4f4f5;color:#3f3f46;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ts-picks button:hover{background:#ececef;color:#18181b}
.ts-note{margin:0;font-size:12px;line-height:1.5;color:var(--slate)}
.ts-msg{margin:0;font-size:12.5px}.ts-msg.bad{color:#dc2626}
.ts-results{list-style:none;margin:2px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}
.ts-results li{display:flex;align-items:flex-start;gap:7px;font-size:12.5px;line-height:1.4}
.ts-results li svg{flex-shrink:0;margin-top:1px}
.ts-results li span{display:flex;flex-direction:column;min-width:0;word-break:break-word}
.ts-results li b{font-weight:600}
.ts-results li small{font-size:12px;color:#71717a}
.ts-results li.ok{color:#15803d}.ts-results li.no{color:#b91c1c}
.ts-results li.sum{color:#52525b}
@media (max-width:560px){.ts-row{flex-direction:column;align-items:stretch}.ts-send{width:100%}}
[data-theme="dark"] .ts-field{background:#2a2a2e}
[data-theme="dark"] .ts-field:focus-within{background:#1c1c1f;border-color:#3a3a40}
[data-theme="dark"] .ts-chip{background:#3a3a40;box-shadow:none}
[data-theme="dark"] .ts-chip span{color:#d4d4d8}[data-theme="dark"] .ts-chip b+span{color:#a1a1aa}
[data-theme="dark"] .ts-chip button{color:#a1a1aa}[data-theme="dark"] .ts-chip button:hover{background:#4a4a52;color:#fff}
[data-theme="dark"] .ts-send{background:#f4f4f5;color:#18181b}
[data-theme="dark"] .ts-picks button{background:#2a2a2e;color:#d4d4d8}[data-theme="dark"] .ts-picks button:hover{background:#3a3a40;color:#fff}
[data-theme="dark"] .ts-results li.ok{color:#4ade80}[data-theme="dark"] .ts-results li.no{color:#f87171}
[data-theme="dark"] .ts-results li small{color:#a1a1aa}[data-theme="dark"] .ts-results li.sum{color:#a1a1aa}
`
