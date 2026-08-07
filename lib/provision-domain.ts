// Provision a company board's subdomain automatically — one engine, used by
// every path that creates a company (auth/callback, /api/companies) plus a
// self-healing "ensure my domain" call. Keeps DNS on Cloudflare (no Vercel
// nameserver delegation, no wildcard): each {slug}.colvy.com is registered on
// the Vercel project AND given a Cloudflare CNAME, so it resolves and gets a
// per-host certificate with zero manual steps.
//
// Never throws — returns a structured result so callers can log without risk of
// breaking signup. Idempotent: "already exists" on either side counts as success.

const VERCEL_TOKEN = process.env.VERCEL_TOKEN || ''
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || ''
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || ''
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN || ''
const CF_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID || ''
// Vercel's canonical CNAME target for a subdomain. Overridable in case an
// account uses a different endpoint than the documented default.
const CNAME_TARGET = process.env.VERCEL_CNAME_TARGET || 'cname.vercel-dns.com'

export interface ProvisionResult {
  domain: string
  ok: boolean
  vercel: { success?: boolean; already?: boolean; error?: string; code?: string; skipped?: boolean }
  cloudflare: { success?: boolean; already?: boolean; error?: string; skipped?: boolean }
}

async function vercelReq(method: string, path: string, body?: any): Promise<any> {
  const teamParam = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : ''
  const res = await fetch(`https://api.vercel.com${path}${teamParam}`, {
    method,
    headers: { 'Authorization': `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json().catch(() => ({}))
}

/**
 * Ensure {domain} (a *.colvy.com host) is served by Vercel and resolvable via
 * Cloudflare. Safe to call repeatedly.
 */
export async function provisionSubdomain(domain: string): Promise<ProvisionResult> {
  const result: ProvisionResult = { domain, ok: false, vercel: {}, cloudflare: {} }
  if (!domain || !domain.endsWith('.colvy.com')) {
    result.vercel = { error: 'Only *.colvy.com subdomains can be provisioned' }
    return result
  }

  // ── 1. Add the domain to the Vercel project (needs the team id — the project
  //       lives under a team, so a team-less request is rejected). ────────────
  if (VERCEL_TOKEN && VERCEL_PROJECT_ID) {
    try {
      const r = await vercelReq('POST', `/v10/projects/${VERCEL_PROJECT_ID}/domains`, { name: domain })
      if (r?.error) {
        // Already attached to this project → treat as success (idempotent).
        const alreadyHere = /already.*in use|already exists|domain_already/i.test(r.error.code || r.error.message || '')
        result.vercel = alreadyHere ? { success: true, already: true } : { error: r.error.message, code: r.error.code }
      } else {
        result.vercel = { success: true }
      }
    } catch (e: any) {
      result.vercel = { error: e?.message || 'Vercel request failed' }
    }
  } else {
    result.vercel = { skipped: true, error: 'Set VERCEL_TOKEN, VERCEL_PROJECT_ID and VERCEL_TEAM_ID' }
  }

  // ── 2. Point the subdomain at Vercel via a Cloudflare CNAME (DNS only). ─────
  const sub = domain.replace('.colvy.com', '')
  if (CF_TOKEN && CF_ZONE_ID) {
    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'CNAME', name: sub, content: CNAME_TARGET, ttl: 1, proxied: false }),
      })
      const cf = await res.json().catch(() => ({}))
      if (cf?.success) {
        result.cloudflare = { success: true }
      } else {
        // 81053 = record already exists → idempotent success.
        const already = (cf?.errors || []).some((e: any) => e.code === 81053)
        result.cloudflare = already ? { success: true, already: true } : { error: cf?.errors?.[0]?.message || 'Cloudflare error' }
      }
    } catch (e: any) {
      result.cloudflare = { error: e?.message || 'Cloudflare request failed' }
    }
  } else {
    result.cloudflare = { skipped: true, error: 'Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID' }
  }

  result.ok = !!(result.vercel.success && (result.cloudflare.success || result.cloudflare.skipped))
  return result
}
