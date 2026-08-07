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

// Email the business when a new Google review lands (one per review). Sent to
// the company's business_email via Resend; silently no-ops if either is unset.
async function notifyNewReviews(db: any, companyId: string, reviews: any[]) {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  const { data: company } = await db.from('companies').select('name, business_email, slug').eq('id', companyId).maybeSingle()
  const to = company?.business_email
  if (!to) return
  const business = company?.name || 'your business'
  const reviewsUrl = company?.slug ? `https://${company.slug}.colvy.com/admin/reviews` : 'https://colvy.com/admin/reviews'
  const from = 'Colvy <notifications@updates.colvy.com>'
  const esc = (s: string) => String(s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string))

  for (const rv of reviews) {
    const n = rv.star_rating || 0
    const stars = '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n))
    const html = `
      <div style="background:#eef2ff;padding:28px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
        <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;text-align:center">
          <div style="font-size:26px;color:#f5b301;letter-spacing:3px">${stars}</div>
          <h2 style="margin:14px 0 4px;font-size:20px;color:#1a1a1a">You got a new ${n ? n + '-star ' : ''}review${n >= 4 ? '! 🎉' : '.'}</h2>
          <p style="margin:0 0 18px;color:#6b6b70;font-size:14px">for ${esc(business)}</p>
          <div style="text-align:left;background:#f6f7fb;border-radius:12px;padding:16px 18px;margin:0 0 20px">
            <p style="margin:0 0 4px;font-weight:700;color:#1a1a1a">${esc(rv.reviewer_name || 'A customer')}</p>
            <div style="color:#f5b301;font-size:15px;margin-bottom:8px">${stars}</div>
            <p style="margin:0;color:#374151;font-size:13.5px;line-height:1.55">${esc(rv.comment || '(no written comment)')}</p>
          </div>
          <a href="${reviewsUrl}" style="display:inline-block;background:#ff7a6b;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 24px;border-radius:10px">Read &amp; reply</a>
          <p style="margin:20px 0 0;color:#9ca3af;font-size:12px">Replying to reviews builds trust — open Colvy to respond.</p>
        </div>
      </div>`
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject: `${rv.reviewer_name || 'Someone'} left a ${n ? n + '-star ' : ''}review for ${business}`, html }),
      })
    } catch { /* non-fatal */ }
  }
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

  // The reviews API still lives on the legacy v4 host, and it pages 50 at a
  // time — walk every page (via nextPageToken) so a business with hundreds of
  // reviews gets them ALL, not just the most recent 50. averageRating /
  // totalReviewCount are location-wide and repeat on each page, so we just keep
  // the latest. Bounded at 200 pages (10k reviews) as an infinite-loop guard.
  const base = `https://mybusiness.googleapis.com/v4/${account.account_name}/${account.location_name}/reviews`
  const allReviews: any[] = []
  let averageRating: number | null = null
  let totalReviewCount: number | null = null
  let pageToken: string | undefined
  let pages = 0
  do {
    const url = `${base}?pageSize=50${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error?.message || 'Could not fetch reviews')
    if (Array.isArray(data.reviews)) allReviews.push(...data.reviews)
    if (data.averageRating != null) averageRating = data.averageRating
    if (data.totalReviewCount != null) totalReviewCount = data.totalReviewCount
    pageToken = data.nextPageToken
  } while (pageToken && ++pages < 200)

  const STAR: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }
  let saved = 0

  // Customer matching: a review only carries a display name, so we build the
  // indexes ONCE (not per review). Two tiers, checked in order:
  //   1. exact case-insensitive full name
  //   2. first name + last initial (e.g. "Allie Willow" → "allie w"), but ONLY
  //      when that shortened key maps to a single contact — an ambiguous key
  //      (two "allie w" contacts) is dropped so we never guess wrong.
  // Soft signal only, and always manually overridable in the UI.
  const { data: allContacts } = await db.from('contacts').select('id, name').eq('company_id', companyId).limit(5000)
  const contactByName = new Map<string, { id: string; name: string }>()
  const fuzzyIndex = new Map<string, { id: string; name: string } | null>()  // null = ambiguous
  const fuzzyKey = (name: string) => {
    const parts = (name || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
    return parts.length >= 2 ? `${parts[0]} ${parts[parts.length - 1][0]}` : ''
  }
  for (const c of (allContacts || [])) {
    const key = (c.name || '').trim().toLowerCase()
    if (key && !contactByName.has(key)) contactByName.set(key, { id: c.id, name: c.name })
    const fk = fuzzyKey(c.name || '')
    if (fk) fuzzyIndex.set(fk, fuzzyIndex.has(fk) ? null : { id: c.id, name: c.name })
  }
  const findMatch = (name: string): { id: string; name: string } | undefined => {
    const full = (name || '').trim().toLowerCase()
    if (!full || full === 'anonymous') return undefined
    const exact = contactByName.get(full)
    if (exact) return exact
    const fk = fuzzyKey(name)
    return (fk ? fuzzyIndex.get(fk) : undefined) || undefined   // ambiguous (null) → no match
  }
  const nowIso = new Date().toISOString()
  const missingCol = (e: any) => e && /column|schema cache|does not exist/i.test(e.message || '')

  // Pre-fetch existing reviews ONCE (id + current link), so the loop below does
  // a single write per review instead of a SELECT + write. A full sync of
  // hundreds of reviews was doing ~2 queries each, which timed the request out.
  const existingMap = new Map<string, { id: string; contact_id: string | null }>()
  {
    let r = await db.from('google_reviews').select('id, review_id, contact_id').eq('company_id', companyId).limit(10000)
    if (missingCol(r.error)) r = await db.from('google_reviews').select('id, review_id').eq('company_id', companyId).limit(10000)
    for (const row of (r.data || [])) existingMap.set(row.review_id, { id: row.id, contact_id: (row as any).contact_id ?? null })
  }

  const newReviews: any[] = []   // freshly inserted this run — for the email notification

  for (const r of allReviews) {
    const reviewerName = r.reviewer?.displayName || 'Anonymous'
    const match = findMatch(reviewerName)
    const reviewId = r.reviewId || r.name
    const existing = existingMap.get(reviewId)

    const row: any = {
      company_id: companyId,
      review_id: reviewId,
      reviewer_name: reviewerName,
      reviewer_photo: r.reviewer?.profilePhotoUrl || null,
      star_rating: STAR[r.starRating] ?? null,
      comment: r.comment || null,
      reply_comment: r.reviewReply?.comment || null,
      replied_at: r.reviewReply?.updateTime || null,
      review_created_at: r.createTime || null,
      raw: r,
      match_checked_at: nowIso,
      // Never clobber a link an agent set by hand — only auto-fill when unlinked.
      contact_id: existing?.contact_id || match?.id || null,
      contact_name: match?.name || null,
    }

    // Resilient write: strip the match columns and retry if they're not migrated.
    const write = async (payload: any) => existing?.id
      ? db.from('google_reviews').update(payload).eq('id', existing.id)
      : db.from('google_reviews').insert(payload)
    let res = await write(row)
    if (missingCol(res.error)) {
      const { contact_id, contact_name, match_checked_at, ...base } = row
      res = await write(base)
    }
    if (!existing?.id) {
      saved++
      newReviews.push(row)
      // Tie a new review back to a review request we sent, so the agent's
      // review card can show it was completed.
      try {
        if (match && row.star_rating) {
          const { data: convs } = await db.from('conversations').select('id').eq('contact_id', match.id).limit(20)
          const convIds = (convs || []).map((c: any) => c.id)
          if (convIds.length) {
            const { data: reqMsg } = await db.from('messages')
              .select('id, metadata').in('conversation_id', convIds)
              .contains('metadata', { review_request: true })
              .order('created_at', { ascending: false }).limit(1).maybeSingle()
            if (reqMsg && !reqMsg.metadata?.review_completed) {
              await db.from('messages').update({
                metadata: { ...(reqMsg.metadata || {}), review_completed: true, review_rating: row.star_rating },
              }).eq('id', reqMsg.id)
            }
          }
        }
      } catch { /* non-fatal */ }
    }
  }

  // Email the business about brand-new, RECENT reviews only — so the first sync
  // (which backfills years of old reviews) never floods the inbox. Capped too.
  try {
    const recent = newReviews
      .filter(r => r.review_created_at && (Date.now() - new Date(r.review_created_at).getTime()) < 3 * 86_400_000)
      .slice(0, 20)
    if (recent.length) await notifyNewReviews(db, companyId, recent)
  } catch { /* non-fatal */ }

  // Round the average here so every consumer shows 4.6★, not 4.599999…★.
  const avgRounded = averageRating != null ? Math.round(Number(averageRating) * 10) / 10 : null
  return { total: allReviews.length, new: saved, averageRating: avgRounded, totalReviewCount: totalReviewCount ?? allReviews.length }
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
