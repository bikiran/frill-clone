'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdminPage, Panel, Toggle } from '@/components/ui/AdminKit'
import { confirmDialog } from '@/components/ConfirmDialog'
import { api, useJobsCompany, Dialog, useToast, Toast, SetupNote, Icon, JB_CSS } from '@/components/jobs/shared'
import { centsToInput, inputToCents, fmtMoney, LINE_KINDS, LINE_KIND_LABEL, type LineKind } from '@/lib/jobs/quote-math'

// Jobs & quotes settings: the module switch, GST, numbering, a quote's
// default terms, validity and deposit, the price list and saved templates.
// Owners and admins change these; everyone with Jobs access can see them.

export default function JobSettingsPage() {
  const { companyId, ready } = useJobsCompany()
  const [d, setD] = useState<any>(null)
  const [s, setS] = useState<any>(null)
  const [saved, setSaved] = useState('')
  const [setup, setSetup] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useToast()
  const [item, setItem] = useState<any>(null)   // price-list item being edited

  const load = useCallback(async () => {
    if (!companyId) return
    try {
      const r = await api(`/api/jobs/settings?companyId=${companyId}`)
      setD(r); setS(toForm(r.settings)); setSaved(JSON.stringify(toForm(r.settings))); setErr('')
    } catch (e: any) { if (/COLVY_V427/.test(e.message)) setSetup(e.message); else setErr(e.message) }
  }, [companyId])
  useEffect(() => { if (ready) load() }, [ready, load])

  const canManage = !!d?.canManage
  const dirty = s && JSON.stringify(s) !== saved

  const save = async () => {
    setSaving(true)
    try {
      const r = await api('/api/jobs/settings', { method: 'PATCH', json: { companyId, settings: fromForm(s) } })
      setS(toForm(r.settings)); setSaved(JSON.stringify(toForm(r.settings))); setToast('Saved')
    } catch (e: any) { setToast(e.message) } finally { setSaving(false) }
  }
  const setModule = async (on: boolean) => {
    if (!on && !(await confirmDialog({ title: 'Turn off Jobs & quotes?', message: 'Jobs leaves the menu for everyone. Nothing is deleted, and customers can still open quotes already sent.', confirmLabel: 'Turn off', tone: 'danger' }))) return
    try {
      const r = await api('/api/jobs/settings', { method: 'PATCH', json: { companyId, jobsModule: on } })
      setD((x: any) => ({ ...x, jobsEnabled: r.jobsEnabled, modules: r.modules }))
      try { window.dispatchEvent(new CustomEvent('colvy:modules-changed', { detail: { modules: r.modules } })) } catch {}
      setToast(on ? 'Jobs & quotes is on' : 'Jobs & quotes is off')
    } catch (e: any) { setToast(e.message) }
  }
  const saveItem = async (it: any) => {
    try {
      const r = await api('/api/jobs/price-items', { method: 'POST', json: { companyId, item: it } })
      setD((x: any) => ({ ...x, priceItems: it.id ? x.priceItems.map((p: any) => (p.id === it.id ? r.item : p)) : [...x.priceItems, r.item] }))
      setItem(null); setToast('Saved')
    } catch (e: any) { setToast(e.message) }
  }
  const delItem = async (it: any) => {
    if (!(await confirmDialog({ title: `Remove “${it.name}”?`, message: 'Quotes that already use it keep their lines.', confirmLabel: 'Remove', tone: 'danger' }))) return
    try { await api(`/api/jobs/price-items?companyId=${companyId}&id=${it.id}`, { method: 'DELETE' }); setD((x: any) => ({ ...x, priceItems: x.priceItems.filter((p: any) => p.id !== it.id) })) } catch (e: any) { setToast(e.message) }
  }
  const delTpl = async (t: any) => {
    if (!(await confirmDialog({ title: `Delete template “${t.name}”?`, confirmLabel: 'Delete', tone: 'danger' }))) return
    try { await api(`/api/jobs/templates?companyId=${companyId}&id=${t.id}`, { method: 'DELETE' }); setD((x: any) => ({ ...x, templates: x.templates.filter((p: any) => p.id !== t.id) })) } catch (e: any) { setToast(e.message) }
  }

  return (
    <AdminPage title="Quote Settings" back={{ href: '/admin/jobs', label: 'Jobs' }} width="md"
      sub="GST, numbering, the price list and templates for your quotes."
      actions={canManage && dirty ? <button type="button" className="ak-btn go" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button> : null}>
      <style>{JB_CSS + PAGE_CSS}</style>
      {setup && <SetupNote text={setup} />}
      {err && <div className="ak-note bad">{err}</div>}
      {d && !canManage && <div className="ak-note info"><span>Only owners and admins can change these settings.</span></div>}

      {d && s && <>
        <Panel className="js-mod" title="Jobs & quotes" sub={d.modules?.jobs === undefined ? `On by default for ${d.industry || 'your type of business'}.` : 'Shows Jobs in the menu for everyone on your team.'}
          right={<Toggle on={!!d.jobsEnabled} onChange={setModule} label="Jobs & quotes" disabled={!canManage} />} />

        <Panel title="GST">
          <div className="js-row">
            <div><b>Registered for GST</b><span>Adds GST to quotes and shows the breakdown.</span></div>
            <Toggle on={s.gst_registered} onChange={v => setS({ ...s, gst_registered: v })} label="Registered for GST" disabled={!canManage} />
          </div>
          {s.gst_registered && <>
            <div className="js-row">
              <div><b>GST rate</b><span>10% in Australia.</span></div>
              <div className="js-pct"><input className="ak-field sm" value={s.tax_rate} onChange={e => setS({ ...s, tax_rate: e.target.value.replace(/[^0-9.]/g, '') })} inputMode="decimal" aria-label="GST rate" disabled={!canManage} /><span>%</span></div>
            </div>
            <div className="js-row">
              <div><b>New quotes show prices</b><span>You can switch it on each quote.</span></div>
              <div className="ak-seg">
                <button type="button" className={!s.prices_include_tax ? 'on' : ''} onClick={() => canManage && setS({ ...s, prices_include_tax: false })}>Excl. GST</button>
                <button type="button" className={s.prices_include_tax ? 'on' : ''} onClick={() => canManage && setS({ ...s, prices_include_tax: true })}>Incl. GST</button>
              </div>
            </div>
          </>}
        </Panel>

        <Panel title="Quotes">
          <div className="js-grid">
            <div>
              <label className="ak-label" htmlFor="js-valid">Valid for (days)</label>
              <input id="js-valid" className="ak-field" value={s.quote_valid_days} onChange={e => setS({ ...s, quote_valid_days: e.target.value.replace(/\D/g, '') })} inputMode="numeric" disabled={!canManage} />
            </div>
            <div>
              <label className="ak-label" htmlFor="js-dep">Default deposit</label>
              <div className="js-dep">
                <select id="js-dep" className="ak-select" value={s.deposit_type} onChange={e => setS({ ...s, deposit_type: e.target.value })} disabled={!canManage}>
                  <option value="none">None</option><option value="percent">Percent</option><option value="fixed">Amount</option>
                </select>
                {s.deposit_type !== 'none' && <input className="ak-field" value={s.deposit_value} onChange={e => setS({ ...s, deposit_value: e.target.value.replace(/[^0-9.]/g, '') })} inputMode="decimal" aria-label="Deposit" disabled={!canManage} />}
              </div>
              {s.deposit_type !== 'none' && !d.paymentsReady && <p className="ak-hint">Set up card payments (Settings → Payments) so customers can pay deposits online.</p>}
            </div>
            <div>
              <label className="ak-label" htmlFor="js-jp">Job numbers start with</label>
              <input id="js-jp" className="ak-field" value={s.job_prefix} onChange={e => setS({ ...s, job_prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) })} disabled={!canManage} />
              <p className="ak-hint">e.g. {s.job_prefix || 'J'}-1001</p>
            </div>
            <div>
              <label className="ak-label" htmlFor="js-qp">Quote numbers start with</label>
              <input id="js-qp" className="ak-field" value={s.quote_prefix} onChange={e => setS({ ...s, quote_prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) })} disabled={!canManage} />
              <p className="ak-hint">e.g. {s.quote_prefix || 'Q'}-1001</p>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="ak-label" htmlFor="js-terms">Default terms</label>
              <textarea id="js-terms" className="ak-field" rows={4} value={s.default_terms} onChange={e => setS({ ...s, default_terms: e.target.value })} maxLength={4000} disabled={!canManage} />
            </div>
          </div>
        </Panel>

        <Panel title="Price list" sub="Your usual rates and items, to add to a quote in one click." flush
          right={canManage && <button type="button" className="ak-btn sm go" onClick={() => setItem({ name: '', kind: 'labour', unit: 'hour', price: '', taxable: true })}>{Icon.plus}Add</button>}>
          {d.priceItems.length ? (
            <div className="js-list">
              {d.priceItems.map((p: any) => (
                <div key={p.id} className="js-li">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <b>{p.name}</b>
                    <span>{LINE_KIND_LABEL[p.kind as LineKind] || p.kind} · per {p.unit}{p.taxable ? '' : ' · GST-free'}{p.active ? '' : ' · hidden'}</span>
                  </div>
                  <b className="jb-num">{fmtMoney(p.unit_price_cents)}</b>
                  {canManage && <>
                    <button type="button" className="ak-btn sm ghost" onClick={() => setItem({ ...p, price: centsToInput(p.unit_price_cents) })}>Edit</button>
                    <button type="button" className="ak-icon-btn danger" onClick={() => delItem(p)} aria-label={`Remove ${p.name}`}>{Icon.trash}</button>
                  </>}
                </div>
              ))}
            </div>
          ) : <div className="ak-empty" style={{ padding: '24px 20px 28px' }}><span>No items yet. Add your hourly rate, call-out fee and common materials.</span></div>}
        </Panel>

        <Panel title="Templates" sub="Save any quote as a template from the quote’s page." flush>
          {d.templates.length ? (
            <div className="js-list">
              {d.templates.map((t: any) => (
                <div key={t.id} className="js-li">
                  <div style={{ minWidth: 0, flex: 1 }}><b>{t.name}</b><span>{(t.items || []).length} items{t.deposit_type !== 'none' ? ' · deposit' : ''}</span></div>
                  <button type="button" className="ak-icon-btn danger" onClick={() => delTpl(t)} aria-label={`Delete ${t.name}`}>{Icon.trash}</button>
                </div>
              ))}
            </div>
          ) : <div className="ak-empty" style={{ padding: '24px 20px 28px' }}><span>No templates yet.</span></div>}
        </Panel>
      </>}

      {item && (
        <Dialog title={item.id ? 'Edit item' : 'Add to price list'} onClose={() => setItem(null)} width={480} footer={<>
          <button type="button" className="ak-btn ghost" onClick={() => setItem(null)}>Cancel</button>
          <button type="button" className="ak-btn go" disabled={!item.name.trim()} onClick={() => saveItem({ id: item.id, name: item.name, description: item.description, kind: item.kind, unit: item.unit, unit_price_cents: inputToCents(item.price), taxable: item.taxable, active: item.active !== false })}>Save</button>
        </>}>
          <div><label className="ak-label" htmlFor="pi-n">Name</label><input id="pi-n" className="ak-field" autoFocus value={item.name} onChange={e => setItem({ ...item, name: e.target.value })} maxLength={120} placeholder="e.g. Labour (per hour)" /></div>
          <div className="js-grid">
            <div><label className="ak-label" htmlFor="pi-k">Type</label><select id="pi-k" className="ak-select" value={item.kind} onChange={e => setItem({ ...item, kind: e.target.value })}>{LINE_KINDS.map(k => <option key={k} value={k}>{LINE_KIND_LABEL[k]}</option>)}</select></div>
            <div><label className="ak-label" htmlFor="pi-u">Unit</label><input id="pi-u" className="ak-field" value={item.unit} onChange={e => setItem({ ...item, unit: e.target.value })} maxLength={20} placeholder="hour, each, m²" /></div>
            <div><label className="ak-label" htmlFor="pi-p">Price</label><input id="pi-p" className="ak-field" value={item.price} onChange={e => setItem({ ...item, price: e.target.value.replace(/[^0-9.]/g, '') })} inputMode="decimal" placeholder="0.00" /></div>
            <label className="js-check"><input type="checkbox" checked={item.taxable} onChange={e => setItem({ ...item, taxable: e.target.checked })} /> GST applies</label>
          </div>
        </Dialog>
      )}
      <Toast text={toast} />
    </AdminPage>
  )
}

