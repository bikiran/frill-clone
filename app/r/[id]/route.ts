import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Redirects /r/<review_request_id> to the business's Google review link and
// records the click — on the request itself and on the contact, so the
// dispatcher can stop asking a customer who has already engaged with a review
// request. The redirect is the priority; click logging is best-effort.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  let target = ''
  try {
    const { data: rr } = await db.from('review_requests')
      .select('id, company_id, contact_id').eq('id', id).maybeSingle()
    if (rr) {
      const { data: co } = await db.from('companies').select('review_request_settings').eq('id', rr.company_id).maybeSingle()
      const cfg = (co?.review_request_settings as any) || {}
      const { data: gbp } = await db.from('google_business_accounts').select('review_link').eq('company_id', rr.company_id).maybeSingle()
      target = cfg.review_link || gbp?.review_link || ''

      const now = new Date().toISOString()
      // Mark the click on the request and, crucially, on the contact — that's the
      // signal the dispatcher reads to suppress future automatic requests.
      try { await db.from('review_requests').update({ clicked_at: now }).eq('id', rr.id) } catch {}
      if (rr.contact_id) { try { await db.from('contacts').update({ review_clicked_at: now }).eq('id', rr.contact_id) } catch {} }
    }
  } catch { /* fall through to a safe redirect */ }

  // Always send the customer somewhere sensible.
  return NextResponse.redirect(target || 'https://www.google.com')
}
