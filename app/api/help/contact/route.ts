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
      .select('id, support_email, business_email, contact_email, email')
      .eq('slug', slug).maybeSingle()

    let email: string | null =
      (co as any)?.support_email || (co as any)?.business_email ||
      (co as any)?.contact_email || (co as any)?.email || null

    if (!email && co?.id) {
      const { data: ec } = await db.from('email_channels')
        .select('from_address, inbound_address')
        .eq('company_id', co.id).eq('is_active', true).limit(1)
      email = ec?.[0]?.from_address || ec?.[0]?.inbound_address || null
    }

    return NextResponse.json({ email })
  } catch {
    // Never fail the help page over a contact address.
    return NextResponse.json({ email: null })
  }
}
