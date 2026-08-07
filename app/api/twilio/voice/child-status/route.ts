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

// Per-<Client> status callback on an inbound ring-all Dial. When an agent's
// browser leg is ANSWERED, Twilio posts here with that child leg's CallSid — the
// only reliable moment to capture it. We need it so warm transfer can move the
// agent's leg into a conference alongside the customer.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const get = (k: string) => { const v = form.get(k); return v == null ? '' : String(v) }
    const callRowId = req.nextUrl.searchParams.get('callRowId') || ''
    const childSid = get('CallSid')
    const status = (get('CallStatus') || '').toLowerCase()

    if (callRowId && childSid && (status === 'in-progress' || status === 'answered')) {
      const db = admin()
      try {
        await db.from('calls').update({
          twilio_child_call_sid: childSid,
          status: 'in_progress',
          answered_at: new Date().toISOString(),
        }).eq('id', callRowId)
      } catch {}
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
