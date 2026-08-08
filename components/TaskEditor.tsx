'use client'

// Shared "New task" editor — the full task-creation form used by both the
// Tasks page (its New task drawer) and the Calendar page (Add event → Task).
// Keeping it here means the two can't drift apart. It writes straight to
// conversation_tasks so a task created anywhere shows up everywhere.

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import AssigneePicker from '@/components/AssigneePicker'
import AttachmentUploader from '@/components/AttachmentUploader'
import MentionInput, { resolveMentions } from '@/components/MentionInput'
import { useDraft } from '@/lib/drafts'

const PRIORITY = {
  high: { label: 'High', color: '#dc2626', bg: '#fef2f2' },
  normal: { label: 'Normal', color: '#6b7280', bg: '#f9fafb' },
  low: { label: 'Low', color: '#2563eb', bg: '#eff6ff' },
} as const

const TASK_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b']
const tint = (hex: string, a: number) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : hex
}
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
type Recurrence = { freq: 'daily' | 'weekly' | 'monthly'; interval: number; days?: number[]; count: number }

const dueFromInput = (ymd: string): string | null => {
  if (!ymd) return null
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d, 9, 0, 0).toISOString()
}

// Pre-generate the due dates for a repeating task. Bounded so a bad rule can't
// create thousands of rows.
function recurrenceDates(base: Date, rec: Recurrence): Date[] {
  const out: Date[] = []
  const count = Math.max(1, Math.min(rec.count || 1, 60))
  const interval = Math.max(1, rec.interval || 1)
  const atStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
  const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
  const start = atStart(base)
  if (rec.freq === 'weekly' && rec.days && rec.days.length) {
    const days = [...rec.days].sort((a, b) => a - b)
    let weekStart = addDays(start, -start.getDay())   // Sunday of the base week
    let guard = 0
    while (out.length < count && guard++ < 400) {
      for (const dow of days) {
        const d = addDays(weekStart, dow)
        if (d >= start && out.length < count) out.push(d)
      }
      weekStart = addDays(weekStart, 7 * interval)
    }
  } else {
    const d = new Date(start)
    for (let i = 0; i < count; i++) {
      out.push(new Date(d))
      if (rec.freq === 'daily') d.setDate(d.getDate() + interval)
      else if (rec.freq === 'weekly') d.setDate(d.getDate() + 7 * interval)
      else d.setMonth(d.getMonth() + interval)   // monthly
    }
  }
  return out.slice(0, count)
}

