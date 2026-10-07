import { cronOr401 } from '@/lib/cron-auth'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyCompany } from '@/lib/notify'
import { computeSla, resolveSla, humanDuration } from '@/lib/ticket-sla'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * GET /api/cron/ticket-sla
 *
 * Alerts the team ONCE when a ticket misses its deadline (no first reply in
 * time, or not resolved in time). Vercel Cron runs it every five minutes
 * (vercel.json). Safe to call often: each ticket is alerted at
 * most once (sla_breach_notified_at), and it only reads/updates tickets.
 */
export async function GET(req: NextRequest) {
  const denied = cronOr401(req)
  if (denied) return denied
  try {
    const db = admin()
    const { data: tickets, error } = await db.from('support_tickets')
      .select('id, company_id, ticket_number, subject, priority, status, created_at, updated_at, first_response_at, resolved_at, sla_breach_notified_at')
      .in('status', ['open', 'in_progress']).is('sla_breach_notified_at', null)
      .order('created_at', { ascending: true }).limit(1000)
    if (error) return NextResponse.json({ ok: true, alerted: 0, note: error.message })   // pre-migration: quietly do nothing

    const settingsCache = new Map<string, any>()
    let alerted = 0
    const now = new Date()
    for (const t of tickets || []) {
      if (!settingsCache.has(t.company_id)) {
        const { data: co } = await db.from('companies').select('ticket_sla_settings').eq('id', t.company_id).maybeSingle()
        settingsCache.set(t.company_id, resolveSla(co?.ticket_sla_settings))
      }
      const sla = computeSla(t, settingsCache.get(t.company_id), now)
      const fr = sla.firstResponse, rs = sla.resolution
      let message: string | null = null
      if (fr.state === 'overdue') message = `⏰ ${t.ticket_number} is overdue — no reply yet (${humanDuration(fr.msLeft)} past the deadline): "${t.subject}"`
      else if (rs.state === 'overdue') message = `⏰ ${t.ticket_number} missed its resolution deadline by ${humanDuration(rs.msLeft)}: "${t.subject}"`
      if (!message) continue
      // Claim first so two overlapping cron runs can't alert twice.
      const { data: claimed } = await db.from('support_tickets').update({ sla_breach_notified_at: now.toISOString() })
        .eq('id', t.id).is('sla_breach_notified_at', null).select('id')
      if (!claimed?.length) continue
      try { await notifyCompany({ db, companyId: t.company_id, type: 'ticket', message }) } catch {}
      alerted++
    }
    return NextResponse.json({ ok: true, alerted })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message })
  }
}
