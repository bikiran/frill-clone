// Speech-to-text with Google's Gemini 3.5 Transcribe, server only.
//
// Used for recorded calls when GEMINI_API_KEY is set: it recognises 85+
// languages including Nepali, follows speakers who switch language mid-call
// (Nepali and English in one sentence), and labels who is speaking.
// https://ai.google.dev/gemini-api/docs/transcribe
//
// Recordings go inline (base64) up to INLINE_MAX; anything bigger is uploaded
// through the Files API first. Throws on any failure so the caller can fall
// back to Deepgram.

const API = 'https://generativelanguage.googleapis.com'
export const GEMINI_STT_MODEL = 'gemini-3.5-transcribe'
const INLINE_MAX = 15 * 1024 * 1024
const AUDIO_TOKENS_PER_SEC = 25   // Google's figure, for the usage log when the response has none

export type SttSegment = { speaker: string; text: string; start?: number }
export type SttResult = { text: string; segments: SttSegment[] | null; lang: string | null; engine: string; seconds?: number; usage?: any }

async function timed(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' }) } finally { clearTimeout(t) }
}

/** A MIME type Gemini accepts, from the recording's Content-Type or its URL. */
export function audioMime(contentType: string | null | undefined, url = ''): string {
  const s = `${contentType || ''} ${url}`.toLowerCase()
  if (/wav/.test(s)) return 'audio/wav'
  if (/ogg|opus/.test(s)) return 'audio/ogg'
  if (/webm/.test(s)) return 'audio/webm'
  if (/flac/.test(s)) return 'audio/flac'
  if (/m4a|mp4|aac/.test(s)) return 'audio/aac'
  return 'audio/mp3'
}

/** "0.100s" → 0.1 */
const secs = (v: any): number | undefined => { const n = parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : undefined }

/** Group Gemini's word annotations into speaker turns ("Speaker 1", "Speaker 2"). */
export function turnsFromWords(words: { text?: string; speaker?: string; start_offset?: string }[]): SttSegment[] {
  const out: SttSegment[] = []
  const names = new Map<string, string>()
  for (const w of words) {
    const t = String(w.text || '').trim()
    if (!t) continue
    const raw = String(w.speaker || 'spk_1')
    if (!names.has(raw)) names.set(raw, `Speaker ${names.size + 1}`)
    const spk = names.get(raw)!
    const last = out[out.length - 1]
    if (last && last.speaker === spk) last.text += /^[,.!?।:;)]/.test(t) ? t : ` ${t}`
    else out.push({ speaker: spk, text: t, start: secs(w.start_offset) })
  }
  return out
}

/** The transcript text and word annotations out of an interaction. */
export function readInteraction(j: any): { text: string; words: any[] } {
  const words: any[] = []
  const texts: string[] = []
  for (const step of j?.steps || []) {
    for (const c of step?.content || []) {
      if (c?.type === 'text' && c.text) texts.push(String(c.text))
      for (const a of c?.annotations || []) if (a?.type === 'word_info') words.push(a)
    }
  }
  const text = String(j?.output_text || texts.join('\n') || '').trim()
  return { text, words }
}

