'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useCompanyUser, S } from '../_shared'

const TYPES = ['text', 'number', 'date', 'checkbox', 'dropdown']

export default function CustomFieldsSettings() {
  const { companyId, loading } = useCompanyUser()
  const [fields, setFields] = useState<any[]>([])
  const [editing, setEditing] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (companyId) load() }, [companyId])
  const load = async () => {
    const { data } = await (supabase as any).from('custom_fields').select('*').eq('company_id', companyId).order('created_at')
    setFields(data || [])
  }

  const save = async () => {
    if (!companyId || !editing?.title) return
    setSaving(true)
    // Write both the new columns (title/options) and the legacy NOT NULL
    // columns from the original custom_fields table (field_name/field_label)
    // so inserts satisfy existing constraints.
    const payload: any = {
      company_id: companyId,
      title: editing.title,
      field_type: editing.field_type || 'text',
      options: editing.options || [],
      field_name: editing.title,
      field_label: editing.title,
      dropdown_options: editing.options || [],
    }
    if (editing.id) await (supabase as any).from('custom_fields').update(payload).eq('id', editing.id)
    else await (supabase as any).from('custom_fields').insert(payload)
    setSaving(false); setEditing(null); await load()
  }
  const remove = async (id: string) => {
    if (!confirm('Delete this field?')) return
    await (supabase as any).from('custom_fields').delete().eq('id', id); await load()
  }

  if (loading) return <div style={{ color: 'var(--slate)' }}>Loading…</div>

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h1 style={{ ...S.h1, margin: 0 }}>Custom Fields</h1>
        {!editing && <button onClick={() => setEditing({ field_type: 'text' })} style={S.btn}>+ Add field</button>}
      </div>
      <p style={S.sub}>Add custom fields to your contact cards to capture the details that matter to your business.</p>

      {editing ? (
        <div style={S.card}>
          <h2 style={S.h2}>{editing.id ? 'Edit' : 'New'} field</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><label style={S.label}>Title</label><input value={editing.title || ''} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="Scheduled Delivery" style={S.input} /></div>
            <div>
              <label style={S.label}>Type</label>
              <select value={editing.field_type} onChange={e => setEditing({ ...editing, field_type: e.target.value })} style={S.input}>
                {TYPES.map(t => <option key={t} value={t} style={{ textTransform: 'capitalize' }}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            {editing.field_type === 'dropdown' && (
              <div>
                <label style={S.label}>Options (comma separated)</label>
                <input value={(editing.options || []).join(', ')} onChange={e => setEditing({ ...editing, options: e.target.value.split(',').map((x: string) => x.trim()).filter(Boolean) })} placeholder="Option 1, Option 2" style={S.input} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={save} disabled={saving} style={S.btn}>{saving ? 'Saving…' : 'Save field'}</button>
              <button onClick={() => setEditing(null)} style={S.btnGhost}>Cancel</button>
            </div>
          </div>
        </div>
      ) : fields.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--slate)', border: '1px dashed var(--border)', borderRadius: 14 }}>
          No custom fields yet. Click &ldquo;Add field&rdquo; to create one.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {fields.map(f => (
            <div key={f.id} style={{ ...S.card, marginBottom: 0, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{f.title || f.field_label || f.field_name}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--slate)', textTransform: 'capitalize' }}>Type: {f.field_type}</p>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setEditing({ ...f, title: f.title || f.field_label || f.field_name })} style={{ ...S.btnGhost, padding: '6px 14px', fontSize: 12.5 }}>Edit</button>
                <button onClick={() => remove(f.id)} style={{ padding: '6px 14px', borderRadius: 8, background: '#fff', border: '1px solid #fecaca', color: '#dc2626', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
