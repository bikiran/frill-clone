import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { isPublicChannel } from '@/lib/link-channels'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const genCode = () => Math.random().toString(36).slice(2, 8)

// Where the link is used ('sms', 'gallery', 'instagram_reel', 'qr'…).
const CHANNEL_RE = /^[a-z][a-z0-9_]{1,31}$/

type DbError = { code?: string; message?: string } | null | undefined
const isUniqueViolation = (e: DbError) => e?.code === '23505' || /duplicate key|unique constraint/i.test(String(e?.message || ''))
type ReuseCandidate = { code: string; channel: string | null; contact_id: string | null; campaign_id?: string | null }
const CODE_TAKEN = 'That code is taken — try another.'

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

// POST { companyId, kind, conversationId?, url?, label?, customCode?, channel? }
// kind='review' → looks up the business's Google review link.
// kind='redirect' → uses the provided url.
// channel → where the link is used ('gallery', or where a social / QR link
// will be posted — see lib/link-channels.ts).
// Returns a branded short link on the company's own subdomain.
export async function POST(req: NextRequest) {
  try {
    const { companyId, kind, conversationId, url, label, customCode, sentBy, mediaUrls, note, channel: rawChannel, expiresAt, expiryMode } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const db = admin()
    // Anyone could mint links on any workspace's domain; only its members now.
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const channel = typeof rawChannel === 'string' && CHANNEL_RE.test(rawChannel.trim()) ? rawChannel.trim() : null
    const cleanLabel = typeof label === 'string' ? label.trim().slice(0, 200) : ''

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
    let vanity = false

    if (customCode) {
      // A custom code (vanity link). Every /l/<code> is looked up by the code
      // alone, so codes are unique across ALL workspaces, not just this one.
      // Checking only this company let a clash through to the insert, which
      // then failed with a raw database error.
      const clean = String(customCode).trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
      if (clean.length < 3) {
        return NextResponse.json({ error: 'Custom codes need at least 3 characters' }, { status: 400 })
      }
      if (clean.length > 40) {
        return NextResponse.json({ error: 'Custom codes can be up to 40 characters' }, { status: 400 })
      }
      const { data: taken } = await db.from('short_links').select('id').eq('code', clean).limit(1)
      if (taken?.length) return NextResponse.json({ error: CODE_TAKEN }, { status: 409 })
      code = clean
      vanity = true
    } else if (Array.isArray(mediaUrls) && mediaUrls.length > 0) {
      // Galleries always get a fresh code: two sends may share a first photo
      // but carry different sets, so reusing would show the wrong attachments.
      code = undefined
    } else if (channel || cleanLabel) {
      // A link made for a particular post, poster or purpose always gets its own
      // code — a Reel and a QR poster pointing at the same page must report
      // separately, or nobody can tell which one worked.
      code = undefined
    } else {
      // Reuse an existing link for the same target if we have one, so the same
      // URL shared twice reports as one link rather than splitting its clicks.
      // Never one made for a particular customer (contact or campaign), whose
      // clicks would then be credited to that customer, and never a public
      // Reel / QR link, whose numbers are about that post.
      const { data: existing, error: findErr } = await db.from('short_links')
        .select('code, channel, contact_id, campaign_id')
        .eq('company_id', companyId).eq('target_url', target).is('contact_id', null).limit(20)
      if (!findErr) {
        code = ((existing || []) as ReuseCandidate[])
          .find(l => !l.contact_id && !l.campaign_id && !isPublicChannel(l.channel))?.code
      }
    }

    if (!code || vanity) {
      // Insert the columns that have existed since short_links was created.
      // Newer columns (link_type, media_urls, note, sent_by) are patched on
      // afterward so a missing one can never fail the whole insert and force a
      // fall back to raw storage URLs.
      let insErr: DbError = null
      for (let attempt = 0; attempt < (vanity ? 1 : 4); attempt++) {
        const tryCode = vanity ? code! : genCode()
        const { error } = await db.from('short_links').insert({
          code: tryCode, company_id: companyId, target_url: target,
          label: cleanLabel || (kind === 'review' ? 'Leave a review' : 'Link'),
          kind: kind || 'redirect',
          conversation_id: conversationId || null,
          clicks: 0,
        })
        insErr = error
        if (!error) { code = tryCode; break }
        // A random code that already exists somewhere — try another.
        if (!isUniqueViolation(error)) break
      }
      if (insErr) {
        // Someone else claimed the custom code between the check and the insert.
        if (vanity && isUniqueViolation(insErr)) return NextResponse.json({ error: CODE_TAKEN }, { status: 409 })
        return NextResponse.json({ error: `Could not create link: ${insErr.message}` }, { status: 500 })
      }

      // Best-effort extras — each patched independently so one missing column
      // doesn't lose the others.
      const patch = async (fields: Record<string, any>) => {
        try { await db.from('short_links').update(fields).eq('code', code).eq('company_id', companyId) } catch {}
      }
      await patch({ link_type: classify(target) })
      if (Array.isArray(mediaUrls) && mediaUrls.length) await patch({ media_urls: mediaUrls })
      if (note) await patch({ note })
      if (sentBy) await patch({ sent_by: sentBy })
      // Media expiry (V247). Patched separately so a pre-migration DB still
      // creates the link (just without an enforced expiry).
      if (expiresAt) await patch({ expires_at: expiresAt, expiry_mode: expiryMode === 'delete' ? 'delete' : 'access' })
      // Where the link was created from (e.g. 'gallery') or where it will be
      // posted (e.g. 'instagram_reel'), so Link Reports groups it correctly
      // instead of defaulting to SMS.
      if (channel) await patch({ channel })
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
