// Call routing for a business number: who an incoming call rings, in what
// order, whether it's forwarded to an outside number, and the press-1 phone
// menu. Twilio numbers only (see app/api/call-routing for why Telnyx numbers
// carry on ringing everyone at once).
//
// No server imports: the settings card shows the same summary and validation
// the call routes act on, and everything here can be tested on its own. The
// routes (app/api/twilio/voice/inbound, inbound-status, menu, forward-screen)
// stay thin: they load the saved config, work out who can be rung right now,
// and ask this module for the TwiML.
//
// Saved per number in call_routing.config (V399) as the JSON cleanRouting()
// reads. No row (or the table not there yet) means "ring everyone at once",
// exactly as before routing existed.
//
// How a ring order runs: every step is its own <Dial>. Its action callback
// (inbound-status) carries the step's route and index; when the step isn't
// answered and the caller is still on the line, the next step that has
// someone to ring is dialled, and after the last one the usual fallback runs
// (AI receptionist / voicemail / missed call), exactly once.

// ── Types ────────────────────────────────────────────────────────────────────

export type RingStrategy = 'simultaneous' | 'in_order' | 'forward' | 'menu'
export type ForwardWhen = 'always' | 'closed'
export type CallerIdMode = 'business' | 'caller'

export type ForwardTarget = {
  /** E.164, an Australian mobile or landline. */
  number: string
  /** How long the outside phone rings. */
  seconds: number
  /** Ask whoever answers to press 1 first, so the phone's own voicemail can't take the call. */
  screen: boolean
  /** The number the outside phone sees: the business's Colvy number, or the caller's own (Australian numbers only). */
  callerId: CallerIdMode
}

export type OrderStep = { userId: string; seconds: number }
export type RingOrder = {
  steps: OrderStep[]
  /** After the last person, ring everyone at once. */
  thenAll: boolean
  thenAllSeconds: number
  /** After that, forward to an outside number. */
  thenForward: ForwardTarget | null
}

export type MenuKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
export type MenuAction =
  | { type: 'ring_all' }
  | { type: 'ring_order'; order: RingOrder }
  | { type: 'forward'; forward: ForwardTarget }
  | { type: 'voicemail' }
  | { type: 'ai' }
  | { type: 'message'; text: string; then: 'menu' | 'hangup' }
  | { type: 'sms'; text: string; then: 'menu' | 'hangup' }
export type MenuActionType = MenuAction['type']
export type MenuOption = { key: MenuKey; label: string; action: MenuAction }
export type Menu = {
  greeting: string
  /** Read "For Sales, press 1" for each option after the greeting. */
  announce: boolean
  options: MenuOption[]
  /** Seconds to wait for a key. */
  timeout: number
  /** What happens after no key (or a wrong one) twice. */
  defaultAction: MenuAction
}

export type CallRouting = {
  strategy: RingStrategy
  order: RingOrder
  forward: ForwardTarget & { when: ForwardWhen }
  menu: Menu
  /** A different menu while the business is closed (by its opening hours). */
  afterHours: { enabled: boolean; menu: Menu }
}

// ── Limits and defaults ──────────────────────────────────────────────────────

export const STEP_SECONDS = { min: 5, max: 60, def: 15 }
export const FORWARD_SECONDS = { min: 5, max: 60, def: 25 }
export const THEN_ALL_SECONDS_DEF = 20
export const MENU_TIMEOUT = { min: 3, max: 15, def: 6 }
export const MAX_ORDER_STEPS = 8
/** Ringing longer than this is more than callers wait for. */
export const MAX_TOTAL_RING = 240
export const MAX_GREETING = 600
export const MAX_LABEL = 40
export const MAX_MESSAGE = 320
export const MENU_KEYS: MenuKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
/** Before a call is answered, the caller's network may give up after a minute or two of ringing; steps that start later answer the call first (Twilio plays ringing). */
export const BRIDGE_ANSWER_LIMIT = 60
/** The voice of the existing voicemail greeting. */
export const MENU_VOICE = 'Polly.Nicole'

export const STRATEGIES: { id: RingStrategy; label: string; about: string }[] = [
  { id: 'simultaneous', label: 'Ring everyone at once', about: 'Every available team member’s browser and app ring together. Whoever answers first takes the call.' },
  { id: 'in_order', label: 'Ring in order', about: 'Ring one person at a time, in your order, skipping anyone offline or on a call.' },
  { id: 'forward', label: 'Forward to a mobile', about: 'Send calls to an outside Australian mobile or landline, always or only when you’re closed.' },
  { id: 'menu', label: 'Phone menu', about: 'Callers hear a greeting and press a key: 1 for sales, 2 for support, and so on.' },
]

export const MENU_ACTIONS: { id: MenuActionType; label: string }[] = [
  { id: 'ring_all', label: 'Ring everyone' },
  { id: 'ring_order', label: 'Ring a team member (or several in order)' },
  { id: 'forward', label: 'Forward to an outside number' },
  { id: 'voicemail', label: 'Voicemail' },
  { id: 'ai', label: 'AI receptionist' },
  { id: 'message', label: 'Play a message' },
  { id: 'sms', label: 'Text the caller' },
]

