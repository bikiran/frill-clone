import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { recordSignupLater } from '@/lib/signup-attempts'
import { checkCode } from '@/lib/signup-sms'

export const dynamic = 'force-dynamic'

// Verify one channel's 6-digit code for a signup in progress. Marks that channel
// verified; the account is created later (complete-signup) once both are done.
//
// Each channel keeps its last few codes (lib/signup-sms), each valid for its
// own 10 minutes, so a text that arrives after a resend or a call still works.
// Typing the (already verified) email code into the mobile box is answered
// plainly instead of "That code isn't right", and isn't counted as a guess.

const MAX_ATTEMPTS = 6

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as any
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }
    const body = await req.json()
    const token = String(body.token || '')
    const channel: 'email' | 'sms' = body.channel === 'sms' ? 'sms' : 'email'
    const code = String(body.code || '').trim()

    if (!token || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Enter the 6-digit code.' }, { status: 400 })
    }

    const db = admin()
    const { data: row } = await db.from('signup_verifications').select('*').eq('token', token).maybeSingle()
    if (!row) return NextResponse.json({ error: 'This signup session has expired. Please start again.' }, { status: 404 })
    if (row.consumed_at) return NextResponse.json({ error: 'This signup session is already complete.' }, { status: 409 })
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Your code has expired. Request a new one.', code: 'expired' }, { status: 410 })
    }
    if ((row.attempts || 0) >= MAX_ATTEMPTS) {
      return NextResponse.json({ error: 'Too many attempts. Request a new code.', code: 'locked' }, { status: 429 })
    }

    const expected = channel === 'sms' ? row.sms_code : row.email_code
    if (!expected) return NextResponse.json({ error: 'No code was sent for this channel.' }, { status: 400 })

    const result = checkCode(expected, code, row.expires_at)
    if (result === 'expired') {
      return NextResponse.json({ error: 'That code has expired. Use the newest code we sent, or ask for a new one.', code: 'expired' }, { status: 410 })
    }
    if (result === 'wrong') {
      // The email code in the mobile box: only once email is verified, so this
      // can't be used to test email codes without counting.
      if (channel === 'sms' && row.email_verified && checkCode(row.email_code, code, row.expires_at, Number.MAX_SAFE_INTEGER) !== 'wrong') {
        recordSignupLater(db, { type: 'wrong_code', email: row.email, channel, headers: req.headers, detail: 'Entered the email code in the mobile box' })
        return NextResponse.json({ error: 'That’s the code from your email. Enter the code we texted (or read out) to your mobile.', code: 'email_code' }, { status: 400 })
      }
      await db.from('signup_verifications').update({ attempts: (row.attempts || 0) + 1 }).eq('token', token)
      recordSignupLater(db, { type: 'wrong_code', email: row.email, channel, headers: req.headers })
      const left = Math.max(0, MAX_ATTEMPTS - (row.attempts || 0) - 1)
      const hint = channel === 'sms' ? ' Use the newest text or call.' : ''
      return NextResponse.json({ error: `That code isn't right.${hint}${left ? ` ${left} attempt${left === 1 ? '' : 's'} left.` : ' Request a new code.'}` }, { status: 400 })
    }

    const patch: any = channel === 'sms' ? { sms_verified: true } : { email_verified: true }
    await db.from('signup_verifications').update(patch).eq('token', token)
    recordSignupLater(db, { type: channel === 'sms' ? 'mobile_verified' : 'email_verified', email: row.email, channel, headers: req.headers })

    const emailVerified = channel === 'email' ? true : !!row.email_verified
    const smsVerified = channel === 'sms' ? true : !!row.sms_verified
    return NextResponse.json({ ok: true, verified: true, emailVerified, smsVerified, bothVerified: emailVerified && smsVerified })
  } catch (err: any) {
    console.error('[otp/verify]', err)
    return NextResponse.json({ error: err.message || 'Could not verify code' }, { status: 500 })
  }
}
