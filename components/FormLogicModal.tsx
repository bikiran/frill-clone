'use client'

/**
 * The form builder's Logic window (like Typeform's): questions on the left,
 * and for the selected question four collapsible sections on the right:
 *   Question display · Hide answer choices · Branching · Calculations.
 *
 * It edits a deep draft of four keys on every question (conditional_logic,
 * choice_logic, branching, calculations) plus the form-level variables. One
 * Save hands everything back to the builder; Cancel/Esc/backdrop discard it
 * (with a confirm when something changed). All rule semantics, validation and
 * plain-English summaries come from lib/form-logic.ts.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { confirmDialog } from '@/components/ConfirmDialog'
import { otherChoiceLabel } from '@/lib/form-choice-options'
import {
  CHOICE_TYPES, DEFAULT_SCORE_VARIABLE, NUMERIC_TYPES,
  choicesOf, countRules, describeGroup, describeTarget, newLogicId, operatorLabel, operatorsFor,
  readFormLogic, slugVariableId, toNum, validateLogic, valueKindOf, withDefaultScore,
  type BranchRule, type Branching, type CalcOp, type CalcWhen, type ChoiceRule, type ConditionGroup, type DisplayLogic,
  type FormQuestion, type FormVariable, type JumpTarget, type LogicForm, type LogicIssue, type LogicRule,
  type LogicSection, type Operator, type ValueKind,
} from '@/lib/form-logic'

// ─── Props ──────────────────────────────────────────────────────────────────

export type FormLogicModalProps = {
  open: boolean
  questions: FormQuestion[]                 // builder's questions, form order
  variables: FormVariable[]                 // theme.variables as stored (may be [])
  initialQuestionId: string | null          // selected on open; null → first question
  themeColor: string                        // accents (toggles, primary button)
  renderTypeBadge: (q: FormQuestion, number: number) => React.ReactNode
  typeLabel: (type: string) => string
  typeTint: (type: string) => { bg: string; fg: string }
  onClose: () => void                       // after Cancel/Esc/backdrop (with discard confirm if dirty)
  onSave: (next: { questions: FormQuestion[]; variables: FormVariable[] }) => void
}

// ─── Draft model (pure helpers, exported for tests) ─────────────────────────

export const LOGIC_KEYS = ['conditional_logic', 'choice_logic', 'branching', 'calculations'] as const
export type LogicKey = typeof LOGIC_KEYS[number]
export type LogicKeys = {
  conditional_logic?: DisplayLogic
  choice_logic?: ChoiceRule[]
  branching?: Branching
  calculations?: CalcOp[]
}
export type LogicDraft = { logic: Record<string, LogicKeys>; variables: FormVariable[] }
export type SectionKey = 'display' | 'choices' | 'branching' | 'calculations'

const ALL_OPERATORS: Operator[] = [
  'equals', 'not_equals', 'contains', 'not_contains', 'includes', 'not_includes',
  'is_empty', 'is_not_empty', 'gt', 'gte', 'lt', 'lte',
]
const VALUELESS: Operator[] = ['is_empty', 'is_not_empty']
const DATE_RE = /^\d{4}-\d{2}-\d{2}/
const MAX_VARIABLE_LABEL = 30
const CALC_LABELS: { op: CalcOp['op']; label: string }[] = [
  { op: 'add', label: 'Add' }, { op: 'subtract', label: 'Subtract' }, { op: 'multiply', label: 'Multiply' },
  { op: 'divide', label: 'Divide' }, { op: 'set', label: 'Set' },
]

function isObj(v: unknown): v is Record<string, any> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}
function arr<T = any>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}
function clone<T>(v: T): T {
  return v === undefined ? v : JSON.parse(JSON.stringify(v))
}
function isChoiceType(t: unknown): boolean {
  return (CHOICE_TYPES as readonly string[]).includes(t as string)
}
function isNumericType(t: unknown): boolean {
  return (NUMERIC_TYPES as readonly string[]).includes(t as string)
}
function isKnownOperator(op: unknown): op is Operator {
  return (ALL_OPERATORS as unknown[]).includes(op)
}
function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}
function titleOf(q: FormQuestion | undefined): string {
  const t = q && typeof q.title === 'string' ? q.title.trim() : ''
  return t || 'Untitled question'
}
function questionLabel(q: FormQuestion, index: number): string {
  const t = titleOf(q)
  return `${index + 1}. ${t.length > 70 ? `${t.slice(0, 67)}...` : t}`
}

/** JSON.stringify with sorted keys (undefined skipped), so key order never makes a draft look dirty. */
export function stableStringify(v: unknown): string {
  const sort = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(i => (i === undefined ? null : sort(i)))
    if (isObj(x)) {
      const out: Record<string, unknown> = {}
      for (const k of Object.keys(x).sort()) if (x[k] !== undefined) out[k] = sort(x[k])
      return out
    }
    return x
  }
  return v === undefined ? 'undefined' : JSON.stringify(sort(v))
}

/** The engine id of each raw question (null for a non-object item), aligned to the raw array. */
export function alignIds(raw: unknown[]): (string | null)[] {
  const list = Array.isArray(raw) ? raw : []
  const lf = readFormLogic({ questions: list })
  let k = 0
  return list.map(item => (isObj(item) ? lf.questions[k++]?.id ?? null : null))
}

function normRule(r: Record<string, any>): LogicRule {
  const out: LogicRule = {
    questionId: typeof r.questionId === 'string' ? r.questionId : '',
    operator: r.operator,
    value: r.value === undefined || r.value === null ? '' : String(r.value),
  }
  if (typeof r.variableId === 'string' && r.variableId) out.variableId = r.variableId
  return out
}
function normGroup<G extends Record<string, any>>(g: G): G {
  return { ...g, rules: arr(g.rules).filter(isObj).map(normRule) }
}

/**
 * The four logic keys of one question, deep-copied and tidied for editing:
 * non-object items dropped, rule values as strings, and every choice rule,
 * branch rule and calculation given a unique id (so issues map to one row).
 */
export function pickLogic(q: FormQuestion): LogicKeys {
  const out: LogicKeys = {}
  const used = new Set<string>()
  const uid = (x: unknown) => {
    let s = typeof x === 'string' && x && !used.has(x) ? x : newLogicId()
    while (used.has(s)) s = newLogicId()
    used.add(s)
    return s
  }
  if (isObj(q.conditional_logic)) out.conditional_logic = normGroup(clone(q.conditional_logic))
  if (Array.isArray(q.choice_logic)) {
    out.choice_logic = q.choice_logic.filter(isObj).map(r => {
      const c = normGroup(clone(r))
      return { ...c, id: uid(r.id), choices: arr(c.choices).filter(x => typeof x === 'string') }
    })
  }
  if (isObj(q.branching)) {
    const b = clone(q.branching)
    out.branching = { ...b, rules: arr(b.rules).filter(isObj).map(r => ({ ...normGroup(r), id: uid(r.id) }) as BranchRule) }
  }
  if (Array.isArray(q.calculations)) {
    out.calculations = q.calculations.filter(isObj).map(op => {
      const c = clone(op)
      if (isObj(c.when) && c.when.kind === 'conditions') c.when = normGroup(c.when)
      return { ...c, id: uid(c.id) }
    })
  }
  return out
}

/** The opening snapshot: four keys per question plus the variables (with the virtual default score). */
export function buildDraft(questions: FormQuestion[], variables: FormVariable[]): LogicDraft {
  const lf = readFormLogic({ questions })
  const logic: Record<string, LogicKeys> = {}
  for (const q of lf.questions) logic[q.id] = pickLogic(q)
  const vars = readFormLogic({ theme: { variables } }).variables
  return { logic, variables: clone(withDefaultScore(vars)) }
}

/** The builder's questions with the draft's four keys laid over them (for live validation). */
export function mergeDraft(questions: FormQuestion[], ids: (string | null)[], draft: LogicDraft): FormQuestion[] {
  return questions.map((q, i) => {
    const id = ids[i]
    const d = id ? draft.logic[id] : undefined
    if (!d) return q
    const out: FormQuestion = { ...q }
    for (const k of LOGIC_KEYS) {
      if (d[k] === undefined) delete out[k]
      else (out as any)[k] = d[k]
    }
    return out
  })
}

/** Empty sections become undefined; an "otherwise" of next is the default and isn't stored. */
export function cleanKey(k: LogicKey, v: any): any {
  if (v === undefined || v === null) return undefined
  if (k === 'conditional_logic') return isObj(v) && arr(v.rules).length ? v : undefined
  if (k === 'choice_logic' || k === 'calculations') return arr(v).length ? v : undefined
  if (!isObj(v)) return undefined
  const rules = arr(v.rules)
  const keepOtherwise = isObj(v.otherwise) && v.otherwise.kind !== 'next'
  if (!rules.length && !keepOtherwise) return undefined
  const out: Record<string, any> = { ...v, rules }
  if (!keepOtherwise) delete out.otherwise
  return out
}

/** How many conditions and calculations use a variable (piping tokens are not counted). */
export function usageCount(varId: string, logic: Record<string, LogicKeys>): number {
  let n = 0
  const inGroup = (g: unknown) => {
    for (const r of isObj(g) ? arr(g.rules) : []) if (isObj(r) && r.variableId === varId) n++
  }
  for (const k of Object.values(logic)) {
    if (!k) continue
    inGroup(k.conditional_logic)
    for (const r of arr(k.choice_logic)) inGroup(r)
    for (const r of arr(isObj(k.branching) ? k.branching.rules : [])) inGroup(r)
    for (const op of arr(k.calculations)) {
      if (!isObj(op)) continue
      if (op.variableId === varId) n++
      if (isObj(op.when) && op.when.kind === 'conditions') inGroup(op.when)
    }
  }
  return n
}

/**
 * Variables to save: everything still in the draft, except the virtual
 * default "score" (offered but never stored) unless it's used or edited.
 */
