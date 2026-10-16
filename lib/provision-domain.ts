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
// White-label target shown to CUSTOMERS for their own domains. This is a
// Colvy-owned host (e.g. cname.colvy.com) that itself CNAMEs to Vercel, so the
// customer never sees Vercel in their DNS. Create it once in Colvy's DNS:
//   cname.colvy.com  CNAME  cname.vercel-dns.com   (DNS only)
// Apex domains can't CNAME, so they use Vercel's anonymous anycast IP.
export const CUSTOM_CNAME_TARGET = process.env.NEXT_PUBLIC_CUSTOM_CNAME_TARGET || 'cname.colvy.com'
export const CUSTOM_APEX_IP = process.env.NEXT_PUBLIC_CUSTOM_APEX_IP || '76.76.21.21'

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
        // An error can still mean "it's already on this project" (idempotent).
        // But "already in use" can also mean ANOTHER project or team holds it,
        // which used to be counted as success and left the host dead. Ask
        // Vercel whether this project really has it.
        const here = await vercelReq('GET', `/v9/projects/${VERCEL_PROJECT_ID}/domains/${domain}`).catch(() => null)
        const attached = !!(here && !here.error && here.name)
        result.vercel = attached ? { success: true, already: true } : { error: r.error.message || 'Vercel refused the domain', code: r.error.code }
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
  // A *.colvy.com host (e.g. help.colvy.com) is ours — auto-provision it (attach
  // to Vercel + add the Cloudflare CNAME) instead of asking the customer for DNS.
  // Without this the help/board-domain flow rejected colvy.com subdomains, so
  // they stayed "Pending" and 404'd with DEPLOYMENT_NOT_FOUND.
  if (clean.endsWith('.colvy.com')) {
    const sub = await provisionSubdomain(clean)
    out.configured = !sub.vercel.skipped
    out.registered = !!sub.vercel.success
    // It's ours and points at Vercel via Cloudflare, so treat a successful attach
    // as verified/well-configured; the customer needs no DNS records.
    out.verified = !!(sub.vercel.success && (sub.cloudflare.success || sub.cloudflare.skipped))
    out.misconfigured = !out.verified
    out.records = []
    if (!sub.ok && (sub.vercel.error || sub.cloudflare.error)) out.error = sub.vercel.error || sub.cloudflare.error
    return out
  }
  // The DNS record we ask the customer for — always Colvy-branded, never Vercel.
  const isApex = clean.split('.').length <= 2
  const brandedRecord = isApex
    ? { type: 'A', name: '@', value: CUSTOM_APEX_IP }
    : { type: 'CNAME', name: clean.split('.')[0], value: CUSTOM_CNAME_TARGET }

  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
    out.records = [brandedRecord]
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

  // 2) Read verification state. We deliberately do NOT surface Vercel's own
  //    `verification` records (they name `_vercel` / vercel-dns and would leak
  //    the provider) — the customer only ever sees the Colvy-branded record.
  try {
    const info = await vercelReq('GET', `/v9/projects/${VERCEL_PROJECT_ID}/domains/${clean}`)
    if (info && !info.error) out.verified = !!info.verified
  } catch {}
  try {
    const cfg = await vercelReq('GET', `/v9/projects/${VERCEL_PROJECT_ID}/domains/${clean}/config`)
    if (cfg && typeof cfg.misconfigured === 'boolean') out.misconfigured = cfg.misconfigured
  } catch {}

  out.records = [brandedRecord]
  return out
}

// ── Status + plain-English report (super admin → Companies → "Set up board address") ──

export interface SubdomainCheck {
  domain: string
  configured: boolean            // the server has a Vercel token + project id
  attached: boolean              // Vercel lists it on this project
  verified: boolean              // Vercel says the project owns it
  misconfigured: boolean | null  // DNS doesn't reach Vercel yet (null = unknown)
  verification: { type: string; domain: string; value: string }[]  // records Vercel still wants
  error?: string
}

