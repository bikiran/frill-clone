'use client'

import { useEffect, useRef, useState } from 'react'

// Colvy Voice for the web — the Whispr-Flow-style dictation the mobile app has.
// Click the mic to record, click again to stop; the clip is transcribed by the
// shared /api/transcribe endpoint (Deepgram/Whisper + a Claude polish pass) and
// the clean text is handed back via onText to drop into the focused field.
//
// Browser-only: uses getUserMedia + MediaRecorder. Records webm where supported
// (Chrome/Firefox/Edge) or mp4 (Safari); the endpoint accepts both.

type Phase = 'idle' | 'recording' | 'busy'

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/mpeg']
  for (const m of candidates) { try { if (MediaRecorder.isTypeSupported(m)) return m } catch {} }
  return ''
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any)
  }
  return btoa(binary)
}

export default function VoiceDictationButton({ onText, keyterms, title = 'Voice type', size = 34 }: {
  onText: (text: string) => void
  keyterms?: string[]
  title?: string
  size?: number
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [secs, setSecs] = useState(0)
  const [err, setErr] = useState('')
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const mimeRef = useRef<string>('')
  const timerRef = useRef<any>(null)
  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

  // Tidy up the stream/timer if the component unmounts mid-recording.
  useEffect(() => () => {
    try { recRef.current?.stop() } catch {}
    streamRef.current?.getTracks().forEach(t => t.stop())
    clearInterval(timerRef.current)
  }, [])

  const stopTracks = () => { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null }

  const begin = async () => {
    setErr('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = pickMime()
      mimeRef.current = mime
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = e => { if (e.data && e.data.size) chunksRef.current.push(e.data) }
      rec.onstop = () => { void transcribe() }
      rec.start()
      recRef.current = rec
      setPhase('recording'); setSecs(0)
      timerRef.current = setInterval(() => setSecs(s => s + 1), 1000)
    } catch (e: any) {
      stopTracks()
      setErr(e?.name === 'NotAllowedError' ? 'Microphone permission denied.' : (e?.message || 'Could not start recording.'))
    }
  }

  const finish = () => {
    clearInterval(timerRef.current)
    setPhase('busy')
    try { recRef.current?.stop() } catch { void transcribe() }
  }

  const transcribe = async () => {
    stopTracks()
    try {
      const blob = new Blob(chunksRef.current, { type: mimeRef.current || 'audio/webm' })
      if (!blob.size) { setErr('Nothing recorded — try again.'); setPhase('idle'); return }
      const audio = await blobToBase64(blob)
      const isMp4 = (mimeRef.current || '').includes('mp4')
      const res = await fetch('/api/transcribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio,
          mime: mimeRef.current || 'audio/webm',
          filename: isMp4 ? 'dictation.mp4' : 'dictation.webm',
          keyterms: (keyterms || []).filter(Boolean).slice(0, 40),
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d?.error || `Transcription failed (${res.status}).`); setPhase('idle'); return }
      const text = (d?.text || '').trim()
      if (text) onText(text)
      else setErr('No speech detected — try again.')
    } catch (e: any) {
      setErr(e?.message || 'Transcription failed.')
    } finally {
      setPhase('idle'); setSecs(0)
    }
  }

  if (!supported) return null

  const toggle = () => {
    if (phase === 'idle') begin()
    else if (phase === 'recording') finish()
    // 'busy' → ignore
  }

  const recording = phase === 'recording'
  const busy = phase === 'busy'
  const label = recording ? `Stop (${String(Math.floor(secs / 60)).padStart(1, '0')}:${String(secs % 60).padStart(2, '0')})` : busy ? 'Transcribing…' : title

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={err || label}
      aria-label={label}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        height: size, minWidth: size, padding: recording || busy ? '0 10px' : 0,
        borderRadius: size / 2, cursor: busy ? 'default' : 'pointer', flexShrink: 0,
        border: '1px solid ' + (recording ? '#dc2626' : 'var(--border)'),
        background: recording ? '#fef2f2' : (busy ? 'var(--canvas)' : '#fff'),
        color: recording ? '#dc2626' : 'var(--slate)', transition: 'all 0.12s',
      }}
    >
      {busy ? (
        <svg width="16" height="16" viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite' }}><path fill="currentColor" d="M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8z" /></svg>
      ) : recording ? (
        <>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: '#dc2626', flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 700 }}>{label.replace('Stop ', '')}</span>
        </>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </button>
  )
}
