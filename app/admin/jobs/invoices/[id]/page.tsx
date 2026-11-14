'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AdminPage, Panel } from '@/components/ui/AdminKit'
import DateTimeField from '@/components/ui/DateTimeField'
import { confirmDialog } from '@/components/ConfirmDialog'
import { api, useJobsCompany, InvoiceTag, fmtAgo, fmtDate, Dialog, useToast, Toast, SetupNote, Icon, JB_CSS, cacheKeys, readJobsCache, writeJobsCache } from '@/components/jobs/shared'
import { LineItems, AmountField, PriceListMenu, SendDialog, EDITOR_CSS, rowFrom, toLine, amountFrom, amountOut, newRow, rowFromPriceItem, type Row, type Amount } from '@/components/jobs/editor'
import { computeQuote, fmtMoney, inputToCents, centsToInput, MAX_LINES } from '@/lib/jobs/quote-math'
import { effectiveTaxRate } from '@/lib/jobs/settings'
import { fmtJobNumber } from '@/lib/jobs/status'

// The invoice editor. A draft saves itself as you type (the server works the
// totals out again on every save); once sent, the customer's copy is fixed:
// only the due date and reminders change, and payments are recorded against
// it. What's owing is the total, less a deposit already paid on the quote,
// less payments since (card payments land here by themselves).

const METHODS: [string, string][] = [['bank_transfer', 'Bank transfer'], ['cash', 'Cash'], ['card', 'Card (in person)'], ['cheque', 'Cheque'], ['other', 'Other']]
const METHOD_LABEL: Record<string, string> = Object.fromEntries(METHODS.map(([k, v]) => [k, k === 'card' ? 'Card' : v]))

