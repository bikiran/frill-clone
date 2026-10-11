// Shared shapes and helpers for the importer (lib/import/*).
//
// Every source — a CSV export from any tool, Canny, Zendesk — is turned into
// the same plain items first; the engine then writes those into Colvy, skipping
// duplicates and tagging every row with its import job so Undo is exact.

export type ImportKind = 'ideas' | 'articles'

export interface IdeaItem {
  sid?: string            // the source's own id (to attach comments)
  title: string
  description: string
  status: string          // Colvy key: new | planned | in_progress | shipped
  rawStatus?: string      // what the source called it (for the preview's mapping table)
  votes: number
  author: string
  created_at?: string
  topics: string[]
}
export interface CommentItem { postSid: string; author: string; content: string; created_at?: string; isPrivate?: boolean }
export interface ArticleItem { title: string; content: string; category: string; status: 'published' | 'draft'; created_at?: string }
export interface AnnouncementItem { title: string; description: string; created_at?: string }

export interface ImportPayload {
  ideas: IdeaItem[]
  comments: CommentItem[]
  articles: ArticleItem[]
  announcements: AnnouncementItem[]
}

export const emptyPayload = (): ImportPayload => ({ ideas: [], comments: [], articles: [], announcements: [] })

// ── Status mapping ───────────────────────────────────────────────────────────
// Whatever a tool calls its stages, map them onto Colvy's four by meaning.
export function mapStatus(raw: string | null | undefined): string {
  const s = String(raw || '').toLowerCase().trim()
  if (!s) return 'new'
  if (/(complete|completed|done|shipped|released|live|launched|closed|resolved|fixed|deployed)/.test(s)) return 'shipped'
  if (/(progress|started|building|development|doing|working|beta|testing|review(ing)? code)/.test(s)) return 'in_progress'
  if (/(plan|scheduled|next|soon|accepted|approved|roadmap|up next)/.test(s)) return 'planned'
  return 'new'
}
export const STATUS_LABEL: Record<string, string> = { new: 'Under consideration', planned: 'Planned', in_progress: 'In Development', shipped: 'Shipped' }

// Topic slugs, as ideas.topics stores them.
export const topicSlug = (t: string) => String(t || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

// Titles compared for duplicates: case, spacing and punctuation don't count.
export const titleKey = (t: string) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// Help category slugs, as help_articles.category / help_categories.slug store them.
export const categorySlug = (s: string) => String(s || '').toLowerCase().trim().replace(/&/g, 'and').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'general'

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' }
const decode = (s: string) => s.replace(/&(#x?[0-9a-f]+|[a-z0-9]+);/gi, (m, e) => {
  const k = e.toLowerCase()
  if (k in ENTITIES) return ENTITIES[k]
  if (k[0] === '#') { const n = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10); return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : m }
  return m
})

/** Help-centre HTML (Zendesk, exports) → the Markdown Colvy articles use.
 *  Keeps headings, paragraphs, lists, links, images, bold/italic and code. */
export function htmlToMarkdown(html: string): string {
  let s = String(html || '')
  if (!/<[a-z][\s\S]*>/i.test(s)) return decode(s).trim()
  s = s.replace(/<(script|style|iframe|noscript)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\r?\n/g, ' ')
  s = s.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_m, c) => `\n\n\`\`\`\n${decode(c.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))}\n\`\`\`\n\n`)
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, n, c) => `\n\n${'#'.repeat(Math.min(Math.max(Number(n), 2), 4))} ${c.replace(/<[^>]+>/g, '').trim()}\n\n`)
  s = s.replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, (m, src) => { const alt = (m.match(/alt=["']([^"']*)["']/i) || [])[1] || ''; return `![${alt}](${src})` })
  s = s.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, c) => { const t = c.replace(/<[^>]+>/g, '').trim(); return t ? `[${t}](${href})` : '' })
  s = s.replace(/<(strong|b)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi, (_m, _t, _a, c) => c.trim() ? `**${c.trim()}**` : '')
  s = s.replace(/<(em|i)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi, (_m, _t, _a, c) => c.trim() ? `*${c.trim()}*` : '')
  s = s.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_m, c) => `\`${c}\``)
  s = s.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_m, c) => { let i = 0; return '\n\n' + c.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_x: string, li: string) => `${++i}. ${li.replace(/<\/?p[^>]*>/gi, ' ').trim()}\n`) + '\n' })
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, c) => `\n- ${c.replace(/<\/?p[^>]*>/gi, ' ').trim()}`)
  s = s.replace(/<\/?(ul|ol)[^>]*>/gi, '\n\n')
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<\/(p|div|section|article|blockquote|table|tr|h[1-6])>/gi, '\n\n').replace(/<(p|div|section|article|blockquote|table|tr)[^>]*>/gi, '\n\n')
  s = s.replace(/<\/t[dh]>/gi, '  ')
  s = s.replace(/<[^>]+>/g, '')
  s = decode(s)
  return s.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

