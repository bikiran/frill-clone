import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { uploadToR2, r2Configured } from '@/lib/r2'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Uploads a chat attachment server-side (creates the bucket if missing) and
// returns a public URL. Accepts multipart/form-data with `file`, `companyId`,
// `conversationId`.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const companyId = form.get('companyId') as string | null
    const conversationId = form.get('conversationId') as string | null
    if (!file || !companyId) return NextResponse.json({ error: 'Missing file or companyId' }, { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${companyId}/${conversationId || 'misc'}/${Date.now()}-${safeName}`
    const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file'

    // Prefer Cloudflare R2 when configured (bytes served from media.colvy.com,
    // off Supabase). Falls back to Supabase storage until R2 env vars are set.
    if (r2Configured()) {
      try {
        const url = await uploadToR2(`chat-attachments/${path}`, bytes, file.type || 'application/octet-stream')
        return NextResponse.json({ url, name: file.name, type: file.type, kind, size: file.size })
      } catch (e: any) {
        console.warn('R2 upload failed, falling back to Supabase:', e?.message)
      }
    }

    const db = admin()
    // Ensure the bucket exists (idempotent)
    try {
      const { data: buckets } = await db.storage.listBuckets()
      if (!buckets?.some(b => b.id === 'chat-attachments')) {
        await db.storage.createBucket('chat-attachments', { public: true })
      }
    } catch (e) {
      console.warn('Bucket check warning:', e)
    }

    const { error: upErr } = await db.storage.from('chat-attachments').upload(path, bytes, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    })
    if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })

    const { data: pub } = db.storage.from('chat-attachments').getPublicUrl(path)

    return NextResponse.json({ url: pub.publicUrl, name: file.name, type: file.type, kind, size: file.size })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
