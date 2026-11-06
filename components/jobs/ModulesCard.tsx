'use client'

// Business settings → Features: switch Jobs & quotes and Table reservations on
// or off for this workspace. Each is on by default for the businesses it's made
// for (lib/modules). Only owners and admins can change them; the switches are
// saved by /api/jobs/settings and /api/restaurant/settings.

import { useEffect, useState } from 'react'
import { api } from '@/components/booking/admin/shared'
import Link from 'next/link'

type St = { on: boolean; auto: boolean; industry: string | null; canManage: boolean }

const announce = (modules: any) => { try { window.dispatchEvent(new CustomEvent('colvy:modules-changed', { detail: { modules } })) } catch {} }

export default function ModulesCard({ companyId }: { companyId: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <JobsSwitch companyId={companyId} />
      <ReservationsSwitch companyId={companyId} />
      <style>{CSS}</style>
    </div>
  )
}

function JobsSwitch({ companyId }: { companyId: string }) {
  const [st, setSt] = useState<St | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!companyId) return
    let live = true
    api(`/api/jobs/settings?companyId=${companyId}`)
      .then(r => live && setSt({ on: !!r.jobsEnabled, auto: r.modules?.jobs === undefined, industry: r.industry || null, canManage: !!r.canManage }))
      .catch(e => live && setMsg(/COLVY_V427/.test(e.message) ? 'Jobs & quotes needs one database update first (migrations/COLVY_V427_JOBS.sql).' : /access/i.test(e.message) ? 'Only owners and admins can change this.' : e.message))
    return () => { live = false }
  }, [companyId])
  const toggle = async () => {
    if (!st || busy) return
    setBusy(true); setMsg('')
    try {
      const r = await api('/api/jobs/settings', { method: 'PATCH', json: { companyId, jobsModule: !st.on } })
      setSt({ ...st, on: !!r.jobsEnabled, auto: false })
      announce(r.modules)
    } catch (e: any) { setMsg(e.message) } finally { setBusy(false) }
  }
  return (
    <Row st={st} msg={msg} busy={busy} onToggle={toggle} label="Jobs & quotes" tint="#6366f1" href="/admin/jobs" open="Open Jobs →"
      line="Itemised quotes with GST that customers accept online, deposits, and a jobs board, for trades, cleaners and removalists."
      icon={<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M3 12.5h18" /></>} />
  )
}

function ReservationsSwitch({ companyId }: { companyId: string }) {
  const [st, setSt] = useState<St | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!companyId) return
    let live = true
    api(`/api/restaurant/settings?companyId=${companyId}`)
      .then(r => live && setSt({ on: !!r.enabled, auto: r.modules?.restaurant === undefined, industry: r.industry || null, canManage: !!r.canManage }))
      .catch(e => live && setMsg(/COLVY_V429/.test(e.message) ? 'Table reservations need one database update first (migrations/COLVY_V429_RESTAURANT_RESERVATIONS.sql).' : /access/i.test(e.message) ? 'Only owners and admins can change this.' : e.message))
    return () => { live = false }
  }, [companyId])
  const toggle = async () => {
    if (!st || busy) return
    setBusy(true); setMsg('')
    try {
      const r = await api('/api/restaurant/settings', { method: 'PATCH', json: { companyId, module: !st.on } })
      setSt({ ...st, on: !!r.enabled, auto: false })
      announce(r.modules)
    } catch (e: any) { setMsg(e.message) } finally { setBusy(false) }
  }
  return (
    <Row st={st} msg={msg} busy={busy} onToggle={toggle} label="Table reservations" tint="#e26d3d" href="/admin/reservations" open="Open Reservations →"
      line="An online table booking page, a day sheet with covers and seating, walk-ins, reminders and guest history, for restaurants, cafés and bars."
      icon={<><circle cx="13.5" cy="12.5" r="7" /><circle cx="13.5" cy="12.5" r="3.2" /><path d="M3 3.5v4.3a1.6 1.6 0 0 0 3.2 0V3.5M4.6 9.4v11.1" /></>} />
  )
}

function Row({ st, msg, busy, onToggle, label, line, icon, tint, href, open }: { st: St | null; msg: string; busy: boolean; onToggle: () => void; label: string; line: string; icon: React.ReactNode; tint: string; href: string; open: string }) {
  return (
    <div className="mc">
      <span className="mc-ic" aria-hidden style={{ ['--t' as any]: tint }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
      </span>
      <div className="mc-t">
        <b>{label}</b>
        <small>{st?.auto && st.on ? `On for ${st.industry || 'your type of business'}. ` : ''}{line}</small>
        {msg && <small className="mc-msg">{msg}</small>}
        {st?.on && <Link href={href} className="mc-link">{open}</Link>}
      </div>
      <button type="button" role="switch" aria-checked={!!st?.on} aria-label={label} disabled={!st || !st.canManage || busy} onClick={onToggle} className={`mc-sw${st?.on ? ' on' : ''}`}><span /></button>
    </div>
  )
}

const CSS = `
.mc{display:flex;align-items:flex-start;gap:14px;padding:16px;border-radius:18px;background:var(--card,#fff);box-shadow:0 0 0 1px #ececf0}
[data-theme="dark"] .mc{box-shadow:0 0 0 1px var(--border)}
.mc-ic{width:38px;height:38px;flex-shrink:0;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--t) 13%,#fff);color:var(--t)}
[data-theme="dark"] .mc-ic{background:color-mix(in srgb,var(--t) 18%,var(--card))}
.mc-t{flex:1;min-width:0}
.mc-t b{display:block;font-size:14.5px;font-weight:650;color:var(--ink,#111)}
.mc-t small{display:block;margin-top:2px;font-size:12.5px;line-height:1.5;color:#71717a}
.mc-msg{color:#b45309!important}
.mc-link{display:inline-block;margin-top:6px;font-size:13px;font-weight:650;color:var(--coral);text-decoration:none}
.mc-sw{position:relative;width:44px;height:26px;flex-shrink:0;margin-top:6px;padding:0;border:none;border-radius:999px;background:#d4d4d8;cursor:pointer;transition:background .18s}
.mc-sw::before{display:none!important}
.mc-sw span{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .2s cubic-bezier(.22,1,.36,1)}
.mc-sw.on{background:#22c55e}.mc-sw.on span{transform:translateX(18px)}
.mc-sw:disabled{opacity:.5;cursor:default}
`
