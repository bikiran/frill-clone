import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function userFromReq(db: any, req: NextRequest): Promise<string | null> {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return null
  try { const { data } = await db.auth.getUser(token); return data?.user?.id || null } catch { return null }
}

/**
 * POST /api/calls/:callId/handoff/cancel   { reason? }
 *
 * Abandon an in-flight handoff (the target didn't accept in time, the new device
 * couldn't connect, or the initiator changed their mind). The original agent leg
 * is untouched — the call keeps running on the current device. `reason:'failed'`
 * records a failure vs a plain cancellation.
 *
 * Callable by any member of the call's company (the initiator or the target);
 * also used by the client-side 30s timeout.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ callId: string }> }) {
  try {
    const { callId } = await ctx.params
    const db = admin()
    const userId = await userFromReq(db, req)
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const reason = body?.reason === 'failed' ? 'failed' : 'cancelled'

    const { data: call } = await db.from('calls').select('id, company_id, handoff_status, handoff_by_user_id, answered_by_user_id').eq('id', callId).maybeSingle()
    if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

    // Nothing in flight — treat as a no-op success (idempotent).
    if (!['requested', 'joining'].includes(String(call.handoff_status || ''))) {
      return NextResponse.json({ ok: true, status: call.handoff_status || 'idle' })
    }

    // Only someone tied to the call may cancel it.
    const allowed = call.handoff_by_user_id === userId || call.answered_by_user_id === userId || await isCompanyMember(db, call.company_id, userId)
    if (!allowed) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

    await db.from('calls').update({
      handoff_status: reason,
      handoff_target_device_id: null,
      handoff_token: null,
      handoff_expires_at: null,
    }).eq('id', callId)

    return NextResponse.json({ ok: true, status: reason })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

async function isCompanyMember(db: any, companyId: string, userId: string): Promise<boolean> {
  try { const { data: co } = await db.from('companies').select('owner_id').eq('id', companyId).maybeSingle(); if (co?.owner_id === userId) return true } catch {}
  try { const { data: tm } = await db.from('team_members').select('id').eq('company_id', companyId).eq('user_id', userId).maybeSingle(); if (tm?.id) return true } catch {}
  return false
}
