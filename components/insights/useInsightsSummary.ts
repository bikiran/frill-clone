'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { peekCompanyUser, readStored, resolveCompanyUser, writeStored } from '@/lib/client-cache'

// The summary behind Customer / Location Insights (/api/insights/summary). The
// last answer for the same filters paints straight away from this browser and
// is refreshed underneath; changing a filter keeps the old numbers on screen
// (faded) until the new ones arrive instead of blanking the page.

/** `stale`: the numbers on screen are for the previous filters (the new ones are loading). */
export type SummaryState<T> = { data: T | null; empty: boolean; loading: boolean; stale: boolean; error: string }

export function useInsightsSummary<T>(kind: 'customers' | 'location', params: Record<string, string>) {
  const query = new URLSearchParams({ kind, ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)) }).toString()
  const [companyId, setCompanyId] = useState<string | null>(() => peekCompanyUser()?.companyId || null)
  const key = companyId ? `insights:${companyId}:${query}` : null
  const [state, setState] = useState<SummaryState<T>>(() => {
    const hit = readStored<{ data: T | null; empty: boolean }>(key)
    return { data: hit?.data ?? null, empty: !!hit?.empty, loading: !hit, stale: false, error: '' }
  })

  useEffect(() => {
    if (companyId) return
    resolveCompanyUser().then(u => setCompanyId(u.companyId)).catch(() => setState(s => ({ ...s, loading: false, error: 'Could not load insights.' })))
  }, [companyId])

  useEffect(() => {
    if (!companyId) return
    let live = true
    const hit = readStored<{ data: T | null; empty: boolean }>(key)
    setState(s => hit
      ? { data: hit.data, empty: hit.empty, loading: false, stale: false, error: '' }
      : { ...s, loading: !s.data, stale: !!s.data, error: '' })
    authFetch(`/api/insights/summary?${query}&companyId=${companyId}`)
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!live) return
        if (!ok) throw new Error(j?.error || 'Could not load insights.')
        const next = { data: (j[kind] ?? null) as T | null, empty: !!j.empty }
        writeStored(key, next)
        setState({ ...next, loading: false, stale: false, error: '' })
      })
      .catch(e => { if (live) setState(s => ({ ...s, loading: false, stale: false, error: String(e?.message || e) })) })
    return () => { live = false }
  }, [companyId, key, query, kind])

  return state
}
