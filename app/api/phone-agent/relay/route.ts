import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { phoneTurn, saveCallState, relaySecretOk, loadPhoneContext, type PhoneCallState } from '@/lib/phone-agent'

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
//   closed     — the call ended; final save
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
    return NextResponse.json({ ok: true })
  }
  if (event !== 'prompt') return NextResponse.json({ error: 'Unknown event' }, { status: 400 })

  const said = String(body.said || '').trim()
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
        if (r.tookMessage) state.messageTaken = true
        await saveCallState(db, call, state, r.end)
        send({ t: 'done', end: r.end })
      } catch (e: any) {
        console.error('[phone agent relay] turn failed', e?.message || e)
        state.turns.push({ who: 'caller', text: said })
        state.turns.push({ who: 'agent', text: '(Something went wrong; sent to voicemail.)' })
        try { await saveCallState(db, call, state, true) } catch {}
        send({ t: 'text', text: 'Sorry, I’m having trouble on my end, so I’ll pass you to voicemail.' })
        send({ t: 'done', end: true, voicemail: true })
      }
      controller.close()
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } })
}
