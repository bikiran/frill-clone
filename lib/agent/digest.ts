// The weekly agent summary email: what the agents did, what they brought to
// the team, money won back, and anything they've earned more freedom for.
// Sent once a week (cron/agent-digest) to businesses whose agents worked that
// week, unless switched off on Agents → Results.

import { agentResults, ROLE_NAMES, type Results } from './results'
import { trustSuggestions, type TrustSuggestion } from './trust'
import { getDigest, setDigest } from './pilot'
import { colvyEmail, type EmailBlock, type EmailStat } from '@/lib/colvy-email'

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

  // On the shared layout (lib/colvy-email), which escapes every value.
  const tiles: EmailStat[] = [
    { label: 'Sent on their own', value: String(c.sentOnOwn) },
    { label: 'Approved as written', value: asIsPct == null ? '—' : `${asIsPct}%`, note: decided ? `of ${decided} drafts you decided` : '' },
    { label: 'Brought to you', value: String(brought), note: brought ? `${c.escalated} handed over · ${c.tasks} tasks` : '' },
    { label: won ? 'Won back' : 'Time saved', value: won ? money(won) : `about ${hoursText(c.minutesSaved)}`, note: won ? `${c.cartsWon + c.quotesPaid} paid after a follow-up` : 'estimate' },
  ]

  const extra = [
    c.reviewsAnswered + c.commentsAnswered ? `${c.reviewsAnswered} review${c.reviewsAnswered === 1 ? '' : 's'} and ${c.commentsAnswered} comment${c.commentsAnswered === 1 ? '' : 's'} answered` : '',
    c.ordersCaught ? `${c.ordersCaught} late or stuck order${c.ordersCaught === 1 ? '' : 's'} caught${c.customersUpdated ? `, ${c.customersUpdated} customer${c.customersUpdated === 1 ? '' : 's'} kept updated` : ''}` : '',
    c.waitlisted ? `${c.waitlisted} customer${c.waitlisted === 1 ? '' : 's'} added to a back-in-stock waiting list` : '',
    `about ${hoursText(c.minutesSaved)} of your team’s time saved (an estimate)`,
  ].filter(Boolean)

  const needs: EmailBlock[] = [
    ...(waiting ? [{ type: 'text', text: `**${waiting}** ${waiting === 1 ? 'thing is' : 'things are'} waiting for your approval.` } as EmailBlock] : []),
    ...(r.exceptions.length ? [{ type: 'list', items: r.exceptions.slice(0, 5).map(e => ({ title: ROLE_NAMES[e.role] || e.role, detail: `${e.kind === 'failed' ? 'ran into a problem' : 'handed over'}: ${String(e.summary).slice(0, 160)}` })) } as EmailBlock] : []),
  ]
  const worth = c.failed || c.failedDeliveries
    ? `${c.failed ? `${c.failed} run${c.failed === 1 ? '' : 's'} went wrong. ` : ''}${c.failedDeliveries ? `${c.failedDeliveries} approved message${c.failedDeliveries === 1 ? '' : 's'} didn’t go out.` : ''}`.trim()
    : ''

  const blocks: EmailBlock[] = [
    { type: 'stats', tiles },
    { type: 'list', items: extra.map(x => ({ title: x })) },
    ...(needs.length ? [{ type: 'heading', text: 'What they brought to you' } as EmailBlock, ...needs] : []),
    ...(suggestions.length ? [
      { type: 'heading', text: 'Ready for more freedom' } as EmailBlock,
      { type: 'cards', items: suggestions.slice(0, 3).map(s => ({ title: s.title, detail: s.detail })) } as EmailBlock,
      { type: 'text', small: true, text: 'Your team approved these almost every time without changes. One tap on the Results page lets the agent do them on its own, within your limits.' } as EmailBlock,
    ] : []),
    ...(worth ? [{ type: 'heading', text: 'Worth a look' } as EmailBlock, { type: 'text', text: worth } as EmailBlock] : []),
  ]

  const { html, text } = colvyEmail({
    preheader: `${handled} handled, ${brought} brought to you${waiting ? `, ${waiting} waiting for your approval` : ''}.`,
    kicker: `${companyName} · last 7 days`,
    title: 'Here’s what your agents did',
    blocks,
    cta: { label: 'See all results', url: `${base}/admin/agents/results` },
    footerNote: `You get this because Colvy agents worked for ${companyName} this week. Switch it off on Agents → Results.`,
  })

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
