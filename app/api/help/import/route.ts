import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { requireCompanyAccess } from '@/lib/company-access'
import { guardAiRequest } from '@/lib/rate-limit'
import { discoverSite, normaliseStartUrl, readPage, stripBoilerplate } from '@/lib/site-crawl'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MODEL = 'claude-opus-5-5'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Icons the Help Centre already uses for categories (Settings → Help Categories).
const ICONS = ['🚀', '📦', '🚚', '↩️', '🛡️', '💳', '🏪', '🐠', '🔧', '❓', '📋', '🎁', '📅', '💬', '🌿', '🧪', '📍', '⭐']

type PageIn = { id: string; url: string; title: string; text: string }

/**
 * POST /api/help/import — the "Import from your website" flow, one step per call
 * so the page can show real progress:
 *
 *   { action: 'discover', url }          → the pages worth reading
 *   { action: 'read', urls }             → each page as clean structured text
 *   { action: 'plan', pages }            → AI: categories + the articles to write
 *   { action: 'write', articles, pages } → AI: the articles, in markdown
 *
 * Nothing is saved here; the review screen saves what the person keeps.
 */
export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  const { action, companyId } = body || {}
  if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 })

  try {
    if (action === 'discover' || action === 'read') {
      if (!(await requireCompanyAccess(req, admin(), companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
      if (action === 'discover') return discover(body)
      return read(body)
    }
    if (action === 'plan' || action === 'write') {
      // AI steps: same gate as every Colvy AI feature (access, burst, daily cap),
      // without requiring the AI add-on — this builds the Help Centre itself.
      const guard = await guardAiRequest(req, companyId, `help-import-${action}`, false)
      if (!guard.ok) return guard.response
      if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'Colvy AI isn’t set up on this server yet.' }, { status: 503 })
      const { data: co } = await admin().from('companies').select('name').eq('id', companyId).maybeSingle()
      const business = co?.name || 'the business'
      return action === 'plan' ? plan(body, business) : write(body, business)
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    console.error('[help-import]', action, e?.message || e)
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: 'The AI is busy right now. Please try again in a moment.' }, { status: 429 })
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: 'The server’s AI key was rejected.' }, { status: 503 })
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

async function discover(body: any) {
  const start = normaliseStartUrl(body.url)
  if (!start) return NextResponse.json({ error: 'Enter your website address, like yourstore.com.' }, { status: 400 })
  const max = Math.min(60, Math.max(5, Number(body.max) || 40))
  const r = await discoverSite(start, max)
  if (r.error) return NextResponse.json({ error: r.error }, { status: 422 })
  return NextResponse.json({ origin: r.origin, via: r.via, pages: r.pages })
}

async function read(body: any) {
  const urls: string[] = (Array.isArray(body.urls) ? body.urls : []).filter((u: any) => typeof u === 'string').slice(0, 8)
  const out = await Promise.all(urls.map(u => readPage(u)))
  return NextResponse.json({
    pages: out.map(p => 'error' in p
      ? { url: p.url, ok: false, error: p.error }
      : { url: p.url, ok: p.words >= 40, title: p.title, text: p.text, words: p.words, headings: p.headings, ...(p.words < 40 ? { error: 'Too little text' } : {}) }),
  })
}

const cleanPages = (raw: any): PageIn[] => stripBoilerplate(
  (Array.isArray(raw) ? raw : []).slice(0, 60)
    .filter((p: any) => p && typeof p.text === 'string' && typeof p.url === 'string')
    .map((p: any, i: number) => ({ id: String(p.id || `P${i + 1}`), url: p.url, title: String(p.title || p.url).slice(0, 200), text: p.text.slice(0, 40_000) }))
)

async function askJson(system: string, user: string, schema: any, maxTokens: number, effort: 'low' | 'medium' | 'high') {
  const client = new Anthropic()
  const stream = (client.beta.messages as any).stream({
    model: MODEL,
    max_tokens: maxTokens,
    output_config: { effort, format: { type: 'json_schema', schema } },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    messages: [{ role: 'user', content: user }],
  })
  const response = await stream.finalMessage()
  if (response.stop_reason === 'refusal') throw new Error('refused')
  const text = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
  return JSON.parse(text)
}

