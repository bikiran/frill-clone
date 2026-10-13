// The AI phone agent — test stage.
//
// Twilio turns the caller's speech into text (<Gather input="speech">) and
// reads our replies aloud (<Say>); each turn of the conversation is one webhook
// (app/api/twilio/voice/agent). Colvy decides every reply with the same
// lookups the chat agents use: opening hours, the caller's orders, stock and
// the business's own knowledge. Anything it can't do becomes a call-back task.
//
// While in test it only answers calls from the business's test numbers, and
// answers them straight away; every other caller is handled exactly as before.

import { getModelClient, type NeutralBlock, type NeutralMessage } from '@/lib/agent/model'
import { getAction, validateInput } from '@/lib/agent/actions'
import { toolSpec } from '@/lib/agent/engine'
import { buildContext } from '@/lib/agent/memory'
import { localNow, prettyDate, prettyTime } from '@/lib/business-hours'
import { notifyCompany, pushInboundMessage } from '@/lib/notify'
import type { ActionContext, ActionDef } from '@/lib/agent/types'
import { createHmac, timingSafeEqual } from 'crypto'

// ── Settings (an agent_policies row: role "phone", action "answer_calls") ────

export type PhoneAgentSettings = { enabled: boolean; testNumbers: string[]; voice: string }

export const PHONE_VOICES: { id: string; label: string }[] = [
  { id: 'Polly.Olivia-Neural', label: 'Olivia — Australian, female' },
  { id: 'Google.en-AU-Neural2-C', label: 'Australian, female (Google)' },
  { id: 'Google.en-AU-Neural2-B', label: 'Australian, male (Google)' },
]
const DEFAULT_VOICE = PHONE_VOICES[0].id
export const MAX_TEST_NUMBERS = 5

const tail = (n: string | null | undefined) => String(n || '').replace(/\D/g, '').slice(-9)

export function cleanPhoneAgent(raw: any): PhoneAgentSettings {
  const nums = (Array.isArray(raw?.testNumbers) ? raw.testNumbers : Array.isArray(raw?.test_numbers) ? raw.test_numbers : [])
    .map((n: any) => String(n || '').trim()).filter((n: string) => tail(n).length >= 8)
  const voice = PHONE_VOICES.some(v => v.id === raw?.voice) ? raw.voice : DEFAULT_VOICE
  return { enabled: !!raw?.enabled, testNumbers: Array.from(new Set<string>(nums)).slice(0, MAX_TEST_NUMBERS), voice }
}

export async function getPhoneAgent(db: any, companyId: string): Promise<PhoneAgentSettings> {
  try {
    const { data } = await db.from('agent_policies').select('autonomy, limits')
      .eq('company_id', companyId).eq('role_key', 'phone').eq('action_key', 'answer_calls').limit(1)
    const row = data?.[0]
    if (!row) return cleanPhoneAgent(null)
    return cleanPhoneAgent({ ...(row.limits || {}), enabled: row.autonomy === 'act_within_limits' })
  } catch { return cleanPhoneAgent(null) }
}

export async function setPhoneAgent(db: any, companyId: string, raw: any, userId: string | null): Promise<PhoneAgentSettings> {
  const s = cleanPhoneAgent(raw)
  const row = { autonomy: s.enabled ? 'act_within_limits' : 'off', limits: { mode: 'test', test_numbers: s.testNumbers, voice: s.voice }, updated_by: userId, updated_at: new Date().toISOString() }
  const { data: existing } = await db.from('agent_policies').select('id')
    .eq('company_id', companyId).eq('role_key', 'phone').eq('action_key', 'answer_calls').limit(1)
  if (existing?.[0]) {
    const { error } = await db.from('agent_policies').update(row).eq('id', existing[0].id)
    if (error) throw error
  } else {
    const { error } = await db.from('agent_policies').insert({ company_id: companyId, role_key: 'phone', action_key: 'answer_calls', ...row })
    if (error) throw error
  }
  return s
}

/** Should the agent answer this caller? (Test stage: only the test numbers.) */
export function answersCaller(s: PhoneAgentSettings, from: string): boolean {
  const t = tail(from)
  return s.enabled && t.length >= 8 && s.testNumbers.some(n => tail(n) === t)
}

// ── One call's state (kept on calls.routing_state.phone_agent) ───────────────

