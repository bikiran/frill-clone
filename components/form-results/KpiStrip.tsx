'use client'

import { formatVariable } from '@/lib/form-logic'
import { formatDuration, formatDateTime, formatDay, relativeTime, type StatsResult } from './aggregate'
import { Icon, type IconName } from './icons'

export type KpiData = {
  responses: number
  total: number
  filtered: boolean
  /** Answer or variable filters are on (completion ignores them). */
  answerFiltered: boolean
  avgSeconds: number | null
  lastAt: string | null
  stats: StatsResult | null
  completion: { rate: number | null; submitted: number; starts: number } | null
  variables: { id: string; label: string; avg: number }[]
}

function Tile({ icon, color, value, label, sub, title }: { icon: IconName; color: string; value: string; label: string; sub?: string; title?: string }) {
  return (
    <div className="fr-card fr-kpi" title={title}>
      <Icon name={icon} size={16} stroke={color} />
      <div className="fr-kpi-v">{value}</div>
      <div className="fr-kpi-l">{label}</div>
      {sub && <div className="fr-kpi-s">{sub}</div>}
    </div>
  )
}

/** Only honest numbers: views, starts and completion appear only when tracking (V376) has data. */
export function KpiStrip({ data, color }: { data: KpiData; color: string }) {
  const tracked = data.stats && data.stats.tracked ? data.stats : null
  return (
    <div className="fr-kpis" aria-label="Key numbers">
      <Tile icon="users" color={color} value={data.responses.toLocaleString('en-AU')} label="Responses"
        sub={data.filtered ? `of ${data.total.toLocaleString('en-AU')} total` : undefined} />
      <Tile icon="clock" color={color} value={data.avgSeconds === null ? '—' : formatDuration(data.avgSeconds)} label="Avg. time to complete" />
      {tracked && data.completion && (
        <Tile icon="percent" color={color} value={data.completion.rate === null ? '—' : `${data.completion.rate}%`} label="Completion rate"
          sub={`${data.answerFiltered ? 'All responses · ' : ''}Submitted ÷ started · since ${formatDay(tracked.since)}`}
          title={`${data.completion.submitted.toLocaleString('en-AU')} submitted of ${data.completion.starts.toLocaleString('en-AU')} started`} />
      )}
      {tracked && (
        <Tile icon="eye" color={color} value={tracked.views.toLocaleString('en-AU')} label="Views" sub={`${tracked.starts.toLocaleString('en-AU')} started`} />
      )}
      <Tile icon="calendar" color={color} value={data.lastAt ? relativeTime(data.lastAt) : '—'} label="Last response"
        title={data.lastAt ? formatDateTime(data.lastAt) : undefined} />
      {data.variables.slice(0, 2).map(v => (
        <Tile key={v.id} icon="hash" color={color} value={formatVariable(Math.round(v.avg * 100) / 100) || '0'} label={`Average ${v.label}`} />
      ))}
    </div>
  )
}
