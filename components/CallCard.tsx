'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

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

const SENTIMENT: Record<string, { label: string; color: string; bg: string }> = {
  positive: { label: 'Positive', color: '#15803d', bg: '#dcfce7' },
  neutral:  { label: 'Neutral',  color: '#6b7280', bg: '#f3f4f6' },
  negative: { label: 'Negative', color: '#dc2626', bg: '#fee2e2' },
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function CallCard({ callId, meta, timestamp }: { callId: string; meta?: any; timestamp?: string }) {
  const [call, setCall] = useState<any>(null)
  const [expanded, setExpanded] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [retryMsg, setRetryMsg] = useState('')

  // Run transcription + AI summary on demand. Also the escape hatch when the
  // automatic run after the call didn't happen (e.g. the tab was closed before
  // the upload finished, or the STT key was added after the call).
  const runTranscription = async () => {
    setRetrying(true); setRetryMsg('')
    try {
      const res = await fetch('/api/telnyx/transcribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId }),
      })
      const d = await res.json()
      if (d?.ok) { await load(); setRetryMsg('') }
      else setRetryMsg(d?.reason || d?.error || 'Could not transcribe this call.')
    } catch (e: any) {
      setRetryMsg(e?.message || 'Could not transcribe this call.')
    } finally { setRetrying(false) }
  }

  const load = async () => {
    if (!callId) return
    const { data } = await (supabase as any).from('calls').select('*').eq('id', callId).maybeSingle()
    if (data) setCall(data)
  }

  useEffect(() => { load() }, [callId])

  // The recording uploads and transcribes AFTER the call ends, so poll briefly
  // until the summary lands — otherwise the card would sit empty until reload.
  useEffect(() => {
    if (!callId) return
    if (call?.ai_summary || call?.transcription) return
    let n = 0
    const iv = setInterval(() => {
      n++
      load()
      if (n > 20) clearInterval(iv)   // give up after ~2 min
    }, 6000)
    return () => clearInterval(iv)
  }, [callId, call?.ai_summary, call?.transcription])

  const duration = call?.duration_seconds ?? meta?.duration_seconds ?? 0
  const inbound = (call?.direction || meta?.direction) === 'inbound'
  const sent = call?.sentiment ? SENTIMENT[call.sentiment] : null
  const todos: string[] = Array.isArray(call?.ai_todos) ? call.ai_todos : []
  const summary: string = call?.ai_summary || ''
  const longSummary = summary.length > 180

  return (
    <div style={{ maxWidth: 560, margin: '10px auto', background: '#f7f9fc', border: '1px solid #e3e9f2', borderRadius: 14, padding: 14 }}>
      {/* Header: direction + duration */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: summary || call?.recording_url ? 12 : 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', background: '#dcfce7', color: '#15803d' }}>
          {PhoneIcon(13)}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
            {inbound ? 'Call received' : 'Call made'} · {fmt(duration)}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--slate)' }}>
            {(call?.agent_name || meta?.agent_name) ? `Handled by ${call?.agent_name || meta?.agent_name}` : ''}
            {timestamp ? ` · ${new Date(timestamp).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}
          </p>
        </div>
        {sent && (
          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: sent.bg, color: sent.color }}>
            {sent.label}
          </span>
        )}
      </div>

      {/* AI summary */}
      {summary && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ margin: '0 0 6px', fontSize: 12.5, fontWeight: 700, color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: 6 }}>
            <SparkIcon /> Call Summary
          </p>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--ink)' }}>
            {expanded || !longSummary ? summary : `${summary.slice(0, 180).trim()}…`}
          </p>
          {longSummary && (
            <button type="button" onClick={() => setExpanded(v => !v)}
              style={{ marginTop: 4, background: 'none', border: 'none', padding: 0, color: '#2563eb', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              {expanded ? 'Read Less' : 'Read More'}
            </button>
          )}
        </div>
      )}

      {/* Action items */}
      {expanded && todos.length > 0 && (
        <div style={{ marginBottom: 12, paddingTop: 12, borderTop: '1px solid #e3e9f2' }}>
          <p style={{ margin: '0 0 6px', fontSize: 12.5, fontWeight: 700, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ClockIcon /> Action Items
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {todos.map((t, i) => (
              <li key={i} style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink)', marginBottom: 3 }}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Contact Information — Coax lists who the call was with, pulled from
          the AI's read of the transcript plus the linked contact record. */}
      {expanded && (call?.contact_name || call?.to_number || call?.from_number) && (
        <div style={{ marginBottom: 12, paddingTop: 12, borderTop: '1px solid #e3e9f2' }}>
          <p style={{ margin: '0 0 6px', fontSize: 12.5, fontWeight: 700, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 6 }}>
            <PersonIcon /> Contact Information
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {call?.contact_name && <li style={{ fontSize: 12.5, color: 'var(--ink)', marginBottom: 3 }}>{call.contact_name}</li>}
            <li style={{ fontSize: 12.5, color: 'var(--ink)' }}>{inbound ? call?.from_number : call?.to_number}</li>
          </ul>
        </div>
      )}

      {/* Recording */}
      {call?.recording_url ? (
        <div style={{ paddingTop: 12, borderTop: '1px solid #e3e9f2' }}>
          <p style={{ margin: '0 0 7px', fontSize: 12.5, fontWeight: 700, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 6 }}>
            <MicIcon /> Call Recording
          </p>
          <audio controls src={call.recording_url} style={{ width: '100%', height: 34 }} />
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <a href={call.recording_url} download
              style={{ fontSize: 12, fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}>
              Download recording
            </a>
            {call?.transcription && (
              <button type="button" onClick={() => setShowTranscript(v => !v)}
                style={{ background: 'none', border: 'none', padding: 0, color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <DocIcon /> {showTranscript ? 'Hide' : 'View'} transcription
              </button>
            )}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #e3e9f2' }}>
          {call?.recording_error ? (
            <p style={{ margin: 0, fontSize: 11.5, color: '#dc2626', lineHeight: 1.5 }}>
              {call.recording_error}
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--slate)', fontStyle: 'italic' }}>
              Recording uploading…
            </p>
          )}
        </div>
      )}

      {/* No summary yet? Say why, and offer to run it — rather than an empty
          card that gives no clue whether it's still working or has failed. */}
      {call?.recording_url && !summary && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #e3e9f2', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={runTranscription} disabled={retrying}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #c7d7f0', background: '#fff', color: '#2563eb', fontSize: 12, fontWeight: 700, cursor: retrying ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <SparkIcon /> {retrying ? 'Transcribing…' : (call?.transcription ? 'Generate AI summary' : 'Transcribe & summarise')}
          </button>
          {retryMsg && <span style={{ fontSize: 11.5, color: '#dc2626', flex: 1, minWidth: 0, lineHeight: 1.45 }}>{retryMsg}</span>}
        </div>
      )}

      {/* Transcript */}
      {showTranscript && call?.transcription && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #e3e9f2', maxHeight: 260, overflowY: 'auto' }}>
          {Array.isArray(call.transcript_segments) && call.transcript_segments.length ? (
            call.transcript_segments.map((seg: any, i: number) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase' }}>{seg.speaker}</p>
                <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink)' }}>{seg.text}</p>
              </div>
            ))
          ) : (
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>{call.transcription}</p>
          )}
        </div>
      )}
    </div>
  )
}
