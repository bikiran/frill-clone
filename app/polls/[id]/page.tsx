'use client'

// The public poll page (/polls/<id>, and ?embed=1 inside an iframe). Reads
// and votes through /api/polls/<id> (lib/engage-server.ts decides what a
// visitor may see and whether a vote counts); never the tables directly.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { captureClickRef } from '@/lib/click-ref-client'
import { PublicPollCard, PublicShell, accentFor } from '@/components/engage/PublicViews'
import type { PollView } from '@/lib/engage-server'

const VOTER_KEY = 'colvy_voter'
const readVoter = () => { try { return localStorage.getItem(VOTER_KEY) || '' } catch { return '' } }
const keepVoter = (v: unknown) => { if (typeof v === 'string' && v) try { localStorage.setItem(VOTER_KEY, v) } catch {} }

export default function PollPage() {
  const params = useParams()
  const pollId = String(params?.id || '')
  const [view, setView] = useState<PollView | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [notice, setNotice] = useState<string | null>(null)
  const [embed, setEmbed] = useState(false)
  const clv = useRef<string | null>(null)

  const headers = () => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    const v = readVoter()
    if (v) h['x-colvy-voter'] = v
    return h
  }

  const load = useCallback(async (quiet = false) => {
    try {
      const qs = clv.current ? `?clv=${encodeURIComponent(clv.current)}` : ''
      const res = await fetch(`/api/polls/${pollId}${qs}`, { headers: headers(), cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      keepVoter(d?.voter)
      if (res.status === 404) { if (!quiet) setState('missing'); return }
      if (!res.ok || !d?.poll) { if (!quiet) setState('error'); return }
      setView(d)
      setState('ready')
    } catch { if (!quiet) setState('error') }
  }, [pollId])

  useEffect(() => {
    try { setEmbed(new URLSearchParams(window.location.search).get('embed') === '1') } catch {}
    clv.current = captureClickRef()
    void load()
  }, [load])

  useEffect(() => { if (view?.poll?.question) document.title = view.poll.question }, [view?.poll?.question])

  // Live results while the page is open and visible.
  useEffect(() => {
    if (!view?.results || view.poll?.status !== 'live') return
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load(true) }, 20_000)
    return () => clearInterval(t)
  }, [view?.results, view?.poll?.status, load])

  const vote = async (picks: string[], who: { name: string; contact: string }): Promise<string | null> => {
    try {
      const res = await fetch(`/api/polls/${pollId}/vote`, { method: 'POST', headers: headers(), body: JSON.stringify({ picks, name: who.name, contact: who.contact, clv: clv.current }) })
      const d = await res.json().catch(() => ({}))
      keepVoter(d?.voter)
      if (res.ok) { setNotice(null); setView({ poll: d.poll, results: d.results, myVote: d.myVote }); return null }
      if (res.status === 409 && d?.poll) { setView({ poll: d.poll, results: d.results, myVote: d.myVote }); setNotice(d.error || null); return null }
      return d?.error || 'Couldn’t save your vote. Please try again.'
    } catch {
      return 'Couldn’t reach us. Check your connection and try again.'
    }
  }

  if (state === 'loading') return <PublicShell company={null} embed={embed} accent="#ff7a6b"><div className="pv-card"><div className="pv-body"><p className="pv-hint" style={{ margin: 0 }}>Loading poll…</p></div></div></PublicShell>
  if (state !== 'ready' || !view?.poll) {
    return (
      <PublicShell company={null} embed={embed} accent="#ff7a6b">
        <div className="pv-card pv-center"><div className="pv-body">
          <h1 className="pv-q" style={{ textAlign: 'center' }}>{state === 'missing' ? 'Poll not found' : 'Couldn’t load this poll'}</h1>
          <p className="pv-desc" style={{ textAlign: 'center' }}>{state === 'missing' ? 'It may have been removed, or the link is incomplete.' : 'Please check your connection and try again.'}</p>
          {state === 'error' && <div className="pv-actions" style={{ justifyContent: 'center' }}><button type="button" className="pv-btn" onClick={() => { setState('loading'); void load() }}>Try again</button></div>}
        </div></div>
      </PublicShell>
    )
  }
  return (
    <PublicShell company={view.poll.company} embed={embed} accent={accentFor(view.poll.company)}>
      <PublicPollCard key={(view.myVote || []).join('|')} poll={view.poll} results={view.results} myVote={view.myVote} onVote={vote} notice={notice} />
    </PublicShell>
  )
}
