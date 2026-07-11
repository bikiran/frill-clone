'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useCompanyUser, S } from '../_shared'

const STEPS = ['Popup', 'FAQs', 'Builder', 'Location', 'Success']

export default function ChatWidgetSettings() {
  const { companyId, loading } = useCompanyUser()
  const [step, setStep] = useState(0)
  const [cfg, setCfg] = useState<any>({ color: '#1C61E7', shape: 'rounded', text: '', popup_text: '', avatar_url: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const { data } = await (supabase as any).from('companies').select('accent_color, widget_config').eq('id', companyId).maybeSingle()
      if (data?.widget_config) setCfg({ ...cfg, ...data.widget_config })
      else if (data?.accent_color) setCfg((c: any) => ({ ...c, color: data.accent_color }))
    })()
  }, [companyId])

  const set = (k: string, v: any) => setCfg((c: any) => ({ ...c, [k]: v }))
  const save = async () => {
    if (!companyId) return
    setSaving(true)
    await (supabase as any).from('companies').update({ widget_config: cfg }).eq('id', companyId)
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <div style={{ color: 'var(--slate)' }}>Loading…</div>

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={S.h1}>Chat Widget</h1>
      <p style={S.sub}>Design the chat widget that appears on your website.</p>

      {/* Steps */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
        {STEPS.map((label, i) => (
          <button key={label} onClick={() => setStep(i)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10, border: step === i ? '2px solid var(--coral)' : '1px solid var(--border)', background: step === i ? 'var(--peach)' : '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: step === i ? 'var(--coral)' : 'var(--slate)' }}>
            <span style={{ width: 20, height: 20, borderRadius: '50%', background: step === i ? 'var(--coral)' : 'var(--border)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
            {label}{label === 'FAQs' && <span style={{ fontSize: 10, opacity: 0.6 }}>(Optional)</span>}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24 }}>
        {/* Config */}
        <div style={S.card}>
          {step === 0 && (
            <>
              <h2 style={S.h2}>Configure Popup</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={S.label}>Widget colour</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="color" value={cfg.color} onChange={e => set('color', e.target.value)} style={{ width: 48, height: 40, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer' }} />
                    <input value={cfg.color} onChange={e => set('color', e.target.value)} style={S.input} />
                  </div>
                </div>
                <div>
                  <label style={S.label}>Widget shape</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['rounded', 'square', 'circle'].map(sh => (
                      <button key={sh} onClick={() => set('shape', sh)} style={{ padding: '8px 16px', borderRadius: 8, border: cfg.shape === sh ? '2px solid var(--coral)' : '1px solid var(--border)', background: cfg.shape === sh ? 'var(--peach)' : '#fff', cursor: 'pointer', fontSize: 13, textTransform: 'capitalize' }}>{sh}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={S.label}>Bubble display</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[{ k: 'icon', label: 'Chat icon only' }, { k: 'icon_label', label: 'Icon + label' }].map(m => (
                      <button key={m.k} onClick={() => set('bubble_mode', m.k)} style={{ padding: '8px 16px', borderRadius: 8, border: (cfg.bubble_mode || 'icon') === m.k ? '2px solid var(--coral)' : '1px solid var(--border)', background: (cfg.bubble_mode || 'icon') === m.k ? 'var(--peach)' : '#fff', cursor: 'pointer', fontSize: 13 }}>{m.label}</button>
                    ))}
                  </div>
                  <p style={{ ...S.hint, marginTop: 6 }}>By default only the chat icon shows. Choose "Icon + label" to show text next to it.</p>
                </div>
                <div>
                  <label style={S.label}>Bubble label <span style={{ color: 'var(--slate)', fontWeight: 400 }}>(shown only in "Icon + label" mode)</span></label>
                  <input value={cfg.text || ''} maxLength={18} onChange={e => set('text', e.target.value)} placeholder="Chat with us" style={S.input} />
                </div>
                <div>
                  <label style={S.label}>Popup text <span style={{ color: 'var(--slate)', fontWeight: 400 }}>({(cfg.popup_text || '').length}/255)</span></label>
                  <textarea value={cfg.popup_text || ''} maxLength={255} onChange={e => set('popup_text', e.target.value)} rows={2} placeholder="Hi there! How can we help?" style={{ ...S.input, resize: 'vertical' }} />
                </div>
              </div>
            </>
          )}
          {step === 1 && <><h2 style={S.h2}>FAQs (Optional)</h2><p style={S.hint}>Add frequently asked questions that show in the widget before a chat starts. Coming soon.</p></>}
          {step === 2 && (
            <>
              <h2 style={S.h2}>Chat form</h2>
              <p style={{ ...S.hint, marginBottom: 16 }}>Choose what to ask visitors before they start a chat, and which fields are required.</p>
              {(() => {
                const defaults = [
                  { key: 'name', label: 'Name' },
                  { key: 'email', label: 'Email' },
                  { key: 'mobile', label: 'Mobile number' },
                ]
                const fields = cfg.chat_form_fields || { name: { show: true, required: true }, email: { show: true, required: false }, mobile: { show: true, required: false } }
                const setField = (key: string, patch: any) => set('chat_form_fields', { ...fields, [key]: { ...(fields[key] || {}), ...patch } })
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {defaults.map(f => {
                      const fc = fields[f.key] || { show: false, required: false }
                      return (
                        <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 10 }}>
                          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{f.label}</span>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--slate)', cursor: 'pointer' }}>
                            <input type="checkbox" checked={!!fc.show} onChange={e => setField(f.key, { show: e.target.checked, required: e.target.checked ? fc.required : false })} />
                            Show
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: fc.show ? 'var(--slate)' : '#ccc', cursor: fc.show ? 'pointer' : 'not-allowed' }}>
                            <input type="checkbox" disabled={!fc.show} checked={!!fc.required} onChange={e => setField(f.key, { required: e.target.checked })} />
                            Required
                          </label>
                        </div>
                      )
                    })}
                    <p style={{ ...S.hint, marginTop: 4 }}>Name is recommended so you know who you're talking to. If mobile is shown, visitors can opt in to SMS replies.</p>
                  </div>
                )
              })()}
            </>
          )}
          {step === 3 && <><h2 style={S.h2}>Location</h2><p style={S.hint}>Choose which pages the widget appears on. Coming soon.</p></>}
          {step === 4 && <><h2 style={S.h2}>Success</h2><p style={S.hint}>Your widget is ready. Save and embed the snippet on your site.</p></>}
        </div>

        {/* Live preview */}
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', marginBottom: 8 }}>Preview</p>
          <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 20, background: 'var(--canvas)', minHeight: 200, position: 'relative' }}>
            {cfg.popup_text && (
              <div style={{ background: '#fff', borderRadius: 12, padding: '10px 14px', boxShadow: '0 4px 14px rgba(0,0,0,0.08)', fontSize: 13, marginBottom: 12 }}>{cfg.popup_text}</div>
            )}
            <div style={{ position: 'absolute', bottom: 16, right: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              {cfg.text && <span style={{ background: '#fff', padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>{cfg.text}</span>}
              <div style={{ width: 52, height: 52, borderRadius: cfg.shape === 'square' ? 12 : '50%', background: cfg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.2)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
        <button onClick={save} disabled={saving} style={S.btn}>{saving ? 'Saving…' : 'Save widget'}</button>
        {saved && <span style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>✓ Saved</span>}
      </div>
    </div>
  )
}