const clean = (s: any, max = 20000) => String(s ?? '').replace(/\u0000/g, '').trim().slice(0, max)
const toInt = (v: any) => { const n = parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10); return Number.isFinite(n) && n > 0 ? n : 0 }
function toIso(v: any): string | undefined {
  if (!v) return undefined
  const s = String(v).trim()
  if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000).toISOString()
  if (/^\d{13}$/.test(s)) return new Date(Number(s)).toISOString()
  const d = new Date(s)
  return isNaN(d.getTime()) || d.getFullYear() < 1990 || d.getFullYear() > 2100 ? undefined : d.toISOString()
}

// ── CSV ──────────────────────────────────────────────────────────────────────
/** RFC 4180-style CSV (quotes, escaped quotes, newlines in fields). Detects
 *  comma / semicolon / tab. Returns the header row and the data rows. */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const src = String(text || '').replace(/^﻿/, '')
  const firstLine = src.split(/\r?\n/, 1)[0] || ''
  const delim = [',', ';', '\t'].map(d => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0]
  const out: string[][] = []
  let row: string[] = [], field = '', q = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++ } else q = false }
      else field += c
    } else if (c === '"' && field === '') q = true
    else if (c === delim) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(x => x.trim() !== '')) out.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some(x => x.trim() !== '')) out.push(row)
  const headers = (out.shift() || []).map(h => h.trim())
  return { headers, rows: out }
}

export type CsvMapping = Record<string, string | null>   // field → header name

const GUESS: Record<ImportKind, Record<string, RegExp>> = {
  ideas: {
    title: /^(title|name|subject|idea|post|suggestion|feature|feature name|summary)$/i,
    description: /^(description|details|body|content|text|message|idea description|post details|notes?)$/i,
    status: /^(status|state|stage|phase)$/i,
    votes: /^(votes?|vote count|score|upvotes?|likes?|supporters|vote_count)$/i,
    author: /^(author|author name|created by|creator|submitter|submitted by|user|user name|customer|requester|email|author email)$/i,
    created_at: /^(created|created at|created_at|date|submitted|submitted at|date created|creation date|timestamp)$/i,
    topics: /^(tags?|topics?|labels?|categor(y|ies)|board|area)$/i,
  },
  articles: {
    title: /^(title|name|subject|article|article title|heading)$/i,
    content: /^(content|body|html|article body|text|answer|description)$/i,
    category: /^(category|categories|section|collection|folder|topic|group)$/i,
    status: /^(status|state|published|visibility)$/i,
    created_at: /^(created|created at|created_at|date|published at|updated)$/i,
  },
}
export const MAPPING_FIELDS: Record<ImportKind, { key: string; label: string; required?: boolean }[]> = {
  ideas: [
    { key: 'title', label: 'Title', required: true }, { key: 'description', label: 'Description' }, { key: 'status', label: 'Status' },
    { key: 'votes', label: 'Votes' }, { key: 'author', label: 'Author' }, { key: 'created_at', label: 'Created date' }, { key: 'topics', label: 'Tags / topics' },
  ],
  articles: [
    { key: 'title', label: 'Title', required: true }, { key: 'content', label: 'Article body', required: true },
    { key: 'category', label: 'Category' }, { key: 'status', label: 'Status' }, { key: 'created_at', label: 'Created date' },
  ],
}

/** Best guess at which column holds which field. */
export function guessMapping(headers: string[], kind: ImportKind): CsvMapping {
  const m: CsvMapping = {}
  const used = new Set<string>()
  for (const [field, re] of Object.entries(GUESS[kind])) {
    const h = headers.find(x => !used.has(x) && re.test(x.trim()))
    m[field] = h || null
    if (h) used.add(h)
  }
  return m
}

/** CSV rows → items, with the chosen column mapping. */
export function csvToPayload(text: string, kind: ImportKind, mapping: CsvMapping, opts: { publishArticles?: boolean } = {}): ImportPayload {
  const { headers, rows } = parseCsv(text)
  const idx = (f: string) => (mapping[f] ? headers.indexOf(mapping[f] as string) : -1)
  const get = (r: string[], f: string) => { const i = idx(f); return i >= 0 ? r[i] ?? '' : '' }
  const p = emptyPayload()
  for (const r of rows) {
    const title = clean(get(r, 'title'), 300)
    if (!title) continue
    if (kind === 'ideas') {
      p.ideas.push({
        title,
        description: clean(get(r, 'description')),
        status: mapStatus(get(r, 'status')),
        rawStatus: clean(get(r, 'status'), 60) || undefined,
        votes: toInt(get(r, 'votes')),
        author: clean(get(r, 'author'), 120) || 'Imported',
        created_at: toIso(get(r, 'created_at')),
        topics: get(r, 'topics').split(/[,;|]/).map(topicSlug).filter(Boolean).slice(0, 8),
      })
    } else {
      const content = htmlToMarkdown(clean(get(r, 'content'), 200000))
      if (!content) continue
      const st = get(r, 'status').toLowerCase()
      const draft = /draft|unpublished|private|hidden|false|no/.test(st)
      p.articles.push({
        title, content,
        category: clean(get(r, 'category'), 80) || 'General',
        status: opts.publishArticles === false ? 'draft' : draft ? 'draft' : 'published',
        created_at: toIso(get(r, 'created_at')),
      })
    }
  }
  return p
}

export { clean, toInt, toIso }
