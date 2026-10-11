'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { supabase } from '@/lib/supabase'
import { resolveCompanyUser, peekCompanyUser } from '@/lib/client-cache'
import { SuggestionCard, type Suggestion } from '@/components/AgentSuggestion'
import { confirmDialog } from '@/components/ConfirmDialog'

// AI Agents (Phase 1 of the Agent Engine). Every agent run is recorded — what
// it knew, every action it asked for, the permission decision and why, and the
// result — so "why did Colvy do this?" always has an answer. Agents can be
// tried here in a sandbox: they read real data, but nothing is sent or changed.

const EASE = 'cubic-bezier(.22,1,.36,1)'

type Run = {
  id: string; role_key: string; mode: 'live' | 'sandbox'; trigger_type: string; status: string; outcome: string | null
  intent: string | null; summary: string | null; model: string | null; tokens_in: number; tokens_out: number
  step_count: number; created_at: string; finished_at: string | null; input: any; conversation_id: string | null; context_refs?: any[]; started_at?: string | null; error?: string | null; actor?: string
}
type Step = {
  id: string; seq: number; kind: string; action_key: string | null; input: any; output: any; reason: string | null
  decision: string | null; decision_reason: string | null; autonomy: string | null; status: string | null
  entity_type: string | null; entity_id: string | null; duration_ms: number | null; tokens_in: number | null; tokens_out: number | null; created_at: string
}

type AutoSend = { enabled: boolean; topics: string[]; max_per_day: number; max_per_conversation_per_hour: number; require_verified_customer: boolean }
type Settings = {
  pause: { paused: boolean; byName?: string | null; at?: string | null; platform?: boolean }
  autoSend: AutoSend; sentToday: number; waiting: number; topics: { key: string; label: string }[]
}
type Waiting = Suggestion & { conversation?: { id: string; channel: string | null; customer: string | null } | null }
const TOPIC_SHORT: Record<string, string> = { opening_hours: 'opening hours', order_status: 'order status (when tracking looks normal)', stock: 'stock', store_info: 'things your knowledge covers' }
const WHO: { key: string; label: string }[] = [{ key: '', label: 'Everything' }, { key: 'support', label: 'Support Agent' }, { key: 'colvy_ai', label: 'Auto-reply' }, { key: 'assistant', label: 'Assistant' }, { key: 'connected_app', label: 'Connected apps' }]
const actorOf = (r: { role_key: string; actor?: string }) => r.actor || (r.role_key === 'support' ? 'Support Agent' : r.role_key)
const CHANNEL: Record<string, string> = { sms: 'SMS', widget: 'Website chat', chat: 'Website chat' }

const ACTION_LABEL: Record<string, string> = {
  get_conversation: 'Read the conversation', get_contact: 'Looked up the customer', ask_knowledge: 'Searched your knowledge',
  check_stock: 'Checked stock', search_orders: 'Searched orders', get_order: 'Looked up an order', search_contacts: 'Searched customers',
  search_conversations: 'Searched conversations', search_tasks: 'Searched tasks', create_task: 'Create a task',
  send_message: 'Reply to the customer', escalate_to_human: 'Hand to the team', finish: 'Finished',
  get_business_hours: 'Checked opening hours', find_customer_orders: 'Found the customer’s orders', check_order_status: 'Checked order tracking',
  auto_reply: 'Replied to the customer', issue_coupon: 'Issued a coupon', start_doa_claim: 'Started a dead-on-arrival claim', create_draft_order: 'Created a draft order',
}
const STATUS: Record<string, { label: string; tone: string }> = {
  queued: { label: 'Queued', tone: 'muted' }, running: { label: 'Working', tone: 'live' }, completed: { label: 'Done', tone: 'ok' },
  escalated: { label: 'Escalated', tone: 'warn' }, awaiting_approval: { label: 'Needs approval', tone: 'warn' },
  failed: { label: 'Failed', tone: 'bad' }, cancelled: { label: 'Cancelled', tone: 'muted' },
}
const DECISION: Record<string, { label: string; tone: string }> = {
  allowed: { label: 'Allowed', tone: 'ok' }, suggested: { label: 'Suggested only', tone: 'muted' },
  needs_approval: { label: 'Needs approval', tone: 'warn' }, denied: { label: 'Blocked', tone: 'bad' },
}
const OUTCOME: Record<string, string> = { replied: 'Replied', escalated: 'Escalated to the team', needs_info: 'Asked for more information', no_action: 'No action needed', incomplete: 'Didn’t finish', refused: 'Declined' }

const isActive = (r?: Run | null) => !!r && (r.status === 'queued' || r.status === 'running')
const when = (iso?: string | null) => {
  if (!iso) return ''
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
const secs = (a?: string | null, b?: string | null) => (a && b ? Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000)) : null)

