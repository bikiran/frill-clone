'use client'

// A survey's Results tab: NPS (score, promoters / passives / detractors and
// the 0-10 spread), satisfaction (average, % happy, spread), per-question
// cards for a questions survey, the written answers, and "Summarise
// responses" with Colvy AI.

import { useEffect, useMemo, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { npsBand, scoreRange, summariseSurvey, type ResponseRow } from '@/lib/engage-core'
import { relativeTime, formatDateTime } from '@/components/form-results/aggregate'
import { Bars, Card, Columns, Kpi, perDay } from './ResultParts'
import { EngageIcon } from './icons'
import type { FeedbackSummary } from '@/lib/engage-ai'

const BAND = { promoter: '#16a34a', passive: '#eab308', detractor: '#dc2626' }
const scoreColor = (mode: string, n: number, max: number) => {
  if (mode === 'nps') return BAND[npsBand(n)]
  const r = max === 5 ? (n - 1) / 4 : n / 10
  return r >= 0.75 ? BAND.promoter : r >= 0.5 ? BAND.passive : BAND.detractor
}

type CommentFilter = 'all' | 'promoter' | 'passive' | 'detractor'

export function SurveyResults({ survey, rows, now, companyId }: { survey: any; rows: ResponseRow[]; now: number; companyId: string | null }) {
  const s = useMemo(() => summariseSurvey(survey, rows), [survey, rows])
  const range = scoreRange(survey)
  const days = useMemo(() => perDay(rows.map(r => String(r.created_at || '')), 14, now), [rows, now])
  const [filter, setFilter] = useState<CommentFilter>('all')
  const comments = s.comments.filter(c => filter === 'all' || (c.score != null && npsBand(c.score) === filter))

  const headline = s.mode === 'nps'
    ? <Kpi icon="percent" value={s.nps == null ? '—' : s.nps > 0 ? `+${s.nps}` : String(s.nps)} label="Net Promoter Score" sub="−100 to +100. Above 0 is good, above 50 is excellent." color={s.nps == null ? 'var(--slate)' : s.nps >= 30 ? BAND.promoter : s.nps >= 0 ? BAND.passive : BAND.detractor} />
    : s.mode === 'csat'
      ? <Kpi icon="percent" value={s.satisfied == null ? '—' : `${s.satisfied}%`} label="Happy customers" sub={range?.max === 5 ? 'Scored 4 or 5' : 'Scored 8 or more'} />
      : <Kpi icon="file" value={s.comments.length.toLocaleString('en-AU')} label="Written answers" />

  return (
    <div>
      <div className="fr-kpis" aria-label="Key numbers">
        <Kpi icon="users" value={s.responses.toLocaleString('en-AU')} label={s.responses === 1 ? 'Response' : 'Responses'} />
        {headline}
        {range && <Kpi icon="hash" value={s.average == null ? '—' : `${s.average}`} label="Average score" sub={`${range.min} to ${range.max}`} />}
        <Kpi icon="calendar" value={s.lastAt ? relativeTime(s.lastAt, now) : '—'} label="Last response" title={s.lastAt ? formatDateTime(s.lastAt) : undefined} />
      </div>

      <div className="eg-results has-side">
        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          {s.mode === 'nps' && (
            <Card title={String(survey.question || 'How likely are you to recommend us?')} sub={<span>{s.scored.toLocaleString('en-AU')} scored</span>}>
              {s.scored === 0 ? <p className="fr-muted" style={{ margin: 0, fontSize: 13 }}>No scores yet.</p> : (
                <>
                  <div className="eg-bands" role="img" aria-label={`Promoters ${s.bands.promoter}, passives ${s.bands.passive}, detractors ${s.bands.detractor}`}>
                    {(['promoter', 'passive', 'detractor'] as const).map(b => <span key={b} style={{ width: `${(s.bands[b] / s.scored) * 100}%`, background: BAND[b] }} />)}
                  </div>
                  <div className="eg-legend">
                    <span><i style={{ background: BAND.promoter }} />Promoters (9-10) {s.bands.promoter} · {Math.round((s.bands.promoter / s.scored) * 100)}%</span>
                    <span><i style={{ background: BAND.passive }} />Passives (7-8) {s.bands.passive} · {Math.round((s.bands.passive / s.scored) * 100)}%</span>
                    <span><i style={{ background: BAND.detractor }} />Detractors (0-6) {s.bands.detractor} · {Math.round((s.bands.detractor / s.scored) * 100)}%</span>
                  </div>
                  <div style={{ marginTop: 18 }}>
                    <Columns items={s.distribution.map(d => ({ x: String(d.score), n: d.count }))} colorOf={i => scoreColor('nps', s.distribution[i].score, 10)} />
                  </div>
                </>
              )}
            </Card>
          )}

          {s.mode === 'csat' && range && (
            <Card title={String(survey.question || 'How would you rate your experience?')} sub={<span>{s.scored.toLocaleString('en-AU')} scored · {range.min} to {range.max}</span>}>
              {s.scored === 0 ? <p className="fr-muted" style={{ margin: 0, fontSize: 13 }}>No scores yet.</p> : (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
                    <span className="eg-score">{s.average}</span><span className="fr-muted" style={{ fontSize: 13 }}>out of {range.max}</span>
                  </div>
                  <Columns items={s.distribution.map(d => ({ x: String(d.score), n: d.count }))} colorOf={i => scoreColor('csat', s.distribution[i].score, range.max)} />
                </>
              )}
            </Card>
          )}

          {s.mode === 'questions' && s.questions.map((q, i) => (
            <Card key={q.id} title={`${i + 1}. ${q.title}`} sub={<span>{q.answered.toLocaleString('en-AU')} answered{q.type === 'rating' && q.average != null ? ` · average ${q.average}` : ''}</span>}>
              {q.rows ? (q.type === 'rating'
                ? <Columns items={q.rows.map(r => ({ x: r.label, n: r.count }))} />
                : <Bars rows={q.rows} leaders={[]} />)
                : (q.texts && q.texts.length ? (
                  <div className="eg-comments" style={{ maxHeight: 280 }}>
                    {q.texts.slice(0, 50).map((t, j) => <div key={`${t.id}-${j}`} className="eg-comment">{t.text}<small>{relativeTime(t.at, now)}</small></div>)}
                  </div>
                ) : <p className="fr-muted" style={{ margin: 0, fontSize: 13 }}>No answers yet.</p>)}
            </Card>
          ))}

          <Card title={s.mode === 'text' ? String(survey.question || 'Answers') : 'What people wrote'} sub={<span>{s.comments.length.toLocaleString('en-AU')} written {s.comments.length === 1 ? 'answer' : 'answers'}</span>}
            right={s.mode === 'nps' && s.comments.length > 0 ? (
              <select className="fr-select" value={filter} onChange={e => setFilter(e.target.value as CommentFilter)} aria-label="Show comments from">
                <option value="all">Everyone</option><option value="promoter">Promoters</option><option value="passive">Passives</option><option value="detractor">Detractors</option>
              </select>
            ) : undefined}>
            {comments.length === 0 ? <p className="fr-muted" style={{ margin: 0, fontSize: 13 }}>{s.comments.length ? 'None in this group.' : 'No written answers yet.'}</p> : (
              <div className="eg-comments">
                {comments.slice(0, 200).map((c, i) => (
                  <div key={`${c.id}-${i}`} className="eg-comment">
                    {c.text}
                    <small>
                      {c.score != null && range && <span className="eg-chip" style={{ background: `${scoreColor(s.mode, c.score, range.max)}1f`, color: scoreColor(s.mode, c.score, range.max) }}>{c.score}</span>}
                      {c.name && <span>{c.name}</span>}
                      <span title={formatDateTime(c.at)}>{relativeTime(c.at, now)}</span>
                    </small>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          <AiSummary surveyId={String(survey.id)} companyId={companyId} written={s.comments.length + s.questions.reduce((a, q) => a + (q.texts?.length || 0), 0)} responses={s.responses} />
          <Card title="Responses per day" sub={<span>Last 14 days</span>}>
            <Columns items={days} height={130} />
          </Card>
        </div>
      </div>
    </div>
  )
}

function AiSummary({ surveyId, companyId, written, responses }: { surveyId: string; companyId: string | null; written: number; responses: number }) {
  const key = `colvy-survey-summary:${surveyId}`
  const [data, setData] = useState<{ summary: FeedbackSummary; used: number; at: string; responses: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Kept for this browser session so switching tabs doesn't ask again.
  useEffect(() => {
    try { const v = JSON.parse(sessionStorage.getItem(key) || 'null'); if (v?.summary) setData(v) } catch {}
  }, [key])

  const run = async () => {
    if (!companyId || busy) return
    setBusy(true); setError('')
    try {
      const res = await authFetch('/api/engage/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'survey', id: surveyId, companyId }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d?.error || 'Colvy AI couldn’t summarise these just now.'); return }
      const v = { summary: d.summary, used: d.used, at: d.at, responses }
      setData(v)
      try { sessionStorage.setItem(key, JSON.stringify(v)) } catch {}
    } catch {
      setError('Couldn’t reach Colvy AI. Check your connection and try again.')
    } finally { setBusy(false) }
  }

  const total = data ? Math.max(1, data.summary.sentiment.positive + data.summary.sentiment.neutral + data.summary.sentiment.negative) : 1
  const stale = data && data.responses !== responses
  return (
    <section className="fr-card fr-qcard eg-ai" aria-labelledby="eg-ai-title">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <h3 className="fr-qtitle" id="eg-ai-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><EngageIcon name="spark" size={16} stroke="#9333ea" />Colvy AI summary</h3>
        <button type="button" className="fr-btn fr-btn-sm" onClick={run} disabled={busy || written < 3 || !companyId}>
          {busy ? 'Reading answers…' : data ? 'Summarise again' : 'Summarise responses'}
        </button>
      </div>
      {!data && !error && (
        <p className="fr-muted" style={{ fontSize: 13, margin: '10px 0 0', lineHeight: 1.5 }}>
          {written < 3 ? 'Once there are at least 3 written answers, Colvy AI can pull out the themes, how people feel and what to do next.' : `Pull out the themes, how people feel and what to do next from ${written.toLocaleString('en-AU')} written ${written === 1 ? 'answer' : 'answers'}.`}
        </p>
      )}
      {error && <p style={{ fontSize: 13, margin: '10px 0 0', color: '#b91c1c' }}>{error}</p>}
      {data && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 14, lineHeight: 1.55, margin: '0 0 12px', color: 'var(--ink)' }}>{data.summary.summary}</p>
          <div className="eg-bands" role="img" aria-label={`Positive ${data.summary.sentiment.positive}, neutral ${data.summary.sentiment.neutral}, negative ${data.summary.sentiment.negative}`}>
            <span style={{ width: `${(data.summary.sentiment.positive / total) * 100}%`, background: BAND.promoter }} />
            <span style={{ width: `${(data.summary.sentiment.neutral / total) * 100}%`, background: '#94a3b8' }} />
            <span style={{ width: `${(data.summary.sentiment.negative / total) * 100}%`, background: BAND.detractor }} />
          </div>
          <div className="eg-legend">
            <span><i style={{ background: BAND.promoter }} />Positive {data.summary.sentiment.positive}</span>
            <span><i style={{ background: '#94a3b8' }} />Neutral {data.summary.sentiment.neutral}</span>
            <span><i style={{ background: BAND.detractor }} />Negative {data.summary.sentiment.negative}</span>
          </div>
          {data.summary.themes.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="fr-sec" style={{ marginTop: 0 }}>Themes</div>
              {data.summary.themes.map((t, i) => (
                <div key={i} className="eg-theme">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>
                    <span><span className="eg-tone" style={{ background: t.tone === 'positive' ? BAND.promoter : t.tone === 'negative' ? BAND.detractor : '#94a3b8' }} />{t.title}</span>
                    <span className="fr-muted" style={{ fontWeight: 500, fontSize: 12.5 }}>{t.count} {t.count === 1 ? 'mention' : 'mentions'}</span>
                  </div>
                  <div className="fr-muted" style={{ fontSize: 12.5, marginTop: 2 }}>{t.detail}</div>
                  {t.quotes.map((q, j) => <q key={j}>{q}</q>)}
                </div>
              ))}
            </div>
          )}
          {data.summary.actions.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div className="fr-sec">Next steps</div>
              <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'disc', fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.55 }}>
                {data.summary.actions.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          )}
          <p className="fr-muted" style={{ fontSize: 11.5, margin: '12px 0 0' }} title="Colvy AI only reads the written answers; it doesn't change anything or contact anyone.">
            Why these? Based on the {data.used.toLocaleString('en-AU')} newest written answers, {relativeTime(data.at)}.{stale ? ' New responses have come in since.' : ''} Read-only: nothing is sent to customers.
          </p>
        </div>
      )}
    </section>
  )
}
