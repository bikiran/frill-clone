import { NextRequest, NextResponse } from 'next/server'
import { callerUser, requireCompanyAccess } from '@/lib/company-access'
import { emailAdminDb, normEmail } from '@/lib/email-db'
import { loadEmailBrand } from '@/lib/email-brand'
import { cleanDesign } from '@/lib/email-design-store'
import { senderFor } from '@/lib/email-domains'
import { emailLinkBase } from '@/lib/email-campaign-sender'
import { signUnsubToken } from '@/lib/email-tokens'
import { fillSubject, fillTemplate, renderEmail } from '@/components/EmailDesigner/render'
import { isExternalSendBlocked, DEMO_BLOCK_MESSAGE } from '@/lib/demo-guard'
import { suppressedSet } from '@/lib/email-suppression'
import { readRecipients, type TestResult } from '@/lib/test-recipients'

export const dynamic = 'force-dynamic'

// "Send test email": the design as it stands, with example merge values, to
// up to 5 addresses staff choose (by default their own). From the same sender
// a campaign would use, "[Test]" in the subject, one email per address (no
// one sees the others). Never touches the campaign audience.
//
// Kept from being a way round consent: addresses on the do-not-email list
// (bounced or marked as spam) are skipped, and each staff member can send
// 30 test emails an hour.

const PER_HOUR = 30
const sends = new Map<string, number[]>()

export async function POST(req: NextRequest) {
  let body: any = {}
  try { body = await req.json() } catch {}
  const companyId = String(body.companyId || '')
  const db = emailAdminDb()
  const access = await requireCompanyAccess(req, db, companyId)
  if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const user = await callerUser(req, db)
  const own = normEmail(user?.email)
  // Who to: the addresses given, else the staff member's own.
  const asked = body.to == null || (Array.isArray(body.to) && !body.to.length) ? null : readRecipients('email', body.to)
  if (asked?.error) return NextResponse.json({ error: asked.error }, { status: 400 })
  const to = asked?.list.length ? asked.list : own ? [own] : []
  if (!to.length) return NextResponse.json({ error: asked ? 'Add an email address to send the test to.' : 'Your account has no email address to send the test to.' }, { status: 400 })
  if (await isExternalSendBlocked(companyId, db)) return NextResponse.json({ error: DEMO_BLOCK_MESSAGE }, { status: 403 })
  const key = process.env.RESEND_API_KEY
  if (!key) return NextResponse.json({ error: 'Email isn’t set up on this server.' }, { status: 503 })

  const now = Date.now()
  const recent = (sends.get(access.userId!) || []).filter(t => now - t < 3600_000)
  if (recent.length + to.length > PER_HOUR) return NextResponse.json({ error: recent.length >= PER_HOUR ? 'That’s a lot of test emails. Try again in a little while.' : `You can send ${PER_HOUR - recent.length} more test email${PER_HOUR - recent.length === 1 ? '' : 's'} this hour.` }, { status: 429 })

  const loaded = await loadEmailBrand(db, companyId)
  if (!loaded) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  const { brand, company } = loaded
  const sender = await senderFor(db, { ...company, email: company.business_email })
  const base = emailLinkBase(brand.slug)
  const subject = String(body.subject || '').trim() || `A test from ${brand.name}`
  const { html, text } = renderEmail(cleanDesign(body.design), brand, { subject, previewText: String(body.previewText || '') })
  // Signed preview links: the real unsubscribe and preference pages, in this
  // business's branding, marked as a preview, and nothing changes.
  const pv = encodeURIComponent(signUnsubToken({ co: companyId, c: 'preview', preview: true }))
  const blocked = await suppressedSet(db, companyId, to)
  // First names for the example: a customer's from their contact, the staff
  // member's from their own address, else "there".
  const names = new Map<string, string>()
  try {
    const { data } = await db.from('contacts').select('email, name').eq('company_id', companyId).in('email', to).limit(50)
    for (const c of data || []) { const f = String(c.name || '').trim().split(/\s+/)[0]; if (f && c.email) names.set(normEmail(c.email), f) }
  } catch {}
  const firstName = (addr: string) => {
    if (names.get(addr)) return names.get(addr)!
    if (addr !== own) return 'there'
    const f = addr.split('@')[0].split(/[._-]/)[0]
    return f ? f.charAt(0).toUpperCase() + f.slice(1) : 'there'
  }
  const sendOne = async (addr: string): Promise<TestResult> => {
    if (blocked.has(addr)) return { to: addr, ok: false, error: 'On your do-not-email list (it bounced or marked an email as spam), so it wasn’t sent.' }
    const vars = {
      first_name: firstName(addr), store_name: brand.name, outlet: '', coupon_code: '',
      unsubscribe_url: `${base}/api/email/unsubscribe?t=${pv}`, preferences_url: `${base}/api/email/preferences?t=${pv}`, open_pixel_url: '',
    }
    recent.push(Date.now())
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: sender.from, to: [addr], subject: `[Test] ${fillSubject(subject, vars)}`,
        html: fillTemplate(html, vars, { html: true }).replace(/<img src="" [^>]*>/, ''), text: fillTemplate(text, vars, { html: false }),
        ...(sender.replyTo ? { reply_to: sender.replyTo } : {}),
        tags: [{ name: 'kind', value: 'campaign_test' }],
      }),
    }).catch(() => null)
    if (res?.ok) return { to: addr, ok: true }
    const d: any = await res?.json().catch(() => ({}))
    return { to: addr, ok: false, error: `Didn’t send${d?.message ? `: ${String(d.message).slice(0, 160)}` : '.'}` }
  }
  const results: TestResult[] = []
  for (const addr of to) results.push(await sendOne(addr))
  sends.set(access.userId!, recent)
  const sent = results.filter(r => r.ok)
  if (!sent.length && results.length === 1) return NextResponse.json({ error: results[0].error?.replace(/^Didn’t send/, 'The test didn’t send') || 'The test didn’t send.', results }, { status: blocked.size ? 400 : 502 })
  return NextResponse.json({ ok: sent.length > 0, results, to: sent[0]?.to || null, from: sender.from, shared: sender.shared })
}
