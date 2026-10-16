// The HTTP glue for the public poll and survey routes: who's calling (voter
// cookie / header, IP, campaign click) and turning a handler's result into a
// response with the right cookies. The decisions are in lib/engage-server.ts.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkBurst } from '@/lib/rate-limit'
import { notifyCompany } from '@/lib/notify'
import { findCompanyClick } from '@/lib/link-stitch'
import { VOTER_COOKIE, VOTER_HEADER, isVoterKey, votedCookie, type Caller, type Deps } from '@/lib/engage-server'
import type { EngageKind } from '@/lib/engage-core'

/** Service-role client, or null when the key isn't configured (never the anon key: V386 closes the answer tables to it). */
export function engageDb(): any | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export function engageDeps(db: any): Deps {
  return {
    db,
    limit: checkBurst,
    secret: process.env.SUPABASE_SERVICE_ROLE_KEY || 'colvy',
    notify: (companyId, message) => notifyCompany({ companyId, type: 'activity', message, db }),
    contactForClick: async (companyId, ref) => (await findCompanyClick(db, companyId, ref))?.contact_id || null,
  }
}

export function callerOf(req: NextRequest, kind: EngageKind, id: string, clickRef?: unknown): Caller {
  const fromCookie = req.cookies.get(VOTER_COOKIE)?.value
  const fromHeader = req.headers.get(VOTER_HEADER)
  const voterKey = isVoterKey(fromCookie) ? fromCookie : isVoterKey(fromHeader) ? fromHeader : null
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
  return { voterKey, ip, clickRef, votedFlag: req.cookies.get(votedCookie(kind, id))?.value === '1' }
}

const YEAR = 365 * 86_400

/**
 * Votes and answers must come from our own page (the poll page or its embed
 * iframe, both on this origin), not a form or script on another site. Browsers
 * send Sec-Fetch-Site and Origin on a POST; either one saying "another site" is
 * refused. (Scripts outside a browser can forge these; the per-connection cap
 * is what limits them.)
 */
export function sameSite(req: NextRequest): boolean {
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return false
  const origin = req.headers.get('origin')
  if (origin) {
    const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').split(',')[0].trim()
    try { if (!host || new URL(origin).host !== host) return false } catch { return false }
  }
  return true
}

export const crossSite = () => NextResponse.json({ error: 'Please vote from the poll page.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })

/**
 * `embedded`: the page is inside an iframe on the business's own site, where
 * only a SameSite=None cookie is sent back; otherwise the cookie is Lax.
 */
export function reply(out: { status: number; body: any; setVoter?: string; setFlag?: boolean }, kind: EngageKind, id: string, embedded = false): NextResponse {
  // The voter id goes back in the body too, so a page in an embed (where the
  // cookie may be blocked) can keep it in localStorage and send it as a header.
  const body = out.setVoter ? { ...out.body, voter: out.setVoter } : out.body
  const res = NextResponse.json(body, { status: out.status, headers: { 'Cache-Control': 'no-store' } })
  const opts = { httpOnly: true, secure: true, sameSite: (embedded ? 'none' : 'lax') as 'none' | 'lax', path: '/', maxAge: YEAR }
  if (out.setVoter) res.cookies.set(VOTER_COOKIE, out.setVoter, opts)
  if (out.setFlag) res.cookies.set(votedCookie(kind, id), '1', { ...opts, path: `/api/${kind === 'poll' ? 'polls' : 'surveys'}/${id}` })
  return res
}

export const unavailable = () => NextResponse.json({ error: 'This isn’t available right now. Please try again later.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
