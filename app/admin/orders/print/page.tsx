'use client'

import { useEffect, useState } from 'react'
import { peekCompanyUser } from '@/lib/client-cache'
import OrderPrintDoc from '@/components/OrderPrintDoc'

// Standalone print page (direct-link / new-tab). The in-app flow uses the
// in-page PrintModal instead (no app-shell flash). Both render OrderPrintDoc.
export default function OrdersPrintPage() {
  const [args, setArgs] = useState<{ doc: 'packing_slip' | 'label'; companyId: string; ids: string[] } | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const doc = (p.get('doc') as any) === 'label' ? 'label' : 'packing_slip'
    const ids = (p.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean)
    const companyId = p.get('company') || peekCompanyUser()?.companyId || ''
    setArgs({ doc, companyId, ids })
  }, [])

  useEffect(() => { if (ready) { const t = setTimeout(() => { try { window.print() } catch {} }, 300); return () => clearTimeout(t) } }, [ready])

  if (!args) return null
  return (
    <div style={{ background: '#f1f5f9', minHeight: '100vh' }}>
      <div className="no-print" style={{ position: 'sticky', top: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', background: '#0f172a', color: '#fff', zIndex: 10 }}>
        <strong style={{ fontSize: 14 }}>{args.doc === 'label' ? 'Shipping Labels' : 'Packing Slips'}</strong>
        <div style={{ flex: 1 }} />
        <button onClick={() => window.print()} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Print</button>
        <button onClick={() => window.close()} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
      </div>
      <OrderPrintDoc doc={args.doc} companyId={args.companyId} ids={args.ids} onLoaded={() => setReady(true)} />
    </div>
  )
}
