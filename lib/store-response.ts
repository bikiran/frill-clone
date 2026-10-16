// Reading a WooCommerce or Shopify answer safely (server only).
//
// A store sometimes answers an API call with a web page instead of JSON: a
// security plugin (Wordfence, iThemes, All In One WP Security) or a firewall
// (Cloudflare's "Just a moment…" check) blocking Colvy, a maintenance or
// "coming soon" page, a login redirect, or a store address that changed.
// res.json() then throws `Unexpected token '<', "<!DOCTYPE "…` and every caller
// logged it — several times a minute while the inbox, order panels and agents
// kept asking.
//
// readStoreJson() turns that into one clear, typed error (StoreResponseError)
// with the HTTP status and the start of the page in plain text, logs it once
// per store every 10 minutes, and starts a short back-off for that store
// (30 seconds, doubling to 5 minutes, cleared by the next good answer) so
// look-ups stop hammering a store that can't answer. Per server instance.

export type StoreProvider = 'woocommerce' | 'shopify'

const LABEL: Record<StoreProvider, string> = { woocommerce: 'WooCommerce', shopify: 'Shopify' }

export function storeHtmlMessage(provider: StoreProvider): string {
  return provider === 'woocommerce'
    ? 'Your WooCommerce store returned a web page instead of data — usually a security plugin or firewall blocking Colvy, or the store URL changed.'
    : 'Shopify returned a web page instead of data — usually the store’s address changed or the store is paused.'
}

export class StoreResponseError extends Error {
  readonly code: 'store_html' | 'store_bad_json'
  readonly provider: StoreProvider
  readonly status: number
  /** The first 120 characters of what came back, tags stripped. */
  readonly snippet: string
  readonly store: string
  /** Thrown without asking the store, because it failed moments ago. */
  readonly backedOff: boolean
  constructor(o: { code: 'store_html' | 'store_bad_json'; provider: StoreProvider; status: number; snippet: string; store: string; backedOff?: boolean }) {
    const what = o.code === 'store_html' ? storeHtmlMessage(o.provider) : `Your ${LABEL[o.provider]} store sent back something that isn’t data Colvy can read.`
    super(`${what} (HTTP ${o.status}${o.snippet ? `: “${o.snippet}”` : ''})`)
    this.name = 'StoreResponseError'
    this.code = o.code; this.provider = o.provider; this.status = o.status; this.snippet = o.snippet; this.store = o.store; this.backedOff = !!o.backedOff
  }
}

export const isStoreResponseError = (e: any): e is StoreResponseError => !!e && e.name === 'StoreResponseError' && typeof e.code === 'string'

/** Plain text from the start of a page: no tags, scripts or styles, spaces collapsed, at most 120 characters. */
export function pageSnippet(body: string, max = 120): string {
  const text = String(body || '').slice(0, 20_000)
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, '\'')
    .replace(/&#(\d+);/g, (_, n) => { const c = Number(n); return c > 31 && c < 0x10ffff ? String.fromCodePoint(c) : ' ' })
    .replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function looksLikeHtml(contentType: string | null | undefined, body: string): boolean {
  if (/text\/html|application\/xhtml/i.test(contentType || '')) return true
  return /^\s*</.test(body || '')
}

// ── Per-store health: one log line per 10 minutes, a short back-off ─────────

type Health = { failures: number; until: number; loggedAt: number; last: StoreResponseError; at: number }
const health = new Map<string, Health>()
const LOG_EVERY_MS = 10 * 60_000
const BACKOFF_BASE_MS = 30_000
const BACKOFF_MAX_MS = 5 * 60_000

/** The same key for https://Shop.com.au/ and https://shop.com.au. */
export function storeKey(store: string): string {
  return String(store || '').trim().toLowerCase().replace(/\/+$/, '')
}

export function noteStoreFailure(err: StoreResponseError, now = Date.now()): void {
  const k = storeKey(err.store)
  const h = health.get(k) || { failures: 0, until: 0, loggedAt: 0, last: err, at: now }
  h.failures++
  h.last = err; h.at = now
  const wait = Math.min(BACKOFF_BASE_MS * 2 ** (h.failures - 1), BACKOFF_MAX_MS)
  h.until = now + wait
  if (now - h.loggedAt >= LOG_EVERY_MS) {
    h.loggedAt = now
    console.warn(`[store] ${LABEL[err.provider]} ${err.store} returned ${err.code === 'store_html' ? 'a web page' : 'unreadable data'} instead of JSON (HTTP ${err.status}): "${err.snippet}" — pausing look-ups for ${Math.round(wait / 1000)}s. Logged once per 10 minutes.`)
  }
  health.set(k, h)
  if (health.size > 5000) health.clear()
}

export function noteStoreOk(store: string): void {
  if (health.size) health.delete(storeKey(store))
}

/** The store's last error while its back-off lasts (thrown instead of asking again), else null. */
export function storeBackoff(store: string, now = Date.now()): StoreResponseError | null {
  const h = health.get(storeKey(store))
  if (!h || now >= h.until) return null
  const e = h.last
  return new StoreResponseError({ code: e.code, provider: e.provider, status: e.status, snippet: e.snippet, store: e.store, backedOff: true })
}

/** What's wrong with this store lately (this server's view), for a connection warning. */
export function storeHealth(store: string): { message: string; status: number; snippet: string; at: string; failures: number } | null {
  const h = health.get(storeKey(store))
  if (!h) return null
  return { message: h.last.message, status: h.last.status, snippet: h.last.snippet, at: new Date(h.at).toISOString(), failures: h.failures }
}

/** Test hook. */
export function resetStoreHealth() { health.clear() }

/**
 * Read a store response as JSON. Throws StoreResponseError (and notes the
 * failure for the back-off) when it's a web page or not JSON, whatever the
 * status. An empty body reads as null. A JSON answer, even an error one,
 * means the store is reachable again.
 */
export async function readStoreJson<T = any>(res: Response, opts: { provider: StoreProvider; store: string }): Promise<T> {
  const body = await res.text()
  if (looksLikeHtml(res.headers.get('content-type'), body)) {
    const err = new StoreResponseError({ code: 'store_html', provider: opts.provider, status: res.status, snippet: pageSnippet(body), store: opts.store })
    noteStoreFailure(err)
    throw err
  }
  if (!body.trim()) { noteStoreOk(opts.store); return null as T }
  try {
    const data = JSON.parse(body)
    noteStoreOk(opts.store)
    return data as T
  } catch {
    const err = new StoreResponseError({ code: 'store_bad_json', provider: opts.provider, status: res.status, snippet: pageSnippet(body), store: opts.store })
    noteStoreFailure(err)
    throw err
  }
}
