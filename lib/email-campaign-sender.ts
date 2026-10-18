// The email campaign sender (server only). Self-contained on purpose: the
// campaign wizard's send / schedule routes and the campaign worker
// (app/api/campaigns/process) reach it through lib/campaign-email.ts.
//
//   prepareEmailCampaign(companyId, campaignId, recipients)
//     Freezes what will be sent: renders the campaign's design
//     (email_designs, by campaign_id) with the business's branding, turns
//     every https link into a Colvy tracked link (short_links, one per URL,
//     tagged with the campaign, so clicks show in Link Reports and the
//     campaign report), picks the From / Reply-To (the business's verified
//     domain, else Colvy's shared campaign domain), and writes one
//     email_campaign_recipients row per person. People who are suppressed,
//     unsubscribed, without consent or with a bad address are written as
//     'skipped' with the reason. Marks the campaign 'sending'.
//
//   sendEmailBatch(campaignId)
//     Sends pending recipients through Resend's batch API, 100 per call, each
//     email with its own merge values, signed unsubscribe / preference links,
//     List-Unsubscribe + List-Unsubscribe-Post (one-click) headers, an open
//     pixel, tracked links and the tags {campaign_id, contact_id, company_id}
//     the webhook reads back. Consent and suppressions are checked again
//     right before each batch. Retries 429 and 5xx with backoff (Retry-After
//     honoured). Stops after about 45 seconds and picks up from the same
//     rows next time: rows are claimed before sending and keep their batch's
//     idempotency key, so a retried batch can't email anyone twice (Resend
//     keeps keys for 24 hours). Marks the campaign 'sent' when nothing is
//     left.
//
// Every function takes optional deps (db, fetch, clock, sleep) so it can be
// tested without a network or database.

import { createHash } from 'crypto'
import { emailAdminDb, normEmail } from '@/lib/email-db'
import { loadEmailBrand } from '@/lib/email-brand'
import { senderFor } from '@/lib/email-domains'
import { emailConsentSkip, loadConsent, suppressedSet } from '@/lib/email-suppression'
import { signRecipientRef, signUnsubToken } from '@/lib/email-tokens'
import { fillSubject, fillTemplate, renderEmail } from '@/components/EmailDesigner/render'
import type { EmailDesign } from '@/components/EmailDesigner/types'

export const RESEND_BATCH_URL = 'https://api.resend.com/emails/batch'
export const BATCH_SIZE = 100
export const DEFAULT_BUDGET_MS = 45_000
const RESERVE_MS = 4_000          // keep this much of the budget for bookkeeping
const STALE_CLAIM_MS = 10 * 60_000
const MAX_TRIES_PER_CALL = 4
const MAX_ATTEMPTS = 5

export type EmailRecipientInput = { contact_id: string; email: string | null; name?: string | null; merge?: Record<string, string | null | undefined> }

export type SenderDeps = {
  db?: any
  fetch?: typeof fetch
  apiKey?: string
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  /** Origin for tracked / unsubscribe links. Default: the business's colvy.com subdomain. */
  baseUrl?: string
  budgetMs?: number
  batchSize?: number
}

export type Frozen = {
  subject: string
  previewText: string
  html: string
  text: string
  links: { token: string; url: string; code: string | null; id: string | null }[]
  from: string
  replyTo: string | null
  shared: boolean
  base: string
  frozenAt: string
}

const sleeper = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/** Where links in the business's email point: its own subdomain reads more trustworthy. */
export function emailLinkBase(slug?: string | null): string {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').replace(/\/$/, '')
  try {
    const u = new URL(site)
    if (slug && /^[a-z0-9-]{1,63}$/.test(slug) && u.hostname.replace(/^www\./, '') === 'colvy.com') return `https://${slug}.colvy.com`
  } catch {}
  return site
}

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'
const code7 = () => Array.from({ length: 7 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')

/**
 * Swap every https link in the template (html and text) for a {{track_N}}
 * tag and make one short link per URL. Links with merge tags in them, and
 * the unsubscribe / preference / pixel tags, are left alone. A link whose
 * short link can't be made stays as it is (untracked) rather than breaking.
 */
export async function trackLinks(db: any, html: string, text: string, ctx: { companyId: string; campaignId: string; base: string; createdBy?: string | null }): Promise<{ html: string; text: string; links: Frozen['links'] }> {
  const urls: string[] = []
  for (const m of html.matchAll(/href="(https:\/\/[^"]+)"/g)) {
    const u = m[1].replace(/&amp;/g, '&')
    if (!u.includes('{{') && !urls.includes(u)) urls.push(u)
  }
  const links: Frozen['links'] = []
  for (const url of urls.slice(0, 50)) {
    const token = `track_${links.length}`
    let code: string | null = null, id: string | null = null
    for (let i = 0; i < 4 && !code; i++) {
      try {
        const c = code7()
        const { data, error } = await db.from('short_links').insert({
          company_id: ctx.companyId, code: c, target_url: url, campaign_id: ctx.campaignId,
          channel: 'email', kind: 'campaign', link_type: 'email', clicks: 0, sent_by: ctx.createdBy || null,
        }).select('id, code').maybeSingle()
        if (!error) { code = data?.code || c; id = data?.id || null }
        else if (!/duplicate|unique/i.test(error.message || '')) {
          // An older short_links without some column: try the base columns.
          const r2 = await db.from('short_links').insert({ company_id: ctx.companyId, code: c, target_url: url, campaign_id: ctx.campaignId, clicks: 0 }).select('id, code').maybeSingle()
          if (!r2.error) { code = r2.data?.code || c; id = r2.data?.id || null } else break
        }
      } catch { break }
    }
    if (code) links.push({ token, url, code, id })
  }
  let h = html, t = text
  for (const l of links) {
    const escaped = l.url.replace(/&/g, '&amp;')
    h = h.split(`href="${escaped}"`).join(`href="{{${l.token}}}"`)
    // Plain text: whole URLs only (not a prefix of a longer one).
    t = t.replace(new RegExp(l.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[\\s)])', 'g'), `{{${l.token}}}`)
  }
  return { html: h, text: t, links }
}

/** Merge values from a name and the campaign. */
export function mergeValues(r: { name?: string | null; merge?: Record<string, any> | null }, brandName: string): Record<string, string> {
  const first = String(r.name || '').trim().split(/\s+/)[0] || ''
  const base: Record<string, string> = { first_name: first, store_name: brandName, outlet: '', coupon_code: '' }
  for (const [k, v] of Object.entries(r.merge || {})) if (/^[a-z_][a-z0-9_]*$/i.test(k) && v != null) base[k.toLowerCase()] = String(v).slice(0, 200)
  return base
}

export type PrepareResult = {
  recipients: number
  skipped: number
  skippedBreakdown: Record<string, number>
  sender: { from: string; replyTo: string | null; shared: boolean }
}

/**
 * Freeze the email and the recipient list, and mark the campaign 'sending'.
 * `recipients` is the resolved audience (resolveAudience(…, 'email')); it is
 * checked again here against live consent and the suppression lists.
 */
export async function prepareEmailCampaign(companyId: string, campaignId: string, recipients: EmailRecipientInput[], deps: SenderDeps = {}): Promise<PrepareResult> {
  const db = deps.db || emailAdminDb()
  const { data: campaign } = await db.from('campaigns').select('*').eq('id', campaignId).eq('company_id', companyId).maybeSingle()
  if (!campaign) throw new Error('Campaign not found')
  if (campaign.channel !== 'email') throw new Error('This isn’t an email campaign')
  if (['sending', 'sent'].includes(campaign.status)) throw new Error(`This campaign is already ${campaign.status}`)

  const { data: design, error: dErr } = await db.from('email_designs').select('*').eq('campaign_id', campaignId).eq('company_id', companyId).maybeSingle()
  if (dErr) throw new Error('Email campaigns are waiting on a database update (V396)')
  if (!design?.design?.blocks?.length) throw new Error('The email has no content yet')
  const subject = String(design.subject || '').trim()
  if (!subject) throw new Error('The email has no subject line')

  const loaded = await loadEmailBrand(db, companyId)
  if (!loaded) throw new Error('Company not found')
  const { brand, company } = loaded
  const sender = await senderFor(db, company)
  const base = deps.baseUrl || emailLinkBase(brand.slug)

  const rendered = renderEmail(design.design as EmailDesign, brand, { subject, previewText: design.preview_text || '' })
  const tracked = await trackLinks(db, rendered.html, rendered.text, { companyId, campaignId, base, createdBy: campaign.created_by || null })
  const frozen: Frozen = {
    subject, previewText: String(design.preview_text || ''), html: tracked.html, text: tracked.text, links: tracked.links,
    from: sender.from, replyTo: sender.replyTo, shared: sender.shared, base, frozenAt: new Date(deps.now ? deps.now() : Date.now()).toISOString(),
  }
  // Also keep the rendered HTML / text in step with the design that was sent.
  await db.from('email_designs').update({ frozen, html: rendered.html, text: rendered.text, updated_at: frozen.frozenAt }).eq('id', design.id)

  // Recipients: one per address; consent and suppression checked live.
  const seen = new Set<string>()
  const breakdown: Record<string, number> = {}
  const rows: any[] = []
  const skip = (r: EmailRecipientInput, email: string, reason: string) => {
    breakdown[reason] = (breakdown[reason] || 0) + 1
    if (email) rows.push({ campaign_id: campaignId, company_id: companyId, contact_id: r.contact_id || null, email, name: r.name || null, status: 'skipped', skip_reason: reason })
  }
  const consent = await loadConsent(db, companyId, recipients.map(r => r.contact_id))
  if (!consent) throw new Error('Couldn’t check marketing consent just now. Nothing was sent.')
  const supp = await suppressedSet(db, companyId, recipients.map(r => String(r.email || '')))
  for (const r of recipients) {
    const email = normEmail(r.email)
    if (!email) { skip(r, '', 'invalid_email'); continue }
    if (seen.has(email)) { breakdown.duplicate = (breakdown.duplicate || 0) + 1; continue }
    seen.add(email)
    const why = emailConsentSkip(consent.get(r.contact_id))
    if (why) { skip(r, email, why); continue }
    if (supp.has(email)) { skip(r, email, 'suppressed'); continue }
    rows.push({ campaign_id: campaignId, company_id: companyId, contact_id: r.contact_id || null, email, name: r.name || null, merge: mergeValues(r, brand.name), status: 'pending' })
  }
  const pending = rows.filter(r => r.status === 'pending').length
  if (!pending) throw new Error('Nobody in this audience can be emailed: nothing would be sent')
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from('email_campaign_recipients').upsert(rows.slice(i, i + 500), { onConflict: 'campaign_id,email', ignoreDuplicates: true })
    if (error) throw new Error('Couldn’t save the recipient list')
  }

  const skipped = Object.values(breakdown).reduce((a, b) => a + b, 0)
  const nowIso = new Date(deps.now ? deps.now() : Date.now()).toISOString()
  await db.from('campaigns').update({
    status: 'sending', recipients_total: pending, audience_count: pending, excluded_count: skipped,
    segments: 1, estimated_cost: 0, sent_at: nowIso, updated_at: nowIso,
  }).eq('id', campaignId)
  return { recipients: pending, skipped, skippedBreakdown: breakdown, sender: { from: sender.from, replyTo: sender.replyTo, shared: sender.shared } }
}

