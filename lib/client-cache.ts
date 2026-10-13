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

// The admin layout already works out who you are and which company you're in;
// handing that over saves every page its own lookup.
export function seedCompanyUser(v: CompanyUser) {
  if (v.user && v.companyId) cachedCompanyUser = v
}

// ── Admin gate memory ───────────────────────────────────────────────────────
// The last "yes, this person may use this admin" answer, per host, so a reload
// opens the admin straight away while the full check runs in the background.
// It's only about what the screen shows first: every read and write is still
// checked by the database and the API.
const gateKey = () => `colvy:admin-gate:${typeof window !== 'undefined' ? window.location.hostname : ''}`
export type AdminGate = { userId: string; company: any; at: number }
const GATE_MAX_AGE = 30 * 86_400_000

export function readAdminGate(): AdminGate | null {
  try {
    const g = JSON.parse(localStorage.getItem(gateKey()) || 'null')
    if (!g?.userId || !g?.company?.id || Date.now() - (g.at || 0) > GATE_MAX_AGE) return null
    return g
  } catch { return null }
}
export function writeAdminGate(userId: string, company: any) {
  try { if (userId && company?.id) localStorage.setItem(gateKey(), JSON.stringify({ userId, company, at: Date.now() })) } catch {}
}
export function clearAdminGate() {
  try { localStorage.removeItem(gateKey()) } catch {}
}

/** The signed-in user from Supabase's stored session, read without a network call (null if none or unusable). */
export function peekStoredUser(): any | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || ''
      if (!/^sb-.+-auth-token$/.test(k)) continue
      const v = JSON.parse(localStorage.getItem(k) || 'null')
      const sess = v?.currentSession || v
      if (!sess?.user?.id) continue
      // Usable if it hasn't expired, or it can be refreshed.
      const exp = Number(sess.expires_at || 0) * 1000
      if ((exp && exp > Date.now()) || sess.refresh_token) return sess.user
    }
  } catch {}
  return null
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
      clearAdminGate()
      clearStored()
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

// ── Same, but also kept in this browser ─────────────────────────────────────
// For pages whose data is slow to work out (the AI pages): the last result is
// kept in localStorage too, so even a fresh page load paints straight away and
// refreshes underneath. Wiped on sign-out. Keys should include the company id.
const STORED_PREFIX = 'colvy:c:'

export function readStored<T>(key: string | null | undefined): T | undefined {
  if (!key) return undefined
  if (dataCache.has(key)) return dataCache.get(key) as T
  try {
    const raw = localStorage.getItem(STORED_PREFIX + key)
    if (raw == null) return undefined
    const v = JSON.parse(raw) as T
    dataCache.set(key, v)
    return v
  } catch { return undefined }
}

export function writeStored<T>(key: string | null | undefined, value: T): void {
  if (!key) return
  dataCache.set(key, value)
  try { localStorage.setItem(STORED_PREFIX + key, JSON.stringify(value)) } catch { /* full or blocked: memory copy still works */ }
}

export function clearStored(): void {
  for (const k of Array.from(dataCache.keys())) dataCache.delete(k)
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && (k.startsWith(STORED_PREFIX) || k.startsWith('colvy:needs-you:'))) localStorage.removeItem(k)
    }
  } catch {}
}
