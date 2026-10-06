import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// The user is whoever the Bearer token says, never a userId from the client —
// that let anyone read or change anyone's favourites.
async function caller(req: NextRequest, db: any): Promise<string | null> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  try { const { data } = await db.auth.getUser(token); return data?.user?.id || null } catch { return null }
}

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
    const companyId = req.nextUrl.searchParams.get('companyId')
    const db = admin()
    const userId = await caller(req, db)
    if (!userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
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
    const { mediaId, companyId } = body
    const on = body.on
    if (!mediaId) return NextResponse.json({ error: 'Missing mediaId' }, { status: 400 })
    const db = admin()
    const userId = await caller(req, db)
    if (!userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

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
