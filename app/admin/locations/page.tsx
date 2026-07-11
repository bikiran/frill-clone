'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const AU_STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']

export default function LocationsPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [geocoding, setGeocoding] = useState(false)

  const geocodeOutlets = async () => {
    if (!companyId) return
    setGeocoding(true)
    try {
      const res = await fetch('/api/locations/geocode', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, force: true }),
      })
      const data = await res.json()
      if (data.ok) {
        alert(`Geocoded ${data.geocoded} outlet(s). Victorian visitors will now be auto-assigned to the nearest one.`)
        await loadLocations(companyId)
      } else {
        alert('Geocoding failed: ' + (data.error || 'unknown error'))
      }
    } catch (e: any) {
      alert('Geocoding failed: ' + e.message)
    } finally {
      setGeocoding(false)
    }
  }
  const [locations, setLocations] = useState<any[]>([])
  const [numbers, setNumbers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  const blank = { label: '', unit: '', street_address: '', suburb: '', state: 'VIC', postcode: '', country: 'Australia', phone: '', is_primary: false }

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
      if (cid) await loadLocations(cid)
      setLoading(false)
    }
    init()
  }, [])

  const loadLocations = async (cid: string) => {
    const { data } = await (supabase as any).from('company_locations').select('*').eq('company_id', cid).order('is_primary', { ascending: false })
    setLocations(data || [])
    try {
      const res = await fetch(`/api/telnyx/numbers?companyId=${cid}`)
      const nd = await res.json()
      setNumbers(nd.numbers || [])
    } catch {}
  }

  // Send the user to the Calls page in "add a number" mode, pre-assigning this
  // location so the purchased number is tied to it.
  const buyForLocation = (locationId: string) => {
    window.location.href = `/admin/integrations/telnyx?buyForLocation=${locationId}`
  }

  const save = async () => {
    if (!companyId || !editing) return
    setSaving(true)
    try {
      const payload = { ...editing, company_id: companyId }
      delete payload.id
      if (editing.id) {
        await (supabase as any).from('company_locations').update(payload).eq('id', editing.id)
      } else {
        await (supabase as any).from('company_locations').insert(payload)
      }
      // If this is primary, unset others
      if (editing.is_primary) {
        const { data: all } = await (supabase as any).from('company_locations').select('id').eq('company_id', companyId).neq('id', editing.id || '00000000-0000-0000-0000-000000000000')
        // handled below by reload
      }
      await loadLocations(companyId)
      setEditing(null)
    } catch (e: any) { alert('Error: ' + e.message) }
    setSaving(false)
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this location?')) return
    await (supabase as any).from('company_locations').delete().eq('id', id)
    if (companyId) await loadLocations(companyId)
  }

  const fmtAddress = (l: any) => {
    // Australian format: Unit/Street, Suburb STATE Postcode
    const line1 = [l.unit ? `${l.unit}/` : '', l.street_address].join('').trim()
    const line2 = [l.suburb, l.state, l.postcode].filter(Boolean).join(' ')
    return [line1, line2, l.country].filter(Boolean).join(', ')
  }

  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
  const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 5 }

  if (loading) return <div style={{ padding: 24, color: 'var(--slate)' }}>Loading…</div>

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 24px', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 200 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: '0 0 4px' }}>Locations</h1>
          <p style={{ fontSize: 14, color: 'var(--slate)', margin: 0 }}>Manage your business addresses (Australian format).</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          {!editing && (
            <button onClick={geocodeOutlets} disabled={geocoding}
              style={{ padding: '10px 16px', borderRadius: 10, background: 'var(--peach)', color: 'var(--coral)', border: '1px solid var(--coral)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {geocoding ? 'Geocoding…' : 'Geocode for auto-assign'}
            </button>
          )}
          {!editing && (
            <button onClick={() => setEditing({ ...blank })}
              style={{ padding: '10px 18px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              + Add location
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 20, background: '#fff' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: '0 0 16px' }}>{editing.id ? 'Edit' : 'New'} location</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={label}>Label</label>
              <input value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })} placeholder="Head Office" style={inp} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
              <div>
                <label style={label}>Unit / Suite</label>
                <input value={editing.unit} onChange={e => setEditing({ ...editing, unit: e.target.value })} placeholder="12" style={inp} />
              </div>
              <div>
                <label style={label}>Street address</label>
                <input value={editing.street_address} onChange={e => setEditing({ ...editing, street_address: e.target.value })} placeholder="123 Collins Street" style={inp} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={label}>Suburb</label>
                <input value={editing.suburb} onChange={e => setEditing({ ...editing, suburb: e.target.value })} placeholder="Melbourne" style={inp} />
              </div>
              <div>
                <label style={label}>State</label>
                <select value={editing.state} onChange={e => setEditing({ ...editing, state: e.target.value })} style={inp}>
                  {AU_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Postcode</label>
                <input value={editing.postcode} onChange={e => setEditing({ ...editing, postcode: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="3000" style={inp} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={label}>Phone</label>
                <input value={editing.phone} onChange={e => setEditing({ ...editing, phone: e.target.value })} placeholder="03 9000 0000" style={inp} />
              </div>
              <div>
                <label style={label}>Country</label>
                <input value={editing.country} onChange={e => setEditing({ ...editing, country: e.target.value })} style={inp} />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--ink)', cursor: 'pointer' }}>
              <input type="checkbox" checked={editing.is_primary} onChange={e => setEditing({ ...editing, is_primary: e.target.checked })} />
              Set as primary location
            </label>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button onClick={save} disabled={saving} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'Saving…' : 'Save location'}
              </button>
              <button onClick={() => setEditing(null)} style={{ padding: '10px 20px', borderRadius: 10, background: '#fff', color: 'var(--slate)', border: '1px solid var(--border)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : locations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--slate)', border: '1px dashed var(--border)', borderRadius: 14 }}>
          No locations yet. Add your first business address.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {locations.map(l => (
            <div key={l.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{l.label || 'Location'}</span>
                  {l.is_primary && <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--peach)', color: 'var(--coral)', padding: '2px 8px', borderRadius: 20 }}>PRIMARY</span>}
                </div>
                <p style={{ margin: 0, fontSize: 13.5, color: 'var(--slate)' }}>{fmtAddress(l)}</p>
                {l.phone && <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--slate)' }}>📞 {l.phone}</p>}
                {/* Colvy number assigned to this location */}
                {(() => {
                  const assigned = numbers.find((n: any) => n.location_id === l.id)
                  return assigned ? (
                    <p style={{ margin: '6px 0 0', fontSize: 13, fontWeight: 600, color: '#059669' }}>☎️ Colvy number: {assigned.phone_number}</p>
                  ) : (
                    <button onClick={() => buyForLocation(l.id)}
                      style={{ marginTop: 8, padding: '6px 12px', borderRadius: 8, background: 'var(--peach)', border: '1px solid var(--coral)', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: 'var(--coral)' }}>
                      + Buy a number for this location
                    </button>
                  )
                })()}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setEditing(l)} style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--canvas)', border: '1px solid var(--border)', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--ink)' }}>Edit</button>
                <button onClick={() => remove(l.id)} style={{ padding: '6px 12px', borderRadius: 8, background: '#fff', border: '1px solid #fecaca', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#dc2626' }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
