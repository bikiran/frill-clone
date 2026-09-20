import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readingMinutes } from '@/lib/markdown'

export const dynamic = 'force-dynamic'

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
    if (error) { if (MISSING(error)) return NextResponse.json({ posts: [], missing: true }); throw error }
    return NextResponse.json({ posts: data || [] })
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
