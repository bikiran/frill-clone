'use client'

// A poll's Results tab: who voted, what's in front, bars with counts and
// percentages, votes per day. Updates live while the page is open (the page
// passes new votes in).

import { useMemo } from 'react'
import { closeNote, latestAnswerAt, settingsOf, statusOf, tallyPoll, type VoteRow } from '@/lib/engage-core'
import { relativeTime, formatDateTime } from '@/components/form-results/aggregate'
import { Bars, Card, Columns, Kpi, perDay } from './ResultParts'

export function PollResults({ poll, votes, now }: { poll: any; votes: VoteRow[]; now: number }) {
  const tally = useMemo(() => tallyPoll(poll, votes), [poll, votes])
  const days = useMemo(() => perDay(votes.map(v => String(v.created_at || '')), 14, now), [votes, now])
  const status = statusOf(poll, now)
  const last = useMemo(() => latestAnswerAt(votes), [votes])
  const closes = closeNote(settingsOf(poll).closes_at, now)
  const lead = tally.type === 'rating'
    ? (tally.average != null ? `${tally.average} / ${tally.rows.length}` : '—')
    : tally.leaders.length === 1 ? tally.leaders[0] : tally.leaders.length > 1 ? `${tally.leaders.length}-way tie` : '—'
  const leadPct = tally.type !== 'rating' && tally.leaders.length === 1 ? tally.rows.find(r => r.label === tally.leaders[0])?.pct : undefined

  return (
    <div>
      <div className="fr-kpis" aria-label="Key numbers">
        <Kpi icon="users" value={tally.voters.toLocaleString('en-AU')} label={tally.voters === 1 ? 'Person voted' : 'People voted'}
          sub={tally.type === 'multiple_choice' && tally.votes !== tally.voters ? `${tally.votes.toLocaleString('en-AU')} answers picked` : undefined} />
        <Kpi icon={tally.type === 'rating' ? 'hash' : 'flag'} value={lead} label={tally.type === 'rating' ? 'Average rating' : 'Leading answer'}
          sub={leadPct != null ? `${leadPct}% of voters${tally.type === 'ranking' ? ' (by points)' : ''}` : undefined} title={typeof lead === 'string' ? lead : undefined} />
        <Kpi icon="calendar" value={last ? relativeTime(last, now) : '—'} label="Last vote" title={last ? formatDateTime(last) : undefined} />
        <Kpi icon="clock" value={status === 'live' ? (closes || 'Open') : status === 'closed' ? 'Closed' : 'Draft'} label={status === 'live' ? (closes ? 'Closing' : 'No end date') : status === 'closed' ? (closes || 'Not taking votes') : 'Not published yet'} />
      </div>

      <div className="eg-results has-side">
        <Card title={String(poll.question || 'Untitled poll')}
          sub={<span>{tally.type === 'multiple_choice' ? 'People could pick more than one answer, so the percentages add up to more than 100%.'
            : tally.type === 'ranking' ? `Ranked by points: first place earns ${tally.rows.length}, last earns 1.`
            : tally.type === 'rating' ? `Rated from 1 to ${tally.rows.length}.` : `${tally.voters.toLocaleString('en-AU')} ${tally.voters === 1 ? 'vote' : 'votes'}`}</span>}>
          {tally.rows.length === 0 ? (
            <p className="fr-muted" style={{ margin: 0, fontSize: 13 }}>This poll has no answers yet. Add some on the Edit tab.</p>
          ) : tally.type === 'rating' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
                <span className="eg-score">{tally.average ?? '—'}</span>
                <span className="fr-muted" style={{ fontSize: 13 }}>average of {tally.voters.toLocaleString('en-AU')}</span>
              </div>
              <Columns items={tally.rows.map(r => ({ x: r.label, n: r.count, title: `${r.label}: ${r.count} (${r.pct}%)` }))} />
            </>
          ) : (
            <Bars rows={tally.rows} leaders={tally.leaders} big showPoints={tally.type === 'ranking'} />
          )}
        </Card>

        <Card title="Votes per day" sub={<span>Last 14 days</span>}>
          <Columns items={days} height={130} />
          {tally.voters === 0 && <p className="fr-muted" style={{ margin: '12px 0 0', fontSize: 13 }}>No votes yet. Share the link or QR code to get started.</p>}
        </Card>
      </div>
    </div>
  )
}
