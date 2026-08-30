import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { xmlEscape, twilioIdentity } from '@/lib/twilio-service'
import { companyForInboundNumber } from '@/lib/inbound-company'
import { ensureContactByPhone } from '@/lib/contact-capture'

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

    // Which company owns the dialled number? Resolve from the authoritative
    // phone_numbers table (NOT the stale integrations.phone_number column, which
    // leaked calls to the wrong tenant), then load that company's settings.
    const companyId = await companyForInboundNumber(db, to, 'twilio')
    if (!companyId) {
      // Not a number we manage — say so rather than hanging silently.
      return twiml('<Response><Say>This number is not configured.</Say><Hangup/></Response>')
    }
    const { data: integ } = await db.from('twilio_integrations').select('*').eq('company_id', companyId).maybeSingle()
    if (!integ) {
      return twiml('<Response><Say>This number is not configured.</Say><Hangup/></Response>')
    }
    const greeting = integ.voicemail_greeting || 'Please leave a message after the tone.'

    // Resolve caller → contact + conversation, and make sure a conversation
    // EXISTS so the call is visible in the inbox for the whole team — even an
    // unanswered call from a number with no prior thread (which otherwise left
    // no trace anywhere but the call log).
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

      // Unknown caller → save the number as a contact now, so it's in the CRM and
      // future calls/texts from them resolve to the same person.
      if (!contactId && from) {
        contactId = await ensureContactByPhone(db, companyId, from, { source: 'phone' })
      }

      // Find an existing thread by the contact OR by the caller's number — many
      // threads key off contact_id with no sms_number, and vice-versa.
      const ors: string[] = []
      if (fromTail) ors.push(`sms_number.ilike.%${fromTail}%`)
      if (contactId) ors.push(`contact_id.eq.${contactId}`)
      if (ors.length) {
        const { data: conv } = await db.from('conversations')
          .select('id').eq('company_id', companyId).or(ors.join(','))
          .order('last_message_at', { ascending: false }).limit(1).maybeSingle()
        conversationId = conv?.id || null
      }

      const nowIso = new Date().toISOString()
      if (conversationId) {
        // Bump the existing thread to the top with a call preview.
        try { await db.from('conversations').update({ last_message: '📞 Incoming call', last_message_at: nowIso, is_unread: true }).eq('id', conversationId) } catch {}
      } else {
        // No thread yet — create one so the call lands in the inbox. Keyed to the
        // contact when known, otherwise to the caller's number.
        try {
          const { data: created } = await db.from('conversations').insert({
            company_id: companyId,
            contact_id: contactId,
            channel: 'phone',
            sms_number: from,
            status: 'open',
            last_message: '📞 Incoming call',
            last_message_at: nowIso,
            is_unread: true,
          }).select('id').maybeSingle()
          conversationId = created?.id || null
        } catch (e: any) { console.error('[twilio inbound] conversation create failed', e?.message || e) }
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
    // Keep the user ids alongside their Voice-SDK identities: the per-<Client>
    // status callback needs the user id to record WHO answered the call.
    const ringUsers = Array.from(userIds)
    const identities = ringUsers.map(uid => twilioIdentity(uid, companyId))

    // NOTE: we deliberately do NOT fire a separate /api/push/send "Ringing now"
    // notification here. Twilio's own Voice CallInvite push already raises a
    // full incoming-call notification (Answer/Decline, full-screen intent) on
    // every device below; a second Expo push just posted a duplicate, plain
    // notification for the same call. It never woke a closed app — only the
    // Twilio push does that — so dropping it leaves ringing intact.

    if (identities.length === 0) {
      // Nobody online → straight to voicemail (if enabled).
      if (integ.voicemail_enabled === false) return twiml('<Response><Hangup/></Response>')
      try { await db.from('calls').update({ status: 'voicemail_greeting', is_voicemail: true }).eq('id', callRowId || '') } catch {}
      return twiml(voicemailTwiml(base, greeting, cbQuery))
    }

    const ring = Number(integ.ring_seconds || 25)
    const recordingCb = `${base}/api/twilio/voice/recording?${cbQuery}`
    // When exactly ONE agent is rung, whoever answers is unambiguous — pass that
    // user id to the Dial action callback so it can record the answerer reliably
    // even if the per-<Client> "answered" status callback doesn't fire.
    const soloQuery = ringUsers.length === 1 ? `&soloUser=${encodeURIComponent(ringUsers[0])}` : ''
    const actionCb = `${base}/api/twilio/voice/inbound-status?${cbQuery}${soloQuery}`
    // Pass the calls-row id straight to the browser as a custom parameter, so
    // warm transfer can identify the exact call without guessing from CallSids
    // (the client leg's SID doesn't match the parent row). Each <Client> gets a
    // per-agent status callback carrying that agent's user id, so the child-status
    // handler can record which team member answered (and tell everyone else).
    const clients = ringUsers.map(uid => {
      const id = twilioIdentity(uid, companyId)
      const childCb = `${base}/api/twilio/voice/child-status?callRowId=${encodeURIComponent(callRowId || '')}&companyId=${encodeURIComponent(companyId)}&userId=${encodeURIComponent(uid)}`
      return (
        `<Client statusCallback="${xmlEscape(childCb)}" statusCallbackEvent="initiated ringing answered" statusCallbackMethod="POST">` +
          `<Identity>${xmlEscape(id)}</Identity>` +
          `<Parameter name="callRowId" value="${xmlEscape(callRowId || '')}"/>` +
          // The agent's Voice-SDK identity (u_<userId>) is company-agnostic, so a
          // teammate in several workspaces gets calls for all of them at one
          // identity. Tag which workspace this call belongs to so the mobile app
          // can switch into the right one before ringing (multi-workspace routing).
          `<Parameter name="companyId" value="${xmlEscape(companyId)}"/>` +
        `</Client>`
      )
    }).join('')

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
