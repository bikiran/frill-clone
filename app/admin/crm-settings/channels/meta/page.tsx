'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function MetaChannelsPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(true)
  const [metaRootOrigin, setMetaRootOrigin] = useState('')
  const [channels, setChannels] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [msg, setMsg] = useState('')

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      let cid: string | null = null
      const { data: owned } = await (supabase as any).from('companies').select('id').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1)
      cid = owned?.[0]?.id || null
      if (!cid) {
        const { data: tm } = await (supabase as any).from('team_members').select('company_id').eq('user_id', user.id).limit(1)
        cid = tm?.[0]?.company_id || null
      }
      setCompanyId(cid)
      if (cid) await load(cid)
      setLoading(false)

      const p = new URLSearchParams(window.location.search)
      if (p.get('connected')) setMsg(`Connected ${p.get('connected')} channel(s). Map each to an outlet below.`)
      if (p.get('error')) setMsg('Connection failed: ' + p.get('error'))
    })()
  }, [])

  const load = async (cid: string) => {
    const res = await fetch(`/api/meta/channels?companyId=${cid}`)
    const d = await res.json()
    setConfigured(d.configured !== false)
    setMetaRootOrigin(d.rootOrigin || '')
    setChannels(d.channels || [])
    setLocations(d.locations || [])
  }

  const api = async (body: any) => {
    await fetch('/api/meta/channels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (companyId) await load(companyId)
  }

  const locLabel = (l: any) => l.label || l.suburb || 'Outlet'

  if (loading) return <div style={{ padding: 40, color: 'var(--slate)' }}>Loading…</div>

  const fbChannels = channels.filter(c => c.platform === 'facebook')
  const igChannels = channels.filter(c => c.platform === 'instagram')

  return (
    <div style={{ maxWidth: 820, padding: '8px 4px' }}>
      <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>Instagram &amp; Messenger</h1>
      <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--slate)', lineHeight: 1.55 }}>
        Connect each outlet's Facebook Page and Instagram account, then map it to that outlet so its DMs land in the right inbox.
      </p>

      {msg && (
        <div style={{ marginBottom: 18, padding: '11px 14px', borderRadius: 10, background: msg.includes('failed') ? '#fee2e2' : '#dcfce7', color: msg.includes('failed') ? '#dc2626' : '#15803d', fontSize: 13.5 }}>
          {msg}
        </div>
      )}

      {!configured && (
        <div style={{ marginBottom: 18, padding: 14, borderRadius: 12, background: '#fef3c7', border: '1px solid #fde68a' }}>
          <p style={{ margin: '0 0 4px', fontSize: 13.5, fontWeight: 700, color: '#92400e' }}>Meta app not configured yet</p>
          <p style={{ margin: 0, fontSize: 12.5, color: '#92400e', lineHeight: 1.55 }}>
            Set <code>META_APP_ID</code>, <code>META_APP_SECRET</code> and <code>META_REDIRECT_URI</code> in Vercel, then reload.
            See <code>META_SETUP.md</code> for the full checklist and which permissions to request in App Review.
          </p>
        </div>
      )}

      {/* Connect */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 26, flexWrap: 'wrap' }}>
        <a href={configured && companyId ? `${metaRootOrigin}/api/meta/connect?companyId=${companyId}&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}` : undefined}
          onClick={e => { if (!configured) { e.preventDefault(); setMsg('Configure the Meta app first (see above).') } }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 10, background: '#1877F2', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none', opacity: configured ? 1 : 0.6 }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/></svg>
          Connect Facebook &amp; Instagram
        </a>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--slate)', maxWidth: 340, lineHeight: 1.5, alignSelf: 'center' }}>
          Connecting a Page also connects its linked Instagram business account, if it has one.
        </p>
      </div>

      {channels.length === 0 ? (
        <div style={{ padding: 28, borderRadius: 12, border: '1px dashed var(--border)', textAlign: 'center', color: 'var(--slate)', fontSize: 13.5 }}>
          No connected accounts yet.
        </div>
      ) : (
        <>
          {[['Facebook Messenger', fbChannels], ['Instagram', igChannels]].map(([title, list]: any) => list.length > 0 && (
            <div key={title} style={{ marginBottom: 22 }}>
              <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--slate)' }}>{title}</p>
              {list.map((c: any) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 8, background: '#fff', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                      {c.platform === 'instagram' ? (c.ig_username ? `@${c.ig_username}` : 'Instagram account') : c.page_name}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--slate)' }}>
                      {c.platform === 'instagram' ? `via Page ${c.page_name}` : `Page ID ${c.page_id}`}
                    </p>
                    {c.last_error && <p style={{ margin: '3px 0 0', fontSize: 11.5, color: '#dc2626' }}>{c.last_error}</p>}
                  </div>

                  {/* Per-location mapping */}
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#9ca3af', marginBottom: 3 }}>Outlet</label>
                    <select value={c.location_id || ''} onChange={e => api({ action: 'map_location', id: c.id, location_id: e.target.value || null })}
                      style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, background: '#fff', minWidth: 150 }}>
                      <option value="">Unassigned</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{locLabel(l)}</option>)}
                    </select>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={c.is_active !== false}
                      onChange={e => api({ action: 'toggle', id: c.id, is_active: e.target.checked })}
                      style={{ width: 16, height: 16, accentColor: 'var(--coral)' }} />
                    <span style={{ fontSize: 12, color: 'var(--ink)' }}>Active</span>
                  </label>

                  <button type="button" onClick={() => { if (confirm('Disconnect this account?')) api({ action: 'disconnect', id: c.id }) }}
                    style={{ padding: '6px 11px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    Disconnect
                  </button>
                </div>
              ))}
            </div>
          ))}
          {locations.length === 0 && (
            <p style={{ fontSize: 12.5, color: '#b45309' }}>
              You have no outlets yet — add locations first, then map each connected account to one.
            </p>
          )}
        </>
      )}
    </div>
  )
}