export function defaultForward(): ForwardTarget {
  return { number: '', seconds: FORWARD_SECONDS.def, screen: true, callerId: 'business' }
}
export function defaultOrder(): RingOrder {
  return { steps: [], thenAll: true, thenAllSeconds: THEN_ALL_SECONDS_DEF, thenForward: null }
}
export function defaultMenu(): Menu {
  return { greeting: 'Thanks for calling {business}.', announce: true, options: [], timeout: MENU_TIMEOUT.def, defaultAction: { type: 'ring_all' } }
}
export function defaultRouting(): CallRouting {
  return {
    strategy: 'simultaneous',
    order: defaultOrder(),
    forward: { ...defaultForward(), when: 'always' },
    menu: defaultMenu(),
    afterHours: { enabled: false, menu: { ...defaultMenu(), greeting: 'Thanks for calling {business}. We’re closed right now.' } },
  }
}

// ── Australian numbers ───────────────────────────────────────────────────────

/**
 * An Australian mobile or landline in E.164 (+614xxxxxxxx, +61[2378]xxxxxxxx),
 * or null. 13 / 1300 / 1800, premium and emergency numbers, short codes and
 * overseas numbers are refused: forwarding is billed per minute on Colvy's
 * account and is only priced for ordinary Australian lines.
 */
export function auForwardNumber(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  if (/[^\d\s()+.-]/.test(s)) return null
  const d = s.replace(/\D/g, '')
  let national: string
  if (s.startsWith('+')) { if (!d.startsWith('61')) return null; national = d.slice(2) }
  else if (d.startsWith('61') && d.length === 11) national = d.slice(2)
  else if (d.startsWith('0')) national = d.slice(1)
  else return null
  if (national.startsWith('0')) national = national.slice(1)   // +61 0412…
  if (!/^[2-478]\d{8}$/.test(national)) return null
  return '+61' + national
}

/** "0412 345 678" / "(03) 9000 0000" for an Australian E.164 number; anything else as given. */
export function formatAu(e164: string | null | undefined): string {
  const s = String(e164 || '')
  const m = s.match(/^\+61(\d{9})$/)
  if (!m) return s
  const n = m[1]
  if (n.startsWith('4')) return `0${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`
  return `(0${n[0]}) ${n.slice(1, 5)} ${n.slice(5)}`
}

/** A phone number read out digit by digit ("0 4 1 2, 3 4 5, 6 7 8"), so text-to-speech doesn't say "four hundred and twelve million". */
export function spokenNumber(e164: string): string {
  const local = formatAu(e164).replace(/[()]/g, '')
  return local.split(' ').map(g => g.split('').join(' ')).join(', ')
}

// ── Reading and checking a config ────────────────────────────────────────────

type Obj = Record<string, unknown>
const asObj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {})
const oneLine = (s: unknown, max: number) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
const isUuid = (s: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''))
const clampInt = (v: unknown, r: { min: number; max: number; def: number }) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= r.min && n <= r.max ? n : r.def
}

/** Every problem found, in words for the settings card. Empty when the config is good. */
export type Problems = string[]

type CheckCtx = {
  /** Team members who can take calls (null: don't check). */
  members: Set<string> | null
  /** The business's own numbers (E.164), which can't be forwarded to (the call would loop). */
  ownNumbers?: Set<string>
  /** Whether forwarding is allowed for this business (plan and Colvy's switch). */
  forwardAllowed?: boolean
  /** Whether the AI receptionist can take calls. */
  aiAvailable?: boolean
}

function parseForward(raw: unknown, where: string, p: Problems | null, ctx: CheckCtx | null): ForwardTarget | null {
  const r = asObj(raw)
  const number = auForwardNumber(r.number)
  if (!number) {
    p?.push(`${where}: enter an Australian mobile or landline to forward to (like 0412 345 678).`)
    if (!p) return null
  }
  if (number && ctx?.ownNumbers?.has(number)) p?.push(`${where}: that’s one of your own Colvy numbers, so the call would go round in circles.`)
  if (p && r.seconds !== undefined && clampInt(r.seconds, { ...FORWARD_SECONDS, def: -1 }) === -1) p.push(`${where}: ring time must be ${FORWARD_SECONDS.min}–${FORWARD_SECONDS.max} seconds.`)
  if (p && ctx && ctx.forwardAllowed === false) p.push(`${where}: call forwarding isn’t available on your plan. Contact Colvy to switch it on.`)
  return {
    number: number || '',
    seconds: clampInt(r.seconds, FORWARD_SECONDS),
    screen: r.screen !== false,
    callerId: r.callerId === 'caller' ? 'caller' : 'business',
  }
}