/** The idempotency key for one batch: the same people always give the same key. */
export function batchKey(campaignId: string, ids: string[]): string {
  return `ecamp-${createHash('sha256').update(`${campaignId}:${[...ids].sort().join(',')}`).digest('hex').slice(0, 48)}`
}

/** One email's payload for Resend. */
export function buildEmail(frozen: Frozen, row: any, companyId: string): any {
  const unsubToken = signUnsubToken({ co: companyId, c: row.contact_id || row.id, cam: row.campaign_id })
  const ref = signRecipientRef(row.id)
  const unsub = `${frozen.base}/api/email/unsubscribe?t=${encodeURIComponent(unsubToken)}`
  const vars: Record<string, string> = {
    ...(row.merge || {}),
    unsubscribe_url: unsub,
    preferences_url: `${frozen.base}/api/email/preferences?t=${encodeURIComponent(unsubToken)}`,
    open_pixel_url: `${frozen.base}/api/email/open?r=${encodeURIComponent(ref)}`,
  }
  for (const l of frozen.links) if (l.code) vars[l.token] = `${frozen.base}/l/${l.code}?r=${encodeURIComponent(ref)}`
  const tags = [{ name: 'campaign_id', value: row.campaign_id }, { name: 'company_id', value: companyId }]
  if (row.contact_id) tags.push({ name: 'contact_id', value: row.contact_id })
  return {
    from: frozen.from,
    to: [row.email],
    subject: fillSubject(frozen.subject, vars),
    html: fillTemplate(frozen.html, vars, { html: true }),
    text: fillTemplate(frozen.text, vars, { html: false }),
    headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    tags: tags.filter(t => /^[A-Za-z0-9_-]{1,256}$/.test(String(t.value))),
    ...(frozen.replyTo ? { reply_to: frozen.replyTo } : {}),
  }
}

