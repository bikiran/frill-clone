import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * The numbers in the marketing page's stats band.
 *
 * The landing page used to work these out in the browser, with the anon key,
 * by counting `messages`, `conversations`, `contacts` and `orders` directly and
 * pulling twenty thousand rows of `calls` and `chat_payments` to sum them. That
 * is why those tables had to stay readable by anyone: a public page needed
 * SELECT on every company's customer data in order to render seven numbers.
 *
 * Seven numbers is all this returns. The counting happens here, on the service
 * role, and nothing but the totals crosses the wire.
 *
 * Cached for five minutes — it is a vanity band on a marketing page, not a
 * dashboard, and it should not run a table scan for every visitor.
 */
let cache: { at: number; data: any } | null = null
const TTL_MS = 5 * 60 * 1000

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json(cache.data)
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    // Without the service role there is nothing honest to report, and the
    // anon key would only reproduce the problem this endpoint exists to fix.
    return NextResponse.json({ teams: 0, conversations: 0, messages: 0, contacts: 0, orders: 0, callMinutes: 0, paymentsTotal: 0 })
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as any

  const count = async (table: string) => {
    const { count: n } = await db.from(table).select('*', { count: 'exact', head: true })
    return n || 0
  }

  try {
    const [teams, conversations, messages, contacts, orders, calls, pays] = await Promise.all([
      count('companies'), count('conversations'), count('messages'),
      count('contacts'), count('orders'),
      db.from('calls').select('duration_seconds').limit(20000),
      db.from('chat_payments').select('amount_cents').eq('status', 'paid').limit(20000),
    ])

    const data = {
      teams, conversations, messages, contacts, orders,
      callMinutes: Math.round((calls.data || []).reduce((s: number, r: any) => s + (r.duration_seconds || 0), 0) / 60),
      paymentsTotal: Math.round((pays.data || []).reduce((s: number, r: any) => s + (r.amount_cents || 0), 0) / 100),
    }
    cache = { at: Date.now(), data }
    return NextResponse.json(data)
  } catch (e: any) {
    console.error('[platform-stats]', e?.message || e)
    return NextResponse.json({ teams: 0, conversations: 0, messages: 0, contacts: 0, orders: 0, callMinutes: 0, paymentsTotal: 0 })
  }
}