function OrderSearchModal({ companyId, onClose, onPick }: any) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      try { const res = await fetch(`/api/orders/search?companyId=${companyId}&q=${encodeURIComponent(q.trim())}`); const d = await res.json(); setResults(d.orders || []) }
      catch { setResults([]) } finally { setLoading(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [q, companyId])
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 460, maxWidth: '95vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>Link to order</h3>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Order #, customer name, phone, email or item…" style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box' }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <p style={{ padding: 16, fontSize: 13, color: 'var(--slate)' }}>Searching…</p>}
          {!loading && q.trim().length >= 2 && results.length === 0 && <p style={{ padding: 16, fontSize: 13, color: 'var(--slate)' }}>No orders match “{q}”.</p>}
          {results.map(o => (
            <button key={o.order_id} onClick={() => onPick(o)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none', borderBottom: '1px solid var(--border)', background: '#fff', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>#{o.order_number}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--coral)' }}>${o.total.toFixed(2)}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 2 }}>{o.customer}{o.status ? ` · ${o.status}` : ''}</div>
              {o.items?.length > 0 && <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.items.join(', ')}</div>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function TaskEditor({ companyId, team, outlets = [], me, userId, initial, onClose, onSaved }: any) {
  // `initial` seeds the form (used by "end repeat & create new").
  const [title, setTitle] = useState(initial?.title || '')
  const [priority, setPriority] = useState(initial?.priority || 'normal')
  const [due, setDue] = useState(initial?.due || '')
  const [assignees, setAssignees] = useState<any[]>(initial?.assignees || [])
  const [order, setOrder] = useState<any>(null)
  const [color, setColor] = useState<string>(initial?.color || '')          // hex or '' (none)
  const [locationIds, setLocationIds] = useState<string[]>(initial?.locationIds || (initial?.locationId ? [initial.locationId] : [])) // outlets (multi)
  const [attachments, setAttachments] = useState<any[]>(initial?.attachments || [])
  const [repeat, setRepeat] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none')
  const [repeatDays, setRepeatDays] = useState<number[]>([]) // weekly: 0..6
  const [repeatCount, setRepeatCount] = useState(6)
  const [showOrderSearch, setShowOrderSearch] = useState(false)
  const [saving, setSaving] = useState(false)

  // Keep a half-written task so it isn't lost on navigating away.
  const draft = useDraft(userId, companyId, 'task', '', { title, priority, due, assignees, order, color, locationIds, attachments, repeat, repeatDays, repeatCount },
    { isEmpty: (v: any) => !v?.title?.trim() })
  useEffect(() => {
    // Don't overwrite a seeded form (from "end repeat & create new") with a draft.
    if (initial) return
    if (draft.ready && draft.restored && !title) {
      const r = draft.restored
      if (r.title) setTitle(r.title)
      if (r.priority) setPriority(r.priority)
      if (r.due) setDue(r.due)
      if (Array.isArray(r.assignees)) setAssignees(r.assignees)
      if (r.order) setOrder(r.order)
      if (r.color) setColor(r.color)
      if (Array.isArray(r.locationIds)) setLocationIds(r.locationIds)
      if (Array.isArray(r.attachments)) setAttachments(r.attachments)
      if (r.repeat) setRepeat(r.repeat)
      if (Array.isArray(r.repeatDays)) setRepeatDays(r.repeatDays)
      if (r.repeatCount) setRepeatCount(r.repeatCount)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.ready])

  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    const mentioned = resolveMentions(title, team as any)
    // Only real UUIDs may go into uuid columns. A member who was invited but
    // hasn't signed in has no auth id, so their "id" can be a name-derived
    // value — that must become null rather than crash the uuid column.
    const isUuid = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    // The assignees JSONB may itself carry non-uuid ids; clean them so nothing
    // downstream (filters, notifications) mistakes a name for an id.
    const cleanAssignees = (assignees || []).map((a: any) => ({ id: isUuid(a.id) ? a.id : null, name: a.name }))
    const firstUuid = cleanAssignees.map((a: any) => a.id).find((id: any) => isUuid(id)) || null
    const baseDue = dueFromInput(due)

    // Repeating tasks pre-generate a series of dated occurrences. Everything
    // else is a single row on the chosen due date (or none).
    const rec: Recurrence | null = repeat === 'none' ? null
      : { freq: repeat, interval: 1, count: repeatCount, ...(repeat === 'weekly' ? { days: repeatDays.length ? repeatDays : [new Date().getDay()] } : {}) }
    let dueDates: (string | null)[] = [baseDue]
    if (rec) {
      const start = baseDue ? new Date(baseDue) : new Date()
      dueDates = recurrenceDates(start, rec).map(d => d.toISOString())
      if (!dueDates.length) dueDates = [baseDue]
    }

    // A shared id ties the occurrences of a repeat together so they can be
    // edited/deleted as a series later.
    const seriesId = rec ? (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.round(Math.random() * 1e9)}`) : null
    const common: any = {
      company_id: companyId, text: title.trim(), title: title.trim(), status: 'todo', done: false, priority,
      assignees: cleanAssignees, assigned_to_id: firstUuid, assigned_to: cleanAssignees[0]?.name || null,
      created_by: me, created_by_id: isUuid(userId) ? userId : null,
      mentions: mentioned.map((m: any) => ({ id: isUuid(m.id) ? m.id : null, name: m.name })),
      order_id: order?.order_id ? String(order.order_id) : null, order_number: order?.order_number ? String(order.order_number) : null, order_customer: order?.customer || null, order_total: order?.total || null,
      color: color || null, location_id: locationIds[0] || null, location_ids: locationIds, attachments, recurrence: rec, series_id: seriesId,
    }
    const rows = dueDates.map(d => ({ ...common, due_date: d }))
    const row = rows[0]
    try {
      const { error: insErr } = await (supabase as any).from('conversation_tasks').insert(rows)
      if (insErr) {
        // A column may be missing/typed differently on this database (e.g. before
        // the V211 migration adds color/location_id/recurrence). Retry with only
        // the core columns so a task can always be created; extras are best-effort.
        console.error('[task create] full insert failed, retrying minimal', insErr, row)
        const minimalRows = dueDates.map(d => {
          const m: any = { company_id: companyId, text: title.trim(), done: false, due_date: d, assigned_to: cleanAssignees[0]?.name || null }
          if (isUuid(firstUuid)) m.assigned_to_id = firstUuid
          return m
        })
        const { error: minErr } = await (supabase as any).from('conversation_tasks').insert(minimalRows)
        if (minErr) throw minErr
      }
      // Tell the people involved — in-app, by email AND by SMS. Being assigned
      // work or tagged in it should reach the person, not just sit in an app
      // they may not have open.
      const assignedIds = new Set<string>()
      for (const a of cleanAssignees) {
        const tm = team.find((t: any) => t.user_id === a.id || t.id === a.id)
        if (tm?.user_id) assignedIds.add(tm.user_id)
      }
      const mentionedIds = new Set<string>()
      for (const m of mentioned as any[]) {
        const tm = team.find((t: any) => t.id === m.id || t.user_id === m.id)
        // Someone both assigned and mentioned only needs telling once.
        if (tm?.user_id && !assignedIds.has(tm.user_id)) mentionedIds.add(tm.user_id)
      }
      assignedIds.delete(userId as any); mentionedIds.delete(userId as any)

      const notifyMembers = async (ids: string[], titleText: string, type: string) => {
        if (ids.length === 0) return
        try {
          await fetch('/api/notify/members', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              companyId, userIds: ids, type,
              title: titleText, body: title.trim().slice(0, 200), link: '/admin/tasks',
            }),
          })
        } catch { /* the task is created either way */ }
      }
      await notifyMembers(Array.from(assignedIds), `${me} assigned you a task`, 'task_assigned')
      await notifyMembers(Array.from(mentionedIds), `${me} mentioned you in a task`, 'task_mention')
      await draft.discard()
      onSaved()
    } catch (e: any) { console.error('[task create] payload was', row); alert('Could not create task: ' + e.message); setSaving(false) }
  }
  const L: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '16px 0 7px' }
  return (
    <div style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 12px' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{initial ? 'Continue repeat as new' : 'New task'}</h3>
        {draft.saved && title.trim() && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--slate)' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Draft saved
          </span>
        )}
      </div>
      <MentionInput value={title} onChange={(v) => setTitle(v)} team={team as any} multiline rows={2} placeholder="What needs doing? @ to mention" style={{ fontSize: 14 }} />
      <p style={L}>Priority</p>
      <div style={{ display: 'flex', gap: 5 }}>
        {(['high', 'normal', 'low'] as const).map(p => (
          <button key={p} onClick={() => setPriority(p)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid ' + (priority === p ? PRIORITY[p].color : 'var(--border)'), background: priority === p ? PRIORITY[p].bg : '#fff', color: priority === p ? PRIORITY[p].color : 'var(--slate)' }}>{PRIORITY[p].label}</button>
        ))}
      </div>
      <p style={L}>Due date</p>
      <input type="date" value={due} onChange={e => setDue(e.target.value)} style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box' }} />

      {/* Repeat — pre-generates a series of dated occurrences on save. */}
      <p style={L}>Repeat</p>
      <div style={{ display: 'flex', gap: 5 }}>
        {(['none', 'daily', 'weekly', 'monthly'] as const).map(r => (
          <button key={r} onClick={() => setRepeat(r)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize', border: '1px solid ' + (repeat === r ? 'var(--coral)' : 'var(--border)'), background: repeat === r ? 'var(--peach)' : '#fff', color: repeat === r ? 'var(--coral)' : 'var(--slate)' }}>{r === 'none' ? 'None' : r}</button>
        ))}
      </div>
      {repeat === 'weekly' && (
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          {WEEKDAYS.map((w, i) => {
            const on = repeatDays.includes(i)
            return (
              <button key={i} onClick={() => setRepeatDays(prev => on ? prev.filter(x => x !== i) : [...prev, i])}
                title={`Repeat on ${w}`}
                style={{ flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1px solid ' + (on ? 'var(--coral)' : 'var(--border)'), background: on ? 'var(--coral)' : '#fff', color: on ? '#fff' : 'var(--slate)' }}>{w[0]}</button>
            )
          })}
        </div>
      )}
      {repeat !== 'none' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: 12.5, color: 'var(--slate)', fontWeight: 600 }}>Create</span>
          <input type="number" min={1} max={60} value={repeatCount}
            onChange={e => setRepeatCount(Math.max(1, Math.min(60, parseInt(e.target.value) || 1)))}
            style={{ width: 64, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box' }} />
          <span style={{ fontSize: 12.5, color: 'var(--slate)', fontWeight: 600 }}>occurrences</span>
        </div>
      )}

      {/* Colour code */}
      <p style={L}>Colour</p>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        <button onClick={() => setColor('')} title="No colour"
          style={{ width: 26, height: 26, borderRadius: '50%', cursor: 'pointer', border: '1px solid var(--border)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--slate)', position: 'relative' }}>
          {color === '' && <span style={{ width: 12, height: 2, background: 'var(--slate)', transform: 'rotate(-45deg)', position: 'absolute' }} />}
        </button>
        {TASK_COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)} title={c}
            style={{ width: 26, height: 26, borderRadius: '50%', cursor: 'pointer', background: c, border: color === c ? '2px solid var(--ink)' : '2px solid transparent', boxShadow: color === c ? `0 0 0 2px ${tint(c, 0.4)}` : 'none' }} />
        ))}
      </div>

      {outlets.length > 0 && (<>
        <p style={L}>Outlets <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--slate)' }}>— select one or more</span></p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {outlets.map((o: any) => {
            const on = locationIds.includes(o.id)
            return (
              <button key={o.id} type="button"
                onClick={() => setLocationIds(prev => on ? prev.filter(x => x !== o.id) : [...prev, o.id])}
                style={{ padding: '8px 13px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: '1px solid ' + (on ? 'var(--coral)' : 'var(--border)'), background: on ? 'var(--peach)' : '#fff', color: on ? 'var(--coral)' : 'var(--slate)' }}>
                {on ? '✓ ' : ''}{o.label || o.suburb || 'Outlet'}
              </button>
            )
          })}
        </div>
        {locationIds.length === 0 && <p style={{ fontSize: 11.5, color: 'var(--slate)', margin: '6px 0 0' }}>Not tied to an outlet.</p>}
      </>)}

      <p style={L}>Photos &amp; videos</p>
      <AttachmentUploader companyId={companyId} value={attachments} onChange={setAttachments} folder="task" compact />

      <p style={L}>Assignees</p>
      <AssigneePicker members={team} value={assignees} onChange={setAssignees} />
      <p style={L}>Linked order</p>
      {order ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: '#f8f9ff' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>#{order.order_number}</div>
            <div style={{ fontSize: 11.5, color: 'var(--slate)' }}>{order.customer} · ${order.total.toFixed(2)}</div>
          </div>
          <button onClick={() => setOrder(null)} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Remove</button>
        </div>
      ) : (
        <button onClick={() => setShowOrderSearch(true)} style={{ width: '100%', padding: '10px', borderRadius: 9, border: '1px dashed var(--border)', background: 'var(--canvas)', color: 'var(--slate)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Link to order</button>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button onClick={onClose} style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--slate)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
        <button onClick={save} disabled={!title.trim() || saving} style={{ flex: 2, padding: '11px 0', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: title.trim() ? 'pointer' : 'default', opacity: title.trim() && !saving ? 1 : 0.6 }}>{saving ? 'Creating…' : repeat !== 'none' ? `Create ${repeatCount} tasks` : 'Create task'}</button>
      </div>
      {showOrderSearch && <OrderSearchModal companyId={companyId} onClose={() => setShowOrderSearch(false)} onPick={(o: any) => { setOrder(o); setShowOrderSearch(false) }} />}
    </div>
  )
}
