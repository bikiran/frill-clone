// Pure helpers for the form builder (app/admin/forms/[id]/page.tsx).
// No React, no Supabase, no DOM except the guarded localStorage pair, so they
// can be tested on their own.

import type { FormQuestion, FormVariable, LogicIssue, WelcomeSettings } from '@/lib/form-logic'
import { MAX_BUTTON_TEXT, renameChoiceRefs } from '@/lib/form-logic'
import { isExclusiveChoice, isExclusiveLabel, isOtherLabel, otherChoiceLabel } from '@/lib/form-choice-options'

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

// ─── Sidebar collapse (per browser) ─────────────────────────────────────────

export const LEFT_COLLAPSED_KEY = 'colvy_fb_left_collapsed'
export const RIGHT_COLLAPSED_KEY = 'colvy_fb_right_collapsed'

export function readCollapsed(key: string): boolean {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(key) === '1' } catch { return false }
}

export function writeCollapsed(key: string, collapsed: boolean): void {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, collapsed ? '1' : '0') } catch { /* private mode, blocked storage */ }
}

/** Desktop grid columns: left list, preview, right settings (a docked Colvy AI wins over right-collapse). */
export function gridColumns(o: { isMobile: boolean; leftCollapsed: boolean; rightCollapsed: boolean; aiDocked: boolean }): string {
  if (o.isMobile) return '1fr'
  const left = o.leftCollapsed ? '0px' : '280px'
  const right = o.aiDocked ? '452px' : o.rightCollapsed ? '0px' : '320px'
  return `${left} 1fr ${right}`
}

// ─── Welcome screen settings (forms.theme.welcome) ──────────────────────────

/** The stored welcome object, copied (unknown keys kept). Anything that isn't a plain object → {}. */
export function initialWelcome(theme: unknown): WelcomeSettings {
  const w = isPlain(theme) ? theme.welcome : undefined
  return isPlain(w) ? { ...(w as WelcomeSettings) } : {}
}

/** Applies a patch; a key set to undefined is removed rather than stored. */
export function patchWelcome(w: WelcomeSettings, patch: Partial<WelcomeSettings>): WelcomeSettings {
  const next: Record<string, unknown> = { ...w, ...patch }
  for (const k of Object.keys(patch)) if ((patch as Record<string, unknown>)[k] === undefined) delete next[k]
  return next as WelcomeSettings
}

/** Time to complete: default ON, so ON removes the key and OFF stores false. */
export const timePatch = (on: boolean): Partial<WelcomeSettings> => ({ showTimeToComplete: on ? undefined : false })
/** Number of submissions: default OFF, so ON stores true and OFF removes the key. */
export const countPatch = (on: boolean): Partial<WelcomeSettings> => ({ showResponseCount: on ? true : undefined })
/** Button text as typed (capped at 24). '' is kept while editing so the box can be cleared; save drops it. */
export const buttonTextPatch = (raw: string): Partial<WelcomeSettings> => ({ buttonText: String(raw ?? '').slice(0, MAX_BUTTON_TEXT) })

/**
 * What gets stored under theme.welcome: defaults are left out so an untouched
 * form stores nothing. Returns {} when everything is default.
 */
export function cleanWelcome(w: WelcomeSettings): WelcomeSettings {
  const out: Record<string, unknown> = isPlain(w) ? { ...w } : {}
  if (out.showTimeToComplete !== false) delete out.showTimeToComplete
  if (out.showResponseCount !== true) delete out.showResponseCount
  const text = typeof out.buttonText === 'string' ? out.buttonText.slice(0, MAX_BUTTON_TEXT) : ''
  if (!text.trim() || text.trim() === 'Start') delete out.buttonText
  else out.buttonText = text
  const url = typeof out.mediaUrl === 'string' ? out.mediaUrl.trim() : ''
  if (!url || (out.mediaType !== 'image' && out.mediaType !== 'video')) { delete out.mediaUrl; delete out.mediaType }
  return out as WelcomeSettings
}

/**
 * The theme handleSave writes: every key already stored (background, unknown
 * keys…) survives; the builder only owns color, welcome, variables and listMode.
 */
export function buildSavedTheme(
  base: unknown,
  s: { color: string; welcome: WelcomeSettings; variables: FormVariable[]; listMode: boolean },
): Record<string, unknown> {
  const theme: Record<string, unknown> = { ...(isPlain(base) ? base : {}), color: s.color }
  const w = cleanWelcome(s.welcome)
  if (Object.keys(w).length) theme.welcome = w; else delete theme.welcome
  if (Array.isArray(s.variables) && s.variables.length) theme.variables = s.variables; else delete theme.variables
  if (s.listMode) theme.listMode = true; else delete theme.listMode
  return theme
}

export function responseCountText(n: number): string {
  return `${n.toLocaleString('en-AU')} ${n === 1 ? 'person has' : 'people have'} filled this out`
}

// ─── Logic summaries ────────────────────────────────────────────────────────

export const rulesSetText = (n: number) => `${n} rule${n === 1 ? '' : 's'} set`

