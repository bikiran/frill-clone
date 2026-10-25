// A call transcript in three forms, server only: the spoken language in its
// own script (Nepali in Devanagari), the same words in Roman letters the way
// people type them on a phone ("ma bholi aauchu, order ready cha?"), and an
// English translation. Line by line, so each speaker's turn reads the same
// way in all three.
//
// Speech recognition gives us one form, sometimes with mistakes, and with
// English words that were spoken in English sometimes spelled in Devanagari.
// Claude reads the whole call (so a word is understood in context), fixes
// only what it's sure of, and returns the three forms. Names, numbers,
// prices and dates are kept exactly. Returns null on any failure: the caller
// keeps the plain transcript.

import { modelChain, trackAi } from '@/lib/ai-models'
import { languageName } from '@/lib/call-languages'

export type Turn = { speaker: string; text: string; start?: number }
export type TranslatedTurn = Turn & { roman: string; en: string }
export type Translated = { lang: string; mixed: boolean; segments: TranslatedTurn[]; original: string; roman: string; en: string }

const CHUNK_CHARS = 5000

async function timed(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...init, signal: ctrl.signal }) } finally { clearTimeout(t) }
}

/** Turns in groups of about CHUNK_CHARS, so a long call is translated in parts. */
export function chunkTurns(turns: Turn[]): Turn[][] {
  const out: Turn[][] = []
  let cur: Turn[] = [], size = 0
  for (const t of turns) {
    if (cur.length && size + t.text.length > CHUNK_CHARS) { out.push(cur); cur = []; size = 0 }
    cur.push(t); size += t.text.length
  }
  if (cur.length) out.push(cur)
  return out
}

/** Plain text with no speaker labels → sentence-sized turns. */
export function turnsFromText(text: string): Turn[] {
  const parts = String(text || '').split(/\n+|(?<=[.!?।])\s+/).map(s => s.trim()).filter(Boolean)
  const turns: Turn[] = []
  for (const p of parts) {
    const last = turns[turns.length - 1]
    if (last && last.text.length + p.length < 240) last.text += ` ${p}`
    else turns.push({ speaker: '', text: p })
  }
  return turns
}

function prompt(turns: Turn[], ctx: { business: string; languages: string[]; context?: string }) {
  const langs = ctx.languages.length ? ctx.languages.map(languageName).join(', ') : 'any language'
  const lines = turns.map((t, i) => `${i}\t${t.speaker || '-'}\t${t.text.replace(/\s+/g, ' ')}`).join('\n')
  return `This is part of a recorded phone call at ${ctx.business || 'a business'}, written down by speech recognition. People on the call may speak English or ${langs}, often mixing English words into the same sentence. Speech recognition makes mistakes, and sometimes writes English words in another script or other-language words in English letters.
${ctx.context ? `\nEarlier in the call (for context only, do not return it):\n${ctx.context}\n` : ''}
For EVERY numbered line below, return three versions:
- "original": the line in the language actually spoken, in that language's own script (Nepali and Hindi in Devanagari). Keep words that were spoken in English as English in Latin letters (order, delivery, tank, filter, product names). If the whole line is English, this is the English line. Correct an obvious recognition mistake only when the context makes you sure; otherwise keep what was heard.
- "roman": the same words in Roman (Latin) letters, written the way people type that language casually on a phone (for Nepali: "ma bholi aauchu", "order ready cha?", "kati ho?"). English words stay as they are. For an all-English line, repeat the English.
- "en": a natural English translation (for an English line, the line itself, tidied).

Keep every name, phone number, amount, price, quantity, date and time exactly. Never add anything that wasn't said. Keep the same line numbers; one output item per input line.

Also return "lang": the main language spoken on the call as an ISO 639-1 code (ne, hi, en …), and "mixed": true when English and another language are both spoken.

Respond ONLY with JSON, no markdown:
{"lang":"ne","mixed":true,"lines":[{"i":0,"original":"…","roman":"…","en":"…"}]}

Lines (number, speaker, text):
${lines}`
}

async function translateChunk(turns: Turn[], ctx: { business: string; languages: string[]; context?: string; companyId: string | null; key: string; models: string[] }): Promise<{ lang: string; mixed: boolean; lines: { original: string; roman: string; en: string }[] } | null> {
  for (const model of ctx.models) {
    try {
      const res = await timed('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ctx.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 8000, messages: [{ role: 'user', content: prompt(turns, ctx) }] }),
      }, 55_000)
      if (!res.ok) continue
      const data = await res.json()
      await trackAi('call_transcript', ctx.companyId, data)
      const out = String(data.content?.[0]?.text || '').replace(/```json|```/g, '').trim()
      const j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1))
      const byIndex = new Map<number, any>((Array.isArray(j.lines) ? j.lines : []).map((l: any) => [Number(l.i), l]))
      // Every line must come back; a missing one falls back to what was heard.
      if (byIndex.size < Math.ceil(turns.length * 0.8)) continue
      const lines = turns.map((t, i) => {
        const l = byIndex.get(i) || {}
        const original = String(l.original || t.text).trim()
        return { original, roman: String(l.roman || original).trim(), en: String(l.en || original).trim() }
      })
      return { lang: String(j.lang || '').toLowerCase().slice(0, 8), mixed: !!j.mixed, lines }
    } catch { /* try the next model */ }
  }
  return null
}

const join = (turns: TranslatedTurn[], key: 'text' | 'roman' | 'en') =>
  turns.map(t => (t.speaker ? `${t.speaker}: ${t[key]}` : t[key])).join('\n')

/**
 * Three forms of a transcript. `turns` are speaker turns (or [] with `text`
 * for an unlabelled transcript). Long calls are done in parts, a few at once,
 * each given the end of the part before it for context.
 */
export async function translateTranscript(input: { turns: Turn[] | null; text: string; languages: string[]; business: string; companyId: string | null }): Promise<Translated | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  const turns = input.turns?.length ? input.turns : turnsFromText(input.text)
  if (!turns.length) return null
  const models = await modelChain('call_transcript', ['claude-sonnet-4-6', 'claude-haiku-4-5'])
  const chunks = chunkTurns(turns)
  const results: (Awaited<ReturnType<typeof translateChunk>>)[] = []
  for (let i = 0; i < chunks.length; i += 3) {
    const batch = chunks.slice(i, i + 3)
    results.push(...await Promise.all(batch.map((c, j) => {
      const prev = chunks[i + j - 1]
      const context = prev ? prev.slice(-4).map(t => `${t.speaker || '-'}: ${t.text}`).join('\n') : undefined
      return translateChunk(c, { ...input, context, key, models })
    })))
  }
  if (results.some(r => !r)) return null
  const segments: TranslatedTurn[] = []
  chunks.forEach((c, ci) => c.forEach((t, ti) => {
    const l = results[ci]!.lines[ti]
    segments.push({ speaker: t.speaker, start: t.start, text: l.original, roman: l.roman, en: l.en })
  }))
  // The language most parts say, and mixed if any part is.
  const votes = new Map<string, number>()
  for (const r of results) if (r!.lang) votes.set(r!.lang, (votes.get(r!.lang) || 0) + 1)
  const lang = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'en'
  return { lang, mixed: results.some(r => r!.mixed), segments, original: join(segments, 'text'), roman: join(segments, 'roman'), en: join(segments, 'en') }
}
