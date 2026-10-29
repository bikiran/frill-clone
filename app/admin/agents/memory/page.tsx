'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { authFetch } from '@/lib/auth-fetch'
import { resolveCompanyUser, peekCompanyUser, readStored, writeStored } from '@/lib/client-cache'
import { confirmDialog } from '@/components/ConfirmDialog'
import AiChatPreview from '@/components/agents/AiChatPreview'

// Business Memory (Agent Engine, Phase 5): what Colvy's AI knows about this
// business and must follow — how replies sound, the policies, the rules, short
// answers to common questions, and when an order needs a person. Every AI reply
// and draft in Colvy reads it. Things an agent learns from the team's edits (or
// a team member asks Colvy AI to remember) arrive here as suggestions and do
// nothing until someone keeps them.

const EASE = 'cubic-bezier(.22,1,.36,1)'

type Item = { id: string; kind: string; key: string; content: any; status: string; source?: string; version?: number; updated_at?: string }
type Templates = { policies: Record<string, { title: string; placeholder: string }>; tones: Record<string, { label: string; sample: string }>; thresholds: { processing_days: number; transit_days: number; stale_days: number } }
type Save = (body: Record<string, any>) => Promise<boolean>
type Coverage = { counts: Record<string, number>; topics: Record<string, { title: string; source: string; where: string; url: string | null } | null> }

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
  search: <Svg size={16} d={<><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>} />,
  alert: <Svg d={<><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>} />,
  book: <Svg size={20} d={<><path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" /><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" /></>} />,
  db: <Svg size={17} d={<><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>} />,
  globe: <Svg size={17} d={<><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" /></>} />,
  file: <Svg size={17} d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>} />,
  smile: <Svg size={18} d={<><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></>} />,
  case: <Svg size={18} d={<><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>} />,
  bolt: <Svg size={18} d={<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />} />,
  gauge: <Svg size={18} d={<><path d="M12 20a8 8 0 1 1 8-8" /><path d="M12 12l4-4" /><path d="M20 20h-4" /></>} />,
  info: <Svg size={16} d={<><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></>} />,
  arrow: <Svg size={13} d={<><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>} />,
  chat: <Svg size={18} d={<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M9.5 8.5a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.6-.8 1.1v.5" /><line x1="12" y1="14.5" x2="12.01" y2="14.5" /></>} />,
}
const TONE_META: Record<string, { icon: React.ReactNode; desc: string }> = {
  warm: { icon: I.smile, desc: 'Friendly, helpful and natural.' },
  professional: { icon: I.case, desc: 'Polite and straightforward.' },
  short: { icon: I.bolt, desc: 'Minimal and to the point.' },
}

