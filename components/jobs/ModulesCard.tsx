'use client'

// Business settings → Features: switch Jobs & quotes on or off for this
// workspace (it's on by default for trades and removalists). The switch is
// saved by /api/jobs/settings, which only owners and admins can change.

import { useEffect, useState } from 'react'
import { api } from '@/components/booking/admin/shared'

export default function ModulesCard({ companyId }: { companyId: string }) {
  const [st, setSt] = useState<{ on: boolean; auto: boolean; industry: string | null; canManage: boolean } | null>(null)
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
      try { window.dispatchEvent(new CustomEvent('colvy:modules-changed', { detail: { modules: r.modules } })) } catch {}
    } catch (e: any) { setMsg(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="mc">
      <span className="mc-ic" aria-hidden>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M3 12.5h18" /></svg>
      </span>
      <div className="mc-t">
        <b>Jobs &amp; quotes</b>
        <small>{st?.auto && st.on ? `On for ${st.industry || 'your type of business'}. ` : ''}Itemised quotes with GST that customers accept online, deposits, and a jobs board, for trades, cleaners and removalists.</small>
        {msg && <small className="mc-msg">{msg}</small>}
        {st?.on && <a href="/admin/jobs" className="mc-link">Open Jobs →</a>}
      </div>
      <button type="button" role="switch" aria-checked={!!st?.on} aria-label="Jobs & quotes" disabled={!st || !st.canManage || busy} onClick={toggle} className={`mc-sw${st?.on ? ' on' : ''}`}><span /></button>
      <style>{`
        .mc{display:flex;align-items:flex-start;gap:14px;padding:16px;border-radius:18px;background:var(--card,#fff);box-shadow:0 0 0 1px #ececf0}
        [data-theme="dark"] .mc{box-shadow:0 0 0 1px var(--border)}
        .mc-ic{width:38px;height:38px;flex-shrink:0;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,#6366f1 13%,#fff);color:#6366f1}
        [data-theme="dark"] .mc-ic{background:color-mix(in srgb,#6366f1 18%,var(--card))}
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
      `}</style>
    </div>
  )
}
