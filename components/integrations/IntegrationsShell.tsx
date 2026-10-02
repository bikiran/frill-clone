'use client'

import { createContext, Suspense, useCallback, useContext, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { resolveCompanyUser } from '@/lib/client-cache'
import { INTEGRATIONS, integrationHref } from '@/lib/integrations-catalog'

// Wraps every Integrations page: works out the business once, checks which
// integrations are connected, and keeps the integrations list on the left
// while you're inside one of them.

type Generic = { config: Record<string, any>; secrets: Record<string, string>; enabled: boolean; events: string[] }
type Ctx = {
  companyId: string | null
  ready: boolean
  active: Record<string, boolean>
  generic: Record<string, Generic>
  setActive: (id: string, on: boolean) => void
  reload: () => void
}

const IntegrationsCtx = createContext<Ctx>({ companyId: null, ready: false, active: {}, generic: {}, setActive: () => {}, reload: () => {} })
export const useIntegrations = () => useContext(IntegrationsCtx)

export async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
}

// ?slug= when given, else the workspace you're signed in to (subdomain,
// owner, or team membership).
async function resolveCompanyId(): Promise<string | null> {
  const slug = new URLSearchParams(window.location.search).get('slug')
  if (slug) {
    const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle()
    if (co?.id) return co.id
  }
  const cid = (await resolveCompanyUser()).companyId
  if (cid) return cid
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return null
  const { data: tm } = await (supabase as any).from('team_members').select('company_id').eq('user_id', session.user.id).limit(1)
  return tm?.[0]?.company_id || null
}

async function loadStatus(cid: string) {
  const sb = supabase as any
  const has = (q: Promise<any>) => q.then((r: any) => (r?.data?.length || 0) > 0, () => false)
  const [woo, shop, prexty, telnyx, twilio, co, cfg] = await Promise.all([
    has(sb.from('woocommerce_integrations').select('id').eq('company_id', cid).eq('is_active', true).limit(1)),
    has(sb.from('shopify_integrations').select('id').eq('company_id', cid).eq('is_active', true).limit(1)),
    has(sb.from('prexty_integrations').select('id').eq('company_id', cid).eq('is_active', true).limit(1)),
    sb.from('telnyx_integrations').select('is_active, phone_number').eq('company_id', cid).maybeSingle().then((r: any) => r?.data, () => null),
    sb.from('twilio_integrations').select('account_sid, phone_number').eq('company_id', cid).maybeSingle().then((r: any) => r?.data, () => null),
    sb.from('companies').select('stripe_connected, stripe_account_id, stripe_mode, stripe_publishable_key').eq('id', cid).maybeSingle().then((r: any) => r?.data, () => null),
    // This business's own settings for the general integrations (server-only table).
    authHeaders().then(h => fetch(`/api/integrations/configs?companyId=${cid}`, { headers: h })).then(r => r.json()).then(d => d?.configs || [], () => []),
  ])
  const generic: Record<string, Generic> = {}
  const active: Record<string, boolean> = {}
  for (const row of cfg as any[]) {
    generic[row.integration_id] = { config: row.config || {}, secrets: row.secrets || {}, enabled: !!row.enabled, events: row.events || [] }
    active[row.integration_id] = !!row.enabled
  }
  active.woocommerce = woo
  active.shopify = shop
  active.prexty = prexty
  // Calls & SMS: a number on either carrier (the carrier is invisible to them).
  active.calls = !!(telnyx?.is_active || telnyx?.phone_number || (twilio?.account_sid && twilio?.phone_number))
  // Stripe: a Connect account that can take charges, or own API keys.
  active.stripe = !!(co?.stripe_connected || (co?.stripe_mode === 'keys' && co?.stripe_publishable_key))
  return { active, generic, stripePending: !active.stripe && !!co?.stripe_account_id }
}

export default function IntegrationsShell({ children }: { children: React.ReactNode }) {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [active, setActiveMap] = useState<Record<string, boolean>>({})
  const [generic, setGeneric] = useState<Record<string, Generic>>({})

  const reload = useCallback(async () => {
    try {
      const cid = await resolveCompanyId()
      setCompanyId(cid)
      if (cid) {
        const s = await loadStatus(cid)
        setActiveMap(s.active); setGeneric(s.generic)
        if (s.stripePending) {
          // The flag is refreshed when the Stripe page checks the account; check now too.
          fetch(`/api/stripe/connect?companyId=${cid}`).then(r => r.json()).then(d => {
            if (d?.connected) setActiveMap(prev => ({ ...prev, stripe: true }))
          }).catch(() => {})
        }
      }
    } catch {}
    setReady(true)
  }, [])

  useEffect(() => { reload() }, [reload])
  const setActive = useCallback((id: string, on: boolean) => setActiveMap(prev => ({ ...prev, [id]: on })), [])

  return (
    <IntegrationsCtx.Provider value={{ companyId, ready, active, generic, setActive, reload }}>
      <div className="flex min-h-[calc(100vh-56px)]">
        <Suspense fallback={<aside className="hidden md:block w-64 shrink-0 bg-white border-r" style={{ borderColor: 'var(--border)' }} />}>
          <Sidebar active={active} />
        </Suspense>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </IntegrationsCtx.Provider>
  )
}

function Sidebar({ active }: { active: Record<string, boolean> }) {
  const pathname = usePathname() || ''
  const params = useSearchParams()
  const current = pathname.match(/\/admin\/integrations\/([^/?]+)/)?.[1] || params?.get('i') || null
  const count = INTEGRATIONS.filter(i => active[i.id]).length
  return (
    <aside className="hidden md:flex flex-col w-64 shrink-0 bg-white border-r" style={{ borderColor: 'var(--border)' }}>
      <Link href="/admin/integrations" className="block p-4 border-b hover:bg-gray-50 transition-colors" style={{ borderColor: 'var(--border)' }}>
        <span className="block font-bold text-sm" style={{ color: 'var(--ink)' }}>Integrations</span>
        <span className="block text-xs mt-0.5" style={{ color: 'var(--slate)' }}>{count} active</span>
      </Link>
      <nav className="flex-1 overflow-y-auto py-2 px-2" aria-label="Integrations">
        {INTEGRATIONS.map(intg => {
          const on = current === intg.id || (current === 'telnyx' && intg.id === 'calls')
          return (
            <Link key={intg.id} href={integrationHref(intg)} aria-current={on ? 'page' : undefined}
              className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg mb-0.5 transition-colors hover:bg-gray-50"
              style={{ background: on ? 'var(--peach)' : undefined }}>
              <span className="flex items-center gap-2.5 min-w-0">
                <img src={intg.logo || '/logos/webhook.svg'} alt="" width={24} height={24} className="shrink-0" style={{ width: 24, height: 24 }} />
                <span className="text-sm font-medium truncate" style={{ color: on ? 'var(--coral)' : 'var(--ink)' }}>{intg.name}</span>
              </span>
              {active[intg.id] && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#10b981' }} aria-label="Active" />}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
