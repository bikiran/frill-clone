'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { countRules, formatVariable, type FormQuestion, type LogicSummary } from '@/lib/form-logic'
import {
  questionStats, tintOf, typeLabel, pct, plural, formatMoney, formatBooking, formatDay,
  isWideCard, type QuestionStats, type ResultRow, type VerifyContext, type Bar,
} from './aggregate'
import { Icon } from './icons'

type Props = {
  q: FormQuestion
  index: number
  rows: ResultRow[]
  summary: LogicSummary | null
  verify: VerifyContext | null
  color: string
  onOpenRow?: (rowId: string) => void
}

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-AU', { maximumFractionDigits: 1 })

/** One summary card per question: header, "Seen by · Answered by", and the visual for its type. */
export function QuestionCard({ q, index, rows, summary, verify, color, onOpenRow }: Props) {
  const stats = useMemo(() => questionStats(q, rows, { summary, verify }), [q, rows, summary, verify])
  const tint = tintOf(q.type)
  const pq = summary?.perQuestion[q.id]
  const rules = countRules(q)
  return (
    <section className={`fr-card fr-qcard${isWideCard(q) ? ' fr-span2' : ''}`} aria-labelledby={`fr-q-${index}`}>
      <div className="fr-qhead">
        <span className="fr-num" style={{ background: tint.bg, color: tint.fg }}>{index + 1}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="fr-type">{typeLabel(q.type)}</div>
          <h3 className="fr-qtitle" id={`fr-q-${index}`}>{q.title?.trim() || 'Untitled question'}</h3>
        </div>
        {rules > 0 && <span className="fr-tag" title={`${plural(rules, 'logic rule')} on this question`}><Icon name="logic" size={12} />Logic</span>}
      </div>
      <div className="fr-meta">
        {pq ? (
          <>
            <span>Seen by {pq.seen.toLocaleString('en-AU')} · Answered by {pq.answered.toLocaleString('en-AU')}{pq.seen > 0 ? ` (${pct(pq.answered, pq.seen)}% of seen)` : ''}</span>
            {pq.seenEstimated > 0 && (
              <span title={`Includes ${pq.seenEstimated.toLocaleString('en-AU')} older responses where 'seen' is estimated from the current form.`} style={{ display: 'inline-flex' }}>
                <Icon name="info" size={13} title={`Includes ${pq.seenEstimated} older responses where 'seen' is estimated from the current form.`} />
              </span>
            )}
          </>
        ) : <span>No responses yet</span>}
      </div>
      <CardBody stats={stats} q={q} color={color} onOpenRow={onOpenRow} />
    </section>
  )
}

function Empty() {
  return <p className="fr-muted" style={{ fontSize: 13, margin: 0 }}>No answers yet</p>
}

