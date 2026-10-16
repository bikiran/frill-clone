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

type Ws = { companyId: string; name: string; slug: string | null; candidates: number; filled: number; fromGmail?: number; alreadyInColvy?: number; rethreaded: number; notFound: number; stillEmpty: number }
type Row = { id: string; conversationId: string; outcome: string; date?: string; from?: string | null; to?: string | null; subject?: string | null; provider?: string; reason?: string; matchedBy?: string; gmailUrl?: string | null; copyConversationId?: string | null; slug?: string | null; workspace?: string }

const PROVIDER: Record<string, string> = { resend: 'Resend', gmail: 'Gmail', 'other-webhook': 'Another provider', unknown: 'Unknown' }
const OUTCOME: Record<string, { text: string; color: string }> = {
  'not-found-on-resend': { text: 'Not found', color: '#dc2626' },
  'fetch-failed': { text: 'Not found', color: '#dc2626' },
  mismatch: { text: 'Different email', color: '#dc2626' },
  'already-in-colvy': { text: 'Duplicate', color: '#d97706' },
  'filled-from-gmail': { text: 'From Gmail', color: '#059669' },
  'email-has-no-body': { text: 'Really empty', color: 'var(--sa-muted)' },
}

// Open a conversation in a workspace without its login screen (same handoff as the console's "Enter workspace").
async function openInWorkspace(slug: string | null | undefined, conversationId: string) {
  const next = `/admin/inbox?conversation=${conversationId}`
  if (!slug) return
  try {
    const { supabase } = await import('@/lib/supabase')
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token && session.refresh_token) {
      window.open(`https://${slug}.colvy.com/auth/handoff#access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}&next=${encodeURIComponent(next)}`, '_blank')
      return
    }
  } catch {}
  window.open(`https://${slug}.colvy.com${next}`, '_blank')
}
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, color: '#6366f1', fontSize: 12, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' }
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
  const [checking, setChecking] = useState({ done: 0, total: 0 })
  const [err, setErr] = useState('')
  const [dry, setDry] = useState<{ workspaces: Ws[]; rows: Row[]; candidates: number; filled: number; fromGmail: number; alreadyInColvy: number; notFound: number; stillEmpty: number } | null>(null)
  const [results, setResults] = useState<Record<string, Result>>({})
  const [current, setCurrent] = useState(0)

  // Find the workspaces with empty replies (database only), then dry-run them
  // one at a time, so no single request has to check every workspace.
  const dryRun = async () => {
    setBusy('dry'); setErr(''); setResults({}); setDry(null); setChecking({ done: 0, total: 0 })
    try {
      const scan = await call({ scan: true, days })
      const list: any[] = scan.workspaces || []
      const acc = { workspaces: [] as Ws[], rows: [] as Row[], candidates: 0, filled: 0, fromGmail: 0, alreadyInColvy: 0, notFound: 0, stillEmpty: 0 }
      setChecking({ done: 0, total: list.length })
      setDry({ ...acc })
      for (let i = 0; i < list.length; i++) {
        const w = list[i]
        try {
          const d = await call({ dryRun: true, days, companyId: w.companyId })
          const one = (d.workspaces || [])[0] || { companyId: w.companyId, candidates: d.candidates, filled: d.filled, rethreaded: 0, notFound: d.notFound, stillEmpty: d.stillEmpty }
          acc.workspaces.push({ ...one, companyId: w.companyId, name: w.name, slug: w.slug })
          acc.candidates += d.candidates || 0; acc.filled += d.filled || 0; acc.notFound += d.notFound || 0; acc.stillEmpty += d.stillEmpty || 0
          acc.fromGmail += d.fromGmail || 0; acc.alreadyInColvy += d.alreadyInColvy || 0
          for (const r of (d.rows || []) as Row[]) acc.rows.push({ ...r, slug: r.slug || w.slug, workspace: w.name })
        } catch (e: any) {
          acc.workspaces.push({ companyId: w.companyId, name: w.name, slug: w.slug, candidates: w.empty, filled: 0, rethreaded: 0, notFound: 0, stillEmpty: 0 })
          setResults(r => ({ ...r, [w.companyId]: { status: 'error', error: e.message } }))
        }
        setChecking({ done: i + 1, total: list.length })
        setDry({ ...acc, workspaces: acc.workspaces.slice(), rows: acc.rows.slice() })
      }
    } catch (e: any) { setErr(e.message) } finally { setBusy('') }
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
          <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: 0 }}>Customer replies that arrived through Resend before bodies were fetched were saved blank. A dry run counts them, workspace by workspace, and lists any it can’t recover with the reason; nothing changes until you run it. Ones Resend no longer has are fetched from the business’s connected Gmail when it has a copy. The real run fills each reply in and moves it into the conversation it answers (unless staff already replied where it is).</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={days} onChange={e => setDays(Number(e.target.value))} disabled={!!busy} style={{ padding: '7px 9px', borderRadius: 9, border: '1px solid var(--sa-border)', background: 'var(--sa-bg)', color: 'var(--sa-text)', fontSize: 12.5 }}>
            {[7, 30, 60, 90].map(d => <option key={d} value={d}>Last {d} days</option>)}
          </select>
          <button onClick={dryRun} disabled={!!busy} style={{ ...btn('var(--sa-text)'), opacity: busy ? 0.6 : 1 }}>{busy === 'dry' ? (checking.total ? `Checking ${Math.min(checking.done + 1, checking.total)} of ${checking.total}…` : 'Finding…') : 'Dry run'}</button>
          {dry && busy !== 'dry' && runnable.length > 0 && <button onClick={runAll} disabled={!!busy} style={{ ...btn('#ff7a6b', true), opacity: busy ? 0.6 : 1 }}>{busy === 'run' ? `Running ${current} of ${total}…` : 'Run (re-thread)'}</button>}
        </div>
      </div>

      {err && <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 9, background: '#fee2e2', color: '#b91c1c', fontSize: 12.5 }}>{err}</div>}

      {dry && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 12.5, color: 'var(--sa-text)', margin: '0 0 8px' }}>
            {busy === 'dry' && dry.candidates === 0 ? 'Checking each workspace…'
              : dry.candidates === 0 ? 'No empty email replies in this period. Nothing to recover.'
              : <><b>{dry.candidates}</b> empty repl{dry.candidates === 1 ? 'y' : 'ies'} found: <b>{dry.filled}</b> can be recovered{dry.fromGmail ? ` (${dry.fromGmail} from Gmail)` : ''}, {dry.notFound} can’t be found{dry.alreadyInColvy ? `, ${dry.alreadyInColvy} already in Colvy as a duplicate` : ''}, {dry.stillEmpty} really were empty.{dry.rows.some(r => !r.outcome.startsWith('filled')) ? ' Each one is listed below with the reason.' : ''}</>}
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
          {dry.rows.some(r => r.outcome !== 'filled' && !r.outcome.startsWith('filled+')) && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)', margin: '0 0 6px' }}>Replies that need a look</p>
              <style>{`.eh-cards{display:none}@media (max-width:760px){.eh-table{display:none}.eh-cards{display:flex}}`}</style>
              <div className="eh-cards" style={{ flexDirection: 'column', gap: 8 }}>
                {dry.rows.filter(r => r.outcome !== 'filled' && !r.outcome.startsWith('filled+')).map(r => {
                  const o = OUTCOME[r.outcome] || { text: r.outcome, color: 'var(--sa-muted)' }
                  return (
                    <div key={r.id} style={{ border: '1px solid var(--sa-border)', borderRadius: 12, padding: 12, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                        <span style={{ fontSize: 12, color: 'var(--sa-muted)' }}>{r.date ? new Date(r.date).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—'} · {PROVIDER[r.provider || 'unknown'] || r.provider}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: o.color, whiteSpace: 'nowrap' }}>{o.text}</span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', wordBreak: 'break-word' }}>{r.subject || '(no subject)'}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--sa-text)', wordBreak: 'break-word' }}>{r.from || '—'}</p>
                      <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--sa-muted)', lineHeight: 1.45 }}>{r.reason}</p>
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8 }}>
                        <button onClick={() => openInWorkspace(r.slug, r.conversationId)} style={linkBtn}>Open conversation</button>
                        {r.copyConversationId && <button onClick={() => openInWorkspace(r.slug, r.copyConversationId!)} style={linkBtn}>Open the copy</button>}
                        {r.gmailUrl && <a href={r.gmailUrl} target="_blank" rel="noopener noreferrer" style={linkBtn}>Open in Gmail</a>}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="eh-table" style={{ overflowX: 'auto', border: '1px solid var(--sa-border)', borderRadius: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                  <thead><tr>{['Received', 'From', 'Subject', 'Came via', 'Result', 'Why', ''].map((h, i) => <th key={i} style={{ ...head, textAlign: 'left' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {dry.rows.filter(r => r.outcome !== 'filled' && !r.outcome.startsWith('filled+')).map(r => {
                      const o = OUTCOME[r.outcome] || { text: r.outcome, color: 'var(--sa-muted)' }
                      return (
                        <tr key={r.id}>
                          <td style={cell}>{r.date ? new Date(r.date).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—'}{dry.workspaces.length > 1 && r.workspace ? <div style={{ fontSize: 11, color: 'var(--sa-muted)' }}>{r.workspace}</div> : null}</td>
                          <td style={{ ...cell, whiteSpace: 'normal', maxWidth: 200, wordBreak: 'break-word' }}>{r.from || '—'}</td>
                          <td style={{ ...cell, whiteSpace: 'normal', maxWidth: 220, wordBreak: 'break-word' }}>{r.subject || '(no subject)'}</td>
                          <td style={cell}>{PROVIDER[r.provider || 'unknown'] || r.provider}</td>
                          <td style={{ ...cell, color: o.color, fontWeight: 700 }}>{o.text}</td>
                          <td style={{ ...cell, whiteSpace: 'normal', minWidth: 240, color: 'var(--sa-muted)', lineHeight: 1.45 }}>{r.reason}</td>
                          <td style={{ ...cell, whiteSpace: 'normal' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                              <button onClick={() => openInWorkspace(r.slug, r.conversationId)} style={linkBtn}>Open conversation</button>
                              {r.copyConversationId && <button onClick={() => openInWorkspace(r.slug, r.copyConversationId!)} style={linkBtn}>Open the copy</button>}
                              {r.gmailUrl && <a href={r.gmailUrl} target="_blank" rel="noopener noreferrer" style={linkBtn}>Open in Gmail</a>}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
