import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { uploadToR2, r2Configured } from '@/lib/r2'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Generic upload target for client-side callers (web inbox, mobile). Accepts
// multipart/form-data: `file` and an optional `prefix` (folder path). Uploads to
// Cloudflare R2 when configured, else Supabase storage. Returns { url }.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const prefix = ((form.get('prefix') as string | null) || 'uploads').replace(/^\/+|\/+$/g, '')
    if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 })

    const bytes = new Uint8Array(await file.arrayBuffer())
    const safeName = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')
    const key = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`
    const ct = file.type || 'application/octet-stream'

    if (r2Configured()) {
      try {
        const url = await uploadToR2(key, bytes, ct)
        return NextResponse.json({ url })
      } catch (e: any) {
        console.warn('R2 upload failed, falling back to Supabase:', e?.message)
      }
    }

    const db = admin()
    const bucket = 'chat-attachments'
    try {
      const { data: bks } = await db.storage.listBuckets()
      if (!bks?.some(b => b.id === bucket)) await db.storage.createBucket(bucket, { public: true })
    } catch {}
    const { error } = await db.storage.from(bucket).upload(key, bytes, { contentType: ct, upsert: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const { data: pub } = db.storage.from(bucket).getPublicUrl(key)
    return NextResponse.json({ url: pub.publicUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
