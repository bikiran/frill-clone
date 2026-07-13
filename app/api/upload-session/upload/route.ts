import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Receives a file from someone's phone (via the QR link) and stores it in the
// company's gallery at full quality.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const token = String(form.get('token') || '')
    const file = form.get('file') as File | null
    if (!token || !file) return NextResponse.json({ error: 'token and file are required' }, { status: 400 })

    const db = admin()

    const { data: session } = await db.from('upload_sessions')
      .select('*').eq('token', token).maybeSingle()
    if (!session) return NextResponse.json({ error: 'This upload link is not valid.' }, { status: 404 })

    if (new Date(session.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This upload link has expired. Ask for a new QR code.' }, { status: 410 })
    }

    const kind = file.type.startsWith('video/') ? 'video'
      : file.type.startsWith('image/') ? 'image'
      : 'file'

    // Store at full quality in the gallery bucket.
    const bytes = new Uint8Array(await file.arrayBuffer())
    const safeName = (file.name || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${session.company_id}/${Date.now()}-${safeName}`

    const { error: upErr } = await db.storage.from('media-gallery')
      .upload(path, bytes, { contentType: file.type || 'application/octet-stream', upsert: true })
    if (upErr) {
      const missing = /not found|bucket/i.test(upErr.message)
      return NextResponse.json({
        error: missing
          ? 'Storage is not set up yet — run the COLVY_V154_STORAGE_BUCKETS.sql migration.'
          : upErr.message,
      }, { status: 500 })
    }

    const { data: pub } = db.storage.from('media-gallery').getPublicUrl(path)

    const { data: item, error: itemErr } = await db.from('media_items').insert({
      company_id: session.company_id,
      folder_id: session.folder_id || null,
      url: pub.publicUrl,
      title: file.name || 'Phone upload',
      kind,
      external_source: 'phone',
    }).select().maybeSingle()
    if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 })

    await db.from('upload_sessions').update({
      uploaded_count: (session.uploaded_count || 0) + 1,
      last_upload_at: new Date().toISOString(),
    }).eq('id', session.id)

    return NextResponse.json({ ok: true, item, url: pub.publicUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
