// A business's own sending domain for email campaigns, on Resend's Domains
// API (server only), and who a campaign email is "from".
//
//   • addDomain()   creates the domain on Resend (Tokyo, ap-northeast-1: the
//                   closest region Resend offers to Australia) and keeps the
//                   DNS records it asks for;
//   • checkDomain() asks Resend to verify again and re-reads the status;
//   • senderFor()   the From / Reply-To a campaign uses: the business's own
//                   verified domain, or until then Colvy's shared campaign
//                   domain (<slug>@COLVY_CAMPAIGN_SEND_DOMAIN) under the
//                   business's name, with replies going to the business.
//
// Resend's record names are relative to the domain added ("send",
// "resend._domainkey"). DNS hosts (Cloudflare, GoDaddy, VentraIP) want them
// relative to the zone, e.g. "send.mail" when the domain is
// mail.roxyaquarium.com.au and the zone is roxyaquarium.com.au, so
// dnsRecords() works both out, and adds the recommended DMARC record.

import { isMissingTable, normEmail } from '@/lib/email-db'

export const RESEND_API = 'https://api.resend.com'
export const RESEND_REGION = 'ap-northeast-1'
// Used only when COLVY_CAMPAIGN_SEND_DOMAIN isn't set. updates.colvy.com is
// the domain verified on Colvy's Resend account (Colvy's own notifications go
// from it too); nothing assumes a "send." prefix.
export const DEFAULT_SHARED_DOMAIN = 'updates.colvy.com'

/** Colvy's shared domain for campaigns sent before a business verifies its own. */
export function sharedCampaignDomain(): string {
  const v = String(process.env.COLVY_CAMPAIGN_SEND_DOMAIN || '').trim().toLowerCase()
  return isHostname(v) ? v : DEFAULT_SHARED_DOMAIN
}

export type DomainStatus = 'pending' | 'verified' | 'failed'

export type DnsRecord = {
  purpose: 'DKIM' | 'SPF' | 'MX' | 'DMARC' | 'Tracking' | 'Other'
  type: 'TXT' | 'MX' | 'CNAME' | string
  /** Full name, e.g. send.mail.roxyaquarium.com.au */
  fqdn: string
  /** What to type in the DNS host's Name / Host box (relative to the zone; "@" for the zone itself). */
  host: string
  value: string
  priority?: number | null
  ttl?: string
  status: DomainStatus | 'recommended'
  required: boolean
}

// Second-level suffixes under which a business registers its name.
const TWO_LEVEL = new Set([
  'com.au', 'net.au', 'org.au', 'asn.au', 'id.au', 'edu.au', 'gov.au', 'csiro.au',
  'act.au', 'nsw.au', 'nt.au', 'qld.au', 'sa.au', 'tas.au', 'vic.au', 'wa.au',
  'co.nz', 'net.nz', 'org.nz', 'ac.nz', 'govt.nz', 'geek.nz', 'kiwi.nz',
  'co.uk', 'org.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'ac.uk',
  'com.sg', 'com.my', 'co.za', 'com.hk', 'co.jp', 'co.in', 'com.cn', 'com.br',
])

export function isHostname(v: string): boolean {
  return v.length <= 253 && /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(v)
}

/** The registered domain (DNS zone) a host sits under: mail.roxy.com.au → roxy.com.au. */
export function zoneOf(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, '').split('.')
  if (parts.length <= 2) return parts.join('.')
  const last2 = parts.slice(-2).join('.')
  return parts.slice(TWO_LEVEL.has(last2) ? -3 : -2).join('.')
}

/** Free and ISP mailboxes: nobody can add DNS records for these. */
const NOT_OWNABLE = /(^|\.)(gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|icloud|me|mac|aol|proton|protonmail|gmx|zoho|bigpond|optusnet|iinet|tpg|internode|westnet|dodo|ozemail)\.(com|net|com\.au|net\.au|co\.uk|me|ch)$/

