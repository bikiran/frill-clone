'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { SkeletonList } from '@/components/Skeleton'

const TYPES = [
  ['promotion', 'Promotion'], ['new_arrivals', 'New arrivals'], ['product_launch', 'Product launch'],
  ['event', 'Event'], ['review_request', 'Review request'], ['follow_up', 'Customer follow-up'],
  ['service_announcement', 'Service announcement'], ['general_update', 'General update'],
] as const

// Variables the composer will substitute per recipient.
const VARIABLES = ['{{first_name}}', '{{store_name}}', '{{outlet}}', '{{order_number}}', '{{coupon_code}}', '{{short_link}}']

export default function CampaignTemplatesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<any[]>([])
  const [tableMissing, setTableMissing] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('promotion')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        let cid: string | null = null
        if (typeof window !== 'undefined') {
          const host = window.location.hostname
          if (host.endsWith('.colvy.com') && host !== 'colvy.com') {
            const slug = host.replace('.colvy.com', '')
            const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle()
            if (co) cid = co.id
          }
        }
        if (!cid) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user) {
            const { data: own } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
            if (own?.id) cid = own.id
            else {
              const { data: mem } = await (supabase as any).from('team_members').select('company_id').eq('user_id', session.user.id).limit(1)
              if (mem?.length) cid = mem[0].company_id
            }
          }
        }
        if (!cid) { setLoading(false); return }
        setCompanyId(cid)
        const { data, error } = await (supabase as any).from('campaign_templates')
          .select('*').eq('company_id', cid).order('created_at', { ascending: false })
        if (error) setTableMissing(true)
        else setTemplates(data || [])
      } finally { setLoading(false) }
    })()
  }, [])

  const save = async () => {
    if (!name.trim() || !message.trim() || !companyId) return
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await (supabase as any).from('campaign_templates').insert({
        company_id: companyId, name: name.trim(), channel: 'sms',
        campaign_type: type, message: message.trim(),
        created_by: session?.user?.email?.split('@')[0] || null,
      }).select().maybeSingle()
      if (error) throw error
      setTemplates(t => [data, ...t])
      setName(''); setMessage(''); setShowNew(false)
    } catch (e: any) { alert('Could not save: ' + e.message) }
    finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this template?')) return
    await (supabase as any).from('campaign_templates').delete().eq('id', id)
    setTemplates(t => t.filter(x => x.id !== id))
  }

  const card: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 14, background: '#fff', padding: 16 }
  // GSM-7 messages are 160 chars for one segment, then 153 per segment.
  const segments = message.length === 0 ? 0 : message.length <= 160 ? 1 : Math.ceil(message.length / 153)

  if (loading) return <SkeletonList rows={5} />

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <button onClick={() => router.push('/admin/campaigns')}
        style={{ border: 'none', background: 'none', color: 'var(--slate)', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 12 }}>
        ← Back to campaigns
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Campaign templates</h1>
          <p style={{ color: 'var(--slate)', fontSize: 13, margin: '5px 0 0' }}>
            Reusable message bodies you can start a campaign from.
          </p>
        </div>
        <button onClick={() => setShowNew(v => !v)}
          style={{ padding: '9px 16px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          + New template
        </button>
      </div>

      {tableMissing && (
        <div style={{ ...card, borderColor: '#fecaca', background: '#fef2f2', marginBottom: 16 }}>
          <strong style={{ color: '#dc2626', fontSize: 13.5 }}>Template table not found</strong>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#7f1d1d' }}>
            Run <code>migrations/COLVY_V194_CAMPAIGNS.sql</code> in Supabase, then reload.
          </p>
        </div>
      )}

      {showNew && (
        <div style={{ ...card, marginBottom: 16 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Template name"
            style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }} />
          <select value={type} onChange={e => setType(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, marginBottom: 10, background: '#fff' }}>
            {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4}
            placeholder="Hi {{first_name}}, new arrivals at {{store_name}}! {{short_link}} Reply STOP to unsubscribe."
            style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', margin: '8px 0' }}>
            {VARIABLES.map(v => (
              <button key={v} type="button" onClick={() => setMessage(m => m + v)}
                style={{ padding: '4px 9px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--canvas)', fontSize: 11.5, fontWeight: 600, color: 'var(--slate)', cursor: 'pointer' }}>
                {v}
              </button>
            ))}
          </div>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--slate)' }}>
            {message.length} characters · {segments} SMS segment{segments === 1 ? '' : 's'}
          </p>
          {message && !/stop/i.test(message) && (
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#b45309', background: '#fffbeb', border: '1px dashed #f59e0b', borderRadius: 8, padding: '8px 10px' }}>
              Marketing SMS needs unsubscribe wording. Consider adding “Reply STOP to unsubscribe.”
            </p>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={saving || !name.trim() || !message.trim()}
              style={{ padding: '8px 16px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving || !name.trim() || !message.trim() ? 0.5 : 1 }}>
              {saving ? 'Saving…' : 'Save template'}
            </button>
            <button onClick={() => setShowNew(false)}
              style={{ padding: '8px 16px', borderRadius: 9, background: '#fff', color: 'var(--ink)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {templates.length === 0 && !tableMissing && (
          <div style={{ ...card, textAlign: 'center', color: 'var(--slate)', fontSize: 13.5, padding: 30 }}>
            No templates yet.
          </div>
        )}
        {templates.map(t => (
          <div key={t.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div>
                <strong style={{ fontSize: 14, color: 'var(--ink)' }}>{t.name}</strong>
                <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'capitalize', marginTop: 2 }}>
                  {String(t.campaign_type || '').replace(/_/g, ' ')}
                </div>
              </div>
              <button onClick={() => remove(t.id)} title="Delete"
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', padding: 4, display: 'inline-flex' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--slate)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{t.message}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
