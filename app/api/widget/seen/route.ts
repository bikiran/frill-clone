import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkBurst, callerKey } from '@/lib/rate-limit'
import { pageUrl, siteHost, validSlug } from '@/lib/widget-install'

export const dynamic = 'force-dynamic'

// POST { slug }  from public/widget.js, on the business's own website: "the
// widget loaded here". The site is read from the Origin (or Referer) header
// that the browser sets, never from the body. Recorded in widget_sites
// (COLVY_V421) for the Install page. widget.js sends it at most once a day
// from each browser, and each site is written at most every few minutes per
// server, so a busy site costs next to nothing. Always answers 204: the
// widget doesn't wait for it or care how it went.

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
const done = () => new NextResponse(null, { status: 204, headers: CORS })

// slug → company id (or null: no such workspace), for 10 minutes.
const SLUG_MS = 10 * 60_000
const slugs = new Map<string, { at: number; id: string | null }>()
// company|host → when it was last written by this server.
const WRITE_MS = 5 * 60_000
const written = new Map<string, number>()

async function companyFor(db: any, slug: string): Promise<string | null> {
  const hit = slugs.get(slug)
  if (hit && Date.now() - hit.at < SLUG_MS) return hit.id
  const { data, error } = await db.from('companies').select('id').eq('slug', slug).maybeSingle()
  if (error) return null
  if (slugs.size > 5000) slugs.clear()
  slugs.set(slug, { at: Date.now(), id: data?.id || null })
  return data?.id || null
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: NextRequest) {
  try {
    if (!checkBurst(`widget-seen:${callerKey(req)}`, 30)) return done()
    const body = await req.json().catch(() => null)
    const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : ''
    if (!validSlug(slug)) return done()
    const referer = req.headers.get('referer')
    const host = siteHost(req.headers.get('origin'), referer)
    if (!host) return done()

    const db = admin()
    const companyId = await companyFor(db, slug)
    if (!companyId) return done()
    const key = `${companyId}|${host}`
    const last = written.get(key)
    if (last && Date.now() - last < WRITE_MS) return done()
    if (written.size > 20000) written.clear()
    written.set(key, Date.now())

    const now = new Date().toISOString()
    // first_seen_at keeps its default on the first write and isn't sent again.
    await db.from('widget_sites').upsert(
      { company_id: companyId, host, page_url: pageUrl(referer), last_seen_at: now },
      { onConflict: 'company_id,host' },
    )
  } catch { /* the table may not exist yet (COLVY_V421): nothing to record */ }
  return done()
}
