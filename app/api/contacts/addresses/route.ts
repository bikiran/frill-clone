import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { linkedContacts } from '@/lib/identity'
import { emailKey, phoneKey } from '@/lib/phone'
import { recordAddress, backfillFromOrders, formatAddress } from '@/lib/contact-addresses'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET /api/contacts/addresses?contactId=…
// Returns the customer's addresses (default first, then most-recently used),
// backfilling from their WooCommerce order history on the way.
export async function GET(req: NextRequest) {
  const contactId = new URL(req.url).searchParams.get('contactId')
  if (!contactId) return NextResponse.json({ addresses: [] })
  const db = admin()
  try {
    const { data: contact } = await db.from('contacts').select('*').eq('id', contactId).maybeSingle()
    if (!contact) return NextResponse.json({ addresses: [] })
    const companyId = contact.company_id

    // Resolve linked identities to gather orders across channels.
    const linked = await linkedContacts(db, contactId)
    const emails = Array.from(new Set(linked.map((c: any) => c.email).filter(Boolean).map((e: string) => emailKey(e)).filter(Boolean)))
    const phones = Array.from(new Set(linked.map((c: any) => c.phone).filter(Boolean).map((p: string) => phoneKey(p)).filter((k: string) => k.length >= 8)))

    // Seed from the contact's own single address field (legacy), then orders.
    if (contact.address || contact.city || contact.postcode) {
      await recordAddress(db, companyId, contactId,
        { line1: contact.address, suburb: contact.suburb, city: contact.city, state: contact.state, postcode: contact.postcode, country: contact.country },
        'Contact profile')
    }
    await backfillFromOrders(db, companyId, contactId, emails, phones)

    const { data: rows } = await db.from('contact_addresses').select('*')
      .eq('contact_id', contactId)
      .order('is_default', { ascending: false })
      .order('last_used_at', { ascending: false, nullsFirst: false })
    return NextResponse.json({ addresses: rows || [] })
  } catch (e: any) {
    return NextResponse.json({ addresses: [], error: e.message })
  }
}

// POST { action, … }
//   set-default { addressId, contactId }
//   add         { contactId, ...fields, userName }
//   delete      { addressId }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const db = admin()
    const action = body.action

    if (action === 'set-default') {
      const { data: addr } = await db.from('contact_addresses').select('contact_id').eq('id', body.addressId).maybeSingle()
      if (!addr) return NextResponse.json({ error: 'Address not found' }, { status: 404 })
      await db.from('contact_addresses').update({ is_default: false }).eq('contact_id', addr.contact_id)
      await db.from('contact_addresses').update({ is_default: true, updated_at: new Date().toISOString() }).eq('id', body.addressId)
      return NextResponse.json({ ok: true })
    }

    if (action === 'delete') {
      await db.from('contact_addresses').delete().eq('id', body.addressId)
      return NextResponse.json({ ok: true })
    }

    if (action === 'add') {
      const { data: contact } = await db.from('contacts').select('company_id').eq('id', body.contactId).maybeSingle()
      if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
      const a = { line1: body.line1, line2: body.line2, suburb: body.suburb, city: body.city, state: body.state, postcode: body.postcode, country: body.country, label: body.label }
      await recordAddress(db, contact.company_id, body.contactId, a, `Manually added${body.userName ? ` by ${body.userName}` : ''}`)
      return NextResponse.json({ ok: true, formatted: formatAddress(a) })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
