import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { DEFAULT_SOCIAL_CATEGORIES, categorySlug } from '@/lib/social'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET: the company's comment categories (provisioning the default set the first
// time), each with a live comment count.
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const db = admin()

    let { data: cats } = await db.from('social_comment_categories')
      .select('*').eq('company_id', companyId).order('sort_order', { ascending: true })

    // First visit: seed the defaults so the page is never empty.
    if (!cats || cats.length === 0) {
      const rows = DEFAULT_SOCIAL_CATEGORIES.map((name, i) => ({
        company_id: companyId, name, slug: categorySlug(name), sort_order: i,
      }))
      await db.from('social_comment_categories').insert(rows)
      const re = await db.from('social_comment_categories')
        .select('*').eq('company_id', companyId).order('sort_order', { ascending: true })
      cats = re.data || []
    }

    // Live counts per category (by name — the classifier stores the category name).
    const counts: Record<string, number> = {}
    const { data: rows } = await db.from('social_comments')
      .select('category').eq('company_id', companyId).eq('is_archived', false).limit(10000)
    for (const r of (rows || [])) {
      const c = (r as any).category
      if (c) counts[c] = (counts[c] || 0) + 1
    }

    return NextResponse.json({
      categories: (cats || []).map((c: any) => ({ ...c, count: counts[c.name] || 0 })),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST: update one category's AI-reply / DM guidelines + toggles.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { companyId, id } = body
    if (!companyId || !id) return NextResponse.json({ error: 'companyId and id required' }, { status: 400 })
    const db = admin()

    const patch: any = { updated_at: new Date().toISOString() }
    for (const f of ['reply_ai_enabled', 'reply_guidelines', 'dm_enabled', 'dm_guidelines']) {
      if (body[f] !== undefined) patch[f] = body[f]
    }
    const { error } = await db.from('social_comment_categories')
      .update(patch).eq('id', id).eq('company_id', companyId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
