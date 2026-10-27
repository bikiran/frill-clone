'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useCompanyUser, S } from '../_shared'
import { PLAN_NAMES, effectivePlan } from '@/lib/plan'

const FONTS = ['Public Sans', 'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins']
// Brand colours to pick from in one tap (any other through the colour picker).
const SWATCHES = ['#ff7a6b', '#ec4899', '#ef4444', '#f59e0b', '#8b5cf6', '#3b82f6', '#14b8a6', '#22c55e', '#111111']

// One fact about the workspace, at the top of the page (like Sellio's overview).
function Fact({ icon, label, value, href, external, copy }: { icon: React.ReactNode; label: string; value: React.ReactNode; href?: string; external?: boolean; copy?: string }) {
  const [copied, setCopied] = useState(false)
  const body = (
    <>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#52525b' }}>
        {icon}
        {href && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>}
        {copy && (
          <button type="button" aria-label={`Copy ${label}`} title="Copy" onClick={() => { navigator.clipboard?.writeText(copy).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }}
            style={{ border: 'none', background: 'none', padding: 4, margin: -4, cursor: 'pointer', color: copied ? '#16a34a' : '#a1a1aa', display: 'flex' }}>
            {copied
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>}
          </button>
        )}
      </span>
      <span style={{ display: 'block', marginTop: 14, fontSize: 13, color: '#71717a' }}>{label}</span>
      <span style={{ display: 'block', marginTop: 2, fontSize: 15, fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </>
  )
  const box: React.CSSProperties = { display: 'block', padding: 16, borderRadius: 16, border: '1px solid #ececf0', background: '#fff', textDecoration: 'none', minWidth: 0 }
  if (href && external) return <a href={href} target="_blank" rel="noopener noreferrer" className="biz-fact" style={box}>{body}</a>
  if (href) return <Link href={href} className="biz-fact" style={box}>{body}</Link>
  return <div style={box}>{body}</div>
}
const ic = (d: string) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>

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
      // Business details, outlets and team — side by side.
      const [{ data: co }, { data: locs }, { data: team }] = await Promise.all([
        (supabase as any).from('companies').select('*').eq('id', companyId).maybeSingle(),
        (supabase as any).from('company_locations').select('*').eq('company_id', companyId).order('is_primary', { ascending: false }),
        (supabase as any).from('team_members').select('*').eq('company_id', companyId),
      ])
      setCompany(co)
      setLocations(locs || [])
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
      invoice_footer: company.invoice_footer,
      accent_color: company.accent_color, secondary_color: company.secondary_color, font_family: company.font_family,
    }).eq('id', companyId)
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const fmtLoc = (l: any) => [[l.unit ? `${l.unit}/` : '', l.street_address].join('').trim(), [l.suburb, l.state, l.postcode].filter(Boolean).join(' '), l.country].filter(Boolean).join(', ')

  if (loading) return <div style={{ color: 'var(--slate)' }}>Loading…</div>

  const plan = PLAN_NAMES[effectivePlan(company?.plan, company?.trial_ends_at)] || 'Free'
  const host = company?.slug ? `${company.slug}.colvy.com` : ''
  const accent = company?.accent_color || '#ff7a6b'

  return (
    <div style={{ maxWidth: 1040 }}>
      <style>{`.biz-fact { transition: border-color .15s, box-shadow .15s; } .biz-fact:hover { border-color: #d4d4d8 !important; box-shadow: 0 2px 8px rgba(0,0,0,.04); }`}</style>
      <h1 style={S.h1}>Business</h1>

      {/* Who this is: the logo, the name and Colvy address. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '22px 0 28px' }}>
        {company?.logo_url
          ? <img src={company.logo_url} alt="" style={{ width: 64, height: 64, borderRadius: 18, objectFit: 'cover', background: '#fff', boxShadow: '0 0 0 1px rgba(0,0,0,.06)' }} />
          : <span style={{ width: 64, height: 64, borderRadius: 18, background: accent, color: '#fff', fontSize: 26, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{(company?.name || '?')[0].toUpperCase()}</span>}
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 21, fontWeight: 750, color: '#111', letterSpacing: '-0.01em' }}>{company?.name}</p>
          {host && <p style={{ margin: '3px 0 0', fontSize: 15, color: '#71717a' }}>{host}</p>}
        </div>
      </div>

      <div className="st-sec">
        <h2 style={S.h2}>Overview</h2>
        <p style={S.sub}>Your plan, team and workspace at a glance.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
          <Fact icon={ic('M3 8l4.5 3.5L12 5l4.5 6.5L21 8l-2 10H5z')} label="Plan" value={plan} href="/admin/billing" />
          <Fact icon={ic('M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.6M18.5 14.3A6.5 6.5 0 0 1 21.5 20')} label="Team members" value={members.length || 1} href="/admin/team" />
          {host && <Fact icon={ic('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z')} label="Your Colvy address" value={host} href={`https://${host}`} external />}
          {company?.created_at && <Fact icon={ic('M4.5 6.5h15v13h-15zM4.5 10.5h15M8.5 4v4M15.5 4v4')} label="Created" value={new Date(company.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })} />}
          {companyId && <Fact icon={ic('M7 11V8a5 5 0 0 1 10 0M5 11h14v10H5zM12 15v2')} label="Workspace ID" value={companyId} copy={companyId} />}
        </div>
      </div>

      {/* Business details */}
      <div className="st-sec">
        <h2 style={S.h2}>Business details</h2>
        <p style={S.sub}>How customers reach you. Shown on invoices, receipts and your board.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div><label style={S.label}>Mobile number</label><input value={company?.business_mobile || ''} onChange={e => set('business_mobile', e.target.value)} placeholder="+61…" style={S.input} /></div>
          <div><label style={S.label}>Email</label><input value={company?.business_email || ''} onChange={e => set('business_email', e.target.value)} style={S.input} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={S.label}>Address</label><input value={company?.business_address || ''} onChange={e => set('business_address', e.target.value)} placeholder="1 Fleet Street, Somerton VIC, Australia" style={S.input} /></div>
          <div><label style={S.label}>Website</label><input value={company?.website || ''} onChange={e => set('website', e.target.value)} placeholder="https://…" style={S.input} /></div>
          <div><label style={S.label}>ABN/ACN</label><input value={company?.abn_acn || ''} onChange={e => set('abn_acn', e.target.value)} style={S.input} /></div>
        </div>
      </div>

      {/* Invoice */}
      <div className="st-sec">
        <h2 style={S.h2}>Invoice</h2>
        <p style={{ ...S.sub, marginTop: -4 }}>Generated invoices use the business details above for the header (name, ABN, address, phone, email). Add a footer note shown at the bottom of every invoice.</p>
        <div>
          <label style={S.label}>Footer note</label>
          <textarea value={company?.invoice_footer || ''} onChange={e => set('invoice_footer', e.target.value)}
            placeholder="Thank you for the business. Please note we do not provide refunds and returns on live fish…"
            rows={3} style={{ ...S.input, resize: 'vertical', minHeight: 72, fontFamily: 'inherit' }} />
        </div>
      </div>

      {/* Branding */}
      <div className="st-sec">
        <h2 style={S.h2}>Branding</h2>
        <p style={S.sub}>Your colours and font, used on your board, booking page and widget.</p>
        <div role="radiogroup" aria-label="Primary colour" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
          {SWATCHES.map(c => {
            const on = accent.toLowerCase() === c
            return (
              <button key={c} type="button" role="radio" aria-checked={on} aria-label={c} title={c} onClick={() => set('accent_color', c)}
                style={{ width: 38, height: 38, borderRadius: 12, border: 'none', background: c, cursor: 'pointer', boxShadow: on ? '0 0 0 2px #fff, 0 0 0 4px #111' : 'inset 0 0 0 1px rgba(0,0,0,.06)', transition: 'box-shadow .15s' }} />
            )
          })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
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
      <div className="st-sec">
        <h2 style={S.h2}>Locations</h2>
        <p style={S.sub}>Where you serve customers. <Link href="/admin/locations" style={{ color: 'var(--coral)', fontWeight: 600, textDecoration: 'none' }}>Manage locations →</Link></p>
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
      <div className="st-sec">
        <h2 style={S.h2}>Users</h2>
        <p style={S.sub}>The people on your team. <Link href="/admin/team" style={{ color: 'var(--coral)', fontWeight: 600, textDecoration: 'none' }}>Manage team →</Link></p>
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 24, borderTop: '1px solid #f0f0f2' }}>
        <button onClick={save} disabled={saving} style={S.btn}>{saving ? 'Saving…' : 'Save changes'}</button>
        {saved && <span style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>✓ Saved</span>}
        <Link href="/admin/billing" style={{ ...S.btnGhost, textDecoration: 'none', display: 'inline-block' }}>Billing</Link>
      </div>
    </div>
  )
}
