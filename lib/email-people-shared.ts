// The email campaign People list's shape and the follow-up rules, shared by
// the server (lib/email-campaign-people, api/email-campaigns/follow-up) and the
// report page, so the numbers on the buttons match who the follow-up goes to.

export type EmailPerson = {
  id: string                // recipient row
  contactId: string | null
  name: string
  email: string
  status: string            // sent / failed / sending
  sentAt: string | null
  deliveredAt: string | null
  openedAt: string | null
  clickedAt: string | null
  bouncedAt: string | null
  complainedAt: string | null
  unsubscribedAt: string | null
  opens: number
  clicks: number
  links: string[]           // the links they clicked, most clicked first
  orders: number
  revenue: number
  lastAt: string | null     // their latest activity, for sorting
}

export type PeopleFilter = 'all' | 'clicked' | 'opened' | 'not_opened' | 'ordered' | 'bounced' | 'unsubscribed'

/** Could they be emailed again (not unsubscribed, complained or bounced)? */
export const reachable = (p: EmailPerson) => !!p.contactId && p.status !== 'failed' && !p.unsubscribedAt && !p.complainedAt && !p.bouncedAt

/** Does this person belong under a People filter? */
export function inFilter(p: EmailPerson, f: PeopleFilter): boolean {
  switch (f) {
    case 'clicked': return !!p.clickedAt
    case 'opened': return !!p.openedAt
    // Didn't open: it reached them (sent, not bounced) and there's no open or click.
    case 'not_opened': return p.status !== 'failed' && !p.bouncedAt && !p.openedAt
    case 'ordered': return p.orders > 0 || p.revenue > 0
    case 'bounced': return !!p.bouncedAt || p.status === 'failed'
    case 'unsubscribed': return !!p.unsubscribedAt || !!p.complainedAt
    default: return true
  }
}

/** Who a follow-up goes to. Never anyone who unsubscribed, complained or bounced. */
export function followUpAudience(people: EmailPerson[], kind: 'not_opened' | 'clicked_no_order'): string[] {
  const ok = reachable
  const pick = kind === 'not_opened'
    ? people.filter(p => ok(p) && !p.openedAt)
    : people.filter(p => ok(p) && !!p.clickedAt && p.orders === 0 && p.revenue === 0)
  return [...new Set(pick.map(p => p.contactId as string))]
}
