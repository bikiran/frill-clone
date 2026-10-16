// Web Form email: the shared forms domain (forms.colvy.com) that every
// business's web-form address lives on, e.g. 2f81ab.all@forms.colvy.com.
//
// How it works: a business points its website contact form's notification
// email at its address. The mail goes to the forms domain's MX host, which
// must be Resend's inbound mail server; Resend then posts it to
// /api/webhooks/email, which matches the To address against
// email_channels.inbound_address (provider 'webform') and opens a 'form'
// conversation in that business's inbox. Nothing is set up per business: once
// the domain's DNS and Resend are right, every address receives mail.
//
// This file answers "is that actually true right now?" for the super admin
// Web Forms page and the per-business Web Form channel page, and sends a real
// test email through Resend to prove it end to end.

import { INBOUND_DOMAIN } from '@/lib/inbound-alias'

export const DEFAULT_FORMS_DOMAIN = 'forms.colvy.com'
export const FORMS_DOMAIN = (process.env.NEXT_PUBLIC_FORMS_DOMAIN || DEFAULT_FORMS_DOMAIN).toLowerCase()
export const FORMS_DOMAIN_IS_DEFAULT = !process.env.NEXT_PUBLIC_FORMS_DOMAIN

/** Resend receives on Amazon SES inbound in the domain's region. */
export const inboundHostFor = (region: string) => `inbound-smtp.${region}.amazonaws.com`
const RESEND_REGIONS = ['us-east-1', 'eu-west-1', 'sa-east-1', 'ap-northeast-1']

/** The address test emails are sent from (a verified Resend sending domain). */
export const FORMS_TEST_FROM = process.env.FORMS_TEST_FROM || 'Colvy <noreply@updates.colvy.com>'
const TEST_FROM_ADDR = (/<([^>]+)>/.exec(FORMS_TEST_FROM)?.[1] || FORMS_TEST_FROM).trim().toLowerCase()
const TEST_SUBJECT = /^colvy web form test ([a-z0-9]{10,})\b/i

export type DnsRecord = { type: string; name: string; host: string; value: string; priority?: number; status?: string; why: string }
export type FormsHealth = {
  domain: string
  usingDefault: boolean
  ready: boolean
  /** One plain sentence: what's wrong, or that it's working. */
  summary: string
  mx: { priority: number; host: string }[]
  cname: string | null
  expected: { host: string; priority: number; source: 'resend' | 'env' | 'reply-domain' | 'default' }
  mxOk: boolean
  resend: { checked: boolean; found: boolean; id?: string; status?: string; receiving?: string; region?: string; error?: string }
  problems: { code: string; text: string }[]
  /** DNS records still to add, exactly as they go into the DNS provider. */
  records: DnsRecord[]
  zone: string
  /** Who hosts the zone's DNS (where the records go), from its NS records. */
  dnsProvider: string | null
}

const clean = (h: string) => String(h || '').trim().replace(/\.$/, '').toLowerCase()

/** The registrable zone (colvy.com, or roxy.com.au) and the name relative to it. */
export function splitZone(fqdn: string): { zone: string; rel: string } {
  const labels = clean(fqdn).split('.')
  const twoLevel = labels.length >= 3 && /^[a-z]{2}$/.test(labels[labels.length - 1]) && /^(com|net|org|gov|edu|asn|id|co)$/.test(labels[labels.length - 2])
  const n = twoLevel ? 3 : 2
  const zone = labels.slice(-n).join('.')
  const rel = labels.slice(0, -n).join('.') || '@'
  return { zone, rel }
}

/** Resend's record names can be relative to the domain or to the zone; give the name to type into the zone's DNS. */
function relName(resendName: string, domain: string, zone: string): string {
  const n = clean(resendName)
  if (!n || n === '@') return splitZone(domain).rel
  if (n === domain || n.endsWith('.' + zone)) return n === zone ? '@' : n.slice(0, -(zone.length + 1))
  // Relative to the domain (Resend shows "resend._domainkey" for the domain itself)…
  const domRel = splitZone(domain).rel
  if (domRel !== '@' && (n === domRel || n.endsWith('.' + domRel))) return n   // already relative to the zone
  return domRel === '@' ? n : `${n}.${domRel}`
}

/** DNS-over-HTTPS answers for one name and type (A=1, CNAME=5, MX=15). */
export async function dohAnswers(name: string, type: 'MX' | 'CNAME' | 'NS', f: typeof fetch = fetch): Promise<{ type: number; data: string }[]> {
  try {
    const r = await f(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: 'application/dns-json' } })
    if (!r.ok) return []
    const d: any = await r.json()
    return (d?.Answer || []).map((a: any) => ({ type: Number(a.type), data: String(a.data || '').trim() })).filter((a: any) => a.data)
  } catch { return [] }
}

