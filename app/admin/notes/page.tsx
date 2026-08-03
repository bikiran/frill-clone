'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useCompanyUser } from '../crm-settings/_shared'
import RichTextEditor from '@/components/RichTextEditor'
import AttachmentUploader from '@/components/AttachmentUploader'
import GalleryPicker from '@/components/GalleryPicker'
import VoiceRecorder from '@/components/VoiceRecorder'

type Note = {
  id: string; title: string; body: string; checklist: ChecklistItem[]; attachments: any[]
  cover_image?: string | null; is_public?: boolean; public_code?: string | null; allow_public_edit?: boolean
  tags?: string[]; reminder_at?: string | null; pinned?: boolean; trashed_at?: string | null; updated_at?: string
}
type ChecklistItem = { id: string; text: string; done: boolean }

const rid = () => Math.random().toString(36).slice(2, 9)
const isAudio = (a: any) => a?.kind === 'audio' || (a?.type || '').startsWith('audio/')

const fmtAgo = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso), s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 15) return 'just now'
  if (s < 60) return `${s} seconds ago`
  const m = Math.floor(s / 60); if (m < 60) return m === 1 ? 'a minute ago' : `${m} minutes ago`
  const h = Math.floor(m / 60); if (h < 24) return h === 1 ? 'an hour ago' : `${h} hours ago`
  const days = Math.floor(h / 24); if (days < 7) return days === 1 ? 'yesterday' : `${days} days ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) })
}
const toLocalInput = (iso?: string | null) => { if (!iso) return ''; const d = new Date(iso), p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }
const fromLocalInput = (v: string) => v ? new Date(v).toISOString() : null
const fmtReminder = (iso?: string | null) => iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
const presetIso = (days: number, h = 9) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return d.toISOString() }

export default function NotesPage() {
  const { companyId, user, loading } = useCompanyUser()
  const me = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Me'
  const [tab, setTab] = useState<'notes' | 'reminders' | 'trash'>('notes')
  const [list, setList] = useState<Note[]>([])
  const [trashList, setTrashList] = useState<Note[]>([])
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
  const [moreOpen, setMoreOpen] = useState(false)
  const [remOpen, setRemOpen] = useState(false)
  const [tagAdding, setTagAdding] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const coverInput = useRef<HTMLInputElement>(null)
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2400) }

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      try {
        const members: { id: string; name: string }[] = []
        const { data: co } = await (supabase as any).from('companies').select('owner_id, name').eq('id', companyId).maybeSingle()
        if (co?.owner_id) members.push({ id: co.owner_id, name: co.name || 'Owner' })
        const { data: tm } = await (supabase as any).from('team_members').select('*').eq('company_id', companyId)
        for (const m of (tm || [])) { const nm = m.name || m.display_name || (m.email ? m.email.split('@')[0] : 'Team member'); if (!members.some(x => x.name === nm)) members.push({ id: m.id, name: nm }) }
        setTeam(members)
      } catch {}
    })()
  }, [companyId])

  const loadList = useCallback(async () => {
    if (!companyId) return
    setLoadingList(true)
    try {
      const [a, b] = await Promise.all([
        fetch(`/api/notes?companyId=${companyId}`).then(r => r.json()),
        fetch(`/api/notes?companyId=${companyId}&trashed=1`).then(r => r.json()),
      ])
      setNeedsMigration(!!a.needsMigration)
      setList(a.notes || [])
      setTrashList(b.notes || [])
    } catch {} finally { setLoadingList(false) }
  }, [companyId])
  useEffect(() => { loadList() }, [loadList])

  useEffect(() => {
    if (!companyId || !activeId) { setNote(null); return }
    ;(async () => {
      try {
        const res = await fetch(`/api/notes?companyId=${companyId}&id=${activeId}`)
        const d = await res.json()
        if (d.note) setNote({ ...d.note, checklist: d.note.checklist || [], attachments: d.note.attachments || [], tags: d.note.tags || [] })
      } catch {}
    })()
  }, [companyId, activeId])

  const saveTimer = useRef<any>(null)
  const queueSave = (next: Note) => {
    setNote(next)
    setList(prev => prev.map(n => n.id === next.id ? { ...n, ...next, updated_at: new Date().toISOString() } : n))
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      if (!companyId) return
      setSaving(true)
      try {
        await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          companyId, action: 'update', id: next.id, title: next.title, body: next.body,
          checklist: next.checklist, attachments: next.attachments, cover_image: next.cover_image ?? null,
          allow_public_edit: !!next.allow_public_edit, tags: next.tags || [], reminder_at: next.reminder_at ?? null, pinned: !!next.pinned,
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
      if (d.note) { setTab('notes'); setList(prev => [d.note, ...prev]); setActiveId(d.note.id); setNote({ ...d.note, checklist: [], attachments: [], tags: [] }) }
    } catch {}
  }

  const trashNote = async (id: string) => {
    setMoreOpen(false)
    const n = list.find(x => x.id === id)
    setList(prev => prev.filter(x => x.id !== id))
    if (n) setTrashList(prev => [{ ...n, trashed_at: new Date().toISOString() }, ...prev])
    if (activeId === id) { setActiveId(null); setNote(null) }
    try { await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, action: 'trash', id }) }) } catch {}
    showToast('Moved to Trash')
  }
  const restoreNote = async (id: string) => {
    const n = trashList.find(x => x.id === id)
    setTrashList(prev => prev.filter(x => x.id !== id))
    if (n) setList(prev => [{ ...n, trashed_at: null }, ...prev])
    try { await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, action: 'restore', id }) }) } catch {}
    showToast('Restored')
  }
  const deleteForever = async (id: string) => {
    if (!confirm('Delete this note permanently? This can’t be undone.')) return
    setTrashList(prev => prev.filter(x => x.id !== id))
    if (activeId === id) { setActiveId(null); setNote(null) }
    try { await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, action: 'delete', id }) }) } catch {}
  }
  const duplicateNote = async () => {
    if (!companyId || !note) return
    setMoreOpen(false)
    try {
      const res = await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, action: 'duplicate', id: note.id, userId: user?.id, userName: me }) })
      const d = await res.json()
      if (d.note) { setList(prev => [d.note, ...prev]); setActiveId(d.note.id); setNote({ ...d.note, checklist: d.note.checklist || [], attachments: d.note.attachments || [], tags: d.note.tags || [] }); showToast('Duplicated') }
    } catch {}
  }
  const copyLink = async () => {
    setMoreOpen(false)
    if (note?.public_code) {
      try { await navigator.clipboard.writeText(`${window.location.protocol}//${window.location.host}/n/${note.public_code}`) } catch {}
      showToast('Link copied')
    } else shareNote()
  }
  const printNote = () => {
    setMoreOpen(false)
    if (!note) return
    const w = window.open('', '_blank'); if (!w) return
    const esc = (s: string) => (s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' } as any)[c])
    const checks = (note.checklist || []).map(c => `<div>${c.done ? '☑' : '☐'} ${esc(c.text)}</div>`).join('')
    w.document.write(`<html><head><title>${esc(note.title || 'Note')}</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#111"><h1>${esc(note.title || 'Untitled')}</h1>${note.body || ''}${checks ? `<div style="margin-top:16px">${checks}</div>` : ''}</body></html>`)
    w.document.close(); w.focus(); setTimeout(() => w.print(), 250)
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

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '')
    setTagInput(''); setTagAdding(false)
    if (!t || !note) return
    if (!(note.tags || []).includes(t)) queueSave({ ...note, tags: [...(note.tags || []), t] })
  }
  const setReminder = (iso: string | null) => { if (note) queueSave({ ...note, reminder_at: iso }); setRemOpen(false) }

  if (loading) return <div style={{ padding: 40, color: 'var(--slate)' }}>Loading…</div>

  const rootStyle: React.CSSProperties = fullscreen
    ? { position: 'fixed', inset: 0, zIndex: 200, background: '#fff', display: 'flex', flexDirection: 'column' }
    : { height: 'calc(100dvh - 4px)', display: 'flex', flexDirection: 'column' }
  const reminders = list.filter(n => n.reminder_at).sort((a, b) => new Date(a.reminder_at!).getTime() - new Date(b.reminder_at!).getTime())
  const shown = tab === 'trash' ? trashList : tab === 'reminders' ? reminders : list
  const media = note ? (note.attachments || []).filter(a => !isAudio(a)) : []
  const audios = note ? (note.attachments || []).filter(isAudio) : []
  const setAllAttachments = (next: any[]) => note && queueSave({ ...note, attachments: next })

  return (
    <div style={rootStyle}>
      <style>{`
        .notes-layout { display: flex; flex: 1; min-height: 0; }
        .notes-list { width: 310px; flex-shrink: 0; border-right: 1px solid var(--border); background: #fff; display: flex; flex-direction: column; transition: width .18s ease; }
        .notes-list.closed { width: 0; border-right: none; overflow: hidden; }
        .notes-rows { flex: 1; overflow-y: auto; }
        .note-row { padding: 12px 16px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background .12s; }
        .note-row:hover { background: var(--canvas); }
        .note-row.on { background: var(--peach); }
        .notes-editor { flex: 1; min-width: 0; overflow-y: auto; }
        .icon-btn { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--border); background: #fff; color: var(--slate); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: background .12s, color .12s; }
        .icon-btn:hover { background: var(--peach); color: var(--coral); }
        .seg-tab { flex: 1; padding: 8px 0; border-radius: 9px; border: none; background: transparent; color: var(--slate); font-size: 13px; font-weight: 700; cursor: pointer; transition: background .12s, color .12s; }
        .seg-tab.on { background: #fff; color: var(--coral); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
        .chip { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 20px; }
        .footer-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 20px; border: 1px solid var(--border); background: #fff; color: var(--slate); font-size: 12.5px; font-weight: 700; cursor: pointer; transition: background .12s, color .12s, border-color .12s; }
        .footer-btn:hover { border-color: var(--coral); color: var(--coral); }
        .footer-btn.on { background: var(--peach); border-color: var(--coral); color: var(--coral); }
        .trash-bar { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--border); background: #fff; color: var(--slate); font-size: 13px; font-weight: 700; cursor: pointer; }
        .trash-bar:hover { background: var(--canvas); }
        .trash-bar.on { color: var(--coral); background: var(--peach); }
        @media (max-width: 860px) {
          .notes-list { width: 100%; display: ${activeId ? 'none' : 'flex'}; border-right: none; }
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
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Notes</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="icon-btn" title={fullscreen ? 'Exit full screen' : 'Full screen'} onClick={() => setFullscreen(v => !v)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{fullscreen ? <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/> : <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>}</svg>
          </button>
          <button onClick={createNote} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New note
          </button>
        </div>
      </div>

      {needsMigration && (
        <div style={{ margin: '10px 24px 0', background: 'var(--peach)', border: '1px solid var(--coral)', borderRadius: 9, padding: '9px 12px', fontSize: 12.5, color: 'var(--ink)' }}>
          Notes needs a quick database update — run <b>COLVY_V233_NOTES.sql</b> and <b>COLVY_V234_NOTES_EXTRAS.sql</b> in Supabase, then reload.
        </div>
      )}

      <div className="notes-layout">
        <div className={'notes-list' + (listOpen ? '' : ' closed')}>
          {/* Notes | Reminders segmented tabs */}
          <div style={{ display: 'flex', gap: 4, padding: '10px 12px', background: 'var(--canvas)', borderBottom: '1px solid var(--border)' }}>
            <button className={'seg-tab' + (tab === 'notes' ? ' on' : '')} onClick={() => setTab('notes')}>Notes {list.length > 0 && <span style={{ opacity: 0.7 }}>{list.length}</span>}</button>
            <button className={'seg-tab' + (tab === 'reminders' ? ' on' : '')} onClick={() => setTab('reminders')}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                Reminders {reminders.length > 0 && <span style={{ opacity: 0.7 }}>{reminders.length}</span>}
              </span>
            </button>
          </div>

          <div className="notes-rows">
            {loadingList && shown.length === 0 ? (
              <p style={{ padding: 20, color: 'var(--slate)', fontSize: 13 }}>Loading…</p>
            ) : shown.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--slate)', fontSize: 13.5 }}>
                {tab === 'trash' ? 'Trash is empty.' : tab === 'reminders' ? 'No reminders yet.' : <>No notes yet.<br />Hit <b>New note</b> to start.</>}
              </div>
            ) : shown.map(n => {
              const on = n.id === activeId && tab !== 'trash'
              const plain = (n.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
              const total = (n.checklist || []).length
              const done = (n.checklist || []).filter(c => c.done).length
              return (
                <div key={n.id} className={'note-row' + (on ? ' on' : '')} onClick={() => tab !== 'trash' && setActiveId(n.id)} style={tab === 'trash' ? { cursor: 'default' } : {}}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {n.pinned && tab === 'notes' && <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--coral)" stroke="none"><path d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2L12 16.8 5.7 21l2.3-7.2-6-4.4h7.6z"/></svg>}
                    <p style={{ margin: 0, flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title?.trim() || 'Untitled'}</p>
                    {n.is_public && tab !== 'trash' && <span title="Shared" style={{ color: 'var(--coral)', display: 'flex' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></span>}
                  </div>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--slate)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{plain || 'No text'}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
                    {n.reminder_at && <span className="chip" style={{ background: '#eef2ff', color: '#4f46e5' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                      {fmtReminder(n.reminder_at)}
                    </span>}
                    {total > 0 && <span className="chip" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      {done}/{total}
                    </span>}
                    {(n.tags || []).slice(0, 2).map(t => <span key={t} className="chip" style={{ background: '#f1f5f9', color: '#475569' }}>#{t}</span>)}
                    <span style={{ fontSize: 11, color: 'var(--slate)', marginLeft: 'auto' }}>{fmtAgo(tab === 'trash' ? n.trashed_at || n.updated_at : n.updated_at)}</span>
                  </div>
                  {tab === 'trash' && (
                    <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                      <button onClick={e => { e.stopPropagation(); restoreNote(n.id) }} style={{ fontSize: 12, fontWeight: 700, color: 'var(--coral)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Restore</button>
                      <button onClick={e => { e.stopPropagation(); deleteForever(n.id) }} style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Delete forever</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Trash pinned at the bottom */}
          <div className={'trash-bar' + (tab === 'trash' ? ' on' : '')} onClick={() => setTab(tab === 'trash' ? 'notes' : 'trash')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            {tab === 'trash' ? '‹ Back to Notes' : 'Trash'}
            {trashList.length > 0 && tab !== 'trash' && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--slate)' }}>{trashList.length}</span>}
          </div>
        </div>

        <div className="notes-editor">
          {!note ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--slate)', fontSize: 14 }}>{tab === 'trash' ? 'Restore a note to edit it.' : 'Select a note, or create one.'}</div>
          ) : (
            <div style={{ maxWidth: 780, margin: '0 auto', padding: '20px 28px 40px' }}>
              <button onClick={() => setActiveId(null)} className="notes-back" style={{ display: 'none', alignItems: 'center', background: 'none', border: 'none', color: 'var(--coral)', fontWeight: 700, cursor: 'pointer', marginBottom: 10, fontSize: 13 }}>‹ Notes</button>

              <input value={note.title} onChange={e => queueSave({ ...note, title: e.target.value })} placeholder="Untitled"
                style={{ width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', fontSize: 34, fontWeight: 800, color: 'var(--ink)', padding: 0, marginBottom: 6, lineHeight: 1.15 }} />

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '4px 0 14px', color: 'var(--slate)', fontSize: 12.5 }}>
                <span>{saving ? 'Saving…' : 'Saved'} · {fmtAgo(note.updated_at)}</span>
                <span style={{ flex: 1 }} />
                {!note.cover_image && <>
                  <button onClick={() => coverInput.current?.click()} style={metaBtn}>＋ Cover</button>
                  <button onClick={() => setCoverGallery(true)} style={metaBtn}>Gallery</button>
                </>}
                <button onClick={shareNote} style={{ ...metaBtn, color: 'var(--coral)', borderColor: 'var(--coral)', fontWeight: 700 }}>{note.is_public ? 'Sharing' : 'Share'}</button>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!note.allow_public_edit} onChange={e => queueSave({ ...note, allow_public_edit: e.target.checked })} style={{ width: 14, height: 14, accentColor: 'var(--coral)' }} />
                  Viewers can edit
                </label>
                <div style={{ position: 'relative' }}>
                  <button className="icon-btn" onClick={() => setMoreOpen(v => !v)} title="More" style={{ width: 30, height: 30 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
                  </button>
                  {moreOpen && (<>
                    <div onClick={() => setMoreOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                    <div style={{ position: 'absolute', top: '110%', right: 0, zIndex: 41, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.18)', padding: 6, minWidth: 190 }}>
                      <button style={menuItem} onClick={duplicateNote}>Duplicate</button>
                      <button style={menuItem} onClick={() => { queueSave({ ...note, pinned: !note.pinned }); setMoreOpen(false) }}>{note.pinned ? 'Unpin' : 'Pin to top'}</button>
                      <button style={menuItem} onClick={copyLink}>Copy link</button>
                      <button style={menuItem} onClick={printNote}>Print</button>
                      <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                      <button style={{ ...menuItem, color: '#dc2626' }} onClick={() => trashNote(note.id)}>Move to Trash</button>
                    </div>
                  </>)}
                </div>
              </div>
              <input ref={coverInput} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={e => onCoverFile(e.target.files)} />

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

              <RichTextEditor key={note.id} value={note.body} onChange={html => queueSave({ ...note, body: html })}
                placeholder="Start writing… use @ to mention a teammate" mentions={team} bordered={false} minHeight={200} maxHeight={'none' as any} />

              <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
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

              <div style={{ marginTop: 22 }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Voice notes</h3>
                {audios.map((a) => {
                  const gi = (note.attachments || []).indexOf(a)
                  return (
                    <div key={gi} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                      <input value={a.name || 'Voice note'} onChange={e => setAllAttachments((note.attachments || []).map((x, j) => j === gi ? { ...x, name: e.target.value } : x))}
                        style={{ border: 'none', outline: 'none', fontSize: 13, fontWeight: 600, color: 'var(--ink)', minWidth: 120, background: 'transparent' }} />
                      <audio controls src={a.url} style={{ height: 34, flex: 1, minWidth: 180 }} />
                      <a href={a.url} target="_blank" rel="noopener" download={a.name || 'voice-note'} title="Download" style={{ color: 'var(--slate)', display: 'flex', padding: 3 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      </a>
                      <button onClick={() => setAllAttachments((note.attachments || []).filter((_, j) => j !== gi))} style={{ background: 'none', border: 'none', color: 'var(--slate)', cursor: 'pointer', fontSize: 16 }}>×</button>
                    </div>
                  )
                })}
                <VoiceRecorder companyId={companyId} onRecorded={a => setAllAttachments([...(note.attachments || []), a])} />
              </div>

              <div style={{ marginTop: 22 }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Photos &amp; videos</h3>
                <AttachmentUploader companyId={companyId} value={media} onChange={next => setAllAttachments([...next, ...audios])} folder="notes" />
              </div>

              {/* Evernote-style footer: reminder + tags */}
              <div style={{ marginTop: 26, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {/* Reminder */}
                <div style={{ position: 'relative' }}>
                  <button className={'footer-btn' + (note.reminder_at ? ' on' : '')} onClick={() => setRemOpen(v => !v)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                    {note.reminder_at ? fmtReminder(note.reminder_at) : 'Add reminder'}
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  {remOpen && (<>
                    <div onClick={() => setRemOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                    <div style={{ position: 'absolute', bottom: '120%', left: 0, zIndex: 41, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.18)', padding: 8, minWidth: 220 }}>
                      <button style={remItem} onClick={() => setReminder(presetIso(1))}>Tomorrow, 9:00 AM</button>
                      <button style={remItem} onClick={() => setReminder(presetIso(2))}>In 2 days, 9:00 AM</button>
                      <button style={remItem} onClick={() => setReminder(presetIso(7))}>In 1 week, 9:00 AM</button>
                      <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0', paddingTop: 8 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--slate)', display: 'block', margin: '0 6px 5px' }}>Pick date &amp; time</label>
                        <input type="datetime-local" value={toLocalInput(note.reminder_at)} onChange={e => setReminder(fromLocalInput(e.target.value))}
                          style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 9px', fontSize: 12.5 }} />
                      </div>
                      {note.reminder_at && <button style={{ ...remItem, color: '#dc2626' }} onClick={() => setReminder(null)}>Remove reminder</button>}
                    </div>
                  </>)}
                </div>

                {/* Tags */}
                {(note.tags || []).map(t => (
                  <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, padding: '6px 11px', borderRadius: 20, background: 'var(--peach)', color: 'var(--coral)' }}>
                    #{t}
                    <button onClick={() => queueSave({ ...note, tags: (note.tags || []).filter(x => x !== t) })} style={{ background: 'none', border: 'none', color: 'var(--coral)', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 }}>×</button>
                  </span>
                ))}
                {tagAdding ? (
                  <input autoFocus value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() } else if (e.key === 'Escape') { setTagAdding(false); setTagInput('') } }} onBlur={addTag}
                    placeholder="tag…" style={{ border: '1px solid var(--coral)', borderRadius: 20, outline: 'none', fontSize: 12.5, padding: '6px 11px', width: 100 }} />
                ) : (
                  <button className="footer-btn" onClick={() => setTagAdding(true)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                    Add tag
                  </button>
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
const menuItem: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const remItem: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
