// Pure helpers for the public form page (app/forms/[id]/page.tsx). No React,
// no Supabase, no DOM, so they can be tested on their own. Page files may only
// export the page itself, which is why these live next to it.
//
// The logic itself (paths, display rules, branching, calculations, what gets
// submitted) is lib/form-logic.ts. This file adds what the public page needs on
// top: the built-in "Other" text box (lib/form-choice-options.ts), the error
// messages, payment-return restore and the tracking payloads.

import {
  buildSubmission, computePath, isBlankAnswer, stripReservedAnswers, validateSubmission,
  type Answers, type LogicForm, type PathResult, type Vars,
} from '@/lib/form-logic'
import { OTHER_TEXT_KEY, otherChoiceLabel, otherPicked, otherTextOf } from '@/lib/form-choice-options'

/** Longest "Other" text kept in a response. */
export const OTHER_TEXT_MAX = 500

/** Question types where an "Other" option opens a text box. Ranking orders every option, so it has none. */
const OTHER_BOX_TYPES = ['multiple_choice', 'dropdown', 'checkbox', 'picture_choice']

/** Types whose "required" message is "Please make a selection" (today's list). */
const SELECTION_TYPES = ['multiple_choice', 'checkbox', 'picture_choice', 'dropdown', 'yes_no', 'legal']

export type PublicProblem = { questionId: string; reason: 'required' | 'email' | 'payment' | 'other' }

function isObj(v: unknown): v is Record<string, any> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function questionOf(form: LogicForm, id: string): any {
  return Object.prototype.hasOwnProperty.call(form.indexOf, id) ? form.questions[form.indexOf[id]] : undefined
}

/** True when this question has an "Other" option that opens a text box. */
export function hasOtherBox(q: any): boolean {
  return !!q && OTHER_BOX_TYPES.includes(q.type) && !!otherChoiceLabel(q)
}

/** True when the "Other" option is picked in this answer, so the text box shows. */
export function otherBoxOpen(q: any, answer: unknown): boolean {
  return hasOtherBox(q) && otherPicked(q, answer)
}

/**
 * Every problem that blocks submitting, over the path only and in path order:
 * the engine's payment / required / email checks, plus an empty "Other" box
 * on a required question whose "Other" option is picked.
 */
export function validatePublic(form: LogicForm, raw: Answers): PublicProblem[] {
  const run = computePath(form, raw)
  const engine = new Map(validateSubmission(form, raw).map(p => [p.questionId, p]))
  const out: PublicProblem[] = []
  for (const id of run.path) {
    const p = engine.get(id)
    if (p) { out.push(p); continue }
    const q = questionOf(form, id)
    if (q?.required && otherBoxOpen(q, run.answers[id]) && !otherTextOf(raw, id).trim()) {
      out.push({ questionId: id, reason: 'other' })
    }
  }
  return out
}

/** The first problem on one question, or null. */
export function problemFor(form: LogicForm, raw: Answers, questionId: string): PublicProblem | null {
  return validatePublic(form, raw).find(p => p.questionId === questionId) || null
}

/** Today's wording for each problem. */
export function problemMessage(q: any, reason: PublicProblem['reason']): string {
  switch (reason) {
    case 'payment': return 'Please complete the payment to continue'
    case 'email': return 'Hmm… that email doesn’t look right'
    case 'other': return 'Please type your answer'
    default: return SELECTION_TYPES.includes(q?.type) ? 'Please make a selection' : 'Please fill this in'
  }
}

/**
 * "Other" texts to save: only for questions whose saved (effective) answer
 * still has the "Other" option picked, trimmed and capped. Text typed for a
 * question that was skipped, or where another option was picked in the end,
 * is dropped like any stale answer.
 */
export function collectOtherText(form: LogicForm, savedAnswers: Record<string, unknown>, raw: Answers): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [id, v] of Object.entries(savedAnswers)) {
    if (id.startsWith('__')) continue
    const q = questionOf(form, id)
    if (!otherBoxOpen(q, v)) continue
    const text = otherTextOf(raw, id).trim().slice(0, OTHER_TEXT_MAX)
    if (text) out[id] = text
  }
  return out
}

/**
 * What the public page inserts. `answers` is the engine's buildSubmission
 * (path answers, off-path paid/booked answers, `__logic`) plus `__other`, which
 * buildSubmission doesn't know about. `pipeAnswers` is for the thank-you message.
 */
