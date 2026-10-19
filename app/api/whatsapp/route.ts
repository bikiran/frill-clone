import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess, requireCompanyAdmin } from '@/lib/company-access'
import { toE164 } from '@/lib/phone'
import { readSender, whatsappAccess, V402_MESSAGE, isMissing } from '@/lib/whatsapp'
import { E164_RE, BLOCK_WORDS } from '@/lib/whatsapp-core'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
const isUuid = (v: any) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)
const clip = (v: any, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

// The business's side of WhatsApp (Settings → Channels → WhatsApp).
//   GET  ?companyId=     where WhatsApp stands: not requested / pending /
//                        connected / not approved / switched off, the request
//                        they sent, Colvy's note, and their Colvy numbers.
//   POST { companyId, displayName, phoneNumber ('new' for a new number),
//          website, industry, description, address, contactName,
//          contactEmail, notes }
//                        request WhatsApp (owner / admin): the request lands
//                        with Colvy's super admin, who registers the number
//                        with Meta through Colvy's Twilio account.
//   DELETE ?companyId=   withdraw a pending request.
// Registration, the number's status and the Twilio sender are set only by the
// super admin (/api/platform-admin/whatsapp).

async function businessNumbers(db: any, companyId: string): Promise<string[]> {
  try {
    const { data } = await db.from('phone_numbers').select('phone_number, status').eq('company_id', companyId).limit(20)
    return Array.from(new Set<string>((data || []).filter((r: any) => r.phone_number && r.status !== 'released').map((r: any) => toE164(r.phone_number)).filter((n: string) => E164_RE.test(n))))
  } catch { return [] }
}

function publicSender(row: any) {
  if (!row) return { status: 'not_requested' }
  return {
    status: row.status, phoneNumber: row.phone_number || null, displayName: row.display_name || null,
    request: row.request || null, requestedAt: row.requested_at || null, approvedAt: row.approved_at || null,
    note: row.admin_note || null,
  }
}

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!isUuid(companyId)) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  const db = admin()
  if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const s = await readSender(db, companyId!)
  const [access, numbers, isAdmin] = await Promise.all([
    whatsappAccess(db, companyId!, s),
    businessNumbers(db, companyId!),
    requireCompanyAdmin(req, db, companyId).then(r => r.ok, () => false),
  ])
  return NextResponse.json({
    ready: s.ready, sender: publicSender(s.row), canSend: access.ok,
    reason: access.ok ? null : access.reason, reasonText: access.ok ? null : BLOCK_WORDS[access.reason || 'not_approved'],
    numbers, canRequest: isAdmin,
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const companyId = body.companyId
    if (!isUuid(companyId)) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const db = admin()
    const gate = await requireCompanyAdmin(req, db, companyId)
    if (!gate.ok) return NextResponse.json({ error: gate.notAdmin ? 'Only the owner or an admin can request WhatsApp.' : 'Not authorized' }, { status: 403 })
    const s = await readSender(db, companyId)
    if (!s.ready) return NextResponse.json({ error: V402_MESSAGE, missing: true }, { status: 409 })
    if (s.row && (s.row.status === 'approved' || s.row.status === 'disabled')) {
      return NextResponse.json({ error: s.row.status === 'approved' ? 'WhatsApp is already connected.' : 'WhatsApp was switched off for this business. Contact Colvy to turn it back on.' }, { status: 409 })
    }
    const displayName = clip(body.displayName, 80)
    if (displayName.length < 2) return NextResponse.json({ error: 'Enter the business name customers should see on WhatsApp.' }, { status: 400 })
    const own = await businessNumbers(db, companyId)
    let phone: string | null = null
    if (body.phoneNumber && body.phoneNumber !== 'new') {
      phone = toE164(String(body.phoneNumber))
      if (!own.includes(phone)) return NextResponse.json({ error: 'Choose one of your Colvy numbers, or ask for a new one.' }, { status: 400 })
    }
    const email = clip(body.contactEmail, 200)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid contact email.' }, { status: 400 })
    const request = {
      displayName, phoneNumber: phone, newNumber: !phone,
      website: clip(body.website, 200), industry: clip(body.industry, 80), description: clip(body.description, 500),
      address: clip(body.address, 300), contactName: clip(body.contactName, 120), contactEmail: email, notes: clip(body.notes, 1000),
    }
    const now = new Date().toISOString()
    const row = {
      company_id: companyId, status: 'pending', request, requested_by: gate.userId || null, requested_at: now, updated_at: now,
      // The number and name are what Colvy registers, unless the super admin changes them.
      ...(s.row?.phone_number ? {} : { phone_number: phone }),
      ...(s.row?.display_name ? {} : { display_name: displayName }),
    }
    const { error } = await db.from('whatsapp_senders').upsert(row, { onConflict: 'company_id' })
    if (error) return NextResponse.json({ error: isMissing(error) ? V402_MESSAGE : error.message }, { status: isMissing(error) ? 409 : 500 })
    const after = await readSender(db, companyId)
    return NextResponse.json({ ok: true, sender: publicSender(after.row) })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!isUuid(companyId)) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  const db = admin()
  const gate = await requireCompanyAdmin(req, db, companyId)
  if (!gate.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const s = await readSender(db, companyId!)
  if (!s.ready) return NextResponse.json({ error: V402_MESSAGE, missing: true }, { status: 409 })
  if (s.row?.status !== 'pending') return NextResponse.json({ error: 'There’s no pending request to withdraw.' }, { status: 409 })
  const { error } = await db.from('whatsapp_senders').update({ status: 'not_requested', updated_at: new Date().toISOString() }).eq('company_id', companyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, sender: { status: 'not_requested' } })
}
