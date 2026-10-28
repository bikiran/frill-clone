'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { formatVariable, variablesInUse, type LogicForm } from '@/lib/form-logic'
import { cellFor, exportQuestions, formatDateTime, formatDuration, prep, plural, titleOr, type ResultRow, type VerifyContext } from './aggregate'
import { Icon } from './icons'
import EmptyScroll from '@/components/EmptyScroll'

const PAGE = 50

/** Typeform-like table: sticky first column, horizontal scroll, select + bulk delete, row click opens the drawer. */
export function ResponsesTable({ rows, logic, verify, selected, onSelect, onOpen, openId, sortDesc, onSort, onDelete, deleting }: {
  rows: ResultRow[]
  logic: LogicForm
  verify: VerifyContext | null
  selected: Set<string>
  onSelect: (next: Set<string>) => void
  onOpen: (id: string) => void
  openId: string | null
  sortDesc: boolean
  onSort: () => void
  onDelete: (ids: string[]) => void
  deleting: string | null
}) {
  const [limit, setLimit] = useState(PAGE)
  const qs = useMemo(() => exportQuestions(logic), [logic])
  const vars = useMemo(() => variablesInUse(logic), [logic])
  const headRef = useRef<HTMLInputElement | null>(null)
  const selectedHere = useMemo(() => rows.reduce((n, r) => n + (selected.has(r.id) ? 1 : 0), 0), [rows, selected])
  const allOn = rows.length > 0 && selectedHere === rows.length
  useEffect(() => { if (headRef.current) headRef.current.indeterminate = selectedHere > 0 && !allOn }, [selectedHere, allOn])

  if (rows.length === 0) {
    return <div className="fr-card" style={{ padding: '24px 12px' }}><EmptyScroll kinds={['form']} title="No responses match" line="Try clearing a filter or the search to see more." /></div>
  }

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    onSelect(next)
  }
  const toggleAll = () => onSelect(allOn ? new Set() : new Set(rows.map(r => r.id)))
  const shownRows = rows.slice(0, limit)
  const selectedIds = rows.filter(r => selected.has(r.id)).map(r => r.id)

  return (
    <div>
      {selectedHere > 0 && (
        <div className="fr-bulk" role="region" aria-label="Selection">
          <b>{selectedHere.toLocaleString('en-AU')} selected</b>
          <button type="button" className="fr-btn fr-btn-sm fr-btn-danger" disabled={!!deleting} onClick={() => onDelete(selectedIds)}>
            <Icon name="trash" size={14} />{deleting || 'Delete'}
          </button>
          <button type="button" className="fr-link" disabled={!!deleting} onClick={() => onSelect(new Set())}>Clear</button>
        </div>
      )}
      <div className="fr-card fr-tablewrap">
        <table className="fr-table">
          <thead>
            <tr>
              <th className="fr-sticky" scope="col">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <input ref={headRef} type="checkbox" className="fr-check" checked={allOn} onChange={toggleAll}
                    aria-label={allOn ? 'Clear selection' : `Select all ${rows.length} responses`} />
                  <button type="button" onClick={onSort} aria-label={`Sort by submitted date, ${sortDesc ? 'oldest' : 'newest'} first`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer' }}>
                    Submitted<Icon name={sortDesc ? 'down' : 'up'} size={13} />
                  </button>
                </span>
              </th>
              <th scope="col">Time</th>
              {qs.map(q => {
                const n = logic.indexOf[q.id] + 1
                const label = `${n}. ${titleOr(q)}`
                return <th scope="col" key={q.id} title={label}>{label}</th>
              })}
              {vars.map(v => <th scope="col" key={`v-${v.id}`} title={`Variable: ${v.label}`}>{v.label}</th>)}
              <th scope="col">Path</th>
            </tr>
          </thead>
          <tbody>
            {shownRows.map(r => {
              const p = prep(r)
              const on = selected.has(r.id)
              return (
                <tr key={r.id} className={`fr-row${on || openId === r.id ? ' on' : ''}`} onClick={() => onOpen(r.id)}
                  onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(r.id) }} tabIndex={0} aria-label={`Response from ${formatDateTime(r.created_at)}`}>
                  <td className="fr-sticky">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      <input type="checkbox" className="fr-check" checked={on} aria-label="Select response"
                        onClick={e => e.stopPropagation()} onChange={() => toggle(r.id)} />
                      <span>{formatDateTime(r.created_at)}</span>
                    </span>
                  </td>
                  <td className="fr-muted">{formatDuration(r.response_time_seconds)}</td>
                  {qs.map(q => {
                    const c = cellFor(r, q, verify)
                    if (c.state === 'skipped') return <td key={q.id}><span className="fr-skip">Skipped</span></td>
                    if (c.state === 'empty') return <td key={q.id}><span className="fr-dash">—</span></td>
                    const warn = (q.type === 'payment' || q.type === 'scheduler') && c.text.startsWith('Unverified')
                    return <td key={q.id} title={c.text} style={warn ? { color: '#b45309' } : undefined}>{c.text}</td>
                  })}
                  {vars.map(v => {
                    const x = p.logic?.variables[v.id]
                    return <td key={`v-${v.id}`} style={{ fontVariantNumeric: 'tabular-nums' }}>{typeof x === 'number' ? formatVariable(x) : <span className="fr-dash">—</span>}</td>
                  })}
                  <td className="fr-muted">{p.logic ? plural(p.logic.path.length, 'question') : 'Not recorded'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
          <button type="button" className="fr-btn" onClick={() => setLimit(l => l + PAGE)}>Load more ({(rows.length - limit).toLocaleString('en-AU')} left)</button>
        </div>
      )}
    </div>
  )
}
