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

  // Product search (synced WooCommerce catalogue)
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
          wooProductId: picked?.id || product?.id || null, itemImage: picked?.image || product?.image || null, itemUrl: product?.permalink || null,
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

  const row: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13.5, color: 'var(--ink)', fontFamily: 'inherit' }
  const chosen: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--canvas)' }

  return (
    <div onClick={() => !saving && onClose()} style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(520px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 16, padding: 22, boxShadow: '0 24px 70px rgba(0,0,0,0.25)' }}>
        <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 17, color: 'var(--ink)' }}>Add to waitlist</p>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--slate)' }}>They'll get one text when it's back in stock.</p>

        <label style={lbl}>Customer</label>
        {contact ? (
          <div style={chosen}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{contact.name || 'Customer'}</div>
              <div style={{ fontSize: 12, color: 'var(--slate)' }}>{[contact.phone, contact.email].filter(Boolean).join(' · ') || 'No phone or email'}</div>
            </div>
            {!presetContact && <button onClick={() => setContact(null)} style={{ ...iconBtn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><XIcon size={13} /></button>}
          </div>
        ) : (
          <>
            <input value={cq} onChange={e => setCq(e.target.value)} placeholder="Search contacts by name, phone or email…" style={inp} autoFocus />
            {contacts.length > 0 && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, marginTop: 6, overflow: 'hidden' }}>
                {contacts.map(c => (
                  <button key={c.id} onClick={() => { setContact(c); setCq('') }} style={row}>
                    <b>{c.name || 'Unnamed'}</b> <span style={{ color: 'var(--slate)', fontSize: 12 }}>{[c.phone, c.email].filter(Boolean).join(' · ')}</span>
                  </button>
                ))}
              </div>
            )}
            <p style={{ fontSize: 12, color: 'var(--slate)', margin: '10px 0 6px' }}>Not a contact yet? Enter their details:</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Name" style={inp} />
              <input value={manualPhone} onChange={e => setManualPhone(e.target.value)} placeholder="Mobile" style={inp} />
            </div>
          </>
        )}

        <label style={{ ...lbl, marginTop: 18 }}>Item they want</label>
        {product ? (
          <div style={chosen}>
            {product.image ? <img src={product.image} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} /> : <span><TagIcon size={16} /></span>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{product.name}</div>
              {product.has_variations
                ? <div style={{ fontSize: 12, color: 'var(--slate)' }}>{variation && variation !== 'any' ? optionLabel(variation) : 'Has sizes — choose one below'}</div>
                : <div style={{ fontSize: 12, color: product.stock_status === 'instock' ? '#059669' : '#dc2626' }}>{product.stock_status === 'instock' ? 'Currently in stock' : 'Out of stock'}</div>}
            </div>
            <button onClick={() => setProduct(null)} style={{ ...iconBtn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><XIcon size={13} /></button>
          </div>
        ) : null}
        {product?.has_variations && (
          <div style={{ marginTop: 10 }}>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--slate)', marginBottom: 6 }}>Choose a size</span>
            {variations === null ? (
              <div style={{ display: 'flex', gap: 6 }}>{[0, 1, 2].map(i => <span key={i} style={{ width: 92, height: 46, borderRadius: 10, background: 'var(--canvas)', animation: 'wlPulse 1.2s ease-in-out infinite' }} />)}</div>
            ) : variations.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--slate)', margin: 0 }}>Couldn’t load the sizes from your store — they’ll be added for the product as a whole.</p>
            ) : (
              <div role="radiogroup" aria-label="Size" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[...variations, 'any' as const].map((v: any) => {
                  const on = v === 'any' ? variation === 'any' : (variation !== 'any' && variation?.id === v.id)
                  const inStock = v !== 'any' && v.stock_status === 'instock'
                  return (
                    <button key={v === 'any' ? 'any' : v.id} type="button" role="radio" aria-checked={on} onClick={() => { setVariation(v); setErr('') }}
                      style={{ textAlign: 'left', padding: '7px 11px', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${on ? 'var(--coral)' : 'var(--border)'}`, background: on ? 'var(--peach)' : '#fff', transition: 'border-color .15s, background .15s', fontFamily: 'inherit' }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{v === 'any' ? 'Any size' : optionLabel(v)}</span>
                      <span style={{ display: 'block', fontSize: 11, color: v === 'any' ? 'var(--slate)' : inStock ? '#059669' : '#dc2626' }}>
                        {v === 'any' ? 'Whichever comes in' : `${money(v.price) ? money(v.price) + ' · ' : ''}${inStock ? 'In stock' : 'Out of stock'}`}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            <style>{`@keyframes wlPulse { 0%,100% { opacity: 1 } 50% { opacity: .5 } }`}</style>
          </div>
        )}
        {!product && (
          <>
            <input value={pq} onChange={e => { setPq(e.target.value); setCustomItem(e.target.value) }} placeholder="Search your products, e.g. Diamond Eye Molly…" style={inp} />
            {products.length > 0 && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, marginTop: 6, overflow: 'hidden' }}>
                {products.map(p => (
                  <button key={p.id} onClick={() => { setProduct(p); setPq('') }} style={{ ...row, display: 'flex', alignItems: 'center', gap: 10 }}>
                    {p.image ? <img src={p.image} alt="" style={{ width: 30, height: 30, borderRadius: 6, objectFit: 'cover' }} /> : <span style={{ width: 30, textAlign: 'center' }}><TagIcon size={16} /></span>}
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    {p.has_variations && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--slate)', background: 'var(--canvas)', borderRadius: 999, padding: '2px 7px' }}>Sizes</span>}
                    <span style={{ fontSize: 11, fontWeight: 700, color: p.stock_status === 'instock' ? '#059669' : '#dc2626' }}>{p.stock_status === 'instock' ? 'In stock' : 'Out'}</span>
                  </button>
                ))}
              </div>
            )}
            {pq.trim().length >= 2 && (
              <p style={{ fontSize: 12, color: 'var(--slate)', margin: '8px 0 0' }}>
                Not listed online? Keep the typed name — <b>“{pq.trim()}”</b> — and press <b>Notify now</b> when it arrives.
              </p>
            )}
          </>
        )}

        <label style={{ ...lbl, marginTop: 18 }}>Note (optional)</label>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. wants a pair, male + female" style={inp} />

        {err && <p style={{ fontSize: 12.5, color: '#dc2626', margin: '12px 0 0' }}>{err}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button onClick={onClose} disabled={saving} style={btnGhost}>Cancel</button>
          <button onClick={submit} disabled={saving} style={btnPrimary}>{saving ? 'Adding…' : 'Add to waitlist'}</button>
        </div>
      </div>
    </div>
  )
}

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13.5, outline: 'none', boxSizing: 'border-box', background: '#fff', color: 'var(--ink)' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 6 }
const btnPrimary: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }
const btnGhost: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }
const iconBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--slate)', flexShrink: 0 }
