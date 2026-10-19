// The server side of number porting requests (lib/number-porting has the
// rules). Tables from COLVY_V403_NUMBER_PORTING.sql:
//
//   porting_requests        one per request; status, the account details, the
//                           signed authority, fees, billing, attached numbers
//   porting_request_files   the bill (and any later documents): metadata here,
//                           the file in the PRIVATE storage bucket below
//   porting_request_events  every status change and note; `internal` notes are
//                           the Colvy team's own and never shown to the business
//
// Every write is here, with the service role, behind routes that check the
// caller (requireCompanyAdmin for the business, the platform admin for the
// queue). Until V403 runs, reads say `unavailable` and writes are refused with
// a plain message.
//
// Files live in the private `porting-documents` bucket (created on first use)
// and are only ever handed out as short-lived signed links: a phone bill
// carries a home address and account numbers.

import { colvyEmail } from '@/lib/colvy-email'
import { notifyCompany } from '@/lib/notify'
import {
  canTransition, canAttach, businessCanCancel, isOpenPort, loaText, LOA_VERSION, portFeeAud, formatAuNumber,
  PORT_STATUS_LABEL, PORT_STATUS_HELP, PORT_TIMELINE, KEEP_SERVICE, type PortStatus, type PortRequestValue,
} from '@/lib/number-porting'
import { monthlyPriceAud, numberKindOf } from '@/lib/number-types'
import { numberWebhooks, recordPlatformNumber } from '@/lib/platform-number'

export const PORT_BUCKET = 'porting-documents'
export const SIGNED_URL_SECONDS = 600
export const MIGRATION_NEEDED = 'Number porting needs a quick database update before requests can be sent. The Colvy team has been told; please try again soon.'

const SUPER_ADMIN = 'bishalstha76@gmail.com'

/** PostgREST's answers for a table that isn't there yet (before V403). */
export const missingTable = (e: any) => /does not exist|schema cache|PGRST20[45]|42P01|42703|Could not find/i.test(`${e?.code || ''} ${e?.message || ''}`)

export type PortDeps = {
  /** Send one email; resolves true when accepted. Default: Resend. */
  sendEmail?: (m: { to: string; subject: string; html: string; text: string }) => Promise<boolean>
  /** In-app bell rows for the company's staff. Default: lib/notify notifyCompany. */
  notify?: (p: { companyId: string; type: string; message: string; db?: any }) => Promise<void>
  now?: () => Date
}

async function defaultSend(m: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  if (!key) return false
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Colvy <notifications@updates.colvy.com>', to: [m.to], subject: m.subject, html: m.html, text: m.text }),
    })
    return r.ok
  } catch { return false }
}

async function defaultNotify(p: { companyId: string; type: string; message: string; db?: any }) {
  await notifyCompany(p)
}

// ── Reading ──────────────────────────────────────────────────────────────────

export type PortRow = Record<string, any>

/** ok, or why not (status: the HTTP status a route should answer with). */
export type PortResult<T> = { ok: boolean; status?: number; error?: string } & Partial<T>

/** A company's requests, newest first, with files (metadata) and the events the business may see. */
export async function listCompanyPorts(db: any, companyId: string): Promise<{ unavailable: boolean; requests: PortRow[] }> {
  const { data, error } = await db.from('porting_requests').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(50)
  if (error) return { unavailable: missingTable(error), requests: [] }
  const requests = (data || []) as PortRow[]
  if (!requests.length) return { unavailable: false, requests }
  const ids = requests.map(r => r.id)
  const [files, events] = await Promise.all([
    db.from('porting_request_files').select('id, request_id, kind, file_name, content_type, size_bytes, created_at').in('request_id', ids),
    db.from('porting_request_events').select('id, request_id, from_status, to_status, note, internal, created_at').in('request_id', ids).eq('internal', false).order('created_at', { ascending: true }),
  ])
  for (const r of requests) {
    // Never where a file is stored: the business opens one through a signed link.
    r.files = (files.data || []).filter((f: any) => f.request_id === r.id).map(({ storage_path: _p, storage_bucket: _b, ...f }: any) => f)
    r.events = (events.data || []).filter((e: any) => e.request_id === r.id && !e.internal)
  }
  return { unavailable: false, requests }
}

