import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ensureCallCard } from '@/lib/call-card'

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
  // detect_language=true → Deepgram returns the spoken language, so a non-English
  // call can be transcribed in its own language and then translated to English.
  const res = await fetchWithTimeout(
    'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true&punctuate=true&detect_language=true',
    {
      method: 'POST',
      headers: { Authorization: `Token ${key}`, 'Content-Type': 'audio/webm' },
      body: Buffer.from(audio),
    }
  )
  if (!res.ok) throw new Error(`Deepgram: ${res.status} ${await res.text()}`)
  const data = await res.json()
  const channel = data?.results?.channels?.[0]
  const alt = channel?.alternatives?.[0]
  const text: string = alt?.transcript || ''
  const lang: string | null = channel?.detected_language || null

  // Group words into speaker turns, so the transcript reads like a dialogue.
  const segments: any[] = []
  for (const w of alt?.words || []) {
    const spk = `Speaker ${(w.speaker ?? 0) + 1}`
    const last = segments[segments.length - 1]
    if (last && last.speaker === spk) last.text += ` ${w.punctuated_word || w.word}`
    else segments.push({ speaker: spk, text: w.punctuated_word || w.word, start: w.start })
  }
  return { text, segments, lang }
}

async function transcribeWhisper(audio: ArrayBuffer, key: string) {
  const form = new FormData()
  form.append('file', new Blob([audio], { type: 'audio/webm' }), 'call.webm')
  form.append('model', 'whisper-1')
  // verbose_json so Whisper reports the detected language too.
  form.append('response_format', 'verbose_json')
  const res = await fetchWithTimeout('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  })
  if (!res.ok) throw new Error(`Whisper: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return { text: data.text || '', segments: null, lang: data.language || null }
}

// Translate a transcript to English (best-effort). Returns null on any failure —
// the caller then just shows the original.
async function translateToEnglish(text: string, key: string): Promise<string | null> {
  for (const model of ['claude-sonnet-4-6', 'claude-3-5-haiku-20241022']) {
    try {
      const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model, max_tokens: 4000,
          messages: [{ role: 'user', content: `Translate this phone-call transcript to natural English. Keep any "Speaker N:" labels intact. Output ONLY the translation — no preamble, no notes.\n\n${text.slice(0, 12000)}` }],
        }),
      })
      if (!res.ok) continue
      const data = await res.json()
      const out = (data.content?.[0]?.text || '').trim()
      if (out) return out
    } catch { /* try next model */ }
  }
  return null
}

// Is a detected language English? Deepgram returns ISO ('en'), Whisper a name
// ('english') — accept both, and treat "unknown" as English (no translation).
function isEnglishLang(lang: string | null | undefined): boolean {
  const l = String(lang || '').toLowerCase()
  return !l || l.startsWith('en')
}

export async function POST(req: NextRequest) {
  try {
    const { callId, companyId, conversationId } = await req.json()
    if (!callId) return NextResponse.json({ error: 'callId required' }, { status: 400 })

    const db = admin()
    const { data: call } = await db.from('calls').select('*').eq('id', callId).maybeSingle()
    if (!call?.recording_url && !call?.conference_recording_url) {
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

    // A call can have TWO recordings: the pre-handoff dial recording, then the
    // conference recording of the leg it was handed to (device switch / warm
    // transfer). Transcribe each in order and stitch them so the transcript +
    // summary cover the WHOLE call, not just the part before the handoff.
    const recordings: string[] = Array.from(new Set([call.recording_url, call.conference_recording_url].filter(Boolean))) as string[]
    const parts: { text: string; segments: any[]; lang: string | null }[] = []
    for (const url of recordings) {
      try {
        const audioRes = await fetchWithTimeout(url, {}, 30000)
        if (!audioRes.ok) continue
        const audio = await audioRes.arrayBuffer()
        const p = DEEPGRAM ? await transcribeDeepgram(audio, DEEPGRAM) : await transcribeWhisper(audio, OPENAI!)
        if (p.text.trim()) parts.push(p)
      } catch { /* skip a segment we couldn't read/transcribe */ }
    }

    if (parts.length === 0) {
      await db.from('calls').update({ transcription: '' }).eq('id', callId)
      return NextResponse.json({ ok: false, reason: 'Nothing audible in the recording.' })
    }

    const DIVIDER = '\n\n— call continued on another device —\n\n'
    const text = parts.map(p => p.text.trim()).join(DIVIDER)
    const segments = parts.flatMap(p => p.segments || [])
    const lang = parts[0].lang

    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

    // Non-English call → translate the transcript to English so the agent reads
    // it in English, with the original kept for the "View original" toggle.
    let transcriptEn: string | null = null
    if (!isEnglishLang(lang) && ANTHROPIC_KEY) {
      transcriptEn = await translateToEnglish(text, ANTHROPIC_KEY)
    }
    // What the English-speaking summary should be built from.
    const summarySource = transcriptEn || text

    await db.from('calls').update({
      transcription: text,               // the ORIGINAL, in the spoken language
      transcript_segments: segments,
      transcript_lang: lang || null,
      transcript_en: transcriptEn,       // English translation (null if already English)
    }).eq('id', callId)

    // ── Summarise with Claude ────────────────────────────────────────────────
    let summary = ''
    let todos: string[] = []
    let sentiment: string | null = null
    let summaryError = ''
    let extractedContact: any = null

    if (ANTHROPIC_KEY) {
      // Model names get retired. Rather than fail silently on a stale one, try
      // current models in order and report the REAL upstream error if all fail —
      // "the summary step failed" told us nothing about why.
      const MODELS = ['claude-sonnet-4-6', 'claude-3-5-haiku-20241022']   // 4-6 is what the rest of Colvy's AI uses and is known to work with this key
      // Frame the call around the contact's relationship type, so a call with a
      // supplier / wholesaler / business contact isn't summarised as if they
      // were a customer. Default to customer when unset.
      let relNoun = 'customer'
      if (call.contact_id) {
        try {
          const { data: ct } = await db.from('contacts').select('relationship_type').eq('id', call.contact_id).maybeSingle()
          const rel = String(ct?.relationship_type || '').toLowerCase()
          relNoun = rel === 'supplier' ? 'supplier'
            : rel === 'wholesaler' ? 'wholesaler'
            : rel === 'business' ? 'business contact'
            : 'customer'
        } catch { /* default to customer */ }
      }
      const isCustomer = relNoun === 'customer'
      const otherParty = isCustomer ? 'a customer' : `a ${relNoun} (a business relationship, NOT a customer)`
      const them = isCustomer ? 'the customer' : `the ${relNoun}`

      // Also tell the model who initiated the call, so an outbound call isn't
      // summarised as though the other party rang in (the row knows its direction).
      const dir = String(call.direction || '').toLowerCase()
      const whoInitiated = dir === 'outbound'
        ? `This was an OUTBOUND call: the aquarium business (the agent) called ${them}. Do not say ${them} called.`
        : dir === 'inbound'
        ? `This was an INBOUND call: ${them} called the aquarium business.`
        : ''
      const prompt = `You are summarising a phone call between a staff member at an aquarium business and ${otherParty}.${whoInitiated ? `\n\n${whoInitiated}` : ''}

Respond ONLY with JSON, no preamble and no markdown fences:
{"summary":"2-3 sentences, past tense, naming who called whom and what they wanted and how it was left","todos":["specific follow-up actions for the business, [] if none"],"sentiment":"positive|neutral|negative","contact":{"name":null,"email":null,"address":null,"city":null,"state":null,"postcode":null}}

For "contact", extract details that ${them} (NOT the staff member) explicitly stated about THEMSELVES during the call — their full name, email, and delivery/postal address (street line in "address", plus city/state/postcode separately). Use null for anything not clearly and unambiguously stated; never guess or infer.

Transcript:
${summarySource.slice(0, 12000)}`

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
          if (parsed.contact && typeof parsed.contact === 'object') extractedContact = parsed.contact
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

    // Backfill the caller's contact from what they said on the call — a customer
    // who rang in as an unknown "Visitor" and gave their name/address/email
    // shouldn't stay blank. Only fill fields that are currently empty; never
    // overwrite something the team already set. Best-effort.
    if (extractedContact && call.contact_id) {
      try {
        const { data: ct } = await db.from('contacts').select('*').eq('id', call.contact_id).maybeSingle()
        if (ct) {
          const val = (v: any) => { const s = typeof v === 'string' ? v.trim() : ''; return s && s.toLowerCase() !== 'null' ? s : '' }
          const nameBlank = !ct.name || /^\+?\d[\d\s-]*$/.test(String(ct.name)) || String(ct.name).toLowerCase() === 'visitor' || String(ct.name).trim() === String(ct.email || '').trim()
          const addrLine = val(extractedContact.address)
          const patch: any = {}
          if (nameBlank && val(extractedContact.name)) patch.name = val(extractedContact.name)
          if (!ct.email && val(extractedContact.email) && /@/.test(extractedContact.email)) patch.email = val(extractedContact.email)
          if (!ct.address && addrLine) {
            patch.address = addrLine
            if (val(extractedContact.city)) patch.city = val(extractedContact.city)
            if (val(extractedContact.state)) patch.state = val(extractedContact.state)
            if (val(extractedContact.postcode)) patch.postcode = val(extractedContact.postcode)
          }
          if (Object.keys(patch).length) {
            await db.from('contacts').update(patch).eq('id', call.contact_id)
            // If the conversation was showing the bare number as its subject,
            // give it the real name too so the inbox list stops saying "Visitor".
            if (patch.name && conversationId) {
              try {
                const { data: cv } = await db.from('conversations').select('subject').eq('id', conversationId).maybeSingle()
                if (!cv?.subject || /^\+?\d/.test(String(cv.subject)) || /visitor/i.test(String(cv.subject))) {
                  await db.from('conversations').update({ subject: patch.name }).eq('id', conversationId)
                }
              } catch {}
            }
          }
        }
      } catch { /* enrichment is best-effort */ }
    }

    // Transcribed, but no summary — say EXACTLY why.
    if (!summary) {
      const reason = !ANTHROPIC_KEY
        ? 'Transcribed, but ANTHROPIC_API_KEY isn\'t set in Vercel — that key is what writes the summary and action items.'
        : `Transcribed, but the summary failed — ${summaryError || 'unknown error'}`
      console.error('[transcribe] summary failed:', summaryError)
      return NextResponse.json({ ok: false, transcription: text, reason })
    }

    // Make sure the call has a thread card, then flag it transcribed so the
    // summary/transcript show without a reload. ensureCallCard is the retroactive
    // net: if the browser never posted a card (e.g. an inbound call answered off
    // the tab), this creates it now that we know the call connected — reading the
    // conversation straight off the `calls` row, so we don't depend on the body
    // carrying conversationId/companyId. Idempotent.
    try {
      await ensureCallCard(db, callId)
      const cid = conversationId || call.conversation_id
      if (cid) {
        const { data: msgs } = await db.from('messages')
          .select('id, metadata').eq('conversation_id', cid)
        const card = (msgs || []).find((m: any) => m.metadata?.call_id === callId)
        if (card) {
          await db.from('messages')
            .update({ metadata: { ...(card.metadata || {}), transcribed: true } })
            .eq('id', card.id)
        }
      }
    } catch {}

    return NextResponse.json({ ok: true, transcription: text, summary, todos, sentiment })
  } catch (err: any) {
    console.error('[transcribe] failed', err)
    const msg = err?.name === 'AbortError'
      ? 'The transcription service timed out. Try again — if it keeps happening, check the DEEPGRAM_API_KEY is valid.'
      : (err?.message || 'Transcription failed')
    return NextResponse.json({ ok: false, error: msg, reason: msg }, { status: 200 })
  }
}