/**
 * Only real MX answers. A DNS answer to an MX question also carries any CNAME
 * on the way (forms.colvy.com → cns.vercel-dns.com, from the *.colvy.com
 * wildcard), which the old check counted as an MX record and reported "OK".
 */
export function parseMx(answers: { type: number; data: string }[]): { priority: number; host: string }[] {
  return answers.filter(a => a.type === 15).map(a => {
    const m = /^(\d+)\s+(\S+)$/.exec(a.data)
    return m ? { priority: Number(m[1]), host: clean(m[2]) } : { priority: 0, host: clean(a.data) }
  }).sort((a, b) => a.priority - b.priority)
}

async function resendJson(path: string, key: string, f: typeof fetch, init: RequestInit = {}): Promise<{ ok: boolean; status: number; json: any }> {
  const res = await f(`https://api.resend.com${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers || {}) } })
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => null) }
}

/** The forms domain as Resend knows it (null when it hasn't been added). */
export async function resendDomain(domain: string, key: string, f: typeof fetch): Promise<any | null> {
  const list = await resendJson('/domains', key, f)
  if (!list.ok) throw new Error(list.json?.message || `Resend answered ${list.status}`)
  const hit = (list.json?.data || []).find((d: any) => clean(d?.name) === domain)
  if (!hit) return null
  const one = await resendJson(`/domains/${encodeURIComponent(hit.id)}`, key, f)
  return one.ok && one.json ? { ...hit, ...one.json } : hit
}

const isReceivingRecord = (r: any) => String(r?.type || '').toUpperCase() === 'MX' && (/receiv|inbound/i.test(String(r?.record || '')) || /inbound-smtp/i.test(String(r?.value || '')))

/** Is the forms domain really ready to receive mail, and if not, what exactly to change. */
export async function formsDomainHealth(o: { domain?: string; fetchImpl?: typeof fetch; resendKey?: string | null; usingDefault?: boolean } = {}): Promise<FormsHealth> {
  const f = o.fetchImpl || fetch
  const domain = clean(o.domain || FORMS_DOMAIN)
  const key = o.resendKey === undefined ? (process.env.RESEND_API_KEY || null) : o.resendKey
  const { zone } = splitZone(domain)

  const [mxAns, cnameAns, replyAns, nsAns] = await Promise.all([
    dohAnswers(domain, 'MX', f), dohAnswers(domain, 'CNAME', f),
    INBOUND_DOMAIN && INBOUND_DOMAIN !== domain ? dohAnswers(INBOUND_DOMAIN, 'MX', f) : Promise.resolve([]),
    dohAnswers(zone, 'NS', f),
  ])
  const ns = nsAns.filter(a => a.type === 2).map(a => clean(a.data))
  const dnsProvider = ns.some(n => n.endsWith('cloudflare.com')) ? 'Cloudflare'
    : ns.some(n => /vercel-dns\.com$/.test(n)) ? 'Vercel'
    : ns.some(n => /awsdns/.test(n)) ? 'Amazon Route 53'
    : ns.some(n => /domaincontrol\.com$/.test(n)) ? 'GoDaddy'
    : ns.some(n => /hostinger/.test(n)) ? 'Hostinger'
    : ns.some(n => /googledomains\.com$|google\.com$/.test(n)) ? 'Google'
    : ns[0] ? ns[0] : null
  const mx = parseMx(mxAns)
  const cname = clean((cnameAns.find(a => a.type === 5) || mxAns.find(a => a.type === 5))?.data || '') || null

  // What Resend says about the domain.
  const resend: FormsHealth['resend'] = { checked: false, found: false }
  let rd: any = null
  if (key) {
    try {
      rd = await resendDomain(domain, key, f)
      resend.checked = true
      if (rd) Object.assign(resend, { found: true, id: rd.id, status: rd.status, receiving: rd.capabilities?.receiving, region: rd.region })
    } catch (e: any) { resend.error = e?.message || 'Resend lookup failed' }
  }

  // Which inbound host the MX must point at: Resend's own record for this
  // domain > FORMS_INBOUND_MX > the host reply.colvy.com already uses (same
  // Resend account, working) > Resend's default region.
  const replyMx = parseMx(replyAns).find(m => /^inbound-smtp\.[a-z0-9-]+\.amazonaws\.com$/.test(m.host))
  const rec = (rd?.records || []).find(isReceivingRecord)
  const expected: FormsHealth['expected'] = rec?.value
    ? { host: clean(rec.value), priority: Number(rec.priority) || 10, source: 'resend' }
    : process.env.FORMS_INBOUND_MX ? { host: clean(process.env.FORMS_INBOUND_MX), priority: 10, source: 'env' }
    : rd?.region && RESEND_REGIONS.includes(rd.region) ? { host: inboundHostFor(rd.region), priority: 10, source: 'resend' }
    : replyMx ? { host: replyMx.host, priority: replyMx.priority || 10, source: 'reply-domain' }
    : { host: inboundHostFor('us-east-1'), priority: 10, source: 'default' }

  const lowest = mx[0]
  const mxOk = !!lowest && lowest.host === expected.host
  const problems: FormsHealth['problems'] = []
  const records: DnsRecord[] = []
  const { rel } = splitZone(domain)
  const mxRecord: DnsRecord = { type: 'MX', name: rel, host: domain, value: expected.host, priority: expected.priority, why: 'Sends mail for the forms domain to Resend' }

  if (!mx.length) {
    if (cname) problems.push({ code: 'cname', text: `${domain} has no MX record. It only resolves as a CNAME to ${cname} (a web host, not a mail server), so email to any web-form address isn't delivered.` })
    else problems.push({ code: 'no-mx', text: `${domain} has no MX record, so email to any web-form address isn't delivered.` })
    records.push(mxRecord)
  } else if (!mxOk) {
    const ours = mx.find(m => m.host === expected.host)
    if (ours) problems.push({ code: 'not-lowest', text: `Resend's MX record is there, but ${lowest.host} has a lower priority number (${lowest.priority}), so mail goes there first.` })
    else problems.push({ code: 'wrong-mx', text: `${domain}'s MX record points at ${mx.map(m => m.host).join(', ')}, not Resend's inbound server ${expected.host}.` })
    records.push(mxRecord)
  }
  if (key && resend.checked && !resend.found) problems.push({ code: 'resend-missing', text: `${domain} hasn't been added to Resend, so Resend would drop mail for it even with the MX record in place.` })
  else if (resend.found && resend.receiving && resend.receiving !== 'enabled') problems.push({ code: 'resend-receiving-off', text: `${domain} is in Resend but receiving is turned off for it.` })
  // Other records Resend still waits on for this domain (DKIM etc.).
  for (const r of rd?.records || []) {
    if (isReceivingRecord(r) || String(r?.status || '') === 'verified') continue
    if (r?.record === 'Tracking') continue
    records.push({ type: String(r.type || '').toUpperCase(), name: relName(r.name, domain, zone), host: r.name, value: String(r.value || ''), ...(r.priority != null ? { priority: Number(r.priority) } : {}), status: r.status, why: `Resend ${r.record || ''} record`.replace(/\s+/g, ' ').trim() })
  }
  if (resend.found && resend.status && resend.status !== 'verified' && !problems.some(p => p.code.startsWith('resend'))) {
    problems.push({ code: 'resend-unverified', text: `Resend hasn't verified ${domain} yet (status: ${String(resend.status).replace(/_/g, ' ')}). Add the records below, then press Verify.` })
  }

  const ready = mxOk && (!resend.checked || (resend.found && resend.receiving !== 'disabled'))
  const summary = ready
    ? `Working: mail to any address @${domain} goes to Resend and lands in that business's inbox.`
    : problems[0]?.text || `${domain} isn't receiving mail yet.`
  return { domain, usingDefault: o.usingDefault ?? FORMS_DOMAIN_IS_DEFAULT, ready, summary, mx, cname, expected, mxOk, resend, problems, records, zone, dnsProvider }
}

