'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useCompanyUser, S } from '../_shared'

const FONTS = ['Public Sans', 'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins']

export default function BusinessSettings() {
  const { companyId, loading } = useCompanyUser()
  const [company, setCompany] = useState<any>(null)
  const [locations, setLocations] = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const { data: co } = await (supabase as any).from('companies').select('*').eq('id', companyId).maybeSingle()
      setCompany(co)
      const { data: locs } = await (supabase as any).from('company_locations').select('*').eq('company_id', companyId).order('is_primary', { ascending: false })
      setLocations(locs || [])
      const { data: team } = await (supabase as any).from('team_members').select('*').eq('company_id', companyId)
      setMembers(team || [])
    })()
  }, [companyId])

  const set = (k: string, v: any) => setCompany((c: any) => ({ ...c, [k]: v }))

  const save = async () => {
    if (!companyId) return
    setSaving(true)
    await (supabase as any).from('companies').update({
      business_mobile: company.business_mobile, business_email: company.business_email,
      business_address: company.business_address, website: company.website, abn_acn: company.abn_acn,
      accent_color: company.accent_color, secondary_color: company.secondary_color, font_family: company.font_family,
    }).eq('id', companyId)
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const fmtLoc = (l: any) => [[l.unit ? `${l.unit}/` : '', l.street_address].join('').trim(), [l.suburb, l.state, l.postcode].filter(Boolean).join(' '), l.country].filter(Boolean).join(', ')

  if (loading) return <div style={{ color: 'var(--slate)' }}>Loading…</div>

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={S.h1}>Business</h1>
      <p style={S.sub}>{company?.name}</p>

      {/* Business details */}
      <div style={S.card}>
        <h2 style={S.h2}>Business details</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div><label style={S.label}>Mobile number</label><input value={company?.business_mobile || ''} onChange={e => set('business_mobile', e.target.value)} placeholder="+61…" style={S.input} /></div>
          <div><label style={S.label}>Email</label><input value={company?.business_email || ''} onChange={e => set('business_email', e.target.value)} style={S.input} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={S.label}>Address</label><input value={company?.business_address || ''} onChange={e => set('business_address', e.target.value)} placeholder="1 Fleet Street, Somerton VIC, Australia" style={S.input} /></div>
          <div><label style={S.label}>Website</label><input value={company?.website || ''} onChange={e => set('website', e.target.value)} placeholder="https://…" style={S.input} /></div>
          <div><label style={S.label}>ABN/ACN</label><input value={company?.abn_acn || ''} onChange={e => set('abn_acn', e.target.value)} style={S.input} /></div>
        </div>
      </div>

      {/* Branding */}
      <div style={S.card}>
        <h2 style={S.h2}>Branding</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div>
            <label style={S.label}>Primary colour</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="color" value={company?.accent_color || '#ff7a6b'} onChange={e => set('accent_color', e.target.value)} style={{ width: 42, height: 40, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', padding: 2 }} />
              <input value={company?.accent_color || '#ff7a6b'} onChange={e => set('accent_color', e.target.value)} style={S.input} />
            </div>
          </div>
          <div>
            <label style={S.label}>Secondary colour</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="color" value={company?.secondary_color || '#202124'} onChange={e => set('secondary_color', e.target.value)} style={{ width: 42, height: 40, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', padding: 2 }} />
              <input value={company?.secondary_color || '#202124'} onChange={e => set('secondary_color', e.target.value)} style={S.input} />
            </div>
          </div>
          <div>
            <label style={S.label}>Font</label>
            <select value={company?.font_family || 'Public Sans'} onChange={e => set('font_family', e.target.value)} style={S.input}>
              {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Locations */}
      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ ...S.h2, margin: 0 }}>Locations</h2>
          <Link href="/admin/locations" style={{ fontSize: 13, color: 'var(--coral)', fontWeight: 600, textDecoration: 'none' }}>Manage →</Link>
        </div>
        {locations.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--slate)', margin: 0 }}>No locations yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {locations.map((l, i) => (
              <div key={l.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: i < locations.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--slate)' }}>{i + 1}.</span>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{l.label || company?.name}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--slate)' }}>{fmtLoc(l)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Users */}
      <div style={S.card}>
        <h2 style={S.h2}>Users</h2>
        {members.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--slate)', margin: 0 }}>No team members yet. <Link href="/admin/team" style={{ color: 'var(--coral)' }}>Invite people →</Link></p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--slate)', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ padding: '6px 0', fontWeight: 700 }}>Name</th>
                <th style={{ padding: '6px 0', fontWeight: 700 }}>Type</th>
                <th style={{ padding: '6px 0', fontWeight: 700 }}>Locations</th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 0' }}>
                    <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{m.name || m.email?.split('@')[0]}</div>
                    <div style={{ fontSize: 12, color: 'var(--slate)' }}>{m.email}</div>
                  </td>
                  <td style={{ padding: '10px 0', textTransform: 'capitalize' }}>{m.role || 'Member'}</td>
                  <td style={{ padding: '10px 0', color: 'var(--slate)' }}>All Locations</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={save} disabled={saving} style={S.btn}>{saving ? 'Saving…' : 'Save changes'}</button>
        {saved && <span style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>✓ Saved</span>}
        <Link href="/admin/billing" style={{ ...S.btnGhost, textDecoration: 'none', display: 'inline-block' }}>Billing</Link>
      </div>
    </div>
  )
}
