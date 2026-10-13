import { safe, hostOnly } from './super-admin'

// Every connected channel / store / tool across the platform (or one business),
// reduced to safe display fields. Rows are read with the service role and the
// secret columns (API keys, tokens, SIP passwords…) never leave this file.

export type IntegrationRow = {
  type: string          // display group, e.g. 'Shopify'
  key: string           // stable id for the row
  company_id: string | null
  detail: string        // what's connected (address, store, number, page…)
  active: boolean
  last: string | null   // last sync / activity / created
  note: string          // a warning to show instead of "Connected" (empty = fine)
  error: string | null  // the last error text, if the provider recorded one
}

export const INTEGRATION_TYPES: { type: string; color: string }[] = [
  { type: 'Email', color: '#8b5cf6' },
  { type: 'Phone numbers', color: '#0891b2' },
  { type: 'Twilio', color: '#f22f46' },
  { type: 'Telnyx', color: '#00c08b' },
  { type: 'Facebook', color: '#0866ff' },
  { type: 'Instagram', color: '#d62976' },
  { type: 'WooCommerce', color: '#96588a' },
  { type: 'Shopify', color: '#5e8e3e' },
  { type: 'Google reviews', color: '#eab308' },
  { type: 'Outside tools (MCP)', color: '#6366f1' },
]

const DAY = 86_400_000
const ageMs = (d: any) => (d ? Date.now() - new Date(d).getTime() : Infinity)
const str = (v: any) => (v == null ? '' : String(v))
const short = (s: any) => (s ? String(s).slice(0, 300) : null)

export async function collectIntegrations(db: any, companyId?: string | null): Promise<{ rows: IntegrationRow[]; missing: string[] }> {
  const scoped = (t: string) => {
    let q = db.from(t).select('*').limit(2000)
    if (companyId) q = q.eq('company_id', companyId)
    return q
  }
  const tables = ['email_channels', 'phone_numbers', 'twilio_integrations', 'telnyx_integrations', 'meta_channels', 'woocommerce_integrations', 'shopify_integrations', 'google_business_accounts', 'agent_connections'] as const
  const res = await Promise.all(tables.map(t => safe<any[]>(scoped(t), [])))
  const by: Record<string, any[]> = {}
  const missing: string[] = []
  tables.forEach((t, i) => { by[t] = res[i].data; if (res[i].missing) missing.push(t) })

  const rows: IntegrationRow[] = []
  for (const x of by.email_channels) {
    const gmail = x.provider === 'gmail'
    const err = short(x.sync_error)
    rows.push({
      type: 'Email', key: `email:${x.id}`, company_id: x.company_id || null,
      detail: `${str(x.inbound_address)}${gmail ? ' · Gmail' : ''}`,
      active: x.is_active !== false, last: x.last_synced_at || x.created_at || null,
      note: x.is_active === false ? '' : err ? 'Sync error' : gmail && ageMs(x.last_synced_at) > 2 * 3600_000 ? 'Sync stale' : '',
      error: err,
    })
  }
  for (const x of by.phone_numbers) {
    const status = str(x.status || 'active')
    rows.push({
      type: 'Phone numbers', key: `pn:${x.id}`, company_id: x.company_id || null,
      detail: `${str(x.phone_number)} · ${str(x.provider || 'telnyx')}${x.is_primary ? ' · primary' : ''}${x.is_free ? ' · free' : ''}`,
      active: status === 'active', last: x.updated_at || x.created_at || null,
      note: status === 'pending' ? 'Pending' : '', error: null,
    })
  }
  for (const x of by.twilio_integrations) {
    rows.push({
      type: 'Twilio', key: `tw:${x.id}`, company_id: x.company_id || null,
      detail: `${str(x.phone_number) || str(x.messaging_service_sid) || 'Account'}${x.voice_enabled === false ? ' · voice off' : ''}${x.sms_enabled === false ? ' · SMS off' : ''}`,
      active: x.is_active !== false, last: x.updated_at || x.created_at || null,
      note: x.is_active !== false && !x.phone_number && !x.messaging_service_sid ? 'No sender number' : '', error: null,
    })
  }
  for (const x of by.telnyx_integrations) {
    rows.push({
      type: 'Telnyx', key: `tx:${x.id}`, company_id: x.company_id || null,
      detail: str(x.phone_number) || 'Account', active: x.is_active === true, last: x.updated_at || x.created_at || null,
      note: '', error: null,
    })
  }
  for (const x of by.meta_channels) {
    const ig = x.platform === 'instagram'
    const exp = x.token_expires_at ? new Date(x.token_expires_at).getTime() - Date.now() : null
    const err = short(x.last_error)
    rows.push({
      type: ig ? 'Instagram' : 'Facebook', key: `meta:${x.id}`, company_id: x.company_id || null,
      detail: ig ? `@${str(x.ig_username) || str(x.ig_account_id)}` : str(x.page_name) || str(x.page_id),
      active: x.is_active !== false, last: x.created_at || null,
      note: x.is_active === false ? '' : exp != null && exp < 0 ? 'Token expired' : err ? 'Error' : exp != null && exp < 7 * DAY ? 'Token expiring' : '',
      error: err,
    })
  }
  for (const x of by.woocommerce_integrations) {
    rows.push({
      type: 'WooCommerce', key: `woo:${x.id}`, company_id: x.company_id || null,
      detail: str(x.store_url) || str(x.store_name), active: x.is_active !== false, last: x.last_synced_at || x.created_at || null,
      note: x.is_active !== false && ageMs(x.last_synced_at) > 2 * DAY ? 'Sync stale' : '', error: null,
    })
  }
  for (const x of by.shopify_integrations) {
    const err = short(x.last_error)
    const last = [x.last_synced_at, x.orders_synced_at, x.products_synced_at].filter(Boolean).sort().pop() || null
    const live = x.is_active !== false && !x.uninstalled_at
    rows.push({
      type: 'Shopify', key: `shop:${x.id}`, company_id: x.company_id || null,
      detail: `${str(x.store_name) || str(x.store_domain)}${x.auth_type === 'oauth' ? ' · app' : ''}`,
      active: live, last: last || x.created_at || null,
      note: x.uninstalled_at ? 'Uninstalled' : !live ? '' : x.needs_reauth ? 'Needs re-auth' : err ? 'Error' : ageMs(last) > DAY ? 'Sync stale' : '',
      error: err,
    })
  }
  for (const x of by.google_business_accounts) {
    rows.push({
      type: 'Google reviews', key: `gbp:${x.id}`, company_id: x.company_id || null,
      detail: str(x.location_title) || str(x.location_name) || 'Google Business Profile',
      active: x.is_active !== false, last: x.updated_at || x.created_at || null, note: '', error: null,
    })
  }
  for (const x of by.agent_connections) {
    const err = short(x.last_error)
    const tools = Array.isArray(x.tools) ? x.tools.length : 0
    rows.push({
      type: 'Outside tools (MCP)', key: `mcp:${x.id}`, company_id: x.company_id || null,
      detail: `${str(x.name)}${hostOnly(x.url) ? ` · ${hostOnly(x.url)}` : ''} · ${tools} tool${tools === 1 ? '' : 's'}`,
      active: x.enabled !== false, last: x.synced_at || x.updated_at || x.created_at || null,
      note: x.enabled === false ? '' : x.status === 'error' || err ? 'Error' : x.status === 'new' ? 'Not checked yet' : '',
      error: err,
    })
  }
  return { rows, missing }
}
