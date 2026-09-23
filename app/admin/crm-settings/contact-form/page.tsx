'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { S, useCompanyUser } from '../_shared'

const DEFAULT_FIELDS = [
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'email', label: 'Email', type: 'email', required: true },
  { key: 'phone', label: 'Mobile Number', type: 'tel', required: false },
  { key: 'message', label: 'Message', type: 'textarea', required: true },
]

export default function ContactFormSettings() {
  const router = useRouter()
  const { companyId } = useCompanyUser()
  const [forms, setForms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [needsMigration, setNeedsMigration] = useState(false)

  const load = async () => {
    if (!companyId) return
    setLoading(true)
    const { data, error } = await (supabase as any).from('contact_forms')
      .select('*').eq('company_id', companyId).order('created_at', { ascending: false })
    if (error && /does not exist|schema cache/i.test(error.message)) setNeedsMigration(true)
    setForms(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [companyId])

  const addForm = async () => {
    if (!companyId) return
    setCreating(true)
    const { data, error } = await (supabase as any).from('contact_forms').insert({
      company_id: companyId, name: 'Contact form', fields: DEFAULT_FIELDS,
    }).select('id').single()
    setCreating(false)
    if (error) { if (/does not exist|schema cache/i.test(error.message)) setNeedsMigration(true); return }
    router.push(`/admin/crm-settings/contact-form/${data.id}`)
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h1 style={{ ...S.h1, margin: 0 }}>Contact Form</h1>
        <button onClick={addForm} disabled={creating || !companyId} style={{ ...S.btn, opacity: creating ? 0.6 : 1 }}>{creating ? 'Creating…' : '+ Add form'}</button>
      </div>
      <p style={S.sub}>Contact form widgets collect information from your customers. Build a form, embed it on your website, and every submission lands in your Inbox.</p>

      {needsMigration && (
        <div style={{ padding: '12px 14px', borderRadius: 10, background: '#fff7e6', color: '#a16207', fontSize: 13.5, marginBottom: 16 }}>Run <b>COLVY_V316_CONTACT_FORMS.sql</b>, then reload.</div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--slate)' }}>Loading…</div>
      ) : forms.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 56, color: 'var(--slate)', border: '1px dashed var(--border)', borderRadius: 14 }}>
          No forms found. Click &ldquo;Add form&rdquo; above to create your first one.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 14 }}>
          {forms.map(f => (
            <button key={f.id} onClick={() => router.push(`/admin/crm-settings/contact-form/${f.id}`)}
              style={{ textAlign: 'left', background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 18, cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="7" y1="13" x2="13" y2="13"/></svg>
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{f.name}</span>
              </div>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)' }}>{(f.fields || []).length} fields · {f.is_active ? 'Active' : 'Disabled'}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
