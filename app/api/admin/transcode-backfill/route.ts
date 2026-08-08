import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isR2PublicUrl } from '@/lib/r2'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPER_ADMIN = 'bishalstha76@gmail.com'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

/**
 * POST /api/admin/transcode-backfill  { companyId? }
 *
 * One-off catch-up: mark existing gallery videos that never got a processed
 * `playback_url` as `pending` so the transcode worker (cron, every minute)
 * picks them up. Videos uploaded before the pipeline existed were backfilled to
 * `ready` = the raw original, so they still play slowly — this re-queues them.
 *
 * Auth: the super-admin's Bearer token, or `Authorization: Bearer <CRON_SECRET>`.
 * Only rows whose source is one of our own R2 objects are queued (SSRF-safe).
 * Idempotent — re-running only touches rows still lacking a playback_url.
 */
export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const cronOk = !!process.env.CRON_SECRET && token === process.env.CRON_SECRET
    let authed = cronOk
    if (!authed && token) {
      const { data } = await db.auth.getUser(token)
      authed = (data?.user?.email || '').toLowerCase() === SUPER_ADMIN
    }
    if (!authed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { companyId } = await req.json().catch(() => ({}))

    // Videos that haven't been processed yet (no playback_url).
    let q = db.from('media_items').select('id, url, source_url')
      .eq('kind', 'video').is('playback_url', null).limit(1000)
    if (companyId) q = q.eq('company_id', companyId)
    const { data: rows } = await q

    const eligible = (rows || []).filter((r: any) => isR2PublicUrl(r.source_url || r.url))
    let marked = 0
    for (const r of eligible) {
      const src = r.source_url || r.url
      const { data: upd } = await db.from('media_items')
        .update({ processing_status: 'pending', transcode_attempts: 0, transcode_error: null, source_url: src })
        .eq('id', r.id).is('playback_url', null)
        .select('id').maybeSingle()
      if (upd) marked++
    }

    return NextResponse.json({
      ok: true, scanned: rows?.length || 0, marked,
      note: 'Queued. The transcode-worker cron drains a few per minute; large backlogs take a little while.',
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
