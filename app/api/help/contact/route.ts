import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * GET /api/help/contact?slug=roxyaquarium  →  { email }
 *
 * The help centre needs one thing from the company's configuration: where to
 * send a support email. It used to read `email_channels` straight from the
 * browser, which meant that table had to be publicly readable — and it holds
 * channel configuration that shouldn't be.
 *
 * This returns the single address and nothing else, so the table can stay
 * locked down.
 */
export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get('slug')
    if (!slug) return NextResponse.json({ email: null })

    const db = admin()
    const { data: co } = await db.from('companies')
      .select('id, owner_id, support_email, business_email, contact_email, email')
      .eq('slug', slug).maybeSingle()

    let email: string | null =
      (co as any)?.support_email || (co as any)?.business_email ||
      (co as any)?.contact_email || (co as any)?.email || null

    // A support address configured in the help settings JSON.
    if (!email && co?.id) {
      try {
        const { data: s } = await db.from('site_settings').select('value')
          .eq('key', 'general').eq('company_id', co.id)
          .order('updated_at', { ascending: false }).limit(1)
        const v = s?.[0]?.value || {}
        email = v.helpEmail || v.supportEmail || v.contactEmail || v.businessEmail || null
      } catch {}
    }

    // A configured, active email channel.
    if (!email && co?.id) {
      const { data: ec } = await db.from('email_channels')
        .select('from_address, inbound_address')
        .eq('company_id', co.id).eq('is_active', true).limit(1)
      email = ec?.[0]?.from_address || ec?.[0]?.inbound_address || null
    }

    // Last resort: the workspace owner's account email — always company-specific,
    // never Colvy's. (Only fall back to a generic address if even this is absent.)
    if (!email && co?.owner_id) {
      try {
        const { data: u } = await (db as any).auth.admin.getUserById(co.owner_id)
        email = u?.user?.email || null
      } catch {}
    }

    return NextResponse.json({ email })
  } catch {
    // Never fail the help page over a contact address.
    return NextResponse.json({ email: null })
  }
}