/** Clean what someone typed ("https://www.Roxy.com.au/", "hello@roxy.com.au") into a domain, or an error. */
export function parseDomainInput(raw: string): { domain: string } | { error: string } {
  let s = String(raw || '').trim().toLowerCase()
  if (s.includes('@')) s = s.split('@').pop() || ''
  s = s.replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '')
  if (s.startsWith('www.')) s = s.slice(4)
  if (!s) return { error: 'Type the domain you send from, for example mail.yourshop.com.au.' }
  if (!isHostname(s)) return { error: 'That doesn’t look like a domain. Use something like mail.yourshop.com.au.' }
  if (s === 'colvy.com' || s.endsWith('.colvy.com')) return { error: 'Use a domain your business owns.' }
  if (NOT_OWNABLE.test(s)) return { error: 'Free email domains like Gmail or Outlook can’t be verified. Use your business’s own domain.' }
  if (s.split('.').length < 2) return { error: 'Use your full domain, for example yourshop.com.au.' }
  return { domain: s }
}

/** Resend's status word → the three the app shows. */
export function mapStatus(s: unknown): DomainStatus {
  const v = String(s || '').toLowerCase()
  if (v === 'verified') return 'verified'
  if (v === 'failed' || v === 'partially_failed') return 'failed'
  return 'pending' // not_started, pending, temporary_failure, partially_verified
}

/** Host relative to the zone, for the DNS host's Name box. */
function relHost(fqdn: string, zone: string): string {
  const f = fqdn.toLowerCase().replace(/\.$/, '')
  if (f === zone) return '@'
  return f.endsWith('.' + zone) ? f.slice(0, -(zone.length + 1)) : f
}

/**
 * The records to show for a domain, from Resend's records array: full name,
 * host relative to the zone, and a recommended DMARC record when Resend
 * doesn't list one. Values are trimmed of the quotes Resend sometimes adds.
 */
export function dnsRecords(domain: string, resendRecords: any[]): DnsRecord[] {
  const zone = zoneOf(domain)
  const out: DnsRecord[] = []
  for (const r of Array.isArray(resendRecords) ? resendRecords : []) {
    const name = String(r?.name || '').trim().replace(/\.$/, '')
    if (!name && !r?.value) continue
    const lower = name.toLowerCase()
    // Some responses give the full name ("links.example.com"), most a relative one.
    const fqdn = !name || name === '@' ? domain : (lower === domain || lower.endsWith('.' + domain) ? lower : `${lower}.${domain}`)
    const type = String(r?.type || 'TXT').toUpperCase()
    const rec = String(r?.record || '').toUpperCase()
    const purpose: DnsRecord['purpose'] = rec === 'DKIM' ? 'DKIM' : rec === 'SPF' ? (type === 'MX' ? 'MX' : 'SPF') : rec === 'TRACKING' ? 'Tracking' : rec === 'DMARC' ? 'DMARC' : 'Other'
    out.push({
      purpose, type, fqdn, host: relHost(fqdn, zone),
      value: String(r?.value ?? '').trim().replace(/^"(.*)"$/, '$1'),
      priority: type === 'MX' ? (Number(r?.priority) || 10) : null,
      ttl: r?.ttl ? String(r.ttl) : 'Auto',
      status: mapStatus(r?.status),
      required: true,
    })
  }
  if (!out.some(r => r.purpose === 'DMARC')) {
    const fqdn = `_dmarc.${domain}`
    out.push({ purpose: 'DMARC', type: 'TXT', fqdn, host: relHost(fqdn, zone), value: 'v=DMARC1; p=none;', priority: null, ttl: 'Auto', status: 'recommended', required: false })
  }
  // DKIM first, then the bounce (MX + SPF) pair, then the rest.
  const order: Record<string, number> = { DKIM: 0, MX: 1, SPF: 2, Tracking: 3, DMARC: 4, Other: 5 }
  return out.sort((a, b) => order[a.purpose] - order[b.purpose])
}

// ── Resend calls ────────────────────────────────────────────────────────────

type Fetch = typeof fetch
export type ResendDeps = { fetch?: Fetch; apiKey?: string }

