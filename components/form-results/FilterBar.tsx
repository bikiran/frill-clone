'use client'

import { useEffect, useRef, useState } from 'react'
import { choicesOf, variablesInUse, type FormQuestion, type LogicForm } from '@/lib/form-logic'
import {
  answerOpsFor, describeFilter, presetRange, titleOf, titleOr, ANSWER_OP_LABEL,
  type AnswerOp, type DatePreset, type ResultsFilter,
} from './aggregate'
import { Icon } from './icons'

export type ExportFormat = 'csv' | 'excel' | 'pdf'

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'all', label: 'All time' }, { key: 'today', label: 'Today' }, { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' }, { key: '90d', label: 'Last 90 days' }, { key: 'custom', label: 'Custom…' },
]

function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open])
  return { open, setOpen, ref }
}

const num = (s: string): number | undefined => {
  if (s.trim() === '') return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

export function FilterBar({ filters, onChange, logic, shown, total, loadingMore, onExport, selectedCount, exportBusy, exportNote }: {
  filters: ResultsFilter[]
  onChange: (f: ResultsFilter[]) => void
  logic: LogicForm
  shown: number
  total: number
  loadingMore: boolean
  onExport: (format: ExportFormat, selectedOnly: boolean) => void
  selectedCount: number
  exportBusy: ExportFormat | null
  /** Why exporting is paused (e.g. payments are still being checked). */
  exportNote?: string | null
}) {
  const date = filters.find(f => f.kind === 'date') as Extract<ResultsFilter, { kind: 'date' }> | undefined
  const preset: DatePreset = date?.preset || (date && (date.from || date.to) ? 'custom' : 'all')
  const others = filters.filter(f => f.kind !== 'date')

  const setDate = (next: Extract<ResultsFilter, { kind: 'date' }> | null) => {
    onChange([...(next ? [next] : []), ...others])
  }
  const pickPreset = (p: DatePreset) => {
    if (p === 'all') return setDate(null)
    if (p === 'custom') return setDate({ kind: 'date', preset: 'custom', from: date?.from, to: date?.to })
    setDate({ kind: 'date', preset: p, ...presetRange(p) })
  }

  const exp = usePopover()
  const disabledExport = shown === 0 || !!exportBusy || !!exportNote

  return (
    <div className="fr-filterbar" role="toolbar" aria-label="Filters">
      <Icon name="calendar" size={15} stroke="var(--slate)" />
      <select className="fr-select" aria-label="Date range" value={preset} onChange={e => pickPreset(e.target.value as DatePreset)}>
        {PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>
      {preset === 'custom' && (
        <>
          <input type="date" className="fr-input" aria-label="From date" value={date?.from || ''} max={date?.to || undefined}
            onChange={e => setDate({ kind: 'date', preset: 'custom', from: e.target.value || undefined, to: date?.to })} />
          <span className="fr-muted" style={{ fontSize: 12 }}>to</span>
          <input type="date" className="fr-input" aria-label="To date" value={date?.to || ''} min={date?.from || undefined}
            onChange={e => setDate({ kind: 'date', preset: 'custom', from: date?.from, to: e.target.value || undefined })} />
        </>
      )}

      <AddFilter logic={logic} onAdd={f => onChange([...filters, f])} />

      {others.map((f, i) => (
        <span className="fr-fchip" key={i} title={describeFilter(f, logic)}>
          <span>{describeFilter(f, logic)}</span>
          <button type="button" aria-label={`Remove filter: ${describeFilter(f, logic)}`} onClick={() => onChange(filters.filter(x => x !== f))}><Icon name="x" size={13} /></button>
        </span>
      ))}
      {filters.length > 0 && <button type="button" className="fr-link" onClick={() => onChange([])}>Clear all</button>}

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        {loadingMore && <span className="fr-muted" style={{ fontSize: 12 }}>Loading more responses…</span>}
        <span className="fr-muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>Showing {shown.toLocaleString('en-AU')} of {total.toLocaleString('en-AU')}</span>
        <div ref={exp.ref} style={{ position: 'relative' }}>
          <button type="button" className="fr-btn fr-btn-sm" aria-haspopup="menu" aria-expanded={exp.open} onClick={() => exp.setOpen(o => !o)}
            disabled={shown === 0 && selectedCount === 0} title={exportNote || undefined}>
            <Icon name="download" size={14} />{exportBusy ? 'Exporting…' : 'Export'}<Icon name="down" size={13} />
          </button>
          {exp.open && (
            <div className="fr-pop" role="menu" style={{ right: 0, minWidth: 220 }}>
              {exportNote && <p className="fr-muted" style={{ fontSize: 12, margin: '4px 10px 6px' }}>{exportNote}</p>}
              <div className="fr-menu-label">{shown.toLocaleString('en-AU')} {filters.length ? 'filtered ' : ''}responses</div>
              {(['csv', 'excel', 'pdf'] as ExportFormat[]).map(f => (
                <button key={f} type="button" role="menuitem" className="fr-menu-item" disabled={disabledExport}
                  onClick={() => { exp.setOpen(false); onExport(f, false) }}>
                  <Icon name="file" size={14} />{f === 'csv' ? 'CSV' : f === 'excel' ? 'Excel (.xlsx)' : 'PDF'}
                </button>
              ))}
              {selectedCount > 0 && (
                <>
                  <div className="fr-menu-label">Export {selectedCount.toLocaleString('en-AU')} selected</div>
                  {(['csv', 'excel', 'pdf'] as ExportFormat[]).map(f => (
                    <button key={f} type="button" role="menuitem" className="fr-menu-item" disabled={!!exportBusy || !!exportNote}
                      onClick={() => { exp.setOpen(false); onExport(f, true) }}>
                      <Icon name="file" size={14} />{f === 'csv' ? 'CSV' : f === 'excel' ? 'Excel (.xlsx)' : 'PDF'}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

type Source = { kind: 'question'; q: FormQuestion; index: number } | { kind: 'variable'; id: string; label: string }

function AddFilter({ logic, onAdd }: { logic: LogicForm; onAdd: (f: ResultsFilter) => void }) {
  const pop = usePopover()
  const [src, setSrc] = useState<Source | null>(null)
  const [op, setOp] = useState<AnswerOp>('answered')
  const [values, setValues] = useState<string[]>([])
  const [text, setText] = useState('')
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')
  const [search, setSearch] = useState('')

  const reset = () => { setSrc(null); setValues([]); setText(''); setMin(''); setMax(''); setSearch('') }
  const close = () => { pop.setOpen(false); reset() }
  useEffect(() => { if (!pop.open) reset() }, [pop.open])

  const questions = logic.questions.map((q, index) => ({ q, index })).filter(x => answerOpsFor(x.q).length > 0)
  const vars = variablesInUse(logic)
  const s = search.trim().toLowerCase()
  const qList = s ? questions.filter(x => `${x.index + 1}. ${titleOf(x.q)}`.toLowerCase().includes(s)) : questions
  const vList = s ? vars.filter(v => v.label.toLowerCase().includes(s)) : vars

  const choose = (next: Source) => {
    setSrc(next)
    if (next.kind === 'question') setOp(answerOpsFor(next.q)[0])
  }

  const canApply = (() => {
    if (!src) return false
    if (src.kind === 'variable') return num(min) !== undefined || num(max) !== undefined
    if (op === 'is_any') return values.length > 0
    if (op === 'contains') return text.trim() !== ''
    if (op === 'between') return num(min) !== undefined || num(max) !== undefined
    return true
  })()

  const apply = () => {
    if (!src || !canApply) return
    if (src.kind === 'variable') onAdd({ kind: 'variable', variableId: src.id, min: num(min), max: num(max) })
    else {
      const f: Extract<ResultsFilter, { kind: 'answer' }> = { kind: 'answer', questionId: src.q.id, op }
      if (op === 'is_any') f.values = values
      if (op === 'contains') f.text = text.trim()
      if (op === 'between') { f.min = num(min); f.max = num(max) }
      onAdd(f)
    }
    close()
  }

  return (
    <div ref={pop.ref} style={{ position: 'relative' }}>
      <button type="button" className="fr-btn fr-btn-sm" aria-haspopup="dialog" aria-expanded={pop.open} onClick={() => pop.setOpen(o => !o)}>
        <Icon name="plus" size={14} />Add filter
      </button>
      {pop.open && (
        <div className="fr-pop" role="dialog" aria-label="Add filter" style={{ left: 0, width: 320 }}>
          {!src ? (
            <>
              <input className="fr-input" style={{ width: '100%', marginBottom: 6 }} placeholder="Find a question or variable" aria-label="Find a question or variable"
                value={search} onChange={e => setSearch(e.target.value)} autoFocus />
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {vList.length > 0 && <div className="fr-menu-label">Variables</div>}
                {vList.map(v => (
                  <button key={v.id} type="button" className="fr-menu-item" onClick={() => choose({ kind: 'variable', id: v.id, label: v.label })}>
                    <Icon name="hash" size={14} stroke="var(--slate)" />{v.label}
                  </button>
                ))}
                {qList.length > 0 && <div className="fr-menu-label">Questions</div>}
                {qList.map(({ q, index }) => (
                  <button key={q.id} type="button" className="fr-menu-item" onClick={() => choose({ kind: 'question', q, index })}>
                    <span className="fr-muted" style={{ minWidth: 20, fontWeight: 700 }}>{index + 1}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titleOr(q)}</span>
                  </button>
                ))}
                {!qList.length && !vList.length && <p className="fr-muted" style={{ fontSize: 13, padding: '6px 10px' }}>Nothing matches</p>}
              </div>
            </>
          ) : (
            <div style={{ display: 'grid', gap: 10, padding: 4 }}>
              <button type="button" className="fr-link" style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => setSrc(null)}>
                <Icon name="left" size={13} />Back
              </button>
              <div style={{ fontSize: 13, fontWeight: 700, overflowWrap: 'anywhere' }}>
                {src.kind === 'variable' ? src.label : `${src.index + 1}. ${titleOr(src.q)}`}
              </div>
              {src.kind === 'question' && (
                <select className="fr-select" aria-label="Condition" value={op} onChange={e => setOp(e.target.value as AnswerOp)}>
                  {answerOpsFor(src.q).map(o => <option key={o} value={o}>{ANSWER_OP_LABEL[o]}</option>)}
                </select>
              )}
              {src.kind === 'question' && op === 'is_any' && (
                <div style={{ maxHeight: 200, overflowY: 'auto', display: 'grid', gap: 4 }}>
                  {choicesOf(src.q).map(c => (
                    <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" className="fr-check" checked={values.includes(c)}
                        onChange={e => setValues(v => (e.target.checked ? [...v, c] : v.filter(x => x !== c)))} />
                      <span style={{ overflowWrap: 'anywhere' }}>{c}</span>
                    </label>
                  ))}
                </div>
              )}
              {src.kind === 'question' && op === 'contains' && (
                <input className="fr-input" placeholder="Text to find" aria-label="Text to find" value={text} onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') apply() }} autoFocus />
              )}
              {(src.kind === 'variable' || op === 'between') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input className="fr-input" type="number" placeholder="Min" aria-label="Minimum" value={min} onChange={e => setMin(e.target.value)} style={{ width: '100%' }} />
                  <span className="fr-muted" style={{ fontSize: 12 }}>to</span>
                  <input className="fr-input" type="number" placeholder="Max" aria-label="Maximum" value={max} onChange={e => setMax(e.target.value)} style={{ width: '100%' }}
                    onKeyDown={e => { if (e.key === 'Enter') apply() }} />
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="fr-btn fr-btn-sm" onClick={close}>Cancel</button>
                <button type="button" className="fr-btn fr-btn-sm fr-btn-primary" disabled={!canApply} onClick={apply}>Apply</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
