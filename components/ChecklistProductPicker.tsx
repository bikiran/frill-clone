'use client'

import { useEffect, useRef, useState } from 'react'

// Product search + barcode scan for adding store products to a note's checklist.
// Mirrors the mobile "Add products" sheet: search WooCommerce by name/SKU, or
// scan a barcode (where the browser supports BarcodeDetector), then tap + to add.
// The parent owns the checklist; this only surfaces products and calls onAdd.

export type PickerProduct = { id: any; name: string; sku?: string; price?: string; image?: string | null; stock_status?: string; stock_quantity?: number | null }

export default function ChecklistProductPicker({ companyId, open, onClose, addedIds, onAdd }: {
  companyId?: string | null
  open: boolean
  onClose: () => void
  addedIds: Set<string>
  onAdd: (p: PickerProduct) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<PickerProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [scanning, setScanning] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanRaf = useRef<number | null>(null)
  const scanSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window

  // Reset when opened; stop the camera when closed/unmounted.
  useEffect(() => { if (open) { setQ(''); setResults([]); setErr('') } else { stopScan() } }, [open])
  useEffect(() => () => stopScan(), [])

  // Debounced search.
  useEffect(() => {
    if (!open) return
    const s = q.trim()
    if (s.length < 2) { setResults([]); setLoading(false); return }
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/orders/products?companyId=${companyId}&q=${encodeURIComponent(s)}`)
        const d = await res.json()
        if (!res.ok) { setErr(d?.error || 'Search failed'); setResults([]) }
        else { setErr(''); setResults(d.products || []) }
      } catch (e: any) { setErr(e?.message || 'Search failed'); setResults([]) }
      finally { setLoading(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [q, open, companyId])

  function stopScan() {
    if (scanRaf.current) { cancelAnimationFrame(scanRaf.current); scanRaf.current = null }
    try { streamRef.current?.getTracks().forEach(t => t.stop()) } catch {}
    streamRef.current = null
    setScanning(false)
  }
  async function startScan() {
    if (!scanSupported) return
    setErr('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      setScanning(true)
      const v = videoRef.current!
      v.srcObject = stream
      await v.play().catch(() => {})
      const detector = new (window as any).BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] })
      const tick = async () => {
        if (!streamRef.current) return
        try {
          const codes = await detector.detect(v)
          const val = codes?.[0]?.rawValue
          if (val) { stopScan(); setQ(String(val)) ; return }
        } catch {}
        scanRaf.current = requestAnimationFrame(tick)
      }
      scanRaf.current = requestAnimationFrame(tick)
    } catch (e: any) {
      setErr('Camera unavailable — you can still search by name or SKU.')
      stopScan()
    }
  }

  if (!open) return null
  const stockLabel = (p: PickerProduct) => p.stock_status === 'outofstock' ? 'Out of stock' : p.stock_status === 'onbackorder' ? 'On backorder' : 'In stock'

  return (
    <div onClick={() => { stopScan(); onClose() }} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(560px, 100%)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: 'var(--card)', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Add products</p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--slate)' }}>Select items to add to the checklist</p>
          </div>
          <button onClick={() => { stopScan(); onClose() }} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--slate)', padding: 6, display: 'flex' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 12, padding: '9px 12px', background: 'var(--white)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or SKU…" style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, background: 'transparent', color: 'var(--ink)' }} />
              {q && <button onClick={() => setQ('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--slate)', fontSize: 16, lineHeight: 1 }}>×</button>}
            </div>
            {scanSupported && (
              <button onClick={() => scanning ? stopScan() : startScan()} title="Scan barcode"
                style={{ flexShrink: 0, width: 44, borderRadius: 12, border: '1px solid var(--border)', background: scanning ? 'var(--coral)' : 'var(--white)', color: scanning ? '#fff' : 'var(--slate)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><line x1="7" y1="12" x2="7" y2="12" /><line x1="7" y1="8" x2="7" y2="16" /><line x1="11" y1="8" x2="11" y2="16" /><line x1="15" y1="8" x2="15" y2="16" /><line x1="17.5" y1="8" x2="17.5" y2="16" /></svg>
              </button>
            )}
          </div>
          {scanning && (
            <div style={{ marginTop: 10, position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
              <video ref={videoRef} muted playsInline style={{ width: '100%', maxHeight: 220, objectFit: 'cover', display: 'block' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ width: '70%', height: 2, background: 'var(--coral)', boxShadow: '0 0 0 100vmax rgba(0,0,0,0.15)' }} />
              </div>
              <button onClick={stopScan} style={{ position: 'absolute', top: 8, right: 8, border: 'none', borderRadius: 8, background: 'rgba(0,0,0,0.55)', color: '#fff', padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Stop</button>
            </div>
          )}
          {err && <p style={{ margin: '8px 2px 0', fontSize: 12.5, color: '#b91c1c' }}>{err}</p>}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {loading && <p style={{ padding: 16, textAlign: 'center', color: 'var(--slate)', fontSize: 13 }}>Searching…</p>}
          {!loading && q.trim().length >= 2 && results.length === 0 && !err && <p style={{ padding: 16, textAlign: 'center', color: 'var(--slate)', fontSize: 13 }}>No products found.</p>}
          {!loading && q.trim().length < 2 && <p style={{ padding: 16, textAlign: 'center', color: 'var(--slate)', fontSize: 13 }}>Type at least 2 characters, or scan a barcode.</p>}
          {results.map(p => {
            const added = addedIds.has(String(p.id))
            const oos = p.stock_status === 'outofstock'
            return (
              <div key={String(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px', borderRadius: 12 }}>
                {p.image ? <img src={p.image} alt="" style={{ width: 44, height: 44, borderRadius: 9, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }} /> : <div style={{ width: 44, height: 44, borderRadius: 9, background: 'var(--canvas)', flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3 }}>{p.name}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--slate)' }}>
                    {p.sku ? `SKU ${p.sku} · ` : ''}<span style={{ color: oos ? '#b91c1c' : '#059669', fontWeight: 600 }}>{stockLabel(p)}</span>{p.stock_quantity != null ? ` · ${p.stock_quantity} available` : ''}
                  </p>
                </div>
                {p.price != null && p.price !== '' && <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', flexShrink: 0 }}>${p.price}</span>}
                <button onClick={() => onAdd(p)} aria-label={added ? 'Add another' : 'Add'} title={added ? 'Added — add another' : 'Add'}
                  style={{ flexShrink: 0, width: 34, height: 34, borderRadius: '50%', border: added ? 'none' : '1.5px solid var(--coral)', background: added ? '#059669' : 'transparent', color: added ? '#fff' : 'var(--coral)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {added
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>}
                </button>
              </div>
            )
          })}
        </div>

        <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => { stopScan(); onClose() }} style={{ border: 'none', borderRadius: 10, background: 'var(--coral)', color: '#fff', fontWeight: 700, fontSize: 14, padding: '9px 20px', cursor: 'pointer' }}>Done</button>
        </div>
      </div>
    </div>
  )
}
