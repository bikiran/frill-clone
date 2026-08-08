import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET: the media ids the given user has favourited (optionally scoped to a company).
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId')
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    const db = admin()
    let q = db.from('media_favorites').select('media_id').eq('user_id', userId)
    if (companyId) q = q.eq('company_id', companyId)
    const { data, error } = await q
    if (error) return NextResponse.json({ ids: [] })
    return NextResponse.json({ ids: (data || []).map((r: any) => r.media_id) })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST: toggle a favourite for a user. Body: { userId, mediaId, companyId, on }.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, mediaId, companyId } = body
    const on = body.on
    if (!userId || !mediaId) return NextResponse.json({ error: 'Missing userId or mediaId' }, { status: 400 })
    const db = admin()

    if (on === false) {
      await db.from('media_favorites').delete().eq('user_id', userId).eq('media_id', mediaId)
      return NextResponse.json({ ok: true, on: false })
    }

    // Default: add (idempotent via the unique constraint).
    const { error } = await db.from('media_favorites').insert({
      user_id: userId, media_id: mediaId, company_id: companyId || null,
    })
    // Duplicate key just means it was already a favourite — treat as success.
    if (error && !/duplicate|unique/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, on: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
