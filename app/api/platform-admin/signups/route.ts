import { NextRequest, NextResponse } from 'next/server'
import { adminDb, superAdmin } from '../_lib/super-admin'
import { logSuperAdminAudit } from '@/lib/super-admin-audit'
import { sendCustomerEmail } from '@/lib/customer-email'
import {
  TABLE, listSignups, presentSignup, recordSignupEvent, syncSignupContact, removeSignupContact, colvyWorkspace, cleanEmail,
  type ListFilter, type ListRange,
} from '@/lib/signup-attempts'

export const dynamic = 'force-dynamic'

/**
 * Super admin → Signups. Platform super admin only (service role behind it).
 *
 * GET  ?filter=all|abandoned|suspicious|completed|spam&range=today|7d|30d|all&q=
 *      → { rows, counts, source: 'attempts' | 'legacy', workspace }
 * POST { action: 'spam' | 'unspam' | 'delete', id }
 *      { action: 'email', id, subject, body }   sent from Colvy's own workspace
 *      (replies land in its inbox); the admin confirms it in the page first.
 * Every action is written to the super admin audit log.
 */
const FILTERS: ListFilter[] = ['all', 'abandoned', 'suspicious', 'completed', 'spam']
const RANGES: ListRange[] = ['today', '7d', '30d', 'all']
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c])

export async function GET(req: NextRequest) {
  const db = adminDb()
  if (!(await superAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  try {
    const sp = req.nextUrl.searchParams
    const filter = (FILTERS as string[]).includes(sp.get('filter') || '') ? sp.get('filter') as ListFilter : 'all'
    const range = (RANGES as string[]).includes(sp.get('range') || '') ? sp.get('range') as ListRange : '30d'
    const out = await listSignups(db, { filter, range, q: sp.get('q') || '' })
    const co = await colvyWorkspace(db)
    return NextResponse.json({ ...out, workspace: co ? { slug: co.slug, name: co.name } : null }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not load sign-ups' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const db = adminDb()
  const who = await superAdmin(req, db)
  if (!who) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const action = String(body?.action || '')
  const id = String(body?.id || '')
  if (!id) return NextResponse.json({ error: 'Which sign-up?' }, { status: 400 })

  // Rows shown from signup_verifications before V390 ran ("legacy:<email>").
  let row: any = null
  if (id.startsWith('legacy:')) {
    const email = cleanEmail(id.slice('legacy:'.length))
    if (!email) return NextResponse.json({ error: 'That sign-up no longer exists.' }, { status: 404 })
    if (action !== 'delete' && action !== 'email') return NextResponse.json({ error: 'Run COLVY_V390_SIGNUP_ATTEMPTS.sql to mark sign-ups as spam.' }, { status: 409 })
    const { data: ver } = await db.from('signup_verifications').select('email, expires_at, consumed_at').eq('email', email).limit(50)
    if (!(ver || []).length) return NextResponse.json({ error: 'That sign-up no longer exists.' }, { status: 404 })
    if (action === 'delete') {
      // Only finished or expired verification rows: one still in progress is
      // someone signing up right now.
      const now = new Date().toISOString()
      const { data: done } = await db.from('signup_verifications').delete().eq('email', email).not('consumed_at', 'is', null).select('id')
      const { data: expired } = await db.from('signup_verifications').delete().eq('email', email).lt('expires_at', now).select('id')
      await logSuperAdminAudit(db, { adminId: who.id, adminEmail: who.email, action: 'signup_deleted', summary: `Deleted the sign-up attempt for ${email}`, detail: { email, legacy: true, rows: (done || []).length + (expired || []).length } })
      return NextResponse.json({ ok: true, deleted: true })
    }
    // Email goes only to the address on the verification rows themselves.
    row = { id, email: String(ver![0].email).toLowerCase(), legacy: true }
  } else {
    const { data, error } = await db.from(TABLE).select('*').eq('id', id).maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    row = data
  }
  if (!row) return NextResponse.json({ error: 'That sign-up no longer exists.' }, { status: 404 })

  if (action === 'spam' || action === 'unspam') {
    const spam = action === 'spam'
    const { error } = await db.from(TABLE).update({ spam_at: spam ? new Date().toISOString() : null, spam_by: spam ? who.email : null }).eq('id', row.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const saved = await recordSignupEvent(db, { type: spam ? 'marked_spam' : 'unmarked_spam', email: row.email, by: who.email })
    if (saved?.contact_id) await syncSignupContact(db, saved)
    await logSuperAdminAudit(db, { adminId: who.id, adminEmail: who.email, action: spam ? 'signup_marked_spam' : 'signup_unmarked_spam', summary: `${spam ? 'Marked' : 'Unmarked'} the sign-up for ${row.email} as spam`, detail: { id: row.id, email: row.email } })
    return NextResponse.json({ ok: true, row: saved ? presentSignup(saved) : null })
  }

  if (action === 'delete') {
    const contact = await removeSignupContact(db, row)
    const { error } = await db.from(TABLE).delete().eq('id', row.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logSuperAdminAudit(db, { adminId: who.id, adminEmail: who.email, action: 'signup_deleted', summary: `Deleted the sign-up attempt for ${row.email}`, detail: { id: row.id, email: row.email, contact } })
    return NextResponse.json({ ok: true, deleted: true, contact })
  }

  if (action === 'email') {
    const subject = String(body?.subject || '').trim().slice(0, 200)
    const text = String(body?.body || '').trim().slice(0, 5000)
    if (!subject || !text) return NextResponse.json({ error: 'Add a subject and a message.' }, { status: 400 })
    if (row.spam_at) return NextResponse.json({ error: 'This sign-up is marked as spam. Unmark it first.' }, { status: 409 })
    const co = await colvyWorkspace(db)
    if (!co) return NextResponse.json({ error: 'Colvy’s own workspace (slug “colvy”) wasn’t found, so there’s nothing to send from. Use “Open in mail app” instead.' }, { status: 400 })
    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.55;color:#0d0d0d;max-width:560px">${text.split(/\n{2,}/).map(p => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}</div>`
    const sent = await sendCustomerEmail(db, co, { to: row.email, subject, text, html })
    if (!sent) return NextResponse.json({ error: 'The email couldn’t be sent. Check RESEND_API_KEY and Colvy’s email settings.' }, { status: 502 })
    if (!row.legacy) await recordSignupEvent(db, { type: 'emailed', email: row.email, by: who.email, detail: subject })
    await logSuperAdminAudit(db, { adminId: who.id, adminEmail: who.email, companyId: co.id, action: 'signup_emailed', summary: `Emailed ${row.email} about their sign-up`, detail: { id: row.id, email: row.email, subject } })
    return NextResponse.json({ ok: true, sent: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
