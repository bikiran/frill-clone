import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyWaitlist, resolveWaitlistSettings } from '@/lib/waitlist'
import { isWithinSendingHours } from '@/lib/campaign-sender'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * GET /api/cron/waitlist
 *
 * Sends back-in-stock texts that were held because the stock arrived outside
 * sending hours (e.g. a WooCommerce update at 11pm → texts go out at 9am).
 * Pinged from the admin app every couple of minutes alongside email-sync (see
 * app/admin/layout.tsx). Deliberately open: calling it can only send texts that
 * customers asked for and that are already queued, and only once their company
 * is inside its sending window — the same thing that would happen anyway.
 */
export async function GET(_req: NextRequest) {
  try {
    const db = admin()

    // A send that crashed mid-way leaves a row in 'sending' — put it back.
    const stale = new Date(Date.now() - 15 * 60000).toISOString()
    await db.from('stock_waitlist').update({ status: 'queued' }).eq('status', 'sending').lt('queued_at', stale)

    const { data: queued, error } = await db.from('stock_waitlist').select('id, company_id').eq('status', 'queued').limit(1000)
    if (error) return NextResponse.json({ ok: true, ran: 0, note: error.message })

    const byCompany = new Map<string, string[]>()
    for (const r of queued || []) {
      const list = byCompany.get(r.company_id) || []
      list.push(r.id); byCompany.set(r.company_id, list)
    }

    const results: any[] = []
    for (const [companyId, ids] of Array.from(byCompany.entries())) {
      const { data: co } = await db.from('companies').select('waitlist_settings').eq('id', companyId).maybeSingle()
      const settings = resolveWaitlistSettings((co as any)?.waitlist_settings)
      if (!isWithinSendingHours(new Date(), settings.timezone)) continue
      const r = await notifyWaitlist(db, { companyId, ids, respectHours: true })
      results.push({ companyId, ...r })
    }
    return NextResponse.json({ ok: true, ran: results.length, results })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message })
  }
}
