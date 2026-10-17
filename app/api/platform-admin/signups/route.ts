import { NextRequest, NextResponse } from 'next/server'
import { adminDb, superAdmin } from '../_lib/super-admin'
import { logSuperAdminAudit } from '@/lib/super-admin-audit'
import { sendCustomerEmail } from '@/lib/customer-email'
import {
  TABLE, listSignups, presentSignup, recordSignupEvent, syncSignupContact, removeSignupContact, colvyWorkspace, cleanEmail,
  signupSmsHealth, backfillSignupContacts, leadWorkspaceSetting, setLeadWorkspaceSetting, platformAdminIn, claimRate, globalCapStatus, reconcileDeliveries,
  type ListFilter, type ListRange,
} from '@/lib/signup-attempts'
import { smsConfigured, voiceFallbackReady, smsConfigProblem, smsSender, sendTestSms, messageStatus, signupDeliveryStatus } from '@/lib/signup-sms'
import { normaliseSignupMobile, explainDeliveryError, destinationAllowed } from '@/lib/signup-delivery'

export const dynamic = 'force-dynamic'
// "Add all to CRM" runs 100 sign-ups per request; give each request room.
export const maxDuration = 60

/**
 * Super admin → Signups. Platform super admin only (service role behind it).
 *
 * GET  ?filter=all|abandoned|suspicious|completed|spam&range=today|7d|30d|all&q=
 *      → { rows, counts, source: 'attempts' | 'legacy', workspace, leads, sms }
 *        leads: where sign-up leads go (env / picked / fallback) and what was picked;
 *        sms: sign-up code texts sent vs delivered (24h / 7 days), top error codes,
 *        whether texting and the call fallback are set up.
 * GET  ?companies=<search>  → { companies: [{ id, name, slug }] } for the workspace picker
 * POST { action: 'spam' | 'unspam' | 'delete', id }
 *      { action: 'email', id, subject, body }   sent from Colvy's own workspace
 *      (replies land in its inbox); the admin confirms it in the page first.
 *      { action: 'set_workspace', companyId | null }   "Where should sign-up leads go?"
 *      { action: 'crm_backfill', dryRun }   "Add all to CRM": count first, then run
 *      { action: 'test_sms', phone }   "Send test SMS to me" from the sign-up code sender
 *      (the admin's own mobile; 5 an hour), then { action: 'test_sms_status', sid }
 *      { action: 'sms_reconcile' }   "Check with Twilio": fetch the delivery reports
 *      that never arrived (texts and calls of the last 7 days; 25 a run, 10 runs an hour)
 *      { action: 'crm_add', id }   add or refresh this sign-up's contact in Colvy's CRM
 *      now (also a suspicious one: the admin chose to), then open it
 * Every action is written to the super admin audit log.
 */
const FILTERS: ListFilter[] = ['all', 'abandoned', 'suspicious', 'completed', 'spam']
const RANGES: ListRange[] = ['today', '7d', '30d', 'all']
const senderLabel = (s: { kind: string; value: string } | null) => s ? (s.kind === 'service' ? `Messaging Service ${s.value}` : s.value) : null
// "Send test SMS to me": a few an hour per admin (each one costs money),
// counted by signup_rate_claim so every server shares the count.
const TEST_SMS_PER_HOUR = 5
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c])

