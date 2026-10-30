'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Panel } from '@/components/ui/AdminKit'
import { SettingsPage, SaveBar } from '../../_shared'

type Field = { key: string; label: string; type: string; required: boolean }
const TYPES: [string, string][] = [['text', 'Short text'], ['email', 'Email'], ['tel', 'Phone'], ['textarea', 'Message'], ['number', 'Number']]
const TYPE_ICON: Record<string, { color: string; d: React.ReactNode }> = {
  text: { color: '#6366f1', d: <path d="M4 7V5h16v2M9 19h6M12 5v14" /> },
  email: { color: '#0ea5e9', d: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" /></> },
  tel: { color: '#10b981', d: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /> },
  textarea: { color: '#f59e0b', d: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /> },
  number: { color: '#ec4899', d: <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" /> },
}
const ACCENTS = ['#202124', '#ff6a4d', '#f59e0b', '#10b981', '#0ea5e9', '#6366f1', '#8b5cf6', '#ec4899']
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `field_${Math.random().toString(36).slice(2, 6)}`
const svg = (d: React.ReactNode, size = 18) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>

// The fields that are saved (and so make the page "unsaved" when changed).
const SAVED_KEYS = ['name', 'description', 'fields', 'accent_color', 'corner_radius', 'alignment', 'button_label', 'success_message', 'redirect_url', 'is_active']
const snapshot = (f: any) => JSON.stringify(SAVED_KEYS.map(k => f?.[k] ?? null))

export default function ContactFormBuilder() {
  const router = useRouter()
  const formId = useParams()?.id as string
  const [form, setForm] = useState<any>(null)
  const [saved, setSaved] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState('')

  useEffect(() => { setOrigin(typeof window !== 'undefined' ? window.location.origin : '') }, [])
  useEffect(() => {
    (async () => {
      const { data, error } = await (supabase as any).from('contact_forms').select('*').eq('id', formId).maybeSingle()
      if (error || !data) { router.push('/admin/crm-settings/contact-form'); return }
      setForm(data); setSaved(snapshot(data))
    })()
  }, [formId])

  const back = { label: 'Contact forms', onClick: () => router.push('/admin/crm-settings/contact-form') }
  if (!form) return <SettingsPage title="Contact form" back={back}><Panel><div className="cfb-skel"><span /><span /><span /></div></Panel><style>{CFB_CSS}</style></SettingsPage>

  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }))
  const fields: Field[] = form.fields || []
  const setFields = (fn: (f: Field[]) => Field[]) => set({ fields: fn(fields) })
  const dirty = snapshot(form) !== saved

  const save = async () => {
    setSaving(true); setMsg(null)
    const { error } = await (supabase as any).from('contact_forms').update({
      name: form.name, description: form.description, fields: form.fields,
      accent_color: form.accent_color, corner_radius: form.corner_radius, alignment: form.alignment,
      button_label: form.button_label, success_message: form.success_message,
      redirect_url: form.redirect_url || null, is_active: form.is_active, updated_at: new Date().toISOString(),
    }).eq('id', formId)
    setSaving(false)
    if (error) setMsg({ ok: false, text: error.message || 'Couldn’t save. Try again.' })
    else { setSaved(snapshot(form)); setMsg({ ok: true, text: 'Saved. Your form is up to date everywhere it’s embedded.' }); setTimeout(() => setMsg(null), 2600) }
  }

  const embedCode = `<iframe src="${origin}/f/${formId}" title="${form.name}" loading="lazy" style="width:100%;max-width:520px;border:none;overflow:hidden" id="colvy-form-${formId}"></iframe>
<script>window.addEventListener("message",function(e){var f=document.getElementById("colvy-form-${formId}");if(!f)return;if(e.data&&e.data.colvyForm==="${formId}"&&e.data.height){f.style.height=e.data.height+"px";}var m=/[?&]clv=([^&#]+)/.exec(location.search);if(m&&e.data&&e.data.type==="clv_request"&&e.source===f.contentWindow){f.contentWindow.postMessage({colvy:true,type:"clv",clv:decodeURIComponent(m[1])},e.origin);}});</script>`

  const radius = Number(form.corner_radius ?? 12)
  const accent = form.accent_color || '#202124'
  const active = form.is_active !== false
  const moveField = (i: number, by: number) => setFields(fs => { const n = [...fs]; const j = i + by; if (j < 0 || j >= n.length) return n; [n[i], n[j]] = [n[j], n[i]]; return n })

  return (
    <SettingsPage title={form.name || 'Contact form'} back={back}
      sub="Build the form on the left and watch it change on the right. Messages land in your inbox."
      actions={<>
        <button type="button" className={`cfb-live${active ? ' on' : ''}`} onClick={() => set({ is_active: !active })} aria-pressed={active}>
          <i />{active ? 'Live' : 'Paused'}
        </button>
        <a className="ak-btn" href={`${origin}/f/${formId}`} target="_blank" rel="noopener noreferrer">Open form {svg(<path d="M7 17 17 7M8 7h9v9" />, 14)}</a>
      </>}>
      {msg && <div className={`ak-note ${msg.ok ? 'good' : 'bad'} ak-in`} role="status">{msg.text}</div>}
      <div className="cfb-grid">
        <div style={{ minWidth: 0 }}>
          <Panel title="Details">
            <label className="ak-label" htmlFor="cfb-name">Form name</label>
            <input id="cfb-name" className="ak-field" value={form.name || ''} onChange={e => set({ name: e.target.value })} />
            <label className="ak-label" htmlFor="cfb-desc" style={{ marginTop: 14 }}>Description <span className="cfb-opt">optional</span></label>
            <textarea id="cfb-desc" className="ak-field" rows={2} value={form.description || ''} onChange={e => set({ description: e.target.value })} placeholder="We usually reply within a day." />
          </Panel>

          <Panel title="Look">
            <span className="ak-label">Button colour</span>
            <div className="cfb-sw" role="radiogroup" aria-label="Button colour">
              {ACCENTS.map(c => (
                <button key={c} type="button" role="radio" aria-checked={accent.toLowerCase() === c} aria-label={c} className={accent.toLowerCase() === c ? 'on' : ''} style={{ background: c }} onClick={() => set({ accent_color: c })} />
              ))}
              <label className="cfb-sw-custom" title="Any colour">
                <input type="color" value={accent} onChange={e => set({ accent_color: e.target.value })} aria-label="Any colour" />
                {svg(<path d="M12 5v14M5 12h14" />, 14)}
              </label>
              <input className="ak-field sm cfb-hex" value={accent} onChange={e => set({ accent_color: e.target.value })} aria-label="Colour code" />
            </div>
            <div className="cfb-look">
              <div>
                <span className="ak-label">Corners</span>
                <div className="ak-seg" role="radiogroup" aria-label="Corners">
                  {[['Square', 0], ['Soft', 8], ['Round', 14], ['Pill', 24]].map(([l, v]) => (
                    <button key={l} type="button" role="radio" aria-checked={radius === v} className={radius === v ? 'on' : ''} onClick={() => set({ corner_radius: v })}>
                      <span className="cfb-corner" style={{ borderTopLeftRadius: Math.min(Number(v), 10) }} aria-hidden />{l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="ak-label">Alignment</span>
                <div className="ak-seg" role="radiogroup" aria-label="Alignment">
                  {[['left', 'Left'], ['center', 'Centre']].map(([v, l]) => (
                    <button key={v} type="button" role="radio" aria-checked={(form.alignment || 'center') === v} className={(form.alignment || 'center') === v ? 'on' : ''} onClick={() => set({ alignment: v })}>{l}</button>
                  ))}
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Fields" sub="What you ask for, in this order.">
            <div className="cfb-fields">
              {fields.map((f, i) => {
                const t = TYPE_ICON[f.type] || TYPE_ICON.text
                return (
                  <div key={i} className="cfb-field">
                    <span className="cfb-fic" style={{ '--c': t.color } as React.CSSProperties}>{svg(t.d, 16)}</span>
                    <div className="cfb-fmain">
                      <div className="cfb-frow">
                        <input className="ak-field sm" value={f.label} onChange={e => setFields(fs => fs.map((x, j) => j === i ? { ...x, label: e.target.value, key: x.key || slugify(e.target.value) } : x))} placeholder="Field label" aria-label="Field label" />
                        <select className="ak-select sm" value={f.type} onChange={e => setFields(fs => fs.map((x, j) => j === i ? { ...x, type: e.target.value } : x))} aria-label="Field type">
                          {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                      <div className="cfb-frow2">
                        <button type="button" className={`cfb-req${f.required ? ' on' : ''}`} aria-pressed={f.required} onClick={() => setFields(fs => fs.map((x, j) => j === i ? { ...x, required: !x.required } : x))}>
                          {f.required ? svg(<polyline points="20 6 9 17 4 12" />, 12) : null}Required
                        </button>
                        <span style={{ flex: 1 }} />
                        <button type="button" className="ak-icon-btn" onClick={() => moveField(i, -1)} disabled={i === 0} aria-label={`Move ${f.label || 'field'} up`}>{svg(<polyline points="18 15 12 9 6 15" />, 15)}</button>
                        <button type="button" className="ak-icon-btn" onClick={() => moveField(i, 1)} disabled={i === fields.length - 1} aria-label={`Move ${f.label || 'field'} down`}>{svg(<polyline points="6 9 12 15 18 9" />, 15)}</button>
                        <button type="button" className="ak-icon-btn danger" onClick={() => setFields(fs => fs.filter((_, j) => j !== i))} aria-label={`Remove ${f.label || 'field'}`}>{svg(<><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>, 15)}</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="cfb-add">
              <span>Add</span>
              {TYPES.map(([v, l]) => (
                <button key={v} type="button" className="ak-chip" onClick={() => setFields(fs => [...fs, { key: slugify(`${l} ${fs.length + 1}`), label: v === 'textarea' ? 'Message' : v === 'email' ? 'Email' : v === 'tel' ? 'Phone' : 'New field', type: v, required: false }])}>
                  <span className="cfb-chip-ic" style={{ color: TYPE_ICON[v].color }}>{svg(TYPE_ICON[v].d, 14)}</span>{l}
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="After they send">
            <div className="cfb-two">
              <div>
                <label className="ak-label" htmlFor="cfb-btn">Button label</label>
                <input id="cfb-btn" className="ak-field" value={form.button_label || ''} onChange={e => set({ button_label: e.target.value })} placeholder="Send message" />
              </div>
              <div>
                <label className="ak-label" htmlFor="cfb-ok">Thank-you message</label>
                <input id="cfb-ok" className="ak-field" value={form.success_message || ''} onChange={e => set({ success_message: e.target.value })} placeholder="Thanks! We’ll be in touch shortly." />
              </div>
            </div>
            <label className="ak-label" htmlFor="cfb-redir" style={{ marginTop: 14 }}>Send them to a page instead <span className="cfb-opt">optional</span></label>
            <input id="cfb-redir" className="ak-field" value={form.redirect_url || ''} onChange={e => set({ redirect_url: e.target.value })} placeholder="https://yoursite.com/thank-you" />
          </Panel>

          <Panel title="Put it on your website" sub="Paste this where the form should go, like your contact page. It resizes itself to fit.">
            <div className="cfb-code">
              <pre>{embedCode}</pre>
              <button type="button" className={`cfb-copy${copied ? ' done' : ''}`} onClick={() => { try { navigator.clipboard?.writeText(embedCode)?.catch(() => {}) } catch {} setCopied(true); setTimeout(() => setCopied(false), 1600) }}>
                {copied ? <>{svg(<polyline points="20 6 9 17 4 12" />, 13)} Copied</> : <>{svg(<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>, 13)} Copy code</>}
              </button>
            </div>
          </Panel>
        </div>

        {/* Live preview */}
        <aside className="cfb-pv" aria-label="Preview">
          <div className="cfb-browser">
            <div className="cfb-chrome"><i /><i /><i /><span>{origin.replace(/^https?:\/\//, '') || 'yoursite.com'}/contact</span></div>
            <div className="cfb-stage">
              <div className="cfb-card" style={{ textAlign: form.alignment === 'left' ? 'left' : 'center' }}>
                {form.name && <h3>{form.name}</h3>}
                {form.description && <p>{form.description}</p>}
                <div style={{ textAlign: 'left' }}>
                  {fields.map((f, i) => (
                    <div key={i} className="cfb-pf">
                      <label>{f.label}{f.required && <span> *</span>}</label>
                      {f.type === 'textarea'
                        ? <textarea disabled rows={3} placeholder={`Your ${f.label.toLowerCase()}`} style={{ '--r': `${Math.min(radius, 16)}px` } as React.CSSProperties} />
                        : <input disabled placeholder={`Your ${f.label.toLowerCase()}`} style={{ '--r': `${radius}px` } as React.CSSProperties} />}
                    </div>
                  ))}
                  <button type="button" disabled className="cfb-pbtn" style={{ borderRadius: radius, background: accent }}>{form.button_label || 'Send message'}</button>
                </div>
              </div>
            </div>
          </div>
          {!active && <p className="cfb-paused">Paused: visitors see a “not taking messages” note.</p>}
        </aside>
      </div>
      <SaveBar show={dirty} saving={saving} onSave={save} onDiscard={() => setForm((f: any) => ({ ...f, ...Object.fromEntries(SAVED_KEYS.map((k, i) => [k, JSON.parse(saved)[i]])) }))} />
      <style>{CFB_CSS}</style>
    </SettingsPage>
  )
}

const CFB_CSS = `
.cfb-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,.9fr);gap:18px;align-items:start}
@media (max-width:1000px){.cfb-grid{grid-template-columns:minmax(0,1fr)}}
.cfb-opt{margin-left:4px;font-size:12px;font-weight:500;color:var(--soft)}
.cfb-live{display:inline-flex;align-items:center;gap:7px;height:40px;padding:0 15px;border:none;border-radius:999px;background:var(--f);color:var(--mut);font:inherit;font-size:13.5px;font-weight:650;cursor:pointer}
.cfb-live i{width:8px;height:8px;border-radius:50%;background:#a1a1aa}
.cfb-live.on{background:#dcfce7;color:#15803d}
.cfb-live.on i{background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.25);animation:cfbPulse 1.8s ease-in-out infinite}
@keyframes cfbPulse{50%{box-shadow:0 0 0 6px rgba(34,197,94,0)}}
.cfb-sw{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.cfb-sw>button,.cfb-sw-custom{width:30px;height:30px;padding:0;border:none;border-radius:50%;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(0,0,0,.1);transition:transform .15s}
.cfb-sw>button:hover{transform:scale(1.08)}
.cfb-sw>button.on{box-shadow:0 0 0 2px var(--card,#fff),0 0 0 4px var(--ink)}
.cfb-sw-custom{position:relative;display:inline-flex;align-items:center;justify-content:center;background:conic-gradient(#f43f5e,#f59e0b,#10b981,#0ea5e9,#8b5cf6,#f43f5e);color:#fff;overflow:hidden}
.cfb-sw-custom input{position:absolute;inset:0;opacity:0;cursor:pointer}
.ak .cfb-hex{width:100px;margin-left:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
.cfb-look{display:flex;flex-wrap:wrap;gap:16px 22px;margin-top:16px}
.cfb-corner{display:inline-block;width:11px;height:11px;border-top:2px solid currentColor;border-left:2px solid currentColor;margin-right:2px}
.cfb-fields{display:flex;flex-direction:column;gap:8px}
.cfb-field{display:flex;gap:12px;padding:12px;border-radius:18px;background:var(--f)}
.cfb-fic{width:34px;height:34px;flex-shrink:0;border-radius:11px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--c) 14%,var(--card,#fff));color:var(--c)}
.cfb-fmain{flex:1;min-width:0}
.cfb-frow{display:grid;grid-template-columns:minmax(0,1fr) 132px;gap:8px}
.ak .cfb-field .ak-field,.ak .cfb-field .ak-select{background-color:var(--card,#fff)!important}
.cfb-frow2{display:flex;align-items:center;gap:2px;margin-top:6px}
.cfb-req{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 11px;border:none;border-radius:999px;background:var(--card,#fff);color:var(--mut);font:inherit;font-size:12.5px;font-weight:650;cursor:pointer;box-shadow:0 0 0 1px rgba(0,0,0,.06)}
.cfb-req.on{background:var(--ink);color:var(--card,#fff);box-shadow:none}
.cfb-frow2 .ak-icon-btn{width:30px;height:30px}
.cfb-frow2 .ak-icon-btn:disabled{opacity:.3;cursor:default;background:none}
.cfb-add{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:12px;padding-top:12px;border-top:1px dashed var(--line)}
.cfb-add>span{margin-right:2px;font-size:12.5px;font-weight:650;color:var(--soft)}
.cfb-add .ak-chip{height:32px;padding:0 12px 0 9px;font-size:13px}
.cfb-chip-ic{display:inline-flex;opacity:1!important}
.cfb-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}
@media (max-width:560px){.cfb-two,.cfb-frow{grid-template-columns:minmax(0,1fr)}}
.cfb-code{position:relative;border-radius:16px;background:#0f0f12;overflow:hidden}
.cfb-code pre{margin:0;max-height:150px;overflow:auto;padding:16px 16px 52px;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:#c4f082;white-space:pre-wrap;word-break:break-all}
.cfb-copy{position:absolute;right:10px;bottom:10px;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 13px;border:none;border-radius:999px;background:#fff;color:#18181b;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3)}
.cfb-copy.done{background:#dcfce7;color:#15803d}
.cfb-copy::before{display:none!important}
.cfb-pv{position:sticky;top:20px}
.cfb-browser{border-radius:22px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 20px 40px -24px rgba(16,24,40,.3);overflow:hidden}
.cfb-chrome{display:flex;align-items:center;gap:6px;height:38px;padding:0 14px;background:var(--f)}
.cfb-chrome i{width:9px;height:9px;border-radius:50%;background:#d4d4d8}
.cfb-chrome i:first-child{background:#ff5f57}.cfb-chrome i:nth-child(2){background:#febc2e}.cfb-chrome i:nth-child(3){background:#28c840}
.cfb-chrome span{flex:1;margin-left:8px;height:24px;line-height:24px;padding:0 10px;border-radius:999px;background:var(--card,#fff);font-size:11.5px;color:var(--soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cfb-stage{padding:26px 22px;background:radial-gradient(circle at 1px 1px,rgba(0,0,0,.07) 1px,transparent 0) 0 0/16px 16px}
.cfb-card{max-width:380px;margin:0 auto;padding:22px;border-radius:18px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.05),0 10px 28px -14px rgba(16,24,40,.25);color:#111}
.cfb-card h3{margin:0 0 4px;font-size:19px;font-weight:800;letter-spacing:-.02em;color:#111}
.cfb-card>p{margin:0 0 16px;font-size:13.5px;line-height:1.5;color:#6b7280}
.cfb-pf{margin-bottom:12px}
.cfb-pf label{display:block;margin-bottom:5px;font-size:13px;font-weight:600;color:#374151}
.cfb-pf label span{color:#ef4444}
.ak.stp .cfb-pf input,.ak.stp .cfb-pf textarea{width:100%;padding:10px 12px;border:1px solid #e5e7eb!important;background:#fff!important;border-radius:var(--r,12px)!important;font:inherit;font-size:14px;box-sizing:border-box;resize:none;color:#111}
.cfb-pbtn{width:100%;margin-top:4px;padding:12px;border:none;color:#fff;font:inherit;font-size:15px;font-weight:700;transition:background .2s,border-radius .2s}
.cfb-pbtn::before{display:none!important}
.cfb-paused{margin:10px 4px 0;font-size:12.5px;color:var(--soft)}
.cfb-skel{display:flex;flex-direction:column;gap:10px}
.cfb-skel span{height:52px;border-radius:14px;background:linear-gradient(90deg,var(--f) 25%,var(--f2) 37%,var(--f) 63%);background-size:400% 100%;animation:cfbSk 1.2s ease infinite}
@keyframes cfbSk{0%{background-position:100% 50%}100%{background-position:0 50%}}
`
