'use client'

// Settings → Customer accounts: the business's "Your account" page for its
// customers (the customer portal, version 1). Turn it on, choose what
// customers see, copy the page's address, and watch the pilot numbers.

import { useEffect, useState } from 'react'
import { Panel, Toggle } from '@/components/ui/AdminKit'
import { apiRaw } from '@/components/jobs/shared'
import { PORTAL_SECTIONS, type PortalSettings } from '@/lib/portal/settings'
import { useCompanyUser, SettingsPage } from '../_shared'

type Stats = { visits: number; signIns: number; people: number; actions: number; messages: number; duplicates: number }

export default function CustomerAccountsSettings() {
  const { companyId, loading } = useCompanyUser()
  const [s, setS] = useState<PortalSettings | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [err, setErr] = useState('')
  const [setup, setSetup] = useState('')
  const [saved, setSaved] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!companyId) return
    apiRaw(`/api/portal/settings?companyId=${companyId}`).then(r => {
      if (!r.ok) { if (r.data?.setup) setSetup(r.data.error); else setErr(r.data?.error || 'Could not load the settings.'); return }
      setS(r.data.settings); setUrl(r.data.url); setStats(r.data.stats)
    })
  }, [companyId])

  const save = async (next: PortalSettings, what: string) => {
    const prev = s
    setS(next); setErr(''); setSaved('')
    const r = await apiRaw('/api/portal/settings', { method: 'PATCH', json: { companyId, settings: next } })
    if (!r.ok) { setS(prev); setErr(r.data?.error || 'Could not save.'); return }
    setS(r.data.settings); setSaved(what)
    setTimeout(() => setSaved(x => (x === what ? '' : x)), 2000)
  }
  const copy = async () => { if (!url) return; try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch {} }

  return (
    <SettingsPage title="Customer accounts" sub="A “Your account” page for your customers: what’s coming up, payments due, quotes, orders and their messages with you. No password, they sign in with a code.">
      <style>{CA_CSS}</style>
      {setup && <div className="ak-note warn" role="alert">{setup}</div>}
      {err && <div className="ak-note bad" role="alert">{err}</div>}
      {(loading || (!s && !setup && !err)) && <Panel><div className="ca-sk"><span /><span /><span /></div></Panel>}

      {s && (
        <>
          <Panel>
            <div className="ca-on">
              <div>
                <h2>Your customers’ account page</h2>
                <p>{s.enabled ? 'On. Customers can open it and sign in with a code sent to the email or mobile you have for them.' : 'Off. Turn it on to give customers one page for everything they have with you.'}</p>
              </div>
              <Toggle on={s.enabled} label="Customer accounts" onChange={v => save({ ...s, enabled: v }, 'enabled')} />
            </div>
            {s.enabled && url && (
              <div className="ca-url">
                <span className="ca-url-t">{url.replace(/^https?:\/\//, '')}</span>
                <button type="button" className="ak-btn sm" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
                <a className="ak-btn sm ghost" href={url} target="_blank" rel="noreferrer">Open</a>
              </div>
            )}
            {s.enabled && <p className="ca-fine">Booking and quote links you send also open it: “Your account” on a customer’s booking page signs them in for a day.</p>}
            {saved === 'enabled' && <p className="ca-saved">Saved</p>}
          </Panel>

          <Panel title="What customers see" sub="Turn off anything you don’t use.">
            {PORTAL_SECTIONS.map(x => (
              <div key={x.key} className="ca-row">
                <div><b>{x.label}</b><span>{x.hint}</span></div>
                <Toggle on={s.sections[x.key]} label={x.label} onChange={v => save({ ...s, sections: { ...s.sections, [x.key]: v } }, x.key)} />
              </div>
            ))}
          </Panel>

          <Panel title="Last 30 days" sub="How much customers use it.">
            <div className="ca-stats">
              <div><b>{stats?.visits ?? 0}</b><span>Page visits</span></div>
              <div><b>{stats?.people ?? 0}</b><span>Customers signed in</span></div>
              <div><b>{stats?.actions ?? 0}</b><span>Things done there</span><small>Opened a booking or quote, paid, replied, changed preferences</small></div>
              <div><b>{stats?.messages ?? 0}</b><span>Messages sent from it</span></div>
            </div>
            {!!stats?.duplicates && <p className="ca-fine warn">{stats.duplicates} sign-in{stats.duplicates === 1 ? '' : 's'} matched more than one contact with the same email or mobile. Merging those contacts gives customers their whole history.</p>}
          </Panel>

          <Panel title="Keeping it private">
            <ul className="ca-list">
              <li>Codes go only to the exact email or mobile on the customer’s contact, and last 10 minutes.</li>
              <li>A code sign-in lasts 30 days unused; one from a link you sent, a day.</li>
              <li>Customers see amounts and statuses, never addresses or card details.</li>
              <li>Changes go through the pages you already have: the booking page, the quote page and Pay.</li>
            </ul>
          </Panel>
        </>
      )}
    </SettingsPage>
  )
}

const CA_CSS = `
.ca-on{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.ca-on h2{margin:0 0 4px;font-size:16px;font-weight:700}
.ca-on p{margin:0;font-size:14px;line-height:1.5;color:var(--mut)}
.ca-url{display:flex;align-items:center;gap:8px;margin-top:16px;padding:8px 8px 8px 14px;border-radius:14px;background:var(--f)}
.ca-url-t{flex:1;min-width:0;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ca-fine{margin:12px 0 0;font-size:12.5px;line-height:1.5;color:var(--mut)}
.ca-fine.warn{color:#b45309}
.ca-saved{margin:10px 0 0;font-size:12.5px;font-weight:600;color:#047857}
.ca-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:13px 0;border-top:1px solid var(--line)}
.ca-row:first-of-type{border-top:none;padding-top:4px}
.ca-row>div{display:flex;flex-direction:column;gap:2px;min-width:0}
.ca-row b{font-size:14.5px;font-weight:650}
.ca-row span{font-size:13px;color:var(--mut)}
.ca-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
.ca-stats>div{display:flex;flex-direction:column;gap:2px;padding:14px 16px;border-radius:16px;background:var(--f)}
.ca-stats b{font-size:24px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.ca-stats span{font-size:13px;font-weight:600}
.ca-stats small{font-size:11.5px;color:var(--mut);line-height:1.4}
.ca-list{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:14px;line-height:1.5;color:var(--mut)}
.ca-sk{display:flex;flex-direction:column;gap:12px}
.ca-sk span{height:18px;border-radius:8px;background:linear-gradient(90deg,var(--f) 25%,var(--f2) 50%,var(--f) 75%);background-size:200% 100%;animation:caSk 1.2s linear infinite}
.ca-sk span:nth-child(2){width:70%}.ca-sk span:nth-child(3){width:45%}
@keyframes caSk{to{background-position:-200% 0}}
`
