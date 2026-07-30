import { NextRequest, NextResponse } from 'next/server'
import { presignPutUrl, r2Configured } from '@/lib/r2'

export const dynamic = 'force-dynamic'

// Returns a presigned PUT URL so the client can upload a large file (e.g. video)
// straight to R2, plus the public URL it will live at. Falls back with a flag so
// the caller can route through /api/storage/put when R2 isn't configured.
export async function POST(req: NextRequest) {
  try {
    if (!r2Configured()) return NextResponse.json({ ok: false, reason: 'r2_not_configured' })
    const { prefix = 'uploads', filename = 'file', contentType = 'application/octet-stream' } = await req.json().catch(() => ({}))
    const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_')
    const key = `${String(prefix).replace(/^\/+|\/+$/g, '')}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`
    const { uploadUrl, publicUrl } = await presignPutUrl(key, contentType)
    return NextResponse.json({ ok: true, uploadUrl, publicUrl })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
