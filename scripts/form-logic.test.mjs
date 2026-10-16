// Runnable tests for the forms logic engine (lib/form-logic.ts) and the
// lib/conditional-logic.ts compatibility layer.
//
// The repo has no test runner configured, so this is a self-contained,
// zero-dependency harness (same pattern as scripts/customer-match.test.mjs):
//
//   npx tsx scripts/form-logic.test.mjs
//
// Exits non-zero if any check fails.

import * as E from '../lib/form-logic.ts'
import * as CL from '../lib/conditional-logic.ts'

// The pre-engine lib/conditional-logic.ts (before forms logic), kept verbatim as
// the reference for the "old forms behave as before" checks (section 38).
const LEGACY = (() => {
  function shouldShowQuestion(questionId, answers, questions, conditionalLogic) {
    if (!conditionalLogic || !conditionalLogic.rules || conditionalLogic.rules.length === 0) {
      return true
    }
    const { condition, rules, logic } = conditionalLogic
    const ruleResults = rules.map(rule => evaluateRule(rule, answers))
    const conditionMet = logic === 'all'
      ? ruleResults.every(r => r)
      : ruleResults.some(r => r)
    return condition === 'show' ? conditionMet : !conditionMet
  }
  function evaluateRule(rule, answers) {
    const answer = answers[rule.questionId]
    switch (rule.operator) {
      case 'equals':
        return String(answer) === String(rule.value)
      case 'contains':
        if (Array.isArray(answer)) {
          return answer.some(a => String(a).includes(rule.value))
        }
        return String(answer).includes(rule.value)
      case 'is_empty':
        return !answer || (Array.isArray(answer) && answer.length === 0) || String(answer).trim() === ''
      default:
        return true
    }
  }
  function getVisibleQuestions(questions, answers) {
    return questions.filter(q => shouldShowQuestion(q.id, answers, questions, q.conditional_logic))
  }
  return { shouldShowQuestion, getVisibleQuestions }
})()

let passed = 0, failed = 0
function ok(name, cond) {
  if (cond) { passed++ }
  else { failed++; console.error('  ✗', name) }
}
function eq(name, a, b) {
  const pass = JSON.stringify(a) === JSON.stringify(b)
  if (pass) passed++
  else { failed++; console.error('  ✗', name, '\n      got     ', JSON.stringify(a), '\n      expected', JSON.stringify(b)) }
}
function section(t) { console.log('•', t) }

// ── fixtures ────────────────────────────────────────────────────────────────
const Q = (id, type = 'short_text', extra = {}) => ({ id, type, title: id.toUpperCase(), description: '', required: false, ...extra })
const F = (questions, variables = undefined) => E.readFormLogic({ questions, theme: variables ? { variables } : {} })
const C = (form, answers = {}, variables = {}) => ({ form, answers, variables })
const R = (questionId, operator, value = '') => ({ questionId, operator, value })
const V = (variableId, operator, value) => ({ questionId: '', variableId, operator, value })
const show = (rules, logic = 'all') => ({ condition: 'show', logic, rules })
const hide = (rules, logic = 'all') => ({ condition: 'hide', logic, rules })
const SCORE = [{ id: 'score', label: 'Score', initial: 0 }]
const calc = (id, variableId, op, amount, when, extra = {}) => ({ id, variableId, op, amount, when, ...extra })
const ANSWERED = { kind: 'answered' }
const br = (id, rules, to, logic = 'all') => ({ id, logic, rules, to })
const toQ = (questionId) => ({ kind: 'question', questionId })
const END = { kind: 'end' }
const NEXT = { kind: 'next' }
const ids = (qs) => qs.map(q => q.id)
const legacyShowsRule = (r, answers, qs) => LEGACY.shouldShowQuestion('x', answers, qs, { condition: 'show', logic: 'all', rules: [r] })

// Seeded RNG so the fuzz sections are reproducible.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 } }
const pick = (r, list) => list[Math.floor(r() * list.length)]

// ════════════════════════════════════════════════════════════════════════════
section('constants, normalising, welcome')
{
  eq('CHOICE_TYPES', [...E.CHOICE_TYPES], ['multiple_choice', 'dropdown', 'checkbox', 'picture_choice', 'ranking'])
  eq('NUMERIC_TYPES', [...E.NUMERIC_TYPES], ['number', 'rating', 'opinion_scale', 'nps'])
  eq('MAX_BUTTON_TEXT', E.MAX_BUTTON_TEXT, 24)
  eq('DEFAULT_SCORE_VARIABLE', E.DEFAULT_SCORE_VARIABLE, { id: 'score', label: 'Score', initial: 0 })
  eq('RESPONSE_LOGIC_KEY', E.RESPONSE_LOGIC_KEY, '__logic')

  eq('readFormLogic(null)', E.readFormLogic(null), { questions: [], variables: [], indexOf: {} })
  eq('readFormLogic non-array questions', E.readFormLogic({ questions: 'x' }).questions, [])
  const f = E.readFormLogic({ questions: [null, 3, 'a', [1], Q('a')], theme: null })
  eq('non-object items dropped', ids(f.questions), ['a'])
  eq('indexOf points at LogicForm.questions', f.indexOf.a, 0)
  const vf = E.readFormLogic({
    questions: [], theme: {
      variables: [
        { id: 'score', label: 'Score', initial: '5' }, { id: 'Bad', label: 'x', initial: 1 }, { id: '1x', initial: 0 },
        { id: 'price', label: 'Price', initial: 'abc' }, { id: 'score', label: 'Dup', initial: 9 }, { id: 'n', initial: Infinity },
        { id: 'a'.repeat(25) }, { id: 'ok_1', label: '', initial: -2.5 }, null, 'score',
      ],
    },
  })
  eq('variables: valid ids, initial coerced, de-duplicated', vf.variables, [
    { id: 'score', label: 'Score', initial: 5 }, { id: 'price', label: 'Price', initial: 0 },
    { id: 'n', label: 'n', initial: 0 }, { id: 'ok_1', label: 'ok_1', initial: -2.5 },
  ])

  // resolveWelcome
  eq('welcome defaults (old forms)', E.resolveWelcome({ color: '#fff' }), { showTimeToComplete: true, showResponseCount: false, buttonText: 'Start' })
  eq('welcome defaults (null theme)', E.resolveWelcome(null), { showTimeToComplete: true, showResponseCount: false, buttonText: 'Start' })
  eq('welcome set', E.resolveWelcome({ welcome: { showTimeToComplete: false, showResponseCount: true, buttonText: '  Go now  ', mediaUrl: ' https://x/y.png ', mediaType: 'image' } }),
    { showTimeToComplete: false, showResponseCount: true, buttonText: 'Go now', mediaUrl: 'https://x/y.png', mediaType: 'image' })
  eq('welcome button sliced to 24', E.resolveWelcome({ welcome: { buttonText: 'x'.repeat(40) } }).buttonText, 'x'.repeat(24))
  eq('welcome blank button → Start', E.resolveWelcome({ welcome: { buttonText: '   ' } }).buttonText, 'Start')
  eq('welcome non-string button → Start', E.resolveWelcome({ welcome: { buttonText: 5 } }).buttonText, 'Start')
  eq('welcome truthy non-true count stays off', E.resolveWelcome({ welcome: { showResponseCount: 'yes' } }).showResponseCount, false)
  eq('welcome media needs a valid type', E.resolveWelcome({ welcome: { mediaUrl: 'https://x', mediaType: 'gif' } }).mediaUrl, undefined)
  eq('welcome media needs a url', E.resolveWelcome({ welcome: { mediaUrl: '  ', mediaType: 'video' } }).mediaType, undefined)
  eq('welcome video', E.resolveWelcome({ welcome: { mediaUrl: 'v.mp4', mediaType: 'video' } }).mediaType, 'video')

  ok('isListMode true only for listMode === true', E.isListMode({ theme: { listMode: true } }) && !E.isListMode({ theme: { listMode: 'true' } }) && !E.isListMode({ theme: {} }) && !E.isListMode(null) && !E.isListMode({}))
  ok('display_style is ignored by isListMode', !E.isListMode({ display_style: 'list', theme: {} }))

  const idsSeen = new Set()
  for (let i = 0; i < 300; i++) idsSeen.add(E.newLogicId())
  ok('newLogicId: 8 chars [a-z0-9], unique', [...idsSeen].every((x) => /^[a-z0-9]{8}$/.test(x)) && idsSeen.size === 300)

  eq('withDefaultScore prepends score', E.withDefaultScore([{ id: 'price', label: 'Price', initial: 0 }]).map(v => v.id), ['score', 'price'])
  eq('withDefaultScore keeps an existing score', E.withDefaultScore([{ id: 'price', label: 'Price', initial: 0 }, { id: 'score', label: 'Points', initial: 3 }]).map(v => v.label), ['Price', 'Points'])
  eq('withDefaultScore([])', E.withDefaultScore([]), [{ id: 'score', label: 'Score', initial: 0 }])
}

section('value kinds, choices, operators')
{
  const kinds = {
    short_text: 'text', long_text: 'text', email: 'text', phone: 'text', address: 'text', website: 'text', contact_info: 'text',
    multiple_choice: 'choice', dropdown: 'choice', picture_choice: 'choice', checkbox: 'multi', yes_no: 'yesno', legal: 'legal',
    number: 'number', rating: 'number', opinion_scale: 'number', nps: 'number', date: 'date',
    ranking: 'presence', matrix: 'presence', file_upload: 'presence', video_audio: 'presence', signature: 'presence',
    payment: 'presence', scheduler: 'presence', statement: 'none',
  }
  for (const [t, k] of Object.entries(kinds)) eq(`valueKindOf ${t}`, E.valueKindOf(Q('a', t)), k)
  eq('valueKindOf multiSelect multiple_choice', E.valueKindOf(Q('a', 'multiple_choice', { multiSelect: true })), 'multi')
  eq('valueKindOf undefined', E.valueKindOf(undefined), 'none')

  eq('choicesOf choice type', E.choicesOf(Q('a', 'dropdown', { options: ['X', 'Y'] })), ['X', 'Y'])
  eq('choicesOf ranking', E.choicesOf(Q('a', 'ranking', { options: ['1', '2'] })), ['1', '2'])
  eq('choicesOf yes_no', E.choicesOf(Q('a', 'yes_no')), ['Yes', 'No'])
  eq('choicesOf text with stray options', E.choicesOf(Q('a', 'short_text', { options: ['X'] })), [])
  eq('choicesOf undefined', E.choicesOf(undefined), [])

  eq('operatorsFor text', E.operatorsFor('text'), ['equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty'])
  eq('operatorsFor choice', E.operatorsFor('choice'), ['equals', 'not_equals', 'is_empty', 'is_not_empty'])
  eq('operatorsFor multi', E.operatorsFor('multi'), ['includes', 'not_includes', 'is_empty', 'is_not_empty'])
  eq('operatorsFor yesno', E.operatorsFor('yesno'), ['equals', 'not_equals', 'is_empty', 'is_not_empty'])
  eq('operatorsFor legal', E.operatorsFor('legal'), ['is_not_empty', 'is_empty'])
  eq('operatorsFor number', E.operatorsFor('number'), ['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty'])
  eq('operatorsFor date', E.operatorsFor('date'), ['equals', 'not_equals', 'gt', 'lt', 'is_empty', 'is_not_empty'])
  eq('operatorsFor presence', E.operatorsFor('presence'), ['is_not_empty', 'is_empty'])
  eq('operatorsFor none', E.operatorsFor('none'), [])
  eq('operatorsFor variable', E.operatorsFor('variable'), ['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte'])
  const ops = E.operatorsFor('text'); ops.push('gt')
  eq('operatorsFor returns a copy', E.operatorsFor('text').length, 6)

  const L = E.operatorLabel
  eq('labels text', ['equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty'].map(o => L(o, 'text')), ['is', 'is not', 'contains', 'does not contain', 'is empty', 'is not empty'])
  eq('labels choice', ['equals', 'not_equals', 'is_empty', 'is_not_empty'].map(o => L(o, 'choice')), ['is', 'is not', 'is not answered', 'is answered'])
  eq('labels multi', ['includes', 'not_includes'].map(o => L(o, 'multi')), ['includes', 'does not include'])
  eq('labels legal', [L('is_not_empty', 'legal'), L('is_empty', 'legal')], ['is accepted', 'is not accepted'])
  eq('labels number', ['gt', 'gte', 'lt', 'lte'].map(o => L(o, 'number')), ['is more than', 'is at least', 'is less than', 'is at most'])
  eq('labels date', [L('gt', 'date'), L('lt', 'date')], ['is after', 'is before'])
  eq('labels presence', [L('is_not_empty', 'presence'), L('is_empty', 'presence')], ['is answered', 'is not answered'])
  eq('labels variable', ['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte'].map(o => L(o, 'variable')), ['is', 'is not', 'is more than', 'is at least', 'is less than', 'is at most'])
  eq('legacy labels on multi', [L('equals', 'multi'), L('contains', 'multi')], ['is exactly', 'contains text'])
}

// ════════════════════════════════════════════════════════════════════════════
section('1. legacy parity: equals / contains / is_empty on non-blank answers')
{
  const textQs = [Q('t', 'short_text'), Q('m', 'checkbox', { options: ['A', 'B', 'Apple', 'Banana'] }), Q('r', 'rating')]
  const form = F(textQs)
  const answers = ['Pro', 'Pro plan', 'pro', ' padded ', 'A,B', ['A', 'B'], ['A'], ['Apple', 'Banana'], ['x', 'y', 'z'], { r1: 'c1' }, 5, 'true', true]
  const values = ['Pro', 'pro', 'plan', 'A,B', 'A', 'B', 'an', 'Banana', 'App', '5', 'x', ' ', 'true', '[object Object]']
  let n = 0
  for (const qid of ['t', 'm']) for (const a of answers) for (const v of values) for (const op of ['equals', 'contains', 'is_empty']) {
    const r = R(qid, op, v)
    const legacy = legacyShowsRule(r, { [qid]: a }, textQs)
    const now = E.evaluateRule(r, C(form, { [qid]: a }))
    eq(`parity ${qid} ${op} ${JSON.stringify(a)} ${JSON.stringify(v)}`, now, legacy); n++
  }
  // Numeric types: integer answers compared with canonical strings behave as before.
  for (const a of [1, 3, 5, '4']) for (const v of ['1', '3', '4', '5', '3.5', 'x']) for (const op of ['equals', 'contains', 'is_empty']) {
    const r = R('r', op, v)
    eq(`parity rating ${op} ${JSON.stringify(a)} ${v}`, E.evaluateRule(r, C(form, { r: a })), legacyShowsRule(r, { r: a }, textQs)); n++
  }
  ok(`ran ${n} parity cases`, n > 1000)
  ok("String(['A','B']) === 'A,B' (equals on arrays)", E.evaluateRule(R('m', 'equals', 'A,B'), C(form, { m: ['A', 'B'] })))
  ok('substring contains on array items', E.evaluateRule(R('m', 'contains', 'nan'), C(form, { m: ['Apple', 'Banana'] })))
  ok('contains is case-sensitive (legacy)', !E.evaluateRule(R('t', 'contains', 'PRO'), C(form, { t: 'Pro plan' })))
}

