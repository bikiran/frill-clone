'use client'

// The Inbox contact panel's jobs and quotes for a trades or services
// business: this customer's jobs (number, status, when it's booked, the quote
// and its total when this person may see money), each opening the job, and
// Create job from the conversation. Shows only when Jobs & quotes is on for
// the workspace (lib/modules); the list comes from /api/jobs, which applies
// the team's visibility rules.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createJobFrom, useJobsEnabled } from '@/components/jobs/createJob'
import { apiRaw, fmtWhen } from '@/components/jobs/shared'
import { JOB_STATUS_LABEL, QUOTE_STATUS_LABEL, fmtJobNumber, fmtQuoteNumber, isOpenJob, type JobStatus, type QuoteStatus } from '@/lib/jobs/status'

type Job = {
  id: string; number: number; title: string; status: string; scheduled_start: string | null; scheduled_end: string | null
  value_cents: number | null; quote: { number: number; status: string; total_cents: number } | null
}
type Data = { jobs: Job[]; jobPrefix: string; quotePrefix: string; tz: string; money: boolean }

const cache = new Map<string, Data>()
const TONE: Record<string, string> = { new: 'blue', quoting: 'violet', awaiting_approval: 'amber', scheduled: 'blue', in_progress: 'amber', completed: 'green', cancelled: 'red' }
const money = (cents: number | null | undefined) =>
  cents == null ? '' : (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })

