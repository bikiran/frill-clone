import { NextRequest, NextResponse } from 'next/server'
import { adminDb, superAdmin } from '../_lib/super-admin'
import { platformTwilio } from '@/lib/twilio-platform'
import { logSuperAdminAudit } from '@/lib/super-admin-audit'
import { listAllPorts, getPort, changePortStatus, addPortNote, attachPortedNumber, signedFileUrl } from '@/lib/number-porting-server'
import { isPortStatus } from '@/lib/number-porting'

export const dynamic = 'force-dynamic'

// Super admin → Number porting: the queue of port requests from every business.
//
// GET ?status=            requests (all, or one status), with files as short-lived
//                         signed links and the full history (internal notes too)
// POST { action, requestId, … }
//   status   { to, note?, internal?, scheduledFor?, reason?, carrierReference? }
//   note     { note, internal }
//   attach   { phoneNumber, twilioSid? }  the ported number is on the platform
//            Twilio account: configure it like a purchase and attach it; the
//            request completes when every number is attached
//   billing  { mode: 'manual' | 'waived' | 'pending' }  how the numbers are paid
//            for when the business won't use the in-app checkout
export async function GET(req: NextRequest) {
  try {
    const db = adminDb()
    if (!(await superAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const status = req.nextUrl.searchParams.get('status')
    const { unavailable, requests } = await listAllPorts(db, { status: status && isPortStatus(status) ? status : null })
    for (const r of requests) {
      r.files = await Promise.all((r.files || []).map(async (f: any) => {
        const { storage_path: _p, storage_bucket: _b, ...meta } = f
        return { ...meta, url: await signedFileUrl(db, f) }
      }))
    }
    return NextResponse.json({ unavailable, requests, twilioConfigured: !!platformTwilio() })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Something went wrong' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = adminDb()
    const me = await superAdmin(req, db)
    if (!me) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const body = await req.json().catch(() => ({}))
    const r = await getPort(db, String(body.requestId || ''))
    if (!r) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    const audit = (action: string, detail: any) => logSuperAdminAudit(db, { adminId: me.id, adminEmail: me.email, action: `porting.${action}`, companyId: r.company_id, summary: `Port request ${r.id}`, detail })

    if (body.action === 'status') {
      const res = await changePortStatus(db, r, { to: String(body.to || ''), note: body.note, internal: !!body.internal, scheduledFor: body.scheduledFor, reason: body.reason, carrierReference: body.carrierReference, actor: me.id })
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
      await audit('status', { from: r.status, to: body.to })
      return NextResponse.json({ ok: true, request: res.request })
    }
    if (body.action === 'note') {
      const res = await addPortNote(db, r, { note: String(body.note || ''), internal: body.internal !== false, actor: me.id })
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
      return NextResponse.json({ ok: true })
    }
    if (body.action === 'attach') {
      const res = await attachPortedNumber(db, platformTwilio(), r, { phoneNumber: String(body.phoneNumber || ''), twilioSid: body.twilioSid || null, actor: me.id })
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
      await audit('attach', { phoneNumber: res.phoneNumber, completed: res.completed })
      return NextResponse.json({ ok: true, request: res.request, completed: res.completed })
    }
    if (body.action === 'billing') {
      const mode = String(body.mode || '')
      if (!['manual', 'waived', 'pending'].includes(mode)) return NextResponse.json({ error: 'Choose manual, waived or pending.' }, { status: 400 })
      if (r.status !== 'completed') return NextResponse.json({ error: 'Billing is set once the port is completed.' }, { status: 409 })
      if (r.billing_status === 'active') return NextResponse.json({ error: 'The business is already paying by card for this request.' }, { status: 409 })
      await db.from('porting_requests').update({ billing_status: mode, updated_at: new Date().toISOString() }).eq('id', r.id)
      await audit('billing', { mode })
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Something went wrong' }, { status: 500 })
  }
}
