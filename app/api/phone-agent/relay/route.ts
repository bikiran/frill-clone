import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { phoneTurn, saveCallState, relaySecretOk, loadPhoneContext, aiCallMissed, missedIfCallerSilent, noteCallerSpoke, callerNeverSpoke, setupOf, TROUBLE_SAY, type PhoneCallState } from '@/lib/phone-agent'
import { refreshPhoneCatalog } from '@/lib/phone-catalog'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Called by the real-time relay server (voice-server/) during a call the AI
// phone agent answered. Events:
//   start      — the call connected; loads what the agent needs to know while
//                the greeting plays (and wakes this function up)
//   prompt     — the caller said something; streams the reply back as
//                newline-separated JSON: {"t":"text","text":…}… then
//                {"t":"done","end":bool,"voicemail"?:true}
//   interrupt  — the caller talked over the reply; records what they heard
//   closed     — the call ended; final save (a caller who never said a word
//                is a missed call, as ringing out would have been: decided a
//                few seconds on, in case the call is going to voicemail)
export async function POST(req: NextRequest) {
  if (!relaySecretOk(req.headers.get('x-relay-secret'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { event, callRowId, companyId } = body || {}
  const db = admin()
  const { data: call } = await db.from('calls').select('id, company_id, conversation_id, contact_id, from_number, caller_name, answered_at, routing_state').eq('id', String(callRowId || '')).maybeSingle()
  const state: PhoneCallState | null = call?.routing_state?.phone_agent || null
  if (!call || call.company_id !== companyId || !state) return NextResponse.json({ error: 'Unknown call' }, { status: 404 })

  const loadArgs = { companyId: call.company_id, conversationId: call.conversation_id, contactId: call.contact_id, from: call.from_number }

  if (event === 'start') {
    // The product names (for hearing and finding them) refresh in the
    // background of the greeting when they're stale.
    const catalog = refreshPhoneCatalog(db, call.company_id)
    if (!state.contextReady) {
      await loadPhoneContext(db, state, loadArgs)
      // Merge into the row as it is now, in case the caller already spoke.
      const { data: fresh } = await db.from('calls').select('routing_state').eq('id', call.id).maybeSingle()
      const now: PhoneCallState | null = fresh?.routing_state?.phone_agent || null
      if (now && !now.contextReady) {
        const merged: PhoneCallState = {
          ...now, contextText: state.contextText, timezone: state.timezone, verified: state.verified,
          facts: [...(state.facts || []), ...(now.facts || []).filter(f => !(state.facts || []).some(g => g.tool === f.tool && g.asked === f.asked))],
          contextReady: true,
        }
        await db.from('calls').update({ routing_state: { ...(fresh?.routing_state || {}), phone_agent: merged } }).eq('id', call.id)
      }
    }
    await catalog
    return NextResponse.json({ ok: true })
  }

  if (event === 'interrupt') {
    // Keep what the caller actually heard, so the transcript and the AI's
    // memory of the call match reality.
    const heard = String(body.heard || '').trim()
    const last = state.turns[state.turns.length - 1]
    if (last?.who === 'agent') last.text = heard ? `${heard} —` : '(interrupted)'
    await saveCallState(db, call, state, false)
    return NextResponse.json({ ok: true })
  }
  if (event === 'closed') {
    await saveCallState(db, call, state, true)
    if (callerNeverSpoke(state) && setupOf(state).reason !== 'test') missedIfCallerSilent(db, call, 'caller hung up without saying anything')
    return NextResponse.json({ ok: true })
  }
  if (event !== 'prompt') return NextResponse.json({ error: 'Unknown event' }, { status: 400 })

  const said = String(body.said || '').trim()
  // Noted straight away, so a hang-up while this reply is worked out isn't
  // taken for a caller who never said a word.
  const spoke = noteCallerSpoke(db, call, state)
  const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')
  // Normally loaded by "start" while the greeting played; if not, now.
  const [companyName] = await Promise.all([
    state.companyName != null
      ? Promise.resolve(state.companyName)
      : db.from('companies').select('name').eq('id', call.company_id).maybeSingle().then((r: any) => r.data?.name || '', () => ''),
    loadPhoneContext(db, state, loadArgs).catch(() => {}),
  ])
  const enc = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: any) => { try { controller.enqueue(enc.encode(JSON.stringify(o) + '\n')) } catch {} }
      try {
        const r = await phoneTurn(db, {
          companyId: call.company_id, companyName, siteOrigin: base,
          conversationId: call.conversation_id, contactId: call.contact_id,
          from: call.from_number, callerName: call.caller_name, state, said, deadlineMs: 12000,
          onText: text => send({ t: 'text', text }),
        })
        state.turns.push({ who: 'caller', text: said })
        state.turns.push({ who: 'agent', text: r.say, ms: r.ms })
        await spoke
        await saveCallState(db, call, state, r.end)
        send({ t: 'done', end: r.end })
      } catch (e: any) {
        console.error('[phone agent relay] turn failed', e?.message || e)
        // Voicemail, unless the business has it switched off: then a goodbye,
        // and it's a missed call.
        let voicemail = true
        try {
          const { data: integ } = await db.from('twilio_integrations').select('voicemail_enabled').eq('company_id', call.company_id).maybeSingle()
          voicemail = integ?.voicemail_enabled !== false
        } catch {}
        state.turns.push({ who: 'caller', text: said })
        state.turns.push({ who: 'agent', text: voicemail ? '(Something went wrong; sent to voicemail.)' : '(Something went wrong; asked to call back.)' })
        await spoke
        try { await saveCallState(db, call, state, true) } catch {}
        send({ t: 'text', text: voicemail ? 'Sorry, I’m having trouble on my end, so I’ll pass you to voicemail.' : TROUBLE_SAY })
        send({ t: 'done', end: true, ...(voicemail ? { voicemail: true } : {}) })
        if (!voicemail) await aiCallMissed(db, call, 'the AI had trouble and voicemail is off')
      }
      controller.close()
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } })
}
