// Colvy AI form builder: a short chat that creates or edits a form.
//
// Each turn sends the conversation plus the form as it stands now. The model
// answers in plain words and, when the person asked for a change, returns the
// whole updated form. Existing questions keep their ids so answers already
// collected stay attached to them.

import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-opus-5-5'

// Question types the AI may use. Picture choice, payment, scheduler and
// video/audio need uploads or setup a person has to do, so they're left out.
export const AI_QUESTION_TYPES = [
  'contact_info', 'email', 'phone', 'address', 'website',
  'multiple_choice', 'dropdown', 'yes_no', 'legal', 'checkbox',
  'nps', 'opinion_scale', 'rating', 'ranking', 'matrix',
  'long_text', 'short_text', 'statement',
  'number', 'date', 'signature', 'file_upload',
] as const

export type AiChatTurn = { role: 'user' | 'assistant'; text: string }

export type AiFormQuestion = {
  id: string                 // existing id when editing, '' for a new question
  type: (typeof AI_QUESTION_TYPES)[number]
  title: string
  description: string
  required: boolean
  options: string[]
  multi_select: boolean
  matrix_rows: string[]
  matrix_cols: string[]
}

export type AiFormDraft = {
  title: string
  welcome_message: string
  thank_you_message: string
  questions: AiFormQuestion[]
}

export type AiFormResult =
  | { ok: true; reply: string; form: AiFormDraft | null }
  | { ok: false; error: string }

const strArr = { type: 'array', items: { type: 'string' } }

const SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    update_form: { type: 'boolean' },
    title: { type: 'string' },
    welcome_message: { type: 'string' },
    thank_you_message: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: [...AI_QUESTION_TYPES] },
          title: { type: 'string' },
          description: { type: 'string' },
          required: { type: 'boolean' },
          options: strArr,
          multi_select: { type: 'boolean' },
          matrix_rows: strArr,
          matrix_cols: strArr,
        },
        required: ['id', 'type', 'title', 'description', 'required', 'options', 'multi_select', 'matrix_rows', 'matrix_cols'],
        additionalProperties: false,
      },
    },
  },
  required: ['reply', 'update_form', 'title', 'welcome_message', 'thank_you_message', 'questions'],
  additionalProperties: false,
}

const SYSTEM = `You are Colvy AI, helping a small business owner build a form (survey, enquiry, booking request, feedback, application, waiver, quiz and so on) inside Colvy.

Each turn you get the conversation and the form as it is now. Decide what the person wants:
- A new form, or any change to the current one: set update_form to true and return the COMPLETE form (title, welcome_message, thank_you_message and every question, in order), not just the changed parts.
- A question, idea or anything that doesn't change the form: set update_form to false and return the current form's title, messages and an empty questions array.
If the request is too vague to build something sensible, still build a good first version and say in your reply what you assumed, rather than asking several questions first.

Writing the form:
- Write for the business's customers: warm, plain, short. Australian/British spelling unless the business is clearly elsewhere.
- Questions are short and specific. Use description only when it genuinely helps (a hint or an example); otherwise leave it empty.
- Keep forms as short as the goal allows; 4 to 10 questions is typical. Mark only what's truly needed as required.
- Pick the best type: contact_info (name, email and phone in one step), email, phone, address, website, multiple_choice (options; multi_select true to allow several), dropdown (long option lists), yes_no, checkbox (a single tick, e.g. opt in to updates), legal (accept terms; put the terms text in description), nps (0-10 likelihood to recommend), opinion_scale (1-10), rating (stars), ranking (options to order), matrix (matrix_rows and matrix_cols), short_text, long_text, statement (information only, no answer), number, date, signature, file_upload.
- Fill options only for multiple_choice, dropdown and ranking; matrix_rows/matrix_cols only for matrix. Use empty arrays and multi_select false everywhere else.
- Usually start with what the form is about and put contact details near the end, unless contact details are the point of the form.
- Keep the id of every existing question you keep (even if you reword it). Use "" for new questions. Drop a question by leaving it out.
- welcome_message is one short inviting sentence. thank_you_message is one or two short sentences that say what happens next.

Your reply is shown in the chat: one to three short sentences, no lists and no markdown, saying what you did or answering the question. Never use emojis.`

export async function chatForm(opts: {
  business: { name?: string | null; industry?: string | null }
  current: { title: string; welcome_message: string; thank_you_message: string; questions: any[] }
  messages: AiChatTurn[]
}): Promise<AiFormResult> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: 'Colvy AI isn’t set up on this server yet.' }

  const turns = opts.messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && String(m.text || '').trim())
    .slice(-12)
    .map(m => ({ role: m.role, content: String(m.text).slice(0, 4000) }))
  // The API needs the conversation to start (and end) with the person.
  while (turns.length && turns[0].role !== 'user') turns.shift()
  if (!turns.length || turns[turns.length - 1].role !== 'user') return { ok: false, error: 'Type what you’d like to build.' }

  const current = {
    title: opts.current.title,
    welcome_message: opts.current.welcome_message,
    thank_you_message: opts.current.thank_you_message,
    questions: (opts.current.questions || []).slice(0, 60).map((q: any) => ({
      id: q.id, type: q.type, title: q.title, description: q.description || '', required: !!q.required,
      options: q.options || [], multi_select: !!q.multiSelect, matrix_rows: q.matrixRows || [], matrix_cols: q.matrixCols || [],
    })),
  }
  const context = [
    `BUSINESS\nName: ${opts.business.name || 'unknown'}\nIndustry: ${opts.business.industry || 'unknown'}`,
    `CURRENT FORM\n${JSON.stringify(current)}`,
  ].join('\n\n')
  // Put the business and current form in front of the latest message.
  const last = turns[turns.length - 1]
  last.content = `${context}\n\n---\n\nMESSAGE\n${last.content}`

  try {
    const client = new Anthropic()
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Someone is watching the chat, so keep it quick.
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      // If a safety classifier declines, the API retries on a fallback model
      // within the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: turns,
    })

    if (response.stop_reason === 'refusal') return { ok: false, error: 'Colvy AI can’t help with that one.' }
    if (response.stop_reason === 'max_tokens') return { ok: false, error: 'That form came out too long. Try asking for fewer questions.' }
    const text = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    let p: any
    try { p = JSON.parse(text) } catch { return { ok: false, error: 'Colvy AI returned something unexpected. Please try again.' } }

    const reply = String(p.reply || '').trim() || 'Done.'
    if (!p.update_form || !Array.isArray(p.questions) || !p.questions.length) return { ok: true, reply, form: null }
    const types = new Set<string>(AI_QUESTION_TYPES)
    const questions = (p.questions as any[]).filter(q => q && types.has(q.type) && String(q.title || '').trim()).slice(0, 60)
    if (!questions.length) return { ok: true, reply, form: null }
    return {
      ok: true,
      reply,
      form: {
        title: String(p.title || '').trim() || current.title,
        welcome_message: String(p.welcome_message || '').trim() || current.welcome_message,
        thank_you_message: String(p.thank_you_message || '').trim() || current.thank_you_message,
        questions,
      },
    }
  } catch (e: any) {
    console.error('[ai-form]', e?.message || e)
    return { ok: false, error: 'Colvy AI is busy right now. Please try again in a moment.' }
  }
}
