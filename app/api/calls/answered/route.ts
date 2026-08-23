import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const digits9 = (s: any) => String(s || '').replace(/\D/g, '').slice(-9)

function prettyFromEmail(email: string): string {
  const local = String(email || '').split('@')[0] || ''
  const pretty = local.replace(/[._-]+/g, ' ').replace(/\d+$/, '').trim()
    .split(/\s+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  return pretty || local || 'A team member'
}

async function agentName(db: any, userId: string, companyId: string, fallback?: string): Promise<string> {
  if (fallback && fallback.trim()) return fallback.trim()
  try {
    const { data } = await db.auth.admin.getUserById(userId)
    const u = data?.user
    const meta = (u?.user_metadata?.display_name || u?.user_metadata?.full_name) as string | undefined
    if (meta && meta.trim()) return meta.trim()
    if (u?.email) return prettyFromEmail(u.email)
  } catch {}
  try {
    const { data: tm } = await db.from('team_members').select('email').eq('user_id', userId).eq('company_id', companyId).maybeSingle()
    if (tm?.email) return prettyFromEmail(tm.email)
  } catch {}
  return 'A team member'
}

/**
 * POST /api/calls/answered
 * Body: { companyId, userId, from?, callId?, callSid?, name? }
 *
 * A team member answered an inbound call ON THEIR PHONE (the mobile app owns the
 * accept, so the web ring-all child-status callback may never fire for it).
 * Record who took it on the call row and ping the rest of the team once —
 * mirroring /api/twilio/voice/child-status for the mobile-answered case.
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, userId, from, callId, callSid, name: nameIn } = await req.json().catch(() => ({}))
    if (!companyId || !userId) return NextResponse.json({ error: 'companyId and userId required' }, { status: 400 })

    const db = admin()
    const name = await agentName(db, userId, companyId, nameIn)

    // Find the call row to claim: the specific one by sid/id if given, else the
    // most recent inbound call from this number that nobody's claimed yet.
    let row: any = null
    if (callSid || callId) {
      const key = callSid || callId
      const { data } = await db.from('calls').select('id, conversation_id, answered_by_user_id, caller_name, contact_name, from_number')
        .eq('company_id', companyId).or(`twilio_call_sid.eq.${key},twilio_child_call_sid.eq.${key}`).limit(1)
      row = data?.[0] || null
    }
    if (!row && from) {
      const since = new Date(Date.now() - 15 * 60 * 1000).toISOString()
      const { data } = await db.from('calls').select('id, conversation_id, answered_by_user_id, caller_name, contact_name, from_number, created_at')
        .eq('company_id', companyId).eq('direction', 'inbound').gte('created_at', since)
        .order('created_at', { ascending: false }).limit(10)
      const target = digits9(from)
      row = (data || []).find((r: any) => digits9(r.from_number) === target) || null
    }
    if (!row) return NextResponse.json({ ok: true, claimed: false })

    // Claim only if not already claimed, so a ring-all doesn't fire twice.
    const patch: any = { answered_by_user_id: userId, answered_by: name, agent_name: name, answered_at: new Date().toISOString() }
    let claimed = false
    try {
      const { data: updated } = await db.from('calls').update(patch).eq('id', row.id).is('answered_by_user_id', null).select('id')
      claimed = Array.isArray(updated) && updated.length > 0
    } catch {
      // answered_at/answered_by columns may not all exist on older schemas — retry minimal.
      try {
        const { data: updated } = await db.from('calls').update({ agent_name: name, answered_by: name }).eq('id', row.id).is('answered_by_user_id', null).select('id')
        claimed = Array.isArray(updated) && updated.length > 0
      } catch {}
    }

    if (claimed) {
      const caller = String(row.contact_name || row.caller_name || row.from_number || '').trim()
      const base = String(process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')
      try {
        await fetch(`${base}/api/push/send`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId,
            title: 'Call answered',
            body: `${name} accepted the call${caller ? ` from ${caller}` : ''}`,
            excludeUserId: userId,
            channelId: 'calls',
            ...(row.id ? { route: `/call-detail/${row.id}` } : {}),
          }),
        })
      } catch {}
    }

    return NextResponse.json({ ok: true, claimed })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
