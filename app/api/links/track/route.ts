import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { trackLinks } from '@/lib/link-tracking'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// POST { companyId, conversationId?, text, channel? } → { text, links }
// Swaps every URL in an outgoing message for a tracked short link, so every
// link a customer gets from Colvy shows opens / device / city. Used by the
// inbox composer before a reply goes out on any channel.
export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const b = await req.json().catch(() => ({}))
    const companyId = String(b.companyId || '')
    const access = await requireCompanyAccess(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const text = String(b.text || '')
    if (!/https?:\/\//i.test(text)) return NextResponse.json({ text, links: [] })
    let contactId: string | undefined, locationId: string | undefined
    if (b.conversationId) {
      const { data: conv } = await db.from('conversations').select('contact_id, assigned_location_id, company_id').eq('id', b.conversationId).maybeSingle()
      if (conv?.company_id === companyId) { contactId = conv.contact_id || undefined; locationId = conv.assigned_location_id || undefined }
    }
    const out = await trackLinks(text, {
      companyId, conversationId: b.conversationId || undefined, contactId, locationId,
      channel: typeof b.channel === 'string' ? b.channel : 'chat', sentBy: b.sentBy || undefined, sentById: access.userId,
    })
    return NextResponse.json(out)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
