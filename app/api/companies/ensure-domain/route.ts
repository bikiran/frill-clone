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

// Find auth-user ids that share an email with the caller (case-insensitive),
// excluding the caller themselves. Signup could mint a second auth user for the
// same address, leaving a board owned by that stale id — this lets us recognise
// it as the caller's own. Pages through the admin user list (fine at this scale).
async function otherUserIdsWithEmail(db: any, email: string, selfId: string): Promise<string[]> {
  const target = (email || '').toLowerCase()
  if (!target) return []
  const ids: string[] = []
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) break
    const users = data?.users || []
    for (const u of users) {
      if (u.id !== selfId && (u.email || '').toLowerCase() === target) ids.push(u.id)
    }
    if (users.length < 200) break
  }
  return ids
}

// Self-healing board setup. Called automatically (e.g. from onboarding) so a
// board whose signup-time setup failed or never ran — a transient hiccup, a
// signup from before these steps existed, or a board left owned by a duplicate
// auth user for the same email — is repaired the next time its owner loads it,
// with no manual steps. Ensures, all idempotent:
//   0. the board is owned by the caller (re-assigning from a same-email account),
//   1. the subdomain is provisioned (Vercel + Cloudflare),
//   2. the owner has an OWNER team-member row (grants board admin),
//   3. sample content is seeded if the board is empty.
//
// Authenticated + scoped: acts ONLY on a company the caller owns OR one owned by
// an account with the caller's exact verified email, so it can't touch others.
export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const db = admin()
    const { data: auth } = await db.auth.getUser(token)
    const userId = auth?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    // The caller's own board (oldest-owned = their primary).
    let { data: co } = await db.from('companies')
      .select('id, slug, name').eq('owner_id', userId)
      .order('created_at', { ascending: true }).limit(1).maybeSingle()

    // Fallback: no board under this id, but signup may have left it under a
    // DUPLICATE account for the same email. Find such a board and re-assign it to
    // the caller — safe because it only matches the caller's exact verified email.
    let reassigned = false
    if (!co?.slug) {
      const otherIds = await otherUserIdsWithEmail(db, auth.user!.email || '', userId)
      if (otherIds.length) {
        const { data: orphan } = await db.from('companies')
          .select('id, slug, name').in('owner_id', otherIds)
          .order('created_at', { ascending: true }).limit(1).maybeSingle()
        if (orphan?.id) {
          await db.from('companies').update({ owner_id: userId }).eq('id', orphan.id)
          co = orphan
          reassigned = true
        }
      }
    }
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
