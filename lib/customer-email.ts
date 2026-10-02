// Transactional email from a business to its customer, via Resend. Used by
// bookings and back-in-stock notices.

import { companyAlias, INBOUND_ENABLED } from '@/lib/inbound-alias'

const FALLBACK_FROM = 'notifications@updates.colvy.com'

// Transactional email to a customer from the business (Resend). From the
// company's verified sending address when it has one; replies go to the
// business's inbox.
export async function sendCustomerEmail(db: any, company: any, m: { to: string; subject: string; html?: string; text: string; attachments?: { filename: string; content: string }[] }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  if (!key || !m.to) return false
  try {
    const { data: ec } = await db.from('email_channels').select('from_address, from_name, inbound_address').eq('company_id', company.id).eq('is_active', true).limit(1)
    const ch = ec?.[0]
    const from = ch?.from_address || FALLBACK_FROM
    const replyTo = ch?.from_address || ch?.inbound_address || (INBOUND_ENABLED && company.slug ? companyAlias(company.slug) : undefined)
    const send = (fromAddr: string) => fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${(ch?.from_name || company.name || 'Colvy').replace(/[<>"]/g, '')} <${fromAddr}>`,
        to: [m.to], subject: m.subject, html: m.html, text: m.text,
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(m.attachments?.length ? { attachments: m.attachments } : {}),
      }),
    })
    let res = await send(from)
    // The channel's address may not be a Resend-verified domain (e.g. Gmail) —
    // fall back to Colvy's sending domain, replies still reach the business.
    if (!res.ok && from !== FALLBACK_FROM) res = await send(FALLBACK_FROM)
    return res.ok
  } catch (e) {
    console.error('[customer-email] failed', e)
    return false
  }
}
