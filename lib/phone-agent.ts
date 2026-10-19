// The AI phone agent (the AI receptionist).
//
// Twilio turns the caller's speech into text (<Gather input="speech">) and
// reads our replies aloud (<Say>); each turn of the conversation is one webhook
// (app/api/twilio/voice/agent). Colvy decides every reply with the same
// lookups the chat agents use: opening hours, the caller's orders, stock,
// bookings and the business's own knowledge. Anything it can't do becomes a
// call-back task.
//
// It always answers the business's test numbers straight away. Beyond that the
// owner picks when it answers (out of hours, when nobody picks up, or always —
// see lib/phone-receptionist.ts); until they do, every other caller is handled
// exactly as before. Twilio numbers only.

import { getModelClient, type NeutralBlock, type NeutralMessage, type ToolSpec } from '@/lib/agent/model'
import { getAction, validateInput } from '@/lib/agent/actions'
import { toolSpec } from '@/lib/agent/engine'
import { buildContext } from '@/lib/agent/memory'
import { localNow, prettyDate, prettyTime, loadBusinessHours, hoursOutlook, type BusinessHours } from '@/lib/business-hours'
import { notifyCompany, pushInboundMessage } from '@/lib/notify'
import type { ActionContext, ActionDef } from '@/lib/agent/types'
import { createHmac, timingSafeEqual } from 'crypto'
import { after } from 'next/server'
import { resolveAutomatedSmsSender, textOptOut } from '@/lib/sms-consent'
import { internalHeaders } from '@/lib/internal-call'
import { isStaffMember } from '@/lib/company-access'
import { getPhoneCatalog, closestProducts, phoneHints, type PhoneCatalog } from '@/lib/phone-catalog'
import { alertCall } from '@/lib/call-alerts'
import { setCallPreview } from '@/lib/call-card'
import { queueMissedCallText } from '@/lib/missed-call-text'
import { googleTokenUsable } from '@/lib/google-business'
import { platformTwilio, numberStatusCallbackUrl } from '@/lib/twilio-platform'
import { emitCallEvent } from '@/lib/integration-hooks'
import {
  cleanReceptionist, receptionistLimits, defaultCallSetup, phoneToolNames, callGreeting, greetingSaysAi, phoneTail,
  PHONE_LOOKUPS, type ReceptionistSettings, type PhoneCallSetup, type AnswerReason,
} from '@/lib/phone-receptionist'

// ── Settings (an agent_policies row: role "phone", action "answer_calls") ────

export type PhoneAgentSettings = { enabled: boolean; testNumbers: string[]; voice: string; stt: PhoneStt } & ReceptionistSettings

// How real-time calls hear the caller. Deepgram is told the business's product
// names; Flux also decides faster when the caller has finished speaking.
export type PhoneStt = 'deepgram-flux' | 'deepgram-nova3' | 'google'
export const PHONE_STT: { id: PhoneStt; label: string }[] = [
  { id: 'deepgram-flux', label: 'Deepgram Flux: fastest turn-taking, knows your product names' },
  { id: 'deepgram-nova3', label: 'Deepgram Nova-3: Australian English, knows your product names' },
  { id: 'google', label: 'Google (the original setting)' },
]

// Generative voices first: they sound like a person. The older ones stay so a
// saved choice keeps working.
export const PHONE_VOICES: { id: string; label: string }[] = [
  { id: 'Google.en-AU-Chirp3-HD-Aoede', label: 'Aoede — Australian, female (natural)' },
  { id: 'Google.en-AU-Chirp3-HD-Kore', label: 'Kore — Australian, female (natural)' },
  { id: 'Google.en-AU-Chirp3-HD-Charon', label: 'Charon — Australian, male (natural)' },
  { id: 'Google.en-AU-Chirp3-HD-Puck', label: 'Puck — Australian, male (natural)' },
  { id: 'Polly.Olivia-Generative', label: 'Olivia — Australian, female (natural)' },
  { id: 'ElevenLabs.9Ft9sm9dzvprPILZmLJl', label: 'ElevenLabs Australian voice (real-time calls)' },
  { id: 'Polly.Olivia-Neural', label: 'Olivia — Australian, female (older, more robotic)' },
  { id: 'Google.en-AU-Neural2-C', label: 'Australian, female (older Google)' },
  { id: 'Google.en-AU-Neural2-B', label: 'Australian, male (older Google)' },
]
const DEFAULT_VOICE = PHONE_VOICES[0].id
export const MAX_TEST_NUMBERS = 5

const tail = phoneTail

