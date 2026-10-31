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

export const dynamic = 'force-dynamic'

// "Send test email": the design as it stands, with example merge values, to
// the signed-in staff member's own address only (never an address from the
// request). From the same sender a campaign would use. A few per hour each.

const PER_HOUR = 12
const sends = new Map<string, number[]>()

export async function POST(req: NextRequest) {
  let body: any = {}
  try { body = await req.json() } catch {}
  const companyId = String(body.companyId || '')
  const db = emailAdminDb()
  const access = await requireCompanyAccess(req, db, companyId)
  if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const user = await callerUser(req, db)
  const to = normEmail(user?.email)
  if (!to) return NextResponse.json({ error: 'Your account has no email address to send the test to.' }, { status: 400 })
  if (await isExternalSendBlocked(companyId, db)) return NextResponse.json({ error: DEMO_BLOCK_MESSAGE }, { status: 403 })
  const key = process.env.RESEND_API_KEY
  if (!key) return NextResponse.json({ error: 'Email isn’t set up on this server.' }, { status: 503 })

  const now = Date.now()
  const recent = (sends.get(access.userId!) || []).filter(t => now - t < 3600_000)
  if (recent.length >= PER_HOUR) return NextResponse.json({ error: 'That’s a lot of test emails. Try again in a little while.' }, { status: 429 })

  const loaded = await loadEmailBrand(db, companyId)
  if (!loaded) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  const { brand, company } = loaded
  const sender = await senderFor(db, { ...company, email: company.business_email })
  const base = emailLinkBase(brand.slug)
  const subject = String(body.subject || '').trim() || `A test from ${brand.name}`
  const { html, text } = renderEmail(cleanDesign(body.design), brand, { subject, previewText: String(body.previewText || '') })
  const firstName = String(user?.email || '').split('@')[0].split(/[._-]/)[0]
  // Signed preview links: the real unsubscribe and preference pages, in this
  // business's branding, marked as a preview, and nothing changes.
  const pv = encodeURIComponent(signUnsubToken({ co: companyId, c: 'preview', preview: true }))
  const vars = {
    first_name: firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1) : 'there',
    store_name: brand.name, outlet: '', coupon_code: '',
    unsubscribe_url: `${base}/api/email/unsubscribe?t=${pv}`, preferences_url: `${base}/api/email/preferences?t=${pv}`, open_pixel_url: '',
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: sender.from, to: [to], subject: `[Test] ${fillSubject(subject, vars)}`,
      html: fillTemplate(html, vars, { html: true }).replace(/<img src="" [^>]*>/, ''), text: fillTemplate(text, vars, { html: false }),
      ...(sender.replyTo ? { reply_to: sender.replyTo } : {}),
      tags: [{ name: 'kind', value: 'campaign_test' }],
    }),
  }).catch(() => null)
  if (!res?.ok) {
    const d: any = await res?.json().catch(() => ({}))
    return NextResponse.json({ error: `The test didn’t send${d?.message ? `: ${String(d.message).slice(0, 160)}` : '.'}` }, { status: 502 })
  }
  recent.push(now); sends.set(access.userId!, recent)
  return NextResponse.json({ ok: true, to, from: sender.from, shared: sender.shared })
}
