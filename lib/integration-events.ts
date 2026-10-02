// Colvy → outside tools (server only).
//
// Something happens in Colvy (a new order, booking, payment, ticket…), the code
// that made it happen calls emitIntegrationEvent(), and every integration the
// business has switched on for that event gets it: a Slack message, a signed
// JSON webhook, a Zap, a Jira/Linear/GitHub issue, a Trello card, a Zendesk
// ticket, or a note on the customer in Intercom.
//
// Delivery runs after the response is sent (next/server `after`), never blocks
// or breaks the action that triggered it, retries once, and is logged to
// integration_deliveries so the settings page can show what happened.

import crypto from 'crypto'
import dns from 'dns'
import { after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { INTEGRATIONS, eventLabel, normaliseEvents } from '@/lib/integrations-catalog'

export type EventPayload = {
  /** One line, e.g. "New order #124362 · $89.95". */
  title: string
  /** A sentence or two of context. */
  summary?: string | null
  /** Path in the Colvy admin, e.g. /admin/orders/<id>. */
  path?: string | null
  customer?: { name?: string | null; email?: string | null; phone?: string | null } | null
  /** Shown as label/value pairs in Slack, issue bodies and tickets. */
  fields?: Record<string, string | number | null | undefined>
  /** Raw details for webhooks and Zapier. */
  data?: Record<string, any>
  /** Same key within 10 minutes → delivered once (guards double calls). */
  dedupeKey?: string | null
}

type Envelope = {
  id: string
  event: string
  event_label: string
  created_at: string
  company: { id: string; name: string }
  data: {
    title: string
    summary: string | null
    url: string | null
    customer: { name: string | null; email: string | null; phone: string | null } | null
    fields: Record<string, string>
    [k: string]: any
  }
}

export type SendResult = { ok: boolean; status?: number; error?: string; ref?: string | null; skipped?: boolean }

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ── Emit ─────────────────────────────────────────────────────────────────────

/** Tell the business's integrations about an event. Never throws, never blocks. */
export function emitIntegrationEvent(companyId: string | null | undefined, event: string, payload: EventPayload, opts: { db?: any } = {}) {
  if (!companyId || !event) return
  const run = () => deliverEvent(opts.db || admin(), companyId, event, payload).then(() => {}, e => console.error('[integrations] emit', event, e?.message || e))
  try { after(run) } catch { void run() }   // outside a request (scripts/tests): run now
}

/**
 * Deliver one event. `only` targets a single integration (the "Send test event"
 * button), ignoring whether it's switched on or subscribed.
 */
export async function deliverEvent(db: any, companyId: string, event: string, payload: EventPayload, opts: { only?: string; test?: boolean } = {}): Promise<Array<{ integration: string } & SendResult>> {
  let q = db.from('integration_configs').select('integration_id, config, enabled, events').eq('company_id', companyId)
  if (opts.only) q = q.eq('integration_id', opts.only)
  else q = q.eq('enabled', true)
  const { data: rows, error } = await q
  if (error || !rows?.length) return []
  const targets = rows.filter((r: any) => opts.only || normaliseEvents(r.events).includes(event))
  if (!targets.length) return []

  const { data: co } = await db.from('companies').select('id, name, slug').eq('id', companyId).maybeSingle()
  const env = envelope(co || { id: companyId, name: 'Colvy' }, event, payload)

  return Promise.all(targets.map(async (r: any) => {
    const integration = String(r.integration_id)
    if (!opts.test && payload.dedupeKey && await alreadySent(db, companyId, integration, payload.dedupeKey)) {
      return { integration, ok: true, skipped: true, error: 'Already sent' }
    }
    const started = Date.now()
    let res: SendResult
    try {
      res = await send(integration, r.config || {}, env)
      if (!res.ok && !res.skipped && (res.status === undefined || res.status >= 500 || res.status === 429)) {
        await new Promise(r2 => setTimeout(r2, 1200))
        res = await send(integration, r.config || {}, env)
      }
    } catch (e: any) { res = { ok: false, error: e?.message || 'Failed' } }
    try {
      await db.from('integration_deliveries').insert({
        company_id: companyId, integration_id: integration, event, title: env.data.title.slice(0, 300),
        status: res.skipped ? 'skipped' : res.ok ? 'sent' : 'failed',
        http_status: res.status ?? null, error: res.ok ? null : (res.error || 'Failed').slice(0, 500),
        ref_url: res.ref || null, dedupe_key: payload.dedupeKey || null, test: !!opts.test,
        duration_ms: Date.now() - started,
      })
    } catch {}
    return { integration, ...res }
  }))
}

async function alreadySent(db: any, companyId: string, integration: string, key: string) {
  try {
    const since = new Date(Date.now() - 10 * 60_000).toISOString()
    const { data } = await db.from('integration_deliveries').select('id').eq('company_id', companyId)
      .eq('integration_id', integration).eq('dedupe_key', key).eq('status', 'sent').gte('created_at', since).limit(1)
    return !!data?.length
  } catch { return false }
}

export function adminBase(co: { slug?: string | null } | null) {
  if (co?.slug && !/[^a-z0-9-]/i.test(co.slug)) return `https://${co.slug}.colvy.com`
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').replace(/\/$/, '')
}

function envelope(co: { id: string; name?: string | null; slug?: string | null }, event: string, p: EventPayload): Envelope {
  const fields: Record<string, string> = {}
  for (const [k, v] of Object.entries(p.fields || {})) if (v !== null && v !== undefined && String(v).trim() !== '') fields[k] = String(v)
  const c = p.customer && (p.customer.name || p.customer.email || p.customer.phone)
    ? { name: p.customer.name || null, email: p.customer.email || null, phone: p.customer.phone || null } : null
  return {
    id: crypto.randomUUID(),
    event, event_label: eventLabel(event), created_at: new Date().toISOString(),
    company: { id: co.id, name: co.name || 'Colvy' },
    data: {
      ...(p.data || {}),
      title: p.title, summary: p.summary || null,
      url: p.path ? adminBase(co) + p.path : null,
      customer: c, fields,
    },
  }
}

// ── Senders ──────────────────────────────────────────────────────────────────

export async function send(integration: string, cfg: Record<string, any>, env: Envelope): Promise<SendResult> {
  switch (integration) {
    case 'webhook': return sendWebhook(cfg.url, env, cfg.secret)
    case 'zapier': return sendWebhook(cfg.webhook_url, env, null, /^https:\/\/hooks\.zapier\.com\//)
    case 'slack': return sendSlack(cfg, env)
    case 'jira': return sendJira(cfg, env)
    case 'linear': return sendLinear(cfg, env)
    case 'trello': return sendTrello(cfg, env)
    case 'github': return sendGitHub(cfg, env)
    case 'zendesk': return sendZendesk(cfg, env)
    case 'intercom': return sendIntercom(cfg, env)
    default: return { ok: false, error: 'Unknown integration' }
  }
}

const UA = 'Colvy-Integrations/2.0 (+https://colvy.com)'

async function http(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<{ status: number; ok: boolean; json: any; text: string }> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), init.timeoutMs || 10_000)
  try {
    const res = await fetch(url, { ...init, redirect: 'manual', signal: ctl.signal, headers: { 'User-Agent': UA, ...(init.headers || {}) } })
    const text = await res.text().catch(() => '')
    let json: any = null
    try { json = text ? JSON.parse(text) : null } catch {}
    return { status: res.status, ok: res.ok, json, text }
  } catch (e: any) {
    throw new Error(e?.name === 'AbortError' ? 'Timed out after 10 seconds' : (e?.message || 'Network error'))
  } finally { clearTimeout(t) }
}

