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
    // select * so new columns (comments/edit_log) work even before the client
    // knows about them; unmigrated columns simply won't be present.
    const { data: note } = await db.from('notes').select('*').eq('public_code', code).maybeSingle()
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

const missing = (m?: string) => !!m && /does not exist|schema cache|relation .* does not exist/i.test(m)
const genCode = () => Math.random().toString(36).slice(2, 9)

export async function POST(req: NextRequest) {
  try {
    const { code, action, body, checklist, editor, comment } = await req.json()
    if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })
    const db = admin()
    const { data: note } = await db.from('notes').select('*').eq('public_code', code).maybeSingle()
    if (!note || !note.is_public) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // A shared viewer leaving a comment in the note's discussion thread. Allowed
    // for any public note (not gated on allow_public_edit).
    if (action === 'comment') {
      const list = Array.isArray(note.comments) ? note.comments : []
      const entry = { id: genCode(), name: (comment?.name || 'Guest').slice(0, 80), email: (comment?.email || '').slice(0, 160), body: String(comment?.body || '').slice(0, 4000), at: new Date().toISOString() }
      if (!entry.body.trim()) return NextResponse.json({ error: 'Empty comment' }, { status: 400 })
      const { error } = await db.from('notes').update({ comments: [...list, entry] }).eq('id', note.id)
      if (error && !missing(error.message)) throw error
      return NextResponse.json({ ok: !error, degraded: !!error, comment: entry })
    }

    // A contribution (body/checklist edit). Only when the owner allowed it.
    if (!note.allow_public_edit) return NextResponse.json({ error: 'This note is view-only' }, { status: 403 })
    const patch: any = { updated_at: new Date().toISOString() }
    if (body !== undefined) patch.body = body
    if (checklist !== undefined) patch.checklist = checklist
    // Log who edited (visitor identity) and when.
    if (editor?.name) {
      const log = Array.isArray(note.edit_log) ? note.edit_log : []
      const last = log[log.length - 1]
      const entry = { name: String(editor.name).slice(0, 80), email: String(editor.email || '').slice(0, 160), at: new Date().toISOString() }
      // Collapse rapid repeat edits by the same person (within 2 min) into one.
      if (!(last && last.email === entry.email && last.name === entry.name && Date.now() - new Date(last.at).getTime() < 120000)) patch.edit_log = [...log, entry].slice(-100)
      else { patch.edit_log = [...log.slice(0, -1), entry] }
    }
    let { error } = await db.from('notes').update(patch).eq('id', note.id)
    if (error && missing(error.message)) { delete patch.edit_log; const retry = await db.from('notes').update(patch).eq('id', note.id); error = retry.error }
    if (error && !missing(error.message)) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
