'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AdminPage } from '@/components/ui/AdminKit'
import { api, useJobsCompany, InvoiceTag, fmtAgo, fmtDate, SetupNote, JB_CSS, prefetchInvoice, readJobsCache, writeJobsCache } from '@/components/jobs/shared'
import { fmtMoney } from '@/lib/jobs/quote-math'

// Every job invoice in one place: what's owing, what's overdue (and how many
// reminders have gone), what's been paid this month, and the drafts still to
// send. Each row opens the invoice.

type Tab = 'owing' | 'overdue' | 'paid' | 'draft' | 'all'
const TABS: [Tab, string][] = [['owing', 'Owing'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['draft', 'Drafts'], ['all', 'All']]
const key = (cid: string) => `jobs:invoices:${cid}`

export default function InvoicesPage() {
  const { companyId, ready } = useJobsCompany()
  const [tab, setTab] = useState<Tab>('owing')
  const [d, setD] = useState<any>(() => (companyId ? readJobsCache(key(companyId)) : null))
  const [err, setErr] = useState('')
  const [setup, setSetup] = useState('')

  const load = useCallback(async () => {
    if (!companyId) return
    try {
      const r = await api(`/api/jobs/invoices?companyId=${companyId}&status=all`)
      setD(r); setErr(''); writeJobsCache(key(companyId), r)
    } catch (e: any) { if (/COLVY_V4\d\d/.test(e.message)) setSetup(e.message); else setErr(e.message) }
  }, [companyId])
  useEffect(() => { if (ready) load() }, [ready, load])

  const all: any[] = d?.invoices || []
  const shown = all.filter(v => tab === 'all' ? true : tab === 'owing' ? v.status === 'sent' : tab === 'overdue' ? v.overdue : v.status === tab)
  const t = d?.totals
  const pf = d?.prefix || 'INV'

  return (
    <AdminPage title="Invoices" width="lg" back={{ href: '/admin/jobs', label: 'Jobs' }} sub="Who owes what, what’s overdue, and what’s been paid.">
      <style>{JB_CSS + CSS}</style>
      {setup && <SetupNote text={setup} />}
      {err && <div className="ak-note bad">{err}</div>}

      <div className="iv-tiles">
        <button type="button" className={`iv-tile${tab === 'owing' ? ' on' : ''}`} onClick={() => setTab('owing')}><span>Owing</span><b className="jb-num">{t ? fmtMoney(t.owing_cents) : '—'}</b><small>{t ? `${t.owing} invoice${t.owing === 1 ? '' : 's'}` : ' '}</small></button>
        <button type="button" className={`iv-tile warn${tab === 'overdue' ? ' on' : ''}`} onClick={() => setTab('overdue')}><span>Overdue</span><b className="jb-num">{t ? fmtMoney(t.overdue_cents) : '—'}</b><small>{t ? `${t.overdue} invoice${t.overdue === 1 ? '' : 's'}` : ' '}</small></button>
        <button type="button" className={`iv-tile good${tab === 'paid' ? ' on' : ''}`} onClick={() => setTab('paid')}><span>Paid this month</span><b className="jb-num">{t ? fmtMoney(t.paid_month_cents) : '—'}</b><small>{t ? `${t.paid_month} invoice${t.paid_month === 1 ? '' : 's'}` : ' '}</small></button>
      </div>

      <div className="ak-seg" role="tablist" aria-label="Show" style={{ alignSelf: 'flex-start' }}>
        {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}{k === 'draft' && t?.drafts ? ` (${t.drafts})` : ''}</button>)}
      </div>

      <div className="ak-panel iv-list">
        {!d && !err && !setup ? <div className="iv-sk"><span /><span /><span /></div>
          : !shown.length ? <div className="iv-empty">{tab === 'overdue' ? 'Nothing overdue. Nice.' : tab === 'owing' ? 'Nobody owes you anything right now.' : tab === 'draft' ? 'No drafts.' : 'No invoices yet. Make one from a job when the work’s done.'}</div>
          : shown.map(v => (
            <Link key={v.id} href={`/admin/jobs/invoices/${v.id}`} className="iv-row" onPointerEnter={() => prefetchInvoice(companyId, v.id)} onFocus={() => prefetchInvoice(companyId, v.id)}>
              <div className="iv-main">
                <div className="iv-top"><b>{pf}-{v.number}</b><InvoiceTag status={v.status} overdue={!!v.overdue} /></div>
                <span className="iv-t">{v.customer?.name || 'No customer'} · {v.title || v.job?.title || 'Invoice'}</span>
                <span className="iv-s">
                  {v.status === 'draft' && `Draft, edited ${fmtAgo(v.updated_at)}`}
                  {v.status === 'sent' && `${v.overdue ? 'Was due' : 'Due'} ${fmtDate(v.due_date)}${v.viewed_at ? ' · opened' : ' · not opened yet'}${v.reminder_count ? ` · ${v.reminder_count} reminder${v.reminder_count === 1 ? '' : 's'} sent` : ''}`}
                  {v.status === 'paid' && `Paid ${fmtAgo(v.paid_at)}`}
                  {v.status === 'void' && 'Void'}
                </span>
              </div>
              <b className="iv-amt jb-num">{fmtMoney(v.status === 'sent' ? v.balance_cents : Math.max(0, Number(v.total_cents) - Number(v.credit_cents)))}</b>
            </Link>
          ))}
      </div>
    </AdminPage>
  )
}

const CSS = `
.iv-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:6px}
.iv-tile{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:16px 18px;border:none;border-radius:20px;background:var(--card,#fff);box-shadow:0 0 0 1px var(--line);font:inherit;color:var(--ink);text-align:left;cursor:pointer;transition:box-shadow .15s}
.iv-tile:hover{box-shadow:0 0 0 1px var(--line),0 8px 22px -16px rgba(0,0,0,.35)}
.iv-tile.on{box-shadow:0 0 0 2px var(--ink)}
.iv-tile span{font-size:13px;font-weight:600;color:var(--mut)}
.iv-tile b{font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:26px;font-weight:700;letter-spacing:-.03em}
.iv-tile.warn b{color:#b45309}.iv-tile.good b{color:#15803d}
.iv-tile small{font-size:12.5px;color:var(--soft)}
.iv-list{display:flex;flex-direction:column;padding:6px!important}
.iv-row{display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:16px;text-decoration:none;color:var(--ink)}
.iv-row:hover{background:var(--f)}
.iv-row+.iv-row{box-shadow:0 -1px 0 var(--line)}
.iv-row:hover+.iv-row{box-shadow:none}
.iv-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.iv-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.iv-top b{font-size:14px;font-variant-numeric:tabular-nums}
.iv-t{font-size:14px;font-weight:550;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.iv-s{font-size:12.5px;color:var(--mut)}
.iv-amt{font-size:15px;flex-shrink:0}
.iv-empty{padding:28px 16px;text-align:center;font-size:14px;color:var(--mut)}
.iv-sk{display:flex;flex-direction:column;gap:10px;padding:10px}
.iv-sk span{height:52px;border-radius:14px;background:var(--f)}
@media(max-width:640px){.iv-tiles{grid-template-columns:minmax(0,1fr)}.iv-tile{flex-direction:row;align-items:baseline;justify-content:space-between;flex-wrap:wrap}.iv-tile b{font-size:22px}}
`
