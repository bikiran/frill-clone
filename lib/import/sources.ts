// Live sources for the importer: Canny (API key) and Zendesk Help Center
// (public API). Each one reads everything it can into the shared ImportPayload
// (lib/import/normalize). Nothing here writes to Colvy.

import { emptyPayload, mapStatus, topicSlug, htmlToMarkdown, clean, toInt, toIso, type ImportPayload } from './normalize'
import { publicUrlProblem } from '@/lib/site-crawl'

export type FetchResult = {
  payload: ImportPayload
  complete: boolean          // false when the time budget ran out before the last page
  label?: string             // e.g. the Canny board names / Zendesk help centre host
  warnings: string[]
}

export class SourceError extends Error {}

type Opts = { deadline: number; include?: { ideas?: boolean; comments?: boolean; announcements?: boolean; articles?: boolean }; onProgress?: (fetched: number) => void | Promise<void> }

const PAGE = 100
const MAX_ITEMS = 20000

async function getJson(url: string, init?: RequestInit) {
  // The Zendesk host is whatever was pasted: a public address only, and a
  // redirect isn't followed (it could point anywhere, our own network included).
  const bad = await publicUrlProblem(url)
  if (bad) throw new SourceError(bad)
  const res = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(25000), cache: 'no-store' })
  const text = await res.text()
  let data: any = null
  try { data = text ? JSON.parse(text) : null } catch {}
  return { ok: res.ok, status: res.status, data }
}

// ── Canny ────────────────────────────────────────────────────────────────────
// POST https://canny.io/api/v1/{posts,comments,entries}/list  { apiKey, limit, skip }
async function cannyList(apiKey: string, path: string, key: string, opts: Opts, onPage?: (n: number) => void | Promise<void>) {
  const out: any[] = []
  let skip = 0
  while (out.length < MAX_ITEMS) {
    if (Date.now() > opts.deadline) return { items: out, complete: false }
    const r = await getJson(`https://canny.io/api/v1/${path}/list`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, limit: PAGE, skip }),
    })
    if (!r.ok) {
      const msg = String(r.data?.error || '')
      if (r.status === 401 || r.status === 403 || /invalid api key|apikey/i.test(msg)) throw new SourceError('Canny didn’t accept that API key. Copy it again from Canny → Settings → API.')
      throw new SourceError(`Canny returned an error (${r.status}${msg ? `: ${msg}` : ''}).`)
    }
    const items = Array.isArray(r.data?.[key]) ? r.data[key] : []
    out.push(...items)
    skip += items.length
    await onPage?.(out.length)
    if (!r.data?.hasMore || items.length === 0) return { items: out, complete: true }
  }
  return { items: out, complete: false }
}

export async function fetchCanny(apiKey: string, opts: Opts): Promise<FetchResult> {
  const key = String(apiKey || '').trim()
  if (!key) throw new SourceError('Paste your Canny API key.')
  const inc = { ideas: true, comments: true, announcements: true, ...(opts.include || {}) }
  const payload = emptyPayload()
  const warnings: string[] = []
  let complete = true
  let fetched = 0
  const tick = (base: number) => (n: number) => opts.onProgress?.(base + n)

  const posts = await cannyList(key, 'posts', 'posts', opts, tick(0))
  complete &&= posts.complete
  fetched += posts.items.length
  const boards = new Set<string>()
  for (const p of posts.items) {
    const title = clean(p?.title, 300)
    if (!title) continue
    if (p?.board?.name) boards.add(String(p.board.name))
    const tags = [...(p?.tags || []).map((t: any) => t?.name), p?.category?.name].filter(Boolean)
    payload.ideas.push({
      sid: String(p.id || ''),
      title,
      description: clean(p?.details),
      status: mapStatus(p?.status),
      rawStatus: clean(p?.status, 60) || undefined,
      votes: toInt(p?.score),
      author: clean(p?.author?.name, 120) || 'Imported',
      created_at: toIso(p?.created),
      topics: Array.from(new Set(tags.map((t: string) => topicSlug(t)).filter(Boolean))).slice(0, 8),
    })
  }

  if (inc.comments && payload.ideas.length) {
    const comments = await cannyList(key, 'comments', 'comments', opts, tick(fetched))
    complete &&= comments.complete
    fetched += comments.items.length
    for (const c of comments.items) {
      const content = clean(c?.value)
      const postSid = String(c?.post?.id || c?.postID || '')
      if (!content || !postSid) continue
      payload.comments.push({ postSid, author: clean(c?.author?.name, 120) || 'Imported', content, created_at: toIso(c?.created), isPrivate: !!(c?.internal || c?.private) })
    }
  }

  if (inc.announcements) {
    try {
      const entries = await cannyList(key, 'entries', 'entries', opts, tick(fetched))
      complete &&= entries.complete
      for (const e of entries.items) {
        const title = clean(e?.title, 300)
        if (!title || (e?.status && String(e.status).toLowerCase() !== 'published')) continue
        payload.announcements.push({ title, description: clean(e?.markdownDetails || e?.plainDetails), created_at: toIso(e?.publishedAt || e?.created) })
      }
    } catch (err: any) {
      // The changelog is optional (not every Canny plan has one) — don't fail the import over it.
      warnings.push('Couldn’t read the Canny changelog, so no updates will be imported.')
      if (!(err instanceof SourceError)) throw err
    }
  }

  return { payload, complete, label: boards.size ? Array.from(boards).slice(0, 4).join(', ') : 'Canny', warnings }
}

