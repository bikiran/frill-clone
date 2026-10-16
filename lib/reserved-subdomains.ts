// *.colvy.com labels that belong to Colvy itself, never to a company board.
// Shared by proxy.ts (routing) and lib/tenant-meta.ts (page metadata) so the
// two can't disagree about which hosts are a company's.
export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set(['www', 'api', 'mail', 'smtp', 'cdn', 'assets', 'static', 'admin'])
