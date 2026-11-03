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
  id: string; title: string; items: Step[]; priority: 'low' | 'normal' | 'high'; include: boolean
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

const fmtWhen = (iso: string) => {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' })
  } catch { return 'reminder' }
}

let draftSeq = 0
const blankDraft = (title: string, steps: string[], locationId: string): Draft => ({
  id: `d${++draftSeq}`, title, items: steps.map(text => ({ text, include: true })), priority: 'normal', include: true,
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
  const [remindOpen, setRemindOpen] = useState<Set<string>>(new Set())
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

  // Which drafts an open task already covers — asked once the title stops
  // changing (not on every keystroke).
  const draftKey = drafts.map(d => `${d.id}:${d.title}`).join('|')
  useEffect(() => {
    if (!drafts.length || !conversationId || !companyId) return
    let cancelled = false
    const snapshot = drafts.map(d => ({ id: d.id, title: d.title, steps: d.items.map(i => i.text) }))
    const timer = setTimeout(async () => {
      try {
        const res = await authFetch('/api/tasks/ai-drafts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'match', companyId, conversationId, drafts: snapshot.map(({ title, steps }) => ({ title, steps })) }),
        })
        if (!res.ok || cancelled) return
        const { matches } = await res.json()
        if (cancelled || !Array.isArray(matches)) return
        const byId = new Map(snapshot.map((d, i) => [d.id, matches[i] || null]))
        setDrafts(prev => prev.map(d => {
          if (!byId.has(d.id)) return d
          const m = byId.get(d.id)
          if (!m) return d.match ? { ...d, match: null, mode: 'create' } : d
          return d.match?.taskId === m.taskId ? { ...d, match: m } : { ...d, match: m, mode: 'add' }
        }))
      } catch { /* no match info: they're created as new tasks */ }
    }, 600)
    return () => { cancelled = true; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, conversationId, companyId])

  const close = () => {
    try { if (typeof window !== 'undefined') window.localStorage.setItem(storageKey, 'done') } catch {}
    setClosed(true)
    onClosedChange?.(true)
  }
  const patch = (i: number, p: Partial<Draft>) => setDrafts(prev => prev.map((d, di) => di === i ? { ...d, ...p } : d))
  const patchStep = (i: number, j: number, p: Partial<Step>) => setDrafts(prev => prev.map((d, di) => di === i ? { ...d, items: d.items.map((s, sj) => sj === j ? { ...s, ...p } : s) } : d))
  const toggleRemind = (id: string) => setRemindOpen(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
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
    // Which drafts each saved task stands for (several when combined).
    let covers: string[][] = chosen.map(d => [d.id])
    // Combine into a single task: every checked draft's steps on one checklist.
    if (combine && chosen.length > 1) {
      const steps = chosen.flatMap(d => (d.items.length ? stepsOf(d) : [d.title.trim()]))
      covers = [chosen.map(d => d.id)]
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
      } catch { res = null }   // couldn't reach the server at all: the legacy insert below
      if (res) {
        // Any answer from the server is final (no direct insert behind its back,
        // e.g. after "Conversation not found"). Drafts that didn't save stay.
        const j = await res.json().catch(() => ({}))
        const results: any[] = Array.isArray(j?.results) ? j.results : []
        if (!res.ok && !results.length) throw new Error(j?.error || 'Could not save the tasks')
        const failed = results.map((r, i) => ({ r, i })).filter(({ r }) => r?.error || r?.action === 'skipped' || r?.action === 'held')
        const savedIds = new Set(covers.filter((_, i) => !failed.some(f => f.i === i)).flat())
        if (failed.length < results.length) { notifyIntegrations('task.created', { companyId }); onCreated?.() }
        if (!failed.length) { close(); return }
        setDrafts(prev => prev.filter(d => !savedIds.has(d.id)))
        setCombine(false)
        setError(`Couldn’t save ${failed.length === 1 ? `“${failed[0].r?.title || payload[failed[0].i]?.title}”` : `${failed.length} of these`}: ${failed[0].r?.error || failed[0].r?.reason || 'try again'}`)
        return
      }
      {
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
    <div className={`dt${bare ? ' bare' : ''}${folded ? ' folded' : ''}`}>
      <style href="colvy-draft-tasks" precedence="default">{DT_CSS}</style>
      <div className="dt-h">
        {collapsible ? (
          <button type="button" className="dt-title" onClick={toggle} aria-expanded={open} aria-label={open ? 'Hide draft tasks' : 'Show draft tasks'}>
            <span className="dt-ic"><SparkIcon /></span>
            Draft tasks
            <small>· {folded ? `${drafts.length} to review` : `from ${drafts.length} action item${drafts.length === 1 ? '' : 's'}`}</small>
            <Chevron open={open} />
          </button>
        ) : (
          <p className="dt-title">
            <span className="dt-ic"><SparkIcon /></span>
            Draft tasks
            <small>· from {drafts.length} action item{drafts.length === 1 ? '' : 's'}</small>
          </p>
        )}
        <button type="button" className="dt-ghost" onClick={close}>Dismiss</button>
      </div>

      {!folded && <>
      <div className="dt-list">
        {drafts.map((d, i) => {
          const adding = !!d.match && d.mode === 'add'
          const stepsOn = d.items.filter(s => s.include).length
          return (
          <div key={d.id} className={`dt-card${d.include ? '' : ' off'}`}>
            <input type="checkbox" className="dt-check" checked={d.include} onChange={() => patch(i, { include: !d.include })} aria-label="Include" />
            <div className="dt-body">
              {d.items.length ? (
                <input className="dt-name" value={d.title} onChange={e => patch(i, { title: e.target.value })} aria-label="Task title" />
              ) : (
                <span className="dt-text">{d.title}</span>
              )}

              {/* The job's steps — its checklist. */}
              {d.items.length > 0 && (
                <div className="dt-steps">
                  {d.items.map((s, j) => (
                    <label key={j} className={`dt-step${s.include ? '' : ' off'}`}>
                      <input type="checkbox" className="dt-check sm" checked={s.include} onChange={() => patchStep(i, j, { include: !s.include })} />
                      <span>{s.text}</span>
                    </label>
                  ))}
                  <span className="dt-meta">
                    {stepsOn} checklist step{stepsOn === 1 ? '' : 's'}
                    {d.items.length > 1 && (
                      <button type="button" className="dt-link" onClick={() => split(i)} title="Make each step its own task">Split into {d.items.length} tasks</button>
                    )}
                  </span>
                </div>
              )}

              {/* An open task already covers this job. */}
              {d.match && (
                <div className="dt-match">
                  <span className="dt-match-t">
                    <span className="dt-match-ic"><TaskIcon /></span>
                    <span>Already a task: <strong>{d.match.title}</strong></span>
                  </span>
                  <div className="dt-seg" role="group" aria-label="What to do with it">
                    <button type="button" className={d.mode === 'add' ? 'on' : ''} aria-pressed={d.mode === 'add'} onClick={() => patch(i, { mode: 'add' })}>Add as checklist</button>
                    <button type="button" className={d.mode === 'create' ? 'on' : ''} aria-pressed={d.mode === 'create'} onClick={() => patch(i, { mode: 'create' })}>Create anyway</button>
                  </div>
                  {adding && d.match.newSteps === 0 && (
                    <span className="dt-meta full">It already has these steps — nothing new to add.</span>
                  )}
                </div>
              )}

              {/* Compact controls — kept subtle so the panel doesn't feel busy. */}
              <div className="dt-ctrls">
                <select className="dt-sel" value={d.priority} onChange={e => patch(i, { priority: e.target.value as any })} aria-label="Priority">
                  <option value="low">Low</option>
                  <option value="normal">Medium</option>
                  <option value="high">High</option>
                </select>
                {/* Adding to an open task keeps whoever already has it. */}
                {!adding && teamMembers.length > 0 && (
                  <select className={`dt-sel${d.assigneeId ? ' set' : ''}`} value={d.assigneeId} onChange={e => patch(i, { assigneeId: e.target.value })} aria-label="Assignee">
                    <option value="">＋ Assign</option>
                    {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                )}
                {!adding && outlets.length > 1 && (
                  <select className={`dt-sel${d.locationId ? ' set' : ''}`} value={d.locationId} onChange={e => patch(i, { locationId: e.target.value })} aria-label="Outlet">
                    <option value="">＋ Outlet</option>
                    {outlets.map(o => <option key={o.id} value={o.id}>{o.label || o.suburb || 'Outlet'}</option>)}
                  </select>
                )}
                {/* Reminder — an alarm-clock button that reveals a date/time
                    picker; the chosen time becomes the task's due date (the
                    reminder cron pushes the assignee when it arrives). */}
                {d.remindAt ? (
                  <span className="dt-chip on">
                    <ClockIcon /> {fmtWhen(d.remindAt)}
                    <button type="button" className="dt-x" onClick={() => { patch(i, { remindAt: '' }); setRemindOpen(prev => { const n = new Set(prev); n.delete(d.id); return n }) }}
                      title="Clear reminder" aria-label="Clear reminder">×</button>
                  </span>
                ) : remindOpen.has(d.id) ? (
                  <input type="datetime-local" className="dt-when" autoFocus value={d.remindAt}
                    onChange={e => patch(i, { remindAt: e.target.value })}
                    onBlur={() => { if (!d.remindAt) toggleRemind(d.id) }} />
                ) : (
                  <button type="button" className="dt-chip" onClick={() => toggleRemind(d.id)} title="Set a reminder">
                    <ClockIcon /> Remind
                  </button>
                )}
              </div>
            </div>
          </div>
          )
        })}
      </div>

      {error && <p className="dt-err">{error}</p>}

      <div className="dt-foot">
        <span className="dt-src"><SparkIcon /> From the {source === 'call_summary' ? 'call summary' : 'chat summary'}</span>
        <span className="dt-grow" />
        {chosenCount > 1 && (
          <button type="button" className={`dt-btn${combine ? ' on' : ''}`} onClick={() => setCombine(c => !c)} aria-pressed={combine} title="Merge the selected drafts into one task with a checklist">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M7 8l-4 4 4 4"/><path d="M17 8l4 4-4 4"/><path d="M3 12h6"/><path d="M15 12h6"/></svg>
            Combine
          </button>
        )}
        <button type="button" className="dt-btn primary" onClick={createTasks} disabled={creating || chosenCount === 0}>
          {actionLabel}
        </button>
      </div>
      </>}
    </div>
  )
}

// Sellio: soft violet cards for the AI's drafts, round custom ticks, pill
// controls, a segmented choice for "already a task", one violet pill to save.
const TICK = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E\")"
const CHEV = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")"
const CHEV_DARK = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")"
const DT_CSS = `
.dt{--dt-v:#7c3aed;--dt-card:color-mix(in srgb,#7c3aed 5%,var(--card,#fff));--dt-ring:color-mix(in srgb,#7c3aed 14%,transparent);--dt-pill:var(--card,#fff);--dt-pill-ring:#e4e4e7;--dt-mute:#8e8e93;margin-top:18px}
.dt.bare{margin-top:0;padding-top:0}
.dt-wrap{max-width:560px;width:100%;box-sizing:border-box;margin:0 auto 4px;align-self:center;padding:14px 16px 15px;border-radius:22px;background:var(--card,#fff);box-shadow:0 0 0 1px #ececef,0 1px 2px rgba(16,24,40,.04),0 10px 24px -16px rgba(16,24,40,.18)}
[data-theme="dark"] .dt-wrap{box-shadow:0 0 0 1px #2f2f34}
.dt button::before{display:none}
.dt-h{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px}
.dt.folded .dt-h{margin-bottom:0}
.dt-title{margin:0;padding:0;border:none;background:none;display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;font:inherit;font-size:13.5px;font-weight:700;color:var(--ink);text-align:left}
button.dt-title{cursor:pointer}
.dt-title small{font-size:12px;font-weight:550;color:var(--dt-mute)}
.dt-title>svg:last-child{color:var(--dt-mute)}
.dt-ic{width:24px;height:24px;flex-shrink:0;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;background:#ede9fe;color:var(--dt-v)}
.dt-ghost{height:28px;padding:0 11px;border:none;border-radius:999px;background:none;color:#71717a;font:inherit;font-size:12.5px;font-weight:650;cursor:pointer}
.dt-ghost:hover{background:#f4f4f5;color:var(--ink)}
.dt-list{display:flex;flex-direction:column;gap:8px}
.dt-card{display:flex;align-items:flex-start;gap:11px;padding:12px 14px;border-radius:18px;background:var(--dt-card);box-shadow:inset 0 0 0 1px var(--dt-ring)}
.dt-card.off .dt-body{opacity:.5}
.dt-check{appearance:none;-webkit-appearance:none;flex-shrink:0;width:20px;height:20px;margin:1px 0 0;border-radius:7px;border:1.5px solid #d4d4d8;background:var(--card,#fff) center/14px no-repeat;cursor:pointer;transition:background-color .15s ease,border-color .15s ease}
.dt-check:checked{background-color:var(--dt-v);border-color:var(--dt-v);background-image:${TICK}}
.dt-check.sm{width:16px;height:16px;border-radius:5px;background-size:11px;margin-top:1px}
.dt-check:focus-visible{outline:2px solid color-mix(in srgb,var(--dt-v) 50%,transparent);outline-offset:2px}
.dt-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:9px}
.dt-text{font-size:13.5px;line-height:1.5;color:var(--ink)}
.dt-name{width:100%;padding:0;border:none;background:transparent;outline:none;font:inherit;font-size:13.5px;font-weight:700;line-height:1.45;color:var(--ink)}
.dt-steps{display:flex;flex-direction:column;gap:5px}
.dt-step{display:flex;align-items:flex-start;gap:8px;font-size:13px;line-height:1.45;color:var(--ink);cursor:pointer}
.dt-step.off span{opacity:.5;text-decoration:line-through}
.dt-meta{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dt-mute)}
.dt-meta.full{flex-basis:100%}
.dt-link{padding:0;border:none;background:none;color:var(--dt-v);font:inherit;font-size:12px;font-weight:650;cursor:pointer}
.dt-match{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 8px 8px 12px;border-radius:14px;background:var(--card,#fff);box-shadow:inset 0 0 0 1px var(--dt-ring)}
.dt-match-t{flex:1 1 170px;min-width:0;display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--ink)}
.dt-match-t>span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dt-match-t strong{font-weight:700}
.dt-match-ic{display:inline-flex;color:var(--dt-v)}
.dt-seg{display:inline-flex;padding:3px;border-radius:999px;background:#f4f4f5}
.dt-seg button{height:28px;padding:0 11px;border:none;border-radius:999px;background:none;color:#71717a;font:inherit;font-size:12px;font-weight:650;cursor:pointer;white-space:nowrap}
.dt-seg button.on{background:var(--card,#fff);color:#6d28d9;box-shadow:0 1px 2px rgba(0,0,0,.1)}
.dt-ctrls{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.dt .dt-sel{height:30px;max-width:230px;text-overflow:ellipsis;padding:0 28px 0 12px;border:none;border-radius:999px;background:var(--dt-pill) ${CHEV} right 10px center/12px no-repeat;box-shadow:inset 0 0 0 1px var(--dt-pill-ring);color:#52525b;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;appearance:none;-webkit-appearance:none;outline:none}
.dt .dt-sel.set{color:#6d28d9;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--dt-v) 40%,transparent)}
.dt .dt-sel:focus-visible{box-shadow:inset 0 0 0 1.5px var(--dt-v)}
.dt-chip{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 12px;border:none;border-radius:999px;background:var(--dt-pill);box-shadow:inset 0 0 0 1px var(--dt-pill-ring);color:#6d28d9;font:inherit;font-size:12.5px;font-weight:650;cursor:pointer}
.dt-chip.on{background:#ede9fe;box-shadow:none;cursor:default;padding-right:6px}
.dt-x{width:20px;height:20px;margin-left:2px;padding:0;border:none;border-radius:50%;background:none;color:#6d28d9;font-size:15px;font-weight:700;line-height:1;cursor:pointer}
.dt-x:hover{background:rgba(124,58,237,.14)}
.dt .dt-when{height:30px;padding:0 10px;border:none;border-radius:999px;background:var(--dt-pill);box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--dt-v) 45%,transparent);color:var(--ink);font:inherit;font-size:12.5px;font-weight:600}
.dt-err{margin:8px 2px 0;font-size:12px;color:#dc2626}
.dt-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}
.dt-src{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:var(--dt-mute)}
.dt-src svg{width:12px;height:12px;color:var(--dt-v)}
.dt-grow{flex:1}
.dt-btn{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 15px;border:none;border-radius:999px;background:#f4f4f5;color:var(--ink);font:inherit;font-size:13px;font-weight:650;cursor:pointer;transition:background .15s ease,transform .12s ease,box-shadow .15s ease}
.dt-btn.on{background:#ede9fe;color:#6d28d9}
.dt-btn.primary{padding:0 18px;background:var(--dt-v);color:#fff;box-shadow:0 6px 14px -8px rgba(124,58,237,.7)}
.dt-btn.primary:hover{background:#6d28d9}
.dt-btn.primary:active{transform:scale(.97)}
.dt-btn:disabled{background:#c4b5fd;box-shadow:none;cursor:default}
.dt-btn:focus-visible,.dt-chip:focus-visible,.dt-seg button:focus-visible,.dt-ghost:focus-visible,.dt-title:focus-visible{outline:2px solid color-mix(in srgb,var(--dt-v) 50%,transparent);outline-offset:2px}
[data-theme="dark"] .dt{--dt-v:#a78bfa;--dt-solid:#7c3aed;--dt-card:color-mix(in srgb,#8b5cf6 10%,var(--card,#1c1c1f));--dt-ring:rgba(139,92,246,.22);--dt-pill:#2a2a2e;--dt-pill-ring:#3a3a3f}
[data-theme="dark"] .dt-ic,[data-theme="dark"] .dt-chip.on,[data-theme="dark"] .dt-btn.on{background:rgba(139,92,246,.2);color:#c4b5fd}
[data-theme="dark"] .dt-chip,[data-theme="dark"] .dt-x,[data-theme="dark"] .dt .dt-sel.set,[data-theme="dark"] .dt-seg button.on{color:#c4b5fd}
[data-theme="dark"] .dt .dt-sel{color:#d4d4d8}
[data-theme="dark"] .dt-check{border-color:#52525b;background-color:#2a2a2e}
[data-theme="dark"] .dt-check:checked{background-color:var(--dt-v);border-color:var(--dt-v)}
[data-theme="dark"] .dt-seg,[data-theme="dark"] .dt-btn:not(.primary):not(.on),[data-theme="dark"] .dt-ghost:hover{background:#2a2a2e}
[data-theme="dark"] .dt-seg button.on{background:#3a3a3f}
[data-theme="dark"] .dt-match{background:#1f1f23}
/* The global dark rule paints every input and select with !important (it would
   wipe the ticks and chevrons), and the dark-theme pass maps .dt-btn's grey to
   a dark fill that also caught the violet button. */
[data-theme="dark"] .dt .dt-btn.primary{background:var(--dt-solid);color:#fff}
[data-theme="dark"] .dt .dt-btn.primary:hover{background:#6d28d9}
[data-theme="dark"] .dt .dt-btn.primary:disabled{background:#4c3a7a;color:#c4b5fd}
[data-theme="dark"] .dt .dt-check{background:#2a2a2e center/14px no-repeat !important;border-color:#52525b !important}
[data-theme="dark"] .dt .dt-check:checked{background:var(--dt-solid) ${TICK} center/14px no-repeat !important;border-color:var(--dt-solid) !important}
[data-theme="dark"] .dt .dt-check.sm{background-size:11px !important}
[data-theme="dark"] .dt .dt-name{background:transparent !important;border:none !important}
[data-theme="dark"] .dt .dt-sel{background:#2a2a2e ${CHEV_DARK} right 10px center/12px no-repeat !important;border:none !important}
[data-theme="dark"] .dt .dt-when{background:#2a2a2e !important;border:none !important}
`
