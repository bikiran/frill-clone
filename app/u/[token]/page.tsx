'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'

const ACCEPT_MIME: Record<string, string> = {
  image: 'image/*', video: 'video/*', pdf: 'application/pdf', audio: 'audio/*',
}

export default function UploadPage() {
  const params = useParams()
  const token = (params?.token as string) || ''
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState<any[]>([])
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

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
  const acceptMime = (req?.accept || ['image', 'video', 'pdf']).map((k: string) => ACCEPT_MIME[k]).filter(Boolean).join(',')

  const onFiles = async (files: FileList | null) => {
    if (!files || !files.length) return
    setError(''); setUploading(true)
    const remaining = (req?.max_files || 10) - done.length
    const toUpload = Array.from(files).slice(0, remaining)
    for (const file of toUpload) {
      try {
        const fd = new FormData()
        fd.append('token', token); fd.append('file', file)
        const res = await fetch('/api/media-requests/upload', { method: 'POST', body: fd })
        const d = await res.json()
        if (!res.ok) { setError(d.error || 'Upload failed'); continue }
        setDone(prev => [...prev, { url: d.url, kind: d.kind, name: file.name }])
      } catch { setError('Upload failed. Please try again.') }
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  if (loading) return <Centered accent="#ff7a6b"><p style={{ color: '#6b7280' }}>Loading…</p></Centered>
  if (error && !req) return <Centered accent="#ff7a6b"><p style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a' }}>{error}</p></Centered>

  const expired = req?.status === 'expired'
  const cancelled = req?.status === 'cancelled'

  return (
    <div style={{ minHeight: '100vh', background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 460, background: '#fff', borderRadius: 20, boxShadow: '0 12px 40px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ padding: '24px 28px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 12 }}>
          {data?.company?.logo_url
            ? <img src={data.company.logo_url} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover' }} />
            : <div style={{ width: 40, height: 40, borderRadius: 10, background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800 }}>{(data?.company?.name || 'C')[0]}</div>}
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>{data?.company?.name || 'Upload'}</p>
            <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>Secure file upload</p>
          </div>
        </div>

        <div style={{ padding: 28 }}>
          {expired || cancelled ? (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a' }}>{cancelled ? 'This request was cancelled.' : 'This link has expired.'}</p>
              <p style={{ fontSize: 13.5, color: '#6b7280', marginTop: 6 }}>Please ask for a new link.</p>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 15, color: '#1a1a1a', lineHeight: 1.5, margin: '0 0 6px' }}>{req?.prompt}</p>
              <p style={{ fontSize: 12.5, color: '#9ca3af', margin: '0 0 20px' }}>
                Accepts {(req?.accept || []).join(', ')} · up to {req?.max_files} files · full quality, no compression
              </p>

              {error && <div style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>{error}</div>}

              <button onClick={() => fileRef.current?.click()} disabled={uploading || done.length >= (req?.max_files || 10)}
                style={{ width: '100%', padding: '28px 20px', borderRadius: 14, border: `2px dashed ${accent}`, background: '#fff', cursor: 'pointer', color: accent, fontSize: 15, fontWeight: 700 }}>
                {uploading ? 'Uploading…' : done.length >= (req?.max_files || 10) ? 'Maximum files reached' : '+ Choose files to upload'}
              </button>
              <input ref={fileRef} type="file" accept={acceptMime} multiple onChange={e => onFiles(e.target.files)} style={{ display: 'none' }} />

              {done.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: '#1a1a1a', marginBottom: 10 }}>Uploaded ({done.length})</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {done.map((f, i) => (
                      <div key={i} style={{ position: 'relative', paddingTop: '100%', borderRadius: 10, overflow: 'hidden', background: '#f3f4f6' }}>
                        {f.kind === 'image'
                          ? <img src={f.url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#6b7280', textAlign: 'center', padding: 6 }}>{f.kind.toUpperCase()}</div>}
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 16, textAlign: 'center', padding: '12px', borderRadius: 10, background: '#f0fdf4', color: '#059669', fontSize: 13, fontWeight: 600 }}>
                    ✓ Thank you! Your files have been sent.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div style={{ padding: '10px 28px 18px', textAlign: 'center' }}>
          <p style={{ fontSize: 10.5, color: '#c0c0c0' }}>Files are private and shared only with {data?.company?.name || 'the business'}.</p>
        </div>
      </div>
    </div>
  )
}

function Centered({ children, accent }: { children: React.ReactNode; accent: string }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', padding: 20 }}>{children}</div>
}
