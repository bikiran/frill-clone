import { twilioSignatureOk } from '@/lib/twilio-signature'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { phoneTurn, transcriptText, phoneListenTwiml, phoneGoodbyeTwiml, phoneVoicemailTwiml, type PhoneCallState } from '@/lib/phone-agent'

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
  const save = async (end: boolean) => {
    const now = new Date()
    const dur = call.answered_at ? Math.max(1, Math.round((now.getTime() - new Date(call.answered_at).getTime()) / 1000)) : null
    if (call.conversation_id) {
      try {
        const content = transcriptText(state)
        if (state.transcriptMessageId) {
          await db.from('messages').update({ content }).eq('id', state.transcriptMessageId)
        } else {
          const { data: m } = await db.from('messages').insert({
            conversation_id: call.conversation_id, company_id: companyId, sender_type: 'agent', sender_name: 'AI phone agent',
            content, is_internal: true, metadata: { phone_agent: true, call_id: call.id },
          }).select('id').maybeSingle()
          state.transcriptMessageId = m?.id || null
        }
        await db.from('conversations').update({ last_message: '📞 Answered by the AI phone agent', last_message_at: now.toISOString() }).eq('id', call.conversation_id)
      } catch (e: any) { console.error('[phone agent] transcript save failed', e?.message || e) }
    }
    if (end) state.ended = true
    await db.from('calls').update({
      routing_state: { ...(call.routing_state || {}), phone_agent: state },
      ended_at: now.toISOString(), ...(dur ? { duration_seconds: dur } : {}),
      ...(state.messageTaken ? { ai_todos: ['Call the customer back (message taken by the AI phone agent)'] } : {}),
    }).eq('id', call.id)
  }

  // 0 → voicemail, the business's own greeting and recording.
  if (get('Digits') === '0') {
    const { data: integ } = await db.from('twilio_integrations').select('voicemail_greeting').eq('company_id', companyId).maybeSingle()
    state.turns.push({ who: 'caller', text: '(pressed 0 for voicemail)' })
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
      return twiml(phoneGoodbyeTwiml(voice, 'I’ll let you go. Call back any time, or send us a message. Goodbye.'))
    }
    await save(false)
    return listen('Sorry, I didn’t catch that. How can I help?')
  }
  state.silences = 0

  try {
    const r = await phoneTurn(db, {
      companyId, companyName, siteOrigin: base, conversationId: call.conversation_id, contactId: call.contact_id,
      from: call.from_number, callerName: call.caller_name, state, said,
    })
    state.turns.push({ who: 'caller', text: said })
    state.turns.push({ who: 'agent', text: r.say, ms: r.ms })
    if (r.tookMessage) state.messageTaken = true
    await save(r.end)
    return r.end ? twiml(phoneGoodbyeTwiml(voice, r.say)) : listen(r.say)
  } catch (e: any) {
    // Something broke: don't strand the caller — offer voicemail.
    console.error('[phone agent] turn failed', e?.message || e)
    state.turns.push({ who: 'caller', text: said })
    state.turns.push({ who: 'agent', text: '(Something went wrong; sent to voicemail.)' })
    await save(true)
    const { data: integ } = await db.from('twilio_integrations').select('voicemail_greeting').eq('company_id', companyId).maybeSingle()
    const recCb = `${base}/api/twilio/voice/recording?callRowId=${encodeURIComponent(call.id)}&companyId=${encodeURIComponent(companyId)}&conversationId=${encodeURIComponent(call.conversation_id || '')}&kind=voicemail`
    return twiml(phoneVoicemailTwiml(voice, `Sorry, I'm having trouble on my end. ${integ?.voicemail_greeting || 'Please leave a message after the tone.'}`, recCb))
  }
}
