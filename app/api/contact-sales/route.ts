import { NextRequest, NextResponse } from 'next/server'
import { salesEnquiryEmail } from '@/lib/colvy-account-emails'

export const dynamic = 'force-dynamic'

const TO = 'support@colvy.com'

/**
 * POST /api/contact-sales
 * Body: { name, email, company?, message?, plan?, source? }
 * Emails the sales inbox via Resend, with reply-to set to the enquirer so the
 * team can just hit reply. No secrets are returned to the client.
 */
export async function POST(req: NextRequest) {
  try {
    const { name, email, company, message, plan, source } = await req.json().catch(() => ({}))
    const cleanEmail = String(email || '').trim()
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      return NextResponse.json({ error: 'Please enter your name and a valid email.' }, { status: 400 })
    }

    const RESEND_KEY = process.env.RESEND_API_KEY
    // Without email configured we still succeed for the user (their intent is
    // captured in logs) rather than showing a scary error on a marketing form.
    if (!RESEND_KEY) {
      console.warn('[contact-sales] RESEND_API_KEY not set — enquiry not emailed:', { name, email: cleanEmail, company, plan, source })
      return NextResponse.json({ ok: true, emailed: false })
    }

    // The shared layout (lib/colvy-email) escapes every value.
    const mail = salesEnquiryEmail({
      name: String(name), email: cleanEmail, company: company ? String(company) : '',
      message: message ? String(message) : '', plan: plan ? String(plan) : '', source: source ? String(source) : '',
    })

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Colvy <noreply@updates.colvy.com>',
        to: [TO],
        reply_to: cleanEmail,
        subject: `Sales enquiry — ${name}${company ? ` (${company})` : ''}`,
        html: mail.html,
        text: mail.text,
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error('[contact-sales] Resend failed:', res.status, detail)
      return NextResponse.json({ error: 'Could not send right now — please email support@colvy.com.' }, { status: 502 })
    }
    return NextResponse.json({ ok: true, emailed: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Something went wrong.' }, { status: 500 })
  }
}
