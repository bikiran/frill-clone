import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Hands the phone a signed URL so it can upload STRAIGHT to Supabase Storage.
//
// Why: a serverless function caps request bodies at a few MB, so routing files
// through the API meant every video failed. Uploading direct to storage removes
// that ceiling entirely and is faster (one hop instead of two).
export async function POST(req: NextRequest) {
  try {
    const { token, fileName, contentType } = await req.json()
    if (!token || !fileName) {
      return NextResponse.json({ error: 'token and fileName are required' }, { status: 400 })
    }

    const db = admin()

    const { data: session } = await db.from('upload_sessions')
      .select('*').eq('token', token).maybeSingle()
    if (!session) return NextResponse.json({ error: 'This upload link is not valid.' }, { status: 404 })
    if (new Date(session.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This upload link has expired. Ask for a new QR code.' }, { status: 410 })
    }

    const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${session.company_id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safeName}`

    const { data, error } = await db.storage.from('media-gallery').createSignedUploadUrl(path)
    if (error) {
      const missing = /not found|bucket/i.test(error.message)
      return NextResponse.json({
        error: missing
          ? 'Storage is not set up yet — run the COLVY_V154_STORAGE_BUCKETS.sql migration.'
          : error.message,
      }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      path,
      token: data.token,          // the storage upload token
      signedUrl: data.signedUrl,
      contentType: contentType || 'application/octet-stream',
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
