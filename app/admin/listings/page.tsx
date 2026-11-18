'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useJobsCompany } from '@/components/jobs/shared'
import { api } from '@/components/booking/admin/shared'
import { confirmDialog } from '@/components/ConfirmDialog'
import { uploadAttachment } from '@/lib/upload-attachment'
import EmptyScroll from '@/components/EmptyScroll'
import {
  LISTING_CONDITIONS, LISTING_SOURCES, MAX_PHOTOS, cleanCode, conditionLabel, displayUrl, listingCopy,
  localNumber, priceText, sourceLabel, suggestCode, type Listing,
} from '@/lib/listings'

// Marketplace listings (lib/listings.ts): each Facebook Marketplace, Gumtree or
// eBay listing gets its own Colvy page and a code buyers can text, so the
// enquiries reach the inbox with the listing attached, and the business can
// see who asked and who bought.

type Stats = { views: number; enquiries: number; sales: number; revenue: number }
type Row = Listing & { url: string | null; stats: Stats }
type Enquiry = { conversation_id: string; contact_id: string | null; name: string; channel: string; status: string; last_message: string | null; last_message_at: string; bought: boolean }
type Product = { id: string | number; name: string; price?: string; image?: string | null; permalink?: string | null; short_description?: string; source?: string }

const money = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n || 0)
const ago = (iso: string | null | undefined) => {
  if (!iso) return ''
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
const CHANNEL: Record<string, string> = { chat: 'Website chat', widget: 'Website chat', sms: 'SMS', email: 'Email', facebook: 'Messenger', instagram: 'Instagram', whatsapp: 'WhatsApp' }
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const Svg = ({ d, s = 16 }: { d: React.ReactNode; s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
const I = {
  plus: <Svg d={<path d="M12 5v14M5 12h14" />} />,
  copy: <Svg s={15} d={<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>} />,
  check: <Svg s={15} d={<path d="M20 6 9 17l-5-5" />} />,
  ext: <Svg s={15} d={<><path d="M15 3h6v6M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>} />,
  close: <Svg d={<path d="M18 6 6 18M6 6l12 12" />} />,
  tag: <Svg s={22} d={<><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></>} />,
  photo: <Svg s={20} d={<><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></>} />,
  search: <Svg s={15} d={<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>} />,
  chat: <Svg s={15} d={<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />} />,
  qr: <Svg s={15} d={<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h3v-3" /></>} />,
}

async function downloadQr(url: string, code: string) {
  const QR = (await import('qrcode')).default
  const href = await QR.toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, width: 1024 })
  const a = document.createElement('a')
  a.href = href; a.download = `listing-${code.toLowerCase()}-qr.png`
  document.body.appendChild(a); a.click(); a.remove()
}

export default function ListingsPage() {
  const { companyId, ready } = useJobsCompany()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [number, setNumber] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [migration, setMigration] = useState(false)
  const [editing, setEditing] = useState<Partial<Row> | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  // /admin/listings?id=<listing> opens that listing (from the inbox card).
  useEffect(() => { try { const id = new URLSearchParams(window.location.search).get('id'); if (id) setOpenId(id) } catch {} }, [])
  const [filter, setFilter] = useState<'all' | 'active' | 'sold' | 'hidden'>('all')
  const [copied, setCopied] = useState('')

  const load = useCallback(async () => {
    if (!companyId) return
    try {
      const d = await api(`/api/listings?companyId=${companyId}`)
      setRows(d.listings || [])
      setNumber(d.number || null)
      setMigration(!!d.needsMigration)
      setErr('')
    } catch (e: any) { setErr(e.message); setRows([]) }
  }, [companyId])
  useEffect(() => { if (ready) load() }, [ready, load])

  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1600) } catch { /* selectable anyway */ }
  }

  const totals = useMemo(() => (rows || []).reduce((t, r) => ({
    views: t.views + (r.stats?.views || 0), enquiries: t.enquiries + (r.stats?.enquiries || 0),
    sales: t.sales + (r.stats?.sales || 0), revenue: t.revenue + (r.stats?.revenue || 0),
  }), { views: 0, enquiries: 0, sales: 0, revenue: 0 }), [rows])
  const visible = (rows || []).filter(r => filter === 'all' || r.status === filter)
  const open = (rows || []).find(r => r.id === openId) || null
  const numberLabel = number ? localNumber(number) : null

  const onSaved = (r: Row) => {
    setRows(list => {
      const l = list || []
      return l.some(x => x.id === r.id) ? l.map(x => (x.id === r.id ? r : x)) : [r, ...l]
    })
    setEditing(null)
    setOpenId(r.id)
  }

  return (
    <div className="ml">
      <style>{CSS}</style>
      <div className="ml-head">
        <div>
          <h1>Marketplace listings</h1>
          <p>Give each Facebook Marketplace, Gumtree or eBay listing its own page and a code people can text. Their questions land in your inbox with the listing attached, and you can see who asked and who bought.</p>
        </div>
        <button type="button" className="ml-primary" onClick={() => setEditing({})} disabled={migration}>{I.plus} New listing</button>
      </div>

      {migration && <p className="ml-note" role="alert">Listings need a quick database update first: run <b>COLVY_V441_MARKETPLACE_LISTINGS.sql</b> in Supabase.</p>}
      {err && !migration && <p className="ml-error" role="alert">{err}</p>}

      <div className="ml-how">
        <div className="ml-step"><span>1</span><div><b>Add the listing here</b><small>Photos, price and details, or copy them from a product in your store.</small></div></div>
        <div className="ml-step"><span>2</span><div><b>Put its link or code in your listing</b><small>And paste the ready-made reply when someone messages you on Marketplace.</small></div></div>
        <div className="ml-step"><span>3</span><div><b>Answer them in Colvy</b><small>Chats and texts arrive with the listing attached. Mark it sold when it goes.</small></div></div>
      </div>

      {rows && rows.length > 0 && (
        <div className="ml-tiles">
          <div className="ml-tile"><b>{totals.views}</b><span>Views</span></div>
          <div className="ml-tile"><b>{totals.enquiries}</b><span>Enquiries</span></div>
          <div className="ml-tile"><b>{totals.sales}</b><span>Sales</span></div>
          <div className="ml-tile"><b>{money(totals.revenue)}</b><span>Revenue</span></div>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="ml-filters" role="tablist" aria-label="Show">
          {(['all', 'active', 'sold', 'hidden'] as const).map(f => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'active' ? 'For sale' : f === 'sold' ? 'Sold' : 'Hidden'}
              <em>{f === 'all' ? rows.length : rows.filter(r => r.status === f).length}</em>
            </button>
          ))}
        </div>
      )}

      {rows === null ? (
        <div className="ml-grid">{[0, 1, 2].map(i => <div key={i} className="ml-card ml-skel" />)}</div>
      ) : rows.length === 0 && !migration ? (
        <div className="ml-empty">
          <EmptyScroll title="No listings yet" line="Add the first thing you’re selling on Marketplace. It takes a minute." kinds={['photo', 'chat', 'payment']}
            action={<button type="button" className="ml-primary" onClick={() => setEditing({})}>{I.plus} New listing</button>} />
        </div>
      ) : (
        <div className="ml-grid">
          {visible.map(r => (
            <article key={r.id} className={`ml-card ${r.status !== 'active' ? 'dim' : ''}`}>
              <button type="button" className="ml-card-hit" onClick={() => setOpenId(r.id)} aria-label={`Open ${r.title}`} />
              <div className="ml-thumb">
                {r.photos?.[0] ? <img src={r.photos[0]} alt="" loading="lazy" /> : <span>{I.photo}</span>}
                <span className={`ml-status s-${r.status}`}>{r.status === 'active' ? 'For sale' : r.status === 'sold' ? 'Sold' : 'Hidden'}</span>
              </div>
              <div className="ml-body">
                <p className="ml-title">{r.title}</p>
                <p className="ml-meta">{priceText(r.price_cents, r.currency) || 'No price'} · <span className="ml-code">{r.code}</span></p>
                <p className="ml-stats">{plural(r.stats?.views || 0, 'view')} · {plural(r.stats?.enquiries || 0, 'enquiry', 'enquiries')} · {plural(r.stats?.sales || 0, 'sale')}</p>
                <div className="ml-actions">
                  {r.url && <button type="button" className="ml-soft" onClick={() => copy(r.url!, `l-${r.id}`)}>{copied === `l-${r.id}` ? I.check : I.copy} {copied === `l-${r.id}` ? 'Copied' : 'Copy link'}</button>}
                  <button type="button" className="ml-soft" onClick={() => setOpenId(r.id)}>Details</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {open && <ListingSheet key={open.id} row={open} companyId={companyId} number={number} numberLabel={numberLabel}
        onClose={() => setOpenId(null)} onEdit={() => setEditing(open)}
        onChange={r => setRows(list => (list || []).map(x => (x.id === r.id ? r : x)))}
        onDeleted={id => { setRows(list => (list || []).filter(x => x.id !== id)); setOpenId(null) }} />}

      {editing && <ListingEditor key={editing.id || 'new'} initial={editing} companyId={companyId} taken={(rows || []).filter(r => r.id !== editing.id).map(r => r.code)}
        onClose={() => setEditing(null)} onSaved={onSaved} />}
    </div>
  )
}

// ── One listing: share it, the numbers, who asked, sold ─────────────────────

function ListingSheet({ row, companyId, number, numberLabel, onClose, onEdit, onChange, onDeleted }: {
  row: Row; companyId: string; number: string | null; numberLabel: string | null
  onClose: () => void; onEdit: () => void; onChange: (r: Row) => void; onDeleted: (id: string) => void
}) {
  const [enq, setEnq] = useState<Enquiry[] | null>(null)
  const [copied, setCopied] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [selling, setSelling] = useState(false)
  const copy = async (text: string, key: string) => { try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1600) } catch {} }
  const words = row.url ? listingCopy(row, row.url, numberLabel) : null

  const loadEnq = useCallback(async () => {
    try { const d = await api(`/api/listings/${row.id}?companyId=${companyId}`); setEnq(d.enquiries || []); if (d.listing) onChange(d.listing) } catch { setEnq([]) }
  }, [row.id, companyId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadEnq() }, [loadEnq])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [onClose])

  const act = async (key: string, fn: () => Promise<any>) => {
    setBusy(key); setErr('')
    try { const d = await fn(); if (d?.listing) onChange(d.listing) } catch (e: any) { setErr(e.message) } finally { setBusy('') }
  }
  const setStatus = (status: 'active' | 'hidden') => act(status, () => api(`/api/listings/${row.id}`, { method: 'PATCH', json: { companyId, status } }))
  const notSold = () => act('unsold', async () => { const d = await api(`/api/listings/${row.id}/sold`, { method: 'POST', json: { companyId, undo: true } }); loadEnq(); return d })
  const remove = async () => {
    const ok = await confirmDialog({ title: 'Delete this listing?', message: 'Its page stops working. Conversations about it stay in your inbox.', confirmLabel: 'Delete', tone: 'danger' })
    if (!ok) return
    act('delete', async () => { await api(`/api/listings/${row.id}?companyId=${companyId}`, { method: 'DELETE' }); onDeleted(row.id) })
  }
  const s = row.stats || { views: 0, enquiries: 0, sales: 0, revenue: 0 }

  return (
    <div className="ml-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <aside className="ml-sheet" role="dialog" aria-modal="true" aria-label={row.title}>
        <div className="ml-sheet-top">
          <div className="ml-sheet-thumb">{row.photos?.[0] ? <img src={row.photos[0]} alt="" /> : I.photo}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="ml-sheet-title">{row.title}</p>
            <p className="ml-meta">{priceText(row.price_cents, row.currency) || 'No price'} · {sourceLabel(row.source)}{row.condition ? ` · ${conditionLabel(row.condition)}` : ''}</p>
          </div>
          <button type="button" className="ml-x" onClick={onClose} aria-label="Close">{I.close}</button>
        </div>

        <div className="ml-sheet-actions">
          <button type="button" className="ml-soft" onClick={onEdit}>Edit</button>
          {row.status === 'sold'
            ? <button type="button" className="ml-soft" onClick={notSold} disabled={!!busy}>{busy === 'unsold' ? 'Saving…' : 'Not sold'}</button>
            : <button type="button" className="ml-primary sm" onClick={() => setSelling(true)} disabled={!!busy}>Mark as sold</button>}
          {row.status === 'hidden'
            ? <button type="button" className="ml-soft" onClick={() => setStatus('active')} disabled={!!busy}>Show again</button>
            : row.status === 'active' && <button type="button" className="ml-soft" onClick={() => setStatus('hidden')} disabled={!!busy}>Hide</button>}
          {row.url && <a className="ml-soft" href={row.url} target="_blank" rel="noopener">{I.ext} Open page</a>}
          <button type="button" className="ml-soft danger" onClick={remove} disabled={!!busy}>Delete</button>
        </div>
        {err && <p className="ml-error" role="alert">{err}</p>}
        {row.status === 'sold' && <p className="ml-sold-line">Sold{row.sold_price_cents != null ? ` for ${priceText(row.sold_price_cents, row.currency)}` : ''}{row.sold_at ? ` · ${ago(row.sold_at)}` : ''}. The page now says it’s sold and offers to chat about something similar.</p>}

        <div className="ml-nums">
          <div><b>{s.views}</b><span>Views</span></div>
          <div><b>{s.enquiries}</b><span>Enquiries</span></div>
          <div><b>{s.sales}</b><span>Sales</span></div>
          <div><b>{money(s.revenue)}</b><span>Revenue</span></div>
        </div>

        {row.url && words && (
          <section className="ml-sec">
            <h3>Share it</h3>
            <div className="ml-share">
              <code>{displayUrl(row.url)}</code>
              <button type="button" className="ml-soft" onClick={() => copy(row.url!, 'url')}>{copied === 'url' ? I.check : I.copy} {copied === 'url' ? 'Copied' : 'Copy'}</button>
              <button type="button" className="ml-soft" onClick={() => downloadQr(row.url!, row.code)} title="A QR code for a printed sign">{I.qr} QR</button>
            </div>
            <div className="ml-block">
              <div className="ml-block-h"><b>For your listing</b><button type="button" className="ml-link" onClick={() => copy(words.forListing, 'listing')}>{copied === 'listing' ? 'Copied' : 'Copy'}</button></div>
              <p>{words.forListing}</p>
            </div>
            <div className="ml-block">
              <div className="ml-block-h"><b>Reply when someone messages you on Marketplace</b><button type="button" className="ml-link" onClick={() => copy(words.reply, 'reply')}>{copied === 'reply' ? 'Copied' : 'Copy'}</button></div>
              <p>{words.reply}</p>
            </div>
            <p className="ml-hint">
              {number ? <>Buyers can also text <b>{row.code}</b> to <b>{numberLabel}</b>. The text arrives with this listing attached.</> : <>Get a Colvy number under Settings → Calls &amp; SMS and buyers can text <b>{row.code}</b> to it.</>}
              {' '}Facebook sometimes hides links in Marketplace listings, so it’s worth adding the code too.
            </p>
          </section>
        )}

        <section className="ml-sec">
          <h3>People who asked <em>{enq?.length ?? ''}</em></h3>
          {enq === null ? <div className="ml-skel-line" /> : enq.length === 0 ? (
            <p className="ml-hint">Nobody yet. Chats from the listing’s page, and texts with {row.code}, show up here.</p>
          ) : (
            <ul className="ml-people">
              {enq.map(e => (
                <li key={e.conversation_id}>
                  <span className="ml-av">{(e.name || '?').charAt(0).toUpperCase()}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p className="ml-pname">{e.name}{e.bought && <span className="ml-bought">Bought it</span>}</p>
                    <p className="ml-plast">{CHANNEL[e.channel] || e.channel} · {ago(e.last_message_at)}{e.last_message ? ` · ${e.last_message}` : ''}</p>
                  </div>
                  <a className="ml-soft" href={`/admin/inbox?conversation=${e.conversation_id}`}>{I.chat} Open</a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
      {selling && <SoldDialog row={row} enquiries={enq || []} companyId={companyId} onClose={() => setSelling(false)} onDone={l => { onChange(l); setSelling(false); loadEnq() }} />}
    </div>
  )
}

function SoldDialog({ row, enquiries, companyId, onClose, onDone }: { row: Row; enquiries: Enquiry[]; companyId: string; onClose: () => void; onDone: (r: Row) => void }) {
  const [who, setWho] = useState<string>(enquiries[0]?.conversation_id || '')
  const [price, setPrice] = useState(row.price_cents != null ? String(row.price_cents / 100) : '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const save = async () => {
    setBusy(true); setErr('')
    try {
      const d = await api(`/api/listings/${row.id}/sold`, { method: 'POST', json: { companyId, conversationId: who || null, price } })
      onDone(d.listing)
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <div className="ml-scrim center" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ml-modal" role="dialog" aria-modal="true" aria-label="Mark as sold">
        <h2>Mark as sold</h2>
        <p className="ml-hint" style={{ marginTop: 4 }}>Who bought it? It counts as their purchase, so you can see which listings sell and who your buyers are.</p>
        <div className="ml-choices" role="radiogroup" aria-label="Buyer">
          {enquiries.map(e => (
            <button key={e.conversation_id} type="button" role="radio" aria-checked={who === e.conversation_id} className={who === e.conversation_id ? 'on' : ''} onClick={() => setWho(e.conversation_id)}>
              <span className="ml-av">{(e.name || '?').charAt(0).toUpperCase()}</span><span>{e.name}<small>{CHANNEL[e.channel] || e.channel}</small></span>
            </button>
          ))}
          <button type="button" role="radio" aria-checked={who === ''} className={who === '' ? 'on' : ''} onClick={() => setWho('')}>
            <span className="ml-av muted">?</span><span>Someone else<small>Not in Colvy, or I’m not sure</small></span>
          </button>
        </div>
        <label className="ml-field" style={{ marginTop: 14 }}><span>Sold for</span>
          <div className="ml-money"><em>$</em><input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="0" /></div>
        </label>
        {err && <p className="ml-error" role="alert">{err}</p>}
        <div className="ml-modal-foot">
          <button type="button" className="ml-soft" onClick={onClose}>Cancel</button>
          <button type="button" className="ml-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Mark as sold'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Add / edit ───────────────────────────────────────────────────────────────

function ListingEditor({ initial, companyId, taken, onClose, onSaved }: { initial: Partial<Row>; companyId: string; taken: string[]; onClose: () => void; onSaved: (r: Row) => void }) {
  const isNew = !initial.id
  const [title, setTitle] = useState(initial.title || '')
  const [price, setPrice] = useState(initial.price_cents != null ? String(initial.price_cents / 100) : '')
  const [condition, setCondition] = useState<string>(initial.condition || '')
  const [pickup, setPickup] = useState(initial.pickup || '')
  const [source, setSource] = useState<string>(initial.source || 'facebook_marketplace')
  const [external, setExternal] = useState(initial.external_url || '')
  const [description, setDescription] = useState(initial.description || '')
  const [photos, setPhotos] = useState<string[]>(initial.photos || [])
  const [product, setProduct] = useState<Listing['product']>(initial.product || null)
  const [code, setCode] = useState(initial.code || '')
  const [codeTouched, setCodeTouched] = useState(!!initial.code)
  const [uploading, setUploading] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // The code follows the title until the business types its own.
  useEffect(() => { if (!codeTouched && title.trim()) setCode(suggestCode(title, taken)) }, [title, codeTouched, taken])

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const room = MAX_PHOTOS - photos.length
    const list = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, Math.max(0, room))
    if (!list.length) { setErr(`Up to ${MAX_PHOTOS} photos.`); return }
    setUploading(n => n + list.length); setErr('')
    for (const f of list) {
      try {
        const up = await uploadAttachment(f, { companyId, conversationId: 'listings' })
        setPhotos(p => (p.length < MAX_PHOTOS ? [...p, up.url] : p))
      } catch (e: any) { setErr(e.message || 'A photo didn’t upload.') }
      finally { setUploading(n => n - 1) }
    }
  }
  const move = (i: number, by: number) => setPhotos(p => { const n = [...p]; const j = i + by; if (j < 0 || j >= n.length) return p; [n[i], n[j]] = [n[j], n[i]]; return n })

  const fromProduct = (p: Product) => {
    if (!title.trim()) setTitle(p.name)
    if (!price && p.price) setPrice(String(p.price))
    if (p.image && !photos.includes(p.image)) setPhotos(ph => (ph.length < MAX_PHOTOS ? [p.image as string, ...ph] : ph))
    const desc = String(p.short_description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!description.trim() && desc) setDescription(desc)
    setProduct({ platform: p.source === 'shopify' ? 'shopify' : 'woocommerce', id: String(p.id), name: p.name, url: p.permalink || null })
  }

  const save = async () => {
    const c = cleanCode(code)
    if (code.trim() && !c) { setErr('The code needs 3 to 12 letters and numbers, with at least one of each, like TANK4.'); return }
    setBusy(true); setErr('')
    try {
      const body = { companyId, title, price, condition: condition || null, pickup, source, external_url: external, description, photos, product, code: c }
      const d = isNew
        ? await api('/api/listings', { method: 'POST', json: body })
        : await api(`/api/listings/${initial.id}`, { method: 'PATCH', json: body })
      onSaved(d.listing)
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="ml-scrim center" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ml-modal wide" role="dialog" aria-modal="true" aria-label={isNew ? 'New listing' : 'Edit listing'}>
        <div className="ml-modal-head">
          <span className="ml-modal-icon">{I.tag}</span>
          <div><h2>{isNew ? 'New listing' : 'Edit listing'}</h2><p>What you’re selling, as buyers will see it on its page.</p></div>
          <button type="button" className="ml-x" onClick={onClose} aria-label="Close">{I.close}</button>
        </div>

        <ProductPicker companyId={companyId} onPick={fromProduct} picked={product} onClear={() => setProduct(null)} />

        <label className="ml-field"><span>Title</span><input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. 4ft glass aquarium with stand" maxLength={120} autoFocus /></label>
        <div className="ml-two">
          <label className="ml-field"><span>Price</span><div className="ml-money"><em>$</em><input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="0" /></div></label>
          <label className="ml-field"><span>Pick up from <i>(optional)</i></span><input value={pickup} onChange={e => setPickup(e.target.value)} placeholder="e.g. Our shop, or a suburb" maxLength={120} /></label>
        </div>

        <p className="ml-label">Condition</p>
        <div className="ml-chips">
          {LISTING_CONDITIONS.map(c => <button key={c.id} type="button" className={condition === c.id ? 'on' : ''} aria-pressed={condition === c.id} onClick={() => setCondition(condition === c.id ? '' : c.id)}>{c.label}</button>)}
        </div>

        <p className="ml-label">Photos <i>({photos.length}/{MAX_PHOTOS})</i></p>
        <div className="ml-photos">
          {photos.map((p, i) => (
            <div key={p + i} className="ml-ph">
              <img src={p} alt={`Photo ${i + 1}`} />
              <div className="ml-ph-tools">
                {i > 0 && <button type="button" onClick={() => move(i, -1)} aria-label="Move earlier">‹</button>}
                {i < photos.length - 1 && <button type="button" onClick={() => move(i, 1)} aria-label="Move later">›</button>}
                <button type="button" onClick={() => setPhotos(ph => ph.filter((_, j) => j !== i))} aria-label="Remove photo">×</button>
              </div>
              {i === 0 && <span className="ml-ph-main">Main</span>}
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button type="button" className="ml-ph add" onClick={() => fileRef.current?.click()} disabled={uploading > 0}>
              {I.photo}<span>{uploading ? 'Uploading…' : 'Add photos'}</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
        </div>

        <label className="ml-field"><span>Description <i>(optional)</i></span><textarea rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="Size, what’s included, why you’re selling, anything buyers ask about." maxLength={5000} /></label>

        <p className="ml-label">Where is it listed?</p>
        <div className="ml-chips">
          {LISTING_SOURCES.map(s => <button key={s.id} type="button" className={source === s.id ? 'on' : ''} aria-pressed={source === s.id} onClick={() => setSource(s.id)}>{s.label}</button>)}
        </div>
        <div className="ml-two">
          <label className="ml-field"><span>Link to the listing <i>(optional)</i></span><input value={external} onChange={e => setExternal(e.target.value)} placeholder="https://www.facebook.com/marketplace/item/…" /></label>
          <label className="ml-field"><span>Code buyers can text</span><input value={code} onChange={e => { setCodeTouched(true); setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)) }} placeholder="TANK4" /></label>
        </div>

        {err && <p className="ml-error" role="alert">{err}</p>}
        <div className="ml-modal-foot">
          <button type="button" className="ml-soft" onClick={onClose}>Cancel</button>
          <button type="button" className="ml-primary" onClick={save} disabled={busy || !title.trim() || uploading > 0}>{busy ? 'Saving…' : isNew ? 'Create listing' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

/** Copy the details from a product in the connected WooCommerce or Shopify store. */
function ProductPicker({ companyId, onPick, picked, onClear }: { companyId: string; onPick: (p: Product) => void; picked: Listing['product']; onClear: () => void }) {
  const [store, setStore] = useState<boolean | null>(null)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    // Is a store connected? (no store → this section isn't shown)
    api(`/api/orders/products?companyId=${companyId}&q=`).then(() => setStore(true), (e: any) => setStore(e?.status === 404 ? false : true))
  }, [companyId])
  useEffect(() => {
    if (!store || q.trim().length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setBusy(true)
      try { const d = await api(`/api/orders/products?companyId=${companyId}&q=${encodeURIComponent(q.trim())}`); setResults((d.products || []).slice(0, 6).map((p: any) => ({ ...p, source: d.source === 'shopify' ? 'shopify' : 'woocommerce' }))) }
      catch { setResults([]) } finally { setBusy(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [q, store, companyId])
  if (!store) return null
  if (picked) return (
    <div className="ml-picked">
      <span>From your store: <b>{picked.name}</b>{picked.url ? ' · buyers get a Buy online button' : ''}</span>
      <button type="button" className="ml-link" onClick={onClear}>Remove</button>
    </div>
  )
  return (
    <div className="ml-prod">
      <div className="ml-search">{I.search}<input value={q} onChange={e => setQ(e.target.value)} placeholder="Copy from a product in your store (optional)" aria-label="Search your store's products" /></div>
      {(busy || results.length > 0) && (
        <ul className="ml-results">
          {busy && !results.length && <li className="ml-hint">Searching…</li>}
          {results.map(p => (
            <li key={String(p.id)}>
              <button type="button" onClick={() => { onPick(p); setQ(''); setResults([]) }}>
                {p.image ? <img src={p.image} alt="" /> : <span className="ml-noimg" />}
                <span>{p.name}</span>{p.price && <em>{priceText(Math.round(Number(p.price) * 100))}</em>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const CSS = `
.ml{max-width:1080px;margin:0 auto;padding:24px 28px 56px;color:var(--ink,#18181b)}
.ml button::before{display:none}
.ml-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:18px}
.ml-head h1{margin:0;font-size:30px;font-weight:800;letter-spacing:-.025em;line-height:1.1}
.ml-head p{margin:8px 0 0;font-size:14px;color:#71717a;line-height:1.55;max-width:660px}
.ml-primary{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:42px;padding:0 18px;border:none;border-radius:999px;background:var(--coral,#ff6a4d);color:#fff;font:inherit;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0}
.ml-primary.sm{height:36px;padding:0 14px;font-size:13.5px}
.ml-primary:disabled{opacity:.5;cursor:default}
.ml-soft{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;border:none;border-radius:999px;background:#f4f4f5;color:#18181b;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;text-decoration:none;white-space:nowrap}
.ml-soft:hover{background:#ececef}
.ml-soft.danger{color:#b91c1c}
.ml-soft:disabled{opacity:.55;cursor:default}
.ml-link{border:none;background:none;padding:0;font:inherit;font-size:13px;font-weight:700;color:var(--coral,#ff6a4d);cursor:pointer}
.ml-note{margin:0 0 16px;padding:12px 16px;border-radius:14px;background:#fff7ed;color:#9a3412;font-size:14px}
.ml-error{margin:12px 0 0;padding:10px 14px;border-radius:14px;background:#fef2f2;color:#b91c1c;font-size:13.5px}
.ml-how{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:18px}
.ml-step{display:flex;gap:12px;padding:14px 16px;border-radius:18px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06)}
.ml-step>span{flex:0 0 26px;height:26px;border-radius:999px;background:#18181b;color:#fff;display:grid;place-items:center;font-size:13px;font-weight:800}
.ml-step b{display:block;font-size:14px}
.ml-step small{display:block;margin-top:3px;font-size:12.5px;color:#71717a;line-height:1.45}
.ml-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px}
.ml-tile{padding:14px 16px;border-radius:18px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06)}
.ml-tile b{display:block;font-size:24px;font-weight:800;letter-spacing:-.02em}
.ml-tile span{font-size:13px;color:#71717a;font-weight:600}
.ml-filters{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
.ml-filters button{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 14px;border:none;border-radius:999px;background:#f4f4f5;color:#3f3f46;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer}
.ml-filters button.on{background:#18181b;color:#fff}
.ml-filters em{font-style:normal;font-size:12px;opacity:.7}
.ml-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
.ml-card{position:relative;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04);transition:box-shadow .2s,transform .2s}
.ml-card:hover{box-shadow:0 0 0 1px rgba(0,0,0,.09),0 16px 32px -24px rgba(16,24,40,.35);transform:translateY(-2px)}
.ml-card.dim .ml-thumb img{filter:grayscale(.5)}
.ml-card-hit{position:absolute;inset:0;border:0;background:none;cursor:pointer;z-index:1;border-radius:20px}
.ml-card-hit:focus-visible{outline:2px solid var(--coral,#ff6a4d);outline-offset:2px}
.ml-skel{height:290px;background:linear-gradient(90deg,#f4f4f5,#fafafa,#f4f4f5);background-size:200% 100%;animation:mlsk 1.2s infinite}
@keyframes mlsk{to{background-position:-200% 0}}
.ml-thumb{position:relative;aspect-ratio:4/3;background:#f4f4f5;display:grid;place-items:center;color:#a1a1aa;pointer-events:none}
.ml-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.ml-status{position:absolute;left:10px;top:10px;padding:4px 10px;border-radius:999px;font-size:11.5px;font-weight:800;background:#fff;color:#15803d;box-shadow:0 2px 8px rgba(0,0,0,.12)}
.ml-status.s-sold{background:#18181b;color:#fff}
.ml-status.s-hidden{color:#71717a}
.ml-body{padding:14px 16px 16px;position:relative;pointer-events:none}
.ml-body .ml-actions{position:relative;z-index:2;pointer-events:auto}
.ml-title{margin:0;font-size:15.5px;font-weight:800;letter-spacing:-.01em;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ml-meta{margin:4px 0 0;font-size:13.5px;color:#52525b;font-weight:600}
.ml-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;padding:2px 7px;border-radius:7px;background:#f4f4f5;color:#18181b}
.ml-stats{margin:8px 0 0;font-size:12.5px;color:#8e8e93}
.ml-actions{display:flex;gap:6px;margin-top:12px;flex-wrap:wrap}
.ml-empty{padding:10px 20px 30px;background:#fff;border-radius:22px;box-shadow:0 0 0 1px rgba(0,0,0,.06)}
.ml-scrim{position:fixed;inset:0;z-index:60;background:rgba(15,17,25,.36);display:flex;justify-content:flex-end;animation:mlfade .2s ease}
.ml-scrim.center{justify-content:center;align-items:center;padding:20px;z-index:70}
@keyframes mlfade{from{opacity:0}}
.ml-sheet{width:min(560px,100%);height:100%;overflow-y:auto;background:#fafafa;padding:20px 22px 40px;box-shadow:-20px 0 50px -30px rgba(0,0,0,.4);animation:mlin .28s cubic-bezier(.32,.72,0,1)}
@keyframes mlin{from{transform:translateX(30px);opacity:.6}}
.ml-sheet-top{display:flex;gap:14px;align-items:center}
.ml-sheet-thumb{flex:0 0 64px;height:64px;border-radius:16px;overflow:hidden;background:#f4f4f5;display:grid;place-items:center;color:#a1a1aa}
.ml-sheet-thumb img{width:100%;height:100%;object-fit:cover}
.ml-sheet-title{margin:0;font-size:19px;font-weight:800;letter-spacing:-.015em;line-height:1.25}
.ml-x{flex:0 0 38px;height:38px;border:none;border-radius:999px;background:#f4f4f5;display:grid;place-items:center;cursor:pointer;color:#18181b}
.ml-sheet-actions{display:flex;gap:6px;flex-wrap:wrap;margin:16px 0 0}
.ml-sold-line{margin:12px 0 0;padding:10px 14px;border-radius:14px;background:#18181b;color:#fff;font-size:13.5px}
.ml-nums{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:16px 0 0}
.ml-nums div{padding:12px;border-radius:16px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06)}
.ml-nums b{display:block;font-size:19px;font-weight:800}
.ml-nums span{font-size:12px;color:#71717a;font-weight:600}
.ml-sec{margin-top:18px;padding:16px;border-radius:20px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06)}
.ml-sec h3{margin:0 0 12px;font-size:15px;font-weight:800;display:flex;align-items:center;gap:8px}
.ml-sec h3 em{font-style:normal;font-size:12px;color:#71717a;font-weight:700}
.ml-share{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.ml-share code{flex:1;min-width:180px;font-family:inherit;font-size:14.5px;font-weight:700;padding:9px 12px;border-radius:12px;background:#f4f4f5;word-break:break-all}
.ml-block{margin-top:12px;padding:12px 14px;border-radius:14px;background:#f8f8f7}
.ml-block-h{display:flex;justify-content:space-between;gap:10px;align-items:baseline}
.ml-block-h b{font-size:13px}
.ml-block p{margin:6px 0 0;font-size:13.5px;line-height:1.5;color:#3f3f46;white-space:pre-wrap;word-break:break-word}
.ml-hint{margin:12px 0 0;font-size:13px;line-height:1.5;color:#71717a}
.ml-hint b{color:#18181b}
.ml-people{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.ml-people li{display:flex;align-items:center;gap:10px;padding:10px;border-radius:14px;background:#f8f8f7}
.ml-av{flex:0 0 34px;height:34px;border-radius:999px;background:#18181b;color:#fff;display:grid;place-items:center;font-weight:800;font-size:14px}
.ml-av.muted{background:#e4e4e7;color:#52525b}
.ml-pname{margin:0;font-size:14px;font-weight:700;display:flex;align-items:center;gap:8px}
.ml-plast{margin:2px 0 0;font-size:12.5px;color:#71717a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ml-bought{font-size:11px;font-weight:800;padding:2px 8px;border-radius:999px;background:#dcfce7;color:#15803d}
.ml-skel-line{height:52px;border-radius:14px;background:#f4f4f5}
.ml-modal{width:min(460px,100%);max-height:calc(100vh - 40px);overflow-y:auto;background:#fff;border-radius:24px;padding:22px;box-shadow:0 30px 80px -30px rgba(0,0,0,.45);animation:mlpop .22s cubic-bezier(.32,.72,0,1)}
.ml-modal.wide{width:min(640px,100%)}
@keyframes mlpop{from{transform:scale(.97);opacity:.4}}
.ml-modal h2{margin:0;font-size:20px;font-weight:800;letter-spacing:-.015em}
.ml-modal-head{display:flex;gap:12px;align-items:flex-start;margin-bottom:14px}
.ml-modal-head p{margin:3px 0 0;font-size:13.5px;color:#71717a}
.ml-modal-head .ml-x{margin-left:auto}
.ml-modal-icon{flex:0 0 44px;height:44px;border-radius:14px;background:linear-gradient(135deg,var(--coral,#ff6a4d),#ff4d8d);color:#fff;display:grid;place-items:center}
.ml-modal-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
.ml-label{margin:14px 0 8px;font-size:14px;font-weight:600}
.ml-label i,.ml-field i{font-style:normal;font-weight:400;color:#8e8e93}
.ml-field{display:block;margin-top:12px}
.ml-field>span{display:block;margin-bottom:6px;font-size:14px;font-weight:600}
.ml-field input,.ml-field textarea{display:block;width:100%;box-sizing:border-box;padding:11px 14px;border:1.5px solid transparent;border-radius:12px;background:#f4f4f5;font:inherit;font-size:14.5px;color:inherit;outline:none;resize:vertical}
.ml-field input:focus,.ml-field textarea:focus{background:#fff;border-color:#d4d4d8;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral,#ff6a4d) 16%,transparent)}
.ml-money{display:flex;align-items:center;border-radius:12px;background:#f4f4f5;padding-left:14px}
.ml-money em{font-style:normal;font-weight:700;color:#71717a}
.ml-money input{background:transparent!important;border:0!important;box-shadow:none!important;padding-left:6px}
.ml-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.ml-chips{display:flex;flex-wrap:wrap;gap:6px}
.ml-chips button{height:34px;padding:0 14px;border:none;border-radius:999px;background:#f4f4f5;color:#3f3f46;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer}
.ml-chips button.on{background:#18181b;color:#fff}
.ml-photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px}
.ml-ph{position:relative;aspect-ratio:1;border-radius:14px;overflow:hidden;background:#f4f4f5}
.ml-ph img{width:100%;height:100%;object-fit:cover;display:block}
.ml-ph-tools{position:absolute;right:4px;top:4px;display:flex;gap:3px}
.ml-ph-tools button{width:24px;height:24px;border:none;border-radius:999px;background:rgba(15,17,25,.7);color:#fff;font-size:15px;line-height:1;cursor:pointer;display:grid;place-items:center}
.ml-ph-main{position:absolute;left:6px;bottom:6px;padding:2px 8px;border-radius:999px;background:#fff;font-size:11px;font-weight:800}
.ml-ph.add{border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#52525b;font:inherit;font-size:12.5px;font-weight:700}
.ml-ph.add:hover{background:#ececef}
.ml-prod{position:relative;margin-bottom:4px}
.ml-search{display:flex;align-items:center;gap:8px;height:42px;padding:0 14px;border-radius:999px;background:#f4f4f5;color:#a1a1aa}
.ml-search input{flex:1;min-width:0;border:none;outline:none;background:transparent;font:inherit;font-size:14px;color:#18181b}
.ml-results{list-style:none;margin:6px 0 0;padding:6px;border-radius:16px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.08),0 16px 30px -20px rgba(0,0,0,.35)}
.ml-results button{display:flex;align-items:center;gap:10px;width:100%;padding:8px;border:none;border-radius:10px;background:none;font:inherit;font-size:13.5px;text-align:left;cursor:pointer}
.ml-results button:hover{background:#f4f4f5}
.ml-results img,.ml-noimg{flex:0 0 34px;width:34px;height:34px;border-radius:8px;object-fit:cover;background:#f4f4f5}
.ml-results span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.ml-results em{font-style:normal;color:#71717a;font-weight:700}
.ml-picked{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 14px;border-radius:14px;background:#f0fdf4;color:#166534;font-size:13.5px}
.ml-choices{display:grid;gap:6px;margin-top:12px;max-height:260px;overflow-y:auto}
.ml-choices button{display:flex;align-items:center;gap:10px;padding:10px;border:none;border-radius:14px;background:#f8f8f7;font:inherit;text-align:left;cursor:pointer;box-shadow:0 0 0 1.5px transparent}
.ml-choices button.on{background:#fff;box-shadow:0 0 0 1.5px #18181b}
.ml-choices span{display:flex;flex-direction:column;font-size:14px;font-weight:700}
.ml-choices small{font-size:12px;font-weight:500;color:#71717a}
[data-theme="dark"] .ml-step,[data-theme="dark"] .ml-tile,[data-theme="dark"] .ml-card,[data-theme="dark"] .ml-empty,[data-theme="dark"] .ml-nums div,[data-theme="dark"] .ml-sec,[data-theme="dark"] .ml-modal,[data-theme="dark"] .ml-results{background:var(--card);box-shadow:0 0 0 1px var(--border)}
[data-theme="dark"] .ml-soft,[data-theme="dark"] .ml-filters button,[data-theme="dark"] .ml-chips button,[data-theme="dark"] .ml-x,[data-theme="dark"] .ml-search,[data-theme="dark"] .ml-share code,[data-theme="dark"] .ml-code,[data-theme="dark"] .ml-money,[data-theme="dark"] .ml-ph,[data-theme="dark"] .ml-thumb,[data-theme="dark"] .ml-sheet-thumb{background:#2a2a2e;color:var(--ink)}
[data-theme="dark"] .ml-filters button.on,[data-theme="dark"] .ml-chips button.on{background:var(--ink);color:#111113}
[data-theme="dark"] .ml-block,[data-theme="dark"] .ml-people li,[data-theme="dark"] .ml-choices button{background:#232327}
[data-theme="dark"] .ml-block p,[data-theme="dark"] .ml-meta,[data-theme="dark"] .ml-hint b,[data-theme="dark"] .ml-search input,[data-theme="dark"] .ml-results span{color:var(--ink)}
[data-theme="dark"] .ml-choices button.on{background:var(--card);box-shadow:0 0 0 1.5px var(--ink)}
[data-theme="dark"] .ml-step>span,[data-theme="dark"] .ml-av{background:var(--ink);color:#111113}
[data-theme="dark"] .ml-results button:hover,[data-theme="dark"] .ml-soft:hover{background:#333338}
@media (max-width:760px){
  .ml{padding:16px 16px 48px}
  .ml-head{flex-direction:column;align-items:stretch}
  .ml-head h1{font-size:26px}
  .ml-how{grid-template-columns:minmax(0,1fr)}
  .ml-tiles,.ml-nums{grid-template-columns:repeat(2,minmax(0,1fr))}
  .ml-two{grid-template-columns:minmax(0,1fr)}
  .ml-sheet{padding:16px 16px 40px}
}
`
