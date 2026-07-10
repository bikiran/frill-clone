'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useCompanyUser, S } from '../_shared'

const TOOLS = [
  { id: 'quick-response', name: 'Quick Response', desc: 'Saved template responses you can send with a click to answer recurring questions and save time.' },
  { id: 'bulk', name: 'Bulk Messaging', desc: 'Send the same message to multiple contacts. Great for business updates (not marketing).' },
  { id: 'category', name: 'Conversation Category', desc: 'Create categories to filter your conversations and keep things organised.' },
  { id: 'reviews', name: 'Reviews', desc: 'Configure review requests for Google, Facebook, TripAdvisor and more.' },
  { id: 'bulk-review', name: 'Bulk Review Request', desc: 'Send bulk review requests to all your contacts or from a CSV to get those 5-star reviews.' },
  { id: 'audience', name: 'Audience', desc: 'Create saved contact segments with simple rules, then use them in bulk messages and campaigns.' },
]

export default function PowerUpsSettings() {
  const { companyId, loading } = useCompanyUser()
  const [view, setView] = useState<string | null>(null)
  const [responses, setResponses] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [editing, setEditing] = useState<any>(null)

  useEffect(() => { if (companyId) { loadResponses(); loadCategories() } }, [companyId])
  const loadResponses = async () => { const { data } = await (supabase as any).from('quick_responses').select('*').eq('company_id', companyId).order('created_at'); setResponses(data || []) }
  const loadCategories = async () => { const { data } = await (supabase as any).from('conversation_categories').select('*').eq('company_id', companyId).order('created_at'); setCategories(data || []) }

  const saveResponse = async () => {
    if (!companyId || !editing?.body) return
    const payload = { company_id: companyId, shortcut: editing.shortcut || null, title: editing.title || null, body: editing.body }
    if (editing.id) await (supabase as any).from('quick_responses').update(payload).eq('id', editing.id)
    else await (supabase as any).from('quick_responses').insert(payload)
    setEditing(null); await loadResponses()
  }
  const saveCategory = async () => {
    if (!companyId || !editing?.name) return
    const payload = { company_id: companyId, name: editing.name, color: editing.color || '#ff7a6b' }
    if (editing.id) await (supabase as any).from('conversation_categories').update(payload).eq('id', editing.id)
    else await (supabase as any).from('conversation_categories').insert(payload)
    setEditing(null); await loadCategories()
  }

  if (loading) return <div style={{ color: 'var(--slate)' }}>Loading…</div>

  // Quick Response sub-view
  if (view === 'quick-response') {
    return (
      <div style={{ maxWidth: 640 }}>
        <button onClick={() => { setView(null); setEditing(null) }} style={{ ...S.btnGhost, marginBottom: 16, padding: '7px 14px', fontSize: 13 }}>← Time Savers</button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 style={{ ...S.h1, margin: 0 }}>Quick Response</h1>
          {!editing && <button onClick={() => setEditing({})} style={S.btn}>+ Add</button>}
        </div>
        {editing ? (
          <div style={S.card}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={S.label}>Shortcut (optional)</label><input value={editing.shortcut || ''} onChange={e => setEditing({ ...editing, shortcut: e.target.value })} placeholder="/hours" style={S.input} /></div>
              <div><label style={S.label}>Title</label><input value={editing.title || ''} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="Opening hours" style={S.input} /></div>
              <div><label style={S.label}>Message</label><textarea value={editing.body || ''} onChange={e => setEditing({ ...editing, body: e.target.value })} rows={4} placeholder="Our hours are…" style={{ ...S.input, resize: 'vertical' }} /></div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={saveResponse} style={S.btn}>Save</button>
                <button onClick={() => setEditing(null)} style={S.btnGhost}>Cancel</button>
              </div>
            </div>
          </div>
        ) : responses.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--slate)', border: '1px dashed var(--border)', borderRadius: 14 }}>No quick responses yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {responses.map(r => (
              <div key={r.id} style={{ ...S.card, marginBottom: 0, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{r.title || r.shortcut || 'Response'}{r.shortcut && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--coral)', fontWeight: 600 }}>{r.shortcut}</span>}</p>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--slate)' }}>{r.body}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setEditing(r)} style={{ ...S.btnGhost, padding: '5px 12px', fontSize: 12 }}>Edit</button>
                    <button onClick={async () => { await (supabase as any).from('quick_responses').delete().eq('id', r.id); loadResponses() }} style={{ padding: '5px 12px', borderRadius: 8, background: '#fff', border: '1px solid #fecaca', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Conversation Category sub-view
  if (view === 'category') {
    return (
      <div style={{ maxWidth: 640 }}>
        <button onClick={() => { setView(null); setEditing(null) }} style={{ ...S.btnGhost, marginBottom: 16, padding: '7px 14px', fontSize: 13 }}>← Time Savers</button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 style={{ ...S.h1, margin: 0 }}>Conversation Category</h1>
          {!editing && <button onClick={() => setEditing({ color: '#ff7a6b' })} style={S.btn}>+ Add</button>}
        </div>
        {editing ? (
          <div style={S.card}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={S.label}>Name</label><input value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="VIP" style={S.input} /></div>
              <div><label style={S.label}>Colour</label><input type="color" value={editing.color || '#ff7a6b'} onChange={e => setEditing({ ...editing, color: e.target.value })} style={{ width: 60, height: 40, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer' }} /></div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={saveCategory} style={S.btn}>Save</button>
                <button onClick={() => setEditing(null)} style={S.btnGhost}>Cancel</button>
              </div>
            </div>
          </div>
        ) : categories.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--slate)', border: '1px dashed var(--border)', borderRadius: 14 }}>No categories yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {categories.map(c => (
              <div key={c.id} style={{ ...S.card, marginBottom: 0, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 14, height: 14, borderRadius: '50%', background: c.color }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{c.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setEditing(c)} style={{ ...S.btnGhost, padding: '5px 12px', fontSize: 12 }}>Edit</button>
                  <button onClick={async () => { await (supabase as any).from('conversation_categories').delete().eq('id', c.id); loadCategories() }} style={{ padding: '5px 12px', borderRadius: 8, background: '#fff', border: '1px solid #fecaca', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Hub
  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={S.h1}>Time Savers</h1>
      <p style={S.sub}>Tools to help you work faster and smarter.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
        {TOOLS.map(t => {
          const clickable = t.id === 'quick-response' || t.id === 'category'
          return (
            <div key={t.id} onClick={() => clickable && setView(t.id)}
              style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 18, background: '#fff', cursor: clickable ? 'pointer' : 'default', opacity: clickable ? 1 : 0.75 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{t.name}</h3>
                {!clickable && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--slate)', background: 'var(--canvas)', padding: '2px 8px', borderRadius: 20 }}>SOON</span>}
              </div>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.5 }}>{t.desc}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
