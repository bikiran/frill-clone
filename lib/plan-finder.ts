// The pricing page's plan finder: a few questions about how a business will
// use Colvy, and the plan that covers it. Plan ids match the TIERS on
// app/pricing/Client.tsx (free / feedback / omnichannel = Inbox / everything),
// and the rules follow that page's comparison table, so the finder never
// recommends a plan that lacks something the visitor picked.

import { DEFAULT_PRICING, priceForParts } from '@/lib/sms-pricing'

export type PlanId = 'free' | 'feedback' | 'omnichannel' | 'everything'
export type Brand = 'colvy' | 'mine' | 'domain'

export type FinderAnswers = {
  channels: string[]   // where customers reach the business (CHANNELS ids)
  extras: string[]     // what else Colvy should handle (EXTRAS ids)
  texts: number        // SMS a month
  brand: Brand
  team: number         // people who need a login
}

export const CHANNELS = [
  { id: 'chat', label: 'Website chat' },
  { id: 'sms', label: 'SMS' },
  { id: 'calls', label: 'Phone calls' },
  { id: 'email', label: 'Email' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'messenger', label: 'Messenger' },
] as const

export const EXTRAS = [
  { id: 'bookings', label: 'Bookings & deposits', suite: 'inbox' },
  { id: 'store', label: 'Online store orders', suite: 'inbox' },
  { id: 'campaigns', label: 'SMS campaigns', suite: 'inbox' },
  { id: 'agents', label: 'AI agents', suite: 'inbox' },
  { id: 'ideas', label: 'Ideas & roadmap', suite: 'feedback' },
  { id: 'surveys', label: 'Surveys, polls & forms', suite: 'feedback' },
  { id: 'help', label: 'Help center', suite: 'feedback' },
  { id: 'insights', label: 'Advanced analytics', suite: 'platform' },
] as const

// SMS included each month on Inbox and Everything.
export const SMS_INCLUDED = 3000
// People the Free plan allows; every paid plan is unlimited.
export const FREE_SEATS = 2

const suiteOf = (id: string) => EXTRAS.find(e => e.id === id)?.suite

/** What texting beyond the monthly allowance would cost on prepaid credits. */
export function smsOverage(texts: number): { extra: number; rate: number; cost: number } | null {
  const extra = Math.max(0, Math.round(texts) - SMS_INCLUDED)
  if (!extra) return null
  const { pricePerPart } = priceForParts(DEFAULT_PRICING, extra)
  return { extra, rate: pricePerPart, cost: Math.round(extra * pricePerPart) }
}

export function recommendPlan(a: FinderAnswers): { plan: PlanId; reasons: string[] } {
  const inbox = a.channels.length > 0 || a.extras.some(e => suiteOf(e) === 'inbox')
  const feedback = a.extras.some(e => suiteOf(e) === 'feedback')
  const reasons: string[] = []

  // Things only Everything has.
  const whiteLabel = a.brand === 'domain' || (inbox && a.brand === 'mine')
  const insights = a.extras.includes('insights')

  if ((inbox && feedback) || whiteLabel || insights) {
    if (inbox && feedback) reasons.push('Inbox and the Feedback suite, working as one')
    if (a.extras.includes('agents')) reasons.push('All five AI agents')
    else if (inbox) reasons.push('Every channel in one shared inbox')
    else if (feedback) reasons.push('The full Feedback suite')
    if (a.brand === 'domain') reasons.push('Your brand on your own domain')
    else if (whiteLabel) reasons.push('White-label branding, no Colvy badge')
    if (insights) reasons.push('Advanced analytics and the AI writing assistant')
    if (a.channels.includes('sms') || a.extras.includes('campaigns')) reasons.push(`${SMS_INCLUDED.toLocaleString('en-AU')} SMS a month included`)
    return { plan: 'everything', reasons: reasons.slice(0, 3) }
  }

  if (inbox) {
    reasons.push(a.channels.length > 1 ? 'Every channel in one shared inbox' : 'A shared inbox with contacts and CRM')
    if (a.extras.includes('agents')) reasons.push('Five AI agents that answer, book and follow up')
    else if (a.extras.includes('bookings')) reasons.push('Online booking, deposits and reminders')
    else if (a.extras.includes('store')) reasons.push('WooCommerce and Shopify orders beside each chat')
    else reasons.push('AI flow automation that answers out of hours')
    reasons.push(a.channels.includes('sms') || a.extras.includes('campaigns')
      ? `${SMS_INCLUDED.toLocaleString('en-AU')} SMS a month included`
      : 'Unlimited team members')
    return { plan: 'omnichannel', reasons }
  }

  // Feedback only (or nothing picked yet).
  const needsPaid = a.team > FREE_SEATS || a.brand === 'mine' || a.extras.includes('surveys')
  if (!needsPaid) {
    return { plan: 'free', reasons: ['Ideas board, public roadmap and changelog', 'Help center and feedback widget', 'Free for up to 2 people, forever'] }
  }
  if (a.extras.includes('surveys')) reasons.push('Unlimited polls, surveys and forms')
  else reasons.push('Unlimited ideas, voting and roadmaps')
  if (a.brand === 'mine') reasons.push('No Colvy branding on your board')
  if (a.team > FREE_SEATS) reasons.push('Unlimited team members')
  if (reasons.length < 3) reasons.push('Unlimited help center articles')
  return { plan: 'feedback', reasons: reasons.slice(0, 3) }
}
