import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

    const db = admin()

    // Ensure the bucket exists (idempotent)
    try {
      const { data: buckets } = await db.storage.listBuckets()
      if (!buckets?.some(b => b.id === 'chat-attachments')) {
        await db.storage.createBucket('chat-attachments', { public: true })
      }
    } catch (e) {
      // If listing/creating fails we still try the upload below
      console.warn('Bucket check warning:', e)
    }

    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${companyId}/${conversationId || 'misc'}/${Date.now()}-${safeName}`

    const { error: upErr } = await db.storage.from('chat-attachments').upload(path, bytes, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    })
    if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })

    const { data: pub } = db.storage.from('chat-attachments').getPublicUrl(path)
    const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file'

    return NextResponse.json({ url: pub.publicUrl, name: file.name, type: file.type, kind, size: file.size })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
