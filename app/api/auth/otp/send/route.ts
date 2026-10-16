import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { verifyTurnstile, requestIp, TURNSTILE_FAILED } from '@/lib/turnstile'
import { claimOtpSend, recordSignupLater, cleanProfile, cleanAttribution, cleanEmail } from '@/lib/signup-attempts'
import { normaliseSignupMobile } from '@/lib/signup-delivery'
import {
  CODE_TTL_MS, sha, sixDigits, pushCode, sendSignupSms, callSignupCode, signupStatusCallbackUrl,
  voiceFallbackReady, smsProblemMessage, type SendResult,
} from '@/lib/signup-sms'

export const dynamic = 'force-dynamic'

// Send 6-digit verification codes to a signup-in-progress. Email goes via Resend,
// SMS via Colvy's platform Twilio account (no company exists yet at signup, so we
// can't use the per-company sender). Codes are stored HASHED against an opaque
// token; the account is only created in /api/auth/complete-signup once both
// channels are verified.
//
// Each send is also recorded in signup_attempts (lib/signup-attempts) with what
// the wizard knew by then (name, business, where they came from), so a sign-up
// that stops before the account exists still shows in super admin → Signups.
// Sends are limited per email and per IP (on top of the per-token cooldown).
//
// channel 'voice' is "Didn't get it? Call me with the code": only for a
// sign-up already under way (its token was issued after Turnstile), counted
// against the same SMS allowance plus a few calls an hour (claimOtpSend). It
// issues a new mobile code and reads it out; codes already texted keep
// working (lib/signup-sms keeps the last few), so a late text isn't wasted.
//
// The mobile is normalised here too (lib/signup-delivery), not only in the
// browser, and the text and call carry a status callback so super admin →
// Signups shows whether they actually arrived.

const RESEND_COOLDOWN_MS = 30 * 1000    // min gap between sends for one token

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

