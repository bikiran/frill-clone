import { NextRequest, NextResponse } from 'next/server'
import { adminDb, superAdmin, companyNames } from '../_lib/super-admin'
import { logSuperAdminAudit } from '@/lib/super-admin-audit'
import { toE164 } from '@/lib/phone'
import { companyFlagEnabled } from '@/lib/feature-flags'
import { companyHasFeature } from '@/lib/plan'
import { platformTwilioConfigured } from '@/lib/twilio-platform'
import { readSender, listTemplates, sendWhatsApp, isMissing, V402_MESSAGE, WHATSAPP_FLAG } from '@/lib/whatsapp'
import {
  E164_RE, SENDER_SID_RE, CONTENT_SID_RE, TEMPLATE_NAME_RE, LANGUAGE_RE, SENDER_STATUS_LABEL,
  isSenderStatus, templateBodyProblems, TEMPLATE_CATEGORIES, TEMPLATE_STATUSES, type TemplateCategory, type TemplateStatus,
} from '@/lib/whatsapp-core'

export const dynamic = 'force-dynamic'

// Super admin → WhatsApp (lib/whatsapp). Registration happens in Colvy's
// Twilio console / Meta Business Manager; this records the result.
//   GET                       every business with a WhatsApp row (requests
//                             first), and this month's usage per business.
//   GET ?companyId=           one business: sender, templates, usage, switch
//                             and plan.
//   POST { companyId, action: 'sender', phoneNumber, displayName, status,
//          twilioSenderSid, wabaId, note }               save the sender
//   POST { companyId, action: 'template', template: { id?, name, language,
//          category, body, contentSid, status, variableLabels, rejectionReason } }
//   POST { companyId, action: 'delete_template', templateId }
//   POST { companyId, action: 'test', to, text? | templateId + variables }
// Every change is written to the audit log. Before V402 runs, GET answers
// ready:false and POST 409.

const isUuid = (v: any) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)
const clip = (v: any, n: number) => String(v ?? '').trim().slice(0, n)

function monthStart(): string {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString()
}

type Usage = { inbound: number; session: number; template: Record<string, number>; delivered: number; read: number; failed: number; tests: number }
const emptyUsage = (): Usage => ({ inbound: 0, session: 0, template: { utility: 0, marketing: 0, authentication: 0 }, delivered: 0, read: 0, failed: 0, tests: 0 })

/** This month's WhatsApp messages per business, for usage reporting (and billing, once priced). */
async function usageSince(db: any, since: string, companyId?: string): Promise<{ ready: boolean; by: Record<string, Usage> }> {
  const by: Record<string, Usage> = {}
  try {
    for (let from = 0; from < 100000; from += 1000) {
      let q = db.from('whatsapp_messages').select('company_id, direction, kind, template_category, status, is_test').gte('created_at', since)
      if (companyId) q = q.eq('company_id', companyId)
      const { data, error } = await q.order('created_at', { ascending: true }).range(from, from + 999)
      if (error) return { ready: !isMissing(error), by }
      for (const r of data || []) {
        const u = (by[r.company_id] ||= emptyUsage())
        if (r.is_test) { u.tests++; continue }
        if (r.direction === 'inbound') { u.inbound++; continue }
        if (r.kind === 'template') u.template[r.template_category || 'utility'] = (u.template[r.template_category || 'utility'] || 0) + 1
        else u.session++
        if (r.status === 'delivered') u.delivered++
        if (r.status === 'read') { u.read++; u.delivered++ }
        if (r.status === 'failed' || r.status === 'undelivered') u.failed++
      }
      if (!data || data.length < 1000) break
    }
    return { ready: true, by }
  } catch (e) { return { ready: !isMissing(e), by } }
}

