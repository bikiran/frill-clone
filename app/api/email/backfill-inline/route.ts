import { NextRequest, NextResponse } from 'next/server'
import { backfillInlineImages } from '@/lib/gmail'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// One-off (repeatable) backfill for emails ingested before inline cid: images
// were resolved. POST { companyId?, limit? }. Runs service-role via lib/gmail's
// admin client. Call repeatedly until `updated` is 0.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any))
    const companyId = body?.companyId || req.nextUrl.searchParams.get('companyId') || undefined
    const limit = Math.min(200, Number(body?.limit) || 100)
    const result = await backfillInlineImages(companyId, limit)
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
