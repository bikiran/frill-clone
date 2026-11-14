'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AdminPage, Panel } from '@/components/ui/AdminKit'
import DateTimeField from '@/components/ui/DateTimeField'
import { confirmDialog } from '@/components/ConfirmDialog'
import { api, useJobsCompany, QuoteTag, fmtAgo, fmtDate, Dialog, useToast, Toast, SetupNote, Icon, JB_CSS, cacheKeys, readJobsCache, writeJobsCache } from '@/components/jobs/shared'
import { computeQuote, inputToCents, fmtMoney, MAX_LINES } from '@/lib/jobs/quote-math'
import { LineItems, AmountField, PriceListMenu, SendDialog, EDITOR_CSS, rowFrom, rid, toLine, amountFrom, amountOut, newRow, rowFromPriceItem, type Row, type Amount } from '@/components/jobs/editor'
import { effectiveTaxRate } from '@/lib/jobs/settings'
import { fmtJobNumber, fmtQuoteNumber } from '@/lib/jobs/status'

// The quote editor. Drafts save themselves as you type (the server works the
// totals out again on every save); a sent quote is read-only, and changing it
// means a revision. Totals here are only a preview of the server's sums.


export default function QuoteEditorPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const { companyId, ready } = useJobsCompany()
  // The quote as it was last seen paints at once (then the server's copy).
  const seed = useRef<any>(companyId ? readJobsCache(cacheKeys.quote(companyId, id)) : undefined)
  const sq = seed.current?.quote
  const [d, setD] = useState<any>(() => seed.current || null)
  const [err, setErr] = useState('')
  const [setup, setSetup] = useState('')
  const [toast, setToast] = useToast()

  // Draft fields
  const [rows, setRows] = useState<Row[]>(() => (Array.isArray(sq?.items) ? sq.items.map(rowFrom) : []))
  const [title, setTitle] = useState(() => sq?.title || '')
  const [intro, setIntro] = useState(() => sq?.intro || '')
  const [terms, setTerms] = useState(() => sq?.terms || '')
  const [validUntil, setValidUntil] = useState(() => sq?.valid_until || '')
  const [incl, setIncl] = useState(() => !!sq?.prices_include_tax)
  const [discount, setDiscount] = useState<Amount>(() => (sq ? amountFrom(sq.discount_type, sq.discount_value) : { type: 'none', input: '' }))
  const [deposit, setDeposit] = useState<Amount>(() => (sq ? amountFrom(sq.deposit_type, sq.deposit_value) : { type: 'none', input: '' }))
  // Set once the person edits; a late server copy then won't wipe their typing.
  const touched = useRef(false)
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
      // Edits made while it loaded stay (autosave sends them) unless the quote
      // stopped being a draft meanwhile.
      if (!touched.current || r.quote?.status !== 'draft') hydrate(r)
      setD(r); setErr('')
      writeJobsCache(cacheKeys.quote(companyId, id), r)
    } catch (e: any) { if (/COLVY_V427/.test(e.message)) setSetup(e.message); else setErr(e.message) }
  }, [companyId, id])
  useEffect(() => {
    if (!ready || !companyId) return
    if (!d) {
      const c = readJobsCache<any>(cacheKeys.quote(companyId, id))
      if (c) { setD(c); hydrate(c) }
    }
    load()
  }, [ready, load]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (companyId && d?.quote) writeJobsCache(cacheKeys.quote(companyId, id), d) }, [d]) // eslint-disable-line react-hooks/exhaustive-deps

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
    touched.current = true
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
  const addRow = (r?: Partial<Row>) => setRows(rs => (rs.length >= MAX_LINES ? rs : [...rs, newRow(r)]))

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
      <style>{JB_CSS + EDITOR_CSS}</style>

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
              {pickList && <PriceListMenu items={d.priceItems} onPick={it => { addRow(rowFromPriceItem(it)); setPickList(false) }} onClose={() => setPickList(false)} />}
            </div>
          )}>
            <LineItems rows={lines} setRows={setRows} draft={draft} gst={gst} totalsByLine={totalsByLine} />
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

      {showSend && <SendDialog endpoint={`/api/jobs/quotes/${q.id}/send`} companyId={companyId} title={q.status === 'draft' ? 'Send quote' : 'Send quote again'} noun="quote" linkHint="Keep the link in the message: it’s how they open, accept and pay." contact={d.contact} conversation={d.conversation} onClose={() => setShowSend(false)}
        onSent={(r: any) => { setShowSend(false); setToast(r.warning ? r.warning : r.channel === 'link' ? 'Quote marked as sent. Link copied.' : 'Quote sent'); load() }} />}
      {showDecide && <DecideDialog kind={showDecide} contactName={d.contact?.name || ''} onClose={() => setShowDecide(null)}
        onDone={async (name, note) => { const r = await act(showDecide, { name, note }); if (r) { setShowDecide(null); setToast(showDecide === 'accept' ? 'Recorded as accepted' : 'Recorded as declined'); load() } }} />}
      {showTpl && <TemplatesDialog companyId={companyId} draft={draft} defaultName={title} onApply={applyTemplate} onSave={saveAsTemplate} onClose={() => setShowTpl(false)} busy={busy} />}
      <Toast text={toast} />
    </AdminPage>
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
