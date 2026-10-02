'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SkeletonCards } from '@/components/Skeleton'
import { INTEGRATIONS, CATEGORIES, integrationHref } from '@/lib/integrations-catalog'
import { useIntegrations } from '@/components/integrations/IntegrationsShell'
import GeneralIntegration from '@/components/integrations/GeneralIntegration'
import { Icon } from '@/components/integrations/ui'



export default function IntegrationsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selected = searchParams.get('i')
  const { ready, active } = useIntegrations()
  const [catFilter, setCatFilter] = useState('All')

  const filtered = catFilter === 'All' ? INTEGRATIONS : INTEGRATIONS.filter(i => i.category === catFilter)
  const activeIntegration = INTEGRATIONS.find(i => i.id === selected && !i.isDedicated)

  if (!ready) return <SkeletonCards cards={8} />
  if (activeIntegration) return <GeneralIntegration id={activeIntegration.id} />

  return (
    <main className="w-full">
      <div className="px-4 md:px-8 py-6 md:py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Integrations</h1>
          <p style={{ color: 'var(--slate)' }}>Connect Colvy to the tools your team already uses. Orders, bookings, payments, messages and more can flow into Slack, Zapier, Jira and others the moment they happen.</p>
        </div>

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
              style={{ borderColor: active[intg.id] ? '#10b981' : 'var(--border)' }}>
              {active[intg.id] && (
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
                <p className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: 'var(--coral)' }}>
                  {active[intg.id] ? 'Configure' : 'Connect'} <Icon name="chevron" size={12} />
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </main>
  )
}
