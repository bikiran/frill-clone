'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Field = { key: string; label: string; type: string; required: boolean }

export default function PublicContactForm() {
  const formId = useParams()?.id as string
  const [form, setForm] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from('contact_forms').select('*').eq('id', formId).maybeSingle()
      setForm(data && data.is_active !== false ? data : null)
      setLoading(false)
    })()
  }, [formId])

  // Report height to the embedding page so the iframe can auto-resize.
  useEffect(() => {
    const report = () => {
      const h = rootRef.current?.scrollHeight || document.body.scrollHeight
      try { window.parent?.postMessage({ colvyForm: formId, height: h }, '*') } catch {}
    }
    report()
    const ro = new ResizeObserver(report)
    if (rootRef.current) ro.observe(rootRef.current)
    return () => ro.disconnect()
  }, [formId, form, done, err])

  if (loading) return <div ref={rootRef} style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontFamily: 'system-ui' }}>Loading…</div>
  if (!form) return <div ref={rootRef} style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontFamily: 'system-ui' }}>This form is unavailable.</div>

  const fields: Field[] = form.fields || []
  const radius = Number(form.corner_radius ?? 12)
  const accent = form.accent_color || '#202124'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    for (const f of fields) if (f.required && !(values[f.key] || '').trim()) { setErr(`${f.label} is required.`); return }
    setSubmitting(true); setErr('')
    try {
      const res = await fetch('/api/contact-form/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formId, data: values }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not submit')
      if (form.redirect_url) { window.top ? (window.top.location.href = form.redirect_url) : (window.location.href = form.redirect_url); return }
      setDone(true)
    } catch (e: any) { setErr(e.message) } finally { setSubmitting(false) }
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '11px 13px', borderRadius: radius, border: '1px solid #e5e7eb', fontSize: 15, boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none', background: '#fff' }

  return (
    <div ref={rootRef} style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', padding: 20, background: 'transparent' }}>
      <div style={{ maxWidth: 480, margin: form.alignment === 'left' ? 0 : '0 auto', background: '#fff', border: '1px solid #eef0f3', borderRadius: Math.max(radius, 12) + 4, padding: 24, boxShadow: '0 8px 30px rgba(15,23,42,0.06)' }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#111', margin: 0 }}>{form.success_message || "Thanks! We'll be in touch shortly."}</p>
          </div>
        ) : (
          <form onSubmit={submit}>
            {form.name && <h3 style={{ fontSize: 20, fontWeight: 800, color: '#111', margin: '0 0 4px' }}>{form.name}</h3>}
            {form.description && <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 18px', lineHeight: 1.5 }}>{form.description}</p>}
            {fields.map((f, i) => (
              <div key={i} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>{f.label}{f.required && <span style={{ color: '#ef4444' }}> *</span>}</label>
                {f.type === 'textarea'
                  ? <textarea value={values[f.key] || ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} rows={4} placeholder={`Enter your ${f.label.toLowerCase()}`} style={{ ...inputStyle, resize: 'vertical' }} />
                  : <input type={f.type === 'tel' ? 'tel' : f.type === 'email' ? 'email' : f.type === 'number' ? 'number' : 'text'} value={values[f.key] || ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} placeholder={`Enter your ${f.label.toLowerCase()}`} style={inputStyle} />}
              </div>
            ))}
            {err && <p style={{ fontSize: 13.5, color: '#dc2626', margin: '0 0 12px' }}>{err}</p>}
            <button type="submit" disabled={submitting} style={{ width: '100%', padding: '13px', borderRadius: radius, background: accent, color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
              {submitting ? 'Sending…' : (form.button_label || 'Send message')}
            </button>
            <p style={{ textAlign: 'center', fontSize: 11.5, color: '#9ca3af', margin: '12px 0 0' }}>Powered by Colvy</p>
          </form>
        )}
      </div>
    </div>
  )
}