// ── Icons ────────────────────────────────────────────────────────────────────
const Svg = ({ d, size = 15 }: { d: React.ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
)
const I = {
  spark: <Svg size={20} d={<><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z" /><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></>} />,
  layers: <Svg d={<><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>} />,
  brain: <Svg d={<><circle cx="12" cy="12" r="9" /><path d="M9 10h.01M15 10h.01M9.5 15a3.5 3.5 0 0 0 5 0" /></>} />,
  bolt: <Svg d={<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />} />,
  flag: <Svg d={<><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></>} />,
  alert: <Svg d={<><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>} />,
  chev: <Svg size={13} d={<polyline points="9 18 15 12 9 6" />} />,
  play: <Svg size={13} d={<polygon points="6 4 20 12 6 20 6 4" />} />,
  pause: <Svg size={14} d={<><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></>} />,
  check: <Svg size={12} d={<polyline points="20 6 9 17 4 12" />} />,
  inbox: <Svg size={14} d={<><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>} />,
}
const KIND_ICON: Record<string, React.ReactNode> = { context: I.layers, model: I.brain, action: I.bolt, finish: I.flag, error: I.alert, approval: I.flag }

export default function AgentsPage() {
  const [companyId, setCompanyId] = useState<string | null>(peekCompanyUser()?.companyId || null)
  const [runs, setRuns] = useState<Run[]>([])
  const [loaded, setLoaded] = useState(false)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ run: Run; steps: Step[]; approvals: any[] } | null>(null)
  const [message, setMessage] = useState('Where is my order?')
  const [convs, setConvs] = useState<{ id: string; label: string }[]>([])
  const [convId, setConvId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { resolveCompanyUser().then(r => setCompanyId(r.companyId)).catch(() => {}) }, [])
  // "Why?" links from the inbox open a specific run.
  useEffect(() => { try { const r = new URLSearchParams(window.location.search).get('run'); if (r) setSelected(r) } catch {} }, [])

  // Support Agent switch: answers incoming SMS / chat with suggested replies.
  const [supportOn, setSupportOn] = useState<boolean | null>(null)
  const [savingRole, setSavingRole] = useState(false)
  useEffect(() => {
    if (!companyId) return
    authFetch(`/api/agent/roles?companyId=${companyId}`).then(r => r.json()).then(d => {
      const r = (d.roles || []).find((x: any) => x.key === 'support'); setSupportOn(!!r?.enabled)
    }).catch(() => {})
  }, [companyId])
  const toggleSupport = async () => {
    if (!companyId || supportOn == null) return
    const next = !supportOn
    setSavingRole(true); setSupportOn(next); setError('')
    try {
      const r = await authFetch('/api/agent/roles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, roleKey: 'support', enabled: next }) })
      const d = await r.json()
      if (!r.ok || d.error) { setSupportOn(!next); setError(d.error || 'Couldn’t save.') }
    } catch { setSupportOn(!next); setError('Couldn’t reach Colvy.') } finally { setSavingRole(false) }
  }
  const [reloadKey, setReloadKey] = useState(0)
  const [who, setWho] = useState('')

  // Live pilot: kill switch, auto-send settings, and what's waiting for a person.
  const [settings, setSettings] = useState<Settings | null>(null)
  const [savingSettings, setSavingSettings] = useState(false)
  const [waiting, setWaiting] = useState<Waiting[]>([])
  const loadSettings = useCallback(async () => {
    if (!companyId) return
    try { const r = await authFetch(`/api/agent/settings?companyId=${companyId}`); const d = await r.json(); if (r.ok && d.pause) setSettings(d) } catch {}
  }, [companyId])
  const loadWaiting = useCallback(async () => {
    if (!companyId) return
    try { const r = await authFetch(`/api/agent/approvals?companyId=${companyId}`); const d = await r.json(); if (r.ok) setWaiting((d.approvals || []).filter((a: Waiting) => a.action_key === 'send_message')) } catch {}
  }, [companyId])
  useEffect(() => {
    loadSettings(); loadWaiting()
    if (!companyId) return
    const iv = setInterval(() => { loadWaiting(); loadSettings() }, 15000)
    return () => clearInterval(iv)
  }, [companyId, loadSettings, loadWaiting])
  const saveSettings = async (patch: Record<string, any>): Promise<boolean> => {
    if (!companyId) return false
    setSavingSettings(true); setError('')
    try {
      const r = await authFetch('/api/agent/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, ...patch }) })
      const d = await r.json()
      if (!r.ok || d.error) { setError(d.error || 'Couldn’t save.'); return false }
      setSettings(d); return true
    } catch { setError('Couldn’t reach Colvy.'); return false } finally { setSavingSettings(false) }
  }
  const pauseAll = async () => {
    const ok = await confirmDialog({
      title: 'Pause all agents?',
      message: 'Everything that acts on its own stops straight away — the Support Agent, Colvy AI’s auto-reply, and changes from connected apps. Queued work is cancelled and new messages wait for your team. Suggestions already waiting stay for you to send or dismiss, and the in-app assistant still works because a person approves each action. You can resume any time.',
      confirmLabel: 'Pause all agents', tone: 'danger',
    })
    if (ok) { await saveSettings({ paused: true }); loadRuns() }
  }

  const loadRuns = useCallback(async () => {
    if (!companyId) return
    try {
      const r = await authFetch(`/api/agent/runs?companyId=${companyId}${who ? `&role=${who}` : ''}`)
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Couldn’t load agent runs.'); return }
      setRuns(d.runs || []); setNeedsMigration(!!d.needsMigration)
      setSelected(s => s || d.runs?.[0]?.id || null)
    } catch {} finally { setLoaded(true) }
  }, [companyId, who])
  useEffect(() => { loadRuns() }, [loadRuns])

  // Recent conversations to try the agent against.
  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const { data } = await (supabase as any).from('conversations').select('id, channel, contact_id, last_message, last_message_at')
        .eq('company_id', companyId).order('last_message_at', { ascending: false }).limit(25)
      const ids = Array.from(new Set((data || []).map((c: any) => c.contact_id).filter(Boolean)))
      const names: Record<string, string> = {}
      if (ids.length) {
        const { data: cs } = await (supabase as any).from('contacts').select('id, name').in('id', ids)
        for (const c of cs || []) names[c.id] = c.name
      }
      setConvs((data || []).map((c: any) => ({ id: c.id, label: `${names[c.contact_id] || 'Unknown customer'} · ${c.channel || 'chat'}${c.last_message ? ` — “${String(c.last_message).slice(0, 40)}”` : ''}` })))
    })().catch(() => {})
  }, [companyId])

  // Load + live-poll the selected run.
  useEffect(() => {
    if (!companyId || !selected) { setDetail(null); return }
    let stop = false, timer: any
    const tick = async () => {
      try {
        const r = await authFetch(`/api/agent/runs/${selected}?companyId=${companyId}`)
        const d = await r.json()
        if (stop || !r.ok) return
        setDetail(d)
        if (isActive(d.run)) timer = setTimeout(tick, 1200)
        else setRuns(rs => rs.map(x => (x.id === d.run.id ? { ...x, ...d.run } : x)))
      } catch { if (!stop) timer = setTimeout(tick, 2500) }
    }
    tick()
    return () => { stop = true; clearTimeout(timer) }
  }, [companyId, selected, reloadKey])

  const tryIt = async () => {
    if (!companyId || !message.trim()) return
    setBusy(true); setError('')
    try {
      const r = await authFetch('/api/agent/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, roleKey: 'support', message, conversationId: convId || null }) })
      const d = await r.json()
      if (!r.ok || d.error) { setError(d.error || 'Couldn’t start the agent.'); return }
      const stub: Run = { id: d.runId, role_key: 'support', mode: 'sandbox', trigger_type: 'sandbox', status: 'queued', outcome: null, intent: null, summary: null, model: null, tokens_in: 0, tokens_out: 0, step_count: 0, created_at: new Date().toISOString(), finished_at: null, input: { message }, conversation_id: convId || null }
      setRuns(rs => [stub, ...rs]); setSelected(d.runId)
    } catch { setError('Couldn’t reach Colvy. Check your connection and try again.') }
    finally { setBusy(false) }
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--canvas, #f6f7f9)' }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '24px 16px 120px' }}>
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 320px' }}>
            <h1 style={{ margin: 0, fontSize: 'clamp(22px, 3.4vw, 28px)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>AI Agents</h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--slate)', maxWidth: 640 }}>Everything Colvy’s AI does, in one place — the Support Agent, the auto-reply, the assistant and connected apps. Each run shows what it knew, what it decided, which permission allowed it, and why.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a href="/admin/agents/memory" className="ag-ghost" style={{ display: 'inline-flex', alignItems: 'center', height: 38, textDecoration: 'none' }}>Business memory</a>
            {settings && !settings.pause.paused && (
              <button type="button" className="ag-kill" onClick={pauseAll} disabled={savingSettings}>{I.pause} Pause all agents</button>
            )}
          </div>
        </div>

        {settings?.pause.paused && (
          <div className="ag-paused ag-fade" role="status">
            <span className="ag-paused-ic">{I.pause}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p className="ag-h">All agents are paused</p>
              <p className="ag-p">{settings.pause.platform ? 'Colvy has paused agents for everyone while we look into something.' : `${settings.pause.byName ? `${settings.pause.byName} paused them` : 'Paused'}${settings.pause.at ? ` ${when(settings.pause.at)}` : ''}. The Support Agent, Colvy AI’s auto-reply and connected apps won’t send or change anything; new messages wait for your team.`}</p>
            </div>
            {!settings.pause.platform && <button type="button" className="ag-primary" onClick={() => saveSettings({ paused: false })} disabled={savingSettings}>{savingSettings ? 'Resuming…' : 'Resume'}</button>}
          </div>
        )}

        {needsMigration && <div className="ag-note warn ag-fade" style={{ marginBottom: 16 }}>{I.alert}<span>Agents need a one-time database update (<b>COLVY_V353_AGENT_ENGINE.sql</b>).</span></div>}
        {error && <div className="ag-note err ag-fade" style={{ marginBottom: 16 }} role="alert">{I.alert}<span>{error}</span></div>}

        {/* Live switch */}
        <div className="ag-card ag-fade" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'space-between' }}>
            <div style={{ minWidth: 0 }}>
              <p className="ag-h">Support Agent on incoming SMS and chat</p>
              <p className="ag-p">{settings?.autoSend.enabled
                ? 'When a customer texts or chats, the Support Agent works out what they need and looks it up. It replies on its own when the answer is one you allowed and it has just checked the facts; anything else waits for your team.'
                : 'When a customer texts or chats, the Support Agent works out what they need, checks their order and tracking, and suggests a reply in the conversation. Nothing is sent until someone on your team presses Send.'}</p>
            </div>
            <button type="button" role="switch" aria-checked={!!supportOn} aria-label="Support Agent on incoming SMS and chat" onClick={toggleSupport} disabled={supportOn == null || savingRole} className={`ag-switch ${supportOn ? 'on' : ''}`}><span /></button>
          </div>
          {supportOn && settings && <AutoSendPanel settings={settings} saving={savingSettings} onSave={a => saveSettings({ autoSend: a })} />}
        </div>

        {waiting.length > 0 && companyId && (
          <div className="ag-card ag-fade ag-wait" style={{ marginBottom: 16 }}>
            <p className="ag-h">Waiting for you <span className="ag-count">{waiting.length}</span></p>
            <p className="ag-p">Replies the Support Agent prepared. Send, edit or dismiss them here or in the conversation. They expire after 24 hours.</p>
            <ul className="ag-wait-list">
              {waiting.map(a => (
                <li key={a.id}>
                  <div className="ag-wait-head">
                    <span className="ag-wait-who">{a.conversation?.customer || 'Customer'}</span>
                    <span className="ag-run-s" style={{ marginTop: 0 }}>{CHANNEL[a.conversation?.channel || ''] || a.conversation?.channel || 'Conversation'} · {when(a.created_at)}</span>
                    {a.conversation?.id && <a className="ag-link" href={`/admin/inbox?conversation=${a.conversation.id}`}>{I.inbox} Open conversation</a>}
                  </div>
                  <SuggestionCard s={a} companyId={companyId} onDone={() => { setWaiting(w => w.filter(x => x.id !== a.id)); setTimeout(() => { loadWaiting(); loadSettings(); loadRuns() }, 800) }} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Try it */}
        <div className="ag-card ag-fade" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span className="ag-orb">{I.spark}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p className="ag-h">Try the Support Agent</p>
              <p className="ag-p">Sandbox — it reads your real data, but nothing is sent or changed. Anything it would do is recorded as a suggestion.</p>
            </div>
          </div>
          <div className="ag-try">
            <div style={{ minWidth: 0 }}>
              <label className="ag-label" htmlFor="ag-msg">Customer message</label>
              <textarea id="ag-msg" className="ag-input" rows={2} value={message} onChange={e => setMessage(e.target.value)} placeholder="e.g. Where is my order?" />
            </div>
            <div style={{ minWidth: 0 }}>
              <label className="ag-label" htmlFor="ag-conv">As if it came in on (optional)</label>
              <select id="ag-conv" className="ag-input" value={convId} onChange={e => setConvId(e.target.value)}>
                <option value="">No conversation — a new customer</option>
                {convs.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <button type="button" className="ag-primary" onClick={tryIt} disabled={busy || !message.trim() || !companyId}>
              {busy ? <><span className="ag-spin" /> Starting…</> : <>{I.play} Run</>}
            </button>
          </div>
        </div>

        <div className="ag-grid">
          {/* Runs */}
          <div className="ag-card" style={{ padding: 0, overflow: 'hidden' }}>
            <p className="ag-label" style={{ padding: '16px 16px 6px', margin: 0 }}>Activity</p>
            <div className="ag-who" role="tablist" aria-label="Who did it">
              {WHO.map(w => <button key={w.key} type="button" role="tab" aria-selected={who === w.key} className={who === w.key ? 'on' : ''} onClick={() => setWho(w.key)}>{w.label}</button>)}
            </div>
            {!loaded && <p className="ag-p" style={{ padding: '8px 16px 18px' }}>Loading…</p>}
            {loaded && runs.length === 0 && <p className="ag-p" style={{ padding: '8px 16px 18px' }}>{who ? 'Nothing here yet.' : 'No activity yet. Try the Support Agent above.'}</p>}
            <ul className="ag-runs">
              {runs.map(r => {
                const st = STATUS[r.status] || { label: r.status, tone: 'muted' }
                return (
                  <li key={r.id}>
                    <button type="button" className={`ag-run ${selected === r.id ? 'on' : ''}`} onClick={() => setSelected(r.id)}>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span className="ag-run-t">{String(r.input?.message || r.summary || r.input?.tool || r.trigger_type).slice(0, 70)}</span>
                        <span className="ag-run-s">{actorOf(r)}{r.mode === 'sandbox' ? ' · Sandbox' : ''} · {when(r.created_at)}{r.step_count ? ` · ${r.step_count} step${r.step_count === 1 ? '' : 's'}` : ''}</span>
                      </span>
                      <span className={`ag-chip ${st.tone}`}>{st.label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* Detail */}
          <div className="ag-card" style={{ minWidth: 0 }}>
            {!detail && <p className="ag-p">Pick a run to see what the agent did and why.</p>}
            {detail && companyId && <RunDetail run={detail.run} steps={detail.steps} approvals={detail.approvals} companyId={companyId} onDecided={() => { setReloadKey(k => k + 1); loadRuns() }} />}
          </div>
        </div>
      </div>
    </div>
  )
}

function AutoSendPanel({ settings, saving, onSave }: { settings: Settings; saving: boolean; onSave: (a: AutoSend) => Promise<boolean> }) {
  const [draft, setDraft] = useState<AutoSend>(settings.autoSend)
  const saved = settings.autoSend
  // Follow the server unless the person is mid-edit.
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  useEffect(() => { if (!dirty) setDraft(saved) }, [saved]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (patch: Partial<AutoSend>) => setDraft(d => ({ ...d, ...patch }))
  const toggleTopic = (k: string) => set({ topics: draft.topics.includes(k) ? draft.topics.filter(t => t !== k) : [...draft.topics, k] })

  const save = async () => {
    if (draft.enabled && !saved.enabled) {
      const names = draft.topics.map(k => TOPIC_SHORT[k] || k)
      const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || 'nothing yet'
      const ok = await confirmDialog({
        title: 'Let the Support Agent reply on its own?',
        message: `Without waiting for you, it will answer questions about ${list} — only when it has just looked up the facts, and at most ${draft.max_per_day} a day. Everything else still waits for your team, and you can pause it any time.`,
        confirmLabel: 'Turn on', tone: 'primary',
      })
      if (!ok) return
    }
    await onSave(draft)
  }

  return (
    <div className="ag-auto">
      <p className="ag-label" style={{ marginTop: 0 }}>How it replies</p>
      <div className="ag-seg" role="radiogroup" aria-label="How it replies">
        <button type="button" role="radio" aria-checked={!draft.enabled} className={!draft.enabled ? 'on' : ''} onClick={() => set({ enabled: false })}>Suggest replies</button>
        <button type="button" role="radio" aria-checked={draft.enabled} className={draft.enabled ? 'on' : ''} onClick={() => set({ enabled: true })}>Reply on its own</button>
        <span className="ag-seg-pill" style={{ transform: draft.enabled ? 'translateX(100%)' : 'none' }} />
      </div>

      <div className={`ag-auto-body ${draft.enabled ? 'open' : ''}`} aria-hidden={!draft.enabled}>
        <div style={{ overflow: 'hidden' }}>
          <p className="ag-p" style={{ margin: '14px 0 10px' }}>It sends a reply on its own only when it’s about one of these, and it has just looked the answer up. Anything else — or anything that looks wrong — waits for your team.</p>
          <div className="ag-topics">
            {settings.topics.map(t => {
              const on = draft.topics.includes(t.key)
              return (
                <button key={t.key} type="button" role="checkbox" aria-checked={on} className={`ag-topic ${on ? 'on' : ''}`} onClick={() => toggleTopic(t.key)} tabIndex={draft.enabled ? 0 : -1}>
                  <span className="ag-tick">{on && I.check}</span>{t.label}
                </button>
              )
            })}
          </div>
          <div className="ag-limits">
            <label className="ag-limit">
              <span>Most replies on its own a day</span>
              <input type="number" min={1} max={500} className="ag-input" value={draft.max_per_day} onChange={e => set({ max_per_day: Number(e.target.value) })} tabIndex={draft.enabled ? 0 : -1} />
            </label>
            <label className="ag-limit">
              <span>Most per conversation an hour</span>
              <input type="number" min={1} max={10} className="ag-input" value={draft.max_per_conversation_per_hour} onChange={e => set({ max_per_conversation_per_hour: Number(e.target.value) })} tabIndex={draft.enabled ? 0 : -1} />
            </label>
          </div>
          <div className="ag-verified">
            <div style={{ minWidth: 0 }}>
              <div className="ag-step-t" style={{ fontSize: 13.5 }}>Only for known customers</div>
              <div className="ag-step-dec" style={{ marginTop: 1 }}>Only when the texting number matches the customer’s saved number.</div>
            </div>
            <button type="button" role="switch" aria-checked={draft.require_verified_customer} aria-label="Only for known customers" className={`ag-switch ${draft.require_verified_customer ? 'on' : ''}`} onClick={() => set({ require_verified_customer: !draft.require_verified_customer })} tabIndex={draft.enabled ? 0 : -1}><span /></button>
          </div>
          <p className="ag-step-dec" style={{ marginTop: 10 }}>While it replies on its own, Colvy AI’s older auto-reply stays quiet on SMS and chat, so customers never get two answers.</p>
        </div>
      </div>

      <div className="ag-auto-foot">
        <span className="ag-step-dec" style={{ margin: 0 }}>
          {saved.enabled ? `On — ${settings.sentToday} sent on its own in the last 24 hours (limit ${saved.max_per_day}).` : 'Off — every reply waits for your team.'}
        </span>
        {dirty && (
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="ag-ghost" onClick={() => setDraft(saved)} disabled={saving}>Cancel</button>
            <button type="button" className="ag-primary small" onClick={save} disabled={saving || (draft.enabled && !draft.topics.length)}>{saving ? 'Saving…' : 'Save'}</button>
          </span>
        )}
      </div>
    </div>
  )
}

function RunDetail({ run, steps, approvals, companyId, onDecided }: { run: Run; steps: Step[]; approvals: any[]; companyId: string; onDecided: () => void }) {
  const st = STATUS[run.status] || { label: run.status, tone: 'muted' }
  const dur = secs(run.started_at || run.created_at, run.finished_at)
  const refs: any[] = Array.isArray(run.context_refs) ? run.context_refs : []
  return (
    <div key={run.id} className="ag-fade">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <p className="ag-h">{actorOf(run)}{run.mode === 'sandbox' && <span className="ag-chip muted" style={{ marginLeft: 8 }}>Sandbox</span>}</p>
          {run.input?.message && <p className="ag-quote">“{String(run.input.message).slice(0, 300)}”</p>}
        </div>
        <span className={`ag-chip ${st.tone}`}>{isActive(run) && <span className="ag-dot" />}{st.label}</span>
      </div>

      {run.summary && (
        <div className="ag-why">
          <p className="ag-label" style={{ margin: '0 0 4px' }}>What happened{run.outcome ? ` · ${OUTCOME[run.outcome] || run.outcome}` : ''}</p>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--ink)' }}>{run.summary}</p>
        </div>
      )}

      {(approvals || []).filter(a => a.status === 'pending' && a.action_key === 'send_message').map(a => (
        <div key={a.id} style={{ marginTop: 14 }}>
          <SuggestionCard s={{ ...a, run_id: run.id } as Suggestion} companyId={companyId} compact onDone={onDecided} />
        </div>
      ))}
      {(approvals || []).filter(a => a.status !== 'pending').map(a => (
        <p key={a.id} className="ag-step-dec" style={{ marginTop: 10 }}>
          Suggested reply {a.status === 'executed' ? 'sent by the team' : a.status === 'edited' ? 'edited and sent by the team' : a.status === 'rejected' ? 'dismissed by the team' : a.status === 'expired' ? 'expired — nobody sent it within 24 hours' : a.status}.
        </p>
      ))}

      <div className="ag-stats">
        <span>{run.step_count || steps.length} steps</span>
        {dur != null && <span>{dur}s</span>}
        {(run.tokens_in || run.tokens_out) ? <span>{(run.tokens_in + run.tokens_out).toLocaleString()} tokens</span> : null}
        {run.intent && <span>Intent: {run.intent.replace(/_/g, ' ')}</span>}
        {run.model && <span>{run.model}</span>}
      </div>

      {refs.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p className="ag-label">Context it used</p>
          <div className="ag-refs">{refs.map((r, i) => <span key={i} className="ag-ref">{r.label}</span>)}</div>
        </div>
      )}

      <p className="ag-label" style={{ marginTop: 18 }}>Steps</p>
      <ol className="ag-steps">
        {steps.filter(s => s.kind !== 'context').map(s => <StepRow key={s.id} s={s} />)}
        {isActive(run) && <li className="ag-step"><span className="ag-step-ic live"><span className="ag-spin dark" /></span><span className="ag-step-t">Working…</span></li>}
      </ol>
      {run.error && <div className="ag-note err" style={{ marginTop: 12 }}>{I.alert}<span>{run.error}</span></div>}
    </div>
  )
}

function StepRow({ s }: { s: Step }) {
  const [open, setOpen] = useState(false)
  const dec = s.kind === 'action' && (s.action_key === 'send_message' || s.action_key === 'auto_reply') && s.decision === 'allowed' && s.status === 'ok'
    ? { label: 'Sent on its own', tone: 'ok' }
    : s.decision ? DECISION[s.decision] : null
  const title = useMemo(() => {
    if (s.kind === 'model') return 'Thought it through'
    if (s.kind === 'finish') return `Finished${s.input?.outcome ? ` — ${OUTCOME[s.input.outcome] || s.input.outcome}` : ''}`
    if (s.kind === 'error') return 'Stopped'
    if (s.kind === 'approval') return s.decision === 'denied' ? 'Team dismissed the suggestion' : 'Team approved and sent it'
    return ACTION_LABEL[s.action_key || ''] || s.action_key || s.kind
  }, [s])
  const text = s.kind === 'model' ? String(s.output?.text || '') : ''
  const hasMore = s.kind === 'action' || (s.kind === 'model' && text) || s.kind === 'error'
  return (
    <li className="ag-step">
      <span className={`ag-step-ic ${s.status === 'error' || s.decision === 'denied' ? 'bad' : s.decision === 'needs_approval' ? 'warn' : ''}`}>{KIND_ICON[s.kind] || I.bolt}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <button type="button" className="ag-step-head" onClick={() => hasMore && setOpen(o => !o)} aria-expanded={open} disabled={!hasMore}>
          <span className="ag-step-t">{title}</span>
          {dec && <span className={`ag-chip ${dec.tone}`}>{dec.label}</span>}
          {s.status === 'error' && <span className="ag-chip bad">Error</span>}
          {hasMore && <span className="ag-step-chev" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>{I.chev}</span>}
        </button>
        {s.reason && <p className="ag-step-why">Why: {s.reason}</p>}
        {s.decision_reason && s.kind === 'action' && <p className="ag-step-dec">{s.decision_reason}</p>}
        {s.kind === 'action' && (s.action_key === 'send_message' || s.action_key === 'auto_reply') && s.input?.text && <p className="ag-bubble">{String(s.input.text)}</p>}
        {open && (
          <div className="ag-more">
            {s.kind === 'model' && text && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{text}</p>}
            {s.kind !== 'model' && s.input && Object.keys(s.input).length > 0 && <><p className="ag-label">Input</p><pre>{JSON.stringify(s.input, null, 2)}</pre></>}
            {s.kind !== 'model' && s.output && <><p className="ag-label">Result</p><pre>{JSON.stringify(s.output, null, 2).slice(0, 4000)}</pre></>}
            {(s.tokens_in || s.duration_ms) ? <p className="ag-step-dec">{s.duration_ms ? `${(s.duration_ms / 1000).toFixed(1)}s` : ''}{s.tokens_in ? ` · ${(s.tokens_in + (s.tokens_out || 0)).toLocaleString()} tokens` : ''}</p> : null}
          </div>
        )}
      </div>
    </li>
  )
}

const CSS = `
.ag-fade{animation:agFade .5s ${EASE} both}
@keyframes agFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.ag-fade,.ag-step{animation:none!important}}
.ag-card{background:#fff;border:1px solid var(--border);border-radius:20px;padding:18px}
@media (min-width:640px){.ag-card{padding:22px}}
.ag-h{margin:0;font-size:15px;font-weight:700;color:var(--ink);display:flex;align-items:center;flex-wrap:wrap}
.ag-p{margin:2px 0 0;font-size:13.5px;color:var(--slate);line-height:1.5}
.ag-label{display:block;margin:0 0 6px;font-size:11.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--slate)}
.ag-orb{width:40px;height:40px;flex-shrink:0;border-radius:13px;display:inline-flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(135deg,var(--coral),color-mix(in srgb,var(--coral) 55%,#a855f7));box-shadow:0 10px 24px color-mix(in srgb,var(--coral) 28%,transparent)}
.ag-try{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;margin-top:16px;align-items:end}
@media (min-width:860px){.ag-try{grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) auto}}
.ag-input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:12px;border:1px solid var(--border);background:#fff;font-size:14px;color:var(--ink);font-family:inherit;outline:none;resize:vertical;transition:border-color .2s ease,box-shadow .2s ease}
.ag-input:focus{border-color:var(--coral);box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 15%,transparent)}
.ag-primary{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:42px;padding:0 20px;border-radius:13px;border:none;background:var(--coral);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;transition:transform .15s ${EASE},opacity .2s ease;box-shadow:0 6px 16px color-mix(in srgb,var(--coral) 28%,transparent)}
.ag-primary:hover:not(:disabled){transform:translateY(-1px)}.ag-primary:active:not(:disabled){transform:scale(.97)}.ag-primary:disabled{opacity:.45;cursor:default}
.ag-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:start}
@media (min-width:960px){.ag-grid{grid-template-columns:340px minmax(0,1fr)}}
.ag-runs{list-style:none;margin:0;padding:0 8px 8px;max-height:640px;overflow:auto}
.ag-run{width:100%;display:flex;align-items:center;gap:10px;padding:11px 10px;border:none;background:none;border-radius:12px;text-align:left;cursor:pointer;font-family:inherit;transition:background .2s ease}
.ag-run:hover{background:var(--canvas,#f6f7f9)}
.ag-run.on{background:color-mix(in srgb,var(--coral) 8%,#fff)}
.ag-run-t{display:block;font-size:13.5px;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ag-run-s{display:block;margin-top:2px;font-size:12px;color:var(--slate)}
.ag-chip{display:inline-flex;align-items:center;gap:6px;flex-shrink:0;padding:3px 9px;border-radius:999px;font-size:11.5px;font-weight:700;background:var(--canvas,#f3f4f6);color:var(--slate);white-space:nowrap}
.ag-chip.ok{background:#ecfdf3;color:#067647}.ag-chip.warn{background:#fffaeb;color:#b54708}.ag-chip.bad{background:#fef3f2;color:#b42318}
.ag-chip.live{background:color-mix(in srgb,var(--coral) 12%,#fff);color:var(--coral)}
.ag-dot{width:6px;height:6px;border-radius:50%;background:currentColor;animation:agPulse 1.4s ease-in-out infinite}
@keyframes agPulse{0%,100%{opacity:1}50%{opacity:.3}}
.ag-quote{margin:6px 0 0;font-size:14px;color:var(--slate);font-style:italic;line-height:1.5}
.ag-why{margin-top:14px;padding:14px 16px;border-radius:14px;background:var(--canvas,#f6f7f9)}
.ag-stats{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:12px;font-size:12.5px;color:var(--slate)}
.ag-refs{display:flex;flex-wrap:wrap;gap:6px}
.ag-ref{padding:4px 10px;border-radius:999px;border:1px solid var(--border);font-size:12px;font-weight:600;color:var(--ink)}
.ag-steps{list-style:none;margin:0;padding:0;position:relative}
.ag-step{display:flex;gap:12px;padding:10px 0;position:relative;animation:agFade .45s ${EASE} both}
.ag-step:not(:last-child)::before{content:'';position:absolute;left:15px;top:42px;bottom:-4px;width:1.5px;background:var(--border)}
.ag-step-ic{width:32px;height:32px;flex-shrink:0;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;background:var(--canvas,#f3f4f6);color:var(--slate);position:relative;z-index:1}
.ag-step-ic.bad{background:#fef3f2;color:#b42318}.ag-step-ic.warn{background:#fffaeb;color:#b54708}.ag-step-ic.live{background:color-mix(in srgb,var(--coral) 10%,#fff)}
.ag-step-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;width:100%;padding:6px 0 0;border:none;background:none;text-align:left;cursor:pointer;font-family:inherit}
.ag-step-head:disabled{cursor:default}
.ag-step-t{font-size:14px;font-weight:600;color:var(--ink)}
.ag-step-chev{display:inline-flex;color:var(--slate);transition:transform .25s ${EASE}}
.ag-step-why{margin:4px 0 0;font-size:13px;color:var(--ink);line-height:1.5}
.ag-step-dec{margin:3px 0 0;font-size:12.5px;color:var(--slate);line-height:1.45}
.ag-bubble{margin:8px 0 0;padding:10px 13px;border-radius:14px 14px 14px 4px;background:color-mix(in srgb,var(--coral) 8%,#fff);border:1px solid color-mix(in srgb,var(--coral) 20%,var(--border));font-size:13.5px;color:var(--ink);line-height:1.5;white-space:pre-wrap;max-width:520px}
.ag-more{margin-top:8px;padding:12px;border-radius:12px;background:var(--canvas,#f6f7f9);font-size:13px;color:var(--ink)}
.ag-more pre{margin:0 0 8px;font-size:11.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word;color:var(--ink);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.ag-spin{width:13px;height:13px;border-radius:50%;border:2px solid color-mix(in srgb,#fff 40%,transparent);border-top-color:#fff;animation:agSpin .8s linear infinite;display:inline-block}
.ag-spin.dark{border-color:color-mix(in srgb,var(--coral) 25%,transparent);border-top-color:var(--coral)}
@keyframes agSpin{to{transform:rotate(360deg)}}
.ag-switch{position:relative;width:46px;height:28px;flex-shrink:0;border-radius:999px;border:none;cursor:pointer;background:color-mix(in srgb,var(--slate) 28%,transparent);transition:background .3s ${EASE}}
.ag-switch span{position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .3s ${EASE}}
.ag-switch.on{background:var(--coral)}.ag-switch.on span{transform:translateX(18px)}
.ag-switch:disabled{opacity:.6;cursor:default}
.ag-note{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:14px;font-size:13.5px;line-height:1.45}
.ag-note svg{flex-shrink:0;margin-top:2px}
.ag-note.warn{background:#fffaeb;color:#93370d;border:1px solid #fedf89}
.ag-note.err{background:#fef3f2;color:#b42318;border:1px solid #fecdca}
.ag-who{display:flex;gap:6px;padding:4px 16px 10px;overflow-x:auto;scrollbar-width:none}
.ag-who::-webkit-scrollbar{display:none}
.ag-who button{flex-shrink:0;padding:6px 11px;border-radius:999px;border:1px solid var(--border);background:#fff;font-size:12.5px;font-weight:700;color:var(--slate);cursor:pointer;font-family:inherit;transition:background .2s ease,color .2s ease,border-color .2s ease}
.ag-who button.on{background:var(--ink);border-color:var(--ink);color:#fff}
.ag-kill{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 15px;border-radius:12px;border:1px solid #fecdca;background:#fff;color:#b42318;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;transition:background .2s ease,transform .15s ${EASE}}
.ag-kill:hover:not(:disabled){background:#fef3f2}.ag-kill:active:not(:disabled){transform:scale(.97)}.ag-kill:disabled{opacity:.5;cursor:default}
.ag-paused{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:16px;padding:16px 18px;border-radius:20px;background:#fef3f2;border:1px solid #fecdca}
.ag-paused .ag-h{color:#912018}.ag-paused .ag-p{color:#b42318}
.ag-paused-ic{width:38px;height:38px;flex-shrink:0;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;background:#fff;color:#b42318;border:1px solid #fecdca}
.ag-primary.small{height:36px;padding:0 16px;font-size:13.5px;box-shadow:none}
.ag-ghost{height:36px;padding:0 14px;border-radius:12px;border:1px solid var(--border);background:#fff;color:var(--ink);font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit}
.ag-ghost:disabled{opacity:.5;cursor:default}
.ag-auto{margin-top:16px;padding-top:16px;border-top:1px solid var(--border)}
.ag-seg{position:relative;display:inline-grid;grid-template-columns:1fr 1fr;padding:3px;border-radius:13px;background:var(--canvas,#f3f4f6);max-width:100%}
.ag-seg button{position:relative;z-index:1;padding:8px 16px;border:none;background:none;border-radius:10px;font-size:13.5px;font-weight:700;color:var(--slate);cursor:pointer;font-family:inherit;white-space:nowrap;transition:color .25s ease}
.ag-seg button.on{color:var(--ink)}
.ag-seg-pill{position:absolute;top:3px;bottom:3px;left:3px;width:calc(50% - 3px);border-radius:10px;background:#fff;box-shadow:0 1px 3px rgba(15,23,42,.12);transition:transform .35s ${EASE}}
.ag-auto-body{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows .45s ${EASE},opacity .3s ease}
.ag-auto-body.open{grid-template-rows:1fr;opacity:1}
.ag-topics{display:flex;flex-wrap:wrap;gap:8px}
.ag-topic{display:inline-flex;align-items:center;gap:8px;padding:8px 13px 8px 9px;border-radius:12px;border:1px solid var(--border);background:#fff;font-size:13px;font-weight:600;color:var(--ink);cursor:pointer;font-family:inherit;text-align:left;transition:border-color .2s ease,background .2s ease}
.ag-topic.on{border-color:color-mix(in srgb,var(--coral) 45%,var(--border));background:color-mix(in srgb,var(--coral) 6%,#fff)}
.ag-tick{width:18px;height:18px;flex-shrink:0;border-radius:6px;border:1.5px solid var(--border);display:inline-flex;align-items:center;justify-content:center;color:#fff;transition:background .2s ease,border-color .2s ease}
.ag-topic.on .ag-tick{background:var(--coral);border-color:var(--coral)}
.ag-limits{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:14px}
@media (min-width:560px){.ag-limits{grid-template-columns:1fr 1fr}}
.ag-limit{display:flex;flex-direction:column;gap:6px;font-size:12.5px;font-weight:600;color:var(--slate)}
.ag-verified{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;padding:11px 13px;border-radius:13px;border:1px solid var(--border)}
.ag-auto-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:14px}
.ag-count{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;margin-left:8px;border-radius:999px;background:var(--coral);color:#fff;font-size:11.5px;font-weight:800}
.ag-wait-list{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:14px}
.ag-wait-list li{animation:agFade .45s ${EASE} both}
.ag-wait-head{display:flex;align-items:center;gap:6px 10px;flex-wrap:wrap;margin-bottom:8px}
.ag-wait-who{font-size:14px;font-weight:700;color:var(--ink)}
.ag-link{display:inline-flex;align-items:center;gap:5px;margin-left:auto;font-size:12.5px;font-weight:700;color:var(--coral);text-decoration:none}
.ag-wait .agsg{max-width:none;margin-left:0}
`
