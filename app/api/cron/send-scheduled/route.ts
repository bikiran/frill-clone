import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logJobRun } from '@/lib/job-log'
import { claimScheduled, deliverScheduled } from '@/lib/scheduled-send'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * GET /api/cron/send-scheduled
 *
 * Delivers scheduled chat replies whose time has come. An agent can compose a
 * reply and pick "Schedule message" from the Send menu; that stores a row in
 * scheduled_messages (status 'pending'). This cron finds due rows and sends each
 * one on the conversation's channel, exactly like the inbox does live:
 *   Instagram / Messenger → /api/meta/send
 *   Email                 → /api/email/reply
 *   SMS                   → /api/telnyx/sms/send
 *   Live chat / widget    → inserted straight into messages
 * Then marks the row 'sent' (or 'failed' with the reason).
 *
 * Runs on a schedule (see vercel.json). Honours CRON_SECRET like the others.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  const db = admin()
  const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')

  let sent = 0, failed = 0
  try {
    const { data: due } = await db.from('scheduled_messages').select('*')
      .eq('status', 'pending').eq('type', 'message')
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true }).limit(50)

    for (const row of (due || [])) {
      // Claim first: a "Send now" from the inbox may have taken it already.
      const sm = await claimScheduled(db, row.id)
      if (!sm) continue
      const r = await deliverScheduled(db, base, sm)
      await db.from('scheduled_messages').update({ status: r.ok ? 'sent' : 'failed' }).eq('id', sm.id)
      if (r.ok) sent++; else { failed++; if (r.error) console.warn('[send-scheduled]', sm.id, r.error) }
    }
  } catch (e: any) {
    await logJobRun({ job: 'send-scheduled', startedAt, durationMs: Date.now() - t0, status: 'error', detail: { error: e?.message } })
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }

  await logJobRun({ job: 'send-scheduled', startedAt, durationMs: Date.now() - t0, status: (sent || failed) ? 'success' : 'idle', detail: { sent, failed } })
  return NextResponse.json({ ok: true, sent, failed })
}
