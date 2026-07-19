import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isValidAuMobile } from '@/lib/campaign-audience'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * GET /api/campaigns/contacts?companyId=&q=&channel=
 *
 * Searches contacts for the manual audience picker. Returns whether each one is
 * actually messageable so the picker can show it up front, rather than the
 * person discovering at the exclusion step that half their picks were dropped.
 */
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    const q = (req.nextUrl.searchParams.get('q') || '').trim()
    const channel = req.nextUrl.searchParams.get('channel') === 'email' ? 'email' : 'sms'
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    const db = admin()
    let query = db.from('contacts')
      .select('id, name, email, phone, is_blocked, subscribed_to_marketing, consent_basis, unsubscribed_at')
      .eq('company_id', companyId)

    if (q) {
      const safe = q.replace(/[%,()]/g, ' ')
      query = query.or(`name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`)
    }

    const { data, error } = await query.order('name', { ascending: true }).limit(60)
    if (error) throw error

    const contacts = (data || []).map((c: any) => {
      let issue: string | null = null
      if (c.is_blocked) issue = 'Blocked'
      else if (c.unsubscribed_at) issue = 'Unsubscribed'
      else if (!c.subscribed_to_marketing || c.consent_basis === 'none') issue = 'No marketing consent'
      else if (channel === 'sms' && !isValidAuMobile(c.phone)) issue = 'No valid mobile'
      else if (channel === 'email' && !c.email) issue = 'No email address'
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        destination: channel === 'email' ? c.email : c.phone,
        messageable: !issue,
        issue,
      }
    })

    return NextResponse.json({ ok: true, contacts })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