function parseOrder(raw: unknown, where: string, p: Problems | null, ctx: CheckCtx | null, opts: { needSteps: boolean }): RingOrder {
  const r = asObj(raw)
  const rawSteps = Array.isArray(r.steps) ? r.steps as unknown[] : []
  if (p && rawSteps.length > MAX_ORDER_STEPS) p.push(`${where}: ring at most ${MAX_ORDER_STEPS} people in order.`)
  const steps: OrderStep[] = []
  const seen = new Set<string>()
  for (const s of rawSteps.slice(0, MAX_ORDER_STEPS)) {
    const o = asObj(s)
    const userId = String(o.userId ?? o.user_id ?? '')
    if (!isUuid(userId)) { p?.push(`${where}: pick a team member for every step.`); continue }
    if (ctx?.members && !ctx.members.has(userId)) { p?.push(`${where}: one of the people picked can’t take calls (they’ve left the team, or calls are turned off for them).`); continue }
    if (seen.has(userId)) { p?.push(`${where}: each person can only be in the order once.`); continue }
    if (p && o.seconds !== undefined && clampInt(o.seconds, { ...STEP_SECONDS, def: -1 }) === -1) p.push(`${where}: each person rings for ${STEP_SECONDS.min}–${STEP_SECONDS.max} seconds.`)
    seen.add(userId)
    steps.push({ userId, seconds: clampInt(o.seconds, STEP_SECONDS) })
  }
  if (p && opts.needSteps && !steps.length && !p.some(x => x.startsWith(where))) p.push(`${where}: add at least one person to ring.`)
  const thenForwardRaw = r.thenForward ?? r.then_forward
  const thenForward = thenForwardRaw && asObj(thenForwardRaw).number !== undefined && String(asObj(thenForwardRaw).number || '').trim()
    ? parseForward(thenForwardRaw, `${where}, then forward`, p, ctx) : null
  const order: RingOrder = {
    steps,
    thenAll: (r.thenAll ?? r.then_all) !== false,
    thenAllSeconds: clampInt(r.thenAllSeconds ?? r.then_all_seconds, { ...STEP_SECONDS, def: THEN_ALL_SECONDS_DEF }),
    thenForward: thenForward && thenForward.number ? thenForward : null,
  }
  if (p) {
    const total = order.steps.reduce((a, s) => a + s.seconds, 0) + (order.thenAll ? order.thenAllSeconds : 0) + (order.thenForward ? order.thenForward.seconds : 0)
    if (total > MAX_TOTAL_RING) p.push(`${where}: that’s ${total} seconds of ringing. Keep it under ${MAX_TOTAL_RING / 60} minutes; callers rarely wait longer.`)
  }
  return order
}

function parseAction(raw: unknown, where: string, p: Problems | null, ctx: CheckCtx | null): MenuAction {
  const r = asObj(raw)
  const type = MENU_ACTIONS.find(a => a.id === r.type)?.id
  if (!type) { p?.push(`${where}: choose what happens.`); return { type: 'ring_all' } }
  switch (type) {
    case 'ring_all': return { type }
    case 'voicemail': return { type }
    case 'ai':
      if (p && ctx && ctx.aiAvailable === false) p.push(`${where}: switch the AI receptionist on first (below), or pick something else.`)
      return { type }
    case 'ring_order': return { type, order: parseOrder(r.order, where, p, ctx, { needSteps: true }) }
    case 'forward': {
      const f = parseForward(r.forward, where, p, ctx)
      return f ? { type, forward: f } : { type: 'ring_all' }
    }
    case 'message':
    case 'sms': {
      const text = oneLine(r.text, MAX_MESSAGE + 1)
      if (p && !text) p.push(`${where}: write the ${type === 'sms' ? 'text' : 'message'}.`)
      if (p && text.length > MAX_MESSAGE) p.push(`${where}: keep it under ${MAX_MESSAGE} characters.`)
      return { type, text: text.slice(0, MAX_MESSAGE), then: r.then === 'hangup' ? 'hangup' : 'menu' }
    }
  }
}

