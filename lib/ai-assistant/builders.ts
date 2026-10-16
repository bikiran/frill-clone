// Forms, polls and surveys for Colvy AI and Colvy MCP (server only).
//
// Create them from a description ("make a feedback form for our new aquascaping
// service"), list them, and read their results. Created rows match exactly
// what the admin pages create, so they open and edit there as normal.

import type { AssistantContext } from '@/lib/ai-assistant/tools'
import { logAiEvent } from '@/lib/ai-assistant/audit'
import { AI_QUESTION_TYPES } from '@/lib/ai-form'
import { companyLimit } from '@/lib/plan'
import { answerToPlainText, formatVariable, readFormLogic, readResponseLogic, stripReservedAnswers } from '@/lib/form-logic'
import { choiceAnswerText, isExclusiveLabel, isOtherLabel, otherChoiceLabel, otherTextOf } from '@/lib/form-choice-options'

// A payment answer is whatever the browser inserted, so its amount_cents can be
// forged. Never print an amount from it: say "Payment (unverified)" instead.
// Payment-shaped values nested at any depth (inside a matrix or list) are dropped.
const UNVERIFIED_PAYMENT = 'Payment (unverified)'
const paymentShaped = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v) && ('amount_cents' in v || 'payment_id' in v)
const withoutPayments = (v: any, depth = 0): any =>
  depth > 4 ? undefined : !v || typeof v !== 'object' ? v
    : Array.isArray(v) ? v.filter(x => !paymentShaped(x)).map(x => withoutPayments(x, depth + 1))
    : Object.fromEntries(Object.entries(v).filter(([, x]) => !paymentShaped(x)).map(([k, x]) => [k, withoutPayments(x, depth + 1)]))
function answerText(v: any, q?: any): string {
  if (v === undefined || v === null) return ''
  if (q?.type === 'payment' || paymentShaped(v)) return typeof v === 'object' || String(v).trim() ? UNVERIFIED_PAYMENT : ''
  return answerToPlainText(withoutPayments(v), q)
}

// Question types that keep a list of options. (lib/form-logic exports its own
// CHOICE_TYPES, which also counts picture_choice; the AI can't create those.)
const CHOICE_TYPES = ['multiple_choice', 'dropdown', 'checkbox', 'ranking']
// Types that can have the built-in "Other" text box.
const OTHER_TYPES = ['multiple_choice', 'dropdown', 'checkbox']
const SURVEY_TYPES = ['nps', 'csat', 'open_feedback'] as const

export const BUILDER_TOOLS = [
  {
    name: 'create_form', safety: 'immediate' as const,
    description: 'Create a form (signup, enquiry, order, feedback, booking request, quiz…) and get its public link. Write the questions yourself from what the user wants. Use for anything with more than one question. Reversible.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        intro: { type: 'string', description: 'welcome text shown before the first question' },
        thankYou: { type: 'string', description: 'message shown after submitting' },
        questions: {
          type: 'array', minItems: 1, maxItems: 40,
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: [...AI_QUESTION_TYPES], description: 'contact_info asks name/email/phone together; statement is text with no answer' },
              title: { type: 'string' },
              description: { type: 'string' },
              required: { type: 'boolean' },
              options: { type: 'array', items: { type: 'string' }, description: 'for multiple_choice, dropdown, checkbox (tick boxes), ranking' },
              multiSelect: { type: 'boolean', description: 'multiple_choice: allow several answers' },
              otherOption: { type: 'boolean', description: 'multiple_choice, dropdown, checkbox: the last option is "Other" and picking it shows a "Type your answer" box (adds the option if missing)' },
              exclusiveOptions: { type: 'array', items: { type: 'string' }, description: 'multi-select only: option labels like "None of these" or "No" that clear the other ticks when picked' },
              rows: { type: 'array', items: { type: 'string' }, description: 'matrix rows' },
              columns: { type: 'array', items: { type: 'string' }, description: 'matrix columns' },
            },
            required: ['type', 'title'],
          },
        },
        publish: { type: 'boolean', description: 'default true: the link works straight away. false keeps it as a draft.' },
      },
      required: ['title', 'questions'],
    },
  },
  {
    name: 'create_poll', safety: 'immediate' as const,
    description: 'Create a one-question poll with 2 to 10 answers and get its public link to share. Reversible.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        options: { type: 'array', minItems: 2, maxItems: 10, items: { type: 'string' } },
        description: { type: 'string' },
      },
      required: ['question', 'options'],
    },
  },
  {
    name: 'create_survey', safety: 'immediate' as const,
    description: 'Create a quick survey and get its public link: nps ("How likely are you to recommend us?", 0 to 10), csat (rate your experience, 0 to 10) or open_feedback (a comment box). For several questions, use create_form instead. Reversible.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        type: { type: 'string', enum: [...SURVEY_TYPES] },
        question: { type: 'string', description: 'defaults to the standard question for the type' },
      },
      required: ['title', 'type'],
    },
  },
  {
    name: 'list_forms', safety: 'read' as const,
    description: "The business's forms, polls and surveys with their public links, whether they're live, and how many responses each has.",
    input_schema: { type: 'object', properties: { kind: { type: 'string', enum: ['all', 'forms', 'polls', 'surveys'] } } },
  },
  {
    name: 'get_form_results', safety: 'read' as const,
    description: 'Results for one form, poll or survey: vote counts, NPS/average score and comments, or the latest form responses with answers.',
    input_schema: { type: 'object', properties: { kind: { type: 'string', enum: ['form', 'poll', 'survey'] }, id: { type: 'string' }, limit: { type: 'number', description: 'form responses to return, default 20, max 100' } }, required: ['kind', 'id'] },
  },
]