/** Add the forms domain to Resend for receiving only, in the region reply.colvy.com uses. */
export async function addFormsDomainToResend(o: { domain?: string; region?: string; fetchImpl?: typeof fetch; resendKey?: string | null } = {}): Promise<{ ok: boolean; error?: string; id?: string }> {
  const f = o.fetchImpl || fetch
  const key = o.resendKey === undefined ? process.env.RESEND_API_KEY : o.resendKey
  if (!key) return { ok: false, error: 'RESEND_API_KEY is not set.' }
  const domain = clean(o.domain || FORMS_DOMAIN)
  let region = o.region
  if (!region) {
    const ref = parseMx(await dohAnswers(INBOUND_DOMAIN, 'MX', f)).map(m => /^inbound-smtp\.([a-z0-9-]+)\.amazonaws\.com$/.exec(m.host)?.[1]).find(Boolean)
    region = ref && RESEND_REGIONS.includes(ref) ? ref : 'us-east-1'
  }
  const r = await resendJson('/domains', key, f, { method: 'POST', body: JSON.stringify({ name: domain, region, capabilities: { sending: 'disabled', receiving: 'enabled' } }) })
  if (!r.ok) return { ok: false, error: r.json?.message || `Resend answered ${r.status}` }
  return { ok: true, id: r.json?.id }
}

