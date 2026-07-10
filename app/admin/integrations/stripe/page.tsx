'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function StripeIntegration() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { setLoading(false); return }
      let cid: string | null = null
      const h = window.location.hostname
      if (h.endsWith('.colvy.com') && h !== 'colvy.com' && h !== 'www.colvy.com') {
        const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', h.replace('.colvy.com', '')).maybeSingle()
        if (co) cid = co.id
      }
      if (!cid) {
        const { data: ownCo } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
        if (ownCo) cid = ownCo.id
      }
      setCompanyId(cid)
      if (cid) {
        try {
          const res = await fetch(`/api/stripe/connect?companyId=${cid}`)
          const data = await res.json()
          setConnected(!!data.connected)
        } catch {}
      }
      setLoading(false)
    }
    init()
  }, [])

  const connect = async () => {
    if (!companyId) return
    setConnecting(true); setError('')
    try {
      const res = await fetch('/api/stripe/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not start Stripe onboarding')
      window.location.href = data.url
    } catch (e: any) { setError(e.message); setConnecting(false) }
  }

  if (loading) return <div style={{ padding: 24, color: 'var(--slate)' }}>Loading…</div>

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 24px', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: '#635BFF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 20 }}>S</div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Stripe Payments</h1>
          <p style={{ fontSize: 13.5, color: 'var(--slate)', margin: '2px 0 0' }}>Take card payments and send invoices directly inside the chat.</p>
        </div>
        {connected && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, background: '#dcfce7', color: '#059669', padding: '4px 12px', borderRadius: 20 }}>● Connected</span>}
      </div>

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '11px 15px', margin: '16px 0', fontSize: 13, color: '#dc2626' }}>{error}</div>}

      {connected ? (
        <div style={{ border: '1px solid var(--border)', borderRadius: 16, padding: 24, background: '#fff' }}>
          <p style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Your Stripe account is connected 🎉</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13.5, color: 'var(--slate)' }}>
            <span>✓ Request payments from the chat composer</span>
            <span>✓ Send invoices via chat or a secure link (works over SMS too)</span>
            <span>✓ Customers pay by card; Stripe emails them a receipt automatically</span>
            <span>✓ Funds settle directly into your Stripe account</span>
          </div>
          <button onClick={connect} disabled={connecting} style={{ marginTop: 18, padding: '10px 18px', borderRadius: 10, background: 'var(--canvas)', border: '1px solid var(--border)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', color: 'var(--ink)' }}>
            {connecting ? 'Opening…' : 'Manage Stripe account'}
          </button>
        </div>
      ) : (
        <div style={{ border: '2px solid #635BFF', borderRadius: 16, padding: 24, background: 'linear-gradient(135deg,#f5f3ff,#fff)' }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>Connect your Stripe account</h2>
          <p style={{ margin: '0 0 18px', fontSize: 14, color: 'var(--slate)', lineHeight: 1.5 }}>
            Link your existing Stripe account (or create one in a couple of minutes) to accept card payments from customers right inside the chat. Colvy never sees or stores card numbers — payments are handled securely by Stripe.
          </p>
          <button onClick={connect} disabled={connecting} style={{ padding: '12px 24px', borderRadius: 10, background: '#635BFF', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            {connecting ? 'Redirecting…' : 'Connect with Stripe'}
          </button>
        </div>
      )}

      {/* Security note */}
      <div style={{ marginTop: 24, padding: 18, borderRadius: 12, background: 'var(--canvas)', border: '1px solid var(--border)', display: 'flex', gap: 12 }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Bank-level security</p>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.5 }}>
            All chats are encrypted and card numbers are never stored by Colvy. Payment details are captured on Stripe's PCI-DSS Level 1 certified checkout. Customers receive an official Stripe receipt after paying.
          </p>
        </div>
      </div>

      <p style={{ marginTop: 20, fontSize: 12, color: 'var(--slate)' }}>Coming soon: create orders and quotes with Prexty.</p>
    </div>
  )
}
