// How far a workspace is through setup, worked out from what's actually
// connected rather than from boxes someone ticked. Used by GET
// /api/setup/status for the dashboard checklist and the /onboarding launcher.
//
// Seven steps, each read from tables that already exist:
//   email       an active mailbox in email_channels (not a web-form address)
//   meta        an active Facebook Page or Instagram account in meta_channels
//   store       an active Shopify or WooCommerce store
//   phone       a number in phone_numbers (or a bring-your-own Twilio/Telnyx
//               number). A submitted AU regulatory bundle or a pending number
//               reads as "waiting" — approval can take a day or two.
//   customers   at least one contact (Shopify's connect imports them)
//   team        someone besides the owner, joined or invited
//   automation  anything that answers or messages customers for them
//
// Every read is best-effort: a table or column a workspace doesn't have (a
// migration that hasn't run) counts as "not done" instead of failing.

export type SetupStepKey = 'email' | 'meta' | 'store' | 'phone' | 'customers' | 'team' | 'automation'
export type SetupState = 'done' | 'waiting' | 'todo'

export type SetupStep = {
  key: SetupStepKey
  state: SetupState
  /** Short, plain detail: what's connected, or why it's waiting. */
  detail: string | null
}

export type SetupStatus = {
  steps: SetupStep[]
  done: number
  total: number
  complete: boolean
  createdAt: string | null
  ageDays: number | null
  /** Which store is connected, so "Add customers" can point at its import. */
  store: 'shopify' | 'woocommerce' | null
  industry: string | null
}

export const SETUP_ORDER: SetupStepKey[] = ['email', 'meta', 'store', 'phone', 'customers', 'team', 'automation']

const DAY = 864e5
// Regulatory bundle states that mean "sent off, waiting on the carrier".
const BUNDLE_WAITING = ['submitted', 'validating', 'pending', 'in_review', 'in-review', 'pending_review', 'pending-review']

// The bits of a Supabase query builder used here (the service-role client in
// the API route, an in-memory fake in tests).
type Result = { data?: unknown; error?: unknown; count?: number | null }
interface Query extends PromiseLike<Result> {
  select(cols: string, opts?: { count?: 'exact'; head?: boolean }): Query
  eq(col: string, v: unknown): Query
  neq(col: string, v: unknown): Query
  not(col: string, op: string, v: unknown): Query
  order(col: string, opts?: { ascending?: boolean }): Query
  limit(n: number): Query
  maybeSingle(): PromiseLike<Result>
}
export type SetupDb = { from: (table: string) => Query }

type Row = Record<string, unknown>
const obj = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? v as Row : {})
const str = (v: unknown) => (v == null ? '' : String(v))

