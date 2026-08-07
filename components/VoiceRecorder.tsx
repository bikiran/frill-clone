'use client'

import { useRef, useState } from 'react'

export type RecordedAudio = { url: string; name: string; type: string; kind: 'audio' }

// Record a voice memo in the browser and upload it through the shared inbox
// upload endpoint, returning an audio attachment for the note.
export default function VoiceRecorder({ companyId, onRecorded }: {
  companyId: string | null
  onRecorded: (a: RecordedAudio) => void
}) {
  const [state, setState] = useState<'idle' | 'recording' | 'uploading'>('idle')
  const [secs, setSecs] = useState(0)
  const [err, setErr] = useState('')
  const recRef = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const tick = useRef<any>(null)

  const start = async () => {
    setErr('')
    if (!navigator.mediaDevices?.getUserMedia) { setErr('Recording isn’t supported here'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '')
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunks.current = []
      rec.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data) }
      rec.onstop = () => upload(rec.mimeType || 'audio/webm')
      recRef.current = rec
      rec.start()
      setState('recording'); setSecs(0)
      tick.current = setInterval(() => setSecs(s => s + 1), 1000)
    } catch { setErr('Microphone access was blocked') }
  }

  const stop = () => {
    clearInterval(tick.current)
    try { recRef.current?.stop() } catch {}
    streamRef.current?.getTracks().forEach(t => t.stop())
  }

  const cancel = () => {
    clearInterval(tick.current)
    chunks.current = []
    try { recRef.current && (recRef.current.onstop = null as any); recRef.current?.stop() } catch {}
    streamRef.current?.getTracks().forEach(t => t.stop())
    setState('idle'); setSecs(0)
  }

  const upload = async (mime: string) => {
    if (!chunks.current.length || !companyId) { setState('idle'); return }
    setState('uploading')
    try {
      const ext = mime.includes('mp4') ? 'm4a' : 'webm'
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
      const blob = new Blob(chunks.current, { type: mime })
      const file = new File([blob], `Voice note ${stamp}.${ext}`, { type: mime })
      const fd = new FormData(); fd.append('file', file); fd.append('companyId', companyId); fd.append('conversationId', 'notes')
      const res = await fetch('/api/inbox/upload', { method: 'POST', body: fd })
      const d = await res.json()
      if (res.ok && d.url) onRecorded({ url: d.url, name: `Voice note ${stamp}`, type: mime, kind: 'audio' })
      else setErr(d.error || 'Upload failed')
    } catch { setErr('Upload failed') } finally { setState('idle'); setSecs(0) }
  }

  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      {state === 'idle' && (
        <button type="button" onClick={start} disabled={!companyId}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          Record voice
        </button>
      )}
      {state === 'recording' && (
        <>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 9, background: '#fee2e2', color: '#b91c1c', fontSize: 13, fontWeight: 700 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#dc2626', animation: 'vr-pulse 1s infinite' }} />
            {mmss}
          </span>
          <button type="button" onClick={stop} style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Stop &amp; save</button>
          <button type="button" onClick={cancel} style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', background: '#fff', color: 'var(--slate)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
        </>
      )}
      {state === 'uploading' && <span style={{ fontSize: 13, color: 'var(--slate)', fontWeight: 600 }}>Saving voice note…</span>}
      {err && <span style={{ fontSize: 12, color: '#dc2626' }}>{err}</span>}
      <style>{`@keyframes vr-pulse { 0%,100% { opacity: 1 } 50% { opacity: .3 } }`}</style>
    </div>
  )
}
