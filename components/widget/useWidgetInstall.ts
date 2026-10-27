'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import type { InstallState, WidgetSite } from '@/lib/widget-install'

export type WidgetInstall = { slug: string | null; state: InstallState; sites: WidgetSite[]; tracking: boolean }

// Whether this workspace's chat widget is on its website (/api/widget/install-status).
// `every(state)` says how often to check again, in ms, or 0 for not at all:
// the Install page checks every few seconds while it waits for the widget.
// Hidden tabs don't check; coming back to the tab checks straight away.
export function useWidgetInstall(companyId: string | null | undefined, every: (s: WidgetInstall | null) => number = () => 0) {
  const [data, setData] = useState<WidgetInstall | null>(null)
  const [checking, setChecking] = useState(false)
  const everyRef = useRef(every)
  everyRef.current = every

  const check = useCallback(async () => {
    if (!companyId) return null
    setChecking(true)
    try {
      const r = await authFetch(`/api/widget/install-status?companyId=${encodeURIComponent(companyId)}`)
      if (!r.ok) return null
      const d = await r.json()
      const next: WidgetInstall = { slug: d.slug || null, state: d.state || 'none', sites: d.sites || [], tracking: d.tracking !== false }
      setData(next)
      return next
    } catch { return null } finally { setChecking(false) }
  }, [companyId])

  useEffect(() => {
    let stop = false, t: ReturnType<typeof setTimeout> | null = null
    const loop = async () => {
      const d = document.visibilityState === 'visible' ? await check() : null
      if (stop) return
      const ms = everyRef.current(d)
      if (ms > 0) t = setTimeout(loop, ms)
    }
    loop()
    const onVis = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVis)
    return () => { stop = true; if (t) clearTimeout(t); document.removeEventListener('visibilitychange', onVis) }
  }, [check])

  return { data, checking, check }
}
