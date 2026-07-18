import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const genCode = () => Math.random().toString(36).slice(2, 8)

// POST { companyId, kind, conversationId?, url? }
// kind='review' → looks up the business's Google review link.
// kind='redirect' → uses the provided url.
// Returns a branded short link on the company's own subdomain.
export async function POST(req: NextRequest) {
  try {
    const { companyId, kind, conversationId, url } = await req.json()
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

    // Reuse an existing link for the same target if we have one.
    const { data: existing } = await db.from('short_links')
      .select('code').eq('company_id', companyId).eq('target_url', target).limit(1)
    let code = existing?.[0]?.code
    if (!code) {
      code = genCode()
      await db.from('short_links').insert({
        code, company_id: companyId, target_url: target,
        label: kind === 'review' ? 'Leave a review' : 'Link',
        kind: kind || 'redirect', conversation_id: conversationId || null,
      })
    }

    // Build the branded URL on the company's subdomain.
    // Review/media links use /m/ (a branded viewer page); plain redirects use
    // /l/, which records a detailed click (time, location, device) for Reports
    // before forwarding.
    const { data: company } = await db.from('companies').select('slug').eq('id', companyId).maybeSingle()
    const host = company?.slug ? `${company.slug}.colvy.com` : 'colvy.com'
    const path = (kind === 'review' || kind === 'media') ? 'm' : 'l'
    return NextResponse.json({ url: `https://${host}/${path}/${code}`, code })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
