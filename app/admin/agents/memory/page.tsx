'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { authFetch } from '@/lib/auth-fetch'
import { resolveCompanyUser, peekCompanyUser } from '@/lib/client-cache'
import { confirmDialog } from '@/components/ConfirmDialog'

// Business Memory (Agent Engine, Phase 5): what Colvy's AI agents know about
// this business and must follow — how replies sound, the policies, the rules,
// and when an order needs a person. Things an agent learns from the team's
// edits arrive here as suggestions and do nothing until someone keeps them.

const EASE = 'cubic-bezier(.22,1,.36,1)'

type Item = { id: string; kind: string; key: string; content: any; status: string; source?: string; version?: number; updated_at?: string }
type Templates = { policies: Record<string, { title: string; placeholder: string }>; tones: Record<string, { label: string; sample: string }>; thresholds: { processing_days: number; transit_days: number; stale_days: number } }
type Save = (body: Record<string, any>) => Promise<boolean>

const when = (iso?: string | null) => {
  if (!iso) return ''
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b)
// Rows that fit the text (browsers without field-sizing: content), so nothing is cut off on a phone.
const rowsFor = (text: string, min: number, max: number, perLine = 38) => Math.min(max, Math.max(min, String(text || '').split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0)))

const Svg = ({ d, size = 15 }: { d: React.ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
)
const I = {
  back: <Svg size={14} d={<polyline points="15 18 9 12 15 6" />} />,
  voice: <Svg size={18} d={<><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" /></>} />,
  doc: <Svg size={18} d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></>} />,
  rule: <Svg size={18} d={<><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>} />,
  clock: <Svg size={18} d={<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>} />,
  spark: <Svg size={18} d={<path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z" />} />,
  plus: <Svg size={13} d={<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>} />,
  trash: <Svg size={14} d={<><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></>} />,
  check: <Svg size={12} d={<polyline points="20 6 9 17 4 12" />} />,
  alert: <Svg d={<><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>} />,
}

export default function BusinessMemoryPage() {
  const [companyId, setCompanyId] = useState<string | null>(peekCompanyUser()?.companyId || null)
  const [items, setItems] = useState<Item[]>([])
  const [templates, setTemplates] = useState<Templates | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { resolveCompanyUser().then(r => setCompanyId(r.companyId)).catch(() => {}) }, [])
  const apply = (d: any) => { setItems(d.items || []); if (d.templates) setTemplates(d.templates); setNeedsMigration(!!d.needsMigration) }
  const load = useCallback(async () => {
    if (!companyId) return
    try {
      const r = await authFetch(`/api/agent/memory?companyId=${companyId}`)
      const d = await r.json()
      if (!r.ok || d.error) setError(d.error || 'Couldn’t load memory.')
      else apply(d)
    } catch { setError('Couldn’t reach Colvy.') } finally { setLoaded(true) }
  }, [companyId])
  useEffect(() => { load() }, [load])

  const save: Save = async (body) => {
    if (!companyId) return false
    setError('')
    try {
      const r = await authFetch('/api/agent/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, ...body }) })
      const d = await r.json()
      if (!r.ok || d.error) { setError(d.error || 'Couldn’t save.'); return false }
      apply(d); return true
    } catch { setError('Couldn’t reach Colvy.'); return false }
  }

  const active = items.filter(i => i.status === 'active')
  const proposals = items.filter(i => i.status === 'proposed')
  const tone = active.find(i => i.kind === 'tone')
  const policies = active.filter(i => i.kind === 'policy')
  const rules = active.filter(i => i.kind === 'instruction')
  const thresholds = active.find(i => i.kind === 'rule' && i.key === 'order_status_thresholds')

  return (
    <div style={{ minHeight: '100%', background: 'var(--canvas, #f6f7f9)' }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '20px 16px 120px' }}>
        <Link href="/admin/agents" className="bm-back">{I.back} AI Agents</Link>
        <div style={{ margin: '10px 0 20px' }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(22px, 3.4vw, 28px)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Business memory</h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--slate)', maxWidth: 620, lineHeight: 1.55 }}>What your AI agents know about your business and always follow. It’s used in every conversation, and you can change it any time — the next message uses the new version.</p>
        </div>

        {needsMigration && <div className="bm-note warn">{I.alert}<span>Agents need a one-time database update (<b>COLVY_V353_AGENT_ENGINE.sql</b>).</span></div>}
        {error && <div className="bm-note err" role="alert">{I.alert}<span>{error}</span></div>}
        {!loaded && <div className="bm-card"><p className="bm-p">Loading…</p></div>}

        {loaded && templates && (
          <>
            {proposals.length > 0 && <Proposals items={proposals} save={save} />}
            <ToneCard item={tone} tones={templates.tones} save={save} />
            <PoliciesCard items={policies} templates={templates.policies} save={save} />
            <RulesCard items={rules} save={save} />
            <ThresholdsCard item={thresholds} defaults={templates.thresholds} save={save} />
            <p className="bm-foot">Product details, FAQs and help articles live in <Link href="/admin/ai-knowledge">AI Knowledge</Link> — agents search it when they need to. Opening hours come from Google Business Profile.</p>
          </>
        )}
      </div>
    </div>
  )
}

function CardHead({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
      <span className="bm-ic">{icon}</span>
      <div style={{ minWidth: 0 }}>
        <p className="bm-h">{title}</p>
        <p className="bm-p">{sub}</p>
      </div>
    </div>
  )
}

function SaveBar({ dirty, busy, onSave, onCancel, label = 'Save', disabled }: { dirty: boolean; busy: boolean; onSave: () => void; onCancel: () => void; label?: string; disabled?: boolean }) {
  return (
    <div className={`bm-savebar ${dirty ? 'open' : ''}`} aria-hidden={!dirty}>
      <div style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 12 }}>
          <button type="button" className="bm-ghost" onClick={onCancel} disabled={busy} tabIndex={dirty ? 0 : -1}>Cancel</button>
          <button type="button" className="bm-primary" onClick={onSave} disabled={busy || disabled} tabIndex={dirty ? 0 : -1}>{busy ? 'Saving…' : label}</button>
        </div>
      </div>
    </div>
  )
}

