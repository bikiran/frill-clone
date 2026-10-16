'use client'

// Super admin → Overview → Email health: "Recover empty email replies".
// Customer emails that came in through Resend before the inbound webhook
// fetched bodies were saved blank. A dry run counts them per workspace; "Run"
// then recovers them workspace by workspace (so there's progress and no one
// request runs too long), putting each reply with the conversation it answers.
// Uses /api/platform-admin/email-backfill (lib/email-backfill).

import { useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { confirmDialog } from '@/components/ConfirmDialog'

type Ws = { companyId: string; name: string; slug: string | null; candidates: number; filled: number; rethreaded: number; notFound: number; stillEmpty: number }
type Result = { status: 'waiting' | 'running' | 'done' | 'error'; filled?: number; rethreaded?: number; notFound?: number; stillEmpty?: number; error?: string }

const btn = (color: string, filled = false): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
  border: filled ? 'none' : '1px solid var(--sa-border)', background: filled ? color : 'var(--sa-card)', color: filled ? '#fff' : color, whiteSpace: 'nowrap',
})
const cell: React.CSSProperties = { padding: '8px 10px', fontSize: 12.5, color: 'var(--sa-text)', borderTop: '1px solid var(--sa-border)', whiteSpace: 'nowrap' }
const head: React.CSSProperties = { ...cell, borderTop: 'none', fontSize: 10.5, fontWeight: 800, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }

async function call(body: any): Promise<any> {
  const res = await authFetch('/api/platform-admin/email-backfill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || 'That didn’t work')
  return d
}

export default function EmailHealthCard() {
  const [days, setDays] = useState(30)
  const [busy, setBusy] = useState<'' | 'dry' | 'run'>('')
  const [err, setErr] = useState('')
  const [dry, setDry] = useState<{ workspaces: Ws[]; candidates: number; filled: number; notFound: number; stillEmpty: number } | null>(null)
  const [results, setResults] = useState<Record<string, Result>>({})
  const [current, setCurrent] = useState(0)

  const dryRun = async () => {
    setBusy('dry'); setErr(''); setResults({}); setDry(null)
    try { setDry(await call({ dryRun: true, days })) } catch (e: any) { setErr(e.message) } finally { setBusy('') }
  }
  const runAll = async () => {
    const todo = (dry?.workspaces || []).filter(w => w.companyId !== 'unknown' && w.filled > 0)
    if (!todo.length) return
    if (!(await confirmDialog({ title: `Recover ${todo.reduce((n, w) => n + w.filled, 0)} email replies?`, message: `Fills in the empty replies in ${todo.length} workspace${todo.length === 1 ? '' : 's'} and moves each one into the conversation it answers (unless staff already replied where it is). Nobody is notified and no AI agent runs.`, confirmLabel: 'Run (re-thread)' }))) return
    setBusy('run'); setErr('')
    setResults(Object.fromEntries(todo.map(w => [w.companyId, { status: 'waiting' }])))
    for (let i = 0; i < todo.length; i++) {
      const w = todo[i]
      setCurrent(i + 1)
      setResults(r => ({ ...r, [w.companyId]: { status: 'running' } }))
      try {
        const d = await call({ dryRun: false, rethread: true, days, companyId: w.companyId })
        setResults(r => ({ ...r, [w.companyId]: { status: 'done', filled: d.filled, rethreaded: d.rethreaded, notFound: d.notFound, stillEmpty: d.stillEmpty } }))
      } catch (e: any) {
        setResults(r => ({ ...r, [w.companyId]: { status: 'error', error: e.message } }))
      }
    }
    setBusy('')
  }

  const ws = dry?.workspaces || []
  const runnable = ws.filter(w => w.companyId !== 'unknown' && w.filled > 0)
  const done = Object.values(results).filter(r => r.status === 'done' || r.status === 'error').length
  const total = Object.keys(results).length

  return (
    <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 20, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', margin: 0 }}>Email health</p>
          <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)', margin: '10px 0 2px' }}>Recover empty email replies</p>
          <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: 0 }}>Customer replies that arrived through Resend before bodies were fetched were saved blank. A dry run counts them; nothing changes until you run it.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={days} onChange={e => setDays(Number(e.target.value))} disabled={!!busy} style={{ padding: '7px 9px', borderRadius: 9, border: '1px solid var(--sa-border)', background: 'var(--sa-bg)', color: 'var(--sa-text)', fontSize: 12.5 }}>
            {[7, 30, 60, 90].map(d => <option key={d} value={d}>Last {d} days</option>)}
          </select>
          <button onClick={dryRun} disabled={!!busy} style={{ ...btn('var(--sa-text)'), opacity: busy ? 0.6 : 1 }}>{busy === 'dry' ? 'Checking…' : 'Dry run'}</button>
          {dry && runnable.length > 0 && <button onClick={runAll} disabled={!!busy} style={{ ...btn('#ff7a6b', true), opacity: busy ? 0.6 : 1 }}>{busy === 'run' ? `Running ${current} of ${total}…` : 'Run (re-thread)'}</button>}
        </div>
      </div>

      {err && <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 9, background: '#fee2e2', color: '#b91c1c', fontSize: 12.5 }}>{err}</div>}

      {dry && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 12.5, color: 'var(--sa-text)', margin: '0 0 8px' }}>
            {dry.candidates === 0 ? 'No empty email replies in this period. Nothing to recover.'
              : <><b>{dry.candidates}</b> empty repl{dry.candidates === 1 ? 'y' : 'ies'} found: <b>{dry.filled}</b> can be recovered, {dry.notFound} couldn’t be found on Resend, {dry.stillEmpty} really were empty.</>}
          </p>
          {total > 0 && (
            <div style={{ height: 6, borderRadius: 999, background: 'var(--sa-border)', overflow: 'hidden', marginBottom: 10 }}>
              <div style={{ height: '100%', width: `${Math.round((done / total) * 100)}%`, background: '#10b981', transition: 'width 0.3s' }} />
            </div>
          )}
          {ws.length > 0 && (
            <div style={{ overflowX: 'auto', border: '1px solid var(--sa-border)', borderRadius: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Workspace', 'Empty', 'Recoverable', 'Not found', 'Really empty', 'Result'].map(h => <th key={h} style={{ ...head, textAlign: 'left' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {ws.map(w => {
                    const r = results[w.companyId]
                    return (
                      <tr key={w.companyId}>
                        <td style={{ ...cell, whiteSpace: 'normal', fontWeight: 600 }}>{w.name}</td>
                        <td style={cell}>{w.candidates}</td>
                        <td style={cell}>{w.filled}</td>
                        <td style={cell}>{w.notFound}</td>
                        <td style={cell}>{w.stillEmpty}</td>
                        <td style={{ ...cell, whiteSpace: 'normal' }}>
                          {!r ? <span style={{ color: 'var(--sa-muted)' }}>{w.filled ? 'Ready' : 'Nothing to do'}</span>
                          : r.status === 'waiting' ? <span style={{ color: 'var(--sa-muted)' }}>Waiting</span>
                          : r.status === 'running' ? <span style={{ color: '#6366f1', fontWeight: 600 }}>Running…</span>
                          : r.status === 'error' ? <span style={{ color: '#dc2626' }}>{r.error}</span>
                          : <span style={{ color: '#059669', fontWeight: 600 }}>{r.filled} recovered{r.rethreaded ? `, ${r.rethreaded} moved to their conversation` : ''}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
