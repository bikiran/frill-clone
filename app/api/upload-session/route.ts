import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

function makeToken(len = 22) {
  const A = 'abcdefghijkmnpqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < len; i++) s += A[Math.floor(Math.random() * A.length)]
  return s
}

// POST → open a phone-upload session and return the URL to encode in a QR code.
export async function POST(req: NextRequest) {
  try {
    const { companyId, folderId, createdBy, minutes } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

    const db = admin()
    const token = makeToken()
    // Short-lived by design: a QR left on a screen shouldn't stay usable.
    const expiresAt = new Date(Date.now() + (Number(minutes) || 30) * 60 * 1000).toISOString()

    const { data, error } = await db.from('upload_sessions').insert({
      token, company_id: companyId, folder_id: folderId || null,
      created_by: createdBy || null, expires_at: expiresAt,
    }).select().maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Serve the link from the company's own subdomain when we can — it's what
    // the person sees on their phone, so it should look like their business.
    const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
    let origin = base
    try {
      const { data: co } = await db.from('companies').select('slug').eq('id', companyId).maybeSingle()
      const u = new URL(base)
      if (co?.slug && u.hostname.endsWith('colvy.com')) origin = `${u.protocol}//${co.slug}.colvy.com`
    } catch {}

    return NextResponse.json({
      ok: true,
      token,
      url: `${origin}/p/${token}`,
      expiresAt,
      id: data?.id,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// GET ?token= → session status (used by the desktop to live-update the count).
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token')
    if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })
    const db = admin()

    const { data: s } = await db.from('upload_sessions')
      .select('uploaded_count, expires_at, last_upload_at, company_id, folder_id')
      .eq('token', token).maybeSingle()
    if (!s) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const expired = new Date(s.expires_at).getTime() < Date.now()
    return NextResponse.json({
      ok: true,
      uploaded: s.uploaded_count || 0,
      expired,
      expiresAt: s.expires_at,
      lastUploadAt: s.last_upload_at,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
