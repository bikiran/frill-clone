'use client'

// Jobs Phase 2 on the job page: who's on it (with clash checks), the work
// timer, the checklist, before/after photos and the customer's signature.
// Each panel takes the job page's data and hands changes back, so the page
// (and its cached copy) stays the one source of truth.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Panel } from '@/components/ui/AdminKit'
import { confirmDialog } from '@/components/ConfirmDialog'
import { compressImage } from '@/lib/upload-attachment'
import { timeTotals, fmtDuration, PHOTO_KINDS, PHOTO_KIND_LABEL, type PhotoKind } from '@/lib/jobs/work'
import { api, apiRaw, putJobFile, Avatar, Dialog, Icon, fmtAgo } from '@/components/jobs/shared'

type Person = { id: string; name: string; avatar_url?: string | null }
type Toast = (m: string) => void

// ── People ──────────────────────────────────────────────────────────────────

const teamCache = new Map<string, Person[]>()
async function loadTeam(companyId: string): Promise<Person[]> {
  if (teamCache.has(companyId)) return teamCache.get(companyId)
  const r = await api(`/api/jobs/team?companyId=${companyId}`)
  teamCache.set(companyId, r.staff || [])
  return r.staff || []
}

export function PeoplePanel({ companyId, job, conflicts, canAssign, onSaved, toast }: {
  companyId: string; job: any; conflicts: any[]; canAssign: boolean
  onSaved: (job: any, conflicts: any[]) => void; toast: Toast
}) {
  const [open, setOpen] = useState(false)
  const people: Person[] = Array.isArray(job.assignees) ? job.assignees : []
  const closed = job.status === 'cancelled'
  return (
    <Panel title="Team" right={canAssign && !closed && <button type="button" className="ak-btn sm ghost" onClick={() => setOpen(true)}>{people.length ? 'Change' : 'Assign'}</button>}>
      {people.length ? (
        <ul className="fl-people">
          {people.map(p => (
            <li key={p.id}><Avatar id={p.id} name={p.name} url={p.avatar_url} size={30} /><span>{p.name}</span></li>
          ))}
        </ul>
      ) : (
        <p className="fl-muted">{canAssign ? 'No one on this job yet.' : 'No one on this job yet. An owner or admin can assign people.'}</p>
      )}
      {conflicts?.length > 0 && <ClashList conflicts={conflicts} />}
      {open && <AssignDialog companyId={companyId} job={job} onClose={() => setOpen(false)} toast={toast}
        onSaved={(j, c) => { setOpen(false); onSaved(j, c) }} />}
    </Panel>
  )
}

function ClashList({ conflicts, compact }: { conflicts: any[]; compact?: boolean }) {
  return (
    <div className={`fl-clash${compact ? ' compact' : ''}`} role="note">
      <b>{Icon.warn}Busy at this time</b>
      <ul>
        {conflicts.map((c, i) => <li key={i}><span>{c.name}</span>: {c.label} · {c.when}</li>)}
      </ul>
    </div>
  )
}