function CardBody({ stats, q, color, onOpenRow }: { stats: QuestionStats; q: FormQuestion; color: string; onOpenRow?: (id: string) => void }) {
  switch (stats.kind) {
    case 'choice': return <ChoiceBody s={stats} color={color} />
    case 'legal': return (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span className="fr-big">{stats.accepted.toLocaleString('en-AU')}</span>
        <span className="fr-muted" style={{ fontSize: 13 }}>accepted</span>
      </div>
    )
    case 'scale': return <ScaleBody s={stats} color={color} />
    case 'number': return stats.count === 0 ? <Empty /> : (
      <div className="fr-tiles">
        <div className="fr-tile"><b>{formatVariable(stats.avg)}</b><span>Average</span></div>
        <div className="fr-tile"><b>{formatVariable(stats.min)}</b><span>Min</span></div>
        <div className="fr-tile"><b>{formatVariable(stats.max)}</b><span>Max</span></div>
        <div className="fr-tile"><b style={{ fontSize: 14 }}>{formatVariable(stats.sum)}</b><span>Sum</span></div>
      </div>
    )
    case 'text': return <TextBody items={stats.items} />
    case 'ranking': return stats.people === 0 ? <Empty /> : (
      <div>
        <p className="fr-muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>{plural(stats.people, 'person', 'people')} ranked · average position, 1 is the top</p>
        {(() => {
          const worst = Math.max(1, ...stats.items.map(i => i.avg))
          return stats.items.map((it, i) => (
            <div className="fr-bar-row" key={it.label}>
              <div className="fr-bar-top">
                <span className="fr-bar-label"><b style={{ color: 'var(--slate)', minWidth: 18 }}>{i + 1}</b>{it.label}</span>
                <span className="fr-bar-num">{it.count ? fmt1(it.avg) : '—'}</span>
              </div>
              <div className="fr-track"><div className="fr-fill" style={{ width: it.count ? `${Math.max(4, ((worst - it.avg + 1) / worst) * 100)}%` : 0, background: color }} /></div>
            </div>
          ))
        })()}
      </div>
    )
    case 'matrix': return stats.answered === 0 ? <Empty /> : (
      <div style={{ overflowX: 'auto' }}>
        <table className="fr-matrix">
          <thead><tr><th />{stats.cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {stats.rows.map((r, ri) => (
              <tr key={r}>
                <td>{r}</td>
                {stats.cols.map((c, ci) => {
                  const n = stats.counts[ri][ci]
                  const share = stats.rowTotals[ri] ? n / stats.rowTotals[ri] : 0
                  return <td key={c} style={{ background: `color-mix(in srgb, ${color} ${Math.round(share * 85)}%, var(--fr-soft))`, color: share > 0.55 ? '#fff' : undefined }} title={`${n} (${Math.round(share * 100)}% of ${r})`}>{n}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
    case 'media': return <MediaBody items={stats.items} onOpenRow={onOpenRow} />
    case 'payment': return (
      <div>
        {stats.checking > 0 && <p className="fr-muted" style={{ fontSize: 13, margin: '0 0 8px' }}>Checking payments…</p>}
        {stats.totals.length === 0 && stats.checking === 0 && <p className="fr-muted" style={{ fontSize: 13, margin: '0 0 8px' }}>No verified payments yet</p>}
        {stats.totals.map(t => (
          <div key={t.currency} style={{ marginBottom: 10 }}>
            <div className="fr-big">{formatMoney(t.cents, t.currency)}</div>
            <div className="fr-muted" style={{ fontSize: 12.5, marginTop: 4 }}>Total collected · {plural(t.count, 'payment')} · average {formatMoney(Math.round(t.cents / Math.max(1, t.count)), t.currency)}</div>
          </div>
        ))}
        {stats.refunded > 0 && <p className="fr-muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>{plural(stats.refunded, 'payment')} refunded</p>}
        {stats.unverified > 0 && (
          <p style={{ fontSize: 12.5, margin: '6px 0 0', color: '#b45309', display: 'flex', alignItems: 'center', gap: 6 }}
            title="These answers say a payment was made, but no matching paid payment for this form was found. They aren't counted.">
            <Icon name="alert" size={14} />{plural(stats.unverified, 'unverified payment')} not counted
          </p>
        )}
      </div>
    )
    case 'scheduler': return (
      <div>
        {stats.checking > 0 && <p className="fr-muted" style={{ fontSize: 13, margin: '0 0 8px' }}>Checking bookings…</p>}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
          <span className="fr-big">{stats.bookings.length.toLocaleString('en-AU')}</span>
          <span className="fr-muted" style={{ fontSize: 13 }}>{stats.bookings.length === 1 ? 'booking' : 'bookings'}</span>
        </div>
        {stats.next && <p style={{ fontSize: 13, margin: '0 0 10px' }}><span className="fr-muted">Next: </span><b>{formatBooking(stats.next.startsAt, stats.next.endsAt)}</b></p>}
        {stats.bookings.length > 0 && <ShowMoreList items={stats.bookings.map(b => ({ key: b.rowId + b.startsAt, text: formatBooking(b.startsAt, b.endsAt), onClick: onOpenRow ? () => onOpenRow(b.rowId) : undefined }))} />}
        {stats.cancelled > 0 && <p className="fr-muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>{plural(stats.cancelled, 'booking')} cancelled</p>}
        {stats.unverified > 0 && (
          <p style={{ fontSize: 12.5, margin: '6px 0 0', color: '#b45309', display: 'flex', alignItems: 'center', gap: 6 }}
            title="These answers name a booking time, but no matching booking was found in the calendar. They aren't counted.">
            <Icon name="alert" size={14} />{plural(stats.unverified, 'unverified booking')} not counted
          </p>
        )}
      </div>
    )
    default: return null
  }
}

function BarRow({ b, color, children }: { b: Bar; color: string; children?: ReactNode }) {
  return (
    <div className="fr-bar-row">
      <div className="fr-bar-top">
        <span className="fr-bar-label">
          {b.image && <img className="fr-thumb" src={b.image} alt="" />}
          <span>{b.label}</span>
          {b.hidden ? <span className="fr-muted" style={{ fontSize: 11.5 }}>hidden for {b.hidden.toLocaleString('en-AU')}</span> : null}
        </span>
        <span className="fr-bar-num">{b.count.toLocaleString('en-AU')} · {b.pct}%</span>
      </div>
      <div className="fr-track"><div className="fr-fill" style={{ width: `${b.pct}%`, background: color }} /></div>
      {children}
    </div>
  )
}

function OtherTexts({ items }: { items: NonNullable<Bar['otherTexts']> }) {
  const [open, setOpen] = useState(false)
  if (!items.length) return null
  const shown = open ? items : items.slice(0, 3)
  return (
    <div className="fr-other">
      {shown.map((t, i) => <div key={t.rowId + i} style={{ fontSize: 12.5, color: 'var(--ink)', padding: '2px 0', overflowWrap: 'anywhere' }}>{t.text}</div>)}
      {items.length > 3 && <button type="button" className="fr-link" style={{ fontSize: 12 }} onClick={() => setOpen(o => !o)}>{open ? 'Show fewer' : `Show all ${items.length} typed answers`}</button>}
    </div>
  )
}

function ChoiceBody({ s, color }: { s: Extract<QuestionStats, { kind: 'choice' }>; color: string }) {
  const [all, setAll] = useState(false)
  if (s.answered === 0 && !s.bars.length) return <Empty />
  const LIMIT = 8
  const bars = s.sorted && !all ? s.bars.slice(0, LIMIT) : s.bars
  return (
    <div>
      {s.multi && <p className="fr-muted" style={{ fontSize: 12, margin: '-4px 0 10px' }}>People could choose more than one</p>}
      {bars.map(b => (
        <BarRow key={b.label} b={b} color={color}>{b.otherTexts && <OtherTexts items={b.otherTexts} />}</BarRow>
      ))}
      {s.sorted && s.bars.length > LIMIT && (
        <button type="button" className="fr-link" onClick={() => setAll(a => !a)}>{all ? 'Show fewer' : `Show all ${s.bars.length} choices`}</button>
      )}
      {s.extra && (
        <BarRow b={s.extra} color="#a1a1aa">
          {s.extra.values.length > 0 && <div className="fr-other fr-muted" style={{ fontSize: 12 }}>{s.extra.values.slice(0, 10).join(', ')}{s.extra.values.length > 10 ? '…' : ''}</div>}
        </BarRow>
      )}
    </div>
  )
}

function ScaleBody({ s, color }: { s: Extract<QuestionStats, { kind: 'scale' }>; color: string }) {
  if (s.answered === 0) return <Empty />
  const peak = Math.max(1, ...s.columns.map(c => c.count))
  const tone = (v: number) => (s.type !== 'nps' ? color : v <= 6 ? '#dc2626' : v <= 8 ? '#d97706' : '#16a34a')
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
        {s.nps && (
          <div>
            <span className="fr-big" style={{ color: s.nps.score >= 0 ? '#16a34a' : '#dc2626' }}>{s.nps.score > 0 ? `+${s.nps.score}` : s.nps.score}</span>
            <span className="fr-muted" style={{ fontSize: 12.5, marginLeft: 6 }}>NPS</span>
          </div>
        )}
        <div>
          <span className={s.nps ? '' : 'fr-big'} style={s.nps ? { fontSize: 18, fontWeight: 800 } : undefined}>{fmt1(s.avg)}</span>
          <span className="fr-muted" style={{ fontSize: 12.5, marginLeft: 6 }}>/ {s.max} average · {plural(s.answered, 'answer')}</span>
        </div>
      </div>
      {s.nps && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: 'var(--fr-soft)' }} aria-hidden>
            <div style={{ width: `${pct(s.nps.detractors, s.answered)}%`, background: '#dc2626' }} />
            <div style={{ width: `${pct(s.nps.passives, s.answered)}%`, background: '#d97706' }} />
            <div style={{ width: `${pct(s.nps.promoters, s.answered)}%`, background: '#16a34a' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginTop: 6, gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: '#dc2626' }}>Detractors {pct(s.nps.detractors, s.answered)}%</span>
            <span style={{ color: '#d97706' }}>Passives {pct(s.nps.passives, s.answered)}%</span>
            <span style={{ color: '#16a34a' }}>Promoters {pct(s.nps.promoters, s.answered)}%</span>
          </div>
        </div>
      )}
      <div className="fr-cols" role="img" aria-label={s.columns.map(c => `${c.value}: ${c.count}`).join(', ')}>
        {s.columns.map(c => (
          <div className="fr-col" key={c.value} title={`${c.value}: ${c.count} (${pct(c.count, s.answered)}%)`}>
            <span className="fr-col-n">{c.count}</span>
            <div className="fr-col-bar" style={{ height: `${(c.count / peak) * 72}%`, background: tone(c.value), opacity: c.count ? 1 : 0.25 }} />
            <span className="fr-col-x">{c.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TextBody({ items }: { items: { text: string; at: string; rowId: string }[] }) {
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(5)
  const list = useMemo(() => {
    const s = query.trim().toLowerCase()
    return s ? items.filter(i => i.text.toLowerCase().includes(s)) : items
  }, [items, query])
  if (!items.length) return <Empty />
  return (
    <div>
      {items.length > 5 && (
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Icon name="search" size={14} stroke="var(--slate)" style={{ position: 'absolute', left: 10, top: 9 }} />
          <input className="fr-input" style={{ width: '100%', paddingLeft: 30 }} placeholder="Search answers" aria-label="Search answers"
            value={query} onChange={e => { setQuery(e.target.value); setShown(5) }} />
        </div>
      )}
      <div className="fr-list">
        {list.slice(0, shown).map((i, k) => (
          <div className="fr-li" key={i.rowId + k}>{i.text}<small>{formatDay(i.at)}</small></div>
        ))}
        {list.length === 0 && <p className="fr-muted" style={{ fontSize: 13, margin: 0 }}>No answers match</p>}
      </div>
      {list.length > shown && (
        <button type="button" className="fr-link" style={{ marginTop: 10 }} onClick={() => setShown(n => n + 10)}>Show more ({list.length - shown} left)</button>
      )}
    </div>
  )
}

function ShowMoreList({ items }: { items: { key: string; text: string; onClick?: () => void }[] }) {
  const [shown, setShown] = useState(5)
  return (
    <div>
      <div className="fr-list">
        {items.slice(0, shown).map(i => i.onClick
          ? <button type="button" key={i.key} className="fr-li" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={i.onClick}>{i.text}</button>
          : <div key={i.key} className="fr-li">{i.text}</div>)}
      </div>
      {items.length > shown && <button type="button" className="fr-link" style={{ marginTop: 10 }} onClick={() => setShown(n => n + 10)}>Show more ({items.length - shown} left)</button>}
    </div>
  )
}

function MediaBody({ items, onOpenRow }: { items: Extract<QuestionStats, { kind: 'media' }>['items']; onOpenRow?: (id: string) => void }) {
  const [all, setAll] = useState(false)
  if (!items.length) return <Empty />
  const list = all ? items : items.slice(0, 12)
  return (
    <div>
      <div className="fr-gallery">
        {list.map((it, i) => {
          const inner = it.media === 'image'
            ? <img src={it.url} alt={it.signature ? 'Signature' : it.name || 'Uploaded image'} loading="lazy" style={it.signature ? { objectFit: 'contain', background: '#fff' } : undefined} />
            : <><Icon name={it.media === 'video' ? 'play' : it.media === 'audio' ? 'wave' : 'file'} size={22} /><span>{it.name || (it.media === 'audio' ? 'Recording' : it.media === 'video' ? 'Video' : 'File')}</span></>
          // Signatures and inline (data:) files open in the response drawer; links open in a new tab.
          if (it.signature || it.url.startsWith('data:')) {
            return <button type="button" key={it.rowId + i} className="fr-gtile" title={it.name || 'Open response'} onClick={() => onOpenRow?.(it.rowId)}>{inner}</button>
          }
          return <a key={it.rowId + i} className="fr-gtile" href={it.url} target="_blank" rel="noopener noreferrer" title={it.name || 'Open file'}>{inner}</a>
        })}
      </div>
      {items.length > 12 && <button type="button" className="fr-link" style={{ marginTop: 10 }} onClick={() => setAll(a => !a)}>{all ? 'Show fewer' : `Show all ${items.length}`}</button>}
    </div>
  )
}
