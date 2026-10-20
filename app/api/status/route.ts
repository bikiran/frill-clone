import { NextResponse } from 'next/server'
import { getPublicStatus } from '@/lib/status-cached'

// GET /api/status — Colvy's public system status: each component's coarse
// status (operational / degraded / outage / unknown), our own latency for the
// web app and database, published incidents and the 30-day history. Nothing
// about any business. Public; computed at most about once a minute
// (lib/status-cached.ts), and CDN-cacheable for a minute too.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const status = await getPublicStatus()
    return NextResponse.json(status, { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=60' } })
  } catch {
    return NextResponse.json({ error: 'Status is unavailable right now' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
