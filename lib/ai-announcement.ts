// Colvy AI for announcements: write a post from a few words, tidy one up, or
// turn one into an SMS or a social post. Runs on the 'announcement_writer'
// job of the AI switchboard (lib/ai-models.ts). It only ever returns a draft:
// the team member reads it and chooses to use it, so nothing reaches a
// customer without a person approving it. Server-only.

import Anthropic from '@anthropic-ai/sdk'
import { modelFor, trackAi } from '@/lib/ai-models'
import { htmlToText, sanitizeHtml } from '@/lib/safe-html'
import { CATEGORIES, type CategoryKey } from '@/lib/announcements'

export type AiAnnMode = 'write' | 'improve' | 'sms' | 'social'
export type AiAnnResult =
  | { ok: true; mode: AiAnnMode; title?: string; html?: string; category?: CategoryKey; sms?: string; facebook?: string; instagram?: string; note?: string; model?: string }
  | { ok: false; error: string }

const SYSTEM = `You write announcements for a small Australian business: their customers read them on the business's updates page, in the chat widget on its website, by email and by SMS.

Rules:
- Plain Australian English (colour, organise, centre). Warm, clear and short. No hype words like "revolutionary" or "game-changer".
- Never use emoji or emoticons.
- Never invent facts: no prices, dates, times, discounts, product names or addresses the person didn't give you. If something important is missing, leave a clearly marked gap like [date] and say so in "note".
- Write for customers, not staff.
- HTML may only use <p>, <h3>, <ul>, <li>, <strong> and <em>. No links, images, inline styles or headings other than h3.
- An SMS is one or two sentences, under 260 characters before the link. Put the exact token {{link}} where the link goes and end with "Reply STOP to unsubscribe."
- A social post (Facebook, Instagram) is two to four short sentences. Instagram may end with up to five relevant hashtags. Facebook may include {{link}}.`

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    html: { type: 'string' },
    category: { type: 'string', enum: CATEGORIES.map(c => c.key) },
    sms: { type: 'string' },
    facebook: { type: 'string' },
    instagram: { type: 'string' },
    note: { type: 'string' },
  },
  required: ['title', 'html', 'category', 'sms', 'facebook', 'instagram', 'note'],
  additionalProperties: false,
}

const NO_EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu
const clean = (s: any, n: number) => String(s ?? '').replace(NO_EMOJI, '').trim().slice(0, n)

export function buildPrompt(mode: AiAnnMode, input: { brief?: string; title?: string; body?: string; category?: string; business: { name?: string | null; industry?: string | null } }): string {
  const current = [input.title ? `Title: ${input.title}` : '', input.body ? `Body:\n${htmlToText(input.body).slice(0, 6000)}` : ''].filter(Boolean).join('\n')
  const task = {
    write: `Write a new announcement from the brief. Fill "title", "html" and "category". Leave "sms", "facebook" and "instagram" empty.`,
    improve: `Rewrite the current announcement so it's clearer and easier to read, keeping every fact. Fill "title", "html" and "category". Leave "sms", "facebook" and "instagram" empty.`,
    sms: `Turn the current announcement into one SMS for customers who opted in. Fill "sms" only; leave the others empty.`,
    social: `Turn the current announcement into a Facebook post and an Instagram caption. Fill "facebook" and "instagram"; leave the others empty.`,
  }[mode]
  return [
    `BUSINESS\nName: ${input.business.name || 'unknown'}\nIndustry: ${input.business.industry || 'unknown'}`,
    input.category ? `CATEGORY CHOSEN: ${input.category}` : '',
    current ? `CURRENT ANNOUNCEMENT\n${current}` : '',
    input.brief ? `BRIEF FROM THE TEAM\n${String(input.brief).slice(0, 2000)}` : '',
    `TASK\n${task}`,
  ].filter(Boolean).join('\n\n')
}

export async function runAnnouncementAi(mode: AiAnnMode, input: Parameters<typeof buildPrompt>[1], companyId: string, db?: any): Promise<AiAnnResult> {
  if (mode === 'write' && !String(input.brief || '').trim()) return { ok: false, error: 'Tell Colvy AI what the announcement is about.' }
  if (mode !== 'write' && !String(input.title || '').trim() && !htmlToText(input.body || '').trim()) return { ok: false, error: 'Write something first, then ask Colvy AI.' }
  try {
    const client = new Anthropic()
    const model = await modelFor('announcement_writer', db)
    const response = await client.beta.messages.create({
      model,
      max_tokens: 3000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: buildPrompt(mode, input) }],
    } as any)
    await trackAi('announcement_writer', companyId, response, db)
    if ((response as any).stop_reason === 'refusal') return { ok: false, error: 'Colvy AI can’t help with that one.' }
    const text = (response as any).content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    let p: any
    try { p = JSON.parse(text) } catch { return { ok: false, error: 'Colvy AI returned something unexpected. Please try again.' } }
    return parseAiResult(mode, p, (response as any).model || model)
  } catch (e: any) {
    console.error('[ai-announcement]', e?.message || e)
    return { ok: false, error: 'Colvy AI is busy right now. Please try again in a moment.' }
  }
}

/** Shape and clean what the model returned (exported for tests). */
export function parseAiResult(mode: AiAnnMode, p: any, model?: string): AiAnnResult {
  const note = clean(p?.note, 400) || undefined
  if (mode === 'sms') {
    const sms = clean(p?.sms, 400)
    if (!sms) return { ok: false, error: 'Colvy AI didn’t write an SMS. Please try again.' }
    return { ok: true, mode, sms, note, model }
  }
  if (mode === 'social') {
    const facebook = clean(p?.facebook, 1500), instagram = clean(p?.instagram, 1500)
    if (!facebook && !instagram) return { ok: false, error: 'Colvy AI didn’t write a post. Please try again.' }
    return { ok: true, mode, facebook, instagram, note, model }
  }
  const html = sanitizeHtml(String(p?.html || '').replace(NO_EMOJI, '')).slice(0, 20000)
  const title = clean(p?.title, 200)
  if (!title && !htmlToText(html)) return { ok: false, error: 'Colvy AI didn’t write anything. Please try again.' }
  const category = CATEGORIES.some(c => c.key === p?.category) ? p.category as CategoryKey : undefined
  return { ok: true, mode, title, html, category, note, model }
}
