import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { uploadToR2, r2Configured } from '@/lib/r2'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const R2_DOMAIN = (process.env.R2_PUBLIC_DOMAIN || process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://media.colvy.com').replace(/\/+$/, '')
const BUCKETS = ['chat-attachments', 'media-gallery', 'idea-images', 'media-requests', 'documents']

// Pull "bucket/key" out of any stored URL (Supabase public URL or the old
// api.colvy.com proxy). Returns null if it's not a known storage URL.
function extractKey(url: string): string | null {
  if (!url || url.includes(R2_DOMAIN.replace(/^https?:\/\//, ''))) return null // already on R2
  for (const b of BUCKETS) {
    const i = url.indexOf(`/${b}/`)
    if (i !== -1) return `${b}/${url.slice(i + b.length + 2).split('?')[0]}`
  }
  return null
}

// Copy one file to R2 (idempotent-ish: re-uploading is cheap and overwrites).
// Returns the new media.colvy.com URL, or the original url if it can't migrate.
async function migrateUrl(url: string | null | undefined): Promise<string | null> {
  if (!url || typeof url !== 'string') return url ?? null
  const key = extractKey(url)
  if (!key) return url // already R2 or not a storage URL — leave as-is
  try {
    const res = await fetch(url)
    if (!res.ok) return url
    const buf = new Uint8Array(await res.arrayBuffer())
    const ct = res.headers.get('content-type') || 'application/octet-stream'
    return await uploadToR2(key, buf, ct)
  } catch {
    return url
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!r2Configured()) return NextResponse.json({ error: 'R2 not configured' }, { status: 400 })
    const { table = 'media_items', limit = 20 } = await req.json().catch(() => ({}))
    const db = admin()
    const supaMarker = '.supabase.co/storage'
    const oldDomain = 'api.colvy.com'

    if (table === 'media_items') {
      const { data: rows } = await db.from('media_items')
        .select('id, url, thumbnail_url')
        .or(`url.ilike.%${supaMarker}%,url.ilike.%${oldDomain}%,thumbnail_url.ilike.%${supaMarker}%,thumbnail_url.ilike.%${oldDomain}%`)
        .limit(limit)
      let processed = 0
      for (const r of rows || []) {
        const newUrl = await migrateUrl(r.url)
        const newThumb = await migrateUrl(r.thumbnail_url)
        if (newUrl !== r.url || newThumb !== r.thumbnail_url) {
          await db.from('media_items').update({ url: newUrl, thumbnail_url: newThumb }).eq('id', r.id)
          processed++
        }
      }
      const { count } = await db.from('media_items').select('id', { count: 'exact', head: true })
        .or(`url.ilike.%${supaMarker}%,url.ilike.%${oldDomain}%`)
      return NextResponse.json({ table, processed, remaining: count ?? 0, done: (count ?? 0) === 0 })
    }

    if (table === 'messages') {
      const { data: rows } = await db.from('messages')
        .select('id, attachments')
        .filter('attachments', 'cs', '[{}]') // has at least one attachment
        .or(`attachments.ilike.%${supaMarker}%,attachments.ilike.%${oldDomain}%`)
        .limit(limit)
      let processed = 0
      for (const m of rows || []) {
        const atts = Array.isArray(m.attachments) ? m.attachments : []
        let changed = false
        for (const a of atts) {
          if (a && typeof a === 'object') {
            const nu = await migrateUrl(a.url); if (nu !== a.url) { a.url = nu; changed = true }
            const nt = await migrateUrl(a.thumbUrl); if (nt !== a.thumbUrl) { a.thumbUrl = nt; changed = true }
          }
        }
        if (changed) { await db.from('messages').update({ attachments: atts }).eq('id', m.id); processed++ }
      }
      const { count } = await db.from('messages').select('id', { count: 'exact', head: true })
        .or(`attachments.ilike.%${supaMarker}%,attachments.ilike.%${oldDomain}%`)
      return NextResponse.json({ table, processed, remaining: count ?? 0, done: (count ?? 0) === 0 })
    }

    return NextResponse.json({ error: 'unknown table' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
