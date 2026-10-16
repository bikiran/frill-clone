/**
 * Forms logic engine.
 *
 * One pure module (no React, no Supabase, no DOM) that every forms surface
 * shares: the builder, the Logic modal, the public form, Results, Colvy AI and
 * the integrations. It decides
 *   - which questions a person sees (display rules, hidden choices, branching),
 *   - what the calculation variables add up to,
 *   - what gets submitted (only answers on the path, plus `__logic`),
 *   - and how Results summarise paths, branches and variables.
 *
 * Everything is derived from the answers, never accumulated, so going back and
 * changing an answer re-projects the rest of the form and can't double-count.
 *
 * Storage (all existing JSONB, no migration):
 *   questions[].conditional_logic  "Question display" (legacy key, widened operators)
 *   questions[].choice_logic       "Hide answer choices"
 *   questions[].branching          "Branching"
 *   questions[].calculations       "Calculations"
 *   forms.theme.variables / .welcome / .listMode
 *   form_responses.answers.__logic  path, variables, branches taken (ResponseLogic)
 *
 * Choices have no ids, so rules and answers refer to choices by label.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type Operator =
  | 'equals' | 'not_equals'          // "is" / "is not"
  | 'contains' | 'not_contains'      // text contains (substring, case-sensitive, legacy)
  | 'includes' | 'not_includes'      // multi-select / matrix: exact label membership
  | 'is_empty' | 'is_not_empty'      // "is not answered" / "is answered"
  | 'gt' | 'gte' | 'lt' | 'lte'      // numbers, ratings, scales, NPS, dates, variables

export type LogicRule = {
  questionId: string     // source question id; '' when the rule is on a variable
  variableId?: string    // when set (non-empty), the rule compares this variable and questionId is ignored
  operator: Operator     // legacy rows only ever hold 'equals' | 'contains' | 'is_empty'
  value: string          // ALWAYS a string in storage. Numbers are stored as "7", choices by label.
}

export type ConditionGroup = { logic: 'all' | 'any'; rules: LogicRule[] }

export type DisplayLogic = ConditionGroup & { condition: 'show' | 'hide' }

export type ChoiceRule = ConditionGroup & {
  id: string            // short random id (newLogicId())
  choices: string[]     // option labels to HIDE when the conditions match
}

export type JumpTarget =
  | { kind: 'next' }                          // next visible question in form order
  | { kind: 'end' }                           // thank-you screen
  | { kind: 'question'; questionId: string }  // a LATER question

export type BranchRule = ConditionGroup & { id: string; to: JumpTarget }
export type Branching = { rules: BranchRule[]; otherwise?: JumpTarget }   // otherwise defaults to { kind:'next' }

export type CalcWhen =
  | { kind: 'answered' }
  | { kind: 'choice'; choice: string }
  | ({ kind: 'conditions' } & ConditionGroup)

export type CalcOp = {
  id: string
  variableId: string
  op: 'add' | 'subtract' | 'multiply' | 'divide' | 'set'
  amount: number
  useAnswer?: boolean
  when: CalcWhen
}

export type FormQuestion = {
  id: string; type: string; title: string; description: string; required: boolean
  options?: string[]; multiSelect?: boolean; optionImages?: string[]
  matrixRows?: string[]; matrixCols?: string[]
  amountCents?: number; currency?: string; schedule?: Record<string, unknown>
  mediaUrl?: string; mediaType?: 'image' | 'video'; fileAccept?: string
  conditional_logic?: DisplayLogic
  choice_logic?: ChoiceRule[]
  branching?: Branching
  calculations?: CalcOp[]
  [key: string]: unknown
}

export type FormVariable = {
  id: string        // /^[a-z][a-z0-9_]{0,23}$/, unique, immutable after creation
  label: string
  initial: number
}

export type WelcomeSettings = {
  showTimeToComplete?: boolean
  showResponseCount?: boolean
  buttonText?: string
  mediaUrl?: string
  mediaType?: 'image' | 'video'
}

export type FormTheme = {
  color?: string; background?: string
  welcome?: WelcomeSettings
  variables?: FormVariable[]
  listMode?: boolean
  [key: string]: unknown
}

export const RESPONSE_LOGIC_KEY = '__logic'

export type ResponseLogic = {
  v: 1
  path: string[]
  completed: true
  ending: 'default'
  endedBy: 'last' | 'jump'
  variables: Record<string, number>
  branches?: Record<string, string>
  hiddenChoices?: Record<string, string[]>
  offPath?: string[]
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const CHOICE_TYPES = ['multiple_choice', 'dropdown', 'checkbox', 'picture_choice', 'ranking'] as const
export const NUMERIC_TYPES = ['number', 'rating', 'opinion_scale', 'nps'] as const
export const MAX_BUTTON_TEXT = 24
export const DEFAULT_SCORE_VARIABLE: FormVariable = { id: 'score', label: 'Score', initial: 0 }

const VARIABLE_ID_RE = /^[a-z][a-z0-9_]{0,23}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EPS = 1e-9
const MAX_LOGIC_ITEMS = 500

const ALL_OPERATORS: Operator[] = [
  'equals', 'not_equals', 'contains', 'not_contains', 'includes', 'not_includes',
  'is_empty', 'is_not_empty', 'gt', 'gte', 'lt', 'lte',
]
const LEGACY_OPERATORS: Operator[] = ['equals', 'contains', 'is_empty']
const VALUELESS_OPERATORS: Operator[] = ['is_empty', 'is_not_empty']
const CALC_OPS = ['add', 'subtract', 'multiply', 'divide', 'set']

// ─── Small internals ────────────────────────────────────────────────────────

function isObj(v: unknown): v is Record<string, any> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}
function isPlainObject(v: unknown): v is Record<string, any> {
  if (!isObj(v)) return false
  const p = Object.getPrototypeOf(v)
  return p === Object.prototype || p === null
}
function has(o: object, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k)
}
function isChoiceType(type: unknown): boolean {
  return (CHOICE_TYPES as readonly string[]).includes(type as string)
}
function isNumericType(type: unknown): boolean {
  return (NUMERIC_TYPES as readonly string[]).includes(type as string)
}
function isKnownOperator(op: unknown): op is Operator {
  return (ALL_OPERATORS as unknown[]).includes(op)
}
function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6
}
/** Rule objects only; anything else stored in `rules` is ignored. */
function rulesOf(group: unknown): LogicRule[] {
  if (!isObj(group) || !Array.isArray(group.rules)) return []
  return group.rules.filter(isObj) as LogicRule[]
}
function arr<T = any>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}
function optionsOf(q: FormQuestion | undefined): string[] {
  return arr(q?.options).map(o => (typeof o === 'string' ? o : String(o)))
}
function isVariableRule(rule: LogicRule): boolean {
  return typeof rule.variableId === 'string' && rule.variableId !== ''
}
function questionAt(form: LogicForm, id: string): FormQuestion | undefined {
  const i = typeof id === 'string' && has(form.indexOf, id) ? form.indexOf[id] : undefined
  return i === undefined ? undefined : form.questions[i]
}
function indexIn(form: LogicForm, id: unknown): number {
  return typeof id === 'string' && has(form.indexOf, id) ? form.indexOf[id] : -1
}
function validTarget(t: unknown): t is JumpTarget {
  if (!isObj(t)) return false
  if (t.kind === 'next' || t.kind === 'end') return true
  return t.kind === 'question' && typeof t.questionId === 'string'
}
function branchRulesOf(q: FormQuestion): BranchRule[] {
  return isObj(q.branching) ? (arr(q.branching.rules).filter(isObj) as BranchRule[]) : []
}
function otherwiseOf(q: FormQuestion): JumpTarget | undefined {
  return isObj(q.branching) && validTarget(q.branching.otherwise) ? q.branching.otherwise : undefined
}
/** Branching counts as configured when it has a rule or a non-default "otherwise". */
function hasBranching(q: FormQuestion): boolean {
  const o = otherwiseOf(q)
  return branchRulesOf(q).length > 0 || (!!o && o.kind !== 'next')
}

