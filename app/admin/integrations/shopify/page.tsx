'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { confirmDialog } from '@/components/ConfirmDialog'
import { useIntegrations } from '@/components/integrations/IntegrationsShell'
import { IntegrationPage, IntegrationHeader, Card, Notice, Icon, btn, inputCls, inputStyle } from '@/components/integrations/ui'

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '')

export default function ShopifyIntegrationPage() {
  const params = useSearchParams()
  const { companyId, ready, setActive } = useIntegrations()

  const [stores, setStores] = useState<any[]>([])
  const [appConfigured, setAppConfigured] = useState(true)
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [shop, setShop] = useState(params.get('shop') || '')
  const [installing, setInstalling] = useState<string | null>(null)
  const [showToken, setShowToken] = useState(false)
  const [tokenShop, setTokenShop] = useState('')
  const [token, setToken] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [adding, setAdding] = useState(false)
  const [sync, setSync] = useState<Record<string, { running: boolean; phase: string; counts: { customers: number; products: number; orders: number; created: number }; note?: string | null }>>({})
  const [error, setError] = useState(params.get('shopify_error') || '')
  const [success, setSuccess] = useState('')
  const autoSynced = useRef(false)

  const load = async (cid: string) => {
    const res = await authFetch(`/api/shopify/setup?companyId=${cid}`)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error || 'Could not load stores')
    setStores(d.stores || [])
    setAppConfigured(d.appConfigured !== false)
    setApiKey(d.apiKey || null)
    setActive('shopify', (d.stores || []).some((s: any) => s.is_active))
    return d.stores || []
  }

  useEffect(() => {
    if (!ready) return
    if (!companyId) { setError('Workspace not found. Please sign in again.'); setLoading(false); return }
    ;(async () => {
      try {
        const list = await load(companyId)
        // Back from Shopify's install screen: say so, and start the first sync.
        const connected = params.get('shopify') === 'connected' ? params.get('store') : null
        if (params.get('shopify') || params.get('shopify_error') || params.get('shop')) { try { window.history.replaceState(null, '', '/admin/integrations/shopify') } catch {} }
        if (connected && !autoSynced.current) {
          autoSynced.current = true
          const s = list.find((x: any) => x.id === connected)
          setSuccess(`${s?.store_name || 'Your store'} is connected. Importing customers now.`)
          runSync(connected)
        }
      } catch (e: any) { setError(e.message) }
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, companyId])

  // Hand the browser to Shopify's install/consent screen.
  const install = async (domain: string) => {
    if (!companyId) return
    setInstalling(domain || 'new'); setError(''); setSuccess('')
    try {
      const res = await authFetch('/api/shopify/install', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, shop: domain, returnTo: `${window.location.origin}/admin/integrations/shopify` }),
      })
      const d = await res.json()
      if (!res.ok || !d.url) throw new Error(d.error || 'Could not start the install')
      window.location.href = d.url
    } catch (e: any) { setError(e.message); setInstalling(null) }
  }

  const connectWithToken = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyId) return
    setConnecting(true); setError(''); setSuccess('')
    try {
      const res = await authFetch('/api/shopify/setup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, storeDomain: tokenShop, accessToken: token }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not connect')
      setToken(''); setTokenShop(''); setShowToken(false); setAdding(false)
      await load(companyId)
      setSuccess(`${d.store?.store_name || 'Store'} connected. Importing customers now.`)
      if (d.store?.id) runSync(d.store.id)
    } catch (e: any) { setError(e.message) } finally { setConnecting(false) }
  }

  // Resumable: keep calling with the job id until Shopify has no more pages.
  const runSync = async (integrationId: string, resumeJobId?: string) => {
    if (!companyId) return
    setError('')
    const zero = { customers: 0, products: 0, orders: 0, created: 0 }
    setSync(s => ({ ...s, [integrationId]: { running: true, phase: 'customers', counts: zero } }))
    let jobId = resumeJobId || undefined
    try {
      for (let i = 0; i < 500; i++) {
        const res = await authFetch('/api/shopify/sync', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, integrationId, jobId }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(d.error || 'Sync failed')
        jobId = d.jobId
        const c = d.counts || zero
        setSync(s => ({ ...s, [integrationId]: { running: !d.done, phase: d.phase || 'customers', counts: c, note: d.note } }))
        if (d.done) {
          setSuccess(`Imported ${c.customers.toLocaleString()} customers, ${c.products.toLocaleString()} products and ${c.orders.toLocaleString()} orders${c.created ? ` (${c.created.toLocaleString()} new contacts)` : ''}.`)
          break
        }
      }
    } catch (e: any) {
      setError(e.message)
      setSync(s => ({ ...s, [integrationId]: { ...(s[integrationId] || { phase: 'customers', counts: zero }), running: false } }))
    }
    try { await load(companyId) } catch {}
  }

  const retryWebhooks = async (integrationId: string) => {
    if (!companyId) return
    setError(''); setSuccess('')
    const res = await authFetch('/api/shopify/setup', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, integrationId, action: 'webhooks' }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) setError(d.error || 'Could not set up live updates')
    else setSuccess('Live updates from Shopify are on.')
    try { await load(companyId) } catch {}
  }

  const remove = async (s: any) => {
    if (!companyId) return
    const ok = await confirmDialog({
      title: `Remove ${s.store_name || s.store_domain}?`,
      message: `Colvy stops syncing this store and deletes its imported Shopify customer records. Contacts and conversations stay.${s.auth_type === 'oauth' ? ' To stop Shopify sending anything at all, also uninstall the Colvy app in your Shopify admin.' : ''}`,
      confirmLabel: 'Remove store', tone: 'danger',
    })
    if (!ok) return
    const res = await authFetch('/api/shopify/setup', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, integrationId: s.id }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) setError(d.error || 'Could not remove the store')
    try { await load(companyId) } catch {}
  }

  if (loading) return <IntegrationPage><div style={{ color: 'var(--slate)', fontSize: 14 }}>Loading…</div></IntegrationPage>

  const anyActive = stores.some(s => s.is_active)
  const showConnect = !stores.length || adding

  const connectCard = (
    <Card title={stores.length ? 'Add another store' : 'Connect your Shopify store'} icon="store"
      sub="Install the Colvy app on your store. Shopify asks you to approve access, then brings you back here."
      right={stores.length ? <button type="button" onClick={() => setAdding(false)} {...btn('secondary', 'sm')}>Cancel</button> : undefined}>
      {appConfigured ? (
        <form onSubmit={e => { e.preventDefault(); install(shop) }} className="sh-row">
          <input value={shop} onChange={e => setShop(e.target.value)} placeholder="your-store.myshopify.com" aria-label="Shopify store address"
            autoCapitalize="none" autoCorrect="off" spellCheck={false} className={inputCls} style={inputStyle} required />
          <button type="submit" disabled={!!installing} {...btn('primary', 'md', 'sh-install')} style={{ ...btn('primary').style, background: '#008060', borderColor: '#008060' }}>
            {installing ? 'Opening Shopify…' : 'Install on Shopify'}
          </button>
        </form>
      ) : (
        <Notice tone="info">The Colvy Shopify app isn’t set up on this deployment yet, so the one-click install is unavailable. A store with an older custom app can still connect with its token below.</Notice>
      )}
      <p className="text-xs" style={{ color: 'var(--slate)', margin: '10px 0 0' }}>
        Find it in Shopify under Settings → Domains, or in your admin address: admin.shopify.com/store/<strong>your-store</strong>.
      </p>

      <button type="button" onClick={() => setShowToken(v => !v)} aria-expanded={showToken}
        className="inline-flex items-center gap-1.5 text-sm font-semibold mt-4" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--slate)' }}>
        <Icon name="chevron" size={14} style={{ transform: showToken ? 'rotate(90deg)' : 'none', transition: 'transform .2s ease' }} />
        Store already has a custom app from before 2026?
      </button>
      <div className="sh-reveal" data-open={showToken ? '1' : '0'}>
        <div style={{ overflow: 'hidden' }}>
          <form onSubmit={connectWithToken} className="mt-3 p-4 rounded-xl" style={{ background: 'var(--canvas, #f8f8fa)', border: '1px solid var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--slate)', margin: '0 0 12px', lineHeight: 1.5 }}>
              Custom apps made in a store’s Shopify admin before 1 January 2026 still work. Open it under Settings → Apps → Develop apps and copy its Admin API access token (starts with <code>shpat_</code>). Stores connected this way sync when you press Sync, without live updates.
            </p>
            <div className="grid gap-2.5" style={{ gridTemplateColumns: '1fr' }}>
              <input value={tokenShop} onChange={e => setTokenShop(e.target.value)} placeholder="your-store.myshopify.com" aria-label="Store address" className={inputCls} style={inputStyle} required />
              <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="shpat_…" aria-label="Admin API access token" className={inputCls} style={inputStyle} required autoComplete="off" />
            </div>
            <button type="submit" disabled={connecting} {...btn('secondary', 'md', 'mt-3')}>{connecting ? 'Connecting…' : 'Connect with token'}</button>
          </form>
        </div>
      </div>
    </Card>
  )

  return (
    <IntegrationPage>
      <style>{`
        .sh-row { display: flex; gap: 8px; }
        .sh-row input { flex: 1; min-width: 0; }
        .sh-install { white-space: nowrap; }
        .sh-reveal { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .28s cubic-bezier(.16,1,.3,1); }
        .sh-reveal[data-open="1"] { grid-template-rows: 1fr; }
        .sh-bar { height: 6px; border-radius: 99px; background: var(--canvas, #f1f1f4); overflow: hidden; position: relative; }
        .sh-bar span { position: absolute; inset: 0 auto 0 0; width: 40%; border-radius: 99px; background: #008060; animation: shSlide 1.2s ease-in-out infinite; }
        @keyframes shSlide { 0% { left: -40%; } 100% { left: 100%; } }
        .sh-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
        .sh-add-mobile { display: none; }
        .sh-front { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 12px; border: 1px solid var(--border, #ececf1); }
        .sh-front-row { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; gap: 4px 12px; }
        .sh-front-ic { flex: 0 0 auto; width: 32px; height: 32px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #008060; background: #e3f1ec; }
        .sh-front-row a { white-space: nowrap; flex: 0 0 auto; }
        @media (max-width: 560px) {
          .sh-front-row { grid-template-columns: 32px minmax(0, 1fr); align-items: start; }
          .sh-front-row a { grid-column: 1 / -1; width: 100%; justify-content: center; margin-top: 6px; }
          .sh-row { flex-direction: column; }
          .sh-stats { grid-template-columns: 1fr 1fr; }
          .sh-add-desktop { display: none !important; }
          .sh-add-mobile { display: flex; width: 100%; margin: -8px 0 16px; }
        }
        @media (prefers-reduced-motion: reduce) { .sh-reveal, .sh-bar span { transition: none; animation: none; } }
      `}</style>

      <IntegrationHeader id="shopify" connected={anyActive} badge={stores.length > 1 ? `${stores.length} stores` : 'Connected'}
        desc="Your Shopify customers, orders and products in Colvy, kept up to date automatically.">
        {stores.length > 0 && !adding && (
          <button type="button" onClick={() => { setAdding(true); setShop('') }} {...btn('secondary', 'sm', 'sh-add-desktop')}><Icon name="plus" size={14} /> Add store</button>
        )}
      </IntegrationHeader>
      {stores.length > 0 && !adding && (
        <button type="button" onClick={() => { setAdding(true); setShop('') }} {...btn('secondary', 'md', 'sh-add-mobile')}><Icon name="plus" size={14} /> Add another store</button>
      )}

      {error && <Notice tone="error">{error}</Notice>}
      {success && <Notice tone="success">{success}</Notice>}

      <div className="flex flex-col gap-4">
        {showConnect && connectCard}

        {stores.map(s => {
          const st = sync[s.id]
          const running = !!st?.running
          const resumable = !running && s.lastJob && ['running', 'error'].includes(s.lastJob.status)
          const status = !s.is_active ? { tone: '#b42318', bg: '#fef3f2', text: s.uninstalled_at ? 'App uninstalled in Shopify' : 'Disconnected' }
            : s.needs_reauth ? { tone: '#b42318', bg: '#fef3f2', text: 'Needs reconnecting' }
            : { tone: '#067647', bg: '#ecfdf3', text: s.auth_type === 'oauth' ? 'Connected · live updates' : 'Connected · token' }
          return (
            <Card key={s.id} icon="store"
              title={<span className="flex items-center gap-2 flex-wrap">{s.store_name || s.store_domain}
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: status.bg, color: status.tone }}>{status.text}</span></span>}
              sub={s.store_domain}>
              <div className="sh-stats">
                {[
                  { n: (running ? st.counts.customers : s.customers || 0).toLocaleString(), l: s.linked ? `Customers · ${s.linked.toLocaleString()} linked` : 'Customers' },
                  { n: (running ? st.counts.products : s.products || 0).toLocaleString(), l: 'Products' },
                  { n: (running ? st.counts.orders : s.orders || 0).toLocaleString(), l: 'Orders' },
                  { n: s.last_synced_at ? fmt(s.last_synced_at) : 'Never', l: 'Last sync' },
                ].map(x => (
                  <div key={x.l} className="p-3 rounded-xl" style={{ background: 'var(--canvas, #f8f8fa)' }}>
                    <div className="font-bold" style={{ color: 'var(--ink)', fontSize: 15 }}>{x.n}</div>
                    <div className="text-xs" style={{ color: 'var(--slate)' }}>{x.l}</div>
                  </div>
                ))}
              </div>

              {running && (
                <div className="mt-4" role="status" aria-live="polite">
                  <div className="sh-bar"><span /></div>
                  <p className="text-xs mt-2" style={{ color: 'var(--slate)', margin: '8px 0 0' }}>
                    Importing {st.phase}… {st.counts.customers.toLocaleString()} customers, {st.counts.products.toLocaleString()} products, {st.counts.orders.toLocaleString()} orders so far. You can leave this page; press Resume to carry on later.
                  </p>
                </div>
              )}
              {(st?.note || (s.last_error && s.is_active)) && !running && (
                <div className="mt-4"><Notice tone="info">{st?.note || s.last_error}
                  {s.auth_type === 'oauth' && s.last_error && /subscrib|webhook/i.test(s.last_error) && (
                    <> <button type="button" onClick={() => retryWebhooks(s.id)} className="font-semibold underline" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit' }}>Try again</button></>
                  )}
                </Notice></div>
              )}

              {s.is_active && !s.needs_reauth && s.auth_type === 'oauth' && apiKey && (
                <div className="sh-front mt-4">
                  <div className="text-xs font-semibold" style={{ color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '.04em' }}>On your store</div>
                  {[
                    { icon: 'chat', title: 'Chat bubble', sub: 'Your Colvy chat on every page of the store.', label: 'Turn on',
                      href: `https://${s.store_domain}/admin/themes/current/editor?context=apps&template=index&activateAppId=${apiKey}/chat-widget` },
                    { icon: 'bell', title: '“Notify me” on sold-out products', sub: 'Shoppers leave a mobile or email; Colvy texts them when it’s back. Shows in Waitlists.', label: 'Add to product page',
                      href: `https://${s.store_domain}/admin/themes/current/editor?template=product&addAppBlockId=${apiKey}/back-in-stock&target=mainSection` },
                  ].map(x => (
                    <div key={x.title} className="sh-front-row">
                      <span className="sh-front-ic" aria-hidden="true"><Icon name={x.icon} size={16} /></span>
                      <div style={{ minWidth: 0 }}>
                        <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{x.title}</div>
                        <div className="text-xs" style={{ color: 'var(--slate)' }}>{x.sub}</div>
                      </div>
                      <a href={x.href} target="_blank" rel="noopener noreferrer" {...btn('secondary', 'sm')}>{x.label} <Icon name="external" size={12} /></a>
                    </div>
                  ))}
                  <p className="text-xs" style={{ color: 'var(--slate)', margin: 0 }}>Opens your theme editor with it added — press Save there to publish.</p>
                </div>
              )}

              <div className="flex gap-2 flex-wrap mt-4">
                {(!s.is_active || s.needs_reauth) ? (
                  appConfigured && <button type="button" onClick={() => install(s.store_domain)} disabled={!!installing} {...btn('primary', 'sm')} style={{ ...btn('primary', 'sm').style, background: '#008060', borderColor: '#008060' }}>
                    {installing === s.store_domain ? 'Opening Shopify…' : s.uninstalled_at ? 'Reinstall app' : 'Reconnect'}
                  </button>
                ) : (
                  <button type="button" onClick={() => runSync(s.id, resumable ? s.lastJob.id : undefined)} disabled={running} {...btn('secondary', 'sm')}>
                    <Icon name="sync" size={13} /> {running ? 'Importing…' : resumable ? 'Resume import' : 'Sync now'}
                  </button>
                )}
                {s.is_active && s.auth_type !== 'oauth' && appConfigured && (
                  <button type="button" onClick={() => install(s.store_domain)} disabled={!!installing} {...btn('secondary', 'sm')}>Switch to the Colvy app</button>
                )}
                <button type="button" onClick={() => remove(s)} disabled={running} {...btn('danger', 'sm')}><Icon name="trash" size={13} /> Remove</button>
              </div>
            </Card>
          )
        })}
      </div>
    </IntegrationPage>
  )
}