export function pruneVariables(draftVars: FormVariable[], storedVars: FormVariable[], logic: Record<string, LogicKeys>): FormVariable[] {
  const stored = new Set(arr(storedVars).filter(isObj).map(v => v.id))
  return draftVars
    .filter(v => {
      if (v.id !== DEFAULT_SCORE_VARIABLE.id || stored.has(v.id)) return true
      return usageCount(v.id, logic) > 0
        || v.label.trim() !== DEFAULT_SCORE_VARIABLE.label
        || v.initial !== DEFAULT_SCORE_VARIABLE.initial
    })
    .map(v => ({
      id: v.id,
      label: v.label.trim().slice(0, MAX_VARIABLE_LABEL) || v.id,
      initial: Number.isFinite(v.initial) ? v.initial : 0,
    }))
}

/** Ids of questions whose four keys differ from the opening snapshot. */
export function changedQuestionIds(initial: LogicDraft, draft: LogicDraft): string[] {
  const ids = new Set([...Object.keys(initial.logic), ...Object.keys(draft.logic)])
  return [...ids].filter(id => stableStringify(initial.logic[id] || {}) !== stableStringify(draft.logic[id] || {}))
}

/**
 * Why Save is disabled, or null. Only questions changed in this session can
 * block (with an unfinished rule); an old broken rule elsewhere never does.
 */
export function saveBlock(initial: LogicDraft, draft: LogicDraft, issues: LogicIssue[]): 'no_changes' | 'unfinished' | null {
  if (stableStringify(initial) === stableStringify(draft)) return 'no_changes'
  const changed = new Set(changedQuestionIds(initial, draft))
  const blocking = issues.some(i => i.severity === 'error' && changed.has(i.questionId)
    && (i.code === 'incomplete_rule' || i.code === 'no_conditions'))
  return blocking ? 'unfinished' : null
}

/**
 * What onSave receives: the builder's questions (as they are at save time)
 * with only the four logic keys replaced, and only where they changed.
 */
export function buildSave(questions: FormQuestion[], variables: FormVariable[], initial: LogicDraft, draft: LogicDraft): { questions: FormQuestion[]; variables: FormVariable[] } {
  const ids = alignIds(questions)
  const next = questions.map((q, i) => {
    const id = ids[i]
    const d = id ? draft.logic[id] : undefined
    if (!d) return q
    const s = (id && initial.logic[id]) || {}
    let out: FormQuestion | null = null
    for (const k of LOGIC_KEYS) {
      if (stableStringify(d[k]) === stableStringify(s[k])) continue
      const v = cleanKey(k, clone(d[k]))
      // Nothing effective to write (e.g. an emptied section that was never stored).
      if (v === undefined ? !Object.prototype.hasOwnProperty.call(q, k) : stableStringify(v) === stableStringify(q[k])) continue
      out = out || { ...q }
      if (v === undefined) delete out[k]
      else (out as any)[k] = v
    }
    return out || q
  })
  const pruned = pruneVariables(draft.variables, variables, draft.logic)
  const before = readFormLogic({ theme: { variables } }).variables
  return { questions: next, variables: stableStringify(pruned) === stableStringify(before) ? variables : pruned }
}

/** Questions a condition can check: earlier ones (plus this one for branching/calculations), never statements. */
export function allowedSources(form: LogicForm, ownerIdx: number, selfAllowed: boolean): { q: FormQuestion; index: number }[] {
  const out: { q: FormQuestion; index: number }[] = []
  const last = selfAllowed ? ownerIdx : ownerIdx - 1
  for (let i = 0; i <= last && i < form.questions.length; i++) {
    if (valueKindOf(form.questions[i]) !== 'none') out.push({ q: form.questions[i], index: i })
  }
  return out
}

/** A new condition row, pre-pointed at the most likely source (this question, or the one before). */
export function newCondition(form: LogicForm, ownerIdx: number, selfAllowed: boolean, variables: FormVariable[]): LogicRule {
  const src = allowedSources(form, ownerIdx, selfAllowed)
  const pick = src[src.length - 1]
  if (pick) return { questionId: pick.q.id, operator: operatorsFor(valueKindOf(pick.q))[0], value: '' }
  if (variables[0]) return { questionId: '', variableId: variables[0].id, operator: 'gte', value: '' }
  return { questionId: '', operator: 'equals', value: '' }
}

function valueFits(value: string, kind: ValueKind | 'variable', q: FormQuestion | undefined): boolean {
  if (value === '') return true
  if (kind === 'choice' || kind === 'multi' || kind === 'yesno') return choicesOf(q).includes(value)
  if (kind === 'number' || kind === 'variable') return Number.isFinite(toNum(value))
  if (kind === 'date') return DATE_RE.test(value)
  return kind === 'text'
}

/** Points a rule at a new source ("q:<id>" / "v:<id>"), keeping the comparison and value when they still fit. */
export function applySource(rule: LogicRule, src: string, form: LogicForm): LogicRule {
  if (src.startsWith('v:')) {
    const ops = operatorsFor('variable')
    return {
      questionId: '',
      variableId: src.slice(2),
      operator: ops.includes(rule.operator) ? rule.operator : 'gte',
      value: valueFits(rule.value, 'variable', undefined) ? rule.value : '',
    }
  }
  if (src.startsWith('q:')) {
    const id = src.slice(2)
    const q = form.indexOf[id] !== undefined ? form.questions[form.indexOf[id]] : undefined
    const kind = valueKindOf(q)
    const ops = operatorsFor(kind)
    const operator = ops.includes(rule.operator) ? rule.operator : (ops[0] || 'equals')
    const keep = !VALUELESS.includes(operator) && valueFits(rule.value, kind, q)
    return { questionId: id, operator, value: keep ? rule.value : '' }
  }
  return rule
}

export function defaultExpanded(k: LogicKeys | undefined): Record<SectionKey, boolean> {
  const c = sectionCounts(k)
  const out = { display: c.display > 0, choices: c.choices > 0, branching: c.branching > 0, calculations: c.calculations > 0 }
  if (!out.display && !out.choices && !out.branching && !out.calculations) out.display = true
  return out
}

/** Per-section counts that add up to countRules(question). */
export function sectionCounts(k: LogicKeys | undefined): Record<SectionKey, number> {
  const br = isObj(k?.branching) ? k!.branching : undefined
  return {
    display: isObj(k?.conditional_logic) && arr(k!.conditional_logic!.rules).length ? 1 : 0,
    choices: arr(k?.choice_logic).length,
    branching: arr(br?.rules).length + (br && isObj(br.otherwise) && br.otherwise.kind !== 'next' ? 1 : 0),
    calculations: arr(k?.calculations).length,
  }
}

/** "Add 1 to Score when they choose Pro", for collapsed summaries. */
export function describeOp(op: CalcOp, form: LogicForm, q?: FormQuestion): string {
  const v = form.variables.find(x => x.id === op.variableId)
  const name = v ? v.label : op.variableId ? 'a deleted variable' : 'a variable'
  const amt = op.useAnswer && q && isNumericType(q.type)
    ? 'the answer'
    : Number.isFinite(toNum(op.amount)) ? String(op.amount) : '(no number)'
  const main = op.op === 'add' ? `Add ${amt} to ${name}`
    : op.op === 'subtract' ? `Subtract ${amt} from ${name}`
    : op.op === 'multiply' ? `Multiply ${name} by ${amt}`
    : op.op === 'divide' ? `Divide ${name} by ${amt}`
    : op.op === 'set' ? `Set ${name} to ${amt}`
    : `Change ${name}`
  const w = op.when as CalcWhen | undefined
  const when = !isObj(w) ? ''
    : w.kind === 'answered' ? ' when answered'
    : w.kind === 'choice' ? (w.choice ? ` when they choose ${w.choice}` : ' when they choose an answer')
    : w.kind === 'conditions' ? (arr(w.rules).length ? ` when ${describeGroup(w, form)}` : ' when conditions match')
    : ''
  return main + when
}

/** Readable text on the accent colour (white, or near-black on a light brand colour). */
export function readableOn(color: string): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color || '').trim())
  if (!m) return '#fff'
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1]
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)))
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.45 ? '#18181b' : '#fff'
}

function encTarget(t: unknown): string {
  if (!isObj(t)) return ''
  if (t.kind === 'question') return typeof t.questionId === 'string' ? `q:${t.questionId}` : ''
  return t.kind === 'end' || t.kind === 'next' ? t.kind : ''
}
function decTarget(v: string): JumpTarget | undefined {
  if (v === 'end') return { kind: 'end' }
  if (v === 'next') return { kind: 'next' }
  if (v.startsWith('q:')) return { kind: 'question', questionId: v.slice(2) }
  return undefined
}

// ─── Icons (SVG only) ───────────────────────────────────────────────────────

