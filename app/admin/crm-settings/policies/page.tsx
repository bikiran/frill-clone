'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useCompanyUser, S, ToggleRow } from '../_shared'

export default function PoliciesSettings() {
  const { companyId, loading } = useCompanyUser()
  const [policies, setPolicies] = useState<any[]>([])
  const [editing, setEditing] = useState<any>(null)

  useEffect(() => { if (companyId) load() }, [companyId])
  const load = async () => { const { data } = await (supabase as any).from('policies').select('*').eq('company_id', companyId).order('created_at', { ascending: false }); setPolicies(data || []) }

  const save = async () => {
    if (!companyId || !editing?.title) return
    const payload = { company_id: companyId, title: editing.title, body: editing.body, requires_signature: editing.requires_signature !== false }
    if (editing.id) await (supabase as any).from('policies').update(payload).eq('id', editing.id)
    else await (supabase as any).from('policies').insert(payload)
    setEditing(null); load()
  }

  if (loading) return <div style={{ color: 'var(--slate)' }}>Loading…</div>

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h1 style={{ ...S.h1, margin: 0 }}>Policies</h1>
        {!editing && <button onClick={() => setEditing({ requires_signature: true })} style={S.btn}>+ Add policy</button>}
      </div>
      <p style={S.sub}>Collect legally binding agreements from customers, such as liability waivers or consent forms. Create and manage multiple policies, and view signed ones from your dashboard.</p>

      {editing ? (
        <div style={S.card}>
          <h2 style={S.h2}>{editing.id ? 'Edit' : 'New'} policy</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><label style={S.label}>Title</label><input value={editing.title || ''} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="Liability Waiver" style={S.input} /></div>
            <div><label style={S.label}>Body</label><textarea value={editing.body || ''} onChange={e => setEditing({ ...editing, body: e.target.value })} rows={6} placeholder="Policy terms…" style={{ ...S.input, resize: 'vertical' }} /></div>
            <ToggleRow title="Requires signature" desc="Customers must sign this policy for it to be valid." checked={editing.requires_signature !== false} onChange={v => setEditing({ ...editing, requires_signature: v })} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={save} style={S.btn}>Save policy</button>
              <button onClick={() => setEditing(null)} style={S.btnGhost}>Cancel</button>
            </div>
          </div>
        </div>
      ) : policies.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--slate)', border: '1px dashed var(--border)', borderRadius: 14 }}>No policies yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {policies.map(p => (
            <div key={p.id} style={{ ...S.card, marginBottom: 0, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{p.title}</p>
                {p.requires_signature && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--slate)' }}>✍ Requires signature</p>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setEditing(p)} style={{ ...S.btnGhost, padding: '6px 14px', fontSize: 12.5 }}>Edit</button>
                <button onClick={async () => { if (confirm('Delete policy?')) { await (supabase as any).from('policies').delete().eq('id', p.id); load() } }} style={{ padding: '6px 14px', borderRadius: 8, background: '#fff', border: '1px solid #fecaca', color: '#dc2626', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
