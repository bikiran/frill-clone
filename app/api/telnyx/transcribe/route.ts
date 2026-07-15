import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60

// Every outbound call gets a hard timeout. Without one, a hung request to
// Deepgram/Anthropic leaves the UI stuck on "Transcribing…" forever with no
// error — which is exactly what happened.
async function fetchWithTimeout(url: string, opts: any, ms = 45000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...opts, signal: ctrl.signal }) }
  finally { clearTimeout(t) }
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Transcribe a call recording, then summarise it.
 *
 * Claude cannot accept audio, so speech-to-text needs a provider. We support
 * either, whichever key is present:
 *   DEEPGRAM_API_KEY  — cheaper, gives speaker diarization (who said what)
 *   OPENAI_API_KEY    — Whisper; no speakers, but very accurate
 * With NEITHER key set, the recording still saves and plays back; there's just
 * no transcript or AI summary. The response says so explicitly rather than
 * failing silently.
 */
async function transcribeDeepgram(audio: ArrayBuffer, key: string) {
  const res = await fetchWithTimeout(
    'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true&punctuate=true',
    {
      method: 'POST',
      headers: { Authorization: `Token ${key}`, 'Content-Type': 'audio/webm' },
      body: Buffer.from(audio),
    }
  )
  if (!res.ok) throw new Error(`Deepgram: ${res.status} ${await res.text()}`)
  const data = await res.json()
  const alt = data?.results?.channels?.[0]?.alternatives?.[0]
  const text: string = alt?.transcript || ''

  // Group words into speaker turns, so the transcript reads like a dialogue.
  const segments: any[] = []
  for (const w of alt?.words || []) {
    const spk = `Speaker ${(w.speaker ?? 0) + 1}`
    const last = segments[segments.length - 1]
    if (last && last.speaker === spk) last.text += ` ${w.punctuated_word || w.word}`
    else segments.push({ speaker: spk, text: w.punctuated_word || w.word, start: w.start })
  }
  return { text, segments }
}

