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
function Fact({ icon, label, value, href, external, copy, color = '#71717a' }: { icon: React.ReactNode; label: string; value: React.ReactNode; href?: string; external?: boolean; copy?: string; color?: string }) {
  const [copied, setCopied] = useState(false)
  const body = (
    <>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#52525b' }}>
        <span className="bz-fact-ic" style={{ '--c': color } as React.CSSProperties}>{icon}</span>
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
          <Fact icon={ic('M3 8l4.5 3.5L12 5l4.5 6.5L21 8l-2 10H5z')} label="Plan" value={plan} href="/admin/billing" color="#ff6a4d" />
          <Fact icon={ic('M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.6M18.5 14.3A6.5 6.5 0 0 1 21.5 20')} color="#6366f1" label="Team members" value={members.length || 1} href="/admin/team" />
          {host && <Fact icon={ic('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z')} color="#0ea5e9" label="Your Colvy address" value={host} href={`https://${host}`} external />}
          {company?.created_at && <Fact icon={ic('M4.5 6.5h15v13h-15zM4.5 10.5h15M8.5 4v4M15.5 4v4')} color="#10b981" label="Created" value={new Date(company.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })} />}
          {companyId && <Fact icon={ic('M7 11V8a5 5 0 0 1 10 0M5 11h14v10H5zM12 15v2')} label="Workspace ID" value={companyId} copy={companyId} color="#8b5cf6" />}
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
          <Link href="/admin/locations" className="bz-add">
            <span className="bz-add-ic" aria-hidden>+</span>
            <span><b>Add your first location</b><small>Your shop, warehouse or service area.</small></span>
          </Link>
        ) : (
          <div className="bz-locs">
            {locations.map(l => {
              const staff = members.filter(m => m.default_location_id === l.id).length
              return (
                <Link key={l.id} href="/admin/locations" className="bz-loc">
                  <span className="bz-pin" aria-hidden>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></svg>
                  </span>
                  <span className="bz-loc-t">
                    <b>{l.label || company?.name}{l.is_primary && <i className="bz-chip main">Main</i>}</b>
                    <small>{fmtLoc(l) || 'No address yet'}</small>
                    {staff > 0 && <small className="bz-loc-staff">{staff} {staff === 1 ? 'person works' : 'people work'} here</small>}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Users */}
      <div className="st-sec">
        <h2 style={S.h2}>Users</h2>
        <p style={S.sub}>The people on your team. <Link href="/admin/team" style={{ color: 'var(--coral)', fontWeight: 600, textDecoration: 'none' }}>Manage team →</Link></p>
        {members.length === 0 ? (
          <Link href="/admin/team" className="bz-add">
            <span className="bz-add-ic" aria-hidden>+</span>
            <span><b>Invite your team</b><small>Everyone shares one inbox, with their own sign-in.</small></span>
          </Link>
        ) : (() => {
          const nameOf = (m: any) => m.display_name || m.name || m.email?.split('@')[0] || 'Team member'
          const roleOrder = ['owner', 'admin', 'editor', 'viewer']
          const sorted = [...members].sort((a, b) => (roleOrder.indexOf(String(a.role || 'viewer')) - roleOrder.indexOf(String(b.role || 'viewer'))) || nameOf(a).localeCompare(nameOf(b)))
          const byRole = roleOrder.map(r => [r, members.filter(m => String(m.role || 'viewer') === r).length] as const).filter(([, n]) => n > 0)
          const locName = (id: string) => locations.find(l => l.id === id)?.label || null
          return (
            <div className="bz-team">
              <div className="bz-team-top">
                <div className="bz-stack" aria-hidden>
                  {sorted.slice(0, 5).map(m => <Avatar key={m.id} m={m} name={nameOf(m)} size={34} />)}
                  {members.length > 5 && <span className="bz-more">+{members.length - 5}</span>}
                </div>
                <div className="bz-team-t">
                  <b>{members.length} {members.length === 1 ? 'person' : 'people'}</b>
                  <small>{byRole.map(([r, n]) => `${n} ${r}${n === 1 ? '' : 's'}`).join(' · ')}</small>
                </div>
                <Link href="/admin/team" className="bz-invite">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
                  Invite
                </Link>
              </div>
              <div className="bz-people">
                {sorted.map(m => {
                  const role = String(m.role || 'viewer')
                  const invited = /invit|pending/i.test(String(m.status || ''))
                  const loc = m.default_location_id ? locName(m.default_location_id) : null
                  return (
                    <Link key={m.id} href="/admin/team" className={`bz-person${invited ? ' invited' : ''}`}>
                      <Avatar m={m} name={nameOf(m)} size={42} />
                      <span className="bz-person-t">
                        <b>{nameOf(m)}</b>
                        <small>{m.email || m.phone || ''}</small>
                        <span className="bz-tags">
                          <i className={`bz-chip ${role}`}>{role.charAt(0).toUpperCase() + role.slice(1)}</i>
                          {invited && <i className="bz-chip invited">Invited</i>}
                          {m.department && <i className="bz-chip">{m.department}</i>}
                          <i className="bz-chip loc">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" /></svg>
                            {loc || (locations.length > 1 ? 'All locations' : locations[0]?.label || 'All locations')}
                          </i>
                        </span>
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })()}
      </div>
      <style>{BZ_CSS}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 24, borderTop: '1px solid #f0f0f2' }}>
        <button onClick={save} disabled={saving} style={S.btn}>{saving ? 'Saving…' : 'Save changes'}</button>
        {saved && <span style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>✓ Saved</span>}
        <Link href="/admin/billing" style={{ ...S.btnGhost, textDecoration: 'none', display: 'inline-block' }}>Billing</Link>
      </div>
    </div>
  )
}

// A person's photo, or their initials on a soft colour of their own.
function Avatar({ m, name, size }: { m: any; name: string; size: number }) {
  const hues = ['#ff7a6b', '#f59e0b', '#10b981', '#0ea5e9', '#6366f1', '#8b5cf6', '#ec4899', '#14b8a6']
  const h = hues[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % hues.length]
  const ini = name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?'
  return m.avatar_url
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className="bz-av" src={m.avatar_url} alt="" width={size} height={size} style={{ width: size, height: size }} />
    : <span className="bz-av" style={{ width: size, height: size, fontSize: Math.round(size * 0.36), '--h': h } as React.CSSProperties}>{ini}</span>
}

const BZ_CSS = `
.bz-fact-ic{width:38px;height:38px;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--c) 13%,#fff);color:var(--c)}
.biz-fact{transition:box-shadow .2s,transform .2s}
.biz-fact:hover{transform:translateY(-2px);box-shadow:0 12px 24px -14px rgba(16,24,40,.25)}
[data-theme="dark"] .bz-fact-ic{background:color-mix(in srgb,var(--c) 18%,var(--card))}
.bz-team{border-radius:20px;background:#fff;box-shadow:0 0 0 1px #ececf0;overflow:hidden}
.bz-team-top{display:flex;align-items:center;gap:14px;padding:14px 16px;background:linear-gradient(120deg,color-mix(in srgb,var(--coral) 7%,#fff),#fff 70%);border-bottom:1px solid #f0f0f2}
.bz-stack{display:flex;padding-left:8px}
.bz-stack>*{margin-left:-8px;box-shadow:0 0 0 2.5px #fff}
.bz-more{width:34px;height:34px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:#f4f4f5;color:#52525b;font-size:12px;font-weight:700}
.bz-team-t{flex:1;min-width:0}
.bz-team-t b{display:block;font-size:15px;font-weight:700;color:#111}
.bz-team-t small{display:block;margin-top:1px;font-size:12.5px;color:#71717a;text-transform:none}
.bz-invite{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 15px;border-radius:999px;background:#111;color:#fff;font-size:13.5px;font-weight:650;text-decoration:none;transition:filter .15s,transform .12s}
.bz-invite:hover{filter:brightness(1.2)}
.bz-people{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:1px;background:#f0f0f2}
.bz-person{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;background:#fff;text-decoration:none;transition:background .15s}
.bz-person:hover{background:#fafafa}
.bz-person.invited .bz-av{opacity:.6;box-shadow:0 0 0 1.5px #d4d4d8 inset}
.bz-av{flex-shrink:0;border-radius:50%;object-fit:cover;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--h) 16%,#fff);color:color-mix(in srgb,var(--h) 80%,#000);font-weight:700}
.bz-person-t{flex:1;min-width:0}
.bz-person-t b{display:block;font-size:14.5px;font-weight:650;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bz-person-t small{display:block;margin-top:1px;font-size:12.5px;color:#71717a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bz-tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
.bz-chip{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 8px;border-radius:999px;background:#f4f4f5;color:#52525b;font-size:11.5px;font-weight:650;font-style:normal;white-space:nowrap}
.bz-chip.owner{background:#fef3c7;color:#b45309}
.bz-chip.admin{background:#ede9fe;color:#6d28d9}
.bz-chip.editor{background:#dbeafe;color:#1d4ed8}
.bz-chip.viewer{background:#f4f4f5;color:#52525b}
.bz-chip.invited{background:#fff7ed;color:#c2410c}
.bz-chip.loc{background:#ecfdf5;color:#047857}
.bz-chip.main{margin-left:6px;background:color-mix(in srgb,var(--coral) 14%,#fff);color:color-mix(in srgb,var(--coral) 80%,#000);vertical-align:1px}
.bz-locs{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:10px}
.bz-loc{display:flex;align-items:flex-start;gap:12px;padding:14px;border-radius:18px;background:#fff;box-shadow:0 0 0 1px #ececf0;text-decoration:none;transition:box-shadow .2s,transform .2s}
.bz-loc:hover{transform:translateY(-2px);box-shadow:0 0 0 1px #e4e4e7,0 12px 24px -14px rgba(16,24,40,.25)}
.bz-pin{width:38px;height:38px;flex-shrink:0;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(140deg,#34d399,#059669);box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 6px 14px -8px #059669}
.bz-loc-t{flex:1;min-width:0}
.bz-loc-t b{display:block;font-size:14.5px;font-weight:650;color:#111}
.bz-loc-t small{display:block;margin-top:2px;font-size:12.5px;line-height:1.45;color:#71717a}
.bz-loc-t .bz-loc-staff{margin-top:6px;font-weight:600;color:#047857}
.bz-add{display:flex;align-items:center;gap:12px;padding:14px;border-radius:18px;border:1.5px dashed #e4e4e7;text-decoration:none;transition:border-color .15s,background .15s}
.bz-add:hover{border-color:var(--coral);background:color-mix(in srgb,var(--coral) 4%,#fff)}
.bz-add-ic{width:38px;height:38px;flex-shrink:0;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;background:#f4f4f5;color:#52525b;font-size:22px;font-weight:500}
.bz-add b{display:block;font-size:14.5px;font-weight:650;color:#111}
.bz-add small{display:block;margin-top:1px;font-size:12.5px;color:#71717a}
[data-theme="dark"] .bz-team,[data-theme="dark"] .bz-person,[data-theme="dark"] .bz-loc{background:var(--card)}
[data-theme="dark"] .bz-team-top{background:var(--card);border-color:var(--border)}
[data-theme="dark"] .bz-people{background:var(--border)}
[data-theme="dark"] .bz-person-t b,[data-theme="dark"] .bz-loc-t b,[data-theme="dark"] .bz-team-t b,[data-theme="dark"] .bz-add b{color:var(--ink)}
`
