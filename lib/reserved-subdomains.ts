// *.colvy.com labels that belong to Colvy itself, never to a company board.
// Shared by proxy.ts (routing) and lib/tenant-meta.ts (page metadata) so the
// two can't disagree about which hosts are a company's.
export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set(['www', 'api', 'mail', 'smtp', 'cdn', 'assets', 'static', 'admin'])

// Names a new board can't take at sign-up: the hosts above plus Colvy's own
// pages and brand (the same list the sign-up form checks in lib/board.ts).
const SIGNUP_RESERVED = new Set([...RESERVED_SUBDOMAINS, 'app', 'colvy', 'help', 'support', 'billing', 'dashboard', 'login', 'signup', 'landing'])

/** May a new business take this board URL? Format and reserved names only (not whether it's taken). */
export function boardSlugAllowed(slug: string): boolean {
  const s = String(slug || '').toLowerCase()
  return /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(s) && !SIGNUP_RESERVED.has(s)
}