const toForm = (st: any) => ({
  gst_registered: !!st.gst_registered, tax_rate: String(st.tax_rate ?? 10), prices_include_tax: !!st.prices_include_tax,
  quote_valid_days: String(st.quote_valid_days ?? 30), default_terms: st.default_terms || '',
  deposit_type: st.default_deposit?.type || 'none',
  deposit_value: st.default_deposit?.type === 'fixed' ? centsToInput(st.default_deposit.value) : String(st.default_deposit?.value || ''),
  job_prefix: st.job_prefix || 'J', quote_prefix: st.quote_prefix || 'Q',
})
const fromForm = (f: any) => ({
  gst_registered: f.gst_registered, tax_rate: Number(f.tax_rate) || 0, prices_include_tax: f.prices_include_tax,
  quote_valid_days: Number(f.quote_valid_days) || 30, default_terms: f.default_terms,
  default_deposit: { type: f.deposit_type, value: f.deposit_type === 'fixed' ? inputToCents(f.deposit_value) : Number(f.deposit_value) || 0 },
  job_prefix: f.job_prefix, quote_prefix: f.quote_prefix,
})

const PAGE_CSS = `
.js-mod .ak-panel-h{margin-bottom:0}
.js-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0}
.js-row+.js-row{box-shadow:0 -1px 0 var(--line)}
.js-row>div:first-child{display:flex;flex-direction:column;gap:2px;min-width:0}
.js-row b{font-size:14.5px;font-weight:650}
.js-row span{font-size:13px;color:var(--mut)}
.js-pct{display:flex;align-items:center;gap:6px;width:110px}
.js-pct span{font-size:14px;color:var(--mut)}
.js-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
@media(max-width:560px){.js-grid{grid-template-columns:minmax(0,1fr)}.js-row{flex-wrap:wrap}}
.js-dep{display:grid;grid-template-columns:minmax(0,1fr) 110px;gap:8px}
.js-dep:has(select:only-child){grid-template-columns:minmax(0,1fr)}
.js-list{display:flex;flex-direction:column}
.js-li{display:flex;align-items:center;gap:12px;padding:12px 20px;box-shadow:0 -1px 0 var(--line)}
.js-li b{display:block;font-size:14.5px;font-weight:650}
.js-li span{display:block;font-size:12.5px;color:var(--mut)}
.js-check{display:flex;align-items:center;gap:8px;align-self:end;height:44px;font-size:14px;font-weight:600}
.js-check input{width:18px;height:18px;accent-color:var(--coral)}
`
