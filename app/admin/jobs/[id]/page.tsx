'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { AdminPage, Panel } from '@/components/ui/AdminKit'
import DateTimeField from '@/components/ui/DateTimeField'
import { confirmDialog } from '@/components/ConfirmDialog'
import {
  api, apiRaw, useJobsCompany, StatusTag, QuoteTag, InvoiceTag, fmtWhen, fmtAgo, fmtDate, isoToLocal, localToIso, useToast, Toast, SetupNote, Icon, JB_CSS,
  cacheKeys, readJobsCache, writeJobsCache, prefetchQuote, prefetchInvoice,
} from '@/components/jobs/shared'
import AddressAutocomplete from '@/components/AddressAutocomplete'
import Link from 'next/link'
import { PeoplePanel, WorkPanel, ChecklistPanel, PhotosPanel, SignaturePanel, SignatureDialog, FIELD_CSS } from '@/components/jobs/Field'
import { JOB_STATUS_LABEL, nextStatuses, fmtJobNumber, fmtQuoteNumber, type JobStatus } from '@/lib/jobs/status'
import { fmtMoney } from '@/lib/jobs/quote-math'

// One job: its stage, details, who it's for and where it came from, who's on
// it (with clash checks), the work timer, its checklist and photos, the
// customer's sign-off, its quotes and invoices, and everything that's happened.