section('2. blank handling for every operator')
{
  const form = F([Q('t'), Q('n', 'number')])
  const expectTrue = ['is_empty', 'not_equals', 'not_contains', 'not_includes']
  for (const blank of [undefined, null, '', '  ', [], {}]) {
    for (const op of ['equals', 'not_equals', 'contains', 'not_contains', 'includes', 'not_includes', 'is_empty', 'is_not_empty', 'gt', 'gte', 'lt', 'lte']) {
      for (const value of ['', 'x', '0', 'undefined']) {
        const answers = blank === undefined ? {} : { t: blank, n: blank }
        eq(`blank ${JSON.stringify(blank)} ${op} ${JSON.stringify(value)} (text)`, E.evaluateRule(R('t', op, value), C(form, answers)), expectTrue.includes(op))
        eq(`blank ${JSON.stringify(blank)} ${op} ${JSON.stringify(value)} (number)`, E.evaluateRule(R('n', op, value), C(form, answers)), expectTrue.includes(op))
      }
    }
  }
  eq('isBlankAnswer set', [undefined, null, '', '   ', [], {}].map(E.isBlankAnswer), [true, true, true, true, true, true])
  eq('isBlankAnswer non-blank', [0, false, 'a', ['a'], { a: 1 }, ' x ', [''], new Date(0)].map(E.isBlankAnswer), [false, false, false, false, false, false, false, false])
}

section('3. NPS 0 is not empty; false is not blank')
{
  const form = F([Q('n', 'nps'), Q('l', 'legal')])
  ok('nps 0 is_empty → false', !E.evaluateRule(R('n', 'is_empty'), C(form, { n: 0 })))
  ok('nps 0 is_not_empty → true', E.evaluateRule(R('n', 'is_not_empty'), C(form, { n: 0 })))
  ok('nps 0 equals "0" → true', E.evaluateRule(R('n', 'equals', '0'), C(form, { n: 0 })))
  ok('nps 0 lt "7" → true', E.evaluateRule(R('n', 'lt', '7'), C(form, { n: 0 })))
  ok('false is_empty → false', !E.evaluateRule(R('l', 'is_empty'), C(form, { l: false })))
  ok('isBlankAnswer(false) is false', !E.isBlankAnswer(false))
}

section('4. numeric equals and gt/gte/lt/lte')
{
  const form = F([Q('num', 'number'), Q('rat', 'rating'), Q('sc', 'opinion_scale'), Q('nps', 'nps'), Q('txt', 'short_text')])
  const t = (qid, a, op, v) => E.evaluateRule(R(qid, op, v), C(form, { [qid]: a }))
  ok("'7' equals 7 (number)", t('num', '7', 'equals', 7))
  ok("7 equals '7' (rating)", t('rat', 7, 'equals', '7'))
  ok("'7.0' equals '7' (number)", t('num', '7.0', 'equals', '7'))
  ok("'07' equals '7' (number)", t('num', '07', 'equals', '7'))
  ok("'7.0' not_equals '7' is false (number)", !t('num', '7.0', 'not_equals', '7'))
  ok("text keeps string equality: '7.0' vs '7' false", !t('txt', '7.0', 'equals', '7'))
  ok("number equals with non-numeric value falls back to strings", t('num', 'abc', 'equals', 'abc') && !t('num', '7', 'equals', 'seven'))
  ok('0.1+0.2 equals 0.3 within 1e-9', t('num', 0.1 + 0.2, 'equals', '0.3'))
  ok("number strings compare numerically: '12' gt '9'", t('num', '12', 'gt', '9'))
  ok("'9' lt '12'", t('num', '9', 'lt', '12'))
  ok('rating 4 gt 3', t('rat', 4, 'gt', '3') && !t('rat', 3, 'gt', '3'))
  ok('rating 3 gte 3', t('rat', 3, 'gte', '3') && !t('rat', 2, 'gte', '3'))
  ok('scale 2 lt 5', t('sc', 2, 'lt', '5') && !t('sc', 5, 'lt', '5'))
  ok('scale 5 lte 5', t('sc', 5, 'lte', '5') && !t('sc', 6, 'lte', '5'))
  ok('nps 10 gte 9', t('nps', 10, 'gte', '9'))
  ok('nps 6 lte 6', t('nps', 6, 'lte', '6'))
  ok('non-numeric answer → false', !t('num', 'abc', 'gt', '1') && !t('num', 'abc', 'lt', '1'))
  ok('non-numeric value → false', !t('num', '5', 'gt', 'x') && !t('num', '5', 'lt', 'x'))
  ok('empty value → false (not 0)', !t('num', '5', 'gt', '') && !t('nps', 0, 'gte', ''))
  ok('array answer → false', !t('num', ['5'], 'gt', '1'))
}

section('5. date gt/lt')
{
  const form = F([Q('d', 'date')])
  const t = (a, op, v) => E.evaluateRule(R('d', op, v), C(form, { d: a }))
  ok('after', t('2026-05-01', 'gt', '2026-04-30') && !t('2026-04-30', 'gt', '2026-05-01'))
  ok('before', t('2025-12-31', 'lt', '2026-01-01') && !t('2026-01-01', 'lt', '2026-01-01'))
  ok('gte/lte on the same day', t('2026-01-01', 'gte', '2026-01-01') && t('2026-01-01', 'lte', '2026-01-01'))
  ok('compares the first 10 characters', t('2026-01-02T00:00', 'gt', '2026-01-01T23:59') && !t('2026-01-01T23:59', 'gt', '2026-01-01T00:00'))
  ok('date equals', t('2026-01-01', 'equals', '2026-01-01') && t('2026-01-01', 'not_equals', '2026-01-02'))
  ok('date vs non-date → false', !t('2026-01-01', 'gt', 'tomorrow'))
}

section('6. includes / not_includes')
{
  const form = F([Q('m', 'checkbox', { options: ['A', 'B', 'C'] }), Q('s', 'dropdown', { options: ['A', 'B'] }), Q('x', 'matrix')])
  const t = (qid, a, op, v) => E.evaluateRule(R(qid, op, v), C(form, { [qid]: a }))
  ok('multi includes', t('m', ['A', 'B'], 'includes', 'A') && !t('m', ['A', 'B'], 'includes', 'C'))
  ok('multi not_includes', t('m', ['A', 'B'], 'not_includes', 'C') && !t('m', ['A', 'B'], 'not_includes', 'B'))
  ok('exact label, not substring', !t('m', ['AB'], 'includes', 'A'))
  ok('single string includes', t('s', 'A', 'includes', 'A') && !t('s', 'A', 'includes', 'B') && t('s', 'A', 'not_includes', 'B'))
  ok('matrix object includes column', t('x', { r1: 'Good', r2: 'Bad' }, 'includes', 'Bad') && !t('x', { r1: 'Good' }, 'includes', 'r1'))
  ok('blank not_includes → true, includes → false', t('m', [], 'not_includes', 'A') && !t('m', [], 'includes', 'A'))
}

section('7. variable rules')
{
  const form = F([Q('a')], [{ id: 'score', label: 'Score', initial: 0 }])
  const t = (op, value, vars = { score: 5 }, variableId = 'score') => E.evaluateRule(V(variableId, op, value), C(form, {}, vars))
  ok('equals', t('equals', '5') && !t('equals', '6'))
  ok('equals within 1e-9', t('equals', '0.3', { score: 0.1 + 0.2 }))
  ok('not_equals', t('not_equals', '6') && !t('not_equals', '5'))
  ok('gt/gte/lt/lte', t('gt', '4') && !t('gt', '5') && t('gte', '5') && t('lt', '6') && !t('lt', '5') && t('lte', '5'))
  ok('unknown variable: not_equals true, others false', t('not_equals', '5', {}, 'nope') && !t('equals', '5', {}, 'nope') && !t('gt', '1', {}, 'nope') && !t('lt', '99', {}, 'nope'))
  ok('non-numeric value: not_equals true, others false', t('not_equals', 'x') && !t('equals', 'x') && !t('gt', 'x') && !t('lte', 'x'))
  ok('text operator on a variable → false', !t('contains', '5') && !t('is_empty', '') && !t('is_not_empty', ''))
  ok('variableId wins over questionId', E.evaluateRule({ questionId: 'a', variableId: 'score', operator: 'equals', value: '5' }, C(form, { a: 'x' }, { score: 5 })))
  ok("empty variableId → question rule", E.evaluateRule({ questionId: 'a', variableId: '', operator: 'equals', value: 'x' }, C(form, { a: 'x' }, {})))
}

section('8. unknown operator, missing logic, missing condition')
{
  const form = F([Q('a'), Q('b')])
  ok('unknown operator → true (non-blank)', E.evaluateRule(R('a', 'starts_with', 'x'), C(form, { a: 'y' })))
  ok('unknown operator → true (blank)', E.evaluateRule(R('a', 'starts_with', 'x'), C(form, {})))
  ok('legacy also returns true for unknown operators', legacyShowsRule(R('a', 'starts_with', 'x'), {}, form.questions))
  const g = { rules: [R('a', 'equals', 'x'), R('a', 'equals', 'y')] }
  ok('logic missing → any', E.evaluateGroup(g, C(form, { a: 'y' }), false))
  ok("logic 'ALL' (not exactly 'all') → any", E.evaluateGroup({ ...g, logic: 'ALL' }, C(form, { a: 'y' }), false))
  ok("logic 'all' → every", !E.evaluateGroup({ ...g, logic: 'all' }, C(form, { a: 'y' }), false))
  const qb = Q('b', 'short_text', { conditional_logic: { logic: 'all', rules: [R('a', 'equals', 'x')] } })
  ok('condition missing → hide (met → hidden)', !E.isDisplayed(qb, C(form, { a: 'x' })))
  ok('condition missing → hide (not met → shown)', E.isDisplayed(qb, C(form, { a: 'z' })))
  ok("condition 'SHOW' → hide", !E.isDisplayed({ ...qb, conditional_logic: { ...qb.conditional_logic, condition: 'SHOW' } }, C(form, { a: 'x' })))
  eq('evaluateGroup: undefined → whenEmpty', [E.evaluateGroup(undefined, C(form), true), E.evaluateGroup(undefined, C(form), false)], [true, false])
  eq('evaluateGroup: rules not an array → whenEmpty', E.evaluateGroup({ logic: 'all', rules: 'x' }, C(form), true), true)
  eq('evaluateGroup: non-object rules filtered before counting', E.evaluateGroup({ logic: 'all', rules: [null, 3, 'x'] }, C(form), true), true)
  ok('evaluateGroup: non-object rules ignored among real ones', E.evaluateGroup({ logic: 'all', rules: [null, R('a', 'equals', 'x')] }, C(form, { a: 'x' }), false))
  let threw = false
  try {
    E.evaluateGroup({ logic: 'all', rules: [{}, { questionId: 5, operator: null, value: {} }, { variableId: 7 }] }, C(form, { a: 'x' }), false)
    E.evaluateRule(null, C(form))
    E.isDisplayed({ id: 'z', conditional_logic: 'junk' }, C(form))
    E.isDisplayed({ id: 'z', conditional_logic: { condition: 'hide', rules: [null] } }, C(form))
  } catch { threw = true }
  ok('never throws on malformed stored rules', !threw)
  ok('hide with only malformed rules shows (no rules)', E.isDisplayed({ id: 'z', conditional_logic: { condition: 'hide', rules: [null] } }, C(form)))
  ok('legacy rules: [] → shown (show or hide)', E.isDisplayed({ id: 'z', conditional_logic: { condition: 'show', logic: 'all', rules: [] } }, C(form)) && E.isDisplayed({ id: 'z', conditional_logic: { condition: 'hide', logic: 'all', rules: [] } }, C(form)))
}

section("9. incomplete legacy rule (questionId '') keeps the question hidden")
{
  const qs = [Q('a'), Q('b', 'short_text', { conditional_logic: show([R('', 'equals', '')]) })]
  eq('new: b hidden', ids(E.computePath(F(qs), { a: 'x' }).path.map(id => ({ id }))), ['a'])
  eq('legacy: b hidden too', ids(LEGACY.getVisibleQuestions(qs, { a: 'x' })), ['a'])
  eq('compat getVisibleQuestions: b hidden', ids(CL.getVisibleQuestions(qs, { a: 'x' })), ['a'])
}

section('9a. toNum')
{
  eq("toNum('' '  ' null true ['5'] {} undefined) → NaN", ['', '  ', null, true, false, ['5'], {}, undefined, 'abc', Infinity, NaN, '1e999'].map(x => Number.isNaN(E.toNum(x))), Array(12).fill(true))
  eq('toNum numbers and numeric strings', [E.toNum(5), E.toNum(' 7 '), E.toNum('-2.5'), E.toNum('0'), E.toNum(0), E.toNum('1e3')], [5, 7, -2.5, 0, 0, 1000])
  const form = F([Q('n', 'nps')], SCORE)
  ok("NPS 0 with rule equals '' → false", !E.evaluateRule(R('n', 'equals', ''), C(form, { n: 0 })))
  ok("NPS 0 with rule lte '' → false", !E.evaluateRule(R('n', 'lte', ''), C(form, { n: 0 })))
  ok("variable rule value '' acts non-finite", E.evaluateRule(V('score', 'not_equals', ''), C(form, {}, { score: 0 })) && !E.evaluateRule(V('score', 'equals', ''), C(form, {}, { score: 0 })) && !E.evaluateRule(V('score', 'lte', ''), C(form, {}, { score: 0 })))
}

