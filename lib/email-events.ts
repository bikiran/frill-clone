// Resend delivery events for campaign email (server only): delivered,
// opened, clicked, bounced, complained and friends. They arrive on the same
// webhook as inbound mail (app/api/webhooks/email), signed the same way
// (Svix, RESEND_WEBHOOK_SECRET; see lib/email-webhook.ts), and are routed
// here by their type before any inbound handling.
//
// Each event is stored once in email_events (keyed by svix-id, which Resend
// reuses on retries) and tied to its campaign recipient by Resend's email id
// or by the tags every campaign email carries (campaign_id, contact_id,
// company_id). Then:
//   • hard bounce (or Resend already suppressing the address) → suppressed
//     for the business;
//   • soft bounce → counted; suppressed after 3 in 30 days;
//   • complaint → suppressed for the business and globally, and the contact's
//     marketing email is switched off (a complaint is an unsubscribe).
//
// An UNVERIFIED payload (no secret configured) is not trusted: opens, clicks
// and deliveries are ignored, and a bounce or complaint only counts once
// Resend's own copy of the email (GET /emails/:id) shows it.

import { isMissingTable, normEmail } from '@/lib/email-db'
import { noteSoftBounce, suppress } from '@/lib/email-suppression'
import { setEmailMarketing } from '@/lib/email-preferences'
import type { EmailWebhookTrust } from '@/lib/email-webhook'

const TYPES: Record<string, string> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delivery_delayed',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.failed': 'failed',
  'email.suppressed': 'suppressed',
}

/** Is this webhook body a delivery event this module handles (not inbound mail)? */
export function isDeliveryEvent(body: any): boolean {
  return typeof body?.type === 'string' && Object.prototype.hasOwnProperty.call(TYPES, body.type)
}

/** Resend sends tags as {name: value}; older payloads as [{name, value}]. */
export function tagsOf(data: any): Record<string, string> {
  const t = data?.tags
  const out: Record<string, string> = {}
  if (Array.isArray(t)) for (const x of t) { if (x?.name) out[String(x.name)] = String(x.value ?? '') }
  else if (t && typeof t === 'object') for (const [k, v] of Object.entries(t)) out[k] = String(v ?? '')
  return out
}

/** Hard (permanent) or soft (transient / undetermined) bounce. */
export function bounceKind(data: any): 'hard' | 'soft' {
  const b = data?.bounce || {}
  const type = String(b.type || '').toLowerCase()
  const sub = String(b.subType || b.subtype || '').toLowerCase()
  if (type === 'permanent' || sub === 'suppressed' || sub === 'onaccountsuppressionlist') return 'hard'
  return 'soft'
}

export type EventDeps = { fetch?: typeof fetch; apiKey?: string; now?: () => number }

/** For an unsigned payload: does Resend's copy of this email show this event? */
async function confirmWithResend(emailId: string, want: string, deps: EventDeps): Promise<boolean> {
  const key = deps.apiKey ?? process.env.RESEND_API_KEY
  if (!key || !emailId) return false
  try {
    const res = await (deps.fetch || fetch)(`https://api.resend.com/emails/${encodeURIComponent(emailId)}`, { headers: { Authorization: `Bearer ${key}` } })
    if (!res.ok) return false
    const d = await res.json().catch(() => ({}))
    return String(d?.last_event || '').toLowerCase() === want
  } catch { return false }
}

export type EventResult = { ok: boolean; stored: boolean; duplicate?: boolean; action?: string; reason?: string }

const UUID = /^[0-9a-f-]{32,36}$/i

