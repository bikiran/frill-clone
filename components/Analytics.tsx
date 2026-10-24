'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser } from '@/lib/client-cache'
import { setPosthog, track } from '@/lib/analytics'
import { analyticsScope, analyticsOptedOut, beforeSend } from '@/lib/analytics-privacy'
import { getEffectiveEntitlements } from '@/lib/entitlements-client'
import { flagEnabled } from '@/lib/feature-flags'

// Colvy's own product and website analytics, via PostHog. Loads only when
// NEXT_PUBLIC_POSTHOG_KEY is set (a no-op otherwise), and only on pages Colvy
// measures (lib/analytics-privacy): the marketing site and the signed-in app,
// never a business's public pages or the Super Admin console. Anonymous by
// default; Do Not Track, Global Privacy Control and the Privacy page's
// opt-out switch it off. Every URL is cleaned before it's sent.
//
// Events go to /ingest on our own domain (a rewrite to PostHog in
// next.config.js), so ad blockers that block PostHog's address don't drop
// them. Set NEXT_PUBLIC_POSTHOG_PROXY=off to send straight to PostHog.
let started = false

const INGEST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'
const UI_HOST = INGEST.replace('://us.i.posthog.com', '://us.posthog.com').replace('://eu.i.posthog.com', '://eu.posthog.com')
const API_HOST = process.env.NEXT_PUBLIC_POSTHOG_PROXY === 'off' ? INGEST : '/ingest'

const inScope = () => typeof window !== 'undefined' && !!analyticsScope(window.location.hostname, window.location.pathname)

export default function Analytics() {
  const pathname = usePathname()
  const phRef = useRef<any>(null)

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    // Started on the first page Colvy measures (a visitor can land on a page
    // that isn't, then move to one that is).
    if (!key || started || typeof window === 'undefined' || !inScope() || analyticsOptedOut()) return
    started = true
    let cancelled = false

    // Start PostHog once the page is idle, not during load — it pulls in its
    // own bundles that competed with first paint and hydration on phones.
    const run = () => (async () => {
      try {
        // Per-company operational flag (default ON). A logged-in company that has
        // turned analytics off sends no events; anonymous visitors and any lookup
        // failure default to ON.
        const ent = await getEffectiveEntitlements().catch(() => null)
        if (ent && !flagEnabled(ent.features, 'posthog_analytics')) return
        if (cancelled) return
        const posthog = (await import('posthog-js')).default
        posthog.init(key, {
          api_host: API_HOST,
          ui_host: UI_HOST,
          // We send $pageview ourselves on each route change (below).
          capture_pageview: false,
          capture_pageleave: true,
          // Profiles only for identified (signed-in) people; anonymous visitors
          // still send events, without a profile.
          person_profiles: 'identified_only',
          respect_dnt: true,
          // Session recording stays off unless switched on deliberately.
          disable_session_recording: true,
          // This is a CRM — element text and attributes routinely contain
          // customer PII. Autocapture records what was clicked, never its
          // text; meaningful clicks are sent as named events (data-cta).
          mask_all_text: true,
          mask_all_element_attributes: true,
          // Drop events from pages Colvy doesn't measure, clean every URL.
          before_send: beforeSend,
        } as any)
        if (cancelled) return
        phRef.current = posthog
        setPosthog(posthog)
        posthog.capture('$pageview', { $current_url: window.location.href })

        // Tie events to the signed-in user and their workspace. PostHog joins
        // the visitor's anonymous history to them at this point.
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
        // Reset only on a real sign-out. The listener also fires on every page
        // load with no session (INITIAL_SESSION) for anonymous visitors, and
        // resetting then gave each visitor a new id on every page.
        supabase.auth.onAuthStateChange((event: any, session: any) => {
          if (session) identify(session)
          else if (event === 'SIGNED_OUT') { try { posthog.reset() } catch {} }
        })
      } catch { /* analytics must never break the app */ }
    })()
    const w = window as any
    const handle = w.requestIdleCallback ? w.requestIdleCallback(run, { timeout: 4000 }) : setTimeout(run, 2500)

    return () => {
      cancelled = true
      if (w.cancelIdleCallback && w.requestIdleCallback) w.cancelIdleCallback(handle); else clearTimeout(handle)
      // A cancelled (unmounted) start can be retried by the next mount.
      if (!phRef.current) started = false
    }
  }, [pathname])

  // Pageview on client-side navigation.
  useEffect(() => {
    if (phRef.current && pathname) {
      try { phRef.current.capture('$pageview', { $current_url: window.location.href }) } catch {}
    }
  }, [pathname])

  // Named clicks: any element with data-cta="<id>" sends cta_clicked, with
  // data-cta-location / data-cta-plan / data-cta-billing when present (and the
  // nearest data-cta-section otherwise). No text is read from the page.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      try {
        const el = (e.target as HTMLElement | null)?.closest?.('[data-cta]') as HTMLElement | null
        if (!el) return
        const d = el.dataset
        const section = (el.closest('[data-cta-section]') as HTMLElement | null)?.dataset.ctaSection
        const props: Record<string, any> = { cta_id: d.cta, location: d.ctaLocation || section || undefined }
        if (d.ctaPlan) props.plan = d.ctaPlan
        if (d.ctaBilling) props.billing = d.ctaBilling
        if (d.ctaDestination) props.destination = d.ctaDestination
        track('cta_clicked', props)
        if (d.ctaPlan && window.location.pathname.startsWith('/pricing')) track('pricing_cta_clicked', props)
      } catch { /* never break a click */ }
    }
    document.addEventListener('click', onClick, { capture: true })
    return () => document.removeEventListener('click', onClick, { capture: true })
  }, [])

  return null
}
