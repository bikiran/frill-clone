'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SkeletonCards } from '@/components/Skeleton'
import { INTEGRATIONS, CATEGORIES, integrationHref } from '@/lib/integrations-catalog'
import { useIntegrations } from '@/components/integrations/IntegrationsShell'
import GeneralIntegration from '@/components/integrations/GeneralIntegration'
import { Icon } from '@/components/integrations/ui'
import { AdminPage } from '@/components/ui/AdminKit'



export default function IntegrationsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selected = searchParams.get('i')
  const { ready, active } = useIntegrations()
  const [catFilter, setCatFilter] = useState('All')
  const [q, setQ] = useState('')

  const needle = q.trim().toLowerCase()
  const filtered = INTEGRATIONS
    .filter(i => catFilter === 'All' || i.category === catFilter)
    .filter(i => !needle || i.name.toLowerCase().includes(needle) || (i.desc || '').toLowerCase().includes(needle) || (i.category || '').toLowerCase().includes(needle))
  const activeCount = INTEGRATIONS.filter(i => active[i.id]).length
  const activeIntegration = INTEGRATIONS.find(i => i.id === selected && !i.isDedicated)

  if (!ready) return <SkeletonCards cards={8} />
  if (activeIntegration) return <GeneralIntegration id={activeIntegration.id} />

  return (
    <AdminPage width="lg" title="Integrations"
      sub="Connect Colvy to the tools your team already uses. Orders, bookings, payments and messages flow into Slack, Zapier, Jira and more the moment they happen.">
      <div className="ig-tools">
        <label className="ig-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search integrations" aria-label="Search integrations" />
        </label>
        {activeCount > 0 && <span className="ak-tag green">{activeCount} connected</span>}
      </div>
      <div className="ig-cats" role="tablist" aria-label="Category">
        {CATEGORIES.map(cat => (
          <button key={cat} type="button" role="tab" aria-selected={catFilter === cat} className={`ak-chip${catFilter === cat ? ' on' : ''}`} onClick={() => setCatFilter(cat)}>{cat}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="ak-empty"><b>Nothing found</b>Try another word or category.</div>
      ) : (
        <div className="ig-grid">
          {filtered.map(intg => {
            const on = !!active[intg.id]
            return (
              <button key={intg.id} type="button" onClick={() => router.push(integrationHref(intg))} className={`ig-card${on ? ' on' : ''}`}>
                <span className="ig-top">
                  <span className="ig-logo"><img src={intg.logo || '/logos/webhook.svg'} alt="" width={30} height={30} /></span>
                  {on && <span className="ak-tag green"><i className="ig-dot" />Connected</span>}
                </span>
                <b className="ig-name">{intg.name}</b>
                <small className="ig-cat">{intg.category}</small>
                <span className="ig-desc">{intg.desc}</span>
                <span className="ig-foot">
                  {on ? 'Settings' : 'Connect'} <Icon name="chevron" size={12} />
                </span>
              </button>
            )
          })}
        </div>
      )}
      <style>{IG_CSS}</style>
    </AdminPage>
  )
}

const IG_CSS = `
.ig-tools{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.ig-search{flex:1;max-width:420px;display:flex;align-items:center;gap:9px;height:44px;padding:0 15px;border-radius:999px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.07);color:var(--soft)}
.ak .ig-search input{flex:1;min-width:0;height:100%;padding:0;border:none!important;background:transparent!important;box-shadow:none!important;outline:none;font:inherit;font-size:14.5px;color:var(--ink)!important}
.ig-cats{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:18px}
.ig-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.ig-card{display:flex;flex-direction:column;align-items:flex-start;min-width:0;padding:18px;border:none;border-radius:22px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.05),0 1px 2px rgba(16,24,40,.04);font:inherit;text-align:left;cursor:pointer;transition:box-shadow .18s,transform .18s}
.ig-card:hover{box-shadow:0 0 0 1px rgba(0,0,0,.07),0 12px 28px -14px rgba(16,24,40,.25);transform:translateY(-1px)}
.ig-card.on{box-shadow:0 0 0 1.5px #22c55e,0 1px 2px rgba(16,24,40,.04)}
.ig-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;width:100%}
.ig-logo{width:48px;height:48px;border-radius:15px;display:inline-flex;align-items:center;justify-content:center;background:var(--f)}
.ig-logo img{width:30px;height:30px;object-fit:contain}
.ig-dot{width:6px;height:6px;border-radius:50%;background:currentColor}
.ig-name{margin-top:14px;font-size:15.5px;font-weight:650;color:var(--ink)}
.ig-cat{margin-top:1px;font-size:12.5px;color:var(--soft)}
.ig-desc{margin-top:8px;font-size:13px;line-height:1.5;color:var(--mut);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.ig-foot{display:inline-flex;align-items:center;gap:5px;margin-top:auto;padding-top:14px;font-size:13px;font-weight:650;color:var(--ink)}
.ig-card:hover .ig-foot{color:var(--coral)}
`
