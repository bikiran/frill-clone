// Detect a message's language and translate it to English — one Claude call.
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

  for (const model of ['claude-3-5-haiku-20241022', 'claude-sonnet-4-6']) {
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
