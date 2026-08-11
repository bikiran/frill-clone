import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ensureCallCard } from '@/lib/call-card'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const twiml = (body: string) => new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${body}`, { headers: { 'Content-Type': 'text/xml' } })

// action= handler for an OUTBOUND (SDK) call's <Dial>. Fires when the dial ends.
// Records the outcome on the call row; the call is over, so we return an empty
// response (no further TwiML).
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const get = (k: string) => { const v = form.get(k); return v == null ? '' : String(v) }
    const callRowId = req.nextUrl.searchParams.get('callRowId') || ''

    const dialStatus = (get('DialCallStatus') || '').toLowerCase()
    const durSecs = parseInt(get('DialCallDuration') || '0', 10) || 0
    const answered = dialStatus === 'completed' || dialStatus === 'answered'

    if (callRowId) {
      const db = admin()
      const status = answered && durSecs > 0 ? 'completed'
        : ['busy', 'no-answer', 'failed', 'canceled'].includes(dialStatus) ? (durSecs > 0 ? 'completed' : 'missed')
        : 'completed'
      try {
        await db.from('calls').update({
          status,
          ended_at: new Date().toISOString(),
          ...(durSecs ? { duration_seconds: durSecs } : {}),
        }).eq('id', callRowId)
      } catch {}
      // Guarantee the call logs in the thread even if the browser never posted
      // the card (tab closed before hang-up, missed disconnect event, etc.).
      // Idempotent — no-op when the browser already posted it.
      await ensureCallCard(db, callRowId)
    }
    return twiml('<Response></Response>')
  } catch {
    return twiml('<Response></Response>')
  }
}
