'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { SkeletonCards } from '@/components/Skeleton'

const INTEGRATIONS = [
  {
    id: 'woocommerce',
    name: 'WooCommerce',
    desc: 'Sync your WooCommerce customers and orders directly into Colvy for better customer insights.',
    icon: '🛍️',
    color: '#96588A',
    bg: '#f3e8ff',
    logo: '/logos/woocommerce.svg',
    category: 'E-Commerce',
    isDedicated: true, // Special flag for custom page
  },
  {
    id: 'shopify',
    name: 'Shopify',
    desc: 'Connect your Shopify store to sync customers into Colvy. Works with multiple stores.',
    icon: '🛒',
    color: '#95BF47',
    bg: '#eefbe0',
    logo: '',
    category: 'E-Commerce',
    isDedicated: true,
  },
  {
    id: 'stripe',
    name: 'Stripe Payments',
    desc: 'Take card payments and send invoices directly inside the chat. Connect your own Stripe account.',
    icon: '💳',
    color: '#635BFF',
    bg: '#f5f3ff',
    logo: '',
    category: 'Payments',
    isDedicated: true,
  },
  {
    id: 'telnyx',
    name: 'Calls & SMS',
    desc: 'Call customers from your browser and continue live chats over SMS to their mobile.',
    icon: '📞',
    color: '#00c08b',
    bg: '#e6faf4',
    logo: '',
    category: 'Communication',
    isDedicated: true,
  },
  {
    id: 'slack',
    name: 'Slack',
    desc: 'Post to a Slack channel when ideas are submitted, voted on, or change status.',
    icon: '🟦',
    color: '#4A154B',
    bg: '#f9f0ff',
    logo: '/logos/slack.svg',
    category: 'Notifications',
    fields: [
      { key: 'webhook_url', label: 'Slack Webhook URL', placeholder: 'https://hooks.slack.com/services/...', type: 'text' },
      { key: 'channel', label: 'Channel', placeholder: '#product-feedback', type: 'text' },
    ],
    events: ['New Idea', 'New Vote', 'Status Change', 'New Comment'],
  },
  {
    id: 'jira',
    name: 'Jira',
    desc: 'Automatically create Jira issues from Colvy ideas.',
    icon: '🔵',
    color: '#0052CC',
    bg: '#e6f0ff',
    logo: '/logos/jira.svg',
    category: 'Project Management',
    fields: [
      { key: 'domain', label: 'Jira Domain', placeholder: 'yourcompany.atlassian.net', type: 'text' },
      { key: 'project_key', label: 'Project Key', placeholder: 'PROJ', type: 'text' },
      { key: 'api_token', label: 'API Token', placeholder: 'Your Jira API token', type: 'password' },
      { key: 'email', label: 'Jira Email', placeholder: 'you@company.com', type: 'email' },
    ],
    events: ['New Idea', 'Status Change'],
  },
  {
    id: 'linear',
    name: 'Linear',
    desc: 'Send ideas from Colvy straight to Linear as issues.',
    icon: '⚫',
    color: '#5E6AD2',
    bg: '#f0f0ff',
    logo: '/logos/linear.svg',
    category: 'Project Management',
    fields: [
      { key: 'api_key', label: 'Linear API Key', placeholder: 'lin_api_...', type: 'password' },
      { key: 'team_id', label: 'Team ID', placeholder: 'Your Linear team ID', type: 'text' },
    ],
    events: ['New Idea', 'Status Change'],
  },
  {
    id: 'trello',
    name: 'Trello',
    desc: 'Add new Colvy ideas as Trello cards automatically.',
    icon: '🟩',
    color: '#0079BF',
    bg: '#e8f4ff',
    logo: '/logos/trello.svg',
    category: 'Project Management',
    fields: [
      { key: 'api_key', label: 'Trello API Key', placeholder: 'Your Trello API key', type: 'password' },
      { key: 'token', label: 'Trello Token', placeholder: 'Your Trello token', type: 'password' },
      { key: 'board_id', label: 'Board ID', placeholder: 'Your Trello board ID', type: 'text' },
    ],
    events: ['New Idea'],
  },
  {
    id: 'zapier',
    name: 'Zapier',
    desc: 'Connect Colvy to 5000+ apps with Zapier automations.',
    icon: '🟠',
    color: '#FF4A00',
    bg: '#fff4f0',
    logo: '/logos/zapier.svg',
    category: 'Automation',
    fields: [
      { key: 'webhook_url', label: 'Zapier Webhook URL', placeholder: 'https://hooks.zapier.com/hooks/catch/...', type: 'text' },
    ],
    events: ['New Idea', 'New Vote', 'Status Change', 'New Comment', 'New Announcement'],
  },
  {
    id: 'github',
    name: 'GitHub',
    desc: 'Create GitHub issues from Colvy ideas.',
    icon: '⚫',
    color: '#24292F',
    bg: '#f6f8fa',
    logo: '/logos/github.svg',
    category: 'Development',
    fields: [
      { key: 'token', label: 'Personal Access Token', placeholder: 'ghp_...', type: 'password' },
      { key: 'repo', label: 'Repository', placeholder: 'owner/repo', type: 'text' },
    ],
    events: ['New Idea'],
  },
  {
    id: 'intercom',
    name: 'Intercom',
    desc: 'Create and manage Colvy ideas inside of Intercom.',
    icon: '🟣',
    color: '#286EFA',
    bg: '#e8f0ff',
    logo: '/logos/intercom.svg',
    category: 'Customer Support',
    fields: [
      { key: 'access_token', label: 'Access Token', placeholder: 'Your Intercom access token', type: 'password' },
    ],
    events: ['New Idea', 'Status Change'],
  },
  {
    id: 'zendesk',
    name: 'Zendesk',
    desc: 'Create and manage Colvy ideas inside of Zendesk.',
    icon: '🟢',
    color: '#03363D',
    bg: '#e8f5f5',
    logo: '/logos/zendesk.svg',
    category: 'Customer Support',
    fields: [
      { key: 'subdomain', label: 'Zendesk Subdomain', placeholder: 'yourcompany', type: 'text' },
      { key: 'email', label: 'Agent Email', placeholder: 'agent@yourcompany.com', type: 'email' },
      { key: 'api_token', label: 'API Token', placeholder: 'Your Zendesk API token', type: 'password' },
    ],
    events: ['New Idea', 'Status Change'],
  },
  {
    id: 'webhook',
    name: 'Custom Webhook',
    desc: 'Send Colvy events to any URL with a custom HTTP webhook.',
    icon: '🔗',
    color: '#374151',
    bg: '#f9fafb',
    logo: '/logos/webhook.svg',
    category: 'Automation',
    fields: [
      { key: 'url', label: 'Webhook URL', placeholder: 'https://yourapp.com/webhook', type: 'text' },
      { key: 'secret', label: 'Secret (optional)', placeholder: 'Signing secret for verification', type: 'password' },
    ],
    events: ['New Idea', 'New Vote', 'Status Change', 'New Comment', 'New Announcement'],
  },
]

