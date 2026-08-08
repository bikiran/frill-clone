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

const isUuid = (v: any): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

// Pull user ids out of a mixed assignees/mentions array — entries can be a bare
// id string or a { id, name } object.
function idsFrom(arr: any): string[] {
  if (!Array.isArray(arr)) return []
  return arr.map((x: any) => (typeof x === 'string' ? x : x?.id)).filter(isUuid)
}

/**
 * GET /api/cron/task-reminders
 *
 * Pushes a phone notification when a task becomes due and isn't done, to the
 * assignee(s) plus anyone @mentioned. Covers both task sources the board shows:
 *   • conversation_tasks (due_date)      → deduped via due_reminded_at
 *   • calendar_events, event_type=task   → deduped via push_reminded_at
 *
 * A task only reminds once (the dedupe columns are stamped after the push). The
 * push carries route '/(tabs)/tasks' so the mobile app deep-links the task list;
 * no conversationId, so it doesn't get the chat Reply/Mark-read actions.
 *
 * Runs on a schedule (see vercel.json).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = admin()
  const base = process.env.NEXT_PUBLIC_SITE_URL || `${req.nextUrl.origin}`
  const nowIso = new Date().toISOString()
  const stampIso = new Date().toISOString()

  const pushTo = async (companyId: string, userIds: string[], body: string) => {
    if (!companyId || userIds.length === 0) return
    try {
      await fetch(`${base}/api/push/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, userIds,
          title: 'Task due',
          body,
          route: '/(tabs)/tasks',
        }),
      })
    } catch (e: any) {
      console.error('[task-reminders] push failed', e?.message)
    }
  }

  let pushed = 0

  // ── conversation_tasks ──────────────────────────────────────────────────────
  try {
    const { data: tasks, error } = await db.from('conversation_tasks')
      .select('id, company_id, text, assigned_to_id, assignees, mentions, due_date, done, due_reminded_at')
      .eq('done', false)
      .not('due_date', 'is', null)
      .lte('due_date', nowIso)
      .is('due_reminded_at', null)
      .limit(300)
    if (error) throw error
    for (const t of (tasks || [])) {
      const recipients = Array.from(new Set([
        ...idsFrom(t.assignees),
        ...(isUuid(t.assigned_to_id) ? [t.assigned_to_id] : []),
        ...idsFrom(t.mentions),
      ]))
      await pushTo(t.company_id, recipients, `Task due: ${String(t.text || 'Task').slice(0, 160)}`)
      if (recipients.length) pushed++
      // Stamp regardless of recipients so an unassigned due task isn't re-scanned
      // every run — "remind once" either way.
      await db.from('conversation_tasks').update({ due_reminded_at: stampIso }).eq('id', t.id)
    }
  } catch (e: any) {
    // Migration V248 not applied yet (missing column) — skip this source.
    console.error('[task-reminders] conversation_tasks skipped', e?.message)
  }

  // ── calendar_events (task type) ─────────────────────────────────────────────
  try {
    const { data: events, error } = await db.from('calendar_events')
      .select('id, company_id, title, assigned_to_id, assignees, starts_at, status, event_type, push_reminded_at')
      .eq('event_type', 'task')
      .in('status', ['scheduled', 'confirmed'])
      .lte('starts_at', nowIso)
      .is('push_reminded_at', null)
      .limit(300)
    if (error) throw error
    for (const e of (events || [])) {
      const recipients = Array.from(new Set([
        ...idsFrom(e.assignees),
        ...(isUuid(e.assigned_to_id) ? [e.assigned_to_id] : []),
      ]))
      await pushTo(e.company_id, recipients, `Task due: ${String(e.title || 'Task').slice(0, 160)}`)
      if (recipients.length) pushed++
      await db.from('calendar_events').update({ push_reminded_at: stampIso }).eq('id', e.id)
    }
  } catch (e: any) {
    console.error('[task-reminders] calendar_events skipped', e?.message)
  }

  return NextResponse.json({ ok: true, pushed })
}
