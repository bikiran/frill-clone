'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Client-side caches that make browsing the admin feel instant.
//
// The admin is a single-page app: navigating between tabs (Gallery, Calendar,
// Tasks, …) never reloads the browser, so module-level state survives every
// navigation. We lean on that in two ways:
//
//  1. resolveCompanyUser() — the "who am I / which company" lookup used to run
//     on EVERY page mount (a getSession + a companies query), gating the first
//     render behind a network round trip each time you switched tabs. It never
//     changes within a session, so we resolve it once and hand back the cached
//     value synchronously forever after.
//
//  2. readCache/writeCache — a tiny stale-while-revalidate store. A page seeds
//     its list from the last dataset it rendered (instant paint) and refetches
//     in the background, instead of showing a spinner on every revisit.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase'

export type CompanyUser = { companyId: string | null; user: any }

let cachedCompanyUser: CompanyUser | null = null
let inflight: Promise<CompanyUser> | null = null

// Synchronous peek — lets components seed their initial state without a flash
// of loading UI when the answer is already known.
export function peekCompanyUser(): CompanyUser | null {
  return cachedCompanyUser
}

// Drop the cache so the next resolve re-runs. Called on sign-out (below).
export function clearCompanyUser() {
  cachedCompanyUser = null
  inflight = null
}

async function doResolve(): Promise<CompanyUser> {
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user ?? null
  let companyId: string | null = null
  if (user && typeof window !== 'undefined') {
    const h = window.location.hostname
    if (h.endsWith('.colvy.com') && h !== 'colvy.com' && h !== 'www.colvy.com') {
      const { data: co } = await (supabase as any)
        .from('companies').select('id').eq('slug', h.replace('.colvy.com', '')).maybeSingle()
      if (co) companyId = co.id
    }
    if (!companyId) {
      const { data: ownCo } = await (supabase as any)
        .from('companies').select('id').eq('owner_id', user.id).maybeSingle()
      if (ownCo) companyId = ownCo.id
    }
  }
  return { companyId, user }
}

// Resolve once, then serve the cached value. Concurrent callers share one
// in-flight promise so a burst of page mounts never fans out into N lookups.
export async function resolveCompanyUser(): Promise<CompanyUser> {
  if (cachedCompanyUser) return cachedCompanyUser
  if (inflight) return inflight
  inflight = doResolve()
    .then(result => { cachedCompanyUser = result; return result })
    .finally(() => { inflight = null })
  return inflight
}

// Invalidate the identity cache when the auth state actually changes, so a
// sign-out (or account switch) can't leak the previous company's id.
if (typeof window !== 'undefined') {
  let lastUserId: string | undefined = undefined
  supabase.auth.onAuthStateChange((event, session) => {
    const uid = session?.user?.id
    if (event === 'SIGNED_OUT' || (lastUserId !== undefined && uid !== lastUserId)) {
      clearCompanyUser()
    }
    lastUserId = uid
  })
}

// ── Generic stale-while-revalidate store ────────────────────────────────────
// Keyed by an arbitrary string. Values live for the lifetime of the SPA session
// (until a full reload), which is exactly the window over which tab-switching
// should feel instant.
const dataCache = new Map<string, unknown>()

export function readCache<T>(key: string): T | undefined {
  return dataCache.get(key) as T | undefined
}

export function writeCache<T>(key: string, value: T): void {
  dataCache.set(key, value)
}

export function hasCache(key: string): boolean {
  return dataCache.has(key)
}
