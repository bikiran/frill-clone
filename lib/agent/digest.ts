// The weekly agent summary email: what the agents did, what they brought to
// the team, money won back, and anything they've earned more freedom for.
// Sent once a week (cron/agent-digest) to businesses whose agents worked that
// week, unless switched off on Agents → Results.

import { agentResults, ROLE_NAMES, type Results } from './results'
import { trustSuggestions, type TrustSuggestion } from './trust'
import { getDigest, setDigest } from './pilot'

const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
const money = (n: number) => `$${n.toLocaleString('en-AU', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
export const hoursText = (mins: number) => mins < 60 ? `${Math.round(mins)} min` : `${(mins / 60).toFixed(mins < 600 ? 1 : 0).replace(/\.0$/, '')} hours`

/** ISO week key, e.g. 2026-W42 — one email per business per week. */
export function weekKey(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const y = d.getUTCFullYear()
  const week = Math.ceil(((d.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1) / 7)
  return `${y}-W${String(week).padStart(2, '0')}`
}

export function buildDigest(opts: { companyName: string; base: string; results: Results; suggestions: TrustSuggestion[]; waiting: number }): { subject: string; html: string; text: string } {
  const { companyName, base, results: r, suggestions, waiting } = opts
  const c = r.current
  const decided = c.approvedAsIs + c.edited + c.dismissed
  const asIsPct = decided ? Math.round((c.approvedAsIs / decided) * 100) : null
  const won = c.cartsWonValue + c.quotesPaidValue
  const handled = c.sentOnOwn + c.approvedAsIs + c.edited
  const brought = c.escalated + c.tasks
  const subject = `Your agents this week: ${handled} handled, ${brought} brought to you`

  const tile = (label: string, value: string, note = '') => `
    <td style="padding:6px;width:25%;vertical-align:top">
      <div style="border:1px solid #e7e9ee;border-radius:12px;padding:12px 14px;background:#fff">
        <div style="font-size:12px;color:#667085">${esc(label)}</div>
        <div style="font-size:22px;font-weight:700;color:#101828;margin-top:2px">${esc(value)}</div>
        ${note ? `<div style="font-size:11.5px;color:#667085;margin-top:2px">${esc(note)}</div>` : ''}
      </div>
    </td>`
  const section = (title: string, body: string) => `<h2 style="font-size:15px;color:#101828;margin:24px 0 8px">${esc(title)}</h2>${body}`
  const button = (href: string, label: string) => `<a href="${esc(href)}" style="display:inline-block;background:#ff6b57;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:10px 18px;border-radius:10px">${esc(label)}</a>`

  const tiles = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>
    ${tile('Sent on their own', String(c.sentOnOwn))}
    ${tile('Approved as written', asIsPct == null ? '—' : `${asIsPct}%`, decided ? `of ${decided} drafts you decided` : '')}
    ${tile('Brought to you', String(brought), brought ? `${c.escalated} handed over · ${c.tasks} tasks` : '')}
    ${tile(won ? 'Won back' : 'Time saved', won ? money(won) : `about ${hoursText(c.minutesSaved)}`, won ? `${c.cartsWon + c.quotesPaid} paid after a follow-up` : 'estimate')}
  </tr></table>`

  const needs = [
    waiting ? `<p style="margin:0 0 10px;font-size:14px;color:#344054"><b>${waiting}</b> ${waiting === 1 ? 'thing is' : 'things are'} waiting for your approval.</p>` : '',
    r.exceptions.length ? `<ul style="margin:0 0 12px;padding-left:18px;color:#344054;font-size:13.5px;line-height:1.5">${r.exceptions.slice(0, 5).map(e => `<li><b>${esc(ROLE_NAMES[e.role] || e.role)}</b> ${e.kind === 'failed' ? 'ran into a problem' : 'handed over'}: ${esc(String(e.summary).slice(0, 160))}</li>`).join('')}</ul>` : '',
  ].join('')

  const extra = [
    c.reviewsAnswered + c.commentsAnswered ? `${c.reviewsAnswered} review${c.reviewsAnswered === 1 ? '' : 's'} and ${c.commentsAnswered} comment${c.commentsAnswered === 1 ? '' : 's'} answered` : '',
    c.ordersCaught ? `${c.ordersCaught} late or stuck order${c.ordersCaught === 1 ? '' : 's'} caught${c.customersUpdated ? `, ${c.customersUpdated} customer${c.customersUpdated === 1 ? '' : 's'} kept updated` : ''}` : '',
    `about ${hoursText(c.minutesSaved)} of your team’s time saved (an estimate)`,
  ].filter(Boolean)

  const trust = suggestions.slice(0, 3).map(s => `<div style="border:1px solid #e7e9ee;border-radius:12px;padding:12px 14px;margin-bottom:8px;background:#fff">
      <div style="font-size:14px;font-weight:700;color:#101828">${esc(s.title)}</div>
      <div style="font-size:13px;color:#667085;margin-top:3px">${esc(s.detail)}</div>
    </div>`).join('')

  const html = `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:620px;margin:0 auto;padding:24px 16px">
    <p style="font-size:13px;color:#667085;margin:0 0 4px">${esc(companyName)} · last 7 days</p>
    <h1 style="font-size:21px;color:#101828;margin:0 0 14px">Here’s what your agents did</h1>
    ${tiles}
    <ul style="margin:14px 0 0;padding-left:18px;color:#344054;font-size:13.5px;line-height:1.6">${extra.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    ${needs ? section('What they brought to you', needs) : ''}
    ${trust ? section('Ready for more freedom', `${trust}<p style="font-size:12.5px;color:#667085;margin:4px 0 0">Your team approved these almost every time without changes. One tap on the Results page lets the agent do them on its own, within your limits.</p>`) : ''}
    ${c.failed || c.failedDeliveries ? section('Worth a look', `<p style="margin:0;font-size:13.5px;color:#344054">${c.failed ? `${c.failed} run${c.failed === 1 ? '' : 's'} went wrong. ` : ''}${c.failedDeliveries ? `${c.failedDeliveries} approved message${c.failedDeliveries === 1 ? '' : 's'} didn’t go out.` : ''}</p>`) : ''}
    <div style="margin:24px 0">${button(`${base}/admin/agents/results`, 'See all results')}</div>
    <p style="font-size:11.5px;color:#98a2b3;margin:24px 0 0">You get this because Colvy agents worked for ${esc(companyName)} this week. Switch it off on Agents → Results.</p>
  </div></body></html>`

  const text = [
    `Here’s what your agents did — ${companyName}, last 7 days`,
    `Sent on their own: ${c.sentOnOwn}`,
    `Approved as written: ${asIsPct == null ? '—' : `${asIsPct}%`}`,
    `Brought to you: ${brought}`,
    won ? `Won back: ${money(won)}` : '',
    ...extra,
    waiting ? `${waiting} waiting for your approval.` : '',
    ...r.exceptions.slice(0, 5).map(e => `- ${ROLE_NAMES[e.role] || e.role}: ${e.summary}`),
    ...suggestions.slice(0, 3).map(s => `Ready for more freedom: ${s.title} — ${s.detail}`),
    `See all results: ${base}/admin/agents/results`,
  ].filter(Boolean).join('\n')
  return { subject, html, text }
}

