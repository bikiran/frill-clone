'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function ScheduledPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [items, setItems] = useState<any[]>([])
  const [tab, setTab] = useState<'all' | 'message' | 'review_request'>('all')
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ type: 'message', message: '', scheduled_for: '', channel: 'widget' })

  useEffect(() => {
    const init = async () => {
      let cid: string | null = null
      if (typeof window !== 'undefined') {
        const h = window.location.hostname
        if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
          const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', h.replace('.colvy.com', '')).maybeSingle()
          if (co) cid = co.id
        }
      }
      if (!cid) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          const { data: ownCo } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
          if (ownCo?.id) cid = ownCo.id
        }
      }
      setCompanyId(cid)
      if (cid) {
        const { data } = await (supabase as any).from('scheduled_messages').select('*').eq('company_id', cid).order('scheduled_for', { ascending: true })
        setItems(data || [])
      }
      setLoading(false)
    }
    init()
  }, [])

  const createScheduled = async () => {
    if (!companyId || !form.message || !form.scheduled_for) return
    const { data: { session } } = await supabase.auth.getSession()
    const { data } = await (supabase as any).from('scheduled_messages').insert({
      company_id: companyId,
      message: form.message,
      scheduled_for: new Date(form.scheduled_for).toISOString(),
      channel: form.channel,
      type: form.type,
      status: 'pending',
      created_by: session?.user?.id,
    }).select().maybeSingle()
    if (data) setItems(prev => [...prev, data])
    setShowCreate(false)
    setForm({ type: 'message', message: '', scheduled_for: '', channel: 'widget' })
  }

  const cancelScheduled = async (id: string) => {
    if (!confirm('Cancel this scheduled message?')) return
    await (supabase as any).from('scheduled_messages').update({ status: 'cancelled' }).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'cancelled' } : i))
  }

  const filtered = items.filter(i => tab === 'all' || i.type === tab)
  const pending = items.filter(i => i.status === 'pending').length
  const reviewReqs = items.filter(i => i.type === 'review_request').length

  const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
    pending: { bg: '#fef9c3', color: '#d97706' },
    sent: { bg: '#dcfce7', color: '#059669' },
    cancelled: { bg: '#f3f4f6', color: '#6b7280' },
  }
  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 700, color: 'var(--ink)' }}>Scheduled Messages</h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--slate)' }}>Plan messages and review requests to send at a specific time</p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)}
          style={{ padding: '9px 18px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          + Schedule Message
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '2px solid var(--border)', marginBottom: 20 }}>
        {[['all', 'All'], ['message', 'Scheduled Messages'], ['review_request', 'Scheduled Review Requests']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k as any)}
            style={{ padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: tab === k ? 700 : 500, color: tab === k ? 'var(--coral)' : 'var(--slate)', borderBottom: tab === k ? '2px solid var(--coral)' : '2px solid transparent', marginBottom: -2 }}>
            {l}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
        <div style={{ borderRadius: 12, border: '1px solid var(--border)', padding: '16px 20px', background: '#fff' }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>Total Scheduled Messages</p>
          <p style={{ margin: 0, fontSize: 32, fontWeight: 800, color: 'var(--ink)' }}>{pending}</p>
          <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>Ready to be sent on their respective time and dates.</p>
        </div>
        <div style={{ borderRadius: 12, border: '1px solid var(--border)', padding: '16px 20px', background: '#fff' }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>Total Scheduled Review Requests</p>
          <p style={{ margin: 0, fontSize: 32, fontWeight: 800, color: 'var(--ink)' }}>{reviewReqs}</p>
          <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>Ready to be sent on their respective time and dates.</p>
        </div>
      </div>

      {showCreate && (
        <div style={{ borderRadius: 14, border: '1px solid var(--coral)', background: '#fff', padding: '20px 22px', marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Schedule a Message</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={{ ...inp, flex: 1 }}>
                <option value="message">Message</option>
                <option value="review_request">Review Request</option>
              </select>
              <select value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))} style={{ ...inp, flex: 1 }}>
                <option value="widget">Widget Chat</option>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
              </select>
            </div>
            <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="Message content…" rows={3}
              style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
            <input type="datetime-local" value={form.scheduled_for} onChange={e => setForm(f => ({ ...f, scheduled_for: e.target.value }))} style={inp} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={createScheduled} style={{ flex: 1, padding: '10px 0', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>Schedule</button>
              <button type="button" onClick={() => setShowCreate(false)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, background: 'var(--canvas)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 14, color: 'var(--slate)' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {loading ? <p style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>Loading…</p> : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 80, color: '#9ca3af' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" style={{ display: 'block', margin: '0 auto 12px' }}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <p style={{ fontWeight: 600, color: 'var(--slate)', fontSize: 15 }}>Schedule Messages for Later</p>
          <p style={{ fontSize: 13 }}>Plan your messages to be sent at a later date using the Schedule button above.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(item => (
            <div key={item.id} style={{ borderRadius: 12, border: '1px solid var(--border)', background: '#fff', padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: STATUS_COLOR[item.status]?.bg || '#f3f4f6', color: STATUS_COLOR[item.status]?.color || '#6b7280', textTransform: 'capitalize' }}>{item.status}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'capitalize' }}>{item.type.replace('_', ' ')} · {item.channel}</span>
                </div>
                <p style={{ margin: '0 0 6px', fontSize: 14, color: 'var(--ink)' }}>{item.message}</p>
                <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>
                  📅 Scheduled for {new Date(item.scheduled_for).toLocaleString()}
                </p>
              </div>
              {item.status === 'pending' && (
                <button type="button" onClick={() => cancelScheduled(item.id)}
                  style={{ padding: '6px 12px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', cursor: 'pointer', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                  Cancel
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