async function plan(body: any, business: string) {
  const pages = cleanPages(body.pages)
  if (!pages.length) return NextResponse.json({ error: 'No readable pages to work from.' }, { status: 400 })
  // ~5k characters a page keeps the whole site in one request.
  const budget = Math.max(2500, Math.floor(180_000 / pages.length))
  const corpus = pages.map(p => `<page id="${p.id}" url="${p.url}">\nTITLE: ${p.title}\n${p.text.slice(0, budget)}\n</page>`).join('\n\n')

  const schema = {
    type: 'object',
    properties: {
      categories: {
        type: 'array',
        items: {
          type: 'object',
          properties: { name: { type: 'string' }, icon: { type: 'string', enum: ICONS }, description: { type: 'string' } },
          required: ['name', 'icon', 'description'], additionalProperties: false,
        },
      },
      articles: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            category: { type: 'string' },
            summary: { type: 'string' },
            sources: { type: 'array', items: { type: 'string' } },
            featured: { type: 'boolean' },
          },
          required: ['title', 'category', 'summary', 'sources', 'featured'], additionalProperties: false,
        },
      },
      skipped: { type: 'array', items: { type: 'string' } },
    },
    required: ['categories', 'articles', 'skipped'], additionalProperties: false,
  }

  const system = `You are building the help centre for ${business} from the pages of its own website. Plan the help articles customers would look for: how to order, delivery and shipping, returns and refunds, warranties and guarantees, policies, payment options, store visits and hours, product care and setup guides, account and order questions, and anything else the pages genuinely explain.

Rules:
- Use ONLY what the pages say. Never plan an article the pages can't fully support.
- One article per customer question or task. Split a long policy page into focused articles when it covers clearly separate questions (for example delivery times vs delivery costs vs damaged deliveries); merge pages that repeat the same information.
- Skip pages with no help value: product listings, category pages, search results, blog news, calculators or tools with no explanatory text, near-empty pages. List their page ids in "skipped".
- Titles: short and in the customer's words, as a question or task ("How long does delivery take?", "Returning an item"). Sentence case, no emoji.
- 3 to 8 categories, each a short plain name (for example "Orders & Delivery", "Returns & Warranty", "Live Fish", "Payments", "Visiting Our Store"). Every article uses one of these category names exactly. Pick the closest icon from the list.
- "sources": the page ids each article draws on (1 to 4).
- "summary": one sentence on what the article will answer, for the writer.
- Mark up to 4 of the most useful articles as featured.
- Aim for every distinct help topic the site covers, typically 8 to 40 articles.`

  const out = await askJson(system, `WEBSITE PAGES\n\n${corpus}`, schema, 16000, 'medium')
  const known = new Set(pages.map(p => p.id))
  const catNames = new Set((out.categories || []).map((c: any) => c.name))
  const articles = (out.articles || [])
    .map((a: any, i: number) => ({
      key: `a${i + 1}`,
      title: String(a.title || '').trim().slice(0, 160),
      category: catNames.has(a.category) ? a.category : (out.categories?.[0]?.name || 'General'),
      summary: String(a.summary || '').slice(0, 400),
      sources: (a.sources || []).map(String).filter((s: string) => known.has(s)).slice(0, 4),
      featured: !!a.featured,
    }))
    .filter((a: any) => a.title && a.sources.length)
  return NextResponse.json({ categories: out.categories || [], articles, skipped: out.skipped || [] })
}

// Strip anything that could become live HTML or a script link when rendered.
const safeMarkdown = (md: string) => String(md || '')
  .replace(/<\/?[a-z][^>]*>/gi, '')
  .replace(/\]\(\s*(javascript|data|vbscript):[^)]*\)/gi, '](#)')
  .replace(/\r/g, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim()

async function write(body: any, business: string) {
  const pages = cleanPages(body.pages)
  const byId = new Map(pages.map(p => [p.id, p]))
  const wanted = (Array.isArray(body.articles) ? body.articles : []).slice(0, 4)
    .map((a: any) => ({ key: String(a.key), title: String(a.title || ''), category: String(a.category || ''), summary: String(a.summary || ''), sources: (a.sources || []).map(String).filter((s: string) => byId.has(s)) }))
    .filter((a: any) => a.title && a.sources.length)
  if (!wanted.length) return NextResponse.json({ articles: [] })

  const usedIds = Array.from(new Set(wanted.flatMap((a: any) => a.sources))) as string[]
  const per = Math.max(4000, Math.floor(60_000 / usedIds.length))
  const sources = usedIds.map(id => { const p = byId.get(id)!; return `<page id="${p.id}" url="${p.url}">\nTITLE: ${p.title}\n${p.text.slice(0, per)}\n</page>` }).join('\n\n')
  const brief = wanted.map((a: any) => `- key: ${a.key}\n  title: ${a.title}\n  category: ${a.category}\n  answers: ${a.summary}\n  sources: ${a.sources.join(', ')}`).join('\n')

  const schema = {
    type: 'object',
    properties: {
      articles: {
        type: 'array',
        items: {
          type: 'object',
          properties: { key: { type: 'string' }, title: { type: 'string' }, content: { type: 'string' } },
          required: ['key', 'title', 'content'], additionalProperties: false,
        },
      },
    },
    required: ['articles'], additionalProperties: false,
  }

  const system = `You write help centre articles for ${business}, in the business's own voice ("we", "our"), from the pages of its website.

Accuracy comes first:
- Use ONLY facts stated in the source pages for that article: prices, time frames, conditions, exclusions, contact details and steps exactly as written. Never invent, round or generalise a number or policy. If the sources don't say something, leave it out.
- Keep important conditions and exceptions (for example states that are excluded, deadlines, what voids a warranty).
- Don't mention the website pages, "this page" or the source ids.

Format (markdown):
- Start straight with a one or two sentence answer. No title heading (the title is shown separately), no "Introduction".
- Then "## " sections and "### " sub-sections as needed; "- " bullet lists; "1. " numbered steps for processes; "**bold**" for key terms; a simple pipe table only when comparing options.
- Links only as [text](https://...) to the business's own pages when useful. No images, no HTML, no emoji.
- Plain, friendly, concise: usually 120 to 500 words. Australian English if the site uses it.
Return each article with its key; you may tidy the title.`

  const out = await askJson(system, `SOURCE PAGES\n\n${sources}\n\n---\n\nWRITE THESE ARTICLES\n${brief}`, schema, 16000, 'low')
  const keys = new Set(wanted.map((a: any) => a.key))
  const articles = (out.articles || [])
    .filter((a: any) => keys.has(String(a.key)))
    .map((a: any) => ({ key: String(a.key), title: String(a.title || '').trim().slice(0, 160), content: safeMarkdown(a.content) }))
    .filter((a: any) => a.content.length > 40)
  return NextResponse.json({ articles })
}
