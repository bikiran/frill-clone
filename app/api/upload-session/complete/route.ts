import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Called once the phone has finished uploading straight to storage. Records the
// file in the gallery. (The bytes never pass through this function, so there's
// no request-size ceiling — which is what was killing video uploads.)
export async function POST(req: NextRequest) {
  try {
    const { token, path, fileName, contentType } = await req.json()
    if (!token || !path) return NextResponse.json({ error: 'token and path are required' }, { status: 400 })

    const db = admin()

    const { data: session } = await db.from('upload_sessions')
      .select('*').eq('token', token).maybeSingle()
    if (!session) return NextResponse.json({ error: 'This upload link is not valid.' }, { status: 404 })

    const kind = String(contentType || '').startsWith('video/') ? 'video'
      : String(contentType || '').startsWith('image/') ? 'image'
      : 'file'

    const { data: pub } = db.storage.from('media-gallery').getPublicUrl(path)

    const { data: item, error } = await db.from('media_items').insert({
      company_id: session.company_id,
      folder_id: session.folder_id || null,
      url: pub.publicUrl,
      title: fileName || 'Phone upload',
      kind,
      external_source: 'phone',
    }).select().maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await db.from('upload_sessions').update({
      uploaded_count: (session.uploaded_count || 0) + 1,
      last_upload_at: new Date().toISOString(),
    }).eq('id', session.id)

    return NextResponse.json({ ok: true, item, url: pub.publicUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