export default function InvoiceEditorPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const { companyId, ready } = useJobsCompany()
  const seed = useRef<any>(companyId ? readJobsCache(cacheKeys.invoice(companyId, id)) : undefined)
  const si = seed.current?.invoice
  const [d, setD] = useState<any>(() => seed.current || null)
  const [err, setErr] = useState('')
  const [setup, setSetup] = useState('')
  const [toast, setToast] = useToast()

  const [rows, setRows] = useState<Row[]>(() => (Array.isArray(si?.items) ? si.items.map(rowFrom) : []))
  const [title, setTitle] = useState(() => si?.title || '')
  const [intro, setIntro] = useState(() => si?.intro || '')
  const [terms, setTerms] = useState(() => si?.terms || '')
  const [issueDate, setIssueDate] = useState(() => si?.issue_date || '')
  const [dueDate, setDueDate] = useState(() => si?.due_date || '')
  const [incl, setIncl] = useState(() => !!si?.prices_include_tax)
  const [discount, setDiscount] = useState<Amount>(() => (si ? amountFrom(si.discount_type, si.discount_value) : { type: 'none', input: '' }))
  const hydrated = useRef(false)
  const touched = useRef(false)
  const saveTimer = useRef<any>(null)
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle')
  const [send, setSend] = useState<null | 'send' | 'reminder'>(null)
  const [paying, setPaying] = useState(false)
  const [pickList, setPickList] = useState(false)
  const [busy, setBusy] = useState(false)

  const hydrate = (r: any) => {
    const v = r.invoice
    hydrated.current = false
    setRows((Array.isArray(v.items) ? v.items : []).map(rowFrom))
    setTitle(v.title || ''); setIntro(v.intro || ''); setTerms(v.terms || '')
    setIssueDate(v.issue_date || ''); setDueDate(v.due_date || '')
    setIncl(!!v.prices_include_tax); setDiscount(amountFrom(v.discount_type, v.discount_value))
  }
  const load = useCallback(async () => {
    if (!companyId) return
    try {
      const r = await api(`/api/jobs/invoices/${id}?companyId=${companyId}`)
      if (!touched.current || r.invoice?.status !== 'draft') hydrate(r)
      setD(r); setErr('')
      writeJobsCache(cacheKeys.invoice(companyId, id), r)
    } catch (e: any) { if (/COLVY_V4\d\d/.test(e.message)) setSetup(e.message); else setErr(e.message) }
  }, [companyId, id])
  useEffect(() => {
    if (!ready || !companyId) return
    if (!d) {
      const c = readJobsCache<any>(cacheKeys.invoice(companyId, id))
      if (c) { setD(c); hydrate(c) }
    }
    load()
  }, [ready, load]) // eslint-disable-line react-hooks/exhaustive-deps

  const inv = d?.invoice
  const draft = inv?.status === 'draft'
  const settings = d?.settings
  const taxRate = settings ? effectiveTaxRate(settings) : 10
  const gst = !!settings?.gst_registered && taxRate > 0
  const label = inv ? `${settings?.invoice_prefix || 'INV'}-${inv.number}` : ''

  const totals = useMemo(() => computeQuote({
    lines: draft ? rows.map(toLine) : (inv?.items || []),
    discount: draft ? amountOut(discount) : { type: inv?.discount_type, value: Number(inv?.discount_value || 0) },
    pricesIncludeTax: draft ? incl : !!inv?.prices_include_tax,
    taxRate: draft ? taxRate : Number(inv?.tax_rate ?? taxRate),
  }), [draft, rows, discount, incl, taxRate, inv])
  const credit = Math.min(Number(inv?.credit_cents || 0), totals.total_cents)
  const paid = Number(inv?.paid_cents || 0)
  const owing = Math.max(0, totals.total_cents - credit - paid)

  // ── Autosave (drafts) ──
  const save = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!d || d.invoice.status !== 'draft') return true
    clearTimeout(saveTimer.current)
    setSaveState('saving')
    try {
      const r = await api(`/api/jobs/invoices/${id}`, { method: 'PATCH', json: {
        companyId, title, intro, terms, issueDate: issueDate || null, dueDate: dueDate || null, pricesIncludeTax: incl,
        items: rows.map(toLine), discount: amountOut(discount),
      } })
      setD((x: any) => ({ ...x, invoice: { ...x.invoice, ...r.invoice } })); setSaveState('saved')
      return true
    } catch (e: any) {
      setSaveState('error'); if (!opts?.quiet) setToast(e.message)
      if (/sent|can’t be edited/i.test(e.message)) load()
      return false
    }
  }, [d, id, companyId, title, intro, terms, issueDate, dueDate, incl, rows, discount, setToast, load])
  useEffect(() => {
    if (!hydrated.current) { hydrated.current = true; return }
    if (!draft) return
    touched.current = true
    setSaveState('dirty')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { save({ quiet: true }) }, 1100)
    return () => clearTimeout(saveTimer.current)
  }, [rows, title, intro, terms, issueDate, dueDate, incl, discount]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (saveState === 'dirty' || saveState === 'saving') { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [saveState])

  const addRow = (r?: Partial<Row>) => setRows(rs => (rs.length >= MAX_LINES ? rs : [...rs, newRow(r)]))

  // ── Actions ──
  const act = async (action: string, extra: any = {}) => {
    setBusy(true)
    try { return await api(`/api/jobs/invoices/${id}/action`, { method: 'POST', json: { companyId, action, ...extra } }) }
    catch (e: any) { setToast(e.message); return null }
    finally { setBusy(false) }
  }
  const patchSent = async (patch: any, done: string) => {
    setBusy(true)
    try { const r = await api(`/api/jobs/invoices/${id}`, { method: 'PATCH', json: { companyId, ...patch } }); setD((x: any) => ({ ...x, invoice: { ...x.invoice, ...r.invoice } })); setToast(done); load() }
    catch (e: any) { setToast(e.message) } finally { setBusy(false) }
  }
  const voidIt = async () => {
    if (!(await confirmDialog({ title: `Void ${label}?`, message: 'The customer’s link will say it’s been cancelled, and reminders stop. This can’t be undone; make a new invoice if you need one.', confirmLabel: 'Void invoice', tone: 'danger' }))) return
    const r = await act('void'); if (r) { setToast('Invoice voided'); load() }
  }
  const delDraft = async () => {
    if (!(await confirmDialog({ title: `Delete draft ${label}?`, confirmLabel: 'Delete', tone: 'danger' }))) return
    try { await api(`/api/jobs/invoices/${id}?companyId=${companyId}`, { method: 'DELETE' }); router.push(`/admin/jobs/${inv.job_id}`) } catch (e: any) { setToast(e.message) }
  }
  const payLink = async () => {
    const r = await act('pay_link')
    if (r?.url) navigator.clipboard?.writeText(r.url).then(() => setToast('Card payment link copied')).catch(() => setToast(r.url))
  }
  const removePayment = async (p: any) => {
    if (!(await confirmDialog({ title: `Remove the ${fmtMoney(p.amount_cents)} payment?`, message: 'For a payment recorded by mistake. What’s owing goes back up.', confirmLabel: 'Remove', tone: 'danger' }))) return
    const r = await act('remove_payment', { paymentRowId: p.id }); if (r) { setToast('Payment removed'); load() }
  }
  const copyLink = () => { if (d?.url) navigator.clipboard?.writeText(d.url).then(() => setToast('Invoice link copied')).catch(() => setToast(d.url)) }

  const back = { href: inv ? `/admin/jobs/${inv.job_id}` : '/admin/jobs', label: d?.job ? `${fmtJobNumber(d.job.number, settings?.job_prefix || 'J')} ${d.job.title}` : 'Job' }
  if (setup) return <AdminPage title="Invoice" back={{ href: '/admin/jobs', label: 'Jobs' }}><style>{JB_CSS}</style><SetupNote text={setup} /></AdminPage>
  if (err && !d) return <AdminPage title="Invoice" back={{ href: '/admin/jobs', label: 'Jobs' }}><div className="ak-note bad">{err}</div></AdminPage>
  if (!inv) return <AdminPage title="Invoice" back={{ href: '/admin/jobs', label: 'Jobs' }} width="lg"><style>{JB_CSS}</style><div className="jb-two"><div className="ak-panel" style={{ height: 380 }} /><div className="ak-panel" style={{ height: 260 }} /></div></AdminPage>

  const lines = draft ? rows : (inv.items || []).map(rowFrom)
  const totalsByLine = new Map(totals.lines.map(l => [l.id, l.line_total_cents]))
  const open = inv.status === 'sent'
  const payments: any[] = d.payments || []
  const reminderLine = !open ? '' : !inv.reminders ? 'Reminders are off.'
    : !d.settings?.invoice_reminders ? 'Automatic reminders are off in Jobs settings.'
    : inv.reminder_count >= (d.reminderDays?.length || 3) ? 'All automatic reminders have been sent.'
    : `Automatic reminders go ${(d.reminderDays || [1, 7, 14]).slice(inv.reminder_count).map((n: number) => `${n} day${n === 1 ? '' : 's'}`).join(', ')} after the due date${inv.reminder_count ? ` (${inv.reminder_count} sent so far)` : ''}.`

  return (
    <AdminPage width="lg" back={back}
      title={<span className="qe-h">{label}<InvoiceTag status={inv.status} overdue={!!inv.overdue} /></span>}
      sub={d.contact ? `For ${d.contact.name || d.contact.phone || d.contact.email}` : 'No customer on this job yet'}
      actions={<>
        {draft && <span className={`qe-save ${saveState}`} aria-live="polite">{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'dirty' ? 'Unsaved' : saveState === 'error' ? 'Not saved' : ''}</span>}
        {draft && <button type="button" className="ak-btn go" onClick={async () => { if (await save()) setSend('send') }} disabled={busy || !rows.length}>{Icon.send}Send invoice</button>}
        {!draft && inv.status !== 'void' && d.url && <button type="button" className="ak-btn" onClick={copyLink}>{Icon.link}Copy link</button>}
        {open && <button type="button" className="ak-btn" onClick={() => setPaying(true)} disabled={busy}>Record payment</button>}
        {open && <button type="button" className="ak-btn go" onClick={() => setSend('reminder')}>{Icon.send}Send reminder</button>}
        {inv.status === 'paid' && <button type="button" className="ak-btn" onClick={() => setSend('send')}>{Icon.send}Send copy</button>}
      </>}>
      <style>{JB_CSS + EDITOR_CSS + PAGE_CSS}</style>

      {inv.status === 'paid' && <div className="ak-note good"><span><b>Paid in full</b>{inv.paid_at ? ` ${fmtAgo(inv.paid_at)}` : ''}. Thank you, nothing is owing.</span></div>}
      {inv.status === 'void' && <div className="ak-note"><span><b>Void.</b> {inv.void_reason ? `${inv.void_reason}. ` : ''}The customer’s link says it’s been cancelled.</span></div>}
      {open && <div className={`ak-note ${inv.overdue ? 'warn' : 'info'}`}><span><b>{inv.overdue ? `Overdue since ${fmtDate(inv.due_date)}` : `Due ${fmtDate(inv.due_date)}`}.</b> Sent {fmtAgo(inv.sent_at)}{inv.sent_via ? ` ${inv.sent_via === 'sms' ? 'by text' : inv.sent_via === 'email' ? 'by email' : 'as a link'}` : ''}{inv.viewed_at ? `, opened ${fmtAgo(inv.viewed_at)}` : ', not opened yet'}. {reminderLine}</span></div>}
      {draft && !d.paymentsReady && <div className="ak-note"><span>Card payments aren’t set up, so the customer will see your payment details below instead of a Pay button. Connect Stripe in Payments to take cards.</span></div>}

      <div className="jb-two">
        <div style={{ minWidth: 0 }}>
          <Panel>
            <div className="qe-grid2">
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="ak-label" htmlFor="iv-title">Invoice title</label>
                <input id="iv-title" className="ak-field" value={title} onChange={e => setTitle(e.target.value)} disabled={!draft} maxLength={160} placeholder="e.g. Switchboard upgrade" />
              </div>
              {(draft || intro) && <div style={{ gridColumn: '1 / -1' }}>
                <label className="ak-label" htmlFor="iv-intro">Message at the top <span className="jb-muted" style={{ fontWeight: 500 }}>(optional)</span></label>
                <textarea id="iv-intro" className="ak-field" rows={2} value={intro} onChange={e => setIntro(e.target.value)} disabled={!draft} maxLength={4000} placeholder="Thanks for choosing us. Here’s the invoice for the work we finished." />
              </div>}
            </div>
          </Panel>

          <Panel title="Items" right={draft && d.priceItems.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button type="button" className="ak-btn sm ghost" onClick={() => setPickList(o => !o)} aria-expanded={pickList}>Price list</button>
              {pickList && <PriceListMenu items={d.priceItems} onPick={it => { addRow(rowFromPriceItem(it)); setPickList(false) }} onClose={() => setPickList(false)} />}
            </div>
          )}>
            <LineItems rows={lines} setRows={setRows} draft={draft} gst={gst} totalsByLine={totalsByLine} emptyText="No items yet. Add the labour, materials and fees for the work done." />
          </Panel>

          {(draft || terms) && <Panel title="Payment details and notes" sub={draft ? 'Printed at the bottom: how else to pay (bank transfer details), and anything else they should know.' : undefined}>
            <textarea className="ak-field" rows={4} value={terms} onChange={e => setTerms(e.target.value)} disabled={!draft} maxLength={6000} aria-label="Payment details and notes" placeholder={'Bank transfer: BSB 000-000, account 00000000\nPlease use the invoice number as the reference.'} />
          </Panel>}
        </div>

        <aside className="jb-side">
          <Panel title="Summary">
            {gst && draft && (
              <div className="ak-seg qe-seg" role="group" aria-label="Prices">
                <button type="button" className={!incl ? 'on' : ''} onClick={() => setIncl(false)}>Excl. GST</button>
                <button type="button" className={incl ? 'on' : ''} onClick={() => setIncl(true)}>Incl. GST</button>
              </div>
            )}
            <dl className="qe-tot">
              {totals.discount_cents > 0 && <><dt>Items</dt><dd className="jb-num">{fmtMoney(totals.gross_cents)}</dd><dt>Discount</dt><dd className="jb-num">−{fmtMoney(totals.discount_cents)}</dd></>}
              <dt>Subtotal{gst ? ' (excl. GST)' : ''}</dt><dd className="jb-num">{fmtMoney(totals.subtotal_cents)}</dd>
              {gst && <><dt>GST ({Number(draft ? taxRate : inv.tax_rate)}%)</dt><dd className="jb-num">{fmtMoney(totals.tax_cents)}</dd></>}
              <dt className="mid">Total{gst ? ' (incl. GST)' : ''}</dt><dd className="mid jb-num">{fmtMoney(totals.total_cents)}</dd>
              {credit > 0 && <><dt>{inv.credit_label || 'Deposit paid'}</dt><dd className="jb-num">−{fmtMoney(credit)}</dd></>}
              {paid > 0 && <><dt>Paid</dt><dd className="jb-num">−{fmtMoney(paid)}</dd></>}
              <dt className="big">{inv.status === 'paid' ? 'Owing' : 'Amount due'}</dt><dd className="big jb-num">{fmtMoney(inv.status === 'void' ? 0 : owing)}</dd>
            </dl>
            {draft && credit > 0 && <button type="button" className="iv-link" onClick={async () => { if (await confirmDialog({ title: 'Don’t take the deposit off?', message: 'Only if the deposit was already taken off another invoice, or refunded.', confirmLabel: 'Remove it' })) { try { await api(`/api/jobs/invoices/${id}`, { method: 'PATCH', json: { companyId, removeCredit: true } }); load() } catch (e: any) { setToast(e.message) } } }}>Don’t take the deposit off</button>}
            {draft && (
              <div className="qe-opts">
                <AmountField label="Discount" value={discount} onChange={setDiscount} />
              </div>
            )}
          </Panel>

          <Panel title="Dates and reminders">
            <div className="iv-dates">
              <div>
                <span className="ak-label">Invoice date</span>
                {draft ? <DateTimeField label="Invoice date" mode="date" value={issueDate} onChange={setIssueDate} placeholder="Today when sent" /> : <p className="iv-ro">{fmtDate(inv.issue_date) || '—'}</p>}
              </div>
              <div>
                <span className="ak-label">Due date</span>
                {draft ? <DateTimeField label="Due date" mode="date" value={dueDate} onChange={setDueDate} min={issueDate || d.today} placeholder={`${settings?.payment_terms_days ?? 7} days after it’s sent`} />
                  : open ? <DateTimeField label="Due date" mode="date" value={inv.due_date || ''} onChange={v => v && v !== inv.due_date && patchSent({ dueDate: v }, 'Due date changed')} min={inv.issue_date || undefined} />
                  : <p className="iv-ro">{fmtDate(inv.due_date) || '—'}</p>}
              </div>
            </div>
            {inv.status !== 'void' && inv.status !== 'paid' && (
              <label className="iv-toggle">
                <input type="checkbox" checked={!!inv.reminders} onChange={e => patchSent({ reminders: e.target.checked }, e.target.checked ? 'Reminders on' : 'Reminders off')} disabled={busy} />
                <span><b>Chase it if it’s late</b><small>Text the customer 1, 7 and 14 days after the due date until it’s paid.</small></span>
              </label>
            )}
          </Panel>

          {!draft && inv.status !== 'void' && (
            <Panel title="Payments" right={open && <button type="button" className="ak-btn sm" onClick={() => setPaying(true)}>{Icon.plus}Record</button>}>
              {!payments.length ? <p className="ak-hint" style={{ margin: 0 }}>{d.paymentsReady ? 'Nothing yet. Card payments through the invoice link show here by themselves.' : 'Nothing yet. Record cash and bank transfers here.'}</p> : (
                <div className="iv-pays">
                  {payments.map(p => (
                    <div key={p.id} className="iv-pay">
                      <div style={{ minWidth: 0 }}>
                        <b>{fmtMoney(p.amount_cents)}</b>
                        <small>{METHOD_LABEL[p.method] || 'Payment'}{p.payment_id ? ' · online' : ''} · {fmtDate(p.paid_on || String(p.created_at).slice(0, 10))}{p.recorded_by_name && !p.payment_id ? ` · ${p.recorded_by_name}` : ''}{p.note ? ` · ${p.note}` : ''}</small>
                      </div>
                      {!p.payment_id && <button type="button" className="ak-icon-btn danger qe-sm" onClick={() => removePayment(p)} aria-label="Remove payment" title="Remove (recorded by mistake)">{Icon.trash}</button>}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}

          <Panel title="More">
            <div className="qe-more">
              {d.url && <a className="ak-btn sm" href={`${d.url}?preview=1`} target="_blank" rel="noreferrer">{Icon.ext}Customer view</a>}
              {open && d.paymentsReady && owing >= 50 && <button type="button" className="ak-btn sm" onClick={payLink} disabled={busy}>Copy card payment link</button>}
              {(open || inv.status === 'paid') && paid === 0 && <button type="button" className="ak-btn sm danger" onClick={voidIt} disabled={busy}>Void invoice</button>}
              {draft && <button type="button" className="ak-btn sm danger" onClick={delDraft}>{Icon.trash}Delete draft</button>}
            </div>
          </Panel>
        </aside>
      </div>

      {send && <SendDialog endpoint={`/api/jobs/invoices/${inv.id}/send`} companyId={companyId} noun="invoice"
        title={send === 'reminder' ? 'Send a reminder' : draft ? 'Send invoice' : 'Send invoice again'}
        extra={send === 'reminder' ? { reminder: true } : undefined} linkHint="Keep the link in the message: it’s how they open and pay the invoice."
        contact={d.contact} conversation={d.conversation} onClose={() => setSend(null)}
        onSent={(r: any) => { setSend(null); setToast(r.warning ? r.warning : r.channel === 'link' ? 'Invoice marked as sent. Link copied.' : send === 'reminder' ? 'Reminder sent' : 'Invoice sent'); load() }} />}
      {paying && <RecordPayment owing={owing} today={d.today} onClose={() => setPaying(false)} busy={busy}
        onSave={async (p) => { const r = await act('record_payment', p); if (r) { setPaying(false); setToast(r.just_paid ? 'Paid in full' : `Recorded. ${fmtMoney(r.balance_cents)} still owing.`); load() } }} />}
      <Toast text={toast} />
    </AdminPage>
  )
}

function RecordPayment({ owing, today, busy, onClose, onSave }: { owing: number; today: string; busy: boolean; onClose: () => void; onSave: (p: { amount: string; method: string; note: string; paidOn: string }) => void }) {
  const [amount, setAmount] = useState(centsToInput(owing))
  const [method, setMethod] = useState('bank_transfer')
  const [note, setNote] = useState('')
  const [paidOn, setPaidOn] = useState(today)
  const cents = inputToCents(amount)
  const tooMuch = cents > owing
  return (
    <Dialog title="Record a payment" onClose={onClose} width={460} footer={<>
      <button type="button" className="ak-btn ghost" onClick={onClose}>Cancel</button>
      <button type="button" className="ak-btn go" onClick={() => onSave({ amount, method, note, paidOn })} disabled={busy || !cents || tooMuch}>{busy ? 'Saving…' : cents === owing ? 'Mark as paid' : 'Record payment'}</button>
    </>}>
      <p className="ak-hint" style={{ margin: 0 }}>For money paid another way: cash, a bank transfer, a card at the job. Card payments through the invoice link are recorded by themselves. {fmtMoney(owing)} is owing.</p>
      <div className="qe-grid2">
        <div>
          <label className="ak-label" htmlFor="rp-amt">Amount</label>
          <div className="qe-money"><span>$</span><input id="rp-amt" className="ak-field qe-n" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} onBlur={() => setAmount(centsToInput(inputToCents(amount)))} inputMode="decimal" /></div>
        </div>
        <div>
          <label className="ak-label" htmlFor="rp-m">How they paid</label>
          <select id="rp-m" className="ak-select" value={method} onChange={e => setMethod(e.target.value)}>{METHODS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </div>
      </div>
      <div><span className="ak-label">Paid on</span><DateTimeField label="Paid on" mode="date" value={paidOn} onChange={setPaidOn} clearable={false} /></div>
      <div><label className="ak-label" htmlFor="rp-n">Note <span className="jb-muted" style={{ fontWeight: 500 }}>(optional)</span></label><input id="rp-n" className="ak-field" value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="e.g. Transfer reference" /></div>
      {tooMuch && <div className="ak-note bad" role="alert">That’s more than the {fmtMoney(owing)} owing.</div>}
    </Dialog>
  )
}

const PAGE_CSS = `
.qe-tot .mid{padding-top:8px;box-shadow:0 -1px 0 var(--line);font-weight:650;color:var(--ink)}
.iv-link{margin-top:10px;padding:0;border:none;background:none;font:inherit;font-size:13px;font-weight:600;color:var(--mut);text-decoration:underline;cursor:pointer}
.iv-dates{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}
.iv-ro{margin:4px 0 0;font-size:14.5px;font-weight:600}
.iv-toggle{display:flex;align-items:flex-start;gap:10px;margin-top:14px;padding-top:14px;box-shadow:0 -1px 0 var(--line);cursor:pointer}
.iv-toggle input{width:18px;height:18px;margin-top:2px;flex-shrink:0;accent-color:var(--coral)}
.iv-toggle b{display:block;font-size:14px}
.iv-toggle small{display:block;margin-top:2px;font-size:12.5px;color:var(--mut);line-height:1.45}
.iv-pays{display:flex;flex-direction:column}
.iv-pay{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0}
.iv-pay+.iv-pay{box-shadow:0 -1px 0 var(--line)}
.iv-pay b{font-size:14.5px}
.iv-pay small{display:block;margin-top:2px;font-size:12.5px;color:var(--mut);overflow-wrap:anywhere}
`
