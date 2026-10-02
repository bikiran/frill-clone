// Colvy AI knowledge library (server only).
//
// What the AI may use to answer customers: the business's own public material
// (help centre, announcements, roadmap, ideas, website), files the owner
// uploads, and short facts the owner writes. Help articles, announcements,
// ideas and facts are kept in step by database triggers (migration V326);
// rebuildKnowledge() refreshes the website and past chats, and re-checks the
// trigger-fed sources so a switched-off source drops out.
//
// Deliberately NOT here: orders, stock, prices, form responses and anything
// else about one particular customer. Those are looked up live when replying
// to that customer, never stored where they could surface for someone else.

import Anthropic from '@anthropic-ai/sdk'

export type KnowledgeSource = 'fact' | 'help' | 'file' | 'website' | 'announcement' | 'roadmap' | 'idea' | 'chat'
export type KnowledgeHit = { id?: string; source: string; source_id?: string; title: string | null; content: string; url: string | null; rank?: number }

export const KNOWLEDGE_DEFAULTS: Record<string, boolean> = { ideas: true, roadmap: true, announcements: true, help: true, website: true, past_chats: false }
const ROADMAP_STATUSES = ['planned', 'in_progress', 'beta', 'shipped', 'completed']

// ── Text helpers ───────────────────────────────────────────────────────────
const ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&rsquo;': '’', '&lsquo;': '‘', '&ldquo;': '“', '&rdquo;': '”', '&ndash;': '–', '&mdash;': '—', '&hellip;': '…' }
const decode = (s: string) => s
  .replace(/&[a-z]+;|&#\d+;/gi, m => ENTITIES[m.toLowerCase()] ?? (m.startsWith('&#') ? String.fromCharCode(Number(m.slice(2, -1))) : ' '))

/** HTML → readable text, keeping paragraph breaks for chunking. */
export function htmlToText(html: string): string {
  return decode(String(html || '')
    .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|table|ul|ol|blockquote|dd|dt)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Split text into ~size-char chunks on paragraph/sentence boundaries. */
export function chunkText(text: string, size = 1200, max = 60): string[] {
  const paras = String(text || '').split(/\n{1,}/).map(p => p.trim()).filter(Boolean)
  const out: string[] = []
  let cur = ''
  const push = () => { if (cur.trim().length > 40) out.push(cur.trim()); cur = '' }
  for (const p of paras) {
    if (p.length > size) {
      // A long paragraph: split by sentences.
      for (const s of p.split(/(?<=[.!?])\s+/)) {
        if ((cur + ' ' + s).length > size) push()
        cur += (cur ? ' ' : '') + s
      }
      continue
    }
    if ((cur + '\n' + p).length > size) push()
    cur += (cur ? '\n' : '') + p
    if (out.length >= max) break
  }
  push()
  return out.slice(0, max)
}

// ── Search ─────────────────────────────────────────────────────────────────
const STOP = new Set(['the', 'and', 'for', 'you', 'your', 'are', 'was', 'were', 'can', 'could', 'would', 'should', 'will', 'what', 'when', 'where', 'which', 'who', 'how', 'why', 'does', 'did', 'have', 'has', 'had', 'this', 'that', 'these', 'those', 'with', 'from', 'about', 'into', 'there', 'their', 'them', 'they', 'then', 'than', 'just', 'like', 'want', 'need', 'know', 'please', 'thanks', 'thank', 'hello', 'hey', 'any', 'some', 'get', 'got', 'also', 'still', 'much', 'many', 'very', 'our', 'out', 'not', 'yes', 'okay', 'today'])

// Words customers use → the words businesses write. Full-text search handles
// plurals and tenses; this handles different words for the same thing.
const SYNONYM_GROUPS = [
  ['ship', 'shipping', 'deliver', 'delivery', 'post', 'postage', 'parcel', 'package', 'courier', 'dispatch', 'freight', 'send', 'arrive', 'tracking'],
  ['return', 'refund', 'exchange', 'money', 'back', 'warranty', 'guarantee', 'faulty', 'damaged', 'broken'],
  ['open', 'opening', 'hours', 'close', 'closing', 'time', 'weekend', 'saturday', 'sunday', 'holiday'],
  ['price', 'cost', 'cheap', 'expensive', 'fee', 'charge', 'quote', 'rate'],
  ['stock', 'available', 'availability', 'restock', 'sold', 'supply'],
  ['pickup', 'pick', 'collect', 'collection', 'click'],
  ['pay', 'payment', 'afterpay', 'card', 'cash', 'eftpos', 'invoice', 'deposit'],
  ['book', 'booking', 'appointment', 'reserve', 'reservation', 'schedule'],
  ['location', 'address', 'where', 'store', 'shop', 'directions', 'parking'],
  ['contact', 'phone', 'call', 'email', 'reach'],
  ['discount', 'coupon', 'sale', 'promo', 'promotion', 'voucher', 'offer'],
  ['cancel', 'cancellation', 'change', 'reschedule'],
]
const SYN = new Map<string, string[]>()
for (const g of SYNONYM_GROUPS) for (const w of g) SYN.set(w, g)

/** The customer's words plus synonyms, as a websearch OR query. */
export function buildSearchQuery(text: string): string {
  const words = (String(text).toLowerCase().match(/[a-z0-9][a-z0-9'-]{1,}/g) || [])
    .map(w => w.replace(/'s$/, '').replace(/[^a-z0-9-]/g, ''))
    .filter(w => w.length >= 3 && !STOP.has(w))
  const terms = new Set<string>()
  for (const w of words.slice(0, 20)) {
    terms.add(w)
    const base = w.replace(/(ing|ed|es|s)$/, '')
    for (const s of SYN.get(w) || SYN.get(base) || []) terms.add(s)
  }
  return Array.from(terms).slice(0, 40).join(' or ')
}

/** Best-matching knowledge for a question. Falls back to word matching if the V326 search function isn't installed yet. */
export async function searchKnowledge(db: any, companyId: string, question: string, limit = 8): Promise<KnowledgeHit[]> {
  const q = buildSearchQuery(question)
  if (!q) return []
  const { data, error } = await db.rpc('search_ai_knowledge', { p_company: companyId, p_query: q, p_limit: limit })
  if (!error) return (data || []) as KnowledgeHit[]

  const { data: all } = await db.from('ai_knowledge').select('id, source, source_id, title, content, url').eq('company_id', companyId).limit(1000)
  const words = q.split(' or ')
  return (all || []).map((k: any) => {
    const hay = `${k.title || ''} ${k.content || ''}`.toLowerCase()
    let score = 0
    for (const w of words) if (hay.includes(w)) score += 1
    if (k.source === 'fact') score += 1
    if (k.source === 'help') score += 0.5
    return { ...k, rank: score }
  }).filter((k: any) => k.rank > 0).sort((a: any, b: any) => b.rank - a.rank).slice(0, limit)
}

// ── Website ────────────────────────────────────────────────────────────────
const SKIP_URL = /\/(cart|basket|checkout|my-account|account|login|register|wp-admin|wp-json|wp-login|feed|tag|author|search|product|products|product-category|collections|shop\/page|page\/\d+|wishlist|compare|order-tracking|cms_block[^/]*)(\/|$)|\.(jpe?g|png|gif|webp|svg|pdf|zip|mp4|mp3|css|js|xml)(\?|$)|[?#]/i
const PRIORITY_URL = /(faq|question|help|support|shipping|delivery|postage|return|refund|exchange|warranty|policy|policies|terms|conditions|privacy|about|contact|hours|opening|location|visit|store|pickup|collect|care|guide|how-to|payment|afterpay|booking|services|pricing)/i

async function fetchText(url: string, maxBytes = 400_000, timeoutMs = 8000): Promise<{ ok: boolean; text: string; type: string }> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'ColvyBot/1.0 (+https://colvy.com)', Accept: 'text/html,application/xml;q=0.9,*/*;q=0.5' } })
    const type = res.headers.get('content-type') || ''
    if (!res.ok) return { ok: false, text: '', type }
    const buf = await res.arrayBuffer()
    return { ok: true, text: new TextDecoder().decode(buf.slice(0, maxBytes)), type }
  } catch { return { ok: false, text: '', type: '' } }
  finally { clearTimeout(t) }
}

const locs = (xml: string) => Array.from(xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi)).map(m => decode(m[1].trim()))

/** Pages worth reading on a site: its sitemap (pages before products), else homepage links. */
async function discoverPages(origin: string, max: number): Promise<string[]> {
  const host = new URL(origin).host
  const same = (u: string) => { try { const x = new URL(u, origin); return x.host === host || x.host === 'www.' + host || 'www.' + x.host === host } catch { return false } }
  const urls = new Set<string>()

  for (const path of ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml']) {
    const r = await fetchText(origin + path, 2_000_000)
    if (!r.ok || !/<(urlset|sitemapindex)/i.test(r.text)) continue
    const found = locs(r.text)
    if (/<sitemapindex/i.test(r.text)) {
      // Child sitemaps: pages and posts first; product sitemaps are live data, skip them.
      const kids = found.filter(u => !/product|category|tag|author|attachment/i.test(u))
        .sort((a, b) => Number(/page/i.test(b)) - Number(/page/i.test(a))).slice(0, 6)
      for (const k of kids) {
        const kr = await fetchText(k, 2_000_000)
        if (kr.ok) for (const u of locs(kr.text)) if (same(u)) urls.add(u)
      }
    } else for (const u of found) if (same(u)) urls.add(u)
    if (urls.size) break
  }

  if (!urls.size) {
    const home = await fetchText(origin)
    if (home.ok) for (const m of home.text.matchAll(/href=["']([^"'#]+)["']/gi)) {
      try { const u = new URL(decode(m[1]), origin).toString(); if (same(u)) urls.add(u.replace(/\/$/, '') || origin) } catch {}
    }
  }

  const list = Array.from(urls).map(u => u.split('#')[0]).filter(u => !SKIP_URL.test(u.replace(/^https?:\/\/[^/]+/, '')))
  const score = (u: string) => {
    const path = u.replace(/^https?:\/\/[^/]+/, '') || '/'
    return (path === '/' ? 50 : 0) + (PRIORITY_URL.test(path) ? 30 : 0) - path.split('/').filter(Boolean).length * 3 - path.length / 40
  }
  const uniq = Array.from(new Set([origin + '/', ...list]))
  return uniq.sort((a, b) => score(b) - score(a)).slice(0, max)
}

function pageText(html: string): { title: string; text: string } {
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim()).split(/\s[|–—-]\s/)[0].trim()
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0]
    || html.match(/<article[\s\S]*?<\/article>/i)?.[0]
    || html.replace(/<(header|nav|footer|aside|form)[\s\S]*?<\/\1>/gi, ' ')
  return { title, text: htmlToText(main) }
}

