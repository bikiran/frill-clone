/**
 * Conditional Logic Evaluator (compatibility layer)
 *
 * Kept so existing imports keep working. Everything delegates to the forms
 * logic engine in lib/form-logic.ts, which also handles hidden choices,
 * branching and calculations. New code should import the engine directly.
 */

import { computePath, isDisplayed, readFormLogic, type DisplayLogic } from './form-logic'

/** The stored `questions[].conditional_logic` shape (operator set widened; old values still valid). */
export type Condition = DisplayLogic

/**
 * Whether a question shows for these answers. Evaluates against exactly the
 * answers passed in (legacy callers pass every answer).
 */
export function shouldShowQuestion(
  questionId: string,
  answers: Record<string, any>,
  questions: any[],
  conditionalLogic?: Condition
): boolean {
  const form = readFormLogic({ questions })
  const q = form.questions[form.indexOf[questionId]] ?? { id: questionId }
  return isDisplayed({ ...q, conditional_logic: conditionalLogic } as any, { form, answers: answers || {}, variables: {} })
}

/**
 * The questions a person sees, in order. Now the engine's path: display rules,
 * hidden-all-choices and branching (variable conditions see no variables).
 */
export function getVisibleQuestions(
  questions: any[],
  answers: Record<string, any>
): any[] {
  const f = readFormLogic({ questions })
  return computePath(f, answers || {}).path.map(id => f.questions[f.indexOf[id]])
}
