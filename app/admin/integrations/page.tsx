'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { SkeletonCards } from '@/components/Skeleton'
import { INTEGRATIONS, CATEGORIES, integrationHref } from '@/lib/integrations-catalog'
import { useIntegrations, authHeaders } from '@/components/integrations/IntegrationsShell'
import { Icon } from '@/components/integrations/ui'



export default function IntegrationsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selected = searchParams.get('i')
  const { companyId, ready, active: enabledAll, generic, setActive } = useIntegrations()

  // Editable copies of the general integrations' settings, seeded from the shell.
  const [configs, setConfigs] = useState<Record<string, any>>({})
  const [enabled, setEnabled] = useState<Record<string, boolean>>({})
  const [events, setEvents] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [catFilter, setCatFilter] = useState('All')
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    const cfgs: Record<string, any> = {}, enb: Record<string, boolean> = {}, evts: Record<string, string[]> = {}
    for (const [id, g] of Object.entries(generic)) { cfgs[id] = g.config; enb[id] = g.enabled; evts[id] = g.events }
    setConfigs(cfgs); setEnabled(enb); setEvents(evts)
  }, [generic])
  useEffect(() => { setSaveError(null) }, [selected])

  // OAuth-based integrations get a "Connect" button instead of manual fields
  const OAUTH_INTEGRATIONS = ['trello', 'jira', 'github', 'slack', 'intercom', 'zendesk']

  const handleOAuthConnect = (intId: string) => {
    const OAUTH_URLS: Record<string, string> = {
      trello: `https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&name=Colvy&return_url=${encodeURIComponent(window.location.origin + '/admin/integrations?connected=trello')}`,
      github: `https://github.com/login/oauth/authorize?client_id=YOUR_GITHUB_CLIENT_ID&scope=repo&redirect_uri=${encodeURIComponent(window.location.origin + '/admin/integrations?connected=github')}`,
      slack: `https://slack.com/oauth/v2/authorize?client_id=YOUR_SLACK_CLIENT_ID&scope=incoming-webhook&redirect_uri=${encodeURIComponent(window.location.origin + '/admin/integrations?connected=slack')}`,
    }
    if (OAUTH_URLS[intId]) {
      window.open(OAUTH_URLS[intId], '_blank', 'width=600,height=700')
    } else {
      setSaveError(`Connecting ${intId} needs OAuth credentials set up first. You can paste the details below instead.`)
    }
  }

  const isOAuth = (intId: string) => OAUTH_INTEGRATIONS.includes(intId)

  const saveIntegration = async (id: string) => {
    if (!companyId) return
    setSaving(id); setSaveError(null)
    try {
      const res = await fetch('/api/integrations/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ companyId, integrationId: id, config: configs[id] || {}, enabled: enabled[id] || false, events: events[id] || [] }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not save the settings.')
      setActive(id, !!enabled[id])
      setSaved(id)
      setTimeout(() => setSaved(null), 2000)
    } catch (err: any) {
      setSaveError(err?.message || 'Could not save the settings.')
    }
    setSaving(null)
  }

  const toggleEvent = (intId: string, event: string) => {
    setEvents(prev => {
      const cur = prev[intId] || []
      return { ...prev, [intId]: cur.includes(event) ? cur.filter(e => e !== event) : [...cur, event] }
    })
  }

  const updateConfig = (intId: string, key: string, value: string) => {
    setConfigs(prev => ({ ...prev, [intId]: { ...(prev[intId] || {}), [key]: value } }))
  }

  const filtered = catFilter === 'All' ? INTEGRATIONS : INTEGRATIONS.filter(i => i.category === catFilter)
  const activeIntegration = INTEGRATIONS.find(i => i.id === selected)

  if (!ready) return <SkeletonCards cards={8} />

  return (
    <>
      {/* Main */}
      <main className="w-full">
        {!selected ? (
          <div className="px-4 md:px-8 py-6 md:py-8">
            <div className="mb-8">
              <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Integrations</h1>
              <p style={{ color: 'var(--slate)' }}>Connect Colvy to the tools your team already uses</p>
            </div>

            {/* Category filter */}
            <div className="flex gap-2 flex-wrap mb-6">
              {CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setCatFilter(cat)}
                  className="px-4 py-1.5 rounded-full text-sm font-medium border cursor-pointer transition-all"
                  style={{ background: catFilter === cat ? 'var(--coral)' : 'white', color: catFilter === cat ? 'white' : 'var(--slate)', borderColor: catFilter === cat ? 'var(--coral)' : 'var(--border)' }}>
                  {cat}
                </button>
              ))}
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(intg => (
                <button key={intg.id} onClick={() => router.push(integrationHref(intg))}
                  className="bg-white rounded-2xl border p-5 text-left hover:shadow-md transition-all cursor-pointer group relative flex flex-col"
                  style={{ borderColor: enabledAll[intg.id] ? '#10b981' : 'var(--border)' }}>
                  {enabledAll[intg.id] && (
                    <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#dcfce7', color: '#16a34a' }}>
                      Active
                    </div>
                  )}
                  <div className="flex items-center gap-3 mb-3">
                    <img src={intg.logo || '/logos/webhook.svg'} alt="" width={40} height={40} className="shrink-0" style={{ width: 40, height: 40 }} />
                    <div>
                      <p className="font-bold text-sm" style={{ color: 'var(--ink)' }}>{intg.name}</p>
                      <p className="text-xs" style={{ color: 'var(--slate)' }}>{intg.category}</p>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--slate)' }}>{intg.desc}</p>
                  <div className="mt-auto pt-3 border-t w-full" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-xs font-semibold" style={{ color: 'var(--coral)' }}>
                      {enabledAll[intg.id] ? 'Configure' : 'Connect'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : activeIntegration ? (
          <div className="w-full max-w-[1200px] mx-auto px-4 md:px-8 py-6 md:py-8">
            <button onClick={() => router.push('/admin/integrations')} className="inline-flex items-center gap-1.5 text-sm mb-5 cursor-pointer hover:opacity-70" style={{ color: 'var(--slate)' }}>
              <Icon name="back" size={15} /> All integrations
            </button>

            <div className="flex items-center gap-4 mb-6">
              <img src={activeIntegration.logo || '/logos/webhook.svg'} alt="" width={56} height={56} className="shrink-0" style={{ width: 56, height: 56 }} />
              <div className="flex-1">
                <h1 className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>{activeIntegration.name}</h1>
                <p style={{ color: 'var(--slate)' }}>{activeIntegration.desc}</p>
              </div>
              {/* Enable toggle */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium" style={{ color: 'var(--slate)' }}>{enabled[activeIntegration.id] ? 'Enabled' : 'Disabled'}</span>
                <button onClick={() => setEnabled(prev => ({ ...prev, [activeIntegration.id]: !prev[activeIntegration.id] }))}
                  className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer"
                  style={{ background: enabled[activeIntegration.id] ? '#10b981' : '#d1d5db' }}>
                  <span className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                    style={{ transform: enabled[activeIntegration.id] ? 'translateX(24px)' : 'translateX(4px)' }} />
                </button>
              </div>
            </div>

            {/* Config fields */}
            <div className="bg-white rounded-2xl border p-6 mb-4" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-bold mb-4" style={{ color: 'var(--ink)' }}>Configuration</h3>

              {/* OAuth Connect Button */}
              {isOAuth(activeIntegration.id) && (
                <div className="mb-5 pb-5 border-b" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-sm mb-3" style={{ color: 'var(--slate)' }}>
                    Connect your {activeIntegration.name} account to get started:
                  </p>
                  <button onClick={() => handleOAuthConnect(activeIntegration.id)}
                    className="flex items-center gap-3 px-5 py-3 rounded-xl border text-sm font-semibold cursor-pointer hover:shadow-md transition-all"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink)', background: '#fff' }}>
                    <img src={activeIntegration.logo || '/logos/webhook.svg'} alt="" width={22} height={22} style={{ width: 22, height: 22 }} />
                    {enabled[activeIntegration.id] ? `Connected to ${activeIntegration.name}` : `Connect ${activeIntegration.name}`}
                  </button>
                  {enabled[activeIntegration.id] && (
                    <button onClick={() => setEnabled(prev => ({ ...prev, [activeIntegration.id]: false }))}
                      className="text-xs mt-2 cursor-pointer hover:underline" style={{ color: '#ef4444' }}>
                      Disconnect
                    </button>
                  )}
                  <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-xs" style={{ color: 'var(--slate)' }}>Or configure manually with API credentials:</p>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {(activeIntegration.fields || []).map(field => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>{field.label}</label>
                    <input
                      type={field.type}
                      value={configs[activeIntegration.id]?.[field.key] || ''}
                      onChange={e => updateConfig(activeIntegration.id, field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none"
                      style={{ borderColor: 'var(--border)', fontSize: '16px' }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Events */}
            <div className="bg-white rounded-2xl border p-6 mb-4" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-bold mb-2" style={{ color: 'var(--ink)' }}>Trigger on these events</h3>
              <p className="text-sm mb-4" style={{ color: 'var(--slate)' }}>Choose which Colvy events trigger this integration</p>
              <div className="space-y-2">
                {(activeIntegration.events || []).map(event => (
                  <label key={event} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-gray-50">
                    <input type="checkbox"
                      checked={(events[activeIntegration.id] || []).includes(event)}
                      onChange={() => toggleEvent(activeIntegration.id, event)}
                      className="w-4 h-4 rounded cursor-pointer" style={{ accentColor: 'var(--coral)' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{event}</span>
                  </label>
                ))}
              </div>
            </div>

            <button onClick={() => saveIntegration(activeIntegration.id)} disabled={!!saving}
              className="w-full py-3 rounded-xl font-semibold text-white cursor-pointer disabled:opacity-50 transition-all"
              style={{ background: 'var(--coral)' }}>
              {saving === activeIntegration.id ? 'Saving...' : saved === activeIntegration.id ? 'Saved' : 'Save Integration'}
            </button>
            {saveError && <p className="text-sm mt-3" role="alert" style={{ color: '#b42318' }}>{saveError}</p>}
          </div>
        ) : null}
      </main>
    </>
  )
}
