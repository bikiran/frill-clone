'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function TelnyxIntegration() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [integration, setIntegration] = useState<any>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [numberType, setNumberType] = useState<'local' | 'mobile'>('local')
  const [available, setAvailable] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [buying, setBuying] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

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
      if (cid) await loadIntegration(cid)
      setLoading(false)
    }
    init()
  }, [])

  const loadIntegration = async (cid: string) => {
    try {
      const res = await fetch(`/api/telnyx/setup?companyId=${cid}`)
      const data = await res.json()
      if (data.integration) setIntegration(data.integration)
    } catch {}
  }

  const searchNumbers = async () => {
    setSearching(true); setError(''); setAvailable([])
    try {
      const res = await fetch(`/api/telnyx/number?type=${numberType}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not search numbers')
      setAvailable(data.numbers || [])
      if ((data.numbers || []).length === 0) setError('No numbers available right now — try mobile, or check back shortly.')
    } catch (e: any) { setError(e.message) }
    setSearching(false)
  }

  const buyNumber = async (phoneNumber?: string) => {
    if (!companyId) return
    setBuying(true); setError(''); setSuccess('')
    try {
      const res = await fetch('/api/telnyx/number', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, phoneNumber }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not buy number')
      setSuccess(`🎉 Your business number ${data.phoneNumber} is live! You can now call and text customers from Colvy.`)
      setAvailable([])
      await loadIntegration(companyId)
    } catch (e: any) { setError(e.message) }
    setBuying(false)
  }

  const fmtNumber = (n: string) => {
    if (!n) return n
    const d = n.replace('+61', '')
    if (d.startsWith('4') && d.length === 9) return `+61 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
    if (d.length === 9) return `+61 ${d.slice(0, 1)} ${d.slice(1, 5)} ${d.slice(5)}`
    return n
  }

  if (loading) return <div style={{ padding: 24, color: 'var(--slate)' }}>Loading…</div>

  const hasNumber = integration?.phone_number

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 24px', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: '#00c08b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 22 }}>📞</div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Calls & SMS</h1>
          <p style={{ fontSize: 13.5, color: 'var(--slate)', margin: '2px 0 0' }}>Call customers from your browser and text them from the inbox.</p>
        </div>
        {hasNumber && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, background: '#dcfce7', color: '#059669', padding: '4px 12px', borderRadius: 20 }}>● Active</span>}
      </div>

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '11px 15px', margin: '16px 0', fontSize: 13, color: '#dc2626' }}>{error}</div>}
      {success && <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 10, padding: '11px 15px', margin: '16px 0', fontSize: 13, color: '#059669' }}>{success}</div>}

      {hasNumber ? (
        <div style={{ border: '1px solid var(--border)', borderRadius: 16, padding: 24, background: '#fff' }}>
          <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase' }}>Your business number</p>
          <p style={{ margin: '0 0 12px', fontSize: 28, fontWeight: 800, color: 'var(--ink)' }}>{fmtNumber(integration.phone_number)}</p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--slate)' }}>
            <span>✓ Browser calling</span>
            <span>✓ SMS from inbox</span>
            <span>✓ Inbound calls & texts</span>
            {integration.provisioned_by_colvy && <span>💳 ${integration.monthly_cost || 2}/month</span>}
          </div>
        </div>
      ) : (
        <div style={{ border: '2px solid var(--coral)', borderRadius: 16, padding: 24, background: 'linear-gradient(135deg, #fff9f8, #fff)' }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>Get a business number</h2>
          <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--slate)', lineHeight: 1.5 }}>
            Colvy sets up an Australian phone number for you instantly — no separate accounts, no setup. Call and text your customers right from the inbox.
          </p>

          <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
            {([['local', 'Landline', 'e.g. 02, 03, 07, 08'], ['mobile', 'Mobile', 'e.g. 04XX']] as const).map(([t, name, eg]) => (
              <button key={t} onClick={() => setNumberType(t)}
                style={{ flex: 1, padding: '12px 14px', borderRadius: 12, border: numberType === t ? '2px solid var(--coral)' : '1px solid var(--border)', background: numberType === t ? 'var(--peach)' : '#fff', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--slate)' }}>{eg}</div>
              </button>
            ))}
          </div>

          {available.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderRadius: 12, background: '#fff', border: '1px solid var(--border)', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>$2<span style={{ fontSize: 14, fontWeight: 500, color: 'var(--slate)' }}>/month</span></div>
                <div style={{ fontSize: 12.5, color: 'var(--slate)' }}>Australian {numberType} number · cancel anytime</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={searchNumbers} disabled={searching}
                  style={{ padding: '11px 18px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                  {searching ? 'Searching…' : 'Choose a number'}
                </button>
                <button onClick={() => buyNumber()} disabled={buying}
                  style={{ padding: '11px 22px', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
                  {buying ? 'Setting up…' : 'Buy Australian Number'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Pick your number:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {available.map(n => (
                  <div key={n.phone_number} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff' }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{fmtNumber(n.phone_number)}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--slate)' }}>{n.region} · ${n.monthly}/month</div>
                    </div>
                    <button onClick={() => buyNumber(n.phone_number)} disabled={buying}
                      style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      {buying ? '…' : 'Buy'}
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={() => setAvailable([])} style={{ marginTop: 10, fontSize: 12.5, color: 'var(--slate)', background: 'none', border: 'none', cursor: 'pointer' }}>← Back</button>
            </div>
          )}
        </div>
      )}

      <button onClick={() => setShowAdvanced(v => !v)} style={{ marginTop: 20, fontSize: 12.5, color: 'var(--slate)', background: 'none', border: 'none', cursor: 'pointer' }}>
        {showAdvanced ? '▾' : '▸'} Advanced: use your own Telnyx account
      </button>
      {showAdvanced && (
        <div style={{ marginTop: 12, padding: 16, borderRadius: 12, background: 'var(--canvas)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>
          Already have a Telnyx account? You can connect your own API key and number instead of buying through Colvy. Contact support to enable BYO mode for your workspace.
        </div>
      )}
    </div>
  )
}
