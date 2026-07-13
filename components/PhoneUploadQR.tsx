'use client'

import { useEffect, useRef, useState } from 'react'

// Show a QR code the team scans to upload photos from their phone straight into
// the gallery. Polls the session so the desktop reacts live as files land.
export default function PhoneUploadQR({
  companyId, folderId, onClose, onUploaded,
}: {
  companyId: string
  folderId?: string | null
  onClose: () => void
  onUploaded?: () => void
}) {
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [expiresAt, setExpiresAt] = useState<string>('')
  const [uploaded, setUploaded] = useState(0)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const lastCount = useRef(0)

  // Open a session.
  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/upload-session', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, folderId, minutes: 30 }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error || 'Could not create the upload link')
        setUrl(d.url); setToken(d.token); setExpiresAt(d.expiresAt)
      } catch (e: any) { setError(e.message) }
    })()
  }, [companyId, folderId])

  // Poll for uploads so the desktop updates as the phone sends files.
  useEffect(() => {
    if (!token) return
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`/api/upload-session?token=${token}`)
        const d = await res.json()
        if (d.ok) {
          setUploaded(d.uploaded || 0)
          if ((d.uploaded || 0) > lastCount.current) {
            lastCount.current = d.uploaded
            onUploaded?.()
          }
        }
      } catch {}
    }, 2500)
    return () => clearInterval(iv)
  }, [token, onUploaded])

  // Countdown so people know the link is short-lived.
  const [left, setLeft] = useState('')
  useEffect(() => {
    if (!expiresAt) return
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now()
      if (ms <= 0) { setLeft('expired'); return }
      const m = Math.floor(ms / 60000)
      const s = Math.floor((ms % 60000) / 1000)
      setLeft(`${m}:${String(s).padStart(2, '0')}`)
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [expiresAt])

  // Free QR image service — no dependency to add, and the URL is not sensitive
  // beyond the token, which is already short-lived and single-purpose.
  const qrSrc = url
    ? `https://api.qrserver.com/v1/create-qr-code/?size=440x440&margin=0&data=${encodeURIComponent(url)}`
    : ''

  const copy = () => {
    navigator.clipboard?.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(6,8,14,0.72)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: 20 }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          width: 420, maxWidth: '95vw', borderRadius: 24, padding: 30,
          background: 'linear-gradient(160deg, #12151d 0%, #0b0d12 100%)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 24px 70px rgba(0,0,0,0.5)',
          color: '#fff', position: 'relative', overflow: 'hidden',
          fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        }}>
        <style>{`
          @keyframes qrGlow { 0%,100% { opacity: .5; } 50% { opacity: .9; } }
          @keyframes scanLine { 0% { top: 6%; } 100% { top: 94%; } }
          @keyframes popIn { from { opacity: 0; transform: scale(.96); } to { opacity: 1; transform: scale(1); } }
        `}</style>

        {/* Ambient glow */}
        <div style={{ position: 'absolute', top: -70, right: -70, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,122,107,0.35), transparent 68%)', filter: 'blur(38px)', animation: 'qrGlow 4s ease-in-out infinite', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -70, left: -70, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.30), transparent 68%)', filter: 'blur(38px)', animation: 'qrGlow 5s ease-in-out infinite reverse', pointerEvents: 'none' }} />

        <button onClick={onClose}
          style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: '#7c8598', display: 'flex', padding: 4, zIndex: 2 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>

        <div style={{ position: 'relative', textAlign: 'center' }}>
          <p style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em' }}>Upload from your phone</p>
          <p style={{ margin: '0 0 22px', fontSize: 13.5, color: '#9aa3b2', lineHeight: 1.5 }}>
            Scan with your camera, then pick photos from your gallery.
          </p>

          {error ? (
            <p style={{ color: '#ef4444', fontSize: 13.5, padding: 30 }}>{error}</p>
          ) : !url ? (
            <p style={{ color: '#9aa3b2', fontSize: 13.5, padding: 60 }}>Preparing your link…</p>
          ) : (
            <>
              {/* QR with scan-line flourish */}
              <div style={{ position: 'relative', display: 'inline-block', padding: 14, borderRadius: 20, background: '#fff', animation: 'popIn .35s ease-out', boxShadow: '0 0 44px rgba(255,122,107,0.28)' }}>
                <img src={qrSrc} alt="QR code" width={220} height={220} style={{ display: 'block', borderRadius: 8 }} />
                <span style={{ position: 'absolute', left: 14, right: 14, height: 2, background: 'linear-gradient(90deg, transparent, #ff7a6b, transparent)', animation: 'scanLine 2.4s ease-in-out infinite alternate', pointerEvents: 'none' }} />
              </div>

              {/* Live status */}
              <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: uploaded > 0 ? '#22c55e' : '#ff7a6b', boxShadow: `0 0 10px ${uploaded > 0 ? '#22c55e' : '#ff7a6b'}` }} />
                <span style={{ fontSize: 13.5, fontWeight: 600, color: uploaded > 0 ? '#22c55e' : '#9aa3b2' }}>
                  {uploaded > 0
                    ? `${uploaded} file${uploaded === 1 ? '' : 's'} uploaded`
                    : 'Waiting for your phone…'}
                </span>
              </div>

              <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#5b6474' }}>
                Link expires in {left || '—'}
              </p>

              {/* Fallback: copy the link */}
              <button onClick={copy}
                style={{ marginTop: 18, width: '100%', padding: '11px 0', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {copied ? 'Link copied ✓' : 'Copy link instead'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
