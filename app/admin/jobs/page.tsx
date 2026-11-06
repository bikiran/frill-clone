'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AdminPage } from '@/components/ui/AdminKit'
import NewJobDialog from '@/components/jobs/NewJobDialog'
import { confirmDialog } from '@/components/ConfirmDialog'
import EmptyScroll from '@/components/EmptyScroll'
import {
  api, useJobsCompany, StatusTag, QuoteTag, fmtWhen, fmtTime, fmtAgo, dayKeyIn, useToast, Toast, SetupNote, Icon, JB_CSS, AvatarStack,
  cacheKeys, readJobsCache, writeJobsCache, prefetchJob,
} from '@/components/jobs/shared'
import { JOB_STATUSES, JOB_STATUS_LABEL, canMoveJob, nextStatuses, fmtJobNumber, isOpenJob, type JobStatus } from '@/lib/jobs/status'
import { fmtMoney } from '@/lib/jobs/quote-math'

// Jobs & quotes (docs/plans/jobs.md): every job, as a board you can drag
// between stages (mouse or touch, or the "Move to" menu from the keyboard),
// a list, or a month calendar in the business's time zone.

type View = 'board' | 'list' | 'calendar'
type Filter = 'open' | JobStatus | 'all'
const BOARD: JobStatus[] = ['new', 'quoting', 'awaiting_approval', 'scheduled', 'in_progress', 'completed']

