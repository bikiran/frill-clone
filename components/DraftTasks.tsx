'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// A compact, dismissible "draft tasks" panel. Given a list of AI-detected
// action items (from a call summary or a chat AI summary), it lets an agent
// tweak each one — include/exclude, priority, assignee, outlet, and an optional
// reminder (a due date the task-reminder cron pushes on) — then create them as
// real conversation_tasks in one go. Shared by the call card and the inbox AI
// summary panel so both read and behave identically.

type Member = { id: string; user_id?: string | null; name: string }
type Outlet = { id: string; label?: string | null; suburb?: string | null }
type Draft = { text: string; priority: 'low' | 'normal' | 'high'; include: boolean; assigneeId: string; locationId: string; remindAt: string }

const SparkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/>
  </svg>
)
const ClockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" />
  </svg>
)

const selStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, padding: '3px 6px', borderRadius: 7, border: '1px solid #ede9fe', background: '#fff', color: 'var(--slate)', cursor: 'pointer', maxWidth: 150 }

const fmtWhen = (iso: string) => {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' })
  } catch { return 'reminder' }
}

export default function DraftTasks({
  todos, conversationId, companyId, source, storageKey,
  teamMembers = [], outlets = [], defaultLocationId = null, actor, onCreated, onClosedChange,
}: {
  todos: string[]
  conversationId?: string | null
  companyId?: string | null
  source: 'call_summary' | 'ai_summary'
  storageKey: string
  teamMembers?: Member[]
  outlets?: Outlet[]
  defaultLocationId?: string | null
  actor?: { id?: string | null; name?: string | null } | null
  onCreated?: () => void
  onClosedChange?: (closed: boolean) => void
}) {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [closed, setClosed] = useState(false)
  const [creating, setCreating] = useState(false)
  const [remindOpen, setRemindOpen] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (typeof window === 'undefined') return
    const done = window.localStorage.getItem(storageKey) === 'done'
    setClosed(done)
    onClosedChange?.(done)
    if (done) { setDrafts([]); return }
    setDrafts((todos || []).filter(Boolean).map(t => ({
      text: String(t), priority: 'normal', include: true,
      assigneeId: '', locationId: defaultLocationId || '', remindAt: '',
    })))
  }, [storageKey, JSON.stringify(todos), defaultLocationId])

  const close = () => {
    try { if (typeof window !== 'undefined') window.localStorage.setItem(storageKey, 'done') } catch {}
    setClosed(true)
    onClosedChange?.(true)
  }
  const patch = (i: number, p: Partial<Draft>) => setDrafts(prev => prev.map((d, di) => di === i ? { ...d, ...p } : d))
  const toggleRemind = (i: number) => setRemindOpen(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })

  const createTasks = async () => {
    const chosen = drafts.filter(d => d.include && d.text.trim())
    if (!chosen.length || !conversationId || !companyId) return
    setCreating(true)
    try {
      const base = chosen.map(d => {
        const m = teamMembers.find(x => x.id === d.assigneeId)
        const uid = m ? (m.user_id || m.id) : null
        const loc = d.locationId || null
        return {
          conversation_id: conversationId, company_id: companyId,
          text: d.text.trim(), done: false, priority: d.priority,
          created_by: actor?.name || null, created_by_id: actor?.id || null,
          assigned_to: m?.name || null, assigned_to_id: uid,
          assignees: m ? [{ id: uid, name: m.name }] : [],
          location_id: loc, location_ids: loc ? [loc] : [],
          due_date: d.remindAt ? new Date(d.remindAt).toISOString() : null,
        }
      })
      // Tag the origin when the column exists; otherwise insert without it so
      // tasks are never dropped on an un-migrated database.
      let { error } = await (supabase as any).from('conversation_tasks').insert(base.map(r => ({ ...r, source })))
      if (error) { ({ error } = await (supabase as any).from('conversation_tasks').insert(base)) }
      if (error) throw error
      close()
      onCreated?.()
    } catch (e) {
      console.warn('[draft tasks] create failed', e)
    } finally { setCreating(false) }
  }

  if (closed || drafts.length === 0) return null
  const chosenCount = drafts.filter(d => d.include).length

  return (
    <div style={{ paddingTop: 12, borderTop: '1px solid #e3e9f2' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 6 }}>
          <SparkIcon /> Draft tasks
          <span style={{ fontWeight: 600, fontSize: 10.5, color: 'var(--slate)' }}>· from {drafts.length} action item{drafts.length === 1 ? '' : 's'}</span>
        </p>
        <button type="button" onClick={close} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: 'var(--slate)' }}>Dismiss</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {drafts.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '9px 11px', borderRadius: 10, background: '#faf5ff', border: '1px solid #ede9fe' }}>
            <input type="checkbox" checked={d.include} onChange={() => patch(i, { include: !d.include })} style={{ marginTop: 3, cursor: 'pointer', accentColor: '#7c3aed', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.4, opacity: d.include ? 1 : 0.5 }}>{d.text}</span>
              {/* Compact controls — kept subtle so the panel doesn't feel busy. */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, opacity: d.include ? 1 : 0.5 }}>
                <select value={d.priority} onChange={e => patch(i, { priority: e.target.value as any })} aria-label="Priority" style={selStyle}>
                  <option value="low">Low</option>
                  <option value="normal">Medium</option>
                  <option value="high">High</option>
                </select>
                {teamMembers.length > 0 && (
                  <select value={d.assigneeId} onChange={e => patch(i, { assigneeId: e.target.value })} aria-label="Assignee"
                    style={{ ...selStyle, color: d.assigneeId ? '#7c3aed' : 'var(--slate)' }}>
                    <option value="">＋ Assign</option>
                    {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                )}
                {outlets.length > 1 && (
                  <select value={d.locationId} onChange={e => patch(i, { locationId: e.target.value })} aria-label="Outlet"
                    style={{ ...selStyle, color: d.locationId ? '#7c3aed' : 'var(--slate)' }}>
                    <option value="">＋ Outlet</option>
                    {outlets.map(o => <option key={o.id} value={o.id}>{o.label || o.suburb || 'Outlet'}</option>)}
                  </select>
                )}
                {/* Reminder — an alarm-clock button that reveals a date/time
                    picker; the chosen time becomes the task's due date (the
                    reminder cron pushes the assignee when it arrives). */}
                {d.remindAt ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 7, background: '#ede9fe', color: '#7c3aed', fontSize: 11, fontWeight: 700 }}>
                    <ClockIcon /> {fmtWhen(d.remindAt)}
                    <button type="button" onClick={() => { patch(i, { remindAt: '' }); setRemindOpen(prev => { const n = new Set(prev); n.delete(i); return n }) }}
                      title="Clear reminder" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#7c3aed', display: 'inline-flex', fontWeight: 800, fontSize: 13, lineHeight: 1 }}>×</button>
                  </span>
                ) : remindOpen.has(i) ? (
                  <input type="datetime-local" autoFocus value={d.remindAt}
                    onChange={e => patch(i, { remindAt: e.target.value })}
                    onBlur={() => { if (!d.remindAt) toggleRemind(i) }}
                    style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 7, border: '1px solid #d8b4fe', background: '#fff', color: 'var(--ink)' }} />
                ) : (
                  <button type="button" onClick={() => toggleRemind(i)} title="Set a reminder"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 7, border: '1px dashed #d8b4fe', background: '#fff', color: '#7c3aed', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    <ClockIcon /> Remind
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: '#7c3aed', background: '#f3e8ff', padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
          Source · {source === 'call_summary' ? 'Call summary' : 'Chat summary'}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={createTasks} disabled={creating || chosenCount === 0}
          style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: chosenCount ? '#7c3aed' : '#c4b5fd', color: '#fff', fontSize: 12, fontWeight: 700, cursor: creating || !chosenCount ? 'default' : 'pointer' }}>
          {creating ? 'Creating…' : `Create ${chosenCount} task${chosenCount === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  )
}