export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }
    const body = await req.json()
    const email = String(body.email || '').trim().toLowerCase()
    // 'both' (default) sends/refreshes both codes; a single channel is used for a
    // targeted "resend" so the other channel's code isn't invalidated. 'voice'
    // calls the mobile with a new mobile code.
    const channel: 'both' | 'email' | 'sms' | 'voice' = ['email', 'sms', 'voice'].includes(body.channel) ? body.channel : 'both'
    const mobileWanted = channel !== 'email'
    let token = String(body.token || '')

    // cleanEmail also refuses LIKE wildcards (%), which no real address needs.
    if (!email || !cleanEmail(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }
    // The same rules as the sign-up page: "0466 077 557", "+61 0466…" and
    // "61466…" all become +61466077557; landlines are refused with a reason.
    let phone = ''
    const rawPhone = String(body.phone || '').trim()
    if (rawPhone || mobileWanted) {
      const m = normaliseSignupMobile(rawPhone)
      if (!m.ok) {
        if (mobileWanted) return NextResponse.json({ error: rawPhone ? m.error : 'A mobile number is required', code: 'bad_mobile' }, { status: 400 })
      } else phone = m.e164
    }
    if (channel === 'voice') {
      // Only for a sign-up under way: its token was issued after Turnstile.
      if (!body.token) return NextResponse.json({ error: 'Ask for a text first.', code: 'restart' }, { status: 400 })
      if (!voiceFallbackReady()) return NextResponse.json({ error: 'We can’t call right now. Try resending the text, or email support@colvy.com.', code: 'voice_unavailable' }, { status: 503 })
    }

    const db = admin()

    // Fresh flow (no token yet): make sure the email isn't already registered so
    // we don't send codes into a dead end.
    if (!token) {
      // Bots: a fresh sign-up must pass Cloudflare Turnstile before Colvy sends
      // anything (each SMS code costs money). Resends carry the token issued
      // here, so they've already passed.
      const human = await verifyTurnstile(body.turnstileToken, requestIp(req.headers))
      if (!human.ok) {
        console.warn('[otp/send] turnstile rejected:', human.reason)
        return NextResponse.json({ error: TURNSTILE_FAILED, code: 'captcha' }, { status: 403 })
      }
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
      // A made-up token would skip the "email already registered" check above.
      if (!existing) return NextResponse.json({ error: 'This sign-up has expired. Please start again.', code: 'restart' }, { status: 400 })
      // A resend keeps the email it started with. Changing it here used to leave
      // email_verified set, so an address the person never received a code at
      // could end up on a confirmed account.
      if (String(existing.email || '').toLowerCase() !== email) {
        return NextResponse.json({ error: 'To use a different email, start the sign-up again.', code: 'restart' }, { status: 400 })
      }
      if (existing?.last_sent_at && Date.now() - new Date(existing.last_sent_at).getTime() < RESEND_COOLDOWN_MS) {
        return NextResponse.json({ error: 'Please wait a moment before requesting another code.' }, { status: 429 })
      }
    }

    // Too many codes for this email or from this network. Checked only now,
    // after Turnstile, the "already registered" check and the token checks, so
    // bots and dead ends don't use up a real person's allowance. Counted
    // atomically per channel (lib/signup-attempts claimOtpSend).
    const rate = await claimOtpSend(db, { email, ip: requestIp(req.headers) || null, channel })
    if (!rate.ok) {
      recordSignupLater(db, { type: 'rate_limited', email, channel, detail: rate.reason === 'ip' ? 'Too many from this network' : 'Too many for this email' })
      return NextResponse.json({ error: rate.message, code: 'rate_limited' }, { status: 429 })
    }

    const emailCode = sixDigits()
    const smsCode = sixDigits()
    const nowMs = Date.now()
    const codeExpiry = nowMs + CODE_TTL_MS

    const row: any = {
      token, email, phone: phone || null,
      last_sent_at: new Date(nowMs).toISOString(),
      expires_at: new Date(codeExpiry).toISOString(),
      attempts: 0,
    }
    // A different mobile number must be verified again, whatever was resent,
    // and codes sent to the old number stop working.
    const phoneChanged = !!existing && !!phone && (existing.phone || '') !== phone
    // Only (re)issue the code for the channel(s) being sent; keep the other.
    // Earlier codes for the same channel stay valid for their own 10 minutes.
    if (channel === 'both' || channel === 'email') { row.email_code = pushCode(existing?.email_code, sha(emailCode), codeExpiry, { fresh: !existing }); row.email_verified = false }
    if (mobileWanted || phoneChanged) { row.sms_code = pushCode(existing?.sms_code, sha(smsCode), codeExpiry, { fresh: !existing || phoneChanged }); row.sms_verified = false }
    if (!phone && existing?.phone) { row.phone = existing.phone; phone = existing.phone }

    // Upsert on the unique token. The row id goes in the status callback URL
    // (never the token, which is the browser's secret).
    const { data: saved, error: upErr } = await db.from('signup_verifications').upsert(row, { onConflict: 'token' }).select('id').maybeSingle()
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
    const verificationId: string | null = saved?.id || existing?.id || null

    let emailSent = false
    let mobile: SendResult | null = null
    if (channel === 'both' || channel === 'email') emailSent = await sendEmailCode(email, emailCode)
    if (channel === 'both' || channel === 'sms') mobile = await sendSignupSms(phone, smsCode, verificationId ? signupStatusCallbackUrl(verificationId, 'sms') : undefined)
    if (channel === 'voice') mobile = await callSignupCode(phone, smsCode, verificationId ? signupStatusCallbackUrl(verificationId, 'voice') : undefined)
    const smsSent = !!mobile?.ok
    const voice = voiceFallbackReady()

    // Record the attempt (never the codes) once the response has gone. Profile
    // and attribution come with the first send; resends only add to the timeline.
    const wanted = channel === 'both' ? ['email', 'sms'] : [channel]
    const failed = wanted.filter(c => c === 'email' ? !emailSent : !smsSent)
    const word = (c: string) => c === 'sms' ? 'SMS' : c === 'voice' ? 'call' : 'email'
    recordSignupLater(db, {
      type: failed.length === wanted.length ? 'send_failed' : 'code_sent',
      email, channel, phone: phone || existing?.phone || null, headers: req.headers,
      profile: body.token ? undefined : cleanProfile(body.profile),
      attribution: body.token ? undefined : cleanAttribution(body.attribution),
      smsSid: channel !== 'voice' && mobile?.ok ? mobile.sid : null,
      callSid: channel === 'voice' && mobile?.ok ? mobile.sid : null,
      smsError: mobile && !mobile.ok ? mobile.code : null,
      smsErrorMessage: mobile && !mobile.ok ? mobile.message : null,
      detail: [
        channel === 'voice' ? 'Call me with the code' : body.token ? 'Resend' : 'New sign-up',
        phoneChanged ? 'New mobile number' : '',
        // "SMS not sent: no sender configured" says it all for the mobile.
        (() => { const f = mobile?.code === 'not_configured' ? failed.filter(c => c === 'email') : failed; return f.length ? `${f.map(word).join(' and ')} not sent` : '' })(),
        mobile?.code === 'not_configured' ? `${channel === 'voice' ? 'Call' : 'SMS'} not sent: no sender configured` : '',
      ].filter(Boolean).join(' · '),
    })

    // What the page shows: a plain reason when the text or call didn't go
    // (Twilio's own wording and codes stay in super admin).
    const mobileProblem = mobile && !mobile.ok
      ? (channel === 'voice' ? 'We couldn’t call that number. Check it’s right and try again, or email support@colvy.com.' : smsProblemMessage(mobile.code, voice))
      : null
    return NextResponse.json({ ok: true, token, emailSent, smsSent, phone, sentAt: row.last_sent_at, voiceAvailable: voice, ...(mobileProblem ? { mobileProblem } : {}) })
  } catch (err: any) {
    console.error('[otp/send]', err)
    return NextResponse.json({ error: err.message || 'Could not send codes' }, { status: 500 })
  }
}