export const BUILDER_TOOL_NAMES = new Set(BUILDER_TOOLS.map(t => t.name))

const base = (ctx: AssistantContext) => (ctx.siteOrigin || process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').replace(/\/$/, '')
const clean = (v: any, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const list = (v: any, maxItems: number, maxLen = 200) => (Array.isArray(v) ? v : []).map(x => clean(x, maxLen)).filter(Boolean).slice(0, maxItems)
const isId = (v: any) => /^[0-9a-f-]{36}$/i.test(String(v || ''))
const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)

/** Turn the tool's questions into the shape the form editor stores. */
export function toFormQuestions(input: any[]): { questions: any[]; error?: string } {
  const allowed = new Set<string>(AI_QUESTION_TYPES)
  const out: any[] = []
  for (const q of (Array.isArray(input) ? input : []).slice(0, 40)) {
    const type = String(q?.type || '')
    const title = clean(q?.title, 300)
    if (!allowed.has(type)) return { questions: [], error: `"${type || 'blank'}" isn't a question type Colvy forms support.` }
    if (!title) return { questions: [], error: 'Every question needs a title.' }
    const row: any = { id: newId(), type, title, description: clean(q?.description, 500), required: type === 'statement' ? false : q?.required === true }
    if (CHOICE_TYPES.includes(type)) {
      const given = Array.from(new Set(list(q?.options, 30)))
      // A checkbox can be a single tick box (an opt-in); other choice types need two options.
      const options = given.length >= (type === 'checkbox' ? 1 : 2) ? given : ['Option 1', 'Option 2']
      if (type === 'multiple_choice') row.multiSelect = q?.multiSelect === true
      if (OTHER_TYPES.includes(type)) {
        if (q?.otherOption === true && !options.some(isOtherLabel)) options.push('Other')
        if (options.some(isOtherLabel)) row.otherOption = true
      }
      if (type === 'checkbox' || row.multiSelect) {
        const marked = list(q?.exclusiveOptions, 30).filter(l => options.includes(l))
        const exclusive = Array.from(new Set([...marked, ...options.filter(l => isExclusiveLabel(l))]))
        if (exclusive.length) row.exclusiveChoices = exclusive
      }
      row.options = options
    }
    if (type === 'matrix') {
      const rows = list(q?.rows, 20), cols = list(q?.columns, 10)
      row.matrixRows = rows.length ? rows : ['Row 1', 'Row 2']
      row.matrixCols = cols.length ? cols : ['Poor', 'OK', 'Great']
    }
    out.push(row)
  }
  if (!out.length) return { questions: [], error: 'A form needs at least one question.' }
  return { questions: out }
}

/** Under the plan's cap for polls/surveys? Forms aren't capped. */
async function underLimit(db: any, ctx: AssistantContext, table: 'polls' | 'surveys'): Promise<string | null> {
  const limit = await companyLimit(db, ctx.companyId, table)
  if (limit === undefined || limit === null || limit === Infinity) return null
  const n = Number(limit)
  if (!Number.isFinite(n)) return null
  if (n <= 0) return `${table === 'polls' ? 'Polls' : 'Surveys'} aren't included in this plan. Upgrade in Colvy under Billing to use them.`
  const { count } = await db.from(table).select('id', { count: 'exact', head: true }).eq('company_id', ctx.companyId)
  if ((count || 0) >= n) return `This plan includes ${n} ${table === 'polls' ? (n === 1 ? 'poll' : 'polls') : (n === 1 ? 'survey' : 'surveys')}. Delete one or upgrade in Colvy under Billing.`
  return null
}

// Insert, dropping optional columns an older database doesn't have yet.
async function insertRow(db: any, table: string, row: any, optional: string[]): Promise<{ id?: string; error?: string }> {
  let cur = { ...row }
  for (let i = 0; i < 5; i++) {
    const { data, error } = await db.from(table).insert(cur).select('id').maybeSingle()
    if (!error) return { id: data?.id }
    const m = /column "?([a-z_]+)"? .* does not exist/i.exec(error.message || '') || /Could not find the '([a-z_]+)' column/i.exec(error.message || '')
    if (m && optional.includes(m[1]) && m[1] in cur) { const c = { ...cur }; delete c[m[1]]; cur = c; continue }
    return { error: error.message }
  }
  return { error: 'Could not save it.' }
}

type Result = { ok: boolean; error?: string; entityType?: string; entityId?: string; card?: any; undo?: any; link?: string }

export async function runBuilderAction(db: any, ctx: AssistantContext, name: string, args: any): Promise<Result> {
  if (name === 'create_form') {
    const title = clean(args?.title, 140)
    if (!title) return { ok: false, error: 'A form needs a title.' }
    const { questions, error } = toFormQuestions(args?.questions)
    if (error) return { ok: false, error }
    const publish = args?.publish !== false
    const row: any = {
      company_id: ctx.companyId, title, questions,
      theme: { color: '#ff7a6b', background: '#ffffff' },
      welcome_message: clean(args?.intro, 500) || 'Welcome! This will only take a minute.',
      thank_you_message: clean(args?.thankYou, 500) || 'Thanks for completing this form!',
      is_published: publish, show_confetti: true,
    }
    const ins = await insertRow(db, 'forms', row, ['show_confetti'])
    if (!ins.id) return { ok: false, error: ins.error || 'Could not create the form.' }
    const link = `${base(ctx)}/forms/${ins.id}`
    await logAiEvent(db, { companyId: ctx.companyId, userId: ctx.userId, action: 'Created form', tool: name, entityType: 'form', entityId: ins.id, input: { title, questions: questions.length, publish }, result: { link } })
    return {
      ok: true, entityType: 'form', entityId: ins.id, link,
      card: { kind: 'form', title: `Form created: ${title}`, lines: [`${questions.length} question${questions.length === 1 ? '' : 's'} · ${publish ? 'live' : 'draft, publish it in Colvy'}`, publish ? link : null].filter(Boolean), href: `/admin/forms/${ins.id}`, link: publish ? link : null },
      undo: { entityType: 'form', entityId: ins.id },
    }
  }

  if (name === 'create_poll') {
    const question = clean(args?.question, 300)
    const options = Array.from(new Set(list(args?.options, 10, 120)))
    if (!question) return { ok: false, error: 'A poll needs a question.' }
    if (options.length < 2) return { ok: false, error: 'A poll needs at least 2 different answers.' }
    const cap = await underLimit(db, ctx, 'polls')
    if (cap) return { ok: false, error: cap }
    // Plain strings: what the public poll page and vote counts key on.
    const ins = await insertRow(db, 'polls', {
      company_id: ctx.companyId, question, options, description: clean(args?.description, 500) || null,
      is_active: true, poll_type: 'single_choice', status: 'active',
    }, ['description', 'poll_type', 'status'])
    if (!ins.id) return { ok: false, error: ins.error || 'Could not create the poll.' }
    const link = `${base(ctx)}/polls/${ins.id}`
    await logAiEvent(db, { companyId: ctx.companyId, userId: ctx.userId, action: 'Created poll', tool: name, entityType: 'poll', entityId: ins.id, input: { question, options }, result: { link } })
    return {
      ok: true, entityType: 'poll', entityId: ins.id, link,
      card: { kind: 'poll', title: `Poll created: ${question}`, lines: [options.join(' · '), link], href: `/admin/polls/${ins.id}`, link },
      undo: { entityType: 'poll', entityId: ins.id },
    }
  }

  if (name === 'create_survey') {
    const title = clean(args?.title, 140)
    const type = SURVEY_TYPES.includes(args?.type) ? args.type : 'nps'
    if (!title) return { ok: false, error: 'A survey needs a title.' }
    const cap = await underLimit(db, ctx, 'surveys')
    if (cap) return { ok: false, error: cap }
    const question = clean(args?.question, 300) || (type === 'nps' ? 'How likely are you to recommend us?' : type === 'csat' ? 'How would you rate your experience?' : 'What could we do better?')
    const ins = await insertRow(db, 'surveys', { company_id: ctx.companyId, title, type, question, is_active: true, status: 'active' }, ['status'])
    if (!ins.id) return { ok: false, error: ins.error || 'Could not create the survey.' }
    const link = `${base(ctx)}/surveys/${ins.id}`
    await logAiEvent(db, { companyId: ctx.companyId, userId: ctx.userId, action: 'Created survey', tool: name, entityType: 'survey', entityId: ins.id, input: { title, type, question }, result: { link } })
    return {
      ok: true, entityType: 'survey', entityId: ins.id, link,
      card: { kind: 'survey', title: `Survey created: ${title}`, lines: [`${type === 'nps' ? 'NPS' : type === 'csat' ? 'Satisfaction' : 'Open feedback'} · ${question}`, link], href: `/admin/surveys/${ins.id}`, link },
      undo: { entityType: 'survey', entityId: ins.id },
    }
  }

  return { ok: false, error: `Unknown tool: ${name}` }
}

const optText = (o: any) => typeof o === 'string' ? o : clean(o?.text, 200)
const parseOptions = (v: any): string[] => {
  let o = v
  if (typeof o === 'string') { try { o = JSON.parse(o) } catch { o = [] } }
  return (Array.isArray(o) ? o : []).map(optText).filter(Boolean)
}
const count = async (db: any, table: string, col: string, id: string) => {
  const { count: n } = await db.from(table).select('id', { count: 'exact', head: true }).eq(col, id)
  return n || 0
}

export async function runBuilderRead(db: any, ctx: AssistantContext, name: string, args: any): Promise<any> {
  if (name === 'list_forms') {
    const kind = ['forms', 'polls', 'surveys'].includes(args?.kind) ? args.kind : 'all'
    const out: any = {}
    if (kind === 'all' || kind === 'forms') {
      const { data } = await db.from('forms').select('id, title, is_published, created_at').eq('company_id', ctx.companyId).order('created_at', { ascending: false }).limit(50)
      out.forms = await Promise.all((data || []).map(async (f: any) => ({ id: f.id, title: f.title, live: !!f.is_published, responses: await count(db, 'form_responses', 'form_id', f.id), link: `${base(ctx)}/forms/${f.id}` })))
    }
    if (kind === 'all' || kind === 'polls') {
      const { data } = await db.from('polls').select('id, question, options, is_active, created_at').eq('company_id', ctx.companyId).order('created_at', { ascending: false }).limit(50)
      out.polls = await Promise.all((data || []).map(async (p: any) => ({ id: p.id, question: p.question, options: parseOptions(p.options), live: p.is_active !== false, votes: await count(db, 'poll_votes', 'poll_id', p.id), link: `${base(ctx)}/polls/${p.id}` })))
    }
    if (kind === 'all' || kind === 'surveys') {
      const { data } = await db.from('surveys').select('id, title, type, question, is_active, created_at').eq('company_id', ctx.companyId).order('created_at', { ascending: false }).limit(50)
      out.surveys = await Promise.all((data || []).map(async (s: any) => ({ id: s.id, title: s.title, type: s.type, question: s.question, live: s.is_active !== false, responses: await count(db, 'survey_responses', 'survey_id', s.id), link: `${base(ctx)}/surveys/${s.id}` })))
    }
    return out
  }

  if (name === 'get_form_results') {
    const id = String(args?.id || '')
    if (!isId(id)) return { error: 'Give an id from list_forms.' }

    if (args?.kind === 'poll') {
      const { data: p } = await db.from('polls').select('id, question, options').eq('company_id', ctx.companyId).eq('id', id).maybeSingle()
      if (!p) return { error: 'Poll not found.' }
      const options = parseOptions(p.options)
      const { data: votes } = await db.from('poll_votes').select('*').eq('poll_id', id).limit(10000)
      const tally: Record<string, number> = Object.fromEntries(options.map(o => [o, 0]))
      for (const v of votes || []) {
        const key = typeof v.option === 'string' ? v.option : (Number.isInteger(v.option_index) ? options[v.option_index] : null)
        if (key) tally[key] = (tally[key] || 0) + 1
      }
      const total = Object.values(tally).reduce((a, b) => a + b, 0)
      return { question: p.question, total_votes: total, results: Object.entries(tally).map(([option, n]) => ({ option, votes: n, percent: total ? Math.round((n / total) * 100) : 0 })), link: `${base(ctx)}/polls/${id}` }
    }

    if (args?.kind === 'survey') {
      const { data: s } = await db.from('surveys').select('id, title, type, question').eq('company_id', ctx.companyId).eq('id', id).maybeSingle()
      if (!s) return { error: 'Survey not found.' }
      const { data: rows } = await db.from('survey_responses').select('*').eq('survey_id', id).order('created_at', { ascending: false }).limit(2000)
      const scores = (rows || []).map((r: any) => parseInt(r.answer ?? r.score)).filter((n: number) => !isNaN(n))
      const avg = scores.length ? Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10 : null
      const nps = s.type === 'nps' && scores.length
        ? Math.round(((scores.filter((n: number) => n >= 9).length - scores.filter((n: number) => n <= 6).length) / scores.length) * 100)
        : null
      const comments = (rows || []).map((r: any) => ({ score: r.answer ?? r.score ?? null, comment: clean(r.comment ?? r.response_text, 1000), at: r.created_at })).filter((c: any) => c.comment).slice(0, 30)
      return { title: s.title, type: s.type, question: s.question, responses: (rows || []).length, average_score: avg, ...(nps !== null ? { nps } : {}), latest_comments: comments, link: `${base(ctx)}/surveys/${id}` }
    }

    const { data: f } = await db.from('forms').select('id, title, questions, theme, is_published').eq('company_id', ctx.companyId).eq('id', id).maybeSingle()
    if (!f) return { error: 'Form not found.' }
    const qs: any[] = (Array.isArray(f.questions) ? f.questions : []).filter((q: any) => q && typeof q === 'object')
    const byId: Record<string, any> = Object.fromEntries(qs.map(q => [q.id, q]))
    const varLabels: Record<string, string> = Object.fromEntries(readFormLogic(f).variables.map(v => [v.id, v.label || v.id]))
    const limit = Math.min(Math.max(Number(args?.limit) || 20, 1), 100)
    const [{ data: rows }, total] = await Promise.all([
      db.from('form_responses').select('answers, created_at').eq('form_id', id).order('created_at', { ascending: false }).limit(limit),
      count(db, 'form_responses', 'form_id', id),
    ])
    // Plain text, never JSON or a data: URL. Reserved keys (__logic, __other)
    // are not answers; the typed "Other" text is folded into its answer; a
    // payment never shows its (unverifiable) amount.
    const show = (raw: any, k: string, v: any): string => {
      const q = byId[k]
      const plain = typeof v === 'string' || (Array.isArray(v) && v.every(x => typeof x === 'string'))
      const text = q && plain && otherChoiceLabel(q) ? choiceAnswerText(q, v, otherTextOf(raw, k)) : answerText(v, q)
      return (text || (q?.type === 'signature' && v ? 'Signed' : '')).slice(0, 1000)
    }
    return {
      title: f.title, live: !!f.is_published, total_responses: total, link: `${base(ctx)}/forms/${id}`,
      responses: (rows || []).map((r: any) => {
        const answers: Record<string, string> = {}
        for (const [k, v] of Object.entries(stripReservedAnswers(r.answers))) {
          const text = show(r.answers, k, v)
          if (text) answers[byId[k]?.title || k] = text
        }
        const vars = readResponseLogic(r.answers)?.variables || {}
        const variables = Object.fromEntries(Object.entries(vars).map(([k, n]) => [varLabels[k] || k, formatVariable(n)]))
        return { at: r.created_at, answers, ...(Object.keys(variables).length ? { variables } : {}) }
      }),
    }
  }

  return { error: `Unknown tool: ${name}` }
}
