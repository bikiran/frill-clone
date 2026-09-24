// ── Colvy inbound email aliases ──────────────────────────────────────────────
// Multi-tenant inbound routing on a single, brand-friendly Colvy domain
// (reply.colvy.com). Outbound email carries a human-readable Reply-To that says
// exactly which thread it belongs to, so a customer's reply always returns to
// Colvy's own inbound domain — regardless of where their mailbox is hosted — and
// routes straight to the right ticket / tenant. Cold inbound (a customer emailing
// their support address) is supported by forwarding that address to the company
// alias. Aliases are readable, e.g.:
//
//   ticket-046216@reply.colvy.com   → support ticket TICK-046216
//   roxyaquarium@reply.colvy.com    → the company (forwarded support address,
//                                      and the reply-to for inbox email threads)
//
// Aliases carry no signature — they're resolved against real rows on receipt, and
// a support inbox is public by nature (anyone can email it). Nothing is stored;
// aliases are derived from the visible ticket number / company slug, so this
// scales to every customer with no per-tenant provisioning.

export const INBOUND_DOMAIN = (process.env.COLVY_INBOUND_DOMAIN || 'reply.colvy.com').toLowerCase()

// The inbound domain must be live (MX + verified in Resend, inbound webhook set)
// before we route replies to it — otherwise customer replies would bounce. Stays
// OFF until the super-admin sets COLVY_INBOUND_DOMAIN (or COLVY_INBOUND_ENABLED
// =true). Until then outbound reply-to falls back to the mailbox's own address,
// so nothing regresses.
export const INBOUND_ENABLED = !!process.env.COLVY_INBOUND_DOMAIN || process.env.COLVY_INBOUND_ENABLED === 'true'

const localSafe = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')

// The visible ticket reference without the "TICK-" prefix, e.g. TICK-046216 → 046216.
export const ticketRef = (ticketNumber: string) => localSafe(String(ticketNumber || '').replace(/^tick-/i, ''))

// Reply-To for a ticket:  ticket-046216@reply.colvy.com
export const ticketAlias = (ticketNumber: string) => `ticket-${ticketRef(ticketNumber)}@${INBOUND_DOMAIN}`

// The company's forwarding + inbox reply-to address:  <slug>@reply.colvy.com
export const companyAlias = (slug: string) => `${localSafe(slug) || 'support'}@${INBOUND_DOMAIN}`

export type InboundTarget =
  | { kind: 'ticket'; ref: string }   // ref = ticket number tail (resolve against support_tickets)
  | { kind: 'company'; ref: string }  // ref = company slug (resolve against companies)

// Parse an inbound recipient into a routing target, or null if it isn't one of
// ours. Resolution to a real row happens in the webhook (needs the DB).
export function parseInboundAlias(address: string | null | undefined): InboundTarget | null {
  if (!address) return null
  const email = String(address).trim().toLowerCase()
  const at = email.indexOf('@')
  if (at < 0) return null
  if (email.slice(at + 1) !== INBOUND_DOMAIN) return null
  const local = email.slice(0, at)
  if (!local) return null
  if (local.startsWith('ticket-')) {
    const ref = local.slice('ticket-'.length)
    return ref ? { kind: 'ticket', ref } : null
  }
  // Anything else on the inbound domain is treated as a company slug.
  return { kind: 'company', ref: local }
}
