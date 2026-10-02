import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { platformTwilio, TWILIO_MASTER } from '@/lib/twilio-platform'

export const dynamic = 'force-dynamic'

// Send 6-digit verification codes to a signup-in-progress. Email goes via Resend,
// SMS via Colvy's platform Twilio account (no company exists yet at signup, so we
// can't use the per-company sender). Codes are stored HASHED against an opaque
// token; the account is only created in /api/auth/complete-signup once both
// channels are verified.

const CODE_TTL_MS = 10 * 60 * 1000      // codes valid for 10 minutes
const RESEND_COOLDOWN_MS = 30 * 1000    // min gap between sends for one token

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex')
const sixDigits = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as any
}

// Is there already a confirmed/any auth user for this email? Pages the admin
// list (same approach as ensure-domain); fine at signup scale.
async function emailInUse(db: any, email: string): Promise<boolean> {
  const target = (email || '').toLowerCase()
  if (!target) return false
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) break
    const users = data?.users || []
    if (users.some((u: any) => (u.email || '').toLowerCase() === target)) return true
    if (users.length < 200) break
  }
  return false
}

async function sendEmailCode(email: string, code: string): Promise<boolean> {
  const RESEND_KEY = process.env.RESEND_API_KEY
  if (!RESEND_KEY) return false
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Colvy <noreply@updates.colvy.com>',
      to: [email],
      subject: `${code} is your Colvy verification code`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:40px 24px">
          <h1 style="font-size:22px;font-weight:800;color:#0d0d0d;margin:0 0 8px">Verify your email</h1>
          <p style="font-size:15px;color:#6b7280;margin:0 0 24px">Enter this 6-digit code to continue setting up your Colvy account.</p>
          <div style="background:#fff4f1;border-radius:14px;padding:20px;text-align:center;margin-bottom:24px">
            <span style="font-size:34px;font-weight:800;letter-spacing:8px;color:#ff7a6b">${code}</span>
          </div>
          <p style="font-size:13px;color:#9ca3af;margin:0">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
        </div>`,
    }),
  })
  return res.ok
}

async function sendSmsCode(phone: string, code: string): Promise<boolean> {
  const tw = platformTwilio()
  if (!tw || !TWILIO_MASTER.messagingServiceSid) return false
  try {
    const { sid } = await tw.sendMessage({
      to: phone,
      text: `${code} is your Colvy verification code. It expires in 10 minutes.`,
      messagingServiceSid: TWILIO_MASTER.messagingServiceSid,
    })
    return !!sid
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }
    const body = await req.json()
    const email = String(body.email || '').trim().toLowerCase()
    const phone = String(body.phone || '').trim()
    // 'both' (default) sends/refreshes both codes; a single channel is used for a
    // targeted "resend" so the other channel's code isn't invalidated.
    const channel: 'both' | 'email' | 'sms' = ['email', 'sms'].includes(body.channel) ? body.channel : 'both'
    let token = String(body.token || '')

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }
    if ((channel === 'both' || channel === 'sms') && !phone) {
      return NextResponse.json({ error: 'A mobile number is required' }, { status: 400 })
    }

    const db = admin()

    // Fresh flow (no token yet): make sure the email isn't already registered so
    // we don't send codes into a dead end.
    if (!token) {
      if (await emailInUse(db, email)) {
        return NextResponse.json({ error: 'An account with this email already exists. Try signing in instead.', code: 'email_in_use' }, { status: 409 })
      }
      token = crypto.randomBytes(24).toString('hex')
    }

    // Existing token: enforce a resend cooldown.
    let existing: any = null
    if (body.token) {
      const { data } = await db.from('signup_verifications').select('*').eq('token', token).maybeSingle()
      existing = data
      if (existing?.last_sent_at && Date.now() - new Date(existing.last_sent_at).getTime() < RESEND_COOLDOWN_MS) {
        return NextResponse.json({ error: 'Please wait a moment before requesting another code.' }, { status: 429 })
      }
    }

    const emailCode = sixDigits()
    const smsCode = sixDigits()
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString()

    const row: any = {
      token, email, phone: phone || null,
      last_sent_at: new Date().toISOString(),
      expires_at: expiresAt,
      attempts: 0,
    }
    // Only (re)issue the code for the channel(s) being sent; keep the other.
    if (channel === 'both' || channel === 'email') { row.email_code = sha(emailCode); row.email_verified = false }
    if (channel === 'both' || channel === 'sms') { row.sms_code = sha(smsCode); row.sms_verified = false }

    // Upsert on the unique token.
    const { error: upErr } = await db.from('signup_verifications').upsert(row, { onConflict: 'token' })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    let emailSent = false
    let smsSent = false
    if (channel === 'both' || channel === 'email') emailSent = await sendEmailCode(email, emailCode)
    if (channel === 'both' || channel === 'sms') smsSent = phone ? await sendSmsCode(phone, smsCode) : false

    return NextResponse.json({ ok: true, token, emailSent, smsSent })
  } catch (err: any) {
    console.error('[otp/send]', err)
    return NextResponse.json({ error: err.message || 'Could not send codes' }, { status: 500 })
  }
}