/** Every request for the platform admin, optionally by status, with everything (internal notes too). */
export async function listAllPorts(db: any, opts: { status?: string | null } = {}): Promise<{ unavailable: boolean; requests: PortRow[] }> {
  let q = db.from('porting_requests').select('*').order('created_at', { ascending: false }).limit(300)
  if (opts.status) q = q.eq('status', opts.status)
  const { data, error } = await q
  if (error) return { unavailable: missingTable(error), requests: [] }
  const requests = (data || []) as PortRow[]
  if (!requests.length) return { unavailable: false, requests }
  const ids = requests.map(r => r.id)
  const coIds = Array.from(new Set(requests.map(r => r.company_id)))
  const [files, events, companies] = await Promise.all([
    db.from('porting_request_files').select('*').in('request_id', ids),
    db.from('porting_request_events').select('*').in('request_id', ids).order('created_at', { ascending: true }),
    db.from('companies').select('id, name, slug').in('id', coIds),
  ])
  for (const r of requests) {
    r.files = (files.data || []).filter((f: any) => f.request_id === r.id)
    r.events = (events.data || []).filter((e: any) => e.request_id === r.id)
    r.company = (companies.data || []).find((c: any) => c.id === r.company_id) || null
  }
  return { unavailable: false, requests }
}

export async function getPort(db: any, id: string): Promise<PortRow | null> {
  if (!id) return null
  const { data } = await db.from('porting_requests').select('*').eq('id', id).maybeSingle()
  return data || null
}

/** A short-lived link to one stored file, or null. */
export async function signedFileUrl(db: any, file: { storage_bucket?: string; storage_path?: string }): Promise<string | null> {
  if (!file?.storage_path) return null
  try {
    const { data } = await db.storage.from(file.storage_bucket || PORT_BUCKET).createSignedUrl(file.storage_path, SIGNED_URL_SECONDS)
    return data?.signedUrl || null
  } catch { return null }
}

// ── Files ────────────────────────────────────────────────────────────────────

export type UploadFile = { name: string; type: string; size: number; bytes: Uint8Array }

/** Store a document for a request in the private bucket and record it. */
export async function storePortFile(db: any, o: { request: PortRow; file: UploadFile; kind?: string; userId?: string | null }): Promise<PortResult<{ file: PortRow }>> {
  try {
    const { data: buckets } = await db.storage.listBuckets()
    if (!buckets?.some((b: any) => b.id === PORT_BUCKET)) await db.storage.createBucket(PORT_BUCKET, { public: false })
  } catch { /* exists, or the upload below says why */ }
  const safe = String(o.file.name || 'document').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'document'
  const path = `${o.request.company_id}/${o.request.id}/${Date.now()}-${safe}`
  const { error: upErr } = await db.storage.from(PORT_BUCKET).upload(path, o.file.bytes, { contentType: o.file.type || 'application/octet-stream', upsert: false })
  if (upErr) return { ok: false, error: `The file couldn’t be saved: ${upErr.message || 'upload failed'}` }
  const row = {
    request_id: o.request.id, company_id: o.request.company_id, kind: o.kind || 'bill',
    file_name: String(o.file.name || safe).slice(0, 200), content_type: o.file.type || null, size_bytes: o.file.size || null,
    storage_bucket: PORT_BUCKET, storage_path: path, uploaded_by: o.userId || null,
  }
  const { data, error } = await db.from('porting_request_files').insert(row).select('*').maybeSingle()
  if (error) {
    try { await db.storage.from(PORT_BUCKET).remove([path]) } catch {}
    return { ok: false, error: missingTable(error) ? MIGRATION_NEEDED : 'The file couldn’t be recorded. Please try again.' }
  }
  return { ok: true, file: data || row }
}

// ── Creating ─────────────────────────────────────────────────────────────────

