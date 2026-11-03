'use client'

import { authFetch } from '@/lib/auth-fetch'
import VoicePlayer from '@/components/VoicePlayer'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import DraftTasks from './DraftTasks'
import { callRoutingFacts } from '@/lib/call-routing'
import { languageName, nativeName, romanName, hasNonLatinScript } from '@/lib/call-languages'

// Coax-style call card for the conversation timeline: AI summary, action items,
// sentiment, an audio player for the recording, and the full transcript.
// Replaces the old grey "Call not connected" pills, which said nothing useful.

const ico = (path: React.ReactNode, size = 14) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>{path}</svg>
)
const SparkIcon = () => ico(<path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/>)
const ClockIcon = () => ico(<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>)
const MicIcon = () => ico(<><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></>)
const DocIcon = () => ico(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>)
const PersonIcon = () => ico(<><circle cx="12" cy="7" r="4"/><path d="M5.5 21a8.38 8.38 0 0 1 13 0"/></>)
const PhoneIcon = (size = 13) => ico(<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>, size)
const PhoneMissedIcon = (size = 13) => ico(<><line x1="23" y1="1" x2="17" y2="7"/><line x1="17" y1="1" x2="23" y2="7"/><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></>, size)
const VoicemailIcon = (size = 13) => ico(<><circle cx="6" cy="12" r="4"/><circle cx="18" cy="12" r="4"/><line x1="6" y1="16" x2="18" y2="16"/></>, size)
const DownloadIcon = () => ico(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>)
const RefreshIcon = () => ico(<><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></>, 13)
const ChevronIcon = ({ up }: { up?: boolean }) => ico(<polyline points={up ? '18 15 12 9 6 15' : '6 9 12 15 18 9'}/>, 13)
// A small arrow on the phone: in for a call received, out for one made.
const DirArrow = ({ inbound }: { inbound: boolean }) => (
  <svg className="cc-dir" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {inbound ? <><polyline points="16 18 6 18 6 8"/><line x1="18" y1="6" x2="6" y2="18"/></> : <><polyline points="8 6 18 6 18 16"/><line x1="6" y1="18" x2="18" y2="6"/></>}
  </svg>
)
// "Speaker 1" → "S1", "Sabeen" → "S".
const speakerMark = (s: string) => {
  const m = /^speaker\s*(\d+)/i.exec(String(s).trim())
  return m ? `S${m[1]}` : (String(s).trim()[0] || '?').toUpperCase()
}
const initialsOf = (name: string) => {
  const w = String(name).replace(/\([^)]*\)/g, ' ').split(/[\s._@-]+/).map(x => x.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean)
  return ((w[0]?.[0] || '?') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase()
}

const SENTIMENT: Record<string, { label: string; color: string; bg: string }> = {
  positive: { label: 'Positive', color: '#15803d', bg: '#dcfce7' },
  neutral:  { label: 'Neutral',  color: '#6b7280', bg: '#f3f4f6' },
  negative: { label: 'Negative', color: '#dc2626', bg: '#fee2e2' },
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

// Batched call-row reads. A thread with many calls mounts a CallCard per call,
// and each one used to run its own `calls` query on mount (N round trips for N
// cards). Requests made in the same tick are coalesced into one `in (...)`
// query; if a batch fails (e.g. one malformed id) each id falls back to its own
// single-row read, exactly as before.
const callWaiters = new Map<string, ((row: any) => void)[]>()
let callFlushTimer: ReturnType<typeof setTimeout> | null = null
async function flushCallBatch() {
  callFlushTimer = null
  const batch = new Map(callWaiters)
  callWaiters.clear()
  const ids = Array.from(batch.keys())
  const resolveAll = (id: string, row: any) => { for (const r of batch.get(id) || []) r(row) }
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    let rows: any[] | null = null
    try {
      const { data, error } = await (supabase as any).from('calls').select('*').in('id', chunk)
      if (!error) rows = data || []
    } catch {}
    if (rows) {
      const byId = new Map(rows.map((r: any) => [String(r.id), r]))
      for (const id of chunk) resolveAll(id, byId.get(id) || null)
    } else {
      await Promise.all(chunk.map(async id => {
        let row: any = null
        try { row = (await (supabase as any).from('calls').select('*').eq('id', id).maybeSingle()).data || null } catch {}
        resolveAll(id, row)
      }))
    }
  }
}
function loadCallRow(id: string): Promise<any> {
  return new Promise(resolve => {
    const list = callWaiters.get(id) || []
    list.push(resolve)
    callWaiters.set(id, list)
    if (!callFlushTimer) callFlushTimer = setTimeout(flushCallBatch, 0)
  })
}
// A call older than this won't get a summary/transcript by itself any more
// (transcription runs right after the call), so its card doesn't need to poll.
const POLL_MAX_AGE_MS = 6 * 60 * 60 * 1000

