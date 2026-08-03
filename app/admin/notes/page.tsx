'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useCompanyUser } from '../crm-settings/_shared'
import RichTextEditor from '@/components/RichTextEditor'
import AttachmentUploader from '@/components/AttachmentUploader'
import GalleryPicker from '@/components/GalleryPicker'

type Note = {
  id: string; title: string; body: string; checklist: ChecklistItem[]; attachments: any[]
  cover_image?: string | null; is_public?: boolean; public_code?: string | null; allow_public_edit?: boolean
  updated_at?: string
}
type ChecklistItem = { id: string; text: string; done: boolean }

const rid = () => Math.random().toString(36).slice(2, 9)
const fmtAgo = (iso?: string) => {
  if (!iso) return ''
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function NotesPage() {
  const { companyId, user, loading } = useCompanyUser()
  const me = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Me'
  const [list, setList] = useState<Note[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [note, setNote] = useState<Note | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [shareOpen, setShareOpen] = useState<{ url: string } | null>(null)
  const [coverGallery, setCoverGallery] = useState(false)
  const coverInput = useRef<HTMLInputElement>(null)
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2400) }

  const loadList = useCallback(async () => {
    if (!companyId) return
    setLoadingList(true)
    try {
      const res = await fetch(`/api/notes?companyId=${companyId}`)
      const d = await res.json()
      setNeedsMigration(!!d.needsMigration)
      setList(d.notes || [])
    } catch {} finally { setLoadingList(false) }
  }, [companyId])
  useEffect(() => { loadList() }, [loadList])

  // Load the full note when one is selected.
  useEffect(() => {
    if (!companyId || !activeId) { setNote(null); return }
    ;(async () => {
      try {
        const res = await fetch(`/api/notes?companyId=${companyId}&id=${activeId}`)
        const d = await res.json()
        if (d.note) setNote({ ...d.note, checklist: d.note.checklist || [], attachments: d.note.attachments || [] })
      } catch {}
    })()
  }, [companyId, activeId])

  // Debounced autosave.
  const saveTimer = useRef<any>(null)
  const queueSave = (next: Note) => {
    setNote(next)
    setList(prev => prev.map(n => n.id === next.id ? { ...n, title: next.title, updated_at: new Date().toISOString() } : n))
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      if (!companyId) return
      setSaving(true)
      try {
        await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          companyId, action: 'update', id: next.id, title: next.title, body: next.body,
          checklist: next.checklist, attachments: next.attachments, cover_image: next.cover_image ?? null, allow_public_edit: !!next.allow_public_edit,
        }) })
      } catch {} finally { setSaving(false) }
    }, 650)
  }

  const createNote = async () => {
    if (!companyId) return
    try {
      const res = await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, action: 'create', userId: user?.id, userName: me, title: '' }) })
      const d = await res.json()
      if (d.needsMigration) { setNeedsMigration(true); return }
      if (d.note) { setList(prev => [d.note, ...prev]); setActiveId(d.note.id); setNote({ ...d.note, checklist: [], attachments: [] }) }
    } catch {}
  }

  const deleteNote = async (id: string) => {
    if (!companyId || !confirm('Delete this note? This can’t be undone.')) return
    setList(prev => prev.filter(n => n.id !== id))
    if (activeId === id) { setActiveId(null); setNote(null) }
    try { await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, action: 'delete', id }) }) } catch {}
  }

  const shareNote = async () => {
    if (!companyId || !note) return
    showToast('Creating link…')
    try {
      const res = await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, action: 'share', id: note.id }) })
      const d = await res.json()
      if (!d.url) throw new Error()
      setNote({ ...note, is_public: true, public_code: d.code })
      try { await navigator.clipboard.writeText(d.url) } catch {}
      setShareOpen({ url: d.url })
    } catch { showToast('Could not create the link') }
  }

  // Cover: upload a file or choose from the gallery.
  const onCoverFile = async (files: FileList | null) => {
    if (!files?.[0] || !companyId || !note) return
    showToast('Uploading cover…')
    try {
      const fd = new FormData(); fd.append('file', files[0]); fd.append('companyId', companyId); fd.append('conversationId', 'notes')
      const res = await fetch('/api/inbox/upload', { method: 'POST', body: fd })
      const d = await res.json()
      if (d.url) queueSave({ ...note, cover_image: d.url })
    } catch { showToast('Upload failed') }
    if (coverInput.current) coverInput.current.value = ''
  }

  const isVideo = (u?: string | null) => !!u && /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u)

  const checklistDone = note ? (note.checklist || []).filter(c => c.done).length : 0

  if (loading) return <div style={{ padding: 40, color: 'var(--slate)' }}>Loading…</div>

  return (
    <div style={{ height: 'calc(100dvh - 0px)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        .notes-layout { display: flex; flex: 1; min-height: 0; }
        .notes-list { width: 300px; flex-shrink: 0; border-right: 1px solid var(--border); overflow-y: auto; background: #fff; }
        .note-row { padding: 13px 16px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background .12s; }
        .note-row:hover { background: var(--canvas); }
        .note-row.on { background: var(--peach); }
        .notes-editor { flex: 1; min-width: 0; overflow-y: auto; }
        @media (max-width: 860px) {
          .notes-list { width: 100%; display: ${activeId ? 'none' : 'block'}; border-right: none; }
          .notes-editor { display: ${activeId ? 'block' : 'none'}; }
          .notes-back { display: block !important; }
        }
      `}</style>

      <div style={{ padding: '20px 28px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Notes</h1>
          <p style={{ fontSize: 13.5, color: 'var(--slate)', margin: '2px 0 0' }}>Write it down — checklists, media, and share a link anyone can read or help edit.</p>
        </div>
        <button onClick={createNote} style={{ padding: '9px 18px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>+ New note</button>
      </div>

      {needsMigration && (
        <div style={{ margin: '0 28px 10px', background: 'var(--peach)', border: '1px solid var(--coral)', borderRadius: 9, padding: '9px 12px', fontSize: 12.5, color: 'var(--ink)' }}>
          Notes needs a quick database update — run <b>COLVY_V233_NOTES.sql</b> in Supabase, then reload.
        </div>
      )}

      <div className="notes-layout">
        <div className="notes-list">
          {loadingList && list.length === 0 ? (
            <p style={{ padding: 20, color: 'var(--slate)', fontSize: 13 }}>Loading…</p>
          ) : list.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--slate)', fontSize: 13.5 }}>
              No notes yet.<br />Hit <b>+ New note</b> to start.
            </div>
          ) : list.map(n => {
            const on = n.id === activeId
            const plain = (n.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
            return (
              <div key={n.id} className={'note-row' + (on ? ' on' : '')} onClick={() => setActiveId(n.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <p style={{ margin: 0, flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title?.trim() || 'Untitled'}</p>
                  {n.is_public && <span title="Shared" style={{ color: 'var(--coral)', display: 'flex' }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></span>}
                </div>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--slate)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{plain || 'No text'}</p>
                <p style={{ margin: '5px 0 0', fontSize: 11, color: 'var(--slate)' }}>{fmtAgo(n.updated_at)}</p>
              </div>
            )
          })}
        </div>

        <div className="notes-editor">
          {!note ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--slate)', fontSize: 14 }}>Select a note, or create one.</div>
          ) : (
            <div style={{ maxWidth: 760, margin: '0 auto', padding: '18px 28px 60px' }}>
              {/* Back (mobile) */}
              <button onClick={() => setActiveId(null)} style={{ display: 'none', background: 'none', border: 'none', color: 'var(--coral)', fontWeight: 700, cursor: 'pointer', marginBottom: 8, fontSize: 13 }} className="notes-back">‹ Notes</button>

              {/* Cover */}
              {note.cover_image ? (
                <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', marginBottom: 16, background: '#000', maxHeight: 260 }}>
                  {isVideo(note.cover_image)
                    ? <video src={note.cover_image} controls playsInline style={{ width: '100%', maxHeight: 260, objectFit: 'cover', display: 'block' }} />
                    : <img src={note.cover_image} alt="" style={{ width: '100%', maxHeight: 260, objectFit: 'cover', display: 'block' }} />}
                  <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6 }}>
                    <button onClick={() => coverInput.current?.click()} style={coverBtn}>Change</button>
                    <button onClick={() => queueSave({ ...note, cover_image: null })} style={coverBtn}>Remove</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <button onClick={() => coverInput.current?.click()} style={addCoverBtn}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                    Add cover
                  </button>
                  <button onClick={() => setCoverGallery(true)} style={addCoverBtn}>From gallery</button>
                </div>
              )}
              <input ref={coverInput} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={e => onCoverFile(e.target.files)} />

              {/* Title */}
              <input value={note.title} onChange={e => queueSave({ ...note, title: e.target.value })} placeholder="Title"
                style={{ width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', fontSize: 28, fontWeight: 800, color: 'var(--ink)', padding: '4px 0', marginBottom: 8 }} />

              {/* Toolbar: share + status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                <button onClick={shareNote} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                  {note.is_public ? 'Sharing link' : 'Share'}
                </button>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!note.allow_public_edit} onChange={e => queueSave({ ...note, allow_public_edit: e.target.checked })} style={{ width: 15, height: 15, accentColor: 'var(--coral)' }} />
                  Let viewers edit / contribute
                </label>
                <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--slate)' }}>{saving ? 'Saving…' : 'Saved'}</span>
                <button onClick={() => deleteNote(note.id)} title="Delete note" style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', display: 'flex', padding: 4 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>
              </div>

              {/* Rich body */}
              <RichTextEditor key={note.id} value={note.body} onChange={html => queueSave({ ...note, body: html })} placeholder="Start writing…" />

              {/* Checklist */}
              <div style={{ marginTop: 22 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>Checklist</h3>
                  {(note.checklist || []).length > 0 && <span style={{ fontSize: 11.5, color: 'var(--slate)' }}>{checklistDone}/{note.checklist.length}</span>}
                </div>
                {(note.checklist || []).map((c, i) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                    <input type="checkbox" checked={c.done} onChange={() => queueSave({ ...note, checklist: note.checklist.map(x => x.id === c.id ? { ...x, done: !x.done } : x) })} style={{ width: 16, height: 16, accentColor: 'var(--coral)', flexShrink: 0 }} />
                    <input value={c.text} onChange={e => queueSave({ ...note, checklist: note.checklist.map(x => x.id === c.id ? { ...x, text: e.target.value } : x) })}
                      placeholder="List item" style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13.5, color: c.done ? 'var(--slate)' : 'var(--ink)', textDecoration: c.done ? 'line-through' : 'none', background: 'transparent' }} />
                    <button onClick={() => queueSave({ ...note, checklist: note.checklist.filter(x => x.id !== c.id) })} style={{ background: 'none', border: 'none', color: 'var(--slate)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                  </div>
                ))}
                <button onClick={() => queueSave({ ...note, checklist: [...(note.checklist || []), { id: rid(), text: '', done: false }] })}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, background: 'none', border: 'none', color: 'var(--coral)', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                  + Add item
                </button>
              </div>

              {/* Attachments (upload + Colvy Gallery) */}
              <div style={{ marginTop: 22 }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>Photos &amp; videos</h3>
                <AttachmentUploader companyId={companyId} value={note.attachments || []} onChange={next => queueSave({ ...note, attachments: next })} folder="notes" />
                {(note.attachments || []).length > 0 && !note.cover_image && (
                  <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--slate)' }}>Tip: use “Add cover” above to feature one at the top.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {coverGallery && note && (
        <GalleryPicker companyId={companyId} onClose={() => setCoverGallery(false)} onPick={picked => { if (picked[0]) queueSave({ ...note, cover_image: picked[0].url }) }} />
      )}

      {shareOpen && (
        <div onClick={() => setShareOpen(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(13,15,20,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: '92vw', background: '#fff', borderRadius: 16, padding: 22 }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>Share note</h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>Anyone with this link can open the note{note?.allow_public_edit ? ' and help edit it' : ''}. {note?.allow_public_edit ? '' : 'Turn on “Let viewers edit” to allow contributions.'}</p>
            <input readOnly value={shareOpen.url} onFocus={e => e.currentTarget.select()} style={{ width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, marginBottom: 14 }} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <a href={shareOpen.url} target="_blank" rel="noreferrer" style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }}>Open</a>
              <button onClick={async () => { try { await navigator.clipboard.writeText(shareOpen.url) } catch {}; showToast('Copied') }} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Copy link</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 700, background: 'var(--ink)', color: '#fff', padding: '11px 18px', borderRadius: 12, fontSize: 13.5, fontWeight: 600 }}>{toast}</div>}
    </div>
  )
}

const coverBtn: React.CSSProperties = { padding: '5px 11px', borderRadius: 8, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', backdropFilter: 'blur(4px)' }
const addCoverBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 9, border: '1px dashed var(--border)', background: '#fff', color: 'var(--slate)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }
