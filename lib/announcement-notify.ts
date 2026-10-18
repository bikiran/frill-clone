// "Publish & notify": tells people about a published announcement.
//
//   • Board bell — an in-app notification for the people on the company's
//     public board: its board members (team_members role 'viewer', the people
//     who signed up on the board) and anyone who voted for the roadmap idea the
//     post is linked to. Never the team (they wrote it), never another
//     company's users. 'announcement' is a board type the browser can't write
//     (V384), so only this server code makes them.
//   • Email — customers who opted in to marketing, through the same audience
//     rules campaigns use (lib/campaign-audience.ts resolveAudience: blocked,
//     unsubscribed and no-consent contacts are left out), narrowed to the
//     post's outlet(s) or segment. Every email has a working unsubscribe link
//     (Spam Act) and List-Unsubscribe headers.
//
// SMS is deliberately NOT sent from here: it costs money per message, so a
// post becomes a draft SMS campaign (lib/announcements-sms.ts) that the owner
// reviews, with cost, consent exclusions and quiet hours, before sending.
// Server-only.

import { resolveAudience, type ResolvedRecipient } from '@/lib/campaign-audience'
import { audienceFilterOf, categoryOf, segmentOf, toPublicAnnouncement } from '@/lib/announcements'
import { escapeHtml } from '@/lib/safe-html'
import { signUnsubToken } from '@/lib/email-tokens'
import { filterEmailable } from '@/lib/email-suppression'
import { unsubscribeEverything } from '@/lib/email-preferences'
import { staffUserIds } from '@/lib/company-access'
import { missingColumn } from '@/lib/announcements-server'

export const NOTIFY_PER_HOUR = 4          // per company: sends of any post
export const MAX_EMAILS = 5000            // per post
export const MAX_BOARD = 3000             // bell notifications per post
const FALLBACK_FROM = 'notifications@updates.colvy.com'

export type NotifyResult = { board: number; email: number; emailFailed: number; emailSkipped: number; emailMatched: number; errors: string[]; done: { board?: boolean; email?: boolean } }
export { doneChannels, type Channels } from '@/lib/announcements'
import { doneChannels } from '@/lib/announcements'

export function boardUrl(company: any): string {
  return company?.slug ? `https://${company.slug}.colvy.com` : 'https://colvy.com'
}
export function postUrl(company: any, id: string): string {
  return `${boardUrl(company)}/announcements?id=${id}`
}

/**
 * Unsubscribe link token: names the contact and company, signed. The same
 * token and links as campaign email (lib/email-tokens); older announcement
 * tokens still work.
 */
export function unsubscribeToken(companyId: string, contactId: string): string {
  return signUnsubToken({ co: companyId, c: contactId })
}

/**
 * Claim the right to send for this post: moves notified_at on only if it
 * still has the value this request read, so two clicks (or the cron and a
 * click) can't both send. The caller puts it back if nothing went out.
 */
export async function claimNotify(db: any, id: string, prev: string | null = null): Promise<boolean> {
  let q = db.from('announcements').update({ notified_at: new Date().toISOString() }).eq('id', id)
  q = prev ? q.eq('notified_at', prev) : q.is('notified_at', null)
  const { data, error } = await q.select('id')
  if (error) return false
  return (data || []).length > 0
}

/** Posts this company has notified about in the last hour. */
export async function recentNotifyCount(db: any, companyId: string): Promise<number> {
  const since = new Date(Date.now() - 3600_000).toISOString()
  const { count } = await db.from('announcements').select('id', { count: 'exact', head: true })
    .eq('company_id', companyId).gte('notified_at', since)
  return count || 0
}

/** Board people to put a bell notification in front of. */
export async function boardRecipients(db: any, companyId: string, ideaId?: string | null): Promise<string[]> {
  const ids = new Set<string>()
  try {
    const { data } = await db.from('team_members').select('user_id, role, status').eq('company_id', companyId).eq('role', 'viewer').limit(MAX_BOARD)
    for (const r of data || []) if (r.user_id && String(r.status || '').toLowerCase() !== 'removed') ids.add(r.user_id)
  } catch {}
  if (ideaId) {
    try {
      const { data: idea } = await db.from('ideas').select('id, company_id').eq('id', ideaId).maybeSingle()
      if (idea?.company_id === companyId) {
        const { data: votes } = await db.from('votes').select('user_id').eq('idea_id', ideaId).limit(MAX_BOARD)
        for (const v of votes || []) if (v.user_id) ids.add(v.user_id)
      }
    } catch {}
  }
  const staff = await staffUserIds(db, companyId).catch(() => new Set<string>())
  return [...ids].filter(id => !staff.has(id)).slice(0, MAX_BOARD)
}