// ── Suggestions learned from the team ────────────────────────────────────────

function Proposals({ items, save }: { items: Item[]; save: Save }) {
  return (
    <div className="bm-card bm-fade bm-learn">
      <CardHead icon={I.spark} title="Suggested by your agents" sub="Learned from replies your team edited before sending. Nothing here is used until you keep it." />
      <ul className="bm-list">{items.map(p => <Proposal key={p.id} p={p} save={save} />)}</ul>
    </div>
  )
}

function Proposal({ p, save }: { p: Item; save: Save }) {
  const [text, setText] = useState(String(p.content?.text || ''))
  const [busy, setBusy] = useState<'' | 'keep' | 'dismiss'>('')
  const [showEdit, setShowEdit] = useState(false)
  const ev = p.content?.evidence || {}
  const act = async (status: 'active' | 'archived') => {
    setBusy(status === 'active' ? 'keep' : 'dismiss')
    await save({ id: p.id, status, ...(status === 'active' ? { content: { text } } : {}) })
    setBusy('')
  }
  return (
    <li className="bm-prop">
      <span className="bm-tag">{p.kind === 'policy' ? `Policy${p.content?.title ? ` · ${p.content.title}` : ''}` : 'Rule'}</span>
      <textarea className="bm-input" rows={rowsFor(text, 2, 6)} value={text} onChange={e => setText(e.target.value)} aria-label="Suggested memory" />
      <div className="bm-meta">
        Learned from a reply {ev.edited_by_name || 'your team'} edited · {when(p.updated_at)}
        {(ev.draft || ev.sent) && <button type="button" className="bm-linkbtn" onClick={() => setShowEdit(s => !s)} aria-expanded={showEdit}>{showEdit ? 'Hide the edit' : 'See the edit'}</button>}
      </div>
      {showEdit && (
        <div className="bm-diff bm-fade">
          <div><p className="bm-label">Agent’s draft</p><p className="bm-bubble muted">{ev.draft}</p></div>
          <div><p className="bm-label">What was sent</p><p className="bm-bubble">{ev.sent}</p></div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="button" className="bm-primary" onClick={() => act('active')} disabled={!!busy || !text.trim()}>{busy === 'keep' ? 'Keeping…' : 'Keep'}</button>
        <button type="button" className="bm-ghost" onClick={() => act('archived')} disabled={!!busy}>{busy === 'dismiss' ? 'Dismissing…' : 'Dismiss'}</button>
      </div>
    </li>
  )
}

// ── Tone ─────────────────────────────────────────────────────────────────────

function ToneCard({ item, tones, save }: { item?: Item; tones: Templates['tones']; save: Save }) {
  const saved = useMemo(() => ({ style: item?.content?.style || 'warm', first_name: item?.content?.first_name !== false, sign_off: item?.content?.sign_off || '', avoid: item?.content?.avoid || '' }), [item])
  const [d, setD] = useState(saved)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setD(saved) }, [saved])
  const dirty = !same(d, saved)
  const sample = `${(tones[d.style]?.sample || '').replace(/^Hi Jo|^Hello Jo/, m => (d.first_name ? m : m.replace(' Jo', ' there')))}${d.sign_off ? `\n${d.sign_off}` : ''}`
  return (
    <div className="bm-card bm-fade">
      <CardHead icon={I.voice} title="How it sounds" sub="The voice your agents reply in." />
      <div className="bm-tones" role="radiogroup" aria-label="Tone of voice">
        {Object.entries(tones).map(([k, t]) => (
          <button key={k} type="button" role="radio" aria-checked={d.style === k} className={`bm-tone ${d.style === k ? 'on' : ''}`} onClick={() => setD({ ...d, style: k })}>
            <span className="bm-radio" />{t.label}
          </button>
        ))}
      </div>
      <p key={sample} className="bm-bubble bm-fade" style={{ marginTop: 12 }}>{sample}</p>
      <div className="bm-row">
        <div style={{ minWidth: 0 }}>
          <div className="bm-t">Use the customer’s first name</div>
          <div className="bm-meta" style={{ marginTop: 1 }}>“Hi Jo!” instead of “Hi there!”</div>
        </div>
        <button type="button" role="switch" aria-checked={d.first_name} aria-label="Use the customer’s first name" className={`bm-switch ${d.first_name ? 'on' : ''}`} onClick={() => setD({ ...d, first_name: !d.first_name })}><span /></button>
      </div>
      <div className="bm-grid2">
        <label className="bm-field"><span>Sign off as (optional)</span><input className="bm-input" value={d.sign_off} maxLength={80} onChange={e => setD({ ...d, sign_off: e.target.value })} placeholder="e.g. — The Roxy Aquarium team" /></label>
        <label className="bm-field"><span>Never say or do (optional)</span><input className="bm-input" value={d.avoid} maxLength={600} onChange={e => setD({ ...d, avoid: e.target.value })} placeholder="e.g. don’t call fish “cheap”; no exclamation marks" /></label>
      </div>
      <SaveBar dirty={dirty} busy={busy} onCancel={() => setD(saved)} onSave={async () => { setBusy(true); await save({ kind: 'tone', content: d }); setBusy(false) }} />
    </div>
  )
}