export type Turn = { who: 'caller' | 'agent'; text: string; ms?: number }
export type PhoneCallState = {
  greeting: string
  contextText: string      // business + customer facts, fixed for the call
  timezone: string
  verified: boolean        // the caller's number matches the contact's phone
  turns: Turn[]
  silences: number
  messageTaken?: boolean
  ended?: boolean
  realtime?: boolean       // answered through the real-time relay (ConversationRelay)
  transcriptMessageId?: string | null
}

export async function startPhoneCall(db: any, args: { companyId: string; companyName: string; conversationId: string | null; contactId: string | null; from: string }): Promise<PhoneCallState> {
  let contextText = ''
  let timezone = 'Australia/Melbourne'
  let verified = false
  try {
    const ctx = await buildContext(db, args.companyId, { conversationId: args.conversationId, contactId: args.contactId })
    contextText = [ctx.businessText, ctx.customerText, ctx.toneText ? `How the business likes to sound: ${ctx.toneText}` : ''].filter(Boolean).join('\n\n')
    timezone = ctx.timezone || timezone
  } catch {}
  if (args.contactId) {
    try {
      const { data: c } = await db.from('contacts').select('phone').eq('id', args.contactId).maybeSingle()
      verified = tail(c?.phone).length >= 8 && tail(c?.phone) === tail(args.from)
    } catch {}
  }
  const name = args.companyName || 'us'
  return {
    greeting: `Hi, thanks for calling ${name}. The team can't get to the phone right now, so you're speaking with ${name}'s AI assistant. I can check an order, our opening hours or stock, or take a message. How can I help?`,
    contextText, timezone, verified, turns: [], silences: 0,
  }
}

// ── A turn ───────────────────────────────────────────────────────────────────

const LOOKUPS = ['get_business_hours', 'find_customer_orders', 'check_order_status', 'check_stock', 'ask_knowledge']

const TAKE_MESSAGE = {
  name: 'take_message',
  description: 'Take a message for the team so someone calls the caller back. Use when the caller wants a person, a refund, to make a complaint, or anything you cannot do or answer.',
  input_schema: {
    type: 'object', additionalProperties: false, required: ['name', 'about'],
    properties: {
      name: { type: 'string', description: 'The caller’s name.' },
      callback_number: { type: 'string', description: 'The best number to call back, if different from the one they are calling from.' },
      about: { type: 'string', description: 'What it is about, in a sentence or two, with any order number.' },
      urgent: { type: 'boolean' },
    },
  },
}
const END_CALL = {
  name: 'end_call',
  description: 'End the call once the caller has what they need or says goodbye. Your goodbye is read to them, then the call ends.',
  input_schema: { type: 'object', additionalProperties: false, required: ['goodbye'], properties: { goodbye: { type: 'string', description: 'One short spoken sentence.' } } },
}

function systemPrompt(state: PhoneCallState, p: { companyName: string; from: string; callerName: string | null; timezone: string }): string {
  const now = localNow(p.timezone)
  return [
    `You are the AI phone assistant for ${p.companyName}, answering a call because the team couldn't get to the phone. It is ${prettyTime(now.time)}, ${prettyDate(now.date)} (${p.timezone}).`,
    `The caller${p.callerName ? ` is ${p.callerName} and` : ''} is calling from ${p.from}. ${state.verified ? 'That number matches their customer record, so you may discuss orders linked to it.' : 'Their number isn’t linked to a customer record we can trust.'}`,
    '',
    'How to talk:',
    '- This is a phone call. Reply in one to three short spoken sentences. No lists, markdown, links, emojis or abbreviations. Say order numbers digit by digit and prices in words a person would say.',
    '- You already said you are an AI assistant in the greeting; only repeat it if asked.',
    '- Before you use a lookup, first say a few words so the caller isn’t left in silence, like “Let me check that for you.”',
    '- Use your tools for every fact: opening hours, the caller’s orders, stock and the business’s own knowledge. Never guess or invent prices, stock, dates, delivery times or policies. If the tools don’t give you the answer, offer to take a message.',
    `- Orders: ${state.verified ? 'you may look up orders linked to this caller. ' : ''}For any other order, ask for the order number and the email address or postcode on it before sharing anything.`,
    '- If the caller wants a person, a refund, a return, to complain, or anything you can’t do: use take_message (their name and what it’s about), tell them the team will call them back, then end the call.',
    '- When they have what they need, ask if there’s anything else; when they’re done, use end_call.',
    '- Never ask for or accept card numbers, passwords or one-time codes.',
    '',
    state.contextText,
  ].filter(s => s !== undefined).join('\n')
}

// ms: how long until the caller heard the first words of the reply.
export type TurnResult = { say: string; end: boolean; tookMessage: boolean; ms: number; tools: string[] }

