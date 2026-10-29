'use client'

import { authFetch } from '@/lib/auth-fetch'
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
  const [woo, shop, prexty, telnyx, twilio, co, cfg, mcp] = await Promise.all([
    has(sb.from('woocommerce_integrations').select('id').eq('company_id', cid).eq('is_active', true).limit(1)),
    has(sb.from('shopify_integrations').select('id').eq('company_id', cid).eq('is_active', true).limit(1)),
    has(sb.from('prexty_integrations').select('id').eq('company_id', cid).eq('is_active', true).limit(1)),
    sb.from('telnyx_integrations').select('is_active, phone_number').eq('company_id', cid).maybeSingle().then((r: any) => r?.data, () => null),
    sb.from('twilio_integrations').select('account_sid, phone_number').eq('company_id', cid).maybeSingle().then((r: any) => r?.data, () => null),
    sb.from('companies').select('stripe_connected, stripe_account_id, stripe_mode, stripe_publishable_key').eq('id', cid).maybeSingle().then((r: any) => r?.data, () => null),
    // This business's own settings for the general integrations (server-only table).
    authHeaders().then(h => fetch(`/api/integrations/configs?companyId=${cid}`, { headers: h })).then(r => r.json()).then(d => d?.configs || [], () => []),
    authHeaders().then(h => fetch(`/api/mcp/keys?companyId=${cid}`, { headers: h })).then(r => r.json()).then(d => (d?.keys?.length || 0) + (d?.apps?.length || 0) > 0, () => false),
  ])
  const generic: Record<string, Generic> = {}
  const active: Record<string, boolean> = {}
  for (const row of cfg as any[]) {
    generic[row.integration_id] = { config: row.config || {}, secrets: row.secrets || {}, enabled: !!row.enabled, events: row.events || [] }
    active[row.integration_id] = !!row.enabled
  }
  active.woocommerce = woo
  active.mcp = mcp
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
          authFetch(`/api/stripe/connect?companyId=${cid}`).then(r => r.json()).then(d => {
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
      <style>{IGS_CSS}</style>
      <div className="igs">
        <Suspense fallback={null}>
          <Sidebar active={active} />
        </Suspense>
        <div className="igs-main">{children}</div>
      </div>
    </IntegrationsCtx.Provider>
  )
}

// Inside one integration: the list of them all on the left, as a white card
// that stays put while the page scrolls. The overview page is the list
// itself, so it has none.
function Sidebar({ active }: { active: Record<string, boolean> }) {
  const pathname = usePathname() || ''
  const params = useSearchParams()
  const current = pathname.match(/\/admin\/integrations\/([^/?]+)/)?.[1] || params?.get('i') || null
  const count = INTEGRATIONS.filter(i => active[i.id]).length
  if (!current) return null
  return (
    <aside className="igs-side" aria-label="Integrations">
      <Link href="/admin/integrations" className="igs-all">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="15 18 9 12 15 6" /></svg>
        <span><b>All integrations</b><small>{count} connected</small></span>
      </Link>
      <nav aria-label="Integrations">
        {INTEGRATIONS.map(intg => {
          const on = current === intg.id || (current === 'telnyx' && intg.id === 'calls')
          return (
            <Link key={intg.id} href={integrationHref(intg)} aria-current={on ? 'page' : undefined} className={`igs-item${on ? ' on' : ''}`}>
              <span className="igs-logo"><img src={intg.logo || '/logos/webhook.svg'} alt="" width={20} height={20} /></span>
              <span className="igs-name">{intg.name}</span>
              {active[intg.id] && <span className="igs-dot" aria-label="Connected" />}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

const IGS_CSS = `
.igs{display:flex;gap:12px;align-items:flex-start;min-height:calc(100vh - 56px)}
.igs-main{flex:1;min-width:0}
.admin-main:has(.igs-side){overflow-x:clip!important;overflow-y:visible!important;min-width:0}
.igs-side{position:sticky;top:68px;width:250px;flex-shrink:0;margin:12px 0 12px 12px;max-height:calc(100vh - 80px);overflow-y:auto;scrollbar-width:thin;padding:8px;border-radius:20px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.05),0 1px 2px rgba(16,24,40,.04)}
@media (max-width:767px){.igs-side{display:none}}
.igs-all{display:flex;align-items:center;gap:8px;padding:9px 10px 11px;margin-bottom:4px;border-radius:12px;color:var(--ink);text-decoration:none;box-shadow:0 1px 0 #f0f0f2}
.igs-all:hover{background:#f7f7f8}
.igs-all span{display:flex;flex-direction:column;line-height:1.25}
.igs-all b{font-size:14px;font-weight:650}
.igs-all small{font-size:12px;color:#8e8e93}
.igs-item{display:flex;align-items:center;gap:10px;padding:7px 10px;margin:1px 0;border-radius:12px;color:var(--ink);text-decoration:none;font-size:14px;font-weight:500;transition:background .12s}
.igs-item:hover{background:#f7f7f8}
.igs-item.on{background:#efeff1;font-weight:650}
.igs-logo{width:28px;height:28px;flex-shrink:0;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;background:#f4f4f5}
.igs-logo img{width:18px;height:18px;object-fit:contain}
.igs-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.igs-dot{width:8px;height:8px;flex-shrink:0;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px #dcfce7}
[data-theme="dark"] .igs-all:hover,[data-theme="dark"] .igs-item:hover{background:#2a2a2e}
[data-theme="dark"] .igs-item.on{background:#333337}
[data-theme="dark"] .igs-logo{background:#2a2a2e}
`
