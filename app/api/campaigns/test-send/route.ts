import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderVariables } from '@/lib/sms-segments'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * POST — send a single test message for a campaign.
 *
 * Deliberately narrow: it sends to ONE number supplied in the request and
 * never touches the campaign audience. There is no code path here that can
 * reach more than one recipient, which is what makes it safe to expose while
 * the real send engine doesn't exist yet.
 *
 * Body: { companyId, campaignId, to }
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, campaignId, to } = await req.json()
    if (!companyId || !campaignId || !to) {
      return NextResponse.json({ error: 'Missing companyId, campaignId or destination' }, { status: 400 })
    }

    // One destination only. Reject anything that looks like a list.
    if (/[,;]/.test(String(to))) {
      return NextResponse.json({ error: 'Test sends go to a single number only' }, { status: 400 })
    }
    const digits = String(to).replace(/\D/g, '').slice(-9)
    if (digits.length !== 9 || !digits.startsWith('4')) {
      return NextResponse.json({ error: 'Enter a valid Australian mobile number' }, { status: 400 })
    }

    const db = admin()
    const { data: campaign } = await db.from('campaigns')
      .select('*').eq('id', campaignId).eq('company_id', companyId).maybeSingle()
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    if (!campaign.message?.trim()) {
      return NextResponse.json({ error: 'Write a message before sending a test' }, { status: 400 })
    }

    const { data: company } = await db.from('companies')
      .select('name, slug').eq('id', companyId).maybeSingle()

    // Resolve variables with placeholder values so the test reads like the real
    // thing. The attached link is included as its destination URL — tracked
    // short links are minted for real recipients only, so a test can't pollute
    // campaign click stats.
    const atts = Array.isArray(campaign.attachments) ? campaign.attachments : []
    const primary = atts.find((a: any) => a.kind !== 'coupon')
    const cp = atts.find((a: any) => a.kind === 'coupon')

    const body = renderVariables(campaign.message, {
      first_name: 'there',
      store_name: company?.name || 'our store',
      outlet: campaign.sender_name || company?.name || 'our store',
      order_number: '000000',
      coupon_code: cp?.code ? String(cp.code).toUpperCase() : 'SAMPLE',
      short_link: primary?.url || `https://${company?.slug || 'colvy'}.colvy.com`,
    })

    const testBody = `[TEST] ${body}`

    // Send through the existing SMS route so the sending number, encoding and
    // logging behave exactly as they will for the real campaign.
    const origin = req.nextUrl.origin
    const res = await fetch(`${origin}/api/telnyx/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId,
        to,
        text: testBody,
        senderName: campaign.sender_name || company?.name || null,
        skipChatMessage: true,   // a test shouldn't appear in anyone's inbox thread
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json({ error: data?.error || 'Test message failed to send' }, { status: 400 })
    }

    return NextResponse.json({ ok: true, sentTo: to, preview: testBody })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