type PostResult = { ok: true; ids: (string | null)[] } | { ok: false; retry: boolean; status: number; error: string; outOfTime?: boolean }

/** One Resend batch call with retries on 429 / 5xx, never sleeping past the deadline. */
async function postBatch(payload: any[], key: string, deps: Required<Pick<SenderDeps, 'fetch' | 'now' | 'sleep'>> & { apiKey: string; deadline: number }): Promise<PostResult> {
  let status = 0, error = ''
  for (let i = 0; i < MAX_TRIES_PER_CALL; i++) {
    let wait = 0
    try {
      const res = await deps.fetch(RESEND_BATCH_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${deps.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify(payload),
      })
      status = res.status
      const body: any = await res.json().catch(() => ({}))
      if (res.ok) return { ok: true, ids: (body?.data || []).map((d: any) => (d?.id ? String(d.id) : null)) }
      error = String(body?.message || body?.error || `Resend said ${status}`).slice(0, 300)
      // Same key still being processed: try again later, never a failure.
      const inFlight = status === 409 && /concurrent|in progress|processing/i.test(error)
      if (!inFlight && status !== 429 && status < 500) return { ok: false, retry: false, status, error }
      const after = Number(res.headers?.get?.('retry-after'))
      wait = Number.isFinite(after) && after > 0 ? after * 1000 : 1000 * 2 ** i
    } catch (e: any) {
      status = 0; error = e?.message || 'Resend didn’t answer'
      wait = 1000 * 2 ** i
    }
    wait = Math.min(wait, 8000)
    if (i === MAX_TRIES_PER_CALL - 1) break
    if (deps.now() + wait > deps.deadline) return { ok: false, retry: true, status, error, outOfTime: true }
    await deps.sleep(wait)
  }
  return { ok: false, retry: true, status, error }
}

export type BatchResult = { done: boolean; sent: number; failed: number; skipped: number; remaining?: number; stoppedForBudget?: boolean; reason?: string }

/**
 * Send pending recipients of a 'sending' email campaign until they run out or
 * the time budget does. Safe to call from overlapping cron runs.
 */