/**
 * Work out the agent's reply to what the caller just said. Runs the lookups
 * the model asks for (a few rounds at most) inside `deadlineMs`, so Twilio —
 * which waits about 15 seconds for an answer — never gives up on us.
 */
export async function phoneTurn(db: any, args: {
  companyId: string; companyName: string; siteOrigin: string; conversationId: string | null; contactId: string | null
  from: string; callerName: string | null; state: PhoneCallState; said: string; deadlineMs?: number
  /** Real-time calls: speak the reply as it's written, instead of all at the end. */
  onText?: (text: string) => void
}): Promise<TurnResult> {
  const started = Date.now()
  const deadline = started + (args.deadlineMs ?? 9000)
  const model = getModelClient()
  // Everything the caller hears this turn, and when they first heard it.
  const spoken: string[] = []
  let firstAt = 0
  const speak = (text: string, alreadyStreamed = false) => {
    if (!text) return
    if (!firstAt) firstAt = Date.now()
    if (args.onText && !alreadyStreamed) args.onText(text)
  }
  const result = (end: boolean, extra?: string): TurnResult => {
    if (extra) { speak(extra); spoken.push(extra) }
    const say = spoken.map(t => t.trim()).filter(Boolean).join(' ') || 'Sorry, could you say that again?'
    if (!firstAt) speak(say)
    return { say, end, tookMessage, ms: (firstAt || Date.now()) - started, tools: used }
  }
  const actions = LOOKUPS.map(k => getAction(k)).filter(Boolean) as ActionDef[]
  const tools = [...actions.map(toolSpec), TAKE_MESSAGE, END_CALL]
  const actx: ActionContext = {
    db, companyId: args.companyId, companyName: args.companyName, siteOrigin: args.siteOrigin,
    runId: '', roleKey: 'support', roleName: 'Phone agent', mode: 'live',
    conversationId: args.conversationId, contactId: args.contactId,
    customerVerification: args.state.verified ? 'verified' : 'unknown', scratch: {},
  }
  const messages: NeutralMessage[] = []
  // The conversation so far (the greeting is the agent's first turn).
  messages.push({ role: 'user', content: [{ type: 'text', text: '(The call connects.)' }] })
  messages.push({ role: 'assistant', content: [{ type: 'text', text: args.state.greeting }] })
  for (const t of args.state.turns) {
    const role = t.who === 'caller' ? 'user' : 'assistant'
    const last = messages[messages.length - 1]
    if (last?.role === role) last.content.push({ type: 'text', text: t.text })
    else messages.push({ role, content: [{ type: 'text', text: t.text }] })
  }
  messages.push({ role: 'user', content: [{ type: 'text', text: args.said || '(The caller said nothing.)' }] })

  const used: string[] = []
  let tookMessage = false
  for (let round = 0; round < 4; round++) {
    if (Date.now() > deadline) break
    const req = {
      tier: 'fast' as const, job: 'phone_agent' as const, companyId: args.companyId, maxTokens: 600,
      system: systemPrompt(args.state, { companyName: args.companyName, from: args.from, callerName: args.callerName, timezone: args.state.timezone }),
      messages, tools,
    }
    // Streaming: each piece of text goes to the caller the moment it's written.
    let streamed = false
    let gap = spoken.length > 0
    const r = args.onText && model.generateStream
      ? await model.generateStream(req, t => { streamed = true; if (gap) { args.onText!(' '); gap = false } speak(t) })
      : await model.generate(req)
    messages.push({ role: 'assistant', content: r.content })
    if (r.text) { spoken.push(r.text); speak(r.text, streamed) }
    if (!r.toolCalls.length) return result(false)

    const results: NeutralBlock[] = []
    let goodbye: string | null = null
    for (const call of r.toolCalls) {
      used.push(call.name)
      if (call.name === 'end_call') { goodbye = String(call.input?.goodbye || 'Thanks for calling. Goodbye.'); results.push({ type: 'tool_result', id: call.id, content: 'ok' }); continue }
      if (call.name === 'take_message') {
        const ok = await takeMessage(db, actx, args, call.input || {})
        tookMessage = tookMessage || ok
        results.push({ type: 'tool_result', id: call.id, content: ok ? 'Message saved; the team will call back.' : 'Could not save the message.', ...(ok ? {} : { isError: true }) })
        continue
      }
      const action = getAction(call.name)
      if (!action || !LOOKUPS.includes(call.name)) { results.push({ type: 'tool_result', id: call.id, content: 'Unknown tool.', isError: true }); continue }
      const { reason: _reason, ...input } = call.input || {}
      const bad = validateInput(action, input)
      if (bad) { results.push({ type: 'tool_result', id: call.id, content: bad, isError: true }); continue }
      try {
        const out = await action.run(actx, input)
        results.push({ type: 'tool_result', id: call.id, content: JSON.stringify(out.ok ? (out.data ?? {}) : { error: out.error }).slice(0, 6000), ...(out.ok ? {} : { isError: true }) })
      } catch (e: any) {
        results.push({ type: 'tool_result', id: call.id, content: `Lookup failed: ${e?.message || e}`, isError: true })
      }
    }
    if (goodbye) return result(true, goodbye)
    messages.push({ role: 'user', content: results })
  }
  // Out of time or rounds: never leave the caller hanging.
  return result(false, 'Sorry, I’m having trouble checking that right now. Can I take a message so someone calls you back?')
}

