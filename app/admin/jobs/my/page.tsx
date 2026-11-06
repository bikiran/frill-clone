'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AdminPage } from '@/components/ui/AdminKit'
import EmptyScroll from '@/components/EmptyScroll'
import {
  api, useJobsCompany, StatusTag, fmtTime, fmtDay, fmtAgo, dayKeyIn, SetupNote, Icon, JB_CSS, AvatarStack,
  readJobsCache, writeJobsCache, cacheKeys, prefetchJob,
} from '@/components/jobs/shared'
import { fmtJobNumber } from '@/lib/jobs/status'

// My jobs: everything the signed-in person is on, by day, so a tradie can see
// today's work at a glance and get to the address. The timer, checklist,
// photos and sign-off are on each job's page.

type Group = { key: string; title: string; jobs: any[] }
const mineKey = (cid: string) => `jobs:list:mine:${cid}`

export default function MyJobsPage() {
  const router = useRouter()
  const { companyId, ready } = useJobsCompany()
  const seed = useRef<any>(companyId ? readJobsCache(mineKey(companyId)) : undefined)
  const [jobs, setJobs] = useState<any[]>(() => seed.current?.jobs || [])
  const [tz, setTz] = useState(() => seed.current?.timezone || 'Australia/Melbourne')
  const [prefix, setPrefix] = useState(() => seed.current?.prefix || 'J')
  const [loading, setLoading] = useState(() => !seed.current)
  const [err, setErr] = useState('')
  const [setup, setSetup] = useState('')

  const load = useCallback(async (cid: string) => {
    try {
      const d = await api(`/api/jobs?companyId=${cid}&mine=1`)
      setJobs(d.jobs || []); setTz(d.timezone || 'Australia/Melbourne'); setPrefix(d.settings?.job_prefix || 'J'); setErr(''); setSetup('')
      writeJobsCache(mineKey(cid), { jobs: d.jobs || [], timezone: d.timezone, prefix: d.settings?.job_prefix })
    } catch (e: any) { if (/COLVY_V42/.test(e.message)) setSetup(e.message); else setErr(e.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => {
    if (!ready) return
    if (!companyId) { setLoading(false); return }
    load(companyId)
    // Back on the tab after a while (out on a job): refresh.
    const onVis = () => { if (document.visibilityState === 'visible') load(companyId) }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [ready, companyId, load])

  const groups = useMemo<Group[]>(() => {
    const today = dayKeyIn(new Date(), tz)
    const doneSince = Date.now() - 14 * 86400000
    const byStart = (a: any, b: any) => String(a.scheduled_start || '').localeCompare(String(b.scheduled_start || ''))
    const open = jobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled')
    const working = open.filter(j => j.status === 'in_progress').sort(byStart)
    const rest = open.filter(j => j.status !== 'in_progress')
    const todays = rest.filter(j => j.scheduled_start && dayKeyIn(j.scheduled_start, tz) === today).sort(byStart)
    const overdue = rest.filter(j => j.scheduled_start && dayKeyIn(j.scheduled_start, tz) < today).sort(byStart)
    const later = rest.filter(j => j.scheduled_start && dayKeyIn(j.scheduled_start, tz) > today).sort(byStart)
    const unscheduled = rest.filter(j => !j.scheduled_start)
    const done = jobs.filter(j => j.status === 'completed' && Date.parse(j.completed_at || j.updated_at) > doneSince)
      .sort((a, b) => String(b.completed_at || b.updated_at).localeCompare(String(a.completed_at || a.updated_at))).slice(0, 10)
    return [
      { key: 'working', title: 'In progress', jobs: working },
      { key: 'today', title: 'Today', jobs: todays },
      { key: 'overdue', title: 'Earlier, not finished', jobs: overdue },
      { key: 'later', title: 'Coming up', jobs: later },
      { key: 'unscheduled', title: 'Not scheduled yet', jobs: unscheduled },
      { key: 'done', title: 'Done in the last two weeks', jobs: done },
    ].filter(g => g.jobs.length)
  }, [jobs, tz])

  const open = (j: any) => {
    if (companyId && !readJobsCache(cacheKeys.job(companyId, j.id))) writeJobsCache(cacheKeys.job(companyId, j.id), { job: j, partial: true })
    router.push(`/admin/jobs/${j.id}`)
  }
  const warm = (j: any) => { if (companyId) { router.prefetch(`/admin/jobs/${j.id}`); prefetchJob(companyId, j.id) } }
  const todayCount = (groups.find(g => g.key === 'today')?.jobs.length || 0) + (groups.find(g => g.key === 'working')?.jobs.length || 0)

  return (
    <AdminPage title="My jobs" width="lg"
      sub={loading ? 'Everything you’re on, by day.' : todayCount ? `${todayCount} job${todayCount === 1 ? '' : 's'} on today.` : 'Nothing on today.'}
      actions={<Link href="/admin/jobs" className="ak-btn">All jobs</Link>}>
      <style>{JB_CSS + MY_CSS}</style>
      {setup && <SetupNote text={setup} />}
      {err && <div className="ak-note bad">{err}</div>}
      {loading ? (
        <div className="jb-skel">{Array.from({ length: 3 }).map((_, i) => <div key={i} />)}</div>
      ) : !groups.length ? (!err && !setup && (
        <div className="ak-panel jb-empty">
          <EmptyScroll title="Nothing on your plate" kinds={['job', 'calendar', 'contact']}
            line="Jobs show here when someone puts you on them, with the time, the customer and the address." />
        </div>
      )) : groups.map(g => (
        <section key={g.key} className="my-g" aria-labelledby={`my-${g.key}`}>
          <h2 id={`my-${g.key}`}>{g.title}<span>{g.jobs.length}</span></h2>
          <div className="my-list">
            {g.jobs.map(j => (
              <article key={j.id} className={`my-job s-${j.status}`}>
                <button type="button" className="my-main" onClick={() => open(j)} onPointerEnter={() => warm(j)} onPointerDown={() => warm(j)} onFocus={() => warm(j)}
                  aria-label={`${fmtJobNumber(j.number, prefix)} ${j.title}`}>
                  <span className="my-when">
                    {g.key === 'done' ? <><b>Done</b><span>{fmtAgo(j.completed_at || j.updated_at)}</span></>
                      : j.scheduled_start ? <><b>{fmtTime(j.scheduled_start, tz)}</b><span>{g.key === 'today' || g.key === 'working' ? (j.scheduled_end ? `to ${fmtTime(j.scheduled_end, tz)}` : '') : fmtDay(j.scheduled_start, tz)}</span></>
                      : <><b>—</b><span>No time</span></>}
                  </span>
                  <span className="my-body">
                    <span className="my-top"><span className="jb-no">{fmtJobNumber(j.number, prefix)}</span><StatusTag status={j.status} /></span>
                    <b className="my-title">{j.title}</b>
                    {j.contact && <span className="my-meta">{Icon.user}{j.contact.name || j.contact.phone || j.contact.email}</span>}
                  </span>
                  {(j.assignees || []).length > 1 && <AvatarStack people={j.assignees} size={22} />}
                </button>
                {(j.address || j.contact?.phone) && (
                  <div className="my-acts">
                    {j.address && <a className="ak-btn sm" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(j.address)}`} target="_blank" rel="noreferrer">{Icon.pin}<span className="my-addr">{j.address}</span></a>}
                    {j.contact?.phone && <a className="ak-btn sm ghost" href={`tel:${j.contact.phone}`} aria-label={`Call ${j.contact.name || 'the customer'}`}>Call</a>}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
    </AdminPage>
  )
}

const MY_CSS = `
.my-g{margin-bottom:22px}
.my-g h2{display:flex;align-items:center;gap:8px;margin:0 0 10px;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:17px;font-weight:700;letter-spacing:-.02em}
.my-g h2 span{font-size:12px;font-weight:650;color:var(--mut);padding:2px 8px;border-radius:99px;background:var(--f)}
.my-list{display:flex;flex-direction:column;gap:8px}
.my-job{border-radius:20px;background:var(--card,#fff);box-shadow:0 0 0 1px var(--line,#ececee);overflow:hidden}
.my-job.s-in_progress{box-shadow:0 0 0 1.5px #86efac}
.my-main{display:flex;align-items:center;gap:14px;width:100%;padding:14px 16px;border:none;background:none;font:inherit;text-align:left;color:var(--ink);cursor:pointer}
.my-main:hover{background:var(--f)}
.my-when{display:flex;flex-direction:column;min-width:74px;flex-shrink:0}
.my-when b{font-size:16px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.my-when span{font-size:12px;color:var(--mut)}
.my-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.my-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.my-title{font-size:15px;font-weight:650;overflow-wrap:anywhere}
.my-meta{display:inline-flex;align-items:center;gap:5px;font-size:13px;color:var(--mut)}
.my-acts{display:flex;gap:8px;padding:0 16px 14px;flex-wrap:wrap}
.my-acts .ak-btn{max-width:100%;min-width:0}
.my-addr{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:46ch}
@media(max-width:560px){.my-main{padding:12px 14px;gap:12px}.my-when{min-width:58px}.my-acts{padding:0 14px 12px}.my-acts .ak-btn:first-child{flex:1}}
`