async function transcribeWhisper(audio: ArrayBuffer, key: string) {
  const form = new FormData()
  form.append('file', new Blob([audio], { type: 'audio/webm' }), 'call.webm')
  form.append('model', 'whisper-1')
  const res = await fetchWithTimeout('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  })
  if (!res.ok) throw new Error(`Whisper: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return { text: data.text || '', segments: null }
}

export async function POST(req: NextRequest) {
  try {
    const { callId, companyId, conversationId } = await req.json()
    if (!callId) return NextResponse.json({ error: 'callId required' }, { status: 400 })

    const db = admin()
    const { data: call } = await db.from('calls').select('*').eq('id', callId).maybeSingle()
    if (!call?.recording_url) {
      return NextResponse.json({ ok: false, reason: 'No recording for this call.' })
    }

    const DEEPGRAM = process.env.DEEPGRAM_API_KEY
    const OPENAI = process.env.OPENAI_API_KEY
    if (!DEEPGRAM && !OPENAI) {
      return NextResponse.json({
        ok: false,
        reason: 'Transcription needs a speech-to-text key. Add DEEPGRAM_API_KEY (recommended — it labels speakers) or OPENAI_API_KEY in Vercel. The recording is saved and playable either way.',
      })
    }

    // Pull the audio back down.
    const audioRes = await fetchWithTimeout(call.recording_url, {}, 30000)
    if (!audioRes.ok) return NextResponse.json({ ok: false, reason: 'Could not read the recording.' })
    const audio = await audioRes.arrayBuffer()

    const { text, segments } = DEEPGRAM
      ? await transcribeDeepgram(audio, DEEPGRAM)
      : await transcribeWhisper(audio, OPENAI!)

    if (!text.trim()) {
      await db.from('calls').update({ transcription: '' }).eq('id', callId)
      return NextResponse.json({ ok: false, reason: 'Nothing audible in the recording.' })
    }

    await db.from('calls').update({ transcription: text, transcript_segments: segments }).eq('id', callId)

    // ── Summarise with Claude ────────────────────────────────────────────────
    let summary = ''
    let todos: string[] = []
    let sentiment: string | null = null
    let summaryError = ''
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

    if (ANTHROPIC_KEY) {
      // Model names get retired. Rather than fail silently on a stale one, try
      // current models in order and report the REAL upstream error if all fail —
      // "the summary step failed" told us nothing about why.
      const MODELS = ['claude-sonnet-4-6', 'claude-3-5-haiku-20241022']   // 4-6 is what the rest of Colvy's AI uses and is known to work with this key
      const prompt = `You are summarising a phone call between a support agent at an aquarium business and a customer.

Respond ONLY with JSON, no preamble and no markdown fences:
{"summary":"2-3 sentences, past tense, naming who called and what they wanted and how it was left","todos":["specific follow-up actions for the business, [] if none"],"sentiment":"positive|neutral|negative"}

Transcript:
${text.slice(0, 12000)}`

      for (const model of MODELS) {
        try {
          const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify({ model, max_tokens: 800, messages: [{ role: 'user', content: prompt }] }),
          })
          const raw = await res.text()
          if (!res.ok) {
            // Keep the upstream message — it names the real problem (bad key,
            // no credit, unknown model, rate limit…).
            let detail = raw.slice(0, 300)
            try { detail = JSON.parse(raw)?.error?.message || detail } catch {}
            summaryError = `${model}: ${detail}`
            continue    // try the next model
          }
          const data = JSON.parse(raw)
          const out = (data.content?.[0]?.text || '').replace(/```json|```/g, '').trim()
          const parsed = JSON.parse(out)
          summary = parsed.summary || ''
          todos = Array.isArray(parsed.todos) ? parsed.todos : []
          // Normalise to one of the three known values; anything else (or a
          // missing field) becomes 'neutral'. The card only renders the badge
          // when sentiment is set, so a null here meant NO badge ever showed —
          // which is why positive/neutral/negative never appeared.
          {
            const raw = String(parsed.sentiment || '').toLowerCase()
            sentiment = ['positive', 'neutral', 'negative'].includes(raw) ? raw : 'neutral'
          }
          summaryError = ''
          break
        } catch (e: any) {
          summaryError = `${model}: ${e?.message || 'request failed'}`
        }
      }
    }

    await db.from('calls').update({
      ai_summary: summary || null,
      ai_todos: todos,
      // If we produced a summary but the model didn't give a usable sentiment,
      // fall back to neutral so the badge always renders alongside a summary.
      sentiment: sentiment || (summary ? 'neutral' : null),
    }).eq('id', callId)

    // Transcribed, but no summary — say EXACTLY why.
    if (!summary) {
      const reason = !ANTHROPIC_KEY
        ? 'Transcribed, but ANTHROPIC_API_KEY isn\'t set in Vercel — that key is what writes the summary and action items.'
        : `Transcribed, but the summary failed — ${summaryError || 'unknown error'}`
      console.error('[transcribe] summary failed:', summaryError)
      return NextResponse.json({ ok: false, transcription: text, reason })
    }

    // Refresh the call card already sitting in the thread, so the summary and
    // transcript appear without the agent reloading. (The card reads the row.)
    if (conversationId && companyId) {
      try {
        const { data: msgs } = await db.from('messages')
          .select('id, metadata').eq('conversation_id', conversationId)
        const card = (msgs || []).find((m: any) => m.metadata?.call_id === callId)
        if (card) {
          await db.from('messages')
            .update({ metadata: { ...(card.metadata || {}), transcribed: true } })
            .eq('id', card.id)
        }
      } catch {}
    }

    return NextResponse.json({ ok: true, transcription: text, summary, todos, sentiment })
  } catch (err: any) {
    console.error('[transcribe] failed', err)
    const msg = err?.name === 'AbortError'
      ? 'The transcription service timed out. Try again — if it keeps happening, check the DEEPGRAM_API_KEY is valid.'
      : (err?.message || 'Transcription failed')
    return NextResponse.json({ ok: false, error: msg, reason: msg }, { status: 200 })
  }
}
