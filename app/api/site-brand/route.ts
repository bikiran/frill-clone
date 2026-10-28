import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { safeFetch, decodeEntities } from '@/lib/site-crawl'
import { attr, pickIcon, pickColors, pickSheets } from '@/lib/site-brand'

export const dynamic = 'force-dynamic'

// GET /api/site-brand?domain=roxyaquarium.com.au
//
// For the new-workspace flow: a website's icon, its main colours and its name,
// read from its home page and (up to) two of its stylesheets. Signed-in users
// only, and every request goes through safeFetch (public addresses only, with
// a timeout and a size cap). Answers are kept for an hour per domain.
//
// → { domain, icon: string | null, colors: string[], name: string | null }

type Brand = { domain: string; icon: string | null; colors: string[]; name: string | null }
const memo = new Map<string, { at: number; data: Brand }>()
const HOUR = 3600_000

async function signedIn(req: NextRequest): Promise<boolean> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return false
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data } = await db.auth.getUser(token)
    return !!data?.user
  } catch { return false }
}

export async function GET(req: NextRequest) {
  if (!(await signedIn(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const raw = String(req.nextUrl.searchParams.get('domain') || '').trim().toLowerCase()
  const host = raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host) || host.length > 120) return NextResponse.json({ error: 'That doesn’t look like a website address.' }, { status: 400 })

  const hit = memo.get(host)
  if (hit && Date.now() - hit.at < HOUR) return NextResponse.json(hit.data)

  const page = await safeFetch(`https://${host}/`, { maxBytes: 700_000, timeoutMs: 7000 })
  if (!page.ok || !/html/i.test(page.type || 'text/html')) {
    const data: Brand = { domain: host, icon: `https://${host}/favicon.ico`, colors: [], name: null }
    return NextResponse.json({ ...data, reachable: false })
  }
  const html = page.text
  const metas = Array.from(html.matchAll(/<meta\b[^>]*>/gi)).map(m => m[0])
  const metaOf = (key: string) => metas.filter(t => [attr(t, 'name'), attr(t, 'property')].some(v => v.toLowerCase() === key)).map(t => attr(t, 'content')).filter(Boolean)
  const themes = [...metaOf('theme-color'), ...metaOf('msapplication-tilecolor')]

  // Up to two stylesheets: that's where most of a site's colours live.
  const sheets = pickSheets(html, page.url)
  const css = await Promise.all(sheets.map(u => safeFetch(u, { maxBytes: 400_000, timeoutMs: 5000 }).then(r => (r.ok ? r.text : ''), () => '')))

  const title = (html.match(/<title[^>]*>([^<]{1,120})<\/title>/i)?.[1] || '').trim()
  const name = metaOf('og:site_name')[0] || decodeEntities(title.split(/\s[|–—-]\s/)[0] || '') || null
  const data: Brand = { domain: host, icon: pickIcon(html, page.url), colors: pickColors([html, ...css], themes), name: name ? name.slice(0, 80) : null }
  if (memo.size > 500) memo.clear()
  memo.set(host, { at: Date.now(), data })
  return NextResponse.json(data)
}