// Wrap every (case-insensitive) occurrence of `q` in a themed <mark>, matching
// the inbox search highlight so a call's summary/transcript lights up too.
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function HL({ text, q, accent = 'var(--coral)' }: { text: string; q?: string; accent?: string }) {
  const query = (q || '').trim()
  if (!query || !text) return <>{text}</>
  const parts = text.split(new RegExp(`(${escapeRe(query)})`, 'ig'))
  const lower = query.toLowerCase()
  const bg = `color-mix(in srgb, ${accent} 30%, transparent)`
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === lower
          ? <mark key={i} style={{ background: bg, color: 'inherit', fontWeight: 700, borderRadius: 3, padding: '0 1px' }}>{p}</mark>
          : <span key={i}>{p}</span>
      )}
    </>
  )
}

export default function CallCard({ callId, meta, timestamp, highlight, accent = 'var(--coral)', actor, onTasksCreated, teamMembers, outlets, defaultLocationId, collapseDrafts = false, contactName = null }: { callId: string; meta?: any; timestamp?: string; highlight?: string; accent?: string; actor?: { id?: string | null; name?: string | null } | null; onTasksCreated?: () => void; teamMembers?: any[]; outlets?: any[]; defaultLocationId?: string | null; collapseDrafts?: boolean; contactName?: string | null }) {
  const [call, setCall] = useState<any>(null)
  const [expanded, setExpanded] = useState(false)
  // The draft-tasks panel (shared component) remembers dismissal/creation per
  // call; we mirror its closed state so the plain Action Items list only shows
  // once the panel is gone.
  const [draftsClosed, setDraftsClosed] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  // For a non-English call: 'en' the translation, 'roman' the spoken words in
  // Roman letters, 'original' the spoken language's own script. Each person's
  // last choice is remembered; until then the business's default (set under
  // Calls & SMS → Call languages, saved on the call) applies.
  const [pickedView, setPickedView] = useState<'en' | 'roman' | 'original' | null>(() => {
    try { const v = localStorage.getItem('colvy:transcript-view'); return v === 'en' || v === 'roman' || v === 'original' ? v : null } catch { return null }
  })
  const setTranscriptView = (v: 'en' | 'roman' | 'original') => {
    setPickedView(v)
    try { localStorage.setItem('colvy:transcript-view', v) } catch {}
  }
  const [retrying, setRetrying] = useState(false)
  const [retryMsg, setRetryMsg] = useState('')

  // Run transcription + AI summary on demand. Also the escape hatch when the
  // automatic run after the call didn't happen (e.g. the tab was closed before
  // the upload finished, or the STT key was added after the call).
  const runTranscription = async () => {
    setRetrying(true); setRetryMsg('')
    try {
      const res = await authFetch('/api/telnyx/transcribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId }),
      })
      const d = await res.json().catch(() => null)
      await load()
      if (d?.ok) setRetryMsg('')
      else setRetryMsg(d?.reason || d?.error || `Could not transcribe (HTTP ${res.status}).`)
    } catch (e: any) {
      setRetryMsg(e?.message || 'Could not transcribe this call.')
    } finally { setRetrying(false) }
  }

  const load = async () => {
    if (!callId) return
    const data = await loadCallRow(String(callId))
    if (data) setCall(data)
  }

  useEffect(() => { load() }, [callId])

  // The recording uploads and transcribes AFTER the call ends, so poll briefly
  // until the summary lands — otherwise the card would sit empty until reload.
  useEffect(() => {
    if (!callId) return
    if (call?.ai_summary || call?.transcription) return
    // A historical call that never got a summary isn't about to: don't poll it
    // (a thread with many old calls ran ~20 polls per card for nothing).
    const startedAt = Date.parse(String(call?.created_at || timestamp || ''))
    if (!isNaN(startedAt) && Date.now() - startedAt > POLL_MAX_AGE_MS) return
    // Nothing to wait for on a call that never connected (missed/failed with no
    // recording) — don't poll it. Connected/voicemail rows may still be waiting
    // for the recording + summary to upload, so keep polling those.
    const st = String(call?.status || '')
    if (call && !call.recording_url && !['completed', 'answered'].includes(st) && !st.startsWith('voicemail')) return
    // Answered by the AI phone agent: not recorded (the transcript is a note).
    if (call && !call.recording_url && call.routing_state?.phone_agent && !call.is_voicemail && !st.startsWith('voicemail')) return
    let n = 0
    const iv = setInterval(() => {
      n++
      load()
      if (n > 20) clearInterval(iv)   // give up after ~2 min
    }, 6000)
    return () => clearInterval(iv)
  }, [callId, call?.ai_summary, call?.transcription, call?.recording_url, call?.status])

  // When a search brought us here, reveal any match that a collapsed summary or
  // a hidden transcript would otherwise hide — expand the card / open the
  // transcript so the highlighted term is actually visible.
  useEffect(() => {
    const q = (highlight || '').trim().toLowerCase()
    if (!q || !call) return
    const inSummary = String(call.ai_summary || '').toLowerCase().includes(q)
    const inTodos = (Array.isArray(call.ai_todos) ? call.ai_todos : []).some((t: any) => String(t || '').toLowerCase().includes(q))
    const inTranscript = String(call.transcription || '').toLowerCase().includes(q)
      || String(call.transcript_en || '').toLowerCase().includes(q)
      || String(call.transcript_roman || '').toLowerCase().includes(q)
      || (Array.isArray(call.transcript_segments) ? call.transcript_segments : []).some((s: any) => [s?.text, s?.roman, s?.en].some(v => String(v || '').toLowerCase().includes(q)))
    if (inSummary || inTodos || inTranscript) setExpanded(true)
    if (inTranscript) setShowTranscript(true)
  }, [highlight, call])

  const duration = call?.duration_seconds ?? meta?.duration_seconds ?? 0
  const inbound = (call?.direction || meta?.direction) === 'inbound'
  const status = String(call?.status || '')
  const isVoicemail = !!call?.is_voicemail || status.startsWith('voicemail')
  const aiAnswered = !!call?.routing_state?.phone_agent && !isVoicemail
  // A missed call never connected: no recording, no talk time, and a status that
  // says so. (Voicemail takes precedence — it's a missed call that left a message.)
  const isMissed = !isVoicemail && !call?.recording_url && (duration || 0) <= 0 &&
    ['missed', 'no-answer', 'no_answer', 'failed', 'busy', 'canceled', 'cancelled'].includes(status)
  const when = timestamp ? new Date(timestamp).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''
  // Call routing: the phone menu choice, the voicemail box, a forward.
  const routed = callRoutingFacts(call)

  // Answered by the AI phone agent: its own compact card (the transcript note,
  // AiCallNote) covers the call, so this one steps aside. Before the row loads,
  // the call's agent name says so; a call that went on to voicemail keeps its card.
  const aiHasNote = call
    ? !!call.routing_state?.phone_agent?.transcriptMessageId && !call.recording_url && !isVoicemail
    : (meta?.agent_name === 'AI phone agent')
  if (aiHasNote) return null

  // Missed call: a compact timeline pill, not a full card (there's nothing to
  // play or summarise). Rendered once the row loads so we know it truly missed.
  if (call && isMissed) {
    const num = inbound ? call.from_number : call.to_number
    return (
      <div className="cc-missed-row">
        <style href="colvy-callcard" precedence="default">{CC_CSS}</style>
        <span className="cc-missed">
          {PhoneMissedIcon(13)}
          {inbound ? 'Missed call' : 'Call not answered'}{num ? ` · ${num}` : ''}{routed.choice ? ` · ${routed.choice}` : ''}{when ? ` · ${when}` : ''}
        </span>
      </div>
    )
  }

  const headLabel = isVoicemail ? `Voicemail${routed.box ? ` · ${routed.box}` : ''}` : (inbound ? 'Call received' : 'Call made')
  const handledBy = call?.agent_name || meta?.agent_name || ''
  // Who took it, as the team knows them: agent_name is a copy taken on the
  // call, and was the email's first half ("sabingau") when no profile name
  // had loaded.
  const member = call?.answered_by_user_id && Array.isArray(teamMembers)
    ? teamMembers.find((m: any) => (m?.user_id || m?.id) === call.answered_by_user_id && m?.name)
    : null
  const forwarded = routed.forwardedTo ? `Forwarded to ${routed.forwardedTo}` : /^Forwarded to /.test(handledBy) ? handledBy : ''
  const handlerName: string = forwarded ? '' : (member?.name || handledBy)
  const handledText = forwarded || (handlerName ? `Handled by ${handlerName}` : '')
  // Show a badge whenever we have any AI output. Older calls summarised before
  // sentiment was persisted have a summary but a null sentiment — treat those
  // as neutral rather than showing no badge at all.
  const sentKey = call?.sentiment || (call?.ai_summary ? 'neutral' : null)
  const sent = sentKey ? SENTIMENT[sentKey] : null
  const todos: string[] = Array.isArray(call?.ai_todos) ? call.ai_todos : []
  const summary: string = call?.ai_summary || ''
  const longSummary = summary.length > 180

  // Translation state. `transcription` holds the ORIGINAL (spoken language);
  // `transcript_en` the English translation (only set for a non-English call).
  const tLang: string | null = call?.transcript_lang || null
  const nonEnglish = !!tLang && !/^en/i.test(String(tLang))
  const mixedEnglish = !!call?.transcript_meta?.mixed
  const hasTranslation = (nonEnglish || mixedEnglish) && !!call?.transcript_en
  const langName = languageName(tLang)
  const segs: any[] = Array.isArray(call?.transcript_segments) ? call.transcript_segments : []
  // Calls translated line by line carry all three versions on each turn.
  const perLine = hasTranslation && segs.length > 0 && segs.every(sg => typeof sg?.en === 'string')
  const hasRoman = hasTranslation && (!!call?.transcript_roman || (perLine && segs.some(sg => sg?.roman)))
  const views: { key: 'en' | 'roman' | 'original'; label: string }[] = hasTranslation
    ? [{ key: 'en', label: 'English' }, ...(hasRoman ? [{ key: 'roman' as const, label: romanName(tLang) }] : []), { key: 'original', label: nativeName(tLang) || langName }]
    : []
  const wanted = pickedView || call?.transcript_meta?.view || 'en'
  const transcriptView: 'en' | 'roman' | 'original' = views.some(v => v.key === wanted) ? wanted : 'en'
  // Each voice gets its own colour, in the order they first speak.
  const speakers: string[] = []
  for (const sg of segs) { const k = String(sg?.speaker || ''); if (k && !speakers.includes(k)) speakers.push(k) }
  const recUrl: string | null = call?.recording_url || (call as any)?.conference_recording_url || null

  return (
    <div className="cc" style={{ '--cc-accent': accent } as React.CSSProperties}>
      <style href="colvy-callcard" precedence="default">{CC_CSS}</style>
      {/* Header: direction, length, who took it, and the mood */}
      <div className="cc-h">
        <span className={`cc-ic${isVoicemail ? ' vm' : inbound ? ' in' : ''}`} aria-hidden>
          {isVoicemail ? VoicemailIcon(17) : PhoneIcon(16)}
          {!isVoicemail && <DirArrow inbound={inbound} />}
        </span>
        <div className="cc-ht">
          <p className="cc-title">
            <b>{headLabel}</b>
            {duration ? <span className="cc-dur">{fmt(duration)}</span> : null}
          </p>
          <p className="cc-sub">
            {member ? <span className="cc-av" aria-hidden>{initialsOf(member.name)}</span> : null}
            <span>{[routed.choice, handledText, when].filter(Boolean).join(' · ')}</span>
          </p>
        </div>
        {sent && (
          <span className={`cc-sent ${sentKey}`}><i aria-hidden />{sent.label}</span>
        )}
      </div>

      {/* AI summary */}
      {summary && (
        <section className="cc-sec">
          <p className="cc-sh">
            <span className="cc-sh-ic ai"><SparkIcon /></span>
            Call summary
            {hasTranslation && (
              <small>· {hasNonLatinScript(summary) || call?.transcript_meta?.summary === 'ne-roman' ? `from a ${langName} call` : `English · translated from ${langName}`}</small>
            )}
          </p>
          <div className="cc-sum">
            <p><HL text={expanded || !longSummary ? summary : `${summary.slice(0, 180).trim()}…`} q={highlight} accent={accent} /></p>
            {longSummary && (
              <button type="button" className="cc-more" onClick={() => setExpanded(v => !v)} aria-expanded={expanded}>
                {expanded ? 'Show less' : 'Read more'} <ChevronIcon up={expanded} />
              </button>
            )}
          </div>
        </section>
      )}

      {/* AI draft tasks — turn the call's action items into real tasks (with
          per-task priority, assignee, outlet and an optional reminder). The
          shared panel remembers dismissal/creation per call. */}
      {todos.length > 0 && (
        <DraftTasks
          todos={todos} source="call_summary" storageKey={`colvy-call-tasks-${callId}`}
          conversationId={call?.conversation_id} companyId={call?.company_id}
          teamMembers={teamMembers} outlets={outlets} defaultLocationId={defaultLocationId}
          actor={actor} onCreated={onTasksCreated} onClosedChange={setDraftsClosed}
          contactName={call?.contact_name || contactName}
          // Unused and the chat has moved on below this call: one closed row.
          collapsible={collapseDrafts}
        />
      )}

      {/* Action items — the plain list, once drafts are created/dismissed. */}
      {expanded && todos.length > 0 && draftsClosed && (
        <section className="cc-sec">
          <p className="cc-sh"><span className="cc-sh-ic"><ClockIcon /></span>Action items</p>
          <ul className="cc-list">
            {todos.map((t, i) => <li key={i}><HL text={t} q={highlight} accent={accent} /></li>)}
          </ul>
        </section>
      )}

      {/* Contact Information — who the call was with, from the AI's read of
          the transcript plus the linked contact record. */}
      {expanded && (call?.contact_name || call?.to_number || call?.from_number) && (
        <section className="cc-sec">
          <p className="cc-sh"><span className="cc-sh-ic"><PersonIcon /></span>Contact</p>
          <ul className="cc-list">
            {call?.contact_name && <li>{call.contact_name}</li>}
            <li>{inbound ? call?.from_number : call?.to_number}</li>
          </ul>
        </section>
      )}

      {/* Recording */}
      {recUrl ? (
        <section className="cc-sec">
          <p className="cc-sh"><span className="cc-sh-ic rec"><MicIcon /></span>{isVoicemail ? 'Voicemail' : 'Call recording'}</p>
          {/* The call's length isn't the recording's (ringing, hold), so only the
              recording's own length is shown before Play. */}
          {call?.recording_url && <VoicePlayer src={call.recording_url} name={isVoicemail ? 'Voicemail' : 'Call recording'} lazy durationSec={call.recording_duration || undefined} />}
          {/* A handed-over call (device switch / warm transfer) has a second
              recording for the part after the handoff — play it too. */}
          {(call as any)?.conference_recording_url && (
            <>
              {call?.recording_url && <p className="cc-cap">After device switch / transfer</p>}
              <VoicePlayer src={(call as any).conference_recording_url} name="Call recording (after transfer)" lazy durationSec={(call as any).conference_recording_duration || undefined} />
            </>
          )}
          <div className="cc-acts">
            <a className="cc-pill" href={recUrl} download><DownloadIcon /> Download</a>
            {call?.transcription && (
              <button type="button" className={`cc-pill${showTranscript ? ' on' : ''}`} onClick={() => setShowTranscript(v => !v)} aria-expanded={showTranscript}>
                <DocIcon /> {showTranscript ? 'Hide transcript' : 'View transcript'}
              </button>
            )}
          </div>
        </section>
      ) : (
        <p className={`cc-note${call?.recording_error ? ' err' : ''}`}>
          {call?.recording_error
            ? call.recording_error
            : aiAnswered
              ? 'Not recorded. The AI phone agent’s transcript is in the note below.'
              : <><span className="cc-dots" aria-hidden><i /><i /><i /></span>Recording uploading…</>}
        </p>
      )}

      {/* No summary yet? Say why, and offer to run it — rather than an empty
          card that gives no clue whether it's still working or has failed. */}
      {recUrl && !summary && (
        <div className="cc-run">
          <button type="button" className="cc-pill ai" onClick={runTranscription} disabled={retrying}>
            <SparkIcon /> {retrying ? 'Transcribing…' : (call?.transcription ? 'Generate AI summary' : 'Transcribe & summarise')}
          </button>
          {retryMsg && <span className="cc-err">{retryMsg}</span>}
        </div>
      )}

      {/* Transcript */}
      {showTranscript && call?.transcription && (
        <section className="cc-tr">
          <div className="cc-tr-bar">
            {/* Language views — for a call that isn't all English. */}
            {views.length > 0 && (
              <div className="cc-seg" role="group" aria-label="Transcript language">
                {views.map(v => (
                  <button key={v.key} type="button" onClick={() => setTranscriptView(v.key)} aria-pressed={transcriptView === v.key} className={transcriptView === v.key ? 'on' : ''}>
                    {v.label}
                  </button>
                ))}
              </div>
            )}
            {hasTranslation && mixedEnglish && <span className="cc-tr-note">{langName} and English</span>}
            <button type="button" className="cc-ghost" onClick={runTranscription} disabled={retrying} title="Transcribe and summarise this call again with the current call language settings">
              <RefreshIcon /> {retrying ? 'Re-transcribing…' : 'Re-transcribe'}
            </button>
          </div>
          {retryMsg && <p className="cc-err block">{retryMsg}</p>}
          <div className="cc-tr-body">
            {perLine || (!hasTranslation && segs.length) ? (
              segs.map((seg: any, i: number) => {
                const line = transcriptView === 'en' && perLine ? seg.en : transcriptView === 'roman' && perLine ? (seg.roman || seg.text) : seg.text
                const who = String(seg.speaker || '')
                const tone = who ? speakers.indexOf(who) % 4 : 1
                const first = !who || who !== String(segs[i - 1]?.speaker || '')
                return (
                  <div key={i} className={`cc-turn t${tone}${first ? ' first' : ''}`}>
                    <span className="cc-turn-av" aria-hidden>{first && who ? speakerMark(who) : ''}</span>
                    <div className="cc-turn-b">
                      {first && who && <p className="cc-turn-who">{who}</p>}
                      <p className="cc-turn-text" lang={transcriptView === 'original' && tLang ? String(tLang) : undefined}><HL text={String(line || '')} q={highlight} accent={accent} /></p>
                    </div>
                  </div>
                )
              })
            ) : (
              // Older translated calls: whole-text versions, no per-line split.
              <p className="cc-tr-plain">
                <HL text={String((transcriptView === 'en' ? call.transcript_en : transcriptView === 'roman' ? call.transcript_roman : null) || call.transcription)} q={highlight} accent={accent} />
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

// Sellio card: white, soft ring, roomy; sections by whitespace and small
// labelled icon tiles; grey fills for the summary, the player and the pills.
const CC_CSS = `
.cc{--cc-fill:#f4f4f5;--cc-fill-2:#ececef;--cc-ring:#ececef;--cc-mute:#8e8e93;max-width:560px;margin:12px auto;padding:16px 16px 15px;border-radius:22px;background:var(--card,#fff);box-shadow:0 0 0 1px var(--cc-ring),0 1px 2px rgba(16,24,40,.04),0 10px 24px -16px rgba(16,24,40,.18);text-align:left}
.cc button::before,.cc a::before{display:none}
.cc-h{display:flex;align-items:center;gap:12px}
.cc-ic{position:relative;width:42px;height:42px;flex-shrink:0;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;background:#dcfce7;color:#15803d}
.cc-ic.in{background:#dbeafe;color:#1d4ed8}
.cc-ic.vm{background:#fef3c7;color:#b45309}
.cc-dir{position:absolute;right:5px;top:5px}
.cc-ht{flex:1;min-width:0}
.cc-title{margin:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cc-title b{font-size:15px;font-weight:700;color:var(--ink);letter-spacing:-.01em}
.cc-dur{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:999px;background:var(--cc-fill);color:#52525b;font-size:12px;font-weight:650;font-variant-numeric:tabular-nums}
.cc-sub{margin:3px 0 0;display:flex;align-items:center;gap:6px;min-width:0;font-size:12.5px;color:var(--cc-mute)}
.cc-sub>span:last-child{min-width:0;line-height:1.4}
.cc-av{width:18px;height:18px;flex-shrink:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--cc-accent) 16%,transparent);color:var(--cc-accent);font-size:8.5px;font-weight:800;letter-spacing:0}
.cc-sent{flex-shrink:0;display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border-radius:999px;font-size:12px;font-weight:650;background:#f4f4f5;color:#52525b}
.cc-sent i{width:7px;height:7px;border-radius:50%;background:currentColor}
.cc-sent.positive{background:#dcfce7;color:#15803d}
.cc-sent.negative{background:#fee2e2;color:#dc2626}
.cc-sec{margin-top:18px}
.cc-sh{margin:0 0 9px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13.5px;font-weight:700;color:var(--ink)}
.cc-sh small{font-size:12px;font-weight:550;color:var(--cc-mute)}
.cc-sh-ic{width:24px;height:24px;flex-shrink:0;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;background:var(--cc-fill);color:#52525b}
.cc-sh-ic.ai{background:#ede9fe;color:#7c3aed}
.cc-sh-ic.rec{background:color-mix(in srgb,var(--cc-accent) 13%,transparent);color:var(--cc-accent)}
.cc-sum{padding:12px 14px;border-radius:16px;background:var(--cc-fill)}
.cc-sum p{margin:0;font-size:13.5px;line-height:1.6;color:var(--ink)}
.cc-more{margin-top:6px;display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 10px 0 0;border:none;background:none;color:var(--ink);font:inherit;font-size:12.5px;font-weight:650;cursor:pointer}
.cc-more:hover{color:var(--cc-accent)}
.cc-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
.cc-list li{position:relative;padding:9px 12px 9px 26px;border-radius:12px;background:var(--cc-fill);font-size:13px;line-height:1.45;color:var(--ink)}
.cc-list li::before{content:"";position:absolute;left:12px;top:15px;width:6px;height:6px;border-radius:50%;background:#a1a1aa}
.cc .vp{padding:6px 14px 6px 6px;border:none;border-radius:999px;background:var(--cc-fill)}
.cc .vp-play{width:38px;height:38px;background:var(--cc-accent)}
.cc .vp-bar.on{background:var(--cc-accent)}
.cc .vp-rate{background:var(--card,#fff);color:var(--ink)}
.cc-cap{margin:10px 2px 6px;font-size:12px;font-weight:600;color:var(--cc-mute)}
.cc-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.cc-pill{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 13px;border:none;border-radius:999px;background:var(--cc-fill);color:var(--ink);font:inherit;font-size:12.5px;font-weight:650;text-decoration:none;cursor:pointer;transition:background .15s ease,color .15s ease}
.cc-pill:hover{background:var(--cc-fill-2)}
.cc-pill.on{background:#18181b;color:#fff}
.cc-pill.ai{background:#ede9fe;color:#6d28d9}
.cc-pill.ai:hover{background:#e4dcfd}
.cc-pill:disabled{opacity:.6;cursor:wait}
.cc-pill:focus-visible,.cc-ghost:focus-visible,.cc-more:focus-visible,.cc-seg button:focus-visible{outline:2px solid color-mix(in srgb,var(--cc-accent) 55%,transparent);outline-offset:2px}
.cc-note{margin:16px 0 0;padding:10px 12px;border-radius:14px;background:var(--cc-fill);font-size:12.5px;line-height:1.5;color:var(--cc-mute);display:flex;align-items:center;gap:8px}
.cc-note.err{background:#fef2f2;color:#b91c1c}
.cc-dots{display:inline-flex;gap:3px}
.cc-dots i{width:5px;height:5px;border-radius:50%;background:#a1a1aa;animation:ccDot 1.2s ease-in-out infinite}
.cc-dots i:nth-child(2){animation-delay:.15s}.cc-dots i:nth-child(3){animation-delay:.3s}
@keyframes ccDot{0%,80%,100%{opacity:.3;transform:none}40%{opacity:1;transform:translateY(-2px)}}
.cc-run{margin-top:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.cc-err{flex:1;min-width:0;font-size:12px;line-height:1.45;color:#dc2626}
.cc-err.block{display:block;margin:0 0 8px}
.cc-tr{margin-top:14px;padding-top:14px;border-top:1px solid var(--cc-ring)}
.cc-tr-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.cc-seg{display:inline-flex;padding:3px;border-radius:999px;background:var(--cc-fill)}
.cc-seg button{height:28px;padding:0 12px;border:none;border-radius:999px;background:none;color:#71717a;font:inherit;font-size:12px;font-weight:650;cursor:pointer}
.cc-seg button.on{background:var(--card,#fff);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.cc-tr-note{font-size:12px;color:var(--cc-mute)}
.cc-ghost{margin-left:auto;display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 11px;border:none;border-radius:999px;background:none;color:#71717a;font:inherit;font-size:12.5px;font-weight:650;cursor:pointer}
.cc-ghost:hover{background:var(--cc-fill);color:var(--ink)}
.cc-ghost:disabled{cursor:wait;opacity:.7}
.cc-tr-body{max-height:340px;overflow-y:auto;padding-right:4px;scrollbar-width:thin;scrollbar-color:#d4d4d8 transparent}
.cc-turn{display:flex;gap:9px;margin-top:3px}
.cc-turn.first{margin-top:12px}
.cc-turn:first-child{margin-top:0}
.cc-turn-av{width:26px;flex-shrink:0;height:26px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#fff}
.cc-turn.first .cc-turn-av{background:#a1a1aa}
.cc-turn.first.t0 .cc-turn-av{background:var(--cc-accent)}
.cc-turn.first.t1 .cc-turn-av{background:#71717a}
.cc-turn.first.t2 .cc-turn-av{background:#8b5cf6}
.cc-turn.first.t3 .cc-turn-av{background:#f59e0b}
.cc-turn-b{min-width:0;flex:1}
.cc-turn-who{margin:0 0 3px;font-size:12px;font-weight:650;color:var(--cc-mute)}
.cc-turn-text{display:inline-block;max-width:100%;margin:0;padding:8px 12px;border-radius:4px 16px 16px 16px;background:var(--cc-fill);font-size:13.5px;line-height:1.5;color:var(--ink);overflow-wrap:anywhere}
.cc-turn:not(.first) .cc-turn-text{border-radius:16px}
.cc-turn.t0 .cc-turn-text{background:color-mix(in srgb,var(--cc-accent) 10%,var(--card,#fff))}
.cc-tr-plain{margin:0;font-size:13.5px;line-height:1.6;color:var(--ink);white-space:pre-wrap}
.cc-missed-row{display:flex;justify-content:center;margin:8px 0}
.cc-missed{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 13px;border-radius:999px;background:#fef2f2;color:#b91c1c;font-size:12.5px;font-weight:650}
.cc-missed svg{color:#dc2626}
[data-theme="dark"] .cc{--cc-fill:#2a2a2e;--cc-fill-2:#333338;--cc-ring:#2f2f34;--cc-mute:#8e8e93;box-shadow:0 0 0 1px var(--cc-ring)}
[data-theme="dark"] .cc-ic{background:rgba(34,197,94,.16);color:#4ade80}
[data-theme="dark"] .cc-ic.in{background:rgba(59,130,246,.18);color:#93c5fd}
[data-theme="dark"] .cc-ic.vm{background:rgba(245,158,11,.16);color:#fbbf24}
[data-theme="dark"] .cc-dur,[data-theme="dark"] .cc-sh-ic,[data-theme="dark"] .cc-sent{color:#d4d4d8}
[data-theme="dark"] .cc-sent.positive{background:rgba(34,197,94,.16);color:#4ade80}
[data-theme="dark"] .cc-sent.negative{background:rgba(239,68,68,.16);color:#fca5a5}
[data-theme="dark"] .cc-sh-ic.ai,[data-theme="dark"] .cc-pill.ai{background:rgba(139,92,246,.2);color:#c4b5fd}
[data-theme="dark"] .cc-pill.on{background:#f4f4f5;color:#18181b}
[data-theme="dark"] .cc-seg button.on{background:#3a3a3f}
[data-theme="dark"] .cc-note.err,[data-theme="dark"] .cc-missed{background:rgba(239,68,68,.14);color:#fca5a5}
[data-theme="dark"] .cc-turn.t0 .cc-turn-text{background:color-mix(in srgb,var(--cc-accent) 18%,#1c1c1f)}
@media (prefers-reduced-motion: reduce){.cc-dots i{animation:none}}
`
