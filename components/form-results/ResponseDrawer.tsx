'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { formatVariable, type FormQuestion, type LogicForm } from '@/lib/form-logic'
import { formatDateTime, formatDuration, pathSteps, prep, plural, titleOr, type ResultRow, type VerifyContext } from './aggregate'
import { AnswerView } from './AnswerView'
import { Icon, type IconName } from './icons'

function Chip({ icon, children, title }: { icon: IconName; children: ReactNode; title?: string }) {
  return <span className="fr-mchip" title={title}><Icon name={icon} size={12} /><span>{children}</span></span>
}

/** The side drawer: full response, the path taken (from the saved path) and the variables. */
export function ResponseDrawer({ row, logic, verify, color, onClose, onPrev, onNext, onDelete, deleting, position }: {
  row: ResultRow
  logic: LogicForm
  verify: VerifyContext | null
  color: string
  onClose: () => void
  onPrev: (() => void) | null
  onNext: (() => void) | null
  onDelete: (id: string) => void
  deleting: boolean
  position?: { index: number; total: number }
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [showSkipped, setShowSkipped] = useState(false)
  // Give focus back to whatever opened the drawer (the table row) when it closes.
  // Declared before the focus effect so it captures the opener, not the drawer.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    return () => { try { if (before && before !== ref.current && document.contains(before)) before.focus() } catch {} }
  }, [])
  useEffect(() => { ref.current?.focus() }, [row.id])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Leave Esc to a confirm dialog opened on top of the drawer.
      const a = document.activeElement
      if (a && a !== document.body && ref.current && !ref.current.contains(a)) return
      onClose()
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])

  const p = prep(row)
  const lg = p.logic
  const steps = pathSteps(row, logic)
  const qById = (id: string): FormQuestion | undefined => logic.questions[logic.indexOf[id]]
  const numberOf = (q: FormQuestion) => logic.indexOf[q.id] + 1

  // Answers: path order then offPath (new rows); every question in form order (older rows).
  let answerQs: FormQuestion[]
  let skipped: FormQuestion[] = []
  if (lg) {
    const ids = [...lg.path, ...(lg.offPath || []).filter(id => !lg.path.includes(id))]
    answerQs = ids.map(qById).filter((q): q is FormQuestion => !!q && q.type !== 'statement')
    const seen = new Set(ids)
    skipped = logic.questions.filter(q => q.type !== 'statement' && !seen.has(q.id))
  } else {
    answerQs = logic.questions.filter(q => q.type !== 'statement')
  }

  const varEntries = lg ? Object.entries(lg.variables).slice(0, 30).map(([id, v]) => ({ id, v, label: logic.variables.find(x => x.id === id)?.label || id })) : []
  const t = row.response_time_seconds
  const place = [row.city, row.country].filter(x => typeof x === 'string' && x).join(', ')

  return (
    <>
      <div className="fr-overlay" onClick={onClose} aria-hidden />
      <div className="fr-drawer" ref={ref} role="dialog" aria-modal="true" aria-label="Response" tabIndex={-1}>
        <div className="fr-drawer-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{formatDateTime(row.created_at)}</div>
            {position && <div className="fr-muted" style={{ fontSize: 12 }}>Response {position.index + 1} of {position.total.toLocaleString('en-AU')}</div>}
          </div>
          <button type="button" className="fr-icon-btn" onClick={onPrev || undefined} disabled={!onPrev} aria-label="Previous response" title="Previous"><Icon name="left" size={17} /></button>
          <button type="button" className="fr-icon-btn" onClick={onNext || undefined} disabled={!onNext} aria-label="Next response" title="Next"><Icon name="right" size={17} /></button>
          <button type="button" className="fr-icon-btn" onClick={() => onDelete(row.id)} disabled={deleting} aria-label="Delete response" title="Delete" style={{ color: '#dc2626' }}><Icon name="trash" size={16} /></button>
          <button type="button" className="fr-icon-btn" onClick={onClose} aria-label="Close" title="Close"><Icon name="x" size={17} /></button>
        </div>
        <div className="fr-drawer-body">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {typeof t === 'number' && t > 0 && <Chip icon="clock" title="Time to complete">{formatDuration(t)}</Chip>}
            {row.language && <Chip icon="globe" title="Language">{row.language}</Chip>}
            {row.screen_width ? <Chip icon="monitor" title="Screen size">{row.screen_width}×{row.screen_height || '?'}</Chip> : null}
            {place && <Chip icon="flag" title="Location">{place}</Chip>}
            {row.referrer && <Chip icon="external" title={row.referrer}>{row.referrer}</Chip>}
          </div>

          {varEntries.length > 0 && (
            <>
              <div className="fr-sec">Variables</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {varEntries.map(v => (
                  <span key={v.id} className="fr-mchip" style={{ color: 'var(--ink)' }}><span>{v.label} <b>{formatVariable(v.v)}</b></span></span>
                ))}
              </div>
            </>
          )}

          <div className="fr-sec">Path</div>
          {steps ? (
            <>
              <ol className="fr-steps">
                {steps.steps.map((s, i) => (
                  <li key={s.id + i} className="fr-step" style={s.deleted ? { color: 'var(--slate)' } : undefined}>
                    {s.label}{s.note && <small>{s.note}</small>}
                  </li>
                ))}
                <li className="fr-step"><b>Thank-you screen</b></li>
              </ol>
              {steps.offPath.length > 0 && (
                <p className="fr-muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>Also completed before changing route: {steps.offPath.map(s => s.label).join(', ')}</p>
              )}
            </>
          ) : (
            <p className="fr-muted" style={{ fontSize: 13, margin: 0 }}>Path not recorded for responses submitted before logic was added.</p>
          )}

          <div className="fr-sec">Answers</div>
          {answerQs.length === 0 && <p className="fr-muted" style={{ fontSize: 13 }}>No answers.</p>}
          {answerQs.map(q => (
            <div className="fr-ans" key={q.id}>
              <div className="fr-ans-q"><span style={{ color }}>{numberOf(q)}.</span> {titleOr(q)}</div>
              <div className="fr-ans-a"><AnswerView row={row} q={q} verify={verify} color={color} /></div>
            </div>
          ))}
          {skipped.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <button type="button" className="fr-link" aria-expanded={showSkipped} onClick={() => setShowSkipped(s => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name={showSkipped ? 'up' : 'down'} size={13} />{plural(skipped.length, 'question')} skipped
              </button>
              {showSkipped && (
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--slate)' }}>
                  {skipped.map(q => <li key={q.id}>{numberOf(q)}. {titleOr(q)}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
