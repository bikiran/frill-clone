'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { XIcon, TagIcon } from '@/components/booking/icons'
import { authFetch } from '@/lib/auth-fetch'

// "Add to waitlist" dialog — shared by the Waitlists page and the inbox
// contact panel (where it's pre-filled with the customer being chatted to).

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const t = data?.session?.access_token
  return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
}

export default function WaitlistAddModal({ companyId, onClose, onAdded, presetContact, conversationId }: {
  companyId: string
  onClose: () => void
  onAdded: (duplicate: boolean) => void
  presetContact?: { id: string; name?: string | null; phone?: string | null; email?: string | null } | null
  conversationId?: string | null
}) {
  const [contact, setContact] = useState<any>(presetContact || null)
  const [cq, setCq] = useState('')
  const [contacts, setContacts] = useState<any[]>([])
  const [manualName, setManualName] = useState('')
  const [manualPhone, setManualPhone] = useState('')
  const [pq, setPq] = useState('')
  const [products, setProducts] = useState<any[]>([])
  const [product, setProduct] = useState<any>(null)
  const [customItem, setCustomItem] = useState('')
  // Variable products (sizes etc.): the customer waits for ONE variation, like
  // a sign-up from the website. null = still loading, [] = none / not variable.
  const [variations, setVariations] = useState<any[] | null>([])
  const [variation, setVariation] = useState<any | 'any' | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // Contact search
  useEffect(() => {
    if (contact || cq.trim().length < 2) { setContacts([]); return }
    const t = setTimeout(async () => {
      const q = cq.trim().replace(/[%,()]/g, ' ')
      const { data } = await (supabase as any).from('contacts').select('id, name, phone, email')
        .eq('company_id', companyId).or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`).limit(8)
      setContacts(data || [])
    }, 250)
    return () => clearTimeout(t)
  }, [cq, contact, companyId])

  // Product search (the synced WooCommerce or Shopify catalogue)
  useEffect(() => {
    if (product || pq.trim().length < 2) { setProducts([]); return }
    const t = setTimeout(async () => {
      try {
        const res = await authFetch(`/api/orders/products?companyId=${companyId}&q=${encodeURIComponent(pq.trim())}`)
        const d = await res.json()
        setProducts((d.products || []).slice(0, 8))
      } catch { setProducts([]) }
    }, 300)
    return () => clearTimeout(t)
  }, [pq, product, companyId])

  // Load the sizes/options when a variable product is picked.
  useEffect(() => {
    setVariation(null)
    if (!product?.has_variations) { setVariations([]); return }
    let alive = true
    setVariations(null)
    authFetch(`/api/orders/products?companyId=${companyId}&productId=${product.id}`)
      .then(r => r.json()).then(d => { if (alive) setVariations(Array.isArray(d.variations) ? d.variations : []) })
      .catch(() => { if (alive) setVariations([]) })
    return () => { alive = false }
  }, [product, companyId])

  // "Size: 1-2cm, Colour: Blue" → "1-2cm / Blue"
  const optionLabel = (v: any) => String(v?.attributes || '').split(',').map((a: string) => a.split(':').slice(1).join(':').trim() || a.trim()).filter(Boolean).join(' / ') || `#${v?.id}`
  const money = (v: any) => { const n = parseFloat(String(v ?? '')); return isFinite(n) && n > 0 ? `$${n.toFixed(2)}` : '' }
  const needsVariation = !!product?.has_variations && Array.isArray(variations) && variations.length > 0

  const submit = async () => {
    setErr('')
    if (needsVariation && !variation) { setErr('Choose which size they want (or “Any size”).'); return }
    const picked = variation && variation !== 'any' ? variation : null
    const itemName = product ? (picked ? `${product.name} - ${optionLabel(picked)}` : product.name) : customItem.trim()
    if (!itemName) { setErr('Pick a product, or type the item they want.'); return }
    if (!contact && !manualPhone.trim()) { setErr('Pick a customer, or enter a mobile number.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({
          companyId, itemName,
          ...(product?.source === 'shopify'
            ? { shopifyProductId: product.id, shopifyVariantId: picked?.id || null }
            : { wooProductId: picked?.id || product?.id || null }),
          itemImage: picked?.image || product?.image || null, itemUrl: product?.permalink || null,
          contactId: contact?.id || null, conversationId: conversationId || null,
          customerName: contact ? null : (manualName.trim() || null), phone: contact ? null : manualPhone.trim(),
          note: note.trim() || null, source: conversationId ? 'inbox' : 'manual',
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not add')
      onAdded(!!d.duplicate)
    } catch (e: any) { setErr(e.message) } finally { setSaving(false) }
  }

  const initial = (n?: string | null) => (n || '?').trim().charAt(0).toUpperCase() || '?'

  return (
    <div className="wla-scrim" onClick={() => !saving && onClose()}>
      <style>{WLA_CSS}</style>
      <div className="wla" role="dialog" aria-modal="true" aria-labelledby="wla-title" onClick={e => e.stopPropagation()}>
        <div className="wla-head">
          <span className="wla-badge" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id="wla-title">Add to waitlist</h2>
            <p>They’ll get one text when it’s back in stock.</p>
          </div>
          <button type="button" className="wla-x" onClick={onClose} disabled={saving} aria-label="Close"><XIcon size={14} /></button>
        </div>

        <span className="wla-lbl">Customer</span>
        {contact ? (
          <div className="wla-chosen">
            <span className="wla-av" aria-hidden>{initial(contact.name)}</span>
            <div className="wla-chosen-t">
              <b>{contact.name || 'Customer'}</b>
              <small>{[contact.phone, contact.email].filter(Boolean).join(' · ') || 'No phone or email'}</small>
            </div>
            {!presetContact && <button type="button" className="wla-change" onClick={() => setContact(null)}>Change</button>}
          </div>
        ) : (
          <>
            <label className="wla-search">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input className="wla-in" value={cq} onChange={e => setCq(e.target.value)} placeholder="Search contacts by name, phone or email" aria-label="Search contacts" autoFocus />
            </label>
            {contacts.length > 0 && (
              <div className="wla-list">
                {contacts.map(c => (
                  <button key={c.id} type="button" className="wla-opt" onClick={() => { setContact(c); setCq('') }}>
                    <span className="wla-av sm" aria-hidden>{initial(c.name)}</span>
                    <span className="wla-opt-t"><b>{c.name || 'Unnamed'}</b><small>{[c.phone, c.email].filter(Boolean).join(' · ')}</small></span>
                  </button>
                ))}
              </div>
            )}
            <p className="wla-hint">Not a contact yet? Enter their details:</p>
            <div className="wla-two">
              <input className="wla-in wla-field" value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Name" aria-label="Name" />
              <input className="wla-in wla-field" value={manualPhone} onChange={e => setManualPhone(e.target.value)} placeholder="Mobile" aria-label="Mobile" inputMode="tel" />
            </div>
          </>
        )}

        <span className="wla-lbl">Item they want</span>
        {product ? (
          <div className="wla-chosen">
            {product.image ? <img src={product.image} alt="" className="wla-img" /> : <span className="wla-img ph" aria-hidden><TagIcon size={16} /></span>}
            <div className="wla-chosen-t">
              <b>{product.name}</b>
              {product.has_variations
                ? <small>{variation && variation !== 'any' ? optionLabel(variation) : 'Has sizes, choose one below'}</small>
                : <small className={product.stock_status === 'instock' ? 'ok' : 'out'}>{product.stock_status === 'instock' ? 'Currently in stock' : 'Out of stock'}</small>}
            </div>
            <button type="button" className="wla-change" onClick={() => setProduct(null)}>Change</button>
          </div>
        ) : null}
        {product?.has_variations && (
          <div className="wla-sizes">
            <span className="wla-sub">Choose a size</span>
            {variations === null ? (
              <div className="wla-chips">{[0, 1, 2].map(i => <span key={i} className="wla-sk" />)}</div>
            ) : variations.length === 0 ? (
              <p className="wla-hint" style={{ margin: 0 }}>Couldn’t load the sizes from your store. They’ll be added for the product as a whole.</p>
            ) : (
              <div role="radiogroup" aria-label="Size" className="wla-chips">
                {[...variations, 'any' as const].map((v: any) => {
                  const on = v === 'any' ? variation === 'any' : (variation !== 'any' && variation?.id === v.id)
                  const inStock = v !== 'any' && v.stock_status === 'instock'
                  return (
                    <button key={v === 'any' ? 'any' : v.id} type="button" role="radio" aria-checked={on} className={`wla-size${on ? ' on' : ''}`} onClick={() => { setVariation(v); setErr('') }}>
                      <b>{v === 'any' ? 'Any size' : optionLabel(v)}</b>
                      <small className={v === 'any' ? '' : inStock ? 'ok' : 'out'}>
                        {v === 'any' ? 'Whichever comes in' : `${money(v.price) ? money(v.price) + ' · ' : ''}${inStock ? 'In stock' : 'Out of stock'}`}
                      </small>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
        {!product && (
          <>
            <label className="wla-search">
              <TagIcon size={15} />
              <input className="wla-in" value={pq} onChange={e => { setPq(e.target.value); setCustomItem(e.target.value) }} placeholder="Search your products, e.g. Diamond Eye Molly" aria-label="Search products" />
            </label>
            {products.length > 0 && (
              <div className="wla-list">
                {products.map(p => (
                  <button key={p.id} type="button" className="wla-opt" onClick={() => { setProduct(p); setPq('') }}>
                    {p.image ? <img src={p.image} alt="" className="wla-img sm" /> : <span className="wla-img sm ph" aria-hidden><TagIcon size={14} /></span>}
                    <span className="wla-opt-t"><b>{p.name}</b></span>
                    {p.has_variations && <span className="wla-tag">Sizes</span>}
                    <span className={`wla-stock ${p.stock_status === 'instock' ? 'ok' : 'out'}`}>{p.stock_status === 'instock' ? 'In stock' : 'Out'}</span>
                  </button>
                ))}
              </div>
            )}
            {pq.trim().length >= 2 && (
              <p className="wla-hint">
                Not listed online? Keep the typed name, <b>“{pq.trim()}”</b>, and press <b>Notify now</b> when it arrives.
              </p>
            )}
          </>
        )}

        <span className="wla-lbl">Note <em>optional</em></span>
        <input className="wla-in wla-field" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. wants a pair, male + female" aria-label="Note" />

        {err && <p className="wla-err" role="alert">{err}</p>}
        <div className="wla-foot">
          <button type="button" className="wla-btn ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="wla-btn go" onClick={submit} disabled={saving}>{saving ? 'Adding…' : 'Add to waitlist'}</button>
        </div>
      </div>
    </div>
  )
}

const WLA_CSS = `
.wla-scrim{position:fixed;inset:0;z-index:3000;background:rgba(15,15,20,.42);display:flex;align-items:center;justify-content:center;padding:16px;animation:wlaFade .18s ease both}
.wla{--f:#f4f4f5;--f2:#ececef;--mut:#71717a;--soft:#8e8e93;width:min(540px,100%);max-height:min(92vh,860px);overflow-y:auto;background:var(--card,#fff);border-radius:26px;padding:22px 22px 20px;box-shadow:0 30px 80px -20px rgba(0,0,0,.35),0 0 0 1px rgba(0,0,0,.05);animation:wlaIn .26s cubic-bezier(.22,1,.36,1) both}
[data-theme="dark"] .wla{--f:#2a2a2e;--f2:#333337;--mut:#a1a1aa;--soft:#8b8b90}
.wla button::before{display:none!important}
.wla-head{display:flex;align-items:flex-start;gap:13px;margin-bottom:6px}
.wla-badge{width:42px;height:42px;flex-shrink:0;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--coral) 13%,var(--card,#fff));color:var(--coral)}
.wla-head h2{margin:1px 0 0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:21px;font-weight:700;letter-spacing:-.03em;color:var(--ink)}
.wla-head p{margin:3px 0 0;font-size:13.5px;color:var(--mut)}
.wla-x{width:34px;height:34px;flex-shrink:0;border:none;border-radius:50%;background:var(--f);color:var(--mut);display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.wla-x:hover{background:var(--f2);color:var(--ink)}
.wla-lbl{display:block;margin:18px 0 8px;font-size:13px;font-weight:650;color:var(--ink)}
.wla-lbl em{font-style:normal;font-weight:500;color:var(--soft);margin-left:4px}
.wla-sub{display:block;margin:12px 0 8px;font-size:12.5px;font-weight:600;color:var(--mut)}
.wla-search{display:flex;align-items:center;gap:9px;height:46px;padding:0 15px;border-radius:14px;background:var(--f);color:var(--soft);border:1.5px solid transparent;transition:background .15s,border-color .15s}
.wla-search:focus-within{background:var(--card,#fff);border-color:var(--f2)}
.wla .wla-search .wla-in{flex:1;min-width:0;height:100%;padding:0;border:none!important;background:transparent!important;box-shadow:none!important;outline:none;font:inherit;font-size:14.5px;color:var(--ink)!important}
.wla .wla-field{width:100%;height:46px;padding:0 15px;border-radius:14px;border:1.5px solid transparent!important;background:var(--f)!important;box-shadow:none!important;outline:none;font:inherit;font-size:14.5px;color:var(--ink)!important;box-sizing:border-box;transition:background .15s,border-color .15s}
.wla .wla-field:focus{background:var(--card,#fff)!important;border-color:var(--f2)!important}
.wla-in::placeholder{color:var(--soft)}
.wla-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.wla-hint{margin:10px 2px 8px;font-size:12.5px;line-height:1.5;color:var(--mut)}
.wla-hint b{color:var(--ink)}
.wla-list{margin-top:6px;padding:5px;border-radius:16px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 12px 30px -12px rgba(15,23,42,.2)}
.wla-opt{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:7px 9px;border:none;border-radius:11px;background:none;font:inherit;text-align:left;cursor:pointer;color:var(--ink)}
.wla-opt:hover,.wla-opt:focus-visible{background:var(--f);outline:none}
.wla-opt-t{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.3}
.wla-opt-t b{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wla-opt-t small{font-size:12px;color:var(--soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wla-chosen{display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:16px;background:var(--f)}
.wla-chosen-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.wla-chosen-t b{font-size:14.5px;font-weight:650;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wla-chosen-t small{font-size:12.5px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wla .ok{color:#16a34a}.wla .out{color:#dc2626}
.wla-av{width:38px;height:38px;flex-shrink:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:#6366f1;color:#fff;font-size:15px;font-weight:700}
.wla-av.sm{width:28px;height:28px;font-size:12px}
.wla-img{width:42px;height:42px;flex-shrink:0;border-radius:12px;object-fit:cover;background:var(--card,#fff)}
.wla-img.sm{width:30px;height:30px;border-radius:8px}
.wla-img.ph{display:inline-flex;align-items:center;justify-content:center;color:var(--soft)}
.wla-change{height:32px;padding:0 13px;flex-shrink:0;border:none;border-radius:999px;background:var(--card,#fff);color:var(--ink);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;box-shadow:0 0 0 1px rgba(0,0,0,.06)}
.wla-change:hover{background:var(--f2)}
.wla-tag{flex-shrink:0;padding:2px 8px;border-radius:999px;background:var(--f);font-size:11px;font-weight:650;color:var(--mut)}
.wla-stock{flex-shrink:0;font-size:11.5px;font-weight:650}
.wla-chips{display:flex;flex-wrap:wrap;gap:6px}
.wla-size{display:flex;flex-direction:column;align-items:flex-start;gap:1px;padding:8px 13px;border:none;border-radius:14px;background:var(--f);font:inherit;text-align:left;cursor:pointer;transition:background .15s,box-shadow .15s}
.wla-size:hover{background:var(--f2)}
.wla-size.on{background:var(--card,#fff);box-shadow:0 0 0 2px var(--ink)}
.wla-size b{font-size:13.5px;font-weight:650;color:var(--ink)}
.wla-size small{font-size:11.5px;color:var(--mut)}
.wla-sk{width:96px;height:48px;border-radius:14px;background:var(--f);animation:wlaPulse 1.2s ease-in-out infinite}
.wla-err{margin:14px 0 0;padding:10px 13px;border-radius:12px;background:#fef2f2;color:#b91c1c;font-size:13px}
.wla-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:22px}
.wla-btn{height:46px;padding:0 20px;border:none;border-radius:999px;font:inherit;font-size:14.5px;font-weight:650;cursor:pointer;white-space:nowrap;transition:filter .15s,background .15s}
.wla-btn.ghost{background:var(--f);color:var(--ink)}
.wla-btn.ghost:hover{background:var(--f2)}
.wla-btn.go{background:var(--coral);color:#fff}
.wla-btn.go:hover{filter:brightness(.95)}
.wla-btn:disabled{opacity:.55;cursor:default}
.wla :focus-visible{outline:2px solid var(--coral);outline-offset:2px}
@media (max-width:560px){
  .wla-scrim{align-items:flex-end;padding:0}
  .wla{width:100%;border-radius:26px 26px 0 0;max-height:92vh;padding:20px 16px calc(16px + env(safe-area-inset-bottom));animation-name:wlaUp}
  .wla-foot .wla-btn{flex:1}
}
@keyframes wlaFade{from{opacity:0}to{opacity:1}}
@keyframes wlaIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
@keyframes wlaUp{from{transform:translateY(40px);opacity:.6}to{transform:none;opacity:1}}
@keyframes wlaPulse{0%,100%{opacity:1}50%{opacity:.5}}
@media (prefers-reduced-motion:reduce){.wla-scrim,.wla,.wla-sk{animation:none}}
`
