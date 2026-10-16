import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { twilioMasterSignatureOk } from '@/lib/twilio-signature'
import { recordDelivery } from '@/lib/signup-attempts'
import { TERMINAL_STATUSES } from '@/lib/signup-delivery'

export const dynamic = 'force-dynamic'

/**
 * Twilio's delivery reports for sign-up codes (the StatusCallback that
 * lib/signup-sms puts on each text and "call me with the code" call).
 *
 *   POST /api/auth/otp/status?v=<signup_verifications.id>&k=sms|voice
 *
 * Only Colvy's own Twilio account can post here: the AccountSid must be the
 * master account and X-Twilio-Signature must match its auth token (the query
 * string is part of what's signed, so `v` can't be swapped). Final answers
 * (delivered / undelivered / failed, or how the call ended) go on the sign-up
 * attempt's timeline with Twilio's error code, for super admin → Signups and
 * for the sign-up page's "we couldn't text that number". Nothing else changes.
 */

const RETRY_DELAY_MS = 1500
const empty = (status = 200) => new NextResponse(null, { status })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function POST(req: NextRequest) {
  let form: FormData
  try { form = await req.formData() } catch { return empty(400) }
  if (!twilioMasterSignatureOk(req, form)) return new NextResponse('Forbidden', { status: 403 })

  const sp = req.nextUrl.searchParams
  const kind: 'sms' | 'voice' = sp.get('k') === 'voice' ? 'voice' : 'sms'
  const v = String(sp.get('v') || '')
  const get = (k: string) => { const x = form.get(k); return x == null ? '' : String(x) }
  const sid = kind === 'voice' ? get('CallSid') : get('MessageSid') || get('SmsSid')
  const status = (kind === 'voice' ? get('CallStatus') : get('MessageStatus') || get('SmsStatus')).toLowerCase()
  // In-between steps (queued, sent, ringing…) aren't recorded.
  if (!sid || !/^[0-9a-f-]{8,64}$/i.test(v) || !TERMINAL_STATUSES[kind].includes(status)) return empty()

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } }) as any
  const { data: ver } = await db.from('signup_verifications').select('email').eq('id', v).maybeSingle()
  if (!ver?.email) return empty()

  // A text refused within a second can report back before the send itself
  // is on the timeline (it's recorded after the sign-up response): wait a
  // moment for it, then record anyway on the last try.
  for (let i = 0; i < 3; i++) {
    const r = await recordDelivery(db, { email: ver.email, sid, channel: kind, status, errorCode: get('ErrorCode') || null, requireKnownSid: i < 2 })
    if (r !== 'unknown_sid' && r !== 'no_row') break
    if (i < 2) await sleep(RETRY_DELAY_MS)
  }
  if (status !== 'delivered' && status !== 'completed') console.warn('[otp/status]', kind, status, get('ErrorCode') || '', sid)
  return empty()
}