type IconName = 'close' | 'chevron' | 'trash' | 'up' | 'down' | 'plus' | 'copy' | 'check' | 'alert' | 'info' | 'branch'
function Icon({ name, size = 14 }: { name: IconName; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, focusable: 'false' as const }
  switch (name) {
    case 'close': return <svg {...p}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
    case 'chevron': return <svg {...p}><polyline points="9 6 15 12 9 18" /></svg>
    case 'trash': return <svg {...p}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
    case 'up': return <svg {...p}><polyline points="18 15 12 9 6 15" /></svg>
    case 'down': return <svg {...p}><polyline points="6 9 12 15 18 9" /></svg>
    case 'plus': return <svg {...p}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
    case 'copy': return <svg {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></svg>
    case 'check': return <svg {...p}><polyline points="20 6 9 17 4 12" /></svg>
    case 'alert': return <svg {...p}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
    case 'info': return <svg {...p}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
    case 'branch': return <svg {...p}><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="9" r="2" /><path d="M6 7v10" /><path d="M18 11c0 4-6 3-11.5 6.5" /></svg>
  }
}

// ─── Small building blocks ──────────────────────────────────────────────────

function IssueList({ items }: { items: LogicIssue[] }) {
  if (!items.length) return null
  // One line per distinct message (the same message can come from two checks).
  const seen = new Set<string>()
  const list = items.filter(i => { const k = `${i.severity}:${i.message}`; if (seen.has(k)) return false; seen.add(k); return true })
  return (
    <ul className="fb-lg-issues">
      {list.map((i, n) => (
        <li key={n} className={i.severity}>
          <Icon name={i.severity === 'error' ? 'alert' : 'info'} size={13} />
          <span>{i.message}</span>
        </li>
      ))}
    </ul>
  )
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="fb-lg-seg" role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

/** A number input that lets people type freely ("-", "1.") and commits finite numbers. */
function NumField({ value, onCommit, blankAs, className, ...rest }: { value: number; onCommit: (n: number) => void; blankAs: number } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const fmt = (n: number) => (Number.isFinite(n) ? String(n) : '')
  const [text, setText] = useState(() => fmt(value))
  const last = useRef(value)
  useEffect(() => {
    if (Object.is(value, last.current)) return
    last.current = value
    setText(fmt(value))
  }, [value])
  return (
    <input {...rest} type="number" inputMode="decimal" step={rest.step ?? 'any'} className={className} value={text}
      onChange={e => {
        setText(e.target.value)
        const n = toNum(e.target.value)
        const v = Number.isFinite(n) ? n : blankAs
        last.current = v
        onCommit(v)
      }}
      onBlur={e => { if (!Number.isFinite(toNum(text)) && Number.isFinite(blankAs)) setText(fmt(blankAs)); rest.onBlur?.(e) }} />
  )
}

type Ctx = { form: LogicForm; variables: FormVariable[]; ownerIdx: number }

function numberAttrs(q: FormQuestion | undefined): { min?: number; max?: number; step: number | 'any' } {
  switch (q?.type) {
    case 'rating': return { min: 1, max: 5, step: 1 }
    case 'opinion_scale': return { min: 1, max: 7, step: 1 }
    case 'nps': return { min: 0, max: 10, step: 1 }
    default: return { step: 'any' }
  }
}

// ─── The condition row ──────────────────────────────────────────────────────

function ConditionRow({ rule, ctx, selfAllowed, issues, onChange, onRemove }: {
  rule: LogicRule; ctx: Ctx; selfAllowed: boolean; issues: LogicIssue[]
  onChange: (r: LogicRule) => void; onRemove: () => void
}) {
  const { form, variables, ownerIdx } = ctx
  const allowed = allowedSources(form, ownerIdx, selfAllowed)
  const isVar = typeof rule.variableId === 'string' && rule.variableId !== ''
  const srcValue = isVar ? `v:${rule.variableId}` : rule.questionId ? `q:${rule.questionId}` : ''
  const srcIdx = !isVar && rule.questionId && form.indexOf[rule.questionId] !== undefined ? form.indexOf[rule.questionId] : -1
  const srcQ = srcIdx >= 0 ? form.questions[srcIdx] : undefined
  const kind: ValueKind | 'variable' | null = isVar ? 'variable' : srcQ ? valueKindOf(srcQ) : rule.questionId ? 'text' : null

  let extraQ: { value: string; label: string } | null = null
  if (!isVar && rule.questionId && !allowed.some(s => s.q.id === rule.questionId)) {
    const why = !srcQ ? '' : srcIdx === ownerIdx ? 'this question' : srcIdx > ownerIdx ? 'later question' : 'no answer to check'
    extraQ = { value: srcValue, label: srcQ ? `${questionLabel(srcQ, srcIdx)} (${why})` : 'Question (deleted)' }
  }
  const extraV = isVar && !variables.some(v => v.id === rule.variableId) ? { value: srcValue, label: 'Variable (deleted)' } : null

  const ops: Operator[] = kind && kind !== 'none' ? operatorsFor(kind) : []
  const opList = kind && typeof rule.operator === 'string' && (rule.operator as string) !== '' && !ops.includes(rule.operator) ? [...ops, rule.operator] : ops
  const opText = (op: Operator) => (isKnownOperator(op) && kind ? operatorLabel(op, kind) : `${String(op)} (unknown)`)

  const op = rule.operator
  const hideValue = !kind || kind === 'none' || kind === 'legal' || kind === 'presence' || !isKnownOperator(op) || VALUELESS.includes(op)
  const useChoiceSelect = (kind === 'choice' || kind === 'yesno') && (op === 'equals' || op === 'not_equals')
    || kind === 'multi' && (op === 'includes' || op === 'not_includes')
  const hasError = issues.some(i => i.severity === 'error')

  let valueInput: React.ReactNode = null
  if (!hideValue) {
    const common = { className: `fb-lg-in fb-lg-val${hasError && rule.value === '' ? ' bad' : ''}`, 'aria-label': 'Value to compare with' }
    if (useChoiceSelect) {
      const choices = choicesOf(srcQ)
      const stale = rule.value !== '' && !choices.includes(rule.value)
      valueInput = (
        <select {...common} value={rule.value} onChange={e => onChange({ ...rule, value: e.target.value })}>
          <option value="" disabled>Choose an answer</option>
          {choices.map((c, i) => <option key={i} value={c}>{c === '' ? '(blank choice)' : c}</option>)}
          {stale && <option value={rule.value}>{rule.value} (no longer a choice)</option>}
        </select>
      )
    } else if (kind === 'number' || kind === 'variable') {
      const a = kind === 'number' ? numberAttrs(srcQ) : { step: 'any' as const }
      valueInput = <input {...common} type="number" inputMode="decimal" {...a} placeholder="Number" value={rule.value} onChange={e => onChange({ ...rule, value: e.target.value })} />
    } else if (kind === 'date') {
      valueInput = <input {...common} type="date" value={rule.value} onChange={e => onChange({ ...rule, value: e.target.value })} />
    } else {
      valueInput = <input {...common} type="text" placeholder="Type a value" value={rule.value} onChange={e => onChange({ ...rule, value: e.target.value })} />
    }
  }

  return (
    <div className={`fb-lg-cond${hasError ? ' bad' : ''}`}>
      <div className="fb-lg-cond-row">
        <select className="fb-lg-in fb-lg-src" aria-label="Question or variable to check" value={srcValue}
          onChange={e => onChange(applySource(rule, e.target.value, form))}>
          <option value="" disabled>Choose a question or variable</option>
          {(allowed.length > 0 || extraQ) && (
            <optgroup label="Questions">
              {allowed.map(s => <option key={s.q.id} value={`q:${s.q.id}`}>{questionLabel(s.q, s.index)}{s.index === ownerIdx ? ' (this question)' : ''}</option>)}
              {extraQ && <option value={extraQ.value}>{extraQ.label}</option>}
            </optgroup>
          )}
          {(variables.length > 0 || extraV) && (
            <optgroup label="Variables">
              {variables.map(v => <option key={v.id} value={`v:${v.id}`}>{v.label}</option>)}
              {extraV && <option value={extraV.value}>{extraV.label}</option>}
            </optgroup>
          )}
        </select>
        <select className="fb-lg-in fb-lg-op" aria-label="Comparison" disabled={!kind || kind === 'none'}
          value={kind && kind !== 'none' ? String(op ?? '') : ''}
          onChange={e => onChange({ ...rule, operator: e.target.value as Operator })}>
          {(!kind || kind === 'none') && <option value="">is</option>}
          {kind && kind !== 'none' && !opList.includes(op) && <option value="" disabled>Choose</option>}
          {opList.map(o => <option key={String(o)} value={String(o)}>{opText(o)}</option>)}
        </select>
        {valueInput}
        <button type="button" className="fb-icon-btn fb-lg-x" aria-label="Remove condition" title="Remove condition" onClick={onRemove}>
          <Icon name="close" />
        </button>
      </div>
      <IssueList items={issues} />
    </div>
  )
}

function ConditionGroupEditor({ group, ctx, selfAllowed, issues, onChange }: {
  group: ConditionGroup; ctx: Ctx; selfAllowed: boolean; issues: LogicIssue[]
  onChange: (g: ConditionGroup) => void
}) {
  const rules = arr<LogicRule>(group.rules)
  const logic: 'all' | 'any' = group.logic === 'all' ? 'all' : 'any'
  const set = (next: LogicRule[]) => onChange({ ...group, logic: group.logic, rules: next })
  return (
    <div className="fb-lg-group">
      {rules.length > 1 && (
        <div className="fb-lg-match">
          <span>Match</span>
          <Seg label="How conditions combine" value={logic}
            options={[{ value: 'all', label: 'all' }, { value: 'any', label: 'any' }]}
            onChange={v => onChange({ ...group, logic: v, rules })} />
          <span>of these conditions</span>
        </div>
      )}
      {rules.map((r, i) => (
        <ConditionRow key={i} rule={r} ctx={ctx} selfAllowed={selfAllowed}
          issues={issues.filter(x => x.conditionIndex === i)}
          onChange={nr => set(rules.map((x, j) => (j === i ? nr : x)))}
          onRemove={() => set(rules.filter((_, j) => j !== i))} />
      ))}
      <button type="button" className="fb-ghost fb-lg-small" onClick={() => set([...rules, newCondition(ctx.form, ctx.ownerIdx, selfAllowed, ctx.variables)])}>
        <Icon name="plus" size={12} /> Add condition
      </button>
    </div>
  )
}

function Section({ id, title, count, open, onToggle, summary, hasError, children }: {
  id: string; title: string; count: number; open: boolean; onToggle: () => void
  summary: string; hasError: boolean; children: React.ReactNode
}) {
  return (
    <section className="fb-lg-sec" aria-labelledby={`${id}-h`}>
      <h3 className="fb-lg-sec-hw">
        <button type="button" id={`${id}-h`} className="fb-lg-sec-h" aria-expanded={open} aria-controls={`${id}-b`} onClick={onToggle}>
          <span className={`fb-lg-chev${open ? ' open' : ''}`}><Icon name="chevron" /></span>
          <span className="fb-lg-sec-tw">
            <span className="fb-lg-sec-t">
              {title}
              {count > 0 && <span className="fb-lg-chip">{count}<span className="fb-lg-sr"> {count === 1 ? 'rule' : 'rules'}</span></span>}
              {hasError && <span className="fb-lg-dot" role="img" aria-label="Needs attention" />}
            </span>
            {!open && summary && <span className="fb-lg-sum">{summary}</span>}
          </span>
        </button>
      </h3>
      <div id={`${id}-b`} className="fb-lg-sec-b" hidden={!open}>{children}</div>
    </section>
  )
}

// ─── Focus helpers ──────────────────────────────────────────────────────────

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter(el => el.tabIndex >= 0 && el.getClientRects().length > 0 && !el.closest('[hidden]'))
}
function visible(el: Element | null | undefined): el is HTMLElement {
  return !!el && (el as HTMLElement).getClientRects().length > 0
}

// ─── The modal ──────────────────────────────────────────────────────────────

export default function FormLogicModal(props: FormLogicModalProps): React.JSX.Element | null {
  if (!props.open) return null
  return <LogicWindow {...props} />
}

function LogicWindow(props: FormLogicModalProps) {
  const { questions, variables, initialQuestionId, themeColor, renderTypeBadge, typeLabel, typeTint, onClose, onSave } = props

  const [initial] = useState(() => buildDraft(questions, variables))
  const [draft, setDraft] = useState<LogicDraft>(() => clone(initial))
  const ids = useMemo(() => alignIds(questions), [questions])
  const merged = useMemo(() => mergeDraft(questions, ids, draft), [questions, ids, draft])
  const form = useMemo(() => readFormLogic({ questions: merged, theme: { variables: draft.variables } }), [merged, draft.variables])
  const issues = useMemo(() => validateLogic(form), [form])
  const issuesByQ = useMemo(() => {
    const m: Record<string, LogicIssue[]> = {}
    for (const i of issues) (m[i.questionId] = m[i.questionId] || []).push(i)
    return m
  }, [issues])
  const block = useMemo(() => saveBlock(initial, draft, issues), [initial, draft, issues])
  const dirty = block !== 'no_changes'

  const [selId, setSelId] = useState<string | null>(() => {
    const f = readFormLogic({ questions })
    return initialQuestionId && f.indexOf[initialQuestionId] !== undefined ? initialQuestionId : f.questions[0]?.id ?? null
  })
  const selIdx = selId !== null && form.indexOf[selId] !== undefined ? form.indexOf[selId] : form.questions.length ? 0 : -1
  const sel = selIdx >= 0 ? form.questions[selIdx] : undefined
  const selKeys: LogicKeys = sel ? draft.logic[sel.id] || {} : {}
  const selIssues = sel ? issuesByQ[sel.id] || [] : []
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>(() => defaultExpanded(selId ? initial.logic[selId] : undefined))
  const [newVar, setNewVar] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const pickRef = useRef<HTMLSelectElement>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  const qHeadRef = useRef<HTMLHeadingElement>(null)
  const newVarBtnRef = useRef<HTMLButtonElement>(null)
  const confirming = useRef(false)
  const downOnBg = useRef(false)
  const stash = useRef<Record<string, DisplayLogic>>({})
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef({ dirty, onClose })
  latest.current = { dirty, onClose }

  // ── Confirms (Esc is ignored while one is open, so it handles its own Esc) ──
  const ask = async (opts: Parameters<typeof confirmDialog>[0]): Promise<boolean> => {
    if (confirming.current) return false
    const back = document.activeElement as HTMLElement | null
    confirming.current = true
    let ok = false
    try { ok = await confirmDialog(opts) } finally { confirming.current = false }
    if (!ok && back && back.isConnected) back.focus()
    return ok
  }
  const requestClose = async () => {
    if (confirming.current) return
    if (!latest.current.dirty) { latest.current.onClose(); return }
    const ok = await ask({ title: 'Discard changes?', message: 'Your logic changes will be lost.', confirmLabel: 'Discard', tone: 'danger' })
    if (ok) latest.current.onClose()
  }
  const closeRef = useRef(requestClose)
  closeRef.current = requestClose

  // ── Focus on open, return it on close, lock page scroll ──
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const row = listRef.current?.querySelector('[aria-current="true"]')
    if (visible(row)) row.focus()
    else if (visible(pickRef.current)) pickRef.current.focus()
    else panelRef.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
      if (copyTimer.current) clearTimeout(copyTimer.current)
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus()
    }
  }, [])

  // ── Esc (capture phase, so the builder's own Esc handlers don't also fire) and the Tab trap ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirming.current) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        const t = e.target as HTMLElement | null
        if (t && typeof t.closest === 'function' && t.closest('[data-lg-esc="newvar"]')) {
          setNewVar(null)
          setTimeout(() => newVarBtnRef.current?.focus(), 0)
          return
        }
        void closeRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const root = panelRef.current
      if (!root) return
      const list = focusables(root)
      if (!list.length) { e.preventDefault(); root.focus(); return }
      const first = list[0], last = list[list.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (!active || !root.contains(active) || active === root) {
        e.preventDefault(); (e.shiftKey ? last : first).focus()
      } else if (e.shiftKey && active === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault(); first.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // ── Draft edits ──
  const patch = (p: Partial<LogicKeys>) => {
    if (!sel) return
    const id = sel.id
    // An emptied hide/branching/calculation section goes back to "no key", so
    // adding a rule and removing it again leaves nothing to save.
    const next: Partial<LogicKeys> = { ...p }
    for (const k of ['choice_logic', 'branching', 'calculations'] as const) {
      if (k in next && next[k] !== undefined && cleanKey(k, next[k]) === undefined) next[k] = undefined
    }
    setDraft(d => ({ ...d, logic: { ...d.logic, [id]: { ...(d.logic[id] || {}), ...next } } }))
  }
  const setVars = (fn: (vs: FormVariable[]) => FormVariable[]) => setDraft(d => ({ ...d, variables: fn(d.variables) }))

  const selectQuestion = (id: string, focus = false) => {
    if (sel && id === sel.id) return
    setSelId(id)
    setExpanded(defaultExpanded(draft.logic[id]))
    paneRef.current?.scrollTo?.({ top: 0 })
    if (focus) {
      const idx = form.indexOf[id]
      setTimeout(() => listRef.current?.querySelector<HTMLElement>(`[data-idx="${idx}"]`)?.focus(), 0)
    }
  }
  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
    const n = form.questions.length
    if (!n) return
    e.preventDefault()
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : Math.min(n - 1, Math.max(0, selIdx + (e.key === 'ArrowDown' ? 1 : -1)))
    selectQuestion(form.questions[next].id, true)
  }

  const deleteAll = async () => {
    if (!sel) return
    const ok = await ask({
      title: 'Delete all rules?',
      message: `This removes the display conditions, hidden choices, branching and calculations for question ${selIdx + 1}.`,
      confirmLabel: 'Delete rules',
      tone: 'danger',
    })
    if (!ok) return
    delete stash.current[sel.id]
    patch({ conditional_logic: undefined, choice_logic: undefined, branching: undefined, calculations: undefined })
    setExpanded(defaultExpanded(undefined))
    setTimeout(() => qHeadRef.current?.focus(), 0)
  }

  const save = () => {
    if (block) return
    onSave(buildSave(questions, variables, initial, draft))
  }

  // form.variables = draft variables as the engine sees them (a blank name reads as its id).
  const ctx: Ctx = { form, variables: form.variables, ownerIdx: selIdx }
  const accent = themeColor || '#18181b'
  const counts = sectionCounts(selKeys)
  const totalRules = sel ? countRules(sel) : 0
  const secIssues = (s: LogicSection) => selIssues.filter(i => i.section === s)
  const secError = (s: LogicSection) => selIssues.some(i => i.section === s && i.severity === 'error')
  const condIssues = (s: LogicSection, ruleId?: string) => selIssues.filter(i => i.section === s && i.ruleId === ruleId && i.conditionIndex !== undefined)
  const ruleIssues = (s: LogicSection, ruleId?: string) => selIssues.filter(i => i.section === s && i.ruleId === ruleId && i.conditionIndex === undefined)
  const anyError = (list: LogicIssue[]) => list.some(i => i.severity === 'error')
  const toggle = (k: SectionKey) => setExpanded(x => ({ ...x, [k]: !x[k] }))

  // ── Section: Question display ──
  const cl = selKeys.conditional_logic
  const clRules = cl ? arr<LogicRule>(cl.rules) : []
  const initialCl = sel ? initial.logic[sel.id]?.conditional_logic : undefined
  const legacyEmpty = !!cl && clRules.length === 0 && stableStringify(cl) === stableStringify(initialCl)
  const displayMode: 'always' | 'show' | 'hide' = !cl || legacyEmpty ? 'always' : cl.condition === 'show' ? 'show' : 'hide'
  const setDisplayMode = (m: 'always' | 'show' | 'hide') => {
    if (!sel || m === displayMode) return
    if (m === 'always') {
      if (cl && clRules.length) stash.current[sel.id] = cl
      patch({ conditional_logic: undefined })
      return
    }
    if (cl && !legacyEmpty) { patch({ conditional_logic: { ...cl, condition: m } }); return }
    const kept = stash.current[sel.id]
    if (kept && arr(kept.rules).length) { patch({ conditional_logic: { ...kept, condition: m } }); return }
    patch({ conditional_logic: { ...(cl || {}), condition: m, logic: 'all', rules: [newCondition(form, selIdx, false, draft.variables)] } as DisplayLogic })
  }
  const nothingEarlier = sel ? allowedSources(form, selIdx, false).length === 0 : false

  // ── Section: Hide answer choices ──
  const choiceRules = arr<ChoiceRule>(selKeys.choice_logic)
  const selIsChoice = !!sel && isChoiceType(sel.type)
  const selChoices = sel ? choicesOf(sel) : []
  const otherLabel = sel && selIsChoice ? otherChoiceLabel(sel as any) : null
  const setChoiceRules = (list: ChoiceRule[]) => patch({ choice_logic: list })

  // ── Section: Branching ──
  const br = isObj(selKeys.branching) ? selKeys.branching : undefined
  const brRules = arr(br?.rules)
  const setBranching = (b: Partial<Branching>) => patch({ branching: { ...(br || {}), rules: brRules, ...b } as Branching })
  const later = sel ? form.questions.slice(selIdx + 1).map((q, k) => ({ q, index: selIdx + 1 + k })) : []
  const isLast = !!sel && selIdx === form.questions.length - 1
  const badTargetOption = (t: unknown): { value: string; label: string } | null => {
    if (!isObj(t) || t.kind !== 'question') return null
    const ti = typeof t.questionId === 'string' && form.indexOf[t.questionId] !== undefined ? form.indexOf[t.questionId] : -1
    if (ti === -1) return { value: encTarget(t), label: 'Question (deleted)' }
    if (ti <= selIdx) return { value: encTarget(t), label: `${questionLabel(form.questions[ti], ti)} (${ti === selIdx ? 'this question' : 'earlier question'})` }
    return null
  }

  // ── Section: Calculations ──
  const calcs = arr<CalcOp>(selKeys.calculations)
  const setCalcs = (list: CalcOp[]) => patch({ calculations: list })
  const selKind = sel ? valueKindOf(sel) : 'none'
  const canChoose = selKind === 'choice' || selKind === 'multi' || selKind === 'yesno'
  const selNumeric = !!sel && isNumericType(sel.type)
  const isStatement = sel?.type === 'statement'
  const firstVarId = draft.variables[0]?.id

  const addVariable = () => {
    const name = (newVar || '').trim().slice(0, MAX_VARIABLE_LABEL)
    if (!name) return
    const id = slugVariableId(name, [...draft.variables.map(v => v.id), DEFAULT_SCORE_VARIABLE.id])
    setVars(vs => [...vs, { id, label: name, initial: 0 }])
    setNewVar(null)
    setTimeout(() => newVarBtnRef.current?.focus(), 0)
  }
  const removeVariable = async (v: FormVariable) => {
    if (usageCount(v.id, draft.logic) > 0) return
    const ok = await ask({
      title: `Remove "${v.label || v.id}"?`,
      message: `Any {variable:${v.id}} in your questions will show nothing.`,
      confirmLabel: 'Remove',
      tone: 'danger',
    })
    if (!ok) return
    setVars(vs => vs.filter(x => x.id !== v.id))
    setTimeout(() => newVarBtnRef.current?.focus(), 0)
  }
  const copyToken = (id: string) => {
    const token = `{variable:${id}}`
    const done = () => {
      setCopied(id)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(null), 1600)
    }
    const fallback = () => {
      // Older browsers / non-secure contexts: copy through a temporary textarea.
      try {
        const ta = document.createElement('textarea')
        ta.value = token
        ta.setAttribute('readonly', '')
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        const ok = document.execCommand('copy')
        ta.remove()
        if (ok) done()
      } catch { /* nothing else to try */ }
    }
    try {
      const p = navigator.clipboard?.writeText(token)
      if (p && typeof p.then === 'function') p.then(done, fallback)
      else fallback()
    } catch { fallback() }
  }

  // ── Collapsed summaries (engine wording) ──
  const summaries: Record<SectionKey, string> = { display: '', choices: '', branching: '', calculations: '' }
  if (sel) {
    summaries.display = displayMode === 'always' ? 'Always shown'
      : clRules.length ? `${displayMode === 'show' ? 'Shown' : 'Hidden'} when ${describeGroup(cl!, form)}` : 'No conditions yet'
    if (choiceRules.length) {
      const r = choiceRules[0]
      summaries.choices = `Hide ${r.choices.length ? r.choices.join(', ') : '(nothing chosen)'}${arr(r.rules).length ? ` when ${describeGroup(r, form)}` : ''}${choiceRules.length > 1 ? ` (+${choiceRules.length - 1} more)` : ''}`
    } else summaries.choices = 'All answers always show'
    if (brRules.length) {
      const r = brRules[0]
      const to = encTarget(r.to) ? describeTarget(r.to, form, sel.id) : '(choose where)'
      summaries.branching = `If ${arr(r.rules).length ? describeGroup(r, form) : '(no conditions)'}, go to ${to}${brRules.length > 1 ? ` (+${brRules.length - 1} more)` : ''}`
    } else summaries.branching = `Everyone goes to: ${describeTarget(br?.otherwise, form, sel.id)}`
    summaries.calculations = calcs.length
      ? `${describeOp(calcs[0], form, sel)}${calcs.length > 1 ? ` (+${calcs.length - 1} more)` : ''}`
      : 'No calculations'
  }

  const blockedHint = block === 'unfinished' ? 'Finish or remove the highlighted rules to save.' : ''

  return (
    <div className="fb-modal-bg fb-lg-bg"
      onMouseDown={e => { downOnBg.current = e.target === e.currentTarget }}
      onClick={e => { if (downOnBg.current && e.target === e.currentTarget) void requestClose(); downOnBg.current = false }}>
      <style>{CSS}</style>
      <div ref={panelRef} className="fb-lg" role="dialog" aria-modal="true" aria-labelledby="fb-lg-title" tabIndex={-1}
        style={{ ['--lg-accent' as any]: accent, ['--lg-on' as any]: readableOn(accent) }}>
        <header className="fb-lg-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id="fb-lg-title" className="fb-lg-title">Logic</h2>
            <p className="fb-lg-subtitle">Choose a question, then decide what happens.</p>
          </div>
          <button type="button" className="fb-icon-btn" aria-label="Close" title="Close" onClick={() => void requestClose()}>
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="fb-lg-body">
          <div ref={listRef} className="fb-lg-list" role="navigation" aria-label="Questions" onKeyDown={onListKey}>
            {form.questions.map((q, i) => {
              const n = countRules(q)
              const err = (issuesByQ[q.id] || []).some(x => x.severity === 'error')
              const on = sel?.id === q.id
              return (
                <button key={q.id} type="button" data-idx={i} className={`fb-lg-row${on ? ' on' : ''}`}
                  aria-current={on ? 'true' : undefined} tabIndex={on ? 0 : -1}
                  style={{ ['--tint' as any]: typeTint(q.type).fg }} onClick={() => selectQuestion(q.id)}>
                  {renderTypeBadge(q, i + 1)}
                  <span className={`fb-lg-row-t${titleOf(q) === 'Untitled question' && !(q.title || '').trim() ? ' empty' : ''}`}>{titleOf(q)}</span>
                  {n > 0 && <span className="fb-lg-chip">{n === 1 ? '1 rule set' : `${n} rules set`}</span>}
                  {err && <span className="fb-lg-dot" role="img" aria-label="Needs attention" title="Needs attention" />}
                </button>
              )
            })}
          </div>

          <div ref={paneRef} className="fb-lg-pane">
            {form.questions.length > 0 && (
              <label className="fb-lg-pick">
                <span className="fb-lg-sr">Question</span>
                <select ref={pickRef} className="fb-lg-in" value={sel?.id || ''} onChange={e => selectQuestion(e.target.value)}>
                  {form.questions.map((q, i) => {
                    const n = countRules(q)
                    const err = (issuesByQ[q.id] || []).some(x => x.severity === 'error')
                    return <option key={q.id} value={q.id}>{questionLabel(q, i)}{n ? ` · ${n === 1 ? '1 rule set' : `${n} rules set`}` : ''}{err ? ' · needs attention' : ''}</option>
                  })}
                </select>
              </label>
            )}

            {!sel ? (
              <div className="fb-lg-empty">
                <Icon name="branch" size={22} />
                <p>Add a question first, then come back to set up logic.</p>
              </div>
            ) : (
              <>
                <div className="fb-lg-qhead">
                  {renderTypeBadge(sel, selIdx + 1)}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h3 ref={qHeadRef} tabIndex={-1} className={`fb-lg-qtitle${(sel.title || '').trim() ? '' : ' empty'}`}>{titleOf(sel)}</h3>
                    <span className="fb-lg-qtype">{typeLabel(sel.type)}</span>
                  </div>
                </div>

                {/* 1. Question display */}
                <Section id="fb-lg-display" title="Question display" count={counts.display} open={expanded.display}
                  onToggle={() => toggle('display')} summary={summaries.display} hasError={secError('display')}>
                  <p className="fb-lg-desc">Show or hide this question depending on earlier answers or scores.</p>
                  <Seg label="When this question shows" value={displayMode} onChange={setDisplayMode}
                    options={[{ value: 'always', label: 'Always show' }, { value: 'show', label: 'Show when…' }, { value: 'hide', label: 'Hide when…' }]} />
                  {nothingEarlier && <p className="fb-lg-muted">There&apos;s nothing earlier to check for the first question.</p>}
                  {displayMode !== 'always' && cl && (
                    <div style={{ marginTop: 12 }}>
                      <ConditionGroupEditor group={cl} ctx={ctx} selfAllowed={false} issues={condIssues('display')}
                        onChange={g => patch({ conditional_logic: { ...cl, ...g } as DisplayLogic })} />
                      {clRules.length === 0 && <p className="fb-lg-muted">With no conditions, this question always shows.</p>}
                    </div>
                  )}
                  <IssueList items={ruleIssues('display')} />
                </Section>

                {/* 2. Hide answer choices */}
                {selIsChoice ? (
                  <Section id="fb-lg-choices" title="Hide answer choices" count={counts.choices} open={expanded.choices}
                    onToggle={() => toggle('choices')} summary={summaries.choices} hasError={secError('choices')}>
                    <p className="fb-lg-desc">Hide some choices depending on earlier answers or scores.</p>
                    {selChoices.length === 0 && <p className="fb-lg-muted">Add answer choices to this question first.</p>}
                    {choiceRules.map((r, ri) => {
                      const rIssues = ruleIssues('choices', r.id)
                      const cIssues = condIssues('choices', r.id)
                      const picked = arr<string>(r.choices)
                      const stale = picked.filter(c => !selChoices.includes(c))
                      const setRule = (nr: ChoiceRule) => setChoiceRules(choiceRules.map((x, j) => (j === ri ? nr : x)))
                      return (
                        <div key={r.id} className={`fb-lg-card${anyError([...rIssues, ...cIssues]) ? ' bad' : ''}`}>
                          <div className="fb-lg-card-h">
                            <span className="fb-lg-kw">Hide</span>
                            <span style={{ flex: 1 }} />
                            <button type="button" className="fb-icon-btn fb-lg-x" aria-label="Delete rule" title="Delete rule"
                              onClick={() => setChoiceRules(choiceRules.filter((_, j) => j !== ri))}><Icon name="trash" /></button>
                          </div>
                          <div className="fb-lg-chips" role="group" aria-label="Answers to hide">
                            {selChoices.map((c, ci) => {
                              const on = picked.includes(c)
                              return (
                                <button key={ci} type="button" aria-pressed={on} className={`fb-lg-tchip${on ? ' on' : ''}`}
                                  title={otherLabel === c ? 'Hiding this also hides its text box.' : undefined}
                                  onClick={() => setRule({ ...r, choices: on ? picked.filter(x => x !== c) : [...picked, c] })}>
                                  {on && <Icon name="check" size={12} />}
                                  <span className="fb-lg-tchip-t">{c === '' ? '(blank choice)' : c}</span>
                                  {otherLabel === c && <span className="fb-lg-tag">text box</span>}
                                </button>
                              )
                            })}
                            {stale.map((c, ci) => (
                              <button key={`s${ci}`} type="button" aria-pressed="true" className="fb-lg-tchip stale" title="No longer a choice. Click to remove."
                                onClick={() => setRule({ ...r, choices: picked.filter(x => x !== c) })}>
                                <span className="fb-lg-tchip-t">{c}</span><Icon name="close" size={11} />
                              </button>
                            ))}
                          </div>
                          <p className="fb-lg-kw" style={{ margin: '12px 0 8px' }}>when</p>
                          <ConditionGroupEditor group={r} ctx={ctx} selfAllowed={false} issues={cIssues}
                            onChange={g => setRule({ ...r, ...g })} />
                          <IssueList items={rIssues} />
                        </div>
                      )
                    })}
                    <button type="button" className="fb-ghost fb-lg-small" disabled={selChoices.length === 0}
                      onClick={() => setChoiceRules([...choiceRules, { id: newLogicId(), logic: 'all', rules: [newCondition(form, selIdx, false, draft.variables)], choices: [] }])}>
                      <Icon name="plus" size={12} /> Add rule
                    </button>
                    <div className="fb-lg-fixed" style={{ marginTop: 12 }}>
                      <span>All other cases:</span> <b>Show all answers</b>
                    </div>
                  </Section>
                ) : choiceRules.length > 0 ? (
                  <div className="fb-lg-warn">
                    <Icon name="info" />
                    <span style={{ flex: 1 }}>These rules don&apos;t apply to this question type</span>
                    <button type="button" className="fb-ghost fb-lg-small" onClick={() => patch({ choice_logic: undefined })}>Remove</button>
                  </div>
                ) : null}

                {/* 3. Branching */}
                <Section id="fb-lg-branching" title="Branching" count={counts.branching} open={expanded.branching}
                  onToggle={() => toggle('branching')} summary={summaries.branching} hasError={secError('branching')}>
                  <p className="fb-lg-desc">Send people to a later question or straight to the end. Rules are checked from top to bottom and the first match wins.</p>
                  {brRules.map((r, ri) => {
                    const rIssues = ruleIssues('branching', r.id)
                    const cIssues = condIssues('branching', r.id)
                    const bad = badTargetOption(r.to)
                    const tv = encTarget(r.to)
                    const setRule = (nr: typeof r) => setBranching({ rules: brRules.map((x, j) => (j === ri ? nr : x)) })
                    const move = (d: -1 | 1) => {
                      const list = [...brRules]
                      const [it] = list.splice(ri, 1)
                      list.splice(ri + d, 0, it)
                      setBranching({ rules: list })
                    }
                    return (
                      <div key={r.id} className={`fb-lg-card${anyError([...rIssues, ...cIssues]) ? ' bad' : ''}`}>
                        <div className="fb-lg-card-h">
                          <span className="fb-lg-kw">If</span>
                          <span style={{ flex: 1 }} />
                          <button type="button" className="fb-icon-btn fb-lg-x" aria-label="Move rule up" title="Move rule up" disabled={ri === 0} onClick={() => move(-1)}><Icon name="up" /></button>
                          <button type="button" className="fb-icon-btn fb-lg-x" aria-label="Move rule down" title="Move rule down" disabled={ri === brRules.length - 1} onClick={() => move(1)}><Icon name="down" /></button>
                          <button type="button" className="fb-icon-btn fb-lg-x" aria-label="Delete rule" title="Delete rule"
                            onClick={() => setBranching({ rules: brRules.filter((_, j) => j !== ri) })}><Icon name="trash" /></button>
                        </div>
                        <ConditionGroupEditor group={r} ctx={ctx} selfAllowed issues={cIssues} onChange={g => setRule({ ...r, ...g })} />
                        <div className="fb-lg-then">
                          <span className="fb-lg-kw">then go to</span>
                          <select className={`fb-lg-in fb-lg-target${!tv || bad ? ' bad' : ''}`} aria-label="Where this rule goes" value={tv}
                            onChange={e => { const t = decTarget(e.target.value); if (t) setRule({ ...r, to: t }) }}>
                            <option value="" disabled>Choose where to go</option>
                            {later.map(s => <option key={s.q.id} value={`q:${s.q.id}`}>{questionLabel(s.q, s.index)}</option>)}
                            <option value="end">End of form (thank-you screen)</option>
                            {tv === 'next' && <option value="next">Next question</option>}
                            {bad && <option value={bad.value}>{bad.label}</option>}
                          </select>
                        </div>
                        <IssueList items={rIssues} />
                      </div>
                    )
                  })}
                  <button type="button" className="fb-ghost fb-lg-small"
                    onClick={() => setBranching({ rules: [...brRules, { id: newLogicId(), logic: 'all', rules: [newCondition(form, selIdx, true, draft.variables)] } as any] })}>
                    <Icon name="plus" size={12} /> Add rule
                  </button>
                  {(() => {
                    const o = br?.otherwise
                    const ov = !o || !isObj(o) || o.kind === 'next' ? 'next' : encTarget(o)
                    const bad = badTargetOption(o)
                    const oIssues = ruleIssues('branching', 'otherwise')
                    return (
                      <div className={`fb-lg-fixed${anyError(oIssues) ? ' bad' : ''}`} style={{ marginTop: 12 }}>
                        <label htmlFor="fb-lg-otherwise">All other cases go to</label>
                        <select id="fb-lg-otherwise" className={`fb-lg-in fb-lg-target${bad ? ' bad' : ''}`} value={ov}
                          onChange={e => { const t = decTarget(e.target.value); setBranching({ otherwise: t && t.kind !== 'next' ? t : undefined }) }}>
                          <option value="next">{isLast ? 'End of form (default)' : 'Next question (default)'}</option>
                          {later.map(s => <option key={s.q.id} value={`q:${s.q.id}`}>{questionLabel(s.q, s.index)}</option>)}
                          {(!isLast || ov === 'end') && <option value="end">End of form</option>}
                          {bad && <option value={bad.value}>{bad.label}</option>}
                          {!bad && ov === '' && <option value="">Choose where to go</option>}
                        </select>
                        <div style={{ flexBasis: '100%' }}><IssueList items={oIssues} /></div>
                      </div>
                    )
                  })()}
                </Section>

                {/* 4. Calculations */}
                <Section id="fb-lg-calcs" title="Calculations" count={counts.calculations} open={expanded.calculations}
                  onToggle={() => toggle('calculations')} summary={summaries.calculations} hasError={secError('calculations')}>
                  <p className="fb-lg-desc">Add up a score or a price as people answer. Use variables in conditions, or show them in text.</p>

                  <div className="fb-lg-vars" role="group" aria-labelledby="fb-lg-vars-h">
                    <p id="fb-lg-vars-h" className="fb-lg-vars-h">Variables (whole form)</p>
                    {draft.variables.length === 0 && <p className="fb-lg-muted">No variables yet.</p>}
                    {draft.variables.map(v => {
                      const used = usageCount(v.id, draft.logic)
                      return (
                        <div key={v.id} className="fb-lg-var">
                          <input className="fb-lg-in fb-lg-var-name" aria-label="Variable name" value={v.label} maxLength={MAX_VARIABLE_LABEL} placeholder="Name"
                            onChange={e => { const label = e.target.value.slice(0, MAX_VARIABLE_LABEL); setVars(vs => vs.map(x => (x.id === v.id ? { ...x, label } : x))) }} />
                          <code className="fb-lg-token">{`{variable:${v.id}}`}</code>
                          <button type="button" className="fb-ghost fb-lg-small" onClick={() => copyToken(v.id)} aria-label={`Copy {variable:${v.id}}`}>
                            <Icon name={copied === v.id ? 'check' : 'copy'} size={12} />{copied === v.id ? 'Copied' : 'Copy'}
                          </button>
                          <label className="fb-lg-inline">
                            <span>Starts at</span>
                            <NumField className="fb-lg-in fb-lg-num" value={v.initial} blankAs={0} aria-label={`${v.label || v.id} starts at`}
                              onCommit={n => setVars(vs => vs.map(x => (x.id === v.id ? { ...x, initial: n } : x)))} />
                          </label>
                          <span title={used ? `Used in ${plural(used, 'place')}` : undefined}>
                            <button type="button" className="fb-icon-btn fb-lg-x" disabled={used > 0}
                              aria-label={used ? `Remove ${v.label || v.id} (used in ${plural(used, 'place')})` : `Remove ${v.label || v.id}`}
                              title={used ? `Used in ${plural(used, 'place')}` : 'Remove variable'}
                              onClick={() => void removeVariable(v)}><Icon name="trash" /></button>
                          </span>
                        </div>
                      )
                    })}
                    {newVar === null ? (
                      <button ref={newVarBtnRef} type="button" className="fb-ghost fb-lg-small" style={{ marginTop: 8 }} onClick={() => setNewVar('')}>
                        <Icon name="plus" size={12} /> New variable
                      </button>
                    ) : (
                      <div className="fb-lg-var" data-lg-esc="newvar">
                        <input autoFocus className="fb-lg-in fb-lg-var-name" aria-label="New variable name" placeholder="Name, for example Price"
                          maxLength={MAX_VARIABLE_LABEL} value={newVar}
                          onChange={e => setNewVar(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVariable() } }} />
                        {newVar.trim() && (
                          <code className="fb-lg-token fb-lg-token-new">{`{variable:${slugVariableId(newVar.trim(), [...draft.variables.map(v => v.id), DEFAULT_SCORE_VARIABLE.id])}}`}</code>
                        )}
                        <button type="button" className="fb-lg-small fb-lg-primary" disabled={!newVar.trim()} onClick={addVariable}>Add</button>
                        <button type="button" className="fb-ghost fb-lg-small" onClick={() => { setNewVar(null); setTimeout(() => newVarBtnRef.current?.focus(), 0) }}>Cancel</button>
                      </div>
                    )}
                  </div>

                  {calcs.map((op, oi) => {
                    const rIssues = ruleIssues('calculations', op.id)
                    const cIssues = condIssues('calculations', op.id)
                    const setOp = (n: CalcOp) => setCalcs(calcs.map((x, j) => (j === oi ? n : x)))
                    const when = isObj(op.when) ? op.when : undefined
                    const wk = when && ['answered', 'choice', 'conditions'].includes(when.kind) ? when.kind : ''
                    const useAns = !!op.useAnswer && selNumeric
                    const varKnown = draft.variables.some(v => v.id === op.variableId)
                    const choiceVal = when?.kind === 'choice' && typeof when.choice === 'string' ? when.choice : ''
                    return (
                      <div key={op.id} className={`fb-lg-card${anyError([...rIssues, ...cIssues]) ? ' bad' : ''}`}>
                        <div className="fb-lg-card-h">
                          <select className="fb-lg-in" aria-label="Operation" value={CALC_LABELS.some(c => c.op === op.op) ? op.op : ''}
                            onChange={e => setOp({ ...op, op: e.target.value as CalcOp['op'] })}>
                            {!CALC_LABELS.some(c => c.op === op.op) && <option value="" disabled>Choose</option>}
                            {CALC_LABELS.map(c => <option key={c.op} value={c.op}>{c.label}</option>)}
                          </select>
                          <select className={`fb-lg-in${varKnown ? '' : ' bad'}`} aria-label="Variable" value={op.variableId || ''}
                            onChange={e => setOp({ ...op, variableId: e.target.value })}>
                            <option value="" disabled>Choose a variable</option>
                            {form.variables.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                            {op.variableId && !varKnown && <option value={op.variableId}>Variable (deleted)</option>}
                          </select>
                          <span className="fb-lg-word">{op.op === 'set' ? 'to' : 'by'}</span>
                          {useAns
                            ? <span className="fb-lg-word fb-lg-ans">the answer</span>
                            : <NumField className={`fb-lg-in fb-lg-num${Number.isFinite(toNum(op.amount)) ? '' : ' bad'}`} value={Number.isFinite(toNum(op.amount)) ? Number(op.amount) : NaN}
                                blankAs={NaN} aria-label="Amount" placeholder="0" onCommit={n => setOp({ ...op, amount: n })} />}
                          {selNumeric && (
                            <label className="fb-lg-check">
                              <input type="checkbox" checked={!!op.useAnswer} onChange={e => {
                                const n: CalcOp = { ...op }
                                if (e.target.checked) n.useAnswer = true; else delete n.useAnswer
                                setOp(n)
                              }} />
                              <span>use the answer</span>
                            </label>
                          )}
                          <span style={{ flex: 1 }} />
                          <button type="button" className="fb-icon-btn fb-lg-x" aria-label="Delete calculation" title="Delete calculation"
                            onClick={() => setCalcs(calcs.filter((_, j) => j !== oi))}><Icon name="trash" /></button>
                        </div>
                        <div className="fb-lg-card-h" style={{ marginBottom: wk === 'conditions' ? 8 : 0 }}>
                          <select className={`fb-lg-in${wk ? '' : ' bad'}`} aria-label="When this applies" value={wk}
                            onChange={e => {
                              const k = e.target.value
                              const w: CalcWhen = k === 'choice' ? { kind: 'choice', choice: '' }
                                : k === 'conditions' ? { kind: 'conditions', logic: 'all', rules: [newCondition(form, selIdx, true, draft.variables)] }
                                : { kind: 'answered' }
                              setOp({ ...op, when: w })
                            }}>
                            {!wk && <option value="" disabled>Choose when</option>}
                            {(!isStatement || wk === 'answered') && <option value="answered">Always when answered</option>}
                            {(canChoose || wk === 'choice') && <option value="choice">When they choose…</option>}
                            <option value="conditions">When conditions match</option>
                          </select>
                          {wk === 'choice' && (
                            <select className={`fb-lg-in${choiceVal && selChoices.includes(choiceVal) ? '' : ' bad'}`} aria-label="Answer" value={choiceVal}
                              onChange={e => setOp({ ...op, when: { kind: 'choice', choice: e.target.value } })}>
                              <option value="" disabled>Choose an answer</option>
                              {selChoices.map((c, ci) => <option key={ci} value={c}>{c === '' ? '(blank choice)' : c}</option>)}
                              {choiceVal && !selChoices.includes(choiceVal) && <option value={choiceVal}>{choiceVal} (no longer a choice)</option>}
                            </select>
                          )}
                        </div>
                        {wk === 'conditions' && when && (
                          <ConditionGroupEditor group={when as ConditionGroup} ctx={ctx} selfAllowed issues={cIssues}
                            onChange={g => setOp({ ...op, when: { ...(when as any), ...g, kind: 'conditions' } })} />
                        )}
                        {op.op === 'divide' && !useAns && toNum(op.amount) === 0 && (
                          <ul className="fb-lg-issues"><li className="warning"><Icon name="info" size={13} /><span>Dividing by 0 is skipped.</span></li></ul>
                        )}
                        {isStatement && wk === 'answered' && (
                          <ul className="fb-lg-issues"><li className="warning"><Icon name="info" size={13} /><span>A statement has no answer, so this never applies. Choose &ldquo;When conditions match&rdquo;.</span></li></ul>
                        )}
                        <IssueList items={rIssues} />
                      </div>
                    )
                  })}
                  <button type="button" className="fb-ghost fb-lg-small" disabled={!firstVarId} title={firstVarId ? undefined : 'Add a variable first'}
                    onClick={() => setCalcs([...calcs, {
                      id: newLogicId(), variableId: firstVarId!, op: 'add', amount: 1,
                      when: isStatement ? { kind: 'conditions', logic: 'all', rules: [newCondition(form, selIdx, true, draft.variables)] } : { kind: 'answered' },
                    }])}>
                    <Icon name="plus" size={12} /> Add calculation
                  </button>
                  <p className="fb-lg-muted" style={{ marginTop: 10 }}>
                    Show a score in a later question or the thank-you message by typing <code className="fb-lg-token">{`{variable:${firstVarId || 'score'}}`}</code>.
                  </p>
                  <IssueList items={secIssues('calculations').filter(i => i.ruleId === undefined)} />
                </Section>
              </>
            )}
          </div>
        </div>

        <footer className="fb-lg-foot">
          <button type="button" className="fb-lg-del" disabled={!sel || totalRules === 0} onClick={() => void deleteAll()}>
            <Icon name="trash" /> Delete all rules
          </button>
          <span style={{ flex: 1 }} />
          {blockedHint && <span id="fb-lg-blocked" className="fb-lg-hint" role="status">{blockedHint}</span>}
          <button type="button" className="fb-ghost fb-lg-btn" onClick={() => void requestClose()}>Cancel</button>
          <button type="button" className="fb-lg-btn fb-lg-save" disabled={!!block} onClick={save}
            title={block === 'no_changes' ? 'No changes yet' : block === 'unfinished' ? blockedHint : undefined}
            aria-describedby={blockedHint ? 'fb-lg-blocked' : undefined}>
            Save
          </button>
        </footer>
      </div>
    </div>
  )
}