export default function JobGlance({ companyId, contactId, conversationId }: { companyId: string; contactId: string; conversationId?: string | null }) {
  const on = useJobsEnabled(companyId)
  const router = useRouter()
  const key = `${companyId}:${contactId}`
  const [d, setD] = useState<Data | null>(() => cache.get(key) || null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    setD(cache.get(key) || null); setErr('')
    if (!on) return
    let live = true
    apiRaw(`/api/jobs?companyId=${companyId}&contactId=${contactId}`).then(r => {
      if (!live || !r.ok) return
      const v: Data = {
        jobs: (r.data?.jobs || []) as Job[],
        jobPrefix: r.data?.settings?.job_prefix || 'J', quotePrefix: r.data?.settings?.quote_prefix || 'Q',
        tz: r.data?.timezone || 'Australia/Melbourne', money: !!r.data?.seesMoney,
      }
      cache.set(key, v); setD(v)
    }).catch(() => {})
    return () => { live = false }
  }, [on, companyId, contactId, key])

  if (!on || !d) return null
  // Open jobs first: booked ones soonest first, then the unbooked; finished ones
  // last. Within each, the API's order (most recently updated first).
  const rank = (j: Job) => (!isOpenJob(j.status) ? 2 : j.scheduled_start ? 0 : 1)
  const jobs = d.jobs.slice().sort((a, b) => {
    const ra = rank(a), rb = rank(b)
    if (ra !== rb) return ra - rb
    return ra === 0 ? String(a.scheduled_start).localeCompare(String(b.scheduled_start)) : 0
  })
  const shown = jobs.slice(0, 3)
  const create = async () => {
    if (!conversationId || busy) return
    setBusy(true); setErr('')
    try {
      const r = await createJobFrom(companyId, { source: 'conversation', conversationId })
      cache.delete(key)
      router.push(`/admin/jobs/${r.job.id}`)
    } catch (e: any) { setErr(e?.message || 'Could not create the job.') } finally { setBusy(false) }
  }

  return (
    <div className="jg">
      <div className="jg-h">
        <b>Jobs &amp; quotes</b>
        {jobs.length > 0 && <span className="jg-n">{jobs.length}</span>}
        <Link href={jobs.length === 1 ? `/admin/jobs/${jobs[0].id}` : '/admin/jobs'}>Open ›</Link>
      </div>
      {shown.length === 0 && <p className="jg-empty">No jobs for this customer yet.</p>}
      {shown.map(j => {
        const when = j.scheduled_start ? fmtWhen(j.scheduled_start, j.scheduled_end, d.tz) : ''
        const q = j.quote
        const total = d.money ? money(q?.total_cents ?? j.value_cents) : ''
        return (
          <Link key={j.id} href={`/admin/jobs/${j.id}`} className="jg-row">
            <span className="jg-top">
              <span className="jg-num">{fmtJobNumber(j.number, d.jobPrefix)}</span>
              <span className="jg-title">{j.title || 'Job'}</span>
              <span className={`jg-tag ${TONE[j.status] || ''}`}>{JOB_STATUS_LABEL[j.status as JobStatus] || j.status}</span>
            </span>
            {(when || q || total) && (
              <span className="jg-sub">
                {when && <span>{when}</span>}
                {q && <span>Quote {fmtQuoteNumber(q.number, null, d.quotePrefix)}: {QUOTE_STATUS_LABEL[q.status as QuoteStatus] || q.status}</span>}
                {total && <span className="jg-money">{total}</span>}
              </span>
            )}
          </Link>
        )
      })}
      {jobs.length > shown.length && <Link href="/admin/jobs" className="jg-more">+{jobs.length - shown.length} more</Link>}
      {conversationId && (
        <button type="button" className="jg-new" onClick={create} disabled={busy}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          {busy ? 'Creating…' : 'Create job'}
        </button>
      )}
      {err && <p className="jg-err">{err}</p>}
      <style>{`
        .jg{margin-top:14px;padding:12px 14px;border-radius:16px;background:#f6f6f7;font-size:13px;color:var(--ink)}
        .jg-h{display:flex;align-items:center;gap:8px;margin-bottom:6px}
        .jg-h b{font-size:13.5px;font-weight:700}
        .jg-n{min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:rgba(99,102,241,.12);color:#4f46e5;font-size:11.5px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
        .jg-h a{margin-left:auto;font-size:12.5px;font-weight:650;color:var(--coral);text-decoration:none}
        .jg-empty{margin:2px 0 0;color:var(--slate)}
        .jg-row{display:block;padding:9px 10px;margin:6px -4px 0;border-radius:12px;background:var(--card);text-decoration:none;color:inherit;box-shadow:0 0 0 1px rgba(15,17,25,.06)}
        .jg-row:hover{box-shadow:0 0 0 1px rgba(99,102,241,.35)}
        .jg-top{display:flex;align-items:flex-start;gap:7px;min-width:0;line-height:20px}
        .jg-num{font-size:12px;font-weight:700;color:var(--slate);font-variant-numeric:tabular-nums;flex-shrink:0}
        .jg-title{flex:1;min-width:0;font-weight:650;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow-wrap:anywhere}
        .jg-tag{flex-shrink:0;height:20px;padding:0 8px;border-radius:999px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;background:#f4f4f5;color:#52525b}
        .jg-tag.blue{background:#e0ecff;color:#1d4ed8}.jg-tag.violet{background:#ede9fe;color:#6d28d9}.jg-tag.amber{background:#fef3c7;color:#b45309}
        .jg-tag.green{background:#dcfce7;color:#15803d}.jg-tag.red{background:#fee2e2;color:#b91c1c}
        .jg-sub{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:4px;font-size:12px;color:var(--slate)}
        .jg-money{margin-left:auto;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums}
        .jg-more{display:inline-block;margin-top:6px;font-size:12px;font-weight:650;color:var(--slate);text-decoration:none}
        .jg-new{margin-top:10px;width:100%;height:34px;border-radius:999px;border:0;box-shadow:0 0 0 1px rgba(15,17,25,.1);background:var(--card);color:var(--ink);font:inherit;font-size:13px;font-weight:650;display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer}
        .jg-new:hover{box-shadow:0 0 0 1px rgba(99,102,241,.45);color:#4f46e5}
        .jg-new:disabled{opacity:.6;cursor:default}
        .jg-err{margin:6px 0 0;color:#b91c1c;font-size:12px}
        [data-theme="dark"] .jg{background:rgba(255,255,255,.05)}
        [data-theme="dark"] .jg-row,[data-theme="dark"] .jg-new{box-shadow:0 0 0 1px rgba(255,255,255,.08)}
        [data-theme="dark"] .jg-n{background:rgba(129,140,248,.16);color:#a5b4fc}
        [data-theme="dark"] .jg-tag{background:rgba(255,255,255,.08);color:#d4d4d8}
        [data-theme="dark"] .jg-tag.blue{background:rgba(59,130,246,.18);color:#93c5fd}
        [data-theme="dark"] .jg-tag.violet{background:rgba(139,92,246,.2);color:#c4b5fd}
        [data-theme="dark"] .jg-tag.amber{background:rgba(245,158,11,.18);color:#fcd34d}
        [data-theme="dark"] .jg-tag.green{background:rgba(34,197,94,.18);color:#86efac}
        [data-theme="dark"] .jg-tag.red{background:rgba(239,68,68,.18);color:#fca5a5}
      `}</style>
    </div>
  )
}
