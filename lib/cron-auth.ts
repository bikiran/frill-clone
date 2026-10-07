import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { isInternalCall } from '@/lib/internal-call'

// Scheduled jobs (/api/cron/*, review dispatch, calendar reminders) run from
// Vercel Cron, which sends `Authorization: Bearer $CRON_SECRET`, or from one of
// our own routes with the internal header. Nobody else needs to start them.
//
// With no CRON_SECRET set, Vercel sends no header, so refusing would stop every
// job — they stay open and we log it. Set CRON_SECRET in Vercel to close them.
// Server-only.

let warned = false

export function isCronCall(req: NextRequest): boolean {
  if (isInternalCall(req)) return true
  const secret = process.env.CRON_SECRET
  if (!secret) {
    if (!warned) { warned = true; console.warn('[cron] CRON_SECRET is not set — scheduled jobs are open to anyone') }
    return true
  }
  const got = Buffer.from(req.headers.get('authorization') || '')
  const want = Buffer.from(`Bearer ${secret}`)
  return got.length === want.length && timingSafeEqual(got, want)
}

export function cronOr401(req: NextRequest): NextResponse | null {
  return isCronCall(req) ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
