'use client'

// The Responses tab of a poll or survey: one line per person (poll) or per
// response (survey), newest first, with select, delete and CSV export.
// Deletes go through /api/engage/responses (the page passes onDelete).

import { useMemo, useState } from 'react'
import { formatDateTime, relativeTime, safeFileName, toCsv } from '@/components/form-results/aggregate'
import { Icon } from '@/components/form-results/icons'
import { exportRows, type AnswerLine } from '@/lib/engage-table'
import { EngageIcon } from './icons'

const PAGE = 100

export function AnswersTable({ kind, title, table, now, onDelete, onReset, deleting }: {
  kind: 'poll' | 'survey'
  title: string
  table: { header: string[]; lines: AnswerLine[] }
  now: number
  onDelete: (ids: string[], count: number) => void
  onReset?: () => void
  deleting: boolean
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(PAGE)
  const q = query.trim().toLowerCase()
  const lines = useMemo(() => (q ? table.lines.filter(l => [...l.cells, l.name, l.contact].some(c => c.toLowerCase().includes(q))) : table.lines), [table.lines, q])
  const picked = lines.filter(l => selected.has(l.key))
  const allOn = lines.length > 0 && lines.slice(0, shown).every(l => selected.has(l.key))
  const hasWho = table.lines.some(l => l.name || l.contact)

  const toggle = (k: string) => setSelected(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const toggleAll = () => setSelected(prev => {
    const n = new Set(prev)
    const page = lines.slice(0, shown)
    if (allOn) page.forEach(l => n.delete(l.key)); else page.forEach(l => n.add(l.key))
    return n
  })

  const exportCsv = (only: AnswerLine[]) => {
    const { header, body } = exportRows({ header: table.header, lines: only }, iso => (iso ? formatDateTime(iso) : ''))
    const blob = new Blob([toCsv(header, body)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${safeFileName(title)}-${kind === 'poll' ? 'votes' : 'responses'}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  if (!table.lines.length) {
    return (
      <div className="fr-card" style={{ padding: '48px 24px', textAlign: 'center' }}>
        <Icon name="users" size={36} stroke="var(--slate)" strokeWidth={1.5} style={{ marginBottom: 10 }} />
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 6px' }}>No {kind === 'poll' ? 'votes' : 'responses'} yet</h2>
        <p className="fr-muted" style={{ margin: 0, fontSize: 13.5 }}>Share the link or QR code from the Share tab to get started.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="eg-row" style={{ marginBottom: 12 }}>
        <label className="fl-search" style={{ flex: '1 1 240px', height: 36, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', border: '1px solid var(--fr-strong, #e4e4e7)', borderRadius: 10, background: 'var(--card, #fff)', color: 'var(--slate)' }}>
          <Icon name="search" size={15} />
          <input type="search" value={query} onChange={e => { setQuery(e.target.value); setShown(PAGE) }} placeholder={`Search ${kind === 'poll' ? 'votes' : 'responses'}`} aria-label="Search"
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--ink)' }} />
        </label>
        <button type="button" className="fr-btn" onClick={() => exportCsv(picked.length ? picked : lines)}>
          <EngageIcon name="download" size={15} />{picked.length ? `Export ${picked.length} selected` : 'Export CSV'}
        </button>
        {onReset && <button type="button" className="fr-btn fr-btn-danger" onClick={onReset} disabled={deleting}><EngageIcon name="refresh" size={15} />Reset all votes</button>}
      </div>

      {picked.length > 0 && (
        <div className="fr-bulk" role="status">
          <b>{picked.length} selected</b>
          <button type="button" className="fr-btn fr-btn-sm fr-btn-danger" disabled={deleting} onClick={() => onDelete(picked.flatMap(l => l.ids), picked.length)}>
            <Icon name="trash" size={13} />{deleting ? 'Deleting…' : 'Delete'}
          </button>
          <button type="button" className="fr-link" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <div className="fr-card fr-tablewrap">
        <table className="fr-table eg-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}><input type="checkbox" className="fr-check" checked={allOn} onChange={toggleAll} aria-label="Select all shown" /></th>
              <th>Submitted</th>
              {table.header.map((h, i) => <th key={i} title={h}>{h}</th>)}
              {hasWho && <th>Name</th>}
              {hasWho && <th>Email or mobile</th>}
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {lines.slice(0, shown).map(l => (
              <tr key={l.key} className={selected.has(l.key) ? 'on' : undefined}>
                <td><input type="checkbox" className="fr-check" checked={selected.has(l.key)} onChange={() => toggle(l.key)} aria-label="Select" /></td>
                <td title={formatDateTime(l.at)}>{l.at ? relativeTime(l.at, now) : '—'}</td>
                {l.cells.map((c, i) => <td key={i} className={i === l.cells.length - 1 ? 'is-wrap' : undefined} title={c}>{c || <span className="fr-dash">—</span>}</td>)}
                {hasWho && <td>{l.name || <span className="fr-dash">—</span>}</td>}
                {hasWho && <td>{l.contact || <span className="fr-dash">—</span>}</td>}
                <td>{l.fromCampaign ? 'SMS campaign' : 'Link'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lines.length > shown && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button type="button" className="fr-btn" onClick={() => setShown(n => n + PAGE)}>Show more ({(lines.length - shown).toLocaleString('en-AU')} left)</button>
        </div>
      )}
    </div>
  )
}
