'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { authFetch } from '@/lib/auth-fetch'
import { notifyIntegrations } from '@/lib/integrations-notify'
import { groupActionItems } from '@/lib/task-dedupe'

// A compact, dismissible "draft tasks" panel. Given a list of AI-detected
// action items (from a call summary or a chat AI summary), it lets an agent
// tweak each one — include/exclude, priority, assignee, outlet, and an optional
// reminder (a due date the task-reminder cron pushes on) — then create them as
// real conversation_tasks in one go. Shared by the call card and the inbox AI
// summary panel so both read and behave identically.
//
// Items about the same job arrive as one draft with a checklist (lib/task-
// dedupe groups them; the agent can untick steps or split them apart). When an
// open task already covers a draft it says so — "Already a task: …" — and adds
// the steps to that task's checklist unless the agent picks "Create anyway".
// Once the chat has moved on past an unused card it folds to one row.

type Member = { id: string; user_id?: string | null; name: string }
type Outlet = { id: string; label?: string | null; suburb?: string | null }
type Step = { text: string; include: boolean }
type Match = { taskId: string; title: string; checklistCount: number; newSteps: number }
type Draft = {
  title: string; items: Step[]; priority: 'low' | 'normal' | 'high'; include: boolean
  assigneeId: string; locationId: string; remindAt: string
  match: Match | null; mode: 'add' | 'create'
}

// Open/closed per card while on the page (survives switching conversations).
const expandedMemo = new Map<string, boolean>()

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
const Chevron = ({ open }: { open: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
    style={{ flexShrink: 0, transition: 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)', transform: open ? 'rotate(180deg)' : 'none' }}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
)
const TaskIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
)

const selStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, padding: '3px 6px', borderRadius: 7, border: '1px solid #ede9fe', background: '#fff', color: 'var(--slate)', cursor: 'pointer', maxWidth: 150 }
const chipBtn = (on: boolean): React.CSSProperties => ({ padding: '3px 9px', borderRadius: 7, border: `1px solid ${on ? '#7c3aed' : '#ede9fe'}`, background: on ? '#f3e8ff' : '#fff', color: '#7c3aed', fontSize: 11, fontWeight: 700, cursor: 'pointer' })

const fmtWhen = (iso: string) => {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' })
  } catch { return 'reminder' }
}

const blankDraft = (title: string, steps: string[], locationId: string): Draft => ({
  title, items: steps.map(text => ({ text, include: true })), priority: 'normal', include: true,
  assigneeId: '', locationId, remindAt: '', match: null, mode: 'create',
})

/** The steps a draft will save (a one-line draft is its own single step). */
const stepsOf = (d: Draft) => d.items.filter(i => i.include && i.text.trim()).map(i => i.text.trim())

