import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { xmlEscape, twilioIdentity } from '@/lib/twilio-service'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const twiml = (body: string) => new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${body}`, { headers: { 'Content-Type': 'text/xml' } })
const digitsOf = (s: string) => (s || '').replace(/\D/g, '').slice(-9)

// Voicemail TwiML: greet, then record and hand the recording to our callback.
function voicemailTwiml(base: string, greeting: string, cbQuery: string): string {
  const recCb = `${base}/api/twilio/voice/recording?${cbQuery}&kind=voicemail`
  return (
    `<Response>` +
      `<Say voice="Polly.Nicole">${xmlEscape(greeting)}</Say>` +
      `<Record maxLength="180" playBeep="true" trim="trim-silence" recordingStatusCallback="${xmlEscape(recCb)}" recordingStatusCallbackEvent="completed"/>` +
      `<Hangup/>` +
    `</Response>`
  )
}

// Inbound Voice webhook for a Twilio number. Configure the number's "A call
// comes in" webhook to POST here. Rings every online agent's browser client;
// falls back to voicemail when nobody's available or nobody answers.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const get = (k: string) => { const v = form.get(k); return v == null ? '' : String(v) }
    const callSid = get('CallSid')
    const from = get('From')
    const to = get('To')

    const db = admin()
    const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')

    const { data: integ } = await db.from('twilio_integrations').select('*').eq('phone_number', to).maybeSingle()
    if (!integ?.company_id) {
      // Not a number we manage — say so rather than hanging silently.
      return twiml('<Response><Say>This number is not configured.</Say><Hangup/></Response>')
    }
    const companyId = integ.company_id
    const greeting = integ.voicemail_greeting || 'Please leave a message after the tone.'

    // Resolve caller → contact + latest conversation (best-effort).
    let contactId: string | null = null
    let callerName: string | null = null
    let conversationId: string | null = null
    try {
      // Query by the last-9-digit tail rather than scanning a capped page of
      // contacts, so a saved caller is matched regardless of contact-list size.
      const fromTail = digitsOf(from)
      if (fromTail) {
        const { data: contacts } = await db.from('contacts')
          .select('id, name, phone').eq('company_id', companyId).ilike('phone', `%${fromTail}%`).limit(10)
        const c = (contacts || []).find((x: any) => x.phone && digitsOf(x.phone) === fromTail)
        if (c) { contactId = c.id; callerName = c.name || null }
      }
      if (contactId) {
        const { data: conv } = await db.from('conversations')
          .select('id').eq('company_id', companyId).eq('contact_id', contactId)
          .order('last_message_at', { ascending: false }).limit(1).maybeSingle()
        conversationId = conv?.id || null
        if (conv?.id) {
          try { await db.from('conversations').update({ last_message: '📞 Incoming call', last_message_at: new Date().toISOString(), is_unread: true }).eq('id', conv.id) } catch {}
        }
      }
    } catch {}

    // Create the call row (keyed by the Twilio Call SID) so it shows in logs and
    // the recording/status callbacks have something to attach to.
    let callRowId: string | null = null
    try {
      const { data: row } = await db.from('calls').insert({
        company_id: companyId, direction: 'inbound', provider: 'twilio',
        from_number: from, to_number: to, caller_name: callerName,
        contact_id: contactId, conversation_id: conversationId,
        status: 'ringing', twilio_call_sid: callSid, created_at: new Date().toISOString(),
      }).select('id').maybeSingle()
      callRowId = row?.id || null
    } catch (e: any) { console.error('[twilio inbound] call row insert failed', e?.message || e) }

    const cbQuery = `callRowId=${encodeURIComponent(callRowId || '')}&companyId=${encodeURIComponent(companyId)}&conversationId=${encodeURIComponent(conversationId || '')}`

    // Who's online? (heartbeat in the last 2 minutes.) Ring each one's browser
    // client by its Voice-SDK identity. Twilio bridges the caller to whoever
    // accepts first and cancels the rest — no manual bridge needed.
    const cutoff = new Date(Date.now() - 120000).toISOString()
    const { data: online } = await db.from('agent_presence')
      .select('user_id').eq('company_id', companyId)
      .gte('last_seen_at', cutoff).neq('available', false)

    // Mobile agents also, even when the app is closed. Their presence heartbeat
    // only beats while the app is foregrounded and is cleared on close, so a
    // closed/screen-off phone dropped out of `online` and the call went straight
    // to voicemail. But a registered push token means Twilio's own Voice push
    // can wake the app and deliver the invite — so include every agent that has
    // one. Twilio rings all identities at once and cancels the losers.
    const { data: mobileTokens } = await db.from('push_tokens')
      .select('user_id').eq('company_id', companyId).not('user_id', 'is', null)

    // Respect an explicit "unavailable": someone online who turned calls off
    // shouldn't be pulled back in just because their phone holds a token.
    const { data: away } = await db.from('agent_presence')
      .select('user_id').eq('company_id', companyId)
      .gte('last_seen_at', cutoff).eq('available', false)
    const unavailable = new Set<string>(((away || []).map((a: any) => a.user_id)).filter(Boolean))

    const userIds = new Set<string>([
      ...((online || []).map((a: any) => a.user_id)),
      ...((mobileTokens || []).map((t: any) => t.user_id)),
    ].filter((id: any) => id && !unavailable.has(id)))
    const identities = Array.from(userIds).map(uid => twilioIdentity(uid, companyId))

    // Fire a push so mobile devices/agents know a call is ringing.
    try {
      fetch(`${base}/api/push/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, title: `Incoming call from ${callerName || from}`, body: '📞 Ringing now', ...(conversationId ? { conversationId } : {}) }) })
    } catch {}

    if (identities.length === 0) {
      // Nobody online → straight to voicemail (if enabled).
      if (integ.voicemail_enabled === false) return twiml('<Response><Hangup/></Response>')
      try { await db.from('calls').update({ status: 'voicemail_greeting', is_voicemail: true }).eq('id', callRowId || '') } catch {}
      return twiml(voicemailTwiml(base, greeting, cbQuery))
    }

    const ring = Number(integ.ring_seconds || 25)
    const recordingCb = `${base}/api/twilio/voice/recording?${cbQuery}`
    const actionCb = `${base}/api/twilio/voice/inbound-status?${cbQuery}`
    // Per-client status callback captures the answered agent leg's CallSid (for
    // warm transfer). Only the client that answers fires 'answered'.
    const childCb = `${base}/api/twilio/voice/child-status?callRowId=${encodeURIComponent(callRowId || '')}&companyId=${encodeURIComponent(companyId)}`
    // Pass the calls-row id straight to the browser as a custom parameter, so
    // warm transfer can identify the exact call without guessing from CallSids
    // (the client leg's SID doesn't match the parent row).
    const clients = identities.map(id =>
      `<Client statusCallback="${xmlEscape(childCb)}" statusCallbackEvent="answered" statusCallbackMethod="POST">` +
        `<Identity>${xmlEscape(id)}</Identity>` +
        `<Parameter name="callRowId" value="${xmlEscape(callRowId || '')}"/>` +
      `</Client>`
    ).join('')

    try { await db.from('calls').update({ status: 'ringing_agents' }).eq('id', callRowId || '') } catch {}

    return twiml(
      `<Response>` +
        `<Dial timeout="${ring}" answerOnBridge="true" record="record-from-answer-dual" ` +
          `recordingStatusCallback="${xmlEscape(recordingCb)}" recordingStatusCallbackEvent="completed" ` +
          `action="${xmlEscape(actionCb)}" method="POST">` +
          clients +
        `</Dial>` +
      `</Response>`
    )
  } catch (err: any) {
    console.error('[twilio inbound] error', err)
    return twiml('<Response><Say>Sorry, something went wrong.</Say><Hangup/></Response>')
  }
}
