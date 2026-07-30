'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { uploadDirect, compressImage } from '@/lib/upload-attachment'

const ACCEPT_MIME: Record<string, string> = {
  image: 'image/*', video: 'video/*', pdf: 'application/pdf', audio: 'audio/*',
}

type Status = 'pending' | 'uploading' | 'done' | 'error'
type Item = {
  id: string
  file: File
  name: string
  kind: 'image' | 'video' | 'pdf' | 'audio' | 'file'
  preview: string | null
  progress: number   // 0..1
  status: Status
  url?: string
  error?: string
}

function kindOf(type: string): Item['kind'] {
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  if (type === 'application/pdf') return 'pdf'
  return 'file'
}

// Grab a poster frame from a video entirely in the browser, so each video tile
// shows a real thumbnail instead of a grey box.
function videoPoster(file: File): Promise<string | null> {
  return new Promise(resolve => {
    try {
      const url = URL.createObjectURL(file)
      const video = document.createElement('video')
      video.muted = true; video.playsInline = true; video.preload = 'metadata'; video.src = url
      const cleanup = () => { try { URL.revokeObjectURL(url) } catch {} }
      video.onloadeddata = () => { try { video.currentTime = Math.min(0.15, (video.duration || 1) / 2) } catch { cleanup(); resolve(null) } }
      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas')
          const scale = Math.min(1, 480 / Math.max(video.videoWidth || 1, video.videoHeight || 1))
          canvas.width = Math.max(1, Math.round((video.videoWidth || 320) * scale))
          canvas.height = Math.max(1, Math.round((video.videoHeight || 240) * scale))
          const ctx = canvas.getContext('2d')
          if (!ctx) { cleanup(); resolve(null); return }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
          cleanup(); resolve(dataUrl)
        } catch { cleanup(); resolve(null) }
      }
      video.onerror = () => { cleanup(); resolve(null) }
      setTimeout(() => { cleanup(); resolve(null) }, 4000)
    } catch { resolve(null) }
  })
}