// ── Policies ─────────────────────────────────────────────────────────────────

function PoliciesCard({ items, templates, save }: { items: Item[]; templates: Templates['policies']; save: Save }) {
  const [drafts, setDrafts] = useState<{ key: string | null; title: string; custom: boolean }[]>([])
  const used = new Set([...items.map(i => i.key), ...drafts.map(d => d.key).filter(Boolean) as string[]])
  const missing = Object.entries(templates).filter(([k]) => !used.has(k))
  return (
    <div className="bm-card bm-fade">
      <CardHead icon={I.doc} title="Policies" sub="The facts agents give customers. They follow these exactly and won’t promise anything beyond them." />
      {items.length === 0 && drafts.length === 0 && <p className="bm-empty">No policies yet. Add the ones customers ask about most.</p>}
      <ul className="bm-list">
        {items.map(i => <PolicyRow key={i.id} item={i} title={i.content?.title || templates[i.key]?.title || i.key} placeholder={templates[i.key]?.placeholder} save={save} />)}
        {drafts.map((d, n) => (
          <PolicyRow key={`d${n}-${d.key || 'custom'}`} draftKey={d.key} title={d.title} custom={d.custom} placeholder={d.key ? templates[d.key]?.placeholder : 'What should customers be told?'} save={save} onDone={() => setDrafts(ds => ds.filter((_, j) => j !== n))} />
        ))}
      </ul>
      <div className="bm-chips">
        {missing.map(([k, t]) => <button key={k} type="button" className="bm-chip" onClick={() => setDrafts(ds => [...ds, { key: k, title: t.title, custom: false }])}>{I.plus} {t.title}</button>)}
        <button type="button" className="bm-chip" onClick={() => setDrafts(ds => [...ds, { key: null, title: '', custom: true }])}>{I.plus} Your own</button>
      </div>
    </div>
  )
}