export async function GET(req: NextRequest) {
  const db = adminDb()
  if (!(await superAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const since = monthStart()
  const companyId = req.nextUrl.searchParams.get('companyId')
  if (companyId) {
    if (!isUuid(companyId)) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const [s, tpl, usage, flag, plan, co, numbers] = await Promise.all([
      readSender(db, companyId), listTemplates(db, companyId), usageSince(db, since, companyId),
      companyFlagEnabled(db, companyId, WHATSAPP_FLAG), companyHasFeature(db, companyId, 'channels'),
      db.from('companies').select('id, name, slug').eq('id', companyId).maybeSingle().then((r: any) => r?.data || null, () => null),
      db.from('phone_numbers').select('phone_number').eq('company_id', companyId).limit(20).then((r: any) => (r?.data || []).map((x: any) => toE164(x.phone_number)).filter(Boolean), () => []),
    ])
    if (!co) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    return NextResponse.json({
      ready: s.ready, company: co, sender: s.row, templates: tpl.rows, usage: usage.by[companyId] || emptyUsage(), since,
      flagOn: flag, planOk: plan, platformReady: platformTwilioConfigured(), numbers,
      webhookUrl: `${(process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').replace(/\/$/, '')}/api/twilio/whatsapp`,
    })
  }
  try {
    const { data, error } = await db.from('whatsapp_senders').select('*').order('updated_at', { ascending: false }).limit(1000)
    if (error) return NextResponse.json({ ready: !isMissing(error), senders: [], usage: {}, since })
    const rows = (data || []).filter((r: any) => r.status !== 'not_requested')
    const [names, usage] = await Promise.all([companyNames(db, rows.map((r: any) => r.company_id)), usageSince(db, since)])
    const order: Record<string, number> = { pending: 0, approved: 1, rejected: 2, disabled: 3 }
    rows.sort((a: any, b: any) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || String(b.requested_at || '').localeCompare(String(a.requested_at || '')))
    return NextResponse.json({
      ready: true, since, platformReady: platformTwilioConfigured(),
      senders: rows.map((r: any) => ({ ...r, company: names[r.company_id] || null })), usage: usage.by,
    })
  } catch (e: any) {
    return NextResponse.json({ ready: !isMissing(e), senders: [], usage: {}, since })
  }
}

export async function POST(req: NextRequest) {
  const db = adminDb()
  const me = await superAdmin(req, db)
  if (!me) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  try {
    const body = await req.json().catch(() => ({}))
    const companyId = String(body.companyId || '')
    if (!isUuid(companyId)) return NextResponse.json({ error: 'Choose a company.' }, { status: 400 })
    const { data: co } = await db.from('companies').select('id, name').eq('id', companyId).maybeSingle()
    if (!co) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    const s = await readSender(db, companyId)
    if (!s.ready) return NextResponse.json({ error: V402_MESSAGE, missing: true }, { status: 409 })
    const now = new Date().toISOString()
    const action = String(body.action || '')

    // ── The sender ──────────────────────────────────────────────────────────
    if (action === 'sender') {
      const status = String(body.status || '')
      if (!isSenderStatus(status)) return NextResponse.json({ error: 'Choose a status.' }, { status: 400 })
      const phone = body.phoneNumber ? toE164(String(body.phoneNumber)) : ''
      if (phone && !E164_RE.test(phone)) return NextResponse.json({ error: 'Enter the WhatsApp number in international form, e.g. +61412345678.' }, { status: 400 })
      const sid = clip(body.twilioSenderSid, 40)
      if (sid && !SENDER_SID_RE.test(sid)) return NextResponse.json({ error: 'That doesn’t look like a Twilio sender SID (two letters and 32 hex characters, e.g. XE…).' }, { status: 400 })
      const displayName = clip(body.displayName, 80)
      if (status === 'approved' && (!phone || !displayName)) return NextResponse.json({ error: 'An approved sender needs its WhatsApp number and display name.' }, { status: 400 })
      if (status === 'approved' && phone) {
        const { data: taken } = await db.from('whatsapp_senders').select('company_id').eq('phone_number', phone).eq('status', 'approved').neq('company_id', companyId).limit(1)
        if (taken?.length) return NextResponse.json({ error: 'That number is already the approved WhatsApp sender of another business.' }, { status: 409 })
      }
      const row = {
        company_id: companyId, status, phone_number: phone || null, display_name: displayName || null,
        twilio_sender_sid: sid || null, waba_id: clip(body.wabaId, 40) || null, admin_note: clip(body.note, 500) || null,
        updated_by: me.email, updated_at: now,
        ...(status === 'approved' && s.row?.status !== 'approved' ? { approved_at: now } : {}),
      }
      const { error } = await db.from('whatsapp_senders').upsert(row, { onConflict: 'company_id' })
      if (error) return NextResponse.json({ error: /duplicate|unique/i.test(error.message) ? 'That number is already the approved WhatsApp sender of another business.' : error.message }, { status: 500 })
      await logSuperAdminAudit(db, {
        adminId: me.id, adminEmail: me.email, companyId, action: 'whatsapp_sender',
        summary: `WhatsApp for ${co.name || companyId}: ${SENDER_STATUS_LABEL[status]}${phone ? ` (${phone})` : ''}${row.admin_note ? `. Note: ${row.admin_note}` : ''}`,
        detail: { before: s.row, after: row },
      })
      return NextResponse.json({ ok: true, sender: (await readSender(db, companyId)).row })
    }

    // ── Templates ───────────────────────────────────────────────────────────
    if (action === 'template') {
      const t = body.template || {}
      const name = clip(t.name, 512).toLowerCase()
      if (!TEMPLATE_NAME_RE.test(name)) return NextResponse.json({ error: 'Template names are lowercase letters, numbers and underscores (as in Meta), e.g. order_update.' }, { status: 400 })
      const language = clip(t.language || 'en', 10)
      if (!LANGUAGE_RE.test(language)) return NextResponse.json({ error: 'Language is a code such as en or en_AU.' }, { status: 400 })
      const category = String(t.category || '') as TemplateCategory
      if (!TEMPLATE_CATEGORIES.includes(category)) return NextResponse.json({ error: 'Choose a category.' }, { status: 400 })
      const status = String(t.status || 'pending') as TemplateStatus
      if (!TEMPLATE_STATUSES.includes(status)) return NextResponse.json({ error: 'Choose a status.' }, { status: 400 })
      const bodyText = String(t.body || '').trim()
      const problems = templateBodyProblems(bodyText)
      if (problems.length) return NextResponse.json({ error: problems.join(' ') }, { status: 400 })
      const contentSid = clip(t.contentSid, 40)
      if (!CONTENT_SID_RE.test(contentSid)) return NextResponse.json({ error: 'Paste the template’s Content SID from Twilio’s Content Template Builder (HX followed by 32 characters).' }, { status: 400 })
      const labels = (Array.isArray(t.variableLabels) ? t.variableLabels : []).map((l: any) => clip(l, 60)).slice(0, 20)
      const row: any = {
        company_id: companyId, name, language, category, body: bodyText, content_sid: contentSid, status,
        variable_labels: labels, rejection_reason: clip(t.rejectionReason, 500) || null, updated_by: me.email, updated_at: now,
      }
      let saved: any = null
      if (t.id) {
        if (!isUuid(t.id)) return NextResponse.json({ error: 'Unknown template.' }, { status: 400 })
        const { data, error } = await db.from('whatsapp_templates').update(row).eq('id', t.id).eq('company_id', companyId).select().maybeSingle()
        if (error) return NextResponse.json({ error: /duplicate|unique/i.test(error.message) ? 'This business already has a template with that name and language, or that Content SID.' : error.message }, { status: 409 })
        saved = data
      } else {
        const { data, error } = await db.from('whatsapp_templates').insert(row).select().maybeSingle()
        if (error) return NextResponse.json({ error: /duplicate|unique/i.test(error.message) ? 'This business already has a template with that name and language, or that Content SID.' : error.message }, { status: 409 })
        saved = data
      }
      if (!saved) return NextResponse.json({ error: 'Template not found.' }, { status: 404 })
      await logSuperAdminAudit(db, {
        adminId: me.id, adminEmail: me.email, companyId, action: 'whatsapp_template',
        summary: `WhatsApp template ${name} (${language}, ${category}) for ${co.name || companyId}: ${status}`,
        detail: { template: saved },
      })
      return NextResponse.json({ ok: true, template: saved })
    }

    if (action === 'delete_template') {
      if (!isUuid(body.templateId)) return NextResponse.json({ error: 'Unknown template.' }, { status: 400 })
      const { data, error } = await db.from('whatsapp_templates').delete().eq('id', body.templateId).eq('company_id', companyId).select('id, name')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data?.length) return NextResponse.json({ error: 'Template not found.' }, { status: 404 })
      await logSuperAdminAudit(db, { adminId: me.id, adminEmail: me.email, companyId, action: 'whatsapp_template_delete', summary: `Deleted WhatsApp template ${data[0].name} for ${co.name || companyId}`, detail: { id: body.templateId } })
      return NextResponse.json({ ok: true })
    }

    // ── Test send ───────────────────────────────────────────────────────────
    if (action === 'test') {
      const to = toE164(String(body.to || ''))
      if (!E164_RE.test(to)) return NextResponse.json({ error: 'Enter the number to send the test to, e.g. +61412345678.' }, { status: 400 })
      const r = await sendWhatsApp(db, {
        companyId, to, text: typeof body.text === 'string' ? body.text : '',
        templateId: isUuid(body.templateId) ? body.templateId : null, variables: body.variables || null,
        senderName: 'Colvy test', sentBy: me.email, isTest: true,
      })
      await logSuperAdminAudit(db, {
        adminId: me.id, adminEmail: me.email, companyId, action: 'whatsapp_test',
        summary: `WhatsApp test for ${co.name || companyId} to ${to}: ${r.ok ? 'sent' : `refused (${r.error})`}`,
        detail: r.ok ? { sids: r.sids, kind: r.kind } : { reason: r.reason, code: (r as any).code || null },
      })
      if (!r.ok) return NextResponse.json({ error: r.error, reason: r.reason }, { status: r.status })
      return NextResponse.json({ ok: true, sid: r.sid, text: r.text })
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
