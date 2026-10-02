import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

// Verify one channel's 6-digit code for a signup in progress. Marks that channel
// verified; the account is created later (complete-signup) once both are done.

const MAX_ATTEMPTS = 6

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

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

    if (sha(code) !== expected) {
      await db.from('signup_verifications').update({ attempts: (row.attempts || 0) + 1 }).eq('token', token)
      const left = Math.max(0, MAX_ATTEMPTS - (row.attempts || 0) - 1)
      return NextResponse.json({ error: `That code isn't right.${left ? ` ${left} attempt${left === 1 ? '' : 's'} left.` : ' Request a new code.'}` }, { status: 400 })
    }

    const patch: any = channel === 'sms' ? { sms_verified: true } : { email_verified: true }
    await db.from('signup_verifications').update(patch).eq('token', token)

    const emailVerified = channel === 'email' ? true : !!row.email_verified
    const smsVerified = channel === 'sms' ? true : !!row.sms_verified
    return NextResponse.json({ ok: true, verified: true, emailVerified, smsVerified, bothVerified: emailVerified && smsVerified })
  } catch (err: any) {
    console.error('[otp/verify]', err)
    return NextResponse.json({ error: err.message || 'Could not verify code' }, { status: 500 })
  }
}