export async function sendEmailBatch(campaignId: string, deps: SenderDeps = {}): Promise<BatchResult> {
  const db = deps.db || emailAdminDb()
  const now = deps.now || Date.now
  const sleep = deps.sleep || sleeper
  const f = deps.fetch || fetch
  const started = now()
  const deadline = started + (deps.budgetMs ?? DEFAULT_BUDGET_MS) - RESERVE_MS
  const size = Math.max(1, Math.min(BATCH_SIZE, deps.batchSize || BATCH_SIZE))
  const out: BatchResult = { done: false, sent: 0, failed: 0, skipped: 0 }

  const { data: campaign } = await db.from('campaigns').select('*').eq('id', campaignId).maybeSingle()
  if (!campaign) return { ...out, done: true, reason: 'not found' }
  if (campaign.channel !== 'email') return { ...out, done: true, reason: 'not an email campaign' }
  if (campaign.status !== 'sending') return { ...out, done: true, reason: `status is ${campaign.status}` }
  const companyId = campaign.company_id
  const apiKey = deps.apiKey ?? process.env.RESEND_API_KEY ?? ''
  if (!apiKey) return { ...out, reason: 'Email isn’t set up on this server (no RESEND_API_KEY)' }

  const { data: design } = await db.from('email_designs').select('frozen').eq('campaign_id', campaignId).maybeSingle()
  const frozen: Frozen | null = design?.frozen || null
  if (!frozen?.html) return { ...out, reason: 'The campaign wasn’t prepared (no frozen email)' }

  // Rows claimed by a run that died: back in the queue, with their batch key.
  const staleBefore = new Date(started - STALE_CLAIM_MS).toISOString()
  await db.from('email_campaign_recipients').update({ status: 'pending' }).eq('campaign_id', campaignId).eq('status', 'sending').lt('claimed_at', staleBefore)

  let idle = 0
  while (now() < deadline) {
    // A batch that was tried before goes again exactly as it was.
    const { data: next } = await db.from('email_campaign_recipients').select('*').eq('campaign_id', campaignId).eq('status', 'pending')
      .order('batch_key', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true }).limit(size)
    if (!next?.length) break
    const group = next[0].batch_key ? next.filter((r: any) => r.batch_key === next[0].batch_key) : next.filter((r: any) => !r.batch_key)

    const claimedAt = new Date(now()).toISOString()
    const { data: claimed } = await db.from('email_campaign_recipients').update({ status: 'sending', claimed_at: claimedAt })
      .in('id', group.map((r: any) => r.id)).eq('status', 'pending').select('id')
    const claimedIds = new Set((claimed || []).map((r: any) => r.id))
    let rows = group.filter((r: any) => claimedIds.has(r.id))
    // Another run took them (or the claim failed): don't spin on the same rows.
    if (!rows.length) { if (++idle > 3) break; continue }
    idle = 0

    // Live consent and suppressions, right before sending.
    const consent = await loadConsent(db, companyId, rows.map((r: any) => r.contact_id).filter(Boolean))
    if (!consent) {
      await db.from('email_campaign_recipients').update({ status: 'pending' }).in('id', rows.map((r: any) => r.id))
      return { ...out, reason: 'Couldn’t check consent just now; will retry' }
    }
    const supp = await suppressedSet(db, companyId, rows.map((r: any) => r.email))
    const keep: any[] = []
    for (const r of rows) {
      const why = r.contact_id ? emailConsentSkip(consent.get(r.contact_id)) : null
      const reason = why || (supp.has(normEmail(r.email)) ? 'suppressed' : null)
      if (reason) {
        await db.from('email_campaign_recipients').update({ status: 'skipped', skip_reason: reason }).eq('id', r.id)
        out.skipped++
      } else keep.push(r)
    }
    rows = keep
    if (!rows.length) continue

    const key = batchKey(campaignId, rows.map((r: any) => r.id))
    if (rows.some((r: any) => r.batch_key !== key)) await db.from('email_campaign_recipients').update({ batch_key: key }).in('id', rows.map((r: any) => r.id))
    const payload = rows.map((r: any) => buildEmail(frozen, r, companyId))
    const res = await postBatch(payload, key, { fetch: f, now, sleep, apiKey, deadline })

    if (res.ok) {
      const sentAt = new Date(now()).toISOString()
      await db.from('email_campaign_recipients').upsert(rows.map((r: any, i: number) => ({
        id: r.id, campaign_id: r.campaign_id, company_id: r.company_id, email: r.email,
        status: 'sent', resend_email_id: res.ids[i] || null, sent_at: sentAt, batch_key: key, error: null, attempts: (r.attempts || 0) + 1,
      })), { onConflict: 'id' })
      out.sent += rows.length
      continue
    }
    const bad = res as Extract<PostResult, { ok: false }>
    if (bad.retry) {
      // Back in the queue with the same key; give up on a row after MAX_ATTEMPTS.
      for (const r of rows) {
        const attempts = (r.attempts || 0) + 1
        await db.from('email_campaign_recipients').update(attempts >= MAX_ATTEMPTS && !bad.outOfTime
          ? { status: 'failed', attempts, error: bad.error }
          : { status: 'pending', attempts: bad.outOfTime ? (r.attempts || 0) : attempts, error: bad.error, batch_key: key }).eq('id', r.id)
        if (attempts >= MAX_ATTEMPTS && !bad.outOfTime) out.failed++
      }
      if (bad.outOfTime) { out.stoppedForBudget = true; break }
      // Resend is struggling: leave the rest for the next run.
      break
    }
    // Refused outright (bad address, bad payload): these won't work on retry.
    await db.from('email_campaign_recipients').update({ status: 'failed', error: bad.error, attempts: (rows[0]?.attempts || 0) + 1 }).in('id', rows.map((r: any) => r.id))
    out.failed += rows.length
  }
  if (now() >= deadline) out.stoppedForBudget = true

  // Progress, and finish when nothing is left to send.
  const count = async (statuses: string[]) => {
    const { count: c } = await db.from('email_campaign_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId).in('status', statuses)
    return c || 0
  }
  const [remaining, sentTotal, failedTotal] = await Promise.all([count(['pending', 'sending']), count(['sent']), count(['failed'])])
  out.remaining = remaining
  const nowIso = new Date(now()).toISOString()
  if (!remaining) {
    await db.from('campaigns').update({ status: 'sent', sent_count: sentTotal, failed_count: failedTotal, completed_at: nowIso, updated_at: nowIso }).eq('id', campaignId)
    out.done = true
  } else {
    await db.from('campaigns').update({ sent_count: sentTotal, failed_count: failedTotal, updated_at: nowIso }).eq('id', campaignId)
  }
  return out
}
