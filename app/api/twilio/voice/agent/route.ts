import { twilioSignatureOk } from '@/lib/twilio-signature'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { phoneTurn, saveCallState, phoneListenTwiml, phoneGoodbyeTwiml, phoneVoicemailTwiml, aiCallMissed, noteCallerSpoke, callerNeverSpoke, setupOf, NO_VOICEMAIL_SAY, TROUBLE_SAY, type PhoneCallState } from '@/lib/phone-agent'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
const twiml = (body: string) => new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${body}`, { headers: { 'Content-Type': 'text/xml' } })

// One turn of a call the AI phone agent answered (see lib/phone-agent.ts).
// Twilio posts what the caller said (SpeechResult) or the key they pressed
// (Digits); we reply with what to say next and listen again, or say goodbye.
export async function POST(req: NextRequest) {
  const form = await req.formData()
  if (!(await twilioSignatureOk(req, form))) return new NextResponse('Forbidden', { status: 403 })
  const get = (k: string) => { const v = form.get(k); return v == null ? '' : String(v) }
  const sp = req.nextUrl.searchParams
  const callRowId = sp.get('callRowId') || ''
  const companyId = sp.get('companyId') || ''
  const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')
  const db = admin()

  const { data: call } = await db.from('calls').select('id, company_id, conversation_id, contact_id, from_number, caller_name, answered_at, routing_state').eq('id', callRowId).maybeSingle()
  const state: PhoneCallState | null = call?.routing_state?.phone_agent || null
  const voice: string = call?.routing_state?.phone_voice || 'Polly.Olivia-Neural'
  if (!call || call.company_id !== companyId || !state) return twiml('<Response><Hangup/></Response>')

  const { data: co } = await db.from('companies').select('name').eq('id', companyId).maybeSingle()
  const companyName = co?.name || ''
  const listen = (say: string) => twiml(phoneListenTwiml(`${base}/api/twilio/voice/agent?${sp.toString()}`, voice, say))

  // Keep the call row and the thread's transcript up to date after every turn,
  // so a caller hanging up mid-call still leaves the full record.
  const save = (end: boolean) => saveCallState(db, call, state, end)

  // 0 → voicemail, the business's own greeting and recording. With voicemail
  // switched off there's none to give: goodbye, and it's a missed call, as it
  // would have been without the AI (not a test call, or one where the AI
  // already took a message: see aiCallMissed).
  if (get('Digits') === '0') {
    const { data: integ } = await db.from('twilio_integrations').select('voicemail_enabled, voicemail_greeting').eq('company_id', companyId).maybeSingle()
    state.turns.push({ who: 'caller', text: '(pressed 0 for voicemail)' })
    if (integ?.voicemail_enabled === false) {
      state.turns.push({ who: 'agent', text: NO_VOICEMAIL_SAY })
      await save(true)
      await aiCallMissed(db, call, 'pressed 0 for voicemail, which is off')
      return twiml(phoneGoodbyeTwiml(voice, NO_VOICEMAIL_SAY))
    }
    await save(true)
    await db.from('calls').update({ status: 'voicemail_greeting', is_voicemail: true }).eq('id', call.id)
    const recCb = `${base}/api/twilio/voice/recording?callRowId=${encodeURIComponent(call.id)}&companyId=${encodeURIComponent(companyId)}&conversationId=${encodeURIComponent(call.conversation_id || '')}&kind=voicemail`
    return twiml(phoneVoicemailTwiml(voice, integ?.voicemail_greeting || 'Please leave a message after the tone.', recCb))
  }

  const said = get('SpeechResult').trim()
  if (!said) {
    state.silences = (state.silences || 0) + 1
    if (state.silences >= 2) {
      state.turns.push({ who: 'agent', text: 'I’ll let you go. Call back any time, or send us a message. Goodbye.' })
      await save(true)
      // Not a word from the caller: a missed call, as ringing out would have been.
      if (callerNeverSpoke(state) && setupOf(state).reason !== 'test') await aiCallMissed(db, call, 'caller didn’t say anything')
      return twiml(phoneGoodbyeTwiml(voice, 'I’ll let you go. Call back any time, or send us a message. Goodbye.'))
    }
    await save(false)
    return listen('Sorry, I didn’t catch that. How can I help?')
  }
  state.silences = 0
  // Noted straight away, so a hang-up while this reply is worked out isn't
  // taken for a caller who never said a word (the call's status callback).
  const spoke = noteCallerSpoke(db, call, state)

  try {
    const r = await phoneTurn(db, {
      companyId, companyName, siteOrigin: base, conversationId: call.conversation_id, contactId: call.contact_id,
      from: call.from_number, callerName: call.caller_name, state, said,
    })
    state.turns.push({ who: 'caller', text: said })
    state.turns.push({ who: 'agent', text: r.say, ms: r.ms })
    await spoke
    await save(r.end)
    return r.end ? twiml(phoneGoodbyeTwiml(voice, r.say)) : listen(r.say)
  } catch (e: any) {
    // Something broke: don't strand the caller — offer voicemail, or with
    // voicemail off, ask them to call back and treat it as a missed call.
    console.error('[phone agent] turn failed', e?.message || e)
    await spoke
    const { data: integ } = await db.from('twilio_integrations').select('voicemail_enabled, voicemail_greeting').eq('company_id', companyId).maybeSingle()
    state.turns.push({ who: 'caller', text: said })
    if (integ?.voicemail_enabled === false) {
      state.turns.push({ who: 'agent', text: '(Something went wrong; asked to call back.)' })
      await save(true)
      await aiCallMissed(db, call, 'the AI had trouble and voicemail is off')
      return twiml(phoneGoodbyeTwiml(voice, TROUBLE_SAY))
    }
    state.turns.push({ who: 'agent', text: '(Something went wrong; sent to voicemail.)' })
    await save(true)
    const recCb = `${base}/api/twilio/voice/recording?callRowId=${encodeURIComponent(call.id)}&companyId=${encodeURIComponent(companyId)}&conversationId=${encodeURIComponent(call.conversation_id || '')}&kind=voicemail`
    return twiml(phoneVoicemailTwiml(voice, `Sorry, I'm having trouble on my end. ${integ?.voicemail_greeting || 'Please leave a message after the tone.'}`, recCb))
  }
}