/** Create a request (status submitted) with its bill. Undone if the bill can't be stored. */
export async function createPortRequest(db: any, o: { companyId: string; userId: string | null; value: PortRequestValue; bill: UploadFile }, deps: PortDeps = {}): Promise<PortResult<{ request: PortRow }>> {
  const now = (deps.now || (() => new Date()))()
  // What the numbers will cost a month once attached (each like a bought number).
  const monthly = o.value.numbers.reduce((s, n) => s + monthlyPriceAud(numberKindOf(n) === 'tollfree' ? 'tollfree' : 'local'), 0)
  const row = {
    company_id: o.companyId,
    status: 'submitted',
    ...o.value,
    loa_text: loaText({ accountHolder: o.value.account_holder, carrier: o.value.current_carrier, numbers: o.value.numbers }),
    loa_version: LOA_VERSION,
    loa_accepted_at: now.toISOString(),
    port_fee_aud: portFeeAud(),
    monthly_price_aud: monthly,
    billing_status: 'not_started',
    attached: {},
    created_by: o.userId,
    submitted_at: now.toISOString(),
    updated_at: now.toISOString(),
  }
  const { data, error } = await db.from('porting_requests').insert(row).select('*').maybeSingle()
  if (error || !data) {
    if (missingTable(error)) return { ok: false, status: 503, error: MIGRATION_NEEDED }
    return { ok: false, status: 500, error: 'Your request couldn’t be saved. Please try again.' }
  }
  const stored = await storePortFile(db, { request: data, file: o.bill, kind: 'bill', userId: o.userId })
  if (!stored.ok) {
    try { await db.from('porting_requests').delete().eq('id', data.id) } catch {}
    return { ok: false, status: 500, error: stored.error }
  }
  await logEvent(db, data, { from: null, to: 'submitted', note: null, internal: false, actor: o.userId })
  await notifyPort(db, data, { kind: 'submitted' }, deps)
  return { ok: true, request: data }
}

async function logEvent(db: any, r: PortRow, e: { from: string | null; to: string | null; note: string | null; internal: boolean; actor: string | null }) {
  try {
    await db.from('porting_request_events').insert({
      request_id: r.id, company_id: r.company_id, from_status: e.from, to_status: e.to,
      note: e.note ? String(e.note).slice(0, 2000) : null, internal: e.internal, actor_id: e.actor,
    })
  } catch { /* history is best-effort; the request row is the truth */ }
}

// ── Status changes ───────────────────────────────────────────────────────────

export type StatusChange = { to: string; note?: string | null; internal?: boolean; scheduledFor?: string | null; reason?: string | null; carrierReference?: string | null; actor?: string | null }

/**
 * Move a request (platform admin). Checks the transition, needs a date for
 * `scheduled` and a reason for `rejected`, and only changes a row still in the
 * status it was read in (two admins can't both move it). Tells the business.
 */
export async function changePortStatus(db: any, request: PortRow, c: StatusChange, deps: PortDeps = {}): Promise<PortResult<{ request: PortRow }>> {
  const from = String(request.status)
  const to = String(c.to)
  if (to === 'completed') return { ok: false, status: 409, error: 'A port is completed by attaching its numbers (Attach number), so they work straight away.' }
  if (!canTransition(from, to)) return { ok: false, status: 409, error: `A request that is ${PORT_STATUS_LABEL[from as PortStatus] || from} can’t move to ${PORT_STATUS_LABEL[to as PortStatus] || to}.` }
  const now = (deps.now || (() => new Date()))().toISOString()
  const patch: Record<string, any> = { status: to, updated_at: now }
  if (to === 'scheduled') {
    const d = String(c.scheduledFor || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(Date.parse(d + 'T00:00:00Z'))) return { ok: false, status: 400, error: 'Choose the port date the carrier gave.' }
    patch.scheduled_for = d
  }
  if (to === 'rejected') {
    const reason = String(c.reason || '').trim()
    if (reason.length < 3) return { ok: false, status: 400, error: 'Say why it can’t go ahead, so the business can fix it.' }
    patch.rejection_reason = reason.slice(0, 1000)
  }
  if (to === 'in_review' && from === 'rejected') patch.rejection_reason = null
  if (to === 'submitted_to_carrier') patch.submitted_to_carrier_at = now
  if (c.carrierReference != null) patch.carrier_reference = String(c.carrierReference).trim().slice(0, 120) || null
  const { data, error } = await db.from('porting_requests').update(patch).eq('id', request.id).eq('status', from).select('*')
  if (error) return { ok: false, status: 500, error: 'Couldn’t save the change. Try again.' }
  if (!data?.length) return { ok: false, status: 409, error: 'Someone else changed this request just now. Reload it.' }
  const updated = data[0]
  const note = String(c.note || '').trim() || null
  await logEvent(db, updated, { from, to, note: note || (to === 'rejected' ? patch.rejection_reason : null), internal: !!c.internal && to !== 'rejected', actor: c.actor || null })
  await notifyPort(db, updated, { kind: 'status', note: c.internal ? null : note }, deps)
  return { ok: true, request: updated }
}

