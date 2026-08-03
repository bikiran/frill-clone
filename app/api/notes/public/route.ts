import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Public read + (optional) contributor edit for a shared note, by its code.
// Editing is only honoured when the note owner enabled allow_public_edit.
const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })
  try {
    const db = admin()
    const { data: note } = await db.from('notes')
      .select('id, company_id, title, body, checklist, attachments, cover_image, allow_public_edit, is_public, updated_at')
      .eq('public_code', code).maybeSingle()
    if (!note || !note.is_public) return NextResponse.json({ note: null }, { status: 404 })
    let company: any = null
    if (note.company_id) {
      const { data } = await db.from('companies').select('name, logo_url, accent_color').eq('id', note.company_id).maybeSingle()
      company = data
    }
    return NextResponse.json({ note, company })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { code, body, checklist } = await req.json()
    if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })
    const db = admin()
    const { data: note } = await db.from('notes').select('id, allow_public_edit, is_public').eq('public_code', code).maybeSingle()
    if (!note || !note.is_public) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!note.allow_public_edit) return NextResponse.json({ error: 'This note is view-only' }, { status: 403 })
    const patch: any = { updated_at: new Date().toISOString() }
    if (body !== undefined) patch.body = body
    if (checklist !== undefined) patch.checklist = checklist
    await db.from('notes').update(patch).eq('id', note.id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
