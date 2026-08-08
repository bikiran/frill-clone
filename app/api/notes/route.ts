import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { broadcast } from '@/lib/realtime-broadcast'

export const dynamic = 'force-dynamic'

// Nudge every open Notes view (web + mobile) for this company to refetch. Sent
// on any change; the client that made it ignores its own echo via `by`.
function nudge(companyId: string, id: string | null, action: string, by?: string | null) {
  void broadcast(`notes:${companyId}`, 'changed', { id: id || null, action, by: by || null })
}

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
  const userId = req.nextUrl.searchParams.get('userId')
  // A note is visible to a user if they created it, or its owner shared it with
  // the team. (No userId → return all, for backward compatibility.)
  const visible = (n: any) => !userId || n.created_by === userId || n.shared_with_team || (Array.isArray(n.shared_members) && n.shared_members.some((m: any) => m?.id === userId))
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  try {
    const db = admin()
    if (id) {
      const { data, error } = await db.from('notes').select('*').eq('id', id).eq('company_id', companyId).maybeSingle()
      if (error) { if (missing(error.message)) return NextResponse.json({ note: null, needsMigration: true }); throw error }
      if (data && !visible(data)) return NextResponse.json({ note: null }, { status: 403 })
      return NextResponse.json({ note: data })
    }
    // Select * so a not-yet-migrated column never breaks the list; trash
    // filtering, user scoping, and ordering are done in JS for the same reason.
    const { data, error } = await db.from('notes').select('*').eq('company_id', companyId).limit(500)
    if (error) { if (missing(error.message)) return NextResponse.json({ notes: [], needsMigration: true }); throw error }
    const wantTrashed = req.nextUrl.searchParams.get('trashed') === '1'
    const rows = (data || []).filter((n: any) => (wantTrashed ? !!n.trashed_at : !n.trashed_at) && visible(n))
    rows.sort((a: any, b: any) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()))
    return NextResponse.json({ notes: rows })
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
      nudge(companyId, data?.id || null, 'create', body.userId)
      return NextResponse.json({ note: data })
    }

    if (action === 'update') {
      const patch: any = { updated_at: new Date().toISOString() }
      for (const f of ['title', 'body', 'checklist', 'attachments', 'cover_image', 'allow_public_edit', 'tags', 'reminder_at', 'pinned', 'shared_with_team', 'shared_members', 'comments', 'linked_tasks']) if (body[f] !== undefined) patch[f] = body[f]
      let { error } = await db.from('notes').update(patch).eq('id', body.id).eq('company_id', companyId)
      // If a newer column (V234–V240) isn't migrated yet, drop those keys and
      // retry so the core fields still save.
      if (error && missing(error.message)) {
        for (const f of ['tags', 'reminder_at', 'pinned', 'shared_with_team', 'shared_members', 'comments', 'linked_tasks']) delete patch[f]
        const retry = await db.from('notes').update(patch).eq('id', body.id).eq('company_id', companyId)
        error = retry.error
      }
      if (error && !missing(error.message)) throw error
      nudge(companyId, body.id, 'update', body.userId)
      return NextResponse.json({ ok: true })
    }

    if (action === 'trash' || action === 'restore') {
      const { error } = await db.from('notes').update({ trashed_at: action === 'trash' ? new Date().toISOString() : null }).eq('id', body.id).eq('company_id', companyId)
      if (error && !missing(error.message)) throw error
      nudge(companyId, body.id, action, body.userId)
      return NextResponse.json({ ok: true, degraded: !!error })
    }

    if (action === 'duplicate') {
      const { data: src } = await db.from('notes').select('*').eq('id', body.id).eq('company_id', companyId).maybeSingle()
      if (!src) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const copy: any = {
        company_id: companyId, title: `${src.title || 'Untitled'} (copy)`, body: src.body,
        checklist: src.checklist, attachments: src.attachments, cover_image: src.cover_image,
        created_by: body.userId || src.created_by, created_by_name: body.userName || src.created_by_name,
      }
      if (src.tags !== undefined) copy.tags = src.tags
      let { data, error } = await db.from('notes').insert(copy).select().maybeSingle()
      if (error && missing(error.message)) { delete copy.tags; const retry = await db.from('notes').insert(copy).select().maybeSingle(); data = retry.data; error = retry.error }
      if (error) throw error
      nudge(companyId, data?.id || null, 'duplicate', body.userId)
      return NextResponse.json({ note: data })
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

    if (action === 'comment') {
      // Append a comment (owner/teammate side). Atomic-ish read-modify-write.
      const { data: note } = await db.from('notes').select('comments').eq('id', body.id).eq('company_id', companyId).maybeSingle()
      const list = Array.isArray(note?.comments) ? note!.comments : []
      const entry = { id: genCode(), name: body.name || 'Someone', email: body.email || '', body: String(body.body || '').slice(0, 4000), at: new Date().toISOString() }
      const { error } = await db.from('notes').update({ comments: [...list, entry] }).eq('id', body.id).eq('company_id', companyId)
      if (error && !missing(error.message)) throw error
      nudge(companyId, body.id, 'comment', body.userId)
      return NextResponse.json({ ok: !error, degraded: !!error, comment: entry })
    }

    if (action === 'delete') {
      await db.from('notes').delete().eq('id', body.id).eq('company_id', companyId)
      nudge(companyId, body.id, 'delete', body.userId)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