const apiError = (r: { status: number; json: any; text: string }, fallback: string) => {
  const j = r.json
  const msg = j?.errorMessages?.[0] || (j?.errors && typeof j.errors === 'object' ? Object.values(j.errors)[0] : null)
    || j?.errors?.[0]?.message || j?.error?.message || j?.error || j?.message || j?.description || (r.text && r.text.length < 200 ? r.text : '')
  return `${fallback} (${r.status}${msg ? `: ${String(msg).slice(0, 200)}` : ''})`
}

// Outbound URLs the business types in must be public https — never our own
// network or a cloud metadata address.
export async function checkPublicUrl(raw: string): Promise<string | null> {
  let u: URL
  try { u = new URL(String(raw || '').trim()) } catch { return 'Enter a full https:// address.' }
  if (u.protocol !== 'https:') return 'The address must start with https://.'
  const host = u.hostname.toLowerCase()
  if (!host.includes('.') || /(^|\.)(localhost|internal|local|lan)$/.test(host)) return 'That address isn’t reachable from the internet.'
  try {
    const addrs = await dns.promises.lookup(host, { all: true })
    if (addrs.some(a => privateIp(a.address))) return 'That address points to a private network.'
  } catch { return 'That address could not be found.' }
  return null
}
function privateIp(ip: string) {
  if (ip.includes(':')) return ip === '::1' || /^f[cd]/i.test(ip) || /^fe80/i.test(ip) || ip.startsWith('::ffff:') && privateIp(ip.slice(7))
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
}

