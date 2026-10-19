'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { Notice, Icon, btn } from '@/components/integrations/ui'

// Stock by store, on a store's integration page: which of the store's stock
// locations is which Colvy outlet (/api/outlet-stock). Saving turns per-store
// stock answers on for the AI agents, the phone AI and the inbox product
// search; "Turn off" goes back to overall stock.

type Loc = { id: string; name: string; address: string | null; saved: boolean; outletId: string | null; hidden: boolean; suggestedOutletId: string | null }
type Full = {
  enabled: boolean; migrationNeeded: boolean; migrationNote: string | null; canEdit: boolean; authType: string | null
  status: 'ok' | 'needs_scopes' | 'no_plugin' | 'single' | 'error'; message: string | null
  outlets: { id: string; label: string | null; suburb: string | null }[]
  locations: Loc[]
}

const HIDE = '__hide'
const outletText = (o: { label: string | null; suburb: string | null }) => [o.label, o.suburb && o.suburb !== o.label ? o.suburb : null].filter(Boolean).join(' · ') || 'Outlet'

export default function OutletStockMapping({ companyId, provider, integrationId, onReconnect, reconnecting }: {
  companyId: string; provider: 'shopify' | 'woocommerce'; integrationId: string
  /** Shopify app installs: back through Shopify's permission screen. */
  onReconnect?: () => void; reconnecting?: boolean
}) {
  const [summary, setSummary] = useState<{ enabled: boolean; mapped: number; migrationNeeded: boolean } | null>(null)
  const [open, setOpen] = useState(false)
  const [full, setFull] = useState<Full | null>(null)
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const qs = `companyId=${encodeURIComponent(companyId)}&provider=${provider}&integrationId=${encodeURIComponent(integrationId)}`

  useEffect(() => {
    let live = true
    authFetch(`/api/outlet-stock?${qs}&summary=1`).then(r => r.ok ? r.json() : null).then(d => { if (live && d) setSummary(d) }).catch(() => {})
    return () => { live = false }
  }, [qs])

  const load = async () => {
    setLoading(true); setError('')
    try {
      const r = await authFetch(`/api/outlet-stock?${qs}`)
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Couldn’t load your locations')
      setFull(d)
      const c: Record<string, string> = {}
      for (const l of (d.locations || []) as Loc[]) c[l.id] = l.hidden ? HIDE : l.saved ? (l.outletId || '') : (l.suggestedOutletId || '')
      setChoice(c)
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }

  const toggle = () => { const next = !open; setOpen(next); setDone(''); if (next && !full) load() }

  const save = async () => {
    if (!full) return
    setSaving(true); setError(''); setDone('')
    try {
      const r = await authFetch('/api/outlet-stock', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, provider, integrationId, locations: full.locations.map(l => ({ id: l.id, name: l.name, outletId: choice[l.id] && choice[l.id] !== HIDE ? choice[l.id] : null, hidden: choice[l.id] === HIDE })) }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Couldn’t save')
      setDone('Saved. The AI now answers stock questions store by store.')
      setSummary(s => ({ enabled: true, mapped: full.locations.filter(l => choice[l.id] && choice[l.id] !== HIDE).length, migrationNeeded: s?.migrationNeeded || false }))
      await load()
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  const turnOff = async () => {
    setSaving(true); setError(''); setDone('')
    try {
      const r = await authFetch('/api/outlet-stock', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, provider, integrationId }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Couldn’t turn it off')
      setDone('Turned off. Stock is answered for each product overall.')
      setSummary(s => ({ enabled: false, mapped: 0, migrationNeeded: s?.migrationNeeded || false }))
      await load()
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  const state = summary?.enabled ? `On${summary.mapped ? ` · ${summary.mapped} outlet${summary.mapped === 1 ? '' : 's'}` : ''}` : 'Off'
  const where = provider === 'shopify' ? 'Shopify location' : 'stock location'

  return (
    <div className="osm mt-4">
      <style>{`
        .osm { border: 1px solid var(--border, #ececf1); border-radius: 12px; padding: 12px; }
        .osm-head { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; gap: 4px 12px; }
        .osm-ic { width: 32px; height: 32px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: var(--coral); background: var(--peach); }
        .osm-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 220px); gap: 6px 12px; align-items: center; padding: 10px 0; border-top: 1px solid var(--border, #ececf1); }
        .osm-row select { width: 100%; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--border, #ececf1); background: #fff; color: var(--ink); font-size: 16px; }
        @media (max-width: 560px) {
          .osm-head { grid-template-columns: 32px minmax(0, 1fr); }
          .osm-head > button { grid-column: 1 / -1; width: 100%; }
          .osm-row { grid-template-columns: minmax(0, 1fr); }
        }
      `}</style>
      <div className="osm-head">
        <span className="osm-ic" aria-hidden="true"><Icon name="pin" size={16} /></span>
        <div style={{ minWidth: 0 }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Stock by store <span className="text-xs font-semibold" style={{ color: summary?.enabled ? '#067647' : 'var(--slate)' }}>· {state}</span></div>
          <div className="text-xs" style={{ color: 'var(--slate)' }}>
            {provider === 'shopify'
              ? 'Match each Shopify location to your outlet, so the AI can say “3 at Richmond, none at Fitzroy”.'
              : 'For stores using the Stock Locations for WooCommerce plugin: match each stock location to your outlet.'}
          </div>
        </div>
        <button type="button" onClick={toggle} aria-expanded={open} {...btn('secondary', 'sm')}>{open ? 'Close' : summary?.enabled ? 'Edit' : 'Set up'}</button>
      </div>

      {open && (
        <div className="mt-3">
          {loading && <p className="text-xs" style={{ color: 'var(--slate)', margin: 0 }}>Loading your locations…</p>}
          {error && <Notice tone="error">{error}</Notice>}
          {done && <Notice tone="success">{done}</Notice>}
          {full && !loading && (
            <>
              {full.migrationNote && <Notice tone="info">{full.migrationNote}</Notice>}
              {full.status === 'needs_scopes' && (
                <Notice tone="info">
                  {full.message} Until then the AI answers with overall stock.{' '}
                  {full.authType === 'oauth' && onReconnect
                    ? <button type="button" onClick={onReconnect} disabled={reconnecting} className="font-semibold underline" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit' }}>{reconnecting ? 'Opening Shopify…' : 'Approve in Shopify'}</button>
                    : <>Add the <strong>read_locations</strong> and <strong>read_inventory</strong> access scopes to your custom app in Shopify, or switch to the Colvy app.</>}
                </Notice>
              )}
              {full.status === 'no_plugin' && (
                <Notice tone="info">
                  WooCommerce keeps one stock number per product, so Colvy can’t see stock for each store on its own. Colvy reads it from the <strong>Stock Locations for WooCommerce</strong> plugin, which wasn’t found on this store (or isn’t turned on for its products). The AI answers with overall stock.
                </Notice>
              )}
              {full.status === 'single' && <Notice tone="info">This store has {full.locations.length ? 'one' : 'no'} {where}{full.locations.length ? '' : 's'}, so stock is answered for each product overall.</Notice>}
              {full.status === 'error' && <Notice tone="error">{full.message || 'Couldn’t reach the store.'}</Notice>}

              {full.status === 'ok' && (
                <>
                  {!full.outlets.length && <Notice tone="info">Add your outlets on the <a href="/admin/locations" className="font-semibold underline" style={{ color: 'inherit' }}>Locations</a> page to match them here. Until then, each {where} shows by its own name.</Notice>}
                  <div>
                    {full.locations.map(l => {
                      const v = choice[l.id] ?? ''
                      const suggested = !l.saved && l.suggestedOutletId && v === l.suggestedOutletId
                      return (
                        <div key={l.id} className="osm-row">
                          <div style={{ minWidth: 0 }}>
                            <div className="text-sm font-semibold" style={{ color: 'var(--ink)', overflowWrap: 'anywhere' }}>{l.name}
                              {suggested && <span className="text-xs font-semibold" style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 6, background: 'var(--peach)', color: 'var(--coral)' }}>Suggested</span>}
                            </div>
                            {l.address && <div className="text-xs" style={{ color: 'var(--slate)', overflowWrap: 'anywhere' }}>{l.address}</div>}
                          </div>
                          <select aria-label={`Outlet for ${l.name}`} value={v} disabled={!full.canEdit || saving} onChange={e => setChoice(c => ({ ...c, [l.id]: e.target.value }))}>
                            <option value="">Show as “{l.name}”</option>
                            {full.outlets.map(o => <option key={o.id} value={o.id}>{outletText(o)}</option>)}
                            <option value={HIDE}>Don’t show (not a store)</option>
                          </select>
                        </div>
                      )
                    })}
                  </div>
                  {full.canEdit ? (
                    <div className="flex gap-2 flex-wrap mt-2">
                      <button type="button" onClick={save} disabled={saving || full.migrationNeeded} {...btn('primary', 'sm')}>{saving ? 'Saving…' : full.enabled ? 'Save' : 'Turn on stock by store'}</button>
                      {full.enabled && <button type="button" onClick={turnOff} disabled={saving} {...btn('secondary', 'sm')}>Turn off</button>}
                    </div>
                  ) : <p className="text-xs" style={{ color: 'var(--slate)', margin: '8px 0 0' }}>Only the owner or an admin can change this.</p>}
                  <p className="text-xs" style={{ color: 'var(--slate)', margin: '8px 0 0' }}>Stock is read live from {provider === 'shopify' ? 'Shopify' : 'your store'} when the AI or your team checks it. “Don’t show” suits a warehouse customers can’t visit.</p>
                </>
              )}
              {full.enabled && full.status !== 'ok' && full.canEdit && (
                <div className="mt-2"><button type="button" onClick={turnOff} disabled={saving} {...btn('secondary', 'sm')}>Turn off</button></div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