function PolicyRow({ item, draftKey, title, custom, placeholder, save, onDone }: { item?: Item; draftKey?: string | null; title: string; custom?: boolean; placeholder?: string; save: Save; onDone?: () => void }) {
  const saved = useMemo(() => ({ title: item?.content?.title || title, text: String(item?.content?.text || '') }), [item, title])
  const [d, setD] = useState(saved)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setD(saved) }, [saved])
  const isNew = !item
  const dirty = isNew ? !!d.text.trim() || !!onDone : !same(d, saved)
  const doSave = async () => {
    setBusy(true)
    const key = item?.key || draftKey || null
    const ok = await save({ kind: 'policy', key, content: { text: d.text, ...((custom || item?.content?.title) && d.title.trim() ? { title: d.title.trim() } : {}) } })
    setBusy(false)
    if (ok && onDone) onDone()
  }
  const remove = async () => {
    if (!item) { onDone?.(); return }
    if (!await confirmDialog({ title: `Remove “${saved.title}”?`, message: 'Agents won’t use this policy any more.', confirmLabel: 'Remove', tone: 'danger' })) return
    await save({ id: item.id, status: 'archived' })
  }
  return (
    <li className="bm-item">
      <div className="bm-item-head">
        {custom ? <input className="bm-input bm-title-in" value={d.title} onChange={e => setD({ ...d, title: e.target.value })} placeholder="Policy name, e.g. Gift cards" maxLength={80} autoFocus={isNew} />
          : <span className="bm-t">{saved.title}</span>}
        {item && <span className="bm-meta" style={{ marginLeft: 'auto' }}>Updated {when(item.updated_at)}</span>}
        <button type="button" className="bm-icon" onClick={remove} aria-label={`Remove ${saved.title || 'policy'}`}>{I.trash}</button>
      </div>
      <textarea className="bm-input" style={{ minHeight: 78 }} rows={rowsFor(d.text, 3, 10)} value={d.text} onChange={e => setD({ ...d, text: e.target.value })} placeholder={placeholder} maxLength={2000} autoFocus={isNew && !custom} />
      <SaveBar dirty={dirty} busy={busy} onCancel={() => (isNew ? onDone?.() : setD(saved))} onSave={doSave} disabled={!d.text.trim() || (custom && !d.title.trim())} />
    </li>
  )
}

// ── Rules ────────────────────────────────────────────────────────────────────

function RulesCard({ items, save }: { items: Item[]; save: Save }) {
  const [adding, setAdding] = useState(false)
  return (
    <div className="bm-card bm-fade">
      <CardHead icon={I.rule} title="Rules" sub="Things agents must always or never do." />
      {items.length === 0 && !adding && <p className="bm-empty">No rules yet. For example: “Never promise same-day delivery” or “Always offer click & collect for tanks over 4ft.”</p>}
      <ul className="bm-list">
        {items.map(i => <RuleRow key={i.id} item={i} save={save} />)}
        {adding && <RuleRow save={save} onDone={() => setAdding(false)} />}
      </ul>
      {!adding && <div className="bm-chips"><button type="button" className="bm-chip" onClick={() => setAdding(true)}>{I.plus} Add a rule</button></div>}
    </div>
  )
}

function RuleRow({ item, save, onDone }: { item?: Item; save: Save; onDone?: () => void }) {
  const saved = String(item?.content?.text || '')
  const [text, setText] = useState(saved)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setText(saved) }, [saved])
  const dirty = item ? text !== saved : true
  return (
    <li className="bm-item">
      <div className="bm-item-head" style={{ alignItems: 'flex-start' }}>
        <span className="bm-bullet" />
        <textarea className="bm-input" rows={rowsFor(text, 1, 5)} value={text} onChange={e => setText(e.target.value)} placeholder="e.g. Never promise same-day delivery." maxLength={600} autoFocus={!item} aria-label="Rule" style={{ flex: 1, resize: 'vertical' }} />
        <button type="button" className="bm-icon" aria-label="Remove rule" onClick={async () => {
          if (!item) { onDone?.(); return }
          if (await confirmDialog({ title: 'Remove this rule?', message: saved, confirmLabel: 'Remove', tone: 'danger' })) await save({ id: item.id, status: 'archived' })
        }}>{I.trash}</button>
      </div>
      <SaveBar dirty={dirty} busy={busy} disabled={!text.trim()} onCancel={() => (item ? setText(saved) : onDone?.())} onSave={async () => {
        setBusy(true)
        const ok = await save({ kind: 'instruction', key: item?.key || null, content: { text } })
        setBusy(false)
        if (ok && !item) onDone?.()
      }} />
    </li>
  )
}

