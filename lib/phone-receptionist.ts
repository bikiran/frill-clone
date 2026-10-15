// The AI receptionist: what the owner controls about the phone agent, and the
// plain decisions made from it — whether the AI takes a call, which tools it
// gets, what it says first.
//
// No server imports here, so the settings card shows the same labels and
// summary the call routes act on, and the decisions can be tested on their own.
//
// Saved with the phone agent's other settings, in its agent_policies row (role
// "phone", action "answer_calls", the limits JSON), so no migration. A row
// saved before these settings existed reads as today's behaviour: test numbers
// only, every skill on except booking, the standard greeting, no task rules.

// ── Settings ─────────────────────────────────────────────────────────────────

/** When the AI answers. Test numbers are always answered straight away, whatever the mode. */
export type PhoneMode = 'test' | 'after_hours' | 'no_answer' | 'always'
/** Why the AI took a particular call (kept on the call, shown on its transcript). */
export type AnswerReason = PhoneMode

export const PHONE_MODES: { id: PhoneMode; label: string; about: string }[] = [
  { id: 'test', label: 'Test numbers only', about: 'Only calls from your test numbers, straight away. Everyone else is handled as normal.' },
  { id: 'after_hours', label: 'Out of hours', about: 'When you’re closed (by your opening hours, including Google holiday hours), the AI answers straight away. While you’re open, calls ring your team as normal.' },
  { id: 'no_answer', label: 'When nobody answers', about: 'Your team’s phones ring first. If nobody picks up, the AI answers instead of voicemail (straight away if nobody’s online).' },
  { id: 'always', label: 'Always', about: 'The AI answers every call straight away. Your team’s phones won’t ring.' },
]

export type PhoneSkill = 'hours' | 'orders' | 'stock' | 'knowledge' | 'message' | 'texts' | 'booking'
export type PhoneSkills = Record<PhoneSkill, boolean>

export const PHONE_SKILLS: { id: PhoneSkill; label: string; about: string }[] = [
  { id: 'hours', label: 'Opening hours', about: 'Today’s and the week’s hours, including holiday hours from Google.' },
  { id: 'orders', label: 'Order status', about: 'The caller’s own orders, matched to the number they call from. Other orders need the order number and email or postcode.' },
  { id: 'stock', label: 'Stock', about: 'Whether something is in stock, and its price.' },
  { id: 'knowledge', label: 'Answers from your AI Knowledge', about: 'Delivery, returns, care advice and anything else in your knowledge and Business Memory.' },
  { id: 'message', label: 'Take a message', about: 'Creates a call-back task and alerts the team.' },
  { id: 'texts', label: 'Text links and details', about: 'Texts the caller an address, website or a link to upload photos.' },
  { id: 'booking', label: 'Bookings', about: 'Tells callers free times for a service and texts them a link to book and pay. It never books on its own.' },
]

// Booking is new, so it starts off; everything else is what the agent did before.
export const DEFAULT_SKILLS: PhoneSkills = { hours: true, orders: true, stock: true, knowledge: true, message: true, texts: true, booking: false }

export type PhoneTaskRules = {
  /** Who take-a-message tasks are assigned to (a team member's user id), or nobody. */
  assigneeId: string | null
  assigneeName: string | null
  /** The priority a message the caller says is urgent gets. */
  urgentPriority: 'high' | 'normal'
  /** Due this many hours after the call, or no due time. */
  dueHours: number | null
}
export const DEFAULT_TASK_RULES: PhoneTaskRules = { assigneeId: null, assigneeName: null, urgentPriority: 'high', dueHours: null }
export const DUE_HOURS = [1, 2, 4, 8, 24, 48]

export const MAX_GREETING = 400
export const MAX_NEVER_LINES = 20
const MAX_NEVER_CHARS = 200

export type ReceptionistSettings = {
  mode: PhoneMode
  /** Out of hours mode only: also answer during opening hours when nobody picks up. */
  alsoNoAnswer: boolean
  /** The owner's own greeting ('' = the standard one). {business} becomes the business name. */
  greeting: string
  skills: PhoneSkills
  /** Things the AI must politely decline to talk about, one per line. */
  neverDiscuss: string[]
  tasks: PhoneTaskRules
}

type Obj = Record<string, unknown>
const asObj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {})
const isUuid = (s: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''))
// Owner text that goes into the AI's instructions and the spoken greeting: one
// line, no control characters.
const oneLine = (s: unknown, max: number) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