async function sendWebhook(url: string, env: Envelope, secret?: string | null, mustMatch?: RegExp): Promise<SendResult> {
  if (!url) return { ok: false, error: 'No URL set' }
  if (mustMatch && !mustMatch.test(url)) return { ok: false, error: 'That isn’t a Zapier catch hook URL' }
  const bad = await checkPublicUrl(url)
  if (bad) return { ok: false, error: bad }
  const body = JSON.stringify(env)
  const ts = Math.floor(Date.now() / 1000)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Colvy-Event': env.event, 'X-Colvy-Delivery': env.id, 'X-Colvy-Timestamp': String(ts),
  }
  if (secret) headers['X-Colvy-Signature'] = `t=${ts},v1=${signPayload(secret, ts, body)}`
  const r = await http(url, { method: 'POST', headers, body })
  return r.ok ? { ok: true, status: r.status } : { ok: false, status: r.status, error: apiError(r, 'The endpoint replied with an error') }
}

export function signPayload(secret: string, ts: number, body: string) {
  return crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')
}

// Plain-text rendering used by issues, cards, tickets and notes.
function bodyText(env: Envelope, md = true) {
  const b = (s: string) => md ? `**${s}**` : s
  const lines: string[] = []
  if (env.data.summary) lines.push(env.data.summary, '')
  const c = env.data.customer
  if (c) lines.push(`${b('Customer:')} ${[c.name, c.email, c.phone].filter(Boolean).join(' · ')}`)
  for (const [k, v] of Object.entries(env.data.fields)) lines.push(`${b(k + ':')} ${v}`)
  if (env.data.url) lines.push('', `${md ? `[Open in Colvy](${env.data.url})` : `Open in Colvy: ${env.data.url}`}`)
  lines.push('', `${env.company.name} · ${env.event_label} · via Colvy`)
  return lines.join('\n').trim()
}

const slackEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function sendSlack(cfg: any, env: Envelope): Promise<SendResult> {
  const url = String(cfg.webhook_url || '')
  if (!/^https:\/\/hooks\.slack\.com\//.test(url)) return { ok: false, error: 'That isn’t a Slack incoming webhook URL' }
  const mention = String(cfg.mention || '').trim()
  const m = mention === '@here' ? '<!here> ' : mention === '@channel' ? '<!channel> ' : /^<[@!#][^>]+>$/.test(mention) ? mention + ' ' : ''
  const fields = Object.entries(env.data.fields).slice(0, 10).map(([k, v]) => ({ type: 'mrkdwn', text: `*${slackEsc(k)}*\n${slackEsc(v).slice(0, 300)}` }))
  const c = env.data.customer
  if (c && fields.length < 10) fields.unshift({ type: 'mrkdwn', text: `*Customer*\n${slackEsc([c.name, c.email || c.phone].filter(Boolean).join(' · '))}` })
  const blocks: any[] = [{ type: 'section', text: { type: 'mrkdwn', text: `${m}*${slackEsc(env.data.title)}*${env.data.summary ? `\n${slackEsc(env.data.summary).slice(0, 1500)}` : ''}` } }]
  if (fields.length) blocks.push({ type: 'section', fields: fields.slice(0, 10) })
  if (env.data.url) blocks.push({ type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open in Colvy' }, url: env.data.url }] })
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `${slackEsc(env.company.name)} · ${slackEsc(env.event_label)}` }] })
  const r = await http(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `${m}${env.data.title}`, blocks }) })
  return r.ok ? { ok: true, status: r.status } : { ok: false, status: r.status, error: apiError(r, 'Slack rejected the message') }
}

const jiraSite = (d: string) => {
  const h = String(d || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  return h ? (h.includes('.') ? h : `${h}.atlassian.net`) : ''
}
const basic = (u: string, p: string) => 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64')

async function sendJira(cfg: any, env: Envelope): Promise<SendResult> {
  const site = jiraSite(cfg.domain)
  if (!site || !cfg.email || !cfg.api_token || !cfg.project_key) return { ok: false, error: 'Fill in the Jira site, email, API token and project key' }
  const para = (text: string) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })
  const content = bodyText(env, false).split('\n').map(para)
  if (env.data.url) content.push({ type: 'paragraph', content: [{ type: 'text', text: 'Open in Colvy', marks: [{ type: 'link', attrs: { href: env.data.url } }] }] } as any)
  const r = await http(`https://${site}/rest/api/3/issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: basic(cfg.email, cfg.api_token) },
    body: JSON.stringify({ fields: {
      project: { key: String(cfg.project_key).trim().toUpperCase() },
      summary: env.data.title.slice(0, 250),
      issuetype: { name: String(cfg.issue_type || 'Task').trim() || 'Task' },
      labels: ['colvy'],
      description: { type: 'doc', version: 1, content },
    } }),
  })
  return r.ok ? { ok: true, status: r.status, ref: r.json?.key ? `https://${site}/browse/${r.json.key}` : null } : { ok: false, status: r.status, error: apiError(r, 'Jira didn’t create the issue') }
}

