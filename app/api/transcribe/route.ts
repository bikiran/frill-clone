import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Voice dictation for the mobile app: the phone records a short clip and posts
// it here as multipart/form-data ('audio'); we return the transcript. Same
// speech-to-text providers the call transcription uses — whichever key is set:
//   DEEPGRAM_API_KEY  — nova-2, fast and very accurate
//   OPENAI_API_KEY    — Whisper, very accurate
// Claude has no speech-to-text API, so one of these is required.

async function fetchWithTimeout(url: string, opts: any, ms = 45000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...opts, signal: ctrl.signal }) }
  finally { clearTimeout(t) }
}

// Deepgram is picky about Content-Type and does NOT recognise "audio/m4a"
// (the type the phone records) — it returns an empty transcript. m4a is an
// MPEG-4 audio container, so map it (and aac) to the type Deepgram accepts.
function deepgramContentType(raw: string, filename: string): string {
  const s = `${raw} ${filename}`.toLowerCase()
  if (/m4a|mp4|aac/.test(s)) return 'audio/mp4'
  if (/wav/.test(s)) return 'audio/wav'
  if (/webm/.test(s)) return 'audio/webm'
  if (/mp3|mpeg/.test(s)) return 'audio/mpeg'
  return raw || 'audio/mp4'
}

async function transcribeDeepgram(audio: ArrayBuffer, contentType: string, key: string) {
  // No diarization for dictation — a single speaker, we just want clean text.
  const res = await fetchWithTimeout(
    'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true',
    {
      method: 'POST',
      headers: { Authorization: `Token ${key}`, 'Content-Type': contentType },
      body: Buffer.from(audio),
    }
  )
  if (!res.ok) throw new Error(`Deepgram: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return (data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '').trim()
}

async function transcribeWhisper(audio: ArrayBuffer, filename: string, contentType: string, key: string) {
  const form = new FormData()
  form.append('file', new Blob([audio], { type: contentType || 'audio/m4a' }), filename || 'audio.m4a')
  form.append('model', 'whisper-1')
  const res = await fetchWithTimeout('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  })
  if (!res.ok) throw new Error(`Whisper: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return (data.text || '').trim()
}

export async function POST(req: NextRequest) {
  try {
    const DEEPGRAM = process.env.DEEPGRAM_API_KEY
    const OPENAI = process.env.OPENAI_API_KEY
    if (!DEEPGRAM && !OPENAI) {
      return NextResponse.json(
        { error: 'Transcription needs a speech-to-text key (DEEPGRAM_API_KEY or OPENAI_API_KEY).' },
        { status: 501 }
      )
    }

    const form = await req.formData()
    const file = form.get('audio')
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No audio file provided.' }, { status: 400 })
    }
    const blob = file as unknown as File
    const audio = await blob.arrayBuffer()
    if (!audio.byteLength) {
      return NextResponse.json({ error: 'Empty audio.' }, { status: 400 })
    }
    const contentType = blob.type || 'audio/m4a'
    const filename = (blob as any).name || 'audio.m4a'

    // Deepgram first (fast), fall back to Whisper if Deepgram errors OR returns
    // nothing (e.g. an unrecognised container). Whisper is very format-tolerant.
    let text = ''
    if (DEEPGRAM) {
      try { text = await transcribeDeepgram(audio, deepgramContentType(contentType, filename), DEEPGRAM) }
      catch (e) { if (!OPENAI) throw e }
    }
    if (!text && OPENAI) {
      text = await transcribeWhisper(audio, filename, contentType, OPENAI)
    }

    return NextResponse.json({ text })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Transcription failed.' }, { status: 500 })
  }
}
