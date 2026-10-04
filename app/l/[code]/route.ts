import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { recordLinkClick } from '@/lib/link-click'

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
      .select('id, company_id, target_url, clicks, contact_id, kind').eq('code', code).maybeSingle()
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
    await recordLinkClick(db, data, req.headers)

    return NextResponse.redirect(target)
  } catch {
    return new NextResponse('Error', { status: 500 })
  }
}
