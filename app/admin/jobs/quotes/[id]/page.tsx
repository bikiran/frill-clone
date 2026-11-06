'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AdminPage, Panel } from '@/components/ui/AdminKit'
import DateTimeField from '@/components/ui/DateTimeField'
import { confirmDialog } from '@/components/ConfirmDialog'
import { api, useJobsCompany, QuoteTag, fmtAgo, fmtDate, Dialog, useToast, Toast, SetupNote, Icon, JB_CSS } from '@/components/jobs/shared'
import { computeQuote, centsToInput, inputToCents, fmtMoney, LINE_KINDS, LINE_KIND_LABEL, MAX_LINES, type LineKind } from '@/lib/jobs/quote-math'
import { effectiveTaxRate } from '@/lib/jobs/settings'
import { fmtJobNumber, fmtQuoteNumber } from '@/lib/jobs/status'

// The quote editor. Drafts save themselves as you type (the server works the
// totals out again on every save); a sent quote is read-only, and changing it
// means a revision. Totals here are only a preview of the server's sums.

type Row = { id: string; kind: LineKind; description: string; qty: string; unit: string; price: string; taxable: boolean }
type Amount = { type: 'none' | 'fixed' | 'percent'; input: string }

const rowFrom = (l: any): Row => ({ id: String(l.id || rid()), kind: l.kind || 'labour', description: l.description || '', qty: String(l.quantity ?? 1), unit: l.unit || 'each', price: centsToInput(l.unit_price_cents || 0), taxable: l.taxable !== false })
const rid = () => `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const toLine = (r: Row) => ({ id: r.id, kind: r.kind, description: r.description, quantity: Number(r.qty) || 0, unit: r.unit, unit_price_cents: inputToCents(r.price), taxable: r.taxable })
const amountFrom = (type: any, value: any): Amount => ({ type: type === 'fixed' || type === 'percent' ? type : 'none', input: type === 'fixed' ? centsToInput(Number(value) || 0) : type === 'percent' ? String(Number(value) || 0) : '' })
const amountOut = (a: Amount) => ({ type: a.type, value: a.type === 'fixed' ? inputToCents(a.input) : a.type === 'percent' ? Number(a.input) || 0 : 0 })

export default function QuoteEditorPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const { companyId, ready } = useJobsCompany()
  const [d, setD] = useState<any>(null)
  const [err, setErr] = useState('')
  const [setup, setSetup] = useState('')
  const [toast, setToast] = useToast()

  // Draft fields
  const [rows, setRows] = useState<Row[]>([])
  const [title, setTitle] = useState('')
  const [intro, setIntro] = useState('')
  const [terms, setTerms] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [incl, setIncl] = useState(false)
  const [discount, setDiscount] = useState<Amount>({ type: 'none', input: '' })
  const [deposit, setDeposit] = useState<Amount>({ type: 'none', input: '' })
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle')
  const hydrated = useRef(false)
  const saveTimer = useRef<any>(null)

  const [showSend, setShowSend] = useState(false)
  const [showDecide, setShowDecide] = useState<null | 'accept' | 'decline'>(null)
  const [showTpl, setShowTpl] = useState(false)
  const [pickList, setPickList] = useState(false)
  const [busy, setBusy] = useState(false)

  const hydrate = (r: any) => {
    const q = r.quote
    // These setters land in one render, which the autosave effect skips.
    hydrated.current = false
    setRows((Array.isArray(q.items) ? q.items : []).map(rowFrom))
    setTitle(q.title || ''); setIntro(q.intro || ''); setTerms(q.terms || ''); setValidUntil(q.valid_until || '')
    setIncl(!!q.prices_include_tax)
    setDiscount(amountFrom(q.discount_type, q.discount_value)); setDeposit(amountFrom(q.deposit_type, q.deposit_value))
  }
  const load = useCallback(async () => {
    if (!companyId) return
    try {
      const r = await api(`/api/jobs/quotes/${id}?companyId=${companyId}`)
      setD(r); hydrate(r); setErr('')
    } catch (e: any) { if (/COLVY_V427/.test(e.message)) setSetup(e.message); else setErr(e.message) }
  }, [companyId, id])
  useEffect(() => { if (ready) load() }, [ready, load])

  const q = d?.quote
  const draft = q?.status === 'draft'
  const settings = d?.settings
  const taxRate = settings ? effectiveTaxRate(settings) : 10
  const gst = !!settings?.gst_registered && taxRate > 0
  const qpf = settings?.quote_prefix || 'Q'
  const label = q ? fmtQuoteNumber(q.number, q.revision, qpf) : ''

  // Live totals (a preview; the server recomputes on save).
  const totals = useMemo(() => computeQuote({
    lines: draft ? rows.map(toLine) : (q?.items || []),
    discount: draft ? amountOut(discount) : { type: q?.discount_type, value: Number(q?.discount_value || 0) },
    deposit: draft ? amountOut(deposit) : { type: q?.deposit_type, value: Number(q?.deposit_value || 0) },
    pricesIncludeTax: draft ? incl : !!q?.prices_include_tax,
    taxRate: draft ? taxRate : Number(q?.tax_rate ?? taxRate),
  }), [draft, rows, discount, deposit, incl, taxRate, q])

  // ── Autosave ──
  const save = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!d || d.quote.status !== 'draft') return true
    clearTimeout(saveTimer.current)
    setSaveState('saving')
    try {
      const r = await api(`/api/jobs/quotes/${id}`, { method: 'PATCH', json: {
        companyId, title, intro, terms, validUntil: validUntil || null, pricesIncludeTax: incl,
        items: rows.map(toLine), discount: amountOut(discount), deposit: amountOut(deposit),
      } })
      setD((x: any) => ({ ...x, quote: r.quote })); setSaveState('saved')
      return true
    } catch (e: any) {
      setSaveState('error'); if (!opts?.quiet) setToast(e.message)
      if (/sent|can’t be edited/i.test(e.message)) load()
      return false
    }
  }, [d, id, companyId, title, intro, terms, validUntil, incl, rows, discount, deposit, setToast, load])
  useEffect(() => {
    if (!hydrated.current) { hydrated.current = true; return }
    if (!draft) return
    setSaveState('dirty')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { save({ quiet: true }) }, 1100)
    return () => clearTimeout(saveTimer.current)
  }, [rows, title, intro, terms, validUntil, incl, discount, deposit]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (saveState === 'dirty' || saveState === 'saving') { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [saveState])

  // ── Lines ──
  const setRow = (i: number, patch: Partial<Row>) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const addRow = (r?: Partial<Row>) => setRows(rs => (rs.length >= MAX_LINES ? rs : [...rs, { id: rid(), kind: 'labour', description: '', qty: '1', unit: 'each', price: '0.00', taxable: true, ...r }]))
  const removeRow = (i: number) => setRows(rs => rs.filter((_, j) => j !== i))
  const moveRow = (i: number, dir: -1 | 1) => setRows(rs => { const j = i + dir; if (j < 0 || j >= rs.length) return rs; const c = rs.slice(); [c[i], c[j]] = [c[j], c[i]]; return c })

  // ── Actions ──
  const act = async (action: string, extra: any = {}) => {
    setBusy(true)
    try { return await api(`/api/jobs/quotes/${id}/action`, { method: 'POST', json: { companyId, action, ...extra } }) }
    catch (e: any) { setToast(e.message); return null }
    finally { setBusy(false) }
  }
  const withdraw = async () => {
    if (!(await confirmDialog({ title: `Withdraw ${label}?`, message: 'The customer’s link will say it’s no longer available. You can start a revision afterwards.', confirmLabel: 'Withdraw', tone: 'danger' }))) return
    const r = await act('withdraw'); if (r) { setToast('Quote withdrawn'); load() }
  }
  const revise = async () => {
    setBusy(true)
    try { const r = await api('/api/jobs/quotes', { method: 'POST', json: { companyId, jobId: q.job_id, reviseOf: q.id } }); router.push(`/admin/jobs/quotes/${r.quote.id}`) }
    catch (e: any) { setToast(e.message); setBusy(false) }
  }
  const depositLink = async () => {
    const r = await act('deposit_link')
    if (r?.url) navigator.clipboard?.writeText(r.url).then(() => setToast('Deposit payment link copied')).catch(() => setToast(r.url))
  }
  const delDraft = async () => {
    if (!(await confirmDialog({ title: `Delete draft ${label}?`, confirmLabel: 'Delete', tone: 'danger' }))) return
    try { await api(`/api/jobs/quotes/${id}?companyId=${companyId}`, { method: 'DELETE' }); router.push(`/admin/jobs/${q.job_id}`) } catch (e: any) { setToast(e.message) }
  }
  const copyLink = () => { if (d?.url) navigator.clipboard?.writeText(d.url).then(() => setToast('Quote link copied')).catch(() => setToast(d.url)) }
  const applyTemplate = async (t: any) => {
    setShowTpl(false)
    if (rows.some(r => r.description || inputToCents(r.price) > 0)) {
      if (!(await confirmDialog({ title: `Use “${t.name}”?`, message: 'Its lines replace the ones on this quote.', confirmLabel: 'Use template' }))) return
    }
    setRows((t.items || []).map((l: any) => rowFrom({ ...l, id: rid() })))
    if (t.title) setTitle(t.title)
    if (t.intro) setIntro(t.intro)
    if (t.terms) setTerms(t.terms)
    if (t.discount_type && t.discount_type !== 'none') setDiscount(amountFrom(t.discount_type, t.discount_value))
    if (t.deposit_type && t.deposit_type !== 'none') setDeposit(amountFrom(t.deposit_type, t.deposit_value))
  }
  const saveAsTemplate = async () => {
    const name = window.document.getElementById('qt-tplname') as HTMLInputElement | null
    if (draft) await save({ quiet: true })
    const r = await act('save_template', { name: name?.value || title })
    if (r?.template) { setToast(`Saved as template “${r.template.name}”`); setShowTpl(false) }
  }

  if (setup) return <AdminPage title="Quote" back={{ href: '/admin/jobs', label: 'Jobs' }}><style>{JB_CSS}</style><SetupNote text={setup} /></AdminPage>
  if (err && !d) return <AdminPage title="Quote" back={{ href: '/admin/jobs', label: 'Jobs' }}><div className="ak-note bad">{err}</div></AdminPage>
  if (!q) return <AdminPage title="Quote" back={{ href: '/admin/jobs', label: 'Jobs' }} width="lg"><style>{JB_CSS}</style><div className="jb-two"><div className="ak-panel" style={{ height: 380 }} /><div className="ak-panel" style={{ height: 260 }} /></div></AdminPage>

  const expired = q.status === 'sent' && q.valid_until && d.today && q.valid_until < d.today
  const lines = draft ? rows : (q.items || []).map(rowFrom)
  const totalsByLine = new Map(totals.lines.map(l => [l.id, l.line_total_cents]))

  return (
    <AdminPage width="lg" back={{ href: `/admin/jobs/${q.job_id}`, label: d.job ? `${fmtJobNumber(d.job.number, settings?.job_prefix || 'J')} ${d.job.title}` : 'Job' }}
      title={<span className="qe-h">{label}<QuoteTag status={q.status} expired={!!expired} /></span>}
      sub={d.contact ? `For ${d.contact.name || d.contact.phone || d.contact.email}` : 'No customer on this job yet'}
      actions={<>
        {draft && <span className={`qe-save ${saveState}`} aria-live="polite">{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'dirty' ? 'Unsaved' : saveState === 'error' ? 'Not saved' : ''}</span>}
        {draft && <button type="button" className="ak-btn go" onClick={async () => { if (await save()) setShowSend(true) }} disabled={busy || !rows.length}>{Icon.send}Send quote</button>}
        {q.status === 'sent' && <button type="button" className="ak-btn" onClick={copyLink}>{Icon.link}Copy link</button>}
        {q.status === 'sent' && <button type="button" className="ak-btn go" onClick={() => setShowSend(true)}>{Icon.send}Send again</button>}
        {q.status !== 'draft' && <button type="button" className="ak-btn" onClick={revise} disabled={busy}>Revise</button>}
      </>}>
      <style>{JB_CSS + PAGE_CSS}</style>

      {q.status === 'accepted' && <div className="ak-note good"><span><b>Accepted</b> {fmtAgo(q.accepted_at)}{q.decided_name ? ` by ${q.decided_name}` : ''}{q.decided_by_type === 'staff' ? ' (recorded by the team)' : ''}.{q.deposit_cents > 0 ? (q.deposit_status === 'paid' ? ` Deposit of ${fmtMoney(q.deposit_cents)} paid.` : ` Deposit of ${fmtMoney(q.deposit_cents)} not paid yet.`) : ''}</span></div>}
      {q.status === 'declined' && <div className="ak-note bad"><span><b>Declined</b> {fmtAgo(q.declined_at)}{q.decided_note ? `: “${q.decided_note}”` : ''}. Start a revision to send a new version.</span></div>}
      {q.status === 'withdrawn' && <div className="ak-note"><span><b>Withdrawn.</b> The customer can no longer accept it.</span></div>}
      {q.status === 'sent' && <div className={`ak-note ${expired ? 'warn' : 'info'}`}><span><b>{expired ? 'Expired' : 'Waiting for the customer'}.</b> Sent {fmtAgo(q.sent_at)}{q.sent_via ? ` ${q.sent_via === 'sms' ? 'by text' : q.sent_via === 'email' ? 'by email' : 'as a link'}` : ''}{q.viewed_at ? `, opened ${fmtAgo(q.viewed_at)}` : ', not opened yet'}. To change it, start a revision.</span></div>}

      <div className="jb-two">
        <div style={{ minWidth: 0 }}>
          <Panel>
            <div className="qe-grid2">
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="ak-label" htmlFor="qt-title">Quote title</label>
                <input id="qt-title" className="ak-field" value={title} onChange={e => setTitle(e.target.value)} disabled={!draft} maxLength={160} placeholder="e.g. Switchboard upgrade" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="ak-label" htmlFor="qt-intro">Message at the top <span className="jb-muted" style={{ fontWeight: 500 }}>(optional)</span></label>
                <textarea id="qt-intro" className="ak-field" rows={2} value={intro} onChange={e => setIntro(e.target.value)} disabled={!draft} maxLength={4000} placeholder="Thanks for having us out. Here’s what we’ll do…" />
              </div>
            </div>
          </Panel>

          <Panel title="Items" right={draft && (
            <div style={{ display: 'flex', gap: 6, position: 'relative' }}>
              {d.priceItems.length > 0 && <button type="button" className="ak-btn sm ghost" onClick={() => setPickList(o => !o)} aria-expanded={pickList}>Price list</button>}
              <button type="button" className="ak-btn sm ghost" onClick={() => setShowTpl(true)}>Templates</button>
              {pickList && <PriceListMenu items={d.priceItems} onPick={it => { addRow({ kind: it.kind, description: it.name, unit: it.unit, price: centsToInput(it.unit_price_cents), taxable: it.taxable, qty: '1' }); setPickList(false) }} onClose={() => setPickList(false)} />}
            </div>
          )}>
            <div className={`qe-lines${draft ? '' : ' ro'}`}>
              <div className="qe-lh" aria-hidden>
                <span>Item</span><span>Qty</span><span>Unit</span><span>Price</span>{gst && <span>GST</span>}<span style={{ textAlign: 'right' }}>Total</span><span />
              </div>
              {lines.map((r: Row, i: number) => (
                <div key={r.id} className="qe-line">
                  <div className="qe-desc">
                    <select className="ak-select sm qe-kind" value={r.kind} onChange={e => setRow(i, { kind: e.target.value as LineKind })} disabled={!draft} aria-label="Type">
                      {LINE_KINDS.map(k => <option key={k} value={k}>{LINE_KIND_LABEL[k]}</option>)}
                    </select>
                    <input className="ak-field sm" value={r.description} onChange={e => setRow(i, { description: e.target.value })} disabled={!draft} placeholder="Description" maxLength={300} aria-label="Description" />
                  </div>
                  <input className="ak-field sm qe-n" value={r.qty} onChange={e => setRow(i, { qty: e.target.value.replace(/[^0-9.]/g, '') })} disabled={!draft} inputMode="decimal" aria-label="Quantity" />
                  <input className="ak-field sm" value={r.unit} onChange={e => setRow(i, { unit: e.target.value })} disabled={!draft} maxLength={20} aria-label="Unit" placeholder="each" />
                  <div className="qe-money"><span>$</span><input className="ak-field sm qe-n" value={r.price} onChange={e => setRow(i, { price: e.target.value.replace(/[^0-9.]/g, '') })} onBlur={() => setRow(i, { price: centsToInput(inputToCents(r.price)) })} disabled={!draft} inputMode="decimal" aria-label="Unit price" /></div>
                  {gst && <label className="qe-gst" title={r.taxable ? 'GST applies' : 'GST-free'}><input type="checkbox" checked={r.taxable} onChange={e => setRow(i, { taxable: e.target.checked })} disabled={!draft} /><span>{r.taxable ? 'GST' : 'Free'}</span></label>}
                  <b className="qe-lt jb-num">{fmtMoney(totalsByLine.get(r.id) ?? 0)}</b>
                  {draft ? (
                    <div className="qe-row-acts">
                      <button type="button" className="ak-icon-btn qe-sm" onClick={() => moveRow(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                      <button type="button" className="ak-icon-btn danger qe-sm" onClick={() => removeRow(i)} aria-label="Remove line">{Icon.trash}</button>
                    </div>
                  ) : <span />}
                </div>
              ))}
              {!lines.length && <div className="qe-empty">No items yet. Add labour, materials, travel or fees.</div>}
            </div>
            {draft && <button type="button" className="ak-btn sm" onClick={() => addRow()} disabled={rows.length >= MAX_LINES} style={{ marginTop: 10 }}>{Icon.plus}Add item</button>}
          </Panel>

          <Panel title="Terms">
            <textarea className="ak-field" rows={4} value={terms} onChange={e => setTerms(e.target.value)} disabled={!draft} maxLength={6000} aria-label="Terms" />
          </Panel>
        </div>

        <aside className="jb-side">
          <Panel title="Summary">
            {gst && (
              <div className="ak-seg qe-seg" role="group" aria-label="Prices">
                <button type="button" className={!(draft ? incl : q.prices_include_tax) ? 'on' : ''} onClick={() => draft && setIncl(false)} disabled={!draft}>Excl. GST</button>
                <button type="button" className={(draft ? incl : q.prices_include_tax) ? 'on' : ''} onClick={() => draft && setIncl(true)} disabled={!draft}>Incl. GST</button>
              </div>
            )}
            <dl className="qe-tot">
              {totals.discount_cents > 0 && <><dt>Items</dt><dd className="jb-num">{fmtMoney(totals.gross_cents)}</dd><dt>Discount</dt><dd className="jb-num">−{fmtMoney(totals.discount_cents)}</dd></>}
              <dt>Subtotal{gst ? ' (excl. GST)' : ''}</dt><dd className="jb-num">{fmtMoney(totals.subtotal_cents)}</dd>
              {gst && <><dt>GST ({Number(draft ? taxRate : q.tax_rate)}%)</dt><dd className="jb-num">{fmtMoney(totals.tax_cents)}</dd></>}
              <dt className="big">Total{gst ? ' (incl. GST)' : ''}</dt><dd className="big jb-num">{fmtMoney(totals.total_cents)}</dd>
              {totals.deposit_cents > 0 && <><dt>Deposit to confirm</dt><dd className="jb-num">{fmtMoney(totals.deposit_cents)}</dd></>}
            </dl>
            {!gst && <p className="ak-hint" style={{ margin: '8px 0 0' }}>No GST: the business isn’t set as registered for GST (Quote Settings).</p>}

            {draft && (
              <div className="qe-opts">
                <AmountField label="Discount" value={discount} onChange={setDiscount} />
                <AmountField label="Deposit" value={deposit} onChange={setDeposit} hint={!d.paymentsReady && deposit.type !== 'none' ? 'Card payments aren’t set up, so the customer can’t pay the deposit online yet.' : undefined} />
                <div>
                  <span className="ak-label">Valid until</span>
                  <DateTimeField label="Valid until" mode="date" value={validUntil} onChange={setValidUntil} min={d.today} placeholder="No expiry" />
                </div>
              </div>
            )}
            {!draft && q.valid_until && <p className="ak-hint" style={{ margin: '10px 0 0' }}>Valid until {fmtDate(q.valid_until)}</p>}
          </Panel>

          <Panel title="More">
            <div className="qe-more">
              {d.url && <a className="ak-btn sm" href={`${d.url}?preview=1`} target="_blank" rel="noreferrer">{Icon.ext}Customer view</a>}
              {q.status === 'sent' && <>
                <button type="button" className="ak-btn sm" onClick={() => setShowDecide('accept')}>Record as accepted</button>
                <button type="button" className="ak-btn sm" onClick={() => setShowDecide('decline')}>Record as declined</button>
                <button type="button" className="ak-btn sm danger" onClick={withdraw} disabled={busy}>Withdraw</button>
              </>}
              {(q.status === 'sent' || q.status === 'accepted') && q.deposit_cents > 0 && q.deposit_status !== 'paid' && d.paymentsReady && (
                <button type="button" className="ak-btn sm" onClick={depositLink} disabled={busy}>Copy deposit link</button>
              )}
              <button type="button" className="ak-btn sm" onClick={() => setShowTpl(true)}>Save as template</button>
              {draft && <button type="button" className="ak-btn sm danger" onClick={delDraft}>{Icon.trash}Delete draft</button>}
            </div>
          </Panel>
        </aside>
      </div>

      {showSend && <SendDialog companyId={companyId} quote={q} contact={d.contact} conversation={d.conversation} onClose={() => setShowSend(false)}
        onSent={(r: any) => { setShowSend(false); setToast(r.warning ? r.warning : r.channel === 'link' ? 'Quote marked as sent. Link copied.' : 'Quote sent'); load() }} />}
      {showDecide && <DecideDialog kind={showDecide} contactName={d.contact?.name || ''} onClose={() => setShowDecide(null)}
        onDone={async (name, note) => { const r = await act(showDecide, { name, note }); if (r) { setShowDecide(null); setToast(showDecide === 'accept' ? 'Recorded as accepted' : 'Recorded as declined'); load() } }} />}
      {showTpl && <TemplatesDialog companyId={companyId} draft={draft} defaultName={title} onApply={applyTemplate} onSave={saveAsTemplate} onClose={() => setShowTpl(false)} busy={busy} />}
      <Toast text={toast} />
    </AdminPage>
  )
}

function AmountField({ label, value, onChange, hint }: { label: string; value: Amount; onChange: (a: Amount) => void; hint?: string }) {
  return (
    <div>
      <span className="ak-label">{label}</span>
      <div className="qe-amt">
        <select className="ak-select sm" value={value.type} onChange={e => onChange({ type: e.target.value as Amount['type'], input: e.target.value === 'none' ? '' : value.input || '0' })} aria-label={`${label} type`}>
          <option value="none">None</option><option value="fixed">Amount ($)</option><option value="percent">Percent (%)</option>
        </select>
        {value.type !== 'none' && <input className="ak-field sm qe-n" value={value.input} onChange={e => onChange({ ...value, input: e.target.value.replace(/[^0-9.]/g, '') })} inputMode="decimal" aria-label={`${label} ${value.type === 'fixed' ? 'amount' : 'percent'}`} />}
      </div>
      {hint && <p className="ak-hint">{hint}</p>}
    </div>
  )
}

function PriceListMenu({ items, onPick, onClose }: { items: any[]; onPick: (it: any) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [onClose])
  const shown = items.filter(i => !q || `${i.name} ${i.description || ''}`.toLowerCase().includes(q.toLowerCase())).slice(0, 40)
  return (
    <div ref={ref} className="jb-menu qe-pl" role="dialog" aria-label="Price list" style={{ right: 0, top: 38 }}>
      <input className="ak-field sm" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search the price list" aria-label="Search the price list" />
      <div className="qe-pl-list">
        {shown.map(i => (
          <button key={i.id} type="button" onClick={() => onPick(i)}>
            <span style={{ minWidth: 0 }}><b>{i.name}</b><small>{LINE_KIND_LABEL[i.kind as LineKind] || i.kind} · per {i.unit}{i.taxable ? '' : ' · GST-free'}</small></span>
            <b className="jb-num">{fmtMoney(i.unit_price_cents)}</b>
          </button>
        ))}
        {!shown.length && <div className="jb-menu-l">Nothing matches</div>}
      </div>
    </div>
  )
}

function SendDialog({ companyId, quote, contact, conversation, onClose, onSent }: { companyId: string; quote: any; contact: any; conversation: any; onClose: () => void; onSent: (r: any) => void }) {
  const [channel, setChannel] = useState<'sms' | 'email' | 'link'>(contact?.phone ? 'sms' : contact?.email ? 'email' : 'link')
  const [to, setTo] = useState('')
  const [message, setMessage] = useState('')
  const [subject, setSubject] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    let live = true
    api(`/api/jobs/quotes/${quote.id}/send`, { method: 'POST', json: { companyId, channel, preview: true } })
      .then(r => { if (!live) return; setTo(r.to || ''); setMessage(r.message || ''); setSubject(r.subject || ''); setUrl(r.url || '') })
      .catch(e => live && setErr(e.message))
    return () => { live = false }
  }, [channel]) // eslint-disable-line react-hooks/exhaustive-deps
  const send = async () => {
    setBusy(true); setErr('')
    try {
      const r = await api(`/api/jobs/quotes/${quote.id}/send`, { method: 'POST', json: { companyId, channel, to, message, subject } })
      if (channel === 'link' && r.url) { try { await navigator.clipboard?.writeText(r.url) } catch {} }
      onSent({ ...r, channel })
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <Dialog title={quote.status === 'draft' ? 'Send quote' : 'Send quote again'} onClose={onClose} width={540} footer={<>
      <button type="button" className="ak-btn ghost" onClick={onClose}>Cancel</button>
      <button type="button" className="ak-btn go" onClick={send} disabled={busy || !message}>{busy ? 'Sending…' : channel === 'link' ? 'Mark sent & copy link' : channel === 'sms' ? 'Send text' : 'Send email'}</button>
    </>}>
      <div className="ak-seg" role="tablist" aria-label="Send by" style={{ alignSelf: 'flex-start' }}>
        <button type="button" className={channel === 'sms' ? 'on' : ''} onClick={() => setChannel('sms')}>Text</button>
        <button type="button" className={channel === 'email' ? 'on' : ''} onClick={() => setChannel('email')}>Email</button>
        <button type="button" className={channel === 'link' ? 'on' : ''} onClick={() => setChannel('link')}>Copy link</button>
      </div>
      {channel !== 'link' && (
        <div>
          <label className="ak-label" htmlFor="sq-to">{channel === 'sms' ? 'Mobile' : 'Email'}</label>
          <input id="sq-to" className="ak-field" value={to} onChange={e => setTo(e.target.value)} inputMode={channel === 'sms' ? 'tel' : 'email'} placeholder={channel === 'sms' ? '0412 345 678' : 'name@example.com'} />
          {channel === 'sms' && conversation && <p className="ak-hint">It goes into this customer’s conversation in the Inbox.</p>}
        </div>
      )}
      {channel === 'email' && (
        <div><label className="ak-label" htmlFor="sq-sub">Subject</label><input id="sq-sub" className="ak-field" value={subject} onChange={e => setSubject(e.target.value)} maxLength={200} /></div>
      )}
      {channel !== 'link' ? (
        <div>
          <label className="ak-label" htmlFor="sq-msg">Message</label>
          <textarea id="sq-msg" className="ak-field" rows={5} value={message} onChange={e => setMessage(e.target.value)} maxLength={1500} />
          <p className="ak-hint">Keep the link in the message: it’s how they open, accept and pay.</p>
        </div>
      ) : (
        <div className="ak-note info"><span>The quote is marked as sent and its private link is copied, so you can share it however you like.{url ? <><br /><span style={{ wordBreak: 'break-all' }}>{url}</span></> : null}</span></div>
      )}
      {err && <div className="ak-note bad" role="alert">{err}</div>}
    </Dialog>
  )
}

function DecideDialog({ kind, contactName, onClose, onDone }: { kind: 'accept' | 'decline'; contactName: string; onClose: () => void; onDone: (name: string, note: string) => void }) {
  const [name, setName] = useState(contactName)
  const [note, setNote] = useState('')
  return (
    <Dialog title={kind === 'accept' ? 'Record as accepted' : 'Record as declined'} onClose={onClose} width={480} footer={<>
      <button type="button" className="ak-btn ghost" onClick={onClose}>Cancel</button>
      <button type="button" className={`ak-btn ${kind === 'accept' ? 'go' : 'danger'}`} onClick={() => onDone(name, note)} disabled={kind === 'accept' && name.trim().length < 2}>{kind === 'accept' ? 'Mark accepted' : 'Mark declined'}</button>
    </>}>
      <p className="ak-hint" style={{ margin: 0 }}>For when the customer said {kind === 'accept' ? 'yes' : 'no'} by phone or in person. It’s recorded with your name.</p>
      <div><label className="ak-label" htmlFor="dq-n">Customer’s name</label><input id="dq-n" className="ak-field" value={name} onChange={e => setName(e.target.value)} maxLength={120} /></div>
      <div><label className="ak-label" htmlFor="dq-note">{kind === 'accept' ? 'Note' : 'Reason'} <span className="jb-muted" style={{ fontWeight: 500 }}>(optional)</span></label><textarea id="dq-note" className="ak-field" rows={3} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} /></div>
    </Dialog>
  )
}

function TemplatesDialog({ companyId, draft, defaultName, onApply, onSave, onClose, busy }: { companyId: string; draft: boolean; defaultName: string; onApply: (t: any) => void; onSave: () => void; onClose: () => void; busy: boolean }) {
  const [list, setList] = useState<any[] | null>(null)
  useEffect(() => { api(`/api/jobs/settings?companyId=${companyId}`).then(r => setList(r.templates || [])).catch(() => setList([])) }, [companyId])
  return (
    <Dialog title="Templates" onClose={onClose} width={500}>
      {draft && (
        <div>
          <span className="ak-label">Use a template</span>
          {list === null ? <p className="ak-hint">Loading…</p> : list.length ? (
            <div className="qe-tpls">{list.map(t => <button key={t.id} type="button" onClick={() => onApply(t)}><b>{t.name}</b><small>{(t.items || []).length} items</small></button>)}</div>
          ) : <p className="ak-hint" style={{ marginTop: 0 }}>No templates yet. Save a quote as one below.</p>}
        </div>
      )}
      <div>
        <label className="ak-label" htmlFor="qt-tplname">Save this quote as a template</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input id="qt-tplname" className="ak-field" defaultValue={defaultName} maxLength={120} placeholder="Template name" />
          <button type="button" className="ak-btn dark" onClick={onSave} disabled={busy}>Save</button>
        </div>
        <p className="ak-hint">Keeps the items, terms, discount and deposit to reuse on other jobs.</p>
      </div>
    </Dialog>
  )
}

const PAGE_CSS = `
.qe-h{display:inline-flex;align-items:center;gap:12px;flex-wrap:wrap}
.qe-h .ak-tag{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:0;font-size:12.5px;height:26px;padding:0 11px}
.qe-save{font-size:13px;color:var(--mut);min-width:64px;text-align:right}
.qe-save.error{color:#b91c1c}.qe-save.saved{color:#15803d}
.qe-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.qe-lines{display:flex;flex-direction:column;gap:6px}
.qe-lh,.qe-line{display:grid;grid-template-columns:minmax(0,1fr) 70px 82px 112px 64px 96px 66px;gap:8px;align-items:center}
.qe-lines:not(:has(.qe-gst)) .qe-lh,.qe-lines:not(:has(.qe-gst)) .qe-line{grid-template-columns:minmax(0,1fr) 70px 82px 112px 96px 66px}
.qe-lh{padding:0 2px 2px;font-size:12px;font-weight:650;color:var(--soft)}
.qe-line{padding:6px;border-radius:14px;background:color-mix(in srgb,var(--f) 55%,transparent)}
.qe-desc{display:grid;grid-template-columns:118px minmax(0,1fr);gap:6px;min-width:0}
.ak .qe-kind{padding-right:26px!important;background-position:right 8px center!important}
.qe-n{text-align:right;font-variant-numeric:tabular-nums}
.qe-money{position:relative}
.qe-money span{position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:13px;color:var(--soft);pointer-events:none}
.qe-money input{padding-left:20px!important}
.qe-gst{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:600;color:var(--mut);cursor:pointer}
.qe-gst input{width:16px;height:16px;accent-color:var(--coral)}
.qe-lt{text-align:right;font-size:14px}
.qe-row-acts{display:flex;justify-content:flex-end;gap:0}
.qe-sm{width:30px;height:30px;font-size:14px}
.qe-lines.ro .ak-field:disabled,.qe-lines.ro .ak-select:disabled{background-color:transparent!important;opacity:1;color:var(--ink)!important;-webkit-text-fill-color:var(--ink);background-image:none!important}
.qe-empty{padding:16px;border-radius:14px;background:var(--f);font-size:14px;color:var(--mut);text-align:center}
@media(max-width:760px){
  .qe-lh{display:none}
  .qe-line,.qe-lines:not(:has(.qe-gst)) .qe-line{grid-template-columns:repeat(3,minmax(0,1fr));padding:10px}
  .qe-desc{grid-column:1/-1;grid-template-columns:minmax(0,1fr)}
  .qe-lt{grid-column:1/3;text-align:left}
}
.qe-seg{width:100%;margin-bottom:12px}.qe-seg button{flex:1;justify-content:center}
.qe-tot{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 12px;margin:0;font-size:14px}
.qe-tot dt{color:var(--mut)}
.qe-tot dd{margin:0;text-align:right}
.qe-tot .big{padding-top:10px;box-shadow:0 -1px 0 var(--line);font-size:17px;font-weight:700;color:var(--ink)}
.qe-opts{display:flex;flex-direction:column;gap:14px;margin-top:16px;padding-top:14px;box-shadow:0 -1px 0 var(--line)}
.qe-amt{display:grid;grid-template-columns:minmax(0,1fr) 110px;gap:8px}
.qe-amt:has(select:only-child){grid-template-columns:minmax(0,1fr)}
.qe-more{display:flex;flex-wrap:wrap;gap:8px}
.qe-pl{width:min(380px,86vw);padding:8px}
.qe-pl-list{max-height:320px;overflow-y:auto;margin-top:6px}
.qe-pl-list button{justify-content:space-between;gap:12px}
.qe-pl-list b{font-size:14px}
.qe-pl-list small{display:block;font-size:12px;color:var(--mut)}
.qe-tpls{display:flex;flex-direction:column;gap:6px}
.qe-tpls button{display:flex;justify-content:space-between;align-items:center;padding:11px 14px;border:none;border-radius:14px;background:var(--f);font:inherit;font-size:14px;color:var(--ink);cursor:pointer;text-align:left}
.qe-tpls button:hover{background:var(--f2)}
.qe-tpls small{color:var(--mut)}
`
