'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser } from '@/lib/client-cache'

// Product analytics via PostHog. Loads only when NEXT_PUBLIC_POSTHOG_KEY is set,
// so builds/deploys without it are unaffected (a no-op). Captures pageviews on
// client-side navigation (App Router is a SPA, so autocapture's pageview won't
// fire on route changes), and identifies the signed-in user + their workspace
// so events tie back to a person and a company.
let started = false

export default function Analytics() {
  const pathname = usePathname()
  const phRef = useRef<any>(null)

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!key || started || typeof window === 'undefined') return
    started = true
    let cancelled = false

    ;(async () => {
      try {
        const posthog = (await import('posthog-js')).default
        posthog.init(key, {
          api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
          // We send $pageview ourselves on each route change (below).
          capture_pageview: false,
          capture_pageleave: true,
          // Only build a person profile once someone is identified (a logged-in
          // team member) — anonymous marketing visitors still send events but
          // don't create profiles. Cheaper and cleaner for a CRM.
          person_profiles: 'identified_only',
          // Session recording is opt-in — enable it in the PostHog project when
          // wanted, rather than recording customer data by default.
          disable_session_recording: true,
        })
        if (cancelled) return
        phRef.current = posthog
        posthog.capture('$pageview', { $current_url: window.location.href })

        // Tie events to the signed-in user and their workspace.
        const identify = async (session: any) => {
          try {
            const u = session?.user
            if (!u) return
            posthog.identify(u.id, {
              email: u.email,
              name: u.user_metadata?.display_name || (u.email ? String(u.email).split('@')[0] : undefined),
            })
            const companyId = peekCompanyUser()?.companyId
            if (companyId) posthog.group('company', companyId)
          } catch {}
        }
        try { const { data } = await supabase.auth.getSession(); await identify(data?.session) } catch {}
        supabase.auth.onAuthStateChange((_e: any, session: any) => {
          if (session) identify(session)
          else { try { posthog.reset() } catch {} }
        })
      } catch { /* analytics must never break the app */ }
    })()

    return () => { cancelled = true }
  }, [])

  // Pageview on client-side navigation.
  useEffect(() => {
    if (phRef.current && pathname) {
      try { phRef.current.capture('$pageview', { $current_url: window.location.href }) } catch {}
    }
  }, [pathname])

  return null
}
