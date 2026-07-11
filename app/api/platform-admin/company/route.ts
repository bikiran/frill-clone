import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPER_ADMIN = 'bishalstha76@gmail.com'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Verify the caller is the super admin (their access token is sent as Bearer).
async function requireSuperAdmin(req: NextRequest, db: any): Promise<boolean> {
  try {
    const authz = req.headers.get('authorization') || ''
    const token = authz.replace(/^Bearer\s+/i, '')
    if (!token) return false
    const { data } = await db.auth.getUser(token)
    return data?.user?.email === SUPER_ADMIN
  } catch { return false }
}

// POST: update a company's core fields from the platform admin.
// Handles slug uniqueness and owner reassignment safely.
export async function POST(req: NextRequest) {
  try {
    const db = admin()
    if (!(await requireSuperAdmin(req, db))) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }
    const { companyId, patch } = await req.json()
    if (!companyId || !patch) return NextResponse.json({ error: 'Missing companyId or patch' }, { status: 400 })

    const allowed: any = {}
    for (const f of ['name', 'slug', 'plan', 'business_phone', 'assigned_admin_email', 'board_domain', 'help_domain', 'accent_color', 'notes']) {
      if (patch[f] !== undefined) allowed[f] = patch[f]
    }

    // Slug: validate format + uniqueness.
    if (allowed.slug !== undefined) {
      const slug = String(allowed.slug).toLowerCase().trim()
      if (!/^[a-z0-9-]{2,40}$/.test(slug)) return NextResponse.json({ error: 'Slug must be 2-40 chars: lowercase letters, numbers, hyphens.' }, { status: 400 })
      const { data: clash } = await db.from('companies').select('id').eq('slug', slug).neq('id', companyId).maybeSingle()
      if (clash) return NextResponse.json({ error: `Slug "${slug}" is already taken.` }, { status: 409 })
      allowed.slug = slug
    }

    // Owner reassignment by email → look up the user id.
    if (patch.owner_email !== undefined && patch.owner_email) {
      const { data: list } = await db.auth.admin.listUsers()
      const match = (list?.users || []).find((u: any) => (u.email || '').toLowerCase() === String(patch.owner_email).toLowerCase())
      if (!match) return NextResponse.json({ error: `No user found with email ${patch.owner_email}. They must sign up first.` }, { status: 404 })
      allowed.owner_id = match.id
    }

    const { data, error } = await db.from('companies').update(allowed).eq('id', companyId).select().maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, company: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