/** null / undefined / objects → '', numbers and booleans → their text. */
function textOf(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v)
  return ''
}

// ─── 2.1 Normalising ────────────────────────────────────────────────────────

export type LogicForm = { questions: FormQuestion[]; variables: FormVariable[]; indexOf: Record<string, number> }

/**
 * The engine's view of a form. Never drops a renderable question: an id-less
 * question becomes `q_index_<i>` and a duplicate id becomes `<id>_dup<i>`
 * (engine view only; the stored form is untouched). A non-string `title` or
 * `description` becomes a string ('' for null/missing). Every consumer that walks
 * questions in order uses `LogicForm.questions`, never `form.questions`.
 */
export function readFormLogic(form: { questions?: unknown; theme?: unknown } | null | undefined): LogicForm {
  const raw = isObj(form) && Array.isArray(form.questions) ? form.questions : []
  const questions: FormQuestion[] = []
  const indexOf: Record<string, number> = Object.create(null)
  raw.forEach((item: unknown, i: number) => {
    if (!isObj(item)) return
    let q = item as FormQuestion
    let id = typeof q.id === 'string' && q.id !== '' ? q.id : `q_index_${i}`
    if (has(indexOf, id)) id = `${id}_dup${i}`
    while (has(indexOf, id)) id = `${id}_dup${i}`
    if (id !== q.id) q = { ...q, id }
    // title / description are typed as strings; a number or null from an API or
    // a manual edit would crash readers that call .trim(). Copy only when needed.
    if (typeof q.title !== 'string') q = { ...q, title: textOf(q.title) }
    if (typeof q.description !== 'string') q = { ...q, description: textOf(q.description) }
    indexOf[id] = questions.length
    questions.push(q)
  })

  const theme = isObj(form) && isObj(form.theme) ? form.theme : {}
  const variables: FormVariable[] = []
  const seen = new Set<string>()
  for (const v of arr(theme.variables)) {
    if (!isObj(v) || typeof v.id !== 'string' || !VARIABLE_ID_RE.test(v.id) || seen.has(v.id)) continue
    seen.add(v.id)
    const n = toNum(v.initial)
    variables.push({
      id: v.id,
      label: typeof v.label === 'string' && v.label.trim() ? v.label : v.id,
      initial: Number.isFinite(n) ? n : 0,
    })
  }
  return { questions, variables, indexOf }
}

/** Welcome-screen settings with defaults: time ON, count OFF, "Start", no media. */
export function resolveWelcome(theme: unknown): { showTimeToComplete: boolean; showResponseCount: boolean; buttonText: string; mediaUrl?: string; mediaType?: 'image' | 'video' } {
  const w = isObj(theme) && isObj(theme.welcome) ? theme.welcome : {}
  const text = typeof w.buttonText === 'string' ? w.buttonText.trim().slice(0, MAX_BUTTON_TEXT).trim() : ''
  const out: ReturnType<typeof resolveWelcome> = {
    showTimeToComplete: w.showTimeToComplete !== false,
    showResponseCount: w.showResponseCount === true,
    buttonText: text || 'Start',
  }
  if (typeof w.mediaUrl === 'string' && w.mediaUrl.trim() && (w.mediaType === 'image' || w.mediaType === 'video')) {
    out.mediaUrl = w.mediaUrl.trim()
    out.mediaType = w.mediaType
  }
  return out
}

/** True only when the owner chose "List view" (theme.listMode). `display_style` is not used. */
export function isListMode(form: { theme?: unknown } | null | undefined): boolean {
  return isObj(form) && isObj(form.theme) && form.theme.listMode === true
}

export function newLogicId(): string {
  let id = ''
  while (id.length < 8) id += Math.random().toString(36).slice(2, 10)
  return id.slice(0, 8)
}

/** Offers the default "score" variable when the form doesn't define one. */
export function withDefaultScore(vars: FormVariable[]): FormVariable[] {
  const list = arr<FormVariable>(vars)
  return list.some(v => v && v.id === 'score') ? list : [{ ...DEFAULT_SCORE_VARIABLE }, ...list]
}

// ─── 2.2 Value kinds and operators ──────────────────────────────────────────

export type ValueKind = 'text' | 'choice' | 'multi' | 'yesno' | 'legal' | 'number' | 'date' | 'presence' | 'none'

const TEXT_TYPES = ['short_text', 'long_text', 'email', 'phone', 'address', 'website', 'contact_info']
const PRESENCE_TYPES = ['ranking', 'matrix', 'file_upload', 'video_audio', 'signature', 'payment', 'scheduler']

export function valueKindOf(q: FormQuestion | undefined): ValueKind {
  if (!isObj(q)) return 'none'
  const t = q.type
  if (t === 'statement') return 'none'
  if (t === 'multiple_choice') return q.multiSelect ? 'multi' : 'choice'
  if (t === 'dropdown' || t === 'picture_choice') return 'choice'
  if (t === 'checkbox') return 'multi'
  if (t === 'yes_no') return 'yesno'
  if (t === 'legal') return 'legal'
  if (isNumericType(t)) return 'number'
  if (t === 'date') return 'date'
  if (PRESENCE_TYPES.includes(t)) return 'presence'
  // Text types, plus any type this version doesn't know (stored as a string at worst).
  return 'text'
}

/** Options for choice types, ['Yes','No'] for yes/no, else []. */
export function choicesOf(q: FormQuestion | undefined): string[] {
  if (!isObj(q)) return []
  if (q.type === 'yes_no') return ['Yes', 'No']
  return isChoiceType(q.type) ? optionsOf(q) : []
}

const OPERATORS_BY_KIND: Record<ValueKind | 'variable', Operator[]> = {
  text: ['equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty'],
  choice: ['equals', 'not_equals', 'is_empty', 'is_not_empty'],
  multi: ['includes', 'not_includes', 'is_empty', 'is_not_empty'],
  yesno: ['equals', 'not_equals', 'is_empty', 'is_not_empty'],
  legal: ['is_not_empty', 'is_empty'],
  number: ['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty'],
  date: ['equals', 'not_equals', 'gt', 'lt', 'is_empty', 'is_not_empty'],
  presence: ['is_not_empty', 'is_empty'],
  none: [],
  variable: ['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte'],
}

/** Operators the Logic modal offers for a source of this kind. */
export function operatorsFor(kind: ValueKind | 'variable'): Operator[] {
  return [...(OPERATORS_BY_KIND[kind] || [])]
}

export function operatorLabel(op: Operator, kind: ValueKind | 'variable'): string {
  switch (op) {
    case 'equals':
      return kind === 'multi' || kind === 'legal' || kind === 'presence' ? 'is exactly' : 'is'
    case 'not_equals': return 'is not'
    case 'contains': return kind === 'text' ? 'contains' : 'contains text'
    case 'not_contains': return kind === 'text' ? 'does not contain' : 'does not contain text'
    case 'includes': return 'includes'
    case 'not_includes': return 'does not include'
    case 'is_empty':
      if (kind === 'text') return 'is empty'
      if (kind === 'legal') return 'is not accepted'
      return 'is not answered'
    case 'is_not_empty':
      if (kind === 'text') return 'is not empty'
      if (kind === 'legal') return 'is accepted'
      return 'is answered'
    case 'gt': return kind === 'date' ? 'is after' : 'is more than'
    case 'gte': return kind === 'date' ? 'is on or after' : 'is at least'
    case 'lt': return kind === 'date' ? 'is before' : 'is less than'
    case 'lte': return kind === 'date' ? 'is on or before' : 'is at most'
    default: return String(op)
  }
}