// ── Order thresholds ─────────────────────────────────────────────────────────

function ThresholdsCard({ item, defaults, save }: { item?: Item; defaults: Templates['thresholds']; save: Save }) {
  const saved = useMemo(() => ({ ...defaults, ...(item?.content || {}) }), [item, defaults])
  const [d, setD] = useState(saved)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setD(saved) }, [saved])
  const dirty = !same(d, saved)
  const num = (k: keyof Templates['thresholds']) => (
    <input type="number" min={1} max={60} className="bm-num" value={d[k]} onChange={e => setD({ ...d, [k]: Number(e.target.value) })} aria-label={k.replace(/_/g, ' ')} />
  )
  return (
    <div className="bm-card bm-fade">
      <CardHead icon={I.clock} title="When an order needs a person" sub="On “where is my order?”, agents check tracking against these. Past them, they bring the order to your team instead of just replying." />
      <div className="bm-sentences">
        <p>Not shipped after {num('processing_days')} days</p>
        <p>In transit longer than {num('transit_days')} days</p>
        <p>Tracking hasn’t moved for {num('stale_days')} days</p>
      </div>
      <SaveBar dirty={dirty} busy={busy} onCancel={() => setD(saved)} onSave={async () => { setBusy(true); await save({ kind: 'rule', content: d }); setBusy(false) }} />
    </div>
  )
}