export type CrawledChunk = { url: string; title: string; content: string; sourceId: string }

/** Read up to `maxPages` pages from the business's sites, as chunks. */
export async function crawlWebsite(domains: string[], maxPages = 40): Promise<{ chunks: CrawledChunk[]; pages: number }> {
  const origins = Array.from(new Set(domains.map(d => {
    const s = String(d || '').trim().replace(/\/+$/, '')
    if (!s) return ''
    try { return new URL(/^https?:\/\//.test(s) ? s : `https://${s}`).origin } catch { return '' }
  }).filter(Boolean))).slice(0, 2)

  const pages: { url: string; title: string; text: string }[] = []
  for (const origin of origins) {
    const urls = await discoverPages(origin, Math.ceil(maxPages / origins.length))
    for (let i = 0; i < urls.length; i += 6) {
      const batch = await Promise.all(urls.slice(i, i + 6).map(async url => {
        const r = await fetchText(url)
        if (!r.ok || (r.type && !/html/i.test(r.type))) return null
        const { title, text } = pageText(r.text)
        return text.length > 150 ? { url, title: title || url, text } : null
      }))
      for (const p of batch) if (p) pages.push(p)
    }
  }

  // Drop lines that repeat across most pages (menus, footers, cookie notices).
  const seen = new Map<string, number>()
  for (const p of pages) for (const line of new Set(p.text.split('\n').map(l => l.trim()).filter(l => l.length > 3))) seen.set(line, (seen.get(line) || 0) + 1)
  const boiler = pages.length >= 4 ? new Set(Array.from(seen).filter(([, n]) => n >= Math.max(3, pages.length * 0.5)).map(([l]) => l)) : new Set<string>()

  const chunks: CrawledChunk[] = []
  const seenText = new Set<string>()
  for (const p of pages) {
    const text = p.text.split('\n').filter(l => !boiler.has(l.trim())).join('\n')
    chunkText(text, 1200, 8).forEach((c, n) => {
      const key = c.slice(0, 200)
      if (seenText.has(key)) return
      seenText.add(key)
      chunks.push({ url: p.url, title: p.title, content: `${p.title}\n${c}`, sourceId: `${p.url}#${n}` })
    })
    if (chunks.length >= 320) break
  }
  return { chunks, pages: pages.length }
}

// ── Rebuild ────────────────────────────────────────────────────────────────
async function replaceSource(db: any, companyId: string, source: KnowledgeSource, rows: { source_id: string; title: string | null; content: string; url?: string | null }[], runStart: string) {
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100).map(r => ({ company_id: companyId, source, source_id: r.source_id, title: r.title, content: r.content, url: r.url || null, indexed_at: runStart }))
    const { error } = await db.from('ai_knowledge').upsert(batch, { onConflict: 'company_id,source,source_id' })
    if (error) throw new Error(error.message)
  }
  // Anything of this source not refreshed in this run is stale.
  await db.from('ai_knowledge').delete().eq('company_id', companyId).eq('source', source).lt('indexed_at', runStart)
}

