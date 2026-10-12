'use client'

import { useCallback, useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { confirmDialog } from '@/components/ConfirmDialog'

// Agents → Results: what the agents achieved, what they brought to the team,
// and "ready for more freedom" suggestions the team can accept in one tap.
// ResultsStrip sits on the Agents page; ResultsView is the full page.

const EASE = 'cubic-bezier(.22,1,.36,1)'
type Totals = {
  runs: number; sentOnOwn: number; otherDone: number; approvedAsIs: number; edited: number; dismissed: number; unanswered: number
  escalated: number; tasks: number; failed: number; failedDeliveries: number; reviewsAnswered: number; commentsAnswered: number
  ordersFlagged: number; ordersCaught: number; customersUpdated: number; cartsWon: number; cartsWonValue: number; quotesPaid: number; quotesPaidValue: number
  minutesSaved: number; medianApprovalMinutes: number | null
}
type RoleRow = { role: string; name: string; runs: number; sentOnOwn: number; approvedAsIs: number; edited: number; dismissed: number; escalated: number; failed: number }
type Results = { days: number; current: Totals; previous: Totals; roles: RoleRow[]; exceptions: { runId: string; role: string; summary: string; at: string; kind: 'escalated' | 'failed' }[] }
export type Trust = { key: string; role: string; title: string; detail: string; confirm: string; accept: string; stats: { decided: number; asIs: number; edited: number; dismissed: number } }
type Payload = { results: Results; suggestions: Trust[]; digest: { enabled: boolean } }

const ico = (d: React.ReactNode, s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline-block', flexShrink: 0 }}>{d}</svg>
const Up = () => ico(<><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></>, 12)
const Down = () => ico(<><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></>, 12)
const Shield = () => ico(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></>, 18)
const Back = () => ico(<polyline points="15 18 9 12 15 6" />, 16)
const Arrow = () => ico(<><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>, 14)

const compact = (n: number) => n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '')}K` : n.toLocaleString('en-AU')
const money = (n: number) => n >= 10000 ? `$${(n / 1000).toFixed(1).replace(/\.0$/, '')}K` : `$${n.toLocaleString('en-AU', { maximumFractionDigits: n % 1 ? 2 : 0, minimumFractionDigits: n % 1 ? 2 : 0 })}`
const pts = (n: number) => `${n} pt${n === 1 ? '' : 's'}`
const hours = (mins: number) => mins < 60 ? `${Math.round(mins)} min` : `${(mins / 60).toFixed(mins < 600 ? 1 : 0).replace(/\.0$/, '')} hrs`
const handled = (t: Totals) => t.sentOnOwn + t.approvedAsIs + t.edited
const asIsPct = (t: Totals) => { const d = t.approvedAsIs + t.edited + t.dismissed; return d ? Math.round((t.approvedAsIs / d) * 100) : null }
const periodWord = (days: number) => days === 7 ? 'last week' : `the ${days} days before`
const waitText = (m: number | null) => m == null ? '—' : m < 1 ? 'under a minute' : m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${(m / 60).toFixed(1).replace(/\.0$/, '')} hrs` : `${(m / 1440).toFixed(1).replace(/\.0$/, '')} days`

export function useAgentResults(companyId: string | null, days: number) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (!companyId) return
    try {
      const r = await authFetch(`/api/agent/results?companyId=${companyId}&days=${days}`)
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Couldn’t load results.'); return }
      setData(d); setError('')
    } catch { setError('Couldn’t reach Colvy.') }
  }, [companyId, days])
  useEffect(() => { load() }, [load])
  return { data, error, reload: load, setData }
}

