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

export interface CustomDomainResult {
  domain: string
  configured: boolean          // Vercel is set up (token present)
  registered: boolean          // the domain is attached to the project
  verified: boolean            // Vercel confirms it points here + cert issued
  misconfigured: boolean       // DNS not (yet) pointing at Vercel
  records: { type: string; name: string; value: string }[]  // what to add in DNS
  error?: string
}

// Register a CUSTOMER-OWNED custom domain (e.g. help.acme.com.au) on the Vercel
// project and report its verification status. Unlike provisionSubdomain this
// does NOT touch Cloudflare — the customer owns their own DNS — it just makes
// Vercel serve the host (so it stops 404-ing with DEPLOYMENT_NOT_FOUND) and
// tells us exactly which DNS records they still need to add. Idempotent.
export async function provisionCustomDomain(domain: string): Promise<CustomDomainResult> {
  const out: CustomDomainResult = { domain, configured: false, registered: false, verified: false, misconfigured: true, records: [] }
  const clean = (domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  out.domain = clean
  if (!clean || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(clean)) { out.error = 'Enter a valid domain, e.g. help.yourcompany.com'; return out }
  if (clean.endsWith('.colvy.com')) { out.error = 'Use the automatic subdomain flow for *.colvy.com'; return out }
  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
    // No Vercel access — fall back to the documented manual CNAME.
    out.records = [{ type: 'CNAME', name: clean.split('.')[0], value: 'cname.vercel-dns.com' }]
    out.error = 'Vercel is not configured on the server (set VERCEL_TOKEN + VERCEL_PROJECT_ID).'
    return out
  }
  out.configured = true

  // 1) Attach the domain to the project (idempotent).
  try {
    const r = await vercelReq('POST', `/v10/projects/${VERCEL_PROJECT_ID}/domains`, { name: clean })
    const already = r?.error && /already.*in use|already exists|domain_already/i.test(r.error.code || r.error.message || '')
    out.registered = !r?.error || !!already
    if (r?.error && !already) out.error = r.error.message
  } catch (e: any) { out.error = e?.message || 'Vercel request failed' }

  // 2) Read verification state + the exact records Vercel wants.
  try {
    const info = await vercelReq('GET', `/v9/projects/${VERCEL_PROJECT_ID}/domains/${clean}`)
    if (info && !info.error) {
      out.verified = !!info.verified
      // Vercel returns pending TXT/records under `verification` until verified.
      for (const v of (info.verification || [])) {
        if (v?.type && v?.domain != null && v?.value != null) out.records.push({ type: v.type, name: v.domain, value: v.value })
      }
    }
  } catch {}
  try {
    const cfg = await vercelReq('GET', `/v9/projects/${VERCEL_PROJECT_ID}/domains/${clean}/config`)
    if (cfg && typeof cfg.misconfigured === 'boolean') out.misconfigured = cfg.misconfigured
  } catch {}

  // If Vercel gave us no explicit records, show the standard CNAME target so the
  // customer always has something correct to add.
  if (out.records.length === 0) {
    const isApex = clean.split('.').length <= 2
    out.records = isApex
      ? [{ type: 'A', name: '@', value: '76.76.21.21' }]
      : [{ type: 'CNAME', name: clean.split('.')[0], value: 'cname.vercel-dns.com' }]
  }
  return out
}