export default function JobPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const { companyId, ready } = useJobsCompany()
  // What we already know about this job (its last full load, or the card the
  // board handed over) paints at once; the full copy follows.
  const [d, setD] = useState<any>(() => (companyId ? seedJob(companyId, id) : null))
  const [err, setErr] = useState('')
  const [setup, setSetup] = useState('')
  const [toast, setToast] = useToast()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')
  const [statusOpen, setStatusOpen] = useState(false)
  const [quoteMenu, setQuoteMenu] = useState(false)
  const [invoiceMenu, setInvoiceMenu] = useState(false)
  const [templates, setTemplates] = useState<any[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [me, setMe] = useState('')
  const [signing, setSigning] = useState(false)

  const load = useCallback(async () => {
    if (!companyId) return
    try {
      const r = await api(`/api/jobs/${id}?companyId=${companyId}`)
      setD(r); setErr('')
      writeJobsCache(cacheKeys.job(companyId, id), r)
    } catch (e: any) { if (/COLVY_V427/.test(e.message)) setSetup(e.message); else setErr(e.message) }
  }, [companyId, id])
  useEffect(() => {
    if (!ready || !companyId) return
    setD((x: any) => x || seedJob(companyId, id))
    load()
  }, [ready, companyId, load]) // eslint-disable-line react-hooks/exhaustive-deps
  // Keep the cached copy (and the board's) in step with changes made here.
  useEffect(() => {
    if (!companyId || !d || d.partial) return
    writeJobsCache(cacheKeys.job(companyId, id), d)
    const list = readJobsCache<any>(cacheKeys.list(companyId))
    if (list?.jobs && d.job) {
      const i = list.jobs.findIndex((j: any) => j.id === id)
      if (i >= 0) {
        const j = list.jobs[i]
        const merged = { ...j, title: d.job.title, status: d.job.status, address: d.job.address, scheduled_start: d.job.scheduled_start, scheduled_end: d.job.scheduled_end, value_cents: d.job.value_cents, updated_at: d.job.updated_at }
        writeJobsCache(cacheKeys.list(companyId), { ...list, jobs: list.jobs.map((x: any, k: number) => (k === i ? merged : x)) })
      }
    }
  }, [d]) // eslint-disable-line react-hooks/exhaustive-deps
  const job = d?.job
  const partial = !!d?.partial
  const tz = d?.timezone || 'Australia/Melbourne'
  const pf = d?.settings?.job_prefix || 'J'
  const qpf = d?.settings?.quote_prefix || 'Q'

  const startEdit = () => {
    setForm({ title: job.title, description: job.description || '', address: job.address || '', start: isoToLocal(job.scheduled_start), end: isoToLocal(job.scheduled_end) })
    setEditing(true)
  }
  const saveDetails = async () => {
    setSaving(true)
    try {
      const r = await api(`/api/jobs/${id}`, { method: 'PATCH', json: { companyId, title: form.title, description: form.description, address: form.address, scheduledStart: localToIso(form.start), scheduledEnd: localToIso(form.end) } })
      setD((x: any) => ({ ...x, job: { ...x.job, ...r.job } })); setEditing(false); setToast('Saved'); load()
    } catch (e: any) { setToast(e.message) } finally { setSaving(false) }
  }

  const move = async (to: JobStatus) => {
    setStatusOpen(false)
    let cancelReason = ''
    if (to === 'cancelled') {
      const ok = await confirmDialog({ title: `Cancel ${fmtJobNumber(job.number, pf)}?`, message: 'You can reopen it later.', confirmLabel: 'Cancel job', cancelLabel: 'Keep it', tone: 'danger' })
      if (!ok) return
      cancelReason = note.trim()
    }
    // Show the new stage straight away; put it back if the server says no.
    const before = job.status
    setD((x: any) => ({ ...x, job: { ...x.job, status: to } }))
    const r = await apiRaw(`/api/jobs/${id}`, { method: 'PATCH', json: { companyId, status: to, expectedStatus: before, cancelReason } }).catch((e: any) => ({ ok: false, status: 0, data: { error: e.message } }))
    if (r.ok) {
      setD((x: any) => ({ ...x, job: { ...x.job, ...r.data.job } })); setToast(`Moved to ${JOB_STATUS_LABEL[to]}`); if (cancelReason) setNote('')
    } else {
      setD((x: any) => ({ ...x, job: { ...x.job, status: before } })); setToast(r.data.error || 'That didn’t work. Please try again.')
      if (r.status === 409 && r.data.needsSignature) setSigning(true)
    }
    load()
  }

  const addNote = async () => {
    const text = note.trim()
    if (!text) return
    // The note shows at once; it's swapped for the saved one when it lands.
    const temp = { id: `tmp-${Date.now()}`, type: 'note', actor_type: 'staff', actor_id: me, actor_name: 'You', summary: text, data: { text }, created_at: new Date().toISOString(), pending: true }
    setD((x: any) => ({ ...x, events: [temp, ...(x.events || [])] })); setNote('')
    try {
      const r = await api(`/api/jobs/${id}/notes`, { method: 'POST', json: { companyId, text } })
      setD((x: any) => ({ ...x, events: (x.events || []).map((e: any) => (e.id === temp.id ? r.note : e)) }))
    } catch (e: any) {
      setD((x: any) => ({ ...x, events: (x.events || []).filter((ev: any) => ev.id !== temp.id) })); setNote(text); setToast(e.message)
    }
  }
  const deleteNote = async (ev: any) => {
    if (!(await confirmDialog({ title: 'Delete this note?', confirmLabel: 'Delete', tone: 'danger' }))) return
    const was = d.events
    setD((x: any) => ({ ...x, events: x.events.filter((e: any) => e.id !== ev.id) }))
    try { await api(`/api/jobs/${id}/notes?companyId=${companyId}&noteId=${ev.id}`, { method: 'DELETE' }) } catch (e: any) { setD((x: any) => ({ ...x, events: was })); setToast(e.message) }
  }

  const newQuote = async (templateId?: string) => {
    setQuoteMenu(false); setBusy(true)
    try {
      const r = await api('/api/jobs/quotes', { method: 'POST', json: { companyId, jobId: id, templateId } })
      router.push(`/admin/jobs/quotes/${r.quote.id}`)
      prefetchQuote(companyId, r.quote.id)
    } catch (e: any) { setToast(e.message); setBusy(false) }
  }
  const openQuoteMenu = async () => {
    setQuoteMenu(o => !o)
    if (templates === null) {
      try { const r = await api(`/api/jobs/settings?companyId=${companyId}`); setTemplates(r.templates || []) } catch { setTemplates([]) }
    }
  }
  const newInvoice = async (blank?: boolean) => {
    setInvoiceMenu(false); setBusy(true)
    try {
      const r = await api('/api/jobs/invoices', { method: 'POST', json: { companyId, jobId: id, blank: !!blank } })
      router.push(`/admin/jobs/invoices/${r.invoice.id}`)
      prefetchInvoice(companyId, r.invoice.id)
    } catch (e: any) { setToast(e.message); setBusy(false) }
  }
  const copyLink = (q: any) => {
    const url = `${d.quoteBase}/q/${q.public_token}`
    navigator.clipboard?.writeText(url).then(() => setToast('Quote link copied')).catch(() => setToast(url))
  }
  const del = async () => {
    if (!(await confirmDialog({ title: `Delete ${fmtJobNumber(job.number, pf)}?`, message: 'The job and its draft quotes are removed for good.', confirmLabel: 'Delete job', tone: 'danger' }))) return
    try {
      await api(`/api/jobs/${id}?companyId=${companyId}`, { method: 'DELETE' })
      const list = readJobsCache<any>(cacheKeys.list(companyId))
      if (list?.jobs) writeJobsCache(cacheKeys.list(companyId), { ...list, jobs: list.jobs.filter((j: any) => j.id !== id) })
      router.push('/admin/jobs')
    } catch (e: any) { setToast(e.message) }
  }

  if (setup) return <AdminPage title="Job" back={{ href: '/admin/jobs', label: 'Jobs' }}><style>{JB_CSS}</style><SetupNote text={setup} /></AdminPage>
  if (err && !d) return <AdminPage title="Job" back={{ href: '/admin/jobs', label: 'Jobs' }}><div className="ak-note bad">{err}</div></AdminPage>
  if (!job) return (
    <AdminPage title={<span className="jbp-skel" style={{ width: 260 }} />} back={{ href: '/admin/jobs', label: 'Jobs' }} width="lg">
      <style>{JB_CSS + PAGE_CSS}</style>
      <div className="jb-two"><div className="ak-panel" style={{ height: 320 }} /><div className="ak-panel" style={{ height: 220 }} /></div>
    </AdminPage>
  )

  const source = job.source === 'conversation' ? 'a conversation' : job.source === 'booking' ? 'a booking' : job.source === 'form' ? 'a form response' : null
  const nexts = nextStatuses(job.status)

  return (
    <AdminPage width="lg" back={{ href: '/admin/jobs', label: 'Jobs' }}
      title={job.title}
      sub={<span className="jbp-sub"><b>{fmtJobNumber(job.number, pf)}</b><span>Created {fmtAgo(job.created_at)}{job.created_by_name ? ` by ${job.created_by_name}` : ''}{source ? ` from ${source}` : ''}</span></span>}
      actions={
        <div style={{ position: 'relative' }}>
          <button type="button" className="ak-btn" aria-haspopup="menu" aria-expanded={statusOpen} onClick={() => setStatusOpen(o => !o)} disabled={partial}>
            <StatusTag status={job.status} />{Icon.chev}
          </button>
          {statusOpen && (
            <div className="jb-menu" role="menu" style={{ right: 0, top: 46 }}>
              <div className="jb-menu-l">Move to</div>
              {nexts.map(s => <button key={s} type="button" role="menuitem" className={s === 'cancelled' ? 'danger' : ''} onClick={() => move(s)}>{JOB_STATUS_LABEL[s]}</button>)}
            </div>
          )}
        </div>
      }>
      <style>{JB_CSS + PAGE_CSS + FIELD_CSS}</style>
      {job.status === 'cancelled' && <div className="ak-note bad"><span><b>Cancelled</b>{job.cancel_reason ? `: ${job.cancel_reason}` : ''}. Move it to New to reopen it.</span></div>}

      <div className="jb-two">
        <div style={{ minWidth: 0 }}>
          <Panel title="Details" right={!editing && !partial && <button type="button" className="ak-btn sm ghost" onClick={startEdit}>Edit</button>}>
            {editing ? (
              <div className="jbp-form">
                <div><label className="ak-label" htmlFor="jd-t">Title</label><input id="jd-t" className="ak-field" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} maxLength={160} /></div>
                <div><label className="ak-label" htmlFor="jd-a">Address</label><AddressAutocomplete id="jd-a" className="ak-field" value={form.address} onChange={v => setForm((f: any) => ({ ...f, address: v }))} onSelect={p => setForm((f: any) => ({ ...f, address: p.formatted || f.address }))} maxLength={300} placeholder="Start typing an address" /></div>
                <div className="jbp-2">
                  <div><span className="ak-label">Starts</span><DateTimeField label="Job starts" value={form.start} onChange={v => setForm({ ...form, start: v })} placeholder="Not scheduled" /></div>
                  <div><span className="ak-label">Finishes</span><DateTimeField label="Job finishes" value={form.end} onChange={v => setForm({ ...form, end: v })} min={form.start || undefined} placeholder="Optional" /></div>
                </div>
                <div><label className="ak-label" htmlFor="jd-d">Details</label><textarea id="jd-d" className="ak-field" rows={6} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} maxLength={8000} /></div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="ak-btn ghost" onClick={() => setEditing(false)}>Cancel</button>
                  <button type="button" className="ak-btn go" onClick={saveDetails} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                </div>
              </div>
            ) : (
              <dl className="jb-kv">
                <dt>When</dt><dd>{job.scheduled_start ? fmtWhen(job.scheduled_start, job.scheduled_end, tz) : <span className="jb-muted">Not scheduled</span>}</dd>
                <dt>Address</dt><dd>{job.address ? <a href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`} target="_blank" rel="noreferrer">{job.address}</a> : <span className="jb-muted">—</span>}</dd>
                <dt>Details</dt><dd>{job.description ? <p className="jb-pre">{job.description}</p> : partial ? <span className="jbp-skel" style={{ width: '70%', height: 16 }} /> : <span className="jb-muted">No details yet</span>}</dd>
              </dl>
            )}
          </Panel>

          {!partial && <>
            <WorkPanel companyId={companyId} job={job} time={d.time} me={d.me || me} toast={setToast} onNeedSignature={() => setSigning(true)}
              onChange={n => { setD((x: any) => ({ ...x, ...(n.job ? { job: { ...x.job, ...n.job } } : {}), ...(n.time ? { time: n.time } : {}) })); if (n.job) load() }} />
            <ChecklistPanel companyId={companyId} jobId={id} items={d.checklist || []} toast={setToast}
              onChange={items => setD((x: any) => ({ ...x, checklist: items }))} />
            <PhotosPanel companyId={companyId} jobId={id} attachments={d.attachments || []} me={d.me || me} canManage={!!d.canManage} toast={setToast}
              onChange={list => setD((x: any) => ({ ...x, attachments: list }))} />
          </>}

          {d.seesMoney !== false && (
          <Panel title="Quotes" sub="Itemised quotes with GST, sent as a link the customer accepts online."
            right={!partial && job.status !== 'cancelled' && job.status !== 'completed' && (
              <div style={{ position: 'relative' }}>
                <button type="button" className="ak-btn sm go" onClick={openQuoteMenu} disabled={busy} aria-haspopup="menu" aria-expanded={quoteMenu}>{Icon.plus}New quote</button>
                {quoteMenu && (
                  <div className="jb-menu" role="menu" style={{ right: 0, top: 38 }}>
                    <button type="button" role="menuitem" onClick={() => newQuote()}>Blank quote</button>
                    {templates === null ? <div className="jb-menu-l">Loading templates…</div> : templates.length > 0 && <>
                      <div className="jb-menu-l">From a template</div>
                      {templates.map(t => <button key={t.id} type="button" role="menuitem" onClick={() => newQuote(t.id)}>{t.name}</button>)}
                    </>}
                  </div>
                )}
              </div>
            )}>
            {partial ? (
              <div className="jbp-skel-rows"><span /><span /></div>
            ) : d.quotes.length === 0 ? (
              <div className="jbp-empty">No quotes yet.</div>
            ) : (
              <div className="jbp-quotes">
                {d.quotes.map((q: any) => {
                  const expired = q.status === 'sent' && q.valid_until && q.valid_until < new Date().toISOString().slice(0, 10)
                  return (
                    <div key={q.id} className="jbp-q">
                      <Link href={`/admin/jobs/quotes/${q.id}`} className="jbp-q-main" onPointerEnter={() => prefetchQuote(companyId, q.id)} onPointerDown={() => prefetchQuote(companyId, q.id)} onFocus={() => prefetchQuote(companyId, q.id)}>
                        <div className="jbp-q-top"><b>{fmtQuoteNumber(q.number, q.revision, qpf)}</b><QuoteTag status={q.status} expired={!!expired} />{q.deposit_status === 'paid' && <span className="ak-tag green">Deposit paid</span>}</div>
                        <span className="jbp-q-t">{q.title || 'Quote'}</span>
                        <span className="jbp-q-s">
                          {q.status === 'draft' && `Draft, edited ${fmtAgo(q.updated_at)}`}
                          {q.status === 'sent' && `Sent ${fmtAgo(q.sent_at)}${q.viewed_at ? ' · opened' : ' · not opened yet'}${q.valid_until ? ` · valid until ${fmtDate(q.valid_until)}` : ''}`}
                          {q.status === 'accepted' && `Accepted ${fmtAgo(q.accepted_at)}${q.decided_name ? ` by ${q.decided_name}` : ''}${q.decided_by_type === 'staff' ? ' (recorded by the team)' : ''}`}
                          {q.status === 'declined' && `Declined ${fmtAgo(q.declined_at)}${q.decided_note ? `: “${q.decided_note}”` : ''}`}
                          {q.status === 'withdrawn' && 'Withdrawn'}
                        </span>
                      </Link>
                      <div className="jbp-q-side">
                        <b className="jb-num">{fmtMoney(q.total_cents)}</b>
                        {q.public_token && q.status !== 'withdrawn' && <button type="button" className="ak-icon-btn" onClick={() => copyLink(q)} title="Copy the customer’s link" aria-label="Copy quote link">{Icon.link}</button>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>
          )}

          {d.seesMoney !== false && d.invoicesReady !== false && (() => {
            const invs: any[] = d.invoices || []
            const ipf = d.settings?.invoice_prefix || 'INV'
            // The accepted quote can still be invoiced (nothing made from it yet).
            const fromQuote = !!job.accepted_quote_id && !invs.some((v: any) => v.status !== 'void' && v.quote_id === job.accepted_quote_id)
            const canBill = !partial && job.status !== 'cancelled'
            const owing = (v: any) => Math.max(0, Number(v.total_cents) - Number(v.credit_cents) - Number(v.paid_cents))
            return (
              <Panel title="Invoices" sub="Bill the balance when the work’s done. They pay online, and late ones are chased for you."
                right={canBill && (fromQuote ? (
                  <div style={{ position: 'relative' }}>
                    <button type="button" className="ak-btn sm go" onClick={() => setInvoiceMenu(o => !o)} disabled={busy} aria-haspopup="menu" aria-expanded={invoiceMenu}>{Icon.plus}New invoice</button>
                    {invoiceMenu && (
                      <div className="jb-menu" role="menu" style={{ right: 0, top: 38 }}>
                        <button type="button" role="menuitem" onClick={() => newInvoice()}>From the accepted quote</button>
                        <button type="button" role="menuitem" onClick={() => newInvoice(true)}>Blank invoice</button>
                      </div>
                    )}
                  </div>
                ) : <button type="button" className="ak-btn sm go" onClick={() => newInvoice(true)} disabled={busy}>{Icon.plus}New invoice</button>)}>
                {partial ? <div className="jbp-skel-rows"><span /></div> : !invs.length ? (
                  job.status === 'completed' && canBill
                    ? <div className="jbp-bill"><div><b>The job’s done. Time to bill it.</b><span>{fromQuote ? 'The invoice starts from the accepted quote, with any deposit already taken off.' : 'Add what you did, and send it by text or email.'}</span></div><button type="button" className="ak-btn go" onClick={() => newInvoice(!fromQuote)} disabled={busy}>Create invoice</button></div>
                    : <div className="jbp-empty">No invoices yet.</div>
                ) : (
                  <div className="jbp-quotes">
                    {invs.map((v: any) => {
                      const overdue = v.status === 'sent' && v.due_date && d.today && v.due_date < d.today && owing(v) > 0
                      return (
                        <div key={v.id} className="jbp-q">
                          <Link href={`/admin/jobs/invoices/${v.id}`} className="jbp-q-main" onPointerEnter={() => prefetchInvoice(companyId, v.id)} onPointerDown={() => prefetchInvoice(companyId, v.id)} onFocus={() => prefetchInvoice(companyId, v.id)}>
                            <div className="jbp-q-top"><b>{ipf}-{v.number}</b><InvoiceTag status={v.status} overdue={!!overdue} /></div>
                            <span className="jbp-q-t">{v.title || 'Invoice'}</span>
                            <span className="jbp-q-s">
                              {v.status === 'draft' && `Draft, edited ${fmtAgo(v.updated_at)}`}
                              {v.status === 'sent' && `${overdue ? 'Was due' : 'Due'} ${fmtDate(v.due_date)} · sent ${fmtAgo(v.sent_at)}${v.viewed_at ? ' · opened' : ''}${Number(v.paid_cents) > 0 ? ` · ${fmtMoney(v.paid_cents)} paid` : ''}${v.reminder_count ? ` · ${v.reminder_count} reminder${v.reminder_count === 1 ? '' : 's'} sent` : ''}`}
                              {v.status === 'paid' && `Paid ${fmtAgo(v.paid_at)}`}
                              {v.status === 'void' && 'Void'}
                            </span>
                          </Link>
                          <div className="jbp-q-side">
                            <b className="jb-num">{fmtMoney(v.status === 'sent' ? owing(v) : Math.max(0, Number(v.total_cents) - Number(v.credit_cents)))}</b>
                            {v.public_token && v.status !== 'void' && v.status !== 'draft' && <button type="button" className="ak-icon-btn" onClick={() => { const url = `${d.quoteBase}/i/${v.public_token}`; navigator.clipboard?.writeText(url).then(() => setToast('Invoice link copied')).catch(() => setToast(url)) }} title="Copy the customer’s link" aria-label="Copy invoice link">{Icon.link}</button>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Panel>
            )
          })()}

          <Panel title="Activity">
            <div className="jbp-note">
              <textarea className="ak-field" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note for the team…" maxLength={4000}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addNote() }} aria-label="Add a note" />
              <button type="button" className="ak-btn dark sm" onClick={addNote} disabled={busy || !note.trim()}>Add note</button>
            </div>
            {partial && <div className="jbp-skel-rows"><span /><span /><span /></div>}
            <ol className="jbp-tl">
              {(d.events || []).map((ev: any) => (
                <li key={ev.id} className={`t-${ev.type}${ev.pending ? ' pending' : ''}`}>
                  <span className="jbp-dot" aria-hidden />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {ev.type === 'note'
                      ? <div className="jbp-notecard"><p className="jb-pre">{ev.data?.text || ev.summary}</p></div>
                      : <span className="jbp-tl-s">{ev.summary}</span>}
                    <span className="jbp-tl-m">{ev.actor_type === 'customer' ? 'Customer' : ev.actor_type === 'system' ? 'Colvy' : ev.actor_name || 'Team'} · {fmtAgo(ev.created_at)}</span>
                  </div>
                  {ev.type === 'note' && !ev.pending && (ev.actor_id === me || d.canManage) && <button type="button" className="ak-icon-btn danger jbp-del" onClick={() => deleteNote(ev)} aria-label="Delete note">{Icon.trash}</button>}
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <aside className="jb-side">
          <Panel title="Customer">
            {partial ? (
              job.contact ? <div className="jbp-cust"><b>{job.contact.name || 'Unnamed contact'}</b>{job.contact.phone && <span>{job.contact.phone}</span>}{job.contact.email && <span>{job.contact.email}</span>}</div> : <div className="jbp-skel-rows"><span /></div>
            ) : d.contact ? (
              <div className="jbp-cust">
                <b>{d.contact.name || 'Unnamed contact'}</b>
                {d.contact.phone && <a href={`tel:${d.contact.phone}`}>{d.contact.phone}</a>}
                {d.contact.email && <a href={`mailto:${d.contact.email}`}>{d.contact.email}</a>}
                <Link className="ak-btn sm" href={`/admin/customers/profile?id=${d.contact.id}`} style={{ marginTop: 8, alignSelf: 'flex-start' }}>Open profile</Link>
              </div>
            ) : <LinkCustomer companyId={companyId} jobId={id} onLinked={() => load()} onError={setToast} />}
          </Panel>

          {!partial && <>
            <PeoplePanel companyId={companyId} job={job} conflicts={d.conflicts || []} canAssign={!!d.canManage || !d.restricted} toast={setToast}
              onSaved={(j, c) => { setD((x: any) => ({ ...x, job: { ...x.job, ...j }, conflicts: c })); load() }} />
            <SignaturePanel job={job} required={!!d.settings?.require_signature} onSign={() => setSigning(true)} />
          </>}

          {!partial && (
            <Panel title="Linked">
              <div className="jbp-links">
                {d.conversation ? <Link href={`/admin/inbox?conversation=${d.conversation.id}`}>Conversation{d.conversation.subject ? `: ${d.conversation.subject}` : ''}{Icon.ext}</Link> : <span className="jb-muted">No conversation</span>}
                {d.booking && <Link href="/admin/bookings?tab=bookings">Booking: {d.booking.service_name || 'Booking'}, {fmtWhen(d.booking.starts_at, null, tz)}{Icon.ext}</Link>}
                {d.form && <Link href={`/admin/forms/${d.form.id}/results`}>Form: {d.form.title || 'Form response'}{Icon.ext}</Link>}
              </div>
            </Panel>
          )}

          {job.value_cents != null && (
            <Panel title="Value">
              <div className="jbp-value jb-num">{fmtMoney(job.value_cents)}</div>
              <p className="ak-hint" style={{ margin: 0 }}>The accepted quote’s total, including GST.</p>
            </Panel>
          )}

          {d.canManage && (
            <button type="button" className="ak-btn danger" onClick={del} style={{ alignSelf: 'flex-start' }}>{Icon.trash}Delete job</button>
          )}
        </aside>
      </div>
      {signing && !partial && (
        <SignatureDialog companyId={companyId} jobId={id} defaultName={d.contact?.name || ''} toast={setToast} onClose={() => setSigning(false)}
          onSaved={j => { setSigning(false); setD((x: any) => ({ ...x, job: { ...x.job, ...j } })); load() }} />
      )}
      <Toast text={toast} />
    </AdminPage>
  )
}

/** The job's last full load, or the board's card for it (marked partial). */
function seedJob(companyId: string, id: string) {
  const c = readJobsCache<any>(cacheKeys.job(companyId, id))
  if (!c) return null
  if (!c.partial) return c
  const list = readJobsCache<any>(cacheKeys.list(companyId))
  return { job: c.job, quotes: [], events: [], partial: true, timezone: list?.timezone, settings: list?.settings }
}

function LinkCustomer({ companyId, jobId, onLinked, onError }: { companyId: string; jobId: string; onLinked: () => void; onError: (m: string) => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<any[]>([])
  const live = useRef(true)
  useEffect(() => () => { live.current = false }, [])
  useEffect(() => {
    const term = q.trim().replace(/[%,()]/g, ' ')
    if (term.length < 2) { setHits([]); return }
    const t = setTimeout(async () => {
      const { data } = await (supabase as any).from('contacts').select('id, name, phone, email').eq('company_id', companyId)
        .or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`).limit(6)
      if (live.current) setHits(data || [])
    }, 220)
    return () => clearTimeout(t)
  }, [q, companyId])
  const pick = async (c: any) => {
    try { await api(`/api/jobs/${jobId}`, { method: 'PATCH', json: { companyId, contactId: c.id } }); onLinked() } catch (e: any) { onError(e.message) }
  }
  return (
    <div>
      <p className="ak-hint" style={{ margin: '0 0 8px' }}>No customer on this job yet.</p>
      <input className="ak-field" value={q} onChange={e => setQ(e.target.value)} placeholder="Find a contact" aria-label="Find a contact" />
      {hits.length > 0 && (
        <div className="jbp-hits">
          {hits.map(h => <button key={h.id} type="button" onClick={() => pick(h)}><b>{h.name || h.phone || h.email}</b><span>{[h.phone, h.email].filter(Boolean).join(' · ')}</span></button>)}
        </div>
      )}
    </div>
  )
}

