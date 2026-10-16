'use client'

import { useState } from 'react'
import {
  describeGroup, describeTarget, formatVariable, variablesInUse,
  type BranchRule, type LogicForm, type LogicSummary,
} from '@/lib/form-logic'
import { formatDay, pct, plural, type StatsResult } from './aggregate'
import { Icon } from './icons'

function HBar({ label, value, of, color, sub }: { label: string; value: number; of: number; color: string; sub?: string }) {
  return (
    <div className="fr-funnel-row">
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{label}{sub && <span className="fr-muted" style={{ fontSize: 11.5, marginLeft: 6 }}>{sub}</span>}</span>
      <span className="fr-bar-num">{value.toLocaleString('en-AU')}{of > 0 ? ` · ${pct(value, of)}%` : ''}</span>
      <div className="fr-track"><div className="fr-fill" style={{ width: `${of > 0 ? Math.min(100, (value / of) * 100) : 0}%`, background: color }} /></div>
    </div>
  )
}

const title = (logic: LogicForm, id: string) => {
  const i = logic.indexOf[id]
  if (i === undefined) return '(deleted question)'
  return `${i + 1}. ${logic.questions[i].title?.trim() || 'Untitled question'}`
}

/** Logic results: drop-off, branch counts and variable distributions. */
export function PathsPanel({ logic, summary, stats, submittedSince, color, onVariableFilter }: {
  logic: LogicForm
  summary: LogicSummary
  stats: StatsResult | null
  /** Submitted responses since tracking began (date filter only), for the tracked funnel. */
  submittedSince: number | null
  color: string
  onVariableFilter: (variableId: string, min?: number, max?: number) => void
}) {
  const tracked = stats && stats.tracked ? stats : null
  const branchIds = logic.questions.filter(q => summary.branches[q.id]).map(q => q.id)
  const vars = variablesInUse(logic)

  return (
    <div className="fr-paths">
      <section className="fr-card" style={{ padding: 18 }} aria-labelledby="fr-dropoff">
        <h3 id="fr-dropoff" style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>Drop-off</h3>
        {tracked ? (
          <>
            <p className="fr-muted" style={{ fontSize: 12.5, margin: '0 0 14px' }}>Since {formatDay(tracked.since)}</p>
            <HBar label="Views" value={tracked.views} of={tracked.views} color={color} />
            <HBar label="Started" value={tracked.starts} of={tracked.views} color={color} />
            {logic.questions.map(q => {
              const n = tracked.abandons[q.id] || 0
              return <HBar key={q.id} label={`Left at ${title(logic, q.id)}`} value={n} of={tracked.views} color="#dc2626" />
            })}
            <HBar label="Submitted" value={submittedSince ?? 0} of={tracked.views} color="#16a34a" />
            <p className="fr-muted" style={{ fontSize: 11.5, margin: '10px 0 0', display: 'flex', gap: 6 }}>
              <Icon name="info" size={13} />Drop-off is approximate: some browsers don't report when people leave.
            </p>
          </>
        ) : (
          <>
            <p className="fr-muted" style={{ fontSize: 12.5, margin: '0 0 14px' }}>Counts people who submitted. Views and drop-off aren't tracked for this form yet.</p>
            {summary.reach.map(r => (
              <HBar key={r.questionId} label={title(logic, r.questionId)} value={r.reached} of={summary.total} color={color}
                sub={summary.perQuestion[r.questionId]?.seenEstimated ? `includes ${summary.perQuestion[r.questionId].seenEstimated} estimated` : undefined} />
            ))}
          </>
        )}
        <div style={{ borderTop: '1px solid var(--fr-line)', marginTop: 12, paddingTop: 12, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
          <span><b>Thank-you screen</b></span>
          <span className="fr-bar-num">{summary.endings.default.toLocaleString('en-AU')}</span>
        </div>
      </section>

      <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
        {branchIds.length > 0 && (
          <section className="fr-card" style={{ padding: 18 }} aria-labelledby="fr-branches">
            <h3 id="fr-branches" style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>Branches</h3>
            <div style={{ display: 'grid', gap: 14 }}>
              {branchIds.map(qid => {
                const q = logic.questions[logic.indexOf[qid]]
                const entries = summary.branches[qid]
                const sum = entries.reduce((s, e) => s + e.count, 0)
                const rules = (q.branching && Array.isArray(q.branching.rules) ? q.branching.rules : []) as BranchRule[]
                return (
                  <div key={qid} style={{ border: '1px solid var(--fr-line)', borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="branch" size={14} stroke="var(--slate)" />After {title(logic, qid)}
                    </div>
                    {entries.map((e, i) => {
                      let label: string
                      if (e.ruleId === 'otherwise') label = `All other cases → ${describeTarget(e.to || undefined, logic, qid)}`
                      else if (e.ruleId === 'removed') label = 'Rule since removed'
                      else {
                        const r = rules.find(x => x && x.id === e.ruleId)
                        label = r ? `If ${describeGroup(r, logic) || '(no conditions)'} → ${describeTarget(e.to || undefined, logic, qid)}` : 'Rule'
                      }
                      return <HBar key={e.ruleId + i} label={label} value={e.count} of={sum} color={color} sub={e.estimated ? `includes ${e.estimated} estimated` : undefined} />
                    })}
                    {sum === 0 && <p className="fr-muted" style={{ fontSize: 12.5, margin: 0 }}>Nobody has reached this question yet.</p>}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {vars.map(v => <VariableCard key={v.id} id={v.id} label={v.label} s={summary.variables[v.id]} color={color} onFilter={onVariableFilter} />)}

        {branchIds.length === 0 && vars.length === 0 && (
          <section className="fr-card" style={{ padding: 18 }}>
            <p className="fr-muted" style={{ fontSize: 13, margin: 0 }}>This form has no branching or calculations yet. Add them from Logic in the form builder.</p>
          </section>
        )}
      </div>
    </div>
  )
}

function VariableCard({ id, label, s, color, onFilter }: {
  id: string; label: string; s: LogicSummary['variables'][string] | undefined; color: string
  onFilter: (variableId: string, min?: number, max?: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')
  const toN = (x: string) => (x.trim() === '' || !Number.isFinite(Number(x)) ? undefined : Number(x))
  const peak = s ? Math.max(1, ...s.histogram.map(b => b.count)) : 1
  const W = 300, H = 90, gap = 4
  const bw = s && s.histogram.length ? (W - gap * (s.histogram.length - 1)) / s.histogram.length : 0
  // The engine bins whole numbers one value per bin ([n, n+1), the last ending at max + 1).
  const intMode = !!s && s.histogram.length > 1 && s.histogram[s.histogram.length - 1].to === s.max + 1
  const binLabel = (b: { from: number; to: number }, last: boolean) =>
    b.from === b.to || intMode ? formatVariable(b.from) : `${formatVariable(b.from)} to ${last ? '' : 'under '}${formatVariable(b.to)}`

  return (
    <section className="fr-card" style={{ padding: 18 }} aria-label={`Variable ${label}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Icon name="hash" size={15} stroke={color} />
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, flex: 1, minWidth: 0 }}>{label}</h3>
        <button type="button" className="fr-btn fr-btn-sm" onClick={() => { setOpen(o => !o); if (s && s.count) { setMin(String(s.min)); setMax(String(s.max)) } }}>
          <Icon name="filter" size={13} />Filter by this
        </button>
      </div>
      {open && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input className="fr-input" type="number" aria-label={`${label} minimum`} placeholder="Min" value={min} onChange={e => setMin(e.target.value)} style={{ width: 100 }} />
          <span className="fr-muted" style={{ fontSize: 12 }}>to</span>
          <input className="fr-input" type="number" aria-label={`${label} maximum`} placeholder="Max" value={max} onChange={e => setMax(e.target.value)} style={{ width: 100 }} />
          <button type="button" className="fr-btn fr-btn-sm fr-btn-primary" disabled={toN(min) === undefined && toN(max) === undefined}
            onClick={() => { onFilter(id, toN(min), toN(max)); setOpen(false) }}>Apply</button>
        </div>
      )}
      {!s || s.count === 0 ? (
        <p className="fr-muted" style={{ fontSize: 13, margin: 0 }}>No saved values yet. Responses submitted before calculations were added don't have one.</p>
      ) : (
        <>
          <div className="fr-tiles" style={{ marginBottom: 14 }}>
            <div className="fr-tile"><b>{formatVariable(Math.round(s.avg * 100) / 100)}</b><span>Average</span></div>
            <div className="fr-tile"><b>{formatVariable(s.min)}</b><span>Min</span></div>
            <div className="fr-tile"><b>{formatVariable(s.max)}</b><span>Max</span></div>
            <div className="fr-tile"><b>{s.count.toLocaleString('en-AU')}</b><span>Responses</span></div>
          </div>
          <svg viewBox={`0 0 ${W} ${H + 18}`} width="100%" role="img" aria-label={`${label} distribution: ${s.histogram.map((b, i) => `${binLabel(b, i === s.histogram.length - 1)}: ${b.count}`).join(', ')}`}>
            {s.histogram.map((b, i) => {
              const h = Math.max(2, (b.count / peak) * H)
              const x = i * (bw + gap)
              const last = i === s.histogram.length - 1
              return (
                // Whole-number bins filter to exactly n; other bins exclude their upper edge (except the last).
                <g key={i} style={{ cursor: 'pointer' }} onClick={() => onFilter(id, b.from, intMode ? b.from : last ? b.to : b.to - 1e-9)}>
                  <title>{`${binLabel(b, last)}: ${plural(b.count, 'response')}. Click to filter.`}</title>
                  <rect x={x} y={H - h} width={bw} height={h} rx={3} fill={color} opacity={b.count ? 0.9 : 0.25} />
                  {s.histogram.length <= 10 && <text x={x + bw / 2} y={H + 13} textAnchor="middle" fontSize="9" fill="var(--slate)">{formatVariable(b.from)}</text>}
                </g>
              )
            })}
          </svg>
        </>
      )}
    </section>
  )
}
