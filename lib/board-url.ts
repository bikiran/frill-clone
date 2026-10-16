// A company's public board address: the one place that decides it, so the
// widget's Board link, "View public" buttons and the like can't disagree.
//
// Every company's board lives at https://<slug>.colvy.com. proxy.ts routes any
// *.colvy.com label that isn't a Colvy host (www, admin, api…) to that board,
// and lib/provision-domain.ts adds the host to Vercel and Cloudflare so it gets
// a certificate. A board domain the company verified (Settings → Domains, e.g.
// feedback.theirsite.com) wins over the subdomain.

export type BoardCompany = {
  slug?: string | null
  board_domain?: string | null
  board_domain_verified?: boolean | null
}

const HOST_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

function cleanHost(raw: string | null | undefined): string {
  const h = String(raw || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/\.$/, '')
  return HOST_RE.test(h) ? h : ''
}

/** The <slug>.colvy.com host for a slug, or '' when the slug isn't a valid label. */
export function boardSubdomain(slug: string | null | undefined): string {
  const s = String(slug || '').trim().toLowerCase()
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s) ? `${s}.colvy.com` : ''
}

/** The company's public board URL (no trailing slash). */
export function publicBoardUrl(co: BoardCompany | null | undefined): string {
  const custom = co?.board_domain_verified ? cleanHost(co.board_domain) : ''
  if (custom) return `https://${custom}`
  const sub = boardSubdomain(co?.slug)
  return sub ? `https://${sub}` : 'https://colvy.com'
}
