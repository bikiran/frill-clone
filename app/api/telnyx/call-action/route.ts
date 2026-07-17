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

    // The ringing caller leg for this company. Retry briefly: the browser can
    // answer a hair before the dial's DB write lands, so poll up to ~2s for the
    // agent leg id rather than giving up with "not recorded yet".
    let parent: any = null
    for (let i = 0; i < 8; i++) {
      const { data } = await db.from('calls')
        .select('*').eq('company_id', companyId)
        .in('status', ['ringing_agents', 'ringing', 'in_progress'])
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      parent = data
      if (parent?.agent_call_control_id || action === 'hangup') break
      await new Promise(r => setTimeout(r, 250))
    }
    if (!parent?.telnyx_call_control_id) {
      return NextResponse.json({ error: 'no active caller leg' }, { status: 404 })
    }
    if (action === 'answer' && !(parent as any).agent_call_control_id) {
      // The agent leg id was never stored — almost always the migration
      // COLVY_V185_AGENT_LEG.sql hasn't run (agent_call_control_id column
      // missing), so the dial-time UPDATE silently failed.
      return NextResponse.json({ ok: false, bridged: false, error: 'agent_call_control_id missing — run migration COLVY_V185_AGENT_LEG.sql' }, { status: 200 })
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
