import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { uploadToR2, r2Configured } from '@/lib/r2'
import { processJobById } from '@/lib/transcode'

export const runtime = 'nodejs'
export const maxDuration = 300

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// A video is stored pending + transcoded; an image is ready immediately. Videos
// keep the original as `url`/`source_url` with no poster yet (the worker fills
// thumbnail_url + playback_url).
function mediaFields(url: string, kind: string) {
  return kind === 'video'
    ? { url, thumbnail_url: null as string | null, source_url: url, processing_status: 'pending' }
    : { url, thumbnail_url: url, processing_status: 'ready' }
}

// Transcode right after responding; the cron worker is the backstop.
function enqueue(db: any, item: any, kind: string) {
  if (kind === 'video' && item?.id) after(async () => { try { await processJobById(db, item.id) } catch {} })
}

// POST multipart: upload a file into the media-gallery bucket and create a
// media_items row. Accepts `file`, `companyId`, `folderId`, `title`, `sku`.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const companyId = form.get('companyId') as string | null
    const folderId = (form.get('folderId') as string | null) || null
    const title = (form.get('title') as string | null) || null
    const sku = (form.get('sku') as string | null) || null
    // A large file (video) may already be uploaded to R2 via a presigned URL —
    // then we just register the media_items row instead of receiving bytes.
    const preUrl = form.get('url') as string | null
    if (preUrl) {
      const db = admin()
      const preType = (form.get('type') as string | null) || ''
      const preName = (form.get('name') as string | null) || title || 'file'
      const kind = preType.startsWith('video/') ? 'video' : 'image'
      const { data: item } = await db.from('media_items').insert({
        company_id: companyId, folder_id: folderId, title: title || preName,
        kind, sku, ...mediaFields(preUrl, kind),
      }).select().maybeSingle()
      enqueue(db, item, kind)
      return NextResponse.json({ ok: true, item })
    }
    if (!file || !companyId) return NextResponse.json({ error: 'Missing file or companyId' }, { status: 400 })

    const db = admin()
    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${companyId}/${folderId || 'unfiled'}/${Date.now()}-${safeName}`
    const kind = file.type.startsWith('video/') ? 'video' : 'image'

    let publicUrl: string | null = null
    if (r2Configured()) {
      try {
        publicUrl = await uploadToR2(`media-gallery/${path}`, bytes, file.type || 'application/octet-stream')
      } catch (e: any) { console.warn('R2 upload failed, falling back to Supabase:', e?.message) }
    }

    if (!publicUrl) {
      try {
        const { data: buckets } = await db.storage.listBuckets()
        if (!buckets?.some(b => b.id === 'media-gallery')) {
          await db.storage.createBucket('media-gallery', { public: true })
        }
      } catch (e) { console.warn('Bucket check warning:', e) }

      const { error: upErr } = await db.storage.from('media-gallery').upload(path, bytes, {
        contentType: file.type || 'application/octet-stream', upsert: true,
      })
      if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })
      publicUrl = db.storage.from('media-gallery').getPublicUrl(path).data.publicUrl
    }

    const { data: item } = await db.from('media_items').insert({
      company_id: companyId, folder_id: folderId, title: title || file.name,
      kind, sku, ...mediaFields(publicUrl, kind),
    }).select().maybeSingle()
    enqueue(db, item, kind)

    return NextResponse.json({ ok: true, item })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
