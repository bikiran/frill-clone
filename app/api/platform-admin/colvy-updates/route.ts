import { NextRequest, NextResponse } from 'next/server'
import { adminDb, superAdmin, isMissing } from '../_lib/super-admin'
import { logSuperAdminAudit } from '@/lib/super-admin-audit'
import { safeLink } from '@/lib/colvy-chat-core'

export const dynamic = 'force-dynamic'

// Super admin → Colvy chat updates: the posts that appear in everyone's
// Colvy chat (lib/colvy-chat). A published update shows in every chat at
// once (they're read when a chat opens, not copied), so publishing is the
// moment it goes out; a draft is seen only here.
//
// GET   every update, newest first, drafts included
// POST  { action: 'create', title, body, linkUrl?, linkLabel?, publish? }
//       { action: 'update', id, title?, body?, linkUrl?, linkLabel?, publish? }
//       { action: 'delete', id }
// Every write is audit-logged (super_admin_audit).

function clean(body: any) {
  const out: Record<string, any> = {}
  if ('title' in body) out.title = String(body.title || '').trim().slice(0, 120)
  if ('body' in body) out.body = String(body.body || '').trim().slice(0, 4000)
  if ('linkUrl' in body || 'linkLabel' in body) {
    const link = safeLink(body.linkUrl, body.linkLabel)
    out.link_url = link?.url || null
    out.link_label = link ? link.label : null
  }
  return out
}

export async function GET(req: NextRequest) {
  const db = adminDb()
  if (!(await superAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const { data, error } = await db.from('colvy_updates').select('*').order('created_at', { ascending: false }).limit(200)
  if (error) return isMissing(error)
    ? NextResponse.json({ updates: [], missing: true })
    : NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ updates: data || [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const db = adminDb()
  const me = await superAdmin(req, db)
  if (!me) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const audit = (action: string, summary: string, detail: any) =>
    logSuperAdminAudit(db, { adminId: me.id, adminEmail: me.email, action: `colvy_update.${action}`, summary, detail })

  if (body.action === 'create') {
    const row = clean(body)
    if (!row.title) return NextResponse.json({ error: 'Give the update a title.' }, { status: 400 })
    if (body.linkUrl && !row.link_url) return NextResponse.json({ error: 'The link must start with https:// or be a page in Colvy (like /admin/billing).' }, { status: 400 })
    const now = new Date().toISOString()
    const { data, error } = await db.from('colvy_updates').insert({ ...row, body: row.body || '', created_by: me.id, published_at: body.publish ? now : null }).select('*').maybeSingle()
    if (error) return NextResponse.json({ error: isMissing(error) ? 'Run migrations/COLVY_V420_COLVY_CHAT.sql first.' : error.message }, { status: 500 })
    await audit(body.publish ? 'publish' : 'draft', `${body.publish ? 'Published' : 'Drafted'} Colvy update: ${data.title}`, { id: data.id })
    return NextResponse.json({ ok: true, update: data })
  }

  if (body.action === 'update') {
    const id = String(body.id || '')
    const { data: before } = await db.from('colvy_updates').select('*').eq('id', id).maybeSingle()
    if (!before) return NextResponse.json({ error: 'That update is gone.' }, { status: 404 })
    const patch: Record<string, any> = { ...clean(body), updated_at: new Date().toISOString() }
    if ('title' in patch && !patch.title) return NextResponse.json({ error: 'Give the update a title.' }, { status: 400 })
    if (body.linkUrl && !patch.link_url) return NextResponse.json({ error: 'The link must start with https:// or be a page in Colvy (like /admin/billing).' }, { status: 400 })
    // Publishing stamps the time it goes out; unpublishing takes it back out of every chat.
    if (body.publish === true && !before.published_at) patch.published_at = new Date().toISOString()
    if (body.publish === false) patch.published_at = null
    const { data, error } = await db.from('colvy_updates').update(patch).eq('id', id).select('*').maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const verb = !before.published_at && data.published_at ? 'publish' : before.published_at && !data.published_at ? 'unpublish' : 'edit'
    await audit(verb, `${verb === 'publish' ? 'Published' : verb === 'unpublish' ? 'Unpublished' : 'Edited'} Colvy update: ${data.title}`, { id })
    return NextResponse.json({ ok: true, update: data })
  }

  if (body.action === 'delete') {
    const id = String(body.id || '')
    const { data: before } = await db.from('colvy_updates').select('title').eq('id', id).maybeSingle()
    const { error } = await db.from('colvy_updates').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await audit('delete', `Deleted Colvy update: ${before?.title || id}`, { id })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
