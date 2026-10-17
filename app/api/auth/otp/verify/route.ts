import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { recordSignupLater, cleanProfile } from '@/lib/signup-attempts'
import { checkCode } from '@/lib/signup-sms'
import { checkBurst } from '@/lib/rate-limit'
import { requestIp } from '@/lib/turnstile'

export const dynamic = 'force-dynamic'

// Verify one channel's 6-digit code for a signup in progress. Marks that channel
// verified; the account is created later (complete-signup) once both are done.
//
// Each channel keeps its last few codes (lib/signup-sms), each valid for its
// own 10 minutes, so a text that arrives after a resend or a call still works.
// Typing the (already verified) email code into the mobile box is answered
// plainly instead of "That code isn't right".
//
// Guessing: each channel allows MAX_ATTEMPTS tries per sign-up, counted
// separately (email_attempts / sms_attempts, V391; before V391 the shared
// `attempts`). A try is reserved BEFORE the code is compared, with a
// compare-and-swap UPDATE (… SET n = n + 1 WHERE token = … AND n = <read>),
// so parallel requests can't get more tries than that (a right code gives
// its try back). Resends never reset
// the counters; only a fresh, Turnstile-backed start does (a new row). Plus
// 10 tries a minute per sign-up and per IP.

const MAX_ATTEMPTS = 5
const VERIFY_PER_MINUTE = 10

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as any
}

/** The counter column for a channel: per channel once V391 has run, else the shared one. */
const counterCol = (row: any, channel: 'email' | 'sms') => {
  const col = channel === 'sms' ? 'sms_attempts' : 'email_attempts'
  return col in row ? col : 'attempts'
}

/** Take one try atomically. used = tries taken including this one; ok false when none are left (or it can't be counted). */
async function reserveTry(db: any, row: any, col: string): Promise<{ ok: boolean; used: number }> {
  let raw = row[col]
  for (let i = 0; i < 12; i++) {
    const cur = Number(raw || 0)
    if (cur >= MAX_ATTEMPTS) return { ok: false, used: cur }
    const q = db.from('signup_verifications').update({ [col]: cur + 1 }).eq('token', row.token)
    const { data, error } = await (raw == null ? q.is(col, null) : q.eq(col, raw)).select('id')
    if (error) return { ok: false, used: MAX_ATTEMPTS }             // can't count it: don't compare
    if ((data || []).length) return { ok: true, used: cur + 1 }
    const { data: fresh } = await db.from('signup_verifications').select(col).eq('token', row.token).maybeSingle()
    if (!fresh) return { ok: false, used: MAX_ATTEMPTS }
    raw = fresh[col]
  }
  return { ok: false, used: MAX_ATTEMPTS }                           // heavy contention: fail closed
}

const locked = () => NextResponse.json({ error: 'Too many wrong codes. Start the sign-up again to get new codes.', code: 'locked' }, { status: 429 })

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
    const ip = requestIp(req.headers)
    if (!checkBurst(`otp:verify:t:${token}`, VERIFY_PER_MINUTE) || (ip && !checkBurst(`otp:verify:ip:${ip}`, VERIFY_PER_MINUTE))) {
      return NextResponse.json({ error: 'Too many tries. Wait a minute and try again.', code: 'slow_down' }, { status: 429 })
    }

    const db = admin()
    const { data: row } = await db.from('signup_verifications').select('*').eq('token', token).maybeSingle()
    if (!row) return NextResponse.json({ error: 'This signup session has expired. Please start again.', code: 'restart' }, { status: 404 })
    if (row.consumed_at) return NextResponse.json({ error: 'This signup session is already complete.' }, { status: 409 })
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Your code has expired. Request a new one.', code: 'expired' }, { status: 410 })
    }
    const expected = channel === 'sms' ? row.sms_code : row.email_code
    if (!expected) return NextResponse.json({ error: 'No code was sent for this channel.' }, { status: 400 })

    const col = counterCol(row, channel)
    const taken = await reserveTry(db, row, col)
    if (!taken.ok) return locked()
    const left = Math.max(0, MAX_ATTEMPTS - taken.used)

    const result = checkCode(expected, code, row.expires_at)
    if (result === 'expired') {
      return NextResponse.json({ error: 'That code has expired. Use the newest code we sent, or ask for a new one.', code: 'expired' }, { status: 410 })
    }
    if (result === 'wrong') {
      const tries = left ? ` ${left} attempt${left === 1 ? '' : 's'} left.` : ' Start the sign-up again to get new codes.'
      // The email code in the mobile box: only once email is verified, so this
      // can't be used to test email codes.
      if (channel === 'sms' && row.email_verified && checkCode(row.email_code, code, row.expires_at, Number.MAX_SAFE_INTEGER) !== 'wrong') {
        recordSignupLater(db, { type: 'wrong_code', email: row.email, channel, headers: req.headers, detail: 'Entered the email code in the mobile box' })
        return NextResponse.json({ error: `That’s the code from your email. Enter the code we texted (or read out) to your mobile.${tries}`, code: 'email_code' }, { status: 400 })
      }
      recordSignupLater(db, { type: 'wrong_code', email: row.email, channel, headers: req.headers })
      const hint = channel === 'sms' ? ' Use the newest text or call.' : ''
      return NextResponse.json({ error: `That code isn't right.${hint}${tries}`, ...(left ? {} : { code: 'locked' }) }, { status: 400 })
    }

    // Right first time doesn't use up a try (best effort: a race just leaves it counted).
    await db.from('signup_verifications').update({ [col]: taken.used - 1 }).eq('token', token).eq(col, taken.used)
    const patch: any = channel === 'sms' ? { sms_verified: true } : { email_verified: true }
    await db.from('signup_verifications').update(patch).eq('token', token)
    // The page sends what it knows about the business again, so a sign-up
    // whose first record was lost still gets its details (merged, blanks never wipe).
    recordSignupLater(db, { type: channel === 'sms' ? 'mobile_verified' : 'email_verified', email: row.email, channel, headers: req.headers, profile: cleanProfile(body.profile) })

    const emailVerified = channel === 'email' ? true : !!row.email_verified
    const smsVerified = channel === 'sms' ? true : !!row.sms_verified
    return NextResponse.json({ ok: true, verified: true, emailVerified, smsVerified, bothVerified: emailVerified && smsVerified })
  } catch (err: any) {
    console.error('[otp/verify]', err)
    return NextResponse.json({ error: err.message || 'Could not verify code' }, { status: 500 })
  }
}
