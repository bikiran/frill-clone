import crypto from 'crypto'

// ── Colvy inbound email aliases ──────────────────────────────────────────────
// Multi-tenant inbound routing on a single Colvy-owned domain (in.colvy.com).
// Every outbound email carries a unique, signed Reply-To on this domain, so a
// customer's reply always comes back to Colvy's own working inbound domain —
// regardless of where their mailbox is hosted — and routes straight to the right
// tenant + ticket/conversation. Cold inbound (a customer emailing their support
// address) is supported by forwarding that address to the company's `u` alias.
//
// Alias shape:  <type>-<id>-<sig>@in.colvy.com
//   type: t = ticket, c = conversation, u = company (catch-all / forwarding)
//   id:   the row id (uuid) the mail routes to
//   sig:  short HMAC over "<type>:<id>" so aliases can't be guessed or spoofed
//
// Nothing is stored — aliases are derived from ids + a server secret, so this
// scales to every customer with no per-tenant provisioning.

export const INBOUND_DOMAIN = (process.env.COLVY_INBOUND_DOMAIN || 'in.colvy.com').toLowerCase()

// The inbound domain must be live in Resend (MX + verified) before we route
// replies to it — otherwise customer replies would bounce. This stays OFF until
// the super-admin sets COLVY_INBOUND_DOMAIN (or COLVY_INBOUND_ENABLED=true)
// after configuring Resend Inbound + DNS. Until then, outbound reply-to falls
// back to the mailbox's own address (previous behaviour), so nothing regresses.
export const INBOUND_ENABLED = !!process.env.COLVY_INBOUND_DOMAIN || process.env.COLVY_INBOUND_ENABLED === 'true'

// A stable secret to sign aliases. Falls back to other server secrets so a fresh
// deploy still produces consistent aliases; set COLVY_INBOUND_SECRET explicitly
// in production so aliases survive secret rotation elsewhere.
const SECRET = process.env.COLVY_INBOUND_SECRET
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.NEXTAUTH_SECRET
  || 'colvy-inbound-fallback-secret'

export type AliasType = 't' | 'c' | 'u'

function sign(type: AliasType, id: string): string {
  return crypto.createHmac('sha256', SECRET).update(`${type}:${id}`).digest('hex').slice(0, 10)
}

// Build the full Reply-To / forwarding alias for a target.
export function makeAlias(type: AliasType, id: string): string {
  return `${type}-${id}-${sign(type, id)}@${INBOUND_DOMAIN}`
}

// Convenience builders.
export const ticketAlias = (ticketId: string) => makeAlias('t', ticketId)
export const conversationAlias = (conversationId: string) => makeAlias('c', conversationId)
export const companyAlias = (companyId: string) => makeAlias('u', companyId)

// Parse + verify an inbound recipient. Returns the routing target, or null if it
// isn't one of our aliases (or the signature doesn't match).
export function parseAlias(address: string | null | undefined): { type: AliasType; id: string } | null {
  if (!address) return null
  const email = String(address).trim().toLowerCase()
  const at = email.indexOf('@')
  if (at < 0) return null
  const domain = email.slice(at + 1)
  if (domain !== INBOUND_DOMAIN) return null
  const local = email.slice(0, at)
  // <type>-<uuid>-<sig>. The uuid contains hyphens, so split off the ends.
  const first = local.indexOf('-')
  const last = local.lastIndexOf('-')
  if (first < 0 || last <= first) return null
  const type = local.slice(0, first) as AliasType
  const id = local.slice(first + 1, last)
  const sig = local.slice(last + 1)
  if (!['t', 'c', 'u'].includes(type) || !id || !sig) return null
  // Constant-time compare against the expected signature.
  const expected = sign(type, id)
  if (sig.length !== expected.length) return null
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  } catch { return null }
  return { type, id }
}
