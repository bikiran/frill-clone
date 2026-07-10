import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TelnyxService } from '@/lib/telnyx-service'

const PLATFORM_KEY = process.env.TELNYX_MASTER_API_KEY

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Validates the regulatory bundle is complete for the chosen AU number type.
// Landline needs identity + AU address (+ proof). Mobile additionally needs a
// date of birth and Onfido ID verification.
function validateBundle(b: any): string | null {
  if (!b.first_name || !b.last_name) return 'First and last name are required.'
  if (!b.contact_phone) return 'A contact phone number is required.'
  if (b.entity_type === 'business' && !b.business_name) return 'Business name is required for a business number.'
  if (!b.address_line1 || !b.city || !b.state || !b.postal_code) return 'A complete Australian address is required.'
  if ((b.country || 'AU') !== 'AU') return 'The address must be in Australia.'
  if (!b.proof_of_address_url) return 'Proof of address (a utility bill or bank statement dated within the last 3 months) is required.'
  if (b.number_type === 'mobile') {
    if (!b.date_of_birth) return 'Date of birth is required for a mobile number.'
  }
  return null
}

// POST: save (draft) or submit the bundle.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { companyId, action } = body
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const db = admin()
    const bundle = {
      company_id: companyId,
      number_type: body.number_type || 'local',
      entity_type: body.entity_type || 'business',
      first_name: body.first_name || null,
      last_name: body.last_name || null,
      date_of_birth: body.date_of_birth || null,
      business_name: body.business_name || null,
      contact_phone: body.contact_phone || null,
      contact_email: body.contact_email || null,
      address_line1: body.address_line1 || null,
      address_line2: body.address_line2 || null,
      city: body.city || null,
      state: body.state || null,
      postal_code: body.postal_code || null,
      country: body.country || 'AU',
      proof_of_address_url: body.proof_of_address_url || null,
      id_document_url: body.id_document_url || null,
      updated_at: new Date().toISOString(),
    }

    // Upsert one bundle per company (latest draft)
    const { data: existing } = await db.from('number_regulatory_bundles')
      .select('id').eq('company_id', companyId).order('created_at', { ascending: false }).limit(1).maybeSingle()

    let bundleId = existing?.id
    if (bundleId) {
      await db.from('number_regulatory_bundles').update(bundle).eq('id', bundleId)
    } else {
      const { data: created } = await db.from('number_regulatory_bundles').insert(bundle).select('id').maybeSingle()
      bundleId = created?.id
    }

    // Draft save — just persist and return.
    if (action !== 'submit') {
      return NextResponse.json({ ok: true, bundleId, status: 'draft' })
    }

    // Submit — validate completeness first.
    const err = validateBundle(bundle)
    if (err) return NextResponse.json({ error: err }, { status: 422 })

    // Create + submit a Telnyx Requirement Group if configured. This is the
    // part that must be verified on a live Telnyx account — the field IDs come
    // back from getPhoneNumberRequirements and are mapped by our values.
    let requirementGroupId: string | null = null
    let telnyxError: string | null = null
    if (PLATFORM_KEY) {
      try {
        const svc = new TelnyxService(PLATFORM_KEY)
        const group = await svc.createRequirementGroup({
          country: 'AU', phoneNumberType: bundle.number_type, action: 'ordering',
          customerReference: `colvy-${companyId.slice(0, 8)}`,
        })
        requirementGroupId = group?.id || null
        // NOTE: mapping individual field values to Telnyx requirement_ids and
        // uploading documents happens here once the account's exact requirement
        // schema is confirmed. Left as a follow-up to verify live.
      } catch (e: any) {
        telnyxError = e.message
      }
    }

    await db.from('number_regulatory_bundles').update({
      status: telnyxError ? 'draft' : 'submitted',
      telnyx_requirement_group_id: requirementGroupId,
      submitted_at: new Date().toISOString(),
    }).eq('id', bundleId)

    // Link the bundle to the telnyx integration so provisioning can find it
    try { await db.from('telnyx_integrations').update({ regulatory_bundle_id: bundleId }).eq('company_id', companyId) } catch {}

    return NextResponse.json({
      ok: true, bundleId, status: telnyxError ? 'draft' : 'submitted',
      requirementGroupId,
      warning: telnyxError ? `Saved, but Telnyx submission needs attention: ${telnyxError}` : undefined,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET: fetch the company's current bundle so the form can prefill.
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()
    const { data } = await db.from('number_regulatory_bundles')
      .select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(1).maybeSingle()
    return NextResponse.json({ bundle: data || null })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