// ════════════════════════════════════════════════════════════════════════════
section('10. display sees only earlier path answers')
{
  // q2 hides itself when q1 = skip; q3 shows when q2 = yes. A stale q2 answer must not show q3.
  const qs = [Q('q1'), Q('q2', 'short_text', { conditional_logic: hide([R('q1', 'equals', 'skip')]) }), Q('q3', 'short_text', { conditional_logic: show([R('q2', 'equals', 'yes')]) })]
  const run = E.computePath(F(qs), { q1: 'skip', q2: 'yes' })
  eq('stale answer to a question hidden by its rule does not count', run.path, ['q1'])
  eq('stale answer is not an effective answer', run.answers, { q1: 'skip' })
  eq('(legacy saw the stale answer: fix 3)', ids(LEGACY.getVisibleQuestions(qs, { q1: 'skip', q2: 'yes' })), ['q1', 'q3'])
  eq('not stale when q2 is shown', E.computePath(F(qs), { q1: 'go', q2: 'yes' }).path, ['q1', 'q2', 'q3'])

  const later = [Q('q1', 'short_text', { conditional_logic: show([R('q2', 'equals', 'x')]) }), Q('q2')]
  eq('a rule on a later question sees blank', E.computePath(F(later), { q2: 'x' }).path, ['q2'])
  const laterHide = [Q('q1', 'short_text', { conditional_logic: hide([R('q2', 'is_empty')]) }), Q('q2')]
  eq('later question is_empty is always true at this point', E.computePath(F(laterHide), { q2: 'x' }).path, ['q2'])

  const self = [Q('q1', 'short_text', { conditional_logic: show([R('q1', 'is_not_empty')]) }), Q('q2')]
  eq('a self-reference sees blank', E.computePath(F(self), { q1: 'a' }).path, ['q2'])
}

section('11. hidden choices')
{
  const q2 = Q('q2', 'multiple_choice', {
    options: ['A', 'B', 'C', 'D'], choice_logic: [
      { id: 'r1', logic: 'all', rules: [R('q1', 'equals', 'x')], choices: ['A', 'Zed'] },
      { id: 'r2', logic: 'any', rules: [R('q1', 'contains', 'x')], choices: ['C', 'A'] },
      { id: 'r3', logic: 'all', rules: [], choices: ['B'] },
      { id: 'r4', logic: 'all', rules: [R('q1', 'equals', 'nope')], choices: ['D'] },
      null,
    ],
  })
  const form = F([Q('q1'), q2])
  eq('union over matching rules, option order, unknown labels ignored, zero-condition rule never fires', E.hiddenChoiceLabels(form.questions[1], C(form, { q1: 'x' })), ['A', 'C'])
  eq('visibleChoices keeps original indexes', E.visibleChoices(form.questions[1], C(form, { q1: 'x' })), [{ label: 'B', index: 1 }, { label: 'D', index: 3 }])
  eq('nothing hidden when no rule matches', E.hiddenChoiceLabels(form.questions[1], C(form, { q1: 'y' })), [])
  eq('only CHOICE_TYPES', E.hiddenChoiceLabels({ ...Q('t', 'short_text', { options: ['A'] }), choice_logic: [{ id: 'r', logic: 'all', rules: [R('q1', 'is_empty')], choices: ['A'] }] }, C(form)), [])
  const run = E.computePath(form, { q1: 'x' })
  eq('run.hiddenChoices', run.hiddenChoices, { q2: ['A', 'C'] })
  eq('run.visibleChoices', run.visibleChoices, { q2: [{ label: 'B', index: 1 }, { label: 'D', index: 3 }] })
  eq('variable conditions on hidden choices', E.hiddenChoiceLabels({ ...q2, choice_logic: [{ id: 'v', logic: 'all', rules: [V('score', 'gt', '2')], choices: ['D'] }] }, C(F([Q('q1'), q2], SCORE), {}, { score: 3 })), ['D'])
}

section('12. every choice hidden → question skipped')
{
  const all = Q('q2', 'dropdown', { options: ['A', 'B'], choice_logic: [{ id: 'r', logic: 'all', rules: [R('q1', 'equals', 'x')], choices: ['A', 'B'] }] })
  eq('skipped when all hidden', E.computePath(F([Q('q1'), all, Q('q3')]), { q1: 'x', q2: 'A' }).path, ['q1', 'q3'])
  eq('skipped question answer is dropped', E.computePath(F([Q('q1'), all, Q('q3')]), { q1: 'x', q2: 'A' }).answers, { q1: 'x' })
  eq('shown otherwise', E.computePath(F([Q('q1'), all, Q('q3')]), { q1: 'y' }).path, ['q1', 'q2', 'q3'])
  eq('choice type with no options is not skipped', E.computePath(F([Q('q1', 'multiple_choice', { options: [] }), Q('q2', 'checkbox')]), {}).path, ['q1', 'q2'])
  eq('visibleChoices for no-options question is []', E.computePath(F([Q('q1', 'multiple_choice', { options: [] })]), {}).visibleChoices, { q1: [] })
}

section('13. sanitize removes only hidden labels')
{
  const rule = (choices) => [{ id: 'r', logic: 'all', rules: [R('q0', 'equals', 'hide')], choices }]
  const qs = [
    Q('q0'),
    Q('single', 'multiple_choice', { options: ['A', 'B', 'C'], choice_logic: rule(['B']) }),
    Q('multi', 'checkbox', { options: ['A', 'B', 'C'], choice_logic: rule(['B']) }),
    Q('rank', 'ranking', { options: ['A', 'B', 'C'], choice_logic: rule(['B']) }),
    Q('allgone', 'checkbox', { options: ['A', 'B', 'C'], choice_logic: rule(['A']) }),
    Q('kept', 'dropdown', { options: ['A', 'B'], choice_logic: rule(['B']) }),
    Q('stale', 'dropdown', { options: ['A', 'B'], choice_logic: rule(['B']) }),
  ]
  const run = E.computePath(F(qs), { q0: 'hide', single: 'B', multi: ['A', 'B'], rank: ['C', 'B', 'A'], allgone: ['A'], kept: 'A', stale: 'Removed option' })
  eq('single hidden → dropped', 'single' in run.answers, false)
  eq('multi filtered', run.answers.multi, ['A'])
  eq('ranking filtered', run.answers.rank, ['C', 'A'])
  eq('empty after filtering → omitted', 'allgone' in run.answers, false)
  eq('non-hidden single kept', run.answers.kept, 'A')
  eq('value that is no longer an option is kept', run.answers.stale, 'Removed option')
  const none = E.computePath(F(qs), { q0: 'show', single: 'B', multi: ['A', 'B'] })
  eq('nothing hidden → unchanged', [none.answers.single, none.answers.multi], ['B', ['A', 'B']])
}

section('13a. readFormLogic keeps id-less and duplicate questions')
{
  const raw = [{ type: 'short_text', title: 'No id' }, Q('a'), Q('a', 'short_text', { title: 'Dup' }), { id: '', type: 'short_text' }, Q('b')]
  const f = E.readFormLogic({ questions: raw })
  eq('ids', ids(f.questions), ['q_index_0', 'a', 'a_dup2', 'q_index_3', 'b'])
  eq('indexOf', f.indexOf, { q_index_0: 0, a: 1, a_dup2: 2, q_index_3: 3, b: 4 })
  const run = E.computePath(f, { q_index_0: 'hi' })
  eq('id-less question renders on the path', run.path, ['q_index_0', 'a', 'a_dup2', 'q_index_3', 'b'])
  ok('path has no duplicates', new Set(run.path).size === run.path.length)
  ok('original objects untouched', raw[0].id === undefined && raw[2].id === 'a')
  ok('unchanged questions are the same objects', f.questions[1] === raw[1])
  const odd = E.readFormLogic({ questions: [{ id: 'n', type: 'short_text', title: 42, description: null }, { id: 'u', type: 'short_text' }, { id: 'o', type: 'short_text', title: { x: 1 }, description: 7 }, { id: 'b', type: 'short_text', title: false, description: '' }] })
  eq('non-string titles become strings', odd.questions.map(q => q.title), ['42', '', '', 'false'])
  eq('non-string descriptions become strings', odd.questions.map(q => q.description), ['', '', '7', ''])
  let trimThrew = false
  try { odd.questions.forEach(q => q.title.trim() + q.description.trim()); E.describeTarget(toQ('n'), odd, 'u'); E.describeGroup({ logic: 'all', rules: [R('n', 'is_empty')] }, odd) } catch { trimThrew = true }
  ok('readers that call .trim() no longer crash', !trimThrew)
  eq('describeTarget uses the coerced title', E.describeTarget(toQ('n'), odd, 'u'), '1. 42')
  const rawOdd = { id: 'n', type: 'short_text', title: 42 }
  E.readFormLogic({ questions: [rawOdd] })
  ok('stored question untouched', rawOdd.title === 42)
  const clash = E.readFormLogic({ questions: [Q('q_index_1'), { type: 'x' }] })
  ok('generated id never collides', new Set(ids(clash.questions)).size === 2)
}

// ════════════════════════════════════════════════════════════════════════════

section('14. first matching branch rule wins')
{
  const qs = [Q('q1', 'short_text', { branching: { rules: [br('r1', [R('q1', 'contains', 'a')], toQ('q3')), br('r2', [R('q1', 'contains', 'ab')], toQ('q4'))] } }), Q('q2'), Q('q3'), Q('q4')]
  const run = E.computePath(F(qs), { q1: 'abc' })
  eq('path', run.path, ['q1', 'q3', 'q4'])
  eq('branch recorded', run.branches, { q1: 'r1' })
}

section('15. otherwise')
{
  const mk = (otherwise) => [Q('q1', 'short_text', { branching: { rules: [br('r1', [R('q1', 'equals', 'x')], END)], ...(otherwise ? { otherwise } : {}) } }), Q('q2'), Q('q3')]
  eq('otherwise → later question', E.computePath(F(mk(toQ('q3'))), { q1: 'y' }).path, ['q1', 'q3'])
  const end = E.computePath(F(mk(END)), { q1: 'y' })
  eq('otherwise → end', [end.path, end.endedBy, end.branches], [['q1'], 'jump', { q1: 'otherwise' }])
  eq('no otherwise → next', E.computePath(F(mk(null)), { q1: 'y' }).path, ['q1', 'q2', 'q3'])
  eq('otherwise next explicitly', E.computePath(F(mk(NEXT)), { q1: 'y' }).path, ['q1', 'q2', 'q3'])
  eq('matching rule → end', E.computePath(F(mk(toQ('q3'))), { q1: 'x' }).path, ['q1'])
  eq('otherwise-only branching is recorded', E.computePath(F([Q('a', 'short_text', { branching: { rules: [], otherwise: toQ('c') } }), Q('b'), Q('c')]), {}).branches, { a: 'otherwise' })
  eq('no branching recorded when only otherwise next', E.computePath(F([Q('a', 'short_text', { branching: { rules: [], otherwise: NEXT } }), Q('b')]), {}).branches, {})
}

section('16. invalid targets are skipped; corrupted forms terminate')
{
  const qs = [
    Q('q1'),
    Q('q2', 'short_text', {
      branching: {
        rules: [
          br('back', [R('q2', 'is_not_empty')], toQ('q1')),
          br('self', [R('q2', 'is_not_empty')], toQ('q2')),
          br('gone', [R('q2', 'is_not_empty')], toQ('deleted')),
          br('noconds', [], toQ('q4')),
          br('badto', [R('q2', 'is_not_empty')], { kind: 'nowhere' }),
          br('good', [R('q2', 'is_not_empty')], toQ('q4')),
        ],
      },
    }),
    Q('q3'), Q('q4'),
  ]
  const run = E.computePath(F(qs), { q2: 'x' })
  eq('backward, self, deleted, no-conditions and malformed rules skipped; next valid rule applies', [run.path, run.branches], [['q1', 'q2', 'q4'], { q2: 'good' }])
  const qs2 = [Q('q1'), Q('q2', 'short_text', { branching: { rules: [br('back', [R('q2', 'is_not_empty')], toQ('q1'))], otherwise: toQ('q1') } }), Q('q3')]
  eq('invalid otherwise → next', E.computePath(F(qs2), { q2: 'x' }).path, ['q1', 'q2', 'q3'])
  eq('invalid otherwise recorded as otherwise', E.computePath(F(qs2), { q2: 'x' }).branches, { q2: 'otherwise' })

  const corrupt = Array.from({ length: 30 }, (_, i) => Q(`c${i}`, 'short_text', { branching: { rules: [br('r', [R(`c${i}`, 'is_empty')], toQ('c0')), br('s', [R(`c${i}`, 'is_empty')], toQ(`c${i}`))], otherwise: toQ('c0') } }))
  const cr = E.computePath(F(corrupt), {})
  eq('every question jumping to q1 / itself still returns the whole path', cr.path.length, 30)
  ok('no duplicate ids', new Set(cr.path).size === cr.path.length)
  const garbage = [Q('g1', 'short_text', { branching: 'junk' }), Q('g2', 'short_text', { branching: { rules: 'x', otherwise: 'y' } }), Q('g3', 'short_text', { branching: { rules: [null, 5, { to: null }] } })]
  eq('garbage branching never throws', E.computePath(F(garbage), {}).path, ['g1', 'g2', 'g3'])
}

section('17. a jump target hidden by its own display rule')
{
  const qs = [
    Q('q1', 'short_text', { branching: { rules: [br('r', [R('q1', 'equals', 'jump')], toQ('q3'))] } }),
    Q('q2'),
    Q('q3', 'short_text', { conditional_logic: show([R('q1', 'equals', 'never')]), branching: { rules: [br('end', [R('q1', 'is_not_empty')], END)] } }),
    Q('q4'), Q('q5'),
  ]
  const run = E.computePath(F(qs), { q1: 'jump' })
  eq('continues to the next visible question after the target', run.path, ['q1', 'q4', 'q5'])
  eq("the target's branching does not run", [run.endedBy, run.branches], ['last', { q1: 'r' }])
}

section('18. endedBy')
{
  const qs = [Q('q1', 'short_text', { branching: { rules: [br('r', [R('q1', 'equals', 'stop')], END)] } }), Q('q2')]
  eq('jump to end', E.computePath(F(qs), { q1: 'stop' }).endedBy, 'jump')
  eq('walk past last', E.computePath(F(qs), { q1: 'go' }).endedBy, 'last')
  eq('empty form', E.computePath(F([]), {}).endedBy, 'last')
}

section('19. back-then-change')
{
  // A=x: A → B → (B jumps over D) → C.  A=y: A → D → C.
  const qs = [
    Q('A', 'multiple_choice', { options: ['x', 'y'], branching: { rules: [br('toD', [R('A', 'equals', 'y')], toQ('D'))] }, calculations: [calc('c1', 'score', 'add', 1, ANSWERED)] }),
    Q('B', 'short_text', { branching: { rules: [], otherwise: toQ('C') }, calculations: [calc('c2', 'score', 'add', 10, ANSWERED)] }),
    Q('D', 'short_text', { calculations: [calc('c3', 'score', 'add', 1000, ANSWERED)] }),
    Q('C', 'short_text', { calculations: [calc('c4', 'score', 'add', 100, ANSWERED)] }),
  ]
  const form = F(qs, SCORE)
  const first = E.computePath(form, { A: 'x', B: 'b', C: 'c' })
  eq('first path A→B→C', [first.path, first.variables], [['A', 'B', 'C'], { score: 111 }])
  const raw = { A: 'y', B: 'b', C: 'c', D: 'd' }
  const second = E.computePath(form, raw)
  eq('changed path A→D→C', second.path, ['A', 'D', 'C'])
  eq('variables recomputed, no double counting', second.variables, { score: 1101 })
  const sub = E.buildSubmission(form, raw)
  ok("B's stale answer is absent", !('B' in sub.answers))
  eq("C's kept answer and D's answer are present", [sub.answers.C, sub.answers.D, sub.answers.A], ['c', 'd', 'y'])
  eq('prev step follows the path actually taken', E.getPrevStep(form, raw, 'C'), 'D')
  eq('repeat computation is stable', E.computePath(form, raw).variables, { score: 1101 })
}

