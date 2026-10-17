import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkBurst } from '@/lib/rate-limit'
import { requestIp } from '@/lib/turnstile'
import { TABLE } from '@/lib/signup-attempts'
import { deliveryOf, deliveryProblem } from '@/lib/signup-delivery'
import { smsProblemMessage, voiceFallbackReady } from '@/lib/signup-sms'

export const dynamic = 'force-dynamic'

/**
 * POST { token } → what happened to the latest code sent to this sign-up's
 * mobile, so the "Verify mobile" step can say "We couldn't text that number"
 * and offer a call instead of leaving someone waiting for a text that was
 * blocked. Only for the browser holding the sign-up token; answers in plain
 * words (Twilio's codes stay in super admin → Signups).
 *
 *   { state: 'none' | 'sending' | 'delivered' | 'answered' | 'not_delivered' | 'send_failed' | 'no_report' | 'untracked',
 *     channel, message?, voiceAvailable }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const token = String(body?.token || '')
    if (!/^[0-9a-f]{20,100}$/i.test(token)) return NextResponse.json({ error: 'This sign-up has expired. Please start again.' }, { status: 400 })
    const ip = requestIp(req.headers)
    if (!checkBurst(`otp:delivery:${token}`, 30) || (ip && !checkBurst(`otp:delivery:ip:${ip}`, 60))) return NextResponse.json({ error: 'Too many checks' }, { status: 429 })
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } }) as any
    const { data: ver } = await db.from('signup_verifications').select('email, consumed_at').eq('token', token).maybeSingle()
    if (!ver?.email || ver.consumed_at) return NextResponse.json({ error: 'This sign-up has expired. Please start again.' }, { status: 404 })
    const voice = voiceFallbackReady()
    const { data: row, error } = await db.from(TABLE).select('events').eq('email', String(ver.email).toLowerCase()).maybeSingle()
    if (error || !row) return NextResponse.json({ state: 'none', channel: null, voiceAvailable: voice }, { headers: { 'Cache-Control': 'no-store' } })
    const d = deliveryOf(row)
    const message = deliveryProblem(d.state)
      ? (d.channel === 'voice' ? 'We couldn’t reach your phone by call. Check the number and try again, or email support@colvy.com.' : smsProblemMessage(d.code, voice))
      : null
    return NextResponse.json({ state: d.state, channel: d.channel, at: d.at, voiceAvailable: voice, ...(message ? { message } : {}) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    console.error('[otp/delivery]', e)
    return NextResponse.json({ error: 'Could not check' }, { status: 500 })
  }
}
