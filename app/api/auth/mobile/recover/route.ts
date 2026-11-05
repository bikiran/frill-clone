import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkBurst, callerKey } from '@/lib/rate-limit'
import { resetCodeEmail } from '@/lib/colvy-account-emails'

export const dynamic = 'force-dynamic'

// "Forgot password" in the app: one email carrying both a 6-digit code (typed
// into the app's reset screen, which checks it with Supabase itself:
// verifyOtp type 'recovery') and the usual link (for a computer: it lands on
// /auth/confirm → /reset-password, like the web's own reset).
//
// Supabase issues both for one request (admin generateLink 'recovery'); a new
// request replaces the last code and link. Nothing here says whether the
// address has an account: every answer is the same "sent" unless the email
// itself couldn't go out. Limited per address and per caller, as
// send-confirmation is.

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const REDIRECT = 'https://colvy.com/auth/confirm'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!EMAIL_RE.test(email) || email.length > 254) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
    if (!checkBurst(`recover:${email}`, 3) || !checkBurst(`recover:${callerKey(req)}`, 10)) {
      return NextResponse.json({ error: 'A code was sent a moment ago. Give it a minute before asking for another.' }, { status: 429 })
    }
    const RESEND_KEY = process.env.RESEND_API_KEY
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!RESEND_KEY || !serviceKey) return NextResponse.json({ error: 'Password reset isn’t available right now.' }, { status: 503 })

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data, error } = await (admin.auth.admin as any).generateLink({ type: 'recovery', email, options: { redirectTo: REDIRECT } })
    const code = data?.properties?.email_otp
    const link = data?.properties?.action_link
    // No account (or no code): say the same as for one that has, send nothing.
    if (error || !code || !link) return NextResponse.json({ ok: true })

    const mail = resetCodeEmail({ code: String(code), link: String(link) })
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Colvy <noreply@updates.colvy.com>', to: [email], subject: mail.subject, html: mail.html, text: mail.text }),
    })
    if (!res.ok) {
      console.error('recover: email not sent', await res.text().catch(() => ''))
      return NextResponse.json({ error: 'The email couldn’t be sent. Please try again.' }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('recover:', e?.message)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