section('20. getNextStep / getPrevStep / resolveCurrent')
{
  const qs = [
    Q('q1', 'short_text', { branching: { rules: [br('r', [R('q1', 'equals', 'skip')], toQ('q4'))] } }),
    Q('q2'), Q('q3', 'short_text', { conditional_logic: show([R('q1', 'equals', 'show3')]) }), Q('q4'),
  ]
  const form = F(qs)
  eq('welcome → first', E.getNextStep(form, {}, null), { kind: 'question', id: 'q1' })
  eq('next on path', E.getNextStep(form, { q1: 'a' }, 'q1'), { kind: 'question', id: 'q2' })
  eq('next skips hidden', E.getNextStep(form, { q1: 'a' }, 'q2'), { kind: 'question', id: 'q4' })
  eq('next follows branch', E.getNextStep(form, { q1: 'skip' }, 'q1'), { kind: 'question', id: 'q4' })
  eq('last → end', E.getNextStep(form, { q1: 'a' }, 'q4'), { kind: 'end' })
  eq('current off the path → next path question after its form index', E.getNextStep(form, { q1: 'skip' }, 'q2'), { kind: 'question', id: 'q4' })
  eq('current off the path → end when none after', E.getNextStep(F([Q('a', 'short_text', { branching: { rules: [br('r', [R('a', 'is_not_empty')], END)] } }), Q('b')]), { a: 'x' }, 'b'), { kind: 'end' })
  eq('resolveCurrent on path', E.resolveCurrent(form, { q1: 'a' }, 'q2'), { kind: 'question', id: 'q2' })
  eq('resolveCurrent off path', E.resolveCurrent(form, { q1: 'skip' }, 'q3'), { kind: 'question', id: 'q4' })
  eq('resolveCurrent unknown id → index 0', E.resolveCurrent(form, { q1: 'a' }, 'zzz'), { kind: 'question', id: 'q1' })
  eq('resolveCurrent null → first', E.resolveCurrent(form, {}, null), { kind: 'question', id: 'q1' })
  const allHidden = F([Q('a', 'short_text', { conditional_logic: show([R('zz', 'equals', 'x')]) })])
  eq('welcome with an empty path → end', E.getNextStep(allHidden, {}, null), { kind: 'end' })
  eq('resolveCurrent with an empty path → end', E.resolveCurrent(allHidden, {}, 'a'), { kind: 'end' })
  eq('prev of first is null', E.getPrevStep(form, {}, 'q1'), null)
  eq('prev follows branch', E.getPrevStep(form, { q1: 'skip' }, 'q4'), 'q1')
  eq('prev skips hidden', E.getPrevStep(form, { q1: 'a' }, 'q4'), 'q2')
  eq('prev with current off the path → null', E.getPrevStep(form, { q1: 'skip' }, 'q2'), null)
}

section('21. getProgress equals the old step / visible.length')
{
  const qs = [Q('a'), Q('b', 'short_text', { conditional_logic: hide([R('a', 'equals', 'x')]) }), Q('c', 'yes_no'), Q('d', 'short_text', { conditional_logic: show([R('c', 'equals', 'Yes')]) }), Q('e')]
  for (const answers of [{}, { a: 'x' }, { a: 'y', c: 'Yes' }, { a: 'x', c: 'No' }, { a: 'x', c: 'Yes', d: 'z' }]) {
    const vis = LEGACY.getVisibleQuestions(qs, answers)
    vis.forEach((q, step) => eq(`progress ${q.id} ${JSON.stringify(answers)}`, E.getProgress(F(qs), answers, q.id), { index: step, total: vis.length, ratio: step / Math.max(1, vis.length) }))
  }
  eq('progress of unknown id → index 0', E.getProgress(F(qs), {}, 'zzz').index, 0)
}

section('22. estimateMinutes equals the old formula')
{
  for (const n of [0, 1, 2, 3, 7, 8, 12, 13, 30, 47]) {
    const qs = Array.from({ length: n }, (_, i) => Q(`q${i}`, 'short_text', i % 3 === 2 ? { conditional_logic: hide([R('q0', 'equals', 'x')]) } : {}))
    for (const answers of [{}, { q0: 'x' }]) {
      const old = Math.max(1, Math.round((LEGACY.getVisibleQuestions(qs, answers).length * 12) / 60))
      eq(`estimateMinutes ${n} ${JSON.stringify(answers)}`, E.estimateMinutes(F(qs), answers), old)
    }
  }
  eq('default answers argument', E.estimateMinutes(F([Q('a')])), 1)
}

section('22a. estimateMinutes ignores branching that depends on unanswered questions')
{
  const long = (first, n = 30) => [first, ...Array.from({ length: n - 1 }, (_, i) => Q(`q${i + 2}`))]
  // Reviewer case: "if Q1 is not Yes → End" matches a blank answer (not_equals is true on blank).
  const notYes = F(long(Q('q1', 'yes_no', { branching: { rules: [br('r', [R('q1', 'not_equals', 'Yes')], END)] } })))
  eq('runtime projection from no answers still ends after Q1 (unchanged)', E.computePath(notYes, {}).path, ['q1'])
  eq('estimate from no answers counts the whole form', E.estimateMinutes(notYes, {}), 6)
  eq('estimate default argument too', E.estimateMinutes(notYes), 6)
  eq('estimate once Q1 is answered No follows the branch', E.estimateMinutes(notYes, { q1: 'No' }), 1)
  eq('estimate once Q1 is answered Yes', E.estimateMinutes(notYes, { q1: 'Yes' }), 6)
  // An "otherwise → End" is not applied while the rules are undecided.
  const otherwiseEnd = F(long(Q('q1', 'yes_no', { branching: { rules: [br('r', [R('q1', 'equals', 'Yes')], toQ('q30'))], otherwise: END } })))
  eq('undecided rules: otherwise → End ignored', E.estimateMinutes(otherwiseEnd, {}), 6)
  eq('decided: otherwise → End applies', E.estimateMinutes(otherwiseEnd, { q1: 'No' }), 1)
  eq('decided: jump to Q30 applies', E.estimateMinutes(otherwiseEnd, { q1: 'Yes' }), 1)
  // Branching on a later question that depends on an earlier answered one is decided.
  const atQ10 = F(Array.from({ length: 30 }, (_, i) => Q(`q${i + 1}`, i === 0 ? 'yes_no' : 'short_text', i === 9 ? { branching: { rules: [br('r', [R('q1', 'equals', 'Yes')], END)] } } : {})))
  eq('rule at Q10 on answered Q1 applies', E.estimateMinutes(atQ10, { q1: 'Yes' }), 2)
  eq('rule at Q10 on unanswered Q1 ignored', E.estimateMinutes(atQ10, {}), 6)
  // Sources that stay blank whatever the person does are decided (same as the runtime path).
  const deleted = F(long(Q('q1', 'short_text', { branching: { rules: [br('r', [R('gone', 'is_empty')], toQ('q26'))] } })))
  eq('deleted source: decided, jump applies', [E.estimateMinutes(deleted, {}), E.computePath(deleted, {}).path.length], [1, 6])
  const later = F(long(Q('q1', 'short_text', { branching: { rules: [br('r', [R('q30', 'is_empty')], toQ('q26'))] } })))
  eq('later source: decided, jump applies', E.estimateMinutes(later, {}), 1)
  const stmt = F(long(Q('q1', 'statement', { branching: { rules: [br('r', [R('q1', 'is_empty')], toQ('q26'))] } })))
  eq('statement source: decided, jump applies', E.estimateMinutes(stmt, {}), 1)
  const skipped = F([Q('q1', 'yes_no'), Q('q2', 'short_text', { conditional_logic: show([R('q1', 'equals', 'Yes')]) }), Q('q3', 'short_text', { branching: { rules: [br('r', [R('q2', 'is_empty')], END)] } }), ...Array.from({ length: 27 }, (_, i) => Q(`x${i}`))])
  eq('source skipped by display rules: decided', E.estimateMinutes(skipped, { q1: 'No' }), 1)
  // Variable rules: decided once the question itself is answered.
  const varForm = F(long(Q('q1', 'rating', { calculations: [calc('k', 'score', 'add', 0, ANSWERED, { useAnswer: true })], branching: { rules: [br('r', [V('score', 'lt', '3')], END)] } })), SCORE)
  eq('variable rule with the question unanswered ignored', E.estimateMinutes(varForm, {}), 6)
  eq('variable rule with the question answered applies', [E.estimateMinutes(varForm, { q1: 1 }), E.estimateMinutes(varForm, { q1: 5 })], [1, 6])
  // Display rules still apply exactly as before, so old forms are unchanged (test 22 covers the formula).
  const display = F(long(Q('q1', 'short_text', { conditional_logic: show([R('zz', 'equals', 'x')]) })))
  eq('display rules still apply', E.estimateMinutes(display, {}), 6)
  const hidesMany = F([Q('q1'), ...Array.from({ length: 29 }, (_, i) => Q(`h${i}`, 'short_text', { conditional_logic: hide([R('q1', 'is_empty')]) }))])
  eq('display rules matching blank still shorten it (legacy behaviour)', E.estimateMinutes(hidesMany, {}), 1)
  // Fuzz: with every answer given, the estimate equals the runtime path.
  const rr = rng(7)
  let same = 0, total = 0
  for (let iter = 0; iter < 300; iter++) {
    const n = 3 + Math.floor(rr() * 10)
    const qs = Array.from({ length: n }, (_, i) => Q(`f${i}`, 'yes_no', rr() < 0.5 ? { branching: { rules: [br('r', [R(`f${Math.floor(rr() * (i + 1))}`, pick(rr, ['equals', 'not_equals']), pick(rr, ['Yes', 'No']))], rr() < 0.3 ? END : toQ(`f${Math.min(n - 1, i + 1 + Math.floor(rr() * 3))}`))] } } : {}))
    const answers = Object.fromEntries(qs.map(q => [q.id, pick(rr, ['Yes', 'No'])]))
    total++
    if (E.estimateMinutes(F(qs), answers) === Math.max(1, Math.round((E.computePath(F(qs), answers).path.length * 12) / 60))) same++
  }
  eq(`fully answered forms: estimate matches the runtime path (${total} forms)`, same, total)
}

// ════════════════════════════════════════════════════════════════════════════
section('23. calculation order')
{
  const qs = [
    Q('q1', 'short_text', { calculations: [calc('a', 'score', 'add', 2, ANSWERED), calc('b', 'score', 'multiply', 10, ANSWERED), calc('c', 'score', 'subtract', 1, ANSWERED)] }),
    Q('q2', 'short_text', { calculations: [calc('d', 'score', 'divide', 4, ANSWERED)] }),
    Q('q3', 'short_text', { conditional_logic: show([R('q1', 'equals', 'never')]), calculations: [calc('e', 'score', 'add', 1000, ANSWERED)] }),
  ]
  const run = E.computePath(F(qs, SCORE), { q1: 'x', q2: 'y', q3: 'stale' })
  eq('ops in order, questions in path order, off-path contributes nothing', run.variables, { score: 4.75 })
  eq('variablesBefore', run.variablesBefore, { q1: { score: 0 }, q2: { score: 19 } })
  eq('computeVariables = computePath().variables', E.computeVariables(F(qs, SCORE), { q1: 'x', q2: 'y' }), { score: 4.75 })
  eq('unanswered questions contribute nothing', E.computeVariables(F(qs, SCORE), {}), { score: 0 })
  eq('applyCalculations returns a copy', (() => { const vars = { score: 1 }; E.applyCalculations(qs[0], C(F(qs, SCORE), { q1: 'x' }, vars)); return vars })(), { score: 1 })
}

section('24. answered / choice / conditions')
{
  const vars2 = [...SCORE, { id: 'price', label: 'Price', initial: 0 }]
  const qs = [
    Q('st', 'statement', { calculations: [calc('s', 'score', 'add', 50, ANSWERED)] }),
    Q('one', 'multiple_choice', { options: ['A', 'B'], calculations: [calc('a', 'score', 'add', 1, { kind: 'choice', choice: 'A' }), calc('b', 'score', 'add', 2, { kind: 'choice', choice: 'B' })] }),
    Q('many', 'checkbox', { options: ['X', 'Y', 'Z'], calculations: [calc('x', 'price', 'add', 10, { kind: 'choice', choice: 'X' }), calc('y', 'price', 'add', 20, { kind: 'choice', choice: 'Y' }), calc('z', 'price', 'add', 40, { kind: 'choice', choice: 'Z' })] }),
    Q('yn', 'yes_no', { calculations: [calc('yy', 'score', 'add', 100, { kind: 'choice', choice: 'Yes' })] }),
    Q('cond', 'number', {
      calculations: [
        calc('k1', 'score', 'add', 1000, { kind: 'conditions', logic: 'all', rules: [V('score', 'gte', '101'), R('cond', 'gt', '5')] }),
        calc('k2', 'score', 'add', 5000, { kind: 'conditions', logic: 'all', rules: [V('score', 'gte', '1101')] }),
        calc('k3', 'score', 'add', 9, { kind: 'conditions', logic: 'all', rules: [] }),
      ],
    }),
  ]
  const form = F(qs, vars2)
  const run = E.computePath(form, { one: 'A', many: ['X', 'Z'], yn: 'Yes', cond: '6' })
  eq('statement never counts as answered; single choice; multi with several matching ops; yes_no; conditions see running values and this answer; empty conditions never fire', run.variables, { score: 6101, price: 50 })
  eq('conditions false when this answer does not match', E.computePath(form, { one: 'B', yn: 'Yes', cond: '4' }).variables, { score: 102, price: 0 })
  eq('answered with blank answer does not apply', E.computeVariables(F([Q('a', 'short_text', { calculations: [calc('x', 'score', 'add', 1, ANSWERED)] })], SCORE), { a: '   ' }), { score: 0 })
  eq('answered applies to NPS 0', E.computeVariables(F([Q('a', 'nps', { calculations: [calc('x', 'score', 'add', 1, ANSWERED)] })], SCORE), { a: 0 }), { score: 1 })
  eq('choice on a hidden (sanitized) label does not apply', E.computeVariables(F([Q('q0'), Q('c', 'dropdown', { options: ['A', 'B'], choice_logic: [{ id: 'h', logic: 'all', rules: [R('q0', 'equals', 'h')], choices: ['A'] }], calculations: [calc('x', 'score', 'add', 1, { kind: 'choice', choice: 'A' })] })], SCORE), { q0: 'h', c: 'A' }), { score: 0 })
  eq('malformed when never applies', E.computeVariables(F([Q('a', 'short_text', { calculations: [calc('x', 'score', 'add', 1, null), calc('y', 'score', 'add', 1, { kind: 'weird' }), null] })], SCORE), { a: 'x' }), { score: 0 })
}

