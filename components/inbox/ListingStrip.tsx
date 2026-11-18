'use client'

import { useEffect, useState } from 'react'
import { api } from '@/components/booking/admin/shared'
import { priceText, sourceLabel } from '@/lib/listings'

// The Marketplace listing a conversation is about (conversations.listing_id,
// lib/listings.ts), above the thread: what they're asking about, its price and
// where it's listed, with "Sold to them" and a way to the listing.

type L = { id: string; title: string; code: string; price_cents: number | null; currency: string; photos: string[]; source: string; status: string; url: string | null; sold_conversation_id: string | null }

const cache = new Map<string, L>()

export default function ListingStrip({ companyId, listingId, conversationId }: { companyId: string | null | undefined; listingId: string | null | undefined; conversationId: string }) {
  const [l, setL] = useState<L | null>(listingId ? cache.get(listingId) || null : null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

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
  const soldHere = l.status === 'sold' && l.sold_conversation_id === conversationId
  const price = priceText(l.price_cents, l.currency)

  const sold = async () => {
    setBusy(true); setErr('')
    try {
      const d = await api(`/api/listings/${l.id}/sold`, { method: 'POST', json: { companyId, conversationId } })
      if (d.listing) { cache.set(l.id, d.listing); setL(d.listing) }
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="lst" role="region" aria-label="Listing this conversation is about">
      <style>{`
        .lst{display:flex;align-items:center;gap:12px;margin:8px 16px 0;padding:8px 10px 8px 8px;border-radius:16px;background:#fff7f3;box-shadow:0 0 0 1px rgba(255,106,77,.18)}
        .lst-img{flex:0 0 44px;width:44px;height:44px;border-radius:11px;object-fit:cover;background:#f4f4f5}
        .lst-t{min-width:0;flex:1}
        .lst-k{margin:0;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#c2410c}
        .lst-n{margin:1px 0 0;font-size:14px;font-weight:700;color:#18181b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .lst-n span{font-weight:600;color:#71717a}
        .lst-b{display:inline-flex;align-items:center;height:32px;padding:0 12px;border:none;border-radius:999px;background:#fff;color:#18181b;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;text-decoration:none;white-space:nowrap;box-shadow:0 0 0 1px rgba(0,0,0,.08)}
        .lst-b.go{background:#18181b;color:#fff;box-shadow:none}
        .lst-b:disabled{opacity:.6}
        .lst-sold{font-size:12px;font-weight:800;padding:4px 10px;border-radius:999px;background:#dcfce7;color:#15803d;white-space:nowrap}
        .lst-err{flex-basis:100%;margin:4px 0 0;font-size:12px;color:#b91c1c}
        @media (max-width:640px){.lst{flex-wrap:wrap}.lst-acts{width:100%;display:flex;gap:6px}}
        :root[data-theme="dark"] .lst{background:rgba(255,106,77,.08)}
        :root[data-theme="dark"] .lst-n{color:#f4f4f5}
      `}</style>
      {l.photos?.[0] ? <img className="lst-img" src={l.photos[0]} alt="" /> : <span className="lst-img" aria-hidden />}
      <div className="lst-t">
        <p className="lst-k">Asking about · {sourceLabel(l.source)}</p>
        <p className="lst-n">{l.title}{price && <span> · {price}</span>}</p>
      </div>
      <div className="lst-acts" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {soldHere ? <span className="lst-sold">Bought it</span>
          : l.status === 'sold' ? <span className="lst-sold" style={{ background: '#f4f4f5', color: '#52525b' }}>Sold</span>
          : <button type="button" className="lst-b go" onClick={sold} disabled={busy}>{busy ? 'Saving…' : 'Sold to them'}</button>}
        <a className="lst-b" href={`/admin/listings?id=${l.id}`}>Listing</a>
      </div>
      {err && <p className="lst-err" role="alert">{err}</p>}
    </div>
  )
}