/** Handle one delivery event. Never throws. */
export async function handleDeliveryEvent(db: any, body: any, opts: { trust: EmailWebhookTrust; svixId?: string | null } & EventDeps): Promise<EventResult> {
  try {
    const raw = String(body?.type || '')
    let type = TYPES[raw]
    if (!type) return { ok: false, stored: false, reason: 'not a delivery event' }
    const data = body?.data || {}
    const emailId = String(data.email_id || data.id || '')
    const to = normEmail(Array.isArray(data.to) ? data.to[0] : data.to)

    if (opts.trust !== 'verified') {
      const confirmable: Record<string, string> = { bounced: 'bounced', complained: 'complained', suppressed: 'suppressed' }
      if (!confirmable[type] || !(await confirmWithResend(emailId, confirmable[type], opts))) {
        return { ok: false, stored: false, reason: 'unverified webhook: event ignored' }
      }
    }

    // Who it was: the recipient row first (Resend's id), then the tags.
    const tags = tagsOf(data)
    let rec: any = null
    if (emailId) {
      try {
        const { data: r, error } = await db.from('email_campaign_recipients').select('id, campaign_id, company_id, contact_id, email, opened_at, clicked_at, delivered_at').eq('resend_email_id', emailId).limit(1)
        if (!error) rec = r?.[0] || null
      } catch {}
    }
    const companyId: string | null = rec?.company_id || (UUID.test(tags.company_id || '') ? tags.company_id : null)
    const campaignId: string | null = rec?.campaign_id || (UUID.test(tags.campaign_id || '') ? tags.campaign_id : null)
    const contactId: string | null = rec?.contact_id || (UUID.test(tags.contact_id || '') ? tags.contact_id : null)
    const email = normEmail(rec?.email) || to

    let hard = false
    if (type === 'bounced') { hard = bounceKind(data) === 'hard'; if (!hard) type = 'soft_bounced' }
    if (type === 'suppressed') { hard = true; type = 'bounced' }

    const nowIso = new Date(opts.now ? opts.now() : Date.now()).toISOString()
    const at = (() => { const t = Date.parse(data.created_at || body.created_at || ''); return Number.isFinite(t) ? new Date(t).toISOString() : nowIso })()

    // Store it (once).
    let stored = false
    try {
      const { error } = await db.from('email_events').insert({
        company_id: companyId, campaign_id: campaignId, recipient_id: rec?.id || null, contact_id: contactId,
        email: email || null, resend_email_id: emailId || null, type,
        link: type === 'clicked' ? String(data.click?.link || '').slice(0, 2000) || null : null,
        bounce_type: data.bounce ? `${data.bounce.type || ''}${data.bounce.subType ? '/' + data.bounce.subType : ''}`.slice(0, 80) : null,
        detail: data.bounce ? { message: String(data.bounce.message || '').slice(0, 500) } : null,
        provider_event_id: opts.svixId || null, occurred_at: at,
      })
      if (error) {
        if (/duplicate|unique/i.test(error.message || '')) return { ok: true, stored: false, duplicate: true }
        if (!isMissingTable(error)) console.error('[email events] not stored', error.message)
      } else stored = true
    } catch {}

    // The recipient row's timestamps (first open / click only).
    if (rec?.id) {
      const patch: Record<string, any> = {}
      if (type === 'delivered' && !rec.delivered_at) patch.delivered_at = at
      if (type === 'opened' && !rec.opened_at) patch.opened_at = at
      if (type === 'clicked' && !rec.clicked_at) patch.clicked_at = at
      if (type === 'bounced' || type === 'soft_bounced') patch.bounced_at = at
      if (type === 'complained') patch.complained_at = at
      if (type === 'failed') { patch.status = 'failed'; patch.error = 'Resend couldn’t send it' }
      if (Object.keys(patch).length) { try { await db.from('email_campaign_recipients').update(patch).eq('id', rec.id) } catch {} }
    }

    let action: string | undefined
    if (type === 'bounced' && hard && email && companyId) {
      await suppress(db, companyId, email, 'hard_bounce', { detail: String(data.bounce?.message || 'Hard bounce'), campaignId })
      action = 'suppressed'
    } else if (type === 'soft_bounced' && email && companyId) {
      if (await noteSoftBounce(db, companyId, email, campaignId, opts.now ? opts.now() : Date.now())) action = 'suppressed after soft bounces'
    } else if (type === 'complained' && email) {
      await suppress(db, companyId, email, 'complaint', { detail: 'Marked as spam', campaignId })
      if (companyId && contactId) {
        await setEmailMarketing(db, companyId, { id: contactId, email }, false, { source: 'Marked a campaign email as spam', campaignId, actor: 'system' })
      }
      action = 'suppressed (complaint)'
    }
    return { ok: true, stored, action }
  } catch (e: any) {
    console.error('[email events] failed', e?.message)
    return { ok: false, stored: false, reason: 'error' }
  }
}
