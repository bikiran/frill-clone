import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const PLATFORM_SUPER_ADMIN = 'bishalstha76@gmail.com'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// POST /api/payments/backfill-links  { companyId }
//
// One-off: repoint pending payment links that still target a raw Stripe
// Checkout URL (which expires in ~24h) at the durable /pay/<id> resolver. The
// short link a customer already has in their SMS is /l/<code>; repointing its
// target revives that exact link. Owner/admin only. Idempotent — already-durable
// links (created after the durable-links change) are skipped.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    let companyId: string | null = body?.companyId || null
    const db = admin()

    // Auth: the caller must be the company owner/admin (or the platform admin).
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    const { data: u } = await db.auth.getUser(token)
    const user = u?.user
    if (!user) return NextResponse.json({ error: 'Session expired' }, { status: 401 })

    // Resolve the workspace from the subdomain when no id is given, so this can
    // be triggered from the admin tab without looking up the company id.
    if (!companyId) {
      const host = req.headers.get('host') || ''
      const slug = host.endsWith('.colvy.com') ? host.split('.')[0] : ''
      if (slug && slug !== 'admin') {
        const { data: bySlug } = await db.from('companies').select('id').eq('slug', slug).maybeSingle()
        companyId = bySlug?.id || null
      }
    }
    if (!companyId) return NextResponse.json({ error: 'Could not determine the workspace — pass companyId.' }, { status: 400 })

    const { data: company } = await db.from('companies').select('owner_id, slug').eq('id', companyId).maybeSingle()
    if (!company) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    let allowed = company.owner_id === user.id || user.email === PLATFORM_SUPER_ADMIN
    if (!allowed) {
      const { data: tm } = await db.from('team_members').select('role').eq('company_id', companyId).eq('user_id', user.id).maybeSingle()
      allowed = ['owner', 'admin'].includes(String(tm?.role || '').toLowerCase())
    }
    if (!allowed) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

    const colvyBase = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
    // Short links are served from the tenant subdomain when possible.
    let shortOrigin = colvyBase
    try { const bu = new URL(colvyBase); if (company.slug && bu.hostname.endsWith('colvy.com')) shortOrigin = `${bu.protocol}//${company.slug}.colvy.com` } catch {}

    // Pending payments whose stored link is still a raw Stripe URL.
    const { data: pays } = await db.from('chat_payments')
      .select('id, checkout_url, conversation_id')
      .eq('company_id', companyId).eq('status', 'pending')
      .limit(1000)

    let scanned = 0, repointed = 0, updated = 0
    for (const pay of pays || []) {
      const cur = String(pay.checkout_url || '')
      if (!/checkout\.stripe\.com|stripe\.com/i.test(cur)) continue   // already durable or no link
      scanned++
      const payUrl = `${colvyBase}/pay/${pay.id}`

      // Repoint the customer's short link(s) that pointed at this raw Stripe URL.
      let durable = payUrl
      try {
        const { data: links } = await db.from('short_links')
          .select('id, code').eq('company_id', companyId).eq('target_url', cur)
        for (const l of links || []) {
          const { error } = await db.from('short_links').update({ target_url: payUrl }).eq('id', l.id)
          if (!error) repointed++
        }
        if (links && links.length) durable = `${shortOrigin}/l/${links[0].code}`
      } catch { /* fall back to the /pay URL */ }

      // Point the record at a durable customer link so Copy/Resend use it too.
      const { error: ue } = await db.from('chat_payments').update({ checkout_url: durable }).eq('id', pay.id)
      if (!ue) updated++
    }

    return NextResponse.json({ ok: true, scanned, repointed, updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
