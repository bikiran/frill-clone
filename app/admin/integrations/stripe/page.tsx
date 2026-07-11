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

      {/* Alternative: use your own Stripe API keys */}
      <div style={{ marginTop: 20, padding: 20, borderRadius: 14, border: '1px solid var(--border)', background: '#fff' }}>
        <StripeKeysOption companyId={companyId} />
      </div>

      {/* Verified website domains — for payment return URLs */}
      <div style={{ marginTop: 20, padding: 20, borderRadius: 14, border: '1px solid var(--border)', background: '#fff' }}>
        <WebsiteDomains companyId={companyId} />
      </div>

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

// Lets a business paste their own Stripe secret/publishable keys as an
// alternative to Connect. Keys are stored server-side and used to create
// Checkout sessions directly on their account.
function StripeKeysOption({ companyId }: { companyId: string | null }) {
  const [open, setOpen] = useState(false)
  const [secret, setSecret] = useState('')
  const [publishable, setPublishable] = useState('')
  const [mode, setMode] = useState<'connect' | 'keys'>('connect')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const { data } = await (supabase as any).from('companies').select('stripe_mode, stripe_publishable_key').eq('id', companyId).maybeSingle()
      if (data?.stripe_mode) setMode(data.stripe_mode)
      if (data?.stripe_publishable_key) setPublishable(data.stripe_publishable_key)
    })()
  }, [companyId])

  const save = async () => {
    if (!companyId) return
    setErr('')
    if (!secret.trim().startsWith('sk_')) { setErr('Secret key should start with "sk_".'); return }
    setSaving(true)
    try {
      await (supabase as any).from('companies').update({
        stripe_mode: 'keys',
        stripe_secret_key: secret.trim(),
        stripe_publishable_key: publishable.trim() || null,
        stripe_connected: true, // keys mode counts as connected for payments
      }).eq('id', companyId)
      setMode('keys'); setSaved(true); setSecret(''); setTimeout(() => setSaved(false), 2500)
    } catch (e: any) { setErr(e.message) } finally { setSaving(false) }
  }

  return (
    <div>
      <button onClick={() => setOpen(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: 'var(--ink)', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="9 18 15 12 9 6"/></svg>
        Prefer to use your own Stripe API keys?
      </button>
      {open && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 12.5, color: 'var(--slate)', margin: '0 0 12px', lineHeight: 1.5 }}>
            Instead of Connect, you can paste your own Stripe keys (from your Stripe Dashboard → Developers → API keys). Payments then go straight to your account. {mode === 'keys' && <strong style={{ color: '#059669' }}>Currently active.</strong>}
          </p>
          {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', margin: '0 0 10px', fontSize: 12.5, color: '#dc2626' }}>{err}</div>}
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', display: 'block', marginBottom: 5 }}>Secret key</label>
          <input type="password" value={secret} onChange={e => setSecret(e.target.value)} placeholder="sk_live_…"
            style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box', marginBottom: 10 }} />
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', display: 'block', marginBottom: 5 }}>Publishable key (optional)</label>
          <input value={publishable} onChange={e => setPublishable(e.target.value)} placeholder="pk_live_…"
            style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box', marginBottom: 12 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={save} disabled={saving} style={{ padding: '9px 18px', borderRadius: 9, background: '#635BFF', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save keys'}</button>
            {saved && <span style={{ fontSize: 12.5, color: '#059669', fontWeight: 600 }}>✓ Saved</span>}
          </div>
          <p style={{ fontSize: 11, color: '#9ca3af', margin: '10px 0 0' }}>Your secret key is stored securely and never shown in the browser again.</p>
        </div>
      )}
    </div>
  )
}

// Lets a business list the website domain(s) where their chat widget is
// embedded. Stripe Checkout success/cancel URLs return the customer to a
// verified domain here rather than the Colvy tenant subdomain.
function WebsiteDomains({ companyId }: { companyId: string | null }) {
  const [domains, setDomains] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const { data } = await (supabase as any).from('companies').select('website_domains').eq('id', companyId).maybeSingle()
      setDomains(Array.isArray(data?.website_domains) ? data.website_domains : [])
    })()
  }, [companyId])

  const clean = (d: string) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')

  const add = () => {
    const d = clean(input)
    if (!d || !d.includes('.')) return
    if (!domains.includes(d)) setDomains([...domains, d])
    setInput('')
  }
  const remove = (d: string) => setDomains(domains.filter(x => x !== d))

  const save = async () => {
    if (!companyId) return
    setSaving(true)
    try {
      await (supabase as any).from('companies').update({ website_domains: domains }).eq('id', companyId)
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch {} finally { setSaving(false) }
  }

  return (
    <div>
      <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Your website domains</p>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>
        The website(s) where your chat widget is embedded (e.g. <code>roxyaquarium.com.au</code>). After a customer pays, Stripe returns them to <code>/payment-success</code> or <code>/payment-cancelled</code> on the matching domain — not your Colvy address. Both www and non-www are accepted.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }}
          placeholder="yourbusiness.com.au"
          style={{ flex: 1, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14 }} />
        <button onClick={add} style={{ padding: '9px 16px', borderRadius: 9, background: 'var(--peach)', color: 'var(--coral)', border: 'none', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Add</button>
      </div>

      {domains.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {domains.map(d => (
            <div key={d} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'var(--canvas)', border: '1px solid var(--border)' }}>
              <code style={{ fontSize: 13, color: 'var(--ink)' }}>{d}</code>
              <button onClick={() => remove(d)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16 }}>×</button>
            </div>
          ))}
        </div>
      ) : <p style={{ fontSize: 12.5, color: 'var(--slate)', margin: '0 0 14px' }}>No domains added yet — payments will return to a Colvy-hosted result page.</p>}

      <button onClick={save} disabled={saving} style={{ padding: '9px 18px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save domains'}</button>
    </div>
  )
}