async function recipient(db: any, company: any): Promise<string | null> {
  if (company.business_email) return String(company.business_email)
  if (!company.owner_id) return null
  try {
    const { data } = await db.auth.admin.getUserById(company.owner_id)
    return data?.user?.email || null
  } catch { return null }
}

/** Send this week's summaries. Safe to run more than once: one per business per week. */
export async function sendWeeklyDigests(db: any, now = new Date(), send?: (m: { to: string; subject: string; html: string; text: string }) => Promise<boolean>): Promise<{ considered: number; sent: number; skipped: number }> {
  const key = process.env.RESEND_API_KEY
  const deliver = send || (key ? async (m: { to: string; subject: string; html: string; text: string }) => {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'Colvy <notifications@updates.colvy.com>', ...m }) })
    return r.ok
  } : null)
  if (!deliver) return { considered: 0, sent: 0, skipped: 0 }

  const week = weekKey(now)
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString()
  const { data: active } = await db.from('agent_runs').select('company_id').eq('mode', 'live').gte('created_at', since).limit(10000)
  const ids = Array.from(new Set((active || []).map((r: any) => r.company_id).filter(Boolean))) as string[]
  let sent = 0, skipped = 0
  for (const id of ids) {
    try {
      const settings = await getDigest(db, id)
      if (!settings.enabled || settings.last_week === week) { skipped++; continue }
      const { data: company } = await db.from('companies').select('id, name, slug, business_email, owner_id, is_demo').eq('id', id).maybeSingle()
      if (!company || company.is_demo) { skipped++; continue }
      const to = await recipient(db, company)
      if (!to) { skipped++; continue }
      const results = await agentResults(db, id, 7, now.getTime())
      if (!results.current.runs) { skipped++; continue }
      const [suggestions, { count: waiting }] = await Promise.all([
        trustSuggestions(db, id),
        db.from('agent_approvals').select('id', { count: 'exact', head: true }).eq('company_id', id).eq('status', 'pending').then((r: any) => r, () => ({ count: 0 })),
      ])
      // Claim the week first, so an overlapping run can't send it twice.
      await setDigest(db, id, { last_week: week }, null)
      const base = company.slug ? `https://${company.slug}.colvy.com` : (process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com')
      const mail = buildDigest({ companyName: company.name || 'your business', base, results, suggestions, waiting: waiting || 0 })
      if (await deliver({ to, ...mail })) sent++
    } catch { skipped++ }
  }
  return { considered: ids.length, sent, skipped }
}
