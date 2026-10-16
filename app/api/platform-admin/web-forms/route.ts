import { NextRequest, NextResponse } from 'next/server'
import { adminDb, superAdmin } from '../_lib/super-admin'
import { formsDomainHealth, addFormsDomainToResend, verifyFormsDomain, sendFormsTest, checkFormsTest, clearFormsHealthCache, FORMS_DOMAIN, FORMS_DOMAIN_IS_DEFAULT } from '@/lib/forms-mail'
import { logSuperAdminAudit } from '@/lib/super-admin-audit'

export const dynamic = 'force-dynamic'

// GET — is the shared forms domain really receiving mail (its real MX records,
// Resend's view of the domain, and exactly which DNS records are missing),
// plus every web-form address provisioned across all companies. Super-admin only.
export async function GET(req: NextRequest) {
  try {
    const db = adminDb()
    if (!(await superAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const [health, chansRes] = await Promise.all([
      formsDomainHealth(),
      db.from('email_channels')
        .select('id, company_id, location_id, inbound_address, label, is_active, created_at')
        .eq('provider', 'webform').order('created_at', { ascending: false }).limit(1000),
    ])
    const rows = chansRes.data || []
    const companyIds = Array.from(new Set(rows.map((r: any) => r.company_id).filter(Boolean)))
    const locIds = Array.from(new Set(rows.map((r: any) => r.location_id).filter(Boolean)))
    const [{ data: cos }, { data: locs }] = await Promise.all([
      companyIds.length ? db.from('companies').select('id, name, slug').in('id', companyIds) : Promise.resolve({ data: [] }),
      locIds.length ? db.from('company_locations').select('id, label, suburb').in('id', locIds) : Promise.resolve({ data: [] }),
    ])
    const coMap = new Map((cos || []).map((c: any) => [c.id, c]))
    const locMap = new Map((locs || []).map((l: any) => [l.id, l]))

    const addresses = rows.map((r: any) => ({
      id: r.id, address: r.inbound_address, is_active: r.is_active, created_at: r.created_at,
      company: (coMap.get(r.company_id) as any)?.name || '—',
      slug: (coMap.get(r.company_id) as any)?.slug || null,
      location: r.location_id ? ((locMap.get(r.location_id) as any)?.label || (locMap.get(r.location_id) as any)?.suburb || 'Location') : 'All',
      // An address on another domain (made before the forms domain changed) needs its own MX.
      onFormsDomain: String(r.inbound_address || '').toLowerCase().endsWith('@' + FORMS_DOMAIN),
    }))

    return NextResponse.json({
      formsDomain: FORMS_DOMAIN,
      usingDefault: FORMS_DOMAIN_IS_DEFAULT,
      webhookUrl: 'https://colvy.com/api/webhooks/email',
      resendKey: !!process.env.RESEND_API_KEY,
      health,
      total: addresses.length,
      companies: companyIds.length,
      addresses,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

// POST — { action: 'add-to-resend' }            add the forms domain to Resend (receiving only)
//        { action: 'verify', id }                 ask Resend to check the domain's DNS again
//        { action: 'test', channelId }            email that web-form address through Resend
//        { action: 'check', channelId, token, emailId }  did the test arrive?
export async function POST(req: NextRequest) {
  try {
    const db = adminDb()
    const who = await superAdmin(req, db)
    if (!who) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const body = await req.json().catch(() => ({}))
    const action = String(body?.action || '')

    if (action === 'add-to-resend') {
      const r = await addFormsDomainToResend()
      clearFormsHealthCache()
      if (r.ok) await logSuperAdminAudit(db, { adminId: who.id, adminEmail: who.email, action: 'forms_domain_added_to_resend', summary: `Added ${FORMS_DOMAIN} to Resend for receiving`, detail: { id: r.id } })
      return NextResponse.json(r, { status: r.ok ? 200 : 400 })
    }
    if (action === 'verify') {
      if (!body?.id) return NextResponse.json({ error: 'Missing domain id' }, { status: 400 })
      const r = await verifyFormsDomain(String(body.id))
      clearFormsHealthCache()
      return NextResponse.json(r, { status: r.ok ? 200 : 400 })
    }
    if (action === 'test' || action === 'check') {
      const { data: chan } = await db.from('email_channels').select('id, inbound_address, company_id').eq('id', String(body?.channelId || '')).eq('provider', 'webform').maybeSingle()
      if (!chan) return NextResponse.json({ error: 'Unknown web-form address' }, { status: 404 })
      if (action === 'test') {
        const r = await sendFormsTest(String(chan.inbound_address))
        return NextResponse.json(r, { status: r.ok ? 200 : 400 })
      }
      const r = await checkFormsTest(db, { token: String(body?.token || ''), channelId: chan.id, emailId: body?.emailId ? String(body.emailId) : null })
      return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
