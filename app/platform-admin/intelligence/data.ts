'use client'

// Super Admin → Intelligence, the data side: which report each page reads,
// and loading it from /api/platform-admin/intel. Kept apart from the pages
// (Intelligence.tsx) so the menu can start loading a report on hover without
// pulling in all of Intelligence's code.

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type IntelView = 'intel' | 'intel_live' | 'intel_traffic' | 'intel_pages' | 'intel_journeys' | 'intel_funnels' | 'intel_business' | 'intel_health' | 'intel_revenue' | 'intel_system'
export const INTEL_VIEWS: IntelView[] = ['intel', 'intel_live', 'intel_traffic', 'intel_pages', 'intel_journeys', 'intel_funnels', 'intel_business', 'intel_health', 'intel_revenue', 'intel_system']

export const REPORT: Record<IntelView, string> = { intel: 'overview', intel_live: 'live', intel_traffic: 'traffic', intel_pages: 'pages', intel_journeys: 'journeys', intel_funnels: 'funnels', intel_business: 'business', intel_health: 'health', intel_revenue: 'revenue', intel_system: 'system' }

export type Range = { range: string; from?: string; to?: string }

// The last answer for each report and period is kept for this browser tab
// (memory, then sessionStorage), so a page you've opened before shows at once
// while it refreshes. The server answers from its saved copy too
// (lib/intel/cache); when that copy was getting old it says "stale" and is
// recomputing, so the page asks again shortly for the new numbers.
const seen = new Map<string, any>()
const storeKey = (k: string) => `colvy_intel:${k}`
function remembered(k: string): any {
  if (seen.has(k)) return seen.get(k)
  try { const v = JSON.parse(sessionStorage.getItem(storeKey(k)) || 'null'); if (v) { seen.set(k, v); return v } } catch {}
  return null
}
function remember(k: string, v: any) {
  seen.set(k, v)
  try { sessionStorage.setItem(storeKey(k), JSON.stringify(v)) } catch {}
}
function intelQuery(report: string, r: Range, fresh = false) {
  return new URLSearchParams({ report, range: r.range, ...(r.range === 'custom' && r.from && r.to ? { from: r.from, to: r.to } : {}), ...(fresh ? { fresh: '1' } : {}) })
}
async function fetchIntel(report: string, r: Range, fresh = false): Promise<any> {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  const resp = await fetch(`/api/platform-admin/intel?${intelQuery(report, r, fresh)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  const j = await resp.json().catch(() => ({ error: 'Bad response' }))
  return resp.ok || j.configured === false ? j : { error: j.error || `HTTP ${resp.status}` }
}
const inflight = new Map<string, Promise<any>>()
function loadIntel(report: string, r: Range, fresh = false): Promise<any> {
  const k = intelQuery(report, r).toString()
  if (!fresh && inflight.has(k)) return inflight.get(k)!
  const p = fetchIntel(report, r, fresh).then(j => { if (!j.error) remember(k, j); return j }).finally(() => inflight.delete(k))
  inflight.set(k, p)
  return p
}

/** Start loading a page's report before it's opened (menu hover). */
export function prefetchIntel(view: string) {
  const report = REPORT[view as IntelView]
  if (!report || report === 'live') return
  let r: Range = { range: '7d' }
  try { const s = JSON.parse(localStorage.getItem('colvy_intel_range') || 'null'); if (s?.range) r = s } catch {}
  if (remembered(intelQuery(report, r).toString())) return
  void loadIntel(report, r).catch(() => {})
}

export function useIntel(report: string, r: Range, pollMs = 0) {
  const k = intelQuery(report, r).toString()
  const [res, setRes] = useState<any>(() => remembered(k))
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)
  const load = useCallback(async (fresh = false, quiet = false) => {
    const my = ++seq.current
    if (!quiet) setLoading(true)
    try {
      const j = await loadIntel(report, r, fresh)
      if (my !== seq.current) return
      // A failed refresh keeps showing the numbers we already have.
      setRes((prev: any) => (j.error && prev && !prev.error ? prev : j))
      if (j.stale && !fresh) setTimeout(() => { if (my === seq.current) load(false, true) }, 8000)
    } catch (e: any) { if (my === seq.current) setRes((prev: any) => prev && !prev.error ? prev : { error: e?.message || 'Could not reach the server' }) }
    finally { if (my === seq.current) setLoading(false) }
  }, [report, r.range, r.from, r.to])
  useEffect(() => { setRes(remembered(k)); load() }, [load, k])
  useEffect(() => {
    if (!pollMs) return
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(false, true) }, pollMs)
    return () => clearInterval(t)
  }, [pollMs, load])
  return { res, loading, reload: () => load(true) }
}