const strip = (s: string) => htmlToText(s).replace(/\s+/g, ' ').trim()

export async function rebuildKnowledge(db: any, companyId: string): Promise<{ counts: Record<string, number>; total: number }> {
  const runStart = new Date().toISOString()
  const { data: company } = await db.from('companies').select('name, ai_settings, website, website_domains').eq('id', companyId).maybeSingle()
  const want = { ...KNOWLEDGE_DEFAULTS, ...(company?.ai_settings?.knowledge || {}) }
  const counts: Record<string, number> = {}

  // Help centre (published)
  const help = want.help ? ((await db.from('help_articles').select('id, title, content, status').eq('company_id', companyId).limit(1000)).data || [])
    .filter((h: any) => (h.status || 'published') === 'published') : []
  await replaceSource(db, companyId, 'help', help.map((h: any) => ({ source_id: String(h.id), title: h.title, content: `${h.title}\n${strip(h.content || '')}`.slice(0, 20000) })), runStart)
  counts.help = help.length

  // Announcements (published)
  const anns = want.announcements ? ((await db.from('announcements').select('*').eq('company_id', companyId).limit(500)).data || [])
    .filter((a: any) => (a.status || 'published') === 'published') : []
  await replaceSource(db, companyId, 'announcement', anns.map((a: any) => ({ source_id: String(a.id), title: a.title, content: `${a.title}\n${strip(a.description || a.content || '')}`.slice(0, 12000) })), runStart)
  counts.announcements = anns.length

  // Ideas + roadmap (public, live)
  const ideas = (want.ideas || want.roadmap) ? ((await db.from('ideas').select('id, title, description, status, is_private, is_archived, is_merged').eq('company_id', companyId).limit(1000)).data || [])
    .filter((i: any) => !i.is_private && !i.is_archived && !i.is_merged) : []
  const ideaRows = want.ideas ? ideas.map((i: any) => ({ source_id: String(i.id), title: i.title, content: `${i.title}\n${strip(i.description || '')}\nStatus: ${i.status || 'new'}`.slice(0, 6000) })) : []
  await replaceSource(db, companyId, 'idea', ideaRows, runStart)
  counts.ideas = ideaRows.length
  const road = want.roadmap ? ideas.filter((i: any) => ROADMAP_STATUSES.includes(i.status)) : []
  await replaceSource(db, companyId, 'roadmap', road.map((i: any) => ({ source_id: String(i.id), title: i.title, content: `Roadmap (${String(i.status).replace('_', ' ')}): ${i.title}\n${strip(i.description || '')}`.slice(0, 6000) })), runStart)
  counts.roadmap = road.length

  // Website
  if (want.website) {
    const domains = [...(Array.isArray(company?.website_domains) ? company.website_domains : []), company?.website].filter(Boolean)
    const { chunks, pages } = domains.length ? await crawlWebsite(domains) : { chunks: [], pages: 0 }
    // A failed crawl shouldn't wipe what was learned last time.
    if (chunks.length || !domains.length) await replaceSource(db, companyId, 'website', chunks.map(c => ({ source_id: c.sourceId, title: c.title, content: c.content, url: c.url })), runStart)
    counts.website = pages
  } else {
    await replaceSource(db, companyId, 'website', [], runStart)
    counts.website = 0
  }

  // Past conversations: only human answers, so the AI never learns from itself.
  const chats: { source_id: string; title: string; content: string }[] = []
  if (want.past_chats) {
    const { data: convs } = await db.from('conversations').select('id').eq('company_id', companyId)
      .in('status', ['resolved', 'closed']).order('last_message_at', { ascending: false }).limit(60)
    for (const c of convs || []) {
      const { data: msgs } = await db.from('messages').select('sender_type, content, is_ai')
        .eq('conversation_id', c.id).order('created_at', { ascending: true }).limit(20)
      const list = msgs || [], pairs: string[] = []
      for (let i = 0; i < list.length - 1; i++) {
        const q = list[i], a = list[i + 1]
        if (q.sender_type === 'visitor' && a.sender_type === 'agent' && !a.is_ai && (q.content || '').length > 8 && (a.content || '').length > 8) pairs.push(`Customer: ${q.content}\nUs: ${a.content}`)
      }
      if (pairs.length) chats.push({ source_id: String(c.id), title: 'Past conversation', content: pairs.slice(0, 6).join('\n\n') })
    }
  }
  await replaceSource(db, companyId, 'chat', chats, runStart)
  counts.past_chats = chats.length

  try { await db.from('companies').update({ ai_knowledge_synced_at: new Date().toISOString() }).eq('id', companyId) } catch {}
  const { count } = await db.from('ai_knowledge').select('id', { count: 'exact', head: true }).eq('company_id', companyId)
  return { counts, total: count || 0 }
}