async function insertBell(db: any, rows: any[]): Promise<number> {
  let n = 0
  for (let i = 0; i < rows.length; i += 200) {
    let chunk = rows.slice(i, i + 200)
    for (let tries = 0; tries < 5; tries++) {
      const { error } = await db.from('notifications').insert(chunk)
      if (!error) { n += chunk.length; break }
      const col = missingColumn(error)
      if (!col || !(col in chunk[0])) { console.warn('[announcement-notify] bell insert failed', error.message); break }
      chunk = chunk.map((r: any) => { const c = { ...r }; delete c[col]; return c })
    }
  }
  return n
}

/** Email recipients for this post: opted-in contacts in its audience. */
export async function emailRecipients(companyId: string, a: any): Promise<{ recipients: ResolvedRecipient[]; matched: number; skipped: number }> {
  const outlets: string[] = Array.isArray(a?.location_ids) ? a.location_ids.filter(Boolean) : []
  const filters = !segmentOf(a) && outlets.length > 1
    ? outlets.map(locationId => ({ type: 'outlet' as const, locationId }))
    : [audienceFilterOf(a)]
  const seen = new Set<string>()
  const recipients: ResolvedRecipient[] = []
  let matched = 0, skipped = 0
  for (const f of filters) {
    const r = await resolveAudience(companyId, f as any, 'email')
    matched += r.matched; skipped += r.excludedTotal
    for (const c of r.recipients) {
      const key = String(c.email || '').toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key); recipients.push(c)
    }
  }
  return { recipients: recipients.slice(0, MAX_EMAILS), matched, skipped }
}

/** The email for one customer. Everything from the post is escaped or cleaned. */
export function emailHtml(company: any, a: any, unsubUrl: string): string {
  const p = toPublicAnnouncement(a)
  const accent = /^#[0-9a-f]{6}$/i.test(company?.accent_color || '') ? company.accent_color : '#ff7a6b'
  const name = escapeHtml(company?.name || 'Our team')
  const url = escapeHtml(postUrl(company, p.id))
  const text = p.excerpt.length > 0 ? escapeHtml(p.excerpt) : ''
  const cover = p.cover_image && /^https:/i.test(p.cover_image) ? `<img src="${escapeHtml(p.cover_image)}" alt="" width="512" style="display:block;width:100%;max-width:512px;height:auto;border-radius:14px;margin:0 0 24px" />` : ''
  const cta = p.cta_url && /^https?:/i.test(p.cta_url) ? escapeHtml(p.cta_url) : url
  const ctaLabel = escapeHtml(p.cta_url ? (p.cta_label || 'Learn more') : 'Read the full update')
  return `<!doctype html><html><body style="margin:0;background:#f6f6f7">
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:36px 24px;background:#ffffff">
  <p style="font-size:13px;font-weight:600;color:#6b7280;margin:0 0 20px">${name}</p>
  ${cover}
  <p style="font-size:12px;font-weight:700;color:${accent};text-transform:uppercase;letter-spacing:.08em;margin:0 0 8px">${escapeHtml(categoryOf(a.tag).label)}</p>
  <h1 style="font-size:26px;line-height:1.25;font-weight:800;color:#111111;margin:0 0 14px">${escapeHtml(p.title)}</h1>
  <p style="font-size:15px;color:#4b5563;line-height:1.6;margin:0 0 26px">${text}</p>
  <a href="${cta}" style="display:inline-block;background:${accent};color:#ffffff;padding:13px 26px;border-radius:12px;font-weight:700;font-size:14px;text-decoration:none">${ctaLabel}</a>
  <hr style="border:none;border-top:1px solid #eeeeee;margin:36px 0 16px">
  <p style="font-size:12px;color:#9ca3af;line-height:1.5;margin:0">You’re getting this because you agreed to hear from ${name}. <a href="${escapeHtml(unsubUrl)}" style="color:#9ca3af">Unsubscribe</a>.</p>
</div></body></html>`
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

/** One Resend batch, retried on 429 and server errors with a short backoff. */
async function postBatch(key: string, batch: any[], tries = 3): Promise<{ ok: boolean; status: number }> {
  let status = 0
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      })
      if (res.ok) return { ok: true, status: res.status }
      status = res.status
      if (status !== 429 && status < 500) return { ok: false, status }
      const after = Number(res.headers.get('retry-after'))
      await wait(Math.min(5000, Number.isFinite(after) && after > 0 ? after * 1000 : 800 * 2 ** i))
    } catch { status = 0; await wait(800 * 2 ** i) }
  }
  return { ok: false, status }
}

