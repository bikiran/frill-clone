import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// statusCallback for the dialed CUSTOMER leg of a server-bridged outbound call
// (see app/api/twilio/voice/outbound with bridge=1). The CallSid here is the
// child (customer) leg — stored as twilio_call_sid so the transfer route can
// hold / warm-transfer / ring-team it, exactly as it does for an inbound call.
// Fires on 'initiated' (SID available immediately) and 'answered'.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const get = (k: string) => { const v = form.get(k); return v == null ? '' : String(v) }
    const callRowId = req.nextUrl.searchParams.get('callRowId') || ''
    const childSid = get('CallSid')
    const childStatus = get('CallStatus')   // 'initiated' | 'ringing' | 'in-progress' | 'completed' | …
    if (callRowId && childSid) {
      const db = admin()
      // Always keep the customer-leg SID linkable. When the customer actually
      // ANSWERS (in-progress), also stamp status + answered_at — the agent's
      // browser watches this row and stops the outbound ringback tone on it.
      const patch: any = { twilio_call_sid: childSid }
      if (childStatus === 'in-progress' || childStatus === 'answered') {
        patch.status = 'in_progress'
        patch.answered_at = new Date().toISOString()
      }
      try { await db.from('calls').update(patch).eq('id', callRowId) } catch {}
    }
  } catch { /* best-effort */ }
  return new NextResponse('', { status: 204 })
}