/** Error-severity issues per owning question id. */
export function errorCounts(issues: LogicIssue[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const i of issues) if (i.severity === 'error' && i.questionId) out[i.questionId] = (out[i.questionId] || 0) + 1
  return out
}

export function hasDisplayRules(q: FormQuestion | undefined): boolean {
  const cl = q?.conditional_logic as { rules?: unknown } | undefined
  return !!cl && Array.isArray(cl.rules) && cl.rules.length > 0
}

// ─── Smart choice options: "Other" and exclusive options ────────────────────

/** Types that get the '"Other" option' toggle (a text box under it on the public form; same list as the public page). */
export const OTHER_OPTION_TYPES = ['multiple_choice', 'dropdown', 'checkbox', 'picture_choice']

export function isMultiSelect(q: FormQuestion | undefined): boolean {
  return !!q && (q.type === 'checkbox' || (q.type === 'multiple_choice' && !!q.multiSelect))
}

function withLists(q: FormQuestion, ex: string[], non: string[]): FormQuestion {
  const next: FormQuestion = { ...q }
  if (ex.length) next.exclusiveChoices = ex; else delete next.exclusiveChoices
  if (non.length) next.nonExclusiveChoices = non; else delete next.nonExclusiveChoices
  return next
}

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** Removes option `index` (and its picture), dropping its label from the exclusive lists when no copy is left. */
export function removeOption(q: FormQuestion, index: number): FormQuestion {
  const opts = q.options || []
  const label = opts[index]
  const next: FormQuestion = { ...q, options: opts.filter((_, i) => i !== index) }
  if (Array.isArray(q.optionImages)) next.optionImages = q.optionImages.filter((_, i) => i !== index)
  if (label === undefined || next.options!.includes(label)) return next
  return withLists(next, strList(q.exclusiveChoices).filter(l => l !== label), strList(q.nonExclusiveChoices).filter(l => l !== label))
}

/**
 * Switches the "Other" option on or off.
 * On: an option that already reads as Other is reused, otherwise "Other" is added last.
 * Off: the Other option is removed and otherOption is set to false (never detect).
 */
export function setOtherOption(q: FormQuestion, on: boolean): FormQuestion {
  const opts = q.options || []
  if (on) {
    if (opts.some(o => isOtherLabel(o))) return { ...q, otherOption: true }
    return { ...q, options: [...opts, 'Other'], otherOption: true }
  }
  const label = otherChoiceLabel(q)
  const idx = label == null ? -1 : opts.indexOf(label)
  const base = idx >= 0 ? removeOption(q, idx) : { ...q }
  return { ...base, otherOption: false }
}

export function hasOtherOption(q: FormQuestion): boolean {
  return otherChoiceLabel(q) !== null
}

/** "Don't allow with other answers" for one option of a multi-select. */
export function setExclusive(q: FormQuestion, label: string, on: boolean): FormQuestion {
  const ex = strList(q.exclusiveChoices).filter(l => l !== label)
  const non = strList(q.nonExclusiveChoices).filter(l => l !== label)
  if (on && !isExclusiveLabel(label)) ex.push(label)
  if (!on && isExclusiveLabel(label)) non.push(label)
  return withLists(q, ex, non)
}

export { isExclusiveChoice }

/**
 * Renames option `index` of question `qid`. Logic rules that point at the old
 * label follow it (renameChoiceRefs runs on the list BEFORE the edit, so its
 * duplicate-label check sees the old options), and so do the exclusive lists.
 * Clearing a label to '' rewrites nothing, so retyping the same label
 * reconnects everything instead of capturing it as ''.
 */
export function renameOption(questions: FormQuestion[], qid: string, index: number, newLabel: string): FormQuestion[] {
  const q = questions.find(x => x.id === qid)
  const opts = q?.options || []
  if (!q || index < 0 || index >= opts.length) return questions
  const old = opts[index]
  if (old === newLabel) return questions
  const unique = old !== '' && opts.filter(o => o === old).length === 1
  const follow = unique && newLabel !== ''
  const renamed = follow ? renameChoiceRefs(questions, qid, old, newLabel) : questions
  return renamed.map(x => {
    if (x.id !== qid) return x
    const nextOpts = [...(x.options || [])]
    nextOpts[index] = newLabel
    let next: FormQuestion = { ...x, options: nextOpts }
    if (follow) {
      const swap = (l: string) => (l === old ? newLabel : l)
      const ex = strList(x.exclusiveChoices), non = strList(x.nonExclusiveChoices)
      if (ex.includes(old) || non.includes(old)) next = withLists(next, ex.map(swap), non.map(swap))
    }
    return next
  })
}

/** Keeps the options when switching between choice types; other types drop them (as before). */
export function changeType(q: FormQuestion, type: string, withOptions: string[]): Partial<FormQuestion> {
  if (!withOptions.includes(type)) return { type, options: undefined }
  return { type, options: q.options && q.options.length ? q.options : ['Option 1', 'Option 2'] }
}
