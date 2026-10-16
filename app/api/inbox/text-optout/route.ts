import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { textOptOut } from '@/lib/sms-consent'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET ?conversationId= → { state: 'ok' | 'opted_out' | 'unknown' | 'no_number' }
//
// Has the customer on this thread opted out of texts? The same check every
// automated text runs (lib/sms-consent: any contact with the thread's number,
// the linked contact, and STOPs that never reached a contact), so the inbox
// warns staff before they type a text to them. Workspace members only.
export async function GET(req: NextRequest) {
  try {
    const conversationId = req.nextUrl.searchParams.get('conversationId')
    if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
    const db = admin()
    const { data: conv } = await db.from('conversations').select('company_id, sms_number, contact_id').eq('id', conversationId).maybeSingle()
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    if (!(await requireCompanyAccess(req, db, conv.company_id)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    let number: string | null = conv.sms_number || null
    if (!number && conv.contact_id) {
      const { data: c } = await db.from('contacts').select('phone').eq('id', conv.contact_id).eq('company_id', conv.company_id).maybeSingle()
      number = c?.phone || null
    }
    if (!number && !conv.contact_id) return NextResponse.json({ state: 'no_number' })
    const { state } = await textOptOut(db, conv.company_id, number, conv.contact_id || null)
    return NextResponse.json({ state })
  } catch (e: any) {
    return NextResponse.json({ state: 'unknown', error: e?.message || 'Could not check' })
  }
}