/** Settings from the saved JSON (snake_case) or the settings card (camelCase); anything unknown falls back to the default. */
export function cleanReceptionist(raw: unknown): ReceptionistSettings {
  const r = asObj(raw)
  const mode = PHONE_MODES.find(m => m.id === r.mode)?.id || 'test'
  const skillsRaw = asObj(r.skills)
  const skills = { ...DEFAULT_SKILLS }
  for (const k of Object.keys(DEFAULT_SKILLS) as PhoneSkill[]) { const v = skillsRaw[k]; if (typeof v === 'boolean') skills[k] = v }
  const neverRaw = r.neverDiscuss ?? r.never_discuss
  const never = (Array.isArray(neverRaw) ? neverRaw as unknown[] : String(neverRaw || '').split('\n'))
    .map(l => oneLine(l, MAX_NEVER_CHARS).replace(/^[-•*]\s*/, '')).filter(Boolean)
  const t = asObj(r.tasks)
  const assigneeId = t.assigneeId ?? t.assignee_id
  const due = Number(t.dueHours ?? t.due_hours)
  return {
    mode,
    alsoNoAnswer: !!(r.alsoNoAnswer ?? r.also_no_answer),
    greeting: oneLine(r.greeting, MAX_GREETING),
    skills,
    neverDiscuss: Array.from(new Set<string>(never)).slice(0, MAX_NEVER_LINES),
    tasks: {
      assigneeId: isUuid(assigneeId) ? String(assigneeId) : null,
      assigneeName: isUuid(assigneeId) ? oneLine(t.assigneeName ?? t.assignee_name, 80) || null : null,
      urgentPriority: (t.urgentPriority ?? t.urgent_priority) === 'normal' ? 'normal' : 'high',
      dueHours: DUE_HOURS.includes(due) ? due : null,
    },
  }
}

/** How the settings are saved (alongside the phone agent's test numbers, voice and speech recognition). */
export function receptionistLimits(s: ReceptionistSettings): Record<string, unknown> {
  return {
    mode: s.mode, also_no_answer: s.alsoNoAnswer, greeting: s.greeting, skills: s.skills, never_discuss: s.neverDiscuss,
    tasks: { assignee_id: s.tasks.assigneeId, assignee_name: s.tasks.assigneeName, urgent_priority: s.tasks.urgentPriority, due_hours: s.tasks.dueHours },
  }
}

// ── Does the AI take this call? ──────────────────────────────────────────────

export const phoneTail = (n: string | null | undefined) => String(n || '').replace(/\D/g, '').slice(-9)

export function isTestCaller(testNumbers: string[], from: string): boolean {
  const t = phoneTail(from)
  return t.length >= 8 && testNumbers.some(n => phoneTail(n) === t)
}

type Decidable = { enabled: boolean; testNumbers: string[]; mode: PhoneMode; alsoNoAnswer: boolean }

/**
 * Whether the AI answers this call now, and why; null means handle the call
 * exactly as before (ring the team, then voicemail).
 *
 *   moment 'incoming'  — the call has just come in, before anyone is rung.
 *   moment 'no_answer' — where voicemail would start: nobody picked up within
 *                        the ring time, or nobody was online to ring.
 *   closedNow          — by the opening hours: true closed, false open, null
 *                        can't tell (then it isn't treated as closed).
 *   paused             — "Pause all agents" is on: only test numbers still work.
 */
export function aiAnswerDecision(s: Decidable, call: { from: string; moment: 'incoming' | 'no_answer'; closedNow?: boolean | null; paused?: boolean }): AnswerReason | null {
  if (!s.enabled) return null
  if (call.moment === 'incoming' && isTestCaller(s.testNumbers, call.from)) return 'test'
  if (call.paused) return null
  switch (s.mode) {
    case 'always': return call.moment === 'incoming' ? 'always' : null
    case 'after_hours':
      if (call.moment === 'incoming') return call.closedNow === true ? 'after_hours' : null
      return s.alsoNoAnswer ? 'no_answer' : null
    case 'no_answer': return call.moment === 'no_answer' ? 'no_answer' : null
    default: return null
  }
}

/** Does deciding on an incoming call need the opening hours? (Only out-of-hours mode, and not for a test number.) */
export function needsHoursCheck(s: Decidable, from: string): boolean {
  return s.enabled && s.mode === 'after_hours' && !isTestCaller(s.testNumbers, from)
}

/** Could the AI answer this call as soon as it comes in? (Worth loading what it needs alongside the caller lookups.) */
export function mayAnswerAtStart(s: Decidable, from: string): boolean {
  return s.enabled && (isTestCaller(s.testNumbers, from) || s.mode === 'after_hours' || s.mode === 'always')
}

// ── What the AI can do on a call ─────────────────────────────────────────────

/** What a call keeps for its whole length (on its state), so changing settings mid-call doesn't change the call. */
export type PhoneCallSetup = {
  reason: AnswerReason
  skills: PhoneSkills
  neverDiscuss: string[]
  tasks: PhoneTaskRules
  /** The booking skill is on AND the business has something to book. */
  bookable: boolean
}

export function defaultCallSetup(): PhoneCallSetup {
  return { reason: 'test', skills: { ...DEFAULT_SKILLS }, neverDiscuss: [], tasks: { ...DEFAULT_TASK_RULES }, bookable: false }
}

