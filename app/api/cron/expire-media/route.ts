import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Gallery items sit in Trash (media_items.trashed_at) for this many days before
// they're permanently removed — matches the web's "auto-delete after 30 days".
const TRASH_RETENTION_DAYS = 30

/**
 * GET /api/cron/expire-media
 *
 * Handles the "advanced" auto-delete expiry mode. Access-mode expiry needs no
 * cron — the /m/ viewer simply stops serving once expires_at passes. But
 * expiry_mode = 'delete' means the media should be permanently removed from
 * Colvy too, so this sweep:
 *   1. finds delete-mode links whose expires_at has passed and aren't purged,
 *   2. deletes the matching gallery items (by url), and
 *   3. blanks the link's media and marks it purged so it's never re-processed.
 *
 * It ALSO purges gallery items that have been in Trash (trashed_at) for more
 * than TRASH_RETENTION_DAYS, so soft-deleted media doesn't linger forever.
 *
 * Runs daily (see vercel.json). Nothing here touches access-mode links.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = admin()
  const nowIso = new Date().toISOString()

  let due: any[] = []
  try {
    const { data, error } = await db.from('short_links')
      .select('id, code, company_id, target_url, media_urls, expires_at')
      .eq('expiry_mode', 'delete')
      .lt('expires_at', nowIso)
      .or('expired_purged.is.null,expired_purged.eq.false')
      .limit(500)
    if (error) {
      // Migration V247 not applied yet — nothing to do.
      return NextResponse.json({ ok: true, note: 'expiry columns not present', purged: 0 })
    }
    due = data || []
  } catch {
    return NextResponse.json({ ok: true, purged: 0 })
  }

  let purged = 0
  let itemsDeleted = 0
  for (const link of due) {
    try {
      // Collect every url this link exposed (gallery set + single target).
      const urls = new Set<string>()
      if (Array.isArray(link.media_urls)) for (const m of link.media_urls) if (m?.url) urls.add(m.url)
      if (link.target_url) urls.add(link.target_url)

      if (urls.size && link.company_id) {
        const { data: del } = await db.from('media_items')
          .delete()
          .eq('company_id', link.company_id)
          .in('url', Array.from(urls))
          .select('id')
        itemsDeleted += del?.length || 0
      }

      // Blank the link so the viewer shows "expired/unavailable", and mark it so
      // the sweep never touches it again.
      await db.from('short_links')
        .update({ media_urls: [], target_url: null, expired_purged: true })
        .eq('id', link.id)
      purged++
    } catch (e: any) {
      // Skip a bad row; the next run retries it (still unpurged).
      console.error('[expire-media] failed for', link.code, e?.message)
    }
  }

  // Purge gallery items that have been in Trash for 30+ days.
  let trashPurged = 0
  try {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 86400 * 1000).toISOString()
    const { data: stale } = await db.from('media_items')
      .select('id')
      .not('trashed_at', 'is', null)
      .lt('trashed_at', cutoff)
      .limit(1000)
    const ids = (stale || []).map((r: any) => r.id).filter(Boolean)
    if (ids.length) {
      // Drop category links first so no orphaned rows are left behind.
      try { await db.from('media_item_categories').delete().in('media_item_id', ids) } catch {}
      const { data: del } = await db.from('media_items').delete().in('id', ids).select('id')
      trashPurged = del?.length || 0
    }
  } catch (e: any) {
    console.error('[expire-media] trash purge failed', e?.message)
  }

  return NextResponse.json({ ok: true, purged, itemsDeleted, trashPurged })
}