export async function GET(req: NextRequest) {
  const db = adminDb()
  const who = await superAdmin(req, db)
  if (!who) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  try {
    const sp = req.nextUrl.searchParams
    if (sp.has('companies')) {
      // Names and slugs only. % and _ are LIKE wildcards; commas and brackets
      // would break the or() filter.
      const term = String(sp.get('companies') || '').trim().replace(/[%_\\,()*]/g, ' ').trim().slice(0, 60)
      let q = db.from('companies').select('id, name, slug').order('name', { ascending: true }).limit(20)
      if (term) q = q.or(`name.ilike.%${term}%,slug.ilike.%${term}%`)
      const { data, error } = await q
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      // Which of them the platform admin belongs to (owner or joined staff):
      // only those can receive sign-up leads.
      const list: any[] = data || []
      const ids = list.map(c => c.id)
      const { data: mine } = ids.length ? await db.from('team_members').select('company_id, role, status').in('company_id', ids).eq('user_id', who.id) : { data: [] }
      const staff = new Set((mine || []).filter((m: any) => String(m.role || '').toLowerCase() !== 'viewer' && !/^(removed|invited|pending)$/i.test(String(m.status || ''))).map((m: any) => m.company_id))
      const { data: owners } = ids.length ? await db.from('companies').select('id, owner_id').in('id', ids) : { data: [] }
      const owned = new Set((owners || []).filter((c: any) => c.owner_id === who.id).map((c: any) => c.id))
      return NextResponse.json({ companies: list.map(c => ({ id: c.id, name: c.name, slug: c.slug, eligible: owned.has(c.id) || staff.has(c.id) })) }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const filter = (FILTERS as string[]).includes(sp.get('filter') || '') ? sp.get('filter') as ListFilter : 'all'
    const range = (RANGES as string[]).includes(sp.get('range') || '') ? sp.get('range') as ListRange : '30d'
    const [out, co, picked, health] = await Promise.all([
      listSignups(db, { filter, range, q: sp.get('q') || '' }),
      colvyWorkspace(db), leadWorkspaceSetting(db), signupSmsHealth(db),
    ])
    return NextResponse.json({
      ...out,
      workspace: co ? { id: co.id, slug: co.slug, name: co.name, source: co.source } : null,
      leads: { envPinned: !!(process.env.COLVY_WORKSPACE_ID || '').trim(), picked },
      sms: { ...health, configured: smsConfigured(), voiceFallback: voiceFallbackReady(), problem: smsConfigProblem(), sender: senderLabel(smsSender()) },
    }, { headers: { 'Cache-Control': 'no-store' } })
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

  if (action === 'set_workspace') {
    const companyId = body?.companyId ? String(body.companyId) : null
    let co: any = null
    if (companyId) {
      const { data } = await db.from('companies').select('id, name, slug, owner_id').eq('id', companyId).maybeSingle()
      if (!data) return NextResponse.json({ error: 'That company wasn’t found.' }, { status: 404 })
      // Leads are personal details: only a workspace the platform admin owns
      // or is staff in (not someone else's business).
      if (!(await platformAdminIn(db, data))) return NextResponse.json({ error: `You’re not the owner or a team member of ${data.name}, so sign-up leads can’t go there. Add ${who.email} to its team first.`, code: 'not_member' }, { status: 409 })
      co = data
    }
    const saved = await setLeadWorkspaceSetting(db, companyId, who.email)
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 500 })
    await logSuperAdminAudit(db, { adminId: who.id, adminEmail: who.email, companyId: companyId || undefined, action: 'signup_lead_workspace_set', summary: co ? `Sign-up leads now go to ${co.name}` : 'Cleared the sign-up lead workspace', detail: { companyId } })
    const now = await colvyWorkspace(db)
    return NextResponse.json({ ok: true, workspace: now ? { id: now.id, slug: now.slug, name: now.name, source: now.source } : null, envPinned: !!(process.env.COLVY_WORKSPACE_ID || '').trim() })
  }

  if (action === 'test_sms') {
    // Your own Australian mobile, typed twice (a typo would text a stranger).
    const m = normaliseSignupMobile(String(body?.phone || ''))
    if (!m.ok) return NextResponse.json({ error: m.error }, { status: 400 })
    const again = normaliseSignupMobile(String(body?.confirm || ''))
    if (!again.ok || again.e164 !== m.e164) return NextResponse.json({ error: 'The two numbers don’t match. Type your mobile twice.' }, { status: 400 })
    if (!destinationAllowed(m.e164, ['AU']).ok) return NextResponse.json({ error: 'Test texts go to Australian mobiles only.' }, { status: 400 })
    const rate = await claimRate(db, [`testsms:${who.id}`], [TEST_SMS_PER_HOUR], 3600)
    if (rate.over) return NextResponse.json({ error: 'That’s 5 test texts this hour. Try again later.' }, { status: 429 })
    const r = await sendTestSms(m.e164)
    await logSuperAdminAudit(db, { adminId: who.id, adminEmail: who.email, action: 'signup_test_sms', summary: `Sent a test sign-up SMS to ${m.e164}`, detail: { ok: r.ok, sid: r.sid || null, code: r.code || null, sender: r.sender || null } })
    if (!r.ok) {
      const e = explainDeliveryError(r.code, r.message)
      return NextResponse.json({ ok: false, error: `Not sent — ${e.label}. ${e.explain}`, code: r.code, sender: r.sender || null }, { status: 502 })
    }
    return NextResponse.json({ ok: true, sid: r.sid, to: m.e164, sender: r.sender })
  }

  if (action === 'test_sms_status') {
    const sid = String(body?.sid || '')
    if (!/^(SM|MM)[0-9a-f]{32}$/i.test(sid)) return NextResponse.json({ error: 'Which message?' }, { status: 400 })
    const st = await messageStatus(sid)
    if (!st) return NextResponse.json({ error: 'Couldn’t read the message from Twilio.' }, { status: 502 })
    const e = st.errorCode ? explainDeliveryError(st.errorCode, st.errorMessage) : null
    return NextResponse.json({ ok: true, status: st.status, errorCode: st.errorCode, label: e ? e.label : null, explain: e ? e.explain : null })
  }

  if (action === 'sms_reconcile') {
    const rate = await claimRate(db, [`smsreconcile:${who.id}`], [10], 3600)
    if (rate.over) return NextResponse.json({ error: 'That’s 10 checks this hour. Try again later.' }, { status: 429 })
    const out = await reconcileDeliveries(db, signupDeliveryStatus)
    if (!out.ok) return NextResponse.json({ error: out.missing ? 'Run COLVY_V390_SIGNUP_ATTEMPTS.sql first.' : 'Couldn’t check with Twilio.', ...out }, { status: out.missing ? 409 : 500 })
    await logSuperAdminAudit(db, { adminId: who.id, adminEmail: who.email, action: 'signup_sms_reconcile', summary: `Checked ${out.checked} sign-up code${out.checked === 1 ? '' : 's'} with Twilio`, detail: out })
    const health = await signupSmsHealth(db)
    return NextResponse.json({ ...out, sms: { ...health, configured: smsConfigured(), voiceFallback: voiceFallbackReady(), problem: smsConfigProblem(), sender: senderLabel(smsSender()) } })
  }

  if (action === 'crm_backfill') {
    const dryRun = body?.dryRun !== false
    const offset = Math.max(0, Math.floor(Number(body?.offset) || 0))
    const out = await backfillSignupContacts(db, { dryRun, offset })
    if (!out.ok) return NextResponse.json({ error: out.error, ...out }, { status: 409 })
    if (!dryRun && out.done) await logSuperAdminAudit(db, { adminId: who.id, adminEmail: who.email, companyId: out.workspace?.id, action: 'signup_crm_backfill', summary: `Added existing sign-ups to ${out.workspace?.name}’s CRM`, detail: { last_batch: true, offset, added: out.added, refreshed: out.refreshed, skipped: out.skipped, skippedSpam: out.skippedSpam, skippedSuspicious: out.skippedSuspicious } })
    return NextResponse.json(out)
  }

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

  if (action === 'crm_add') {
    if (row.legacy) return NextResponse.json({ error: 'Run COLVY_V390_SIGNUP_ATTEMPTS.sql to add sign-ups to the CRM.' }, { status: 409 })
    if (row.spam_at) return NextResponse.json({ error: 'This sign-up is marked as spam. Unmark it first.' }, { status: 409 })
    const co = await colvyWorkspace(db)
    if (!co) return NextResponse.json({ error: 'No workspace is set for sign-up leads. Choose one on the Signups page first.' }, { status: 400 })
    const contactId = await syncSignupContact(db, row, { force: true })
    if (!contactId) return NextResponse.json({ error: 'They couldn’t be added: a customer in the CRM already has this email, and it isn’t verified yet.' }, { status: 409 })
    if (contactId !== row.contact_id) await db.from(TABLE).update({ contact_id: contactId, contact_synced_at: new Date().toISOString() }).eq('id', row.id)
    if (!row.contact_id) await logSuperAdminAudit(db, { adminId: who.id, adminEmail: who.email, companyId: co.id, action: 'signup_crm_added', summary: `Added ${row.email} to ${co.name}’s CRM`, detail: { id: row.id, contactId } })
    return NextResponse.json({ ok: true, contactId, workspace: { id: co.id, slug: co.slug, name: co.name } })
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
    if (!co) return NextResponse.json({ error: 'No workspace is set for sign-up leads, so there’s nothing to send from. Choose one on the Signups page, or use “Open in mail app”.' }, { status: 400 })
    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.55;color:#0d0d0d;max-width:560px">${text.split(/\n{2,}/).map(p => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}</div>`
    const sent = await sendCustomerEmail(db, co, { to: row.email, subject, text, html })
    if (!sent) return NextResponse.json({ error: 'The email couldn’t be sent. Check RESEND_API_KEY and Colvy’s email settings.' }, { status: 502 })
    if (!row.legacy) await recordSignupEvent(db, { type: 'emailed', email: row.email, by: who.email, detail: subject })
    await logSuperAdminAudit(db, { adminId: who.id, adminEmail: who.email, companyId: co.id, action: 'signup_emailed', summary: `Emailed ${row.email} about their sign-up`, detail: { id: row.id, email: row.email, subject } })
    return NextResponse.json({ ok: true, sent: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
