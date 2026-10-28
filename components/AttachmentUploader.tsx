'use client'
import { authFetch } from '@/lib/auth-fetch'

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import MediaLightbox from '@/components/MediaLightbox'
import GalleryPicker from '@/components/GalleryPicker'

// Reusable attachment uploader. Uploads through the existing /api/inbox/upload
// endpoint (R2 or Supabase storage) and keeps a list of
// { url, name, type, kind, size } on the parent. Used on calendar events,
// notes and tasks.
//   mode="media"  photos & videos as a grid of thumbnails (the default)
//   mode="files"  documents (PDF invoices, Word, Excel…) as a list of rows,
//                 with a viewer that shows PDFs in place
export type Attachment = { url: string; name?: string; type?: string; kind?: string; size?: number }

export const isMediaAttachment = (a: Attachment) =>
  a.kind === 'image' || a.kind === 'video' || (a.type || '').startsWith('image/') || (a.type || '').startsWith('video/')

const FILE_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx,.odt,.ods,.odp,application/pdf,text/plain,text/csv'

// The coloured badge on a file row: PDF red, Word blue, sheets green…
function fileBadge(a: Attachment): { label: string; color: string } {
  const ext = ((a.name || a.url || '').split('?')[0].split('.').pop() || '').toLowerCase()
  const t = (a.type || '').toLowerCase()
  if (ext === 'pdf' || t === 'application/pdf') return { label: 'PDF', color: '#dc2626' }
  if (['doc', 'docx', 'odt'].includes(ext) || t.includes('word')) return { label: 'DOC', color: '#2563eb' }
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext) || t.includes('sheet') || t.includes('excel') || t === 'text/csv') return { label: ext === 'csv' ? 'CSV' : 'XLS', color: '#16a34a' }
  if (['ppt', 'pptx', 'odp'].includes(ext) || t.includes('presentation') || t.includes('powerpoint')) return { label: 'PPT', color: '#ea580c' }
  if (ext === 'txt' || t === 'text/plain') return { label: 'TXT', color: '#52525b' }
  return { label: (ext || 'FILE').slice(0, 4).toUpperCase(), color: '#71717a' }
}
const isPdf = (a: Attachment) => fileBadge(a).label === 'PDF'
const fmtSize = (n?: number) => !n ? '' : n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`

const STYLES = `
  .au-grid { display: flex; flex-wrap: wrap; gap: 8px; }
  .au-thumb { position: relative; flex-shrink: 0; border-radius: 14px; overflow: hidden; background: #f4f4f5; cursor: pointer; box-shadow: 0 0 0 1px rgba(0,0,0,.05); }
  .au-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .2s ease; }
  .au-thumb:hover img { transform: scale(1.04); }
  .au-x { position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; border-radius: 999px; border: none; background: rgba(0,0,0,.55); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; opacity: 0; transition: opacity .15s ease; }
  .au-x::before { display: none; }
  .au-thumb:hover .au-x, .au-x:focus-visible { opacity: 1; }
  @media (hover: none) { .au-x { opacity: 1; } }
  .au-tile { flex-shrink: 0; box-sizing: border-box; border-radius: 14px; border: none; background: #f4f4f5; color: #52525b; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; font: inherit; font-size: 11.5px; font-weight: 600; line-height: 1.1; cursor: pointer; transition: background .15s ease, color .15s ease; padding: 4px; }
  .au-tile::before { display: none; }
  .au-tile:hover { background: #ececef; color: #18181b; }
  .au-tile:disabled { opacity: .55; cursor: default; }
  .au-drop { outline: 2px dashed var(--coral); outline-offset: 4px; border-radius: 16px; }
  .au-files { display: flex; flex-direction: column; gap: 6px; }
  .au-file { display: flex; align-items: center; gap: 11px; padding: 9px 8px 9px 10px; border-radius: 14px; background: #fafafa; box-shadow: 0 0 0 1px rgba(0,0,0,.05); cursor: pointer; min-width: 0; transition: background .15s ease; }
  .au-file:hover { background: #f4f4f5; }
  .au-badge { width: 36px; height: 40px; flex-shrink: 0; border-radius: 9px; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 6px; box-sizing: border-box; font-size: 9.5px; font-weight: 800; letter-spacing: .03em; color: #fff; position: relative; }
  .au-badge::after { content: ''; position: absolute; top: 0; right: 0; width: 11px; height: 11px; background: rgba(255,255,255,.35); border-bottom-left-radius: 6px; }
  .au-fname { display: block; font-size: 13.5px; font-weight: 600; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .au-fmeta { display: block; margin-top: 2px; font-size: 12px; color: #8e8e93; }
  .au-ic { width: 30px; height: 30px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: none; border-radius: 999px; background: transparent; color: #71717a; cursor: pointer; text-decoration: none; }
  .au-ic::before { display: none; }
  .au-ic:hover { background: #e4e4e7; color: #18181b; }
  .au-ic.danger:hover { color: #dc2626; }
  .au-add { align-self: flex-start; height: 34px; display: inline-flex; align-items: center; gap: 7px; padding: 0 14px; border: none; border-radius: 999px; background: #f4f4f5; color: #18181b; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
  .au-add::before { display: none; }
  .au-add:hover { background: #ececef; }
  .au-add:disabled { opacity: .55; cursor: default; }
  .au-hint { font-size: 12px; color: #a1a1aa; }
  .au-tile:focus-visible, .au-add:focus-visible, .au-ic:focus-visible, .au-file:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 28%, transparent); }
  .au-viewer { position: fixed; inset: 0; z-index: 6000; background: rgba(15,15,20,.6); display: flex; align-items: center; justify-content: center; padding: 24px; animation: auFade .15s ease; }
  .au-viewer-card { width: min(920px, 100%); height: min(88vh, 1100px); background: #fff; border-radius: 22px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 24px 60px rgba(0,0,0,.3); }
  .au-viewer-head { display: flex; align-items: center; gap: 10px; padding: 12px 12px 12px 18px; border-bottom: 1px solid #f0f0f2; }
  @keyframes auFade { from { opacity: 0 } to { opacity: 1 } }
  @media (max-width: 640px) { .au-viewer { padding: 0; } .au-viewer-card { height: 100%; border-radius: 0; } }
`

export default function AttachmentUploader({
  companyId, value, onChange, folder = 'calendar', compact, mode = 'media',
}: {
  companyId: string | null
  value: Attachment[]
  onChange: (next: Attachment[]) => void
  folder?: string
  compact?: boolean
  mode?: 'media' | 'files'
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [viewer, setViewer] = useState<number | null>(null)   // open lightbox / file viewer index
  const [showGallery, setShowGallery] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const list = Array.isArray(value) ? value : []

  const pick = () => inputRef.current?.click()

  const onFiles = async (files: FileList | File[] | null) => {
    const arr = files ? Array.from(files) : []
    if (!arr.length || !companyId) return
    setBusy(true); setErr('')
    const added: Attachment[] = []
    for (const file of arr) {
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('companyId', companyId)
        fd.append('conversationId', folder)
        const res = await authFetch('/api/inbox/upload', { method: 'POST', body: fd })
        const d = await res.json()
        if (res.ok && d.url) added.push({ url: d.url, name: d.name || file.name, type: d.type || file.type, kind: d.kind, size: d.size ?? file.size })
        else setErr(d.error || 'Upload failed')
      } catch (e: any) { setErr(e?.message || 'Upload failed') }
    }
    if (added.length) onChange([...list, ...added])
    setBusy(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const remove = (i: number) => onChange(list.filter((_, j) => j !== i))
  const rename = (i: number, name: string) => onChange(list.map((a, j) => j === i ? { ...a, name } : a))
  // Drop files straight onto the section.
  const dropProps = {
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setDragOver(true) } },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: React.DragEvent) => {
      if (!e.dataTransfer?.files?.length) return
      e.preventDefault(); setDragOver(false)
      const files = Array.from(e.dataTransfer.files).filter(f => mode === 'files' ? !/^(image|video)\//.test(f.type) : /^(image|video)\//.test(f.type))
      if (files.length) onFiles(files)
      else setErr(mode === 'files' ? 'Photos and videos go in Photos & videos.' : 'Documents go in Files.')
    },
  }
  const x = <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>

  if (mode === 'files') {
    const cur = viewer !== null ? list[viewer] : null
    return (
      <div {...dropProps} className={dragOver ? 'au-drop' : undefined}>
        <style>{STYLES}</style>
        <div className="au-files">
          {list.map((a, i) => {
            const b = fileBadge(a)
            return (
              <div key={i} className="au-file" role="button" tabIndex={0} title={a.name || 'Open'}
                onClick={() => setViewer(i)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewer(i) } }}>
                <span className="au-badge" style={{ background: b.color }}>{b.label}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="au-fname">{a.name || 'File'}</span>
                  <span className="au-fmeta">{[b.label === 'PDF' ? 'PDF document' : b.label, fmtSize(a.size)].filter(Boolean).join(' · ')}</span>
                </span>
                <a className="au-ic" href={a.url} target="_blank" rel="noopener noreferrer" download={a.name || true} onClick={e => e.stopPropagation()} title="Download" aria-label={`Download ${a.name || 'file'}`}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                </a>
                <button type="button" className="au-ic danger" onClick={e => { e.stopPropagation(); remove(i) }} title="Remove" aria-label={`Remove ${a.name || 'file'}`}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                </button>
              </div>
            )
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="au-add" onClick={pick} disabled={busy || !companyId}>
              {busy ? 'Uploading…' : <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                Attach a file
              </>}
            </button>
            {!list.length && !busy && <span className="au-hint">PDF invoices, quotes, spreadsheets… or drop them here</span>}
          </div>
        </div>
        {err && <p style={{ fontSize: 12, color: '#dc2626', margin: '6px 0 0' }}>{err}</p>}
        <input ref={inputRef} type="file" accept={FILE_ACCEPT} multiple style={{ display: 'none' }} onChange={e => onFiles(e.target.files)} />
        {/* On the page itself: a panel that slides in (a transform) would trap
            a fixed overlay inside it. */}
        {cur && typeof document !== 'undefined' && createPortal(
          <div className="au-viewer" onClick={() => setViewer(null)}>
            <style>{STYLES}</style>
            <div className="au-viewer-card" onClick={e => e.stopPropagation()}>
              <div className="au-viewer-head">
                <span className="au-badge" style={{ background: fileBadge(cur).color, width: 30, height: 34, paddingBottom: 5, fontSize: 8.5 }}>{fileBadge(cur).label}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="au-fname" style={{ fontSize: 15 }}>{cur.name || 'File'}</span>
                  {cur.size ? <span className="au-fmeta">{fmtSize(cur.size)}</span> : null}
                </span>
                <a className="cv-btn" href={cur.url} target="_blank" rel="noopener noreferrer" style={{ height: 36 }}>Open</a>
                <a className="cv-btn" href={cur.url} download={cur.name || true} target="_blank" rel="noopener noreferrer" style={{ height: 36 }}>Download</a>
                <button type="button" className="au-ic" onClick={() => setViewer(null)} title="Close" aria-label="Close" style={{ width: 36, height: 36 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
              {isPdf(cur)
                ? <iframe src={cur.url} title={cur.name || 'PDF'} style={{ flex: 1, width: '100%', border: 'none', background: '#f4f4f5' }} />
                : (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
                    <span className="au-badge" style={{ background: fileBadge(cur).color, width: 64, height: 74, fontSize: 14, paddingBottom: 10 }}>{fileBadge(cur).label}</span>
                    <p style={{ margin: 0, fontSize: 14, color: '#71717a' }}>This file can’t be previewed here. Open or download it to view.</p>
                  </div>
                )}
            </div>
          </div>,
          document.body,
        )}
      </div>
    )
  }

  const thumb = compact ? 64 : 76
  return (
    <div {...dropProps} className={dragOver ? 'au-drop' : undefined}>
      <style>{STYLES}</style>
      <div className="au-grid">
        {list.map((a, i) => (
          <div key={i} className="au-thumb" onClick={() => setViewer(i)} title={a.name || 'View'} style={{ width: thumb, height: thumb }}>
            {a.kind === 'image' || (a.type || '').startsWith('image/') ? (
              <img src={a.url} alt={a.name || ''} />
            ) : a.kind === 'video' || (a.type || '').startsWith('video/') ? (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#18181b', color: '#fff' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4" /></svg>
              </div>
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="au-badge" style={{ background: fileBadge(a).color, width: 30, height: 34, paddingBottom: 5, fontSize: 8.5 }}>{fileBadge(a).label}</span>
              </div>
            )}
            <button type="button" className="au-x" onClick={(e) => { e.stopPropagation(); remove(i) }} title="Remove" aria-label="Remove">{x}</button>
          </div>
        ))}
        <button type="button" className="au-tile" onClick={pick} disabled={busy || !companyId} title="Upload a new photo or video" style={{ width: thumb, height: thumb }}>
          {busy ? 'Uploading…' : <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg><span>Upload</span></>}
        </button>
        <button type="button" className="au-tile" onClick={() => setShowGallery(true)} disabled={!companyId} title="Choose from your Colvy Gallery" style={{ width: thumb, height: thumb }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
          <span>Gallery</span>
        </button>
      </div>
      {err && <p style={{ fontSize: 12, color: '#dc2626', margin: '6px 0 0' }}>{err}</p>}
      <input ref={inputRef} type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={e => onFiles(e.target.files)} />
      {viewer !== null && <MediaLightbox items={list} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} onRename={rename} />}
      {showGallery && <GalleryPicker companyId={companyId} onClose={() => setShowGallery(false)} onPick={(picked) => onChange([...list, ...picked])} />}
    </div>
  )
}
