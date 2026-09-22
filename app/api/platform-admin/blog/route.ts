import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readingMinutes } from '@/lib/markdown'
import { POSTS } from '@/lib/blog'

export const dynamic = 'force-dynamic'

// The public blog (lib/blog-store) shows these hardcoded seed articles merged
// with DB posts — so they're LIVE on colvy.com/blog even though they aren't in
// the blog_posts table. Surface them in the admin too (flagged seed:true) so the
// CMS reflects what's actually published; "Edit" on one saves a DB copy that
// overrides the seed by slug.
function seedMarkdown(p: any): string {
  if (p.content) return p.content
  const parts: string[] = []
  if (p.intro) parts.push(p.intro)
  for (const s of p.sections || []) {
    parts.push(`## ${s.h}`)
    for (const para of s.p || []) parts.push(para)
  }
  return parts.join('\n\n')
}
function seedPosts(existingSlugs: Set<string>) {
  return POSTS.filter(p => !existingSlugs.has(p.slug)).map(p => ({
    slug: p.slug, title: p.title, excerpt: p.excerpt, content: seedMarkdown(p),
    category: p.category, author_name: p.author, accent: p.accent, icon: p.icon,
    cover_url: (p as any).cover || null, status: 'published',
    published_at: p.date, updated_at: p.date, seed: true,
  }))
}

const SUPER_ADMIN = 'bishalstha76@gmail.com'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function requireSuperAdmin(req: NextRequest, db: any): Promise<boolean> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return false
  try { const { data } = await db.auth.getUser(token); return data?.user?.email === SUPER_ADMIN } catch { return false }
}

function slugify(s: string) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

const MISSING = (e: any) => /does not exist|schema cache|relation .* does not exist/i.test(e?.message || '')

// GET — every post (drafts included), newest first.
export async function GET(req: NextRequest) {
  const db = admin()
  if (!(await requireSuperAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  try {
    const { data, error } = await db.from('blog_posts').select('*').order('updated_at', { ascending: false }).limit(500)
    if (error) {
      // Table missing → still show the built-in seed articles that are live on
      // the public blog, so the admin isn't misleadingly empty.
      if (MISSING(error)) return NextResponse.json({ posts: seedPosts(new Set()), missing: true })
      throw error
    }
    const rows = data || []
    const slugs = new Set(rows.map((r: any) => r.slug))
    const combined = [...rows, ...seedPosts(slugs)]
      .sort((a: any, b: any) => String(b.published_at || b.updated_at || '').localeCompare(String(a.published_at || a.updated_at || '')))
    return NextResponse.json({ posts: combined })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load' }, { status: 500 })
  }
}

// POST — { action: 'save' | 'delete' | 'publish' | 'unpublish', ... }
export async function POST(req: NextRequest) {
  const db = admin()
  if (!(await requireSuperAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  let body: any = {}
  try { body = await req.json() } catch {}
  const action = body.action || 'save'

  try {
    if (action === 'delete') {
      if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
      const { error } = await db.from('blog_posts').delete().eq('id', body.id)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    if (action === 'publish' || action === 'unpublish') {
      if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
      const patch: any = { status: action === 'publish' ? 'published' : 'draft', updated_at: new Date().toISOString() }
      if (action === 'publish') {
        const { data: existing } = await db.from('blog_posts').select('published_at').eq('id', body.id).maybeSingle()
        if (!existing?.published_at) patch.published_at = new Date().toISOString()
      }
      const { data, error } = await db.from('blog_posts').update(patch).eq('id', body.id).select('*').maybeSingle()
      if (error) throw error
      return NextResponse.json({ post: data })
    }

    // save (create or update)
    const p = body.post || {}
    const title = String(p.title || '').trim()
    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    const slug = slugify(p.slug || title)
    if (!slug) return NextResponse.json({ error: 'Could not derive a slug' }, { status: 400 })

    const row: any = {
      slug,
      title,
      excerpt: p.excerpt || '',
      content: p.content || '',
      cover_url: p.cover_url || null,
      category: p.category || 'Playbooks',
      tags: Array.isArray(p.tags) ? p.tags : [],
      author_name: p.author_name || 'The Colvy Team',
      author_avatar: p.author_avatar || null,
      accent: p.accent || '#ff6a4d',
      icon: p.icon || 'inbox',
      seo_title: p.seo_title || null,
      seo_description: p.seo_description || null,
      status: p.status === 'published' ? 'published' : 'draft',
      reading_minutes: readingMinutes(p.content || ''),
      updated_at: new Date().toISOString(),
    }
    if (row.status === 'published') {
      if (p.published_at) row.published_at = p.published_at
      else row.published_at = new Date().toISOString()
    }

    if (p.id) {
      // On update, don't stomp published_at if it already exists and we passed none.
      if (row.status === 'published' && !p.published_at) {
        const { data: ex } = await db.from('blog_posts').select('published_at').eq('id', p.id).maybeSingle()
        if (ex?.published_at) row.published_at = ex.published_at
      }
      const { data, error } = await db.from('blog_posts').update(row).eq('id', p.id).select('*').maybeSingle()
      if (error) { if (/duplicate key/i.test(error.message)) return NextResponse.json({ error: 'That slug is already in use.' }, { status: 409 }); throw error }
      return NextResponse.json({ post: data })
    } else {
      const { data, error } = await db.from('blog_posts').insert(row).select('*').maybeSingle()
      if (error) {
        if (/duplicate key/i.test(error.message)) return NextResponse.json({ error: 'That slug is already in use.' }, { status: 409 })
        if (MISSING(error)) return NextResponse.json({ error: 'Run migration COLVY_V302_BLOG_POSTS.sql first.' }, { status: 400 })
        throw error
      }
      return NextResponse.json({ post: data })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to save' }, { status: 500 })
  }
}