// The lookups (read-only Colvy actions the chat agents use too), in the order
// the AI is given them.
export const PHONE_LOOKUPS = ['get_business_hours', 'find_customer_orders', 'check_order_status', 'check_stock', 'ask_knowledge', 'list_services', 'check_availability', 'find_my_bookings']
const SKILL_TOOLS: Record<PhoneSkill, string[]> = {
  hours: ['get_business_hours'],
  orders: ['find_customer_orders', 'check_order_status'],
  stock: ['check_stock'],
  knowledge: ['ask_knowledge'],
  message: ['take_message'],
  texts: ['text_caller', 'text_upload_link'],
  booking: ['list_services', 'check_availability', 'find_my_bookings', 'text_booking_link'],
}
const PHONE_EXTRAS = ['take_message', 'text_caller', 'text_upload_link', 'text_booking_link']

/** The tools the AI gets on this call: lookups first, then messages and texts, and always end_call. */
export function phoneToolNames(setup: { skills: PhoneSkills; bookable: boolean }): string[] {
  const on = new Set<string>()
  for (const k of Object.keys(SKILL_TOOLS) as PhoneSkill[]) {
    if (!setup.skills?.[k]) continue
    if (k === 'booking' && !setup.bookable) continue
    for (const t of SKILL_TOOLS[k]) on.add(t)
  }
  return [...PHONE_LOOKUPS.filter(t => on.has(t)), ...PHONE_EXTRAS.filter(t => on.has(t)), 'end_call']
}

// ── What the caller hears first ──────────────────────────────────────────────

/** "a, b or c" */
function listOr(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`
}

/** "I can check an order, our opening hours or stock, or take a message." — what this call's AI can do, in words. */
export function canDoSentence(name: string, skills: PhoneSkills, bookable: boolean): string {
  const checks = [skills.orders && 'an order', skills.hours && 'our opening hours', skills.stock && 'stock'].filter(Boolean) as string[]
  const clauses = [
    checks.length ? `check ${listOr(checks)}` : '',
    skills.booking && bookable ? 'help you book' : '',
    skills.message ? 'take a message' : '',
  ].filter(Boolean)
  if (!clauses.length) return skills.knowledge ? `I can answer questions about ${name}.` : ''
  if (clauses.length === 1) return `I can ${clauses[0]}.`
  return `I can ${clauses.slice(0, -1).join(', ')}, or ${clauses[clauses.length - 1]}.`
}

/** The standard greeting for why the AI is answering. */
export function defaultGreeting(companyName: string, setup: Pick<PhoneCallSetup, 'reason' | 'skills' | 'bookable'>): string {
  const name = companyName || 'us'
  const can = canDoSentence(name, setup.skills, setup.bookable)
  const why = setup.reason === 'after_hours'
    ? `We’re closed right now, so you’re speaking with ${name}’s AI assistant.`
    : setup.reason === 'always'
      ? `You’re speaking with ${name}’s AI assistant.`
      : `The team can't get to the phone right now, so you're speaking with ${name}'s AI assistant.`
  return [`Hi, thanks for calling ${name}.`, why, can, 'How can I help?'].filter(Boolean).join(' ')
}

/** The owner's greeting with the business name filled in, else the standard one. */
export function callGreeting(companyName: string, custom: string, setup: Pick<PhoneCallSetup, 'reason' | 'skills' | 'bookable'>): string {
  const own = String(custom || '').trim()
  if (!own) return defaultGreeting(companyName, setup)
  return own.replace(/\{\s*(business|company)\s*\}/gi, companyName || 'us')
}

/** Does the greeting tell the caller they're talking to an AI? */
export function greetingSaysAi(text: string): boolean {
  return /\bA\.?I\.?\b|artificial intelligence|virtual (assistant|receptionist)|automated|\bbot\b/i.test(text)
}

// ── The settings card's one-line summary ─────────────────────────────────────

export function receptionistSummary(s: Decidable, opts: { ringSeconds?: number | null; paused?: boolean; voicemailEnabled?: boolean } = {}): string {
  const ring = Math.max(20, Number(opts.ringSeconds) || 25)
  const after = opts.voicemailEnabled === false ? 'then they’re missed' : 'then go to voicemail'
  if (!s.enabled) return `The AI receptionist is off. Calls ring your team as normal, ${after}.`
  const test = s.testNumbers.length ? ' Your test numbers always get the AI straight away.' : ''
  const paused = opts.paused && s.mode !== 'test' ? ' It’s paused right now, because all agents are paused, so only your test numbers get the AI.' : ''
  switch (s.mode) {
    case 'after_hours':
      return (s.alsoNoAnswer
        ? `The AI answers out of hours and when nobody picks up within ${ring} seconds.`
        : `The AI answers out of hours. While you’re open, calls ring your team as normal, ${after}.`) + test + paused
    case 'no_answer':
      return `The AI answers when nobody picks up within ${ring} seconds.` + test + paused
    case 'always':
      return 'The AI answers every call straight away, so your team’s phones won’t ring.' + test + paused
    default:
      return s.testNumbers.length
        ? 'The AI only answers calls from your test numbers. Everyone else is handled as normal.'
        : 'Add a test number to try the AI. Everyone else is handled as normal.'
  }
}