export function buildPublicSubmission(form: LogicForm, raw: Answers): {
  answers: Record<string, unknown>; variables: Vars; path: string[]; pipeAnswers: Record<string, unknown>
} {
  const sub = buildSubmission(form, raw)
  const other = collectOtherText(form, sub.answers, raw)
  const answers = Object.keys(other).length ? { ...sub.answers, [OTHER_TEXT_KEY]: other } : sub.answers
  return { answers, variables: sub.variables, path: sub.path, pipeAnswers: stripReservedAnswers(sub.answers) }
}

/** The choices this question shows: exactly what the walk evaluated (fallback: every option). */
export function choiceList(run: PathResult, q: any): { label: string; index: number }[] {
  const vis = run.visibleChoices[q?.id]
  if (vis) return vis
  return (Array.isArray(q?.options) ? q.options : []).map((label: unknown, index: number) => ({ label: String(label), index }))
}

/** Ranking order: the stored order limited to visible labels (new ones appended), else the visible labels. */
export function rankOrderFor(stored: unknown, visible: string[]): string[] {
  if (Array.isArray(stored)) {
    const kept = stored.filter((l): l is string => typeof l === 'string' && visible.includes(l))
    if (kept.length) return [...kept, ...visible.filter(l => !kept.includes(l))]
  }
  return visible
}

/** List-mode progress: answered path questions ÷ path questions (statements have no answer, so they don't count). */
export function listProgress(form: LogicForm, run: PathResult): number {
  const ids = run.path.filter(id => questionOf(form, id)?.type !== 'statement')
  if (!ids.length) return 0
  return ids.filter(id => !isBlankAnswer(run.answers[id])).length / ids.length
}

/** The question an abandon is counted against: the current one, or in list mode the last answered (else the first). */
export function abandonQuestionId(listMode: boolean, run: PathResult, currentId: string | null): string | null {
  if (!listMode) return currentId && run.path.includes(currentId) ? currentId : (run.path[0] ?? null)
  for (let i = run.path.length - 1; i >= 0; i--) if (!isBlankAnswer(run.answers[run.path[i]])) return run.path[i]
  return run.path[0] ?? null
}

/** "128 people have filled this out", or null for 0 / unknown. */
export function countLine(count: unknown): string | null {
  if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return null
  const n = Math.floor(count)
  return `${n.toLocaleString('en-AU')} ${n === 1 ? 'person has' : 'people have'} filled this out`
}

export type SavedProgress = { answers: Answers; currentId: string | null; payQuestionId: string | null; listStarted: boolean }

/**
 * Reads what startPayment saved before the Stripe redirect. Older saves have a
 * numeric `step` (index into the visible questions) instead of `currentId`.
 */
export function restoreProgress(form: LogicForm, saved: unknown): SavedProgress | null {
  if (!isObj(saved)) return null
  const answers: Answers = isObj(saved.answers) ? saved.answers : {}
  const payQuestionId = typeof saved.payQuestionId === 'string' ? saved.payQuestionId : null
  let currentId: string | null | undefined
  if (typeof saved.currentId === 'string') currentId = saved.currentId
  else if (typeof saved.step === 'number' && Number.isInteger(saved.step) && saved.step >= 0) {
    currentId = computePath(form, answers).path[saved.step]
  }
  return { answers, currentId: currentId ?? payQuestionId, payQuestionId, listStarted: saved.listStarted === true }
}

/** The JSON body for /api/forms/track. Only the form, the event and (for abandon) a question id. */
export function trackBody(formId: string, event: 'view' | 'start' | 'abandon', questionId?: string | null): string {
  return JSON.stringify(questionId ? { formId, event, questionId } : { formId, event })
}

/**
 * A theme colour at `alpha` over white, as rgb(), for browsers without
 * color-mix(). Null when the colour isn't a hex value (color-mix still applies).
 */
export function tint(color: unknown, alpha: number): string | null {
  if (typeof color !== 'string') return null
  const m = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1]
  const mix = (i: number) => Math.round(parseInt(h.slice(i, i + 2), 16) * alpha + 255 * (1 - alpha))
  return `rgb(${mix(0)}, ${mix(2)}, ${mix(4)})`
}
