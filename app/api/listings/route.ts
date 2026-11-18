import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { cleanListing, suggestCode } from '@/lib/listings'
import { LISTING_COLS, companySlug, ensureListingLink, listingStats, listingsMissing, pageUrlFor, textNumber } from '@/lib/listings-server'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const NEEDS_MIGRATION = 'Listings need a quick database update first: run COLVY_V441_MARKETPLACE_LISTINGS.sql in Supabase.'

/**
 * GET /api/listings?companyId=  — this business's Marketplace listings, with
 * their page address and views → enquiries → sales, plus the number buyers
 * can text.
 */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  const db = admin()
  if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const { data, error } = await db.from('listings').select(LISTING_COLS).eq('company_id', companyId!).order('created_at', { ascending: false }).limit(300)
  if (error) return NextResponse.json(listingsMissing(error) ? { listings: [], needsMigration: true, error: NEEDS_MIGRATION } : { error: error.message }, { status: listingsMissing(error) ? 200 : 500 })
  const [slug, number, stats] = await Promise.all([companySlug(db, companyId!), textNumber(db, companyId!), listingStats(db, companyId!, data || [])])
  return NextResponse.json({
    slug, number,
    listings: (data || []).map(l => ({ ...l, url: slug ? pageUrlFor(slug, l.code) : null, stats: stats[l.id] })),
  })
}

/** POST /api/listings  { companyId, title, price, description, condition, photos, pickup, source, external_url, product, code? } */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const companyId = body?.companyId
  const db = admin()
  const access = await requireCompanyAccess(req, db, companyId)
  if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const clean = cleanListing(body)
  if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 })
  const slug = await companySlug(db, companyId)
  if (!slug) return NextResponse.json({ error: 'This workspace has no web address yet. Set one in Settings → Business first.' }, { status: 400 })

  const { data: existing, error: readErr } = await db.from('listings').select('code').eq('company_id', companyId).limit(2000)
  if (readErr) return NextResponse.json({ error: listingsMissing(readErr) ? NEEDS_MIGRATION : readErr.message }, { status: listingsMissing(readErr) ? 409 : 500 })
  const taken = new Set((existing || []).map(r => String(r.code)))
  const { code: askedCode, ...fields } = clean.value
  if (askedCode && taken.has(askedCode)) return NextResponse.json({ error: `Another listing already uses ${askedCode}. Try a different code.` }, { status: 409 })

  let row: any = null
  for (let i = 0; i < 3 && !row; i++) {
    const code = askedCode || suggestCode(fields.title, taken)
    const { data, error } = await db.from('listings').insert({
      ...fields, code, company_id: companyId, status: 'active', created_by: access.userId || null, updated_by: access.userId || null,
    }).select(LISTING_COLS).maybeSingle()
    if (!error) { row = data; break }
    if (/duplicate key|unique/i.test(error.message) && !askedCode) { taken.add(code); continue }
    return NextResponse.json({ error: /duplicate key|unique/i.test(error.message) ? `Another listing already uses ${code}.` : error.message }, { status: 400 })
  }
  if (!row) return NextResponse.json({ error: 'Couldn’t save the listing. Try again.' }, { status: 500 })
  const linkId = await ensureListingLink(db, row, slug)
  return NextResponse.json({ listing: { ...row, short_link_id: linkId, url: pageUrlFor(slug, row.code), stats: { views: 0, enquiries: 0, sales: 0, revenue: 0 } } })
}
