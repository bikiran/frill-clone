'use client'

import { useRef, useState } from 'react'
import MediaLightbox from '@/components/MediaLightbox'

// Reusable image/video attachment uploader. Uploads through the existing
// /api/inbox/upload endpoint (R2 or Supabase storage) and keeps a list of
// { url, name, type, kind, size } on the parent. Used on calendar events and
// tasks.
export type Attachment = { url: string; name?: string; type?: string; kind?: string; size?: number }

export default function AttachmentUploader({
  companyId, value, onChange, folder = 'calendar', compact,
}: {
  companyId: string | null
  value: Attachment[]
  onChange: (next: Attachment[]) => void
  folder?: string
  compact?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [viewer, setViewer] = useState<number | null>(null)   // open lightbox index
  const list = Array.isArray(value) ? value : []

  const pick = () => inputRef.current?.click()

  const onFiles = async (files: FileList | null) => {
    if (!files || !files.length || !companyId) return
    setBusy(true); setErr('')
    const added: Attachment[] = []
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('companyId', companyId)
        fd.append('conversationId', folder)
        const res = await fetch('/api/inbox/upload', { method: 'POST', body: fd })
        const d = await res.json()
        if (res.ok && d.url) added.push({ url: d.url, name: d.name || file.name, type: d.type || file.type, kind: d.kind, size: d.size })
        else setErr(d.error || 'Upload failed')
      } catch (e: any) { setErr(e?.message || 'Upload failed') }
    }
    if (added.length) onChange([...list, ...added])
    setBusy(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const remove = (i: number) => onChange(list.filter((_, j) => j !== i))
  const rename = (i: number, name: string) => onChange(list.map((a, j) => j === i ? { ...a, name } : a))
  const thumb = compact ? 56 : 72

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {list.map((a, i) => (
          <div key={i} onClick={() => setViewer(i)} title={a.name || 'View'}
            style={{ position: 'relative', width: thumb, height: thumb, borderRadius: 9, overflow: 'hidden', border: '1px solid var(--border)', background: '#f4f4f5', flexShrink: 0, cursor: 'pointer' }}>
            {a.kind === 'image' || (a.type || '').startsWith('image/') ? (
              <img src={a.url} alt={a.name || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : a.kind === 'video' || (a.type || '').startsWith('video/') ? (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', color: '#fff', fontSize: 20 }}>▶</div>
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📄</div>
            )}
            <button type="button" onClick={(e) => { e.stopPropagation(); remove(i) }} title="Remove"
              style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 12, lineHeight: '18px', cursor: 'pointer', padding: 0, textAlign: 'center' }}>×</button>
          </div>
        ))}
        <button type="button" onClick={pick} disabled={busy || !companyId}
          style={{ width: thumb, height: thumb, boxSizing: 'border-box', padding: 4, borderRadius: 9, border: '1.5px dashed var(--border)', background: '#fff', cursor: busy ? 'default' : 'pointer', color: 'var(--slate)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, fontSize: 9.5, fontWeight: 600, lineHeight: 1.05, textAlign: 'center', overflow: 'hidden', flexShrink: 0 }}>
          {busy ? '…' : <><span style={{ fontSize: 18, lineHeight: 1 }}>＋</span><span style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>Photo/Video</span></>}
        </button>
      </div>
      {err && <p style={{ fontSize: 11.5, color: '#dc2626', margin: '6px 0 0' }}>{err}</p>}
      <input ref={inputRef} type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={e => onFiles(e.target.files)} />
      {viewer !== null && <MediaLightbox items={list} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} onRename={rename} />}
    </div>
  )
}
