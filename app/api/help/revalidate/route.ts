import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { helpTags } from '@/lib/help-public'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * POST /api/help/revalidate  { companyId, articleIds?: string[] }
 *
 * The public help centre is served from a short-lived server cache
 * (lib/help-public). The admin calls this after publishing, editing, deleting
 * or changing help settings so customers see the change on their next load
 * instead of up to a minute later. Caller must belong to the company.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const companyId = typeof body?.companyId === 'string' ? body.companyId : null
    const ids: string[] = (Array.isArray(body?.articleIds) ? body.articleIds : [])
      .filter((s: unknown) => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s as string))
      .slice(0, 100)
    const access = await requireCompanyAccess(req, admin(), companyId)
    if (!access.ok || !companyId) return NextResponse.json({ ok: false }, { status: 403 })

    const now = { expire: 0 }
    revalidateTag(helpTags.company(companyId), now)
    revalidateTag(helpTags.all, now)
    revalidateTag(helpTags.companies, now)
    for (const id of ids) revalidateTag(helpTags.article(id.toLowerCase()), now)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
