import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { recordLinkClick } from '@/lib/link-click'
import { isPublicChannel } from '@/lib/link-channels'
import { isEngagePage, isOwnSurface, loadCompanySurfaces, withClickRef } from '@/lib/link-stitch'
import { emailClick } from '@/lib/email-click'

// Redirects /l/<code> to the stored target URL and records the click.
// The redirect is the priority: click logging is best-effort and must never
// stop a customer reaching the page they tapped.
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data } = await db.from('short_links')
      .select('id, company_id, target_url, clicks, contact_id, kind, channel, campaign_id').eq('code', code).maybeSingle()
    if (!data?.target_url) {
      return new NextResponse('Link not found', { status: 404 })
    }

    // Self-heal old payment links. A payment link that still points straight at
    // a Stripe Checkout URL will dead-end once that session expires (~24h). If
    // we can tie it back to its payment, send it through the durable /pay/<id>
    // resolver instead (which mints a fresh session on demand), and repoint the
    // short link so it stays fixed. Applies to links created before durable
    // links shipped — new ones already target /pay.
    let target = data.target_url
    if (/checkout\.stripe\.com/i.test(target)) {
      try {
        let pay: any = null
        const exact = await db.from('chat_payments').select('id, status').eq('company_id', data.company_id).eq('checkout_url', target).maybeSingle()
        pay = exact.data
        if (!pay) {
          const m = target.match(/\/(cs_(?:live|test)_[A-Za-z0-9]+)/)
          if (m) { const bySess = await db.from('chat_payments').select('id, status').eq('company_id', data.company_id).eq('stripe_session_id', m[1]).maybeSingle(); pay = bySess.data }
        }
        if (pay?.id) {
          const colvyBase = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
          target = `${colvyBase}/pay/${pay.id}`
          db.from('short_links').update({ target_url: target }).eq('id', data.id).then(() => {}, () => {})
        }
      } catch { /* couldn't resolve — fall back to the original target */ }
    }

    // Click event (device / city) + the link's counter. Awaited: serverless
    // can freeze the function once the redirect is sent.
    // A tracked link in a campaign email names its recipient (?r=, signed):
    // the click is theirs, and the campaign report counts it.
    if (!data.contact_id && data.channel === 'email' && req.nextUrl.searchParams.get('r')) {
      const { contactId } = await emailClick(db, data, req.nextUrl.searchParams.get('r'))
      if (contactId) data.contact_id = contactId
    }
    const clickId = await recordLinkClick(db, data, req.headers)

    // Smart links: a public link (a Reel, a QR poster…) has no customer on it,
    // so its clicks are anonymous. When it points at the business's own pages
    // — where the chat widget, booking page or form can read it back — pass
    // the click on as ?clv=, so the chat, booking or enquiry that follows is
    // credited to this link (lib/link-stitch.ts). Links sent to a particular
    // customer already know who clicked and are left exactly as they were.
    if (clickId && !data.contact_id && isPublicChannel(data.channel) && data.company_id) {
      try {
        const co = await loadCompanySurfaces(db, data.company_id)
        if (co && isOwnSurface(target, co)) target = withClickRef(target, clickId)
      } catch { /* redirect to the plain target */ }
    } else if (clickId && data.contact_id && data.company_id && /\/(polls|surveys)\//i.test(target)) {
      // A poll or survey sent to one customer (an SMS campaign): pass the click
      // on too, so their vote is matched to them and counted once.
      try {
        const co = await loadCompanySurfaces(db, data.company_id)
        if (co && isEngagePage(target, co)) target = withClickRef(target, clickId)
      } catch { /* redirect to the plain target */ }
    }

    return NextResponse.redirect(target)
  } catch {
    return new NextResponse('Error', { status: 500 })
  }
}
