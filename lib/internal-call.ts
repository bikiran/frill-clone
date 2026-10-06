import { createHmac, timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'

// Server-to-server calls between our own API routes (the scheduler, payment
// reminders, coupon and order notifications calling /api/email/reply) carry
// this header instead of a user's token. It's an HMAC of the service-role key,
// so the key itself never goes over the wire. Server-only.

const HEADER = 'x-colvy-internal'

function token(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return key ? createHmac('sha256', key).update('colvy-internal-call-v1').digest('hex') : ''
}

export function internalHeaders(extra?: Record<string, string>): Record<string, string> {
  const t = token()
  return { ...(extra || {}), ...(t ? { [HEADER]: t } : {}) }
}

export function isInternalCall(req: NextRequest): boolean {
  const want = token()
  const got = req.headers.get(HEADER) || ''
  if (!want || got.length !== want.length) return false
  return timingSafeEqual(Buffer.from(got), Buffer.from(want))
}
