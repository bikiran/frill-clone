// The AI switchboard: which model does which job, and what each job uses.
//
// Every AI call in Colvy names its JOB (a customer reply, a summary, a
// translation…) instead of hard-coding a model. modelFor(job) returns the
// model the platform super admin picked for it (Platform admin → AI models),
// falling back to the defaults below, which are what each feature used before
// the switchboard existed — so nothing changes until someone changes it.
// trackAi() records the tokens each call used, per business and job, so the
// same page can show where the AI spend goes.
//
// Choices live in platform_settings (key 'ai_models'); usage in ai_usage_log
// (COLVY_V358_AI_USAGE_LOG.sql — not ai_usage, which is V208's rate limit). Without them it quietly uses the defaults
// and skips recording.

import { createClient } from '@supabase/supabase-js'

export type AiJob =
  | 'agent_smart' | 'agent_fast' | 'auto_reply' | 'assistant' | 'reply_draft' | 'keyword_reply'
  | 'knowledge_search' | 'knowledge_answer' | 'unanswered_scan' | 'help_import' | 'form_builder'
  | 'review_reply' | 'review_sentiment' | 'social_reply' | 'social_classify'
  | 'conversation_summary' | 'call_summary' | 'call_transcript' | 'dictation' | 'translate' | 'contact_capture' | 'card_scan'
  | 'phone_agent' | 'feedback_summary'

// modern: the feature sends newer request options (effort, structured output,
// fallbacks), so only Claude 5-generation models are offered for it.
export const AI_JOBS: Record<AiJob, { label: string; group: string; about: string; default: string; modern?: boolean }> = {
  agent_smart: { group: 'Agents', label: 'Agent replies and decisions', about: 'Support, Reception, Sales, Reputation and Operations Agents working a run.', default: process.env.AGENT_MODEL_SMART || 'claude-opus-5-5', modern: true },
  agent_fast: { group: 'Agents', label: 'Agent quick steps', about: 'Learning from edits to agent replies.', default: process.env.AGENT_MODEL_FAST || 'claude-haiku-5-5', modern: true },
  auto_reply: { group: 'Customer replies', label: 'Colvy AI auto-reply', about: 'The older automatic reply on SMS and chat.', default: 'claude-opus-5-5', modern: true },
  assistant: { group: 'Team tools', label: 'In-app assistant', about: 'The Colvy AI assistant your team chats with.', default: 'claude-opus-5-5', modern: true },
  reply_draft: { group: 'Customer replies', label: 'Reply drafts', about: '“Draft a reply” in the inbox and tickets.', default: 'claude-opus-5-5', modern: true },
  keyword_reply: { group: 'Customer replies', label: 'Keyword replies', about: 'Matching customer messages to keyword replies.', default: 'claude-sonnet-5' },
  knowledge_search: { group: 'Knowledge', label: 'Knowledge search', about: 'Understanding the question and picking passages that answer it.', default: process.env.AGENT_MODEL_FAST || 'claude-haiku-5-5', modern: true },
  knowledge_answer: { group: 'Knowledge', label: 'Answers from knowledge', about: '“Test a question” on the AI Knowledge page.', default: 'claude-opus-5-5', modern: true },
  unanswered_scan: { group: 'Knowledge', label: 'Unanswered questions', about: 'Finding questions your knowledge doesn’t cover yet.', default: 'claude-opus-5-5', modern: true },
  help_import: { group: 'Knowledge', label: 'Help centre import', about: 'Turning a website into help articles.', default: 'claude-opus-5-5', modern: true },
  form_builder: { group: 'Team tools', label: 'Form builder', about: 'Building forms, polls and surveys from a description.', default: 'claude-opus-5-5', modern: true },
  review_reply: { group: 'Reviews and social', label: 'Review reply drafts', about: '“Generate AI reply” on Google reviews.', default: 'claude-sonnet-4-6' },
  review_sentiment: { group: 'Reviews and social', label: 'Review sentiment', about: 'Reading how happy a review is.', default: 'claude-haiku-4-5' },
  social_reply: { group: 'Reviews and social', label: 'Comment reply drafts', about: '“Generate AI reply” on Facebook and Instagram comments.', default: 'claude-sonnet-4-6' },
  social_classify: { group: 'Reviews and social', label: 'Comment sorting', about: 'Risk, sentiment and category for new comments.', default: 'claude-sonnet-4-6' },
  conversation_summary: { group: 'Team tools', label: 'Conversation summaries', about: 'The AI summary at the top of a conversation.', default: 'claude-haiku-4-5' },
  phone_agent: { group: 'Calls', label: 'Phone agent', about: 'The AI answering phone calls. A fast model keeps the caller waiting less.', default: process.env.AGENT_MODEL_FAST || 'claude-haiku-5-5', modern: true },
  call_summary: { group: 'Calls', label: 'Quick call summaries', about: 'Short summaries of calls and voice notes.', default: 'claude-haiku-4-5' },
  dictation: { group: 'Team tools', label: 'Voice dictation tidy-up', about: 'Cleaning up dictated text before it’s used.', default: 'claude-haiku-4-5' },
  call_transcript: { group: 'Calls', label: 'Recorded call notes', about: 'Summary, follow-ups, contact details and translation from a recorded call.', default: 'claude-sonnet-4-6' },
  translate: { group: 'Team tools', label: 'Translation', about: 'Translating customer messages.', default: 'claude-haiku-4-5' },
  contact_capture: { group: 'Team tools', label: 'Contact details from messages', about: 'Picking names, emails and phones out of messages.', default: 'claude-sonnet-5' },
  card_scan: { group: 'Team tools', label: 'Business card scan', about: 'Reading business cards and contact photos.', default: 'claude-sonnet-5' },
  // Default set just below: the same model as the unanswered-questions scan, the closest existing job.
  feedback_summary: { group: 'Team tools', label: 'Survey summaries', about: '“Summarise responses” on survey results: themes, sentiment and what to do next.', default: '', modern: true },
}
AI_JOBS.feedback_summary.default = AI_JOBS.unanswered_scan.default

