import { createClient } from '@supabase/supabase-js'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Returns a valid access token for the company, refreshing it if it has expired.
export async function getGoogleToken(companyId: string): Promise<{ token: string; account: any } | null> {
  const db = admin()
  const { data: rows } = await db.from('google_business_accounts')
    .select('*').eq('company_id', companyId).eq('is_active', true).limit(1)
  const acc = rows?.[0]
  if (!acc) return null

  const stillValid = acc.token_expires_at && new Date(acc.token_expires_at).getTime() > Date.now() + 60_000
  if (stillValid && acc.access_token) return { token: acc.access_token, account: acc }

  if (!acc.refresh_token) return null

  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: acc.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const tok = await res.json()
  if (!res.ok || !tok.access_token) return null

  const expiresAt = new Date(Date.now() + (tok.expires_in || 3600) * 1000).toISOString()
  await db.from('google_business_accounts')
    .update({ access_token: tok.access_token, token_expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq('id', acc.id)

  return { token: tok.access_token, account: { ...acc, access_token: tok.access_token } }
}

// Lists the Business Profile accounts + locations the user can manage.
export async function listLocations(token: string) {
  const out: any[] = []
  // 1) Accounts
  const accRes = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const accData = await accRes.json()
  if (!accRes.ok) throw new Error(accData?.error?.message || 'Could not list Google accounts')

  for (const acc of accData.accounts || []) {
    // 2) Locations under each account
    const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${acc.name}/locations?readMask=name,title,storefrontAddress&pageSize=100`
    const locRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const locData = await locRes.json()
    if (!locRes.ok) continue
    for (const loc of locData.locations || []) {
      out.push({
        accountName: acc.name,
        locationName: loc.name,              // locations/12345
        title: loc.title,
        address: loc.storefrontAddress
          ? [ (loc.storefrontAddress.addressLines || []).join(' '), loc.storefrontAddress.locality, loc.storefrontAddress.administrativeArea ].filter(Boolean).join(', ')
          : '',
      })
    }
  }
  return out
}

// Fetches reviews for the connected location and upserts them into Colvy.
export async function syncReviews(companyId: string) {
  const db = admin()
  const auth = await getGoogleToken(companyId)
  if (!auth) throw new Error('Google Business Profile is not connected (or the connection expired — reconnect it).')
  const { token, account } = auth
  if (!account.account_name || !account.location_name) {
    throw new Error('No Google location selected yet.')
  }

  // The reviews API still lives on the legacy v4 host.
  const url = `https://mybusiness.googleapis.com/v4/${account.account_name}/${account.location_name}/reviews`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || 'Could not fetch reviews')

  const STAR: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }
  let saved = 0

  for (const r of data.reviews || []) {
    const row = {
      company_id: companyId,
      review_id: r.reviewId || r.name,
      reviewer_name: r.reviewer?.displayName || 'Anonymous',
      reviewer_photo: r.reviewer?.profilePhotoUrl || null,
      star_rating: STAR[r.starRating] ?? null,
      comment: r.comment || null,
      reply_comment: r.reviewReply?.comment || null,
      replied_at: r.reviewReply?.updateTime || null,
      review_created_at: r.createTime || null,
      raw: r,
    }
    // Explicit find-then-update-or-insert (never ON CONFLICT on a partial index).
    const { data: existing } = await db.from('google_reviews')
      .select('id').eq('company_id', companyId).eq('review_id', row.review_id).maybeSingle()
    if (existing?.id) {
      await db.from('google_reviews').update(row).eq('id', existing.id)
    } else {
      await db.from('google_reviews').insert(row)
      saved++
    }
  }

  return { total: (data.reviews || []).length, new: saved, averageRating: data.averageRating ?? null, totalReviewCount: data.totalReviewCount ?? null }
}

// Posts (or updates) the business's reply to a review.
export async function replyToReview(companyId: string, reviewId: string, comment: string) {
  const db = admin()
  const auth = await getGoogleToken(companyId)
  if (!auth) throw new Error('Google Business Profile is not connected.')
  const { token, account } = auth

  const url = `https://mybusiness.googleapis.com/v4/${account.account_name}/${account.location_name}/reviews/${reviewId}/reply`
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || 'Could not post the reply')

  await db.from('google_reviews')
    .update({ reply_comment: comment, replied_at: new Date().toISOString() })
    .eq('company_id', companyId).eq('review_id', reviewId)

  return data
}
