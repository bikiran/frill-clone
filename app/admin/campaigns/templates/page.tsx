'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { SkeletonList } from '@/components/Skeleton'
import EmptyScroll from '@/components/EmptyScroll'
import { alertDialog, confirmDialog } from '@/components/ConfirmDialog'

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
    } catch (e: any) { alertDialog('Could not save: ' + e.message) }
    finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    if (!await confirmDialog('Delete this template?')) return
    await (supabase as any).from('campaign_templates').delete().eq('id', id)
    setTemplates(t => t.filter(x => x.id !== id))
  }

  const card: React.CSSProperties = { borderRadius: 20, background: '#fff', padding: 18, boxShadow: '0 0 0 1px rgba(0,0,0,.06), 0 1px 2px rgba(16,24,40,.04)' }
  // GSM-7 messages are 160 chars for one segment, then 153 per segment.
  const segments = message.length === 0 ? 0 : message.length <= 160 ? 1 : Math.ceil(message.length / 153)

  if (loading) return <div style={{ padding: '24px 28px' }}><SkeletonList rows={5} /></div>

  return (
    <div className="ct">
      <style>{CT_CSS}</style>
      <button onClick={() => router.push('/admin/campaigns')} className="ct-back">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        Campaigns
      </button>
      <div className="ct-head">
        <div>
          <h1>Campaign templates</h1>
          <p>Reusable messages you can start a campaign from.</p>
        </div>
        {!showNew && (
          <button type="button" className="cv-btn cv-btn-primary" onClick={() => setShowNew(true)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            New template
          </button>
        )}
      </div>

      {tableMissing && (
        <div className="ct-note err">
          <b>Template table not found</b>
          <span>Run <code>migrations/COLVY_V194_CAMPAIGNS.sql</code> in Supabase, then reload.</span>
        </div>
      )}

      {showNew && (
        <div style={{ ...card, marginBottom: 16 }}>
          <p className="ct-title">New template</p>
          <div className="ct-row">
            <label className="ct-field"><span>Name</span>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. New arrivals" autoFocus />
            </label>
            <label className="ct-field"><span>Type</span>
              <select value={type} onChange={e => setType(e.target.value)}>
                {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
          <label className="ct-field"><span>Message</span>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4}
              placeholder="Hi {{first_name}}, new arrivals at {{store_name}}! {{short_link}} Reply STOP to unsubscribe." />
          </label>
          <div className="ct-vars">
            {VARIABLES.map(v => (
              <button key={v} type="button" onClick={() => setMessage(m => m + v)}>{v}</button>
            ))}
          </div>
          <p className="ct-count">{message.length} characters · {segments} SMS segment{segments === 1 ? '' : 's'}</p>
          {message && !/stop/i.test(message) && (
            <p className="ct-note warn">Marketing SMS needs unsubscribe wording. Consider adding “Reply STOP to unsubscribe.”</p>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="cv-btn" onClick={() => setShowNew(false)}>Cancel</button>
            <button type="button" className="cv-btn cv-btn-primary" onClick={save} disabled={saving || !name.trim() || !message.trim()}>
              {saving ? 'Saving…' : 'Save template'}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {templates.length === 0 && !tableMissing && (
          <div style={{ ...card, padding: '18px 12px' }}>
            <EmptyScroll kinds={['sms', 'campaign']} compact title="No templates yet" line="Save a message you send often, then start campaigns from it."
              action={!showNew ? <button type="button" className="cv-btn" onClick={() => setShowNew(true)}>New template</button> : undefined} />
          </div>
        )}
        {templates.map(t => (
          <div key={t.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{t.name}</strong>
                {t.campaign_type && <div><span className="ct-tag">{String(t.campaign_type).replace(/_/g, ' ')}</span></div>}
              </div>
              <button type="button" className="ct-del" onClick={() => remove(t.id)} title="Delete" aria-label={`Delete template ${t.name}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
            <p className="ct-msg">{t.message}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

const CT_CSS = `
.ct{max-width:900px;margin:0 auto;padding:24px 28px 48px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink)}
.ct button::before{display:none}
.ct-back{display:inline-flex;align-items:center;gap:4px;height:32px;padding:0 14px 0 10px;margin-bottom:14px;border:none;border-radius:999px;background:#f4f4f5;color:#3f3f46;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer}
.ct-back:hover{background:#ececef;color:#18181b}
.ct-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:20px}
.ct-head h1{margin:0;font-size:30px;font-weight:800;letter-spacing:-.025em;line-height:1.15}
.ct-head p{margin:6px 0 0;font-size:14px;color:#71717a}
.ct-title{margin:0 0 14px;font-size:16px;font-weight:700}
.ct-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ct-field{display:block;margin-bottom:12px}
.ct-field > span{display:block;margin-bottom:6px;font-size:13.5px;font-weight:600}
.ct-field :is(input,select,textarea){display:block;width:100%;box-sizing:border-box;min-height:42px;padding:10px 14px;border:1.5px solid transparent;border-radius:12px;background-color:#f4f4f5;font:inherit;font-size:14px;color:var(--ink);outline:none;resize:vertical}
.ct-field select{padding-right:36px}
.ct-field :is(input,select,textarea):focus{background-color:#fff;border-color:#d4d4d8!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 16%,transparent)}
.ct-vars{display:flex;gap:5px;flex-wrap:wrap;margin:-2px 0 8px}
.ct-vars button{height:28px;padding:0 11px;border:none;border-radius:999px;background:#f4f4f5;font:inherit;font-size:12.5px;font-weight:600;color:#3f3f46;cursor:pointer}
.ct-vars button:hover{background:#ececef}
.ct-count{margin:0 0 10px;font-size:12.5px;color:#8e8e93}
.ct-note{display:flex;flex-direction:column;gap:2px;margin:0 0 12px;padding:11px 14px;border-radius:14px;font-size:13px;line-height:1.5}
.ct-note.warn{background:#fffbeb;color:#92400e;box-shadow:0 0 0 1px #fde68a}
.ct-note.err{background:#fef2f2;color:#7f1d1d;box-shadow:0 0 0 1px #fecaca;margin-bottom:16px}
.ct-tag{display:inline-flex;align-items:center;height:22px;margin-top:6px;padding:0 9px;border-radius:999px;background:#f4f4f5;color:#52525b;font-size:12px;font-weight:600;text-transform:capitalize}
.ct-del{width:32px;height:32px;flex-shrink:0;border:none;border-radius:999px;background:#f4f4f5;color:#71717a;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.ct-del:hover{background:#fff1f2;color:#e11d48}
.ct-msg{margin:12px 0 0;padding:12px 14px;border-radius:16px;background:#f4f4f5;font-size:13.5px;color:#27272a;white-space:pre-wrap;line-height:1.5}
@media(max-width:560px){.ct{padding:16px 14px 36px}.ct-head h1{font-size:25px}.ct-row{grid-template-columns:1fr}}
`
