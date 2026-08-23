'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser } from '@/lib/client-cache'

type Carrier = { id: string; name: string; code: string | null; services: number; balance: number | null; currency: string | null }

export default function ShippingSettingsPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [accent, setAccent] = useState('var(--coral)')
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(false)
  const [provider, setProvider] = useState<string>('')
  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [enabled, setEnabled] = useState<Set<string>>(new Set())   // carrier ids to quote
  const [allByDefault, setAllByDefault] = useState(true)           // no saved selection → quote all
  const [err, setErr] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState('')

  const getMyCompanyId = async (): Promise<string | null> => {
    const peeked = peekCompanyUser()?.companyId
    if (peeked) return peeked
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) { const { data: co } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle(); return co?.id || null }
    return null
  }

  const load = useCallback(async (cid: string) => {
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      const res = await fetch(`/api/orders/carriers?companyId=${encodeURIComponent(cid)}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      const j = await res.json().catch(() => ({}))
      setConfigured(!!j.configured)
      setProvider(String(j.provider || ''))
      const cs: Carrier[] = Array.isArray(j.carriers) ? j.carriers : []
      setCarriers(cs)
      const saved: string[] = Array.isArray(j.enabledCarrierIds) ? j.enabledCarrierIds : []
      setAllByDefault(saved.length === 0)
      setEnabled(new Set(saved.length ? saved : cs.map(c => c.id)))
      if (j.error) setErr(String(j.error))
    } catch (e: any) { setErr(e?.message || String(e)) }
    setLoading(false)
  }, [])

  useEffect(() => {
    (async () => {
      const cid = await getMyCompanyId()
      if (!cid) { setLoading(false); return }
      setCompanyId(cid)
      ;(async () => { try { const { data: co } = await (supabase as any).from('companies').select('accent_color').eq('id', cid).maybeSingle(); if (co?.accent_color) setAccent(co.accent_color) } catch {} })()
      load(cid)
    })()
  }, [load])

  const toggle = (id: string) => {
    setAllByDefault(false)
    setEnabled(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const save = async () => {
    if (!companyId) return
    setSaving(true); setFlash('')
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      // If every carrier is enabled, save an empty list = "quote all" (so newly
      // connected carriers are included automatically).
      const ids = (enabled.size === carriers.length) ? [] : carriers.filter(c => enabled.has(c.id)).map(c => c.id)
      const res = await fetch('/api/orders/carriers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ companyId, enabledCarrierIds: ids }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) { setFlash(`Save failed: ${j.error || res.status}`) }
      else { setFlash('Saved'); setAllByDefault(ids.length === 0); setTimeout(() => setFlash(''), 2500) }
    } catch (e: any) { setFlash(`Error: ${e?.message || e}`) }
    setSaving(false)
  }

  const card: React.CSSProperties = { background: 'var(--card,#fff)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '22px 18px 60px' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>Shipping</h1>
      <p style={{ margin: '0 0 20px', fontSize: 13.5, color: 'var(--slate)' }}>Manage the carriers used for live rates and labels on the Orders board.</p>

      {loading ? (
        <div style={{ ...card, color: 'var(--slate)', fontSize: 13.5 }}>Loading…</div>
      ) : !configured ? (
        <div style={{ ...card }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#dc2626' }} />
            <strong style={{ fontSize: 15, color: 'var(--ink)' }}>Shipping not connected</strong>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)', lineHeight: 1.6 }}>
            Shipping rates and labels aren't set up yet. Contact support to connect your carrier accounts, then rates and labels turn on automatically on the Orders board.
          </p>
        </div>
      ) : (
        <>
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#16a34a' }} />
                <strong style={{ fontSize: 15, color: 'var(--ink)' }}>Shipping connected</strong>
              </div>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.6 }}>
              Your carrier accounts are connected. Below, choose which of them Colvy uses when quoting rates on an order.
            </p>
          </div>

          <div style={{ ...card }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <strong style={{ fontSize: 14, color: 'var(--ink)' }}>Carriers used for quoting</strong>
              <span style={{ fontSize: 11.5, color: 'var(--slate)' }}>{allByDefault ? 'All carriers' : `${enabled.size} of ${carriers.length}`}</span>
            </div>

            {err && <div style={{ padding: '9px 12px', borderRadius: 9, background: '#fef3c7', color: '#92400e', fontSize: 12.5, marginBottom: 12 }}>{err}</div>}

            {carriers.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--slate)', margin: 0 }}>No carriers connected yet. Contact support to add a carrier, then refresh.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {carriers.map(c => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 11, border: `1.5px solid ${enabled.has(c.id) ? accent : 'var(--border)'}`, background: enabled.has(c.id) ? 'color-mix(in srgb, var(--coral,#2563eb) 6%, transparent)' : 'var(--card,#fff)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={enabled.has(c.id)} onChange={() => toggle(c.id)} style={{ width: 17, height: 17, accentColor: accent, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{c.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--slate)' }}>
                        {c.services} service{c.services === 1 ? '' : 's'}
                        {c.balance != null && ` · balance ${c.currency || ''} ${c.balance.toFixed(2)}`}
                        <span style={{ color: '#c2c6cb' }}> · {c.id}</span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
              <button type="button" onClick={save} disabled={saving || !carriers.length}
                style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: accent, color: '#fff', fontSize: 13.5, fontWeight: 800, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              {flash && <span style={{ fontSize: 12.5, color: flash === 'Saved' ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{flash}</span>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
