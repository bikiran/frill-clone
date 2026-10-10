// Reading a business's website for the Help Centre importer.
//
// discoverSite() finds the pages worth reading (robots.txt / sitemap, else
// links from the start page), and readPage() turns one page into clean,
// structured text — headings, lists, tables and paragraphs kept, menus,
// footers and scripts dropped — so the AI can write accurate articles from it.
//
// Every request, including each redirect hop, must resolve to a public
// address (checkPublicUrl), so a typed URL can never reach our own network.

import dns from 'dns'

const UA = 'ColvyBot/1.0 (+https://colvy.com; help centre import)'

const ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&rsquo;': '’', '&lsquo;': '‘', '&ldquo;': '“', '&rdquo;': '”', '&ndash;': '–', '&mdash;': '—', '&hellip;': '…', '&copy;': '©', '&reg;': '®', '&trade;': '™', '&deg;': '°' }
export const decodeEntities = (s: string) => String(s || '')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)) } catch { return ' ' } })
  .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(Number(d)) } catch { return ' ' } })
  .replace(/&[a-z]+;/gi, m => ENTITIES[m.toLowerCase()] ?? ' ')

function privateIp(ip: string): boolean {
  if (ip.includes(':')) return ip === '::1' || ip === '::' || /^f[cd]/i.test(ip) || /^fe80/i.test(ip) || (ip.startsWith('::ffff:') && privateIp(ip.slice(7)))
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
}

/** null when the URL is a public http(s) address; otherwise why not. */
export async function publicUrlProblem(raw: string): Promise<string | null> {
  let u: URL
  try { u = new URL(raw) } catch { return 'That doesn’t look like a web address.' }
  if (!/^https?:$/.test(u.protocol)) return 'The address must start with https://.'
  if (u.username || u.password) return 'That address isn’t supported.'
  const host = u.hostname.toLowerCase()
  if (!host.includes('.') || /(^|\.)(localhost|internal|local|lan|home|corp)$/.test(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host) && privateIp(host)) return 'That address isn’t reachable from the internet.'
  try {
    const addrs = await dns.promises.lookup(host, { all: true })
    if (!addrs.length || addrs.some(a => privateIp(a.address))) return 'That address points to a private network.'
  } catch { return 'We couldn’t find that website. Check the address and try again.' }
  return null
}