async function takeMessage(db: any, actx: ActionContext, args: { companyId: string; conversationId: string | null; from: string; callerName: string | null }, input: any): Promise<boolean> {
  const name = String(input.name || args.callerName || '').trim().slice(0, 80) || 'A caller'
  const about = String(input.about || '').trim().slice(0, 1000)
  const back = String(input.callback_number || '').trim() || args.from
  // The same task the chat agents create (linked to the conversation and its
  // outlet), so it lands in Tasks and on the conversation.
  const createTask = getAction('create_task')
  if (!createTask) return false
  try {
    const out = await createTask.run(actx, {
      title: `Call back ${name} (${back})`,
      details: `${about || 'Asked for a call back.'}\n\nTaken by the AI phone agent.`,
      priority: input.urgent ? 'high' : 'normal',
    })
    if (!out.ok) return false
  } catch { return false }
  try { await notifyCompany({ db, companyId: args.companyId, type: 'call', message: `Call-back requested by ${name}: ${about.slice(0, 120)}`, actorName: name, conversationId: args.conversationId || undefined }) } catch {}
  if (args.conversationId) {
    try { await pushInboundMessage({ companyId: args.companyId, conversationId: args.conversationId, title: 'Call-back requested', body: `${name}: ${about.slice(0, 120)}`, route: `/conversation/${args.conversationId}` }) } catch {}
  }
  return true
}

/** The call so far, as the thread shows it. */
export function transcriptText(state: PhoneCallState): string {
  const lines = [`AI: ${state.greeting}`, ...state.turns.map(t => `${t.who === 'caller' ? 'Caller' : 'AI'}: ${t.text}`)]
  const agentMs = state.turns.filter(t => t.who === 'agent' && t.ms).map(t => t.ms as number)
  const avg = agentMs.length ? (agentMs.reduce((a, b) => a + b, 0) / agentMs.length / 1000).toFixed(1) : null
  return `📞 Answered by the AI phone agent (test${state.realtime ? ', real-time' : ''})${avg ? ` · replies started after ${avg}s on average` : ''}\n\n${lines.join('\n')}`
}

/**
 * Save the call as it stands: the state on the call row, and the transcript as
 * one internal note in the caller's conversation (created the first time,
 * updated after). Called after every turn, so a caller hanging up mid-call
 * still leaves the full record.
 */
export async function saveCallState(db: any, call: { id: string; company_id: string; conversation_id: string | null; answered_at: string | null; routing_state: any }, state: PhoneCallState, end: boolean) {
  const now = new Date()
  const dur = call.answered_at ? Math.max(1, Math.round((now.getTime() - new Date(call.answered_at).getTime()) / 1000)) : null
  if (call.conversation_id) {
    try {
      const content = transcriptText(state)
      if (state.transcriptMessageId) {
        await db.from('messages').update({ content }).eq('id', state.transcriptMessageId)
      } else {
        const { data: m } = await db.from('messages').insert({
          conversation_id: call.conversation_id, company_id: call.company_id, sender_type: 'agent', sender_name: 'AI phone agent',
          content, is_internal: true, metadata: { phone_agent: true, call_id: call.id },
        }).select('id').maybeSingle()
        state.transcriptMessageId = m?.id || null
      }
      await db.from('conversations').update({ last_message: '📞 Answered by the AI phone agent', last_message_at: now.toISOString() }).eq('id', call.conversation_id)
    } catch (e: any) { console.error('[phone agent] transcript save failed', e?.message || e) }
  }
  if (end) state.ended = true
  const routing_state = { ...(call.routing_state || {}), phone_agent: state }
  call.routing_state = routing_state
  await db.from('calls').update({
    routing_state, ended_at: now.toISOString(), ...(dur ? { duration_seconds: dur } : {}),
    ...(state.messageTaken ? { ai_todos: ['Call the customer back (message taken by the AI phone agent)'] } : {}),
  }).eq('id', call.id)
}