export default function UploadPage() {
  const params = useParams()
  const token = (params?.token as string) || ''
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const idRef = useRef(0)

  useEffect(() => {
    if (!token) return
    ;(async () => {
      try {
        const res = await fetch(`/api/media-requests?token=${token}`)
        const d = await res.json()
        if (!res.ok) { setError(d.error === 'not_found' ? 'This upload link is invalid.' : (d.error || 'Something went wrong.')); }
        else setData(d)
      } catch { setError('Something went wrong.') } finally { setLoading(false) }
    })()
  }, [token])

  const accent = data?.company?.accent_color || '#ff7a6b'
  const req = data?.request
  const maxFiles = req?.max_files || 10
  const acceptMime = (req?.accept || ['image', 'video', 'pdf']).map((k: string) => ACCEPT_MIME[k]).filter(Boolean).join(',')

  const patch = (id: string, p: Partial<Item>) => setItems(prev => prev.map(x => x.id === id ? { ...x, ...p } : x))

  // Upload a single item: compress images, push straight to storage (with live
  // progress), then register the URL. Falls back to posting the file itself when
  // direct upload isn't available.
  const uploadItem = async (item: Item) => {
    patch(item.id, { status: 'uploading', progress: 0, error: undefined })
    try {
      let file: File = item.file
      if (item.kind === 'image') {
        try { file = await compressImage(item.file) } catch {}
      }
      let directUrl: string | null = null
      try {
        directUrl = await uploadDirect(file, `media-requests/${token}`, item.name, (p) => patch(item.id, { progress: Math.max(0.02, p) }))
      } catch {}

      const fd = new FormData()
      fd.append('token', token)
      if (directUrl) {
        fd.append('url', directUrl); fd.append('name', item.name); fd.append('type', file.type); fd.append('size', String(file.size))
      } else {
        fd.append('file', file)
        patch(item.id, { progress: 0.9 })
      }
      const res = await fetch('/api/media-requests/upload', { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { patch(item.id, { status: 'error', progress: 0, error: d.error || 'Upload failed' }); return }
      patch(item.id, { status: 'done', progress: 1, url: d.url, kind: d.kind || item.kind })
    } catch {
      patch(item.id, { status: 'error', progress: 0, error: 'Upload failed. Please try again.' })
    }
  }

  // Run the queue a few at a time so several files move at once (much faster
  // than one-by-one) without hammering the connection.
  const runQueue = async (queue: Item[]) => {
    setUploading(true)
    const CONCURRENCY = 3
    let idx = 0
    const worker = async () => {
      while (idx < queue.length) {
        const it = queue[idx++]
        await uploadItem(it)
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))
    setUploading(false)
  }

  const addFiles = (files: File[]) => {
    if (!files.length) return
    setError('')
    // Count everything that isn't a failed attempt against the limit.
    const used = items.filter(i => i.status !== 'error').length
    const remaining = maxFiles - used
    if (remaining <= 0) { setError('Maximum number of files reached.'); return }
    const accepted: File[] = []
    for (const f of files) {
      if (accepted.length >= remaining) break
      const k = kindOf(f.type)
      if (Array.isArray(req?.accept) && req.accept.length && !req.accept.includes(k)) continue
      accepted.push(f)
    }
    if (!accepted.length) { setError("Those file types aren't accepted for this request."); return }

    const newItems: Item[] = accepted.map(f => ({
      id: `f${idRef.current++}`,
      file: f,
      name: f.name,
      kind: kindOf(f.type),
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
      progress: 0,
      status: 'pending' as Status,
    }))
    setItems(prev => [...prev, ...newItems])
    // Generate video thumbnails in the background — tiles show instantly and
    // fill in their poster once it's ready.
    newItems.forEach(it => {
      if (it.kind === 'video') videoPoster(it.file).then(url => { if (url) patch(it.id, { preview: url }) })
    })
    runQueue(newItems)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    addFiles(Array.from(e.dataTransfer.files || []))
  }

  if (loading) return <Centered><p style={{ color: '#6b7280' }}>Loading…</p></Centered>
  if (error && !req) return <Centered><p style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a' }}>{error}</p></Centered>

  const expired = req?.status === 'expired'
  const cancelled = req?.status === 'cancelled'

  // ── Progress summary ──────────────────────────────────────────────────────
  const total = items.length
  const doneCount = items.filter(i => i.status === 'done').length
  const activeCount = items.filter(i => i.status === 'pending' || i.status === 'uploading').length
  const errorCount = items.filter(i => i.status === 'error').length
  const overall = total ? Math.round((items.reduce((s, i) => s + (i.status === 'done' ? 1 : i.progress), 0) / total) * 100) : 0
  const allDone = total > 0 && activeCount === 0 && errorCount === 0
  const used = items.filter(i => i.status !== 'error').length
  const full = used >= maxFiles

  return (
    <div style={{ minHeight: '100vh', background: '#f6f7f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <style>{`@keyframes uSpin { to { transform: rotate(360deg); } } @keyframes uPop { from { transform: scale(0.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 22, boxShadow: '0 18px 50px rgba(0,0,0,0.10)', overflow: 'hidden' }}>
        <div style={{ padding: '22px 26px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 12 }}>
          {data?.company?.logo_url
            ? <img src={data.company.logo_url} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover' }} />
            : <div style={{ width: 40, height: 40, borderRadius: 10, background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800 }}>{(data?.company?.name || 'C')[0]}</div>}
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>{data?.company?.name || 'Upload'}</p>
            <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>Secure file upload</p>
          </div>
        </div>

        <div style={{ padding: 26 }}>
          {expired || cancelled ? (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a' }}>{cancelled ? 'This request was cancelled.' : 'This link has expired.'}</p>
              <p style={{ fontSize: 13.5, color: '#6b7280', marginTop: 6 }}>Please ask for a new link.</p>
            </div>
          ) : (
            <>
              {req?.prompt && <p style={{ fontSize: 15.5, color: '#1a1a1a', lineHeight: 1.5, margin: '0 0 6px', fontWeight: 600 }}>{req.prompt}</p>}
              <p style={{ fontSize: 12.5, color: '#9ca3af', margin: '0 0 18px' }}>
                Accepts {(req?.accept || []).join(', ')} · up to {maxFiles} files · photos optimised for a fast upload
              </p>

              {error && <div style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>{error}</div>}

              {/* Dropzone */}
              {!full && (
                <div
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); if (!dragOver) setDragOver(true) }}
                  onDragLeave={e => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDragOver(false) }}
                  onDrop={onDrop}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '30px 20px', borderRadius: 16, cursor: 'pointer', textAlign: 'center',
                    border: `2px dashed ${dragOver ? accent : '#d7dbe0'}`,
                    background: dragOver ? hexA(accent, 0.08) : '#fafbfc', transition: 'all 0.15s',
                  }}>
                  <div style={{ width: 46, height: 46, borderRadius: 14, background: hexA(accent, 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  </div>
                  <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: '#1a1a1a' }}>{dragOver ? 'Drop to upload' : 'Tap to choose files'}</p>
                  <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>or drag &amp; drop them here</p>
                </div>
              )}
              <input ref={fileRef} type="file" accept={acceptMime} multiple onChange={e => { addFiles(Array.from(e.target.files || [])); if (fileRef.current) fileRef.current.value = '' }} style={{ display: 'none' }} />

              {/* Progress summary */}
              {total > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1a1a1a' }}>
                      {allDone ? `${doneCount} file${doneCount === 1 ? '' : 's'} uploaded` : `Uploaded ${doneCount} of ${total}`}
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: allDone ? '#059669' : accent }}>
                      {allDone ? '✓ Done' : `${overall}%`}
                    </span>
                  </div>
                  <div style={{ height: 7, borderRadius: 4, background: '#eef0f2', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${overall}%`, background: allDone ? '#22c55e' : accent, borderRadius: 4, transition: 'width 0.25s ease' }} />
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11.5, color: '#9ca3af', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {activeCount > 0 && <span>{activeCount} remaining</span>}
                    {errorCount > 0 && <span style={{ color: '#dc2626', fontWeight: 600 }}>{errorCount} failed</span>}
                    <span style={{ marginLeft: 'auto' }}>{used}/{maxFiles} files</span>
                  </div>
                </div>
              )}

              {/* File tiles */}
              {total > 0 && (
                <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {items.map(it => (
                    <div key={it.id} style={{ position: 'relative', paddingTop: '100%', borderRadius: 12, overflow: 'hidden', background: '#f1f3f5', border: '1px solid #eceef1' }}>
                      {/* Thumbnail */}
                      {it.preview
                        ? <img src={it.preview} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9aa1ab' }}>
                            <FileGlyph kind={it.kind} />
                          </div>}

                      {/* Video play badge */}
                      {it.kind === 'video' && it.status === 'done' && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                          <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                          </span>
                        </div>
                      )}

                      {/* Uploading overlay */}
                      {(it.status === 'uploading' || it.status === 'pending') && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.55)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, backdropFilter: 'blur(1px)' }}>
                          <ProgressRing value={it.progress} accent={accent} />
                        </div>
                      )}

                      {/* Done check */}
                      {it.status === 'done' && (
                        <span style={{ position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: '50%', background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.25)', animation: 'uPop 0.2s ease' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        </span>
                      )}

                      {/* Error overlay + retry */}
                      {it.status === 'error' && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(220,38,38,0.10)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 6, textAlign: 'center' }}>
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#dc2626' }}>Failed</span>
                          <button type="button" onClick={() => uploadItem(it)}
                            style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 7, border: `1px solid ${accent}`, background: '#fff', color: accent, cursor: 'pointer' }}>Retry</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {allDone && (
                <div style={{ marginTop: 16, textAlign: 'center', padding: '12px', borderRadius: 12, background: '#f0fdf4', color: '#059669', fontSize: 13, fontWeight: 700 }}>
                  ✓ Thank you! Your files have been sent.
                </div>
              )}
            </>
          )}
        </div>
        <div style={{ padding: '10px 26px 18px', textAlign: 'center' }}>
          <p style={{ fontSize: 10.5, color: '#c0c0c0' }}>Files are private and shared only with {data?.company?.name || 'the business'}.</p>
        </div>
      </div>
    </div>
  )
}

// A compact circular progress indicator for each uploading tile.
function ProgressRing({ value, accent }: { value: number; accent: string }) {
  const r = 15, c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, value))
  return (
    <div style={{ position: 'relative', width: 40, height: 40 }}>
      <svg width="40" height="40" viewBox="0 0 40 40" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="20" cy="20" r={r} fill="none" stroke="#e5e7eb" strokeWidth="4" />
        <circle cx="20" cy="20" r={r} fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: 'stroke-dashoffset 0.2s ease' }} />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#374151' }}>
        {Math.round(pct * 100)}
      </span>
    </div>
  )
}

function FileGlyph({ kind }: { kind: Item['kind'] }) {
  if (kind === 'pdf') return <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5 }}>PDF</div>
  if (kind === 'video') return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
  return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
}

// Turn a hex accent into an rgba string at a given alpha (for tints).
function hexA(hex: string, a: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return `rgba(255,122,107,${a})`
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f6f7f9', padding: 20 }}>{children}</div>
}
