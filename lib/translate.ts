// Detect a message's language and translate it to English — one Claude call.
import { modelChain, trackAi } from '@/lib/ai-models'
//
// Returns { lang, translated }:
//   - lang: an ISO code for the detected language ('en', 'ne', 'es'…), or null
//     if we couldn't tell.
//   - translated: the English translation, or null when the text is already
//     English (or on any failure — callers then just show the original).
//
// Best-effort: guarded on ANTHROPIC_API_KEY, never throws.
export async function detectAndTranslate(text: string): Promise<{ lang: string | null; translated: string | null }> {
  const key = process.env.ANTHROPIC_API_KEY
  const clean = (text || '').trim()
  if (!key || !clean) return { lang: null, translated: null }

  const prompt = `Detect the language of the message below and, if it is not English, translate it to natural English.
Respond with ONLY JSON, no preamble, no markdown fences:
{"lang":"<ISO 639-1 code, e.g. en, ne, es>","english":"<English translation, or null if the message is already English>"}

Message:
${clean.slice(0, 4000)}`

  for (const model of await modelChain('translate', ['claude-sonnet-4-6'])) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 20000)
      let res: Response
      try {
        res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model, max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
          signal: ctrl.signal,
        })
      } finally { clearTimeout(t) }
      if (!res.ok) continue
      const data = await res.json()
      await trackAi('translate', null, data)
      const out = (data.content?.[0]?.text || '').replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(out)
      const lang = parsed.lang ? String(parsed.lang).toLowerCase() : null
      const english = parsed.english && String(parsed.english).trim() ? String(parsed.english).trim() : null
      // If the model calls it English, there's nothing to translate.
      const translated = lang && lang.startsWith('en') ? null : english
      return { lang, translated }
    } catch { /* try next model */ }
  }
  return { lang: null, translated: null }
}

/**
 * A reply the team typed, in the customer's language. Keeps names, links,
 * prices, order numbers, emoji and line breaks; matches the reply's tone; for
 * a language people type in Roman letters and `roman`, writes it that way
 * (how the customer writes it). Returns null on failure (callers keep the
 * original). Never throws.
 */
export async function translateReply(text: string, toLanguage: string, opts: { roman?: boolean; business?: string | null; companyId?: string | null } = {}): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY
  const clean = (text || '').trim()
  if (!key || !clean || !toLanguage) return null
  const prompt = `Translate this message from ${opts.business ? `the team at ${opts.business}` : 'a business'} to a customer into ${toLanguage}${opts.roman ? `, written in Roman (Latin) letters the way ${toLanguage} speakers type casually on their phones` : ''}.
Keep the same meaning and the same friendly, professional tone. Keep names, links, email addresses, phone numbers, prices, order numbers, product names, emoji and line breaks exactly as they are. Don't add or explain anything.
Respond with ONLY the translated message.

Message:
${clean.slice(0, 4000)}`
  for (const model of await modelChain('translate', ['claude-sonnet-4-6'])) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 25000)
      let res: Response
      try {
        res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model, max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
          signal: ctrl.signal,
        })
      } finally { clearTimeout(t) }
      if (!res.ok) continue
      const data = await res.json()
      await trackAi('translate', opts.companyId || null, data)
      const out = String(data.content?.[0]?.text || '').trim()
      if (out) return out
    } catch { /* try next model */ }
  }
  return null
}