/** A note on a request without a status change. Internal notes stay with the Colvy team. */
export async function addPortNote(db: any, request: PortRow, o: { note: string; internal: boolean; actor?: string | null }, deps: PortDeps = {}): Promise<{ ok: boolean; error?: string }> {
  const note = String(o.note || '').trim()
  if (!note) return { ok: false, error: 'Write a note first.' }
  await logEvent(db, request, { from: null, to: null, note, internal: o.internal, actor: o.actor || null })
  if (!o.internal) await notifyPort(db, request, { kind: 'note', note }, deps)
  return { ok: true }
}

/** The business withdraws its request (only before it's lodged with the carriers). */
export async function cancelPortByBusiness(db: any, request: PortRow, actor: string | null, deps: PortDeps = {}): Promise<PortResult<{ request: PortRow }>> {
  if (!businessCanCancel(request.status)) return { ok: false, status: 409, error: 'This request has already gone to the carriers. Contact support to stop it.' }
  const now = (deps.now || (() => new Date()))().toISOString()
  const { data, error } = await db.from('porting_requests').update({ status: 'cancelled', updated_at: now }).eq('id', request.id).eq('status', request.status).select('*')
  if (error) return { ok: false, status: 500, error: 'Couldn’t cancel just now. Try again.' }
  if (!data?.length) return { ok: false, status: 409, error: 'This request changed just now. Reload it.' }
  await logEvent(db, data[0], { from: request.status, to: 'cancelled', note: null, internal: false, actor })
  return { ok: true, request: data[0] }
}

// ── Attaching a ported number ────────────────────────────────────────────────

export type AttachInput = { phoneNumber: string; twilioSid?: string | null; actor?: string | null }

/**
 * A ported number has arrived on Colvy's platform Twilio account: make it a
 * working Colvy number for the business, exactly as a purchase does (same
 * webhooks, same twilio_integrations / phone_numbers records, lib/platform-
 * number), then record it on the request. When every number on the request is
 * attached the request is completed and the business is told.
 *
 * Billing: the number is recorded at the normal monthly price (phone_numbers.
 * monthly_cost), and the request's billing_status becomes 'pending' until the
 * business starts its subscription (/api/phone-porting/billing) or the admin
 * marks it manual/waived. A purchased number's Stripe subscription comes from
 * its checkout; a ported number has no checkout until then.
 */
