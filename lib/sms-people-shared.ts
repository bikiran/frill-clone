// The SMS campaign People list's shape and the follow-up rules, shared by the
// server (lib/sms-campaign-report, api/campaigns/follow-up) and the report
// page, so the numbers on the buttons match who the follow-up goes to.

export type SmsPerson = {
  id: string                 // campaign_recipients row
  contactId: string | null
  name: string
  phone: string
  status: string             // sent / delivered / failed
  error: string | null
  sentAt: string | null
  deliveredAt: string | null
  clickedAt: string | null
  clicks: number
  link: string | null        // the page their link went to
  repliedAt: string | null   // first reply within 7 days (not STOP / START)
  replies: number
  reply: string | null       // their latest reply, shortened
  stoppedAt: string | null   // replied STOP within 14 days
  orders: number
  revenue: number
  outlet: string | null
  lastAt: string | null
}

export type SmsFilter = 'all' | 'clicked' | 'not_clicked' | 'replied' | 'ordered' | 'failed' | 'stopped'

export function inSmsFilter(p: SmsPerson, f: SmsFilter): boolean {
  switch (f) {
    case 'clicked': return !!p.clickedAt
    // Didn't click: it went out (not failed) and they haven't clicked.
    case 'not_clicked': return p.status !== 'failed' && !p.clickedAt
    case 'replied': return p.replies > 0
    case 'ordered': return p.orders > 0 || p.revenue > 0
    case 'failed': return p.status === 'failed'
    case 'stopped': return !!p.stoppedAt
    default: return true
  }
}

/** Could they be texted again? (The send checks consent again either way.) */
export const smsReachable = (p: SmsPerson) => !!p.contactId && p.status !== 'failed' && !p.stoppedAt

/** Who a follow-up goes to. */
export function smsFollowUpAudience(people: SmsPerson[], kind: 'not_clicked' | 'clicked_no_order'): string[] {
  const pick = kind === 'not_clicked'
    ? people.filter(p => smsReachable(p) && !p.clickedAt && !p.replies)
    : people.filter(p => smsReachable(p) && !!p.clickedAt && p.orders === 0 && p.revenue === 0)
  return [...new Set(pick.map(p => p.contactId as string))]
}
