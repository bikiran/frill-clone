import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function kindOf(mime: string): string {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime === 'application/pdf') return 'pdf'
  return 'file'
}

// POST: download the selected Drive files (using the user's short-lived access
// token) and store them in the company's media gallery at full quality.
export async function POST(req: NextRequest) {
  try {
    const { companyId, folderId, accessToken, files } = await req.json()
    if (!companyId || !accessToken || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: 'Missing companyId, accessToken or files' }, { status: 400 })
    }
    const db = admin()

    // Ensure the media bucket exists.
    try {
      const { data: buckets } = await db.storage.listBuckets()
      if (!buckets?.some(b => b.id === 'media-gallery')) await db.storage.createBucket('media-gallery', { public: true })
    } catch {}

    const imported: any[] = []
    for (const f of files) {
      try {
        // Download the file bytes from Google Drive.
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!res.ok) { console.error('[DriveImport] fetch failed', f.name, res.status); continue }
        const buf = new Uint8Array(await res.arrayBuffer())
        const kind = kindOf(f.mimeType || '')
        const safe = (f.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${companyId}/drive/${Date.now()}-${safe}`
        const { error: upErr } = await db.storage.from('media-gallery').upload(path, buf, { contentType: f.mimeType || 'application/octet-stream', upsert: true })
        if (upErr) { console.error('[DriveImport] upload failed', upErr.message); continue }
        const { data: pub } = db.storage.from('media-gallery').getPublicUrl(path)

        const { data: row } = await db.from('media_items').insert({
          company_id: companyId,
          folder_id: folderId || null,
          url: pub.publicUrl,
          thumbnail_url: pub.publicUrl,
          title: f.name || 'Untitled',
          kind,
          external_source: 'google_drive',
          external_id: f.id,
        }).select().maybeSingle()
        if (row) imported.push(row)
      } catch (e) {
        console.error('[DriveImport] error for file', f?.name, e)
      }
    }

    return NextResponse.json({ ok: true, imported: imported.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
