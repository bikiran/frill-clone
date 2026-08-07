import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { provisionSubdomain } from '@/lib/provision-domain'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Self-healing board setup. Called automatically (e.g. from onboarding) so a
// board whose signup-time setup failed or never ran — a transient hiccup, or a
// signup from before these steps existed — is repaired the next time its owner
// loads it, with no manual steps. Ensures three things, all idempotent:
//   1. the subdomain is provisioned (Vercel + Cloudflare),
//   2. the owner has an OWNER team-member row (grants board admin),
//   3. sample content is seeded if the board is empty.
//
// Authenticated + scoped: acts ONLY on a company the caller OWNS, so it can't be
// abused to touch other boards.
export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const db = admin()
    const { data: auth } = await db.auth.getUser(token)
    const userId = auth?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    // The caller's own board (oldest-owned = their primary).
    const { data: co } = await db.from('companies')
      .select('id, slug, name').eq('owner_id', userId)
      .order('created_at', { ascending: true }).limit(1).maybeSingle()
    if (!co?.slug) return NextResponse.json({ error: 'No board to set up' }, { status: 404 })

    // 1. Subdomain
    const domain = await provisionSubdomain(`${co.slug}.colvy.com`)

    // 2. Owner membership (idempotent)
    let membership = 'ok'
    try {
      const { data: m } = await db.from('team_members').select('id')
        .eq('company_id', co.id).eq('user_id', userId).maybeSingle()
      if (!m) {
        await db.from('team_members').insert({
          email: auth.user.email, user_id: userId, company_id: co.id,
          role: 'owner', status: 'active',
        })
        membership = 'created'
      }
    } catch (e: any) { membership = `failed: ${e?.message || e}` }

    // 3. Seed sample content only if the board is empty (guard on statuses so we
    //    never double-seed).
    let seeded = 'skipped'
    try {
      const { data: st } = await db.from('statuses').select('id').eq('company_id', co.id).limit(1)
      if (!st || st.length === 0) {
        const { seedCompanyData } = await import('@/lib/seedCompany')
        await seedCompanyData(co.id, co.name)
        seeded = 'seeded'
      }
    } catch (e: any) { seeded = `failed: ${e?.message || e}` }

    return NextResponse.json({ ok: domain.ok, domain, membership, seeded })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
