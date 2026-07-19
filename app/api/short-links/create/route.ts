import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const genCode = () => Math.random().toString(36).slice(2, 8)

/** Same classification Link Reports groups by. */
function classify(url: string): string {
  const u = (url || '').toLowerCase()
  if (/\.(png|jpe?g|gif|webp|heic|mp4|mov)(\?|$)/.test(u)) return 'image'
  if (u.includes('stripe.com') || /\/pay(ment)?\b/.test(u)) return 'payment'
  if (u.includes('/checkout') || u.includes('/cart')) return 'checkout'
  if (u.includes('/book') || u.includes('/appointment')) return 'booking'
  if (u.includes('/help/') || u.includes('/docs/')) return 'help'
  if (u.includes('/form') || u.includes('/survey')) return 'form'
  if (u.includes('/product/') || u.includes('/shop/')) return 'product'
  return 'external'
}

// POST { companyId, kind, conversationId?, url? }
// kind='review' → looks up the business's Google review link.
// kind='redirect' → uses the provided url.
// Returns a branded short link on the company's own subdomain.
export async function POST(req: NextRequest) {
  try {
    const { companyId, kind, conversationId, url, label, customCode, sentBy, mediaUrls, note } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const db = admin()

    let target = url as string | undefined
    if (kind === 'review') {
      // The review link can be set in two places in the UI: the Google Reviews
      // integration page (google_business_accounts.review_link) and the order-
      // automation page (companies.order_chat_automation.review_url). Check both
      // so it works wherever the business pasted it.
      const { data: acc } = await db.from('google_business_accounts')
        .select('review_link').eq('company_id', companyId)
        .not('review_link', 'is', null).limit(1)
      target = acc?.[0]?.review_link
      if (!target) {
        const { data: comp } = await db.from('companies')
          .select('order_chat_automation').eq('id', companyId).maybeSingle()
        target = comp?.order_chat_automation?.review_url || undefined
      }
      if (!target) return NextResponse.json({ error: 'No Google review link configured' }, { status: 404 })
    }
    if (!target) return NextResponse.json({ error: 'No target url' }, { status: 400 })

    // Basic URL validation — a mistyped link is worse than no link, because it
    // looks trustworthy on the company's own domain.
    let normalised = String(target).trim()
    if (!/^https?:\/\//i.test(normalised)) normalised = `https://${normalised}`
    try { new URL(normalised) } catch {
      return NextResponse.json({ error: 'That doesn\'t look like a valid URL' }, { status: 400 })
    }
    target = normalised

    let code: string | undefined

    // A custom code (vanity link) must be unique for the company.
    if (customCode) {
      const clean = String(customCode).trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
      if (clean.length < 3) {
        return NextResponse.json({ error: 'Custom codes need at least 3 characters' }, { status: 400 })
      }
      const { data: taken } = await db.from('short_links')
        .select('id').eq('company_id', companyId).eq('code', clean).limit(1)
      if (taken?.length) {
        return NextResponse.json({ error: `The code "${clean}" is already in use` }, { status: 409 })
      }
      code = clean
    } else if (Array.isArray(mediaUrls) && mediaUrls.length > 0) {
      // Galleries always get a fresh code: two sends may share a first photo
      // but carry different sets, so reusing would show the wrong attachments.
      code = undefined
    } else {
      // Reuse an existing link for the same target if we have one, so the same
      // URL shared twice reports as one link rather than splitting its clicks.
      const { data: existing } = await db.from('short_links')
        .select('code').eq('company_id', companyId).eq('target_url', target).limit(1)
      code = existing?.[0]?.code
    }

    if (!code || customCode) {
      code = code || genCode()
      await db.from('short_links').insert({
        code, company_id: companyId, target_url: target,
        label: label?.trim() || (kind === 'review' ? 'Leave a review' : 'Link'),
        kind: kind || 'redirect',
        link_type: classify(target),
        conversation_id: conversationId || null,
        sent_by: sentBy || null,
        // The full set, so /m/<code> can present a gallery rather than one file.
        media_urls: Array.isArray(mediaUrls) ? mediaUrls : [],
        note: note || null,
        clicks: 0,
      })
    }

    // Build the branded URL on the company's subdomain.
    // Review/media links use /m/ (a branded viewer page); plain redirects use
    // /l/, which records a detailed click (time, location, device) for Reports
    // before forwarding.
    const { data: company } = await db.from('companies').select('slug').eq('id', companyId).maybeSingle()
    const host = company?.slug ? `${company.slug}.colvy.com` : 'colvy.com'
    const path = (kind === 'review' || kind === 'media') ? 'm' : 'l'
    return NextResponse.json({ url: `https://${host}/${path}/${code}`, code, target })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
