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
    if (callRowId && childSid) {
      const db = admin()
      try { await db.from('calls').update({ twilio_call_sid: childSid }).eq('id', callRowId) } catch {}
    }
  } catch { /* best-effort */ }
  return new NextResponse('', { status: 204 })
}
