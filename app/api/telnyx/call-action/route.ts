import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TelnyxService } from '@/lib/telnyx-service'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// POST { companyId, action: 'answer' | 'hangup' }
// The browser calls this when the agent answers/ends an inbound call, so the
// server bridges the caller to the agent (or hangs both up). This avoids relying
// on Telnyx webhook direction/timing for the browser leg.
export async function POST(req: NextRequest) {
  try {
    const { companyId, action } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const db = admin()

    const { data: integ } = await db.from('telnyx_integrations').select('api_key').eq('company_id', companyId).maybeSingle()
    if (!integ?.api_key) return NextResponse.json({ error: 'no api key' }, { status: 400 })
    const svc = new TelnyxService(integ.api_key)

    // The ringing caller leg for this company.
    const { data: parent } = await db.from('calls')
      .select('*').eq('company_id', companyId)
      .in('status', ['ringing_agents', 'ringing', 'in_progress'])
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (!parent?.telnyx_call_control_id) {
      return NextResponse.json({ error: 'no active caller leg' }, { status: 404 })
    }

    if (action === 'hangup') {
      try { await svc.hangupCall(parent.telnyx_call_control_id) } catch {}
      if ((parent as any).agent_call_control_id) { try { await svc.hangupCall((parent as any).agent_call_control_id) } catch {} }
      await db.from('calls').update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', parent.id)
      return NextResponse.json({ ok: true, action: 'hangup' })
    }

    // action === 'answer' → answer the caller leg and bridge to the agent leg.
    if ((parent as any).agent_call_control_id) {
      try { await svc.bridgeCalls((parent as any).agent_call_control_id, parent.telnyx_call_control_id) } catch (e: any) {
        return NextResponse.json({ error: 'bridge failed: ' + e.message }, { status: 500 })
      }
      await db.from('calls').update({ status: 'in_progress', answered_at: new Date().toISOString() }).eq('id', parent.id)
      return NextResponse.json({ ok: true, action: 'answer', bridged: true })
    }
    return NextResponse.json({ ok: true, action: 'answer', bridged: false, note: 'agent leg not recorded yet' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
