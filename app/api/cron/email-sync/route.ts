import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncGmailChannel } from '@/lib/gmail'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * GET /api/cron/email-sync
 *
 * Pulls new mail into every connected mailbox. Email had NO automatic sync at
 * all — it only moved when someone pressed the button — so new customer email
 * simply sat in Gmail until an agent thought to check.
 *
 * Driven from the admin app every 2 minutes (see app/admin/layout.tsx). A Vercel
 * cron would be tidier, but the Hobby plan only allows DAILY crons — a
 * five-minute schedule is an invalid config and blocks the deployment entirely.
 *
 * On Vercel Pro, add a vercel.json with a crons entry pointing at this path on a
 * five-minute schedule, and set CRON_SECRET. Vercel then sends it in the Authorization header. With no
 * CRON_SECRET set, the endpoint is open to the app itself (it only pulls mail
 * into mailboxes the business already connected, so there's nothing to leak).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const db = admin()
  const { data: channels } = await db.from('email_channels')
    .select('id, company_id, provider, is_active, sync_interval_minutes, last_synced_at')
    .eq('provider', 'gmail')
    .neq('is_active', false)

  const results: any[] = []
  for (const ch of channels || []) {
    // Respect each mailbox's own interval (default 5 minutes).
    const every = Number(ch.sync_interval_minutes ?? 5)
    if (every <= 0) continue                          // 0 = auto-sync off
    if (ch.last_synced_at) {
      const mins = (Date.now() - new Date(ch.last_synced_at).getTime()) / 60000
      if (mins < every) continue                      // synced recently enough
    }
    try {
      const r = await syncGmailChannel(ch.id)
      results.push({ channel: ch.id, ...r })
    } catch (e: any) {
      results.push({ channel: ch.id, error: e.message })
    }
  }

  return NextResponse.json({ ok: true, ran: results.length, results })
}
