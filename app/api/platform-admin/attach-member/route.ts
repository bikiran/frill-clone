import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const SUPER_ADMIN = 'bishalstha76@gmail.com'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function requireSuperAdmin(req: NextRequest, db: any): Promise<boolean> {
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return false
    const { data } = await db.auth.getUser(token)
    return data?.user?.email === SUPER_ADMIN
  } catch { return false }
}

// POST — super-admin repair: attach an existing account to a workspace as a team
// member (or fix an orphaned account that was created but never linked to any
// team). Idempotent: if the person is already a member of that workspace, their
// role/status is updated in place rather than duplicated. Accepts the user by
// id or email, and the company by id or slug.
export async function POST(req: NextRequest) {
  try {
    const db = admin()
    if (!(await requireSuperAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    let userId: string | null = body.userId || null
    const email: string | null = body.email ? String(body.email).trim().toLowerCase() : null
    let companyId: string | null = body.companyId || null
    const slug: string | null = body.slug ? String(body.slug).trim().toLowerCase() : null
    // Role uses the same wire values as the team UI: 'editor' == "Agent".
    const role: string = ['admin', 'editor', 'viewer'].includes(body.role) ? body.role : 'editor'

    // Resolve the account by id or email.
    let userEmail = email || ''
    if (!userId && email) {
      for (let page = 1; page <= 25 && !userId; page++) {
        const { data: list } = await (db.auth.admin as any).listUsers({ page, perPage: 200 })
        const found = (list?.users || []).find((u: any) => (u.email || '').toLowerCase() === email)
        if (found) { userId = found.id; userEmail = found.email || email }
        if ((list?.users || []).length < 200) break
      }
    }
    if (userId && !userEmail) {
      try { const { data } = await (db.auth.admin as any).getUserById(userId); userEmail = data?.user?.email || '' } catch {}
    }
    if (!userId) return NextResponse.json({ error: 'Could not find that account (check the user id or email).' }, { status: 404 })

    // Resolve the workspace by id or slug.
    if (!companyId && slug) {
      const { data: co } = await db.from('companies').select('id, name, slug').eq('slug', slug).maybeSingle()
      if (co?.id) companyId = co.id
    }
    if (!companyId) return NextResponse.json({ error: 'Could not resolve the workspace (pass a companyId or slug).' }, { status: 400 })
    const { data: company } = await db.from('companies').select('id, name, slug').eq('id', companyId).maybeSingle()
    if (!company?.id) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 })

    // Upsert the membership. Match an existing row for this (user, company) first
    // so we never create a duplicate that would break single-row lookups.
    const { data: existing } = await db.from('team_members')
      .select('id').eq('company_id', companyId).eq('user_id', userId).limit(1)
    if (existing && existing.length) {
      const { error } = await db.from('team_members')
        .update({ role, status: 'active', email: userEmail || undefined }).eq('id', existing[0].id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, updated: true, companyName: company.name, role })
    }
    const { error } = await db.from('team_members').insert({
      user_id: userId, company_id: companyId, email: userEmail || null, role, status: 'active',
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, created: true, companyName: company.name, role })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
