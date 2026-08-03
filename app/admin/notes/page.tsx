'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
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
  const [team, setTeam] = useState<{ id: string; name: string }[]>([])
  const [listOpen, setListOpen] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const coverInput = useRef<HTMLInputElement>(null)
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2400) }

  // Team roster for @mentions.
  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      try {
        const members: { id: string; name: string }[] = []
        const { data: co } = await (supabase as any).from('companies').select('owner_id, name').eq('id', companyId).maybeSingle()
        if (co?.owner_id) members.push({ id: co.owner_id, name: co.name || 'Owner' })
        const { data: tm } = await (supabase as any).from('team_members').select('*').eq('company_id', companyId)
        for (const m of (tm || [])) {
          const nm = m.name || m.display_name || (m.email ? m.email.split('@')[0] : 'Team member')
          if (!members.some(x => x.name === nm)) members.push({ id: m.id, name: nm })
        }
        setTeam(members)
      } catch {}
    })()
  }, [companyId])

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

  const saveTimer = useRef<any>(null)
  const queueSave = (next: Note) => {
    setNote(next)
    setList(prev => prev.map(n => n.id === next.id ? { ...n, title: next.title, body: next.body, updated_at: new Date().toISOString() } : n))
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

  const rootStyle: React.CSSProperties = fullscreen
    ? { position: 'fixed', inset: 0, zIndex: 200, background: '#fff', display: 'flex', flexDirection: 'column' }
    : { height: 'calc(100dvh - 4px)', display: 'flex', flexDirection: 'column' }

  return (
    <div style={rootStyle}>
      <style>{`
        .notes-layout { display: flex; flex: 1; min-height: 0; }
        .notes-list { width: 300px; flex-shrink: 0; border-right: 1px solid var(--border); overflow-y: auto; background: #fff; transition: width .18s ease; }
        .notes-list.closed { width: 0; border-right: none; overflow: hidden; }
        .note-row { padding: 13px 16px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background .12s; }
        .note-row:hover { background: var(--canvas); }
        .note-row.on { background: var(--peach); }
        .notes-editor { flex: 1; min-width: 0; overflow-y: auto; }
        .icon-btn { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--border); background: #fff; color: var(--slate); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: background .12s, color .12s; }
        .icon-btn:hover { background: var(--peach); color: var(--coral); }
        @media (max-width: 860px) {
          .notes-list { position: ${activeId ? 'absolute' : 'static'}; }
          .notes-list { width: 100%; display: ${activeId ? 'none' : 'block'}; border-right: none; }
          .notes-list.closed { display: none; }
          .notes-editor { display: ${activeId ? 'block' : 'none'}; }
          .notes-back { display: inline-flex !important; }
        }
      `}</style>

      <div style={{ padding: '16px 24px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="icon-btn" title={listOpen ? 'Collapse list' : 'Show list'} onClick={() => setListOpen(v => !v)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{listOpen ? <><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></> : <><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></>}</svg>
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Notes {list.length > 0 && <span style={{ color: 'var(--slate)', fontWeight: 700, fontSize: 15 }}>{list.length}</span>}</h1>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="icon-btn" title={fullscreen ? 'Exit full screen' : 'Full screen'} onClick={() => setFullscreen(v => !v)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{fullscreen ? <><path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/></> : <><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></>}</svg>
          </button>
          <button onClick={createNote} style={{ padding: '9px 18px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>+ New note</button>
        </div>
      </div>

      {needsMigration && (
        <div style={{ margin: '10px 24px 0', background: 'var(--peach)', border: '1px solid var(--coral)', borderRadius: 9, padding: '9px 12px', fontSize: 12.5, color: 'var(--ink)' }}>
          Notes needs a quick database update — run <b>COLVY_V233_NOTES.sql</b> in Supabase, then reload.
        </div>
      )}

      <div className="notes-layout">
        <div className={'notes-list' + (listOpen ? '' : ' closed')}>
          {loadingList && list.length === 0 ? (
            <p style={{ padding: 20, color: 'var(--slate)', fontSize: 13 }}>Loading…</p>
          ) : list.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--slate)', fontSize: 13.5 }}>No notes yet.<br />Hit <b>+ New note</b> to start.</div>
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
            <div style={{ maxWidth: 780, margin: '0 auto', padding: '20px 28px 80px' }}>
              <button onClick={() => setActiveId(null)} className="notes-back" style={{ display: 'none', alignItems: 'center', background: 'none', border: 'none', color: 'var(--coral)', fontWeight: 700, cursor: 'pointer', marginBottom: 10, fontSize: 13 }}>‹ Notes</button>

              {/* Title — at the very top, big and clean. */}
              <input value={note.title} onChange={e => queueSave({ ...note, title: e.target.value })} placeholder="Untitled"
                style={{ width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', fontSize: 34, fontWeight: 800, color: 'var(--ink)', padding: 0, marginBottom: 6, lineHeight: 1.15 }} />

              {/* Slim meta bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '4px 0 14px', color: 'var(--slate)', fontSize: 12.5 }}>
                <span>{saving ? 'Saving…' : 'Saved'} · {fmtAgo(note.updated_at)}</span>
                <span style={{ flex: 1 }} />
                {!note.cover_image && <>
                  <button onClick={() => coverInput.current?.click()} style={metaBtn}>＋ Cover</button>
                  <button onClick={() => setCoverGallery(true)} style={metaBtn}>Gallery</button>
                </>}
                <button onClick={shareNote} style={{ ...metaBtn, color: 'var(--coral)', borderColor: 'var(--coral)', fontWeight: 700 }}>
                  {note.is_public ? 'Sharing' : 'Share'}
                </button>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!note.allow_public_edit} onChange={e => queueSave({ ...note, allow_public_edit: e.target.checked })} style={{ width: 14, height: 14, accentColor: 'var(--coral)' }} />
                  Viewers can edit
                </label>
                <button onClick={() => deleteNote(note.id)} title="Delete" style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', display: 'flex', padding: 2 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                </button>
              </div>
              <input ref={coverInput} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={e => onCoverFile(e.target.files)} />

              {/* Cover (below the title, Evernote-style) */}
              {note.cover_image && (
                <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', marginBottom: 18, background: '#000', maxHeight: 280 }}>
                  {isVideo(note.cover_image)
                    ? <video src={note.cover_image} controls playsInline style={{ width: '100%', maxHeight: 280, objectFit: 'cover', display: 'block' }} />
                    : <img src={note.cover_image} alt="" style={{ width: '100%', maxHeight: 280, objectFit: 'cover', display: 'block' }} />}
                  <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6 }}>
                    <button onClick={() => coverInput.current?.click()} style={coverBtn}>Change</button>
                    <button onClick={() => queueSave({ ...note, cover_image: null })} style={coverBtn}>Remove</button>
                  </div>
                </div>
              )}

              {/* Rich body with @mentions */}
              <RichTextEditor key={note.id} value={note.body} onChange={html => queueSave({ ...note, body: html })}
                placeholder="Start writing… use @ to mention a teammate" mentions={team} bordered={false} minHeight={240} maxHeight={'none' as any} />

              {/* Checklist */}
              <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Checklist</h3>
                  {(note.checklist || []).length > 0 && <span style={{ fontSize: 12, color: 'var(--slate)' }}>{checklistDone}/{note.checklist.length}</span>}
                </div>
                {(note.checklist || []).map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '3px 0' }}>
                    <input type="checkbox" checked={c.done} onChange={() => queueSave({ ...note, checklist: note.checklist.map(x => x.id === c.id ? { ...x, done: !x.done } : x) })} style={{ width: 17, height: 17, accentColor: 'var(--coral)', flexShrink: 0 }} />
                    <input value={c.text} onChange={e => queueSave({ ...note, checklist: note.checklist.map(x => x.id === c.id ? { ...x, text: e.target.value } : x) })}
                      placeholder="List item" style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, color: c.done ? 'var(--slate)' : 'var(--ink)', textDecoration: c.done ? 'line-through' : 'none', background: 'transparent' }} />
                    <button onClick={() => queueSave({ ...note, checklist: note.checklist.filter(x => x.id !== c.id) })} style={{ background: 'none', border: 'none', color: 'var(--slate)', cursor: 'pointer', fontSize: 17, lineHeight: 1 }}>×</button>
                  </div>
                ))}
                <button onClick={() => queueSave({ ...note, checklist: [...(note.checklist || []), { id: rid(), text: '', done: false }] })}
                  style={{ marginTop: 6, background: 'none', border: 'none', color: 'var(--coral)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>+ Add item</button>
              </div>

              {/* Attachments */}
              <div style={{ marginTop: 22 }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Photos &amp; videos</h3>
                <AttachmentUploader companyId={companyId} value={note.attachments || []} onChange={next => queueSave({ ...note, attachments: next })} folder="notes" />
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
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>Anyone with this link can open the note{note?.allow_public_edit ? ' and help edit it' : ''}. {note?.allow_public_edit ? '' : 'Turn on “Viewers can edit” to allow contributions.'}</p>
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
const metaBtn: React.CSSProperties = { padding: '4px 10px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', color: 'var(--slate)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }
