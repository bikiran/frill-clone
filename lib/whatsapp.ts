// WhatsApp Business messaging through Twilio (server only).
//
//   • Who may send: readSender / whatsappAccess. Nothing is sent unless the
//     business's WhatsApp sender is 'approved' (set by Colvy's super admin once
//     Meta has approved the number), Colvy's Twilio account is configured, the
//     plan has messaging channels, and the per-company `whatsapp` switch
//     (platform admin → company → Entitlements, default on) isn't off.
//   • Opt-outs: whatsappOptOut / recordWhatsAppKeyword. A STOP on WhatsApp
//     stops WhatsApp only (texts and email are unchanged); START lifts it.
//   • The 24-hour customer service window: lastWhatsAppInbound + serviceWindow
//     (lib/whatsapp-core). Outside it only an approved template goes.
//   • sendWhatsApp: every outbound WhatsApp message (the inbox, the agents,
//     scheduled replies, the super admin's test) goes through here, is stored on
//     the thread, and is logged in whatsapp_messages for usage reporting.
//   • applyWhatsAppStatus: Twilio's status callbacks (sent / delivered / read /
//     failed) onto the log and the thread message.
//
// Every table here comes from migrations/COLVY_V402_WHATSAPP.sql. Before it
// runs, readSender answers ready:false and nothing is ever sent or routed.

import { TWILIO_MASTER, platformTwilio, platformTwilioConfigured, colvyBaseUrl } from '@/lib/twilio-platform'
import { companyFlagEnabled } from '@/lib/feature-flags'
import { companyHasFeature } from '@/lib/plan'
import { phoneKey, toE164 } from '@/lib/phone'
import { isExternalSendBlocked } from '@/lib/demo-guard'
import { STOP_WORDS, findContactsByPhone } from '@/lib/sms-consent'
import {
  E164_RE, BLOCK_WORDS, serviceWindow, fillTemplate, templateSendable, friendlyWhatsAppError, statusAdvances,
  stripWhatsApp, whatsAppAddress, isSenderStatus, type SenderStatus, type WhatsAppTemplate, type TemplateCategory,
} from '@/lib/whatsapp-core'

export const WHATSAPP_FLAG = 'whatsapp'
export const V402_MESSAGE = 'Run migrations/COLVY_V402_WHATSAPP.sql first: WhatsApp needs its tables.'
export const isMissing = (e: any) =>
  /^(42P01|42703|PGRST20[45])$/.test(String(e?.code || '')) || /does not exist|could not find|schema cache/i.test(String(e?.message || e || ''))

/** START words that lift a WhatsApp opt-out. Not YES: on WhatsApp it's usually just an answer. */
export const WHATSAPP_START_WORDS = ['START', 'SUBSCRIBE', 'OPTIN', 'UNSTOP']

export type SenderRow = {
  company_id: string
  phone_number: string | null
  display_name: string | null
  status: SenderStatus
  twilio_sender_sid: string | null
  waba_id: string | null
  request: Record<string, any> | null
  requested_by: string | null
  requested_at: string | null
  admin_note: string | null
  approved_at: string | null
  updated_by: string | null
  updated_at: string | null
}

// ── The sender ──────────────────────────────────────────────────────────────

export async function readSender(db: any, companyId: string): Promise<{ ready: boolean; row: SenderRow | null }> {
  try {
    const { data, error } = await db.from('whatsapp_senders').select('*').eq('company_id', companyId).maybeSingle()
    if (error) return { ready: !isMissing(error), row: null }
    if (data && !isSenderStatus(data.status)) data.status = 'not_requested'
    return { ready: true, row: data || null }
  } catch (e) { return { ready: !isMissing(e), row: null } }
}

/**
 * The business whose APPROVED WhatsApp sender is this number (the webhook's
 * `To`, with or without "whatsapp:"). null for anything else, including
 * before V402 runs.
 */
export async function companyForWhatsAppNumber(db: any, to: string): Promise<{ companyId: string; sender: SenderRow } | null> {
  const e164 = toE164(stripWhatsApp(to))
  if (!E164_RE.test(e164)) return null
  try {
    const { data, error } = await db.from('whatsapp_senders').select('*').eq('phone_number', e164).eq('status', 'approved').limit(2)
    if (error || !data?.length) return null
    // The database allows one approved sender per number (V402); two would be a
    // misconfiguration, and routing a customer's message to a guess would leak it.
    if (data.length > 1) { console.error('[whatsapp] two approved senders for', e164); return null }
    return { companyId: data[0].company_id, sender: data[0] }
  } catch { return null }
}

export type Access = { ok: boolean; reason?: 'platform' | 'not_ready' | 'not_approved' | 'flag_off' | 'plan'; sender: SenderRow | null }

/** May this business send WhatsApp messages right now? */
export async function whatsappAccess(db: any, companyId: string, given?: { ready: boolean; row: SenderRow | null }): Promise<Access> {
  const s = given || await readSender(db, companyId)
  if (!s.ready) return { ok: false, reason: 'not_ready', sender: null }
  const row = s.row
  if (!row || row.status !== 'approved' || !E164_RE.test(String(row.phone_number || ''))) return { ok: false, reason: 'not_approved', sender: row }
  if (!platformTwilioConfigured()) return { ok: false, reason: 'platform', sender: row }
  const [flag, plan] = await Promise.all([
    companyFlagEnabled(db, companyId, WHATSAPP_FLAG),
    companyHasFeature(db, companyId, 'channels'),
  ])
  if (!flag) return { ok: false, reason: 'flag_off', sender: row }
  if (!plan) return { ok: false, reason: 'plan', sender: row }
  return { ok: true, sender: row }
}

// ── Opt-outs (WhatsApp only) ────────────────────────────────────────────────

/**
 * May this business message this number on WhatsApp? 'opted_out' after a
 * WhatsApp STOP (until START) or when a contact with the number is blocked;
 * 'unknown' when that can't be read (don't send).
 */
export async function whatsappOptOut(db: any, companyId: string, phone: string | null | undefined): Promise<'ok' | 'opted_out' | 'unknown'> {
  const key = phoneKey(phone)
  if (key.length < 8) return 'unknown'
  try {
    const { data, error } = await db.from('whatsapp_consent').select('status').eq('company_id', companyId).eq('phone_norm', key).maybeSingle()
    if (error) return 'unknown'
    if (data?.status === 'opted_out') return 'opted_out'
  } catch { return 'unknown' }
  const contacts = await findContactsByPhone(db, companyId, phone)
  if (!contacts) return 'unknown'
  if (contacts.some(c => c.is_blocked)) return 'opted_out'
  return 'ok'
}

/**
 * Record a STOP or START the customer sent on WhatsApp: whatsapp_consent (one
 * row per number) and a consent event on each contact with the number. It
 * never touches the contact's SMS / email consent (unsubscribed_at,
 * subscribed_to_marketing): a WhatsApp opt-out is for WhatsApp. Returns the
 * new state, or null when the message is no keyword. Never throws.
 */
