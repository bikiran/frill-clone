'use client'

// The public survey page (/surveys/<id>, and ?embed=1 inside an iframe).
// Reads and answers through /api/surveys/<id> (lib/engage-server.ts), never
// the tables directly.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { captureClickRef } from '@/lib/click-ref-client'
import { PublicShell, PublicSurveyCard, accentFor } from '@/components/engage/PublicViews'
import type { SurveyView } from '@/lib/engage-server'

const VOTER_KEY = 'colvy_voter'
const readVoter = () => { try { return localStorage.getItem(VOTER_KEY) || '' } catch { return '' } }
const keepVoter = (v: unknown) => { if (typeof v === 'string' && v) try { localStorage.setItem(VOTER_KEY, v) } catch {} }

export default function PublicSurveyPage() {
  const params = useParams()
  const surveyId = String(params?.id || '')
  const [view, setView] = useState<SurveyView | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [embed, setEmbed] = useState(false)
  const clv = useRef<string | null>(null)

  const headers = () => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    const v = readVoter()
    if (v) h['x-colvy-voter'] = v
    return h
  }

  const load = useCallback(async () => {
    try {
      const qs = clv.current ? `?clv=${encodeURIComponent(clv.current)}` : ''
      const res = await fetch(`/api/surveys/${surveyId}${qs}`, { headers: headers(), cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      keepVoter(d?.voter)
      if (res.status === 404) { setState('missing'); return }
      if (!res.ok || !d?.survey) { setState('error'); return }
      setView(d)
      setState('ready')
    } catch { setState('error') }
  }, [surveyId])

  useEffect(() => {
    try { setEmbed(new URLSearchParams(window.location.search).get('embed') === '1') } catch {}
    clv.current = captureClickRef()
    void load()
  }, [load])

  useEffect(() => { if (view?.survey?.title) document.title = view.survey.title }, [view?.survey?.title])

  const submit = async (body: { score?: number; comment?: string; answers?: Record<string, unknown>; name: string; contact: string }): Promise<string | null> => {
    try {
      const res = await fetch(`/api/surveys/${surveyId}/respond`, { method: 'POST', headers: headers(), body: JSON.stringify({ ...body, clv: clv.current }) })
      const d = await res.json().catch(() => ({}))
      keepVoter(d?.voter)
      if (res.ok) return null
      if (res.status === 409) { setView(v => (v ? { ...v, answered: true } : v)); return null }
      return d?.error || 'Couldn’t send your answer. Please try again.'
    } catch {
      return 'Couldn’t reach us. Check your connection and try again.'
    }
  }

  if (state === 'loading') return <PublicShell company={null} embed={embed} accent="#ff7a6b"><div className="pv-card"><div className="pv-body"><p className="pv-hint" style={{ margin: 0 }}>Loading survey…</p></div></div></PublicShell>
  if (state !== 'ready' || !view?.survey) {
    return (
      <PublicShell company={null} embed={embed} accent="#ff7a6b">
        <div className="pv-card pv-center"><div className="pv-body">
          <h1 className="pv-q" style={{ textAlign: 'center' }}>{state === 'missing' ? 'Survey not found' : 'Couldn’t load this survey'}</h1>
          <p className="pv-desc" style={{ textAlign: 'center' }}>{state === 'missing' ? 'It may have been removed, or the link is incomplete.' : 'Please check your connection and try again.'}</p>
          {state === 'error' && <div className="pv-actions" style={{ justifyContent: 'center' }}><button type="button" className="pv-btn" onClick={() => { setState('loading'); void load() }}>Try again</button></div>}
        </div></div>
      </PublicShell>
    )
  }
  return (
    <PublicShell company={view.survey.company} embed={embed} accent={accentFor(view.survey.company)}>
      <PublicSurveyCard key={String(view.answered)} survey={view.survey} answered={view.answered} onSubmit={submit} />
    </PublicShell>
  )
}