section('25. useAnswer')
{
  const mk = (type, answer) => E.computeVariables(F([Q('a', type, { calculations: [calc('x', 'score', 'add', 1, ANSWERED, { useAnswer: true })] })], SCORE), { a: answer })
  eq('rating', mk('rating', 4), { score: 4 })
  eq('number string', mk('number', '12.5'), { score: 12.5 })
  eq('nps 0', mk('nps', 0), { score: 0 })
  eq('non-numeric answer → skipped', mk('number', 'abc'), { score: 0 })
  eq('non-numeric type ignores useAnswer and uses amount', mk('short_text', '7'), { score: 1 })
  eq('set with useAnswer', E.computeVariables(F([Q('a', 'opinion_scale', { calculations: [calc('x', 'score', 'set', 0, ANSWERED, { useAnswer: true })] })], [{ id: 'score', label: 'S', initial: 3 }]), { a: 6 }), { score: 6 })
}

section('26. divide by 0, set, rounding')
{
  const run = (calcs, initial = 0) => E.computeVariables(F([Q('a', 'short_text', { calculations: calcs })], [{ id: 'score', label: 'S', initial }]), { a: 'x' })
  eq('divide by 0 skipped', run([calc('d', 'score', 'divide', 0, ANSWERED)], 6), { score: 6 })
  eq('divide', run([calc('d', 'score', 'divide', 4, ANSWERED)], 6), { score: 1.5 })
  eq('set', run([calc('a', 'score', 'add', 5, ANSWERED), calc('s', 'score', 'set', 2, ANSWERED)]), { score: 2 })
  eq('rounding 0.1 + 0.2 → 0.3', run([calc('a', 'score', 'add', 0.1, ANSWERED), calc('b', 'score', 'add', 0.2, ANSWERED)]), { score: 0.3 })
  eq('rounding to 6 places', run([calc('a', 'score', 'add', 1, ANSWERED), calc('b', 'score', 'divide', 3, ANSWERED)]), { score: 0.333333 })
  eq('non-finite amount skipped', run([calc('a', 'score', 'add', 'abc', ANSWERED), calc('b', 'score', 'add', '', ANSWERED), calc('c', 'score', 'add', null, ANSWERED), calc('d', 'score', 'add', '2', ANSWERED)]), { score: 2 })
  eq('unknown op skipped', run([calc('a', 'score', 'pow', 2, ANSWERED)], 3), { score: 3 })
}

section('27. variable timing: display before, branching after')
{
  const qs = [
    Q('q1', 'short_text', {
      calculations: [calc('a', 'score', 'add', 5, ANSWERED)],
      conditional_logic: show([V('score', 'equals', '0')]),
      branching: { rules: [br('b', [V('score', 'equals', '5')], toQ('q3'))] },
    }),
    Q('q2'),
    Q('q3', 'short_text', { conditional_logic: show([V('score', 'equals', '5')]) }),
  ]
  const run = E.computePath(F(qs, SCORE), { q1: 'x' })
  eq('display sees before (score 0 → shown); branching sees after (score 5 → q3); later display sees 5', run.path, ['q1', 'q3'])
  eq('variablesBefore q3 = 5', run.variablesBefore.q3, { score: 5 })
  const hiddenChoice = Q('c', 'dropdown', { options: ['A', 'B'], calculations: [calc('a', 'score', 'add', 1, ANSWERED)], choice_logic: [{ id: 'h', logic: 'all', rules: [V('score', 'gte', '1')], choices: ['A'] }] })
  eq('hidden choices see variables before the question', E.computePath(F([hiddenChoice], SCORE), { c: 'A' }).answers, { c: 'A' })
}

section('28. initial values')
{
  const vars = [{ id: 'score', label: 'S', initial: 10 }, { id: 'price', label: 'P', initial: 'x' }, { id: 'tax', label: 'T' }]
  const form = E.readFormLogic({ questions: [Q('a', 'short_text', { calculations: [calc('u', 'unknown', 'add', 5, ANSWERED), calc('s', 'score', 'add', 1, ANSWERED)] })], theme: { variables: vars } })
  eq('initialVariables', E.initialVariables(form), { score: 10, price: 0, tax: 0 })
  eq('op on an unknown variable skipped', E.computeVariables(form, { a: 'x' }), { score: 11, price: 0, tax: 0 })
  eq('no variables → {}', E.computeVariables(F([Q('a')]), { a: 'x' }), {})
}

// ════════════════════════════════════════════════════════════════════════════
section('29. validateSubmission')
{
  const qs = [
    Q('name', 'short_text', { required: true }),
    Q('hidden', 'short_text', { required: true, conditional_logic: show([R('name', 'equals', 'show')]) }),
    Q('mail', 'email'),
    Q('pay', 'payment', { amountCents: 500 }),
    Q('free', 'payment', { amountCents: 0, required: false }),
    Q('info', 'statement', { required: true }),
    Q('nps', 'nps', { required: true }),
  ]
  const form = F(qs)
  eq('everything missing', E.validateSubmission(form, {}), [
    { questionId: 'name', reason: 'required' }, { questionId: 'pay', reason: 'payment' }, { questionId: 'nps', reason: 'required' },
  ])
  eq('hidden required does not block; email check; payment blocks without required; statement never required; NPS 0 counts', E.validateSubmission(form, { name: 'Ann', mail: 'not-an-email', pay: { status: 'pending' }, nps: 0 }), [
    { questionId: 'mail', reason: 'email' }, { questionId: 'pay', reason: 'payment' },
  ])
  eq('required on the path blocks', E.validateSubmission(form, { name: 'show', pay: { status: 'paid' }, nps: 3 }), [{ questionId: 'hidden', reason: 'required' }])
  eq('all good', E.validateSubmission(form, { name: 'Ann', mail: ' a@b.co ', pay: { status: 'paid' }, nps: 9 }), [])
  eq('blank-ish required answers block', E.validateSubmission(F([Q('a', 'short_text', { required: true }), Q('b', 'checkbox', { required: true, options: ['X'] })]), { a: '   ', b: [] }), [{ questionId: 'a', reason: 'required' }, { questionId: 'b', reason: 'required' }])
  eq('required choice whose answer got hidden blocks', E.validateSubmission(F([Q('q0'), Q('c', 'dropdown', { required: true, options: ['A', 'B'], choice_logic: [{ id: 'h', logic: 'all', rules: [R('q0', 'equals', 'h')], choices: ['A'] }] })]), { q0: 'h', c: 'A' }), [{ questionId: 'c', reason: 'required' }])
}

section('30. buildSubmission')
{
  const qs = [
    Q('q1', 'yes_no', { branching: { rules: [br('b1', [R('q1', 'equals', 'Yes')], toQ('q3'))] }, calculations: [calc('c', 'score', 'add', 7, { kind: 'choice', choice: 'Yes' })] }),
    Q('q2'),
    Q('q3', 'checkbox', { options: ['A', 'B'], choice_logic: [{ id: 'h', logic: 'all', rules: [R('q1', 'equals', 'Yes')], choices: ['B'] }] }),
  ]
  const vars = [...SCORE, { id: 'price', label: 'Price', initial: 2 }]
  const sub = E.buildSubmission(F(qs, vars), { q1: 'Yes', q2: 'stale', q3: ['A', 'B'], extra: 'junk' })
  eq('answers', sub.answers, {
    q1: 'Yes', q3: ['A'],
    __logic: { v: 1, path: ['q1', 'q3'], completed: true, ending: 'default', endedBy: 'last', variables: { score: 7, price: 2 }, branches: { q1: 'b1' }, hiddenChoices: { q3: ['B'] } },
  })
  eq('returns variables and path', [sub.variables, sub.path], [{ score: 7, price: 2 }, ['q1', 'q3']])
  const plain = E.buildSubmission(F([Q('a'), Q('b')]), { a: 'x', b: '' })
  eq('no logic: branches / hiddenChoices / offPath omitted, variables {}', plain.answers, { a: 'x', __logic: { v: 1, path: ['a', 'b'], completed: true, ending: 'default', endedBy: 'last', variables: {} } })
  ok('__logic is read back', E.readResponseLogic(sub.answers)?.path.join() === 'q1,q3')
  eq('endedBy jump', E.buildSubmission(F([Q('a', 'short_text', { branching: { rules: [br('e', [R('a', 'is_not_empty')], END)] } }), Q('b')]), { a: 'x' }).answers.__logic.endedBy, 'jump')
}

section('31. readResponseLogic / stripReservedAnswers')
{
  eq('legacy row → null', E.readResponseLogic({ q1: 'x' }), null)
  eq('null answers → null', E.readResponseLogic(null), null)
  eq('array answers → null', E.readResponseLogic([]), null)
  eq('wrong version → null', E.readResponseLogic({ __logic: { v: 2, path: [] } }), null)
  eq('path not an array → null', E.readResponseLogic({ __logic: { v: 1, path: 'q1' } }), null)
  eq('__logic not an object → null', E.readResponseLogic({ __logic: 'x' }), null)
  const huge = Array.from({ length: 10000 }, (_, i) => `q${i}`)
  const hostile = E.readResponseLogic({
    __logic: {
      v: 1, path: ['a', 5, null, 'a', { x: 1 }, 'b', ...huge], completed: 'nope', ending: 'evil', endedBy: 'bogus',
      variables: { score: NaN, price: '5', ok: 3, inf: Infinity, nested: { a: 1 } },
      branches: { q1: 'r1', q2: 5, q3: null }, hiddenChoices: { q1: ['A', 3, 'A', 'B'], q2: 'C', q3: [] },
      offPath: [1, 'pay', 'pay'], extra: '<script>',
    },
  })
  eq('sanitised path: strings, de-duplicated, ≤500', [hostile.path.length, hostile.path.slice(0, 3)], [500, ['a', 'b', 'q0']])
  eq('variables: finite numbers only', hostile.variables, { ok: 3 })
  eq('branches: string → string', hostile.branches, { q1: 'r1' })
  eq('hiddenChoices: string[] only', hostile.hiddenChoices, { q1: ['A', 'B'], q3: [] })
  eq('offPath', hostile.offPath, ['pay'])
  eq('fixed fields', [hostile.completed, hostile.ending, hostile.endedBy, hostile.v], [true, 'default', 'last', 1])
  ok('unknown keys dropped', !('extra' in hostile))
  const proto = E.readResponseLogic(JSON.parse('{"__logic":{"v":1,"path":[],"variables":{"__proto__":5},"hiddenChoices":{"__proto__":["x"]},"branches":{"__proto__":"x"}}}'))
  ok('prototype keys ignored', Object.getPrototypeOf(proto.variables) === Object.prototype && !proto.hiddenChoices && !proto.branches)
  eq('endedBy jump kept', E.readResponseLogic({ __logic: { v: 1, path: [], endedBy: 'jump' } }).endedBy, 'jump')
  eq('minimal', E.readResponseLogic({ __logic: { v: 1, path: [] } }), { v: 1, path: [], completed: true, ending: 'default', endedBy: 'last', variables: {} })

  eq('stripReservedAnswers removes every __ key', E.stripReservedAnswers({ a: 1, __logic: {}, __x: 2, _keep: 3, b__: 4 }), { a: 1, _keep: 3, b__: 4 })
  eq('stripReservedAnswers(null)', E.stripReservedAnswers(null), {})
  eq('stripReservedAnswers(array)', E.stripReservedAnswers(['a']), {})
}

section('31a. offPath keeps completed side effects')
{
  const qs = [
    Q('q1', 'yes_no', { branching: { rules: [br('skip', [R('q1', 'equals', 'No')], toQ('q4'))] } }),
    Q('q2', 'scheduler'),
    Q('q3', 'payment', { amountCents: 1000 }),
    Q('q4', 'short_text'),
    Q('q5', 'payment', { amountCents: 500, conditional_logic: show([R('q1', 'equals', 'Maybe')]) }),
    Q('q6', 'scheduler', { conditional_logic: show([R('q1', 'equals', 'Maybe')]) }),
  ]
  const paid = { status: 'paid', amount_cents: 1000, currency: 'aud', payment_id: 'pi_1' }
  const booked = { starts_at: '2026-10-20T01:00:00Z', ends_at: '2026-10-20T02:00:00Z', calendar_event_id: 'ev1' }
  // Paid at q3 and booked at q2, then went back and changed q1 so both are off the path.
  const sub = E.buildSubmission(F(qs), { q1: 'No', q2: booked, q3: paid, q4: 'hi', q5: { status: 'pending' }, q6: { starts_at: 'x', ends_at: 'y' } })
  eq('path', sub.path, ['q1', 'q4'])
  eq('paid payment and booked scheduler kept', [sub.answers.q3, sub.answers.q2], [paid, booked])
  eq('offPath lists them in form order', sub.answers.__logic.offPath, ['q2', 'q3'])
  ok('unpaid payment and unbooked scheduler dropped', !('q5' in sub.answers) && !('q6' in sub.answers))
  const on = E.buildSubmission(F(qs), { q1: 'Yes', q2: booked, q3: paid })
  ok('no offPath when they are on the path', !('offPath' in on.answers.__logic) && on.answers.q3 === paid)
  ok('scheduler with blank calendar_event_id dropped', !('q2' in E.buildSubmission(F(qs), { q1: 'No', q2: { ...booked, calendar_event_id: '' } }).answers))
}