/** "roxyaquarium.com.au" → "https://roxyaquarium.com.au/" */
export function normaliseStartUrl(input: string): string | null {
  const s = String(input || '').trim()
  if (!s) return null
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`)
    u.hash = ''
    return u.toString()
  } catch { return null }
}

type Fetched = { ok: boolean; status: number; url: string; type: string; text: string; error?: string }

/** GET with a public-address check on every hop, a timeout and a size cap. */
export async function safeFetch(url: string, opts: { maxBytes?: number; timeoutMs?: number } = {}): Promise<Fetched> {
  const { maxBytes = 1_500_000, timeoutMs = 10_000 } = opts
  let current = url
  for (let hop = 0; hop < 5; hop++) {
    const bad = await publicUrlProblem(current)
    if (bad) return { ok: false, status: 0, url: current, type: '', text: '', error: bad }
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(current, { redirect: 'manual', signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5', 'Accept-Language': 'en' } })
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        current = new URL(res.headers.get('location')!, current).toString()
        continue
      }
      const type = res.headers.get('content-type') || ''
      if (!res.ok) return { ok: false, status: res.status, url: current, type, text: '' }
      // Stream up to maxBytes, so a huge file can't exhaust memory.
      const reader = res.body?.getReader()
      const parts: Uint8Array[] = []
      let size = 0
      if (reader) {
        while (size < maxBytes) {
          const { done, value } = await reader.read()
          if (done || !value) break
          parts.push(value); size += value.length
        }
        try { await reader.cancel() } catch {}
      }
      const buf = new Uint8Array(Math.min(size, maxBytes))
      let off = 0
      for (const p of parts) { const take = Math.min(p.length, buf.length - off); buf.set(p.subarray(0, take), off); off += take; if (off >= buf.length) break }
      return { ok: true, status: res.status, url: current, type, text: new TextDecoder().decode(buf) }
    } catch (e: any) {
      return { ok: false, status: 0, url: current, type: '', text: '', error: e?.name === 'AbortError' ? 'The website took too long to respond.' : 'We couldn’t reach that website.' }
    } finally { clearTimeout(t) }
  }
  return { ok: false, status: 0, url: current, type: '', text: '', error: 'Too many redirects.' }
}

// Pages that never hold help content: shop listings, carts, accounts, feeds, files.
const SKIP_PATH = /\/(cart|basket|checkout|my-account|account|login|log-in|signin|sign-in|register|signup|wp-admin|wp-json|wp-login|xmlrpc|feed|rss|tag|tags|author|search|wishlist|compare|order-tracking|cdn-cgi|product-category|product-tag|collections\/[^/]+\/products|page\/\d+)(\/|$)|\.(jpe?g|png|gif|webp|avif|svg|ico|pdf|zip|rar|mp4|mov|webm|mp3|wav|css|js|json|xml|txt|woff2?|ttf|eot)(\?|$)/i
// Pages that usually answer customer questions.
const HELP_PATH = /(faq|faqs|question|help|support|knowledge|kb|docs|guide|guides|how-to|howto|tutorial|getting-started|shipping|delivery|postage|freight|return|returns|refund|exchange|warranty|guarantee|policy|policies|terms|conditions|privacy|about|contact|hours|opening|location|locations|store|stores|visit|pickup|click-and-collect|collect|care|caring|maintenance|setup|set-up|install|payment|payments|afterpay|zip|laybuy|booking|bookings|appointment|services|service|pricing|price-match|gift|voucher|loyalty|rewards|account-help|order|orders|track)/i
// Shop pages: low value as articles, read only if room is left.
const SHOP_PATH = /\/(product|products|shop|store\/[^/]+\/[^/]+|item|items|p)\//i

const locsOf = (xml: string) => Array.from(xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi)).map(m => decodeEntities(m[1].trim()))

export type DiscoveredPage = { url: string; reason: 'start' | 'help' | 'page' | 'shop' }

/**
 * Pages worth reading, most useful first: the start page, then pages whose
 * address looks like help content, then ordinary pages; shop pages last.
 * Pages under the start URL's own path (e.g. /faq/...) rank first.
 */
export async function discoverSite(startUrl: string, max = 40): Promise<{ origin: string; pages: DiscoveredPage[]; via: 'sitemap' | 'links'; error?: string }> {
  const start = new URL(startUrl)
  const origin = start.origin
  const bareHost = start.hostname.replace(/^www\./, '')
  const same = (u: URL) => u.hostname.replace(/^www\./, '') === bareHost
  const clean = (raw: string, base: string): string | null => {
    try {
      const u = new URL(decodeEntities(raw), base)
      if (!/^https?:$/.test(u.protocol) || !same(u)) return null
      u.hash = ''
      // Tracking and sorting parameters only make duplicates.
      for (const k of Array.from(u.searchParams.keys())) if (/^(utm_|fbclid|gclid|ref|sort|orderby|filter|add-to-cart|replytocom|page|p)$/i.test(k) || k.startsWith('utm_')) u.searchParams.delete(k)
      let s = u.toString()
      if (u.pathname !== '/' && s.endsWith('/')) s = s.slice(0, -1)
      return s
    } catch { return null }
  }

  // The start page must load, or nothing else will.
  const home = await safeFetch(start.toString())
  if (!home.ok) return { origin, pages: [], via: 'links', error: home.error || (home.status ? `The website answered with an error (${home.status}).` : 'We couldn’t reach that website.') }

  const found = new Set<string>()
  let via: 'sitemap' | 'links' = 'links'

  // Sitemaps: from robots.txt first, then the usual places.
  const sitemapUrls = new Set<string>()
  const robots = await safeFetch(`${origin}/robots.txt`, { maxBytes: 200_000, timeoutMs: 6000 })
  if (robots.ok) for (const m of robots.text.matchAll(/^\s*sitemap:\s*(\S+)/gim)) { const c = clean(m[1], origin); if (c) sitemapUrls.add(c) }
  for (const p of ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml', '/sitemap-index.xml']) sitemapUrls.add(origin + p)

  for (const sm of Array.from(sitemapUrls).slice(0, 6)) {
    const r = await safeFetch(sm, { maxBytes: 4_000_000, timeoutMs: 8000 })
    if (!r.ok || !/<(urlset|sitemapindex)/i.test(r.text)) continue
    const locs = locsOf(r.text)
    if (/<sitemapindex/i.test(r.text)) {
      // Pages and posts first; product/category sitemaps are huge and low value.
      const kids = locs.filter(u => !/product|category|tag|author|attachment|image|video/i.test(u))
        .sort((a, b) => Number(/page|post|faq|help|kb|doc/i.test(b)) - Number(/page|post|faq|help|kb|doc/i.test(a))).slice(0, 6)
      for (const k of kids) {
        const kr = await safeFetch(k, { maxBytes: 4_000_000, timeoutMs: 8000 })
        if (kr.ok) for (const u of locsOf(kr.text)) { const c = clean(u, origin); if (c) found.add(c) }
      }
    } else for (const u of locs) { const c = clean(u, origin); if (c) found.add(c) }
    if (found.size) { via = 'sitemap'; break }
  }

  // Links on the start page always count (menus point at the key pages); with
  // no sitemap, follow the most promising ones one level deeper too.
  const linksOf = (html: string, base: string) => Array.from(html.matchAll(/<a\b[^>]*href=["']([^"'#][^"']*)["']/gi)).map(m => clean(m[1], base)).filter(Boolean) as string[]
  const homeLinks = linksOf(home.text, home.url)
  for (const l of homeLinks) found.add(l)
  if (via === 'links') {
    const next = homeLinks.filter(l => HELP_PATH.test(new URL(l).pathname)).slice(0, 8)
    const deeper = await Promise.all(next.map(l => safeFetch(l, { timeoutMs: 7000 }).then(r => r.ok ? linksOf(r.text, r.url) : []).catch(() => [])))
    for (const list of deeper) for (const l of list) found.add(l)
  }

  const startPath = start.pathname.replace(/\/$/, '')
  const rank = (u: string): { score: number; reason: DiscoveredPage['reason'] } => {
    const path = new URL(u).pathname
    if (SKIP_PATH.test(path)) return { score: -1e9, reason: 'page' }
    const depth = path.split('/').filter(Boolean).length
    let score = -depth * 3 - path.length / 50
    let reason: DiscoveredPage['reason'] = 'page'
    if (startPath && startPath !== '' && path.startsWith(startPath)) score += 60
    if (HELP_PATH.test(path)) { score += 40; reason = 'help' }
    if (SHOP_PATH.test(path)) { score -= 60; reason = 'shop' }
    return { score, reason }
  }

  const startClean = clean(start.toString(), origin) || start.toString()
  const ranked = Array.from(found)
    // Search results and filtered listings: anything still carrying a query.
    .filter(u => u !== startClean && !new URL(u).search)
    .map(u => ({ url: u, ...rank(u) }))
    .filter(x => x.score > -1e8)
    .sort((a, b) => b.score - a.score)
  const pages: DiscoveredPage[] = [{ url: startClean, reason: 'start' }, ...ranked.slice(0, Math.max(0, max - 1)).map(x => ({ url: x.url, reason: x.reason }))]
  return { origin, pages, via }
}

export type ReadPage = { url: string; title: string; text: string; words: number; headings: string[] }

/** HTML → structured text: '#' headings, '- ' list items, ' | ' table rows. */
export function htmlToStructured(html: string): string {
  let h = String(html || '')
    .replace(/<(script|style|noscript|svg|template|iframe|canvas|select|button|picture|video|audio|object)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
  h = h
    .replace(/<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, t) => `\n\n${'#'.repeat(Number(n))} ${t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}\n\n`)
    .replace(/<summary\b[^>]*>([\s\S]*?)<\/summary>/gi, (_, t) => `\n\n### ${t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}\n\n`)
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<tr\b[^>]*>/gi, '\n| ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|tr|table|ul|ol|blockquote|dd|dt|details|figure|figcaption|header|footer|main)>/gi, '\n')
    .replace(/<dt\b[^>]*>/gi, '\n**').replace(/<\/dt>/gi, '**\n')
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, t) => { const x = t.replace(/<[^>]+>/g, '').trim(); return x ? ` **${x}** ` : ' ' })
    .replace(/<[^>]+>/g, ' ')
  return decodeEntities(h)
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/^- *$/gm, '')
    .replace(/^\| *(\| *)*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function readHtml(url: string, html: string): ReadPage {
  const rawTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
    || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''
  const title = decodeEntities(rawTitle).replace(/\s+/g, ' ').trim().split(/\s[|–—·-]\s/)[0].trim()
  const main = html.match(/<main\b[\s\S]*?<\/main>/i)?.[0]
    || html.match(/<article\b[\s\S]*?<\/article>/i)?.[0]
    || html.match(/<div[^>]+(?:id|class)=["'][^"']*\b(content|main-content|entry-content|page-content|site-content)\b[^"']*["'][\s\S]*$/i)?.[0]
    || html
  const body = main
    .replace(/<(header|nav|footer|aside|form)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<div[^>]+(?:id|class)=["'][^"']*\b(cookie|consent|newsletter|popup|modal|breadcrumb|menu|navbar|social|share)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, ' ')
  const text = htmlToStructured(body).slice(0, 40_000)
  const headings = Array.from(text.matchAll(/^#{1,4} (.+)$/gm)).map(m => m[1]).slice(0, 30)
  return { url, title: title || headings[0] || url, text, words: text.split(/\s+/).filter(Boolean).length, headings }
}

export async function readPage(url: string): Promise<ReadPage | { url: string; error: string }> {
  const r = await safeFetch(url)
  if (!r.ok) return { url, error: r.error || `HTTP ${r.status}` }
  if (r.type && !/html|xml|text\/plain/i.test(r.type)) return { url, error: 'Not a web page' }
  const page = readHtml(r.url, /text\/plain/i.test(r.type) ? `<pre>${r.text}</pre>` : r.text)
  return { ...page, url }
}

/**
 * Lines repeated on most pages are menus, footers and cookie notices: drop
 * them so the AI only sees each page's own content.
 */
export function stripBoilerplate<T extends { text: string }>(pages: T[]): T[] {
  if (pages.length < 4) return pages
  const seen = new Map<string, number>()
  for (const p of pages) for (const line of new Set(p.text.split('\n').map(l => l.trim()).filter(l => l.length > 2))) seen.set(line, (seen.get(line) || 0) + 1)
  const limit = Math.max(3, Math.ceil(pages.length * 0.5))
  const boiler = new Set(Array.from(seen).filter(([l, n]) => n >= limit && !/^#{1,4} /.test(l)).map(([l]) => l))
  return pages.map(p => ({ ...p, text: p.text.split('\n').filter(l => !boiler.has(l.trim())).join('\n').replace(/\n{3,}/g, '\n\n').trim() }))
}