/** undefined | null | blank string | [] | plain object with no keys. 0 and false are answers. */
export function isBlankAnswer(v: unknown): boolean {
  if (v === undefined || v === null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  if (isPlainObject(v)) return Object.keys(v).length === 0
  return false
}

/**
 * The only way the engine turns a value into a number. Unlike Number(),
 * '' / null / booleans / arrays are NaN, so an unfinished rule can't "equal 0".
 */
export function toNum(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
  if (typeof v === 'string') {
    const s = v.trim()
    if (s === '') return NaN
    const n = Number(s)
    return Number.isFinite(n) ? n : NaN
  }
  return NaN
}

// ─── 2.3 Evaluating conditions ──────────────────────────────────────────────

export type Answers = Record<string, unknown>
export type Vars = Record<string, number>
export type EvalContext = { form: LogicForm; answers: Answers; variables: Vars }

function compare(op: Operator, x: number, y: number): boolean {
  switch (op) {
    case 'gt': return x > y
    case 'gte': return x >= y
    case 'lt': return x < y
    case 'lte': return x <= y
    default: return false
  }
}

export function evaluateRule(rule: LogicRule, ctx: EvalContext): boolean {
  if (!isObj(rule)) return false
  const op = rule.operator
  const value = rule.value

  // 1. Variable rule
  if (isVariableRule(rule)) {
    const vars = isObj(ctx.variables) ? ctx.variables : {}
    const v = has(vars, rule.variableId!) ? toNum(vars[rule.variableId!]) : NaN
    const n = toNum(value)
    if (!Number.isFinite(v) || !Number.isFinite(n)) return op === 'not_equals'
    switch (op) {
      case 'equals': return Math.abs(v - n) < EPS
      case 'not_equals': return !(Math.abs(v - n) < EPS)
      case 'gt': case 'gte': case 'lt': case 'lte': return compare(op, v, n)
      default: return false
    }
  }

  // Unknown operators keep the legacy default (true) whether or not the answer is blank.
  if (!isKnownOperator(op)) return true

  // 2. Question rule. The engine passes effective path answers only.
  const answers = isObj(ctx.answers) ? ctx.answers : {}
  const a = typeof rule.questionId === 'string' && has(answers, rule.questionId) ? answers[rule.questionId] : undefined
  const q = ctx.form ? questionAt(ctx.form, rule.questionId) : undefined

  // 3. Blank answer
  if (isBlankAnswer(a)) {
    return op === 'is_empty' || op === 'not_equals' || op === 'not_contains' || op === 'not_includes'
  }

  // 4. Non-blank answer
  const equals = () => {
    if (q && isNumericType(q.type)) {
      const x = toNum(a), y = toNum(value)
      if (Number.isFinite(x) && Number.isFinite(y)) return Math.abs(x - y) < EPS
    }
    return String(a) === String(value)
  }
  const contains = () => Array.isArray(a)
    ? a.some(x => String(x).includes(value))
    : String(a).includes(value)
  const includes = () => {
    const list = Array.isArray(a) ? a : isPlainObject(a) ? Object.values(a) : [a]
    return list.some(x => String(x) === String(value))
  }
  switch (op) {
    case 'equals': return equals()
    case 'not_equals': return !equals()
    case 'contains': return contains()
    case 'not_contains': return !contains()
    case 'includes': return includes()
    case 'not_includes': return !includes()
    case 'is_empty': return false
    case 'is_not_empty': return true
    case 'gt': case 'gte': case 'lt': case 'lte': {
      if (typeof a === 'string' && typeof value === 'string' && DATE_RE.test(a) && DATE_RE.test(value)) {
        const x = a.slice(0, 10), y = value.slice(0, 10)
        return op === 'gt' ? x > y : op === 'gte' ? x >= y : op === 'lt' ? x < y : x <= y
      }
      const x = toNum(a), y = toNum(value)
      if (Number.isFinite(x) && Number.isFinite(y)) return compare(op, x, y)
      return false
    }
  }
  return true
}

/**
 * No group / no rules → whenEmpty. `logic === 'all'` → every rule, anything
 * else → any (legacy). Never throws on malformed stored data.
 */
export function evaluateGroup(group: ConditionGroup | undefined, ctx: EvalContext, whenEmpty: boolean): boolean {
  const rules = rulesOf(group)
  if (rules.length === 0) return whenEmpty
  return (group as ConditionGroup).logic === 'all'
    ? rules.every(r => evaluateRule(r, ctx))
    : rules.some(r => evaluateRule(r, ctx))
}

// ─── 2.4 Display and visible choices ────────────────────────────────────────

export function isDisplayed(q: FormQuestion, ctx: EvalContext): boolean {
  const cl = isObj(q) ? q.conditional_logic : undefined
  if (!isObj(cl) || rulesOf(cl).length === 0) return true
  const met = evaluateGroup(cl as DisplayLogic, ctx, true)
  return cl.condition === 'show' ? met : !met   // anything not 'show' behaves as 'hide' (legacy)
}

/** Labels hidden by "Hide answer choices" (choice types only), in option order. */
export function hiddenChoiceLabels(q: FormQuestion, ctx: EvalContext): string[] {
  if (!isObj(q) || !isChoiceType(q.type)) return []
  const hidden = new Set<string>()
  for (const r of arr(q.choice_logic)) {
    if (!isObj(r) || !evaluateGroup(r as ChoiceRule, ctx, false)) continue
    for (const c of arr(r.choices)) if (typeof c === 'string') hidden.add(c)
  }
  if (!hidden.size) return []
  const out: string[] = []
  for (const o of optionsOf(q)) if (hidden.has(o) && !out.includes(o)) out.push(o)
  return out
}

/** Options in order minus hidden ones; `index` is the ORIGINAL option index. */
export function visibleChoices(q: FormQuestion, ctx: EvalContext): { label: string; index: number }[] {
  const hidden = hiddenChoiceLabels(q, ctx)
  return optionsOf(q)
    .map((label, index) => ({ label, index }))
    .filter(c => !hidden.includes(c.label))
}

// ─── 2.5 Walking the form ───────────────────────────────────────────────────

export type PathResult = {
  path: string[]
  answers: Answers
  variables: Vars
  variablesBefore: Record<string, Vars>
  branches: Record<string, string>
  hiddenChoices: Record<string, string[]>
  visibleChoices: Record<string, { label: string; index: number }[]>
  endedBy: 'last' | 'jump'
}

export function initialVariables(form: LogicForm): Vars {
  const out: Vars = {}
  for (const v of form.variables) out[v.id] = v.initial
  return out
}

/** Runs this question's calculations (in order) on a copy of ctx.variables. */
export function applyCalculations(q: FormQuestion, ctx: EvalContext): Vars {
  const vars: Vars = { ...(ctx.variables || {}) }
  const ops = isObj(q) ? arr(q.calculations) : []
  if (!ops.length) return vars
  const known = new Set(ctx.form.variables.map(v => v.id))
  const answers = ctx.answers || {}
  const ans = has(answers, q.id) ? answers[q.id] : undefined
  for (const op of ops) {
    if (!isObj(op) || typeof op.variableId !== 'string' || !known.has(op.variableId)) continue
    const when = op.when
    let applies = false
    if (isObj(when)) {
      if (when.kind === 'answered') applies = q.type !== 'statement' && !isBlankAnswer(ans)
      else if (when.kind === 'choice') applies = typeof when.choice === 'string' && (ans === when.choice || (Array.isArray(ans) && ans.includes(when.choice)))
      else if (when.kind === 'conditions') applies = evaluateGroup(when as ConditionGroup, { form: ctx.form, answers, variables: vars }, false)
    }
    if (!applies) continue
    const amount = op.useAnswer && isNumericType(q.type) ? toNum(ans) : toNum(op.amount)
    if (!Number.isFinite(amount)) continue
    const cur = toNum(vars[op.variableId])
    const base = Number.isFinite(cur) ? cur : 0
    let next: number
    switch (op.op) {
      case 'add': next = base + amount; break
      case 'subtract': next = base - amount; break
      case 'multiply': next = base * amount; break
      case 'divide': if (amount === 0) continue; next = base / amount; break
      case 'set': next = amount; break
      default: continue
    }
    if (Number.isFinite(next)) vars[op.variableId] = round6(next)
  }
  return vars
}

/** First matching branch rule with a valid forward target, else otherwise, else next. */
function branchTarget(q: FormQuestion, ctx: EvalContext, currentIndex: number): { to: JumpTarget; ruleId: string } {
  const ok = (t: unknown): t is JumpTarget => {
    if (!validTarget(t)) return false
    if (t.kind !== 'question') return true
    return indexIn(ctx.form, t.questionId) > currentIndex
  }
  for (const r of branchRulesOf(q)) {
    if (rulesOf(r).length === 0) continue
    if (!evaluateGroup(r, ctx, false)) continue
    if (!ok(r.to)) continue
    return { to: r.to, ruleId: typeof r.id === 'string' ? r.id : '' }
  }
  const o = otherwiseOf(q)
  return { to: o && ok(o) ? o : { kind: 'next' }, ruleId: 'otherwise' }
}

/** Removes hidden labels from a choice answer (single → undefined, arrays filtered, [] → undefined). */
function sanitizeAnswer(v: unknown, q: FormQuestion, hidden: string[]): unknown {
  if (!isChoiceType(q.type) || !hidden.length || v === undefined) return v
  if (Array.isArray(v)) {
    const kept = v.filter(x => !hidden.includes(x as string))
    return kept.length ? kept : undefined
  }
  return hidden.includes(v as string) ? undefined : v
}

/**
 * For the time estimate only: whether this question's branching depends on
 * something the person hasn't answered yet. Then it can't be known where they
 * will go, and a rule that happens to match a blank answer ("if Q1 is not Yes
 * → End") must not shorten the estimate. Sources that stay blank whatever the
 * person does (deleted, later or skipped questions, statements) are decided.
 * Variable rules are decided once this question is answered (or is a statement).
 */
function branchingUndecided(form: LogicForm, q: FormQuestion, index: number, eff: Answers, onPath: Set<string>): boolean {
  for (const r of branchRulesOf(q)) {
    for (const rule of rulesOf(r)) {
      if (isVariableRule(rule)) {
        if (q.type !== 'statement' && !has(eff, q.id)) return true
        continue
      }
      const src = indexIn(form, rule.questionId)
      if (src === -1 || src > index || !onPath.has(rule.questionId)) continue
      if (valueKindOf(form.questions[src]) === 'none') continue
      if (!has(eff, rule.questionId)) return true
    }
  }
  return false
}

/**
 * The path a person takes through the form for these answers. Deterministic,
 * O(questions × rules), and it can't loop: the index only ever increases.
 */
export function computePath(form: LogicForm, rawAnswers: Answers): PathResult {
  return walkPath(form, rawAnswers, false)
}

/** The walk behind computePath. `estimate` follows only branching that is already decided (estimateMinutes). */
function walkPath(form: LogicForm, rawAnswers: Answers, estimate: boolean): PathResult {
  const raw = isObj(rawAnswers) ? rawAnswers : {}
  const qs = form.questions
  let vars = initialVariables(form)
  const path: string[] = []
  const eff: Answers = {}
  const variablesBefore: Record<string, Vars> = {}
  const branches: Record<string, string> = {}
  const hiddenChoices: Record<string, string[]> = {}
  const visible: Record<string, { label: string; index: number }[]> = {}
  let endedBy: 'last' | 'jump' = 'last'
  let i = 0
  while (i < qs.length) {
    const q = qs[i]
    const ctx: EvalContext = { form, answers: eff, variables: vars }
    if (!isDisplayed(q, ctx)) { i++; continue }
    const hidden = hiddenChoiceLabels(q, ctx)
    const vis = visibleChoices(q, ctx)
    const choice = isChoiceType(q.type)
    if (choice && optionsOf(q).length > 0 && vis.length === 0) { i++; continue }
    path.push(q.id)
    variablesBefore[q.id] = { ...vars }
    if (hidden.length) hiddenChoices[q.id] = hidden
    if (choice) visible[q.id] = vis
    const v = sanitizeAnswer(has(raw, q.id) ? raw[q.id] : undefined, q, hidden)
    if (!isBlankAnswer(v)) eff[q.id] = v
    vars = applyCalculations(q, { form, answers: eff, variables: vars })
    if (estimate && branchingUndecided(form, q, i, eff, new Set(path))) { i++; continue }
    const t = branchTarget(q, { form, answers: eff, variables: vars }, i)
    if (hasBranching(q)) branches[q.id] = t.ruleId
    if (t.to.kind === 'end') { endedBy = 'jump'; break }
    if (t.to.kind === 'question') { i = form.indexOf[t.to.questionId]; continue }
    i++
  }
  return { path, answers: eff, variables: vars, variablesBefore, branches, hiddenChoices, visibleChoices: visible, endedBy }
}

/** Effective answers to path questions strictly BEFORE qid (all of them if qid isn't on the path). */
export function pathAnswersBefore(run: PathResult, qid: string): Answers {
  const idx = run.path.indexOf(qid)
  if (idx === -1) return { ...run.answers }
  const out: Answers = {}
  for (const id of run.path.slice(0, idx)) if (has(run.answers, id)) out[id] = run.answers[id]
  return out
}

export function computeVariables(form: LogicForm, rawAnswers: Answers): Vars {
  return computePath(form, rawAnswers).variables
}

export type Step = { kind: 'question'; id: string } | { kind: 'end' }

export function resolveCurrent(form: LogicForm, raw: Answers, wantedId: string | null): Step {
  const { path } = computePath(form, raw)
  if (wantedId !== null && path.includes(wantedId)) return { kind: 'question', id: wantedId }
  const wanted = Math.max(0, indexIn(form, wantedId))
  const id = path.find(p => form.indexOf[p] >= wanted)
  return id === undefined ? { kind: 'end' } : { kind: 'question', id }
}

export function getNextStep(form: LogicForm, raw: Answers, currentId: string | null): Step {
  const { path } = computePath(form, raw)
  if (currentId === null) return path.length ? { kind: 'question', id: path[0] } : { kind: 'end' }
  const idx = path.indexOf(currentId)
  if (idx === -1) return resolveCurrent(form, raw, currentId)
  if (idx === path.length - 1) return { kind: 'end' }
  return { kind: 'question', id: path[idx + 1] }
}

/** The previous question on the path actually taken, or null (Back stays disabled). */
export function getPrevStep(form: LogicForm, raw: Answers, currentId: string): string | null {
  const { path } = computePath(form, raw)
  const idx = path.indexOf(currentId)
  return path[idx - 1] ?? null
}

export function getProgress(form: LogicForm, raw: Answers, currentId: string): { index: number; total: number; ratio: number } {
  const { path } = computePath(form, raw)
  const index = Math.max(0, path.indexOf(currentId))
  const total = path.length
  return { index, total, ratio: index / Math.max(1, total) }
}

/**
 * "Takes N minutes": 12 seconds per question on the projected path (today's
 * formula). Branching that depends on questions not answered yet is ignored
 * (treated as "next question"), so a rule that matches a blank answer can't
 * make a long form say "Takes 1 minute". Display rules apply as before, so old
 * forms (no branching) get exactly today's number.
 */
export function estimateMinutes(form: LogicForm, raw: Answers = {}): number {
  return Math.max(1, Math.round((walkPath(form, raw, true).path.length * 12) / 60))
}

// ─── 2.6 What gets submitted ────────────────────────────────────────────────

export type SubmissionProblem = { questionId: string; reason: 'required' | 'email' | 'payment' }

/** Payment, required and email checks over the path only, in path order (one problem per question). */
export function validateSubmission(form: LogicForm, raw: Answers): SubmissionProblem[] {
  const run = computePath(form, raw)
  const out: SubmissionProblem[] = []
  for (const id of run.path) {
    const q = questionAt(form, id)!
    const v = run.answers[id]
    if (q.type === 'payment' && toNum(q.amountCents) > 0 && (v as any)?.status !== 'paid') {
      out.push({ questionId: id, reason: 'payment' }); continue
    }
    if (q.type !== 'statement' && q.required && isBlankAnswer(v)) {
      out.push({ questionId: id, reason: 'required' }); continue
    }
    if (q.type === 'email' && !isBlankAnswer(v) && !EMAIL_RE.test(String(v).trim())) {
      out.push({ questionId: id, reason: 'email' })
    }
  }
  return out
}

/** A completed side effect (paid payment, booked slot) that must never be dropped. */
function isKeptSideEffect(q: FormQuestion, v: unknown): boolean {
  if (!isObj(v)) return false
  if (q.type === 'payment') return v.status === 'paid'
  if (q.type === 'scheduler') return !isBlankAnswer(v.calendar_event_id)
  return false
}

/**
 * The `answers` object to insert: effective path answers, plus paid/booked
 * answers left off the path (`offPath`), plus `__logic`.
 */
export function buildSubmission(form: LogicForm, raw: Answers): { answers: Record<string, unknown>; variables: Vars; path: string[] } {
  const rawAnswers = isObj(raw) ? raw : {}
  const run = computePath(form, rawAnswers)
  const onPath = new Set(run.path)
  const side: Record<string, unknown> = {}
  const offPath: string[] = []
  for (const q of form.questions) {
    if (onPath.has(q.id) || !has(rawAnswers, q.id)) continue
    if (isKeptSideEffect(q, rawAnswers[q.id])) { side[q.id] = rawAnswers[q.id]; offPath.push(q.id) }
  }
  const logic: ResponseLogic = {
    v: 1,
    path: [...run.path],
    completed: true,
    ending: 'default',
    endedBy: run.endedBy,
    variables: { ...run.variables },
  }
  if (Object.keys(run.branches).length) logic.branches = { ...run.branches }
  if (Object.keys(run.hiddenChoices).length) logic.hiddenChoices = { ...run.hiddenChoices }
  if (offPath.length) logic.offPath = offPath
  return {
    answers: { ...run.answers, ...side, [RESPONSE_LOGIC_KEY]: logic },
    variables: { ...run.variables },
    path: [...run.path],
  }
}

function cleanIdList(v: unknown): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const x of arr(v)) {
    if (typeof x !== 'string' || seen.has(x)) continue
    seen.add(x); out.push(x)
    if (out.length >= MAX_LOGIC_ITEMS) break
  }
  return out
}
function safeKey(k: string): boolean {
  return k !== '__proto__' && k !== 'constructor' && k !== 'prototype'
}