// ════════════════════════════════════════════════════════════════════════════
section('32. piping')
{
  const qs = [
    Q('name'),
    Q('tags', 'checkbox', { options: ['A', 'B'] }),
    Q('ok', 'legal'),
    Q('file', 'file_upload'),
    Q('sig', 'signature'),
    Q('grid', 'matrix'),
    Q('pay', 'payment'),
    Q('hidden', 'short_text', { conditional_logic: show([R('name', 'equals', 'nobody')]) }),
    Q('score_q', 'number', { calculations: [calc('c', 'score', 'add', 0, ANSWERED, { useAnswer: true })] }),
    Q('last', 'short_text', { title: 'Hi {previous_answer:name}, score {variable:score}, later {previous_answer:after}' }),
    Q('after'),
  ]
  const form = F(qs, SCORE)
  const raw = { name: 'Ann', tags: ['A', 'B'], ok: true, file: { name: 'cv.pdf', url: 'https://x/cv.pdf' }, sig: 'data:image/png;base64,AAAA', grid: { Speed: 'Good', Price: 'Bad' }, pay: { status: 'paid', amount_cents: 1250, currency: 'aud' }, hidden: 'stale', score_q: '12', after: 'LATER' }
  const run = E.computePath(form, raw)
  const ctx = { form, answers: run.answers, variables: run.variables }
  eq('answer token', E.pipeText('Hi {previous_answer:name}!', ctx), 'Hi Ann!')
  eq('variable token', E.pipeText('Score: {variable:score}', ctx), 'Score: 12')
  eq('unknown tokens → empty', E.pipeText('[{previous_answer:nope}][{variable:nope}]', ctx), '[][]')
  eq('question not on the path → empty', E.pipeText('[{previous_answer:hidden}]', ctx), '[]')
  eq('array', E.pipeText('{previous_answer:tags}', ctx), 'A, B')
  eq('legal', E.pipeText('{previous_answer:ok}', ctx), 'Accepted')
  eq('file → name', E.pipeText('{previous_answer:file}', ctx), 'cv.pdf')
  eq('signature data URL → empty', E.pipeText('[{previous_answer:sig}]', ctx), '[]')
  eq('matrix', E.pipeText('{previous_answer:grid}', ctx), 'Speed: Good; Price: Bad')
  eq('payment', E.pipeText('{previous_answer:pay}', ctx), '$12.50')
  eq('tokens with spaces in id are trimmed', E.pipeText('{previous_answer: name }', ctx), 'Ann')
  eq('text with no tokens unchanged', E.pipeText('Plain {not a token}', ctx), 'Plain {not a token}')
  eq('non-string text → ""', E.pipeText(undefined, ctx), '')
  // Titles pipe answers and variables as of before the question.
  const title = qs[9].title
  eq('title: earlier answers, variables before, later answer empty', E.pipeText(title, { form, answers: E.pathAnswersBefore(run, 'last'), variables: run.variablesBefore.last ?? run.variables }), 'Hi Ann, score 12, later ')
  eq('variable as of before the question', E.pipeText('{variable:score}', { form, answers: {}, variables: run.variablesBefore.score_q }), '0')
  eq('pathAnswersBefore excludes the question and later ones', Object.keys(E.pathAnswersBefore(run, 'score_q')), ['name', 'tags', 'ok', 'file', 'sig', 'grid', 'pay'])
  eq('pathAnswersBefore for an id not on the path = all answers', Object.keys(E.pathAnswersBefore(run, 'hidden')).length, Object.keys(run.answers).length)
  eq('pathAnswersBefore of the first question = {}', E.pathAnswersBefore(run, 'name'), {})
}

section('answerToPlainText / formatVariable')
{
  const t = E.answerToPlainText
  eq('blank', [t(undefined), t(null), t(''), t([]), t({})], ['', '', '', '', ''])
  eq('primitives', [t('x'), t(0), t(7.5), t(true), t(false)], ['x', '0', '7.5', 'Accepted', 'No'])
  eq('array of mixed', t(['A', 2, 'data:x']), 'A, 2')
  eq('file without name', t({ url: 'https://x' }), 'File')
  eq('payment without amount', t({ status: 'paid' }, Q('p', 'payment')), 'Paid')
  eq('payment USD', t({ status: 'paid', amount_cents: 500, currency: 'usd' }).replace(/\s/g, ' '), 'USD 5.00')
  eq('payment bad currency', t({ amount_cents: 500, currency: 'zzzz' }), '5.00 ZZZZ')
  const when = t({ starts_at: '2026-10-20T01:00:00Z', ends_at: 'x', calendar_event_id: 'e' })
  ok(`scheduler → local date-time (${when})`, /2026/.test(when) && /Oct/.test(when))
  eq('scheduler bad date', t({ starts_at: 'soon' }), 'soon')
  eq('formatVariable', [E.formatVariable(undefined), E.formatVariable(0), E.formatVariable(1234.567), E.formatVariable(-2), E.formatVariable(NaN)], ['', '0', '1,234.57', '-2', ''])
}

// ════════════════════════════════════════════════════════════════════════════
section('33. validateLogic: each code once in a crafted form')
{
  const qs = [
    Q('q1', 'multiple_choice', { options: ['A', 'B', 'C'] }),
    Q('q2', 'short_text', {
      conditional_logic: show([
        R('gone', 'equals', 'x'),            // missing_question
        R('q1', 'equals', 'Z'),              // missing_choice
        R('', 'equals', ''),                 // incomplete_rule
        R('q3', 'is_not_empty'),             // later_question
        R('q2', 'is_not_empty'),             // self_reference
        R('q1', 'gt', '1'),                  // bad_operator (error)
        V('score', 'gt', '1'),               // variable_not_set_yet
        V('nope', 'gt', '1'),                // missing_variable
      ]),
    }),
    Q('q3', 'short_text', { choice_logic: [{ id: 'c1', logic: 'all', rules: [R('q1', 'equals', 'A')], choices: ['A'] }] }),   // not_applicable
    Q('q4', 'dropdown', {
      options: ['X', 'Y'],
      branching: { rules: [br('b1', [], toQ('q2'))], otherwise: toQ('deleted') },                                              // no_conditions, backward_jump, missing_target
    }),
    Q('q5', 'number', { calculations: [calc('k1', 'score', 'add', 1, ANSWERED)] }),
  ]
  const issues = E.validateLogic(F(qs, SCORE))
  const codes = issues.map(i => i.code).sort()
  eq('each code exactly once', codes, ['backward_jump', 'bad_operator', 'incomplete_rule', 'later_question', 'missing_choice', 'missing_question', 'missing_target', 'missing_variable', 'no_conditions', 'not_applicable', 'self_reference', 'variable_not_set_yet'])
  const by = Object.fromEntries(issues.map(i => [i.code, i]))
  eq('severities', Object.fromEntries(Object.entries(by).map(([k, i]) => [k, i.severity])), {
    missing_question: 'error', missing_choice: 'error', incomplete_rule: 'error', later_question: 'warning', self_reference: 'warning',
    bad_operator: 'error', variable_not_set_yet: 'warning', missing_variable: 'error', not_applicable: 'warning', no_conditions: 'error',
    backward_jump: 'error', missing_target: 'error',
  })
  eq('display issues carry conditionIndex', ['missing_question', 'missing_choice', 'incomplete_rule', 'later_question', 'self_reference', 'bad_operator', 'variable_not_set_yet', 'missing_variable'].map(c => [by[c].questionId, by[c].section, by[c].conditionIndex]),
    [['q2', 'display', 0], ['q2', 'display', 1], ['q2', 'display', 2], ['q2', 'display', 3], ['q2', 'display', 4], ['q2', 'display', 5], ['q2', 'display', 6], ['q2', 'display', 7]])
  eq('branching issues carry ruleId', [[by.no_conditions.ruleId, by.backward_jump.ruleId, by.missing_target.ruleId], by.missing_target.section], [['b1', 'b1', 'otherwise'], 'branching'])
  eq('not_applicable', [by.not_applicable.questionId, by.not_applicable.section], ['q3', 'choices'])
  eq('messages', [by.missing_question.message, by.missing_target.message, by.backward_jump.message], ["This rule's question was deleted.", 'The question this rule went to was deleted.', 'This question is no longer after this one, so the rule is skipped.'])
  ok('every issue has a plain-English message', issues.every(i => typeof i.message === 'string' && i.message.length > 10))
}

section('validateLogic: more cases')
{
  const v = (qs, vars = SCORE) => E.validateLogic(F(qs, vars)).map(i => `${i.questionId}:${i.section}:${i.code}:${i.severity}${i.ruleId ? ':' + i.ruleId : ''}`)
  eq('clean form → no issues', v([Q('a', 'yes_no'), Q('b', 'short_text', { conditional_logic: show([R('a', 'equals', 'Yes')]) })]), [])
  eq('legacy equals/contains on multi → warning', v([Q('m', 'checkbox', { options: ['A'] }), Q('b', 'short_text', { conditional_logic: show([R('m', 'equals', 'A'), R('m', 'contains', 'A')]) })]), ['b:display:bad_operator:warning', 'b:display:bad_operator:warning'])
  eq('legacy contains on single choice → warning (still evaluates)', v([Q('d', 'dropdown', { options: ['Pro plan'] }), Q('b', 'short_text', { conditional_logic: show([R('d', 'contains', 'Pro')]) })]), ['b:display:bad_operator:warning'])
  eq('new operator outside the kind list → error', v([Q('m', 'checkbox', { options: ['A'] }), Q('b', 'short_text', { conditional_logic: show([R('m', 'gt', '1')]) })]), ['b:display:bad_operator:error'])
  eq('unknown operator → error', v([Q('a'), Q('b', 'short_text', { conditional_logic: show([R('a', 'starts_with', 'x')]) })]), ['b:display:bad_operator:error'])
  eq('source that became a statement → bad_operator error', v([Q('s', 'statement'), Q('b', 'short_text', { conditional_logic: show([R('s', 'is_not_empty')]) })]), ['b:display:bad_operator:error'])
  eq('value missing → incomplete_rule', v([Q('a'), Q('b', 'short_text', { conditional_logic: show([R('a', 'equals', ' ')]) })]), ['b:display:incomplete_rule:error'])
  eq('is_empty needs no value; legal/presence need no value', v([Q('a'), Q('l', 'legal'), Q('f', 'file_upload'), Q('b', 'short_text', { conditional_logic: show([R('a', 'is_empty'), R('l', 'is_not_empty'), R('f', 'is_empty')]) })]), [])
  eq('number value must be numeric', v([Q('n', 'number'), Q('b', 'short_text', { conditional_logic: show([R('n', 'gt', 'abc')]) })]), ['b:display:incomplete_rule:error'])
  eq('date comparison needs a date', v([Q('d', 'date'), Q('b', 'short_text', { conditional_logic: show([R('d', 'gt', 'soon')]) })]), ['b:display:incomplete_rule:error'])
  eq('yes_no value must be Yes/No', v([Q('y', 'yes_no'), Q('b', 'short_text', { conditional_logic: show([R('y', 'equals', 'Maybe')]) })]), ['b:display:missing_choice:error'])
  eq('variable rule with a non-numeric value', v([Q('a', 'short_text', { calculations: [calc('c', 'score', 'add', 1, ANSWERED)] }), Q('b', 'short_text', { conditional_logic: show([V('score', 'gt', '')]) })]), ['b:display:incomplete_rule:error'])
  eq('variable rule with a text operator', v([Q('a', 'short_text', { calculations: [calc('c', 'score', 'add', 1, ANSWERED)] }), Q('b', 'short_text', { conditional_logic: show([V('score', 'contains', '1')]) })]), ['b:display:bad_operator:error'])
  eq('branching on self is allowed; on a later question warns', v([Q('a', 'short_text', { branching: { rules: [br('r', [R('a', 'is_not_empty')], END), br('s', [R('b', 'is_not_empty')], END)] } }), Q('b')]), ['a:branching:later_question:warning:s'])
  eq('variable set on this question counts for branching/calc conditions, not display', v([Q('a', 'short_text', { calculations: [calc('c', 'score', 'add', 1, ANSWERED)], branching: { rules: [br('r', [V('score', 'gt', '0')], END)] }, conditional_logic: show([V('score', 'equals', '0')]) })]), ['a:display:variable_not_set_yet:warning'])
  eq('hide-choices rule: no choices, missing choice, no conditions, self reference', v([Q('c', 'dropdown', { options: ['A'], choice_logic: [{ id: 'r1', logic: 'all', rules: [R('c', 'equals', 'A')], choices: [] }, { id: 'r2', logic: 'all', rules: [], choices: ['Gone'] }] })]),
    ['c:choices:incomplete_rule:error:r1', 'c:choices:self_reference:warning:r1', 'c:choices:missing_choice:error:r2', 'c:choices:no_conditions:error:r2'])
  eq('calculation problems', v([Q('c', 'dropdown', {
    options: ['A'], calculations: [
      calc('k1', 'nope', 'add', 1, ANSWERED),
      calc('k2', '', 'add', 1, ANSWERED),
      calc('k3', 'score', 'pow', 1, ANSWERED),
      calc('k4', 'score', 'add', '', ANSWERED),
      calc('k5', 'score', 'add', 1, { kind: 'choice', choice: 'Gone' }),
      calc('k6', 'score', 'add', 1, { kind: 'choice', choice: '' }),
      calc('k7', 'score', 'add', 1, { kind: 'conditions', logic: 'all', rules: [] }),
      calc('k8', 'score', 'add', 1, null),
      calc('k9', 'score', 'add', 1, { kind: 'conditions', logic: 'all', rules: [R('later', 'is_empty')] }),
    ],
  }), Q('later')]), [
    'c:calculations:missing_variable:error:k1', 'c:calculations:incomplete_rule:error:k2', 'c:calculations:incomplete_rule:error:k3', 'c:calculations:incomplete_rule:error:k4',
    'c:calculations:missing_choice:error:k5', 'c:calculations:incomplete_rule:error:k6', 'c:calculations:no_conditions:error:k7', 'c:calculations:incomplete_rule:error:k8',
    'c:calculations:later_question:warning:k9',
  ])
  eq('useAnswer on a numeric type needs no amount', v([Q('n', 'rating', { calculations: [calc('k', 'score', 'add', '', ANSWERED, { useAnswer: true })] })]), [])
  eq('branch target malformed → incomplete_rule', v([Q('a', 'short_text', { branching: { rules: [br('r', [R('a', 'is_not_empty')], { kind: 'x' })] } })]), ['a:branching:incomplete_rule:error:r'])
  eq('legacy rules: [] → no issues', v([Q('a', 'short_text', { conditional_logic: { condition: 'show', logic: 'all', rules: [] } })]), [])
  let threw = false
  try { E.validateLogic(F([Q('a', 'short_text', { conditional_logic: 'x', choice_logic: 'y', branching: 5, calculations: {} }), Q('b', 'dropdown', { options: 'nope', choice_logic: [null, { rules: 'x' }] })])) } catch { threw = true }
  ok('never throws on garbage', !threw)
}

