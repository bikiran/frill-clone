'use client'

import { useEffect, useState } from 'react'

const cache = new Map<string, Promise<boolean>>()

/**
 * Client hook for public pages: true once we know the "Powered by Colvy"
 * badge should show for this workspace (see lib/branding). Starts false so a
 * workspace that hides it never sees the badge flash in.
 */
export function useShowPoweredBy(companyId?: string | null): boolean {
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!companyId) return
    let live = true
    let job = cache.get(companyId)
    if (!job) {
      job = fetch(`/api/branding?companyId=${encodeURIComponent(companyId)}`).then(r => r.json()).then(d => !d?.hide).catch(() => true)
      cache.set(companyId, job)
    }
    job.then(v => { if (live) setShow(v) })
    return () => { live = false }
  }, [companyId])
  return show
}