export async function attachPortedNumber(db: any, svc: any, request: PortRow, input: AttachInput, deps: PortDeps = {}): Promise<PortResult<{ request: PortRow; completed: boolean; phoneNumber: string }>> {
  if (!svc) return { ok: false, status: 503, error: 'The platform Twilio account isn’t configured on the server.' }
  if (!canAttach(request.status)) return { ok: false, status: 409, error: 'Attach numbers once the request has gone to the carrier (Submitted to carrier or Scheduled).' }
  const wanted = String(input.phoneNumber || '').replace(/[\s()-]/g, '')
  const numbers: string[] = Array.isArray(request.numbers) ? request.numbers : []
  if (!numbers.includes(wanted)) return { ok: false, status: 400, error: `${wanted || 'That number'} isn’t on this request (${numbers.join(', ')}).` }
  const attached: Record<string, any> = { ...(request.attached || {}) }
  if (attached[wanted]) return { ok: false, status: 409, error: `${formatAuNumber(wanted)} is already attached.` }

  // Find it on the platform account: by SID when given (and it must be this number), else by number.
  let incoming: any = null
  try {
    const sid = String(input.twilioSid || '').trim()
    if (sid) {
      if (!/^PN[0-9a-f]{32}$/i.test(sid)) return { ok: false, status: 400, error: 'A Twilio number SID starts with PN followed by 32 letters and digits.' }
      incoming = await svc.getIncomingNumberBySid(sid)
      if (incoming && incoming.phone_number && incoming.phone_number !== wanted) return { ok: false, status: 400, error: `That SID is ${incoming.phone_number}, not ${wanted}.` }
    } else {
      incoming = await svc.getIncomingNumber(wanted)
    }
  } catch (e: any) {
    return { ok: false, status: 502, error: `Twilio didn’t answer: ${e?.message || 'error'}` }
  }
  if (!incoming?.sid) return { ok: false, status: 404, error: `${formatAuNumber(wanted)} isn’t on Colvy’s Twilio account yet. Attach it once Twilio shows the port as complete.` }

  // Never take a number another business already has in Colvy.
  const { data: dupe } = await db.from('phone_numbers').select('id, company_id').eq('phone_number', wanted).maybeSingle()
  if (dupe && dupe.company_id !== request.company_id) return { ok: false, status: 409, error: `${formatAuNumber(wanted)} already belongs to another business in Colvy.` }

  // Same webhooks as a purchased number.
  try {
    await svc.configureNumberWebhooks({ phoneNumberSid: incoming.sid, ...numberWebhooks() })
  } catch (e: any) {
    return { ok: false, status: 502, error: `Couldn’t point the number at Colvy: ${e?.message || 'Twilio error'}` }
  }

  const kind = numberKindOf(wanted) === 'tollfree' ? 'tollfree' : 'local'
  const monthly = monthlyPriceAud(kind)
  let phoneNumberId: string | null = dupe?.id || null
  if (!dupe) {
    const rec = await recordPlatformNumber(db, { companyId: request.company_id, phoneNumber: wanted, numberSid: incoming.sid, monthly })
    if (rec.error) return { ok: false, status: 500, error: `The number is pointed at Colvy but couldn’t be recorded: ${rec.error.message || 'database error'}` }
    try { const { data: pn } = await db.from('phone_numbers').select('id').eq('phone_number', wanted).maybeSingle(); phoneNumberId = pn?.id || null } catch {}
  }

  const now = (deps.now || (() => new Date()))().toISOString()
  attached[wanted] = { sid: incoming.sid, phone_number_id: phoneNumberId, at: now }
  const allDone = numbers.every(n => attached[n])
  const patch: Record<string, any> = { attached, updated_at: now }
  if (allDone) {
    patch.status = 'completed'
    patch.completed_at = now
    patch.billing_status = Number(request.monthly_price_aud ?? monthly) > 0 || Number(request.port_fee_aud || 0) > 0 ? 'pending' : 'waived'
  }
  const { data, error } = await db.from('porting_requests').update(patch).eq('id', request.id).eq('status', request.status).select('*')
  if (error || !data?.length) return { ok: false, status: 409, error: 'The number is live in Colvy, but the request changed while saving. Reload it; attaching again is safe.' }
  const updated = data[0]
  await logEvent(db, updated, { from: request.status, to: allDone ? 'completed' : request.status, note: `Attached ${formatAuNumber(wanted)}`, internal: !allDone, actor: input.actor || null })
  if (allDone) await notifyPort(db, updated, { kind: 'status' }, deps)
  return { ok: true, request: updated, completed: allDone, phoneNumber: wanted }
}

// ── Telling the business ─────────────────────────────────────────────────────

