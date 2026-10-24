// Customer health for Super Admin → Intelligence: one score per business,
// 0–100, from what it actually does in Colvy, with the reasons in plain
// words. Pure (no database), so the rules are easy to read and test; the
// inputs come from intel_company_activity() and company_milestones (V415).
//
//   Engagement  35  someone on the team signed in recently
//   Usage       30  customers are messaging and the business is replying
//   Setup       20  a channel, a store or orders, a teammate, an automation
//   Reliability 15  connections working, AI agents not failing
//
// Bands: healthy ≥ 70, needs attention 40–69, at risk < 40. A business in its
// first 14 days is "new": scored the same, but judged on getting set up.
// A failing payment caps the score at 39 (at risk); unanswered customer
// messages at 59 (needs attention).

export type HealthBand = 'healthy' | 'attention' | 'at_risk' | 'new'

export type HealthInput = {
  ageDays: number
  inboundRecent: number      // customer messages, last 14 days
  inboundPrevious: number    // the 14 days before
  repliesRecent: number      // team replies, last 14 days
  aiRepliesRecent: number
  lastSignInAt: string | null
  lastInboundAt: string | null
  orders30d: number
  bookings30d: number
  payments30d: number
  agentFailed7d: number
  staff: number
  integrationIssues: string[] // e.g. "Instagram: Token expired"
  subscriptionStatus: string | null
  milestones: Set<string>
}

export type HealthReason = { text: string; tone: 'bad' | 'warn' | 'good' }
export type HealthResult = { score: number; band: HealthBand; reasons: HealthReason[]; parts: Record<string, number> }

const DAY = 86_400_000
const daysSince = (iso: string | null, now: number) => (iso ? Math.max(0, (now - new Date(iso).getTime()) / DAY) : Infinity)
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function scoreHealth(x: HealthInput, now = Date.now()): HealthResult {
  const reasons: HealthReason[] = []
  const m = x.milestones

  // Engagement: the last time anyone on the team signed in.
  const signIn = daysSince(x.lastSignInAt, now)
  const engagement = signIn <= 3 ? 35 : signIn <= 7 ? 28 : signIn <= 14 ? 18 : signIn <= 30 ? 8 : 0
  if (signIn === Infinity) reasons.push({ text: 'Nobody has signed in', tone: 'bad' })
  else if (signIn > 14) reasons.push({ text: `No sign-in for ${Math.floor(signIn)} days`, tone: signIn > 30 ? 'bad' : 'warn' })

  // Usage: customers messaging and the business answering (people or AI).
  const replies = x.repliesRecent + x.aiRepliesRecent
  let usage = 0
  if (x.inboundRecent > 0 && replies > 0) usage = replies >= 20 ? 30 : replies >= 5 ? 22 : 14
  else if (x.inboundRecent > 0) { usage = 6; reasons.push({ text: `${plural(x.inboundRecent, 'customer message')}, no replies in 14 days`, tone: 'bad' }) }
  else if (x.orders30d + x.bookings30d + x.payments30d > 0) usage = 10
  else if (x.ageDays >= 14) reasons.push({ text: 'No customer messages in 14 days', tone: 'warn' })
  if (x.inboundPrevious >= 10 && x.inboundRecent < x.inboundPrevious * 0.5) {
    const drop = Math.round((1 - x.inboundRecent / x.inboundPrevious) * 100)
    usage = Math.max(0, usage - 10)
    reasons.push({ text: `Customer messages down ${drop}% on the previous 14 days`, tone: 'warn' })
  }

  // Setup depth.
  const channel = m.has('channel_connected')
  const store = m.has('store_connected') || m.has('first_order')
  const team = m.has('teammate_joined') || x.staff > 1
  const automation = m.has('agent_enabled') || m.has('first_review_request') || m.has('first_campaign') || m.has('first_ai_reply')
  const setup = (channel ? 8 : 0) + (store ? 4 : 0) + (team ? 4 : 0) + (automation ? 4 : 0)
  if (!channel) reasons.push({ text: 'No channel connected', tone: x.ageDays >= 3 ? 'bad' : 'warn' })

  // Reliability.
  let reliability = 15
  if (x.integrationIssues.length) {
    reliability -= Math.min(10, x.integrationIssues.length * 5)
    reasons.push({ text: x.integrationIssues.length === 1 ? x.integrationIssues[0] : `${x.integrationIssues.length} connections need attention`, tone: 'bad' })
  }
  if (x.agentFailed7d >= 3) { reliability -= 5; reasons.push({ text: `${x.agentFailed7d} failed AI agent runs this week`, tone: 'warn' }) }

  let score = Math.max(0, Math.min(100, engagement + usage + setup + reliability))
  // Customers writing in and nobody answering is never healthy, however set up.
  if (x.inboundRecent > 0 && replies === 0) score = Math.min(score, 59)
  const status = String(x.subscriptionStatus || '').toLowerCase()
  if (status === 'past_due' || status === 'unpaid') {
    score = Math.min(score, 39)
    reasons.unshift({ text: 'Payment failing', tone: 'bad' })
  }

  // Good news, when there's room to say it.
  if (usage >= 22) reasons.push({ text: `${plural(replies, 'reply', 'replies')} to customers in 14 days`, tone: 'good' })
  if (m.has('activated') && x.ageDays < 14) reasons.push({ text: 'Activated', tone: 'good' })

  const band: HealthBand = x.ageDays < 14 && status !== 'past_due' && status !== 'unpaid' ? 'new'
    : score >= 70 ? 'healthy' : score >= 40 ? 'attention' : 'at_risk'
  const order = { bad: 0, warn: 1, good: 2 }
  reasons.sort((a, b) => order[a.tone] - order[b.tone])
  return { score, band, reasons: reasons.slice(0, 4), parts: { engagement, usage, setup, reliability } }
}

export const BAND_LABEL: Record<HealthBand, string> = { healthy: 'Healthy', attention: 'Needs attention', at_risk: 'At risk', new: 'New' }
