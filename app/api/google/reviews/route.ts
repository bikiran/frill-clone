import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getGoogleToken, listLocations, syncReviews, replyToReview } from '@/lib/google-business'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET: connection status, selected location, stored reviews.
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    const wantLocations = req.nextUrl.searchParams.get('locations') === '1'
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const db = admin()

    const { data: accs } = await db.from('google_business_accounts')
      .select('*').eq('company_id', companyId).limit(1)
    const account = accs?.[0] || null

    if (wantLocations) {
      const auth = await getGoogleToken(companyId)
      if (!auth) return NextResponse.json({ connected: false, locations: [] })
      const locations = await listLocations(auth.token)
      return NextResponse.json({ connected: true, locations })
    }

    const { data: reviews } = await db.from('google_reviews')
      .select('*').eq('company_id', companyId)
      .order('review_created_at', { ascending: false }).limit(50)

    return NextResponse.json({
      connected: !!account?.access_token,
      location: account ? { name: account.location_name, title: account.location_title, reviewLink: account.review_link } : null,
      reviews: reviews || [],
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST: actions — select_location | sync | reply | save_review_link
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { companyId, action } = body
    if (!companyId || !action) return NextResponse.json({ error: 'companyId and action required' }, { status: 400 })
    const db = admin()

    if (action === 'select_location') {
      const { accountName, locationName, title } = body
      const { data: accs } = await db.from('google_business_accounts').select('id').eq('company_id', companyId).limit(1)
      if (!accs?.[0]) return NextResponse.json({ error: 'Not connected' }, { status: 400 })
      await db.from('google_business_accounts').update({
        account_name: accountName, location_name: locationName, location_title: title,
        updated_at: new Date().toISOString(),
      }).eq('id', accs[0].id)
      return NextResponse.json({ ok: true })
    }

    if (action === 'save_review_link') {
      const { reviewLink } = body
      const { data: accs } = await db.from('google_business_accounts').select('id').eq('company_id', companyId).limit(1)
      if (accs?.[0]) {
        await db.from('google_business_accounts').update({ review_link: reviewLink }).eq('id', accs[0].id)
      } else {
        await db.from('google_business_accounts').insert({ company_id: companyId, review_link: reviewLink })
      }
      return NextResponse.json({ ok: true })
    }

    if (action === 'sync') {
      const result = await syncReviews(companyId)
      return NextResponse.json({ ok: true, ...result })
    }

    if (action === 'reply') {
      const { reviewId, comment } = body
      if (!reviewId || !comment) return NextResponse.json({ error: 'reviewId and comment required' }, { status: 400 })
      await replyToReview(companyId, reviewId, comment)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
