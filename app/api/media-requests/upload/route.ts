import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function kindOf(type: string): string {
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  if (type === 'application/pdf') return 'pdf'
  return 'file'
}

// POST multipart: a customer uploads a file against a media request token.
// Stored at full quality in the media-requests bucket (no MMS compression).
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const token = form.get('token') as string | null
    const file = form.get('file') as File | null
    if (!token || !file) return NextResponse.json({ error: 'Missing token or file' }, { status: 400 })

    const db = admin()
    const { data: request } = await db.from('media_requests').select('*').eq('token', token).maybeSingle()
    if (!request) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
    if (request.status === 'cancelled') return NextResponse.json({ error: 'This request was cancelled.' }, { status: 410 })
    if (request.expires_at && new Date(request.expires_at).getTime() < Date.now()) return NextResponse.json({ error: 'This link has expired.' }, { status: 410 })

    // Enforce accepted kinds + max files.
    const kind = kindOf(file.type)
    if (Array.isArray(request.accept) && request.accept.length && !request.accept.includes(kind)) {
      return NextResponse.json({ error: `${kind} files aren't accepted for this request.` }, { status: 400 })
    }
    const { count } = await db.from('media_request_files').select('id', { count: 'exact', head: true }).eq('request_id', request.id)
    if ((count || 0) >= (request.max_files || 10)) {
      return NextResponse.json({ error: 'Maximum number of files reached.' }, { status: 400 })
    }

    // Ensure bucket
    try {
      const { data: buckets } = await db.storage.listBuckets()
      if (!buckets?.some(b => b.id === 'media-requests')) await db.storage.createBucket('media-requests', { public: true })
    } catch {}

    const bytes = new Uint8Array(await file.arrayBuffer())
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${request.company_id}/${token}/${Date.now()}-${safe}`
    const { error: upErr } = await db.storage.from('media-requests').upload(path, bytes, { contentType: file.type || 'application/octet-stream', upsert: true })
    if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })
    const { data: pub } = db.storage.from('media-requests').getPublicUrl(path)

    await db.from('media_request_files').insert({
      request_id: request.id, company_id: request.company_id, url: pub.publicUrl, name: file.name, kind, size_bytes: file.size,
    })

    // Drop the uploaded file into the conversation as a customer attachment.
    if (request.conversation_id) {
      await db.from('messages').insert({
        conversation_id: request.conversation_id, company_id: request.company_id,
        sender_type: 'visitor', content: '',
        attachments: [{ url: pub.publicUrl, name: file.name, type: file.type, kind, from_request: true }],
      })
      await db.from('conversations').update({ last_message: 'Customer uploaded a file', last_message_at: new Date().toISOString(), is_unread: true }).eq('id', request.conversation_id)
    }
    // Mark fulfilled
    await db.from('media_requests').update({ status: 'fulfilled' }).eq('id', request.id)

    return NextResponse.json({ ok: true, url: pub.publicUrl, kind })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