async function uploadFile(key: string, audio: ArrayBuffer, mime: string): Promise<string> {
  const start = await timed(`${API}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': key, 'Content-Type': 'application/json',
      'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(audio.byteLength), 'X-Goog-Upload-Header-Content-Type': mime,
    },
    body: JSON.stringify({ file: { display_name: 'call-recording' } }),
  }, 20_000)
  const url = start.headers.get('x-goog-upload-url')
  if (!start.ok || !url) throw new Error(`Gemini upload: ${start.status} ${(await start.text().catch(() => '')).slice(0, 200)}`)
  const put = await timed(url, {
    method: 'POST',
    headers: { 'Content-Length': String(audio.byteLength), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
    body: Buffer.from(audio),
  }, 40_000)
  const j = await put.json().catch(() => null)
  const uri = j?.file?.uri
  if (!put.ok || !uri) throw new Error(`Gemini upload: ${put.status}`)
  // Audio is usually ready at once; wait briefly if it's still processing.
  const name = j?.file?.name
  for (let i = 0; name && j?.file?.state === 'PROCESSING' && i < 10; i++) {
    await new Promise(r => setTimeout(r, 1500))
    const s = await timed(`${API}/v1beta/${name}`, { headers: { 'x-goog-api-key': key } }, 10_000).then(r => r.json()).catch(() => null)
    if (s?.state && s.state !== 'PROCESSING') break
  }
  return uri
}

async function createInteraction(key: string, body: any): Promise<any> {
  const res = await timed(`${API}/v1beta/interactions`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 50_000)
  const raw = await res.text()
  let j: any = null
  try { j = JSON.parse(raw) } catch {}
  if (!res.ok) {
    const err: any = new Error(`Gemini: ${res.status} ${(j?.error?.message || raw).slice(0, 240)}`)
    err.status = res.status
    throw err
  }
  // Normally finished in the response; if it's still running, wait for it.
  for (let i = 0; j?.id && j?.status && !/^(completed|succeeded|done)$/i.test(j.status) && !/fail|error|cancel/i.test(j.status) && i < 20; i++) {
    await new Promise(r => setTimeout(r, 1500))
    j = await timed(`${API}/v1beta/${String(j.id).startsWith('interactions/') ? j.id : `interactions/${j.id}`}`, { headers: { 'x-goog-api-key': key } }, 10_000).then(r => r.json()).catch(() => j)
  }
  if (j?.status && /fail|error|cancel/i.test(j.status)) throw new Error(`Gemini: interaction ${j.status}`)
  return j
}

/**
 * Transcribe a recording with speaker labels. `languageCodes` are BCP-47 hints
 * (['en-GB', 'ne-NP']); [] lets the model detect the language. If the hints
 * are refused, it tries again without them.
 */
export async function transcribeGemini(audio: ArrayBuffer, mime: string, opts: { key: string; languageCodes?: string[] }): Promise<SttResult> {
  const input = audio.byteLength <= INLINE_MAX
    ? { type: 'audio', data: Buffer.from(audio).toString('base64'), mime_type: mime }
    : { type: 'audio', uri: await uploadFile(opts.key, audio, mime), mime_type: mime }
  const body = (codes: string[]) => ({
    model: GEMINI_STT_MODEL,
    input: [input],
    generation_config: { transcription_config: { language_codes: codes, mode: { type: 'verbatim', diarization_mode: 'speaker' } } },
  })
  let j: any
  try { j = await createInteraction(opts.key, body(opts.languageCodes || [])) }
  catch (e: any) {
    if (e?.status === 400 && opts.languageCodes?.length) j = await createInteraction(opts.key, body([]))
    else throw e
  }
  const { text, words } = readInteraction(j)
  const segments = words.length ? turnsFromWords(words) : null
  const last = words.length ? secs(words[words.length - 1]?.end_offset) : undefined
  return { text: text || (segments || []).map(s => s.text).join(' '), segments, lang: null, engine: GEMINI_STT_MODEL, seconds: last, usage: j?.usage }
}

/** Log the audio tokens against the call notes job (priced in Super Admin → AI). */
export async function logGeminiUsage(db: any, companyId: string | null, seconds: number | undefined, response?: any) {
  try {
    const u = response?.usage || {}
    const tokensIn = Number(u.total_input_tokens || u.input_tokens || u.prompt_token_count || 0) || Math.round((seconds || 0) * AUDIO_TOKENS_PER_SEC)
    if (!tokensIn) return
    await db.from('ai_usage_log').insert({ company_id: companyId, job: 'call_transcript', model: GEMINI_STT_MODEL, tokens_in: tokensIn, tokens_out: Number(u.total_output_tokens || u.output_tokens || 0) }).then(() => {}, () => {})
  } catch {}
}
