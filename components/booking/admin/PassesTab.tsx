'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { api, money, card, input, label, hint, Toggle, Modal } from '@/components/booking/admin/shared'
import { creditsWords, priceWords, productTerms, PASS_PRESETS, type PassProduct } from '@/lib/passes/rules'

// Bookings → Passes: class packs and memberships (lib/passes). What
// customers have (and where each stands), and what the business sells.

type Product = PassProduct & { live: number }
type Service = { id: string; name: string; group: boolean; active: boolean }
type PassView = {
  id: string; kind: 'pack' | 'membership'; name: string; status: string; contact_id: string | null
  customer_name: string | null; customer_email: string | null; customer_phone: string | null
  credits_total: number | null; credits_used: number; price_cents: number; currency: string
  every_n: number | null; unit: 'week' | 'month' | null; source: string; paid_how: string | null
  cancel_at_period_end: boolean; stripe_subscription_id: string | null; created_at: string; sold_by_name: string | null; note: string | null
  expires_at: string | null; period_end: string | null
  state: { usable: boolean; reason: string | null; left: number | null; label: string; when: string | null }
}
type Counts = { members: number; packs: number; failed: number; ending: number; monthlyCents: number }
type Detail = { pass: PassView; uses: { id: string; class_at: string; used_by: string | null; returned_at: string | null; booking: { service_name: string; status: string } | null }[]; charges: { id: string; amount_cents: number; currency: string; paid_how: string; paid_at: string; period_end: string | null }[]; timezone: string }