export async function recordWhatsAppKeyword(db: any, companyId: string, phone: string, keyword: string): Promise<'opted_out' | 'opted_in' | null> {
  const optingOut = STOP_WORDS.includes(keyword)
  const optingIn = WHATSAPP_START_WORDS.includes(keyword)
  if (!optingOut && !optingIn) return null
  const key = phoneKey(phone)
  if (key.length < 8) return null
  const state = optingOut ? 'opted_out' : 'opted_in'
  let was: string | null = null
  try {
    const { data } = await db.from('whatsapp_consent').select('status').eq('company_id', companyId).eq('phone_norm', key).maybeSingle()
    was = data?.status || null
    const { error } = await db.from('whatsapp_consent').upsert({
      company_id: companyId, phone_norm: key, phone: toE164(phone) || phone, status: state, keyword, updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id,phone_norm' })
    if (error) console.error('[whatsapp consent] not saved', error.message)
  } catch (e: any) { console.error('[whatsapp consent] not saved', e?.message) }
  // A START from someone who never opted out changes nothing worth an event.
  if (optingIn && was !== 'opted_out') return state
  try {
    const contacts = await findContactsByPhone(db, companyId, phone)
    for (const c of contacts || []) {
      await db.from('consent_events').insert({
        company_id: companyId, contact_id: c.id, actor: 'customer', basis: null,
        action: optingOut ? 'whatsapp_unsubscribed' : 'whatsapp_resubscribed',
        source: `WhatsApp keyword: ${keyword}`,
        note: optingOut ? 'WhatsApp only: texts and email are unchanged' : 'WhatsApp messages resume',
      })
    }
  } catch {}
  return state
}

// ── The 24-hour window ──────────────────────────────────────────────────────

/** When the customer last messaged on WhatsApp: in this conversation, or (no conversation) from this number. */
export async function lastWhatsAppInbound(db: any, companyId: string, opts: { conversationId?: string | null; phone?: string | null }): Promise<string | null> {
  try {
    let ids: string[] = []
    if (opts.conversationId) ids = [opts.conversationId]
    else if (opts.phone) {
      const { data } = await db.from('conversations').select('id').eq('company_id', companyId).eq('whatsapp_number', toE164(opts.phone)).limit(20)
      ids = (data || []).map((c: any) => c.id)
    }
    if (!ids.length) return null
    const { data } = await db.from('messages').select('created_at')
      .in('conversation_id', ids).eq('company_id', companyId).eq('sender_type', 'visitor').eq('delivery_channel', 'whatsapp')
      .order('created_at', { ascending: false }).limit(1)
    return data?.[0]?.created_at || null
  } catch { return null }
}

// ── Templates ───────────────────────────────────────────────────────────────

export async function listTemplates(db: any, companyId: string): Promise<{ ready: boolean; rows: WhatsAppTemplate[] }> {
  try {
    const { data, error } = await db.from('whatsapp_templates').select('*').eq('company_id', companyId).order('name', { ascending: true }).limit(500)
    if (error) return { ready: !isMissing(error), rows: [] }
    return { ready: true, rows: data || [] }
  } catch (e) { return { ready: !isMissing(e), rows: [] } }
}

// ── Usage log ───────────────────────────────────────────────────────────────

export type UsageRow = {
  company_id: string
  conversation_id?: string | null
  message_id?: string | null
  direction: 'inbound' | 'outbound'
  kind: 'session' | 'template'
  template_id?: string | null
  template_category?: TemplateCategory | null
  twilio_sid?: string | null
  to_number?: string | null
  from_number?: string | null
  status?: string | null
  error_code?: string | null
  sent_by?: string | null
  is_test?: boolean
}

/** One row per WhatsApp message in or out (best-effort: a failed log never fails the message). */
export async function recordUsage(db: any, rows: UsageRow[]): Promise<void> {
  if (!rows.length) return
  try {
    const { error } = await db.from('whatsapp_messages').insert(rows.map(r => ({ is_test: false, ...r })))
    if (error && !isMissing(error)) console.error('[whatsapp usage] not logged', error.message)
  } catch {}
}

// ── Sending ─────────────────────────────────────────────────────────────────

export type SendAttachment = { url: string; kind?: string; name?: string; type?: string; size?: number }
// ok: sid / sids / messageId / text / kind. Not ok: status (HTTP), reason, error, code.
export type SendResult = {
  ok: boolean
  sid?: string | null; sids?: string[]; messageId?: string | null; text?: string; kind?: 'session' | 'template'
  status?: number; reason?: string; error?: string; code?: string
}

const fail = (status: number, reason: string, error?: string, code?: string): SendResult =>
  ({ ok: false, status, reason, error: error || BLOCK_WORDS[reason] || 'WhatsApp message not sent.', ...(code ? { code } : {}) })

export const BODY_MAX = 1600
export const WHATSAPP_STATUS_CALLBACK_PATH = '/api/twilio/whatsapp'

/**
 * Send one WhatsApp message for a business: free-form text and/or files
 * inside the 24-hour window, or an approved utility template (any time).
 * Checks, in order: the conversation is the business's, a WhatsApp number,
 * the demo guard, access (approved sender, switch, plan, Colvy's Twilio), the
 * WhatsApp opt-out, then the window or the template. Sends through Colvy's
 * Twilio account from the business's sender, stores the message on the thread
 * (unless skipThreadMessage) and logs each Twilio message for usage.
 */
export async function sendWhatsApp(db: any, opts: {
  companyId: string
  conversationId?: string | null
  to?: string | null
  text?: string | null
  attachments?: SendAttachment[] | null
  templateId?: string | null
  variables?: Record<string, unknown> | unknown[] | null
  senderName?: string | null
  sentBy?: string | null
  isAi?: boolean
  metadata?: Record<string, any> | null
  skipThreadMessage?: boolean
  isTest?: boolean
  now?: number
}): Promise<SendResult> {
  const { companyId } = opts
  let conv: any = null
  if (opts.conversationId) {
    const { data } = await db.from('conversations').select('id, company_id, whatsapp_number, contact_id').eq('id', opts.conversationId).maybeSingle()
    if (!data || data.company_id !== companyId) return fail(404, 'not_found', 'Conversation not found.')
    conv = data
  }
  const to = toE164(stripWhatsApp(opts.to || conv?.whatsapp_number || ''))
  if (!E164_RE.test(to)) return fail(400, 'no_number')
  if (await isExternalSendBlocked(companyId, db)) return fail(403, 'demo')

  const access = await whatsappAccess(db, companyId)
  if (!access.ok) return fail(access.reason === 'not_ready' ? 409 : 403, access.reason || 'not_approved')
  const sender = access.sender!

  const consent = await whatsappOptOut(db, companyId, to)
  if (consent !== 'ok') return fail(409, consent)

  // What goes: a template, or free-form text and files.
  let kind: 'session' | 'template' = 'session'
  let template: WhatsAppTemplate | null = null
  let filled: ReturnType<typeof fillTemplate> | null = null
  const text = String(opts.text || '').trim()
  const attachments = (opts.attachments || []).filter(a => a && typeof a.url === 'string' && /^https:\/\//i.test(a.url)).slice(0, 10)
  if (opts.templateId) {
    kind = 'template'
    try {
      const { data } = await db.from('whatsapp_templates').select('*').eq('id', opts.templateId).eq('company_id', companyId).maybeSingle()
      template = data || null
    } catch { template = null }
    if (!templateSendable(template)) return fail(400, 'template', template ? 'Only approved utility templates can be sent from Colvy.' : 'That template wasn’t found.')
    filled = fillTemplate(template!.body, opts.variables || {})
    if (filled.missing.length) return fail(400, 'template', `Fill in ${filled.missing.map(n => `{{${n}}}`).join(', ')} first.`)
  } else {
    if (!text && !attachments.length) return fail(400, 'empty', 'Nothing to send.')
    if (text.length > BODY_MAX) return fail(400, 'too_long', `Keep a WhatsApp message to ${BODY_MAX.toLocaleString('en-AU')} characters.`)
    const last = await lastWhatsAppInbound(db, companyId, { conversationId: conv?.id || null, phone: conv ? null : to })
    if (!serviceWindow(last, opts.now ?? Date.now()).open) return fail(409, 'window_closed')
  }

  // ── Twilio ────────────────────────────────────────────────────────────────
  const twilio = platformTwilio()
  if (!twilio) return fail(403, 'platform')
  const from = whatsAppAddress(sender.phone_number!)
  const statusCallback = `${colvyBaseUrl()}${WHATSAPP_STATUS_CALLBACK_PATH}`
  const sids: string[] = []
  const content = template ? filled!.text : text
  const usageBase = {
    company_id: companyId, conversation_id: conv?.id || null, direction: 'outbound' as const, kind,
    template_id: template?.id || null, template_category: template?.category || null,
    to_number: to, from_number: sender.phone_number, sent_by: opts.sentBy || opts.senderName || null, is_test: !!opts.isTest,
  }
  try {
    if (template) {
      const r = await twilio.sendMessage({ to: whatsAppAddress(to), from, contentSid: template.content_sid, contentVariables: filled!.contentVariables, statusCallback })
      if (r.sid) sids.push(r.sid)
    } else if (!attachments.length) {
      const r = await twilio.sendMessage({ to: whatsAppAddress(to), from, text, statusCallback })
      if (r.sid) sids.push(r.sid)
    } else {
      // WhatsApp carries one file per message: the text rides on the first as its caption.
      for (let i = 0; i < attachments.length; i++) {
        const r = await twilio.sendMessage({ to: whatsAppAddress(to), from, text: i === 0 ? text || undefined : undefined, mediaUrls: [attachments[i].url], statusCallback })
        if (r.sid) sids.push(r.sid)
      }
    }
  } catch (e: any) {
    const code = e?.code ? String(e.code) : undefined
    await recordUsage(db, [{ ...usageBase, twilio_sid: null, status: 'failed', error_code: code || null }])
    if (!sids.length) return fail(502, 'twilio', friendlyWhatsAppError(code, String(e?.message || '').replace(/^Twilio:\s*/, '')), code)
    // Some files went before one failed: record what went, say what didn't.
    console.error('[whatsapp] a later file failed', e?.message)
  }

  // ── The thread and the log ────────────────────────────────────────────────
  let messageId: string | null = null
  if (conv && !opts.skipThreadMessage) {
    const meta = {
      ...(opts.metadata || {}),
      whatsapp: {
        status: 'queued', kind, sids,
        ...(template ? { template: { id: template.id, name: template.name, category: template.category, variables: filled!.variables } } : {}),
      },
    }
    try {
      const { data } = await db.from('messages').insert({
        conversation_id: conv.id, company_id: companyId, sender_type: 'agent',
        sender_name: opts.senderName || 'Agent', content,
        attachments: attachments.length ? attachments : [],
        delivery_channel: 'whatsapp', telnyx_message_id: sids[0] || null,
        ...(opts.isAi ? { is_ai: true, is_read: true } : {}),
        metadata: meta,
      }).select('id').maybeSingle()
      messageId = data?.id || null
    } catch (e: any) { console.error('[whatsapp] thread message not saved', e?.message) }
    try {
      await db.from('conversations').update({
        last_message: (content || (attachments.length ? 'Attachment' : '')).slice(0, 200),
        last_message_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        channel: 'whatsapp', whatsapp_number: to,
      }).eq('id', conv.id)
    } catch {}
  }
  await recordUsage(db, sids.map(sid => ({ ...usageBase, message_id: messageId, twilio_sid: sid, status: 'queued' })))
  return { ok: true, sid: sids[0] || null, sids, messageId, text: content, kind }
}

// ── Status callbacks ────────────────────────────────────────────────────────

/**
 * Apply one Twilio status callback (MessageSid + MessageStatus [+ ErrorCode])
 * to the usage log and, for the message's first Twilio message (or any that
 * failed), to the thread message's metadata.whatsapp. Statuses only move
 * forward. Returns what changed, or null when the SID isn't a WhatsApp message
 * Colvy sent.
 */
export async function applyWhatsAppStatus(db: any, p: { sid: string; status: string; errorCode?: string | null }): Promise<{ status: string; messageId: string | null } | null> {
  const status = String(p.status || '').toLowerCase()
  if (!p.sid || !status) return null
  let row: any = null
  try {
    const { data } = await db.from('whatsapp_messages').select('id, status, message_id, company_id').eq('twilio_sid', p.sid).maybeSingle()
    row = data
  } catch { return null }
  if (!row) return null
  if (!statusAdvances(row.status, status)) return null
  const now = new Date().toISOString()
  const failed = status === 'failed' || status === 'undelivered'
  try {
    await db.from('whatsapp_messages').update({
      status, error_code: failed ? (p.errorCode || null) : null, updated_at: now,
      ...(status === 'delivered' ? { delivered_at: now } : {}),
      ...(status === 'read' ? { read_at: now } : {}),
    }).eq('id', row.id)
  } catch {}
  if (row.message_id) {
    try {
      const { data: msg } = await db.from('messages').select('id, metadata, telnyx_message_id').eq('id', row.message_id).maybeSingle()
      if (msg) {
        const meta = msg.metadata && typeof msg.metadata === 'object' ? msg.metadata : {}
        const wa = meta.whatsapp && typeof meta.whatsapp === 'object' ? meta.whatsapp : {}
        const primary = !msg.telnyx_message_id || msg.telnyx_message_id === p.sid
        if ((primary || failed) && statusAdvances(wa.status, status)) {
          const next = { ...wa, status, ...(failed ? { error_code: p.errorCode || null, error: friendlyWhatsAppError(p.errorCode) } : {}) }
          await db.from('messages').update({ metadata: { ...meta, whatsapp: next } }).eq('id', msg.id)
        }
      }
    } catch {}
  }
  return { status, messageId: row.message_id || null }
}

/** For the webhook's media download: Colvy's master Twilio credentials. */
export const masterCreds = () => ({ accountSid: TWILIO_MASTER.accountSid, authToken: TWILIO_MASTER.authToken })