export default function BusinessMemoryPage() {
  const [companyId, setCompanyId] = useState<string | null>(peekCompanyUser()?.companyId || null)
  // The last copy kept in this browser paints at once; the fresh one replaces it.
  const cacheKey = companyId ? `agents-memory:${companyId}` : null
  const cached = readStored<any>(cacheKey)
  const [items, setItems] = useState<Item[]>(cached?.items || [])
  const [templates, setTemplates] = useState<Templates | null>(cached?.templates || null)
  const [coverage, setCoverage] = useState<Coverage | null>(cached?.coverage || null)
  const [loaded, setLoaded] = useState(!!cached)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [promptFull, setPromptFull] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { resolveCompanyUser().then(r => setCompanyId(r.companyId)).catch(() => {}) }, [])
  const apply = useCallback((d: any) => {
    setItems(d.items || []); if (d.templates) setTemplates(d.templates); if (d.coverage) setCoverage(d.coverage); setNeedsMigration(!!d.needsMigration); setPromptFull(!!d.promptFull)
    if (!d.needsMigration) writeStored(cacheKey, { items: d.items || [], templates: d.templates || null, coverage: d.coverage || null })
  }, [cacheKey])
  const load = useCallback(async () => {
    if (!companyId) return
    try {
      const r = await authFetch(`/api/agent/memory?companyId=${companyId}`)
      const d = await r.json()
      if (!r.ok || d.error) setError(d.error || 'Couldn’t load memory.')
      else apply(d)
    } catch { setError('Couldn’t reach Colvy.') } finally { setLoaded(true) }
  }, [companyId, apply])
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

  // The tone as it's being edited, for the live preview beside it.
  const [toneDraft, setToneDraft] = useState<{ sample: string; label: string } | null>(null)
  const active = items.filter(i => i.status === 'active')
  const proposals = items.filter(i => i.status === 'proposed')
  const tone = active.find(i => i.kind === 'tone')
  const policies = active.filter(i => i.kind === 'policy')
  const rules = active.filter(i => i.kind === 'instruction')
  const faqs = active.filter(i => i.kind === 'faq')
  const thresholds = active.find(i => i.kind === 'rule' && i.key === 'order_status_thresholds')

  return (
    <div style={{ minHeight: '100%', background: 'var(--canvas, #f6f7f9)' }}>
      <style>{CSS}</style>
      <div className="bm-page">
        <nav className="bm-crumbs" aria-label="Breadcrumb"><Link href="/admin/agents">AI Agents</Link><span aria-hidden="true">/</span><span>Business memory</span></nav>
        <div style={{ margin: '8px 0 20px' }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(26px, 3.4vw, 30px)', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.1, color: 'var(--ink)' }}>Business memory</h1>
          <p style={{ margin: '8px 0 0', fontSize: 14.5, color: '#71717a', maxWidth: 680, lineHeight: 1.55 }}>How your AI sounds and the rules it always follows. It’s part of every AI reply and draft in Colvy — agents, auto-replies, inbox drafts, review and comment replies — and changes apply from the next message.</p>
        </div>
        {loaded && <KnowledgeNote coverage={coverage} />}

        {needsMigration && <div className="bm-note warn">{I.alert}<span>Agents need a one-time database update (<b>COLVY_V353_AGENT_ENGINE.sql</b>).</span></div>}
        {promptFull && <div className="bm-note warn">{I.alert}<span>Not everything here fits in inbox drafts and quick AI replies (auto-replies, review and comment replies, Colvy AI). They take your tone and rules first, then as many facts and common questions as fit. Shorten long facts or remove ones you don’t need.</span></div>}
        {error && <div className="bm-note err" role="alert">{I.alert}<span>{error}</span></div>}
        {!loaded && <div className="bm-card"><p className="bm-p">Loading…</p></div>}

        {loaded && templates && (
          <div className="bm-cols">
            <div className="bm-main">
              {proposals.length > 0 && <Proposals items={proposals} save={save} />}
              <ToneCard item={tone} tones={templates.tones} save={save} onDraft={setToneDraft} />
              <RulesCard items={rules} save={save} />
              <PoliciesCard items={policies} templates={templates.policies} coverage={coverage} save={save} />
              <FaqsCard items={faqs} save={save} />
            </div>
            <aside className="bm-side">
              {toneDraft && (
                <div className="bm-live bm-fade">
                  <AiChatPreview sub={toneDraft.label} customer="Jo Parker" channel="Instagram" messages={[{ from: 'them', text: 'Hi! Where’s my order? 📦' }, { from: 'ai', text: toneDraft.sample }]} />
                </div>
              )}
              <Glance active={active} tone={templates.tones[tone?.content?.style || 'warm']?.label || 'Warm & friendly'} rules={rules.length} facts={policies.length} faqs={faqs.length} waiting={proposals.length} />
              <ThresholdsCard item={thresholds} defaults={templates.thresholds} save={save} />
              <div className="bm-tip bm-fade">{I.info}<span>Opening hours come live from Google Business Profile, so there’s no need to add them here.</span></div>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}

const SRC: { key: string; label: string; icon: React.ReactNode }[] = [
  { key: 'help', label: 'Help centre articles', icon: I.doc },
  { key: 'fact', label: 'Saved facts', icon: I.db },
  { key: 'website', label: 'Website pages', icon: I.globe },
  { key: 'file', label: 'Files', icon: I.file },
]

function KnowledgeNote({ coverage }: { coverage: Coverage | null }) {
  return (
    <div className="bm-know bm-fade">
      <div className="bm-know-lead">
        <span className="bm-know-ic">{I.book}</span>
        <div style={{ minWidth: 0 }}>
          <p className="bm-h">Connected knowledge</p>
          <p className="bm-p">Agents search AI Knowledge before answering, so full policies and long FAQs don’t need copying here. Keep them there, where customers can read them too.</p>
        </div>
      </div>
      <div className="bm-stats">
        {SRC.map(s => (
          <div key={s.key} className="bm-stat">
            <span className="bm-stat-ic">{s.icon}</span>
            <div><b>{coverage?.counts?.[s.key] || 0}</b><span>{s.label}</span></div>
          </div>
        ))}
      </div>
      <Link href="/admin/crm-settings/ai-knowledge" className="bm-know-link">Open AI Knowledge {I.arrow}</Link>
    </div>
  )
}

function Glance({ active, tone, rules, facts, faqs, waiting }: { active: Item[]; tone: string; rules: number; facts: number; faqs: number; waiting: number }) {
  const last = active.reduce<string | null>((m, i) => (i.updated_at && (!m || i.updated_at > m) ? i.updated_at : m), null)
  const rows: [React.ReactNode, string, string][] = [
    [I.clock, 'Last updated', last ? when(last) : 'Not yet'],
    [I.voice, 'Tone', tone],
    [I.rule, 'Rules', `${rules} active`],
    [I.doc, 'Must-know facts', facts ? `${facts}` : 'None'],
    [I.chat, 'Common questions', faqs ? `${faqs}` : 'None'],
  ]
  return (
    <div className="bm-card bm-fade">
      <p className="bm-h" style={{ marginBottom: 6 }}>At a glance</p>
      <ul className="bm-glance">
        {rows.map(([ic, k, v]) => <li key={k}><span className="bm-glance-ic">{ic}</span><span className="bm-glance-k">{k}</span><span className="bm-glance-v">{v}</span></li>)}
      </ul>
      {waiting > 0 && <p className="bm-glance-note">{I.spark}<span>{waiting} suggestion{waiting === 1 ? '' : 's'} from your agents waiting for you</span></p>}
    </div>
  )
}

function CardHead({ icon, title, sub, action }: { icon: React.ReactNode; title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div className="bm-head">
      <span className="bm-ic">{icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p className="bm-h">{title}</p>
        <p className="bm-p">{sub}</p>
      </div>
      {action}
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
      <CardHead icon={I.spark} title="Suggested by your agents" sub="Learned from replies your team edited before sending, or things your team asked Colvy AI to remember. Nothing here is used until you keep it." />
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
      <span className="bm-tag">{p.kind === 'policy' ? `Fact${p.content?.title ? ` · ${p.content.title}` : ''}` : p.kind === 'faq' ? `Common question${p.content?.title ? ` · ${p.content.title}` : ''}` : 'Rule'}</span>
      <textarea className="bm-input" rows={rowsFor(text, 2, 6)} value={text} onChange={e => setText(e.target.value)} aria-label="Suggested memory" />
      <div className="bm-meta">
        {ev.from === 'assistant'
          ? <>Suggested by {ev.proposed_by_name || 'your team'} in Colvy AI · {when(p.updated_at)}</>
          : <>Learned from a reply {ev.edited_by_name || 'your team'} edited · {when(p.updated_at)}</>}
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

function ToneCard({ item, tones, save, onDraft }: { item?: Item; tones: Templates['tones']; save: Save; onDraft?: (d: { sample: string; label: string }) => void }) {
  const saved = useMemo(() => ({ style: item?.content?.style || 'warm', first_name: item?.content?.first_name !== false, sign_off: item?.content?.sign_off || '', avoid: item?.content?.avoid || '' }), [item])
  const [d, setD] = useState(saved)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setD(saved) }, [saved])
  const dirty = !same(d, saved)
  const sample = `${(tones[d.style]?.sample || '').replace(/^Hi Jo|^Hello Jo/, m => (d.first_name ? m : m.replace(' Jo', ' there')))}${d.sign_off ? `\n${d.sign_off}` : ''}`
  const label = tones[d.style]?.label || ''
  useEffect(() => { onDraft?.({ sample, label }) }, [sample, label, onDraft])
  return (
    <div className="bm-card bm-fade">
      <CardHead icon={I.voice} title="How it sounds" sub="The voice your agents reply in. It shapes every message they write." />
      <div className="bm-tones" role="radiogroup" aria-label="Tone of voice">
        {Object.entries(tones).map(([k, t]) => (
          <button key={k} type="button" role="radio" aria-checked={d.style === k} className={`bm-tone ${d.style === k ? 'on' : ''}`} onClick={() => setD({ ...d, style: k })}>
            <span className="bm-radio" />
            <span className="bm-tone-ic">{TONE_META[k]?.icon || I.voice}</span>
            <span style={{ minWidth: 0 }}><span className="bm-tone-l">{t.label}</span>{TONE_META[k] && <span className="bm-tone-d">{TONE_META[k].desc}</span>}</span>
          </button>
        ))}
      </div>
      <div className="bm-preview bm-inline-preview">
        <p className="bm-label" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--coral)' }}>{I.spark} Example reply</p>
        <p key={sample} className="bm-bubble bm-fade">{sample}</p>
      </div>
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

function PoliciesCard({ items, templates, coverage, save }: { items: Item[]; templates: Templates['policies']; coverage: Coverage | null; save: Save }) {
  const [drafts, setDrafts] = useState<{ key: string | null; title: string; custom: boolean }[]>([])
  const used = new Set([...items.map(i => i.key), ...drafts.map(d => d.key).filter(Boolean) as string[]])
  const missing = Object.entries(templates).filter(([k]) => !used.has(k))
  return (
    <div className="bm-card bm-fade">
      <CardHead icon={I.doc} title="Must-know facts (optional)" sub="Short facts the agent must never get wrong, like “We don’t ship live fish to WA”. They’re in every reply and win over anything else, so keep them brief — full policies belong in your help centre." />
      {items.length === 0 && drafts.length === 0 && <p className="bm-empty">Nothing here, and that’s fine — agents find your policies in AI Knowledge.</p>}
      <ul className="bm-list">
        {items.map(i => <PolicyRow key={i.id} item={i} title={i.content?.title || templates[i.key]?.title || i.key} placeholder={templates[i.key]?.placeholder} also={coverage?.topics?.[i.key] || null} save={save} />)}
        {drafts.map((d, n) => (
          <PolicyRow key={`d${n}-${d.key || 'custom'}`} draftKey={d.key} title={d.title} custom={d.custom} placeholder={d.key ? templates[d.key]?.placeholder : 'One or two sentences the agent must never get wrong.'} also={d.key ? coverage?.topics?.[d.key] || null : null} save={save} onDone={() => setDrafts(ds => ds.filter((_, j) => j !== n))} />
        ))}
      </ul>
      <div className="bm-chips">
        {missing.map(([k, t]) => {
          const cov = coverage?.topics?.[k]
          return (
            <button key={k} type="button" className={`bm-chip ${cov ? 'covered' : ''}`} onClick={() => setDrafts(ds => [...ds, { key: k, title: t.title, custom: false }])} title={cov ? `Already in your ${cov.where}: “${cov.title}”` : undefined}>
              {cov ? I.check : I.plus} {t.title}{cov && <span className="bm-chip-note">in your {cov.where}</span>}
            </button>
          )
        })}
        <button type="button" className="bm-chip" onClick={() => setDrafts(ds => [...ds, { key: null, title: '', custom: true }])}>{I.plus} Your own</button>
      </div>
    </div>
  )
}

function PolicyRow({ item, draftKey, title, custom, placeholder, also, save, onDone }: { item?: Item; draftKey?: string | null; title: string; custom?: boolean; placeholder?: string; also?: Coverage['topics'][string]; save: Save; onDone?: () => void }) {
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
    if (!await confirmDialog({ title: `Remove “${saved.title}”?`, message: 'Agents won’t see this in every reply any more. They can still find your help centre articles.', confirmLabel: 'Remove', tone: 'danger' })) return
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
      {also && <p className="bm-also">Also in your {also.where}: “{also.title}”. If they disagree, this one wins — keep them in step, or just remove this.</p>}
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
      <CardHead icon={I.rule} title="Rules" sub="Things agents must always or never do. They apply to every reply." action={!adding ? <button type="button" className="bm-primary bm-add" onClick={() => setAdding(true)}>{I.plus} Add rule</button> : null} />
      {items.length === 0 && !adding && <p className="bm-empty">No rules yet. For example: “Never promise same-day delivery” or “Always offer click & collect for tanks over 4ft.”</p>}
      <ul className="bm-list">
        {items.map((i, n) => <RuleRow key={i.id} n={n + 1} item={i} save={save} />)}
        {adding && <RuleRow n={items.length + 1} save={save} onDone={() => setAdding(false)} />}
      </ul>
    </div>
  )
}

function RuleRow({ n, item, save, onDone }: { n: number; item?: Item; save: Save; onDone?: () => void }) {
  const saved = String(item?.content?.text || '')
  const [text, setText] = useState(saved)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setText(saved) }, [saved])
  const dirty = item ? text !== saved : true
  return (
    <li className="bm-item">
      <div className="bm-item-head" style={{ alignItems: 'flex-start' }}>
        <span className="bm-num-badge">{n}</span>
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

// ── Common questions (FAQ) ───────────────────────────────────────────────────
// Short question-and-answer pairs agents give as they are. Saved as kind 'faq':
// the question is the title, the answer the text.

function FaqsCard({ items, save }: { items: Item[]; save: Save }) {
  const [adding, setAdding] = useState(false)
  return (
    <div className="bm-card bm-fade">
      <CardHead icon={I.chat} title="Common questions" sub="Short answers your agents give when a customer asks. Keep each to a sentence or two — longer FAQs belong in your help centre." action={!adding ? <button type="button" className="bm-primary bm-add" onClick={() => setAdding(true)}>{I.plus} Add question</button> : null} />
      {items.length === 0 && !adding && <p className="bm-empty">None yet. For example: “Do you sell live plants?” — “Yes, in store only. They don’t travel well, so we don’t post them.”</p>}
      <ul className="bm-list">
        {items.map(i => <FaqRow key={i.id} item={i} save={save} />)}
        {adding && <FaqRow save={save} onDone={() => setAdding(false)} />}
      </ul>
    </div>
  )
}

function FaqRow({ item, save, onDone }: { item?: Item; save: Save; onDone?: () => void }) {
  const saved = useMemo(() => ({ q: String(item?.content?.title || ''), a: String(item?.content?.text || '') }), [item])
  const [d, setD] = useState(saved)
  const [busy, setBusy] = useState(false)
  // A fresh copy from the server (after a save) resets the fields.
  const [shown, setShown] = useState(saved)
  if (shown !== saved) { setShown(saved); setD(saved) }
  const dirty = item ? !same(d, saved) : true
  return (
    <li className="bm-item">
      <div className="bm-item-head">
        <input className="bm-input bm-title-in" value={d.q} onChange={e => setD({ ...d, q: e.target.value })} placeholder="The question, e.g. Do you sell live plants?" maxLength={200} autoFocus={!item} aria-label="Question" />
        <button type="button" className="bm-icon" aria-label="Remove question" onClick={async () => {
          if (!item) { onDone?.(); return }
          if (await confirmDialog({ title: 'Remove this question?', message: saved.q || saved.a, confirmLabel: 'Remove', tone: 'danger' })) await save({ id: item.id, status: 'archived' })
        }}>{I.trash}</button>
      </div>
      <textarea className="bm-input" rows={rowsFor(d.a, 2, 8)} value={d.a} onChange={e => setD({ ...d, a: e.target.value })} placeholder="The answer, in a sentence or two." maxLength={600} aria-label="Answer" />
      <SaveBar dirty={dirty} busy={busy} disabled={!d.q.trim() || !d.a.trim()} onCancel={() => (item ? setD(saved) : onDone?.())} onSave={async () => {
        setBusy(true)
        const ok = await save({ kind: 'faq', key: item?.key || null, content: { title: d.q.trim(), text: d.a } })
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
      <CardHead icon={I.gauge} title="When an order needs a person" sub="On “where is my order?”, agents check tracking against these. Past them, the order comes to your team." />
      <div className="bm-sentences">
        <p><span>Not shipped after</span><span>{num('processing_days')} days</span></p>
        <p><span>In transit longer than</span><span>{num('transit_days')} days</span></p>
        <p><span>Tracking hasn’t moved for</span><span>{num('stale_days')} days</span></p>
      </div>
      <SaveBar dirty={dirty} busy={busy} onCancel={() => setD(saved)} onSave={async () => { setBusy(true); await save({ kind: 'rule', content: d }); setBusy(false) }} />
    </div>
  )
}

const CSS = `
.bm-fade{animation:bmFade .5s ${EASE} both}
@keyframes bmFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.bm-fade{animation:none!important}}
.bm-page{max-width:1480px;margin:0 auto;padding:20px 16px 120px}
@media (min-width:900px){.bm-page{padding:24px 32px 120px}}
@media (min-width:900px){.bm-page{padding:24px 28px 120px}}
.bm-crumbs{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--slate)}
.bm-crumbs a{color:var(--slate);text-decoration:none;font-weight:600}.bm-crumbs a:hover{color:var(--ink)}
.bm-crumbs span:last-child{color:var(--ink);font-weight:700}
.bm-cols{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:start}
.bm-live{display:none}
@media (min-width:1080px){.bm-cols{grid-template-columns:minmax(0,1fr) 340px;gap:20px}.bm-side{position:sticky;top:76px}.bm-live{display:block;margin-bottom:16px}.bm-inline-preview{display:none}}
.bm-main>.bm-card:last-child{margin-bottom:0}
.bm-head{display:flex;gap:12px;align-items:flex-start;margin-bottom:16px}
.bm-add{gap:6px;flex-shrink:0;height:34px;padding:0 13px}
.bm-glance{list-style:none;margin:0;padding:0}
.bm-glance li{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid color-mix(in srgb,var(--border) 70%,transparent);font-size:13.5px}
.bm-glance li:last-child{border-bottom:none;padding-bottom:2px}
.bm-glance-ic{color:var(--slate);display:inline-flex}.bm-glance-ic svg{width:16px;height:16px}
.bm-glance-k{color:var(--slate)}
.bm-glance-v{margin-left:auto;font-weight:700;color:var(--ink);text-align:right}
.bm-glance-note{display:flex;gap:8px;align-items:center;margin:10px 0 0;padding:9px 11px;border-radius:12px;background:color-mix(in srgb,var(--coral) 8%,#fff);color:var(--ink);font-size:12.5px;font-weight:600}
.bm-glance-note svg{width:15px;height:15px;color:var(--coral);flex-shrink:0}
.bm-tip{display:flex;gap:9px;align-items:flex-start;padding:12px 14px;border-radius:16px;border:1px dashed var(--border);font-size:12.5px;line-height:1.5;color:var(--slate)}
.bm-tip svg{flex-shrink:0;margin-top:1px}
.bm-num-badge{width:26px;height:26px;flex-shrink:0;margin-top:9px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:var(--coral);background:color-mix(in srgb,var(--coral) 10%,#fff)}
.bm-preview{margin-top:12px;padding:12px 14px;border-radius:16px;background:color-mix(in srgb,var(--coral) 4%,#fff);border:1px solid color-mix(in srgb,var(--coral) 14%,var(--border))}
.bm-preview .bm-label svg{width:14px;height:14px}
.bm-preview .bm-bubble{background:#fff;max-width:none}
.bm-tone-ic{display:inline-flex;color:var(--slate);transition:color .2s ease}
.bm-tone.on .bm-tone-ic{color:var(--coral)}
.bm-tone-l{display:block;font-weight:700}
.bm-tone-d{display:block;margin-top:1px;font-size:12px;font-weight:500;color:var(--slate)}
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
textarea.bm-input{field-sizing:content}
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
.bm-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.bm-chip{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;border:1px dashed color-mix(in srgb,var(--slate) 45%,var(--border));background:#fff;font-size:13px;font-weight:600;color:var(--ink);cursor:pointer;font-family:inherit;transition:border-color .2s ease,background .2s ease}
.bm-chip:hover{border-color:var(--coral);background:color-mix(in srgb,var(--coral) 5%,#fff)}
.bm-tones{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}
@media (min-width:560px){.bm-tones{grid-template-columns:repeat(3,minmax(0,1fr))}}
.bm-tone{display:flex;align-items:center;gap:10px;padding:14px;border-radius:14px;border:1px solid var(--border);background:#fff;font-size:13.5px;font-weight:700;color:var(--ink);cursor:pointer;font-family:inherit;text-align:left;transition:border-color .2s ease,background .2s ease}
.bm-tone.on{border-color:var(--coral);background:color-mix(in srgb,var(--coral) 6%,#fff)}
.bm-radio{width:16px;height:16px;flex-shrink:0;border-radius:50%;border:1.5px solid var(--border);transition:border .2s ease}
.bm-tone.on .bm-radio{border:5px solid var(--coral)}
.bm-bubble{margin:0;padding:11px 14px;border-radius:16px 16px 16px 5px;background:color-mix(in srgb,var(--coral) 8%,#fff);border:1px solid color-mix(in srgb,var(--coral) 18%,var(--border));font-size:13.5px;line-height:1.55;color:var(--ink);white-space:pre-wrap;max-width:560px}
.bm-bubble.muted{background:var(--canvas,#f6f7f9);border-color:var(--border);color:var(--slate)}
.bm-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;padding:11px 13px;border-radius:13px;border:1px solid var(--border)}
.bm-grid2{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:12px}
@media (min-width:640px){.bm-grid2{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
.bm-field{display:flex;flex-direction:column;gap:6px;font-size:12.5px;font-weight:600;color:var(--slate)}
.bm-switch{position:relative;width:46px;height:28px;flex-shrink:0;border-radius:999px;border:none;cursor:pointer;background:color-mix(in srgb,var(--slate) 28%,transparent);transition:background .3s ${EASE}}
.bm-switch span{position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .3s ${EASE}}
.bm-switch.on{background:var(--coral)}.bm-switch.on span{transform:translateX(18px)}
.bm-sentences p{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0;padding:9px 0;border-bottom:1px solid color-mix(in srgb,var(--border) 70%,transparent);font-size:13.5px;color:var(--ink)}
.bm-sentences p:last-child{border-bottom:none}
.bm-sentences p>span:last-child{display:inline-flex;align-items:center;gap:6px;flex-shrink:0;color:var(--slate)}
.bm-num{width:56px;padding:6px 6px;border-radius:10px;border:1px solid var(--border);font-size:14.5px;font-weight:700;text-align:center;color:var(--ink);font-family:inherit;outline:none}
.bm-num:focus{border-color:var(--coral);box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 15%,transparent)}
.bm-prop{padding:14px;border-radius:16px;background:#fff;border:1px solid var(--border);animation:bmFade .4s ${EASE} both}
.bm-tag{display:inline-block;margin-bottom:8px;padding:3px 9px;border-radius:999px;font-size:11.5px;font-weight:700;background:color-mix(in srgb,var(--coral) 10%,#fff);color:var(--coral)}
.bm-prop .bm-meta{margin-top:8px}
.bm-diff{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}
@media (min-width:640px){.bm-diff{grid-template-columns:1fr 1fr}}
.bm-know{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:center;margin-bottom:16px;padding:18px;border-radius:20px;background:#fff;border:1px solid var(--border)}
@media (min-width:760px){.bm-know{grid-template-columns:minmax(0,1fr) auto;gap:18px 20px;padding:20px 22px}.bm-know-lead{grid-column:1 / -1}}
@media (min-width:1320px){.bm-know{grid-template-columns:minmax(300px,1fr) auto auto;gap:24px}.bm-know-lead{grid-column:auto}}
.bm-know-lead{display:flex;gap:14px;align-items:flex-start;min-width:0}
.bm-know-ic{width:46px;height:46px;flex-shrink:0;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--coral) 10%,#fff);color:var(--coral)}
.bm-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
@media (min-width:640px){.bm-stats{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media (min-width:760px){.bm-stats{display:flex;gap:6px}}
.bm-stat{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:var(--canvas,#f6f7f9);min-width:0}
@media (min-width:760px){.bm-stat{background:none;padding:6px 14px;border-radius:0;border-left:1px solid var(--border)}}
@media (min-width:760px) and (max-width:1319px){.bm-stat:first-child{border-left:none;padding-left:0}}
.bm-stat-ic{width:32px;height:32px;flex-shrink:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:#fff;color:var(--slate);border:1px solid var(--border)}
.bm-stat b{display:block;font-size:19px;font-weight:800;color:var(--ink);line-height:1.1}
.bm-stat div span{display:block;font-size:11.5px;color:var(--slate);white-space:nowrap}
.bm-know-link{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:38px;padding:0 14px;border-radius:12px;border:1px solid color-mix(in srgb,var(--coral) 35%,var(--border));background:color-mix(in srgb,var(--coral) 5%,#fff);font-size:13px;font-weight:700;color:var(--coral);text-decoration:none;white-space:nowrap;transition:background .2s ease,transform .15s ${EASE}}
.bm-know-link:hover{background:color-mix(in srgb,var(--coral) 10%,#fff)}.bm-know-link:active{transform:scale(.97)}
.bm-chip.covered{border-style:solid;border-color:var(--border);color:var(--slate)}
.bm-chip.covered svg{color:#067647}
.bm-chip-note{font-size:11.5px;font-weight:600;color:var(--slate);opacity:.85}
.bm-also{margin:0 0 8px;padding:8px 11px;border-radius:10px;background:#fffaeb;color:#93370d;font-size:12.5px;line-height:1.45}
.bm-note{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:14px;font-size:13.5px;line-height:1.45;margin-bottom:16px}
.bm-note svg{flex-shrink:0;margin-top:2px}
.bm-note.warn{background:#fffaeb;color:#93370d;border:1px solid #fedf89}
.bm-note.err{background:#fef3f2;color:#b42318;border:1px solid #fecdca}
/* The soft card-and-pill look shared with the rest of the admin. */
.bm-page{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.admin-main:has(.bm-page){overflow-x:clip!important;overflow-y:visible!important;min-width:0}
.bm-page button::before{display:none}
.bm-card,.bm-know{border-color:transparent;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04)}
.bm-learn{border-color:color-mix(in srgb,var(--coral) 30%,transparent)}
.bm-h{font-size:16px}
.bm-p{color:#71717a}
.bm-label{font-size:12.5px;font-weight:600;letter-spacing:0;text-transform:none;color:#71717a}
.bm-input,.bm-num{border:1.5px solid transparent;background:#f4f4f5}
.bm-input:focus,.bm-num:focus{background:#fff;border-color:#d4d4d8!important}
.bm-primary{border-radius:999px;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 1px 2px rgba(16,24,40,.12)}
.bm-ghost{border:none;border-radius:999px;background:#f4f4f5;font-weight:600}
.bm-ghost:hover:not(:disabled){background:#ececef}
.bm-icon{border-radius:50%}
.bm-item,.bm-prop{border-color:transparent;box-shadow:0 0 0 1px rgba(0,0,0,.07)}
.bm-tone{border-color:transparent;background:#f4f4f5}
.bm-tone.on{border-color:var(--coral);background:color-mix(in srgb,var(--coral) 6%,#fff)}
.bm-row{border:none;background:#fafafa}
.bm-chip{border-style:solid;border-color:transparent;background:#f4f4f5}
.bm-chip:hover{border-color:transparent;background:#ececef}
.bm-chip.covered{background:#fafafa}
.bm-switch.on{background:#34c759}
.bm-know-link{border-radius:999px;border:none}
.bm-stat-ic{border:none;box-shadow:0 0 0 1px rgba(0,0,0,.07)}
.bm-note.warn{border:none;box-shadow:0 0 0 1px #fde68a}
.bm-note.err{border:none;box-shadow:0 0 0 1px #fecdca}
`