function parseMenu(raw: unknown, where: string, p: Problems | null, ctx: CheckCtx | null): Menu {
  const r = asObj(raw)
  const greetingRaw = String(r.greeting ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').trim()
  if (p && greetingRaw.length > MAX_GREETING) p.push(`${where}: keep the greeting under ${MAX_GREETING} characters.`)
  const rawOptions = Array.isArray(r.options) ? r.options as unknown[] : []
  const options: MenuOption[] = []
  const keys = new Set<string>()
  for (const o of rawOptions) {
    const x = asObj(o)
    const key = String(x.key ?? '')
    if (!MENU_KEYS.includes(key as MenuKey)) { p?.push(`${where}: options use the keys 0–9.`); continue }
    if (keys.has(key)) { p?.push(`${where}: key ${key} is used twice.`); continue }
    keys.add(key)
    const label = oneLine(x.label, MAX_LABEL)
    if (p && !label) p.push(`${where}: give option ${key} a name (like Sales).`)
    options.push({ key: key as MenuKey, label: label || `Option ${key}`, action: parseAction(x.action, `${where}, option ${key}`, p, ctx) })
  }
  if (p && !options.length) p.push(`${where}: add at least one option.`)
  if (p && r.timeout !== undefined && clampInt(r.timeout, { ...MENU_TIMEOUT, def: -1 }) === -1) p.push(`${where}: wait ${MENU_TIMEOUT.min}–${MENU_TIMEOUT.max} seconds for a key.`)
  options.sort((a, b) => MENU_KEYS.indexOf(a.key) - MENU_KEYS.indexOf(b.key))
  const def = r.defaultAction ?? r.default_action
  const defaultAction = def ? parseAction(def, `${where}, when nobody presses a key`, p, ctx) : { type: 'ring_all' as const }
  if (p && (defaultAction.type === 'message' || defaultAction.type === 'sms') && defaultAction.then === 'menu') p.push(`${where}: when nobody presses a key, a message has to end the call (it can’t go back to the menu).`)
  return {
    greeting: greetingRaw.slice(0, MAX_GREETING),
    announce: r.announce !== false,
    options,
    timeout: clampInt(r.timeout, MENU_TIMEOUT),
    defaultAction,
  }
}

function parse(raw: unknown, p: Problems | null, ctx: CheckCtx | null): CallRouting {
  const r = asObj(raw)
  const strategy = STRATEGIES.find(s => s.id === r.strategy)?.id || 'simultaneous'
  const base = defaultRouting()
  // Only the parts the strategy uses are checked; the rest is kept as saved
  // (so switching back restores it) without blocking the save.
  const pFor = (s: RingStrategy) => (strategy === s ? p : null)
  const fRaw = asObj(r.forward)
  const forward = Object.keys(fRaw).length
    ? parseForward(fRaw, 'Forwarding', pFor('forward'), strategy === 'forward' ? ctx : null)
    : (pFor('forward')?.push('Forwarding: enter an Australian mobile or landline to forward to (like 0412 345 678).'), null)
  const ahRaw = asObj(r.afterHours ?? r.after_hours)
  const ahOn = strategy === 'menu' && ahRaw.enabled === true
  return {
    strategy,
    order: r.order ? parseOrder(r.order, 'Ring order', pFor('in_order'), strategy === 'in_order' ? ctx : null, { needSteps: true }) : (pFor('in_order')?.push('Ring order: add at least one person to ring.'), base.order),
    forward: { ...(forward || base.forward), when: fRaw.when === 'closed' ? 'closed' : 'always' },
    menu: r.menu ? parseMenu(r.menu, 'Phone menu', pFor('menu'), strategy === 'menu' ? ctx : null) : (pFor('menu')?.push('Phone menu: add at least one option.'), base.menu),
    afterHours: {
      enabled: ahRaw.enabled === true,
      menu: ahRaw.menu ? parseMenu(ahRaw.menu, 'After-hours menu', ahOn ? p : null, ahOn ? ctx : null) : base.afterHours.menu,
    },
  }
}

/** The saved config as the call routes use it. Never throws; anything unreadable falls back to ringing everyone. */
export function cleanRouting(raw: unknown): CallRouting {
  try {
    const c = parse(raw, null, null)
    // Strategies that can't run with what was saved ring everyone instead.
    if (c.strategy === 'in_order' && !c.order.steps.length) c.strategy = 'simultaneous'
    if (c.strategy === 'forward' && !c.forward.number) c.strategy = 'simultaneous'
    if (c.strategy === 'menu' && !c.menu.options.length) c.strategy = 'simultaneous'
    return c
  } catch { return defaultRouting() }
}

/** Check a config from the settings card. */
export function validateRouting(raw: unknown, ctx: CheckCtx): { ok: true; config: CallRouting } | { ok: false; problems: Problems } {
  const p: Problems = []
  let config: CallRouting
  try { config = parse(raw, p, ctx) } catch { return { ok: false, problems: ['That call routing couldn’t be read.'] } }
  if (config.strategy === 'menu' && config.afterHours.enabled && !config.afterHours.menu.options.length && !p.some(x => x.startsWith('After-hours menu'))) p.push('After-hours menu: add at least one option.')
  return p.length ? { ok: false, problems: Array.from(new Set(p)) } : { ok: true, config }
}

// ── Plans: the ring steps a route runs ───────────────────────────────────────

/** When a step applies, by the opening hours. Unknown hours count as open. */
export type StepWhen = 'always' | 'closed' | 'open'
export type Step =
  | { kind: 'ring'; users: 'all' | string[]; seconds: number; when: StepWhen }
  | { kind: 'forward'; target: ForwardTarget; when: StepWhen }

/**
 * Which ring plan a call is on, carried on each step's callback:
 *   main         the number's strategy (ring in order / forward)
 *   m<key> a<key> an option of the menu / after-hours menu
 *   md ad        the menu's / after-hours menu's "nobody pressed a key" action
 */
export type RouteKey = string

export function menuFor(c: CallRouting, which: 'main' | 'ah'): Menu {
  return which === 'ah' ? c.afterHours.menu : c.menu
}

/** The action a menu route key stands for (m2 → option 2 of the menu), or null. */
export function actionFor(c: CallRouting, route: RouteKey): MenuAction | null {
  const m = /^([ma])(d|\d)$/.exec(route)
  if (!m) return null
  const menu = menuFor(c, m[1] === 'a' ? 'ah' : 'main')
  if (m[2] === 'd') return menu.defaultAction
  return menu.options.find(o => o.key === m[2])?.action || null
}

function orderSteps(o: RingOrder): Step[] {
  return [
    ...o.steps.map(s => ({ kind: 'ring' as const, users: [s.userId], seconds: s.seconds, when: 'always' as const })),
    ...(o.thenAll ? [{ kind: 'ring' as const, users: 'all' as const, seconds: o.thenAllSeconds, when: 'always' as const }] : []),
    ...(o.thenForward ? [{ kind: 'forward' as const, target: o.thenForward, when: 'always' as const }] : []),
  ]
}

/**
 * The ring steps for a route. `ringSeconds` is the number's normal ring time
 * (Calls & SMS, floored at 20s as the webhook always has), used wherever a
 * step rings everyone without its own time. Empty: nothing to ring.
 */
export function planFor(c: CallRouting, route: RouteKey, ringSeconds: number): Step[] {
  const all = (when: StepWhen = 'always'): Step => ({ kind: 'ring', users: 'all', seconds: ringSeconds, when })
  if (route === 'main') {
    if (c.strategy === 'in_order') return orderSteps(c.order)
    if (c.strategy === 'forward') {
      const { when, ...target } = c.forward
      // Forward only while closed: open, it rings everyone as usual.
      return when === 'closed'
        ? [{ kind: 'forward', target, when: 'closed' }, all('open')]
        : [{ kind: 'forward', target, when: 'always' }]
    }
    return [all()]
  }
  const a = actionFor(c, route)
  if (!a) return []
  if (a.type === 'ring_all') return [all()]
  if (a.type === 'ring_order') return orderSteps(a.order)
  if (a.type === 'forward') return [{ kind: 'forward', target: a.forward, when: 'always' }]
  return []
}

/** Does deciding this config's calls need the opening hours? */
export function routingNeedsHours(c: CallRouting | null): boolean {
  if (!c) return false
  if (c.strategy === 'menu') return c.afterHours.enabled
  return c.strategy === 'forward' && c.forward.when === 'closed'
}

/** Can any route of this config forward to an outside number? */
export function routingForwards(c: CallRouting | null): boolean {
  if (!c) return false
  const actionForwards = (a: MenuAction) => a.type === 'forward' || (a.type === 'ring_order' && !!a.order.thenForward)
  const menuForwards = (m: Menu) => m.options.some(o => actionForwards(o.action)) || actionForwards(m.defaultAction)
  if (c.strategy === 'forward') return true
  if (c.strategy === 'in_order') return !!c.order.thenForward
  if (c.strategy === 'menu') return menuForwards(c.menu) || (c.afterHours.enabled && menuForwards(c.afterHours.menu))
  return false
}

/** Can the AI receptionist be picked from this config's menu? */
export function routingUsesAi(c: CallRouting | null): boolean {
  if (!c || c.strategy !== 'menu') return false
  const menus = [c.menu, ...(c.afterHours.enabled ? [c.afterHours.menu] : [])]
  return menus.some(m => m.defaultAction.type === 'ai' || m.options.some(o => o.action.type === 'ai'))
}

// ── TwiML ────────────────────────────────────────────────────────────────────

export function xmlEscape(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}
const identityOf = (userId: string) => `u_${String(userId).replace(/[^a-zA-Z0-9_]/g, '')}`

/** What every TwiML builder needs to know about the call. */
export type CallCtx = {
  base: string
  callRowId: string
  companyId: string
  conversationId: string
  callerName: string | null
  contactId: string | null
  /** The caller's number. */
  from: string
  /** The business number they rang. */
  to: string
  businessName: string
}

export const cbQueryOf = (c: Pick<CallCtx, 'callRowId' | 'companyId' | 'conversationId'>) =>
  `callRowId=${encodeURIComponent(c.callRowId || '')}&companyId=${encodeURIComponent(c.companyId)}&conversationId=${encodeURIComponent(c.conversationId || '')}`

/**
 * One team member's <Client>: their browser and app (one Voice-SDK identity
 * per user), with a status callback that records who answered and the
 * parameters the apps show the call with. Exactly as the inbound webhook has
 * always built it.
 */
export function clientXml(c: CallCtx, uid: string): string {
  // A per-agent status callback carrying that agent's user id, so child-status
  // can record which team member answered (and tell everyone else).
  const childCb = `${c.base}/api/twilio/voice/child-status?callRowId=${encodeURIComponent(c.callRowId || '')}&companyId=${encodeURIComponent(c.companyId)}&userId=${encodeURIComponent(uid)}`
  return (
    `<Client statusCallback="${xmlEscape(childCb)}" statusCallbackEvent="initiated ringing answered" statusCallbackMethod="POST">` +
      `<Identity>${xmlEscape(identityOf(uid))}</Identity>` +
      // The calls-row id straight to the browser, so warm transfer can identify
      // the exact call without guessing from CallSids (the client leg's SID
      // doesn't match the parent row).
      `<Parameter name="callRowId" value="${xmlEscape(c.callRowId || '')}"/>` +
      // The agent's Voice-SDK identity (u_<userId>) is company-agnostic, so a
      // teammate in several workspaces gets calls for all of them at one
      // identity. Tag which workspace this call belongs to so the mobile app
      // can switch into the right one before ringing (multi-workspace routing).
      `<Parameter name="companyId" value="${xmlEscape(c.companyId)}"/>` +
      // Who is calling, in words. Android draws the ongoing-call notification
      // from a name the Voice SDK holds, and for an incoming call the only thing
      // it has is the caller id. Always sent, falling back to the number,
      // because the app's template substitutes whatever arrives and an absent
      // parameter would leave the placeholder itself on screen. $ and \ are
      // stripped: the SDK substitutes with String.replaceAll, where both are
      // special in the replacement.
      `<Parameter name="callerName" value="${xmlEscape(String(c.callerName || c.from || '').replace(/[$\\]/g, ' ').trim())}"/>` +
      // Lets the web popup show the caller at once instead of looking the
      // number up again in the browser.
      `<Parameter name="contactId" value="${xmlEscape(c.contactId || '')}"/>` +
      `<Parameter name="callerKnown" value="${c.callerName ? '1' : ''}"/>` +
    `</Client>`
  )
}

type DialOpts = {
  /** Extra query on the Dial's action callback (after &rang=…). */
  routeQuery?: string
  /** false: answer the call first and let Twilio play ringing (ringTone="au"). */
  answerOnBridge?: boolean
}

/** Ring these team members' devices at once: the inbound webhook's <Dial>, unchanged when no options are given. */
export function ringTwiml(c: CallCtx, users: string[], seconds: number, o: DialOpts = {}): string {
  const cbQuery = cbQueryOf(c)
  const recordingCb = `${c.base}/api/twilio/voice/recording?${cbQuery}`
  const soloQuery = users.length === 1 ? `&soloUser=${encodeURIComponent(users[0])}` : ''
  const actionCb = `${c.base}/api/twilio/voice/inbound-status?${cbQuery}${soloQuery}&rang=${users.length}${o.routeQuery || ''}`
  const bridge = o.answerOnBridge === false ? `ringTone="au"` : `answerOnBridge="true"`
  return (
    `<Response>` +
      `<Dial timeout="${seconds}" ${bridge} record="record-from-answer-dual" ` +
        `recordingStatusCallback="${xmlEscape(recordingCb)}" recordingStatusCallbackEvent="completed" ` +
        `action="${xmlEscape(actionCb)}" method="POST">` +
        users.map(uid => clientXml(c, uid)).join('') +
      `</Dial>` +
    `</Response>`
  )
}

/** A valid Australian caller ID to pass through, or null (withheld, overseas, short codes). */
export function passableCallerId(from: string): string | null {
  return /^\+61[2-478]\d{8}$/.test(String(from || '').trim()) ? String(from).trim() : null
}

/**
 * Forward to an outside number. Caller ID: the business's own Colvy number
 * unless the owner asked for the caller's (and it's an Australian number Twilio
 * can present). With screening, whoever answers hears who the call is for and
 * must press 1 (forward-screen); until then the caller keeps hearing ringing,
 * and the phone's own voicemail can't "answer" the call.
 */
export function forwardTwiml(c: CallCtx, t: ForwardTarget, o: DialOpts & { route: RouteKey; step: number }): string {
  const cbQuery = cbQueryOf(c)
  const recordingCb = `${c.base}/api/twilio/voice/recording?${cbQuery}`
  const actionCb = `${c.base}/api/twilio/voice/inbound-status?${cbQuery}&rang=fwd${o.routeQuery || ''}&fwd=1&scr=${t.screen ? 1 : 0}`
  const callerId = (t.callerId === 'caller' && passableCallerId(c.from)) || c.to
  const screenUrl = `${c.base}/api/twilio/voice/forward-screen?${cbQuery}&route=${encodeURIComponent(o.route)}&step=${o.step}&op=ask`
  const bridge = o.answerOnBridge === false ? `ringTone="au"` : `answerOnBridge="true"`
  return (
    `<Response>` +
      `<Dial timeout="${t.seconds}" ${bridge} callerId="${xmlEscape(callerId)}" record="record-from-answer-dual" ` +
        `recordingStatusCallback="${xmlEscape(recordingCb)}" recordingStatusCallbackEvent="completed" ` +
        `action="${xmlEscape(actionCb)}" method="POST">` +
        `<Number${t.screen ? ` url="${xmlEscape(screenUrl)}" method="POST"` : ''}>${xmlEscape(t.number)}</Number>` +
      `</Dial>` +
    `</Response>`
  )
}

/** What the person who answers a screened forward hears. */
export function screenSay(c: Pick<CallCtx, 'businessName' | 'callerName' | 'from'>): string {
  const who = c.callerName ? c.callerName : passableCallerId(c.from) || /^\+\d{6,}$/.test(c.from || '') ? spokenNumber(c.from) : 'a private number'
  return `Call for ${c.businessName || 'your business'} from ${who}. Press 1 to take the call.`
}

export function screenAskTwiml(c: CallCtx, actionUrl: string): string {
  return (
    `<Response>` +
      `<Gather input="dtmf" numDigits="1" timeout="5" actionOnEmptyResult="true" action="${xmlEscape(actionUrl)}" method="POST">` +
        `<Say voice="${MENU_VOICE}" loop="2">${xmlEscape(screenSay(c))}</Say>` +
      `</Gather>` +
      `<Hangup/>` +
    `</Response>`
  )
}

/** Voicemail: the greeting, then record and hand the recording to the recording callback. */
export function voicemailTwiml(base: string, greeting: string, cbQuery: string): string {
  const recCb = `${base}/api/twilio/voice/recording?${cbQuery}&kind=voicemail`
  return (
    `<Response>` +
      `<Say voice="${MENU_VOICE}">${xmlEscape(greeting)}</Say>` +
      `<Record maxLength="180" playBeep="true" trim="trim-silence" recordingStatusCallback="${xmlEscape(recCb)}" recordingStatusCallbackEvent="completed"/>` +
      `<Hangup/>` +
    `</Response>`
  )
}

/** {business} in owner text becomes the business name. */
export const fillBusiness = (text: string, name: string) => String(text || '').replace(/\{\s*(business|company)\s*\}/gi, name || 'us')

/** Everything the caller hears before pressing a key. */
export function menuSpeech(m: Menu, businessName: string): string {
  const greeting = fillBusiness(m.greeting, businessName).trim()
  const prompts = m.announce ? m.options.map(o => `For ${o.label}, press ${o.key}.`) : []
  return [greeting, ...prompts].filter(Boolean).join(' ')
}

/** The menu: greeting and options inside a one-key <Gather>; no key goes to the same action (actionOnEmptyResult). */
export function menuTwiml(c: CallCtx, m: Menu, which: 'main' | 'ah', o: { attempt: number; plays?: number; prefix?: string }): string {
  const action = `${c.base}/api/twilio/voice/menu?${cbQueryOf(c)}&m=${which}&op=pick&try=${o.attempt}&n=${o.plays || 1}`
  const say = [o.prefix || '', menuSpeech(m, c.businessName)].filter(Boolean).join(' ')
  return (
    `<Response>` +
      `<Gather input="dtmf" numDigits="1" timeout="${m.timeout}" actionOnEmptyResult="true" action="${xmlEscape(action)}" method="POST">` +
        `<Say voice="${MENU_VOICE}">${xmlEscape(say)}</Say>` +
      `</Gather>` +
      // Only reached if Twilio didn't post the empty result itself.
      `<Redirect method="POST">${xmlEscape(action)}</Redirect>` +
    `</Response>`
  )
}

/** Back to the menu from a message (counted, so a caller can't be kept looping forever). */
export function menuReplayUrl(c: CallCtx, which: 'main' | 'ah', plays: number): string {
  return `${c.base}/api/twilio/voice/menu?${cbQueryOf(c)}&m=${which}&op=play&n=${plays}`
}
export const MAX_MENU_PLAYS = 6

export function sayThenTwiml(say: string, then: { replayUrl?: string } = {}): string {
  return (
    `<Response>` +
      `<Say voice="${MENU_VOICE}">${xmlEscape(say)}</Say>` +
      (then.replayUrl ? `<Redirect method="POST">${xmlEscape(then.replayUrl)}</Redirect>` : `<Hangup/>`) +
    `</Response>`
  )
}

/** Hand the call to the usual "nobody answered" handling (inbound-status), when a route has nobody to ring. */
export function nobodyTwiml(c: CallCtx, route: RouteKey): string {
  const url = `${c.base}/api/twilio/voice/inbound-status?${cbQueryOf(c)}&rang=0&route=${encodeURIComponent(route)}&nobody=1`
  return `<Response><Redirect method="POST">${xmlEscape(url)}</Redirect></Response>`
}

// ── Running a plan ───────────────────────────────────────────────────────────

export type StepState = {
  /** Team members who can be rung right now, in the order the webhook rings them. */
  ringable: string[]
  /** Closed now by the opening hours (null: can't tell, treated as open). */
  closedNow: boolean | null
  /** Forwarding allowed for this business right now (plan, Colvy's switch). */
  forwardAllowed: boolean
  /** The call was already answered (a menu played), so Twilio plays the ringing. */
  answered: boolean
}

export type StepResult = {
  index: number
  step: Step
  twiml: string
  /** Who this step rings (team members), or the outside number. */
  ringUsers: string[]
  forwardTo: string | null
}

const whenOk = (w: StepWhen, closedNow: boolean | null) => w === 'always' || (w === 'closed' ? closedNow === true : closedNow !== true)

/** Who a ring step rings right now: its people who are ringable, in the step's order (or everyone ringable). */
export function stepUsers(step: Extract<Step, { kind: 'ring' }>, ringable: string[]): string[] {
  if (step.users === 'all') return ringable
  const can = new Set(ringable)
  return step.users.filter(u => can.has(u))
}

/** Seconds of ringing before step `i` starts (at most: skipped steps count). */
export function offsetOf(steps: Step[], i: number): number {
  return steps.slice(0, i).reduce((a, s) => a + (s.kind === 'ring' ? s.seconds : s.target.seconds), 0)
}

/**
 * The first step from `from` on that can run now, as TwiML: a ring step with
 * someone to ring, or a forward that applies now, is allowed, and isn't to the
 * number that was rung. null: nothing left, so the usual fallback runs.
 */
export function nextStep(c: CallCtx, steps: Step[], from: number, route: RouteKey, s: StepState): StepResult | null {
  const to = String(c.to || '').replace(/\D/g, '')
  for (let i = Math.max(0, from); i < steps.length; i++) {
    const step = steps[i]
    if (!whenOk(step.when, s.closedNow)) continue
    const answerOnBridge = !s.answered && offsetOf(steps, i) < BRIDGE_ANSWER_LIMIT
    const routeQuery = `&route=${encodeURIComponent(route)}&step=${i}`
    if (step.kind === 'ring') {
      const users = stepUsers(step, s.ringable)
      if (!users.length) continue
      return { index: i, step, ringUsers: users, forwardTo: null, twiml: ringTwiml(c, users, step.seconds, { routeQuery, answerOnBridge }) }
    }
    if (!step.target.number || step.target.number.replace(/\D/g, '') === to) continue
    // Forwarding switched off for this business (plan, or Colvy's switch):
    // the step rings the team instead, so the call still reaches someone.
    if (!s.forwardAllowed) {
      if (!s.ringable.length) continue
      return { index: i, step, ringUsers: s.ringable, forwardTo: null, twiml: ringTwiml(c, s.ringable, Math.max(step.target.seconds, 20), { routeQuery, answerOnBridge }) }
    }
    return { index: i, step, ringUsers: [], forwardTo: step.target.number, twiml: forwardTwiml(c, step.target, { routeQuery, answerOnBridge, route, step: i }) }
  }
  return null
}

// ── What a call did, in words ────────────────────────────────────────────────

/** A step for the call's routing trail: "Rang 2 people", "Forwarded to 0412 345 678". */
export function stepLabel(r: Pick<StepResult, 'ringUsers' | 'forwardTo'>): string {
  if (r.forwardTo) return `Forwarded to ${formatAu(r.forwardTo)}`
  return `Rang ${r.ringUsers.length === 1 ? '1 person' : `${r.ringUsers.length} people`}`
}

/**
 * What routing did on a call, for the call card and history: from V399's
 * columns, or the routing note on routing_state when they aren't there.
 */
export function callRoutingFacts(call: any): { choice: string | null; box: string | null; forwardedTo: string | null; forwardedSeconds: number | null; path: string | null } {
  const note = call?.routing_state?.routing || {}
  const choice = call?.ivr_choice || (note.choice ? choiceLabel(note.choice.key, note.choice.label) : null)
  const forwardedTo = call?.forwarded_to || (note.forward?.accepted || note.forward?.seconds ? note.forward?.to : null) || null
  const secs = call?.forwarded_seconds ?? note.forward?.seconds
  return {
    choice: choice || null,
    box: call?.voicemail_box || note.voicemailBox || null,
    forwardedTo: forwardedTo ? formatAu(forwardedTo) : null,
    forwardedSeconds: typeof secs === 'number' ? secs : null,
    path: call?.routing_path || (Array.isArray(note.path) && note.path.length ? note.path.join(' → ') : null),
  }
}

/** "Pressed 2 · Support" for the call card and history. */
export function choiceLabel(key: string | null | undefined, label: string | null | undefined): string {
  if (!key) return label ? `No key pressed · ${label}` : 'No key pressed'
  return `Pressed ${key}${label ? ` · ${label}` : ''}`
}

// ── The settings card's summary ──────────────────────────────────────────────

type SummaryOpts = {
  names?: Record<string, string>
  /** The number's normal ring time. */
  ringSeconds?: number
  voicemailEnabled?: boolean
  /** The AI receptionist answers when nobody picks up. */
  aiOnNoAnswer?: boolean
}

const nameOf = (o: SummaryOpts, id: string) => o.names?.[id] || 'a team member'

function fallbackWords(o: SummaryOpts): string {
  if (o.aiOnNoAnswer) return 'the AI receptionist answers'
  return o.voicemailEnabled === false ? 'it’s a missed call' : 'voicemail'
}

function orderWords(order: RingOrder, o: SummaryOpts): string {
  const parts = order.steps.map(s => `${nameOf(o, s.userId)} for ${s.seconds}s`)
  if (order.thenAll) parts.push(`everyone for ${order.thenAllSeconds}s`)
  if (order.thenForward) parts.push(`forward to ${formatAu(order.thenForward.number)}`)
  if (!parts.length) return 'everyone'
  const [first, ...rest] = parts
  return `${first}${rest.map(p => `, then ${p}`).join('')}`
}

function actionWords(a: MenuAction, o: SummaryOpts): string {
  switch (a.type) {
    case 'ring_all': return 'rings everyone'
    case 'ring_order': return `rings ${orderWords(a.order, o)}`
    case 'forward': return `forwards to ${formatAu(a.forward.number)}`
    case 'voicemail': return 'goes to voicemail'
    case 'ai': return 'goes to the AI receptionist'
    case 'message': return a.then === 'hangup' ? 'plays a message and ends the call' : 'plays a message, then the menu again'
    case 'sms': return a.then === 'hangup' ? 'texts the caller and ends the call' : 'texts the caller, then the menu again'
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** One plain-English line: what happens when someone calls this number. */
export function routingSummary(c: CallRouting, o: SummaryOpts = {}): string {
  const ring = Math.max(20, Number(o.ringSeconds) || 25)
  const after = `Nobody answers → ${fallbackWords(o)}.`
  switch (c.strategy) {
    case 'simultaneous':
      return `Calls ring everyone available at once for ${ring}s. ${after}`
    case 'in_order':
      return `Calls ring ${orderWords(c.order, o)}. ${after}`
    case 'forward': {
      const to = formatAu(c.forward.number) || 'your mobile'
      const screen = c.forward.screen ? ' (they press 1 to take it)' : ''
      return c.forward.when === 'closed'
        ? `While you’re open, calls ring everyone at once for ${ring}s. When you’re closed, they forward to ${to} for ${c.forward.seconds}s${screen}. ${after}`
        : `Calls forward to ${to} for ${c.forward.seconds}s${screen}. ${after}`
    }
    case 'menu': {
      const opts = c.menu.options.map(x => `${x.key} ${actionWords(x.action, o)}`).join('; ')
      const def = `No key → ${actionWords(c.menu.defaultAction, o).replace(/^goes to /, '')}`
      const ah = c.afterHours.enabled ? ' When you’re closed, callers hear your after-hours menu instead.' : ''
      return `Callers hear your menu: ${opts || 'no options yet'}. ${cap(def)}.${ah} If a ring step isn’t answered → ${fallbackWords(o)}.`
    }
  }
}
