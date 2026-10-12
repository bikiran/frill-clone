'use client'

import { useCallback, useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'

// Results page: the outcomes the business set ("every customer message
// answered within 15 minutes"), how often each was met, and how many are being
// missed right now. Each goal can be switched off or given a different target.

type Goal = { key: string; on: boolean; target: number; label: string; sentence: string; about: string; unit: 'minutes' | 'hours' | 'days'; options: number[]; met: number; missed: number; open: number; rate: number | null }
const EASE = 'cubic-bezier(.22,1,.36,1)'
const short = (n: number, unit: Goal['unit']) => unit === 'minutes' ? (n >= 60 && n % 60 === 0 ? `${n / 60} hr` : `${n} min`) : unit === 'hours' ? `${n} hr` : `${n} day${n === 1 ? '' : 's'}`

export function GoalsPanel({ companyId, days }: { companyId: string; days: number }) {
  const [goals, setGoals] = useState<Goal[] | null>(null)
  const [busy, setBusy] = useState('')
  const load = useCallback(async () => {
    try { const r = await authFetch(`/api/agent/goals?companyId=${companyId}&days=${days}`); if (r.ok) setGoals((await r.json()).goals || []) } catch {}
  }, [companyId, days])
  useEffect(() => { load() }, [load])

  const save = async (g: Goal, patch: Partial<Pick<Goal, 'on' | 'target'>>) => {
    setGoals(gs => gs?.map(x => x.key === g.key ? { ...x, ...patch } : x) || gs)
    setBusy(g.key)
    try {
      await authFetch('/api/agent/goals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, goals: { [g.key]: { on: patch.on ?? g.on, target: patch.target ?? g.target } } }) })
      await load()
    } finally { setBusy('') }
  }

  if (!goals) return <p className="gl-p">Loading goals…</p>
  return (
    <div className="gl">
      <style>{CSS}</style>
      {goals.map(g => {
        const pct = g.rate == null ? null : Math.round(g.rate * 100)
        return (
          <div key={g.key} className={`gl-row ${g.on ? '' : 'off'}`}>
            <div className="gl-main">
              <div className="gl-top">
                <p className="gl-t">{g.label}</p>
                <button type="button" role="switch" aria-checked={g.on} aria-label={`${g.label} goal`} className={`gl-switch ${g.on ? 'on' : ''}`} onClick={() => save(g, { on: !g.on })} disabled={busy === g.key}><span /></button>
              </div>
              <p className="gl-s">{g.sentence}</p>
              {g.on && (
                <div className="gl-opts" role="radiogroup" aria-label={`${g.label} target`}>
                  {g.options.map(o => <button key={o} type="button" role="radio" aria-checked={g.target === o} className={g.target === o ? 'on' : ''} onClick={() => save(g, { target: o })} disabled={busy === g.key}>{short(o, g.unit)}</button>)}
                </div>
              )}
              <p className="gl-about">{g.about}</p>
            </div>
            <div className="gl-score">
              <span className={`gl-pct ${pct == null ? '' : pct >= 90 ? 'good' : pct >= 70 ? 'ok' : 'bad'}`}>{pct == null ? '—' : `${pct}%`}</span>
              <span className="gl-n">{g.met + g.missed ? `met ${g.met} of ${g.met + g.missed}` : 'nothing to measure yet'}</span>
              {pct != null && <span className="gl-meter" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>}
              {g.on && g.open > 0 && <a className="gl-open" href="/admin/agents/needs-you">{g.open} missing now</a>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const CSS = `
.gl{display:flex;flex-direction:column;gap:10px;margin-top:12px}
.gl-p{margin:8px 0 0;font-size:13.5px;color:var(--slate)}
.gl-row{display:flex;gap:16px;align-items:flex-start;padding:14px;border:1px solid var(--border);border-radius:16px;background:#fff;transition:opacity .25s ease}
.gl-row.off{opacity:.6}
.gl-main{flex:1;min-width:0}
.gl-top{display:flex;align-items:center;gap:10px}
.gl-t{margin:0;font-size:14.5px;font-weight:700;color:var(--ink)}
.gl-s{margin:3px 0 0;font-size:13px;color:var(--ink);line-height:1.45}
.gl-about{margin:6px 0 0;font-size:12px;color:var(--slate);line-height:1.4}
.gl-opts{display:inline-flex;flex-wrap:wrap;gap:3px;padding:3px;margin-top:8px;border-radius:10px;background:var(--canvas,#f3f4f6)}
.gl-opts button{padding:5px 10px;border:none;border-radius:7px;background:transparent;font-size:12px;font-weight:600;color:var(--slate);cursor:pointer;font-family:inherit;transition:background .2s ease,color .2s ease,box-shadow .2s ease}
.gl-opts button.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(15,23,42,.12)}
.gl-score{display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;min-width:120px;text-align:right}
.gl-pct{font-size:24px;font-weight:700;color:var(--ink);line-height:1.1}
.gl-pct.good{color:#067647}.gl-pct.ok{color:#b54708}.gl-pct.bad{color:#b42318}
.gl-n{font-size:12px;color:var(--slate)}
.gl-meter{width:120px;height:6px;border-radius:999px;background:color-mix(in srgb,var(--slate) 14%,#fff);overflow:hidden;margin-top:3px}
.gl-meter span{display:block;height:100%;border-radius:999px;background:var(--ink);opacity:.75;transition:width .6s ${EASE}}
.gl-open{margin-top:4px;font-size:12px;font-weight:700;color:#b42318;text-decoration:none}
.gl-switch{position:relative;width:40px;height:24px;flex-shrink:0;margin-left:auto;border-radius:999px;border:none;cursor:pointer;background:color-mix(in srgb,var(--slate) 28%,transparent);transition:background .3s ${EASE}}
.gl-switch span{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .3s ${EASE}}
.gl-switch.on{background:var(--coral)}.gl-switch.on span{transform:translateX(16px)}
@media (max-width:600px){
  .gl-row{flex-direction:column;gap:10px}
  .gl-score{flex-direction:row;align-items:center;flex-wrap:wrap;gap:8px;text-align:left;min-width:0}
  .gl-meter{width:100px}
}
`