// ─── Styles (everything prefixed fb-lg-; builder classes reused as-is) ──────

const CSS = `
.fb-lg-bg { align-items: center !important; padding: 32px 16px !important; }
.fb-lg { --lg-accent: #18181b; --lg-on: #fff; position: relative; width: min(1080px, 100%); height: min(760px, calc(100vh - 64px)); display: flex; flex-direction: column; background: #fff; border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 24px 64px -12px rgba(0,0,0,.3); overflow: hidden; color: var(--ink); font-size: 13px; animation: fbLgPop .28s cubic-bezier(.16,1,.3,1) both; }
.fb-lg:focus { outline: none; }
.fb-lg :focus-visible { outline: 2px solid var(--lg-accent); outline-offset: 1px; }
.fb-lg-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.fb-lg-head { display: flex; align-items: flex-start; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.fb-lg-title { font-size: 16px; font-weight: 700; margin: 0; color: var(--ink); }
.fb-lg-subtitle { font-size: 12.5px; color: var(--slate); margin: 2px 0 0; }
.fb-lg-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 300px 1fr; }
.fb-lg-list { overflow-y: auto; border-right: 1px solid var(--border); padding: 10px; }
.fb-lg-row { width: 100%; display: flex; align-items: center; gap: 10px; padding: 7px 8px; margin-bottom: 2px; border-radius: 8px; border: none; background: transparent; cursor: pointer; text-align: left; font: inherit; color: var(--ink); transition: background .15s; }
.fb-lg-row:hover { background: #f4f4f5; }
.fb-lg-row.on { background: #f1f1f3; box-shadow: inset 3px 0 0 var(--tint, #18181b); }
.fb-lg-row-t { flex: 1; min-width: 0; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fb-lg-row-t.empty, .fb-lg-qtitle.empty { color: #a1a1aa; }
.fb-lg-chip { flex-shrink: 0; display: inline-flex; align-items: center; font-size: 11px; font-weight: 600; line-height: 1; padding: 4px 7px; border-radius: 999px; background: #eef0f3; color: #4b5563; white-space: nowrap; }
.fb-lg-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #dc2626; flex-shrink: 0; }
.fb-lg-pane { overflow-y: auto; padding: 18px 22px; min-width: 0; }
.fb-lg-pick { display: none; margin-bottom: 14px; }
.fb-lg-pick select { width: 100%; }
.fb-lg-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 60px 20px; color: var(--slate); text-align: center; }
.fb-lg-qhead { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.fb-lg-qtitle { font-size: 15px; font-weight: 700; margin: 0; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fb-lg-qtitle:focus { outline: none; }
.fb-lg-qtype { font-size: 12px; color: var(--slate); }
.fb-lg-sec { border: 1px solid var(--border); border-radius: 12px; margin-bottom: 12px; background: #fff; }
.fb-lg-sec-hw { margin: 0; font: inherit; }
.fb-lg-sec-h { width: 100%; display: flex; align-items: flex-start; gap: 8px; padding: 12px 14px; border: none; background: transparent; cursor: pointer; text-align: left; font: inherit; color: var(--ink); border-radius: 12px; }
.fb-lg-sec-h:hover { background: #fafafa; }
.fb-lg-chev { display: inline-flex; color: var(--slate); margin-top: 1px; transition: transform .18s; flex-shrink: 0; }
.fb-lg-chev.open { transform: rotate(90deg); }
.fb-lg-sec-tw { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.fb-lg-sec-t { display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 700; }
.fb-lg-sum { display: block; font-size: 12px; font-weight: 400; color: var(--slate); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fb-lg-sec-b { padding: 0 14px 14px; }
.fb-lg-sec-b[hidden] { display: none; }
.fb-lg-desc { font-size: 12.5px; color: var(--slate); margin: 0 0 12px; line-height: 1.5; }
.fb-lg-muted { font-size: 12px; color: var(--slate); margin: 8px 0 0; line-height: 1.5; }
.fb-lg-seg { display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 2px; border: 1px solid var(--border); border-radius: 8px; background: #fff; }
.fb-lg-seg button { border: none; background: transparent; padding: 5px 11px; border-radius: 6px; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--slate); cursor: pointer; transition: background .15s, color .15s; }
.fb-lg-seg button:hover { background: #f4f4f5; color: var(--ink); }
.fb-lg-seg button[aria-pressed="true"] { background: var(--lg-accent); color: var(--lg-on); }
.fb-lg-card { border: 1px solid var(--border); border-radius: 10px; padding: 12px; margin-bottom: 10px; background: #fafafa; }
.fb-lg-card.bad, .fb-lg-fixed.bad { border-color: #fca5a5; background: #fff7f7; }
.fb-lg-card-h { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.fb-lg-kw { font-size: 11px; font-weight: 700; color: var(--slate); text-transform: uppercase; letter-spacing: .06em; margin: 0; }
.fb-lg-word { font-size: 13px; color: var(--slate); }
.fb-lg-ans { color: var(--ink); font-weight: 600; }
.fb-lg-then { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border); }
.fb-lg-in { height: 32px; padding: 0 9px; border-radius: 8px; border: 1px solid var(--border); background: #fff; font: inherit; font-size: 13px; color: var(--ink); min-width: 0; max-width: 100%; box-sizing: border-box; }
select.fb-lg-in { cursor: pointer; }
.fb-lg-in:disabled { background: #f4f4f5; color: #a1a1aa; cursor: not-allowed; }
.fb-lg-in.bad { border-color: #f87171; }
.fb-lg-num { width: 90px; }
.fb-lg-target { flex: 1 1 220px; }
.fb-lg-group { display: flex; flex-direction: column; align-items: flex-start; }
.fb-lg-cond { width: 100%; margin-bottom: 8px; }
.fb-lg-cond.bad { box-shadow: inset 2px 0 0 #f87171; padding-left: 8px; }
.fb-lg-cond-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.fb-lg-src { flex: 2 1 200px; }
.fb-lg-op { flex: 1 1 130px; }
.fb-lg-val { flex: 1.4 1 140px; }
.fb-lg-match { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12.5px; color: var(--slate); margin-bottom: 10px; }
.fb-lg-small { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; border-radius: 7px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
.fb-lg-small:disabled { opacity: .5; cursor: not-allowed; }
.fb-lg-primary { border: 1px solid var(--lg-accent); background: var(--lg-accent); color: var(--lg-on); }
.fb-lg .fb-icon-btn:disabled { opacity: .35; cursor: not-allowed; background: transparent; }
.fb-lg-x { width: 28px; height: 28px; flex-shrink: 0; }
.fb-lg-issues { list-style: none; margin: 6px 0 0; padding: 0; }
.fb-lg-issues li { display: flex; align-items: flex-start; gap: 6px; font-size: 12px; line-height: 1.4; margin-top: 3px; }
.fb-lg-issues li svg { flex-shrink: 0; margin-top: 1px; }
.fb-lg-issues li.error { color: #dc2626; }
.fb-lg-issues li.warning { color: #b45309; }
.fb-lg-fixed { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 12px; border-radius: 10px; border: 1px dashed var(--border); font-size: 13px; color: var(--ink); }
.fb-lg-warn { display: flex; align-items: center; gap: 8px; padding: 10px 12px; margin-bottom: 12px; border-radius: 10px; border: 1px solid #fde68a; background: #fffbeb; color: #92400e; font-size: 12.5px; }
.fb-lg-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.fb-lg-tchip { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--border); background: #fff; font: inherit; font-size: 12.5px; color: var(--ink); cursor: pointer; transition: background .15s, border-color .15s; }
.fb-lg-tchip:hover { border-color: #d4d4d8; }
.fb-lg-tchip-t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fb-lg-tchip.on { border-color: var(--lg-accent); background: color-mix(in srgb, var(--lg-accent) 10%, #fff); color: color-mix(in srgb, var(--lg-accent) 75%, #000); font-weight: 600; }
.fb-lg-tchip.stale { border-color: #fca5a5; color: #dc2626; text-decoration: line-through; }
.fb-lg-tag { font-size: 10.5px; font-weight: 600; color: var(--slate); background: #f4f4f5; border-radius: 4px; padding: 1px 5px; text-decoration: none; }
.fb-lg-vars { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; margin-bottom: 14px; }
.fb-lg-vars-h { font-size: 12px; font-weight: 700; color: var(--slate); margin: 0 0 4px; }
.fb-lg-var { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 6px 0; border-top: 1px solid #f1f1f3; }
.fb-lg-vars-h + .fb-lg-var { border-top: none; }
.fb-lg-var-name { flex: 1 1 140px; }
.fb-lg-token { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; background: #f4f4f5; color: var(--ink); padding: 3px 6px; border-radius: 6px; word-break: break-all; }
.fb-lg-token-new { color: var(--slate); }
.fb-lg-inline { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--slate); }
.fb-lg-check { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--ink); cursor: pointer; }
.fb-lg-check input { accent-color: var(--lg-accent); width: 15px; height: 15px; }
.fb-lg-foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 12px 18px; border-top: 1px solid var(--border); flex-shrink: 0; background: #fff; }
.fb-lg-del { display: inline-flex; align-items: center; gap: 6px; padding: 7px 8px; border: none; border-radius: 8px; background: transparent; font: inherit; font-size: 13px; font-weight: 600; color: #dc2626; cursor: pointer; }
.fb-lg-del:hover:not(:disabled) { background: #fef2f2; }
.fb-lg-del:disabled { color: #d4d4d8; cursor: not-allowed; }
.fb-lg-btn { padding: 8px 16px; border-radius: 8px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.fb-lg-save { border: 1px solid var(--lg-accent); background: var(--lg-accent); color: var(--lg-on); transition: opacity .15s; }
.fb-lg-save:disabled { opacity: .45; cursor: not-allowed; }
.fb-lg-hint { font-size: 12px; color: #dc2626; }
@keyframes fbLgPop { from { opacity: 0; transform: translateY(8px) scale(.985); } to { opacity: 1; transform: none; } }
@media (max-width: 767px) {
  .fb-lg-bg { padding: 0 !important; }
  .fb-lg { position: fixed; inset: 0; width: 100%; height: 100%; height: 100dvh; border: none; border-radius: 0; }
  .fb-lg-head { padding: 12px 16px; }
  .fb-lg-body { grid-template-columns: 1fr; }
  .fb-lg-list { display: none; }
  .fb-lg-pick { display: block; }
  .fb-lg-pane { padding: 14px 16px; }
  .fb-lg-foot { padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); }
  .fb-lg-hint { flex-basis: 100%; order: -1; }
  .fb-lg-src, .fb-lg-op, .fb-lg-val { flex: 1 1 100%; }
  .fb-lg-in { height: 38px; font-size: 16px; }
}
@media (prefers-reduced-motion: reduce) { .fb-lg, .fb-lg-chev, .fb-lg-seg button { animation: none !important; transition: none !important; } }
`