export function cleanPhoneAgent(raw: any): PhoneAgentSettings {
  const nums = (Array.isArray(raw?.testNumbers) ? raw.testNumbers : Array.isArray(raw?.test_numbers) ? raw.test_numbers : [])
    .map((n: any) => String(n || '').trim()).filter((n: string) => tail(n).length >= 8)
  const voice = PHONE_VOICES.some(v => v.id === raw?.voice) ? raw.voice : DEFAULT_VOICE
  const stt: PhoneStt = PHONE_STT.some(o => o.id === raw?.stt) ? raw.stt : 'deepgram-flux'
  return { enabled: !!raw?.enabled, testNumbers: Array.from(new Set<string>(nums)).slice(0, MAX_TEST_NUMBERS), voice, stt, ...cleanReceptionist(raw) }
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
  const row = { autonomy: s.enabled ? 'act_within_limits' : 'off', limits: { ...receptionistLimits(s), test_numbers: s.testNumbers, voice: s.voice, stt: s.stt }, updated_by: userId, updated_at: new Date().toISOString() }
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

// The service-role Supabase client the call routes pass in (the same loose type the agent's context builder takes).
type Db = Parameters<typeof buildContext>[0]

/** What a call answered for `reason` keeps for its whole length. */
export function callSetupFor(s: PhoneAgentSettings, reason: AnswerReason, bookable: boolean): PhoneCallSetup {
  return { reason, skills: { ...s.skills }, neverDiscuss: [...s.neverDiscuss], tasks: { ...s.tasks }, bookable: !!(s.skills.booking && bookable) }
}

/** Can callers book something? (Online booking on, and at least one active service.) */
export async function phoneBookable(db: Db, companyId: string): Promise<boolean> {
  try {
    const [{ data: co }, { data: svc }] = await Promise.all([
      db.from('companies').select('booking_settings').eq('id', companyId).maybeSingle(),
      db.from('booking_services').select('id').eq('company_id', companyId).eq('active', true).limit(1),
    ])
    return co?.booking_settings?.enabled !== false && !!svc?.length
  } catch { return false }
}

/** Closed right now, by the opening hours? Every store must be known closed; any open, or unknown, is not closed. */
export function closedFromHours(h: BusinessHours, at?: Date): boolean | null {
  const places = hoursOutlook(h, { at, days: 1 }).places
  if (!places.length) return null
  if (places.some(p => p.openNow === true)) return false
  return places.every(p => p.openNow === false) ? true : null
}

// Google's hours as last read, kept on an agent_policies row (role "phone",
// action "hours", like the product names), so deciding "closed now" as a call
// comes in doesn't wait on Google while the caller hears ringing, and a slow or
// failing Google doesn't make a closed business look open. Hours saved in
// Colvy are read straight from the database, so they aren't copied.
const HOURS_ACTION = 'hours'
const HOURS_REFRESH_MS = 15 * 60_000     // older: read Google again once the call is decided
const HOURS_TRUST_MS = 24 * 3600_000     // older: ask Google first, as when there's no copy
// Older: no longer stands in for a Google that can't be read. The copy goes and
// the hours saved in Colvy decide, as before there was a copy. A connection
// that is broken for good (a revoked token) looks just like a passing failure,
// so this is what stops an old "closed" from deciding every call until the
// owner reconnects Google.
const HOURS_STANDIN_MS = 3 * 24 * 3600_000

async function savedGoogleHours(db: Db, companyId: string): Promise<{ hours: BusinessHours; at: number } | null> {
  try {
    const { data } = await db.from('agent_policies').select('limits')
      .eq('company_id', companyId).eq('role_key', 'phone').eq('action_key', HOURS_ACTION).limit(1)
    const l = data?.[0]?.limits
    const at = Date.parse(l?.at || '')
    return Array.isArray(l?.hours?.places) && l.hours.places.length && at ? { hours: l.hours, at } : null
  } catch { return null }
}

/**
 * Google gave no hours: is that because it's connected but can't be read right
 * now (its token just failed to refresh, or the connection itself can't be
 * read)? Those look just like "not connected" from the hours alone. Told from
 * the connection's row as the hours read left it, so Google isn't asked for a
 * token a second time while the caller hears ringing: a token that worked, or
 * was just refreshed, is still usable there. One in its last minute is not
 * (the hours read tried to refresh it), the same test the read made. Without
 * a refresh token, or without the app's Google keys, a token never refreshes:
 * Google is gone, not down.
 */
async function googleDown(db: Db, companyId: string): Promise<boolean> {
  try {
    const { data, error } = await db.from('google_business_accounts').select('access_token, refresh_token, token_expires_at')
      .eq('company_id', companyId).eq('is_active', true).limit(1)
    if (error) return true
    const acc = data?.[0]
    if (!acc) return false                                      // not connected
    if (googleTokenUsable(acc)) return false                    // connected and working: it really has no hours
    return !!acc.refresh_token && !!(process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) && !!process.env.GOOGLE_CLIENT_SECRET
  } catch { return true }
}

/** Can a copy of Google's hours read at `copyAt` still stand in for a Google that can't be read? */
const copyStandsIn = (copyAt: number) => Date.now() - copyAt < HOURS_STANDIN_MS

/**
 * The hours as they are now (Google first). Google's are kept for next time.
 * A business whose hours no longer come from Google loses its copy (read at
 * `copyAt`), but not while Google is connected and just can't be read and the
 * copy is recent enough to stand in: then the hours come back marked
 * googleUnreachable, so the copy decides.
 */
async function readHoursNow(db: Db, companyId: string, copyAt: number | null): Promise<BusinessHours | null> {
  try {
    const hours = await loadBusinessHours(db, companyId)
    if (hours.places.some(p => p.source === 'google')) {
      const at = new Date().toISOString()
      const row = { autonomy: 'off', limits: { hours, at }, updated_at: at }
      const { data: existing } = await db.from('agent_policies').select('id')
        .eq('company_id', companyId).eq('role_key', 'phone').eq('action_key', HOURS_ACTION).limit(1)
      if (existing?.[0]) await db.from('agent_policies').update(row).eq('id', existing[0].id)
      else await db.from('agent_policies').insert({ company_id: companyId, role_key: 'phone', action_key: HOURS_ACTION, ...row })
    } else if (copyAt !== null) {
      if (copyStandsIn(copyAt) && (hours.googleUnreachable || await googleDown(db, companyId))) return { ...hours, googleUnreachable: true }
      await db.from('agent_policies').delete().eq('company_id', companyId).eq('role_key', 'phone').eq('action_key', HOURS_ACTION)
    }
    return hours
  } catch (e) {
    console.error('[phone agent] opening hours read failed', e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * Is the business closed right now? From the copy of Google's hours (with
 * holiday and special hours) when there's a recent one, so nobody waits on
 * Google; the copy is then refreshed after the call is decided. Without one,
 * Google's hours if they come back quickly, else the last copy if it's still
 * recent enough to stand in, else the hours saved in Colvy. null when it can't
 * tell (no hours anywhere): the call is then handled as if open.
 */
export async function businessClosedNow(db: Db, companyId: string, opts: { googleWaitMs?: number } = {}): Promise<boolean | null> {
  try {
    const saved = await savedGoogleHours(db, companyId)
    const age = saved ? Date.now() - saved.at : Infinity
    if (saved && age < HOURS_TRUST_MS) {
      if (age > HOURS_REFRESH_MS) inBackground(() => readHoursNow(db, companyId, saved.at))
      return closedFromHours(saved.hours)
    }
    const now = readHoursNow(db, companyId, saved ? saved.at : null)
    inBackground(() => now)   // still saved when Google answers after the caller stopped waiting
    let timer: ReturnType<typeof setTimeout> | undefined
    const late = new Promise<null>(r => { timer = setTimeout(() => r(null), opts.googleWaitMs ?? 2500) })
    const h = await Promise.race([now, late])
    if (timer) clearTimeout(timer)
    if (h && !h.googleUnreachable) return closedFromHours(h)
    const standIn = saved && copyStandsIn(saved.at) ? saved.hours : null
    return closedFromHours(standIn || h || await loadBusinessHours(db, companyId, { google: false }))
  } catch { return null }
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
  callerSpoke?: boolean    // the caller has said something (noted as their first words come in, before the reply is saved)
  ended?: boolean
  realtime?: boolean       // answered through the real-time relay (ConversationRelay)
  transcriptMessageId?: string | null
  companyName?: string
  contextReady?: boolean   // contextText/timezone/verified/facts loaded (real-time calls load them while the greeting plays)
  facts?: { tool: string; asked?: string; text: string }[]   // lookups already done this call, so they aren't repeated
  messageAbout?: string    // what the message taken this call was about
  knownProducts?: string[] // some of what the business sells, to work out misheard names
  textsSent?: number       // texts sent to the caller this call (capped)
  bookingLinks?: number    // of those, booking links (the Command Centre counts them)
  setup?: PhoneCallSetup   // why the AI answered, its skills and rules (missing on older calls: the test-stage defaults)
}

/** This call's setup, or the test-stage defaults for a call that started before setups existed. */
export function setupOf(state: PhoneCallState): PhoneCallSetup {
  const d = defaultCallSetup()
  const s = state.setup
  return s ? { ...d, ...s, skills: { ...d.skills, ...(s.skills || {}) }, tasks: { ...d.tasks, ...(s.tasks || {}) }, neverDiscuss: s.neverDiscuss || [] } : d
}

/** The call's state before anything is looked up: enough to answer straight away. */
export function newPhoneCall(companyName: string, catalog?: PhoneCatalog | null, opts: { setup?: PhoneCallSetup; greeting?: string } = {}): PhoneCallState {
  const setup = opts.setup || defaultCallSetup()
  return {
    greeting: callGreeting(companyName, opts.greeting || '', setup),
    contextText: '', timezone: 'Australia/Melbourne', verified: false, turns: [], silences: 0,
    companyName, contextReady: false, facts: [],
    knownProducts: (catalog?.names || []).slice(0, 60),
    setup,
  }
}

/**
 * Load what the agent knows for this call (business + customer facts, whether
 * the caller's number matches their record, and this week's opening hours, the
 * question most callers ask). Fills `state` in place; does nothing if already
 * loaded.
 */
export async function loadPhoneContext(db: any, state: PhoneCallState, args: { companyId: string; conversationId: string | null; contactId: string | null; from: string }): Promise<void> {
  if (state.contextReady) return
  const skills = setupOf(state).skills
  // The week's hours are only looked up ahead when the AI may talk about them.
  const hours = skills.hours ? getAction('get_business_hours') : null
  const [ctx, contact, hoursOut] = await Promise.all([
    buildContext(db, args.companyId, { conversationId: args.conversationId, contactId: args.contactId }).catch(() => null),
    args.contactId
      ? db.from('contacts').select('phone').eq('id', args.contactId).maybeSingle().then((r: any) => r.data, () => null)
      : Promise.resolve(null),
    hours ? hours.run({ db, companyId: args.companyId } as any, {}).catch(() => null) : Promise.resolve(null),
  ])
  if (ctx) {
    // Business Memory (must-know facts, rules, FAQs, tone) comes in with the
    // business text. With the hours skill off, the saved hours are left out.
    const businessText = skills.hours ? ctx.businessText : ctx.businessText.split('\n\n').filter(p => !/^Opening hours/.test(p)).join('\n\n')
    state.contextText = [businessText, ctx.customerText, ctx.toneText ? `How the business likes to sound: ${ctx.toneText}` : ''].filter(Boolean).join('\n\n')
    state.timezone = ctx.timezone || state.timezone
  }
  state.verified = tail(contact?.phone).length >= 8 && tail(contact?.phone) === tail(args.from)
  state.facts = state.facts || []
  if (hoursOut?.ok && !state.facts.some(f => f.tool === 'get_business_hours')) {
    state.facts.unshift({ tool: 'get_business_hours', text: JSON.stringify(hoursOut.data ?? {}).slice(0, 2500) })
  }
  state.contextReady = true
}

/** Turn-by-turn calls: everything up front. */
export async function startPhoneCall(db: any, args: { companyId: string; companyName: string; conversationId: string | null; contactId: string | null; from: string; setup?: PhoneCallSetup; greeting?: string; catalog?: PhoneCatalog | null }): Promise<PhoneCallState> {
  const catalog = args.catalog !== undefined ? args.catalog : await getPhoneCatalog(db, args.companyId)
  const state = newPhoneCall(args.companyName, catalog, { setup: args.setup, greeting: args.greeting })
  await loadPhoneContext(db, state, args)
  return state
}

// ── A turn ───────────────────────────────────────────────────────────────────

// Every lookup the phone agent can be given; which ones a call gets depends on
// its skills (phoneToolNames).
const LOOKUPS = PHONE_LOOKUPS

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
// Texts go only to the number the caller is ringing from, a few per call.
const MAX_TEXTS = 3
const TEXT_CALLER = {
  name: 'text_caller',
  description: 'Text the caller something they’ll want written down: an address, email address, website, order number or similar. It goes to the number they’re calling from.',
  input_schema: {
    type: 'object', additionalProperties: false, required: ['message'],
    properties: { message: { type: 'string', description: 'The whole text message, short and complete (under 400 characters). Plain words; links and addresses in full.' } },
  },
}
const TEXT_UPLOAD_LINK = {
  name: 'text_upload_link',
  description: 'Text the caller a private link to upload photos and videos, which land in their conversation for the team. Use when they want to show something (a sick fish, their setup, a damaged item) or offer to send pictures.',
  input_schema: {
    type: 'object', additionalProperties: false, required: ['what'],
    properties: {
      what: { type: 'string', description: 'What to upload, in one line, e.g. “Photos or a short video of the fish”.' },
      photos_only: { type: 'boolean' },
    },
  },
}

// Booking over the phone: the AI finds a free time with the caller, then texts
// a link to that service (their details filled in) so they confirm and pay
// themselves. It never makes a booking on its own.
const TEXT_BOOKING_LINK = {
  name: 'text_booking_link',
  description: 'Text the caller a link to book online, straight to one service when you know which. Their details are filled in; they pick the time and confirm (and pay, if needed) there. It goes to the number they’re calling from.',
  input_schema: {
    type: 'object', additionalProperties: false, properties: {
      service: { type: 'string', description: 'The service name from list_services, if you know it.' },
    },
  },
}
// The caller's own bookings, matched to their customer record or the number
// they're calling from — never to an email or number they say, which anyone
// could give.
const FIND_MY_BOOKINGS = {
  name: 'find_my_bookings',
  description: 'The caller’s own upcoming bookings (matched to their customer record or the number they’re calling from), and whether they can still move or cancel them.',
  input_schema: {
    type: 'object', additionalProperties: false, required: ['reason'],
    properties: { reason: { type: 'string', description: 'Why you are doing this, in one short sentence. Shown to the business owner.' } },
  },
}

const END_CALL = {
  name: 'end_call',
  description: 'End the call once the caller has what they need or says goodbye. The goodbye you give here is read to them, then the call ends, so don’t also write it as text.',
  input_schema: { type: 'object', additionalProperties: false, required: ['goodbye'], properties: { goodbye: { type: 'string', description: 'One short spoken sentence.' } } },
}

// The prompt in two parts. The stable part (who we are, how to talk, what the
// business sells) is the same every turn of a call, so the model provider can
// reuse it (prompt caching) and only the short live part (the time, what's
// been looked up) is new each turn. A prompt that changes every turn is never
// reused, and every turn pays to read it all again.
/** "a, b and c" */
const listAnd = (items: string[]) => items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

// The skills the owner switched on decide which lines the AI gets: with the
// standard settings (every skill but booking) the prompt is the same as before
// the AI receptionist settings existed.
function systemPrompt(state: PhoneCallState, p: { companyName: string; from: string; callerName: string | null; timezone: string }): { stable: string; live: string } {
  const now = localNow(p.timezone)
  const facts = state.facts || []
  const lateNight = Number(now.time.slice(0, 2)) < 5
  const setup = setupOf(state)
  const sk = setup.skills
  const booking = sk.booking && setup.bookable
  const why = setup.reason === 'after_hours' ? 'answering a call while the business is closed.'
    : setup.reason === 'always' ? 'answering the business’s calls.'
      : 'answering a call because the team couldn\'t get to the phone.'
  // What to do when the AI can't answer.
  const fallback = sk.message ? 'offer to take a message' : 'say so plainly and suggest they call back during opening hours'
  const factsFrom = [
    sk.hours && 'opening hours', sk.orders && 'the caller’s orders', sk.stock && 'stock', booking && 'services and free times',
    sk.knowledge && 'the business’s own knowledge (delivery, returns, care advice and other policies are in ask_knowledge)',
  ].filter(Boolean) as string[]
  const cannot = [!sk.hours && 'opening hours', !sk.orders && 'orders', !sk.stock && 'stock or prices'].filter(Boolean) as string[]
  const stable = [
    `You are the AI phone assistant for ${p.companyName}, ${why}`,
    `The caller${p.callerName ? ` is ${p.callerName} and` : ''} is calling from ${p.from}. ${state.verified ? 'That number matches their customer record, so you may discuss orders linked to it.' : 'Their number isn’t linked to a customer record we can trust.'}`,
    '',
    'How to talk:',
    '- This is a phone call. Reply in one to three short spoken sentences. No lists, markdown, links, emojis or abbreviations. Say order numbers digit by digit and prices in words a person would say.',
    greetingSaysAi(state.greeting)
      ? '- You already said you are an AI assistant in the greeting; only repeat it if asked.'
      : '- You are an AI assistant. If the caller asks, or seems to think they’re talking to a person, tell them plainly.',
    '- When you need a lookup, start your reply with a few words such as “One moment, let me check.” before the tool. Don’t say that when you can answer from what you already know.',
    sk.message && '- When you take a message, say a short acknowledgement in the same reply, before the tool (“Sure, I’ll pass that on.”). The caller is then told the team will call back and asked if there’s anything else, so don’t add that yourself.',
    '- Never repeat something you have already told the caller unless they ask again. Answer only what they just asked.',
    '- What the caller says reaches you through speech recognition, which mishears words, especially product names (a name can arrive as ordinary words that only sound like it). Work out what they most likely meant for a business like this one, using the product names below, and look that up. If you’re fairly sure what they meant, just answer using the right name. Only if you’re genuinely unsure, ask in a few words (“Did you mean …?”) and wait for their answer; never ask and answer in the same breath.',
    sk.stock && '- Callers often give sizes in feet or inches, while products are usually listed in centimetres or litres. Convert before searching or comparing (1 foot is about 30 cm, so a 4-foot tank is about 120 cm) and look for that size.',
    `- ${factsFrom.length ? `Use your tools for every fact: ${listAnd(factsFrom)}. ` : ''}Never guess or invent prices, stock, dates, delivery times or policies. If the tools don’t give you the answer, ${fallback}.`,
    cannot.length ? `- You can’t help with ${listAnd(cannot)} on this call. If the caller asks, ${fallback}.` : false,
    sk.stock && '- If what they asked for isn’t in stock or isn’t sold, say so plainly. Only suggest something else if it’s a close match (the same kind of thing), and at most one or two.',
    sk.stock && '- If the caller asks about one store or suburb, pass it to check_stock as store. When check_stock lists stock for each store, answer for the store they asked about, or else the store they rang (conversationStore), and say where else it is, like “We have three at Richmond and none at Fitzroy.” When it lists no stores, give the overall stock and don’t say which store has it.',
    sk.hours && '- Opening hours for the next week are already looked up below; answer hours questions straight from them. Only use get_business_hours for a date more than a week away.',
    sk.orders && `- Orders: ${state.verified ? 'you may look up orders linked to this caller. ' : ''}For any other order, ask for the order number and the email address or postcode on it before sharing anything.`,
    ...(booking ? [
      '- Bookings: if you’re not sure which service they mean, use list_services. Use check_availability and offer two or three free times in spoken words (“Saturday at ten”, “Tuesday at two thirty”). You can’t make the booking yourself: offer to text them a link with text_booking_link, where they pick the time and confirm (and pay, if the service needs it). Prices, deposits and how long things take only from list_services.',
      `- Their own bookings: use find_my_bookings. ${sk.message ? 'To move or cancel one, take a message with the booking details so the team can sort it out.' : 'To move or cancel one, they can use the link in their booking confirmation.'}`,
    ] : []),
    sk.message
      ? '- You can’t place orders, hold stock or take payment. If the caller wants to buy something, confirm exactly what (product, size, price, how many) and use take_message so the team can call back to arrange it.'
      : '- You can’t place orders, hold stock or take payment. If the caller wants to buy something, suggest they order online or call back during opening hours.',
    sk.message
      ? '- If the caller wants a person, a refund, a return, to complain, or anything you can’t do: use take_message (their name and what it’s about) and tell them the team will call them back.'
      : '- If the caller wants a person, a refund, a return, to complain, or anything you can’t do: say the team can’t take their call right now and suggest they call back during opening hours.',
    sk.message
      ? '- After taking a message, ask if there’s anything else. When they have what they need and are done, use end_call.'
      : '- When they have what they need and are done, use end_call.',
    sk.texts && '- You can text the caller (only the number they’re calling from): text_upload_link when they want to show you something in photos or video, and text_caller for anything worth having in writing, like an address, email address, website or order number. Offer it when it helps; spell things out only if they’d rather not get a text.',
    '- Never ask for or accept card numbers, passwords or one-time codes.',
    // The owner's "never discuss" list.
    ...(setup.neverDiscuss.length ? [
      '',
      'Never discuss these, even if the caller asks directly. Politely say it’s not something you can help with on the phone and move on, without explaining why or guessing:',
      ...setup.neverDiscuss.map(l => `- ${l}`),
    ] : []),
    '',
    state.contextText,
    ...(state.knownProducts?.length ? ['', `Some of what ${p.companyName || 'the business'} sells (for working out misheard names; ${sk.stock ? 'check stock before saying anything about it' : 'you can’t check stock or prices on this call'}): ${state.knownProducts.join(', ')}.`] : []),
  ].filter(s => s !== undefined && s !== false).join('\n')
  const live = [
    `It is now ${prettyTime(now.time)}, ${prettyDate(now.date)} (${p.timezone}).`,
    ...(state.messageTaken ? [`You have already taken a message on this call${state.messageAbout ? ` (about: ${state.messageAbout})` : ''}. Don’t take it again; only use take_message for something new.`] : []),
    ...(lateNight ? [`It’s after midnight, so a caller who says “tomorrow” may mean later today (${prettyDate(now.date)}). If it matters, check which day they mean.`] : []),
    ...(facts.length ? ['', 'Already looked up on this call (current; use these instead of looking them up again):', ...facts.map(f => `- ${f.tool}: ${f.text}`)] : []),
  ].join('\n')
  return { stable, live }
}

/** A lookup's result cut to what the AI needs to answer: smaller prompts, faster replies. */
export function compactLookup(tool: string, data: any): any {
  if (tool === 'check_stock' && Array.isArray(data?.products)) {
    return {
      ...(data.heard ? { heard: data.heard, closestMatches: data.closestMatches, note: data.note } : {}),
      products: data.products.slice(0, 8).map((p: any) => ({
        name: p.name, price: p.price, stockStatus: p.stockStatus, stockQty: p.stockQty ?? null,
        // Stock at each store, where the business has set it up (lib/outlet-stock).
        ...(p.stores ? { stores: p.stores } : {}),
        ...(Array.isArray(p.options) && p.options.some((o: any) => o?.stores) ? { options: p.options.slice(0, 8).map((o: any) => ({ option: o.option, stockStatus: o.stockStatus, ...(o.stores ? { stores: o.stores } : {}) })) } : {}),
      })),
      ...(data.storeStock ? { storeStock: data.storeStock } : {}),
    }
  }
  // Free times are spoken, never booked from here: the exact start times aren't needed.
  if (tool === 'check_availability' && data && typeof data === 'object') {
    const rest = { ...data }
    delete rest.slotIds
    return rest
  }
  // Links can't be read out; a change to a booking becomes a message for the team.
  if (tool === 'find_my_bookings' && Array.isArray(data?.bookings)) {
    const rest = { ...data }
    delete rest.guidance
    rest.bookings = data.bookings.map((b: Record<string, unknown>) => { const c = { ...b }; delete c.manageLink; delete c.bookingId; return c })
    return rest
  }
  return data
}

// ms: how long until the caller heard the first words of the reply.
export type TurnResult = { say: string; end: boolean; tookMessage: boolean; ms: number; tools: string[] }

/** The tools a call with these skills gets (lookups first, then the phone's own). */
export function phoneToolSpecs(setup: PhoneCallSetup): { allowed: string[]; tools: ToolSpec[] } {
  const allowed = phoneToolNames(setup)
  const lookups = allowed.filter(k => LOOKUPS.includes(k))
  const actions = lookups.map(k => getAction(k)).filter(Boolean) as ActionDef[]
  const own: Record<string, ToolSpec> = { take_message: TAKE_MESSAGE, text_caller: TEXT_CALLER, text_upload_link: TEXT_UPLOAD_LINK, text_booking_link: TEXT_BOOKING_LINK, end_call: END_CALL }
  return { allowed, tools: [...actions.map(a => a.key === 'find_my_bookings' ? FIND_MY_BOOKINGS : toolSpec(a)), ...allowed.filter(k => own[k]).map(k => own[k])] }
}

/**
 * Work out the agent's reply to what the caller just said. Runs the lookups
 * the model asks for (a few rounds at most) inside `deadlineMs`, so Twilio —
 * which waits about 15 seconds for an answer — never gives up on us.
 */
export async function phoneTurn(db: any, args: {
  companyId: string; companyName: string; siteOrigin: string; conversationId: string | null; contactId: string | null
  from: string; callerName: string | null; state: PhoneCallState; said: string; deadlineMs?: number
  /** The business number the caller rang: its store answers stock questions first. */
  to?: string | null
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
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const result = (end: boolean, extra?: string): TurnResult => {
    // A goodbye the model already wrote as text isn't said twice.
    if (extra && !norm(spoken.join(' ')).includes(norm(extra))) {
      if (args.onText && spoken.length) args.onText(' ')
      speak(extra); spoken.push(extra)
    }
    const say = spoken.map(t => t.trim()).filter(Boolean).join(' ') || 'Sorry, could you say that again?'
    if (!firstAt) speak(say)
    return { say, end, tookMessage, ms: (firstAt || Date.now()) - started, tools: used }
  }
  // Only the tools this call's skills allow; anything else the model asks for
  // is refused below, not just left out of the list.
  const setup = setupOf(args.state)
  const { allowed, tools } = phoneToolSpecs(setup)
  const lookups = allowed.filter(k => LOOKUPS.includes(k))
  const actx: ActionContext = {
    db, companyId: args.companyId, companyName: args.companyName, siteOrigin: args.siteOrigin,
    runId: '', roleKey: 'support', roleName: 'Phone agent', mode: 'live',
    conversationId: args.conversationId, contactId: args.contactId,
    customerVerification: args.state.verified ? 'verified' : 'unknown', scratch: args.to ? { dialledNumber: args.to } : {},
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
    const prompt = systemPrompt(args.state, { companyName: args.companyName, from: args.from, callerName: args.callerName, timezone: args.state.timezone })
    const req = {
      tier: 'fast' as const, job: 'phone_agent' as const, companyId: args.companyId, maxTokens: 600,
      system: prompt.stable, systemLive: prompt.live,
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
    // Going to look something up without having said anything yet: say so now,
    // so the caller isn't left in silence while it runs.
    if (!spoken.length && args.onText && r.toolCalls.some(c => lookups.includes(c.name))) {
      spoken.push('One moment.'); speak('One moment.')
    }

    const results: NeutralBlock[] = []
    let goodbye: string | null = null
    let tookNow = false
    const doneNow: string[] = []   // texts/messages that succeeded this round, which Colvy confirms itself
    for (const call of r.toolCalls) {
      used.push(call.name)
      if (!allowed.includes(call.name)) { results.push({ type: 'tool_result', id: call.id, content: 'Unknown tool.', isError: true }); continue }
      if (call.name === 'end_call') { goodbye = String(call.input?.goodbye || 'Thanks for calling. Goodbye.'); results.push({ type: 'tool_result', id: call.id, content: 'ok' }); continue }
      if (call.name === 'take_message') {
        const ok = await takeMessage(db, actx, args, call.input || {}, setup)
        tookMessage = tookMessage || ok
        tookNow = tookNow || ok
        // Noted on the call's state at once, not from the turn's result: a
        // turn that breaks after this (the model failing in a later round)
        // returns nothing, and a call where the AI took a message must never
        // be treated as missed.
        if (ok) {
          doneNow.push('take_message')
          args.state.messageTaken = true
          args.state.messageAbout = String(call.input?.about || '').trim().slice(0, 200)
        }
        results.push({ type: 'tool_result', id: call.id, content: ok ? 'Message saved; the team will call back.' : 'Could not save the message.', ...(ok ? {} : { isError: true }) })
        continue
      }
      if (call.name === 'text_caller' || call.name === 'text_upload_link' || call.name === 'text_booking_link') {
        const refused = (args.state.textsSent || 0) >= MAX_TEXTS ? `Already sent ${MAX_TEXTS} texts on this call.` : await whyNoText(db, args)
        const sent = refused
          ? { ok: false, error: refused }
          : call.name === 'text_caller'
            ? await textCaller(db, args, String(call.input?.message || ''))
            : call.name === 'text_booking_link'
              ? await textBookingLink(db, actx, args, String(call.input?.service || ''))
              : await textUploadLink(db, args, String(call.input?.what || ''), !!call.input?.photos_only)
        if (sent.ok) {
          args.state.textsSent = (args.state.textsSent || 0) + 1
          if (call.name === 'text_booking_link') args.state.bookingLinks = (args.state.bookingLinks || 0) + 1
          doneNow.push(call.name)
        }
        results.push({ type: 'tool_result', id: call.id, content: sent.ok ? 'Sent.' : `Not sent: ${sent.error}`, ...(sent.ok ? {} : { isError: true }) })
        continue
      }
      const action = getAction(call.name)
      if (!action || !lookups.includes(call.name)) { results.push({ type: 'tool_result', id: call.id, content: 'Unknown tool.', isError: true }); continue }
      const { reason: _reason, ...asked } = call.input || {}
      // Bookings: only the caller's own — their verified record, else the
      // number they're calling from. Never an email or number they say.
      const input = call.name === 'find_my_bookings' ? {} : asked
      // The number they're calling from, as a trusted fact (never the model's input).
      if (call.name === 'find_my_bookings' && !args.state.verified) actx.scratch.callerPhone = args.from
      if (call.name === 'find_my_bookings' && !args.state.verified && tail(args.from).length < 8) {
        results.push({ type: 'tool_result', id: call.id, content: JSON.stringify({ bookings: [], note: `The caller’s number is hidden, so their bookings can’t be looked up on the phone. ${setup.skills.message ? 'Offer to take a message.' : 'Suggest they check their booking confirmation.'}` }) })
        continue
      }
      const bad = validateInput(action, input)
      if (bad) { results.push({ type: 'tool_result', id: call.id, content: bad, isError: true }); continue }
      try {
        let out = await action.run(actx, input)
        // Nothing by that name: try the products that sound closest to what
        // was heard ("rominos" → Rummy Nose Tetra), and say that's what it is.
        if (call.name === 'check_stock' && out.ok && !(out.data as any)?.products?.length && input.query) {
          const near = closestProducts(String(input.query), (await getPhoneCatalog(db, args.companyId))?.names || [], 2)
          if (near.length) {
            const tries = await Promise.all(near.map(n => action.run(actx, { query: n.name }).catch(() => null)))
            const products = tries.flatMap(t => (t?.ok && (t.data as any)?.products) || [])
            if (products.length) out = { ...out, data: { heard: input.query, closestMatches: near.map(n => n.name), products, note: 'Nothing matched what the caller said exactly; these products sound closest. Check with the caller that this is what they meant.' } }
          }
        }
        // Remember it for the rest of the call (newest replaces the same lookup).
        if (out.ok) {
          const asked = Object.keys(input).length ? JSON.stringify(input) : ''
          const facts = (args.state.facts = (args.state.facts || []).filter(f => !(f.tool === call.name && (f.asked || '') === asked)))
          facts.push({ tool: call.name, asked, text: `${asked ? `${asked} → ` : ''}${JSON.stringify(compactLookup(call.name, out.data ?? {}))}`.slice(0, 1500) })
          // The week's hours (first) stay; older lookups make way for new ones.
          while (facts.length > 6) facts.splice(facts[0]?.tool === 'get_business_hours' && !facts[0].asked ? 1 : 0, 1)
        }
        results.push({ type: 'tool_result', id: call.id, content: JSON.stringify(out.ok ? compactLookup(call.name, out.data ?? {}) : { error: out.error }).slice(0, 6000), ...(out.ok ? {} : { isError: true }) })
      } catch (e: any) {
        results.push({ type: 'tool_result', id: call.id, content: `Lookup failed: ${e?.message || e}`, isError: true })
      }
    }
    if (goodbye) return result(true, goodbye)
    // Only messages taken / texts sent this round, all done: confirm them
    // ourselves rather than asking the AI to write the confirmation, which
    // costs a whole second round (about 2 seconds with a larger model).
    if (doneNow.length && doneNow.length === r.toolCalls.length) {
      const said = spoken.join(' ')
      const parts: string[] = []
      for (const name of Array.from(new Set(doneNow))) {
        if (name === 'take_message') {
          if (/call (you )?back/i.test(said)) continue
          parts.push(/pass(ed)? (that|it|this|your \w+) on|let the team know|note (that|it) (down|for)/i.test(said)
            ? 'The team will call you back.' : 'I’ve passed that on, and the team will call you back.')
        } else parts.push(name === 'text_upload_link' ? 'I’ve just texted you a link where you can upload your photos and videos.'
          : name === 'text_booking_link' ? 'I’ve just texted you a link to book. You can pick the time and confirm it there.'
            : 'I’ve just texted that to you.')
      }
      if (!/anything else/i.test(said)) parts.push('Is there anything else I can help with?')
      return result(false, parts.join(' ') || undefined)
    }
    messages.push({ role: 'user', content: results })
  }
  // Out of time or rounds: never leave the caller hanging. With a message
  // already taken on this call (perhaps a moment ago), the team is calling
  // back anyway, so the AI doesn't offer to take one.
  if (args.state.messageTaken) {
    return result(false, `Sorry, I’m having trouble checking that right now, but you can ask the team when they call you back.${/anything else/i.test(spoken.join(' ')) ? '' : ' Is there anything else I can help with?'}`)
  }
  return result(false, setup.skills.message
    ? 'Sorry, I’m having trouble checking that right now. Can I take a message so someone calls you back?'
    : 'Sorry, I’m having trouble checking that right now. Could you ask me again in a moment?')
}

// Texts on a call only go to a caller who hasn't opted out (replied STOP) or
// been blocked, and only a few a day to one number: caller ID can be faked, so
// nobody can have the AI text someone else's phone over and over.
const MAX_TEXTS_A_DAY = 6

/**
 * Why the caller can't be texted now, or null when they can. Can't check → no
 * text. Checks the number texted (the caller's) with lib/sms-consent, so a
 * STOP that never reached a contact counts too; the upload link, which goes
 * to the thread's number, is checked again where it's sent.
 */
async function whyNoText(db: Db, args: { companyId: string; conversationId: string | null; contactId: string | null; from: string }): Promise<string | null> {
  const key = tail(args.from)
  if (key.length < 8) return 'The caller’s number is hidden.'
  try {
    const { state } = await textOptOut(db, args.companyId, args.from, args.contactId)
    if (state === 'unknown') return 'Couldn’t check the caller can be texted.'
    if (state === 'opted_out') return 'The caller has opted out of texts from the business. Tell them instead.'
    if (args.conversationId) {
      const { count, error } = await db.from('messages').select('id', { count: 'exact', head: true })
        .eq('conversation_id', args.conversationId).eq('sender_name', 'AI phone agent').eq('delivery_channel', 'sms')
        .gte('created_at', new Date(Date.now() - 86_400_000).toISOString())
      if (error) return 'Couldn’t check the caller can be texted.'
      if ((count || 0) >= MAX_TEXTS_A_DAY) return 'This number has already had several texts today. Tell them instead.'
    }
    return null
  } catch { return 'Couldn’t check the caller can be texted.' }
}

/** Text the caller (the number they're ringing from) and record it in their conversation. */
async function textCaller(db: any, args: { companyId: string; conversationId: string | null; from: string }, message: string): Promise<{ ok: boolean; error?: string }> {
  const text = message.trim().slice(0, 480)
  if (!text) return { ok: false, error: 'Nothing to send.' }
  if (!args.from) return { ok: false, error: 'No number to text.' }
  try {
    const sender = await resolveAutomatedSmsSender(db, args.companyId)
    if (!sender) return { ok: false, error: 'No SMS number is set up for this business.' }
    await sender.send({ to: args.from, text })
  } catch (e: any) { return { ok: false, error: e?.message || 'The text didn’t send.' } }
  if (args.conversationId) {
    inBackground(async () => {
      await db.from('messages').insert({
        conversation_id: args.conversationId, company_id: args.companyId, sender_type: 'agent', sender_name: 'AI phone agent',
        content: text, message_type: 'text', delivery_channel: 'sms', is_read: true, metadata: { auto: true, sent_by: 'phone_agent' },
      })
    })
  }
  return { ok: true }
}

/** Text the caller a private upload link (a media request on their conversation). */
async function textUploadLink(db: any, args: { companyId: string; conversationId: string | null; contactId: string | null; siteOrigin: string }, what: string, photosOnly: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!args.conversationId) return { ok: false, error: 'No conversation to attach the photos to.' }
  try {
    const res = await fetch(`${args.siteOrigin.replace(/\/$/, '')}/api/media-requests`, {
      method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        companyId: args.companyId, conversationId: args.conversationId, contactId: args.contactId,
        prompt: what.trim().slice(0, 200) || 'Please upload your photos or videos here.',
        accept: photosOnly ? ['image'] : ['image', 'video'], maxFiles: 10, expiryHours: null, createdBy: 'AI phone agent', deliveryChannel: 'sms',
      }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok || !d?.link) return { ok: false, error: d?.error || 'Couldn’t create the upload link.' }
    if (!d.texted) return { ok: false, error: d.smsError || 'The upload link couldn’t be texted.' }
    return { ok: true }
  } catch (e: any) { return { ok: false, error: e?.message || 'Couldn’t create the upload link.' } }
}

/** Work the caller needn't wait for. Kept alive past the response with after() when inside a request. */
function inBackground(work: () => Promise<unknown>) {
  const p = work().catch(e => console.error('[phone agent] background work failed', e?.message || e))
  try { after(() => p) } catch { /* outside a request (tests, scripts): it simply runs */ }
}

/** Text the caller a link to book (straight to one service when named), with their details filled in. */
async function textBookingLink(db: Db, actx: ActionContext, args: { companyId: string; companyName: string; conversationId: string | null; from: string }, service: string): Promise<{ ok: boolean; error?: string }> {
  const link = getAction('booking_link')
  if (!link) return { ok: false, error: 'Booking links aren’t available.' }
  try {
    // Their details are only filled in when the number they're calling from is
    // the one on their customer record.
    const out = await link.run(actx.customerVerification === 'verified' ? actx : { ...actx, contactId: null }, service.trim() ? { service: service.trim() } : {})
    if (!out.ok || !out.data?.link) return { ok: false, error: out.error || 'Couldn’t make the booking link.' }
    const what = out.data.service ? ` ${out.data.service}` : ''
    return textCaller(db, args, `${args.companyName || 'Hi'}: here’s the link to book${what}. Pick a time that suits and confirm it there: ${out.data.link}`)
  } catch (e) { return { ok: false, error: (e instanceof Error && e.message) || 'Couldn’t make the booking link.' } }
}

/**
 * The owner's default assignee for take-a-message tasks, if they're still on
 * the team (the owner, or a team member who hasn't been removed).
 */
async function assignTask(db: Db, companyId: string, taskId: string, rules: PhoneCallSetup['tasks']): Promise<void> {
  const id = rules.assigneeId
  if (!id) return
  const [{ data: co }, onTeam] = await Promise.all([
    db.from('companies').select('owner_id').eq('id', companyId).maybeSingle(),
    isStaffMember(db, companyId, id),
  ])
  if (!onTeam && co?.owner_id !== id) return
  const name = rules.assigneeName || 'Team member'
  await db.from('conversation_tasks').update({ assignees: [{ id, name }], assigned_to_id: id, assigned_to: name })
    .eq('company_id', companyId).eq('id', taskId)
}

async function takeMessage(db: any, actx: ActionContext, args: { companyId: string; conversationId: string | null; from: string; callerName: string | null }, input: any, setup: PhoneCallSetup = defaultCallSetup()): Promise<boolean> {
  const name = String(input.name || args.callerName || '').trim().slice(0, 80) || 'A caller'
  const about = String(input.about || '').trim().slice(0, 1000)
  const back = String(input.callback_number || '').trim() || args.from
  const rules = setup.tasks
  // The same task the chat agents create (linked to the conversation and its
  // outlet), so it lands in Tasks and on the conversation. The owner's task
  // rules set how urgent ones are prioritised and when it's due.
  const createTask = getAction('create_task')
  if (!createTask) return false
  let taskId: string | null = null
  let addedToOpen = false
  try {
    // A caller asking for a call back is always worth a task (no daily cap);
    // a repeat request goes onto the open call-back task (lib/task-dedupe).
    const out = await createTask.run({ ...actx, scratch: { ...actx.scratch, taskCapExempt: true } }, {
      title: `Call back ${name} (${back})`,
      details: `${about || 'Asked for a call back.'}\n\nTaken by the AI phone agent.`,
      priority: input.urgent ? rules.urgentPriority : 'normal',
      ...(rules.dueHours ? { dueDate: new Date(Date.now() + rules.dueHours * 3600_000).toISOString() } : {}),
    })
    if (!out.ok || !out.data?.taskId) return false
    taskId = out.data.taskId
    addedToOpen = !!out.data.updated
  } catch { return false }
  // The team's alerts (and the assignee) don't hold up the caller: the AI
  // confirms straight away and they go out alongside.
  const assigned = rules.assigneeId && rules.assigneeName ? ` (assigned to ${rules.assigneeName})` : ''
  inBackground(() => Promise.all([
    // An existing task keeps whoever already has it.
    taskId && rules.assigneeId && !addedToOpen ? assignTask(db, args.companyId, taskId, rules) : null,
    notifyCompany({ db, companyId: args.companyId, type: 'call', message: `Call-back requested by ${name}: ${about.slice(0, 120)}${assigned}`, actorName: name, conversationId: args.conversationId || undefined }),
    args.conversationId
      ? pushInboundMessage({ companyId: args.companyId, conversationId: args.conversationId, title: 'Call-back requested', body: `${name}: ${about.slice(0, 120)}`, route: `/conversation/${args.conversationId}` })
      : null,
  ]))
  return true
}

/** The call so far, as the thread shows it. */
export function transcriptText(state: PhoneCallState): string {
  const lines = [`AI: ${state.greeting}`, ...state.turns.map(t => `${t.who === 'caller' ? 'Caller' : 'AI'}: ${t.text}`)]
  const agentMs = state.turns.filter(t => t.who === 'agent' && typeof t.ms === 'number').map(t => t.ms as number)
  const avg = agentMs.length ? (agentMs.reduce((a, b) => a + b, 0) / agentMs.length / 1000).toFixed(1) : null
  return `📞 Answered by the AI phone agent (${REASON_NOTE[setupOf(state).reason]}${state.realtime ? ', real-time' : ''})${avg ? ` · replies started after ${avg}s on average` : ''}\n\n${lines.join('\n')}`
}

// Why the AI took the call, as the transcript and the call log say it.
const REASON_NOTE: Record<AnswerReason, string> = { test: 'test', after_hours: 'out of hours', no_answer: 'nobody answered', always: 'answers every call' }

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
      // What the inbox's AI call card shows without reading the transcript.
      const agentMs = state.turns.filter(t => t.who === 'agent' && typeof t.ms === 'number').map(t => t.ms as number)
      const metadata = {
        phone_agent: true, call_id: call.id, test: setupOf(state).reason === 'test', answered_because: setupOf(state).reason, realtime: !!state.realtime,
        duration_seconds: dur, avg_reply_ms: agentMs.length ? Math.round(agentMs.reduce((a, b) => a + b, 0) / agentMs.length) : null,
        message_taken: !!state.messageTaken, message_about: state.messageAbout || null, ended: end || !!state.ended,
        // How long each reply took to start, in order (the call card shows them while testing).
        turn_ms: state.turns.filter(t => t.who === 'agent').map(t => t.ms ?? null),
      }
      if (state.transcriptMessageId) {
        await db.from('messages').update({ content, metadata }).eq('id', state.transcriptMessageId)
      } else {
        const { data: m } = await db.from('messages').insert({
          conversation_id: call.conversation_id, company_id: call.company_id, sender_type: 'agent', sender_name: 'AI phone agent',
          content, is_internal: true, metadata,
        }).select('id').maybeSingle()
        state.transcriptMessageId = m?.id || null
      }
    } catch (e: any) { console.error('[phone agent] transcript save failed', e?.message || e) }
  }
  if (end) state.ended = true
  const routing_state = { ...(call.routing_state || {}), phone_agent: state }
  call.routing_state = routing_state
  // The call's end and length, and the "answered" preview, only while it's
  // still answered: once it's marked missed (aiCallMissed clears answered_at),
  // perhaps by another request a moment ago, it keeps reading as missed.
  const { data: live } = call.answered_at
    ? await db.from('calls').update({ routing_state, ended_at: now.toISOString(), ...(dur ? { duration_seconds: dur } : {}) })
      .eq('id', call.id).not('answered_at', 'is', null).select('id')
    : { data: null }
  if (!live?.length) { await db.from('calls').update({ routing_state }).eq('id', call.id); return }
  if (call.conversation_id) {
    try {
      await db.from('conversations').update({ last_message: '📞 Answered by the AI phone agent', last_message_at: now.toISOString() }).eq('id', call.conversation_id)
    } catch (e) { console.error('[phone agent] preview save failed', e instanceof Error ? e.message : e) }
  }
}

/** The caller never said a word to the AI (hung up on the greeting, or stayed silent) and no message was taken. */
export function callerNeverSpoke(state: PhoneCallState): boolean {
  return !state.messageTaken && !state.callerSpoke && !state.turns.some(t => t.who === 'caller')
}

/**
 * The caller's first words have come in. Noted on the call row at once,
 * alongside working out the reply (so it adds no wait), so that a hang-up
 * before the reply is saved isn't taken for a caller who never said a word.
 * Await it before the turn's own save, so it can't land after that.
 */
export function noteCallerSpoke(db: Db, call: { id: string; routing_state: Record<string, unknown> | null }, state: PhoneCallState): Promise<void> {
  if (!callerNeverSpoke(state)) return Promise.resolve()
  state.callerSpoke = true
  const routing_state = { ...(call.routing_state || {}), phone_agent: JSON.parse(JSON.stringify(state)) }
  const p = Promise.resolve(db.from('calls').update({ routing_state }).eq('id', call.id)).then(() => {}, () => {})
  try { after(() => p) } catch { /* outside a request: it simply runs */ }
  return p
}

/**
 * The AI's call ended without anyone being helped: the caller never said a
 * word, or wanted voicemail with voicemail switched off, or the AI broke down
 * with no voicemail to fall back on. It's then a missed call, as it would have
 * been without the AI: marked missed (so it's among the calls to return), the
 * "Missed call" preview, the team's alert and, if the business switched it on,
 * the missed-call text (which still skips anyone who opted out), and the
 * call.missed event for the business's integrations. Decided from the call
 * row as it is now. Left alone: a call that has gone to voicemail (the
 * voicemail covers it), a test call, and one where the AI took a message (the
 * team is calling back). With `ifCallerSilent` (a hang-up), also one where the
 * caller had started talking.
 */
export async function aiCallMissed(db: Db, call: { id: string; company_id: string; conversation_id: string | null }, why: string, opts: { ifCallerSilent?: boolean } = {}): Promise<void> {
  try {
    const { data: row } = await db.from('calls').select('cause, caller_name, from_number, is_voicemail, routing_state').eq('id', call.id).maybeSingle()
    if (!row || row.is_voicemail) return
    const state: PhoneCallState | null = row.routing_state?.phone_agent || null
    if (state && (setupOf(state).reason === 'test' || state.messageTaken)) return
    if (opts.ifCallerSilent && (!state || !callerNeverSpoke(state))) return
    const { data: marked } = await db.from('calls').update({
      status: 'missed', answered_at: null, duration_seconds: null, ended_at: new Date().toISOString(),
      cause: `${row.cause ? `${row.cause}; ` : 'phone_agent: '}missed, ${why}`,
    }).eq('id', call.id).neq('status', 'missed').or('is_voicemail.is.null,is_voicemail.eq.false').select('id')
    if (!marked?.length) return
    inBackground(() => Promise.all([
      setCallPreview(db, call.conversation_id, '📞 Missed call'),
      alertCall(db, call.company_id, call.conversation_id, 'Missed call', row.caller_name || row.from_number || 'a caller'),
      emitCallEvent(db, 'call.missed', call.id),
    ]))
    queueMissedCallText({ db, companyId: call.company_id, callId: call.id })
  } catch (e) { console.error('[phone agent] missed call not recorded', e instanceof Error ? e.message : e) }
}

// How long after a hang-up to decide whether it was a missed call.
const HANGUP_SETTLE_MS = 6000

/**
 * The caller hung up on the AI. If they never said a word, it's a missed call,
 * as ringing out would have been. Decided a few seconds on, in the background,
 * from the call as it is then: pressing 0 ends the session too, and the call
 * moves to voicemail (agent-done) at about the same moment the hang-up is
 * reported; and a caller whose first words were still being answered has
 * been noted by then (noteCallerSpoke).
 */
export function missedIfCallerSilent(db: Db, call: { id: string; company_id: string; conversation_id: string | null }, why: string): void {
  inBackground(async () => {
    await new Promise(r => setTimeout(r, HANGUP_SETTLE_MS))
    await aiCallMissed(db, call, why, { ifCallerSilent: true })
  })
}

// ── Twilio TwiML ─────────────────────────────────────────────────────────────

/** A voice <Say> can use (ElevenLabs is real-time only; its fallback is the closest generative voice). */
export function sayVoice(voice: string): string {
  return voice.startsWith('ElevenLabs.') ? 'Polly.Olivia-Generative' : voice
}

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/** Say something, then listen for the caller's answer (they can talk over it, or press 0 for voicemail). */
export function phoneListenTwiml(actionUrl: string, voice: string, say: string): string {
  return `<Response>` +
    `<Gather input="speech dtmf" numDigits="1" action="${esc(actionUrl)}" method="POST" language="en-AU" speechModel="phone_call" speechTimeout="auto" timeout="6" actionOnEmptyResult="true">` +
      `<Say voice="${esc(sayVoice(voice))}" language="en-AU">${esc(say)}</Say>` +
    `</Gather>` +
  `</Response>`
}

/** Say goodbye and hang up. */
export function phoneGoodbyeTwiml(voice: string, say: string): string {
  return `<Response><Say voice="${esc(sayVoice(voice))}" language="en-AU">${esc(say)}</Say><Hangup/></Response>`
}

// What the caller hears instead of voicemail when the business has it switched off.
export const NO_VOICEMAIL_SAY = 'We can’t take a voicemail right now, so please call back later or send us a message. Goodbye.'
export const TROUBLE_SAY = 'Sorry, I’m having trouble on my end, so please call back later or send us a message. Goodbye.'

/** Hand the caller to voicemail (the business's normal greeting and recording). */
export function phoneVoicemailTwiml(voice: string, greeting: string, recordingCallback: string): string {
  return `<Response>` +
    `<Say voice="${esc(sayVoice(voice))}" language="en-AU">${esc(greeting)}</Say>` +
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
export function relayVoice(voice: string): { provider: 'Amazon' | 'Google' | 'ElevenLabs'; voice: string } {
  if (voice.startsWith('ElevenLabs.')) return { provider: 'ElevenLabs', voice: voice.slice('ElevenLabs.'.length) }
  if (voice.startsWith('Google.')) return { provider: 'Google', voice: voice.slice('Google.'.length) }
  return { provider: 'Amazon', voice: voice.replace(/^Polly\./, '') }
}

/** How the caller is heard, as ConversationRelay attributes. */
export function relayListening(stt: PhoneStt, hints: string[]): string {
  // Hints only go to Deepgram: Google's telephony model rejects them for en-AU
  // (Twilio 64101), which fails the whole call before the greeting.
  const h = hints.length ? ` hints="${esc(hints.join(','))}"` : ''
  if (stt === 'deepgram-flux') {
    // Flux decides when the caller has finished (eotThreshold, lower = sooner);
    // speechTimeout caps the silence it waits. Its English model is asked for
    // in the default code; the voice stays Australian.
    return `transcriptionProvider="Deepgram" speechModel="flux" transcriptionLanguage="en-US" eotThreshold="0.7" speechTimeout="2000" ignoreBackchannel="true"${h}`
  }
  if (stt === 'deepgram-nova3') return `transcriptionProvider="Deepgram" speechModel="nova-3-general"${h}`
  return `transcriptionProvider="Google" speechModel="telephony"`
}

export function phoneRelayTwiml(p: { relayUrl: string; doneUrl: string; voice: string; greeting: string; callRowId: string; companyId: string; stt?: PhoneStt; hints?: string[] }): string {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const v = relayVoice(p.voice)
  const param = (name: string, value: string) => `<Parameter name="${esc(name)}" value="${esc(value)}"/>`
  return `<Response>` +
    `<Connect action="${esc(p.doneUrl)}">` +
      `<ConversationRelay url="${esc(p.relayUrl)}" welcomeGreeting="${esc(p.greeting)}" welcomeGreetingInterruptible="any" ` +
        `language="en-AU" ttsProvider="${v.provider}" voice="${esc(v.voice)}" ${relayListening(p.stt || 'google', p.hints || [])} ` +
        `interruptible="any" dtmfDetection="true">` +
        param('callRowId', p.callRowId) + param('companyId', p.companyId) + param('exp', String(exp)) +
        param('sig', relaySignature(p.callRowId, p.companyId, exp)) +
      `</ConversationRelay>` +
    `</Connect>` +
  `</Response>`
}

// ── Handing a call to the AI ─────────────────────────────────────────────────

/**
 * The AI answers this call now: set up the call's state (greeting, skills and
 * rules for `reason`), mark the call row as answered by the AI, and return the
 * TwiML that connects the caller — real-time when the relay server is set up,
 * otherwise turn by turn. Used when a call comes in (test numbers, out of
 * hours, always) and where voicemail would have started (nobody answered).
 */
export async function answerWithAgent(db: Db, p: {
  agent: PhoneAgentSettings; reason: AnswerReason; bookable: boolean
  base: string; cbQuery: string; callRowId: string; companyId: string; companyName: string
  catalog: PhoneCatalog | null; conversationId: string | null; contactId: string | null; from: string
  /** What's already on the call row's routing_state (kept). */
  routing?: Record<string, unknown> | null
  /** Extra detail for the call's "Hangup cause" in Call Diagnostics. */
  causeDetail?: string
}): Promise<string> {
  const setup = callSetupFor(p.agent, p.reason, p.bookable)
  const realtime = relayConfigured()
  // Real-time calls answer at once; what the agent needs to know loads while
  // the greeting plays (the relay's "start"). Turn-by-turn calls load it now.
  const state = realtime
    ? newPhoneCall(p.companyName, p.catalog, { setup, greeting: p.agent.greeting })
    : await startPhoneCall(db, { companyId: p.companyId, companyName: p.companyName, conversationId: p.conversationId, contactId: p.contactId, from: p.from, setup, greeting: p.agent.greeting, catalog: p.catalog })
  state.realtime = realtime
  const now = new Date().toISOString()
  await db.from('calls').update({
    status: 'completed', answered_at: now, ended_at: now, agent_name: 'AI phone agent',
    cause: `phone_agent: answered (${REASON_NOTE[p.reason]})${p.causeDetail ? ` ${p.causeDetail}` : ''}`,
    routing_state: { ...(p.routing || {}), phone_agent: state, phone_voice: p.agent.voice },
  }).eq('id', p.callRowId)
  if (realtime) {
    return phoneRelayTwiml({
      relayUrl: process.env.VOICE_RELAY_URL!, doneUrl: `${p.base}/api/twilio/voice/agent-done?${p.cbQuery}`,
      voice: p.agent.voice, greeting: state.greeting, callRowId: p.callRowId, companyId: p.companyId,
      stt: p.agent.stt, hints: p.agent.stt === 'google' ? [] : phoneHints(p.companyName, p.catalog),
    })
  }
  return phoneListenTwiml(`${p.base}/api/twilio/voice/agent?${p.cbQuery}`, p.agent.voice, state.greeting)
}

// ── Numbers bought before they had a status callback ─────────────────────────
//
// A turn-by-turn call whose caller hangs up on the greeting gives no sign but
// the number's status callback (Twilio doesn't post the <Gather> action on a
// hang-up). Numbers Colvy buys or assigns get one; numbers it bought before
// that don't. They get it here, once each, when the AI may answer callers
// other than the test numbers: as such a call comes in (after it's answered)
// and when the owner picks a mode like that. Only numbers in Colvy's own
// Twilio account (a business's own Twilio account is theirs to set up), and
// only when unset: a status callback someone else set is left alone. The
// numbers done are kept on an agent_policies row (role "phone", action
// "status_callback", like the hours copy), so Twilio is asked once per
// number, not once per call; one Twilio couldn't do is tried again a day on.
const STATUS_CALLBACK_ACTION = 'status_callback'
const STATUS_CALLBACK_RETRY_MS = 24 * 3600_000
// What this server already knows, so a warm server doesn't even ask the
// database: numbers done, numbers being checked right now (two calls at once
// ask Twilio once), and when Twilio last failed for a number (tried again a
// day on, as the database says).
const statusCallbackDone = new Set<string>()
const statusCallbackBusy = new Set<string>()
const statusCallbackFailedAt = new Map<string, number>()
// (No time, or an unreadable one, is never recent.)
const failedRecently = (at: number | undefined) => at !== undefined && Date.now() - at < STATUS_CALLBACK_RETRY_MS

/** Can the AI answer callers other than the test numbers? Only their calls need a number's status callback. */
export function answersRealCallers(s: Pick<PhoneAgentSettings, 'enabled' | 'mode'>): boolean {
  return s.enabled && s.mode !== 'test'
}

/**
 * Give Colvy's Twilio numbers that have no status callback the one a purchase
 * sets. `numbers`: numbers in Colvy's Twilio account (E.164); without them,
 * every number the business has from Colvy. Never throws.
 */
export async function ensureStatusCallbacks(db: Db, companyId: string, numbers?: string[]): Promise<void> {
  try {
    const svc = platformTwilio()
    if (!svc) return
    let list = numbers
    if (!list) {
      const { data } = await db.from('phone_numbers').select('phone_number')
        .eq('company_id', companyId).eq('provider', 'twilio').eq('provisioned_by_colvy', true).neq('status', 'released').limit(20)
      list = (data || []).map((r: { phone_number: string | null }) => r.phone_number || '')
    }
    const todo = Array.from(new Set(list.filter(Boolean)))
      .filter(n => !statusCallbackDone.has(n) && !statusCallbackBusy.has(n) && !failedRecently(statusCallbackFailedAt.get(n)))
    if (!todo.length) return
    todo.forEach(n => statusCallbackBusy.add(n))
    try {
      // Can't read what's done (a database error): nothing is asked of Twilio, and the next call tries again.
      const { data, error } = await db.from('agent_policies').select('id, limits')
        .eq('company_id', companyId).eq('role_key', 'phone').eq('action_key', STATUS_CALLBACK_ACTION).limit(1)
      if (error) throw new Error(error.message)
      const row = data?.[0]
      const done: Record<string, string> = { ...(row?.limits?.numbers || {}) }
      const failed: Record<string, string> = { ...(row?.limits?.failed || {}) }
      let tried = false
      for (const n of todo) {
        if (done[n]) { statusCallbackDone.add(n); continue }
        const failedAt = Date.parse(failed[n] || '')
        if (failedRecently(failedAt)) { statusCallbackFailedAt.set(n, failedAt); continue }
        tried = true
        const now = Date.now()
        const at = new Date(now).toISOString()
        try {
          const pn = await svc.getIncomingNumber(n)
          if (pn?.sid && !pn.status_callback) await svc.configureNumberWebhooks({ phoneNumberSid: pn.sid, statusCallback: numberStatusCallbackUrl() })
          done[n] = at
          delete failed[n]
          statusCallbackDone.add(n)
          statusCallbackFailedAt.delete(n)
        } catch (e) {
          failed[n] = at
          statusCallbackFailedAt.set(n, now)
          console.error('[phone agent] status callback not set', n, e instanceof Error ? e.message : e)
        }
      }
      if (!tried) return
      const fields = { autonomy: 'off', limits: { numbers: done, failed }, updated_at: new Date().toISOString() }
      if (row) await db.from('agent_policies').update(fields).eq('id', row.id)
      else await db.from('agent_policies').insert({ company_id: companyId, role_key: 'phone', action_key: STATUS_CALLBACK_ACTION, ...fields })
    } finally {
      todo.forEach(n => statusCallbackBusy.delete(n))
    }
  } catch (e) { console.error('[phone agent] status callbacks not checked', e instanceof Error ? e.message : e) }
}