/**
 * Reads (and sanitises) a response's `__logic`. Null for responses submitted
 * before logic existed or with a malformed `__logic`. Anyone can insert JSON
 * into a published form, so nothing here is trusted.
 */
export function readResponseLogic(answers: unknown): ResponseLogic | null {
  if (!isObj(answers)) return null
  const lg = answers[RESPONSE_LOGIC_KEY]
  if (!isObj(lg) || lg.v !== 1 || !Array.isArray(lg.path)) return null
  const out: ResponseLogic = {
    v: 1,
    path: cleanIdList(lg.path),
    completed: true,
    ending: 'default',
    endedBy: lg.endedBy === 'jump' ? 'jump' : 'last',
    variables: {},
  }
  if (isObj(lg.variables)) {
    let n = 0
    for (const [k, val] of Object.entries(lg.variables)) {
      if (n >= MAX_LOGIC_ITEMS) break
      if (safeKey(k) && typeof val === 'number' && Number.isFinite(val)) { out.variables[k] = val; n++ }
    }
  }
  if (isObj(lg.branches)) {
    const b: Record<string, string> = {}
    let n = 0
    for (const [k, val] of Object.entries(lg.branches)) {
      if (n >= MAX_LOGIC_ITEMS) break
      if (safeKey(k) && typeof val === 'string') { b[k] = val; n++ }
    }
    if (n) out.branches = b
  }
  if (isObj(lg.hiddenChoices)) {
    const h: Record<string, string[]> = {}
    let n = 0
    for (const [k, val] of Object.entries(lg.hiddenChoices)) {
      if (n >= MAX_LOGIC_ITEMS) break
      if (!safeKey(k) || !Array.isArray(val)) continue
      h[k] = cleanIdList(val); n++
    }
    if (n) out.hiddenChoices = h
  }
  const off = cleanIdList(lg.offPath)
  if (off.length) out.offPath = off
  return out
}

