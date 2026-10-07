import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { presignPutUrl, r2Configured } from '@/lib/r2'
import { checkUpload } from '@/lib/upload-scope'

export const dynamic = 'force-dynamic'

// Returns a presigned PUT URL so the client can upload a large file (e.g. video)
// straight to R2, plus the public URL it will live at. Falls back with a flag so
// the caller can route through /api/storage/put when R2 isn't configured.
//
// lib/upload-scope.ts decides who may write to the folder. The content type is
// part of the signature, and so is the size when the caller sends one (visitors
// and upload links must), so the file stored is the file that was approved.
export async function POST(req: NextRequest) {
  try {
    if (!r2Configured()) return NextResponse.json({ ok: false, reason: 'r2_not_configured' })
    const { prefix, filename = 'file', contentType = 'application/octet-stream', size } = await req.json().catch(() => ({}))
    const ct = String(contentType || 'application/octet-stream').slice(0, 120)
    const bytes = Number.isFinite(Number(size)) && Number(size) > 0 ? Math.floor(Number(size)) : null
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
    const check = await checkUpload(req, db, prefix, ct, bytes)
    if (!check.ok) return NextResponse.json({ ok: false, error: check.error }, { status: check.status })
    if (check.who !== 'staff' && !bytes) return NextResponse.json({ ok: false, error: 'File size is required' }, { status: 400 })
    const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120)
    const key = `${check.prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`
    const { uploadUrl, publicUrl } = await presignPutUrl(key, ct, 600, bytes)
    return NextResponse.json({ ok: true, uploadUrl, publicUrl })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
