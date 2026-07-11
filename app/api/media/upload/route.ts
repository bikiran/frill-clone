import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
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
    if (!file || !companyId) return NextResponse.json({ error: 'Missing file or companyId' }, { status: 400 })

    const db = admin()
    try {
      const { data: buckets } = await db.storage.listBuckets()
      if (!buckets?.some(b => b.id === 'media-gallery')) {
        await db.storage.createBucket('media-gallery', { public: true })
      }
    } catch (e) { console.warn('Bucket check warning:', e) }

    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${companyId}/${folderId || 'unfiled'}/${Date.now()}-${safeName}`

    const { error: upErr } = await db.storage.from('media-gallery').upload(path, bytes, {
      contentType: file.type || 'application/octet-stream', upsert: true,
    })
    if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })

    const { data: pub } = db.storage.from('media-gallery').getPublicUrl(path)
    const kind = file.type.startsWith('video/') ? 'video' : 'image'

    const { data: item } = await db.from('media_items').insert({
      company_id: companyId, folder_id: folderId, title: title || file.name, url: pub.publicUrl,
      thumbnail_url: pub.publicUrl, kind, sku,
    }).select().maybeSingle()

    return NextResponse.json({ ok: true, item })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