const PAGE_CSS = `
.jbp-skel{display:inline-block;height:34px;border-radius:12px;background:var(--f,#f4f4f5)}
.jbp-skel-rows{display:flex;flex-direction:column;gap:8px}
.jbp-skel-rows span{display:block;height:58px;border-radius:16px;background:var(--f,#f4f4f5);animation:jbp-pulse 1.2s ease-in-out infinite}
@keyframes jbp-pulse{50%{opacity:.55}}
@media (prefers-reduced-motion:reduce){.jbp-skel-rows span{animation:none}}
.jbp-tl li.pending{opacity:.6}
.jbp-sub{display:inline-flex;align-items:center;gap:10px;flex-wrap:wrap}
.jbp-sub b{font-variant-numeric:tabular-nums;color:var(--ink)}
.jbp-form{display:flex;flex-direction:column;gap:14px}
.jbp-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
@media(max-width:560px){.jbp-2{grid-template-columns:minmax(0,1fr)}}
.jbp-empty{padding:18px;border-radius:16px;background:var(--f);font-size:14px;color:var(--mut);text-align:center}
.jbp-quotes{display:flex;flex-direction:column;gap:8px}
.jbp-q{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;background:var(--f)}
.jbp-q-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;text-decoration:none;color:var(--ink)}
.jbp-q-main:hover .jbp-q-t{text-decoration:underline}
.jbp-q-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.jbp-q-top b{font-size:14px;font-variant-numeric:tabular-nums}
.jbp-q-t{font-size:14px;font-weight:550}
.jbp-q-s{font-size:12.5px;color:var(--mut)}
.jbp-q-side{display:flex;align-items:center;gap:4px;flex-shrink:0}
.jbp-q-side b{font-size:15px}
.jbp-note{display:flex;flex-direction:column;align-items:flex-end;gap:8px;margin-bottom:14px}
.jbp-note .ak-field{min-height:64px!important}
.jbp-tl{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.jbp-tl li{position:relative;display:flex;align-items:flex-start;gap:12px;padding:8px 0 8px 2px}
.jbp-tl li:not(:last-child)::after{content:'';position:absolute;left:6px;top:24px;bottom:-6px;width:2px;background:var(--line)}
.jbp-dot{width:10px;height:10px;margin-top:5px;flex-shrink:0;border-radius:50%;background:#d4d4d8;box-shadow:0 0 0 3px var(--card,#fff)}
.jbp-tl li.t-quote_accepted .jbp-dot,.jbp-tl li.t-deposit_paid .jbp-dot{background:#22c55e}
.jbp-tl li.t-quote_declined .jbp-dot{background:#ef4444}
.jbp-tl li.t-quote_sent .jbp-dot,.jbp-tl li.t-quote_viewed .jbp-dot{background:#f59e0b}
.jbp-tl li.t-invoice_paid .jbp-dot,.jbp-tl li.t-invoice_payment .jbp-dot{background:#22c55e}
.jbp-tl li.t-invoice_sent .jbp-dot,.jbp-tl li.t-invoice_viewed .jbp-dot,.jbp-tl li.t-invoice_reminder .jbp-dot{background:#f59e0b}
.jbp-bill{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:16px 18px;border-radius:16px;background:color-mix(in srgb,var(--coral) 9%,var(--f))}
.jbp-bill b{display:block;font-size:15px}
.jbp-bill span{display:block;margin-top:3px;font-size:13px;color:var(--mut)}
.jbp-tl li.t-note .jbp-dot{background:var(--coral)}
.jbp-tl-s{display:block;font-size:14px;line-height:1.45;color:var(--ink)}
.jbp-tl-m{display:block;margin-top:2px;font-size:12px;color:var(--soft)}
.jbp-notecard{padding:10px 12px;border-radius:14px;background:var(--f)}
.jbp-del{width:30px;height:30px;opacity:.6}
.jbp-del:hover{opacity:1}
.jbp-cust{display:flex;flex-direction:column;gap:4px;font-size:14px}
.jbp-cust b{font-size:15px}
.jbp-cust a{color:var(--ink);overflow-wrap:anywhere}
.jbp-links{display:flex;flex-direction:column;gap:8px;font-size:14px}
.jbp-links a{display:inline-flex;align-items:center;gap:6px;color:var(--ink);font-weight:550;overflow-wrap:anywhere}
.jbp-value{font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:28px;font-weight:700;letter-spacing:-.035em}
.jbp-hits{display:flex;flex-direction:column;margin-top:6px;padding:4px;border-radius:14px;background:var(--f)}
.jbp-hits button{display:flex;flex-direction:column;align-items:flex-start;padding:8px 10px;border:none;border-radius:10px;background:none;font:inherit;text-align:left;cursor:pointer;color:var(--ink)}
.jbp-hits button:hover{background:var(--card,#fff)}
.jbp-hits span{font-size:12px;color:var(--mut)}
`