// A stat tile: label · value · change vs the previous period (arrow + words, not colour alone).
function Tile({ label, value, note, now, before, goodUp = true, days, neutral, fmt = compact }: { label: string; value: string; note?: string; now?: number; before?: number; goodUp?: boolean; days: number; neutral?: boolean; fmt?: (n: number) => string }) {
  let delta: React.ReactNode = null
  if (now != null && before != null && (now || before)) {
    const diff = now - before
    const tone = diff === 0 || neutral ? 'flat' : (diff > 0) === goodUp ? 'good' : 'bad'
    delta = <span className={`ar-delta ${tone}`}>{diff > 0 ? <Up /> : diff < 0 ? <Down /> : null}{diff === 0 ? 'Same as' : `${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff))} vs`} {periodWord(days)}</span>
  }
  return (
    <div className="ar-tile">
      <span className="ar-tile-l">{label}</span>
      <span className="ar-tile-v">{value}</span>
      {note && <span className="ar-tile-n">{note}</span>}
      {delta}
    </div>
  )
}

export function TrustList({ companyId, items, onChange }: { companyId: string; items: Trust[]; onChange: (next: Trust[], accepted?: Trust) => void }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const act = async (s: Trust, action: 'accept' | 'dismiss') => {
    if (action === 'accept') {
      const ok = await confirmDialog({ title: s.title + '?', message: s.confirm, confirmLabel: s.accept })
      if (!ok) return
    }
    setBusy(`${action}:${s.key}`); setError('')
    try {
      const r = await authFetch('/api/agent/results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, action, key: s.key }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || d.error) { setError(d.error || 'That didn’t work. Try again.'); return }
      onChange(action === 'accept' && Array.isArray(d.suggestions) ? d.suggestions : items.filter(x => x.key !== s.key), action === 'accept' ? s : undefined)
    } catch { setError('Couldn’t reach Colvy. Try again.') } finally { setBusy('') }
  }
  if (!items.length) return null
  return (
    <div className="ar-trust">
      {error && <p className="ar-err" role="alert">{error}</p>}
      {items.map(s => (
        <div key={s.key} className="ar-trust-item">
          <span className="ar-trust-ic"><Shield /></span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="ar-trust-t">{s.title}</p>
            <p className="ar-trust-d">{s.detail}</p>
            <div className="ar-meter" aria-hidden="true"><span style={{ width: `${Math.round((s.stats.asIs / Math.max(1, s.stats.decided)) * 100)}%` }} /></div>
          </div>
          <div className="ar-trust-a">
            <button type="button" className="ar-primary" onClick={() => act(s, 'accept')} disabled={!!busy}>{busy === `accept:${s.key}` ? 'Saving…' : s.accept}</button>
            <button type="button" className="ar-ghost" onClick={() => act(s, 'dismiss')} disabled={!!busy}>{busy === `dismiss:${s.key}` ? '…' : 'Not now'}</button>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Agents page: this week at a glance + earned-trust suggestions. */
export function ResultsStrip({ companyId, onSettingsChanged }: { companyId: string; onSettingsChanged?: () => void }) {
  const { data, setData } = useAgentResults(companyId, 7)
  if (!data) return null
  const c = data.results.current, p = data.results.previous
  const won = c.cartsWonValue + c.quotesPaidValue
  const pct = asIsPct(c)
  const empty = !c.runs && !p.runs
  return (
    <div className="ar ar-strip ag-fade">
      <style>{CSS}</style>
      {!empty && (
        <div className="ar-card">
          <div className="ar-head">
            <p className="ar-h">This week</p>
            <a className="ar-link" href="/admin/agents/results">See all results <Arrow /></a>
          </div>
          <div className="ar-tiles">
            <Tile days={7} label="Handled" value={compact(handled(c))} note={`${compact(c.sentOnOwn)} on their own`} now={handled(c)} before={handled(p)} />
            <Tile days={7} label="Approved as written" value={pct == null ? '—' : `${pct}%`} note={c.approvedAsIs + c.edited + c.dismissed ? `of ${c.approvedAsIs + c.edited + c.dismissed} drafts` : 'no drafts decided yet'} />
            <Tile days={7} label="Brought to you" value={compact(c.escalated + c.tasks)} note={`${c.escalated} handed over · ${c.tasks} tasks`} now={c.escalated + c.tasks} before={p.escalated + p.tasks} neutral />
            {won ? <Tile days={7} label="Won back" value={money(won)} note={`${c.cartsWon + c.quotesPaid} paid after a follow-up`} now={won} before={p.cartsWonValue + p.quotesPaidValue} fmt={money} />
              : <Tile days={7} label="Time saved" value={`~${hours(c.minutesSaved)}`} note="estimate" now={c.minutesSaved} before={p.minutesSaved} fmt={hours} />}
          </div>
        </div>
      )}
      {data.suggestions.length > 0 && (
        <div className="ar-card" style={{ marginTop: empty ? 0 : 12 }}>
          <p className="ar-h">Ready for more freedom</p>
          <p className="ar-p">Your team keeps approving these without changes. Let the agent do them on its own — still within your limits, and you can switch it back any time.</p>
          <TrustList companyId={companyId} items={data.suggestions} onChange={(next, accepted) => { setData({ ...data, suggestions: next }); if (accepted) onSettingsChanged?.() }} />
        </div>
      )}
    </div>
  )
}

const PERIODS = [7, 30, 90]

/** The full Results page. */
export function ResultsView({ companyId }: { companyId: string | null }) {
  const [days, setDays] = useState(7)
  const { data, error, setData } = useAgentResults(companyId, days)
  const [savingDigest, setSavingDigest] = useState(false)
  const c = data?.results.current, p = data?.results.previous

  const toggleDigest = async () => {
    if (!data || !companyId) return
    const enabled = !data.digest.enabled
    setSavingDigest(true)
    try {
      const r = await authFetch('/api/agent/results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, action: 'digest', enabled }) })
      if (r.ok) setData({ ...data, digest: { enabled } })
    } finally { setSavingDigest(false) }
  }

  return (
    <div className="ar" style={{ minHeight: '100%', background: 'var(--canvas, #f6f7f9)' }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '24px 16px 120px' }}>
        <a href="/admin/agents" className="ar-back"><Back /> AI Agents</a>
        <div className="ar-top">
          <div style={{ minWidth: 0, flex: '1 1 320px' }}>
            <h1 className="ar-title">Agent results</h1>
            <p className="ar-sub">What your agents did, what they brought to you, and what they’ve earned the trust to do on their own. Live work only — sandbox tries don’t count.</p>
          </div>
          <div className="ar-seg" role="radiogroup" aria-label="Period">
            {PERIODS.map(d => <button key={d} type="button" role="radio" aria-checked={days === d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{d} days</button>)}
            <span className="ar-seg-pill" style={{ transform: `translateX(${PERIODS.indexOf(days) * 100}%)` }} />
          </div>
        </div>

        {error && <p className="ar-err" role="alert">{error}</p>}
        {!data && !error && <p className="ar-p">Loading…</p>}

        {data && c && p && (
          <div key={days} className="ag-fade-in">
            {!c.runs && !p.runs && <div className="ar-card" style={{ marginBottom: 14 }}><p className="ar-p" style={{ margin: 0 }}>No live agent work in this period yet. Switch an agent on from the Agents page and its results will show here.</p></div>}

            <div className="ar-tiles big">
              <Tile days={days} label="Handled" value={compact(handled(c))} note={`${compact(c.sentOnOwn)} on their own · ${compact(c.approvedAsIs + c.edited)} approved by you`} now={handled(c)} before={handled(p)} />
              <Tile days={days} label="Approved as written" value={asIsPct(c) == null ? '—' : `${asIsPct(c)}%`} note={`${c.approvedAsIs} as written · ${c.edited} edited · ${c.dismissed} dismissed`} now={asIsPct(c) ?? undefined} before={asIsPct(p) ?? undefined} fmt={pts} />
              <Tile days={days} label="Brought to you" value={compact(c.escalated + c.tasks)} note={`${c.escalated} handed over · ${c.tasks} tasks`} now={c.escalated + c.tasks} before={p.escalated + p.tasks} neutral />
              <Tile days={days} label="Time saved" value={`~${hours(c.minutesSaved)}`} note="estimate — see below" now={c.minutesSaved} before={p.minutesSaved} fmt={hours} />
            </div>

            <div className="ar-card ar-sec">
              <p className="ar-h">Money and orders</p>
              <div className="ar-tiles">
                <Tile days={days} label="Won back" value={money(c.cartsWonValue + c.quotesPaidValue)} note={`${c.cartsWon} cart${c.cartsWon === 1 ? '' : 's'} · ${c.quotesPaid} quote${c.quotesPaid === 1 ? '' : 's'} paid after a follow-up`} now={c.cartsWonValue + c.quotesPaidValue} before={p.cartsWonValue + p.quotesPaidValue} fmt={money} />
                <Tile days={days} label="Orders caught" value={compact(c.ordersCaught)} note={`of ${c.ordersFlagged} flagged as late or stuck`} now={c.ordersCaught} before={p.ordersCaught} />
                <Tile days={days} label="Customers kept updated" value={compact(c.customersUpdated)} note="about late or held-up orders" now={c.customersUpdated} before={p.customersUpdated} />
                <Tile days={days} label="Reviews and comments" value={compact(c.reviewsAnswered + c.commentsAnswered)} note={`${c.reviewsAnswered} reviews · ${c.commentsAnswered} comments answered`} now={c.reviewsAnswered + c.commentsAnswered} before={p.reviewsAnswered + p.commentsAnswered} />
              </div>
            </div>

            <div className="ar-card ar-sec">
              <p className="ar-h">Ready for more freedom</p>
              {data.suggestions.length
                ? <><p className="ar-p">Your team keeps approving these without changes. Let the agent do them on its own — still within your limits, and you can switch it back any time on the Agents page.</p>
                    <TrustList companyId={companyId!} items={data.suggestions} onChange={next => setData({ ...data, suggestions: next })} /></>
                : <p className="ar-p">Nothing yet. When your team approves an agent’s drafts unchanged again and again (at least 12 in a month, 9 in 10 unchanged), Colvy suggests letting it do that on its own.</p>}
            </div>

            <div className="ar-grid">
              <div className="ar-card ar-sec" style={{ minWidth: 0 }}>
                <p className="ar-h">By agent</p>
                {data.results.roles.length === 0 ? <p className="ar-p">No live work in this period.</p> : (
                  <div className="ar-table-wrap">
                    <table className="ar-table">
                      <thead><tr><th>Agent</th><th>Runs</th><th>On their own</th><th>Approved</th><th>Edited</th><th>Dismissed</th><th>Handed over</th><th>Problems</th></tr></thead>
                      <tbody>
                        {data.results.roles.map(r => (
                          <tr key={r.role}><td>{r.name}</td><td>{r.runs}</td><td>{r.sentOnOwn}</td><td>{r.approvedAsIs}</td><td>{r.edited}</td><td>{r.dismissed}</td><td>{r.escalated}</td><td className={r.failed ? 'bad' : ''}>{r.failed}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="ar-card ar-sec" style={{ minWidth: 0 }}>
                <p className="ar-h">What they brought to you</p>
                {data.results.exceptions.length === 0 ? <p className="ar-p">Nothing handed over or gone wrong in this period.</p> : (
                  <ul className="ar-ex">
                    {data.results.exceptions.map(e => (
                      <li key={e.runId + e.kind}>
                        <span className={`ar-chip ${e.kind === 'failed' ? 'bad' : 'warn'}`}>{e.kind === 'failed' ? 'Problem' : 'Handed over'}</span>
                        <span className="ar-ex-t">{e.summary}</span>
                        <a className="ar-link" href={`/admin/agents?run=${e.runId}`}>Why?</a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="ar-card ar-sec">
              <p className="ar-h">Good to know</p>
              <ul className="ar-facts">
                <li><b>{waitText(c.medianApprovalMinutes)}</b> — typical wait for your team to approve a draft</li>
                <li><b>{c.unanswered}</b> draft{c.unanswered === 1 ? '' : 's'} expired before anyone looked at {c.unanswered === 1 ? 'it' : 'them'}</li>
                <li><b>{c.failedDeliveries}</b> approved message{c.failedDeliveries === 1 ? '' : 's'} didn’t go out · <b>{c.failed}</b> run{c.failed === 1 ? '' : 's'} went wrong</li>
                {c.otherDone > 0 && <li><b>{c.otherDone}</b> other change{c.otherDone === 1 ? '' : 's'} made on their own (booking links, outside tools)</li>}
              </ul>
              <p className="ar-foot">Time saved is an estimate: 3 minutes for each reply sent on its own, 2 for each draft you sent as written, 1 for each you edited.</p>
            </div>

            <div className="ar-card ar-sec ar-digest">
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="ar-h">Weekly summary email</p>
                <p className="ar-p">Every Monday morning: what your agents did, what they brought to you, and anything they’ve earned more freedom for. Sent to your business email.</p>
              </div>
              <button type="button" role="switch" aria-checked={data.digest.enabled} aria-label="Weekly summary email" className={`ar-switch ${data.digest.enabled ? 'on' : ''}`} onClick={toggleDigest} disabled={savingDigest}><span /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const CSS = `
.ar .ar-card{background:#fff;border:1px solid var(--border);border-radius:20px;padding:18px}
@media (min-width:640px){.ar .ar-card{padding:22px}}
.ar-strip{margin-bottom:16px}
.ar-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
.ar-h{margin:0;font-size:15px;font-weight:700;color:var(--ink)}
.ar-p{margin:4px 0 0;font-size:13.5px;color:var(--slate);line-height:1.5}
.ar-link{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:700;color:var(--coral);text-decoration:none;white-space:nowrap}
.ar-link:hover{text-decoration:underline}
.ar-back{display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:600;color:var(--slate);text-decoration:none;margin-bottom:10px}
.ar-back:hover{color:var(--ink)}
.ar-top{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:18px}
.ar-title{margin:0;font-size:clamp(22px,3.4vw,28px);font-weight:800;letter-spacing:-0.02em;color:var(--ink)}
.ar-sub{margin:4px 0 0;font-size:14px;color:var(--slate);max-width:640px;line-height:1.5}
.ar-seg{position:relative;display:inline-grid;grid-template-columns:repeat(3,1fr);padding:3px;border-radius:12px;background:color-mix(in srgb,var(--slate) 10%,#fff);flex-shrink:0}
.ar-seg button{position:relative;z-index:1;padding:7px 14px;border:none;background:none;font-size:13px;font-weight:600;color:var(--slate);cursor:pointer;font-family:inherit;white-space:nowrap;transition:color .25s ease}
.ar-seg button.on{color:var(--ink)}
.ar-seg-pill{position:absolute;top:3px;left:3px;width:calc((100% - 6px)/3);height:calc(100% - 6px);border-radius:9px;background:#fff;box-shadow:0 1px 3px rgba(15,23,42,.12);transition:transform .35s ${EASE}}
.ar-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.ar-tiles.big{margin-bottom:14px}
.ar-tiles.big .ar-tile{background:#fff;border-radius:18px}
.ar-tile{display:flex;flex-direction:column;gap:3px;min-width:0;padding:14px;border:1px solid var(--border);border-radius:14px;background:color-mix(in srgb,var(--canvas,#f6f7f9) 50%,#fff)}
.ar-tile-l{font-size:12.5px;color:var(--slate)}
.ar-tile-v{font-size:26px;font-weight:700;color:var(--ink);letter-spacing:-0.01em;line-height:1.15}
.ar-tiles.big .ar-tile-v{font-size:30px}
.ar-tile-n{font-size:12px;color:var(--slate);line-height:1.4}
.ar-delta{display:inline-flex;align-items:center;gap:3px;margin-top:4px;font-size:11.5px;font-weight:600;color:var(--slate)}
.ar-delta.good{color:#067647}.ar-delta.bad{color:#b42318}
.ar-sec{margin-bottom:14px}
.ar-sec > .ar-tiles{margin-top:12px}
.ar-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:14px;margin-bottom:0}
.ar-table-wrap{overflow-x:auto;margin-top:10px;-webkit-overflow-scrolling:touch}
.ar-table{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums;min-width:520px}
.ar-table th{text-align:right;font-size:11.5px;font-weight:700;color:var(--slate);padding:8px 6px;border-bottom:1px solid var(--border);white-space:nowrap}
.ar-table td{text-align:right;padding:9px 6px;border-bottom:1px solid color-mix(in srgb,var(--border) 60%,transparent);color:var(--ink)}
.ar-table th:first-child,.ar-table td:first-child{text-align:left;font-weight:600}
.ar-table td.bad{color:#b42318;font-weight:700}
.ar-ex{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:2px}
.ar-ex li{display:flex;align-items:flex-start;gap:8px;padding:9px 0;border-bottom:1px solid color-mix(in srgb,var(--border) 60%,transparent);font-size:13px;color:var(--ink)}
.ar-ex li:last-child{border-bottom:none}
.ar-ex-t{flex:1;min-width:0;line-height:1.45}
.ar-chip{flex-shrink:0;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap}
.ar-chip.warn{background:#fffaeb;color:#b54708}.ar-chip.bad{background:#fef3f2;color:#b42318}
.ar-facts{margin:10px 0 0;padding-left:18px;font-size:13.5px;color:var(--ink);line-height:1.7}
.ar-foot{margin:10px 0 0;font-size:12px;color:var(--slate)}
.ar-trust{display:flex;flex-direction:column;gap:10px;margin-top:12px}
.ar-trust-item{display:flex;gap:12px;align-items:flex-start;padding:14px;border:1px solid var(--border);border-radius:16px;background:linear-gradient(180deg,#fff,color-mix(in srgb,var(--coral) 3%,#fff));animation:arIn .45s ${EASE} both}
.ar-trust-ic{width:34px;height:34px;flex-shrink:0;border-radius:11px;display:inline-flex;align-items:center;justify-content:center;background:#ecfdf3;color:#067647}
.ar-trust-t{margin:0;font-size:14px;font-weight:700;color:var(--ink)}
.ar-trust-d{margin:3px 0 0;font-size:13px;color:var(--slate);line-height:1.45}
.ar-meter{margin-top:8px;height:6px;border-radius:999px;background:#d1fadf;overflow:hidden;max-width:260px}
.ar-meter span{display:block;height:100%;border-radius:999px;background:#12b76a;transition:width .6s ${EASE}}
.ar-trust-a{display:flex;flex-direction:column;gap:6px;flex-shrink:0}
.ar-primary{height:36px;padding:0 14px;border-radius:11px;border:none;background:var(--coral);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;transition:transform .15s ${EASE},opacity .2s ease}
.ar-primary:active:not(:disabled){transform:scale(.97)}.ar-primary:disabled{opacity:.5;cursor:default}
.ar-ghost{height:32px;padding:0 12px;border-radius:10px;border:1px solid var(--border);background:#fff;color:var(--slate);font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit}
.ar-err{margin:10px 0;padding:10px 12px;border-radius:12px;background:#fef3f2;color:#b42318;font-size:13px}
.ar-digest{display:flex;align-items:center;gap:14px}
.ar-switch{position:relative;width:46px;height:28px;flex-shrink:0;border-radius:999px;border:none;cursor:pointer;background:color-mix(in srgb,var(--slate) 28%,transparent);transition:background .3s ${EASE}}
.ar-switch span{position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .3s ${EASE}}
.ar-switch.on{background:var(--coral)}.ar-switch.on span{transform:translateX(18px)}
.ag-fade-in{animation:arIn .45s ${EASE} both}
@keyframes arIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.ag-fade-in,.ar-trust-item{animation:none}}
@media (max-width:900px){.ar-grid{grid-template-columns:1fr}}
@media (max-width:760px){.ar-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:560px){
  .ar-trust-item{flex-wrap:wrap}
  .ar-trust-a{flex-direction:row;width:100%;padding-left:46px}
  .ar-tile-v{font-size:22px}.ar-tiles.big .ar-tile-v{font-size:24px}
  .ar-seg{width:100%}
}
`
