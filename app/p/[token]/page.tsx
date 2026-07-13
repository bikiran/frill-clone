'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

interface Item {
  id: string
  name: string
  status: 'uploading' | 'done' | 'error'
  progress: number
  preview?: string
  error?: string
}

// The page you land on after scanning the QR. Designed for one-handed phone use:
// one big tap target, live progress, and honest per-file errors.
export default function PhoneUpload() {
  const { token } = useParams<{ token: string }>()
  const fileRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<Item[]>([])
  const [expired, setExpired] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(`/api/upload-session?token=${token}`)
        const d = await res.json()
        if (!res.ok || d.expired) setExpired(true)
      } catch { setExpired(true) }
      finally { setChecking(false) }
    })()
  }, [token])

  const pick = (files: FileList | null) => {
    if (!files?.length) return
    Array.from(files).forEach(f => uploadOne(f))
  }

  const uploadOne = async (file: File) => {
    const id = Math.random().toString(36).slice(2)
    const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
    setItems(prev => [...prev, { id, name: file.name, status: 'uploading', progress: 0, preview }])

    const fail = (msg: string) => {
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'error', error: msg } : i))
    }

    try {
      // 1. Ask for a signed URL. The file itself goes STRAIGHT to storage —
      //    routing it through our API capped uploads at a few megabytes, which
      //    is why every video failed.
      const signRes = await fetch('/api/upload-session/sign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, fileName: file.name, contentType: file.type }),
      })
      const sign = await signRes.json()
      if (!signRes.ok) { fail(sign.error || 'Could not start the upload'); return }

      // 2. PUT the bytes directly to storage, with real progress.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', sign.signedUrl)
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return
          // Leave a little headroom for the "recording it" step.
          const pct = Math.round((e.loaded / e.total) * 95)
          setItems(prev => prev.map(i => i.id === id ? { ...i, progress: pct } : i))
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`Upload failed (${xhr.status})`))
        }
        xhr.onerror = () => reject(new Error('Network error — check your connection'))
        xhr.send(file)
      })

      // 3. Record it in the gallery.
      const doneRes = await fetch('/api/upload-session/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, path: sign.path, fileName: file.name, contentType: file.type }),
      })
      const done = await doneRes.json()
      if (!doneRes.ok) { fail(done.error || 'Uploaded, but could not save it to the gallery'); return }

      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'done', progress: 100 } : i))
    } catch (e: any) {
      fail(e?.message || 'Upload failed')
    }
  }

  const done = items.filter(i => i.status === 'done').length
  const failed = items.filter(i => i.status === 'error').length

  return (
    <div style={{
      minHeight: '100dvh', background: '#0b0d12', color: '#fff',
      fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      padding: '28px 20px 40px', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column',
    }}>
      <style>{`
        @keyframes auroraShift { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(6%, -4%) scale(1.15); } }
        @keyframes ringPulse { 0% { transform: scale(1); opacity: .55; } 100% { transform: scale(1.5); opacity: 0; } }
        @keyframes floatUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      `}</style>

      {/* Ambient glow */}
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '-15%', left: '-10%', width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,122,107,0.35), transparent 65%)', filter: 'blur(40px)', animation: 'auroraShift 12s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '-10%', right: '-12%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.30), transparent 65%)', filter: 'blur(40px)', animation: 'auroraShift 15s ease-in-out infinite reverse' }} />
      </div>

      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 440, margin: '0 auto', width: '100%' }}>
        {checking ? (
          <p style={{ textAlign: 'center', color: '#9aa3b2', marginTop: 80 }}>Checking link…</p>
        ) : expired ? (
          <div style={{ textAlign: 'center', marginTop: 90, animation: 'floatUp .4s ease-out' }}>
            <div style={{ width: 62, height: 62, borderRadius: 18, background: 'rgba(239,68,68,0.14)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16.5" x2="12.01" y2="16.5"/></svg>
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 8px' }}>This link has expired</h1>
            <p style={{ fontSize: 14, color: '#9aa3b2', margin: 0, lineHeight: 1.5 }}>
              Upload links are short-lived for security. Generate a fresh QR code on the computer and scan again.
            </p>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: 26, animation: 'floatUp .4s ease-out' }}>
              <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.01em' }}>Upload from your phone</h1>
              <p style={{ fontSize: 14, color: '#9aa3b2', margin: 0, lineHeight: 1.5 }}>
                Pick photos or videos from your gallery. They&rsquo;ll appear in your Colvy gallery instantly.
              </p>
            </div>

            {/* The one big tap target */}
            <button onClick={() => fileRef.current?.click()}
              style={{
                position: 'relative', width: '100%', padding: '30px 20px', borderRadius: 22,
                background: 'linear-gradient(135deg, rgba(255,122,107,0.16), rgba(99,102,241,0.16))',
                border: '1px solid rgba(255,255,255,0.14)', color: '#fff', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                backdropFilter: 'blur(10px)', marginBottom: 22, animation: 'floatUp .5s ease-out',
              }}>
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                <span style={{ position: 'absolute', inset: -10, borderRadius: '50%', border: '2px solid rgba(255,122,107,0.5)', animation: 'ringPulse 2s ease-out infinite' }} />
                <span style={{ width: 58, height: 58, borderRadius: '50%', background: 'linear-gradient(135deg,#ff7a6b,#ff9a7b)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 28px rgba(255,122,107,0.45)' }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </span>
              </span>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Choose from gallery</span>
              <span style={{ fontSize: 12.5, color: '#9aa3b2' }}>Photos and videos · full quality</span>
            </button>

            <input ref={fileRef} type="file" accept="image/*,video/*" multiple
              style={{ display: 'none' }}
              onChange={e => { pick(e.target.files); e.target.value = '' }} />

            {/* Progress */}
            {items.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#9aa3b2', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {done} of {items.length} uploaded
                  </span>
                  {failed > 0 && <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 700 }}>{failed} failed</span>}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {items.map(i => (
                    <div key={i.id} style={{
                      display: 'flex', alignItems: 'center', gap: 11, padding: 10, borderRadius: 14,
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
                      animation: 'floatUp .3s ease-out',
                    }}>
                      {i.preview ? (
                        <img src={i.preview} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(255,255,255,0.08)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9aa3b2" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                        </div>
                      )}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name}</p>
                        {i.status === 'error' ? (
                          <p style={{ margin: '3px 0 0', fontSize: 11.5, color: '#ef4444' }}>{i.error}</p>
                        ) : (
                          <div style={{ marginTop: 6, height: 4, borderRadius: 3, background: 'rgba(255,255,255,0.10)', overflow: 'hidden' }}>
                            <div style={{
                              width: `${i.progress}%`, height: '100%', borderRadius: 3,
                              background: i.status === 'done' ? '#22c55e' : 'linear-gradient(90deg,#ff7a6b,#ff9a7b)',
                              transition: 'width .2s ease',
                            }} />
                          </div>
                        )}
                      </div>

                      <span style={{ flexShrink: 0, width: 22, display: 'flex', justifyContent: 'center' }}>
                        {i.status === 'done' && (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.6" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                        )}
                        {i.status === 'error' && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        )}
                      </span>
                    </div>
                  ))}
                </div>

                {done > 0 && done === items.length && (
                  <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13.5, color: '#22c55e', fontWeight: 700, animation: 'floatUp .3s ease-out' }}>
                    All done — they&rsquo;re in your gallery. You can close this page.
                  </p>
                )}
              </>
            )}
          </>
        )}

        <p style={{ textAlign: 'center', fontSize: 11, color: '#5b6474', marginTop: 'auto', paddingTop: 26 }}>
          Secured by Colvy
        </p>
      </div>
    </div>
  )
}