/** Drops every reserved key (starting with "__"), e.g. `__logic`. */
export function stripReservedAnswers(answers: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!isObj(answers)) return out
  for (const [k, v] of Object.entries(answers)) if (!k.startsWith('__')) out[k] = v
  return out
}

// ─── 2.7 Piping ─────────────────────────────────────────────────────────────

function formatMoney(cents: number, currency: unknown): string {
  const cur = (typeof currency === 'string' && currency ? currency : 'aud').toUpperCase()
  try {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: cur }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${cur}`
  }
}

/** One answer as plain text, for piping, integrations and results. Never JSON, never a data: URL. */
export function answerToPlainText(v: unknown, q?: FormQuestion): string {
  if (isBlankAnswer(v)) return ''
  if (typeof v === 'string') return v.startsWith('data:') ? '' : v
  if (typeof v === 'boolean') return v ? 'Accepted' : 'No'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  if (Array.isArray(v)) return v.map(x => answerToPlainText(x)).filter(Boolean).join(', ')
  if (isObj(v)) {
    if (q?.type === 'payment' || 'amount_cents' in v || 'payment_id' in v) {
      const cents = toNum(v.amount_cents)
      if (Number.isFinite(cents)) return formatMoney(cents, v.currency)
      return v.status === 'paid' ? 'Paid' : ''
    }
    if (q?.type === 'scheduler' || 'starts_at' in v) {
      const d = new Date(v.starts_at as any)
      if (v.starts_at && !isNaN(d.getTime())) {
        return d.toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
      }
      return typeof v.starts_at === 'string' ? v.starts_at : ''
    }
    if ('url' in v || 'name' in v) {
      if (typeof v.name === 'string' && v.name.trim()) return v.name
      return 'File'
    }
    // Matrix: { row: col }
    return Object.entries(v)
      .map(([k, x]) => [k, answerToPlainText(x)] as const)
      .filter(([, x]) => x !== '')
      .map(([k, x]) => `${k}: ${x}`)
      .join('; ')
  }
  return String(v)
}

export function formatVariable(n: number | undefined): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return ''
  return n.toLocaleString('en-AU', { maximumFractionDigits: 2 })
}

/**
 * Replaces `{previous_answer:<questionId>}` and `{variable:<variableId>}`.
 * Unknown tokens and questions not answered on the path render as ''.
 */
export function pipeText(text: string, ctx: { form: LogicForm; answers: Answers; variables: Vars }): string {
  if (typeof text !== 'string' || !text) return typeof text === 'string' ? text : ''
  const answers = isObj(ctx.answers) ? ctx.answers : {}
  const vars = isObj(ctx.variables) ? ctx.variables : {}
  return text
    .replace(/\{previous_answer:([^}]+)\}/g, (_m, raw: string) => {
      const id = raw.trim()
      const q = questionAt(ctx.form, id)
      if (!q || !has(answers, id)) return ''
      return answerToPlainText(answers[id], q)
    })
    .replace(/\{variable:([^}]+)\}/g, (_m, raw: string) => {
      const id = raw.trim()
      if (!ctx.form.variables.some(v => v.id === id) || !has(vars, id)) return ''
      return formatVariable(vars[id])
    })
}

// ─── 2.8 Builder tools ──────────────────────────────────────────────────────

export type LogicSection = 'display' | 'choices' | 'branching' | 'calculations' | 'variables'
export type LogicIssue = {
  questionId: string
  section: LogicSection
  ruleId?: string
  conditionIndex?: number
  code:
    | 'missing_question' | 'missing_variable' | 'missing_choice' | 'missing_target'
    | 'backward_jump' | 'incomplete_rule' | 'no_conditions' | 'bad_operator'
    | 'later_question' | 'self_reference' | 'variable_not_set_yet' | 'not_applicable'
  severity: 'error' | 'warning'
  message: string
}

/** Variables set by a calculation on questions [0, untilIndex). */
function variablesSetBefore(form: LogicForm, untilIndex: number): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i < untilIndex && i < form.questions.length; i++) {
    for (const op of arr(form.questions[i].calculations)) if (isObj(op) && typeof op.variableId === 'string') out.add(op.variableId)
  }
  return out
}

export function validateLogic(form: LogicForm): LogicIssue[] {
  const issues: LogicIssue[] = []
  const varIds = new Set(form.variables.map(v => v.id))

  form.questions.forEach((q, ownerIdx) => {
    const push = (i: Omit<LogicIssue, 'questionId'>) => issues.push({ questionId: q.id, ...i })

    const checkGroup = (group: unknown, section: LogicSection, ruleId?: string) => {
      // display / choices run before the question is answered; branching / calculations after.
      const selfAllowed = section === 'branching' || section === 'calculations'
      const setBefore = variablesSetBefore(form, selfAllowed ? ownerIdx + 1 : ownerIdx)
      const raw = isObj(group) ? arr(group.rules) : []
      raw.forEach((rule: unknown, conditionIndex: number) => {
        if (!isObj(rule)) return
        const at = { section, conditionIndex, ...(ruleId !== undefined ? { ruleId } : {}) }
        const op = rule.operator as Operator
        const value = rule.value
        const blankValue = value === undefined || value === null || String(value).trim() === ''

        if (isVariableRule(rule as LogicRule)) {
          if (!varIds.has(rule.variableId)) {
            push({ ...at, code: 'missing_variable', severity: 'error', message: 'This rule uses a variable that no longer exists.' })
            return
          }
          if (!operatorsFor('variable').includes(op)) {
            push({ ...at, code: 'bad_operator', severity: 'error', message: 'Choose how to compare this variable.' })
          } else if (!Number.isFinite(toNum(value))) {
            push({ ...at, code: 'incomplete_rule', severity: 'error', message: 'Enter a number to compare with.' })
          }
          if (!setBefore.has(rule.variableId)) {
            push({ ...at, code: 'variable_not_set_yet', severity: 'warning', message: 'No earlier question changes this variable yet, so it is still at its starting value here.' })
          }
          return
        }

        if (typeof rule.questionId !== 'string' || rule.questionId === '') {
          push({ ...at, code: 'incomplete_rule', severity: 'error', message: 'Choose a question or variable for this rule.' })
          return
        }
        const srcIdx = indexIn(form, rule.questionId)
        if (srcIdx === -1) {
          push({ ...at, code: 'missing_question', severity: 'error', message: "This rule's question was deleted." })
          return
        }
        const src = form.questions[srcIdx]
        if (srcIdx === ownerIdx && !selfAllowed) {
          push({ ...at, code: 'self_reference', severity: 'warning', message: 'This rule checks the question itself, which has no answer yet at this point.' })
        } else if (srcIdx > ownerIdx) {
          push({ ...at, code: 'later_question', severity: 'warning', message: 'This rule checks a later question, which is always unanswered at this point.' })
        }
        const kind = valueKindOf(src)
        if (kind === 'none') {
          push({ ...at, code: 'bad_operator', severity: 'error', message: "This rule's question is now a statement, which has no answer to check." })
          return
        }
        if (!operatorsFor(kind).includes(op)) {
          const legacy = LEGACY_OPERATORS.includes(op)
          push({
            ...at, code: 'bad_operator', severity: legacy ? 'warning' : 'error',
            message: legacy
              ? `This older rule uses "${operatorLabel(op, kind)}". It still works, but a newer option may fit better.`
              : "This comparison doesn't fit the question's type. Choose another.",
          })
          if (!legacy) return
        }
        if (VALUELESS_OPERATORS.includes(op) || !isKnownOperator(op)) return
        if (kind === 'legal' || kind === 'presence') return
        if (blankValue) {
          push({ ...at, code: 'incomplete_rule', severity: 'error', message: 'Enter a value for this rule.' })
          return
        }
        if (kind === 'number' && !Number.isFinite(toNum(value))) {
          push({ ...at, code: 'incomplete_rule', severity: 'error', message: 'Enter a number for this rule.' })
          return
        }
        if (kind === 'date' && ['gt', 'gte', 'lt', 'lte'].includes(op) && !DATE_RE.test(String(value))) {
          push({ ...at, code: 'incomplete_rule', severity: 'error', message: 'Choose a date for this rule.' })
          return
        }
        const offered = operatorsFor(kind).includes(op)
        if (offered && (kind === 'choice' || kind === 'multi' || kind === 'yesno') && !choicesOf(src).includes(String(value))) {
          push({ ...at, code: 'missing_choice', severity: 'error', message: `"${String(value)}" is no longer one of that question's choices.` })
        }
      })
    }

    // Question display
    if (isObj(q.conditional_logic)) checkGroup(q.conditional_logic, 'display')

    // Hide answer choices
    const choiceRules = arr(q.choice_logic).filter(isObj)
    if (choiceRules.length) {
      if (!isChoiceType(q.type)) {
        push({ section: 'choices', code: 'not_applicable', severity: 'warning', message: "These rules don't apply to this question type." })
      } else {
        const opts = optionsOf(q)
        for (const r of choiceRules) {
          const ruleId = typeof r.id === 'string' ? r.id : undefined
          const at = { section: 'choices' as const, ...(ruleId !== undefined ? { ruleId } : {}) }
          const choices = arr(r.choices).filter(c => typeof c === 'string')
          if (!choices.length) push({ ...at, code: 'incomplete_rule', severity: 'error', message: 'Choose at least one answer to hide.' })
          for (const c of choices) {
            if (!opts.includes(c)) push({ ...at, code: 'missing_choice', severity: 'error', message: `"${c}" is no longer one of this question's choices.` })
          }
          if (!rulesOf(r).length) push({ ...at, code: 'no_conditions', severity: 'error', message: 'Add at least one condition, or remove this rule.' })
          checkGroup(r, 'choices', ruleId)
        }
      }
    }

    // Branching
    const checkTarget = (t: unknown, ruleId: string) => {
      const at = { section: 'branching' as const, ruleId }
      if (!validTarget(t)) {
        push({ ...at, code: 'incomplete_rule', severity: 'error', message: 'Choose where this rule goes.' })
        return
      }
      if (t.kind !== 'question') return
      const ti = indexIn(form, t.questionId)
      if (ti === -1) push({ ...at, code: 'missing_target', severity: 'error', message: 'The question this rule went to was deleted.' })
      else if (ti <= ownerIdx) push({ ...at, code: 'backward_jump', severity: 'error', message: 'This question is no longer after this one, so the rule is skipped.' })
    }
    for (const r of branchRulesOf(q)) {
      const ruleId = typeof r.id === 'string' ? r.id : ''
      if (!rulesOf(r).length) push({ section: 'branching', ruleId, code: 'no_conditions', severity: 'error', message: 'Add at least one condition, or remove this rule.' })
      checkTarget(r.to, ruleId)
      checkGroup(r, 'branching', ruleId)
    }
    if (isObj(q.branching) && q.branching.otherwise !== undefined && q.branching.otherwise !== null) {
      checkTarget(q.branching.otherwise, 'otherwise')
    }

    // Calculations
    for (const op of arr(q.calculations).filter(isObj)) {
      const ruleId = typeof op.id === 'string' ? op.id : undefined
      const at = { section: 'calculations' as const, ...(ruleId !== undefined ? { ruleId } : {}) }
      if (typeof op.variableId !== 'string' || op.variableId === '') {
        push({ ...at, code: 'incomplete_rule', severity: 'error', message: 'Choose a variable for this calculation.' })
      } else if (!varIds.has(op.variableId)) {
        push({ ...at, code: 'missing_variable', severity: 'error', message: 'This calculation uses a variable that no longer exists.' })
      }
      if (!CALC_OPS.includes(op.op)) {
        push({ ...at, code: 'incomplete_rule', severity: 'error', message: 'Choose what this calculation does.' })
      }
      const usesAnswer = !!op.useAnswer && isNumericType(q.type)
      if (!usesAnswer && !Number.isFinite(toNum(op.amount))) {
        push({ ...at, code: 'incomplete_rule', severity: 'error', message: 'Enter a number for this calculation.' })
      }
      const when = op.when
      if (!isObj(when) || !['answered', 'choice', 'conditions'].includes(when.kind)) {
        push({ ...at, code: 'incomplete_rule', severity: 'error', message: 'Choose when this calculation applies.' })
      } else if (when.kind === 'choice') {
        if (typeof when.choice !== 'string' || when.choice === '') {
          push({ ...at, code: 'incomplete_rule', severity: 'error', message: 'Choose which answer this calculation applies to.' })
        } else if (!choicesOf(q).includes(when.choice)) {
          push({ ...at, code: 'missing_choice', severity: 'error', message: `"${when.choice}" is no longer one of this question's choices.` })
        }
      } else if (when.kind === 'conditions') {
        if (!rulesOf(when).length) push({ ...at, code: 'no_conditions', severity: 'error', message: 'Add at least one condition, or choose another option.' })
        checkGroup(when, 'calculations', ruleId)
      }
    }
  })
  return issues
}