export default function JobsPage() {
  const router = useRouter()
  const { companyId, ready } = useJobsCompany()
  const [view, setView] = useState<View>('board')
  const [filter, setFilter] = useState<Filter>('open')
  const [q, setQ] = useState('')
  // Last-seen board, painted straight away; the server's copy replaces it.
  const seed = useRef<any>(companyId ? readJobsCache(cacheKeys.list(companyId)) : undefined)
  const [jobs, setJobs] = useState<any[]>(() => seed.current?.jobs || [])
  const [tz, setTz] = useState(() => seed.current?.timezone || 'Australia/Melbourne')
  const [prefix, setPrefix] = useState(() => seed.current?.settings?.job_prefix || 'J')
  const [qPrefix, setQPrefix] = useState(() => seed.current?.settings?.quote_prefix || 'Q')
  const [loading, setLoading] = useState(() => !seed.current)
  // Who's asking: their id (for "Mine"), whether they manage Jobs, and whether
  // the business limits field staff to their own jobs (the server filters then).
  const [meta, setMeta] = useState<{ me: string; canManage: boolean | null; restricted: boolean }>(() => ({ me: seed.current?.me || '', canManage: seed.current?.canManage ?? null, restricted: !!seed.current?.restricted }))
  const [who, setWho] = useState<'all' | 'mine'>('all')
  const [setup, setSetup] = useState('')
  const [err, setErr] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [toast, setToast] = useToast()

  useEffect(() => {
    try {
      const v = new URLSearchParams(window.location.search).get('view') || localStorage.getItem('colvy-jobs-view')
      if (v === 'board' || v === 'list' || v === 'calendar') setView(v)
      if (localStorage.getItem('colvy-jobs-who') === 'mine') setWho('mine')
      if (new URLSearchParams(window.location.search).get('new') === '1') setShowNew(true)
    } catch {}
  }, [])
  const switchView = (v: View) => {
    setView(v)
    try { localStorage.setItem('colvy-jobs-view', v); const u = new URL(window.location.href); u.searchParams.set('view', v); window.history.replaceState(null, '', u.toString()) } catch {}
  }

  // Only the newest request may paint, so a slow answer for "ab" can't land
  // on top of the answer for "abc".
  const seq = useRef(0)
  const lastSearch = useRef('')
  const load = useCallback(async (cid: string, search: string) => {
    const mine = ++seq.current
    lastSearch.current = search
    try {
      const d = await api(`/api/jobs?companyId=${cid}${search ? `&q=${encodeURIComponent(search)}` : ''}`)
      if (mine !== seq.current) return
      setJobs(d.jobs || []); setTz(d.timezone || 'Australia/Melbourne')
      setPrefix(d.settings?.job_prefix || 'J'); setQPrefix(d.settings?.quote_prefix || 'Q')
      setMeta({ me: d.me || '', canManage: !!d.canManage, restricted: !!d.restricted })
      setSetup(''); setErr('')
      if (!search) writeJobsCache(cacheKeys.list(cid), { jobs: d.jobs || [], timezone: d.timezone, settings: { job_prefix: d.settings?.job_prefix, quote_prefix: d.settings?.quote_prefix }, me: d.me, canManage: !!d.canManage, restricted: !!d.restricted })
    } catch (e: any) {
      if (mine !== seq.current) return
      if (/COLVY_V427/.test(e.message)) setSetup(e.message); else setErr(e.message)
    } finally { if (mine === seq.current) setLoading(false) }
  }, [])
  useEffect(() => {
    if (!ready) return
    if (!companyId) { setLoading(false); return }
    if (!seed.current) {
      const c = readJobsCache<any>(cacheKeys.list(companyId))
      if (c) { seed.current = c; setJobs(c.jobs || []); setTz(c.timezone || 'Australia/Melbourne'); setPrefix(c.settings?.job_prefix || 'J'); setQPrefix(c.settings?.quote_prefix || 'Q'); setLoading(false) }
    }
    load(companyId, '')
  }, [ready, companyId, load])
  useEffect(() => {
    if (!companyId || q.trim() === lastSearch.current) return
    const t = setTimeout(() => load(companyId, q.trim()), q.trim() ? 220 : 0)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps
  // Keep the cached board in step with moves made here.
  useEffect(() => {
    if (!companyId || loading || q.trim() || setup) return
    const c = readJobsCache<any>(cacheKeys.list(companyId))
    if (c && c.jobs !== jobs) writeJobsCache(cacheKeys.list(companyId), { ...c, jobs })
  }, [jobs]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Moving a job (board drag or the Move to menu) ──
  const move = useCallback(async (job: any, to: JobStatus) => {
    if (job.status === to) return
    if (!canMoveJob(job.status, to)) { setToast(`A job can’t go from ${JOB_STATUS_LABEL[job.status as JobStatus]} to ${JOB_STATUS_LABEL[to]}.`); return }
    const cancelReason = ''
    if (to === 'cancelled' && !(await confirmDialog({ title: `Cancel ${fmtJobNumber(job.number, prefix)}?`, message: 'You can reopen it later. Add a reason on the job page if you like.', confirmLabel: 'Cancel job', cancelLabel: 'Keep it', tone: 'danger' }))) return
    const before = job.status
    setJobs(list => list.map(j => (j.id === job.id ? { ...j, status: to, updated_at: new Date().toISOString() } : j)))
    try {
      const d = await api(`/api/jobs/${job.id}`, { method: 'PATCH', json: { companyId, status: to, expectedStatus: before, cancelReason } })
      setJobs(list => list.map(j => (j.id === job.id ? { ...j, ...d.job } : j)))
      setToast(`${fmtJobNumber(job.number, prefix)} moved to ${JOB_STATUS_LABEL[to]}`)
    } catch (e: any) {
      setJobs(list => list.map(j => (j.id === job.id ? { ...j, status: before } : j)))
      setToast(e.message)
      load(companyId, q.trim())
    }
  }, [companyId, prefix, q, load, setToast])

  const mineOnly = who === 'mine' && !meta.restricted && !!meta.me
  const visible = useMemo(() => (mineOnly ? jobs.filter(j => (j.assignees || []).some((a: any) => a.id === meta.me)) : jobs), [jobs, mineOnly, meta.me])
  const switchWho = (w: 'all' | 'mine') => { setWho(w); try { localStorage.setItem('colvy-jobs-who', w) } catch {} }
  const shown = useMemo(() => {
    if (filter === 'all') return visible
    if (filter === 'open') return visible.filter(j => isOpenJob(j.status))
    return visible.filter(j => j.status === filter)
  }, [visible, filter])
  const counts = useMemo(() => {
    const c: Record<string, number> = { open: 0, all: visible.length }
    for (const j of visible) { c[j.status] = (c[j.status] || 0) + 1; if (isOpenJob(j.status)) c.open++ }
    return c
  }, [visible])

  const open = (j: any) => {
    // Hand the job page what we already know so it can paint at once.
    if (companyId && !readJobsCache(cacheKeys.job(companyId, j.id))) writeJobsCache(cacheKeys.job(companyId, j.id), { job: j, partial: true })
    router.push(`/admin/jobs/${j.id}`)
  }
  const warm = useCallback((j: any) => {
    if (!companyId) return
    router.prefetch(`/admin/jobs/${j.id}`)
    prefetchJob(companyId, j.id)
  }, [companyId, router])

  return (
    <AdminPage title="Jobs" width="xl"
      sub={meta.restricted ? 'The jobs you’re on.' : 'Quotes and jobs, from the first enquiry to done.'}
      actions={<>
        {meta.canManage !== false && <Link href="/admin/jobs/settings" className="ak-btn" title="Quote settings, price list, templates and checklists">{Icon.gear}<span className="jb-hide-sm">Settings</span></Link>}
        <button type="button" className="ak-btn go" onClick={() => setShowNew(true)} disabled={!companyId || !!setup}>{Icon.plus}New job</button>
      </>}>
      <style>{JB_CSS + PAGE_CSS}</style>
      {setup && <SetupNote text={setup} />}
      {err && <div className="ak-note bad">{err}</div>}

      <div className="jb-bar">
        <div className="ak-seg" role="tablist" aria-label="View">
          {(['board', 'list', 'calendar'] as View[]).map(v => (
            <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => switchView(v)}>{v === 'board' ? 'Board' : v === 'list' ? 'List' : 'Calendar'}</button>
          ))}
        </div>
        {!meta.restricted && meta.me && (
          <div className="ak-seg" role="tablist" aria-label="Whose jobs">
            <button type="button" role="tab" aria-selected={who === 'all'} className={who === 'all' ? 'on' : ''} onClick={() => switchWho('all')}>Everyone</button>
            <button type="button" role="tab" aria-selected={who === 'mine'} className={who === 'mine' ? 'on' : ''} onClick={() => switchWho('mine')}>Mine</button>
          </div>
        )}
        <label className="jb-search">
          {Icon.search}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Search jobs or ${prefix}-number`} aria-label="Search jobs" />
        </label>
      </div>

      {view === 'list' && (
        <div className="jb-chips" role="group" aria-label="Filter by status">
          {(['open', ...JOB_STATUSES, 'all'] as Filter[]).map(f => (
            <button key={f} type="button" className={`ak-chip${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>
              {f === 'open' ? 'Open' : f === 'all' ? 'All' : JOB_STATUS_LABEL[f as JobStatus]} <span>{counts[f] || 0}</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="jb-skel">{Array.from({ length: 4 }).map((_, i) => <div key={i} />)}</div>
      ) : err && jobs.length === 0 ? null : !setup && jobs.length === 0 && !q.trim() ? (
        <div className="ak-panel jb-empty">
          <EmptyScroll title={meta.restricted ? 'Nothing on your plate' : 'No jobs yet'} kinds={['job', 'quote', 'calendar']}
            line={meta.restricted ? 'Jobs show here when someone puts you on them.' : 'Create one here, or turn an enquiry into a job from the Inbox, a booking or a form response.'}
            action={<button type="button" className="ak-btn go" onClick={() => setShowNew(true)}>{Icon.plus}New job</button>} />
        </div>
      ) : !setup && jobs.length === 0 ? (
        <div className="ak-panel jb-empty">
          <EmptyScroll title="Nothing found" kinds={['job', 'contact', 'quote']}
            line={<>No jobs match “{q.trim()}”. Try a customer’s name, a title or a {prefix}-number.</>}
            action={<button type="button" className="ak-btn" onClick={() => setQ('')}>Clear search</button>} />
        </div>
      ) : mineOnly && visible.length === 0 ? (
        <div className="ak-panel jb-empty">
          <EmptyScroll title="Nothing on your plate" kinds={['job', 'calendar', 'contact']}
            line="You’re not on any of these jobs. Jobs show here when someone puts you on them."
            action={<button type="button" className="ak-btn" onClick={() => switchWho('all')}>Show everyone’s</button>} />
        </div>
      ) : view === 'board' ? (
        <Board jobs={visible} tz={tz} prefix={prefix} qPrefix={qPrefix} onMove={move} onOpen={open} onWarm={warm} />
      ) : view === 'list' ? (
        <ListView jobs={shown} tz={tz} prefix={prefix} qPrefix={qPrefix} onOpen={open} onWarm={warm} onShowAll={filter !== 'open' ? () => setFilter('open') : undefined} />
      ) : (
        <CalendarView jobs={visible} tz={tz} prefix={prefix} onOpen={open} onWarm={warm} />
      )}

      {showNew && companyId && (
        <NewJobDialog companyId={companyId} onClose={() => setShowNew(false)} onCreated={job => { setShowNew(false); router.push(`/admin/jobs/${job.id}`) }} />
      )}
      <Toast text={toast} />
    </AdminPage>
  )
}

// ── Board ────────────────────────────────────────────────────────────────────

function Board({ jobs, tz, prefix, qPrefix, onMove, onOpen, onWarm }: { jobs: any[]; tz: string; prefix: string; qPrefix: string; onMove: (j: any, to: JobStatus) => void; onOpen: (j: any) => void; onWarm: (j: any) => void }) {
  const [over, setOver] = useState<JobStatus | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const drag = useRef<any>(null)

  const byCol = useMemo(() => {
    const m: Record<string, any[]> = {}
    for (const s of BOARD) m[s] = []
    for (const j of jobs) if (m[j.status]) m[j.status].push(j)
    // Completed: the most recent 30.
    m.completed = m.completed.slice(0, 30)
    for (const s of BOARD) m[s].sort((a, b) => (s === 'scheduled' || s === 'in_progress')
      ? (Date.parse(a.scheduled_start || '9999') - Date.parse(b.scheduled_start || '9999'))
      : (Date.parse(b.updated_at) - Date.parse(a.updated_at)))
    return m
  }, [jobs])

  const handlers = useRef({ onMove, onOpen })
  handlers.current = { onMove, onOpen }

  // The window listeners for one drag live on drag.current, so they're the
  // exact functions removed when it ends (whatever re-renders happen meanwhile).
  const cleanup = () => {
    const d = drag.current
    if (!d) return
    if (d.ghost) d.ghost.remove()
    if (d.timer) clearTimeout(d.timer)
    window.removeEventListener('pointermove', d.h.move)
    window.removeEventListener('pointerup', d.h.up)
    window.removeEventListener('pointercancel', d.h.cancel)
    window.removeEventListener('touchmove', d.h.block)
    document.documentElement.classList.remove('jb-dragging')
    drag.current = null
    setDragId(null); setOver(null)
  }
  const colAt = (x: number, y: number): JobStatus | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-col]') as HTMLElement | null
    return (el?.dataset.col as JobStatus) || null
  }
  const begin = (x: number, y: number) => {
    const d = drag.current
    if (!d || d.active) return
    d.active = true
    const r = d.el.getBoundingClientRect()
    const g = d.el.cloneNode(true) as HTMLElement
    g.classList.add('jb-ghost')
    Object.assign(g.style, { width: `${r.width}px`, left: `${r.left}px`, top: `${r.top}px` })
    document.body.appendChild(g)
    d.ghost = g; d.dx = x - r.left; d.dy = y - r.top; d.left = r.left; d.top = r.top
    try { window.getSelection()?.removeAllRanges() } catch {}
    document.documentElement.classList.add('jb-dragging')
    setDragId(d.job.id)
    window.addEventListener('touchmove', d.h.block, { passive: false })
    try { navigator.vibrate?.(8) } catch {}
  }

  const down = (e: React.PointerEvent, job: any) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button, a, [data-nodrag]')) return
    cleanup()
    const el = e.currentTarget as HTMLElement
    const touch = e.pointerType === 'touch'
    // A mouse drag mustn't start selecting the page's text.
    if (!touch) e.preventDefault()
    const d: any = { job, el, x0: e.clientX, y0: e.clientY, touch, active: false }
    d.h = {
      block: (ev: TouchEvent) => { if (drag.current?.active) ev.preventDefault() },
      move: (ev: PointerEvent) => {
        const c = drag.current
        if (!c) return
        const dist = Math.hypot(ev.clientX - c.x0, ev.clientY - c.y0)
        if (!c.active) {
          if (c.touch) { if (dist > 8) cleanup(); return }   // a swipe: let it scroll
          if (dist > 6) begin(ev.clientX, ev.clientY); else return
        }
        c.ghost.style.transform = `translate3d(${ev.clientX - c.dx - c.left}px, ${ev.clientY - c.dy - c.top}px, 0) rotate(1.5deg)`
        setOver(colAt(ev.clientX, ev.clientY))
      },
      up: (ev: PointerEvent) => {
        const c = drag.current
        if (!c) return
        const was = c.active, j = c.job
        const to = was ? colAt(ev.clientX, ev.clientY) : null
        cleanup()
        if (!was) handlers.current.onOpen(j)
        else if (to && to !== j.status) handlers.current.onMove(j, to)
      },
      cancel: () => cleanup(),
    }
    drag.current = d
    // On touch, hold to pick a card up (so swiping still scrolls the board).
    if (touch) d.timer = setTimeout(() => begin(d.x0, d.y0), 320)
    window.addEventListener('pointermove', d.h.move)
    window.addEventListener('pointerup', d.h.up)
    window.addEventListener('pointercancel', d.h.cancel)
  }
  useEffect(() => () => cleanup(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const dragging = dragId ? jobs.find(j => j.id === dragId) : null
  return (
    <div className="jb-board" role="list" aria-label="Jobs board">
      {BOARD.map(s => {
        const list = byCol[s]
        const allowed = dragging ? (dragging.status === s || canMoveJob(dragging.status, s)) : true
        return (
          <section key={s} data-col={s} role="listitem" aria-label={JOB_STATUS_LABEL[s]}
            className={`jb-col${over === s && dragging && dragging.status !== s ? (allowed ? ' over' : ' nope') : ''}${dragging && !allowed ? ' dim' : ''}`}>
            <header><StatusTag status={s} /><span className="jb-count">{list.length}</span></header>
            <div className="jb-col-b">
              {list.map(j => (
                <article key={j.id} className={`jb-card${dragId === j.id ? ' lifted' : ''}`} onPointerDown={e => { onWarm(j); down(e, j) }} onPointerEnter={() => onWarm(j)} onFocus={() => onWarm(j)}
                  tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') onOpen(j) }} aria-label={`${fmtJobNumber(j.number, prefix)} ${j.title}`}>
                  <div className="jb-card-t">
                    <span className="jb-no">{fmtJobNumber(j.number, prefix)}</span>
                    <span className="jb-card-r"><AvatarStack people={j.assignees || []} size={22} /><MoveMenu job={j} onMove={onMove} /></span>
                  </div>
                  <b className="jb-title">{j.title}</b>
                  <div className="jb-meta">
                    {j.contact && <span>{Icon.user}{j.contact.name || j.contact.phone || j.contact.email}</span>}
                    {j.scheduled_start && <span>{Icon.clock}{fmtWhen(j.scheduled_start, null, tz)}</span>}
                    {j.address && <span className="jb-ell">{Icon.pin}{j.address}</span>}
                  </div>
                  {(j.quote || j.value_cents != null) && (
                    <div className="jb-card-f">
                      {j.quote ? <><span className="jb-muted">{qPrefix}-{j.quote.number}</span><QuoteTag status={j.quote.status} /></> : <span />}
                      <b className="jb-num">{fmtMoney(j.value_cents ?? j.quote?.total_cents)}</b>
                    </div>
                  )}
                </article>
              ))}
              {!list.length && <div className="jb-col-empty">{dragging && allowed ? 'Drop here' : 'Nothing here'}</div>}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/** "Move to…" for the keyboard (and anyone who'd rather not drag). */
function MoveMenu({ job, onMove }: { job: any; onMove: (j: any, to: JobStatus) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc) }
  }, [open])
  const opts = nextStatuses(job.status)
  return (
    <div ref={ref} style={{ position: 'relative' }} data-nodrag>
      <button type="button" className="ak-icon-btn jb-mini" aria-haspopup="menu" aria-expanded={open} aria-label="Move to" onClick={e => { e.stopPropagation(); setOpen(o => !o) }}>{Icon.dots}</button>
      {open && (
        <div className="jb-menu" role="menu" style={{ right: 0, top: 30 }}>
          <div className="jb-menu-l">Move to</div>
          {opts.map(s => (
            <button key={s} type="button" role="menuitem" className={s === 'cancelled' ? 'danger' : ''} onClick={e => { e.stopPropagation(); setOpen(false); onMove(job, s) }}>
              {JOB_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── List ─────────────────────────────────────────────────────────────────────

function ListView({ jobs, tz, prefix, qPrefix, onOpen, onWarm, onShowAll }: { jobs: any[]; tz: string; prefix: string; qPrefix: string; onOpen: (j: any) => void; onWarm: (j: any) => void; onShowAll?: () => void }) {
  if (!jobs.length) return (
    <div className="ak-panel jb-empty">
      <EmptyScroll title="Nothing here" kinds={['job', 'quote', 'calendar']} line="No jobs with this status. Try another filter." action={onShowAll ? <button type="button" className="ak-btn" onClick={onShowAll}>Show open jobs</button> : undefined} />
    </div>
  )
  return (
    <div className="ak-panel flush">
      <div className="jb-list">
        {jobs.map(j => (
          <button key={j.id} type="button" className="jb-li" onClick={() => onOpen(j)} onPointerEnter={() => onWarm(j)} onPointerDown={() => onWarm(j)} onFocus={() => onWarm(j)}>
            <div className="jb-li-main">
              <div className="jb-li-top"><span className="jb-no">{fmtJobNumber(j.number, prefix)}</span><StatusTag status={j.status} /></div>
              <b className="jb-title">{j.title}</b>
              <div className="jb-meta">
                {j.contact && <span>{Icon.user}{j.contact.name || j.contact.phone || j.contact.email}</span>}
                {j.scheduled_start && <span>{Icon.clock}{fmtWhen(j.scheduled_start, j.scheduled_end, tz)}</span>}
                {j.address && <span className="jb-ell">{Icon.pin}{j.address}</span>}
              </div>
            </div>
            <div className="jb-li-side">
              <AvatarStack people={j.assignees || []} size={22} />
              {j.quote && <span className="jb-q">{qPrefix}-{j.quote.number} <QuoteTag status={j.quote.status} /></span>}
              {(j.value_cents != null || j.quote) && <b className="jb-num">{fmtMoney(j.value_cents ?? j.quote?.total_cents)}</b>}
              <span className="jb-muted" style={{ fontSize: 12 }}>Updated {fmtAgo(j.updated_at)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Calendar (month, business time) ─────────────────────────────────────────

function CalendarView({ jobs, tz, prefix, onOpen, onWarm }: { jobs: any[]; tz: string; prefix: string; onOpen: (j: any) => void; onWarm: (j: any) => void }) {
  const today = dayKeyIn(new Date(), tz)
  const [ym, setYm] = useState(() => ({ y: +today.slice(0, 4), m: +today.slice(5, 7) - 1 }))
  const first = new Date(ym.y, ym.m, 1)
  const lead = (first.getDay() + 6) % 7   // weeks start Monday
  const days = new Date(ym.y, ym.m + 1, 0).getDate()
  const cells = Math.ceil((lead + days) / 7) * 7
  const pad = (n: number) => String(n).padStart(2, '0')
  const byDay = useMemo(() => {
    const m: Record<string, any[]> = {}
    for (const j of jobs) {
      if (!j.scheduled_start || j.status === 'cancelled') continue
      const k = dayKeyIn(j.scheduled_start, tz)
      ;(m[k] = m[k] || []).push(j)
    }
    for (const k in m) m[k].sort((a, b) => Date.parse(a.scheduled_start) - Date.parse(b.scheduled_start))
    return m
  }, [jobs, tz])
  const unscheduled = jobs.filter(j => !j.scheduled_start && isOpenJob(j.status)).length
  const step = (d: number) => setYm(({ y, m }) => { const t = new Date(y, m + d, 1); return { y: t.getFullYear(), m: t.getMonth() } })
  const label = first.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
  return (
    <div className="ak-panel">
      <div className="jb-cal-h">
        <h2>{label}</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="ak-btn sm" onClick={() => step(-1)} aria-label="Previous month">‹</button>
          <button type="button" className="ak-btn sm" onClick={() => setYm({ y: +today.slice(0, 4), m: +today.slice(5, 7) - 1 })}>Today</button>
          <button type="button" className="ak-btn sm" onClick={() => step(1)} aria-label="Next month">›</button>
        </div>
      </div>
      {unscheduled > 0 && <p className="ak-hint" style={{ margin: '0 0 10px' }}>{unscheduled} open job{unscheduled === 1 ? '' : 's'} not scheduled yet (see Board or List).</p>}
      <div className="jb-cal">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} className="jb-cal-dow">{d}</div>)}
        {Array.from({ length: cells }).map((_, i) => {
          const d = i - lead + 1
          if (d < 1 || d > days) return <div key={i} className="jb-cal-c out" />
          const k = `${ym.y}-${pad(ym.m + 1)}-${pad(d)}`
          const list = byDay[k] || []
          return (
            <div key={i} className={`jb-cal-c${k === today ? ' today' : ''}`}>
              <span className="jb-cal-d">{d}</span>
              {list.slice(0, 3).map(j => (
                <button key={j.id} type="button" className={`jb-cal-j s-${j.status}`} onClick={() => onOpen(j)} onPointerEnter={() => onWarm(j)} onPointerDown={() => onWarm(j)} title={`${fmtJobNumber(j.number, prefix)} ${j.title} · ${fmtWhen(j.scheduled_start, j.scheduled_end, tz)}`}>
                  <span className="jb-num">{fmtTime(j.scheduled_start, tz)}</span> {j.title}
                </button>
              ))}
              {list.length > 3 && <span className="jb-cal-more">+{list.length - 3} more</span>}
            </div>
          )
        })}
      </div>
      <p className="ak-hint">Times are in the business’s time zone ({tz.replace(/_/g, ' ')}).</p>
    </div>
  )
}

const PAGE_CSS = `
.jb-empty{padding:28px 20px 34px}
.jb-empty .es-title{font-size:16px}
.jb-empty .es-line{max-width:380px;font-size:13.5px}
.jb-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.jb-card-r{display:inline-flex;align-items:center;gap:4px}
.jb-search{display:flex;align-items:center;gap:8px;flex:1;max-width:340px;min-width:200px;height:40px;padding:0 14px;border-radius:999px;background:var(--f);color:var(--mut)}
.jb-search input{flex:1;min-width:0;border:none;background:none;outline:none;font:inherit;font-size:14px;color:var(--ink)}
.jb-chips{display:flex;gap:6px;overflow-x:auto;margin:0 0 14px;padding-bottom:2px;scrollbar-width:none}
.jb-chips::-webkit-scrollbar{display:none}
@media(max-width:600px){.jb-board{grid-auto-columns:84%}.jb-hide-sm{display:none}.jb-search{max-width:none;flex-basis:100%}}
.jb-skel{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.jb-skel div{height:150px;border-radius:20px;background:linear-gradient(90deg,var(--f) 25%,var(--f2) 50%,var(--f) 75%);background-size:200% 100%;animation:jbSk 1.2s linear infinite}
@keyframes jbSk{to{background-position:-200% 0}}
.jb-board{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(200px,1fr);gap:12px;overflow-x:auto;padding:2px 2px 16px;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch}
.jb-col{display:flex;flex-direction:column;min-width:0;border-radius:22px;background:var(--f);padding:10px;scroll-snap-align:start;transition:box-shadow .15s,background .15s,opacity .15s}
.jb-col.over{box-shadow:inset 0 0 0 2px var(--coral);background:color-mix(in srgb,var(--coral) 7%,var(--f))}
.jb-col.nope{box-shadow:inset 0 0 0 2px #fca5a5}
.jb-col.dim{opacity:.55}
.jb-dragging,.jb-dragging *{user-select:none!important;-webkit-user-select:none!important;cursor:grabbing!important}
.jb-col header{user-select:none;-webkit-user-select:none;display:flex;align-items:center;justify-content:space-between;padding:4px 6px 10px}
.jb-count{font-size:12.5px;font-weight:650;color:var(--mut)}
.jb-col-b{display:flex;flex-direction:column;gap:8px;min-height:80px}
.jb-col-empty{display:flex;align-items:center;justify-content:center;min-height:72px;border-radius:16px;box-shadow:inset 0 0 0 1.5px var(--f2);font-size:13px;color:var(--soft)}
.jb-card{-webkit-touch-callout:none;display:flex;flex-direction:column;gap:6px;padding:12px 12px 11px;border-radius:16px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.05),0 1px 2px rgba(16,24,40,.05);cursor:grab;user-select:none;-webkit-user-select:none;transition:box-shadow .15s,transform .15s,opacity .15s}
.jb-card:hover{box-shadow:0 0 0 1px rgba(0,0,0,.08),0 6px 16px rgba(16,24,40,.08)}
.jb-card.lifted{opacity:.35}
.jb-ghost{position:fixed;z-index:1200;pointer-events:none;box-shadow:0 18px 40px rgba(0,0,0,.22)!important;cursor:grabbing}
.jb-card-t{display:flex;align-items:center;justify-content:space-between;gap:6px;margin:-2px -4px -2px 0}
.jb-no{font-size:12px;font-weight:700;color:var(--mut);font-variant-numeric:tabular-nums}
.jb-mini{width:28px;height:28px}
.jb-title{font-size:14.5px;font-weight:650;line-height:1.35;color:var(--ink);overflow-wrap:anywhere}
.jb-ell{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block!important}
.jb-card-f{display:flex;flex-wrap:wrap;row-gap:4px;align-items:center;gap:6px;justify-content:space-between;margin-top:2px;padding-top:8px;box-shadow:0 -1px 0 var(--line);font-size:12.5px}
.jb-card-f>span{display:inline-flex;align-items:center;gap:6px}
.jb-card-f>b{margin-left:auto}
.jb-list{display:flex;flex-direction:column}
.jb-li{display:flex;align-items:center;gap:14px;width:100%;padding:14px 20px;border:none;background:none;font:inherit;text-align:left;cursor:pointer;color:var(--ink)}
.jb-li+.jb-li{box-shadow:0 -1px 0 var(--line)}
.jb-li:hover{background:color-mix(in srgb,var(--f) 60%,transparent)}
.jb-li-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.jb-li-top{display:flex;align-items:center;gap:8px}
.jb-li-side{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0}
.jb-q{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--mut)}
@media(max-width:600px){.jb-li{flex-direction:column;align-items:stretch}.jb-li-side{flex-direction:row;align-items:center;justify-content:space-between}}
.jb-cal-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
.jb-cal-h h2{margin:0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:19px;font-weight:700;letter-spacing:-.03em}
.jb-cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
.jb-cal-dow{padding:4px 6px;font-size:12px;font-weight:650;color:var(--soft)}
.jb-cal-c{display:flex;flex-direction:column;gap:3px;min-height:104px;padding:6px;border-radius:14px;background:var(--f);min-width:0}
.jb-cal-c.out{background:transparent}
.jb-cal-c.today{box-shadow:inset 0 0 0 2px var(--coral)}
.jb-cal-d{font-size:12.5px;font-weight:650;color:var(--mut)}
.jb-cal-j{display:block;width:100%;padding:3px 6px;border:none;border-radius:8px;background:var(--card,#fff);font:inherit;font-size:12px;font-weight:550;color:var(--ink);text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;box-shadow:inset 3px 0 0 #93c5fd}
.jb-cal-j.s-in_progress{box-shadow:inset 3px 0 0 #fbbf24}.jb-cal-j.s-completed{box-shadow:inset 3px 0 0 #4ade80;color:var(--mut)}.jb-cal-j.s-awaiting_approval{box-shadow:inset 3px 0 0 #fbbf24}.jb-cal-j.s-quoting{box-shadow:inset 3px 0 0 #a78bfa}
.jb-cal-more{font-size:11.5px;color:var(--mut);padding-left:4px}
@media(max-width:700px){.jb-cal-c{min-height:64px;padding:4px}.jb-cal-j{font-size:0;height:6px;padding:0;border-radius:4px;background:#93c5fd;box-shadow:none}.jb-cal-j .jb-num{display:none}.jb-cal-dow{font-size:10.5px;padding:2px}}
`
