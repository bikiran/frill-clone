'use client'

// "AI call summary" for the selected period: the exact numbers (busiest hour,
// when calls go unanswered, who answered most, the AI receptionist), plus why
// people called, grouped from the calls' summaries. A topic opens those calls.

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { Icon, card, kicker, Spinner, WhyInline, btn, tint, C } from './ui'

type Insights = {
  facts: { label: string; value: string }[]
  headline: string | null
  topics: { name: string; count: number; callIds: string[] }[]
  suggestions: string[]
  based: { summaries: number; calls: number }
  note: string | null
}

const cacheKey = (companyId: string, from: number, to: number | null) => `cc-insights:${companyId}:${from}:${to ?? 'open'}`

export default function AiSummary({ companyId, from, to, rangeLabel, onTopic, activeTopic }: {
  companyId: string; from: number; to: number | null; rangeLabel: string
  onTopic: (t: { name: string; callIds: string[] } | null) => void; activeTopic: string | null
}) {
  const [data, setData] = useState<Insights | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async (fresh = false) => {
    setLoading(true); setError('')
    try {
      const q = new URLSearchParams({ companyId, from: String(from), to: to == null ? 'open' : String(to), ...(fresh ? { fresh: '1' } : {}) })
      const r = await authFetch(`/api/command-centre/insights?${q}`)
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Couldn’t summarise these calls.'); return }
      setData(d)
      try { sessionStorage.setItem(cacheKey(companyId, from, to), JSON.stringify({ at: Date.now(), d })) } catch {}
    } catch { setError('Couldn’t reach Colvy.') } finally { setLoading(false) }
  }

  useEffect(() => {
    try {
      const hit = JSON.parse(sessionStorage.getItem(cacheKey(companyId, from, to)) || 'null')
      if (hit && Date.now() - hit.at < 10 * 60_000) { setData(hit.d); return }
    } catch {}
    setData(null)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, from, to])

  const max = Math.max(1, ...(data?.topics || []).map(t => t.count))
  return (
    <div style={{ ...card, padding: 18, borderColor: tint(C.violet, 28), background: `linear-gradient(180deg, ${tint(C.violet, 5)}, transparent 70%), var(--card, #fff)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: tint(C.violet, 14), color: C.violet, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.spark(15)}</span>
        <div style={{ flex: 1, minWidth: 180 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>AI call summary</p>
          <p style={{ margin: '1px 0 0', fontSize: 12, color: 'var(--slate)' }}>{rangeLabel}{data ? ` · from ${data.based.summaries} call summar${data.based.summaries === 1 ? 'y' : 'ies'} out of ${data.based.calls} call${data.based.calls === 1 ? '' : 's'}` : ''}</p>
        </div>
        <WhyInline align="right" why={<>The numbers are counted exactly from your calls in this period, in your business’s timezone. The reasons people called are grouped by AI from each call’s summary: recorded calls and voicemails get one after the call, and the AI receptionist notes what each caller wanted. Calls with no summary aren’t in the topics.</>} />
        <button type="button" onClick={() => load(true)} disabled={loading} style={{ ...btn('ghost'), padding: '5px 10px' }}>{loading ? <Spinner size={12} /> : Icon.refresh(12)} Refresh</button>
      </div>

      {error && <p style={{ margin: 0, color: C.red, fontSize: 13, fontWeight: 600 }}>{error}</p>}
      {!data && loading && <p style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 13, color: 'var(--slate)' }}><Spinner /> Reading this period’s calls…</p>}

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 18 }}>
          <div style={{ minWidth: 0 }}>
            {data.headline && <p style={{ margin: '0 0 12px', fontSize: 14.5, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.45 }}>{data.headline}</p>}
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 13 }}>
              {data.facts.map(f => (
                <div key={f.label} style={{ display: 'contents' }}>
                  <dt style={{ color: 'var(--slate)', fontWeight: 600, whiteSpace: 'nowrap' }}>{f.label}</dt>
                  <dd style={{ margin: 0, color: 'var(--ink)', fontWeight: 700, minWidth: 0 }}>{f.value}</dd>
                </div>
              ))}
            </dl>
            {data.suggestions.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <p style={{ ...kicker, marginBottom: 6 }}>Worth doing</p>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--ink)', lineHeight: 1.55 }}>
                  {data.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            {data.note && <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--slate)' }}>{data.note}</p>}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ ...kicker, marginBottom: 8 }}>Why people called</p>
            {data.topics.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)' }}>{data.based.summaries ? 'No clear topics yet.' : 'Topics appear once calls have summaries.'}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {data.topics.map(t => {
                  const on = activeTopic === t.name
                  return (
                    <button key={t.name} type="button" onClick={() => onTopic(on ? null : t)} title={on ? 'Show all calls' : `Show these ${t.count} calls`}
                      style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 4, padding: '6px 8px', borderRadius: 9, border: `1px solid ${on ? C.violet : 'transparent'}`, background: on ? tint(C.violet, 8) : 'transparent', cursor: 'pointer', textAlign: 'left', font: 'inherit' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: C.violet }}>{t.count}</span>
                      <span style={{ gridColumn: '1 / -1', height: 6, borderRadius: 4, background: 'var(--canvas)', overflow: 'hidden' }}>
                        <span style={{ display: 'block', height: '100%', width: `${Math.max(4, t.count / max * 100)}%`, background: tint(C.violet, 70), borderRadius: 4 }} />
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