// The rows from a query, or [] if it errored or threw (missing table/column).
async function rows(q: () => PromiseLike<Result>): Promise<Row[]> {
  try {
    const { data, error } = await q()
    return error || !Array.isArray(data) ? [] : data.map(obj)
  } catch { return [] }
}
async function one(q: () => PromiseLike<Result>): Promise<Row | null> {
  try {
    const { data, error } = await q()
    return error || !data ? null : obj(data)
  } catch { return null }
}
async function count(q: () => PromiseLike<Result>): Promise<number> {
  try {
    const { count: n, error } = await q()
    return error ? 0 : (n || 0)
  } catch { return 0 }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-AU')} ${n === 1 ? one : many}`
const isOn = (v: unknown) => v === true || v === 'true'
const list = (xs: string[]) => xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

export async function computeSetupStatus(db: SetupDb, companyId: string, now: Date = new Date()): Promise<SetupStatus> {
  const [
    company, email, meta, shopify, woo, numbers, bundle, twilio, telnyx,
    contacts, staff, invitedViewers, keywordReplies, agents,
  ] = await Promise.all([
    // `*` so a JSON settings column that isn't there yet can't fail the read.
    one(() => db.from('companies').select('*').eq('id', companyId).maybeSingle()),
    rows(() => db.from('email_channels').select('id, provider, inbound_address').eq('company_id', companyId).eq('is_active', true).limit(50)),
    rows(() => db.from('meta_channels').select('platform, page_name, ig_username').eq('company_id', companyId).eq('is_active', true).limit(50)),
    rows(() => db.from('shopify_integrations').select('store_name, store_domain').eq('company_id', companyId).eq('is_active', true).limit(10)),
    rows(() => db.from('woocommerce_integrations').select('store_url').eq('company_id', companyId).eq('is_active', true).limit(10)),
    rows(() => db.from('phone_numbers').select('phone_number, status').eq('company_id', companyId).limit(50)),
    one(() => db.from('number_regulatory_bundles').select('status, created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(1).maybeSingle()),
    one(() => db.from('twilio_integrations').select('phone_number').eq('company_id', companyId).limit(1).maybeSingle()),
    one(() => db.from('telnyx_integrations').select('phone_number').eq('company_id', companyId).limit(1).maybeSingle()),
    count(() => db.from('contacts').select('id', { count: 'exact', head: true }).eq('company_id', companyId)),
    // Staff rows, and anyone invited as a viewer. A plain 'viewer' row with no
    // inviter is a customer who signed up on the public board, not a teammate.
    rows(() => db.from('team_members').select('*').eq('company_id', companyId).neq('role', 'viewer').limit(500)),
    rows(() => db.from('team_members').select('*').eq('company_id', companyId).eq('role', 'viewer').not('invited_by', 'is', null).limit(200)),
    count(() => db.from('keyword_replies').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('is_active', true)),
    rows(() => db.from('agent_roles').select('role_key').eq('company_id', companyId).eq('enabled', true).limit(20)),
  ])

  const steps: SetupStep[] = []

  // ── Email ───────────────────────────────────────────────────────────────────
  const mailboxes = email.filter(r => str(r.provider).toLowerCase() !== 'webform')
  steps.push({
    key: 'email',
    state: mailboxes.length ? 'done' : 'todo',
    detail: mailboxes.length ? (mailboxes.length === 1 ? (str(mailboxes[0].inbound_address) || 'Mailbox connected') : plural(mailboxes.length, 'mailbox', 'mailboxes')) : null,
  })

  // ── Facebook & Instagram ───────────────────────────────────────────────────
  const fb = meta.filter(r => r.platform === 'facebook')
  const ig = meta.filter(r => r.platform === 'instagram')
  const metaBits: string[] = []
  if (fb.length) metaBits.push(fb.length === 1 && fb[0].page_name ? str(fb[0].page_name) : plural(fb.length, 'Facebook Page'))
  if (ig.length) metaBits.push(ig.length === 1 && ig[0].ig_username ? `@${str(ig[0].ig_username)}` : plural(ig.length, 'Instagram account'))
  steps.push({ key: 'meta', state: meta.length ? 'done' : 'todo', detail: metaBits.length ? metaBits.join(' · ') : null })

  // ── Online store ───────────────────────────────────────────────────────────
  const storeName = shopify[0] ? (str(shopify[0].store_name) || str(shopify[0].store_domain) || 'Shopify store')
    : woo[0] ? (str(woo[0].store_url) || 'WooCommerce store').replace(/^https?:\/\//, '').replace(/\/$/, '')
    : null
  const storeCount = shopify.length + woo.length
  steps.push({
    key: 'store',
    state: storeCount ? 'done' : 'todo',
    detail: storeCount > 1 ? plural(storeCount, 'store') : storeName,
  })

  // ── Business phone number ──────────────────────────────────────────────────
  const live = numbers.filter(r => { const s = (str(r.status) || 'active').toLowerCase(); return s !== 'released' && s !== 'pending' })
  const pendingNumber = numbers.some(r => str(r.status).toLowerCase() === 'pending')
  const byo = [twilio?.phone_number, telnyx?.phone_number].map(v => str(v).trim()).find(Boolean) || ''
  const bundleStatus = str(bundle?.status).toLowerCase()
  let phone: SetupStep
  if (live.length) phone = { key: 'phone', state: 'done', detail: live.length === 1 ? str(live[0].phone_number) : plural(live.length, 'number') }
  else if (byo) phone = { key: 'phone', state: 'done', detail: byo }
  else if (pendingNumber || BUNDLE_WAITING.includes(bundleStatus)) phone = { key: 'phone', state: 'waiting', detail: 'Waiting for approval' }
  else if (bundleStatus === 'approved') phone = { key: 'phone', state: 'todo', detail: 'Approved — pick your number' }
  else if (bundleStatus === 'rejected') phone = { key: 'phone', state: 'todo', detail: 'Your ID check needs another look' }
  else phone = { key: 'phone', state: 'todo', detail: null }
  steps.push(phone)

  // ── Customers ──────────────────────────────────────────────────────────────
  steps.push({ key: 'customers', state: contacts > 0 ? 'done' : 'todo', detail: contacts > 0 ? plural(contacts, 'customer') : null })

  // ── Team ───────────────────────────────────────────────────────────────────
  const ownerId = str(company?.owner_id) || null
  const seen = new Set<string>()
  let joined = 0, invited = 0
  for (const r of [...staff, ...invitedViewers]) {
    const status = str(r.status).toLowerCase()
    if (status === 'removed') continue
    if (ownerId && r.user_id === ownerId) continue
    if (str(r.role).toLowerCase() === 'owner' && !r.invited_by) continue
    const id = str(r.id || r.user_id || r.email)
    if (id && seen.has(id)) continue
    if (id) seen.add(id)
    if (status === 'invited' || (!r.user_id && status !== 'active')) invited++
    else joined++
  }
  const teamBits = [joined ? plural(joined, 'teammate') : '', invited ? `${invited} invited` : ''].filter(Boolean)
  steps.push({ key: 'team', state: joined + invited > 0 ? 'done' : 'todo', detail: teamBits.length ? teamBits.join(' · ') : null })

  // ── First automation ───────────────────────────────────────────────────────
  const oca = obj(company?.order_chat_automation)
  const autos: string[] = []
  if (keywordReplies > 0) autos.push(keywordReplies === 1 ? 'a keyword reply' : `${keywordReplies} keyword replies`)
  if (isOn(oca.enabled)) autos.push('order updates')
  if (isOn(obj(oca.cart_recovery).enabled)) autos.push('abandoned-cart texts')
  if (isOn(obj(company?.review_request_settings).enabled)) autos.push('review requests')
  if (isOn(obj(obj(company?.inbox_settings).media_upload_reply).enabled)) autos.push('the video upload reply')
  if (agents.length) autos.push(agents.length === 1 ? 'an AI agent' : `${agents.length} AI agents`)
  const autoDetail = autos.length ? `${list(autos)} on` : null
  steps.push({ key: 'automation', state: autos.length ? 'done' : 'todo', detail: autoDetail ? autoDetail.charAt(0).toUpperCase() + autoDetail.slice(1) : null })

  const done = steps.filter(s => s.state === 'done').length
  const createdAt = str(company?.created_at) || null
  const created = createdAt ? Date.parse(createdAt) : NaN
  return {
    steps,
    done,
    total: steps.length,
    complete: done === steps.length,
    createdAt,
    ageDays: isFinite(created) ? Math.max(0, Math.floor((now.getTime() - created) / DAY)) : null,
    store: shopify.length ? 'shopify' : woo.length ? 'woocommerce' : null,
    industry: str(company?.industry) || null,
  }
}

/** The same status without the details (connected addresses, page names, numbers). */
export function redactSetupStatus(s: SetupStatus): SetupStatus {
  return { ...s, steps: s.steps.map(st => ({ ...st, detail: st.state === 'waiting' ? st.detail : null })) }
}