/** Display (1 if it has rules) + hide-choice rules + branch rules (+1 for a non-default otherwise) + calculations. */
export function countRules(q: FormQuestion): number {
  if (!isObj(q)) return 0
  const cl = q.conditional_logic
  const br = isObj(q.branching) ? q.branching : undefined
  return (isObj(cl) && arr(cl.rules).length ? 1 : 0)
    + arr(q.choice_logic).length
    + arr(br?.rules).length
    + (br && isObj(br.otherwise) && br.otherwise.kind !== 'next' ? 1 : 0)
    + arr(q.calculations).length
}

export function countAllRules(form: LogicForm): number {
  return form.questions.reduce((n, q) => n + countRules(q), 0)
}

export function hasAnyLogic(form: LogicForm): boolean {
  return countAllRules(form) > 0
}

function groupUses(group: unknown, questionId: string): boolean {
  return rulesOf(group).some(r => !isVariableRule(r) && r.questionId === questionId)
}

/**
 * Rules on OTHER questions that use this question, as a condition source or a
 * jump target. One entry per rule (the display group counts as one rule).
 */
export function findReferences(form: LogicForm, questionId: string): { questionId: string; section: LogicSection }[] {
  const out: { questionId: string; section: LogicSection }[] = []
  for (const q of form.questions) {
    if (q.id === questionId) continue
    if (groupUses(q.conditional_logic, questionId)) out.push({ questionId: q.id, section: 'display' })
    for (const r of arr(q.choice_logic)) if (groupUses(r, questionId)) out.push({ questionId: q.id, section: 'choices' })
    for (const r of branchRulesOf(q)) {
      const target = isObj(r.to) && r.to.kind === 'question' && r.to.questionId === questionId
      if (target || groupUses(r, questionId)) out.push({ questionId: q.id, section: 'branching' })
    }
    const o = otherwiseOf(q)
    if (o && o.kind === 'question' && o.questionId === questionId) out.push({ questionId: q.id, section: 'branching' })
    for (const op of arr(q.calculations)) {
      if (isObj(op) && isObj(op.when) && op.when.kind === 'conditions' && groupUses(op.when, questionId)) {
        out.push({ questionId: q.id, section: 'calculations' })
      }
    }
  }
  return out
}