async function linearGql(key: string, query: string, variables: any = {}) {
  return http('https://api.linear.app/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: String(key).trim() }, body: JSON.stringify({ query, variables }) })
}
async function linearTeamId(cfg: any): Promise<string | null> {
  if (cfg.team_key) {
    const r = await linearGql(cfg.api_key, 'query($k:String!){ teams(filter:{ key:{ eq:$k } }){ nodes { id } } }', { k: String(cfg.team_key).trim().toUpperCase() })
    return r.json?.data?.teams?.nodes?.[0]?.id || null
  }
  return cfg.team_id || null   // first version stored the id itself
}
async function sendLinear(cfg: any, env: Envelope): Promise<SendResult> {
  if (!cfg.api_key) return { ok: false, error: 'Add your Linear API key' }
  const teamId = await linearTeamId(cfg)
  if (!teamId) return { ok: false, error: `No Linear team with the key "${cfg.team_key || ''}"` }
  const r = await linearGql(cfg.api_key, 'mutation($i: IssueCreateInput!){ issueCreate(input:$i){ success issue { identifier url } } }',
    { i: { teamId, title: env.data.title.slice(0, 250), description: bodyText(env) } })
  const issue = r.json?.data?.issueCreate?.issue
  return r.ok && issue ? { ok: true, status: r.status, ref: issue.url } : { ok: false, status: r.status, error: r.json?.errors?.[0]?.message || apiError(r, 'Linear didn’t create the issue') }
}

const trelloAuth = (cfg: any) => `key=${encodeURIComponent(cfg.api_key || '')}&token=${encodeURIComponent(cfg.token || '')}`
const trelloBoard = (cfg: any) => String(cfg.board_url || '').match(/trello\.com\/b\/([A-Za-z0-9]+)/)?.[1] || cfg.board_id || String(cfg.board_url || '').trim()
export async function trelloLists(cfg: any): Promise<{ ok: boolean; lists?: { id: string; name: string }[]; error?: string }> {
  const board = trelloBoard(cfg)
  if (!cfg.api_key || !cfg.token || !board) return { ok: false, error: 'Fill in the API key, token and board link' }
  const r = await http(`https://api.trello.com/1/boards/${encodeURIComponent(board)}/lists?filter=open&fields=name&${trelloAuth(cfg)}`)
  if (!r.ok || !Array.isArray(r.json)) return { ok: false, error: apiError(r, 'Trello couldn’t open that board') }
  return { ok: true, lists: r.json.map((l: any) => ({ id: l.id, name: l.name })) }
}
async function sendTrello(cfg: any, env: Envelope): Promise<SendResult> {
  const l = await trelloLists(cfg)
  if (!l.ok || !l.lists?.length) return { ok: false, error: l.error || 'That board has no lists' }
  const want = String(cfg.list_name || '').trim().toLowerCase()
  const list = (want && l.lists.find(x => x.name.toLowerCase() === want)) || l.lists[0]
  const r = await http(`https://api.trello.com/1/cards?${trelloAuth(cfg)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idList: list.id, name: env.data.title.slice(0, 250), desc: bodyText(env), pos: 'top', ...(env.data.url ? { urlSource: env.data.url } : {}) }),
  })
  return r.ok ? { ok: true, status: r.status, ref: r.json?.shortUrl || null } : { ok: false, status: r.status, error: apiError(r, 'Trello didn’t add the card') }
}

const ghHeaders = (token: string) => ({ Authorization: `Bearer ${String(token).trim()}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' })
const ghRepo = (r: string) => String(r || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$|\/$/g, '')
async function sendGitHub(cfg: any, env: Envelope): Promise<SendResult> {
  const repo = ghRepo(cfg.repo)
  if (!cfg.token || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return { ok: false, error: 'Add an access token and the repository as owner/repo' }
  const labels = String(cfg.labels || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 10)
  const r = await http(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST', headers: { ...ghHeaders(cfg.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: env.data.title.slice(0, 250), body: bodyText(env), ...(labels.length ? { labels } : {}) }),
  })
  return r.ok ? { ok: true, status: r.status, ref: r.json?.html_url || null } : { ok: false, status: r.status, error: apiError(r, 'GitHub didn’t open the issue') }
}

const zdBase = (s: string) => `https://${String(s || '').trim().replace(/^https?:\/\//, '').replace(/\.zendesk\.com.*$/, '')}.zendesk.com`
async function sendZendesk(cfg: any, env: Envelope): Promise<SendResult> {
  if (!cfg.subdomain || !cfg.email || !cfg.api_token) return { ok: false, error: 'Fill in the subdomain, agent email and API token' }
  const c = env.data.customer
  const r = await http(`${zdBase(cfg.subdomain)}/api/v2/tickets.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: basic(`${cfg.email}/token`, cfg.api_token) },
    body: JSON.stringify({ ticket: {
      subject: env.data.title.slice(0, 250),
      comment: { body: bodyText(env, false) },
      ...(c?.email ? { requester: { name: c.name || c.email, email: c.email } } : {}),
      tags: ['colvy', env.event.replace(/\./g, '_')],
    } }),
  })
  return r.ok ? { ok: true, status: r.status, ref: r.json?.ticket?.id ? `${zdBase(cfg.subdomain)}/agent/tickets/${r.json.ticket.id}` : null } : { ok: false, status: r.status, error: apiError(r, 'Zendesk didn’t create the ticket') }
}

const icHeaders = (t: string) => ({ Authorization: `Bearer ${String(t).trim()}`, Accept: 'application/json', 'Content-Type': 'application/json', 'Intercom-Version': '2.11' })
async function sendIntercom(cfg: any, env: Envelope): Promise<SendResult> {
  if (!cfg.access_token) return { ok: false, error: 'Add your Intercom access token' }
  const c = env.data.customer
  if (!c?.email && !c?.phone) return { ok: true, skipped: true, error: 'No customer email or phone on this event' }
  const h = icHeaders(cfg.access_token)
  const me = await http('https://api.intercom.io/me', { headers: h })
  if (!me.ok || !me.json?.id) return { ok: false, status: me.status, error: apiError(me, 'Intercom didn’t accept the token') }
  const field = c.email ? 'email' : 'phone'
  const found = await http('https://api.intercom.io/contacts/search', { method: 'POST', headers: h, body: JSON.stringify({ query: { field, operator: '=', value: c.email || c.phone } }) })
  let contactId = found.json?.data?.[0]?.id
  if (!contactId) {
    const made = await http('https://api.intercom.io/contacts', { method: 'POST', headers: h, body: JSON.stringify({ role: 'user', ...(c.email ? { email: c.email } : {}), ...(c.phone ? { phone: c.phone } : {}), ...(c.name ? { name: c.name } : {}) }) })
    contactId = made.json?.id
    if (!contactId) return { ok: false, status: made.status, error: apiError(made, 'Intercom didn’t create the contact') }
  }
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = `<p><b>${esc(env.data.title)}</b></p>` + bodyText(env, false).split('\n').filter(Boolean).map(l => `<p>${esc(l)}</p>`).join('')
  const note = await http(`https://api.intercom.io/contacts/${contactId}/notes`, { method: 'POST', headers: h, body: JSON.stringify({ body: html, admin_id: String(me.json.id) }) })
  return note.ok ? { ok: true, status: note.status, ref: `https://app.intercom.com/a/apps/${me.json.app?.id_code || ''}/users/${contactId}/all-conversations` } : { ok: false, status: note.status, error: apiError(note, 'Intercom didn’t add the note') }
}

// ── Test connection (no event sent) ──────────────────────────────────────────

export async function testConnection(integration: string, cfg: any): Promise<{ ok: boolean; message: string; options?: any }> {
  try {
    switch (integration) {
      case 'webhook': {
        const bad = await checkPublicUrl(cfg.url)
        return bad ? { ok: false, message: bad } : { ok: true, message: 'The address looks good. Send a test event to check your endpoint replies.' }
      }
      case 'zapier': return /^https:\/\/hooks\.zapier\.com\/hooks\/catch\//.test(String(cfg.webhook_url || '')) ? { ok: true, message: 'Looks like a Zapier catch hook. Send a test event so Zapier can see the fields.' } : { ok: false, message: 'That isn’t a Zapier catch hook URL.' }
      case 'slack': return /^https:\/\/hooks\.slack\.com\/services\//.test(String(cfg.webhook_url || '')) ? { ok: true, message: 'Looks like a Slack webhook. Send a test event to see it in the channel.' } : { ok: false, message: 'That isn’t a Slack incoming webhook URL.' }
      case 'jira': {
        const site = jiraSite(cfg.domain)
        if (!site || !cfg.email || !cfg.api_token) return { ok: false, message: 'Fill in the Jira site, email and API token.' }
        const h = { Accept: 'application/json', Authorization: basic(cfg.email, cfg.api_token) }
        const me = await http(`https://${site}/rest/api/3/myself`, { headers: h })
        if (!me.ok) return { ok: false, message: apiError(me, 'Jira didn’t accept those details') }
        if (!cfg.project_key) return { ok: true, message: `Signed in as ${me.json?.displayName || cfg.email}. Now add the project key.` }
        const p = await http(`https://${site}/rest/api/3/project/${encodeURIComponent(String(cfg.project_key).trim().toUpperCase())}`, { headers: h })
        return p.ok ? { ok: true, message: `Connected as ${me.json?.displayName || cfg.email} to ${p.json?.name || cfg.project_key}.` } : { ok: false, message: apiError(p, 'Couldn’t open that project') }
      }
      case 'linear': {
        if (!cfg.api_key) return { ok: false, message: 'Add your Linear API key.' }
        const r = await linearGql(cfg.api_key, '{ viewer { name } teams { nodes { key name } } }')
        if (!r.ok || r.json?.errors) return { ok: false, message: r.json?.errors?.[0]?.message || apiError(r, 'Linear didn’t accept the key') }
        const teams = r.json?.data?.teams?.nodes || []
        const match = teams.find((t: any) => t.key === String(cfg.team_key || '').trim().toUpperCase())
        if (cfg.team_key && !match) return { ok: false, message: `No team with key ${cfg.team_key}. Your teams: ${teams.map((t: any) => `${t.key} (${t.name})`).join(', ')}.` }
        return { ok: true, message: match ? `Connected as ${r.json.data.viewer?.name} to ${match.name}.` : `Connected as ${r.json.data.viewer?.name}. Teams: ${teams.map((t: any) => t.key).join(', ')}.`, options: { teams } }
      }
      case 'trello': {
        const l = await trelloLists(cfg)
        if (!l.ok) return { ok: false, message: l.error || 'Couldn’t reach Trello.' }
        const want = String(cfg.list_name || '').trim().toLowerCase()
        const hit = want ? l.lists!.find(x => x.name.toLowerCase() === want) : l.lists![0]
        if (want && !hit) return { ok: false, message: `No list called "${cfg.list_name}". Lists on this board: ${l.lists!.map(x => x.name).join(', ')}.` }
        return { ok: true, message: `Connected. Cards will go into "${hit?.name}".`, options: { lists: l.lists!.map(x => x.name) } }
      }
      case 'github': {
        const repo = ghRepo(cfg.repo)
        if (!cfg.token || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return { ok: false, message: 'Add an access token and the repository as owner/repo.' }
        const r = await http(`https://api.github.com/repos/${repo}`, { headers: ghHeaders(cfg.token) })
        if (!r.ok) return { ok: false, message: apiError(r, 'Couldn’t open that repository') }
        return r.json?.has_issues === false ? { ok: false, message: 'Issues are turned off on that repository.' } : { ok: true, message: `Connected to ${r.json?.full_name}.` }
      }
      case 'zendesk': {
        if (!cfg.subdomain || !cfg.email || !cfg.api_token) return { ok: false, message: 'Fill in the subdomain, agent email and API token.' }
        const r = await http(`${zdBase(cfg.subdomain)}/api/v2/users/me.json`, { headers: { Authorization: basic(`${cfg.email}/token`, cfg.api_token) } })
        const u = r.json?.user
        return r.ok && u?.id ? { ok: true, message: `Connected as ${u.name} (${u.role}).` } : { ok: false, message: apiError(r, 'Zendesk didn’t accept those details') }
      }
      case 'intercom': {
        if (!cfg.access_token) return { ok: false, message: 'Add your Intercom access token.' }
        const r = await http('https://api.intercom.io/me', { headers: icHeaders(cfg.access_token) })
        return r.ok && r.json?.id ? { ok: true, message: `Connected to ${r.json.app?.name || 'Intercom'} as ${r.json.name}.` } : { ok: false, message: apiError(r, 'Intercom didn’t accept the token') }
      }
    }
    return { ok: false, message: 'Unknown integration.' }
  } catch (e: any) { return { ok: false, message: e?.message || 'Couldn’t connect.' } }
}

// ── Sample event for "Send test event" ───────────────────────────────────────

export function sampleEvent(event: string): EventPayload {
  const customer = { name: 'Alex Test', email: 'alex.test@example.com', phone: '+61400000000' }
  const s: Record<string, EventPayload> = {
    'conversation.created': { title: 'New conversation from Alex Test', summary: '“Hi, do you have female guppies in stock?”', path: '/admin/inbox', customer, fields: { Channel: 'Website chat' } },
    'message.received': { title: 'New message from Alex Test', summary: '“Can I pick it up tomorrow?”', path: '/admin/inbox', customer, fields: { Channel: 'SMS' } },
    'order.created': { title: 'New order #TEST-1001 · $89.95', summary: '3 items · Click & Collect', path: '/admin/orders', customer, fields: { Total: '$89.95', Items: 3, Status: 'Processing', Shipping: 'Click & Collect' } },
    'order.status_changed': { title: 'Order #TEST-1001 is now Shipped', path: '/admin/orders', customer, fields: { 'Old status': 'Packed', 'New status': 'Shipped' } },
    'booking.created': { title: 'New booking: Aquarium Setup Consultation', summary: 'Mon 6 Oct, 10:00 am – 11:00 am', path: '/admin/bookings', customer, fields: { Service: 'Aquarium Setup Consultation', When: 'Mon 6 Oct, 10:00 am', Paid: '$1.00' } },
    'booking.rescheduled': { title: 'Booking moved: Aquarium Setup Consultation', path: '/admin/bookings', customer, fields: { From: 'Mon 6 Oct, 10:00 am', To: 'Tue 7 Oct, 2:00 pm' } },
    'booking.cancelled': { title: 'Booking cancelled: Aquarium Setup Consultation', path: '/admin/bookings', customer, fields: { When: 'Mon 6 Oct, 10:00 am' } },
    'payment.received': { title: 'Payment received · $49.00', summary: 'Paid by card through a payment link', path: '/admin/payments', customer, fields: { Amount: '$49.00', For: 'Deposit for tank installation' } },
    'ticket.created': { title: 'New ticket TICK-001: Filter making a noise', summary: '“My canister filter started rattling after cleaning.”', path: '/admin/tickets', customer, fields: { Priority: 'Normal' } },
    'ticket.status_changed': { title: 'Ticket TICK-001 is now Resolved', path: '/admin/tickets', customer, fields: { 'New status': 'Resolved' } },
    'review.received': { title: 'New 5-star Google review from Alex Test', summary: '“Great range of fish and really helpful staff.”', path: '/admin/reviews', fields: { Rating: '5 / 5' } },
    'call.missed': { title: 'Missed call from +61400000000', path: '/admin/calls', customer, fields: { Number: '+61400000000' } },
    'voicemail.received': { title: 'New voicemail from +61400000000', summary: 'A 24 second voicemail is waiting.', path: '/admin/calls', customer },
    'form.submitted': { title: 'New response to “Contact us”', summary: 'Alex Test filled in your form.', path: '/admin/forms', customer, fields: { Message: 'Do you deliver to Geelong?' } },
    'task.created': { title: 'New task: Call Alex about the tank quote', path: '/admin/tasks', fields: { Due: 'Tomorrow', 'Assigned to': 'Bikiran' } },
    'idea.created': { title: 'New idea: Stock more planted-tank supplies', summary: 'It would be great to see more CO₂ kits and ferts.', path: '/admin', fields: { Status: 'Under review' } },
    'idea.voted': { title: 'New vote on “Stock more planted-tank supplies”', path: '/admin', fields: { Votes: 12 } },
    'idea.status_changed': { title: '“Stock more planted-tank supplies” is now Planned', path: '/admin/roadmap', fields: { 'New status': 'Planned' } },
    'idea.commented': { title: 'New comment on “Stock more planted-tank supplies”', summary: '“Yes please, especially the liquid ferts.”', path: '/admin' },
    'announcement.published': { title: 'Announcement: New opening hours', summary: 'We’re now open until 7pm on Thursdays.', path: '/admin/announcements' },
  }
  const p = s[event] || { title: `Test event from Colvy`, summary: 'This is a test.' }
  return { ...p, title: `[Test] ${p.title}`, data: { test: true } }
}

export const integrationIds = () => INTEGRATIONS.filter(i => !i.isDedicated).map(i => i.id)