// ── Twilio TwiML ─────────────────────────────────────────────────────────────

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/** Say something, then listen for the caller's answer (they can talk over it, or press 0 for voicemail). */
export function phoneListenTwiml(actionUrl: string, voice: string, say: string): string {
  return `<Response>` +
    `<Gather input="speech dtmf" numDigits="1" action="${esc(actionUrl)}" method="POST" language="en-AU" speechModel="phone_call" speechTimeout="auto" timeout="6" actionOnEmptyResult="true">` +
      `<Say voice="${esc(voice)}" language="en-AU">${esc(say)}</Say>` +
    `</Gather>` +
  `</Response>`
}

/** Say goodbye and hang up. */
export function phoneGoodbyeTwiml(voice: string, say: string): string {
  return `<Response><Say voice="${esc(voice)}" language="en-AU">${esc(say)}</Say><Hangup/></Response>`
}

/** Hand the caller to voicemail (the business's normal greeting and recording). */
export function phoneVoicemailTwiml(voice: string, greeting: string, recordingCallback: string): string {
  return `<Response>` +
    `<Say voice="${esc(voice)}" language="en-AU">${esc(greeting)}</Say>` +
    `<Record maxLength="180" playBeep="true" trim="trim-silence" recordingStatusCallback="${esc(recordingCallback)}" recordingStatusCallbackEvent="completed"/>` +
    `<Hangup/>` +
  `</Response>`
}

// ── Real-time calls (Twilio ConversationRelay) ───────────────────────────────
//
// Twilio turns speech into text and reads text aloud in real time, over a
// WebSocket to a small always-on relay server (voice-server/, hosted outside
// Vercel, which can't hold WebSockets). The relay forwards each thing the
// caller says to /api/phone-agent/relay and streams the reply back word by
// word, so the caller hears the first words while the rest is still being
// written. Turned on by VOICE_RELAY_URL + VOICE_RELAY_SECRET; without them
// calls use the turn-by-turn mode above.


export function relayConfigured(): boolean {
  return !!(process.env.VOICE_RELAY_URL && process.env.VOICE_RELAY_SECRET)
}

/** A short-lived pass for one call, checked by the relay before it talks to anyone. */
export function relaySignature(callRowId: string, companyId: string, exp: number, secret = process.env.VOICE_RELAY_SECRET || ''): string {
  return createHmac('sha256', secret).update(`${callRowId}.${companyId}.${exp}`).digest('hex')
}

/** The relay's calls into Colvy carry the shared secret. */
export function relaySecretOk(given: string | null | undefined): boolean {
  const want = process.env.VOICE_RELAY_SECRET || ''
  const a = Buffer.from(String(given || '')), b = Buffer.from(want)
  return !!want && a.length === b.length && timingSafeEqual(a, b)
}

// Our voice choices, as ConversationRelay names them.
export function relayVoice(voice: string): { provider: 'Amazon' | 'Google'; voice: string } {
  if (voice.startsWith('Google.')) return { provider: 'Google', voice: voice.slice('Google.'.length) }
  return { provider: 'Amazon', voice: voice.replace(/^Polly\./, '') }
}

export function phoneRelayTwiml(p: { relayUrl: string; doneUrl: string; voice: string; greeting: string; callRowId: string; companyId: string; hints?: string }): string {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const v = relayVoice(p.voice)
  const param = (name: string, value: string) => `<Parameter name="${esc(name)}" value="${esc(value)}"/>`
  return `<Response>` +
    `<Connect action="${esc(p.doneUrl)}">` +
      `<ConversationRelay url="${esc(p.relayUrl)}" welcomeGreeting="${esc(p.greeting)}" welcomeGreetingInterruptible="any" ` +
        `language="en-AU" ttsProvider="${v.provider}" voice="${esc(v.voice)}" transcriptionProvider="Google" speechModel="telephony" ` +
        `interruptible="any" dtmfDetection="true"${p.hints ? ` hints="${esc(p.hints)}"` : ''}>` +
        param('callRowId', p.callRowId) + param('companyId', p.companyId) + param('exp', String(exp)) +
        param('sig', relaySignature(p.callRowId, p.companyId, exp)) +
      `</ConversationRelay>` +
    `</Connect>` +
  `</Response>`
}