/** Ask Vercel how a *.colvy.com host stands right now. Never throws. */
export async function checkSubdomain(domain: string): Promise<SubdomainCheck> {
  const out: SubdomainCheck = { domain, configured: !!(VERCEL_TOKEN && VERCEL_PROJECT_ID), attached: false, verified: false, misconfigured: null, verification: [] }
  if (!out.configured) return out
  try {
    const info = await vercelReq('GET', `/v9/projects/${VERCEL_PROJECT_ID}/domains/${domain}`)
    if (info && !info.error && info.name) {
      out.attached = true
      out.verified = info.verified !== false
      out.verification = Array.isArray(info.verification)
        ? info.verification.map((v: any) => ({ type: String(v.type || ''), domain: String(v.domain || ''), value: String(v.value || '') })).filter((v: any) => v.type && v.value)
        : []
    } else if (info?.error && info.error.code !== 'not_found') {
      out.error = info.error.message || 'Vercel lookup failed'
    }
  } catch (e: any) { out.error = e?.message || 'Vercel lookup failed' }
  try {
    const cfg = await vercelReq('GET', `/v6/domains/${domain}/config`)
    if (cfg && typeof cfg.misconfigured === 'boolean') out.misconfigured = cfg.misconfigured
  } catch {}
  return out
}

export interface ProvisionReport {
  ok: boolean          // nothing left for anyone to do
  summary: string
  steps: string[]      // what the owner does next, in order (empty when ok)
}

/** Turn a provision attempt and a fresh check into what to tell the owner. */
export function describeProvision(p: ProvisionResult, c: SubdomainCheck): ProvisionReport {
  const d = p.domain
  const sub = d.replace(/\.colvy\.com$/, '')
  const addInVercel = `In Vercel, open the project that serves colvy.com → Settings → Domains → Add, enter ${d} and save.`
  const steps: string[] = []

  if (!c.configured || p.vercel.skipped) {
    steps.push(addInVercel)
    steps.push('Or let Colvy do it: in Vercel → Settings → Environment Variables set VERCEL_TOKEN, VERCEL_PROJECT_ID and VERCEL_TEAM_ID, redeploy, then press this button again.')
    if (p.cloudflare.skipped) steps.push(`If ${d} doesn't resolve, add a DNS record in Cloudflare for colvy.com: CNAME ${sub} → ${CNAME_TARGET}, proxy off (grey cloud).`)
    return { ok: false, summary: `Colvy can't reach Vercel from here, so ${d} wasn't added.`, steps }
  }

  if (!c.attached) {
    const inUse = /in.use|taken|another|owned/i.test(`${p.vercel.code || ''} ${p.vercel.error || ''}`)
    if (inUse) {
      steps.push(`${d} is attached to a different Vercel project or team. Remove it there (that project → Settings → Domains → ${d} → Remove).`)
      steps.push('Then press this button again.')
    } else {
      steps.push(addInVercel)
    }
    return { ok: false, summary: `Vercel didn't add ${d}${p.vercel.error ? `: ${p.vercel.error}` : '.'}`, steps }
  }

  if (!c.verified && c.verification.length) {
    for (const v of c.verification) steps.push(`In Cloudflare DNS for colvy.com add a ${v.type} record: name ${v.domain}, value ${v.value}.`)
    steps.push('Vercel checks again within a few minutes. Press this button to see the result.')
    return { ok: false, summary: `${d} is on the Vercel project but Vercel wants proof Colvy owns it.`, steps }
  }

  if (c.misconfigured === true) {
    steps.push(`In Cloudflare DNS for colvy.com, make sure there's a CNAME ${sub} → ${CNAME_TARGET} with the proxy off (grey cloud).`)
    if (p.cloudflare.error && !p.cloudflare.skipped) steps.push(`Colvy's own attempt said: ${p.cloudflare.error}`)
    steps.push('Vercel issues the certificate once the record is live. Press this button to check.')
    return { ok: false, summary: `${d} is on the Vercel project but its DNS doesn't point at Vercel yet.`, steps }
  }

  return {
    ok: true,
    summary: `${d} is on the Vercel project${p.vercel.already ? ' (it already was)' : ''} and its DNS points at Vercel. The certificate is issued within a few minutes, then https://${d} opens.`,
    steps,
  }
}
