'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { S } from '../../_shared'

type Field = { key: string; label: string; type: string; required: boolean }
const TYPES = [['text', 'Short text'], ['email', 'Email'], ['tel', 'Phone'], ['textarea', 'Message'], ['number', 'Number']]
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `field_${Math.random().toString(36).slice(2, 6)}`

export default function ContactFormBuilder() {
  const router = useRouter()
  const formId = useParams()?.id as string
  const [form, setForm] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState('')

  useEffect(() => { setOrigin(typeof window !== 'undefined' ? window.location.origin : '') }, [])
  useEffect(() => {
    (async () => {
      const { data, error } = await (supabase as any).from('contact_forms').select('*').eq('id', formId).maybeSingle()
      if (error || !data) { router.push('/admin/crm-settings/contact-form'); return }
      setForm(data)
    })()
  }, [formId])

  if (!form) return <div style={{ padding: 40, color: 'var(--slate)' }}>Loading…</div>

  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }))
  const fields: Field[] = form.fields || []
  const setFields = (fn: (f: Field[]) => Field[]) => set({ fields: fn(fields) })

  const save = async () => {
    setSaving(true); setMsg('')
    const { error } = await (supabase as any).from('contact_forms').update({
      name: form.name, description: form.description, fields: form.fields,
      accent_color: form.accent_color, corner_radius: form.corner_radius, alignment: form.alignment,
      button_label: form.button_label, success_message: form.success_message,
      redirect_url: form.redirect_url || null, is_active: form.is_active, updated_at: new Date().toISOString(),
    }).eq('id', formId)
    setSaving(false)
    setMsg(error ? (error.message || 'Save failed') : 'Saved!')
    setTimeout(() => setMsg(''), 2500)
  }

  const embedCode = `<iframe src="${origin}/f/${formId}" title="${form.name}" loading="lazy" style="width:100%;max-width:520px;border:none;overflow:hidden" id="colvy-form-${formId}"></iframe>
<script>window.addEventListener("message",function(e){if(e.data&&e.data.colvyForm==="${formId}"&&e.data.height){var f=document.getElementById("colvy-form-${formId}");if(f)f.style.height=e.data.height+"px";}});</script>`

  const radius = Number(form.corner_radius ?? 12)
  const accent = form.accent_color || '#202124'

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Link href="/admin/crm-settings/contact-form" style={{ fontSize: 13, color: 'var(--slate)', textDecoration: 'none' }}>← Back to Contact Form</Link>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {msg && <span style={{ fontSize: 13, color: msg === 'Saved!' ? '#059669' : '#dc2626' }}>{msg}</span>}
          <button onClick={save} disabled={saving} style={{ ...S.btn, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 24, alignItems: 'start' }} className="cf-grid">
        {/* Builder */}
        <div>
          <div style={S.card}>
            <label style={S.label}>Form name</label>
            <input value={form.name} onChange={e => set({ name: e.target.value })} style={{ ...S.input, marginBottom: 14 }} />
            <label style={S.label}>Description (optional)</label>
            <textarea value={form.description || ''} onChange={e => set({ description: e.target.value })} rows={2} style={{ ...S.input, resize: 'vertical' }} />
          </div>

          <div style={S.card}>
            <h2 style={S.h2}>Appearance</h2>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <label style={S.label}>Accent colour</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 10, padding: '6px 10px' }}>
                  <input type="color" value={accent} onChange={e => set({ accent_color: e.target.value })} style={{ width: 26, height: 26, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }} />
                  <input value={accent} onChange={e => set({ accent_color: e.target.value })} style={{ border: 'none', outline: 'none', fontSize: 13, width: 80 }} />
                </div>
              </div>
              <div>
                <label style={S.label}>Corner radius</label>
                <input type="number" min={0} max={40} value={radius} onChange={e => set({ corner_radius: Number(e.target.value) })} style={{ ...S.input, width: 90 }} />
              </div>
              <div>
                <label style={S.label}>Alignment</label>
                <select value={form.alignment || 'center'} onChange={e => set({ alignment: e.target.value })} style={{ ...S.input, width: 130 }}>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                </select>
              </div>
            </div>
          </div>

          <div style={S.card}>
            <h2 style={S.h2}>Fields</h2>
            {fields.map((f, i) => (
              <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <input value={f.label} onChange={e => setFields(fs => fs.map((x, j) => j === i ? { ...x, label: e.target.value, key: x.key || slugify(e.target.value) } : x))} placeholder="Field label" style={{ ...S.input, flex: 1 }} />
                  <select value={f.type} onChange={e => setFields(fs => fs.map((x, j) => j === i ? { ...x, type: e.target.value } : x))} style={{ ...S.input, width: 130 }}>
                    {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--slate)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={f.required} onChange={e => setFields(fs => fs.map((x, j) => j === i ? { ...x, required: e.target.checked } : x))} style={{ accentColor: 'var(--coral)' }} /> Required
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => i > 0 && setFields(fs => { const n = [...fs];[n[i - 1], n[i]] = [n[i], n[i - 1]]; return n })} disabled={i === 0} style={arrowBtn}>↑</button>
                    <button onClick={() => i < fields.length - 1 && setFields(fs => { const n = [...fs];[n[i + 1], n[i]] = [n[i], n[i + 1]]; return n })} disabled={i === fields.length - 1} style={arrowBtn}>↓</button>
                    <button onClick={() => setFields(fs => fs.filter((_, j) => j !== i))} style={{ ...arrowBtn, color: '#dc2626' }}>✕</button>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={() => setFields(fs => [...fs, { key: slugify(`field ${fs.length + 1}`), label: 'New field', type: 'text', required: false }])} style={{ ...S.btnGhost, width: '100%' }}>+ Add field</button>
          </div>

          <div style={S.card}>
            <h2 style={S.h2}>Submit</h2>
            <label style={S.label}>Button label</label>
            <input value={form.button_label || ''} onChange={e => set({ button_label: e.target.value })} style={{ ...S.input, marginBottom: 14 }} />
            <label style={S.label}>Success message</label>
            <input value={form.success_message || ''} onChange={e => set({ success_message: e.target.value })} style={{ ...S.input, marginBottom: 14 }} />
            <label style={S.label}>Redirect URL after submit (optional)</label>
            <input value={form.redirect_url || ''} onChange={e => set({ redirect_url: e.target.value })} placeholder="https://…" style={S.input} />
          </div>

          <div style={S.card}>
            <h2 style={S.h2}>Embed</h2>
            <p style={S.hint}>Paste this on your website's contact page. It auto-resizes to fit.</p>
            <textarea readOnly value={embedCode} rows={4} style={{ ...S.input, fontFamily: 'monospace', fontSize: 12, marginTop: 10, background: 'var(--canvas)' }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button onClick={() => { navigator.clipboard?.writeText(embedCode); setCopied(true); setTimeout(() => setCopied(false), 1500) }} style={S.btn}>{copied ? 'Copied!' : 'Copy embed code'}</button>
              <a href={`${origin}/f/${formId}`} target="_blank" rel="noopener noreferrer" style={{ ...S.btnGhost, textDecoration: 'none', display: 'inline-block' }}>Open form ↗</a>
            </div>
          </div>
        </div>

        {/* Live preview */}
        <div style={{ position: 'sticky', top: 16 }}>
          <p style={{ ...S.label, marginBottom: 10 }}>Preview</p>
          <div style={{ border: '1px solid var(--border)', borderRadius: 16, padding: 22, background: '#fff' }}>
            <div style={{ maxWidth: 380, margin: form.alignment === 'left' ? '0' : '0 auto', textAlign: form.alignment === 'left' ? 'left' : 'left' }}>
              {form.name && <h3 style={{ fontSize: 18, fontWeight: 800, color: '#111', margin: '0 0 4px' }}>{form.name}</h3>}
              {form.description && <p style={{ fontSize: 13.5, color: '#6b7280', margin: '0 0 16px' }}>{form.description}</p>}
              {fields.map((f, i) => (
                <div key={i} style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>{f.label}{f.required && <span style={{ color: '#ef4444' }}> *</span>}</label>
                  {f.type === 'textarea'
                    ? <textarea disabled placeholder={`Enter your ${f.label.toLowerCase()}`} rows={3} style={{ width: '100%', padding: '10px 12px', borderRadius: radius, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', background: '#fff' }} />
                    : <input disabled placeholder={`Enter your ${f.label.toLowerCase()}`} style={{ width: '100%', padding: '10px 12px', borderRadius: radius, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', background: '#fff' }} />}
                </div>
              ))}
              <button disabled style={{ width: '100%', padding: '12px', borderRadius: radius, background: accent, color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', marginTop: 4 }}>{form.button_label || 'Send message'}</button>
            </div>
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 900px){ .cf-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}

const arrowBtn: React.CSSProperties = { width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: 13, color: 'var(--slate)' }
