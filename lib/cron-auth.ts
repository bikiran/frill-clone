import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { isInternalCall } from '@/lib/internal-call'

// Scheduled jobs (/api/cron/*, review dispatch, calendar reminders) run from
// Vercel Cron, which sends `Authorization: Bearer $CRON_SECRET`, or from one of
// our own routes with the internal header. Nobody else needs to start them.
//
// With no CRON_SECRET set, Vercel sends no header. In production that refuses
// every job (they send texts and emails, and spend money) and logs why: set
// CRON_SECRET in Vercel. Locally and in tests they stay open so they can be run
// by hand. Server-only.

let warned = false

export function isCronCall(req: NextRequest): boolean {
  if (isInternalCall(req)) return true
  const secret = process.env.CRON_SECRET
  if (!secret) {
    const production = process.env.NODE_ENV === 'production'
    if (!warned) { warned = true; console.error(production ? '[cron] CRON_SECRET is not set — scheduled jobs are refused until it is' : '[cron] CRON_SECRET is not set — scheduled jobs are open (not production)') }
    return !production
  }
  const got = Buffer.from(req.headers.get('authorization') || '')
  const want = Buffer.from(`Bearer ${secret}`)
  return got.length === want.length && timingSafeEqual(got, want)
}

export function cronOr401(req: NextRequest): NextResponse | null {
  return isCronCall(req) ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
