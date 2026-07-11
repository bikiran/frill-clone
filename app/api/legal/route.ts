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

async function requireSuperAdmin(req: NextRequest, db: any): Promise<string | null> {
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return null
    const { data } = await db.auth.getUser(token)
    return data?.user?.email === SUPER_ADMIN ? data.user.email : null
  } catch { return null }
}

// GET ?slug=privacy|terms — public read (global page).
export async function GET(req: NextRequest) {
  const db = admin()
  const slug = req.nextUrl.searchParams.get('slug')
  if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 })
  const { data } = await db.from('legal_pages').select('*').eq('slug', slug).is('company_id', null).maybeSingle()
  return NextResponse.json({ page: data || null })
}

// POST { slug, title, sections } — super-admin only.
export async function POST(req: NextRequest) {
  const db = admin()
  const email = await requireSuperAdmin(req, db)
  if (!email) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const { slug, title, sections } = await req.json()
  if (!slug || !title) return NextResponse.json({ error: 'Missing slug or title' }, { status: 400 })

  const { data: existing } = await db.from('legal_pages').select('id').eq('slug', slug).is('company_id', null).maybeSingle()
  const row = { slug, title, sections: sections || [], updated_at: new Date().toISOString(), updated_by: email, company_id: null }
  if (existing?.id) await db.from('legal_pages').update(row).eq('id', existing.id)
  else await db.from('legal_pages').insert(row)
  return NextResponse.json({ ok: true })
}
