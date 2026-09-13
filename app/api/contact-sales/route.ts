import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const TO = 'support@colvy.com'
const esc = (s: string) => String(s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string))

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

    const rows: [string, string][] = [
      ['Name', name], ['Email', cleanEmail], ['Company', company || '—'],
      ['Plan / interest', plan || '—'], ['From page', source || '—'],
    ]
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">
        <h1 style="font-size:20px;font-weight:800;color:#0d0d0d;margin:0 0 16px">New sales enquiry</h1>
        <table style="width:100%;border-collapse:collapse;font-size:14px;color:#0d0d0d">
          ${rows.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font-weight:600">${esc(v)}</td></tr>`).join('')}
        </table>
        ${message ? `<p style="font-size:13px;color:#6b7280;margin:20px 0 6px">Message</p><div style="font-size:14px;color:#0d0d0d;white-space:pre-wrap;background:#f6f7f9;border-radius:10px;padding:14px 16px">${esc(message)}</div>` : ''}
      </div>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Colvy <noreply@updates.colvy.com>',
        to: [TO],
        reply_to: cleanEmail,
        subject: `Sales enquiry — ${name}${company ? ` (${company})` : ''}`,
        html,
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