section('34. countRules / countAllRules / hasAnyLogic')
{
  const q = Q('a', 'dropdown', {
    conditional_logic: show([R('x', 'equals', '1'), R('y', 'equals', '2')]),
    choice_logic: [{ id: '1' }, { id: '2' }],
    branching: { rules: [{ id: 'b' }], otherwise: END },
    calculations: [{ id: 'c' }, { id: 'd' }, { id: 'e' }],
  })
  eq('counts every kind (display counts as 1)', E.countRules(q), 1 + 2 + 1 + 1 + 3)
  eq('otherwise next not counted', E.countRules(Q('a', 'short_text', { branching: { rules: [], otherwise: NEXT } })), 0)
  eq('legacy rules: [] not counted', E.countRules(Q('a', 'short_text', { conditional_logic: { condition: 'show', logic: 'all', rules: [] } })), 0)
  eq('nothing', E.countRules(Q('a')), 0)
  eq('garbage tolerated', E.countRules(Q('a', 'short_text', { conditional_logic: 'x', choice_logic: 'y', branching: { rules: 'z' }, calculations: 5 })), 0)
  const form = F([q, Q('b'), Q('c', 'short_text', { calculations: [{ id: 'z' }] })])
  eq('countAllRules', E.countAllRules(form), 9)
  ok('hasAnyLogic', E.hasAnyLogic(form) && !E.hasAnyLogic(F([Q('a'), Q('b')])))
}

section('35. findReferences')
{
  const qs = [
    Q('src'),
    Q('a', 'short_text', { conditional_logic: show([R('src', 'equals', 'x'), R('src', 'equals', 'y')]) }),
    Q('b', 'dropdown', { options: ['A'], choice_logic: [{ id: 'h', logic: 'all', rules: [R('src', 'is_empty')], choices: ['A'] }, { id: 'h2', logic: 'all', rules: [R('a', 'is_empty')], choices: ['A'] }] }),
    Q('c', 'short_text', { branching: { rules: [br('r1', [R('src', 'is_empty')], END), br('r2', [R('a', 'is_empty')], toQ('target')), br('r3', [R('src', 'is_empty')], toQ('target'))], otherwise: toQ('target') } }),
    Q('d', 'short_text', { calculations: [calc('k', 'score', 'add', 1, { kind: 'conditions', logic: 'all', rules: [R('src', 'is_not_empty')] }), calc('k2', 'score', 'add', 1, ANSWERED)] }),
    Q('target', 'short_text', { conditional_logic: show([R('target', 'is_empty'), { questionId: 'src', variableId: 'score', operator: 'gt', value: '1' }]) }),
  ]
  const form = F(qs, SCORE)
  eq('sources', E.findReferences(form, 'src'), [{ questionId: 'a', section: 'display' }, { questionId: 'b', section: 'choices' }, { questionId: 'c', section: 'branching' }, { questionId: 'c', section: 'branching' }, { questionId: 'd', section: 'calculations' }])
  eq('targets (incl. otherwise), self excluded', E.findReferences(form, 'target'), [{ questionId: 'c', section: 'branching' }, { questionId: 'c', section: 'branching' }, { questionId: 'c', section: 'branching' }])
  eq('none', E.findReferences(form, 'd'), [])
}

section('36. renameChoiceRefs')
{
  const qs = [
    Q('plan', 'multiple_choice', {
      options: ['Basic', 'Pro', 'Team'],
      choice_logic: [{ id: 'h', logic: 'all', rules: [R('other', 'equals', 'Pro')], choices: ['Pro', 'Team'] }],
      calculations: [calc('k', 'score', 'add', 1, { kind: 'choice', choice: 'Pro' }), calc('k2', 'score', 'add', 1, { kind: 'conditions', logic: 'all', rules: [R('plan', 'equals', 'Pro')] })],
      branching: { rules: [br('b', [R('plan', 'equals', 'Pro')], END)] },
    }),
    Q('other', 'short_text', { options: ['Pro'] }),
    Q('dep', 'short_text', {
      conditional_logic: show([R('plan', 'equals', 'Pro'), R('plan', 'equals', 'Basic'), R('other', 'equals', 'Pro'), { questionId: 'plan', variableId: 'score', operator: 'equals', value: 'Pro' }]),
      choice_logic: [{ id: 'x', logic: 'all', rules: [R('plan', 'equals', 'Pro')], choices: ['Pro'] }],
      calculations: [calc('c', 'score', 'add', 1, { kind: 'choice', choice: 'Pro' })],
    }),
    Q('untouched'),
  ]
  const out = E.renameChoiceRefs(qs, 'plan', 'Pro', 'Premium')
  const [plan, other, dep, untouched] = out
  eq('own choice_logic choices renamed; its condition on another question untouched', plan.choice_logic[0], { id: 'h', logic: 'all', rules: [R('other', 'equals', 'Pro')], choices: ['Premium', 'Team'] })
  eq('own calc when.choice renamed', plan.calculations[0].when, { kind: 'choice', choice: 'Premium' })
  eq('own calc conditions renamed', plan.calculations[1].when.rules[0].value, 'Premium')
  eq('own branching condition renamed', plan.branching.rules[0].rules[0].value, 'Premium')
  eq('dependent display: only rules whose source is plan and value is Pro', dep.conditional_logic.rules.map(r => r.value), ['Premium', 'Basic', 'Pro', 'Pro'])
  eq("dependent hide-choice conditions renamed but not its own choices", dep.choice_logic[0], { id: 'x', logic: 'all', rules: [R('plan', 'equals', 'Premium')], choices: ['Pro'] })
  eq("dependent calc when.choice untouched (not the renamed question)", dep.calculations[0].when.choice, 'Pro')
  ok('options are not touched (the builder renames them)', plan.options.join() === 'Basic,Pro,Team')
  ok('unchanged objects reused', other === qs[1] && untouched === qs[3])
  ok('input not mutated', (qs[0]).choice_logic[0].choices[0] === 'Pro' && (qs[2]).conditional_logic.rules[0].value === 'Pro')
  ok("no-op for oldLabel ''", E.renameChoiceRefs(qs, 'plan', '', 'X') === qs)
  ok('no-op for same label', E.renameChoiceRefs(qs, 'plan', 'Pro', 'Pro') === qs)
  const dup = [Q('p', 'dropdown', { options: ['A', 'A', 'B'] }), Q('d', 'short_text', { conditional_logic: show([R('p', 'equals', 'A')]) })]
  ok('no-op for duplicate labels', E.renameChoiceRefs(dup, 'p', 'A', 'Z') === dup)
  ok('no-op when nothing references it', E.renameChoiceRefs(qs, 'plan', 'Nope', 'X') === qs)
  const unfinished = [Q('p', 'dropdown', { options: ['A', ''] }), Q('d', 'short_text', { conditional_logic: show([R('p', 'equals', '')]) })]
  ok("an intermediate '' never captures unfinished rules", E.renameChoiceRefs(unfinished, 'p', '', 'B') === unfinished)
}

section('36a. describeGroup / describeTarget / slugVariableId / variablesInUse')
{
  const qs = [Q('q1', 'short_text', { title: 'Name' }), Q('q2', 'dropdown', { title: 'Plan', options: ['Pro'] }), Q('q3', 'legal', { title: 'Terms' }), Q('q4', 'checkbox', { title: '' }), Q('q5', 'short_text', { title: 'Contact details' })]
  const form = F(qs, [...SCORE, { id: 'price', label: 'Price', initial: 0 }])
  eq('documented example', E.describeGroup({ logic: 'all', rules: [R('q2', 'equals', 'Pro'), V('score', 'gt', '10')] }, form), 'Q2 "Plan" is Pro and Score is more than 10')
  eq('any → or; valueless operators; untitled; deleted', E.describeGroup({ logic: 'any', rules: [R('q3', 'is_not_empty'), R('q4', 'includes', 'A'), R('gone', 'equals', 'x'), R('q1', 'is_empty')] }, form), 'Q3 "Terms" is accepted or Q4 includes A or a deleted question is x or Q1 "Name" is empty')
  eq('deleted variable; missing value', E.describeGroup({ logic: 'all', rules: [V('nope', 'equals', '1'), R('q1', 'equals', '')] }, form), 'a deleted variable is 1 and Q1 "Name" is (no value)')
  eq('empty group', E.describeGroup({ logic: 'all', rules: [] }, form), '')
  eq('targets', [E.describeTarget(NEXT, form, 'q1'), E.describeTarget(undefined, form, 'q1'), E.describeTarget(END, form, 'q1'), E.describeTarget(toQ('q5'), form, 'q1'), E.describeTarget(toQ('gone'), form, 'q1'), E.describeTarget(toQ('q4'), form, 'q1')],
    ['Next question', 'Next question', 'End of form', '5. Contact details', 'a deleted question', '4. Untitled question'])
  eq("'next' from the last question reads End of form", E.describeTarget(NEXT, form, 'q5'), 'End of form')

  eq('slug basic', E.slugVariableId('Total Price', []), 'total_price')
  eq('slug avoids score when taken', E.slugVariableId('Score', ['score']), 'score_2')
  eq('slug next free suffix', E.slugVariableId('Score', ['score', 'score_2']), 'score_3')
  eq('slug must start with a letter', E.slugVariableId('2nd try', []), 'v_2nd_try')
  eq('slug punctuation and accents', E.slugVariableId('  Café — €uros!! ', []), 'cafe_uros')
  eq('slug blank', E.slugVariableId('   ', []), 'var')
  const long = E.slugVariableId('a very long variable name that keeps going', [])
  ok(`slug max 24 (${long})`, long.length <= 24 && /^[a-z][a-z0-9_]{0,23}$/.test(long))
  const longDup = E.slugVariableId('a very long variable name that keeps going', [long])
  ok(`slug suffix stays within 24 (${longDup})`, longDup.length <= 24 && longDup !== long && longDup.endsWith('_2'))
  ok('slugs are valid variable ids', ['Score', '!!!', '9', 'ÀÉÎ', 'x'.repeat(50)].every(l => /^[a-z][a-z0-9_]{0,23}$/.test(E.slugVariableId(l, []))))

  const used = F([Q('a', 'short_text', { calculations: [calc('k', 'price', 'add', 1, ANSWERED), calc('k2', 'ghost', 'add', 1, ANSWERED)] }), Q('b', 'short_text', { conditional_logic: show([V('score', 'gt', '1')]) })], [...SCORE, { id: 'price', label: 'Price', initial: 0 }, { id: 'tax', label: 'Tax', initial: 0 }])
  eq('variablesInUse: referenced by a calculation only', E.variablesInUse(used).map(v => v.id), ['price'])
}

// ════════════════════════════════════════════════════════════════════════════
section('37. summariseLogic')
{
  const qs = [
    Q('q1', 'yes_no', { branching: { rules: [br('b1', [R('q1', 'equals', 'Yes')], toQ('q3'))] } }),
    Q('q2', 'short_text'),
    Q('q3', 'checkbox', { options: ['A', 'B', 'C'], choice_logic: [{ id: 'h', logic: 'all', rules: [R('q1', 'equals', 'No')], choices: ['C'] }] }),
    Q('q4', 'number', { calculations: [calc('k', 'score', 'add', 0, ANSWERED, { useAnswer: true })] }),
    Q('pay', 'payment', { amountCents: 100, conditional_logic: show([R('q1', 'equals', 'Pay')]) }),
  ]
  const form = F(qs, [...SCORE, { id: 'unused', label: 'Unused', initial: 0 }])
  const row = (id, answers) => ({ id, created_at: '2026-10-01T00:00:00Z', answers })
  const r1 = row('r1', E.buildSubmission(form, { q1: 'Yes', q3: ['A'], q4: '5' }).answers)                // q1 → q3 → q4, b1
  const r2 = row('r2', E.buildSubmission(form, { q1: 'No', q2: 'hi', q3: ['A', 'C'], q4: '3' }).answers)  // otherwise, C hidden
  const r3 = row('r3', { q1: 'Maybe', q2: 'x', __logic: { v: 1, path: ['q1', 'q2', 'q3', 'q4'], completed: true, ending: 'default', endedBy: 'last', variables: {}, branches: { q1: 'old-rule' } } })  // removed rule, no variables
  const r4 = row('r4', { q1: 'Yes', q2: 'stale but answered', q3: ['B'], q4: '7' })                        // legacy
  const r5 = row('r5', E.buildSubmission(form, { q1: 'Yes', q4: '0', pay: { status: 'paid', amount_cents: 100 } }).answers)   // offPath payment
  const r6 = row('r6', null)                                                                                // legacy, empty
  const s = E.summariseLogic(form, [r1, r2, r3, r4, r5, r6])
  eq('total / legacy', [s.total, s.legacy], [6, 2])
  eq('q1 seen/answered', s.perQuestion.q1, { seen: 6, seenEstimated: 2, answered: 5, hidden: {} })
  eq('q2: skipped by branch for r1/r5; legacy r4 answered so seen; legacy r6 on its estimated path', s.perQuestion.q2, { seen: 4, seenEstimated: 2, answered: 3, hidden: {} })
  eq('q3: hidden counts', s.perQuestion.q3, { seen: 6, seenEstimated: 2, answered: 3, hidden: { C: 1 } })
  eq('q4', s.perQuestion.q4, { seen: 6, seenEstimated: 2, answered: 4, hidden: {} })
  eq('offPath payment counts as seen and answered', s.perQuestion.pay, { seen: 1, seenEstimated: 0, answered: 1, hidden: {} })
  eq('branches by rule id incl. otherwise and removed', s.branches.q1, [
    { ruleId: 'b1', to: toQ('q3'), count: 3, estimated: 1 },
    { ruleId: 'otherwise', to: NEXT, count: 2, estimated: 1 },
    { ruleId: 'removed', to: null, count: 1, estimated: 0 },
  ])
  eq('only questions with branching', Object.keys(s.branches), ['q1'])
  eq('reach = seen in form order', s.reach, [{ questionId: 'q1', reached: 6 }, { questionId: 'q2', reached: 4 }, { questionId: 'q3', reached: 6 }, { questionId: 'q4', reached: 6 }, { questionId: 'pay', reached: 1 }])
  eq('endings', s.endings, { default: 6 })
  eq('variable stats: in-use only; rows missing it excluded; legacy excluded', Object.keys(s.variables), ['score'])
  eq('score stats', { ...s.variables.score, histogram: undefined }, { count: 3, avg: 2.666667, min: 0, max: 5 })
  eq('score histogram (whole numbers → one bin per value)', s.variables.score.histogram, [
    { from: 0, to: 1, count: 1 }, { from: 1, to: 2, count: 0 }, { from: 2, to: 3, count: 0 }, { from: 3, to: 4, count: 1 }, { from: 4, to: 5, count: 0 }, { from: 5, to: 6, count: 1 },
  ])
  for (const q of form.questions) ok(`answered ≤ seen for ${q.id}`, s.perQuestion[q.id].answered <= s.perQuestion[q.id].seen && s.perQuestion[q.id].seenEstimated <= s.perQuestion[q.id].seen)

  const one = E.summariseLogic(F([Q('a', 'short_text', { calculations: [calc('k', 'score', 'add', 4, ANSWERED)] })], SCORE), [row('x', E.buildSubmission(F([Q('a', 'short_text', { calculations: [calc('k', 'score', 'add', 4, ANSWERED)] })], SCORE), { a: 'y' }).answers), row('y', E.buildSubmission(F([Q('a', 'short_text', { calculations: [calc('k', 'score', 'add', 4, ANSWERED)] })], SCORE), { a: 'z' }).answers)])
  eq('min === max → one bin', one.variables.score.histogram, [{ from: 4, to: 4, count: 2 }])
  const vform = F([Q('a', 'number', { calculations: [calc('k', 'score', 'set', 0, ANSWERED, { useAnswer: true })] })], SCORE)
  const vals = [0, 2.5, 5, 7.5, 10, 100]
  const many = E.summariseLogic(vform, vals.map((x, i) => row(`v${i}`, E.buildSubmission(vform, { a: String(x) }).answers)))
  const h = many.variables.score.histogram
  ok(`≤10 equal-width bins covering every value (${h.length} bins)`, h.length <= 10 && h.reduce((n, b) => n + b.count, 0) === vals.length && h[0].from === 0 && h[h.length - 1].to === 100)
  const wide = E.summariseLogic(vform, Array.from({ length: 50 }, (_, i) => row(`w${i}`, E.buildSubmission(vform, { a: String(i) }).answers)))
  ok('wide whole-number range uses ≤10 bins', wide.variables.score.histogram.length === 10 && wide.variables.score.histogram.reduce((n, b) => n + b.count, 0) === 50)
  const none = E.summariseLogic(vform, [])
  eq('no rows', [none.total, none.legacy, none.variables.score.count, none.reach], [0, 0, 0, [{ questionId: 'a', reached: 0 }]])
  // Legacy row that answered a question the current logic hides.
  const hiddenNow = F([Q('a'), Q('b', 'short_text', { conditional_logic: show([R('a', 'equals', 'never')]) })])
  const lg = E.summariseLogic(hiddenNow, [row('l', { a: 'x', b: 'old answer' })])
  eq('legacy answer to a now-hidden question: seen (estimated) and answered', lg.perQuestion.b, { seen: 1, seenEstimated: 1, answered: 1, hidden: {} })
  // New row with an answer outside its path (hostile/edited) never counts as answered.
  const outside = E.summariseLogic(hiddenNow, [row('n', { a: 'x', b: 'injected', __logic: { v: 1, path: ['a'], variables: {} } })])
  eq('new row: answered only when seen', outside.perQuestion.b, { seen: 0, seenEstimated: 0, answered: 0, hidden: {} })
}