// ── Files ──────────────────────────────────────────────────────────────────
export const FILE_TYPES = ['application/pdf', 'text/plain', 'text/markdown', 'text/csv']
export const FILE_MAX_BYTES = 10 * 1024 * 1024

/** Text per page (PDF) or one block (text files). */
export async function extractFileText(buf: ArrayBuffer, name: string, mime: string): Promise<{ pages: string[] }> {
  const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(name)
  if (isPdf) {
    const { getDocumentProxy, extractText } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(buf))
    const { text } = await extractText(pdf, { mergePages: false })
    return { pages: (Array.isArray(text) ? text : [text]).map(t => String(t || '').replace(/[ \t]+/g, ' ').trim()) }
  }
  return { pages: [new TextDecoder().decode(buf)] }
}

// ── Answering from the library ─────────────────────────────────────────────
export type KnowledgeAnswer = {
  answer: string
  grounded: boolean
  sources: { source: string; title: string; url: string | null; excerpt: string }[]
}

const MODEL = 'claude-opus-5-5'

/**
 * Answer a customer-style question using ONLY the library. `grounded` is false
 * when the sources don't cover it, which is what auto-reply will use to hand
 * over to a person instead of guessing.
 */
export async function answerFromKnowledge(db: any, companyId: string, question: string): Promise<KnowledgeAnswer | { error: string }> {
  const hits = await searchKnowledge(db, companyId, question, 8)
  if (!hits.length) return { answer: '', grounded: false, sources: [] }
  if (!process.env.ANTHROPIC_API_KEY) return { error: 'Colvy AI isn’t set up on this server yet.' }

  const { data: co } = await db.from('companies').select('name').eq('id', companyId).maybeSingle()
  const lines = hits.map((h, i) => `[S${i + 1}] (${h.source}) ${h.title || ''}\n${String(h.content || '').slice(0, 1500)}`)

  try {
    const client = new Anthropic()
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: { answer: { type: 'string' }, grounded: { type: 'boolean' }, used: { type: 'array', items: { type: 'string' } } },
            required: ['answer', 'grounded', 'used'],
            additionalProperties: false,
          },
        },
      },
      // If a safety classifier declines, the API retries on a fallback model within the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: `You answer customer questions for ${co?.name || 'a small business'}, as the business ("we"). Use ONLY the numbered sources. If they don't clearly answer the question, set grounded to false and say briefly that you'll check with the team, without guessing. Never invent prices, stock, dates or policies. Ideas and roadmap items are customer suggestions and plans, not promises. Keep it short, warm and plain: two to four sentences, no markdown, no emojis. In used, list the source ids (like "S2") you relied on.`,
      messages: [{ role: 'user', content: `SOURCES\n${lines.join('\n\n')}\n\n---\n\nCUSTOMER QUESTION\n${String(question).slice(0, 1000)}` }],
    })
    if (response.stop_reason === 'refusal') return { error: 'Colvy AI declined to answer that one.' }
    const text = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    const p = JSON.parse(text)
    const used = new Set((p.used || []).map(String))
    return {
      answer: String(p.answer || '').trim(),
      grounded: !!p.grounded && used.size > 0,
      sources: hits.map((h, i) => ({ id: `S${i + 1}`, h })).filter(x => used.has(x.id))
        .map(({ h }) => ({ source: h.source, title: h.title || 'Untitled', url: h.url, excerpt: String(h.content || '').slice(0, 220) })),
    }
  } catch (e: any) {
    console.error('[ai-knowledge] answer', e?.message || e)
    return { error: 'Colvy AI is busy right now. Please try again in a moment.' }
  }
}