/**
 * Keeps rules pointing at a choice when its label is renamed. Returns a new
 * array (unchanged questions reused). No-op for '' and for duplicate labels.
 */
export function renameChoiceRefs(questions: FormQuestion[], questionId: string, oldLabel: string, newLabel: string): FormQuestion[] {
  if (!Array.isArray(questions) || oldLabel === '' || oldLabel === newLabel) return questions
  const owner = questions.find(q => isObj(q) && q.id === questionId)
  if (owner && optionsOf(owner).filter(o => o === oldLabel).length > 1) return questions

  const renameGroup = <G>(group: G): G => {
    const g = group as any
    if (!isObj(g) || !Array.isArray(g.rules)) return group
    let changed = false
    const rules = g.rules.map((r: any) => {
      if (isObj(r) && !isVariableRule(r as LogicRule) && r.questionId === questionId && r.value === oldLabel) {
        changed = true
        return { ...r, value: newLabel }
      }
      return r
    })
    return changed ? ({ ...g, rules } as G) : group
  }

  let any = false
  const out = questions.map(q => {
    if (!isObj(q)) return q
    const self = q.id === questionId
    const next: FormQuestion = { ...q }
    let changed = false

    if (isObj(q.conditional_logic)) {
      const g = renameGroup(q.conditional_logic)
      if (g !== q.conditional_logic) { next.conditional_logic = g; changed = true }
    }
    if (Array.isArray(q.choice_logic)) {
      let c = false
      const list = q.choice_logic.map((r: any) => {
        if (!isObj(r)) return r
        let nr = renameGroup(r)
        if (self && Array.isArray(r.choices) && r.choices.includes(oldLabel)) {
          nr = { ...nr, choices: r.choices.map((x: string) => (x === oldLabel ? newLabel : x)) }
        }
        if (nr !== r) c = true
        return nr
      })
      if (c) { next.choice_logic = list; changed = true }
    }
    if (isObj(q.branching) && Array.isArray(q.branching.rules)) {
      let c = false
      const rules = q.branching.rules.map((r: any) => {
        const nr = renameGroup(r)
        if (nr !== r) c = true
        return nr
      })
      if (c) { next.branching = { ...q.branching, rules }; changed = true }
    }
    if (Array.isArray(q.calculations)) {
      let c = false
      const list = q.calculations.map((op: any) => {
        if (!isObj(op) || !isObj(op.when)) return op
        let when = op.when
        if (when.kind === 'conditions') when = renameGroup(when)
        if (self && when.kind === 'choice' && when.choice === oldLabel) when = { ...when, choice: newLabel }
        if (when === op.when) return op
        c = true
        return { ...op, when }
      })
      if (c) { next.calculations = list; changed = true }
    }
    if (!changed) return q
    any = true
    return next
  })
  return any ? out : questions
}

/** Variables used by at least one calculation, in form order. */
export function variablesInUse(form: LogicForm): FormVariable[] {
  const used = new Set<string>()
  for (const q of form.questions) for (const op of arr(q.calculations)) if (isObj(op) && typeof op.variableId === 'string') used.add(op.variableId)
  return form.variables.filter(v => used.has(v.id))
}

