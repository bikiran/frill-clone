// Built-in behaviour for choice questions that makers would otherwise have to
// wire up with logic rules:
//
// - "Other": picking it opens a text box under the option. The typed text is
//   saved under answers.__other[questionId]; the answer itself keeps the label,
//   so every existing reader still sees "Other".
// - Exclusive options ("No", "None of these"…): on a multi-select, picking one
//   clears the rest, and picking anything else clears it.
//
// Both are detected from the option label, so existing forms get them without
// any change; the builder can switch either off per question / per option.
// Pure: no React, no Supabase.

export const OTHER_TEXT_KEY = '__other'

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/[.!…:]+$/, '').replace(/\s+/g, ' ')

const OTHER_LABELS = new Set([
  'other', 'others', 'other (please specify)', 'other (specify)', 'other, please specify',
  'other - please specify', 'other – please specify', 'something else', 'something else (please specify)',
  'anything else', 'other reason', 'other (please tell us)', 'other (tell us more)',
])

const EXCLUSIVE_LABELS = new Set([
  'no', 'none', 'none of these', 'none of the above', 'nothing', 'n/a', 'na', 'not applicable',
  'no, nothing', 'nope', 'no thanks', 'no, thanks', 'nothing at all', 'no, none', 'none apply',
])

/** A label that reads as the "Other" option. */
export function isOtherLabel(label: unknown): boolean {
  return OTHER_LABELS.has(norm(label))
}

/** A label that reads as "none of these" and shouldn't be combined with other answers. */
export function isExclusiveLabel(label: unknown): boolean {
  return EXCLUSIVE_LABELS.has(norm(label))
}

type ChoiceQuestion = {
  options?: string[]
  /** undefined = detect from the labels; false = never; true = always (the builder adds an "Other" option). */
  otherOption?: boolean
  /** Labels the maker marked exclusive by hand. */
  exclusiveChoices?: string[]
  /** Labels the maker switched off even though they read as exclusive. */
  nonExclusiveChoices?: string[]
}

/** The label of this question's "Other" option, or null when it has none. */
export function otherChoiceLabel(q: ChoiceQuestion | null | undefined): string | null {
  if (!q || q.otherOption === false) return null
  const hit = (q.options || []).find(o => isOtherLabel(o))
  return hit ?? null
}

/** Whether picking this option should clear every other option (multi-select only). */
export function isExclusiveChoice(q: ChoiceQuestion | null | undefined, label: string): boolean {
  if (!q) return false
  if ((q.nonExclusiveChoices || []).includes(label)) return false
  if ((q.exclusiveChoices || []).includes(label)) return true
  return isExclusiveLabel(label)
}

/**
 * The new selection after toggling `label` on a multi-select, honouring
 * exclusive options. `current` is the list of picked labels.
 */
export function toggleMultiChoice(q: ChoiceQuestion, current: string[] | null | undefined, label: string): string[] {
  const picked = Array.isArray(current) ? current : []
  if (picked.includes(label)) return picked.filter(l => l !== label)
  if (isExclusiveChoice(q, label)) return [label]
  return [...picked.filter(l => !isExclusiveChoice(q, l)), label]
}

/** The text typed into a question's "Other" box, or ''. */
export function otherTextOf(answers: Record<string, any> | null | undefined, questionId: string): string {
  const box = answers?.[OTHER_TEXT_KEY]
  const v = box && typeof box === 'object' ? box[questionId] : ''
  return typeof v === 'string' ? v : ''
}

/** Whether the "Other" option is currently picked in this answer. */
export function otherPicked(q: ChoiceQuestion, answer: unknown): boolean {
  const label = otherChoiceLabel(q)
  if (!label) return false
  return Array.isArray(answer) ? answer.includes(label) : answer === label
}

/**
 * Plain-text form of a choice answer with the typed "Other" text folded in,
 * e.g. ["Price", "Other"] + "too slow" → "Price, Other: too slow".
 */
export function choiceAnswerText(q: ChoiceQuestion, answer: unknown, otherText: string): string {
  const label = otherChoiceLabel(q)
  const list = Array.isArray(answer) ? answer.map(String) : answer == null || answer === '' ? [] : [String(answer)]
  const text = otherText.trim()
  return list.map(l => (label && l === label && text ? `${l}: ${text}` : l)).join(', ')
}