export async function verifyFormsDomain(id: string, o: { fetchImpl?: typeof fetch; resendKey?: string | null } = {}): Promise<{ ok: boolean; error?: string }> {
  const key = o.resendKey === undefined ? process.env.RESEND_API_KEY : o.resendKey
  if (!key) return { ok: false, error: 'RESEND_API_KEY is not set.' }
  const r = await resendJson(`/domains/${encodeURIComponent(id)}/verify`, key, o.fetchImpl || fetch, { method: 'POST' })
  return r.ok ? { ok: true } : { ok: false, error: r.json?.message || `Resend answered ${r.status}` }
}

// ── Test email ──────────────────────────────────────────────────────────────

export const newTestToken = () => Array.from({ length: 12 }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 32)]).join('')

/** Email a web-form address through Resend, exactly as a website form would. */
export async function sendFormsTest(address: string, o: { fetchImpl?: typeof fetch; resendKey?: string | null; token?: string } = {}): Promise<{ ok: boolean; token: string; emailId?: string; error?: string }> {
  const token = o.token || newTestToken()
  const key = o.resendKey === undefined ? process.env.RESEND_API_KEY : o.resendKey
  if (!key) return { ok: false, token, error: 'RESEND_API_KEY is not set, so a test email can’t be sent.' }
  const r = await resendJson('/emails', key, o.fetchImpl || fetch, {
    method: 'POST',
    body: JSON.stringify({
      from: FORMS_TEST_FROM, to: [address],
      subject: `Colvy web form test ${token}`,
      text: `This is a test from Colvy to check that this web-form address receives email.\n\nName: Colvy test\nEmail: ${TEST_FROM_ADDR}\nMessage: If this shows up, website form submissions sent to ${address} will reach the inbox.\n\nIt's filed as closed and read, so nobody is notified.`,
      headers: { 'X-Colvy-Forms-Test': token },
    }),
  })
  if (!r.ok) return { ok: false, token, error: r.json?.message || `Resend answered ${r.status}` }
  return { ok: true, token, emailId: r.json?.id }
}

/**
 * Did the test email arrive? Looks for the conversation the inbound webhook
 * opened for it, and asks Resend what happened to the sent email (a bounce
 * means the domain isn't receiving).
 */
export async function checkFormsTest(db: any, o: { token: string; channelId: string; emailId?: string | null; fetchImpl?: typeof fetch; resendKey?: string | null }): Promise<{ arrived: boolean; conversationId: string | null; delivery: string | null }> {
  if (!/^[a-z0-9]{10,}$/i.test(o.token)) return { arrived: false, conversationId: null, delivery: null }
  const { data } = await db.from('conversations').select('id').eq('email_channel_id', o.channelId).ilike('subject', `%${o.token}%`).limit(1)
  const conversationId = data?.[0]?.id || null
  let delivery: string | null = null
  const key = o.resendKey === undefined ? process.env.RESEND_API_KEY : o.resendKey
  if (!conversationId && o.emailId && key) {
    try { const r = await resendJson(`/emails/${encodeURIComponent(o.emailId)}`, key, o.fetchImpl || fetch); if (r.ok) delivery = r.json?.last_event || null } catch {}
  }
  return { arrived: !!conversationId, conversationId, delivery }
}

/**
 * A Colvy test email (from our own sending address, DKIM/DMARC verified, with
 * the test subject). The webhook files it closed and read, with no agent,
 * auto-reply or notification.
 */
export function isFormsTestEmail(fromEmail: string | null | undefined, subject: string | null | undefined, auth: string): boolean {
  return auth === 'pass' && String(fromEmail || '').toLowerCase() === TEST_FROM_ADDR && TEST_SUBJECT.test(String(subject || ''))
}

// A short-lived memo so the per-business page doesn't do DNS + Resend lookups on every view.
let memo: { at: number; v: FormsHealth } | null = null
export async function cachedFormsHealth(ttlMs = 5 * 60_000): Promise<FormsHealth> {
  if (memo && Date.now() - memo.at < ttlMs) return memo.v
  const v = await formsDomainHealth()
  memo = { at: Date.now(), v }
  return v
}
export const clearFormsHealthCache = () => { memo = null }
