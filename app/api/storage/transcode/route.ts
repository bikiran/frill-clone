import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { processJobById } from '@/lib/transcode'
import { isR2PublicUrl } from '@/lib/r2'

// FFmpeg needs the Node runtime (not Edge) and time to work.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

/**
 * POST /api/storage/transcode
 *
 * Called by the app right after a video's ORIGINAL lands in R2. We mark the row
 * pending, remember the source, and start the transcode in an after() hook so
 * the response returns immediately (the phone never waits on FFmpeg). The cron
 * worker is the backstop if this invocation is cut short.
 *
 * Body: { companyId, mediaItemId, sourceUrl, sourceKey?, contentType? }
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, mediaItemId, sourceUrl } = await req.json().catch(() => ({}))
    if (!companyId || !mediaItemId) {
      return NextResponse.json({ ok: false, error: 'Missing companyId or mediaItemId' }, { status: 400 })
    }
    const db = admin()

    // Only act on a real video row for this company — never trust the caller to
    // name an arbitrary target.
    const { data: row } = await db.from('media_items')
      .select('id, kind, url, source_url, playback_url')
      .eq('id', mediaItemId).eq('company_id', companyId).maybeSingle()
    if (!row) return NextResponse.json({ ok: false, error: 'Media item not found' }, { status: 404 })
    if (row.kind !== 'video') return NextResponse.json({ ok: false, error: 'Not a video' }, { status: 400 })
    if (row.playback_url) return NextResponse.json({ ok: true, queued: false, alreadyDone: true })

    // The worker downloads this URL, so it MUST be one of our own R2 objects —
    // otherwise a caller could point the fetch at an internal/arbitrary host
    // (SSRF). Prefer what's already on the row; only fall back to the supplied
    // URL when it's a valid R2 URL.
    const source = [row.source_url, row.url, sourceUrl].find(u => isR2PublicUrl(u))
    if (!source) return NextResponse.json({ ok: false, error: 'No valid R2 source for this item' }, { status: 400 })

    // Idempotent: only (re)queue a row that isn't already processed.
    await db.from('media_items')
      .update({ processing_status: 'pending', source_url: source })
      .eq('id', mediaItemId).eq('company_id', companyId)
      .is('playback_url', null)

    // Process just after responding — near-instant, no cron wait.
    after(async () => { try { await processJobById(db, mediaItemId) } catch {} })

    return NextResponse.json({ ok: true, queued: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
