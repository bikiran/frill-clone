import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const SUPER_ADMIN = 'bishalstha76@gmail.com'
const FORMS_DOMAIN = process.env.NEXT_PUBLIC_FORMS_DOMAIN || 'forms.colvy.com'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
async function isSuper(req: NextRequest, db: any): Promise<boolean> {
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return false
    const { data } = await db.auth.getUser(token)
    return data?.user?.email === SUPER_ADMIN
  } catch { return false }
}

// GET — readiness of the shared forms domain (its MX records, via DNS-over-HTTPS)
// plus every web-form address provisioned across all companies. Super-admin only.
export async function GET(req: NextRequest) {
  try {
    const db = admin()
    if (!(await isSuper(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    // DNS check: does the forms domain have MX records? (Points at the inbound
    // email provider once configured.)
    let mxRecords: string[] = []
    let mxOk = false
    try {
      const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(FORMS_DOMAIN)}&type=MX`, { headers: { accept: 'application/dns-json' } })
      const d = await r.json()
      mxRecords = (d?.Answer || []).map((a: any) => String(a.data || '').trim()).filter(Boolean)
      mxOk = mxRecords.length > 0
    } catch {}

    // All web-form channels, with their company + location names.
    const { data: chans } = await db.from('email_channels')
      .select('id, company_id, location_id, inbound_address, label, is_active, created_at')
      .eq('provider', 'webform').order('created_at', { ascending: false }).limit(1000)
    const rows = chans || []
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
    }))

    return NextResponse.json({
      formsDomain: FORMS_DOMAIN,
      domainConfigured: !!process.env.NEXT_PUBLIC_FORMS_DOMAIN,
      webhookUrl: 'https://colvy.com/api/webhooks/email',
      mxOk, mxRecords,
      total: addresses.length,
      companies: companyIds.length,
      addresses,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