async function sendEmails(db: any, company: any, a: any, recipients: ResolvedRecipient[], siteBase: string): Promise<{ sent: number; failed: number; errors: string[] }> {
  const key = process.env.RESEND_API_KEY
  if (!key || !recipients.length) return { sent: 0, failed: 0, errors: key ? [] : ['Email isn’t set up on this server'] }
  const from = FALLBACK_FROM
  let fromName = company?.name || 'Colvy', replyTo: string | undefined
  try {
    const { data: ec } = await db.from('email_channels').select('from_address, from_name, inbound_address').eq('company_id', company.id).eq('is_active', true).limit(1)
    if (ec?.[0]?.from_name) fromName = ec[0].from_name
    replyTo = ec?.[0]?.from_address || ec?.[0]?.inbound_address || undefined
  } catch {}
  const safeName = String(fromName).replace(/[<>"\r\n]/g, '').slice(0, 80)
  const subject = `${String(company?.name || '').replace(/[\r\n]/g, '')}: ${String(a.title || '').replace(/[\r\n]/g, ' ')}`.slice(0, 200)
  const p = toPublicAnnouncement(a)
  let sent = 0, failed = 0
  const errors: string[] = []
  // Live check: email-only opt-outs and bounced / complained addresses (V396).
  recipients = (await filterEmailable(db, company.id, recipients)).keep
  for (let i = 0; i < recipients.length; i += 90) {
    const chunk = recipients.slice(i, i + 90)
    const batch = chunk.map(c => {
      const unsub = `${siteBase}/api/email/unsubscribe?t=${encodeURIComponent(unsubscribeToken(company.id, c.contact_id))}`
      return {
        from: `${safeName} <${from}>`,
        to: [c.email],
        subject,
        html: emailHtml(company, a, unsub),
        text: `${p.title}\n\n${p.excerpt}\n\n${postUrl(company, p.id)}\n\nUnsubscribe: ${unsub}`,
        headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        ...(replyTo ? { reply_to: replyTo } : {}),
      }
    })
    const r = await postBatch(key, batch)
    if (r.ok) sent += chunk.length
    else { failed += chunk.length; errors.push(`${chunk.length} email${chunk.length === 1 ? '' : 's'} couldn’t be sent (${r.status || 'no answer'})`) }
  }
  return { sent, failed, errors }
}

/**
 * Notify about one post. The caller has checked staff access (or is the
 * cron), that the post is live, and claimed it with claimNotify().
 */
export async function notifyAnnouncement(db: any, a: any, opts: { board: boolean; email: boolean; siteBase: string }): Promise<NotifyResult> {
  const result: NotifyResult = { board: 0, email: 0, emailFailed: 0, emailSkipped: 0, emailMatched: 0, errors: [], done: { ...doneChannels(a) } }
  const { data: company } = await db.from('companies').select('id, name, slug, accent_color, logo_url').eq('id', a.company_id).maybeSingle()
  if (!company) { result.errors.push('Company not found'); return result }

  if (opts.board) {
    try {
      const users = await boardRecipients(db, company.id, a.idea_id)
      const link = `/announcements?id=${a.id}`
      result.board = await insertBell(db, users.map(user_id => ({
        user_id, type: 'announcement', company_id: company.id,
        message: `New update from ${company.name || 'the team'}: “${String(a.title || '').slice(0, 140)}”`,
        actor_name: company.name || null, link, related_idea_id: null, is_read: false,
      })))
      // Done once everyone there now has it (nobody yet counts as done too).
      if (result.board === users.length) result.done.board = true
      else result.errors.push('Some board notifications didn’t save')
    } catch (e: any) { result.errors.push('Board notifications failed') }
  }

  if (opts.email) {
    try {
      const { recipients, matched, skipped } = await emailRecipients(company.id, a)
      result.emailMatched = matched; result.emailSkipped = skipped
      const r = await sendEmails(db, company, a, recipients, opts.siteBase)
      result.email = r.sent; result.emailFailed = r.failed; result.errors.push(...r.errors)
      // Done once anything went out: a retry would email those people twice.
      // Failed batches are counted so the team can see the gap.
      if (r.sent > 0) result.done.email = true
    } catch (e: any) { result.errors.push('Email failed') }
  }

  // Remember what happened (V387 column; quietly skipped before it runs).
  try {
    const prev = a.notify_stats && typeof a.notify_stats === 'object' ? a.notify_stats : {}
    await db.from('announcements').update({ notify_stats: {
      ...prev, done: result.done,
      board: (opts.board ? result.board : 0) + (Number(prev.board) || 0),
      email: (opts.email ? result.email : 0) + (Number(prev.email) || 0),
      ...(opts.email ? { email_failed: result.emailFailed, skipped: result.emailSkipped } : {}),
      at: new Date().toISOString(),
    } }).eq('id', a.id)
  } catch {}
  return result
}

/**
 * Unsubscribe this person from all of the business's marketing (email and
 * texts): the contact the link names and every other contact of that
 * business with the same email. Kept for callers of the old helper; the
 * rules live in lib/email-preferences.ts.
 */
export async function unsubscribeContact(db: any, companyId: string, contact: { id: string; email?: string | null }): Promise<number> {
  return unsubscribeEverything(db, companyId, contact, { source: 'Announcement email: unsubscribe link' })
}