async function resend(deps: ResendDeps, method: string, path: string, body?: any): Promise<{ ok: boolean; status: number; data: any }> {
  const key = deps.apiKey ?? process.env.RESEND_API_KEY
  if (!key) return { ok: false, status: 0, data: { message: 'Email isn’t set up on this server (no RESEND_API_KEY).' } }
  const f = deps.fetch || fetch
  try {
    const res = await f(`${RESEND_API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data }
  } catch (e: any) {
    return { ok: false, status: 0, data: { message: e?.message || 'Resend didn’t answer' } }
  }
}

const resendError = (r: { status: number; data: any }) =>
  String(r.data?.message || r.data?.error || (r.status ? `Resend said ${r.status}` : 'Resend didn’t answer')).slice(0, 300)

/** The row fields that come from Resend's answer about a domain. */
function fromResend(domain: string, d: any) {
  const status = mapStatus(d?.status)
  return {
    resend_domain_id: d?.id ? String(d.id) : undefined,
    region: d?.region || RESEND_REGION,
    status,
    provider_status: d?.status ? String(d.status) : null,
    records: dnsRecords(domain, d?.records || []),
  }
}

/**
 * Add a domain for a business: refuses one another business already has,
 * creates it on Resend, stores the row. A domain this Resend account already
 * holds (added before, or by hand) is looked up instead of failing.
 */
export async function addDomain(db: any, companyId: string, rawDomain: string, opts: ResendDeps & { userId?: string | null; fromName?: string | null; replyTo?: string | null } = {}): Promise<{ ok: true; row: any } | { ok: false; error: string; status: number }> {
  const parsed = parseDomainInput(rawDomain)
  if ('error' in parsed) return { ok: false, error: parsed.error, status: 400 }
  const domain = parsed.domain

  const { data: taken, error: readErr } = await db.from('email_sending_domains').select('id, company_id').ilike('domain', domain).limit(1)
  if (readErr) return isMissingTable(readErr)
    ? { ok: false, error: 'Sending domains are waiting on a database update (V396).', status: 503 }
    : { ok: false, error: 'Couldn’t check that domain just now.', status: 500 }
  if (taken?.[0]) return taken[0].company_id === companyId
    ? { ok: false, error: 'You’ve already added that domain.', status: 409 }
    : { ok: false, error: 'That domain is already in use on Colvy. Contact support if it’s yours.', status: 409 }

  let r = await resend(opts, 'POST', '/domains', { name: domain, region: RESEND_REGION, open_tracking: false, click_tracking: false })
  if (!r.ok && (r.status === 403 || r.status === 409 || r.status === 422) && /already|exists|registered/i.test(resendError(r))) {
    // Already on this Resend account: find it by name.
    const list = await resend(opts, 'GET', '/domains')
    const hit = (list.data?.data || []).find((d: any) => String(d?.name || '').toLowerCase() === domain)
    if (hit?.id) r = await resend(opts, 'GET', `/domains/${encodeURIComponent(hit.id)}`)
  }
  if (!r.ok || !r.data?.id) return { ok: false, error: resendError(r), status: r.status === 0 ? 503 : 502 }

  const now = new Date().toISOString()
  const row = {
    company_id: companyId, domain, ...fromResend(domain, r.data),
    from_local_part: 'hello',
    from_name: opts.fromName ? cleanName(opts.fromName) : null,
    reply_to: normEmail(opts.replyTo) || null,
    verified_at: mapStatus(r.data.status) === 'verified' ? now : null,
    last_checked_at: now, created_by: opts.userId || null, created_at: now, updated_at: now,
  }
  const { data, error } = await db.from('email_sending_domains').insert(row).select('*').maybeSingle()
  if (error) return { ok: false, error: /duplicate|unique/i.test(error.message || '') ? 'That domain is already in use on Colvy.' : 'Couldn’t save the domain.', status: 500 }
  return { ok: true, row: data || row }
}

/**
 * "Check again": ask Resend to verify (it re-reads DNS in the background),
 * then read the domain back and store its status and records.
 */
export async function checkDomain(db: any, companyId: string, id: string, opts: ResendDeps = {}): Promise<{ ok: true; row: any } | { ok: false; error: string; status: number }> {
  const { data: row, error } = await db.from('email_sending_domains').select('*').eq('id', id).eq('company_id', companyId).maybeSingle()
  if (error) return { ok: false, error: 'Couldn’t read that domain.', status: 500 }
  if (!row) return { ok: false, error: 'Domain not found.', status: 404 }
  if (!row.resend_domain_id) return { ok: false, error: 'This domain was never created on Resend. Remove it and add it again.', status: 409 }
  await resend(opts, 'POST', `/domains/${encodeURIComponent(row.resend_domain_id)}/verify`)
  const r = await resend(opts, 'GET', `/domains/${encodeURIComponent(row.resend_domain_id)}`)
  const now = new Date().toISOString()
  if (!r.ok) {
    await db.from('email_sending_domains').update({ last_checked_at: now, last_error: resendError(r), updated_at: now }).eq('id', id).eq('company_id', companyId)
    return { ok: false, error: resendError(r), status: r.status === 404 ? 404 : 502 }
  }
  const fresh = fromResend(row.domain, r.data)
  const patch: any = { ...fresh, last_checked_at: now, last_error: null, updated_at: now }
  delete patch.resend_domain_id
  if (fresh.status === 'verified' && !row.verified_at) patch.verified_at = now
  if (fresh.status !== 'verified') patch.verified_at = null
  await db.from('email_sending_domains').update(patch).eq('id', id).eq('company_id', companyId)
  return { ok: true, row: { ...row, ...patch } }
}

/** Remove a domain (from Resend too; a Resend failure doesn't keep the row). */
export async function removeDomain(db: any, companyId: string, id: string, opts: ResendDeps = {}): Promise<{ ok: boolean; error?: string }> {
  const { data: row } = await db.from('email_sending_domains').select('id, resend_domain_id').eq('id', id).eq('company_id', companyId).maybeSingle()
  if (!row) return { ok: false, error: 'Domain not found.' }
  if (row.resend_domain_id) await resend(opts, 'DELETE', `/domains/${encodeURIComponent(row.resend_domain_id)}`)
  await db.from('email_sending_domains').delete().eq('id', id).eq('company_id', companyId)
  return { ok: true }
}

// ── Who an email is from ────────────────────────────────────────────────────

export const cleanName = (s: unknown) => String(s ?? '').replace(/[<>"\\\r\n]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)
export const cleanLocalPart = (s: unknown) => {
  const v = String(s ?? '').trim().toLowerCase()
  return /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/.test(v) && !v.includes('..') ? v : ''
}

export type Sender = {
  from: string          // "Roxy Aquarium <hello@mail.roxyaquarium.com.au>"
  fromAddress: string
  fromName: string
  replyTo: string | null
  shared: boolean       // true: Colvy's shared domain (deliverability is better on their own)
  domainId: string | null
}

/**
 * The From and Reply-To for a business's campaign email. Its newest verified
 * domain when it has one; otherwise <slug>@<shared domain> under the
 * business's name, replies to the business (the domain's reply-to, the email
 * channel's address, or the company's email).
 */
export async function senderFor(db: any, company: { id: string; name?: string | null; slug?: string | null; email?: string | null; business_email?: string | null }): Promise<Sender> {
  let dom: any = null
  try {
    const { data } = await db.from('email_sending_domains').select('*').eq('company_id', company.id).eq('status', 'verified').order('verified_at', { ascending: false }).limit(1)
    dom = data?.[0] || null
  } catch {}
  let channelReply = ''
  try {
    const { data: ec } = await db.from('email_channels').select('from_address, inbound_address, provider').eq('company_id', company.id).eq('is_active', true).limit(5)
    const ch = (ec || []).find((r: any) => r.provider !== 'webform') || ec?.[0]
    channelReply = normEmail(ch?.from_address) || normEmail(ch?.inbound_address)
  } catch {}
  const name = cleanName(dom?.from_name || company.name || 'Our store') || 'Our store'
  const replyTo = normEmail(dom?.reply_to) || channelReply || normEmail(company.email) || normEmail(company.business_email) || null
  if (dom?.domain) {
    const local = cleanLocalPart(dom.from_local_part) || 'hello'
    const addr = `${local}@${dom.domain}`
    return { from: `${name} <${addr}>`, fromAddress: addr, fromName: name, replyTo, shared: false, domainId: dom.id }
  }
  const slug = cleanLocalPart(String(company.slug || '').replace(/[^a-z0-9-]/gi, '')) || 'store'
  const addr = `${slug}@${sharedCampaignDomain()}`
  return { from: `${name} <${addr}>`, fromAddress: addr, fromName: name, replyTo, shared: true, domainId: null }
}
