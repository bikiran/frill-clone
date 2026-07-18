import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseUserAgent } from '@/lib/link-tracking'

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
      .select('id, company_id, target_url, clicks').eq('code', code).maybeSingle()
    if (!data?.target_url) {
      return new NextResponse('Link not found', { status: 404 })
    }

    // Detailed click event for the Reports tab — when, where, what device.
    try {
      const ua = req.headers.get('user-agent') || ''
      const { device, os, browser } = parseUserAgent(ua)
      const ip =
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        req.headers.get('x-real-ip') || null
      // Vercel supplies coarse geo headers at the edge (URL-encoded city names).
      const city = req.headers.get('x-vercel-ip-city')
      const region = req.headers.get('x-vercel-ip-country-region')
      const country = req.headers.get('x-vercel-ip-country')

      await db.from('link_clicks').insert({
        link_id: data.id,
        company_id: data.company_id,
        ip,
        city: city ? decodeURIComponent(city) : null,
        region: region || null,
        country: country || null,
        device, os, browser,
        referrer: req.headers.get('referer') || null,
        user_agent: ua || null,
      })
    } catch { /* analytics table may not exist yet — ignore */ }

    // Keep the fast counter on the link itself current.
    db.from('short_links')
      .update({ clicks: (data.clicks || 0) + 1, last_clicked_at: new Date().toISOString() })
      .eq('code', code).then(() => {}, () => {})

    return NextResponse.redirect(data.target_url)
  } catch {
    return new NextResponse('Error', { status: 500 })
  }
}
