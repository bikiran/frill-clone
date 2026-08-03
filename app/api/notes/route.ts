import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Company notes (COLVY_V233). Service-role so it works regardless of RLS, keyed
// by companyId like the other admin data APIs. Resilient: if the table hasn't
// been migrated, GET returns [] with needsMigration so the UI can explain.
const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
const missing = (m?: string) => !!m && /does not exist|schema cache|relation .* does not exist/i.test(m)
const genCode = () => Math.random().toString(36).slice(2, 9)

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  const id = req.nextUrl.searchParams.get('id')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  try {
    const db = admin()
    if (id) {
      const { data, error } = await db.from('notes').select('*').eq('id', id).eq('company_id', companyId).maybeSingle()
      if (error) { if (missing(error.message)) return NextResponse.json({ note: null, needsMigration: true }); throw error }
      return NextResponse.json({ note: data })
    }
    const { data, error } = await db.from('notes')
      .select('id, title, body, checklist, cover_image, is_public, public_code, allow_public_edit, updated_at, created_at')
      .eq('company_id', companyId).order('updated_at', { ascending: false }).limit(500)
    if (error) { if (missing(error.message)) return NextResponse.json({ notes: [], needsMigration: true }); throw error }
    return NextResponse.json({ notes: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { companyId, action } = body
    if (!companyId || !action) return NextResponse.json({ error: 'companyId and action required' }, { status: 400 })
    const db = admin()

    if (action === 'create') {
      const { data, error } = await db.from('notes').insert({
        company_id: companyId, title: body.title || '', body: body.body || '',
        created_by: body.userId || null, created_by_name: body.userName || null,
      }).select().maybeSingle()
      if (error) { if (missing(error.message)) return NextResponse.json({ needsMigration: true }, { status: 200 }); throw error }
      return NextResponse.json({ note: data })
    }

    if (action === 'update') {
      const patch: any = { updated_at: new Date().toISOString() }
      for (const f of ['title', 'body', 'checklist', 'attachments', 'cover_image', 'allow_public_edit']) if (body[f] !== undefined) patch[f] = body[f]
      const { error } = await db.from('notes').update(patch).eq('id', body.id).eq('company_id', companyId)
      if (error && !missing(error.message)) throw error
      return NextResponse.json({ ok: true })
    }

    if (action === 'share') {
      // Ensure a public code, mark public, return the branded URL.
      const { data: note } = await db.from('notes').select('public_code').eq('id', body.id).eq('company_id', companyId).maybeSingle()
      let code = note?.public_code
      if (!code) { code = genCode(); await db.from('notes').update({ public_code: code, is_public: true }).eq('id', body.id).eq('company_id', companyId) }
      else await db.from('notes').update({ is_public: true }).eq('id', body.id).eq('company_id', companyId)
      const { data: company } = await db.from('companies').select('slug').eq('id', companyId).maybeSingle()
      const host = company?.slug ? `${company.slug}.colvy.com` : 'colvy.com'
      return NextResponse.json({ url: `https://${host}/n/${code}`, code })
    }

    if (action === 'unshare') {
      await db.from('notes').update({ is_public: false }).eq('id', body.id).eq('company_id', companyId)
      return NextResponse.json({ ok: true })
    }

    if (action === 'delete') {
      await db.from('notes').delete().eq('id', body.id).eq('company_id', companyId)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
