import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { installState, type WidgetSite } from '@/lib/widget-install'

export const dynamic = 'force-dynamic'

// GET ?companyId=  whether the workspace's chat widget is on its website, and
// where (lib/widget-install, recorded by /api/widget/seen). For the chat
// widget's Install page and the inbox's "Install your chat widget" card.
//   { slug, state: 'live' | 'testing' | 'stale' | 'none', sites, tracking }
// tracking is false until the COLVY_V421 migration has run: the state is then
// unknown, so nothing should nag about installing.

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)
const noStore = { 'Cache-Control': 'no-store' }

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  const db = admin()
  const access = await requireCompanyAccess(req, db, companyId)
  if (!access.ok) return NextResponse.json({ error: access.unavailable ? 'Try again in a moment.' : 'Not allowed' }, { status: access.unavailable ? 503 : 403, headers: noStore })

  const [co, seen] = await Promise.all([
    db.from('companies').select('slug').eq('id', companyId).maybeSingle(),
    db.from('widget_sites').select('host, page_url, first_seen_at, last_seen_at').eq('company_id', companyId).order('last_seen_at', { ascending: false }).limit(20),
  ])
  const tracking = !seen.error
  const { state, sites } = installState((seen.data || []) as WidgetSite[])
  return NextResponse.json({ slug: co.data?.slug || null, state, sites, tracking }, { headers: noStore })
}
