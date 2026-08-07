'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Pick the customer for a calendar reminder: search existing contacts, or create
// one on the fly. Stores the contact id; reports back the display name so the
// caller can show a chip.
export default function CustomerPicker({
  companyId, value, valueName, onChange,
}: {
  companyId: string | null
  value: string | null
  valueName?: string | null
  onChange: (id: string | null, name: string | null) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [name, setName] = useState(valueName || '')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // Resolve the current customer's display name if we only have an id.
  useEffect(() => {
    let on = true
    if (value && !name) {
      ;(async () => {
        const { data } = await (supabase as any).from('contacts').select('name,email,phone').eq('id', value).maybeSingle()
        if (on && data) setName(data.name || data.email || data.phone || 'Customer')
      })()
    }
    return () => { on = false }
  }, [value])

  // Debounced contact search. Strip characters that would break the or() filter.
  useEffect(() => {
    const safe = q.replace(/[,()%*]/g, ' ').trim()
    if (!safe || !companyId) { setResults([]); return }
    let on = true
    const t = setTimeout(async () => {
      const { data } = await (supabase as any).from('contacts')
        .select('id,name,email,phone').eq('company_id', companyId)
        .or(`name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`).limit(8)
      if (on) setResults(data || [])
    }, 250)
    return () => { on = false; clearTimeout(t) }
  }, [q, companyId])

  const label = (c: any) => c.name || c.email || c.phone || 'Customer'
  const select = (c: any) => { onChange(c.id, label(c)); setName(label(c)); setQ(''); setResults([]); setCreating(false) }
  const clear = () => { onChange(null, null); setName(''); setQ('') }

  const create = async () => {
    if (!form.name.trim() || !companyId || saving) return
    setSaving(true); setErr('')
    const { data, error } = await (supabase as any).from('contacts').insert({
      company_id: companyId, name: form.name.trim(), phone: form.phone.trim() || null, email: form.email.trim() || null, source: 'calendar',
    }).select('id,name,email,phone').maybeSingle()
    setSaving(false)
    if (error) { setErr(error.message); return }
    if (data) { select(data); setForm({ name: '', phone: '', email: '' }) }
  }

  const input: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box' }

  // Selected → chip.
  if (value) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 9, border: '1px solid var(--coral)', background: 'var(--peach)' }}>
        <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{(name || '?')[0]?.toUpperCase()}</span>
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name || 'Customer'}</span>
        <button type="button" onClick={clear} style={{ background: 'none', border: 'none', color: 'var(--slate)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      {!creating ? (
        <>
          <input style={input} value={q} onChange={e => setQ(e.target.value)} placeholder="Search customers by name, phone or email…" />
          {results.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 40, marginTop: 4, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 12px 34px rgba(0,0,0,0.14)', overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }}>
              {results.map(c => (
                <button key={c.id} type="button" onClick={() => select(c)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', textAlign: 'left', padding: '8px 11px', border: 'none', borderBottom: '1px solid var(--border)', background: '#fff', cursor: 'pointer' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{c.name || '(no name)'}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--slate)' }}>{[c.phone, c.email].filter(Boolean).join(' · ') || '—'}</span>
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => { setCreating(true); setForm(f => ({ ...f, name: q })) }}
            style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--coral)', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
            + Create a new customer
          </button>
        </>
      ) : (
        <div style={{ padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--canvas)' }}>
          <input style={{ ...input, marginBottom: 8 }} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name *" />
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input style={input} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Phone" />
            <input style={input} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email" />
          </div>
          {err && <p style={{ fontSize: 12, color: '#dc2626', margin: '0 0 8px' }}>{err}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={create} disabled={saving || !form.name.trim()}
              style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving || !form.name.trim() ? 0.6 : 1 }}>{saving ? 'Adding…' : 'Add customer'}</button>
            <button type="button" onClick={() => { setCreating(false); setErr('') }}
              style={{ padding: '8px 14px', borderRadius: 8, background: '#fff', color: 'var(--slate)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