/** Plain English, e.g. 'Q2 "Plan" is Pro and Score is more than 10'. */
export function describeGroup(group: ConditionGroup, form: LogicForm): string {
  const rules = rulesOf(group)
  const parts = rules.map(r => {
    let source: string
    let kind: ValueKind | 'variable'
    if (isVariableRule(r)) {
      const v = form.variables.find(x => x.id === r.variableId)
      source = v ? v.label : 'a deleted variable'
      kind = 'variable'
    } else {
      const idx = indexIn(form, r.questionId)
      if (idx === -1) {
        source = 'a deleted question'
        kind = 'text'
      } else {
        const q = form.questions[idx]
        const title = typeof q.title === 'string' ? q.title.trim() : ''
        source = title ? `Q${idx + 1} "${title}"` : `Q${idx + 1}`
        kind = valueKindOf(q)
      }
    }
    const op = r.operator
    const label = isKnownOperator(op) ? operatorLabel(op, kind) : String(op ?? '')
    const needsValue = isKnownOperator(op) && !VALUELESS_OPERATORS.includes(op) && kind !== 'legal' && kind !== 'presence'
    if (!needsValue) return `${source} ${label}`.trim()
    const value = r.value === undefined || r.value === null || String(r.value).trim() === '' ? '(no value)' : String(r.value)
    return `${source} ${label} ${value}`
  })
  return parts.join((group as ConditionGroup).logic === 'all' ? ' and ' : ' or ')
}

/** "Next question" | "End of form" | "7. Contact details" | "a deleted question". */
export function describeTarget(to: JumpTarget | undefined, form: LogicForm, fromId: string): string {
  if (!validTarget(to) || to.kind === 'next') {
    const from = indexIn(form, fromId)
    return from !== -1 && from === form.questions.length - 1 ? 'End of form' : 'Next question'
  }
  if (to.kind === 'end') return 'End of form'
  const idx = indexIn(form, to.questionId)
  if (idx === -1) return 'a deleted question'
  const title = typeof form.questions[idx].title === 'string' ? form.questions[idx].title.trim() : ''
  return `${idx + 1}. ${title || 'Untitled question'}`
}

/** A variable id from a label: "Total price" → "total_price"; unique against `taken`. */
export function slugVariableId(label: string, taken: string[]): string {
  let base = String(label ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!base) base = 'var'
  if (!/^[a-z]/.test(base)) base = `v_${base}`
  base = base.slice(0, 24).replace(/_+$/, '') || 'var'
  const used = new Set(arr<string>(taken))
  if (!used.has(base)) return base
  for (let n = 2; ; n++) {
    const suffix = `_${n}`
    const id = `${base.slice(0, 24 - suffix.length).replace(/_+$/, '')}${suffix}`
    if (!used.has(id)) return id
  }
}

// ─── 2.9 Results aggregation ────────────────────────────────────────────────

export type ResponseRow = { id: string; created_at: string; answers: Record<string, unknown> | null; response_time_seconds?: number | null }
export type LogicSummary = {
  total: number
  legacy: number
  perQuestion: Record<string, {
    seen: number
    seenEstimated: number
    answered: number
    hidden: Record<string, number>
  }>
  branches: Record<string, {
    ruleId: string
    to: JumpTarget | null
    count: number; estimated: number
  }[]>
  reach: { questionId: string; reached: number }[]
  endings: { default: number }
  variables: Record<string, {
    count: number; avg: number; min: number; max: number
    histogram: { from: number; to: number; count: number }[]
  }>
}

/**
 * ≤10 equal-width bins; `from` inclusive, `to` exclusive except the last bin,
 * which includes the max. Whole-number data spanning ≤10 values gets one bin
 * per value ([n, n+1)). One bin when min === max.
 */
function histogram(values: number[], min: number, max: number): { from: number; to: number; count: number }[] {
  if (min === max) return [{ from: min, to: max, count: values.length }]
  const ints = values.every(Number.isInteger) && max - min + 1 <= 10
  const k = ints ? max - min + 1 : Math.min(10, values.length)
  const width = ints ? 1 : (max - min) / k
  const bins = Array.from({ length: k }, (_, i) => ({
    from: round6(min + i * width),
    to: round6(ints ? min + (i + 1) : i === k - 1 ? max : min + (i + 1) * width),
    count: 0,
  }))
  for (const x of values) {
    const b = Math.min(k - 1, Math.max(0, Math.floor((x - min) / width)))
    bins[b].count++
  }
  return bins
}

export function summariseLogic(form: LogicForm, rows: ResponseRow[]): LogicSummary {
  const list = arr<ResponseRow>(rows).filter(isObj)
  const perQuestion: LogicSummary['perQuestion'] = {}
  for (const q of form.questions) perQuestion[q.id] = { seen: 0, seenEstimated: 0, answered: 0, hidden: {} }

  const branches: LogicSummary['branches'] = {}
  const branchQs = form.questions.filter(hasBranching)
  for (const q of branchQs) {
    const entries: LogicSummary['branches'][string] = branchRulesOf(q).map(r => ({
      ruleId: typeof r.id === 'string' ? r.id : '',
      to: validTarget(r.to) ? r.to : null,
      count: 0, estimated: 0,
    }))
    entries.push({ ruleId: 'otherwise', to: otherwiseOf(q) ?? { kind: 'next' }, count: 0, estimated: 0 })
    branches[q.id] = entries
  }
  const bump = (qid: string, ruleId: string, estimated: boolean) => {
    const entries = branches[qid]
    if (!entries) return
    let e = entries.find(x => x.ruleId === ruleId && x.ruleId !== 'removed')
    if (!e) {
      e = entries.find(x => x.ruleId === 'removed')
      if (!e) { e = { ruleId: 'removed', to: null, count: 0, estimated: 0 }; entries.push(e) }
    }
    e.count++
    if (estimated) e.estimated++
  }

  const used = variablesInUse(form)
  const varValues: Record<string, number[]> = {}
  for (const v of used) varValues[v.id] = []

  let legacy = 0
  for (const row of list) {
    const answers = stripReservedAnswers(row.answers)
    const lg = readResponseLogic(row.answers)
    if (lg) {
      const seen = new Set([...lg.path, ...(lg.offPath || [])])
      for (const q of form.questions) {
        if (!seen.has(q.id)) continue
        const pq = perQuestion[q.id]
        pq.seen++
        if (!isBlankAnswer(answers[q.id])) pq.answered++
        for (const label of lg.hiddenChoices?.[q.id] || []) pq.hidden[label] = (pq.hidden[label] || 0) + 1
      }
      const onPath = new Set(lg.path)
      for (const q of branchQs) {
        const taken = lg.branches?.[q.id]
        if (typeof taken === 'string' && onPath.has(q.id)) bump(q.id, taken, false)
      }
      for (const v of used) {
        const x = lg.variables[v.id]
        if (typeof x === 'number' && Number.isFinite(x)) varValues[v.id].push(x)
      }
    } else {
      legacy++
      const run = computePath(form, answers)
      const onPath = new Set(run.path)
      for (const q of form.questions) {
        const answered = !isBlankAnswer(answers[q.id])
        if (!onPath.has(q.id) && !answered) continue
        const pq = perQuestion[q.id]
        pq.seen++; pq.seenEstimated++
        if (answered) pq.answered++
      }
      for (const q of branchQs) {
        const taken = run.branches[q.id]
        if (typeof taken === 'string') bump(q.id, taken, true)
      }
    }
  }

  const variables: LogicSummary['variables'] = {}
  for (const v of used) {
    const vals = varValues[v.id]
    if (!vals.length) { variables[v.id] = { count: 0, avg: 0, min: 0, max: 0, histogram: [] }; continue }
    let min = Infinity, max = -Infinity, sum = 0
    for (const x of vals) { if (x < min) min = x; if (x > max) max = x; sum += x }
    variables[v.id] = { count: vals.length, avg: round6(sum / vals.length), min, max, histogram: histogram(vals, min, max) }
  }

  return {
    total: list.length,
    legacy,
    perQuestion,
    branches,
    reach: form.questions.map(q => ({ questionId: q.id, reached: perQuestion[q.id].seen })),
    endings: { default: list.length },
    variables,
  }
}
