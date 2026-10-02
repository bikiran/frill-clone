import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logJobRun } from '@/lib/job-log'
import { rebuildKnowledge } from '@/lib/ai-knowledge'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * GET /api/cron/ai-knowledge — hourly.
 *
 * Help articles, announcements, ideas and facts sync instantly through
 * database triggers. This refreshes what triggers can't see (the website and
 * past conversations) about once a day per company with Colvy AI switched
 * on, a few companies per run so no single run gets long.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && (req.headers.get('authorization') || '') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const t0 = Date.now(), startedAt = new Date().toISOString()
  try {
    const db = admin()
    const dayAgo = new Date(Date.now() - 20 * 3600_000).toISOString()
    const { data: due, error } = await db.from('companies').select('id')
      .eq('ai_settings->>enabled', 'true')
      .or(`ai_knowledge_synced_at.is.null,ai_knowledge_synced_at.lt.${dayAgo}`)
      .order('ai_knowledge_synced_at', { ascending: true, nullsFirst: true }).limit(4)
    if (error) {
      await logJobRun({ job: 'ai-knowledge', startedAt, durationMs: Date.now() - t0, status: 'idle', detail: { note: error.message } })
      return NextResponse.json({ ok: true, skipped: error.message })
    }
    const done: any[] = []
    for (const c of due || []) {
      if (Date.now() - t0 > 240_000) break
      try { const r = await rebuildKnowledge(db, c.id); done.push({ id: c.id, total: r.total }) }
      catch (e: any) { done.push({ id: c.id, error: e?.message }) }
    }
    await logJobRun({ job: 'ai-knowledge', startedAt, durationMs: Date.now() - t0, status: done.length ? 'success' : 'idle', detail: { done } })
    return NextResponse.json({ ok: true, done })
  } catch (e: any) {
    await logJobRun({ job: 'ai-knowledge', startedAt, durationMs: Date.now() - t0, status: 'error', error: e?.message })
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