const CSS = `
.bm-fade{animation:bmFade .5s ${EASE} both}
@keyframes bmFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.bm-fade{animation:none!important}}
.bm-back{display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:700;color:var(--slate);text-decoration:none}
.bm-back:hover{color:var(--ink)}
.bm-card{background:#fff;border:1px solid var(--border);border-radius:20px;padding:18px;margin-bottom:16px}
@media (min-width:640px){.bm-card{padding:22px}}
.bm-learn{border-color:color-mix(in srgb,var(--coral) 30%,var(--border));background:linear-gradient(180deg,color-mix(in srgb,var(--coral) 5%,#fff),#fff 120px)}
.bm-ic{width:38px;height:38px;flex-shrink:0;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--coral) 10%,#fff);color:var(--coral)}
.bm-h{margin:0;font-size:15.5px;font-weight:700;color:var(--ink)}
.bm-p{margin:2px 0 0;font-size:13.5px;color:var(--slate);line-height:1.5}
.bm-t{font-size:14px;font-weight:700;color:var(--ink)}
.bm-meta{font-size:12.5px;color:var(--slate);line-height:1.45;display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center}
.bm-label{margin:0 0 4px;font-size:11.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--slate)}
.bm-empty{margin:0 0 4px;font-size:13.5px;color:var(--slate);line-height:1.5}
.bm-input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:12px;border:1px solid var(--border);background:#fff;font-size:14px;line-height:1.5;color:var(--ink);font-family:inherit;outline:none;resize:vertical;transition:border-color .2s ease,box-shadow .2s ease}
.bm-input{field-sizing:content}
textarea.bm-input{min-height:44px}
.bm-input:focus{border-color:var(--coral);box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 15%,transparent)}
.bm-title-in{flex:1;min-width:0;padding:7px 10px;font-weight:700}
.bm-primary{display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 16px;border-radius:12px;border:none;background:var(--coral);color:#fff;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;transition:transform .15s ${EASE},opacity .2s ease}
.bm-primary:hover:not(:disabled){transform:translateY(-1px)}.bm-primary:active:not(:disabled){transform:scale(.97)}.bm-primary:disabled{opacity:.45;cursor:default}
.bm-ghost{height:36px;padding:0 14px;border-radius:12px;border:1px solid var(--border);background:#fff;color:var(--ink);font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit}
.bm-ghost:disabled{opacity:.5;cursor:default}
.bm-icon{width:32px;height:32px;flex-shrink:0;border-radius:10px;border:none;background:none;color:var(--slate);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background .2s ease,color .2s ease}
.bm-icon:hover{background:#fef3f2;color:#b42318}
.bm-linkbtn{border:none;background:none;padding:0;font-size:12.5px;font-weight:700;color:var(--coral);cursor:pointer;font-family:inherit}
.bm-savebar{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows .35s ${EASE},opacity .25s ease}
.bm-savebar.open{grid-template-rows:1fr;opacity:1}
.bm-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px}
.bm-item{padding:14px;border-radius:16px;border:1px solid var(--border);animation:bmFade .4s ${EASE} both}
.bm-item-head{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.bm-bullet{width:7px;height:7px;flex-shrink:0;margin-top:16px;border-radius:50%;background:var(--coral)}
.bm-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.bm-chip{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;border:1px dashed color-mix(in srgb,var(--slate) 45%,var(--border));background:#fff;font-size:13px;font-weight:600;color:var(--ink);cursor:pointer;font-family:inherit;transition:border-color .2s ease,background .2s ease}
.bm-chip:hover{border-color:var(--coral);background:color-mix(in srgb,var(--coral) 5%,#fff)}
.bm-tones{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}
@media (min-width:560px){.bm-tones{grid-template-columns:repeat(3,minmax(0,1fr))}}
.bm-tone{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;border:1px solid var(--border);background:#fff;font-size:13.5px;font-weight:700;color:var(--ink);cursor:pointer;font-family:inherit;text-align:left;transition:border-color .2s ease,background .2s ease}
.bm-tone.on{border-color:var(--coral);background:color-mix(in srgb,var(--coral) 6%,#fff)}
.bm-radio{width:16px;height:16px;flex-shrink:0;border-radius:50%;border:1.5px solid var(--border);transition:border .2s ease}
.bm-tone.on .bm-radio{border:5px solid var(--coral)}
.bm-bubble{margin:0;padding:11px 14px;border-radius:16px 16px 16px 5px;background:color-mix(in srgb,var(--coral) 8%,#fff);border:1px solid color-mix(in srgb,var(--coral) 18%,var(--border));font-size:13.5px;line-height:1.55;color:var(--ink);white-space:pre-wrap;max-width:560px}
.bm-bubble.muted{background:var(--canvas,#f6f7f9);border-color:var(--border);color:var(--slate)}
.bm-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;padding:11px 13px;border-radius:13px;border:1px solid var(--border)}
.bm-grid2{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:12px}
@media (min-width:640px){.bm-grid2{grid-template-columns:1fr 1fr}}
.bm-field{display:flex;flex-direction:column;gap:6px;font-size:12.5px;font-weight:600;color:var(--slate)}
.bm-switch{position:relative;width:46px;height:28px;flex-shrink:0;border-radius:999px;border:none;cursor:pointer;background:color-mix(in srgb,var(--slate) 28%,transparent);transition:background .3s ${EASE}}
.bm-switch span{position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .3s ${EASE}}
.bm-switch.on{background:var(--coral)}.bm-switch.on span{transform:translateX(18px)}
.bm-sentences p{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 10px;font-size:14.5px;color:var(--ink)}
.bm-num{width:64px;padding:7px 8px;border-radius:10px;border:1px solid var(--border);font-size:14.5px;font-weight:700;text-align:center;color:var(--ink);font-family:inherit;outline:none}
.bm-num:focus{border-color:var(--coral);box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 15%,transparent)}
.bm-prop{padding:14px;border-radius:16px;background:#fff;border:1px solid var(--border);animation:bmFade .4s ${EASE} both}
.bm-tag{display:inline-block;margin-bottom:8px;padding:3px 9px;border-radius:999px;font-size:11.5px;font-weight:700;background:color-mix(in srgb,var(--coral) 10%,#fff);color:var(--coral)}
.bm-prop .bm-meta{margin-top:8px}
.bm-diff{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}
@media (min-width:640px){.bm-diff{grid-template-columns:1fr 1fr}}
.bm-foot{margin:6px 4px 0;font-size:13px;color:var(--slate);line-height:1.55}
.bm-foot a{color:var(--coral);font-weight:700;text-decoration:none}
.bm-note{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:14px;font-size:13.5px;line-height:1.45;margin-bottom:16px}
.bm-note svg{flex-shrink:0;margin-top:2px}
.bm-note.warn{background:#fffaeb;color:#93370d;border:1px solid #fedf89}
.bm-note.err{background:#fef3f2;color:#b42318;border:1px solid #fecdca}
`
