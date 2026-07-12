'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Manage the announcement bar shown across the top of the admin.
// Only one banner is shown at a time (the most recent active one), and each
// person can dismiss it — dismissal is remembered per banner.
export default function BannersPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [banners, setBanners] = useState<any[]>([])
  const [editing, setEditing] = useState<any>(null)
  const [msg, setMsg] = useState('')

  const blank = { message: '', link_url: '', link_label: '', is_active: true }

  // Handy places to deep-link people to.
  const LINK_PRESETS = [
    { label: 'Chat Widget settings', url: '/admin/settings#general' },
    { label: 'Automatic replies', url: '/admin/auto-replies' },
    { label: 'Channels', url: '/admin/channels' },
    { label: 'Team', url: '/admin/team' },
    { label: 'Google Reviews', url: '/admin/integrations/google-reviews' },
  ]

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
    })()
  }, [])

  const load = async (cid: string) => {
    const { data } = await (supabase as any).from('admin_banners')
      .select('*').eq('company_id', cid).order('created_at', { ascending: false })
    setBanners(data || [])
  }

  const save = async () => {
    if (!companyId || !editing?.message?.trim()) { setMsg('Write a message first.'); return }
    const payload = {
      company_id: companyId,
      message: editing.message.trim(),
      link_url: (editing.link_url || '').trim() || null,
      link_label: (editing.link_label || '').trim() || null,
      is_active: editing.is_active !== false,
    }
    if (editing.id) await (supabase as any).from('admin_banners').update(payload).eq('id', editing.id)
    else await (supabase as any).from('admin_banners').insert(payload)
    setEditing(null); setMsg('Saved. Your team will see it on their next page load.')
    await load(companyId)
  }

  const remove = async (id: string) => {
    if (!companyId) return
    await (supabase as any).from('admin_banners').delete().eq('id', id)
    await load(companyId)
  }

  const toggle = async (b: any) => {
    if (!companyId) return
    await (supabase as any).from('admin_banners').update({ is_active: !b.is_active }).eq('id', b.id)
    await load(companyId)
  }

  const L: any = { display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }
  const I: any = { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box', marginBottom: 14 }

  if (loading) return <div style={{ padding: 28 }}>Loading…</div>

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 24px', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: '0 0 4px' }}>Announcement bar</h1>
          <p style={{ fontSize: 14, color: 'var(--slate)', margin: 0 }}>A message across the top of the admin for your team. They can dismiss it.</p>
        </div>
        {!editing && (
          <button onClick={() => setEditing({ ...blank })}
            style={{ padding: '10px 18px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Add announcement
          </button>
        )}
      </div>

      {msg && <p style={{ fontSize: 13, color: 'var(--coral)', margin: '10px 0' }}>{msg}</p>}

      {editing && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 20, background: '#fff', marginTop: 18, marginBottom: 20 }}>
          {/* Live preview */}
          <p style={{ ...L, marginBottom: 8 }}>Preview</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '9px 16px', background: 'var(--coral)', color: '#fff', borderRadius: 10, fontSize: 13.5, fontWeight: 600, marginBottom: 18 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span>{editing.message || 'Your message appears here'}</span>
            {editing.link_url && (
              <span style={{ textDecoration: 'underline', fontWeight: 800 }}>{editing.link_label || 'Learn more'}</span>
            )}
          </div>

          <label style={L}>Message</label>
          <input style={I} value={editing.message || ''}
            placeholder="Heads up — SMS is now live. Set up your number to start texting customers."
            onChange={e => setEditing({ ...editing, message: e.target.value })} />

          <label style={L}>Link <span style={{ fontWeight: 400, color: 'var(--slate)' }}>— optional; can point at a settings page</span></label>
          <input style={{ ...I, marginBottom: 8 }} value={editing.link_url || ''}
            placeholder="/admin/settings#general"
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
            <span style={{ fontSize: 13.5, color: 'var(--ink)' }}>Show this announcement</span>
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
            No announcements. Add one to tell your team about a new feature or a change.
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
          Only the <strong>most recent live announcement</strong> is shown. Once someone dismisses it, they won&rsquo;t see that one again — but editing the message doesn&rsquo;t un-dismiss it, so publish a <strong>new</strong> announcement when you want everyone to see it again.
        </p>
      </div>
    </div>
  )
}
