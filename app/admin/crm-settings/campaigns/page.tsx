'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useCompanyUser, S } from '../_shared'

export default function CampaignsSettings() {
  const { companyId, loading } = useCompanyUser()
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [editing, setEditing] = useState<any>(null)

  useEffect(() => { if (companyId) load() }, [companyId])
  const load = async () => { const { data } = await (supabase as any).from('campaigns').select('*').eq('company_id', companyId).order('created_at', { ascending: false }); setCampaigns(data || []) }

  const save = async () => {
    if (!companyId || !editing?.name) return
    await (supabase as any).from('campaigns').insert({ company_id: companyId, name: editing.name, type: 'sms', message: editing.message, status: 'draft' })
    setEditing(null); load()
  }

  if (loading) return <div style={{ color: 'var(--slate)' }}>Loading…</div>

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h1 style={{ ...S.h1, margin: 0 }}>SMS Campaign</h1>
        {!editing && <button onClick={() => setEditing({})} style={S.btn}>+ New campaign</button>}
      </div>
      <p style={S.sub}>Bulk campaigns are for promotional use and are charged per message sent.</p>

      {editing ? (
        <div style={S.card}>
          <h2 style={S.h2}>New SMS Campaign</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><label style={S.label}>Campaign name</label><input value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Spring Sale" style={S.input} /></div>
            <div><label style={S.label}>Message</label><textarea value={editing.message || ''} onChange={e => setEditing({ ...editing, message: e.target.value })} rows={4} placeholder="Your message…" style={{ ...S.input, resize: 'vertical' }} /></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={save} style={S.btn}>Save draft</button>
              <button onClick={() => setEditing(null)} style={S.btnGhost}>Cancel</button>
            </div>
          </div>
        </div>
      ) : campaigns.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--slate)', border: '1px dashed var(--border)', borderRadius: 14 }}>You haven&rsquo;t sent any campaigns yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {campaigns.map(c => (
            <div key={c.id} style={{ ...S.card, marginBottom: 0, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{c.name}</p>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--slate)' }}>{c.recipients_count || 0} recipients</p>
              </div>
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, fontWeight: 600, background: c.status === 'sent' ? '#dcfce7' : '#fef3c7', color: c.status === 'sent' ? '#059669' : '#d97706', textTransform: 'capitalize' }}>{c.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
