import { requireCompanyAccess } from '@/lib/company-access'
import { internalHeaders } from '@/lib/internal-call'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderVariables } from '@/lib/sms-segments'
import { isExternalSendBlocked, DEMO_BLOCK_MESSAGE, logBlockedSend } from '@/lib/demo-guard'
import { textOptOut } from '@/lib/sms-consent'
import { readRecipients, fmtMobile, type TestResult } from '@/lib/test-recipients'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Test texts each staff member can send an hour (each number counts).
const PER_HOUR = 20
const sends = new Map<string, number[]>()

/**
 * POST — send a test of a campaign's text to the numbers given (up to 5
 * Australian mobiles), "[TEST]" first, with example details.
 *
 * Never touches the campaign audience: it texts only the numbers in the
 * request. A number that replied STOP (or is blocked) isn't texted, the same
 * as for a real send, and each staff member can send 20 test texts an hour.
 *
 * Body: { companyId, campaignId, to: string | string[] }
 * Returns { ok, results: [{ to, ok, error? }], sentTo, preview }.
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, campaignId, to: asked } = await req.json()
    if (!companyId || !campaignId || !asked || (Array.isArray(asked) && !asked.length)) {
      return NextResponse.json({ error: 'Missing companyId, campaignId or a number to text' }, { status: 400 })
    }
    // Texts from the workspace's number on its credit: members only.
    const access = await requireCompanyAccess(req, admin(), companyId)
    if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    if (await isExternalSendBlocked(companyId)) { logBlockedSend(companyId, 'campaign_test'); return NextResponse.json({ error: DEMO_BLOCK_MESSAGE }, { status: 403 }) }

    const { list, error } = readRecipients('sms', asked)
    if (error) return NextResponse.json({ error }, { status: 400 })
    if (!list.length) return NextResponse.json({ error: 'Enter a valid Australian mobile number' }, { status: 400 })
    const now = Date.now()
    const who = access.userId || companyId
    const recent = (sends.get(who) || []).filter(t => now - t < 3600_000)
    if (recent.length + list.length > PER_HOUR) {
      const left = Math.max(0, PER_HOUR - recent.length)
      return NextResponse.json({ error: left ? `You can send ${left} more test text${left === 1 ? '' : 's'} this hour.` : 'That’s a lot of test texts. Try again in a little while.' }, { status: 429 })
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

    // A customer's number gets their own first name, as the real send would.
    const bodyFor = (firstName: string) => `[TEST] ${renderVariables(campaign.message, {
      first_name: firstName || 'there',
      store_name: company?.name || 'our store',
      outlet: campaign.sender_name || company?.name || 'our store',
      order_number: '000000',
      coupon_code: cp?.code ? String(cp.code).toUpperCase() : 'SAMPLE',
      short_link: primary?.url || `https://${company?.slug || 'colvy'}.colvy.com`,
    })}`
    const testBody = bodyFor('there')

    // Send through the existing SMS route so the sending number, encoding and
    // logging behave exactly as they will for the real campaign.
    const origin = req.nextUrl.origin
    const sendOne = async (to: string): Promise<TestResult> => {
      const optOut: { state: string; contacts?: any[] } = await textOptOut(db, companyId, to).catch(() => ({ state: 'unknown' }))
      if (optOut.state === 'opted_out') return { to, ok: false, error: 'Replied STOP (or is blocked), so it wasn’t texted.' }
      if (optOut.state !== 'ok') return { to, ok: false, error: 'Couldn’t check whether this number opted out, so it wasn’t texted.' }
      recent.push(Date.now())
      const res = await fetch(`${origin}/api/telnyx/sms/send`, {
        method: 'POST',
        headers: internalHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          companyId,
          to,
          text: bodyFor(String(optOut.contacts?.find((c: any) => c?.name)?.name || '').trim().split(/\s+/)[0]),
          senderName: campaign.sender_name || company?.name || null,
          skipChatMessage: true,   // a test shouldn't appear in anyone's inbox thread
        }),
      }).catch(() => null)
      const data: any = await res?.json().catch(() => ({}))
      return res?.ok ? { to, ok: true } : { to, ok: false, error: data?.error || 'Didn’t send.' }
    }
    const results: TestResult[] = []
    for (const to of list) results.push(await sendOne(to))
    sends.set(who, recent)
    const sent = results.filter(r => r.ok)
    if (!sent.length && results.length === 1) {
      return NextResponse.json({ error: results[0].error || 'Test message failed to send', results }, { status: 400 })
    }
    return NextResponse.json({ ok: sent.length > 0, results, sentTo: sent.length ? fmtMobile(sent[0].to) : null, preview: testBody })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