// ── Zendesk Help Center ──────────────────────────────────────────────────────
// Public help centres expose /api/v2/help_center/{articles,sections}.json on
// their own host (yours.zendesk.com or a custom help domain).
export function zendeskBase(input: string): string {
  let s = String(input || '').trim()
  if (!s) throw new SourceError('Paste your help centre address.')
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`
  let u: URL
  try { u = new URL(s) } catch { throw new SourceError('That doesn’t look like a web address.') }
  if (!/\./.test(u.hostname) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)) throw new SourceError('That doesn’t look like a public web address.')
  return `https://${u.hostname}`
}

async function zendeskList(base: string, path: string, key: string, opts: Opts, onPage?: (n: number) => void | Promise<void>) {
  const out: any[] = []
  let url: string | null = `${base}/api/v2/help_center/${path}.json?per_page=${PAGE}`
  while (url && out.length < MAX_ITEMS) {
    if (Date.now() > opts.deadline) return { items: out, complete: false }
    const r = await getJson(url, { headers: { Accept: 'application/json' } })
    if (!r.ok || !r.data || !Array.isArray(r.data[key])) {
      if (r.status === 401 || r.status === 403) throw new SourceError('This help centre is private, so its articles can’t be read. Make it public, or export the articles as a CSV and import that.')
      throw new SourceError('That address isn’t a Zendesk help centre (or it can’t be reached). Use the address your customers visit, like yourcompany.zendesk.com.')
    }
    out.push(...r.data[key])
    await onPage?.(out.length)
    const next: string | null = r.data.next_page || null
    // Only follow pagination on the same host.
    url = next && next.startsWith(base) ? next : null
  }
  return { items: out, complete: !url }
}

export async function fetchZendesk(input: string, opts: Opts & { publish?: boolean }): Promise<FetchResult> {
  const base = zendeskBase(input)
  // The name has to resolve to the public internet too (a public-looking name
  // can still point at our own network); the preview shows what it answered.
  const { checkPublicUrl } = await import('@/lib/integration-events')
  const bad = await checkPublicUrl(base)
  if (bad) throw new SourceError(bad)
  const payload = emptyPayload()
  const sections = await zendeskList(base, 'sections', 'sections', opts).catch(() => ({ items: [] as any[], complete: true }))
  const sectionName = new Map<string, string>(sections.items.map((s: any) => [String(s.id), clean(s.name, 80)]))
  const articles = await zendeskList(base, 'articles', 'articles', opts, opts.onProgress)
  for (const a of articles.items) {
    const title = clean(a?.title, 300)
    const content = htmlToMarkdown(clean(a?.body, 400000))
    if (!title || !content) continue
    payload.articles.push({
      title, content,
      category: sectionName.get(String(a?.section_id)) || 'General',
      status: opts.publish === false || a?.draft ? 'draft' : 'published',
      created_at: toIso(a?.created_at),
    })
  }
  const warnings: string[] = []
  if (articles.items.length && !payload.articles.length) warnings.push('The help centre answered, but none of its articles had any text.')
  return { payload, complete: articles.complete, label: new URL(base).hostname, warnings }
}
