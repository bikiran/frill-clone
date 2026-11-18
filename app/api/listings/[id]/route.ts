import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { cleanListing } from '@/lib/listings'
import { LISTING_COLS, companySlug, ensureListingLink, listingStats, pageUrlFor } from '@/lib/listings-server'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

type Ctx = { params: Promise<{ id: string }> }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function load(db: any, companyId: string, id: string) {
  if (!UUID.test(id)) return null
  const { data } = await db.from('listings').select(LISTING_COLS).eq('id', id).eq('company_id', companyId).maybeSingle()
  return data || null
}

/**
 * GET /api/listings/<id>?companyId=  — one listing, its numbers, and the
 * people who asked about it (newest first), with who bought it.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const companyId = req.nextUrl.searchParams.get('companyId')
  const db = admin()
  if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const l = await load(db, companyId!, id)
  if (!l) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  const [slug, stats, convs] = await Promise.all([
    companySlug(db, companyId!),
    listingStats(db, companyId!, [l]),
    db.from('conversations').select('id, contact_id, channel, status, last_message, last_message_at, created_at, sms_number')
      .eq('company_id', companyId!).eq('listing_id', l.id).order('last_message_at', { ascending: false }).limit(100),
  ])
  const rows = convs.data || []
  const contactIds = Array.from(new Set(rows.map((c: any) => c.contact_id).filter(Boolean)))
  const { data: contacts } = contactIds.length
    ? await db.from('contacts').select('id, name, phone, email').in('id', contactIds)
    : { data: [] as any[] }
  const byId = new Map((contacts || []).map((c: any) => [c.id, c]))
  const nameOf = (c: any, conv: any) => {
    return c?.name || c?.phone || conv.sms_number || c?.email || 'Customer'
  }
  return NextResponse.json({
    listing: { ...l, url: slug ? pageUrlFor(slug, l.code) : null, stats: stats[l.id] },
    enquiries: rows.map((c: any) => ({
      conversation_id: c.id, contact_id: c.contact_id, name: nameOf(byId.get(c.contact_id), c),
      channel: c.channel, status: c.status, last_message: c.last_message, last_message_at: c.last_message_at || c.created_at,
      bought: !!l.sold_conversation_id && l.sold_conversation_id === c.id,
    })),
  })
}

/** PATCH /api/listings/<id>  { companyId, ...fields, status?: 'active' | 'hidden' } */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const companyId = body?.companyId
  const db = admin()
  const access = await requireCompanyAccess(req, db, companyId)
  if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const l = await load(db, companyId, id)
  if (!l) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })

  const patch: Record<string, unknown> = { updated_by: access.userId || null, updated_at: new Date().toISOString() }
  // Hide / show again (a sold listing is reopened from the Sold button instead).
  if (body.status === 'hidden' || body.status === 'active') {
    if (body.status === 'active' && l.status === 'sold') return NextResponse.json({ error: 'Use “Not sold” to put a sold listing back up.' }, { status: 400 })
    patch.status = body.status
  }
  const editing = ['title', 'price', 'price_cents', 'description', 'condition', 'photos', 'pickup', 'source', 'external_url', 'product', 'code'].some(k => k in body)
  if (editing) {
    const merged = { ...l, ...body, price_cents: 'price' in body ? undefined : ('price_cents' in body ? body.price_cents : l.price_cents) }
    if ('price' in body) delete merged.price_cents
    const clean = cleanListing(merged)
    if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 })
    const { code, ...fields } = clean.value
    Object.assign(patch, fields)
    if (code && code !== l.code) {
      const { data: same } = await db.from('listings').select('id').eq('company_id', companyId).eq('code', code).maybeSingle()
      if (same && same.id !== l.id) return NextResponse.json({ error: `Another listing already uses ${code}. Try a different code.` }, { status: 409 })
      patch.code = code
    }
  }
  const { data, error } = await db.from('listings').update(patch).eq('id', l.id).eq('company_id', companyId).select(LISTING_COLS).maybeSingle()
  if (error || !data) return NextResponse.json({ error: error?.message || 'Couldn’t save.' }, { status: 400 })
  const slug = await companySlug(db, companyId)
  // The page address follows the code and the link's label the title.
  if (slug && (data.code !== l.code || data.title !== l.title || !data.short_link_id)) data.short_link_id = await ensureListingLink(db, data, slug)
  const stats = await listingStats(db, companyId, [data])
  return NextResponse.json({ listing: { ...data, url: slug ? pageUrlFor(slug, data.code) : null, stats: stats[data.id] } })
}

/** DELETE /api/listings/<id>?companyId=  — conversations keep their messages; the page stops working. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const companyId = req.nextUrl.searchParams.get('companyId')
  const db = admin()
  if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const l = await load(db, companyId!, id)
  if (!l) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  const { error } = await db.from('listings').delete().eq('id', l.id).eq('company_id', companyId!)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