export function portingLink(slug?: string | null): string {
  const base = slug ? `https://${slug}.colvy.com` : (process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').replace(/\/$/, '')
  return `${base}/admin/crm-settings/channels/calls#porting`
}

/** The email for a request event. Pure, so tests can read it. */
export function portEmail(o: { business: string; request: PortRow; kind: 'submitted' | 'status' | 'note'; note?: string | null; link: string }): { subject: string; html: string; text: string } {
  const r = o.request
  const status = (r.status || 'submitted') as PortStatus
  const nums = (Array.isArray(r.numbers) ? r.numbers : []).map(formatAuNumber).join(', ')
  const facts: [string, string][] = [['Numbers', nums], ['Status', PORT_STATUS_LABEL[status] || status]]
  if (status === 'scheduled' && r.scheduled_for) facts.push(['Port date', String(r.scheduled_for)])
  if (r.carrier_reference) facts.push(['Reference', String(r.carrier_reference)])
  const title = o.kind === 'submitted' ? 'We’ve got your port request'
    : o.kind === 'note' ? 'An update on your number move'
    : status === 'completed' ? 'Your number is now on Colvy'
    : status === 'rejected' ? 'Your port request needs attention'
    : `Your port request: ${PORT_STATUS_LABEL[status]}`
  const blocks: any[] = [{ type: 'facts', rows: facts }, { type: 'text', text: PORT_STATUS_HELP[status] }]
  if (status === 'rejected' && r.rejection_reason) blocks.push({ type: 'note', text: `Why: ${r.rejection_reason}` })
  if (o.note) blocks.push({ type: 'quote', text: o.note })
  if (status !== 'completed' && status !== 'rejected' && status !== 'cancelled') blocks.push({ type: 'text', text: `${PORT_TIMELINE} ${KEEP_SERVICE}`, small: true })
  if (status === 'completed' && r.billing_status === 'pending') blocks.push({ type: 'text', text: 'One last step: start the monthly subscription for the number in Settings → Calls & SMS.', small: true })
  const { html, text } = colvyEmail({
    preheader: `${nums}: ${PORT_STATUS_LABEL[status]}`,
    kicker: o.business,
    title,
    intro: o.kind === 'submitted' ? `Thanks for asking to move ${nums} to Colvy. Our team will check the details and handle the paperwork with the carriers.` : undefined,
    blocks,
    cta: { label: 'See your request', url: o.link },
    footerNote: 'You’re getting this because your business asked to move a phone number to Colvy.',
  })
  return { subject: `${title}${o.kind === 'submitted' ? '' : ` (${nums})`}`.slice(0, 160), html, text }
}

/** Email the request's contact and the owner, and ring the bell for the staff. Never throws. */
export async function notifyPort(db: any, request: PortRow, e: { kind: 'submitted' | 'status' | 'note'; note?: string | null }, deps: PortDeps = {}): Promise<{ emailed: string[]; notified: boolean }> {
  const send = deps.sendEmail || defaultSend
  const notify = deps.notify || defaultNotify
  const emailed: string[] = []
  let notified = false
  try {
    const { data: co } = await db.from('companies').select('name, slug, owner_id').eq('id', request.company_id).maybeSingle()
    const business = co?.name || 'your business'
    const status = (request.status || 'submitted') as PortStatus
    const nums = (Array.isArray(request.numbers) ? request.numbers : []).map(formatAuNumber).join(', ')
    const msg = e.kind === 'submitted' ? `Port request sent for ${nums}. ${PORT_TIMELINE}`
      : e.kind === 'note' ? `Update on moving ${nums}: ${e.note}`
      : `Moving ${nums}: ${PORT_STATUS_LABEL[status]}${status === 'scheduled' && request.scheduled_for ? ` for ${request.scheduled_for}` : ''}${status === 'rejected' && request.rejection_reason ? `. ${request.rejection_reason}` : ''}`
    try { await notify({ companyId: request.company_id, type: 'call', message: msg.slice(0, 500), db }); notified = true } catch {}

    const to = new Set<string>()
    if (request.contact_email) to.add(String(request.contact_email).toLowerCase())
    if (co?.owner_id) {
      try { const { data } = await db.auth.admin.getUserById(co.owner_id); if (data?.user?.email) to.add(String(data.user.email).toLowerCase()) } catch {}
    }
    const mail = portEmail({ business, request, kind: e.kind, note: e.note, link: portingLink(co?.slug) })
    for (const addr of to) { try { if (await send({ to: addr, ...mail })) emailed.push(addr) } catch {} }

    // The Colvy team hears about every new request.
    if (e.kind === 'submitted') {
      try {
        await send({ to: SUPER_ADMIN, subject: `New port request: ${business} (${nums})`, html: mail.html, text: `${business} asked to move ${nums} from ${request.current_carrier}. Open Platform admin → Number porting.` })
      } catch {}
    }
  } catch (err) { console.error('[porting] notify failed', err) }
  return { emailed, notified }
}

export { isOpenPort }
