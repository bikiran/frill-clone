import { NextRequest, NextResponse } from 'next/server'
import { cronOr401 } from '@/lib/cron-auth'
import { logJobRun } from '@/lib/job-log'
import { adminDb } from '@/lib/announcements-server'
import { claimNotify, notifyAnnouncement } from '@/lib/announcement-notify'
import { emitIntegrationEvent } from '@/lib/integration-events'
import { htmlToText } from '@/lib/safe-html'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * GET /api/cron/announcements — every 5 minutes (vercel.json).
 *
 *   1. Scheduled posts whose time has come go live: status scheduled →
 *      published (claimed with a conditional update, so overlapping runs can't
 *      both do it). Connected apps hear announcement.published, and if the post
 *      was set to notify when it goes live, the board and opted-in customers
 *      are told (once: notified_at is claimed the same way).
 *   2. Posts past their end date leave Colvy AI's knowledge, so the AI doesn't
 *      tell a customer about a sale that's over. (The pages already hide them.)
 *
 * Needs V387 (publish_at / expires_at); before it, it finds nothing to do.
 * Honours CRON_SECRET like the other crons.
 */
export async function GET(req: NextRequest) {
  const denied = cronOr401(req)
  if (denied) return denied
  const t0 = Date.now(), startedAt = new Date().toISOString()
  const db = adminDb()
  const nowIso = new Date().toISOString()
  const siteBase = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')
  let published = 0, notified = 0, expired = 0
  try {
    const { data: due, error } = await db.from('announcements').select('*')
      .eq('status', 'scheduled').lte('publish_at', nowIso).order('publish_at', { ascending: true }).limit(25)
    if (error && !/publish_at/.test(error.message || '')) throw new Error(error.message)
    for (const a of due || []) {
      const { data: claimed } = await db.from('announcements').update({ status: 'published', updated_at: nowIso })
        .eq('id', a.id).eq('status', 'scheduled').select('*')
      const live = claimed?.[0]
      if (!live) continue
      published++
      emitIntegrationEvent(live.company_id, 'announcement.published', {
        title: `Announcement: ${String(live.title || '').slice(0, 200)}`, summary: htmlToText(live.description || '').slice(0, 600),
        path: '/admin/announcements', data: { announcement: { id: live.id, title: live.title } }, dedupeKey: `announcement:${live.id}`,
      }, { db })
      const plan = live.notify_stats?.plan
      if (live.notify_subscribers && plan && (plan.board || plan.email) && !live.notified_at && await claimNotify(db, live.id)) {
        const r = await notifyAnnouncement(db, live, { board: !!plan.board, email: !!plan.email, siteBase })
        if (r.done.board || r.done.email) notified++
        else await db.from('announcements').update({ notified_at: null }).eq('id', live.id)
      }
    }

    // Ended posts out of the AI's knowledge (ai_knowledge is server-only).
    const { data: ended } = await db.from('announcements').select('id, company_id')
      .lte('expires_at', nowIso).gte('expires_at', new Date(Date.now() - 7 * 86400_000).toISOString()).limit(200)
    for (const a of ended || []) {
      const { error: delErr } = await db.from('ai_knowledge').delete().eq('company_id', a.company_id).eq('source', 'announcement').eq('source_id', String(a.id))
      if (!delErr) expired++
    }
    await logJobRun({ job: 'announcements', startedAt, durationMs: Date.now() - t0, status: 'success', detail: { published, notified, expired } })
    return NextResponse.json({ ok: true, published, notified, expired })
  } catch (e: any) {
    await logJobRun({ job: 'announcements', startedAt, durationMs: Date.now() - t0, status: 'error', detail: { error: e?.message } })
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