const CATEGORIES = ['All', ...Array.from(new Set(INTEGRATIONS.map(i => i.category)))]

export default function IntegrationsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const slug = searchParams.get('slug') || ''
  
  const [user, setUser] = useState<any>(null)
  const [configs, setConfigs] = useState<Record<string, any>>({})
  const [enabled, setEnabled] = useState<Record<string, boolean>>({})
  const [events, setEvents] = useState<Record<string, string[]>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [catFilter, setCatFilter] = useState('All')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => {
      const u = data?.session?.user
      setUser(u)
      loadIntegrations()
    })
  }, [router])

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
      alert(`OAuth for ${intId} requires setting up OAuth credentials in your dashboard.`)
    }
  }

  const isOAuth = (intId: string) => OAUTH_INTEGRATIONS.includes(intId)

  const loadIntegrations = async () => {
    try {
      // Get company ID first
      const slug = new URLSearchParams(window.location.search).get('slug')
      let cid = null
      if (slug) {
        const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', slug).single()
        cid = co?.id
      }

      // Load standard integrations
      const { data } = await (supabase as any).from('integration_configs').select('*')
      const cfgs: Record<string, any> = {}
      const enb: Record<string, boolean> = {}
      const evts: Record<string, string[]> = {}
      ;(data || []).forEach((row: any) => {
        cfgs[row.integration_id] = row.config || {}
        enb[row.integration_id] = row.enabled || false
        evts[row.integration_id] = row.events || []
      })

      // Check for WooCommerce integration
      if (cid) {
        const { data: wooRows } = await (supabase as any)
          .from('woocommerce_integrations')
          .select('is_active')
          .eq('company_id', cid)
          .eq('is_active', true)
          .limit(1)
        const wooData = wooRows?.[0]
        
        if (wooData && wooData.is_active) {
          enb['woocommerce'] = true
        } else {
          enb['woocommerce'] = false
        }

        // Check for a connected Shopify store
        const { data: shopRows } = await (supabase as any)
          .from('shopify_integrations')
          .select('is_active')
          .eq('company_id', cid)
          .eq('is_active', true)
          .limit(1)
        enb['shopify'] = !!(shopRows && shopRows.length > 0)

        // Check for Telnyx integration
        const { data: telnyxData } = await (supabase as any)
          .from('telnyx_integrations')
          .select('is_active')
          .eq('company_id', cid)
          .maybeSingle()
        enb['telnyx'] = !!(telnyxData && telnyxData.is_active)

        // Check for Stripe connection
        const { data: co } = await (supabase as any).from('companies').select('stripe_connected').eq('id', cid).maybeSingle()
        enb['stripe'] = !!co?.stripe_connected
      }

      setConfigs(cfgs)
      setEnabled(enb)
      setEvents(evts)
    } catch {}
    setLoading(false)
  }

  const saveIntegration = async (id: string) => {
    setSaving(id)
    try {
      const payload = {
        integration_id: id,
        config: configs[id] || {},
        enabled: enabled[id] || false,
        events: events[id] || [],
      }
      await (supabase as any).from('integration_configs').upsert(payload, { onConflict: 'integration_id' })
      setSaved(id)
      setTimeout(() => setSaved(null), 2000)
    } catch (err: any) {
      alert('Save failed: ' + err.message)
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

  if (!user || loading) return <SkeletonCards cards={8} />

  return (
    <div className="flex min-h-[calc(100vh-56px)]">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 bg-white border-r" style={{ borderColor: 'var(--border)' }}>
        <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-bold text-sm" style={{ color: 'var(--ink)' }}>Integrations</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>{Object.values(enabled).filter(Boolean).length} active</p>
        </div>
        <div className="p-3 border-b" style={{ borderColor: 'var(--border)' }}>
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setCatFilter(cat)}
              className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all mb-0.5"
              style={{ background: catFilter === cat ? 'var(--peach)' : 'transparent', color: catFilter === cat ? 'var(--coral)' : 'var(--slate)' }}>
              {cat}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto py-2 px-2">
          {filtered.map(intg => (
            <button key={intg.id} onClick={() => {
              if ((intg as any).isDedicated) {
                router.push(`/admin/integrations/${intg.id}?slug=${slug}`)
              } else {
                setSelected(intg.id)
              }
            }}
              className="w-full text-left px-3 py-2.5 rounded-lg transition-all hover:bg-gray-50 cursor-pointer mb-0.5"
              style={{ background: selected === intg.id ? 'var(--peach)' : 'transparent', borderLeft: selected === intg.id ? '2px solid var(--coral)' : '2px solid transparent' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded flex items-center justify-center p-0.5 shrink-0" style={{ background: intg.bg }}><img src={intg.logo || '/logos/webhook.svg'} alt={intg.name} style={{ width: 16, height: 16, objectFit: 'contain' }} /></div>
                  <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{intg.name}</span>
                </div>
                {enabled[intg.id] && <div className="w-2 h-2 rounded-full" style={{ background: '#10b981' }} />}
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="px-6 py-8">
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
                <button key={intg.id} onClick={() => {
                  if ((intg as any).isDedicated) {
                    router.push(`/admin/integrations/${intg.id}?slug=${slug}`)
                  } else {
                    setSelected(intg.id)
                  }
                }}
                  className="bg-white rounded-2xl border p-5 text-left hover:shadow-md transition-all cursor-pointer group relative"
                  style={{ borderColor: enabled[intg.id] ? '#10b981' : 'var(--border)' }}>
                  {enabled[intg.id] && (
                    <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#dcfce7', color: '#16a34a' }}>
                      Active
                    </div>
                  )}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center p-2" style={{ background: intg.bg }}><img src={intg.logo || '/logos/webhook.svg'} alt={intg.name} style={{ width: 24, height: 24, objectFit: 'contain' }} /></div>
                    <div>
                      <p className="font-bold text-sm" style={{ color: 'var(--ink)' }}>{intg.name}</p>
                      <p className="text-xs" style={{ color: 'var(--slate)' }}>{intg.category}</p>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--slate)' }}>{intg.desc}</p>
                  <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-xs font-semibold" style={{ color: 'var(--coral)' }}>
                      {enabled[intg.id] ? 'Configure →' : 'Connect →'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : activeIntegration ? (
          <div className="px-6 py-8 max-w-2xl">
            <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm mb-6 cursor-pointer hover:opacity-70" style={{ color: 'var(--slate)' }}>
              ← All Integrations
            </button>

            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center p-3" style={{ background: activeIntegration.bg }}><img src={activeIntegration.logo || '/logos/webhook.svg'} alt={activeIntegration.name} style={{ width: 36, height: 36, objectFit: 'contain' }} /></div>
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
                    style={{ borderColor: 'var(--border)', color: 'var(--ink)', background: activeIntegration.bg }}>
                    <img src={activeIntegration.logo || '/logos/webhook.svg'} alt={activeIntegration.name} style={{ width: 20, height: 20, objectFit: 'contain' }} />
                    {enabled[activeIntegration.id] ? `✅ Connected to ${activeIntegration.name}` : `Connect ${activeIntegration.name}`}
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
                {activeIntegration.fields.map(field => (
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
                {activeIntegration.events.map(event => (
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
              {saving === activeIntegration.id ? 'Saving...' : saved === activeIntegration.id ? '✅ Saved!' : 'Save Integration'}
            </button>
          </div>
        ) : null}
      </main>
    </div>
  )
}
