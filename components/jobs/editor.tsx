'use client'

import { useEffect, useRef, useState } from 'react'
import { api, Dialog, Icon } from '@/components/jobs/shared'
import { centsToInput, inputToCents, fmtMoney, LINE_KINDS, LINE_KIND_LABEL, MAX_LINES, type LineKind } from '@/lib/jobs/quote-math'

// The pieces the quote and invoice editors share: the line items (editable on
// a draft, read-only once sent), the discount field, the price-list picker,
// the send dialog and the editor's styles.

export type Row = { id: string; kind: LineKind; description: string; qty: string; unit: string; price: string; taxable: boolean }
export type Amount = { type: 'none' | 'fixed' | 'percent'; input: string }

export const rowFrom = (l: any): Row => ({ id: String(l.id || rid()), kind: l.kind || 'labour', description: l.description || '', qty: String(l.quantity ?? 1), unit: l.unit || 'each', price: centsToInput(l.unit_price_cents || 0), taxable: l.taxable !== false })
export const rid = () => `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
export const toLine = (r: Row) => ({ id: r.id, kind: r.kind, description: r.description, quantity: Number(r.qty) || 0, unit: r.unit, unit_price_cents: inputToCents(r.price), taxable: r.taxable })
export const amountFrom = (type: any, value: any): Amount => ({ type: type === 'fixed' || type === 'percent' ? type : 'none', input: type === 'fixed' ? centsToInput(Number(value) || 0) : type === 'percent' ? String(Number(value) || 0) : '' })
export const amountOut = (a: Amount) => ({ type: a.type, value: a.type === 'fixed' ? inputToCents(a.input) : a.type === 'percent' ? Number(a.input) || 0 : 0 })
export const newRow = (r?: Partial<Row>): Row => ({ id: rid(), kind: 'labour', description: '', qty: '1', unit: 'each', price: '0.00', taxable: true, ...r })
/** A price-list item as a new line. */
export const rowFromPriceItem = (it: any): Partial<Row> => ({ kind: it.kind, description: it.name, unit: it.unit, price: centsToInput(it.unit_price_cents), taxable: it.taxable, qty: '1' })

/** The lines: editable on a draft, read-only once sent. Line totals come from the parent's computeQuote preview. */
export function LineItems({ rows, setRows, draft, gst, totalsByLine, emptyText = 'No items yet. Add labour, materials, travel or fees.' }: {
  rows: Row[]; setRows: React.Dispatch<React.SetStateAction<Row[]>>; draft: boolean; gst: boolean; totalsByLine: Map<string, number>; emptyText?: string
}) {
  const lines = rows
  const setRow = (i: number, patch: Partial<Row>) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const addRow = (r?: Partial<Row>) => setRows(rs => (rs.length >= MAX_LINES ? rs : [...rs, newRow(r)]))
  const removeRow = (i: number) => setRows(rs => rs.filter((_, j) => j !== i))
  const moveRow = (i: number, dir: -1 | 1) => setRows(rs => { const j = i + dir; if (j < 0 || j >= rs.length) return rs; const c = rs.slice(); [c[i], c[j]] = [c[j], c[i]]; return c })
  return (
    <>
      {!draft ? (
        <div className="qe-ro">
          {lines.map((r: Row) => (
            <div key={r.id} className="qe-ro-line">
              <div style={{ minWidth: 0 }}>
                <b>{r.description || LINE_KIND_LABEL[r.kind]}</b>
                <small>{LINE_KIND_LABEL[r.kind]} · {Number(r.qty) || 0}{r.unit && r.unit !== 'each' ? ` ${r.unit}` : ''} × ${r.price}{gst && !r.taxable ? ' · GST-free' : ''}</small>
              </div>
              <b className="jb-num">{fmtMoney(totalsByLine.get(r.id) ?? 0)}</b>
            </div>
          ))}
          {!lines.length && <div className="qe-empty">No items.</div>}
        </div>
      ) : (
      <div className="qe-lines">
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
        {!lines.length && <div className="qe-empty">{emptyText}</div>}
      </div>
      )}
      {draft && <button type="button" className="ak-btn sm" onClick={() => addRow()} disabled={rows.length >= MAX_LINES} style={{ marginTop: 10 }}>{Icon.plus}Add item</button>}
    </>
  )
}

export function AmountField({ label, value, onChange, hint }: { label: string; value: Amount; onChange: (a: Amount) => void; hint?: string }) {
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

export function PriceListMenu({ items, onPick, onClose }: { items: any[]; onPick: (it: any) => void; onClose: () => void }) {
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

/**
 * Send a quote or an invoice: by text, by email, or mark it sent and copy its
 * link. The server previews the message (with the link) first, so what's
 * shown is what goes.
 */
export function SendDialog({ endpoint, companyId, title, noun, contact, conversation, extra, linkHint, onClose, onSent }: {
  endpoint: string; companyId: string; title: string; noun: 'quote' | 'invoice'; contact: any; conversation: any
  extra?: Record<string, any>; linkHint?: string; onClose: () => void; onSent: (r: any) => void
}) {
  const [channel, setChannel] = useState<'sms' | 'email' | 'link'>(contact?.phone ? 'sms' : contact?.email ? 'email' : 'link')
  const [to, setTo] = useState('')
  const [message, setMessage] = useState('')
  const [subject, setSubject] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    let live = true
    setTo(''); setErr('')
    api(endpoint, { method: 'POST', json: { companyId, channel, preview: true, ...extra } })
      .then(r => { if (!live) return; setTo(r.to || ''); setMessage(r.message || ''); setSubject(r.subject || ''); setUrl(r.url || '') })
      .catch(e => live && setErr(e.message))
    return () => { live = false }
  }, [channel]) // eslint-disable-line react-hooks/exhaustive-deps
  const send = async () => {
    setBusy(true); setErr('')
    try {
      const r = await api(endpoint, { method: 'POST', json: { companyId, channel, to, message, subject, ...extra } })
      if (channel === 'link' && r.url) { try { await navigator.clipboard?.writeText(r.url) } catch {} }
      onSent({ ...r, channel })
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <Dialog title={title} onClose={onClose} width={540} footer={<>
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
          <p className="ak-hint">{linkHint || `Keep the link in the message: it’s how they open the ${noun}.`}</p>
        </div>
      ) : (
        <div className="ak-note info"><span>The {noun} is marked as sent and its private link is copied, so you can share it however you like.{url ? <><br /><span style={{ wordBreak: 'break-all' }}>{url}</span></> : null}</span></div>
      )}
      {err && <div className="ak-note bad" role="alert">{err}</div>}
    </Dialog>
  )
}

export const EDITOR_CSS = `
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
.qe-ro{display:flex;flex-direction:column}
.qe-ro-line{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 2px}
.qe-ro-line+.qe-ro-line{box-shadow:0 -1px 0 var(--line)}
.qe-ro-line b{font-size:14.5px;font-weight:650}
.qe-ro-line small{display:block;margin-top:2px;font-size:12.5px;color:var(--mut)}
.qe-empty{padding:16px;border-radius:14px;background:var(--f);font-size:14px;color:var(--mut);text-align:center}
@media(max-width:760px){
  .qe-lh{display:none}
  .qe-line,.qe-lines:not(:has(.qe-gst)) .qe-line{grid-template-columns:repeat(3,minmax(0,1fr));padding:10px}
  .qe-desc{grid-column:1/-1;grid-template-columns:minmax(0,1fr)}
  .qe-lt{grid-column:1/3;text-align:left}
}
.qe-seg{width:100%;margin-bottom:12px}.qe-seg button{flex:1;justify-content:center}
.qe-tot{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 0;margin:0;font-size:14px}
.qe-tot dt{color:var(--mut)}
.qe-tot dd{margin:0;padding-left:12px;text-align:right}
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