// Models the super admin can pick from. Prices are USD per million tokens
// (input / output) where documented; the rest are filled in on the page.
export const AI_MODELS: { id: string; label: string; modern?: boolean; priceIn?: number; priceOut?: number }[] = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', modern: true, priceIn: 4, priceOut: 20 },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', modern: true, priceIn: 2, priceOut: 10 },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', modern: true, priceIn: 2, priceOut: 10 },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', modern: true },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
]
const KNOWN = new Set(AI_MODELS.map(m => m.id))

export type AiSettings = { models: Partial<Record<AiJob, string>>; prices: Record<string, { in: number; out: number }> }

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

// The settings change rarely; read them at most once a minute per server.
let cache: { at: number; value: AiSettings } | null = null
const TTL_MS = 60_000

export async function getAiSettings(db?: any, fresh = false): Promise<AiSettings> {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache.value
  let value: AiSettings = { models: {}, prices: {} }
  try {
    const { data } = await (db || admin()).from('platform_settings').select('value').eq('key', 'ai_models').maybeSingle()
    if (data?.value) value = { models: data.value.models || {}, prices: data.value.prices || {} }
  } catch {}
  cache = { at: Date.now(), value }
  return value
}

export function clearAiSettingsCache() { cache = null }

/** Models that can do this job (newer-option jobs only get Claude 5-generation models). */
export function modelsForJob(job: AiJob) {
  return AI_MODELS.filter(m => !AI_JOBS[job].modern || m.modern)
}

/** The model for this job: the super admin's pick (if it can do the job), else the default. */
export async function modelFor(job: AiJob, db?: any): Promise<string> {
  const picked = (await getAiSettings(db)).models[job]
  return picked && modelsForJob(job).some(m => m.id === picked) ? picked : AI_JOBS[job].default
}

/** The job's model first, then fallbacks (for features that retry on another model). */
export async function modelChain(job: AiJob, fallbacks: string[], db?: any): Promise<string[]> {
  return Array.from(new Set([await modelFor(job, db), ...fallbacks]))
}

/**
 * Record what one AI call used. Takes the API response (SDK or raw JSON);
 * never throws and never slows the caller down meaningfully.
 */
export async function trackAi(job: AiJob, companyId: string | null | undefined, response: any, db?: any): Promise<void> {
  try {
    const u = response?.usage || {}
    const tokensIn = Number(u.input_tokens || 0) + Number(u.cache_read_input_tokens || 0) + Number(u.cache_creation_input_tokens || 0)
    const tokensOut = Number(u.output_tokens || 0)
    if (!tokensIn && !tokensOut) return
    await (db || admin()).from('ai_usage_log').insert({ company_id: companyId || null, job, model: String(response?.model || AI_JOBS[job].default), tokens_in: tokensIn, tokens_out: tokensOut }).then(() => {}, () => {})
  } catch {}
}

/** Estimated USD for some tokens on a model, or null when its price isn't known. */
export function estimateCost(model: string, tokensIn: number, tokensOut: number, prices: AiSettings['prices'] = {}): number | null {
  // A dated id ("claude-haiku-4-5-20251001") costs the same as its alias.
  const id = KNOWN.has(model) ? model : (AI_MODELS.find(m => model.startsWith(m.id))?.id || model)
  const p = prices[id] || (() => { const m = AI_MODELS.find(x => x.id === id); return m?.priceIn != null ? { in: m.priceIn, out: m.priceOut! } : null })()
  if (!p) return null
  return (tokensIn * p.in + tokensOut * p.out) / 1_000_000
}
