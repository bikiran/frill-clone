'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Platform-wide announcement bar. This is a COLVY feature — a message shown
// across the top of every company's admin (e.g. "SMS is now live").
// Company-scoped banners aren't offered; this is for the product team.
export default function PlatformBannerAdmin() {
  const [banners, setBanners] = useState<any[]>([])
  const [editing, setEditing] = useState<any>(null)
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(true)

  const blank = { message: '', link_url: '', link_label: '', is_active: true }

  // Deep links into the app that a banner might point at.
  const LINK_PRESETS = [
    { label: 'Channels', url: '/admin/crm-settings/channels' },
    { label: 'Automatic replies', url: '/admin/crm-settings/auto-replies' },
    { label: 'Chat widget', url: '/admin/crm-settings/chat-widget' },
    { label: 'Google Reviews', url: '/admin/crm-settings/channels/google-reviews' },
    { label: 'Team', url: '/admin/team' },
  ]

  const load = async () => {
    const { data } = await (supabase as any).from('admin_banners')
      .select('*').is('company_id', null).order('created_at', { ascending: false })
    setBanners(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    if (!editing?.message?.trim()) { setMsg('Write a message first.'); return }
    const payload = {
      company_id: null,           // platform-wide
      message: editing.message.trim(),
      link_url: (editing.link_url || '').trim() || null,
      link_label: (editing.link_label || '').trim() || null,
      is_active: editing.is_active !== false,
    }
    if (editing.id) await (supabase as any).from('admin_banners').update(payload).eq('id', editing.id)
    else await (supabase as any).from('admin_banners').insert(payload)
    setEditing(null)
    setMsg('Saved. Everyone will see it on their next page load.')
    await load()
  }

  const remove = async (id: string) => {
    await (supabase as any).from('admin_banners').delete().eq('id', id)
    await load()
  }
  const toggle = async (b: any) => {
    await (supabase as any).from('admin_banners').update({ is_active: !b.is_active }).eq('id', b.id)
    await load()
  }

  const L: any = { display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }
  const I: any = { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box', marginBottom: 14 }

  if (loading) return <div style={{ color: 'var(--slate)' }}>Loading…</div>

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 6, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: '0 0 4px' }}>Product banner</h1>
          <p style={{ fontSize: 14, color: 'var(--slate)', margin: 0 }}>
            A message across the top of every company&rsquo;s admin. Each person can dismiss it.
          </p>
        </div>
        {!editing && (
          <button onClick={() => setEditing({ ...blank })}
            style={{ padding: '10px 18px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Add banner
          </button>
        )}
      </div>

      {msg && <p style={{ fontSize: 13, color: 'var(--coral)', margin: '10px 0' }}>{msg}</p>}

      {editing && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 20, background: '#fff', marginTop: 18, marginBottom: 20 }}>
          <p style={{ ...L, marginBottom: 8 }}>Preview</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '9px 16px', background: 'var(--coral)', color: '#fff', borderRadius: 10, fontSize: 13.5, fontWeight: 600, marginBottom: 18 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span>{editing.message || 'Your message appears here'}</span>
            {editing.link_url && <span style={{ textDecoration: 'underline', fontWeight: 800 }}>{editing.link_label || 'Learn more'}</span>}
          </div>

          <label style={L}>Message</label>
          <input style={I} value={editing.message || ''}
            placeholder="SMS is now live — connect a number to start texting customers."
            onChange={e => setEditing({ ...editing, message: e.target.value })} />

          <label style={L}>Link <span style={{ fontWeight: 400, color: 'var(--slate)' }}>— optional</span></label>
          <input style={{ ...I, marginBottom: 8 }} value={editing.link_url || ''}
            placeholder="/admin/crm-settings/channels"
            onChange={e => setEditing({ ...editing, link_url: e.target.value })} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
            {LINK_PRESETS.map(p => (
              <button key={p.url} type="button"
                onClick={() => setEditing({ ...editing, link_url: p.url, link_label: editing.link_label || p.label })}
                style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--slate)', cursor: 'pointer' }}>
                {p.label}
              </button>
            ))}
          </div>

          <label style={L}>Link text</label>
          <input style={I} value={editing.link_label || ''} placeholder="Set it up"
            onChange={e => setEditing({ ...editing, link_label: e.target.value })} />

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <input type="checkbox" checked={editing.is_active !== false}
              onChange={e => setEditing({ ...editing, is_active: e.target.checked })}
              style={{ width: 17, height: 17, accentColor: 'var(--coral)' }} />
            <span style={{ fontSize: 13.5, color: 'var(--ink)' }}>Show this banner</span>
          </label>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save}
              style={{ padding: '10px 20px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Save</button>
            <button onClick={() => setEditing(null)}
              style={{ padding: '10px 20px', borderRadius: 9, background: '#fff', color: 'var(--slate)', border: '1px solid var(--border)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
        {banners.length === 0 && !editing && (
          <p style={{ fontSize: 14, color: 'var(--slate)', textAlign: 'center', padding: 30 }}>
            No banners. Add one to announce a feature to every company.
          </p>
        )}
        {banners.map(b => (
          <div key={b.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: '#fff', opacity: b.is_active ? 1 : 0.6 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--ink)', lineHeight: 1.5 }}>{b.message}</p>
                {b.link_url && (
                  <p style={{ margin: '5px 0 0', fontSize: 12, color: 'var(--coral)' }}>
                    {b.link_label || 'Learn more'} → <code style={{ color: 'var(--slate)' }}>{b.link_url}</code>
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => toggle(b)}
                  style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: b.is_active ? '#15803d' : 'var(--slate)' }}>
                  {b.is_active ? 'Live' : 'Hidden'}
                </button>
                <button onClick={() => setEditing({ ...b })}
                  style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: 'var(--ink)' }}>Edit</button>
                <button onClick={() => remove(b.id)}
                  style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#dc2626' }}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20, padding: 14, borderRadius: 10, background: 'var(--canvas)', border: '1px solid var(--border)' }}>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.6 }}>
          Only the <strong>most recent live banner</strong> is shown. Once someone dismisses it they won&rsquo;t see it again — and editing the text doesn&rsquo;t un-dismiss it, so publish a <strong>new</strong> banner when you want everyone to see it.
        </p>
      </div>
    </div>
  )
}
