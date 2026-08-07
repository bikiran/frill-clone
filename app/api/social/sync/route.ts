import { NextRequest, NextResponse } from 'next/server'
import { syncSocial } from '@/lib/social-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST { companyId } — pull the page's recent posts + comments and AI-classify them.
export async function POST(req: NextRequest) {
  try {
    const { companyId } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const result = await syncSocial(companyId)
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
