import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runCartRecovery } from '@/lib/cart-recovery'
import { queueCartFollowups } from '@/lib/agent/sales'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/cart-recovery
 *
 * Sends the optional abandoned-cart message (off unless a business turns it on
 * under Settings → Order Automation). One message per cart, a set delay after
 * the shopper's last cart activity, within 9am–8pm. See lib/cart-recovery.ts.
 * When the Sales Agent is on, it queues a personal follow-up instead
 * (lib/agent/sales.ts).
 * Runs on a schedule (see vercel.json). Honours CRON_SECRET like the others.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
    const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').replace(/\/$/, '')
    const result = await runCartRecovery(db, { origin })
    // Businesses with the Sales Agent on get a personal follow-up instead (the agent worker sends it).
    const agent = await queueCartFollowups(db).catch((e: any) => ({ error: e?.message }))
    return NextResponse.json({ ok: true, ...result, agent })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Failed' }, { status: 500 })
  }
}