// ════════════════════════════════════════════════════════════════════════════
section('38. conditional-logic.ts: same output as before on legacy fixtures')
{
  const fixtures = [
    { qs: [Q('a'), Q('b')], answers: {} },
    { qs: [Q('a', 'yes_no'), Q('b', 'short_text', { conditional_logic: show([R('a', 'equals', 'Yes')]) }), Q('c')], answers: { a: 'Yes', b: 'x' } },
    { qs: [Q('a', 'yes_no'), Q('b', 'short_text', { conditional_logic: show([R('a', 'equals', 'Yes')]) }), Q('c')], answers: { a: 'No' } },
    { qs: [Q('a'), Q('b', 'short_text', { conditional_logic: hide([R('a', 'contains', 'spam')]) })], answers: { a: 'this is spam' } },
    { qs: [Q('a'), Q('b', 'short_text', { conditional_logic: hide([R('a', 'is_empty')]) })], answers: {} },
    { qs: [Q('a'), Q('b', 'short_text', { conditional_logic: hide([R('a', 'is_empty')]) })], answers: { a: 'x', b: 'y' } },
    { qs: [Q('m', 'checkbox', { options: ['A', 'B'] }), Q('b', 'short_text', { conditional_logic: show([R('m', 'contains', 'B'), R('m', 'equals', 'A')], 'any') })], answers: { m: ['A', 'B'] } },
    { qs: [Q('m', 'checkbox', { options: ['A', 'B'] }), Q('b', 'short_text', { conditional_logic: show([R('m', 'contains', 'B'), R('m', 'equals', 'A')], 'all') })], answers: { m: ['A', 'B'] } },
    { qs: [Q('r', 'rating'), Q('b', 'short_text', { conditional_logic: show([R('r', 'equals', '5')]) })], answers: { r: 5 } },
    { qs: [Q('a'), Q('b', 'short_text', { conditional_logic: { condition: 'show', logic: 'all', rules: [] } })], answers: {} },
    { qs: [Q('a'), Q('b', 'short_text', { conditional_logic: { logic: 'all', rules: [R('a', 'equals', 'x')] } })], answers: { a: 'x' } },
    { qs: [Q('a'), Q('b', 'short_text', { conditional_logic: { condition: 'show', rules: [R('a', 'equals', 'x'), R('a', 'equals', 'y')] } })], answers: { a: 'y' } },
    { qs: [Q('a'), Q('b', 'short_text', { conditional_logic: show([R('a', 'weird', 'x')]) })], answers: {} },
  ]
  for (const [i, f] of fixtures.entries()) {
    const legacy = LEGACY.getVisibleQuestions(f.qs, f.answers)
    const now = CL.getVisibleQuestions(f.qs, f.answers)
    eq(`getVisibleQuestions fixture ${i}`, ids(now), ids(legacy))
    ok(`getVisibleQuestions fixture ${i} returns the same objects`, now.every((q, j) => q === legacy[j]))
    for (const q of f.qs) eq(`shouldShowQuestion fixture ${i} ${q.id}`, CL.shouldShowQuestion(q.id, f.answers, f.qs, (q).conditional_logic), LEGACY.shouldShowQuestion(q.id, f.answers, f.qs, (q).conditional_logic))
  }

  // Fuzz: random legacy forms (rules on EARLIER questions, legacy operators), answers with no
  // stale entries (answers only to questions the old code showed). Values avoid the three
  // documented fixes: no blank answers, no 0/false, no rule value that is a substring of
  // "undefined", and numeric rule values in canonical form.
  const r = rng(20261016)
  const TYPES = ['short_text', 'multiple_choice', 'checkbox', 'rating', 'nps', 'yes_no', 'dropdown']
  const OPTS = ['Red', 'Green', 'Blue', 'Pro plan']
  const answerFor = (t) => {
    switch (t) {
      case 'short_text': return pick(r, ['hello', 'Red', 'Pro plan', 'spam here', 'x', 'Green tea'])
      case 'multiple_choice': case 'dropdown': return pick(r, OPTS)
      case 'checkbox': return pick(r, [['Red'], ['Red', 'Blue'], ['Pro plan'], ['Green', 'Blue', 'Red']])
      case 'rating': return pick(r, [1, 2, 3, 4, 5])
      case 'nps': return pick(r, [1, 5, 7, 9, 10])
      case 'yes_no': return pick(r, ['Yes', 'No'])
    }
  }
  const VALUES = ['Red', 'Green', 'Blue', 'Pro', 'Pro plan', 'Red,Blue', 'spam', 'Yes', 'No', '1', '5', '10', 'x', 'tea']
  let diffs = 0, cases = 0, shouldCases = 0, hiddenCases = 0
  for (let iter = 0; iter < 1500; iter++) {
    const n = 2 + Math.floor(r() * 7)
    const qs = []
    for (let i = 0; i < n; i++) {
      const type = pick(r, TYPES)
      const q = Q(`q${i}`, type, type === 'multiple_choice' || type === 'checkbox' || type === 'dropdown' ? { options: OPTS } : {})
      if (i > 0 && r() < 0.6) {
        const rules = Array.from({ length: 1 + Math.floor(r() * 3) }, () => R(`q${Math.floor(r() * i)}`, pick(r, ['equals', 'contains', 'is_empty']), pick(r, VALUES)))
        q.conditional_logic = { condition: pick(r, ['show', 'hide', undefined]), logic: pick(r, ['all', 'any', undefined]), rules }
      }
      qs.push(q)
    }
    let answers = {}
    for (const q of qs) if (r() < 0.75) answers[q.id] = answerFor(q.type)
    // Drop stale answers until the old code shows every answered question.
    for (;;) {
      const vis = new Set(ids(LEGACY.getVisibleQuestions(qs, answers)))
      const next = Object.fromEntries(Object.entries(answers).filter(([k]) => vis.has(k)))
      if (Object.keys(next).length === Object.keys(answers).length) break
      answers = next
    }
    const a = ids(LEGACY.getVisibleQuestions(qs, answers)), b = ids(CL.getVisibleQuestions(qs, answers))
    cases++
    if (a.length < qs.length) hiddenCases++
    if (JSON.stringify(a) !== JSON.stringify(b)) { diffs++; if (diffs <= 3) console.error('    fuzz diff', JSON.stringify({ qs, answers, legacy: a, now: b })) }
    // shouldShowQuestion sees all answers passed in (rules on any question, incl. later/self).
    const anyAnswers = {}
    for (const q of qs) if (r() < 0.7) anyAnswers[q.id] = answerFor(q.type)
    for (const q of qs) {
      const cl = { condition: pick(r, ['show', 'hide']), logic: pick(r, ['all', 'any']), rules: Array.from({ length: 1 + Math.floor(r() * 3) }, () => R(pick(r, qs).id, pick(r, ['equals', 'contains', 'is_empty']), pick(r, VALUES))) }
      shouldCases++
      if (CL.shouldShowQuestion(q.id, anyAnswers, qs, cl) !== LEGACY.shouldShowQuestion(q.id, anyAnswers, qs, cl)) diffs++
    }
  }
  ok(`fuzz is non-trivial: ${hiddenCases} of ${cases} forms hide at least one question`, hiddenCases > cases / 4)
  eq(`fuzz: ${cases} getVisibleQuestions + ${shouldCases} shouldShowQuestion cases match the old code`, diffs, 0)
}

section('legacy fixes (documented behaviour changes, 1.5)')
{
  // Fix 1: a blank answer never matches equals / contains.
  const qs1 = [Q('a'), Q('b', 'short_text', { conditional_logic: show([R('a', 'equals', 'undefined')]) }), Q('c', 'short_text', { conditional_logic: show([R('a', 'contains', 'fine')]) }), Q('d', 'short_text', { conditional_logic: show([R('a', 'equals', '  ')]) })]
  eq('fix 1: legacy matched the literal text "undefined" / substrings of it / whitespace', ids(LEGACY.getVisibleQuestions(qs1, { d: 'x', a: '  ' })), ['a', 'd'])
  eq('fix 1: legacy (unanswered) matched "undefined" and "fine"', ids(LEGACY.getVisibleQuestions(qs1, {})), ['a', 'b', 'c'])
  eq('fix 1: now blank answers match nothing', ids(CL.getVisibleQuestions(qs1, {})), ['a'])
  eq('fix 1: now whitespace answers match nothing', ids(CL.getVisibleQuestions(qs1, { a: '  ' })), ['a'])
  eq("fix 1: shouldShowQuestion too", [CL.shouldShowQuestion('b', {}, qs1, qs1[1].conditional_logic), LEGACY.shouldShowQuestion('b', {}, qs1, qs1[1].conditional_logic)], [false, true])

  // Fix 2: NPS 0 (and false) count as answered for is_empty.
  const qs2 = [Q('n', 'nps'), Q('b', 'short_text', { conditional_logic: hide([R('n', 'is_empty')]) })]
  eq('fix 2: legacy treated NPS 0 as empty (b hidden)', ids(LEGACY.getVisibleQuestions(qs2, { n: 0 })), ['n'])
  eq('fix 2: now NPS 0 is an answer (b shown)', ids(CL.getVisibleQuestions(qs2, { n: 0 })), ['n', 'b'])
  eq('fix 2: shouldShowQuestion too', CL.shouldShowQuestion('b', { n: 0 }, qs2, qs2[1].conditional_logic), true)

  // Fix 3: rules only see answers on the path before the question.
  const qs3 = [Q('a'), Q('b', 'short_text', { conditional_logic: hide([R('a', 'equals', 'x')]) }), Q('c', 'short_text', { conditional_logic: show([R('b', 'equals', 'y')]) }), Q('d', 'short_text', { conditional_logic: show([R('e', 'equals', 'z')]) }), Q('e')]
  eq('fix 3: legacy saw stale and later answers', ids(LEGACY.getVisibleQuestions(qs3, { a: 'x', b: 'y', e: 'z' })), ['a', 'c', 'd', 'e'])
  eq('fix 3: now stale (b) and later (e) answers are unanswered', ids(CL.getVisibleQuestions(qs3, { a: 'x', b: 'y', e: 'z' })), ['a', 'e'])
  eq('fix 3: shouldShowQuestion keeps evaluating the answers passed in', CL.shouldShowQuestion('d', { e: 'z' }, qs3, qs3[3].conditional_logic), true)

  // Spec 2.3 numeric equals (not one of the three; noted in the report): number-typed
  // questions compare numerically, so "7.0" now equals "7".
  const qs4 = [Q('n', 'number'), Q('b', 'short_text', { conditional_logic: show([R('n', 'equals', '7')]) })]
  eq('numeric equals: legacy compared strings', ids(LEGACY.getVisibleQuestions(qs4, { n: '7.0' })), ['n'])
  eq('numeric equals: now compares numbers', ids(CL.getVisibleQuestions(qs4, { n: '7.0' })), ['n', 'b'])
}

section('conditional-logic.ts: delegation extras')
{
  const qs = [Q('a', 'short_text', { branching: { rules: [br('r', [R('a', 'equals', 'end')], END)] } }), Q('b'), { type: 'short_text', title: 'no id' }]
  eq('getVisibleQuestions honours branching', ids(CL.getVisibleQuestions(qs, { a: 'end' })), ['a'])
  eq('getVisibleQuestions returns re-keyed id-less questions', ids(CL.getVisibleQuestions(qs, {})), ['a', 'b', 'q_index_2'])
  ok('shouldShowQuestion with no logic → true', CL.shouldShowQuestion('zzz', {}, [], undefined))
  ok('shouldShowQuestion uses the logic passed, not the stored one', !CL.shouldShowQuestion('b', {}, [Q('a'), Q('b')], { condition: 'show', logic: 'all', rules: [R('a', 'equals', 'x')] }))
  ok('shouldShowQuestion widened operators', CL.shouldShowQuestion('b', { a: 'y' }, [Q('a'), Q('b')], { condition: 'show', logic: 'all', rules: [R('a', 'not_equals', 'x')] }))
  ok('getVisibleQuestions tolerates null answers', CL.getVisibleQuestions([Q('a')], null).length === 1)
}

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
