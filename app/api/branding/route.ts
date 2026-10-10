import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hidesPoweredBy } from '@/lib/branding'

export const dynamic = 'force-dynamic'

/**
 * GET /api/branding?companyId=
 *
 * Public: whether this workspace's public pages (help centre, forms, booking)
 * hide the "Powered by Colvy" badge. Returns only the boolean — never the plan.
 */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId') || ''
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) return NextResponse.json({ hide: false })
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const hide = await hidesPoweredBy(db, companyId)
  return NextResponse.json({ hide }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600' } })
}