function AssignDialog({ companyId, job, onClose, onSaved, toast }: { companyId: string; job: any; onClose: () => void; onSaved: (job: any, conflicts: any[]) => void; toast: Toast }) {
  const [team, setTeam] = useState<Person[] | null>(teamCache.get(companyId) || null)
  const [picked, setPicked] = useState<string[]>(() => (job.assignees || []).map((a: any) => a.id))
  const [q, setQ] = useState('')
  const [clashes, setClashes] = useState<any[]>([])
  const [checking, setChecking] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const scheduled = !!job.scheduled_start
  useEffect(() => { if (!team) loadTeam(companyId).then(setTeam).catch(e => { toast(e.message); setTeam([]) }) }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps
  // Live clash check as people are picked (only when the job has a time).
  useEffect(() => {
    setConfirm(false)
    if (!scheduled || !picked.length) { setClashes([]); return }
    let live = true
    setChecking(true)
    const t = setTimeout(async () => {
      const r = await apiRaw(`/api/jobs/${job.id}/assign`, { method: 'POST', json: { companyId, assignees: picked, check: true } }).catch(() => null)
      if (!live) return
      setChecking(false)
      if (r?.ok) setClashes(r.data.conflicts || [])
    }, 260)
    return () => { live = false; clearTimeout(t) }
  }, [picked.join(','), scheduled]) // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => (team || []).filter(p => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())), [team, q])
  const busyIds = new Set(clashes.map(c => c.userId))
  const toggle = (id: string) => setPicked(ps => (ps.includes(id) ? ps.filter(x => x !== id) : [...ps, id]))
  const save = async () => {
    setBusy(true)
    const r = await apiRaw(`/api/jobs/${job.id}/assign`, { method: 'POST', json: { companyId, assignees: picked, force: confirm } }).catch((e: any) => ({ ok: false, status: 0, data: { error: e.message } }))
    setBusy(false)
    if (r.ok) { onSaved(r.data.job, r.data.conflicts || []); toast(picked.length ? 'Team saved' : 'No one on this job now'); return }
    if (r.status === 409 && r.data.needsConfirm) { setClashes(r.data.conflicts || []); setConfirm(true); return }
    toast(r.data.error || 'That didn’t save. Please try again.')
  }
  return (
    <Dialog title="Who’s on this job?" onClose={onClose} width={480}
      footer={<>
        <button type="button" className="ak-btn ghost" onClick={onClose}>Cancel</button>
        <button type="button" className={`ak-btn ${confirm ? 'danger' : 'go'}`} onClick={save} disabled={busy || team === null}>{busy ? 'Saving…' : confirm ? 'Assign anyway' : 'Save'}</button>
      </>}>
      {(team?.length || 0) > 6 && <input className="ak-field" value={q} onChange={e => setQ(e.target.value)} placeholder="Find a team member" aria-label="Find a team member" />}
      {team === null ? <div className="fl-skel"><span /><span /><span /></div> : (
        <div className="fl-pick" role="group" aria-label="Team members">
          {shown.map(p => {
            const on = picked.includes(p.id)
            const clash = clashes.filter(c => c.userId === p.id)
            return (
              <button key={p.id} type="button" className={`fl-pick-row${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggle(p.id)}>
                <Avatar id={p.id} name={p.name} url={p.avatar_url} size={32} />
                <span className="fl-pick-t"><b>{p.name}</b>{on && busyIds.has(p.id) ? <em>{clash.map(c => `${c.label} · ${c.when}`).join('; ')}</em> : null}</span>
                <span className="fl-tick" aria-hidden>{on && Icon.check}</span>
              </button>
            )
          })}
          {!shown.length && <p className="fl-muted">No one matches “{q}”.</p>}
        </div>
      )}
      <p className="fl-hint">
        {!scheduled ? 'Give the job a time to check whether people are free.' : checking ? 'Checking who’s free…' : clashes.length ? (confirm ? 'They’re busy then. Assign anyway, or pick someone else.' : 'Some of them are busy then.') : picked.length ? 'Everyone picked is free then.' : 'Pick the people doing the work. They’re told straight away.'}
      </p>
    </Dialog>
  )
}

// ── Work timer ──────────────────────────────────────────────────────────────

const clock = (s: number) => {
  const t = Math.max(0, Math.floor(s)); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(sec).padStart(2, '0')}`
}

export function WorkPanel({ companyId, job, time, me, onChange, onNeedSignature, toast }: {
  companyId: string; job: any; time: any; me: string
  onChange: (next: { job?: any; time?: any }) => void; onNeedSignature: () => void; toast: Toast
}) {
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState<'' | 'start' | 'pause' | 'finish'>('')
  const entries = time?.entries || []
  const t = useMemo(() => timeTotals(entries, now), [entries, now])
  const mine = t.byUser[me]
  const running = !!mine?.running
  const anyRunning = t.runningUserIds.length > 0
  useEffect(() => {
    if (!anyRunning) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [anyRunning])
  const closed = job.status === 'completed' || job.status === 'cancelled'
  const canFinish = job.status === 'scheduled' || job.status === 'in_progress'

  const act = async (action: 'start' | 'pause' | 'finish') => {
    if (action === 'finish' && !(await confirmDialog({ title: 'Finish this job?', message: 'Everyone’s timer stops and the job is marked Completed.', confirmLabel: 'Finish job' }))) return
    setBusy(action)
    // Starting or pausing shows straight away; the server's answer replaces it.
    const at = new Date().toISOString()
    if (action === 'start') onChange({ time: { ...time, entries: [{ id: `tmp-${at}`, user_id: me, user_name: 'You', started_at: at, ended_at: null }, ...entries] } })
    if (action === 'pause') onChange({ time: { ...time, entries: entries.map((e: any) => (e.user_id === me && !e.ended_at ? { ...e, ended_at: at } : e)) } })
    const r = await apiRaw(`/api/jobs/${job.id}/time`, { method: 'POST', json: { companyId, action } }).catch((e: any) => ({ ok: false, status: 0, data: { error: e.message } }))
    setBusy('')
    if (r.ok) {
      onChange({ job: r.data.job, time: r.data.time })
      toast(action === 'start' ? 'Timer started' : action === 'pause' ? `Paused · ${fmtDuration(r.data.time?.byUser?.[me]?.seconds || 0)} today on this job` : 'Job finished')
      return
    }
    onChange({ time })
    if (r.status === 409 && r.data.needsSignature) { toast(r.data.error); onNeedSignature(); return }
    toast(r.data.error || 'That didn’t work. Please try again.')
  }

  const people = Object.entries(t.byUser) as [string, { name: string; seconds: number; running: boolean }][]
  return (
    <Panel title="Work" className="fl-work">
      <div className="fl-timer">
        <div className={`fl-clock${running ? ' on' : ''}`} aria-live="off">
          <span className="fl-clock-n jb-num">{clock(mine?.seconds || 0)}</span>
          <span className="fl-clock-l">{running ? 'You’re on the clock' : mine ? 'Your time on this job' : closed ? 'Not on the clock' : 'Not started'}</span>
        </div>
        {!closed && (
          <div className="fl-timer-b">
            {running
              ? <button type="button" className="ak-btn dark" onClick={() => act('pause')} disabled={!!busy}>{Icon.pause}{busy === 'pause' ? 'Pausing…' : 'Pause'}</button>
              : <button type="button" className="ak-btn go" onClick={() => act('start')} disabled={!!busy}>{Icon.play}{busy === 'start' ? 'Starting…' : mine ? 'Resume' : 'Start work'}</button>}
            {canFinish && <button type="button" className="ak-btn" onClick={() => act('finish')} disabled={!!busy}>{Icon.check}{busy === 'finish' ? 'Finishing…' : 'Finish job'}</button>}
          </div>
        )}
      </div>
      <div className="fl-total"><span>Total on the job</span><b className="jb-num">{fmtDuration(t.totalSeconds)}</b></div>
      {people.length > 0 && (
        <ul className="fl-times">
          {people.map(([uid, u]) => (
            <li key={uid}>
              <Avatar id={uid} name={u.name} size={24} />
              <span className="fl-times-n">{uid === me ? 'You' : u.name}{u.running && <i className="fl-live" title="On the clock" />}</span>
              <b className="jb-num">{fmtDuration(u.seconds)}</b>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

// ── Checklist ───────────────────────────────────────────────────────────────

export function ChecklistPanel({ companyId, jobId, items, onChange, toast }: {
  companyId: string; jobId: string; items: any[]; onChange: (items: any[]) => void; toast: Toast
}) {
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [menu, setMenu] = useState(false)
  const [saved, setSaved] = useState<any[] | null>(null)
  const [adding, setAdding] = useState(false)
  const list = items || []
  const done = list.filter(i => i.done).length

  const send = async (body: any, optimistic?: any[]) => {
    const before = list
    if (optimistic) onChange(optimistic)
    try {
      const r = await api(`/api/jobs/${jobId}/checklist`, { method: 'POST', json: { companyId, ...body } })
      onChange(r.checklist || [])
      return true
    } catch (e: any) { onChange(before); toast(e.message); return false }
  }
  const add = async (raw: string) => {
    const t = raw.trim()
    if (!t) return
    setAdding(true)
    const temp = t.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map((s, i) => ({ id: `tmp-${Date.now()}-${i}`, text: s, done: false, pending: true }))
    setText('')
    const ok = await send({ action: 'add', text: t }, [...list, ...temp])
    if (!ok) setText(t)
    setAdding(false)
  }
  const toggle = (it: any) => send({ action: 'toggle', itemId: it.id, done: !it.done }, list.map(x => (x.id === it.id ? { ...x, done: !it.done, done_by_name: !it.done ? 'You' : null, done_at: !it.done ? new Date().toISOString() : null } : x)))
  const saveEdit = async (it: any) => {
    const t = draft.trim(); setEditing(null)
    if (!t || t === it.text) return
    await send({ action: 'edit', itemId: it.id, text: t }, list.map(x => (x.id === it.id ? { ...x, text: t } : x)))
  }
  const remove = (it: any) => send({ action: 'delete', itemId: it.id }, list.filter(x => x.id !== it.id))
  const openMenu = async () => {
    setMenu(m => !m)
    if (saved === null) { try { const r = await api(`/api/jobs/checklists?companyId=${companyId}`); setSaved(r.checklists || []) } catch { setSaved([]) } }
  }
  const apply = async (c: any) => { setMenu(false); if (await send({ action: 'apply', checklistId: c.id })) toast(`Added “${c.name}”`) }

  return (
    <Panel title="Checklist" sub={list.length ? `${done} of ${list.length} done` : 'Steps for the job, ticked off as they’re done.'}
      right={
        <div style={{ position: 'relative' }}>
          <button type="button" className="ak-btn sm ghost" onClick={openMenu} aria-haspopup="menu" aria-expanded={menu}>Use saved{Icon.chev}</button>
          {menu && (
            <div className="jb-menu" role="menu" style={{ right: 0, top: 38, minWidth: 220 }}>
              {saved === null ? <div className="jb-menu-l">Loading…</div> : saved.length === 0 ? <div className="jb-menu-l">No saved checklists yet. Add them in Quote Settings.</div>
                : saved.map(c => <button key={c.id} type="button" role="menuitem" onClick={() => apply(c)}>{c.name}<span className="fl-menu-n">{(c.items || []).length}</span></button>)}
            </div>
          )}
        </div>
      }>
      {list.length > 0 && <div className="fl-prog" aria-hidden><span style={{ width: `${Math.round((done / list.length) * 100)}%` }} /></div>}
      <ul className="fl-check">
        {list.map(it => (
          <li key={it.id} className={`${it.done ? 'done' : ''}${it.pending ? ' pending' : ''}`}>
            <button type="button" className="fl-box" role="checkbox" aria-checked={!!it.done} aria-label={it.text} onClick={() => !it.pending && toggle(it)}>{it.done && Icon.check}</button>
            {editing === it.id ? (
              <input className="ak-field fl-edit" autoFocus value={draft} maxLength={300} onChange={e => setDraft(e.target.value)} aria-label="Edit item"
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(it); if (e.key === 'Escape') setEditing(null) }} onBlur={() => saveEdit(it)} />
            ) : (
              <span className="fl-check-t" onDoubleClick={() => { if (!it.pending) { setEditing(it.id); setDraft(it.text) } }}>
                {it.text}
                {it.done && it.done_by_name && <em>{it.done_by_name}{it.done_at ? ` · ${fmtAgo(it.done_at)}` : ''}</em>}
              </span>
            )}
            {!it.pending && editing !== it.id && (
              <span className="fl-row-tools">
                <button type="button" className="ak-icon-btn" onClick={() => { setEditing(it.id); setDraft(it.text) }} aria-label={`Edit “${it.text}”`}>{Icon.pen}</button>
                <button type="button" className="ak-icon-btn danger" onClick={() => remove(it)} aria-label={`Remove “${it.text}”`}>{Icon.x}</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="fl-add">
        <input className="ak-field" value={text} onChange={e => setText(e.target.value)} maxLength={300} placeholder="Add a step, then Enter" aria-label="Add a checklist item"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(text) } }}
          onPaste={e => { const v = e.clipboardData.getData('text'); if (/\n/.test(v.trim())) { e.preventDefault(); add(v) } }} />
        <button type="button" className="ak-btn sm dark" onClick={() => add(text)} disabled={adding || !text.trim()}>Add</button>
      </div>
    </Panel>
  )
}

// ── Photos ──────────────────────────────────────────────────────────────────

export function PhotosPanel({ companyId, jobId, attachments, me, canManage, onChange, toast }: {
  companyId: string; jobId: string; attachments: any[]; me: string; canManage: boolean; onChange: (list: any[]) => void; toast: Toast
}) {
  const photos = (attachments || []).filter(a => a.kind !== 'signature')
  const [kind, setKind] = useState<PhotoKind>(() => (photos.some(p => p.kind === 'after') ? 'after' : 'before'))
  const [uploading, setUploading] = useState<{ id: string; name: string; preview: string }[]>([])
  const [view, setView] = useState<number | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const shown = photos.filter(p => p.kind === kind)
  const counts = Object.fromEntries(PHOTO_KINDS.map(k => [k, photos.filter(p => p.kind === k).length])) as Record<PhotoKind, number>

  const pick = async (files: FileList | null) => {
    const list = Array.from(files || []).filter(f => /^image\/|^video\//.test(f.type)).slice(0, 20)
    if (input.current) input.current.value = ''
    if (!list.length) return
    const forKind = kind
    const temp = list.map((f, i) => ({ id: `up-${Date.now()}-${i}`, name: f.name, preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : '' }))
    setUploading(u => [...u, ...temp])
    const done: any[] = []
    let failed = 0
    await Promise.all(list.map(async (f, i) => {
      try {
        const ready = f.type.startsWith('image/') ? await compressImage(f) : f
        const url = await putJobFile(companyId, jobId, ready, f.name)
        done.push({ url, name: f.name, mime: ready.type || f.type })
      } catch { failed++ }
      setUploading(u => u.filter(x => x.id !== temp[i].id))
      if (temp[i].preview) URL.revokeObjectURL(temp[i].preview)
    }))
    if (done.length) {
      try {
        const r = await api(`/api/jobs/${jobId}/photos`, { method: 'POST', json: { companyId, kind: forKind, files: done } })
        onChange([...(attachments || []), ...(r.attachments || [])])
        toast(`${done.length} ${PHOTO_KIND_LABEL[forKind].toLowerCase()} photo${done.length === 1 ? '' : 's'} added${failed ? `; ${failed} didn’t upload` : ''}`)
      } catch (e: any) { toast(e.message) }
    } else if (failed) toast('The photos didn’t upload. Please try again.')
  }
  const remove = async (a: any) => {
    if (!(await confirmDialog({ title: 'Remove this photo?', message: 'It’s also taken out of the Gallery.', confirmLabel: 'Remove', tone: 'danger' }))) return
    const before = attachments
    onChange((attachments || []).filter(x => x.id !== a.id)); setView(null)
    try { await api(`/api/jobs/${jobId}/photos?companyId=${companyId}&attachmentId=${a.id}`, { method: 'DELETE' }) } catch (e: any) { onChange(before); toast(e.message) }
  }

  return (
    <Panel title="Photos" sub="Before and after shots. A copy goes to the Gallery, tagged with the job.">
      <div className="fl-ph-bar">
        <div className="ak-seg" role="tablist" aria-label="Photo type">
          {PHOTO_KINDS.map(k => <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{PHOTO_KIND_LABEL[k]}{counts[k] ? <span className="fl-seg-n">{counts[k]}</span> : null}</button>)}
        </div>
        <button type="button" className="ak-btn sm go" onClick={() => input.current?.click()}>{Icon.camera}Add {PHOTO_KIND_LABEL[kind].toLowerCase()}</button>
        <input ref={input} type="file" accept="image/*,video/*" multiple hidden onChange={e => pick(e.target.files)} aria-label={`Add ${PHOTO_KIND_LABEL[kind].toLowerCase()} photos`} />
      </div>
      {shown.length || uploading.length ? (
        <div className="fl-grid">
          {shown.map((a, i) => (
            <button key={a.id} type="button" className="fl-ph" onClick={() => setView(i)} aria-label={`Open ${a.name || 'photo'}`}>
              {String(a.mime || '').startsWith('video/') ? <video src={a.url} muted playsInline preload="metadata" /> : <img src={a.url} alt={a.caption || a.name || ''} loading="lazy" />}
            </button>
          ))}
          {uploading.map(u => (
            <div key={u.id} className="fl-ph up" aria-label={`Uploading ${u.name}`}>
              {u.preview && <img src={u.preview} alt="" />}<span className="fl-spin" />
            </div>
          ))}
        </div>
      ) : (
        <button type="button" className="fl-drop" onClick={() => input.current?.click()}>
          {Icon.camera}<b>No {PHOTO_KIND_LABEL[kind].toLowerCase()} photos yet</b><span>Take or choose photos{kind === 'before' ? ' before the work starts' : kind === 'after' ? ' of the finished work' : ''}.</span>
        </button>
      )}
      {view !== null && shown[view] && (
        <Lightbox items={shown} index={view} onIndex={setView} onClose={() => setView(null)}
          canDelete={a => a.uploaded_by_id === me || canManage} onDelete={remove} label={PHOTO_KIND_LABEL[kind]} />
      )}
    </Panel>
  )
}

function Lightbox({ items, index, onIndex, onClose, canDelete, onDelete, label }: {
  items: any[]; index: number; onIndex: (i: number) => void; onClose: () => void; canDelete: (a: any) => boolean; onDelete: (a: any) => void; label: string
}) {
  const a = items[index]
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1)
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [index, items.length, onClose, onIndex])
  return (
    <div className="fl-lb" role="dialog" aria-modal="true" aria-label={`${label} photo ${index + 1} of ${items.length}`} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="fl-lb-top">
        <span>{label} · {index + 1} of {items.length}{a.uploaded_by_name ? ` · ${a.uploaded_by_name}` : ''} · {fmtAgo(a.created_at)}</span>
        <span style={{ display: 'flex', gap: 6 }}>
          {canDelete(a) && <button type="button" className="fl-lb-btn" onClick={() => onDelete(a)} aria-label="Remove photo">{Icon.trash}</button>}
          <button type="button" className="fl-lb-btn" onClick={onClose} aria-label="Close">{Icon.x}</button>
        </span>
      </div>
      {String(a.mime || '').startsWith('video/') ? <video className="fl-lb-img" src={a.url} controls playsInline /> : <img className="fl-lb-img" src={a.url} alt={a.caption || a.name || ''} />}
      {index > 0 && <button type="button" className="fl-lb-nav l" onClick={() => onIndex(index - 1)} aria-label="Previous photo">‹</button>}
      {index < items.length - 1 && <button type="button" className="fl-lb-nav r" onClick={() => onIndex(index + 1)} aria-label="Next photo">›</button>}
    </div>
  )
}

// ── Signature ───────────────────────────────────────────────────────────────

export function SignaturePanel({ job, required, onSign }: { job: any; required: boolean; onSign: () => void }) {
  const sig = job.signature
  const closed = job.status === 'cancelled'
  return (
    <Panel title="Sign-off" right={!closed && <button type="button" className={`ak-btn sm ${sig ? 'ghost' : 'go'}`} onClick={onSign}>{Icon.pen}{sig ? 'Sign again' : 'Get signature'}</button>}>
      {sig ? (
        <div className="fl-sig">
          <img src={sig.url} alt={`Signature of ${sig.name}`} />
          <span><b>{sig.name}</b> signed {fmtAgo(sig.signed_at)}{sig.collected_by ? ` · with ${sig.collected_by}` : ''}</span>
        </div>
      ) : (
        <p className="fl-muted">{required ? 'This business needs the customer’s signature before a job can be completed.' : 'Have the customer sign on your screen when the work is done.'}</p>
      )}
    </Panel>
  )
}

export function SignatureDialog({ companyId, jobId, defaultName, onClose, onSaved, toast }: {
  companyId: string; jobId: string; defaultName: string; onClose: () => void; onSaved: (job: any) => void; toast: Toast
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [inked, setInked] = useState(false)
  const [name, setName] = useState(defaultName || '')
  const [busy, setBusy] = useState(false)

  const setup = () => {
    const c = canvas.current
    if (!c) return
    const r = c.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 3)
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr)
    const g = c.getContext('2d')
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, r.width, r.height)
    g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 2.6; g.strokeStyle = '#111114'
    setInked(false)
  }
  useEffect(() => { setup() }, [])
  const pos = (e: React.PointerEvent) => { const r = canvas.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  const down = (e: React.PointerEvent) => { e.preventDefault(); canvas.current.setPointerCapture(e.pointerId); drawing.current = true; last.current = pos(e); const g = canvas.current.getContext('2d'); g.beginPath(); g.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2); g.fillStyle = '#111114'; g.fill(); setInked(true) }
  const moveTo = (e: React.PointerEvent) => {
    if (!drawing.current) return
    const p = pos(e), g = canvas.current.getContext('2d'), l = last.current
    g.beginPath(); g.moveTo(l.x, l.y); g.quadraticCurveTo(l.x, l.y, (l.x + p.x) / 2, (l.y + p.y) / 2); g.lineTo(p.x, p.y); g.stroke()
    last.current = p
  }
  const up = () => { drawing.current = false; last.current = null }
  const save = async () => {
    if (!inked) { toast('Sign in the box first.'); return }
    if (name.trim().length < 2) { toast('Type the name of the person signing.'); return }
    setBusy(true)
    try {
      const blob: Blob = await new Promise((res, rej) => canvas.current.toBlob(b => (b ? res(b) : rej(new Error('Couldn’t read the signature.'))), 'image/png'))
      const url = await putJobFile(companyId, jobId, blob, 'signature.png')
      const r = await api(`/api/jobs/${jobId}/signature`, { method: 'POST', json: { companyId, name: name.trim(), url } })
      onSaved(r.job)
      toast(`Signed off by ${name.trim()}`)
    } catch (e: any) { toast(e.message); setBusy(false) }
  }
  return (
    <Dialog title="Customer sign-off" onClose={onClose} width={560}
      footer={<>
        <button type="button" className="ak-btn ghost" onClick={setup} disabled={busy || !inked}>Clear</button>
        <span style={{ flex: 1 }} />
        <button type="button" className="ak-btn ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="ak-btn go" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save signature'}</button>
      </>}>
      <div>
        <label className="ak-label" htmlFor="sg-name">Name</label>
        <input id="sg-name" className="ak-field" value={name} onChange={e => setName(e.target.value)} maxLength={120} placeholder="Who’s signing" />
      </div>
      <div className="fl-pad-wrap">
        <canvas ref={canvas} className="fl-pad" aria-label="Signature pad: sign with your finger, a pen or the mouse" role="img"
          onPointerDown={down} onPointerMove={moveTo} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
        {!inked && <span className="fl-pad-hint" aria-hidden>Sign here</span>}
        <span className="fl-pad-line" aria-hidden />
      </div>
      <p className="fl-hint">By signing, {name.trim() || 'the customer'} confirms the work is complete.</p>
    </Dialog>
  )
}

export const FIELD_CSS = `
.fl-muted{margin:0;font-size:14px;color:var(--mut)}
.fl-hint{margin:2px 0 0;font-size:12.5px;line-height:1.5;color:var(--soft)}
.fl-people{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.fl-people li{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600;min-width:0}
.fl-people li span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fl-clash{margin-top:12px;padding:10px 12px;border-radius:14px;background:#fff7ed;color:#9a3412;font-size:13px;line-height:1.45}
.fl-clash b{display:flex;align-items:center;gap:6px;font-size:13px}
.fl-clash ul{margin:4px 0 0;padding:0 0 0 22px}
.fl-clash li span{font-weight:650}
[data-theme="dark"] .fl-clash{background:#3a2412;color:#fdba74}
.fl-skel{display:flex;flex-direction:column;gap:8px}
.fl-skel span{height:48px;border-radius:14px;background:var(--f)}
.fl-pick{display:flex;flex-direction:column;gap:4px;max-height:min(52vh,420px);overflow:auto;margin:0 -4px;padding:0 4px}
.fl-pick-row{display:flex;align-items:center;gap:12px;width:100%;padding:8px 10px;border:none;border-radius:14px;background:none;font:inherit;text-align:left;color:var(--ink);cursor:pointer}
.fl-pick-row:hover{background:var(--f)}
.fl-pick-row.on{background:var(--f)}
.fl-pick-t{flex:1;min-width:0;display:flex;flex-direction:column}
.fl-pick-t b{font-size:14.5px;font-weight:600}
.fl-pick-t em{font-style:normal;font-size:12.5px;color:#c2410c}
.fl-tick{width:24px;height:24px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;border:1.5px solid var(--f2);color:#fff}
.fl-pick-row.on .fl-tick{background:var(--ink);border-color:var(--ink)}
.fl-work .fl-timer{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
.fl-clock{display:flex;flex-direction:column;gap:2px}
.fl-clock-n{font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:34px;font-weight:700;letter-spacing:-.03em;line-height:1.05}
.fl-clock-l{font-size:13px;color:var(--mut)}
.fl-clock.on .fl-clock-n{color:#15803d}
.fl-clock.on .fl-clock-l::before{content:'';display:inline-block;width:8px;height:8px;margin-right:6px;border-radius:50%;background:#22c55e;animation:fl-pulse 1.6s ease-in-out infinite}
@keyframes fl-pulse{50%{opacity:.35}}
.fl-timer-b{display:flex;gap:8px;flex-wrap:wrap}
.fl-timer-b .ak-btn{height:44px;padding:0 18px}
.fl-total{display:flex;justify-content:space-between;align-items:baseline;margin-top:14px;padding-top:12px;box-shadow:0 -1px 0 var(--line);font-size:13.5px;color:var(--mut)}
.fl-total b{font-size:15px;color:var(--ink)}
.fl-times{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}
.fl-times li{display:flex;align-items:center;gap:10px;font-size:13.5px}
.fl-times-n{flex:1;min-width:0;display:inline-flex;align-items:center;gap:6px}
.fl-live{display:inline-block;width:7px;height:7px;border-radius:50%;background:#22c55e;animation:fl-pulse 1.6s ease-in-out infinite}
.fl-prog{height:6px;border-radius:99px;background:var(--f);overflow:hidden;margin-bottom:10px}
.fl-prog span{display:block;height:100%;border-radius:99px;background:#22c55e;transition:width .3s ease}
.fl-check{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.fl-check li{display:flex;align-items:flex-start;gap:10px;padding:7px 4px;border-radius:12px}
.fl-check li:hover{background:var(--f)}
.fl-check li.pending{opacity:.6}
.fl-box{width:22px;height:22px;flex-shrink:0;margin-top:1px;display:inline-flex;align-items:center;justify-content:center;border-radius:7px;border:1.8px solid #c4c4cc;background:var(--card,#fff);color:#fff;cursor:pointer;padding:0;transition:background .15s,border-color .15s}
.fl-check li.done .fl-box{background:#22c55e;border-color:#22c55e}
.fl-box svg{width:14px;height:14px}
.fl-check-t{flex:1;min-width:0;font-size:14.5px;line-height:1.45;overflow-wrap:anywhere;cursor:text}
.fl-check li.done .fl-check-t{color:var(--mut);text-decoration:line-through;text-decoration-color:#a1a1aa}
.fl-check-t em{display:block;font-style:normal;font-size:12px;color:var(--soft);text-decoration:none}
.fl-row-tools{display:flex;gap:2px;opacity:0;transition:opacity .15s}
.fl-check li:hover .fl-row-tools,.fl-check li:focus-within .fl-row-tools{opacity:1}
@media (hover:none){.fl-row-tools{opacity:.7}}
.fl-row-tools .ak-icon-btn{width:30px;height:30px}
.fl-edit{flex:1;height:34px!important}
.fl-add{display:flex;gap:8px;margin-top:10px}
.fl-add .ak-field{flex:1;min-width:0}
.fl-menu-n{margin-left:auto;padding-left:12px;font-size:12px;color:var(--mut)}
.jb-menu button{display:flex;align-items:center}
.fl-ph-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.fl-seg-n{margin-left:6px;font-size:12px;color:var(--mut)}
.fl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px}
.fl-ph{position:relative;aspect-ratio:1;border:none;padding:0;border-radius:14px;overflow:hidden;background:var(--f);cursor:zoom-in}
.fl-ph img,.fl-ph video{width:100%;height:100%;object-fit:cover;display:block}
.fl-ph.up{cursor:default}
.fl-ph.up img{opacity:.5}
.fl-spin{position:absolute;inset:0;margin:auto;width:26px;height:26px;border-radius:50%;border:3px solid rgba(255,255,255,.7);border-top-color:var(--ink);animation:fl-rot .8s linear infinite}
@keyframes fl-rot{to{transform:rotate(360deg)}}
.fl-drop{width:100%;display:flex;flex-direction:column;align-items:center;gap:4px;padding:26px 16px;border:none;border-radius:16px;background:var(--f);font:inherit;color:var(--mut);cursor:pointer}
.fl-drop svg{width:22px;height:22px;color:var(--ink);margin-bottom:4px}
.fl-drop b{font-size:14px;color:var(--ink)}
.fl-drop span{font-size:13px}
.fl-lb{position:fixed;inset:0;z-index:1100;display:flex;align-items:center;justify-content:center;background:rgba(10,10,12,.88);animation:jbFade .18s ease both}
.fl-lb-top{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;color:#e4e4e7;font-size:13px}
.fl-lb-btn{width:40px;height:40px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:50%;background:rgba(255,255,255,.12);color:#fff;cursor:pointer}
.fl-lb-img{max-width:min(92vw,1400px);max-height:82vh;border-radius:12px;object-fit:contain}
.fl-lb-nav{position:absolute;top:50%;transform:translateY(-50%);width:46px;height:46px;border:none;border-radius:50%;background:rgba(255,255,255,.14);color:#fff;font-size:30px;line-height:1;cursor:pointer}
.fl-lb-nav.l{left:14px}.fl-lb-nav.r{right:14px}
.fl-sig{display:flex;flex-direction:column;gap:8px}
.fl-sig img{width:100%;max-width:360px;border-radius:12px;background:#fff;box-shadow:0 0 0 1px var(--line)}
.fl-sig span{font-size:13px;color:var(--mut)}
.fl-sig b{color:var(--ink)}
.fl-pad-wrap{position:relative}
.fl-pad{display:block;width:100%;height:220px;border-radius:16px;background:#fff;box-shadow:0 0 0 1.5px var(--f2) inset;touch-action:none;cursor:crosshair}
.fl-pad-hint{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:15px;color:#a1a1aa;pointer-events:none}
.fl-pad-line{position:absolute;left:24px;right:24px;bottom:46px;height:1.5px;background:#e4e4e7;pointer-events:none}
@media (max-width:560px){.fl-pad{height:200px}.fl-clock-n{font-size:30px}.fl-timer-b{width:100%}.fl-timer-b .ak-btn{flex:1;justify-content:center}}
@media (prefers-reduced-motion:reduce){.fl-live,.fl-clock.on .fl-clock-l::before,.fl-spin{animation:none}}
`
