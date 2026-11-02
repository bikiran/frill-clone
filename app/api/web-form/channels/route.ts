import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
) as any

const FORMS_DOMAIN = process.env.NEXT_PUBLIC_FORMS_DOMAIN || 'forms.colvy.com'
const hex = (s: string) => (s || '').replace(/[^a-f0-9]/gi, '').toLowerCase()
/** What the Web form page shows; never a mailbox's tokens. */
export const WEBFORM_COLS = 'id, company_id, location_id, inbound_address, label, provider, is_active, created_at'

/**
 * POST { companyId, locationId | null, label } — give a location (or the whole
 * business) its web-form inbound address. Email channels are server-written
 * since V425 (the table holds mailbox tokens), so the Web form page creates
 * them here. Idempotent: an address that exists is returned as it is.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const companyId = String(body?.companyId || '')
    const locationId: string | null = body?.locationId ? String(body.locationId) : null
    const db = admin()
    const access = await requireCompanyAccess(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: access.unavailable ? 503 : 403 })

    if (locationId) {
      const { data: loc } = await db.from('company_locations').select('id').eq('id', locationId).eq('company_id', companyId).maybeSingle()
      if (!loc) return NextResponse.json({ error: 'That location isn’t part of this business.' }, { status: 400 })
    }

    let existing = db.from('email_channels').select(WEBFORM_COLS).eq('company_id', companyId).eq('provider', 'webform')
    existing = locationId ? existing.eq('location_id', locationId) : existing.is('location_id', null)
    const { data: had } = await existing.limit(1)
    if (had?.[0]) return NextResponse.json({ channel: had[0] })

    const token = `${hex(companyId).slice(0, 6)}.${locationId ? hex(locationId).slice(0, 2) : 'all'}`
    const label = String(body?.label || '').trim().slice(0, 80) || 'All submissions'
    const { data, error } = await db.from('email_channels').insert({
      company_id: companyId, inbound_address: `${token}@${FORMS_DOMAIN}`, provider: 'webform',
      location_id: locationId, label: `Web Form — ${label}`, is_active: true, from_address: null,
    }).select(WEBFORM_COLS).maybeSingle()
    if (error || !data) return NextResponse.json({ error: error?.message || 'Could not create the address.' }, { status: 500 })
    return NextResponse.json({ channel: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not create the address.' }, { status: 500 })
  }
}