const SHOWS: [string, string][] = [['live', 'Live'], ['members', 'Members'], ['packs', 'Class packs'], ['failed', 'Payment failed'], ['ended', 'Ended'], ['all', 'All']]
const dayStr = (iso: string, tz: string) => new Date(iso).toLocaleDateString('en-AU', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' })
const whenStr = (iso: string, tz: string) => new Date(iso).toLocaleString('en-AU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).replace(' am', 'am').replace(' pm', 'pm')
const tone = (p: PassView) => p.status === 'past_due' ? 'bad' : !p.state.usable ? 'off' : p.kind === 'membership' ? 'member' : 'ok'

function Ticket({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4Z" /><path d="M14 6v12" /></svg>
}

export default function PassesTab({ companyId, flash }: { companyId: string; flash: (m: string) => void }) {
  const [view, setView] = useState<'customers' | 'sale'>('customers')
  const [products, setProducts] = useState<Product[] | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [payReady, setPayReady] = useState(true)
  const [setup, setSetup] = useState('')
  const [passes, setPasses] = useState<PassView[] | null>(null)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [tz, setTz] = useState('Australia/Melbourne')
  const [show, setShow] = useState('live')
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Partial<Product> | null>(null)
  const [selling, setSelling] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const loadProducts = useCallback(async () => {
    try {
      const d = await api(`/api/passes/products?companyId=${companyId}`)
      setProducts(d.products || []); setServices(d.services || []); setPayReady(!!d.payReady); setSetup('')
    } catch (e: any) { setProducts([]); setSetup(e.message) }
  }, [companyId])
  const loadPasses = useCallback(async () => {
    try {
      const d = await api(`/api/passes?companyId=${companyId}&show=${show}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`)
      setPasses(d.passes || []); setCounts(d.counts || null); setTz(d.timezone || 'Australia/Melbourne')
    } catch (e: any) { setPasses([]); if (e.status === 503) setSetup(e.message) }
  }, [companyId, show, q])

  useEffect(() => { loadProducts() }, [loadProducts])
  useEffect(() => { const t = setTimeout(loadPasses, q ? 250 : 0); return () => clearTimeout(t) }, [loadPasses]) // eslint-disable-line react-hooks/exhaustive-deps

  const onSale = (products || []).filter(p => p.active)

  return (
    <div className="ps">
      <style>{PS_CSS}</style>
      {setup && <div className="bk-warn"><span>{setup}</span></div>}

      <div className="ps-top">
        <div className="ps-switch" role="tablist" aria-label="Passes">
          <button type="button" role="tab" aria-selected={view === 'customers'} className={`bk-pick${view === 'customers' ? ' on' : ''}`} onClick={() => setView('customers')}>Customers’ passes</button>
          <button type="button" role="tab" aria-selected={view === 'sale'} className={`bk-pick${view === 'sale' ? ' on' : ''}`} onClick={() => setView('sale')}>For sale{onSale.length ? <span className="ps-n">{onSale.length}</span> : null}</button>
        </div>
        <div className="ps-acts">
          {view === 'customers'
            ? <button type="button" className="cv-btn cv-btn-primary" disabled={!onSale.length} onClick={() => setSelling(true)}>Sell a pass</button>
            : <button type="button" className="cv-btn cv-btn-primary" onClick={() => setEdit({ kind: 'pack', credits: 10, valid_days: 90, price_cents: 15000, service_ids: [], sell_online: true, active: true })}>New pass</button>}
        </div>
      </div>

      {view === 'customers' ? (
        <>
          {counts && (
            <div className="ps-tiles">
              <div className="ps-tile"><span>Members</span><b>{counts.members}</b></div>
              <div className="ps-tile"><span>Class packs in use</span><b>{counts.packs}</b>{counts.ending > 0 && <em>{counts.ending} expiring in 2 weeks</em>}</div>
              <div className={`ps-tile${counts.failed ? ' warn' : ''}`}><span>Payment failed</span><b>{counts.failed}</b></div>
              <div className="ps-tile"><span>From members, a month</span><b>{money(counts.monthlyCents)}</b><em>About, before Stripe fees</em></div>
            </div>
          )}
          <div className="ps-bar">
            <input style={{ ...input, maxWidth: 280 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email or pass" aria-label="Search passes" />
            <div className="ps-shows">{SHOWS.map(([k, l]) => <button key={k} type="button" className={`bk-pick${show === k ? ' on' : ''}`} onClick={() => setShow(k)}>{l}</button>)}</div>
          </div>
          {passes === null ? <div className="ps-empty">Loading…</div> : !passes.length ? (
            <div className="ps-empty">
              <span className="ps-empty-ic"><Ticket size={22} /></span>
              <b>{q || show !== 'live' ? 'Nothing here' : 'No passes yet'}</b>
              <span>{!onSale.length ? 'Add a class pack or membership under “For sale”, then sell it here or let customers buy it on your booking page.' : q || show !== 'live' ? 'Try another search or filter.' : 'Passes customers buy on your booking page show up here, with how many classes they have left.'}</span>
              {!onSale.length && <button type="button" className="cv-btn" onClick={() => setView('sale')}>Set up passes</button>}
            </div>
          ) : (
            <div className="ps-list">
              {passes.map(p => (
                <button key={p.id} type="button" className="ps-row" onClick={() => setOpen(p.id)}>
                  <span className={`ps-av ${tone(p)}`}><Ticket /></span>
                  <span className="ps-main">
                    <b>{p.customer_name || 'Customer'}</b>
                    <span>{p.name}{p.state.when ? ` · ${p.state.when}` : ''}</span>
                  </span>
                  <span className={`ps-pill ${tone(p)}`}>{p.state.label}</span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <SaleList products={products} services={services} payReady={payReady} onEdit={p => setEdit(p)} companyId={companyId} flash={flash} />
      )}

      {edit && <ProductEditor companyId={companyId} services={services} value={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); loadProducts(); flash('Saved') }} flash={flash} />}
      {selling && <SellDialog companyId={companyId} products={onSale} payReady={payReady} onClose={() => setSelling(false)} onSold={() => { setSelling(false); loadPasses(); loadProducts() }} flash={flash} />}
      {open && <PassPanel companyId={companyId} id={open} tz={tz} onClose={() => setOpen(null)} onChanged={() => loadPasses()} flash={flash} />}
    </div>
  )
}

// ── For sale ─────────────────────────────────────────────────────────────────

function SaleList({ products, services, payReady, onEdit, companyId, flash }: { products: Product[] | null; services: Service[]; payReady: boolean; onEdit: (p: Product) => void; companyId: string; flash: (m: string) => void }) {
  const names = useMemo(() => new Map(services.map(s => [s.id, s.name])), [services])
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!payReady) return
    api(`/api/passes/products?companyId=${companyId}`).then(d => setUrl(d.bookingUrl ? `${d.bookingUrl}?passes=1` : null)).catch(() => {})
  }, [companyId, payReady])
  if (products === null) return <div className="ps-empty">Loading…</div>
  const copy = (u: string) => navigator.clipboard?.writeText(u).then(() => flash('Link copied')).catch(() => {})
  return (
    <>
      {!payReady && <div className="bk-warn"><span>Connect Stripe (Settings → Payments) so customers can buy passes on your booking page. Until then you can still sell class packs in person.</span></div>}
      {!products.length ? (
        <div className="ps-empty">
          <span className="ps-empty-ic"><Ticket size={22} /></span>
          <b>Sell classes in bundles</b>
          <span>A class pack (“10 classes for $150, use within 3 months”) or a membership (“$39 a week, unlimited classes”). Customers buy on your booking page and book classes with it.</span>
        </div>
      ) : (
        <div className="ps-products">
          {products.map(p => (
            <div key={(p as any).id} className={`ps-prod${p.active ? '' : ' off'}`} style={card}>
              <div className="ps-prod-h">
                <span className={`ps-kind ${p.kind}`}>{p.kind === 'pack' ? 'Class pack' : 'Membership'}</span>
                {!p.active && <span className="ps-kind off">Off sale</span>}
                {p.active && !p.sell_online && <span className="ps-kind off">In person only</span>}
              </div>
              <b className="ps-prod-n">{p.name}</b>
              <div className="ps-prod-p">{priceWords(p)}</div>
              <div className="ps-prod-t">{productTerms(p)}</div>
              <div className="ps-prod-t">{p.service_ids.length ? `For ${p.service_ids.map(id => names.get(id)).filter(Boolean).join(', ') || 'chosen classes'}` : 'For every class'}</div>
              <div className="ps-prod-f">
                <span>{p.live} live</span>
                <span style={{ display: 'flex', gap: 6 }}>
                  {url && p.active && p.sell_online && <button type="button" className="cv-btn bk-sm" onClick={() => copy(`${url}&product=${(p as any).id}`)}>Copy buy link</button>}
                  <button type="button" className="cv-btn bk-sm" onClick={() => onEdit(p)}>Edit</button>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      {url && products.some(p => p.active && p.sell_online) && <p style={{ ...hint, marginTop: 14 }}>Customers also find these on your booking page, under “Class passes and memberships”. <button type="button" className="ps-link" onClick={() => copy(url)}>Copy the link to all of them</button></p>}
    </>
  )
}

function ProductEditor({ companyId, services, value, onClose, onSaved, flash }: { companyId: string; services: Service[]; value: Partial<Product>; onClose: () => void; onSaved: () => void; flash: (m: string) => void }) {
  const isNew = !(value as any).id
  const [v, setV] = useState<any>({ ...value, price: value.price_cents != null ? String(value.price_cents / 100) : '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (patch: any) => setV((x: any) => ({ ...x, ...patch }))
  const preset = PASS_PRESETS.find(p => p.every === v.every_n && p.unit === v.unit)?.key || ''
  const save = async () => {
    setBusy(true); setErr('')
    const body = {
      companyId, kind: v.kind, name: v.name, description: v.description, price_cents: Math.round(Number(String(v.price).replace(/[^\d.]/g, '')) * 100),
      credits: v.credits === '' || v.credits == null ? null : Number(v.credits), valid_days: v.valid_days === '' || v.valid_days == null ? null : Number(v.valid_days),
      every_n: v.every_n, unit: v.unit, service_ids: v.service_ids || [], sell_online: v.sell_online !== false, active: v.active !== false,
    }
    try {
      if (isNew) await api('/api/passes/products', { method: 'POST', json: body })
      else await api(`/api/passes/products/${(value as any).id}`, { method: 'PATCH', json: body })
      onSaved()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  const [sure, setSure] = useState(false)
  const remove = async () => {
    if (!sure) { setSure(true); return }
    try { const d = await api(`/api/passes/products/${(value as any).id}?companyId=${companyId}`, { method: 'DELETE' }); flash(d.archived ? 'Taken off sale' : 'Removed'); onSaved() } catch (e: any) { setErr(e.message) }
  }
  const classes = services.filter(s => s.active)
  const pick = (id: string) => set({ service_ids: (v.service_ids || []).includes(id) ? v.service_ids.filter((x: string) => x !== id) : [...(v.service_ids || []), id] })
  return (
    <Modal title={isNew ? 'New pass' : `Edit ${value.name}`} onClose={onClose} width={580} footer={<>
      {!isNew && <button type="button" className={`cv-btn ${sure ? 'bk-danger' : 'bk-del'}`} onClick={remove} onBlur={() => setSure(false)} style={{ marginRight: 'auto' }}>{sure ? (value.live ? 'Take it off sale' : 'Yes, remove it') : 'Remove'}</button>}
      <button type="button" className="cv-btn" onClick={onClose}>Cancel</button>
      <button type="button" className="cv-btn cv-btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
    </>}>
      <div className="ps-form">
        {isNew && (
          <div className="ps-kinds" role="radiogroup" aria-label="Kind">
            {([['pack', 'Class pack', 'A set number of classes, paid once'], ['membership', 'Membership', 'Billed by card every week, fortnight or month']] as const).map(([k, t, d]) => (
              <button key={k} type="button" role="radio" aria-checked={v.kind === k} className={`ps-kindopt${v.kind === k ? ' on' : ''}`}
                onClick={() => set(k === 'pack' ? { kind: k, credits: v.credits || 10, every_n: null, unit: null } : { kind: k, credits: null, valid_days: null, every_n: 1, unit: 'month' })}>
                <b>{t}</b><span>{d}</span>
              </button>
            ))}
          </div>
        )}
        <label><span style={label}>Name</span><input style={input} value={v.name || ''} onChange={e => set({ name: e.target.value })} placeholder={v.kind === 'pack' ? '10-class pack' : 'Unlimited monthly'} /></label>
        <div className="ps-two">
          <label><span style={label}>{v.kind === 'membership' ? 'Price each time' : 'Price'}</span>
            <div className="ps-money"><span>$</span><input style={{ ...input, paddingLeft: 26 }} inputMode="decimal" value={v.price} onChange={e => set({ price: e.target.value })} placeholder="150" /></div>
          </label>
          {v.kind === 'pack' ? (
            <label><span style={label}>Classes</span><input style={input} inputMode="numeric" value={v.credits ?? ''} onChange={e => set({ credits: e.target.value.replace(/\D/g, '') })} placeholder="10" /></label>
          ) : (
            <label><span style={label}>Billed</span>
              <select style={input} value={preset} onChange={e => { const p = PASS_PRESETS.find(x => x.key === e.target.value); if (p) set({ every_n: p.every, unit: p.unit }) }}>
                {PASS_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </label>
          )}
        </div>
        {v.kind === 'pack' ? (
          <label><span style={label}>Days to use it</span><input style={{ ...input, maxWidth: 200 }} inputMode="numeric" value={v.valid_days ?? ''} onChange={e => set({ valid_days: e.target.value.replace(/\D/g, '') })} placeholder="No expiry" />
            <span style={{ ...hint, display: 'block' }}>Counted from the day it’s paid for. Leave empty for no expiry.</span></label>
        ) : (
          <label><span style={label}>Classes each time it’s billed</span><input style={{ ...input, maxWidth: 200 }} inputMode="numeric" value={v.credits ?? ''} onChange={e => set({ credits: e.target.value.replace(/\D/g, '') || null })} placeholder="Unlimited" />
            <span style={{ ...hint, display: 'block' }}>Leave empty for unlimited classes.</span></label>
        )}
        <div>
          <span style={label}>Which classes it covers</span>
          <div className="ps-svcs">
            <button type="button" className={`bk-pick${!(v.service_ids || []).length ? ' on' : ''}`} onClick={() => set({ service_ids: [] })}>Every class</button>
            {classes.map(s => <button key={s.id} type="button" className={`bk-pick${(v.service_ids || []).includes(s.id) ? ' on' : ''}`} onClick={() => pick(s.id)}>{s.name}</button>)}
          </div>
          <span style={hint}>A booking with a pass is free to the customer: a class comes off their pass instead.</span>
        </div>
        <label><span style={label}>Description <span style={{ color: '#a1a1aa', fontWeight: 500 }}>(optional)</span></span><textarea style={{ ...input, minHeight: 64 }} value={v.description || ''} onChange={e => set({ description: e.target.value })} placeholder="Shown on your booking page" /></label>
        <div className="ps-tog"><Toggle on={v.sell_online !== false} onChange={x => set({ sell_online: x })} label="Sell on the booking page" /><span><b>Sell on your booking page</b><em>Off: only your team sells it{v.kind === 'membership' ? ' (they send the customer the sign-up link)' : ''}.</em></span></div>
        {!isNew && <div className="ps-tog"><Toggle on={v.active !== false} onChange={x => set({ active: x })} label="On sale" /><span><b>On sale</b><em>Passes already bought keep working either way.</em></span></div>}
        {!isNew && <p style={hint}>Changes apply to new sales. Passes already bought keep their classes, price and dates.</p>}
        {err && <div className="ps-err" role="alert">{err}</div>}
      </div>
    </Modal>
  )
}

// ── Sell a pass ──────────────────────────────────────────────────────────────

function SellDialog({ companyId, products, payReady, onClose, onSold, flash }: { companyId: string; products: Product[]; payReady: boolean; onClose: () => void; onSold: () => void; flash: (m: string) => void }) {
  const [pid, setPid] = useState(products[0] ? (products[0] as any).id : '')
  const product = products.find(p => (p as any).id === pid) || null
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<any[]>([])
  const [who, setWho] = useState<any | null>(null)
  const [how, setHow] = useState<'cash' | 'other' | 'free' | 'link'>(product?.kind === 'membership' ? 'link' : 'cash')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [link, setLink] = useState('')
  useEffect(() => { if (product?.kind === 'membership') setHow('link') }, [product?.kind])
  useEffect(() => {
    const term = q.trim().replace(/[%,()]/g, ' ')
    if (term.length < 2 || who) { setHits([]); return }
    let live = true
    const t = setTimeout(async () => {
      const { data } = await (supabase as any).from('contacts').select('id, name, phone, email').eq('company_id', companyId).or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`).limit(8)
      if (live) setHits(data || [])
    }, 220)
    return () => { live = false; clearTimeout(t) }
  }, [q, companyId, who])
  const go = async () => {
    setBusy(true); setErr('')
    try {
      const d = await api('/api/passes', { method: 'POST', json: { companyId, productId: pid, contactId: who?.id, how } })
      if (d.url) { setLink(d.url); return }
      flash(`${product?.name} added for ${who?.name || 'them'}`); onSold()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  const copy = () => navigator.clipboard?.writeText(link).then(() => flash('Link copied')).catch(() => {})
  const canGo = !!product && (how === 'link' || !!who)
  return (
    <Modal title="Sell a pass" onClose={onClose} width={520} footer={link ? <button type="button" className="cv-btn cv-btn-primary" onClick={onClose}>Done</button> : <>
      <button type="button" className="cv-btn" onClick={onClose}>Cancel</button>
      <button type="button" className="cv-btn cv-btn-primary" disabled={busy || !canGo} onClick={go}>{busy ? 'One moment…' : how === 'link' ? 'Get the link' : how === 'free' ? 'Give it' : 'Add the pass'}</button>
    </>}>
      {link ? (
        <div className="ps-form">
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>Send this to {who?.name || 'the customer'}. They pay by card on your booking page{product?.kind === 'membership' ? ' and the membership starts straight away' : ''}.</p>
          <div className="ps-linkbox"><code>{link}</code><button type="button" className="cv-btn bk-sm" onClick={copy}>Copy</button></div>
        </div>
      ) : (
        <div className="ps-form">
          <label><span style={label}>Pass</span>
            <select style={input} value={pid} onChange={e => setPid(e.target.value)}>
              {products.map(p => <option key={(p as any).id} value={(p as any).id}>{p.name} · {priceWords(p)}</option>)}
            </select>
            {product && <span style={{ ...hint, display: 'block' }}>{creditsWords(product)}{product.kind === 'pack' && product.valid_days ? `, to use within ${product.valid_days} days` : ''}</span>}
          </label>
          <div>
            <span style={label}>How they’re paying</span>
            <div className="ps-svcs">
              {product?.kind === 'pack' && <button type="button" className={`bk-pick${how === 'cash' ? ' on' : ''}`} onClick={() => setHow('cash')}>Cash</button>}
              {product?.kind === 'pack' && <button type="button" className={`bk-pick${how === 'other' ? ' on' : ''}`} onClick={() => setHow('other')}>Card machine or transfer</button>}
              {payReady && <button type="button" className={`bk-pick${how === 'link' ? ' on' : ''}`} onClick={() => setHow('link')}>Card, by link</button>}
              {product?.kind === 'pack' && <button type="button" className={`bk-pick${how === 'free' ? ' on' : ''}`} onClick={() => setHow('free')}>Free</button>}
            </div>
            {product?.kind === 'membership' && <span style={{ ...hint, display: 'block' }}>Memberships are billed to the customer’s card each period, so they sign up with the link.</span>}
          </div>
          {how !== 'link' && (
            <div>
              <span style={label}>Customer</span>
              {who ? (
                <div className="ps-who"><span><b>{who.name || 'Customer'}</b><em>{who.email || who.phone || ''}</em></span><button type="button" className="cv-btn bk-sm" onClick={() => { setWho(null); setQ('') }}>Change</button></div>
              ) : (
                <>
                  <input style={input} value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, mobile or email" autoFocus />
                  {hits.length > 0 && <div className="ps-hits">{hits.map(h => <button key={h.id} type="button" onClick={() => setWho(h)}><b>{h.name || 'No name'}</b><span>{h.email || h.phone || ''}</span></button>)}</div>}
                  {q.trim().length >= 2 && !hits.length && <span style={{ ...hint, display: 'block' }}>No customer by that name yet. Add them under Contacts first.</span>}
                </>
              )}
              {who && !who.email && !who.phone && <span style={{ ...hint, display: 'block' }}>They’ll need an email or mobile on file to sign in and book with it.</span>}
            </div>
          )}
          {err && <div className="ps-err" role="alert">{err}</div>}
        </div>
      )}
    </Modal>
  )
}

// ── One customer's pass ──────────────────────────────────────────────────────

function PassPanel({ companyId, id, tz, onClose, onChanged, flash }: { companyId: string; id: string; tz: string; onClose: () => void; onChanged: () => void; flash: (m: string) => void }) {
  const [d, setD] = useState<Detail | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [adj, setAdj] = useState<'add' | 'take' | 'extend' | 'cancel' | null>(null)
  const [n, setN] = useState('1')
  const load = useCallback(() => api(`/api/passes/${id}?companyId=${companyId}`).then(setD).catch(e => setErr(e.message)), [id, companyId])
  useEffect(() => { load() }, [load])
  const act = async (action: string, extra: any = {}, done?: string) => {
    setBusy(action); setErr('')
    try { const r = await api(`/api/passes/${id}`, { method: 'POST', json: { companyId, action, ...extra } }); setD(r); setAdj(null); onChanged(); if (done) flash(done) } catch (e: any) { setErr(e.message) } finally { setBusy('') }
  }
  const p = d?.pass
  return (
    <Modal title={p ? (p.customer_name || 'Customer') : 'Pass'} onClose={onClose} width={560}>
      {!d ? <div className="ps-empty" style={{ padding: 30 }}>{err || 'Loading…'}</div> : p && (
        <div className="ps-form">
          <div className="ps-hero">
            <span className={`ps-av big ${tone(p)}`}><Ticket size={20} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{p.name}</b>
              <span>{p.kind === 'membership' ? priceWords(p) : creditsWords(p)}{p.state.when ? ` · ${p.state.when}` : ''}</span>
            </div>
            <span className={`ps-pill ${tone(p)}`}>{p.state.label}</span>
          </div>
          {p.state.reason && !p.state.usable && <div className="ps-note">{p.state.reason}</div>}
          <div className="ps-facts">
            <div><span>Contact</span><b>{[p.customer_email, p.customer_phone].filter(Boolean).join(' · ') || '—'}</b></div>
            <div><span>Bought</span><b>{dayStr(p.created_at, tz)}{p.source === 'team' ? ` · ${p.paid_how === 'free' ? 'given free' : p.paid_how === 'cash' ? 'cash' : 'in person'}${p.sold_by_name ? ` by ${p.sold_by_name}` : ''}` : ' · online'}</b></div>
            {p.kind === 'pack' && <div><span>Classes</span><b>{p.credits_used} used of {p.credits_total}</b></div>}
            {p.kind === 'membership' && <div><span>Classes booked</span><b>{p.credits_used}</b></div>}
          </div>

          <div className="ps-actions">
            {p.kind === 'pack' && <>
              <button type="button" className="cv-btn bk-sm" onClick={() => { setAdj('add'); setN('1') }}>Add classes</button>
              <button type="button" className="cv-btn bk-sm" onClick={() => { setAdj('take'); setN('1') }} disabled={(p.credits_total || 0) <= p.credits_used}>Take off classes</button>
              <button type="button" className="cv-btn bk-sm" onClick={() => { setAdj('extend'); setN('30') }}>More time</button>
            </>}
            {p.kind === 'membership' && p.status !== 'cancelled' && (p.cancel_at_period_end
              ? <button type="button" className="cv-btn bk-sm" disabled={!!busy} onClick={() => act('resume', {}, 'It carries on')}>Keep it going</button>
              : <button type="button" className="cv-btn bk-sm bk-del" onClick={() => setAdj('cancel')}>Cancel membership</button>)}
            {p.kind === 'membership' && p.stripe_subscription_id && <button type="button" className="cv-btn bk-sm" disabled={!!busy} onClick={() => act('sync', {}, 'Up to date')}>{busy === 'sync' ? 'Checking…' : 'Check with Stripe'}</button>}
          </div>

          {(adj === 'add' || adj === 'take' || adj === 'extend') && (
            <div className="ps-adj">
              <span>{adj === 'add' ? 'Classes to add' : adj === 'take' ? 'Classes to take off' : 'Extra days'}</span>
              <input style={{ ...input, width: 90 }} inputMode="numeric" value={n} onChange={e => setN(e.target.value.replace(/\D/g, ''))} autoFocus />
              <button type="button" className="cv-btn cv-btn-primary bk-sm" disabled={!!busy || !Number(n)} onClick={() => adj === 'extend' ? act('extend', { days: Number(n) }, 'Extended') : act('adjust', { delta: adj === 'add' ? Number(n) : -Number(n) }, 'Updated')}>Save</button>
              <button type="button" className="cv-btn bk-sm" onClick={() => setAdj(null)}>Cancel</button>
            </div>
          )}
          {adj === 'cancel' && (
            <div className="ps-adj col">
              <span>Stop {p.customer_name?.split(' ')[0] || 'their'}’s membership?</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="cv-btn bk-sm" disabled={!!busy} onClick={() => act('cancel', { now: false }, 'Ends at the end of the period')}>At the end of the period{p.period_end ? ` (${dayStr(p.period_end, tz)})` : ''}</button>
                <button type="button" className="cv-btn bk-sm bk-danger" disabled={!!busy} onClick={() => act('cancel', { now: true }, 'Cancelled')}>Now</button>
                <button type="button" className="cv-btn bk-sm" onClick={() => setAdj(null)}>Keep it</button>
              </div>
              <em>No refund is made either way. Refund a payment from Payments if you need to.</em>
            </div>
          )}
          {err && <div className="ps-err" role="alert">{err}</div>}

          <div className="ps-sect">Classes</div>
          {!d.uses.length ? <p style={hint}>No classes booked with it yet.</p> : (
            <div className="ps-uses">{d.uses.map(u => (
              <div key={u.id} className={u.returned_at ? 'back' : ''}>
                <b>{u.booking?.service_name || 'Class'}</b>
                <span>{whenStr(u.class_at, tz)}{u.returned_at ? ' · given back' : u.booking?.status === 'cancelled' ? ' · cancelled late' : ''}{u.used_by && u.used_by !== 'customer' ? ` · added by ${u.used_by}` : ''}</span>
              </div>
            ))}</div>
          )}
          {d.charges.length > 0 && <>
            <div className="ps-sect">Payments</div>
            <div className="ps-uses">{d.charges.map(c => (
              <div key={c.id}><b>{money(c.amount_cents, c.currency)}</b><span>{dayStr(c.paid_at, tz)} · {c.paid_how === 'card' ? 'card' : c.paid_how === 'cash' ? 'cash' : 'in person'}{c.period_end ? ` · to ${dayStr(c.period_end, tz)}` : ''}</span></div>
            ))}</div>
          </>}
        </div>
      )}
    </Modal>
  )
}

const PS_CSS = `
.ps-top{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.ps-switch,.ps-shows,.ps-svcs{display:flex;gap:6px;flex-wrap:wrap}
.ps-n{margin-left:6px;font-size:11.5px;opacity:.8}
.ps-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}
.ps-tile{padding:14px 16px;border-radius:18px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06);display:flex;flex-direction:column;gap:2px;min-width:0}
.ps-tile span{font-size:12.5px;color:#71717a;font-weight:600}
.ps-tile b{font-size:24px;font-weight:800;letter-spacing:-.02em;color:var(--ink,#111);font-variant-numeric:tabular-nums}
.ps-tile em{font-style:normal;font-size:12px;color:#a1a1aa}
.ps-tile.warn b{color:#b91c1c}
.ps-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
.ps-list{display:flex;flex-direction:column;background:#fff;border-radius:20px;box-shadow:0 0 0 1px rgba(0,0,0,.06);overflow:hidden}
.ps-row{display:flex;align-items:center;gap:12px;padding:12px 16px;border:none;border-top:1px solid #f4f4f5;background:none;text-align:left;font:inherit;color:inherit;cursor:pointer;transition:background-color .15s}
.ps-row:first-child{border-top:none}
.ps-row:hover{background:#fafafa}
.ps-av{width:36px;height:36px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:#f4f4f5;color:#71717a}
.ps-av.big{width:44px;height:44px;border-radius:14px}
.ps-av.ok{background:#ecfdf5;color:#047857}.ps-av.member{background:#eef2ff;color:#4338ca}.ps-av.bad{background:#fef2f2;color:#b91c1c}
.ps-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.ps-main b{font-size:14.5px;font-weight:700;color:var(--ink,#111);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ps-main span{font-size:13px;color:#71717a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ps-pill{flex-shrink:0;height:24px;padding:0 10px;border-radius:999px;display:inline-flex;align-items:center;font-size:12px;font-weight:700;background:#f4f4f5;color:#52525b;white-space:nowrap}
.ps-pill.ok{background:#ecfdf5;color:#047857}.ps-pill.member{background:#eef2ff;color:#4338ca}.ps-pill.bad{background:#fef2f2;color:#b91c1c}
.ps-empty{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;padding:44px 20px;border-radius:20px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06);color:#71717a;font-size:13.5px;line-height:1.5}
.ps-empty b{font-size:16px;color:var(--ink,#111)}
.ps-empty span{max-width:440px}
.ps-empty .cv-btn{margin-top:8px}
.ps-empty-ic{width:48px;height:48px;border-radius:16px;display:flex;align-items:center;justify-content:center;background:#f4f4f5;color:#52525b;margin-bottom:4px}
.ps-products{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.ps-prod{display:flex;flex-direction:column;gap:4px}
.ps-prod.off{opacity:.65}
.ps-prod-h{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px}
.ps-kind{height:22px;padding:0 9px;border-radius:999px;display:inline-flex;align-items:center;font-size:11.5px;font-weight:700;background:#ecfdf5;color:#047857}
.ps-kind.membership{background:#eef2ff;color:#4338ca}.ps-kind.off{background:#f4f4f5;color:#71717a}
.ps-prod-n{font-size:16px;font-weight:800;color:var(--ink,#111)}
.ps-prod-p{font-size:20px;font-weight:800;letter-spacing:-.02em;color:var(--ink,#111)}
.ps-prod-t{font-size:13px;color:#71717a;line-height:1.45}
.ps-prod-f{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid #f4f4f5;font-size:12.5px;color:#71717a;font-weight:600}
.ps-link{border:none;background:none;padding:0;font:inherit;color:var(--coral,#ff7a6b);font-weight:650;cursor:pointer}
.ps-form{display:flex;flex-direction:column;gap:14px}
.ps-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.ps-money{position:relative}.ps-money>span{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#71717a;font-size:14px}
.ps-kinds{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ps-kindopt{display:flex;flex-direction:column;gap:3px;text-align:left;padding:12px 14px;border-radius:16px;border:none;background:#f4f4f5;font:inherit;color:inherit;cursor:pointer;box-shadow:inset 0 0 0 1.5px transparent;transition:background-color .15s,box-shadow .15s}
.ps-kindopt b{font-size:14.5px;color:var(--ink,#111)}.ps-kindopt span{font-size:12.5px;color:#71717a;line-height:1.4}
.ps-kindopt.on{background:#fff;box-shadow:inset 0 0 0 1.5px #18181b}
.ps-tog{display:flex;gap:12px;align-items:flex-start}
.ps-tog span{display:flex;flex-direction:column;gap:2px;font-size:14px}.ps-tog em{font-style:normal;font-size:12.5px;color:#8e8e93}
.ps-err{padding:10px 12px;border-radius:12px;background:#fef2f2;color:#b91c1c;font-size:13.5px}
.ps-note{padding:10px 12px;border-radius:12px;background:#fffbeb;color:#92400e;font-size:13.5px}
.ps-who{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:14px;background:#f4f4f5}
.ps-who span{display:flex;flex-direction:column;gap:1px;min-width:0}.ps-who em{font-style:normal;font-size:12.5px;color:#71717a}
.ps-hits{margin-top:6px;border-radius:14px;box-shadow:0 0 0 1px rgba(0,0,0,.08);overflow:hidden}
.ps-hits button{display:flex;flex-direction:column;align-items:flex-start;gap:1px;width:100%;padding:9px 12px;border:none;border-top:1px solid #f4f4f5;background:#fff;font:inherit;text-align:left;cursor:pointer}
.ps-hits button:first-child{border-top:none}.ps-hits button:hover{background:#fafafa}
.ps-hits span{font-size:12.5px;color:#71717a}
.ps-linkbox{display:flex;gap:8px;align-items:center;padding:10px 12px;border-radius:14px;background:#f4f4f5}
.ps-linkbox code{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px}
.ps-hero{display:flex;align-items:center;gap:12px}
.ps-hero b{display:block;font-size:16px;color:var(--ink,#111)}.ps-hero span{font-size:13px;color:#71717a}
.ps-facts{display:grid;grid-template-columns:1fr;gap:8px;padding:12px 14px;border-radius:16px;background:#fafafa}
.ps-facts div{display:flex;justify-content:space-between;gap:12px;font-size:13.5px}
.ps-facts span{color:#71717a}.ps-facts b{font-weight:600;text-align:right;color:var(--ink,#111);min-width:0;overflow-wrap:anywhere}
.ps-actions{display:flex;gap:6px;flex-wrap:wrap}
.ps-adj{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 14px;border-radius:16px;background:#f4f4f5;font-size:13.5px;font-weight:600}
.ps-adj.col{flex-direction:column;align-items:flex-start}.ps-adj em{font-style:normal;font-weight:500;font-size:12.5px;color:#71717a}
.ps-sect{font-weight:800;font-size:14px;color:var(--ink,#111);margin-top:4px}
.ps-uses{display:flex;flex-direction:column;border-radius:16px;box-shadow:0 0 0 1px rgba(0,0,0,.06);overflow:hidden}
.ps-uses>div{display:flex;justify-content:space-between;gap:10px;padding:9px 12px;border-top:1px solid #f4f4f5;font-size:13px}
.ps-uses>div:first-child{border-top:none}
.ps-uses b{font-weight:650}.ps-uses span{color:#71717a;text-align:right}
.ps-uses .back b{color:#a1a1aa;text-decoration:line-through}
@media(max-width:860px){.ps-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:560px){.ps-two,.ps-kinds{grid-template-columns:1fr}.ps-uses>div{flex-direction:column;gap:2px}.ps-uses span{text-align:left}}
`
