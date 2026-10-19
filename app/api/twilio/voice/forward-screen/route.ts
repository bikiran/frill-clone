import { twilioSignatureOk } from '@/lib/twilio-signature'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { screenAskTwiml, type CallCtx } from '@/lib/call-routing'
import { readCallRow, noteRouting } from '@/lib/call-routing-server'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const twiml = (body: string) => new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${body}`, { headers: { 'Content-Type': 'text/xml' } })

// Call screening on a forwarded call (lib/call-routing forwardTwiml). Twilio
// runs this on the OUTSIDE phone's leg once it picks up, before connecting the
// caller, who keeps hearing ringing meanwhile.
//   op=ask    "Call for Roxy Aquarium from 0 4 0 0 … Press 1 to take the call."
//   op=answer 1 → recorded as accepted for this step, and the call connects
//             (an empty response bridges). Anything else, or nothing (the
//             phone's own voicemail is listening), hangs this leg up, and the
//             Dial's callback moves the caller on to the next step.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    if (!(await twilioSignatureOk(req, form))) return new NextResponse('Forbidden', { status: 403 })
    const get = (k: string) => { const v = form.get(k); return v == null ? '' : String(v) }
    const sp = req.nextUrl.searchParams
    const callRowId = sp.get('callRowId') || ''
    const companyId = sp.get('companyId') || ''
    const conversationId = sp.get('conversationId') || ''
    const route = sp.get('route') || ''
    const step = Number.parseInt(sp.get('step') || '', 10)
    const op = sp.get('op') || 'ask'
    const db = admin()
    const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')

    const call = await readCallRow(db, callRowId)
    if (!call || call.company_id !== companyId) return twiml('<Response><Hangup/></Response>')

    if (op === 'answer') {
      if (get('Digits') !== '1') return twiml('<Response><Hangup/></Response>')
      const fwd = call.routing_state?.routing?.forward || {}
      await noteRouting(db, callRowId, { forward: { ...fwd, route, step, accepted: true, acceptedSid: get('CallSid') } }, call)
      return twiml('<Response></Response>')
    }

    const { data: co } = await db.from('companies').select('name').eq('id', companyId).maybeSingle()
    const ctx: CallCtx = {
      base, callRowId, companyId, conversationId, callerName: call.caller_name || call.contact_name || null,
      contactId: call.contact_id || null, from: call.from_number || '', to: call.to_number || '', businessName: co?.name || '',
    }
    const u = new URL(req.url)
    u.searchParams.set('op', 'answer')
    const actionUrl = `${base}${u.pathname}${u.search}`
    return twiml(screenAskTwiml(ctx, actionUrl))
  } catch {
    return twiml('<Response><Hangup/></Response>')
  }
}