export default function DraftTasks({
  todos, conversationId, companyId, source, storageKey,
  teamMembers = [], outlets = [], defaultLocationId = null, actor, onCreated, onClosedChange, bare = false,
  contactName = null, collapsible = false,
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
  bare?: boolean
  /** The customer's name, for a grouped draft's title ("… for Shery"). */
  contactName?: string | null
  /** Newer messages sit below this card and it's unused: show it as one closed row. */
  collapsible?: boolean
}) {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [closed, setClosed] = useState(false)
  const [creating, setCreating] = useState(false)
  const [remindOpen, setRemindOpen] = useState<Set<number>>(new Set())
  // Combine mode: merge the checked drafts into ONE task instead of one each
  // (their steps become the task's checklist).
  const [combine, setCombine] = useState(false)
  // Open/closed as the agent last set it on this page; until then it folds
  // away whenever the chat has moved on past it.
  const [userOpen, setUserOpen] = useState<boolean | null>(() => expandedMemo.has(storageKey) ? !!expandedMemo.get(storageKey) : null)
  const [error, setError] = useState('')
  const open = (expandedMemo.has(storageKey) ? !!expandedMemo.get(storageKey) : userOpen) ?? !collapsible
  const toggle = () => { expandedMemo.set(storageKey, !open); setUserOpen(!open) }

  useEffect(() => {
    if (typeof window === 'undefined') return
    let done = false
    try { done = window.localStorage.getItem(storageKey) === 'done' } catch {}
    setClosed(done)
    onClosedChange?.(done)
    if (done) { setDrafts([]); return }
    const groups = groupActionItems((todos || []).filter(Boolean).map(String), { contactName })
    setDrafts(groups.map(g => blankDraft(g.title, g.steps, defaultLocationId || '')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, JSON.stringify(todos), defaultLocationId, contactName])

  // Which drafts an open task already covers.
  const draftKey = drafts.map(d => d.title).join('|')
  useEffect(() => {
    if (!drafts.length || !conversationId || !companyId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await authFetch('/api/tasks/ai-drafts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'match', companyId, conversationId, drafts: drafts.map(d => ({ title: d.title, steps: d.items.map(i => i.text) })) }),
        })
        if (!res.ok || cancelled) return
        const { matches } = await res.json()
        if (cancelled || !Array.isArray(matches)) return
        setDrafts(prev => prev.map((d, i) => matches[i] && !d.match ? { ...d, match: matches[i], mode: 'add' } : d))
      } catch { /* no match info: they're created as new tasks */ }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, conversationId, companyId])

  const close = () => {
    try { if (typeof window !== 'undefined') window.localStorage.setItem(storageKey, 'done') } catch {}
    setClosed(true)
    onClosedChange?.(true)
  }
  const patch = (i: number, p: Partial<Draft>) => setDrafts(prev => prev.map((d, di) => di === i ? { ...d, ...p } : d))
  const patchStep = (i: number, j: number, p: Partial<Step>) => setDrafts(prev => prev.map((d, di) => di === i ? { ...d, items: d.items.map((s, sj) => sj === j ? { ...s, ...p } : s) } : d))
  const toggleRemind = (i: number) => setRemindOpen(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })
  // One draft per step, for when the grouping got it wrong.
  const split = (i: number) => setDrafts(prev => prev.flatMap((d, di) => di !== i ? [d] : d.items.filter(s => s.text.trim()).map(s => ({ ...blankDraft(s.text, [], d.locationId), priority: d.priority, assigneeId: d.assigneeId, include: s.include }))))

  // Legacy path if the drafts route can't be reached: insert straight from the
  // browser, dropping optional columns an older database doesn't have.
  const insertWithFallback = async (rows: any[]) => {
    // Without a checklist column the steps go in the text; the oldest schema has no title either.
    const flat = (r: any, drop: string[]) => {
      const out: any = { ...r, text: r.checklist?.length ? `${r.text}\n\n${r.checklist.map((c: any) => `- ${c.text}`).join('\n')}` : r.text }
      for (const k of drop) delete out[k]
      return out
    }
    const variants = [rows.map(r => ({ ...r, source })), rows, rows.map(r => flat(r, ['checklist'])), rows.map(r => flat(r, ['checklist', 'title']))]
    let error: any = null
    for (const v of variants) { ({ error } = await (supabase as any).from('conversation_tasks').insert(v)); if (!error) return }
    throw error
  }

  const createTasks = async () => {
    let chosen = drafts.filter(d => d.include && (d.title.trim() || stepsOf(d).length))
    if (!chosen.length || !conversationId || !companyId) return
    // Combine into a single task: every checked draft's steps on one checklist.
    if (combine && chosen.length > 1) {
      const steps = chosen.flatMap(d => (d.items.length ? stepsOf(d) : [d.title.trim()]))
      chosen = [{ ...chosen[0], items: steps.map(text => ({ text, include: true })) }]
    }
    setCreating(true); setError('')
    const payload = chosen.map(d => {
      const m = teamMembers.find(x => x.id === d.assigneeId)
      return {
        title: d.title.trim() || stepsOf(d)[0], steps: d.items.length ? stepsOf(d) : [],
        priority: d.priority, assigneeId: m ? (m.user_id || m.id) : null, assigneeName: m?.name || null,
        locationId: d.locationId || null, dueDate: d.remindAt ? new Date(d.remindAt).toISOString() : null,
        mode: d.match && d.mode === 'add' ? 'add' : 'create', taskId: d.match?.taskId || null,
      }
    })
    try {
      let res: Response | null = null
      try {
        res = await authFetch('/api/tasks/ai-drafts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'apply', companyId, conversationId, source, actorName: actor?.name || null, drafts: payload }),
        })
      } catch { res = null }   // unreachable: the legacy insert below
      if (res && !res.ok && res.status !== 404) { const j = await res.json().catch(() => ({})); throw new Error(j?.error || 'Could not save the tasks') }
      if (!res || !res.ok) {
        await insertWithFallback(payload.map(p => ({
          conversation_id: conversationId, company_id: companyId,
          text: p.title, title: p.title, done: false, priority: p.priority,
          created_by: actor?.name || null, created_by_id: actor?.id || null,
          assigned_to: p.assigneeName, assigned_to_id: p.assigneeId,
          assignees: p.assigneeId ? [{ id: p.assigneeId, name: p.assigneeName }] : [],
          location_id: p.locationId, location_ids: p.locationId ? [p.locationId] : [],
          due_date: p.dueDate,
          ...(p.steps.length ? { checklist: p.steps.map((text, k) => ({ id: `${Date.now().toString(36)}-${k}`, text, done: false })) } : {}),
        })))
      }
      notifyIntegrations('task.created', { companyId })
      close()
      onCreated?.()
    } catch (e: any) {
      console.warn('[draft tasks] create failed', e)
      setError(e?.message || 'Could not save the tasks')
    } finally { setCreating(false) }
  }

  if (closed || drafts.length === 0) return null
  const chosen = drafts.filter(d => d.include)
  const chosenCount = chosen.length
  const adds = chosen.filter(d => d.match && d.mode === 'add').length
  const folded = collapsible && !open
  const actionLabel = creating ? 'Saving…'
    : (combine && chosenCount > 1) ? (chosen[0]?.match && chosen[0].mode === 'add' ? 'Add to 1 task' : 'Create 1 task')
    : adds === chosenCount ? `Add to ${chosenCount} task${chosenCount === 1 ? '' : 's'}`
    : adds === 0 ? `Create ${chosenCount} task${chosenCount === 1 ? '' : 's'}`
    : `Create ${chosenCount - adds} · Add to ${adds}`

  return (
    <div style={bare ? { paddingTop: 4 } : { paddingTop: 12, borderTop: '1px solid #e3e9f2' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: folded ? 0 : 8 }}>
        {collapsible ? (
          <button type="button" onClick={toggle} aria-expanded={open} aria-label={open ? 'Hide draft tasks' : 'Show draft tasks'}
            style={{ margin: 0, padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
            <SparkIcon /> Draft tasks
            <span style={{ fontWeight: 600, fontSize: 10.5, color: 'var(--slate)' }}>· {folded ? `${drafts.length} to review` : `from ${drafts.length} action item${drafts.length === 1 ? '' : 's'}`}</span>
            <Chevron open={open} />
          </button>
        ) : (
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 6 }}>
            <SparkIcon /> Draft tasks
            <span style={{ fontWeight: 600, fontSize: 10.5, color: 'var(--slate)' }}>· from {drafts.length} action item{drafts.length === 1 ? '' : 's'}</span>
          </p>
        )}
        <button type="button" onClick={close} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: 'var(--slate)' }}>Dismiss</button>
      </div>

      {!folded && <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {drafts.map((d, i) => {
          const adding = !!d.match && d.mode === 'add'
          return (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '9px 11px', borderRadius: 10, background: '#faf5ff', border: '1px solid #ede9fe' }}>
            <input type="checkbox" checked={d.include} onChange={() => patch(i, { include: !d.include })} aria-label="Include" style={{ marginTop: 3, cursor: 'pointer', accentColor: '#7c3aed', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7, opacity: d.include ? 1 : 0.5 }}>
              {d.items.length ? (
                <input value={d.title} onChange={e => patch(i, { title: e.target.value })} aria-label="Task title"
                  style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.4, border: 'none', background: 'transparent', padding: 0, outline: 'none', width: '100%', fontFamily: 'inherit' }} />
              ) : (
                <span style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.4 }}>{d.title}</span>
              )}

              {/* The job's steps — its checklist. */}
              {d.items.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {d.items.map((s, j) => (
                    <label key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12, color: 'var(--ink)', lineHeight: 1.4, cursor: 'pointer' }}>
                      <input type="checkbox" checked={s.include} onChange={() => patchStep(i, j, { include: !s.include })} style={{ marginTop: 2, cursor: 'pointer', accentColor: '#7c3aed', flexShrink: 0, width: 12, height: 12 }} />
                      <span style={{ opacity: s.include ? 1 : 0.5, textDecoration: s.include ? 'none' : 'line-through' }}>{s.text}</span>
                    </label>
                  ))}
                  <span style={{ fontSize: 10.5, color: 'var(--slate)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {d.items.filter(s => s.include).length} checklist step{d.items.filter(s => s.include).length === 1 ? '' : 's'}
                    {d.items.length > 1 && (
                      <button type="button" onClick={() => split(i)} title="Make each step its own task"
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#7c3aed', fontSize: 10.5, fontWeight: 700 }}>Split into {d.items.length} tasks</button>
                    )}
                  </span>
                </div>
              )}

              {/* An open task already covers this job. */}
              {d.match && (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 8, background: '#fff', border: '1px dashed #d8b4fe' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--ink)', minWidth: 0, flex: '1 1 160px' }}>
                    <span style={{ color: '#7c3aed', display: 'inline-flex' }}><TaskIcon /></span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Already a task: <strong style={{ fontWeight: 700 }}>{d.match.title}</strong></span>
                  </span>
                  <button type="button" onClick={() => patch(i, { mode: 'add' })} style={chipBtn(d.mode === 'add')}>Add as checklist</button>
                  <button type="button" onClick={() => patch(i, { mode: 'create' })} style={chipBtn(d.mode === 'create')}>Create anyway</button>
                  {adding && d.match.newSteps === 0 && (
                    <span style={{ fontSize: 10.5, color: 'var(--slate)', flexBasis: '100%' }}>It already has these steps — nothing new to add.</span>
                  )}
                </div>
              )}

              {/* Compact controls — kept subtle so the panel doesn't feel busy. */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                <select value={d.priority} onChange={e => patch(i, { priority: e.target.value as any })} aria-label="Priority" style={selStyle}>
                  <option value="low">Low</option>
                  <option value="normal">Medium</option>
                  <option value="high">High</option>
                </select>
                {/* Adding to an open task keeps whoever already has it. */}
                {!adding && teamMembers.length > 0 && (
                  <select value={d.assigneeId} onChange={e => patch(i, { assigneeId: e.target.value })} aria-label="Assignee"
                    style={{ ...selStyle, color: d.assigneeId ? '#7c3aed' : 'var(--slate)' }}>
                    <option value="">＋ Assign</option>
                    {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                )}
                {!adding && outlets.length > 1 && (
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
          )
        })}
      </div>

      {error && <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#dc2626' }}>{error}</p>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: '#7c3aed', background: '#f3e8ff', padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
          Source · {source === 'call_summary' ? 'Call summary' : 'Chat summary'}
        </span>
        <span style={{ flex: 1 }} />
        {chosenCount > 1 && (
          <button type="button" onClick={() => setCombine(c => !c)} title="Merge the selected drafts into one task with a checklist"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 9, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: `1px solid ${combine ? '#7c3aed' : '#ede9fe'}`, background: combine ? '#f3e8ff' : '#fff', color: '#7c3aed' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M7 8l-4 4 4 4"/><path d="M17 8l4 4-4 4"/><path d="M3 12h6"/><path d="M15 12h6"/></svg>
            Combine
          </button>
        )}
        <button type="button" onClick={createTasks} disabled={creating || chosenCount === 0}
          style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: chosenCount ? '#7c3aed' : '#c4b5fd', color: '#fff', fontSize: 12, fontWeight: 700, cursor: creating || !chosenCount ? 'default' : 'pointer' }}>
          {actionLabel}
        </button>
      </div>
      </>}
    </div>
  )
}
