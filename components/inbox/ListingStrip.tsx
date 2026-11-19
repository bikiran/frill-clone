'use client'

import { useEffect, useId, useState } from 'react'
import { api } from '@/components/booking/admin/shared'
import { priceText, sourceLabel } from '@/lib/listings'
import { confirmDialog } from '@/components/ConfirmDialog'

// The Marketplace listing a conversation is about (conversations.listing_id,
// lib/listings.ts), above the thread. Folded to one slim line by default, under
// the orders line and in the same style, so it never stands between you and
// the chat: the photo, "Asking about", the title and price. Click it to open
// the listing's details, "Sold to them" (or "Bought it", which undoes) and a
// way to the listing. Open or folded is remembered. The web twin of the
// mobile app's components/ListingStrip.

type L = { id: string; title: string; code: string; price_cents: number | null; currency: string; photos: string[]; source: string; status: string; url: string | null; sold_conversation_id: string | null }

const cache = new Map<string, L>()

const OPEN_KEY = 'colvy:listingStripOpen'
const readOpen = () => { try { return localStorage.getItem(OPEN_KEY) === '1' } catch { return false } }
const saveOpen = (v: boolean) => { try { localStorage.setItem(OPEN_KEY, v ? '1' : '0') } catch { /* private window */ } }

export default function ListingStrip({ companyId, listingId, conversationId, customerName }: {
  companyId: string | null | undefined
  listingId: string | null | undefined
  conversationId: string
  customerName?: string | null
}) {
  const [l, setL] = useState<L | null>(listingId ? cache.get(listingId) || null : null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const bodyId = useId()

  useEffect(() => { setOpen(readOpen()) }, [])

  useEffect(() => {
    setErr('')
    if (!listingId || !companyId) { setL(null); return }
    setL(cache.get(listingId) || null)
    let live = true
    api(`/api/listings/${listingId}?companyId=${companyId}`)
      .then(d => { if (live && d.listing) { cache.set(listingId, d.listing); setL(d.listing) } })
      .catch(() => { /* deleted listing: no strip */ })
    return () => { live = false }
  }, [listingId, companyId])

  if (!l || !companyId) return null
  const state = l.status === 'sold' ? (l.sold_conversation_id === conversationId ? 'bought' : 'sold') : 'open'
  const price = priceText(l.price_cents, l.currency)
  const who = (customerName || '').trim().split(/\s+/)[0] || 'them'
  const photo = l.photos?.[0]

  const toggle = () => { const next = !open; setOpen(next); saveOpen(next) }

  const post = async (json: Record<string, unknown>) => {
    setBusy(true); setErr('')
    try {
      const d = await api(`/api/listings/${l.id}/sold`, { method: 'POST', json: { companyId, ...json } })
      if (d.listing) { cache.set(l.id, d.listing); setL(d.listing) }
    } catch (e: any) { setErr(e.message || 'Couldn’t save that. Try again.') } finally { setBusy(false) }
  }
  const sold = async () => {
    const ok = await confirmDialog({
      title: `Sold to ${who}?`,
      message: `“${l.title}” is marked sold to ${who}${price ? ` for ${price}` : ''}, and the sale counts on the listing.`,
      confirmLabel: 'Sold',
    })
    if (ok) void post({ conversationId })
  }
  const undo = async () => {
    const ok = await confirmDialog({ title: 'Not sold after all?', message: 'The listing goes back up for sale.', confirmLabel: 'Back up for sale', tone: 'danger' })
    if (ok) void post({ undo: true })
  }

  return (
    <div className={`lst${open ? ' on' : ''}`} role="region" aria-label={`Asking about ${l.title}`}>
      <style>{CSS}</style>
      <button type="button" className="lst-line" onClick={toggle} aria-expanded={open} aria-controls={bodyId}>
        {photo ? <img className="lst-th" src={photo} alt="" /> : <span className="lst-th lst-noimg" aria-hidden>{TAG}</span>}
        <span className="lst-k">Asking about</span>
        <span className="lst-t">{l.title}</span>
        {state === 'bought' ? <span className="lst-badge got">Bought</span>
          : state === 'sold' ? <span className="lst-badge">Sold</span>
          : price ? <span className="lst-p">{price}</span> : null}
        <svg className="lst-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="6 9 12 15 18 9" /></svg>
      </button>

      {/* Grows from nothing to its own height (grid rows 0fr → 1fr); out of the tab order while folded. */}
      <div className="lst-fold" id={bodyId} inert={!open}>
        <div className="lst-clip">
          <div className="lst-body">
            <div className="lst-top">
              {photo ? <img className="lst-img" src={photo} alt="" /> : <span className="lst-img lst-noimg" aria-hidden>{TAG}</span>}
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="lst-kick">{sourceLabel(l.source)}{l.code ? ` · ${l.code}` : ''}</p>
                <p className="lst-title">{l.title}</p>
              </div>
            </div>
            <div className="lst-acts">
              {state === 'bought' ? (
                <button type="button" className="lst-b got" onClick={undo} disabled={busy} title="Not sold after all? Put it back up for sale">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>
                  {busy ? 'Saving…' : 'Bought it'}
                </button>
              ) : state === 'sold' ? (
                <span className="lst-b gone">Sold to someone else</span>
              ) : (
                <button type="button" className="lst-b go" onClick={sold} disabled={busy}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /><path d="m9.5 14 2 2 3.5-4" /></svg>
                  {busy ? 'Saving…' : 'Sold to them'}
                </button>
              )}
              <a className="lst-b" href={`/admin/listings?id=${l.id}`}>
                Listing
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
              </a>
              {price && state !== 'open' && <span className="lst-price">{price}</span>}
            </div>
            {err && <p className="lst-err" role="alert">{err}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

const TAG = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><circle cx="8" cy="8" r="1.5" /></svg>
)

const CSS = `
.lst{--lst-bg:#fff7f3;--lst-k:#c2410c;background:var(--lst-bg);border-bottom:1px solid var(--border)}
[data-theme="dark"] .lst{--lst-bg:color-mix(in srgb,#ff6a4d 8%,var(--card,#18181b));--lst-k:#fb923c}
.lst-line{display:flex;align-items:center;gap:7px;width:100%;min-width:0;padding:6px 16px;border:none;background:none;cursor:pointer;text-align:left;font-family:inherit;color:var(--ink)}
.lst-line:hover{background:color-mix(in srgb,#ff6a4d 5%,transparent)}
.lst-line:focus-visible{outline:2px solid var(--coral);outline-offset:-2px}
.lst-th{flex:0 0 22px;width:22px;height:22px;border-radius:6px;object-fit:cover;background:#f4f4f5}
.lst-noimg{display:inline-flex;align-items:center;justify-content:center;background:#ffe7dd;color:#c2410c}
.lst-k{flex-shrink:0;font-size:11px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:var(--lst-k)}
.lst-t{flex:1;min-width:0;font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lst-p{flex-shrink:0;font-size:13px;font-weight:800;font-variant-numeric:tabular-nums}
.lst-badge{flex-shrink:0;padding:1px 8px;border-radius:99px;font-size:10.5px;font-weight:800;background:#f4f4f5;color:#52525b}
.lst-badge.got{background:#dcfce7;color:#15803d}
.lst-chev{flex-shrink:0;color:var(--slate);transition:transform .24s cubic-bezier(.22,1,.36,1)}
.lst.on .lst-chev{transform:rotate(180deg)}
.lst-fold{display:grid;grid-template-rows:0fr;transition:grid-template-rows .28s cubic-bezier(.22,1,.36,1)}
.lst.on .lst-fold{grid-template-rows:1fr}
.lst-clip{min-height:0;overflow:hidden}
.lst-body{display:flex;flex-direction:column;gap:10px;padding:2px 16px 11px;opacity:0;transform:translateY(-6px);transition:opacity .2s ease,transform .28s cubic-bezier(.22,1,.36,1)}
.lst.on .lst-body{opacity:1;transform:none;transition-delay:.04s}
.lst-top{display:flex;align-items:center;gap:10px}
.lst-img{flex:0 0 46px;width:46px;height:46px;border-radius:12px;object-fit:cover;background:#f4f4f5}
.lst-kick{margin:0;font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--lst-k);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lst-title{margin:2px 0 0;font-size:14.5px;font-weight:800;line-height:1.3;color:var(--ink);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.lst-acts{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.lst-b{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border:none;border-radius:999px;background:var(--card,#fff);color:var(--ink);font:inherit;font-size:13px;font-weight:800;cursor:pointer;text-decoration:none;white-space:nowrap;box-shadow:0 0 0 1px rgba(0,0,0,.08);transition:transform .12s,filter .15s}
.lst-b:active:not(:disabled){transform:scale(.97)}
.lst-b.go{background:#1a1a1a;color:#fff;box-shadow:none}
.lst-b.go:hover:not(:disabled){filter:brightness(1.25)}
.lst-b.got{background:#dcfce7;color:#15803d;box-shadow:none}
.lst-b.gone{background:#f4f4f5;color:#52525b;box-shadow:none;cursor:default}
.lst-b:disabled{opacity:.6;cursor:default}
[data-theme="dark"] .lst-b{box-shadow:0 0 0 1px rgba(255,255,255,.12)}
[data-theme="dark"] .lst-b.go{background:#f4f4f5;color:#18181b}
[data-theme="dark"] .lst-b.got,[data-theme="dark"] .lst-badge.got{background:rgba(34,197,94,.16);color:#4ade80}
[data-theme="dark"] .lst-b.gone,[data-theme="dark"] .lst-badge{background:rgba(127,127,140,.18);color:#a1a1aa}
.lst-price{margin-left:auto;font-size:16px;font-weight:800;color:var(--ink);font-variant-numeric:tabular-nums}
.lst-err{margin:0;font-size:12px;color:#b91c1c}
@media (prefers-reduced-motion:reduce){.lst-fold,.lst-body,.lst-chev{transition:none}}
`
