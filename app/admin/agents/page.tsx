'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import TickSlider from '@/components/TickSlider'
import AiBuddy from '@/components/AiBuddy'
import { authFetch } from '@/lib/auth-fetch'
import { supabase } from '@/lib/supabase'
import { resolveCompanyUser, peekCompanyUser, readStored, writeStored, readCache, writeCache } from '@/lib/client-cache'
import { SuggestionCard, type Suggestion } from '@/components/AgentSuggestion'
import { confirmDialog } from '@/components/ConfirmDialog'
import AgentConnections from '@/components/AgentConnections'
import { ResultsStrip } from '@/components/AgentResults'
import { NeedsYouCard } from '@/components/NeedsYou'
import ConversationPicker, { cleanPreview, type PickConv } from '@/components/ConversationPicker'
import { waitlistEntryHref, waitlistPreview } from '@/lib/waitlist-ai'
import { friendlyRunError } from '@/lib/agent/tool-schema'
import { AGENTS } from '@/lib/agents-marketing'
import AgentFace, { FacePicker } from '@/components/agents/AgentFace'
import AgentShowcase, { GearIcon } from '@/components/agents/AgentShowcase'
import { faceFor, type AgentFace as Face, type AgentFaces } from '@/lib/agent-faces'

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

type SalesAuto = { enabled: boolean; max_per_day: number }
type DailyAuto = SalesAuto
type CommentAuto = { on: boolean; enabled: boolean; max_per_day: number }
type SalesFollowup = { on: boolean; enabled: boolean; max_per_day: number; after_days: number }
type ReviewAuto = { enabled: boolean; min_rating: number; max_per_day: number }
type AutoSend = { enabled: boolean; topics: string[]; max_per_day: number; max_per_conversation_per_hour: number; require_verified_customer: boolean }
type Settings = {
  pause: { paused: boolean; byName?: string | null; at?: string | null; platform?: boolean }
  autoSend: AutoSend; receptionAuto?: AutoSend; reviewAuto?: ReviewAuto; commentAuto?: CommentAuto; salesAuto?: SalesAuto; salesFollowup?: SalesFollowup; opsAuto?: DailyAuto; channels?: string[]; faces?: AgentFaces; channelOptions?: { key: string; label: string }[]; sentToday: number; waiting: number; topics: { key: string; label: string }[]
}
type Waiting = Suggestion & { run?: any; conversation?: { id: string; channel: string | null; customer: string | null } | null }
const TOPIC_SHORT: Record<string, string> = { opening_hours: 'opening hours', order_status: 'order status (when tracking looks normal)', stock: 'stock', store_info: 'things your knowledge covers' }
const WHO: { key: string; label: string }[] = [{ key: '', label: 'Everything' }, { key: 'support', label: 'Support Agent' }, { key: 'reception', label: 'Reception' }, { key: 'reputation', label: 'Reputation' }, { key: 'sales', label: 'Sales' }, { key: 'operations', label: 'Operations' }, { key: 'colvy_ai', label: 'Auto-reply' }, { key: 'assistant', label: 'Assistant' }, { key: 'connected_app', label: 'Connected apps' }]
const actorOf = (r: { role_key: string; actor?: string }) => r.actor || (r.role_key === 'support' ? 'Support Agent' : r.role_key)
const CHANNEL: Record<string, string> = { sms: 'SMS', widget: 'Website chat', chat: 'Website chat', email: 'Email', facebook: 'Facebook', instagram: 'Instagram' }

type RoleKey = 'support' | 'reception' | 'reputation' | 'sales' | 'operations'
const TRY_ROLES: { key: RoleKey; label: string; sample: string }[] = [
  { key: 'support', label: 'Support', sample: 'Where is my order?' },
  { key: 'reception', label: 'Reception', sample: 'Can I book a tank service for Saturday morning?' },
  { key: 'reputation', label: 'Reputation', sample: 'Lovely shop and really helpful staff — they spent ages helping me choose fish for my new tank.' },
  { key: 'sales', label: 'Sales', sample: 'Lemon Oscar\n4ft tank light' },
  { key: 'operations', label: 'Operations', sample: '' },
]
// What agents prepare for a person (the waiting list), and what counts as "sent on its own".
const WAITING_ACTIONS = ['send_message', 'reply_to_review', 'reply_to_comment', 'reschedule_booking', 'cancel_booking', 'add_to_waitlist', 'send_cart_followup', 'send_order_update', 'send_sales_followup']
const SENT_ACTIONS = ['send_message', 'auto_reply', 'reply_to_review', 'reply_to_comment', 'send_cart_followup', 'send_order_update', 'send_sales_followup']

const ACTION_LABEL: Record<string, string> = {
  get_conversation: 'Read the conversation', get_contact: 'Looked up the customer', ask_knowledge: 'Searched your knowledge',
  check_stock: 'Checked stock', search_orders: 'Searched orders', get_order: 'Looked up an order', search_contacts: 'Searched customers',
  search_conversations: 'Searched conversations', search_tasks: 'Searched tasks', create_task: 'Create a task', add_to_waitlist: 'Add to the waiting list',
  send_message: 'Reply to the customer', escalate_to_human: 'Hand to the team', finish: 'Finished',
  get_business_hours: 'Checked opening hours', find_customer_orders: 'Found the customer’s orders', check_order_status: 'Checked order tracking',
  get_review: 'Read the review', reply_to_review: 'Replied to the review',
  get_comment: 'Read the comment', reply_to_comment: 'Reply to the comment',
  list_services: 'Looked at your services', check_availability: 'Checked free times', find_my_bookings: 'Found the customer’s bookings', booking_link: 'Made a booking link', reschedule_booking: 'Move a booking', cancel_booking: 'Cancel a booking',
  get_cart: 'Read the cart', send_cart_followup: 'Follow up the cart',
  get_opportunity: 'Read the quote or enquiry', send_sales_followup: 'Follow up the customer',
  get_exception: 'Looked at the flagged order', check_order_tracking: 'Checked live tracking', send_order_update: 'Update the customer',
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
  // What this page showed last time (kept in this browser) paints straight
  // away; every list below is refreshed underneath.
  const ck = (what: string) => (companyId ? `agents-${what}:${companyId}` : null)
  const cachedRuns = readStored<{ runs: Run[]; needsMigration?: boolean; first?: { run: Run; steps: Step[]; approvals: any[] } | null }>(ck('runs'))
  if (cachedRuns?.first?.run?.id && !readCache(`agents-run:${cachedRuns.first.run.id}`)) writeCache(`agents-run:${cachedRuns.first.run.id}`, { ...cachedRuns.first, at: 0 })
  const cachedRoles = readStored<Record<string, boolean>>(ck('roles'))
  const [runs, setRuns] = useState<Run[]>(cachedRuns?.runs || [])
  const [loaded, setLoaded] = useState(!!cachedRuns)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [selected, setSelected] = useState<string | null>(cachedRuns?.runs?.[0]?.id || null)
  // Picked by you (or a "Why?" link), rather than just "the newest one".
  const picked = useRef(false)
  const pick = (id: string | null) => { picked.current = true; setSelected(id) }
  const [detail, setDetail] = useState<{ run: Run; steps: Step[]; approvals: any[] } | null>(null)
  // Runs already opened this session, so going back to one is instant.
  const detailCache = (id: string) => readCache<{ run: Run; steps: Step[]; approvals: any[]; at: number }>(`agents-run:${id}`)
  const [message, setMessage] = useState('Where is my order?')
  const [tryRole, setTryRole] = useState<RoleKey>('support')
  const [tryRating, setTryRating] = useState(5)
  const [convs, setConvs] = useState<PickConv[]>([])
  const [convId, setConvId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { resolveCompanyUser().then(r => setCompanyId(r.companyId)).catch(() => {}) }, [])
  // "Why?" links from the inbox open a specific run.
  useEffect(() => { try { const r = new URLSearchParams(window.location.search).get('run'); if (r) pick(r) } catch {} }, [])

  // Support Agent switch: answers incoming SMS / chat with suggested replies.
  const [supportOn, setSupportOn] = useState<boolean | null>(cachedRoles ? !!cachedRoles.support : null)
  // Reputation Agent switch: drafts replies to new Google reviews.
  const [repOn, setRepOn] = useState<boolean | null>(cachedRoles ? !!cachedRoles.reputation : null)
  // Reception Agent switch: booking talk on SMS / chat.
  const [recOn, setRecOn] = useState<boolean | null>(cachedRoles ? !!cachedRoles.reception : null)
  // Sales Agent switch: personal follow-ups to abandoned carts.
  const [salesOn, setSalesOn] = useState<boolean | null>(cachedRoles ? !!cachedRoles.sales : null)
  // Operations Agent switch: late, stuck and out-of-stock orders.
  const [opsOn, setOpsOn] = useState<boolean | null>(cachedRoles ? !!cachedRoles.operations : null)
  const [savingRole, setSavingRole] = useState(false)
  // false: this workspace's plan doesn't include the agents (Inbox and Everything do).
  const [onPlan, setOnPlan] = useState<boolean | null>(null)
  useEffect(() => {
    if (!companyId) return
    authFetch(`/api/agent/roles?companyId=${companyId}`).then(r => r.json()).then(d => {
      if (!Array.isArray(d.roles)) return
      if (typeof d.onPlan === 'boolean') setOnPlan(d.onPlan)
      const on = (k: string) => !!d.roles.find((x: any) => x.key === k)?.enabled
      setSupportOn(on('support')); setRepOn(on('reputation')); setRecOn(on('reception')); setSalesOn(on('sales')); setOpsOn(on('operations'))
      writeStored(`agents-roles:${companyId}`, Object.fromEntries(['support', 'reputation', 'reception', 'sales', 'operations'].map(k => [k, on(k)])))
    }).catch(() => {})
  }, [companyId])
  const toggleRole = async (roleKey: RoleKey) => {
    const cur = { support: supportOn, reception: recOn, sales: salesOn, operations: opsOn, reputation: repOn }[roleKey]
    const set = { support: setSupportOn, reception: setRecOn, sales: setSalesOn, operations: setOpsOn, reputation: setRepOn }[roleKey]
    if (!companyId || cur == null) return
    const next = !cur
    setSavingRole(true); set(next); setError('')
    try {
      const r = await authFetch('/api/agent/roles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, roleKey, enabled: next }) })
      const d = await r.json()
      if (!r.ok || d.error) { set(!next); setError(d.error || 'Couldn’t save.') }
    } catch { set(!next); setError('Couldn’t reach Colvy.') } finally { setSavingRole(false) }
  }
  const toggleSupport = () => toggleRole('support')
  const [reloadKey, setReloadKey] = useState(0)
  const [who, setWho] = useState('')

  // Which section is in view, for the side menu on wide screens.
  const [spy, setSpy] = useState('ag-top')
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const ids = ['ag-top', 'ag-needs', 'ag-support', 'ag-reception', 'ag-reputation', 'ag-sales', 'ag-operations', 'ag-tools', 'ag-try', 'ag-activity']
    const seen = new Map<string, number>()
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting && e.boundingClientRect.height > 0) seen.set(e.target.id, e.boundingClientRect.top)
        else seen.delete(e.target.id)
      }
      const first = ids.find(id => seen.has(id))
      if (first) setSpy(first)
    }, { rootMargin: '-72px 0px -55% 0px' })
    ids.forEach(id => { const el = document.getElementById(id); if (el) io.observe(el) })
    return () => io.disconnect()
  }, [companyId, needsMigration])

  // Live pilot: kill switch, auto-send settings, and what's waiting for a person.
  const [settings, setSettingsState] = useState<Settings | null>(() => readStored<Settings>(ck('settings')) || null)
  const setSettings = useCallback((s: Settings) => { setSettingsState(s); writeStored(companyId ? `agents-settings:${companyId}` : null, s) }, [companyId])
  const [savingSettings, setSavingSettings] = useState(false)
  const [waiting, setWaitingState] = useState<Waiting[]>(() => readStored<Waiting[]>(ck('waiting')) || [])
  const setWaiting = useCallback((w: Waiting[] | ((cur: Waiting[]) => Waiting[])) => {
    setWaitingState(cur => { const next = typeof w === 'function' ? w(cur) : w; writeStored(companyId ? `agents-waiting:${companyId}` : null, next); return next })
  }, [companyId])
  const loadSettings = useCallback(async () => {
    if (!companyId) return
    try { const r = await authFetch(`/api/agent/settings?companyId=${companyId}`); const d = await r.json(); if (r.ok && d.pause) setSettings(d) } catch {}
  }, [companyId, setSettings])
  const loadWaiting = useCallback(async () => {
    if (!companyId) return
    try { const r = await authFetch(`/api/agent/approvals?companyId=${companyId}`); const d = await r.json(); if (r.ok) setWaiting((d.approvals || []).filter((a: Waiting) => WAITING_ACTIONS.includes(a.action_key) || a.action_key.startsWith('x_'))) } catch {}
  }, [companyId, setWaiting])
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
  // How each agent looks (lib/agent-faces). Changes show at once and are saved
  // a moment after the last one, so dragging the colour slider is one save.
  const faceOf = (k: string) => faceFor(k, settings?.faces)
  const [editFace, setEditFace] = useState<{ key: string; el: HTMLElement } | null>(null)
  const closeFace = useCallback(() => setEditFace(null), [])
  const faceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingFaces = useRef<Record<string, Face | null>>({})
  const changeFace = (key: string, face: Face | null) => {
    setSettingsState(cur => {
      if (!cur) return cur
      const faces = { ...(cur.faces || {}) }
      if (face) faces[key] = face; else delete faces[key]
      const next = { ...cur, faces }
      writeStored(companyId ? `agents-settings:${companyId}` : null, next)
      return next
    })
    pendingFaces.current[key] = face
    if (faceTimer.current) clearTimeout(faceTimer.current)
    faceTimer.current = setTimeout(async () => {
      const patch = pendingFaces.current; pendingFaces.current = {}
      try {
        const r = await authFetch('/api/agent/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, faces: patch }) })
        if (!r.ok) setError((await r.json().catch(() => ({}))).error || 'Couldn’t save the new look.')
      } catch { setError('Couldn’t reach Colvy.') }
    }, 500)
  }
  const openFace = (key: string) => settings ? (el: HTMLElement) => setEditFace(cur => (cur?.key === key ? null : { key, el })) : undefined

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
      // first=1: the newest run comes back opened up, saving a second wait.
      const r = await authFetch(`/api/agent/runs?companyId=${companyId}${who ? `&role=${who}` : ''}&first=1`)
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Couldn’t load agent runs.'); return }
      if (d.first?.run?.id) writeCache(`agents-run:${d.first.run.id}`, { ...d.first, at: Date.now() })
      setRuns(d.runs || []); setNeedsMigration(!!d.needsMigration)
      if (!who) writeStored(`agents-runs:${companyId}`, { runs: d.runs || [], needsMigration: !!d.needsMigration, first: d.first || null })
      setSelected(s => (picked.current && s) ? s : d.runs?.[0]?.id || s || null)
    } catch {} finally { setLoaded(true) }
  }, [companyId, who])
  useEffect(() => { loadRuns() }, [loadRuns])

  // Recent conversations to try the agent against.
  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const { data } = await (supabase as any).from('conversations').select('id, channel, contact_id, last_message, last_message_at')
        .eq('company_id', companyId).order('last_message_at', { ascending: false }).limit(60)
      const ids = Array.from(new Set((data || []).map((c: any) => c.contact_id).filter(Boolean)))
      const names: Record<string, string> = {}
      if (ids.length) {
        const { data: cs } = await (supabase as any).from('contacts').select('id, name').in('id', ids)
        for (const c of cs || []) names[c.id] = c.name
      }
      setConvs((data || []).map((c: any) => ({ id: c.id, name: names[c.contact_id] || 'Unknown customer', channel: c.channel || 'chat', preview: cleanPreview(waitlistPreview(c.last_message) || '').slice(0, 120), at: c.last_message_at || null })))
    })().catch(() => {})
  }, [companyId])

  // Load + live-poll the selected run.
  useEffect(() => {
    if (!companyId || !selected) { setDetail(null); return }
    let stop = false, timer: any
    // Show the copy we already have at once; fetch unless it's only just arrived.
    const have = detailCache(selected)
    if (have) setDetail(have)
    const tick = async () => {
      try {
        const r = await authFetch(`/api/agent/runs/${selected}?companyId=${companyId}`)
        const d = await r.json()
        if (stop || !r.ok) return
        writeCache(`agents-run:${d.run.id}`, { ...d, at: Date.now() })
        setDetail(d)
        if (isActive(d.run)) timer = setTimeout(tick, 1200)
        else setRuns(rs => rs.map(x => (x.id === d.run.id ? { ...x, ...d.run } : x)))
      } catch { if (!stop) timer = setTimeout(tick, 2500) }
    }
    if (have && !isActive(have.run) && Date.now() - have.at < 10_000 && !reloadKey) { /* fresh enough */ }
    else tick()
    return () => { stop = true; clearTimeout(timer) }
  }, [companyId, selected, reloadKey])

  const tryIt = async () => {
    if (!companyId || !message.trim()) return
    setBusy(true); setError('')
    try {
      const r = await authFetch('/api/agent/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, roleKey: tryRole, message, rating: tryRating, conversationId: tryRole === 'support' || tryRole === 'reception' ? convId || null : null }) })
      const d = await r.json()
      if (!r.ok || d.error) { setError(d.error || 'Couldn’t start the agent.'); return }
      const stub: Run = { id: d.runId, role_key: tryRole, mode: 'sandbox', trigger_type: 'sandbox', status: 'queued', outcome: null, intent: null, summary: null, model: null, tokens_in: 0, tokens_out: 0, step_count: 0, created_at: new Date().toISOString(), finished_at: null, input: { message, rating: tryRole === 'reputation' ? tryRating : undefined }, conversation_id: tryRole === 'support' || tryRole === 'reception' ? convId || null : null }
      setRuns(rs => [stub, ...rs]); pick(d.runId)
    } catch { setError('Couldn’t reach Colvy. Check your connection and try again.') }
    finally { setBusy(false) }
  }

  // The side menu and the "at a glance" card (wide screens only).
  const paused = !!settings?.pause.paused
  const navAgents = [
    { key: 'support', label: 'Support', on: supportOn }, { key: 'reception', label: 'Reception', on: recOn },
    { key: 'reputation', label: 'Reputation', on: repOn }, { key: 'sales', label: 'Sales', on: salesOn },
    { key: 'operations', label: 'Operations', on: opsOn },
  ]
  const onCount = navAgents.filter(a => a.on).length
  const agentState = (on: boolean | null) => (on == null ? '' : paused ? 'paused' : on ? 'on' : 'off') as 'on' | 'off' | 'paused' | ''

  return (
    <div style={{ minHeight: '100%', background: 'var(--canvas, #f6f7f9)' }}>
      <style>{CSS}</style>
      <div className="ag-shell">
      {/* Wide screens: a menu of this page's sections on the left… */}
      <aside className="ag-nav" aria-label="AI agents">
        <div className="ag-rail-card">
          <p className="ag-nav-title">AI agent</p>
          <a href="#ag-top" className={spy === 'ag-top' ? 'on' : ''}>{I.layers} Overview</a>
          <a href="#ag-needs" className={spy === 'ag-needs' ? 'on' : ''}>{I.flag} Needs you</a>
          <a href="#ag-try" className={spy === 'ag-try' ? 'on' : ''}>{I.play} Try an agent</a>
          <a href="#ag-activity" className={spy === 'ag-activity' ? 'on' : ''}>{I.inbox} Activity</a>
          <p className="ag-nav-group">Agents</p>
          {navAgents.map(a => (
            <a key={a.key} href={`#ag-${a.key}`} className={spy === `ag-${a.key}` ? 'on' : ''}>
              <span className="ag-nav-face" aria-hidden="true"><AgentFace face={faceOf(a.key)} size={20} /></span>
              {a.label}
              <span className={`ag-nav-state${paused ? ' paused' : a.on ? ' on' : ''}`}>{a.on == null ? '' : paused ? 'Paused' : a.on ? 'On' : 'Off'}</span>
            </a>
          ))}
          <a href="#ag-tools" className={spy === 'ag-tools' ? 'on' : ''}>{I.bolt} Outside tools</a>
          <p className="ag-nav-group">More</p>
          <a href="/admin/agents/needs-you">{I.flag} Everything waiting</a>
          <a href="/admin/agents/results">{I.layers} Results</a>
          <a href="/admin/agents/memory">{I.brain} Business memory</a>
        </div>
      </aside>
      <div className="ag-page" style={{ maxWidth: 1160, margin: '0 auto', padding: '24px 16px 120px' }}>
        <div id="ag-top" style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 320px' }}>
            <h1 style={{ margin: 0, fontSize: 'clamp(26px, 3.4vw, 30px)', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.1, color: 'var(--ink)' }}>AI agents</h1>
            <p style={{ margin: '8px 0 0', fontSize: 14.5, color: '#71717a', maxWidth: 640, lineHeight: 1.55 }}>Everything Colvy’s AI does, in one place — the Support Agent, the auto-reply, the assistant and connected apps. Each run shows what it knew, what it decided, which permission allowed it, and why.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a href="/admin/agents/needs-you" className="ag-ghost ag-headlink" style={{ display: 'inline-flex', alignItems: 'center', height: 38, textDecoration: 'none' }}>Needs you</a>
            <a href="/admin/agents/results" className="ag-ghost ag-headlink" style={{ display: 'inline-flex', alignItems: 'center', height: 38, textDecoration: 'none' }}>Results</a>
            <a href="/admin/agents/memory" className="ag-ghost ag-headlink" style={{ display: 'inline-flex', alignItems: 'center', height: 38, textDecoration: 'none' }}>Business memory</a>
            {settings && !settings.pause.paused && (
              <button type="button" className="ag-kill ag-head-pause" onClick={pauseAll} disabled={savingSettings}>{I.pause} Pause all agents</button>
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
        {onPlan === false && (
          <div className="ag-card ag-fade" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', borderColor: 'color-mix(in srgb, var(--coral) 35%, var(--border))', background: 'color-mix(in srgb, var(--coral) 5%, #fff)' }}>
            <div style={{ flex: '1 1 320px', minWidth: 0 }}>
              <p className="ag-h">AI agents come with the Inbox and Everything plans</p>
              <p className="ag-p">Your workspace’s plan doesn’t include them, so they won’t answer, follow up or draft anything. Upgrade to switch on the Support, Reception, Sales, Operations and Reputation agents. Everything you’ve set up here stays as it is.</p>
            </div>
            <a href="/upgrade?plan=omnichannel" className="ag-primary" style={{ display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 18px', textDecoration: 'none', flexShrink: 0 }}>See plans</a>
          </div>
        )}
        {error && <div className="ag-note err ag-fade" style={{ marginBottom: 16 }} role="alert">{I.alert}<span>{error}</span></div>}

        {/* The team: each agent's face, whether it's working, and the last thing it did. */}
        <section className="ag-team ag-fade" aria-label="Your AI team">
          <div className="ag-team-head">
            <div>
              <p className="ag-h">Your AI team</p>
              <p className="ag-p">{paused ? 'Everyone is paused. New messages wait for your team.' : onCount ? `${onCount} of ${navAgents.length} working for you right now.` : 'Switch an agent on to put it to work.'}</p>
            </div>
            <a href="#ag-try" className="ag-ghost" style={{ display: 'inline-flex', alignItems: 'center', height: 36, textDecoration: 'none' }}>{I.play}&nbsp; Try an agent</a>
          </div>
          <div className="ag-team-grid">
            {navAgents.map(a => {
              const meta = AGENTS.find(x => x.key === a.key)
              const last = runs.find(r => r.role_key === a.key && r.mode === 'live')
              const state = paused ? 'paused' : a.on ? 'on' : a.on == null ? '' : 'off'
              const face = faceOf(a.key)
              return (
                <div key={a.key} className={`ag-mate ${state}`} style={{ ['--c' as any]: face.color }}>
                  <a href={`#ag-${a.key}`} className="ag-mate-link" aria-label={`${a.label}: ${a.on == null ? '' : paused ? 'paused' : a.on ? 'working' : 'off'}`} />
                  <span className="ag-mate-face">
                    <AgentFace face={face} size={44} />
                    {settings && (
                      <button type="button" className={`ag-mate-edit${editFace?.key === a.key ? ' on' : ''}`} aria-label={`Change how the ${a.label} agent looks`} aria-expanded={editFace?.key === a.key}
                        onClick={e => openFace(a.key)?.(e.currentTarget)}><GearIcon /></button>
                    )}
                  </span>
                  <b>{a.label}</b>
                  <span className="ag-mate-state"><i />{a.on == null ? '…' : paused ? 'Paused' : a.on ? 'Working' : 'Off'}</span>
                  <span className="ag-mate-line" key={last?.id || 'role'}>
                    <span className="t">{last?.summary ? last.summary : meta?.role}</span>
                    {last && <span className="w">{when(last.created_at)}</span>}
                  </span>
                </div>
              )
            })}
          </div>
        </section>

        {/* What needs a person right now (Phase 10) */}
        <div id="ag-needs">{companyId && !needsMigration && <NeedsYouCard companyId={companyId} />}</div>

        {/* This week + earned-trust suggestions (Phase 9) */}
        {companyId && !needsMigration && <ResultsStrip companyId={companyId} onSettingsChanged={() => { loadSettings() }} />}

        {/* The agents, one card each: what it watches for, what it does, the rules it keeps. */}
        <AgentShowcase id="ag-support" name="Support Agent" face={faceOf('support')} state={agentState(supportOn)}
          onEditFace={openFace('support')} editing={editFace?.key === 'support'}
          tagline="Answers customers when they get in touch, and checks the facts before it says anything."
          watchTitle="Customers ask"
          watches={[
            { icon: 'box', t: '“Where’s my order?”', s: 'Finds their order and checks live tracking' },
            { icon: 'stock', t: '“Have you got it in stock?”', s: 'Checks stock at your stores' },
            { icon: 'clock', t: '“Are you open Sunday?”', s: 'Checks your opening hours' },
          ]}
          does={settings?.autoSend.enabled ? [
            { icon: 'send', t: 'Replies on its own', s: 'When the answer is one you allowed and it has just checked the facts' },
            { icon: 'hand', t: 'Anything else waits for your team', s: 'With a suggested reply in the conversation' },
          ] : [
            { icon: 'pen', t: 'Suggests a reply', s: 'Right in the conversation, with what it checked' },
            { icon: 'hand', t: 'Your team sends it', s: 'Nothing goes out until someone presses Send' },
          ]}
          rules={[{ icon: 'shield', t: 'Never guesses an order, price or date' }, { icon: 'hand', t: 'Upset customers go straight to your team' }]}
          toggle={<button type="button" role="switch" aria-checked={!!supportOn} aria-label="Support Agent on incoming messages" onClick={toggleSupport} disabled={supportOn == null || savingRole} className={`ag-switch ${supportOn ? 'on' : ''}`}><span /></button>}>
          {(supportOn || recOn) && settings?.channels && settings.channelOptions && (
            <ChannelPicker value={settings.channels} options={settings.channelOptions} saving={savingSettings} onSave={c => saveSettings({ channels: c })} />
          )}
          {supportOn && settings && <AutoSendPanel settings={settings} saving={savingSettings} onSave={a => saveSettings({ autoSend: a })} />}
        </AgentShowcase>

        <AgentShowcase id="ag-reception" name="Reception Agent" face={faceOf('reception')} state={agentState(recOn)}
          onEditFace={openFace('reception')} editing={editFace?.key === 'reception'}
          tagline="Books, finds and moves appointments by text or chat."
          watchTitle="Customers ask"
          watches={[
            { icon: 'calendar', t: '“Can I book…”', s: 'Checks your free times' },
            { icon: 'clock', t: '“What times do you have…”', s: 'Offers real free times' },
            { icon: 'move', t: '“Can I move my appointment…”', s: 'Finds the customer’s bookings' },
          ]}
          does={[
            { icon: 'link', t: 'Sends a booking or manage link', s: 'The customer picks the time themselves' },
            { icon: 'hand', t: 'Moving or cancelling waits for you', s: 'You approve every change to a booking' },
          ]}
          rules={[{ icon: 'chat', t: 'Everything else stays with the Support Agent' }, { icon: 'shield', t: 'Prices and deposits only from your service list' }]}
          toggle={<button type="button" role="switch" aria-checked={!!recOn} aria-label="Reception Agent for bookings" onClick={() => toggleRole('reception')} disabled={recOn == null || savingRole} className={`ag-switch ${recOn ? 'on' : ''}`}><span /></button>}>
          {recOn && settings?.receptionAuto && (
            <AutoSendPanel
              settings={{ ...settings, autoSend: settings.receptionAuto, topics: settings.topics.filter(t => ['booking', 'opening_hours', 'store_info'].includes(t.key)) }}
              saving={savingSettings}
              onSave={a => saveSettings({ receptionAuto: a })}
            />
          )}
        </AgentShowcase>

        <AgentShowcase id="ag-reputation" name="Reputation Agent" face={faceOf('reputation')} state={agentState(repOn)}
          onEditFace={openFace('reputation')} editing={editFace?.key === 'reputation'}
          tagline="Replies to your reviews and comments, in your voice."
          watchTitle="When someone posts"
          watches={[
            { icon: 'star', t: 'A new Google review', s: 'Five stars or one' },
            { icon: 'comment', t: 'A comment on Facebook or Instagram', s: settings?.commentAuto?.on ? 'On your posts' : 'Once you switch comments on below' },
            { icon: 'frown', t: 'An unhappy customer', s: 'A low rating or a complaint' },
          ]}
          does={[
            { icon: 'pen', t: 'Drafts a reply in your voice', s: 'Thanks them by name and mentions what they said' },
            { icon: 'task', t: 'A follow-up task for your team', s: 'When a customer is unhappy' },
            settings?.reviewAuto?.enabled
              ? { icon: 'send', t: `Posts ${settings.reviewAuto.min_rating === 5 ? '5' : '4 and 5'}-star replies on its own`, s: 'Everything else waits for you' }
              : { icon: 'hand', t: 'Every reply waits for you', s: 'Nothing is posted until you do' },
          ]}
          rules={[{ icon: 'shield', t: 'Never replaces a reply you already wrote' }, { icon: 'skip', t: 'Skips spam and abuse, and flags it' }]}
          toggle={<button type="button" role="switch" aria-checked={!!repOn} aria-label="Reputation Agent on reviews and comments" onClick={() => toggleRole('reputation')} disabled={repOn == null || savingRole} className={`ag-switch ${repOn ? 'on' : ''}`}><span /></button>}>
          {repOn && settings?.reviewAuto && <ReviewAutoPanel value={settings.reviewAuto} saving={savingSettings} onSave={v => saveSettings({ reviewAuto: v })} />}
          {repOn && settings?.commentAuto && <CommentPanel value={settings.commentAuto} saving={savingSettings} onSave={v => saveSettings({ commentAuto: v })} />}
        </AgentShowcase>

        <AgentShowcase id="ag-sales" name="Sales Agent" face={faceOf('sales')} state={agentState(salesOn)}
          onEditFace={openFace('sales')} editing={editFace?.key === 'sales'}
          tagline="Follows up carts, quotes and enquiries that went quiet. One helpful message, never pushy."
          watchTitle="It notices"
          watches={[
            { icon: 'cart', t: 'A cart left at checkout', s: 'Looks at what they picked and checks stock' },
            { icon: 'quote', t: 'Quotes and enquiries gone quiet', s: settings?.salesFollowup?.on ? `No reply for ${settings.salesFollowup.after_days} days` : 'Once you switch them on below' },
          ]}
          does={[
            { icon: 'chat', t: 'A short, personal follow-up', s: 'With their checkout link, by SMS (else email), within your sending hours' },
            settings?.salesAuto?.enabled
              ? { icon: 'send', t: 'Sends it on its own', s: 'Anything unusual waits for you' }
              : { icon: 'hand', t: 'Waits for you to send it', s: 'Send, edit or dismiss it' },
          ]}
          rules={[{ icon: 'tag', t: 'No discounts unless you approve them' }, { icon: 'skip', t: 'Colvy’s template cart message stands down, so nobody gets two' }]}
          toggle={<button type="button" role="switch" aria-checked={!!salesOn} aria-label="Sales Agent for carts, quotes and enquiries" onClick={() => toggleRole('sales')} disabled={salesOn == null || savingRole} className={`ag-switch ${salesOn ? 'on' : ''}`}><span /></button>}>
          {salesOn && settings?.salesAuto && <DailyAutoPanel value={settings.salesAuto} saving={savingSettings} onSave={v => saveSettings({ salesAuto: v })} copy={SALES_AUTO_COPY} />}
          {salesOn && settings?.salesFollowup && <FollowupPanel value={settings.salesFollowup} saving={savingSettings} onSave={v => saveSettings({ salesFollowup: v })} />}
        </AgentShowcase>

        <AgentShowcase id="ag-operations" name="Operations Agent" face={faceOf('operations')} state={agentState(opsOn)}
          onEditFace={openFace('operations')} editing={editFace?.key === 'operations'}
          tagline="Catches late, stuck and out-of-stock orders before the customer has to chase you."
          watchTitle="Every few hours it looks for"
          watches={[
            { icon: 'box', t: 'Orders not shipped yet', s: 'Later than your usual shipping time' },
            { icon: 'truck', t: 'Parcels that stopped moving', s: 'Checked against live tracking' },
            { icon: 'alert', t: 'Carrier problems', s: 'Anything the carrier has flagged' },
            { icon: 'stock', t: 'Orders waiting on stock', s: 'An item that’s out of stock' },
          ]}
          does={[
            { icon: 'task', t: 'A task for your team', s: 'With the facts and a next step' },
            settings?.opsAuto?.enabled
              ? { icon: 'send', t: 'An honest update for the customer', s: 'Sent on its own; anything unusual waits for you' }
              : { icon: 'pen', t: 'An honest update for the customer', s: 'Written for you; it waits for you to send it' },
          ]}
          rules={[{ icon: 'skip', t: 'Leaves orders that already have a task' }, { icon: 'shield', t: 'Never promises refunds or dates it hasn’t confirmed' }]}
          toggle={<button type="button" role="switch" aria-checked={!!opsOn} aria-label="Operations Agent for late and stuck orders" onClick={() => toggleRole('operations')} disabled={opsOn == null || savingRole} className={`ag-switch ${opsOn ? 'on' : ''}`}><span /></button>}>
          {opsOn && settings?.opsAuto && <DailyAutoPanel value={settings.opsAuto} saving={savingSettings} onSave={v => saveSettings({ opsAuto: v })} copy={OPS_AUTO_COPY} />}
        </AgentShowcase>

        {editFace && (
          <FacePicker key={editFace.key} name={`${navAgents.find(a => a.key === editFace.key)?.label || ''} agent`} face={faceOf(editFace.key)} anchor={editFace.el} companyId={companyId}
            onChange={f => changeFace(editFace.key, f)} onReset={() => changeFace(editFace.key, null)} onClose={closeFace} />
        )}

        {waiting.length > 0 && companyId && (
          <div className="ag-card ag-fade ag-wait" style={{ marginBottom: 16 }}>
            <p className="ag-h">Waiting for you <span className="ag-count">{waiting.length}</span></p>
            <p className="ag-p">What your agents prepared — replies to customers and Google reviews, booking changes, cart follow-ups and order updates. Send, edit or dismiss them here. They expire after 24 hours.</p>
            <ul className="ag-wait-list">
              {waiting.map(a => (
                <li key={a.id}>
                  {a.action_key === 'reply_to_comment' ? (
                    <div className="ag-wait-head">
                      <span className="ag-wait-who">{a.run?.input?.author || 'A follower'}</span>
                      <span className="ag-run-s" style={{ marginTop: 0 }}>{a.run?.input?.platform === 'instagram' ? 'Instagram' : 'Facebook'} comment · {when(a.created_at)}</span>
                      <a className="ag-link" href="/admin/social">{I.inbox} Open comments</a>
                    </div>
                  ) : a.action_key === 'reply_to_review' ? (
                    <div className="ag-wait-head">
                      <span className="ag-wait-who">{a.run?.input?.reviewer || 'A customer'}</span>
                      <span className="ag-run-s" style={{ marginTop: 0 }}>{a.run?.input?.rating ? `${a.run.input.rating}★ ` : ''}Google review · {when(a.created_at)}</span>
                      <a className="ag-link" href="/admin/reviews">{I.inbox} Open reviews</a>
                    </div>
                  ) : a.action_key === 'send_sales_followup' ? (
                    <div className="ag-wait-head">
                      <span className="ag-wait-who">{a.conversation?.customer || 'Customer'}</span>
                      <span className="ag-run-s" style={{ marginTop: 0 }}>{a.run?.input?.kind === 'lead' ? 'Enquiry follow-up' : 'Quote follow-up'} · {when(a.created_at)}</span>
                      {a.conversation?.id && <a className="ag-link" href={`/admin/inbox?conversation=${a.conversation.id}`}>{I.inbox} Open conversation</a>}
                    </div>
                  ) : a.action_key === 'send_order_update' ? (
                    <div className="ag-wait-head">
                      <span className="ag-wait-who">{a.conversation?.customer || 'Customer'}</span>
                      <span className="ag-run-s" style={{ marginTop: 0 }}>Order #{a.run?.input?.orderNumber || '—'} · {when(a.created_at)}</span>
                      {a.conversation?.id ? <a className="ag-link" href={`/admin/inbox?conversation=${a.conversation.id}`}>{I.inbox} Open conversation</a> : <a className="ag-link" href="/admin/orders">{I.inbox} Open orders</a>}
                    </div>
                  ) : a.action_key === 'send_cart_followup' ? (
                    <div className="ag-wait-head">
                      <span className="ag-wait-who">{a.run?.input?.name || a.conversation?.customer || 'A shopper'}</span>
                      <span className="ag-run-s" style={{ marginTop: 0 }}>Abandoned cart · {when(a.created_at)}</span>
                      {a.conversation?.id && <a className="ag-link" href={`/admin/inbox?conversation=${a.conversation.id}`}>{I.inbox} Open conversation</a>}
                    </div>
                  ) : (
                    <div className="ag-wait-head">
                      <span className="ag-wait-who">{a.conversation?.customer || 'Customer'}</span>
                      <span className="ag-run-s" style={{ marginTop: 0 }}>{CHANNEL[a.conversation?.channel || ''] || a.conversation?.channel || 'Conversation'} · {when(a.created_at)}</span>
                      {a.conversation?.id && <a className="ag-link" href={`/admin/inbox?conversation=${a.conversation.id}`}>{I.inbox} Open conversation</a>}
                    </div>
                  )}
                  <SuggestionCard s={a} companyId={companyId} onDone={() => { setWaiting(w => w.filter(x => x.id !== a.id)); setTimeout(() => { loadWaiting(); loadSettings(); loadRuns() }, 800) }} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Outside tools (MCP connections) */}
        <div id="ag-tools">{companyId && !needsMigration && <AgentConnections companyId={companyId} />}</div>

        {/* Try it */}
        <div id="ag-try" className="ag-card ag-fade" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <AiBuddy size={44} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <p className="ag-h">Try an agent</p>
              <p className="ag-p">Sandbox — it reads your real data, but nothing is sent, posted or changed. Anything it would do is recorded as a suggestion.</p>
            </div>
          </div>
          <div className="ag-seg-scroll" style={{ marginTop: 14 }}>
            <div className="ag-seg five" role="radiogroup" aria-label="Which agent">
              {TRY_ROLES.map(t => (
                <button key={t.key} type="button" role="radio" aria-checked={tryRole === t.key} className={tryRole === t.key ? 'on' : ''} onClick={() => { setTryRole(t.key); setMessage(t.sample) }}>{t.label}</button>
              ))}
              <span className="ag-seg-pill five" style={{ transform: `translateX(${TRY_ROLES.findIndex(t => t.key === tryRole) * 100}%)` }} />
            </div>
          </div>
          <div className="ag-try">
            <div style={{ minWidth: 0 }}>
              <label className="ag-label" htmlFor="ag-msg">{tryRole === 'reputation' ? 'Review' : tryRole === 'sales' ? 'What’s in the cart (one per line)' : tryRole === 'operations' ? 'Order number to check' : 'Customer message'}</label>
              <textarea id="ag-msg" className="ag-input" rows={2} value={message} onChange={e => setMessage(e.target.value)} placeholder={tryRole === 'reputation' ? 'e.g. Fish arrived dead and nobody called me back.' : tryRole === 'sales' ? 'e.g. Lemon Oscar' : tryRole === 'operations' ? 'e.g. 124424' : 'e.g. Where is my order?'} />
            </div>
            {tryRole === 'sales' || tryRole === 'operations' ? (
              <p className="ag-step-dec" style={{ margin: 0, alignSelf: 'center' }}>{tryRole === 'sales' ? 'As if a shopper called Sam left these an hour ago.' : 'One of your real orders, as if Colvy had flagged it. Nothing is sent or created.'}</p>
            ) : tryRole !== 'reputation' ? (
              <div style={{ minWidth: 0 }}>
                <label className="ag-label" htmlFor="ag-conv">As if it came in on (optional)</label>
                <ConversationPicker id="ag-conv" value={convId} convs={convs} onChange={setConvId} />
              </div>
            ) : (
              <div style={{ minWidth: 0 }}>
                <label className="ag-label" htmlFor="ag-stars">Stars</label>
                <select id="ag-stars" className="ag-input" value={tryRating} onChange={e => setTryRating(Number(e.target.value))}>
                  {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} star{n === 1 ? '' : 's'}</option>)}
                </select>
              </div>
            )}
            <button type="button" className="ag-primary" onClick={tryIt} disabled={busy || !message.trim() || !companyId}>
              {busy ? <><span className="ag-spin" /> Starting…</> : <>{I.play} Run</>}
            </button>
          </div>
        </div>

        <div id="ag-activity" className="ag-grid">
          {/* Runs */}
          <div className="ag-card" style={{ padding: 0, overflow: 'hidden' }}>
            <p className="ag-label" style={{ padding: '16px 16px 6px', margin: 0 }}>Activity</p>
            <div className="ag-who" role="tablist" aria-label="Who did it">
              {WHO.map(w => <button key={w.key} type="button" role="tab" aria-selected={who === w.key} className={who === w.key ? 'on' : ''} onClick={() => setWho(w.key)}>{w.label}</button>)}
            </div>
            {!loaded && <p className="ag-p" style={{ padding: '8px 16px 18px' }}>Loading…</p>}
            {loaded && runs.length === 0 && <p className="ag-p" style={{ padding: '8px 16px 18px' }}>{who ? 'Nothing here yet.' : 'No activity yet. Try an agent above.'}</p>}
            <ul className="ag-runs">
              {runs.map(r => {
                const st = STATUS[r.status] || { label: r.status, tone: 'muted' }
                return (
                  <li key={r.id}>
                    <button type="button" className={`ag-run ${selected === r.id ? 'on' : ''}`} onClick={() => pick(r.id)}>
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
      {/* …and Colvy AI at a glance on the right. */}
      <aside className="ag-side" aria-label="Colvy AI at a glance">
        <div className="ag-rail-card ag-me">
          <div className="ag-me-face"><AiBuddy size={76} shadow /></div>
          <p className="ag-me-name">Colvy AI</p>
          <p className={`ag-me-state${paused ? ' paused' : onCount ? '' : ' off'}`}><span className="dot" />{paused ? 'All agents are paused' : onCount ? `${onCount} of ${navAgents.length} agents on` : 'No agents on yet'}</p>
          {settings && !paused && <button type="button" className="ag-kill" onClick={pauseAll} disabled={savingSettings} style={{ width: '100%', justifyContent: 'center' }}>{I.pause} Pause all agents</button>}
          {settings && paused && !settings.pause.platform && <button type="button" className="ag-primary small" onClick={() => saveSettings({ paused: false })} disabled={savingSettings} style={{ width: '100%' }}>{savingSettings ? 'Resuming…' : 'Resume agents'}</button>}
          {settings && (
            <div className="ag-me-stats">
              <div><b>{settings.sentToday ?? 0}</b><span>Sent on its own today</span></div>
              <div><b>{settings.waiting ?? 0}</b><span>Waiting for you</span></div>
            </div>
          )}
        </div>
        <div className="ag-rail-card">
          <div className="ag-rail-h"><span>Latest activity</span>{runs.length > 0 && <a href="#ag-activity">See all</a>}</div>
          {loaded && runs.length === 0 && <p className="ag-p" style={{ margin: '0 6px 6px', fontSize: 13 }}>Nothing yet. Try an agent to watch it work.</p>}
          {runs.slice(0, 4).map(r => {
            const st = STATUS[r.status] || { label: r.status, tone: 'muted' }
            return (
              <button key={r.id} type="button" className="ag-mini-run" onClick={() => { pick(r.id); document.getElementById('ag-activity')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="t">{String(r.input?.message || r.summary || r.input?.tool || r.trigger_type).slice(0, 60)}</span>
                  <span className="s">{actorOf(r)} · {when(r.created_at)}</span>
                </span>
                <span className={`ag-chip ${st.tone}`}>{st.label}</span>
              </button>
            )
          })}
        </div>
        <div className="ag-rail-card ag-know">
          <div className="ag-rail-h"><span>What it knows</span></div>
          <a href="/admin/agents/memory"><span className="ag-know-ic" style={{ ['--t' as any]: '#8b5cf6' }}>{I.brain}</span><span><b>Business memory</b><small>Your tone and the rules it follows</small></span></a>
          <a href="/admin/crm-settings/ai-knowledge"><span className="ag-know-ic" style={{ ['--t' as any]: '#3b82f6' }}>{I.layers}</span><span><b>AI knowledge</b><small>Articles, website pages and files</small></span></a>
          <a href="/admin/help"><span className="ag-know-ic" style={{ ['--t' as any]: '#22c55e' }}>{I.inbox}</span><span><b>Help centre</b><small>Answers customers can read too</small></span></a>
        </div>
      </aside>
      </div>
    </div>
  )
}

function ReviewAutoPanel({ value, saving, onSave }: { value: ReviewAuto; saving: boolean; onSave: (v: ReviewAuto) => Promise<boolean> }) {
  const [d, setD] = useState<ReviewAuto>(value)
  const dirty = JSON.stringify(d) !== JSON.stringify(value)
  useEffect(() => { if (!dirty) setD(value) }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    if (d.enabled && !value.enabled) {
      const ok = await confirmDialog({
        title: 'Let the Reputation Agent post replies on its own?',
        message: `It will post public replies to ${d.min_rating === 5 ? '5-star' : '4- and 5-star'} reviews without waiting, up to ${d.max_per_day} a day — never if the reply mentions anything private. Lower ratings always wait for you. You can pause it any time.`,
        confirmLabel: 'Turn on', tone: 'primary',
      })
      if (!ok) return
    }
    await onSave(d)
  }
  return (
    <div className="ag-auto">
      <p className="ag-label" style={{ marginTop: 0 }}>How it replies</p>
      <div className="ag-seg" role="radiogroup" aria-label="How it replies to reviews">
        <button type="button" role="radio" aria-checked={!d.enabled} className={!d.enabled ? 'on' : ''} onClick={() => setD({ ...d, enabled: false })}>Draft for me</button>
        <button type="button" role="radio" aria-checked={d.enabled} className={d.enabled ? 'on' : ''} onClick={() => setD({ ...d, enabled: true })}>Post good ones</button>
        <span className="ag-seg-pill" style={{ transform: d.enabled ? 'translateX(100%)' : 'none' }} />
      </div>
      <div className={`ag-auto-body ${d.enabled ? 'open' : ''}`} aria-hidden={!d.enabled}>
        <div style={{ overflow: 'hidden' }}>
          <div className="ag-limits">
            <label className="ag-limit">
              <span>Post on its own for</span>
              <select className="ag-input" value={d.min_rating} onChange={e => setD({ ...d, min_rating: Number(e.target.value) })} tabIndex={d.enabled ? 0 : -1}>
                <option value={4}>4 and 5 star reviews</option>
                <option value={5}>5 star reviews only</option>
              </select>
            </label>
            <div className="ag-limit ag-limit-slide">
              <TickSlider label="Most a day" min={1} max={200} value={d.max_per_day} onChange={n => setD({ ...d, max_per_day: n })} tabIndex={d.enabled ? 0 : -1} />
            </div>
          </div>
          <p className="ag-step-dec" style={{ marginTop: 10 }}>Replies that mention an order number, phone, email or address always wait for you, and so does anything it hands to your team.</p>
        </div>
      </div>
      {dirty && (
        <div className="ag-auto-foot" style={{ justifyContent: 'flex-end' }}>
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="ag-ghost" onClick={() => setD(value)} disabled={saving}>Cancel</button>
            <button type="button" className="ag-primary small" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </span>
        </div>
      )}
    </div>
  )
}

type DailyAutoCopy = { label: string; aria: string; perDay: string; note: string; confirmTitle: string; confirm: (n: number) => string }
const SALES_AUTO_COPY: DailyAutoCopy = {
  label: 'How it follows up', aria: 'How it follows up carts', perDay: 'Most follow-ups a day',
  note: 'Each shopper gets one follow-up per cart. Anything that mentions a discount or coupon always waits for you, and so does a cart they’ve since bought or opted out of.',
  confirmTitle: 'Let the Sales Agent send follow-ups on its own?',
  confirm: n => `It will text or email shoppers about the cart they left, without waiting, up to ${n} a day and only within your sending hours. Follow-ups that offer a discount, or for carts it’s unsure about, still wait for you. Shoppers can reply STOP. You can pause it any time.`,
}
const OPS_AUTO_COPY: DailyAutoCopy = {
  label: 'Customer updates', aria: 'How it updates customers', perDay: 'Most updates a day',
  note: 'An update only goes out on its own after it has checked live tracking or stock in that run, and within your sending hours. Anything that mentions a refund, discount or credit waits for you, and so does an order it hands to your team. Tasks for your team are always created straight away.',
  confirmTitle: 'Let the Operations Agent update customers on its own?',
  confirm: n => `When an order is late, stuck or waiting on stock, it will text or email the customer a short, honest update without waiting — up to ${n} a day, only within your sending hours, and never about refunds or money. Orders it hands to your team still wait for you. You can pause it any time.`,
}

// Where Support and Reception answer. Saved straight away; turning on email,
// Meta or WhatsApp asks first, since it puts the agents in front of more customers.
function ChannelPicker({ value, options, saving, onSave }: { value: string[]; options: { key: string; label: string }[]; saving: boolean; onSave: (v: string[]) => Promise<boolean> }) {
  const toggle = async (k: string) => {
    const on = value.includes(k)
    if (!on && ['email', 'facebook', 'instagram', 'whatsapp'].includes(k)) {
      const name = options.find(o => o.key === k)?.label || k
      const ok = await confirmDialog({
        title: `Answer ${name === 'Email' ? 'emails' : `${name} messages`} too?`,
        message: `New ${name === 'Email' ? 'emails' : `${name} messages`} will go to the Support Agent (or Reception for bookings), just like texts and chat — with the same rules for what waits for your team.${k === 'email' ? ' Newsletters, notifications and support-ticket replies are left alone.' : k === 'whatsapp' ? ' WhatsApp only allows replies within 24 hours of the customer’s message; after that a person sends an approved template.' : ' Meta only allows automatic replies within 24 hours of the customer’s message; later ones always wait for a person.'}`,
        confirmLabel: 'Turn on', tone: 'primary',
      })
      if (!ok) return
    }
    await onSave(on ? value.filter(x => x !== k) : [...value, k])
  }
  return (
    <div className="ag-auto">
      <p className="ag-label" style={{ marginTop: 0 }}>Channels Support and Reception answer</p>
      <div className="ag-topics" role="group" aria-label="Channels the agents answer">
        {options.map(o => {
          const on = value.includes(o.key)
          return (
            <button key={o.key} type="button" role="checkbox" aria-checked={on} className={`ag-topic ${on ? 'on' : ''}`} onClick={() => toggle(o.key)} disabled={saving}>
              <span className="ag-tick">{on && I.check}</span>{o.label}
            </button>
          )
        })}
      </div>
      {!value.length && <p className="ag-step-dec" style={{ marginTop: 8 }}>No channels on — the agents won’t see new messages.</p>}
    </div>
  )
}

const COMMENT_AUTO_COPY: DailyAutoCopy = {
  label: 'How it replies to comments', aria: 'How it replies to comments', perDay: 'Most replies a day',
  note: 'Only friendly comments get a reply on its own. Questions, complaints, anything Colvy flags as sensitive, and replies that mention an order number, phone, email or address always wait for you.',
  confirmTitle: 'Let the Reputation Agent reply to comments on its own?',
  confirm: n => `It will post public replies to friendly Facebook and Instagram comments without waiting, up to ${n} a day. Questions, complaints and anything sensitive still wait for you. You can pause it any time.`,
}

const FOLLOWUP_AUTO_COPY: DailyAutoCopy = {
  label: 'How it follows up quotes and enquiries', aria: 'How it follows up quotes and enquiries', perDay: 'Most follow-ups a day',
  note: 'One follow-up per quote or enquiry, and never more than one a month per customer. Anything that offers a discount, a quote that’s been paid, or a customer who has replied or ordered since always waits for you or is skipped.',
  confirmTitle: 'Let the Sales Agent follow up quotes and enquiries on its own?',
  confirm: n => `It will message customers whose quote, payment request or product question went quiet, without waiting — up to ${n} a day and only within your sending hours. Messages that offer a discount still wait for you. You can pause it any time.`,
}

// Quotes and leads: switched on separately from abandoned carts.
function FollowupPanel({ value, saving, onSave }: { value: SalesFollowup; saving: boolean; onSave: (v: SalesFollowup) => Promise<boolean> }) {
  const auto = useMemo(() => ({ enabled: value.enabled, max_per_day: value.max_per_day }), [value.enabled, value.max_per_day])
  const toggle = async () => {
    if (!value.on) {
      const ok = await confirmDialog({
        title: 'Follow up quotes and enquiries too?',
        message: `When a quote, payment request or product question goes quiet for ${value.after_days} days, the Sales Agent writes the customer one friendly follow-up — you send it from the inbox or here. Paid quotes and customers who replied or ordered since are skipped.`,
        confirmLabel: 'Turn on', tone: 'primary',
      })
      if (!ok) return
    }
    await onSave({ ...value, on: !value.on, enabled: value.on ? false : value.enabled })
  }
  return (
    <>
      <div className="ag-verified" style={{ marginTop: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div className="ag-step-t" style={{ fontSize: 13.5 }}>Quotes and enquiries</div>
          <div className="ag-step-dec" style={{ marginTop: 1 }}>{value.on ? `Follows up quotes, payment requests and product questions that go quiet for ${value.after_days} days.` : 'Off — only abandoned carts get a follow-up.'}</div>
        </div>
        <button type="button" role="switch" aria-checked={value.on} aria-label="Follow up quotes and enquiries" className={`ag-switch ${value.on ? 'on' : ''}`} onClick={toggle} disabled={saving}><span /></button>
      </div>
      {value.on && (
        <>
          <div className="ag-limits" style={{ marginTop: 12 }}>
            <label className="ag-limit">
              <span>Follow up after</span>
              <select className="ag-input" value={value.after_days} onChange={e => onSave({ ...value, after_days: Number(e.target.value) })} disabled={saving}>
                {[2, 3, 5, 7].map(n => <option key={n} value={n}>{n} quiet days</option>)}
              </select>
            </label>
          </div>
          <DailyAutoPanel value={auto} saving={saving} onSave={v => onSave({ ...value, ...v, on: true })} copy={FOLLOWUP_AUTO_COPY} />
        </>
      )}
    </>
  )
}

// Facebook / Instagram comments: switched on separately from reviews.
function CommentPanel({ value, saving, onSave }: { value: CommentAuto; saving: boolean; onSave: (v: CommentAuto) => Promise<boolean> }) {
  // A stable object, or DailyAutoPanel's "follow the server" effect would loop.
  const auto = useMemo(() => ({ enabled: value.enabled, max_per_day: value.max_per_day }), [value.enabled, value.max_per_day])
  const toggle = async () => {
    if (!value.on) {
      const ok = await confirmDialog({
        title: 'Reply to Facebook and Instagram comments too?',
        message: 'New comments on your posts will go to the Reputation Agent, which drafts a reply in your voice — you post it from here or from Social. Spam, abuse and complaints go to your team instead.',
        confirmLabel: 'Turn on', tone: 'primary',
      })
      if (!ok) return
    }
    await onSave({ ...value, on: !value.on, enabled: value.on ? false : value.enabled })
  }
  return (
    <>
      <div className="ag-verified" style={{ marginTop: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div className="ag-step-t" style={{ fontSize: 13.5 }}>Facebook and Instagram comments</div>
          <div className="ag-step-dec" style={{ marginTop: 1 }}>{value.on ? 'New comments on your posts get a drafted reply.' : 'Off — comments stay in Social for your team.'}</div>
        </div>
        <button type="button" role="switch" aria-checked={value.on} aria-label="Reply to Facebook and Instagram comments" className={`ag-switch ${value.on ? 'on' : ''}`} onClick={toggle} disabled={saving}><span /></button>
      </div>
      {value.on && <DailyAutoPanel value={auto} saving={saving} onSave={v => onSave({ on: true, ...v })} copy={COMMENT_AUTO_COPY} onLabel="Post friendly ones" />}
    </>
  )
}

function DailyAutoPanel({ value, saving, onSave, copy, onLabel = 'Send on its own' }: { value: DailyAuto; saving: boolean; onSave: (v: DailyAuto) => Promise<boolean>; copy: DailyAutoCopy; onLabel?: string }) {
  const [d, setD] = useState<DailyAuto>(value)
  const dirty = JSON.stringify(d) !== JSON.stringify(value)
  useEffect(() => { if (!dirty) setD(value) }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    if (d.enabled && !value.enabled) {
      const ok = await confirmDialog({ title: copy.confirmTitle, message: copy.confirm(d.max_per_day), confirmLabel: 'Turn on', tone: 'primary' })
      if (!ok) return
    }
    await onSave(d)
  }
  return (
    <div className="ag-auto">
      <p className="ag-label" style={{ marginTop: 0 }}>{copy.label}</p>
      <div className="ag-seg" role="radiogroup" aria-label={copy.aria}>
        <button type="button" role="radio" aria-checked={!d.enabled} className={!d.enabled ? 'on' : ''} onClick={() => setD({ ...d, enabled: false })}>Draft for me</button>
        <button type="button" role="radio" aria-checked={d.enabled} className={d.enabled ? 'on' : ''} onClick={() => setD({ ...d, enabled: true })}>{onLabel}</button>
        <span className="ag-seg-pill" style={{ transform: d.enabled ? 'translateX(100%)' : 'none' }} />
      </div>
      <div className={`ag-auto-body ${d.enabled ? 'open' : ''}`} aria-hidden={!d.enabled}>
        <div style={{ overflow: 'hidden' }}>
          <div className="ag-limits">
            <div className="ag-limit ag-limit-slide">
              <TickSlider label={copy.perDay} min={1} max={500} value={d.max_per_day} onChange={n => setD({ ...d, max_per_day: n })} tabIndex={d.enabled ? 0 : -1} />
            </div>
          </div>
          <p className="ag-step-dec" style={{ marginTop: 10 }}>{copy.note}</p>
        </div>
      </div>
      {dirty && (
        <div className="ag-auto-foot" style={{ justifyContent: 'flex-end' }}>
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="ag-ghost" onClick={() => setD(value)} disabled={saving}>Cancel</button>
            <button type="button" className="ag-primary small" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </span>
        </div>
      )}
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
            <div className="ag-limit ag-limit-slide">
              <TickSlider label="Most replies on its own a day" min={1} max={500} value={draft.max_per_day} onChange={n => set({ max_per_day: n })} tabIndex={draft.enabled ? 0 : -1} />
            </div>
            <div className="ag-limit ag-limit-slide">
              <TickSlider label="Most per conversation an hour" min={1} max={10} ticks={28} value={draft.max_per_conversation_per_hour} onChange={n => set({ max_per_conversation_per_hour: n })} tabIndex={draft.enabled ? 0 : -1} />
            </div>
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

      {(approvals || []).filter(a => a.status === 'pending' && (WAITING_ACTIONS.includes(a.action_key) || String(a.action_key || '').startsWith('x_'))).map(a => (
        <div key={a.id} style={{ marginTop: 14 }}>
          <SuggestionCard s={{ ...a, run_id: run.id, run: { role_key: run.role_key } } as Suggestion} companyId={companyId} compact onDone={onDecided} />
        </div>
      ))}
      {(approvals || []).filter(a => a.status !== 'pending').map(a => (
        <p key={a.id} className="ag-step-dec" style={{ marginTop: 10 }}>
          Suggested reply {a.status === 'executed' ? 'sent by the team' : a.status === 'edited' ? 'edited and sent by the team' : a.status === 'rejected' ? 'dismissed by the team' : a.status === 'expired' ? (a.result?.superseded ? 'replaced by a newer suggestion' : 'expired — nobody sent it within 24 hours') : a.status}.
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
      {/* Older runs kept the provider's raw error (JSON and all): show it in words. */}
      {run.error && <div className="ag-note err" style={{ marginTop: 12 }}>{I.alert}<span>{friendlyRunError(run.error)}</span></div>}
    </div>
  )
}

function StepRow({ s }: { s: Step }) {
  const [open, setOpen] = useState(false)
  const dec = s.kind === 'action' && SENT_ACTIONS.includes(s.action_key || '') && s.decision === 'allowed' && s.status === 'ok'
    ? { label: 'Sent on its own', tone: 'ok' }
    : s.decision ? DECISION[s.decision] : null
  const title = useMemo(() => {
    if (s.kind === 'model') return 'Thought it through'
    if (s.kind === 'finish') return `Finished${s.input?.outcome ? ` — ${OUTCOME[s.input.outcome] || s.input.outcome}` : ''}`
    if (s.kind === 'error') return 'Stopped'
    if (s.kind === 'approval') return s.decision === 'denied' ? 'Team dismissed the suggestion' : ['reply_to_review', 'reply_to_comment'].includes(s.action_key || '') ? 'Team approved and posted it' : s.action_key === 'reschedule_booking' || s.action_key === 'cancel_booking' ? 'Team approved the booking change' : s.action_key === 'add_to_waitlist' ? 'Team approved the waiting-list add' : 'Team approved and sent it'
    // Outside tools (x_…) have no label of their own; one left out says so.
    if (String(s.action_key || '').startsWith('x_') && !ACTION_LABEL[s.action_key || '']) return s.status === 'skipped' && /^Left out /.test(s.decision_reason || '') ? 'Outside tool left out' : 'Outside tool'
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
        {s.kind === 'error' && (s.output?.error || s.decision_reason) && <p className="ag-step-dec">{friendlyRunError(String(s.output?.error || s.decision_reason))}</p>}
        {s.kind === 'action' && SENT_ACTIONS.includes(s.action_key || '') && s.input?.text && <p className="ag-bubble">{String(s.input.text)}</p>}
        {s.action_key === 'add_to_waitlist' && s.entity_type === 'waitlist' && s.entity_id && <p className="ag-step-dec"><a href={waitlistEntryHref(s.entity_id)}>See it on Waitlists</a></p>}
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
.ag-card:has(.cp-pop){position:relative;z-index:30}
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
.ag-seg.three{grid-template-columns:1fr 1fr 1fr}
.ag-seg-pill.three{width:calc(33.333% - 2px)}
.ag-seg-scroll{max-width:100%;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.ag-seg-scroll::-webkit-scrollbar{display:none}
.ag-seg.five{grid-template-columns:repeat(5,1fr);width:max-content;max-width:none}
.ag-seg-pill.five{width:calc(20% - 1.2px)}
@media (max-width:420px){.ag-seg.five button{padding:8px 12px;font-size:13px}}
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
.ag-limit-slide{grid-column:1 / -1;padding:14px 16px 12px;border-radius:16px;background:#fafafa;font-weight:400}
.ag-verified{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;padding:11px 13px;border-radius:13px;border:1px solid var(--border)}
.ag-auto-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:14px}
.ag-count{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;margin-left:8px;border-radius:999px;background:var(--coral);color:#fff;font-size:11.5px;font-weight:800}
.ag-wait-list{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:14px}
.ag-wait-list li{animation:agFade .45s ${EASE} both}
.ag-wait-head{display:flex;align-items:center;gap:6px 10px;flex-wrap:wrap;margin-bottom:8px}
.ag-wait-who{font-size:14px;font-weight:700;color:var(--ink)}
.ag-link{display:inline-flex;align-items:center;gap:5px;margin-left:auto;font-size:12.5px;font-weight:700;color:var(--coral);text-decoration:none}
.ag-wait .agsg{max-width:none;margin-left:0}
/* The soft card-and-pill look shared with the rest of the admin. */
.ag-page{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.ag-page button::before{display:none}
@media (min-width:900px){.ag-page{padding-left:28px!important;padding-right:28px!important}}
.ag-card{border-color:transparent;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04)}
.ag-h{font-size:16px}
.ag-p{color:#71717a}
.ag-label{font-size:12.5px;font-weight:600;letter-spacing:0;text-transform:none;color:#71717a}
.ag-input{border:1.5px solid transparent;background:#f4f4f5}
.ag-input:focus{background:#fff;border-color:#d4d4d8!important}
.ag-primary{border-radius:999px;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 1px 2px rgba(16,24,40,.12)}
.ag-ghost{border:none;border-radius:999px;background:#f4f4f5;font-weight:600;transition:background-color .15s}
.ag-ghost:hover:not(:disabled){background:#ececef}
.ag-kill{border:none;border-radius:999px;background:#fef2f2;font-weight:600}
.ag-kill:hover:not(:disabled){background:#fee2e2}
.ag-seg{border-radius:999px;background:#f4f4f5}
.ag-seg button{border-radius:999px;font-weight:600;color:#71717a}
.ag-seg button.on{color:#18181b}
.ag-seg-pill{border-radius:999px}
.ag-who button{border:none;background:#f4f4f5;color:#3f3f46;font-weight:600}
.ag-who button.on{background:#18181b;color:#fff}
.ag-topic{border-color:transparent;background:#f4f4f5;border-radius:999px}
.ag-topic.on{border-color:color-mix(in srgb,var(--coral) 40%,transparent);background:color-mix(in srgb,var(--coral) 8%,#fff)}
.ag-tick{border-radius:50%;border-color:#d4d4d8;background:#fff}
.ag-ref{border:none;background:#f4f4f5}
.ag-verified{border:none;background:#fafafa}
.ag-auto{border-top-color:#f0f0f2}
.ag-run.on{background:#f4f4f5}
.ag-chip{font-weight:600}
.ag-step-ic{border-radius:50%}
.ag-note.warn{border:none;box-shadow:0 0 0 1px #fde68a}
.ag-note.err{border:none;box-shadow:0 0 0 1px #fecdca}
.ag-paused{border:none;box-shadow:0 0 0 1px #fecdca}
.ag-paused-ic{border:none;border-radius:50%}
.ag-switch.on{background:#34c759}
/* Wide screens: a section menu on the left and Colvy AI at a glance on the right. */
.admin-main:has(.ag-shell){overflow-x:clip!important;overflow-y:visible!important;min-width:0}
.ag-nav,.ag-side{display:none}
.ag-shell [id^="ag-"]{scroll-margin-top:84px}
.ag-rail-card{background:#fff;border-radius:20px;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04);padding:12px}
.ag-rail-card + .ag-rail-card{margin-top:12px}
.ag-nav-title{margin:4px 10px 10px;font-size:17px;font-weight:700;color:var(--ink)}
.ag-nav-group{margin:16px 10px 4px;font-size:12.5px;font-weight:600;color:#8e8e93}
.ag-nav a{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:12px;font-size:14px;font-weight:500;color:#3f3f46;text-decoration:none;transition:background-color .15s,color .15s}
.ag-nav a:hover{background:#f4f4f5;color:#18181b}
.ag-nav a.on{background:#f4f4f5;color:#18181b;font-weight:600}
.ag-nav a svg{flex-shrink:0;width:15px;height:15px;color:#8e8e93}
.ag-nav a.on svg{color:var(--coral)}
.ag-nav-face{display:inline-flex;flex-shrink:0;margin:-2px -2px -2px -3px}
.ag-nav a .ag-nav-face svg{width:20px;height:20px;color:inherit}
.ag-nav-state{margin-left:auto;font-size:12px;font-weight:500;color:#a1a1aa}
.ag-nav-state.on{color:#16a34a;font-weight:600}
.ag-nav-state.paused{color:#b45309}
.ag-me{padding:22px 16px 16px;text-align:center;background:radial-gradient(120% 70% at 50% 0%,color-mix(in srgb,var(--coral) 9%,#fff),#fff 70%)}
.ag-me-face{display:flex;justify-content:center;margin-bottom:12px}
.ag-me-name{margin:0;font-size:18px;font-weight:800;letter-spacing:-.01em;color:var(--ink)}
.ag-me-state{display:inline-flex;align-items:center;gap:7px;margin:6px 0 16px;font-size:13.5px;color:#71717a}
.ag-me-state .dot{width:8px;height:8px;border-radius:50%;background:#34c759}
.ag-me-state.paused .dot{background:#f59e0b}.ag-me-state.off .dot{background:#d4d4d8}
.ag-me .ag-kill{height:38px}
.ag-me-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;text-align:left}
.ag-me-stats div{padding:10px 12px;border-radius:14px;background:#fafafa;box-shadow:0 0 0 1px rgba(0,0,0,.04)}
.ag-me-stats b{display:block;font-size:20px;font-weight:800;color:var(--ink);font-variant-numeric:tabular-nums}
.ag-me-stats span{display:block;margin-top:1px;font-size:12px;line-height:1.3;color:#8e8e93}
.ag-rail-h{display:flex;align-items:center;justify-content:space-between;margin:4px 8px 6px;font-size:14.5px;font-weight:700;color:var(--ink)}
.ag-rail-h a{font-size:13px;font-weight:600;color:#71717a;text-decoration:none}
.ag-rail-h a:hover{color:var(--ink)}
.ag-mini-run{width:100%;display:flex;align-items:center;gap:8px;padding:9px 8px;border:none;background:none;border-radius:12px;text-align:left;cursor:pointer;font-family:inherit;transition:background-color .15s}
.ag-mini-run:hover{background:#f4f4f5}
.ag-mini-run .t{display:block;font-size:13.5px;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ag-mini-run .s{display:block;margin-top:1px;font-size:12px;color:#8e8e93;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ag-know a{display:flex;align-items:center;gap:11px;padding:9px 8px;border-radius:12px;text-decoration:none;transition:background-color .15s}
.ag-know a:hover{background:#f4f4f5}
.ag-know-ic{width:34px;height:34px;border-radius:11px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--t) 11%,#fff);color:var(--t)}
.ag-know-ic svg{width:16px;height:16px}
.ag-know b{display:block;font-size:13.5px;font-weight:600;color:var(--ink)}
.ag-know small{display:block;margin-top:1px;font-size:12px;color:#8e8e93}
.ag-nav a:focus-visible,.ag-mini-run:focus-visible,.ag-know a:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 28%,transparent)}
@media (min-width:1180px){
  .ag-shell{display:grid;grid-template-columns:216px minmax(0,1fr);gap:20px;align-items:start;max-width:1640px;margin:0 auto;padding:24px 28px 120px}
  .ag-shell>.ag-page{max-width:none!important;margin:0!important;padding:0!important}
  .ag-nav{display:block;position:sticky;top:72px;max-height:calc(100vh - 88px);overflow:auto;scrollbar-width:none}
  .ag-headlink{display:none!important}
}
@media (min-width:1500px){
  .ag-shell{grid-template-columns:216px minmax(0,1fr) 296px}
  .ag-side{display:block;position:sticky;top:72px;max-height:calc(100vh - 88px);overflow:auto;scrollbar-width:none}
  .ag-head-pause{display:none!important}
}
.ag-primary:focus-visible,.ag-ghost:focus-visible,.ag-kill:focus-visible,.ag-switch:focus-visible,.ag-who button:focus-visible,.ag-topic:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 28%,transparent)}
.ag-team{background:#fff;border-radius:22px;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04);padding:18px;margin-bottom:16px}
.ag-team-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:2px 2px 14px}
.ag-team-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:10px}
.ag-mate{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:14px;border-radius:18px;background:color-mix(in srgb,var(--c) 7%,#f7f7f8);color:inherit;text-decoration:none;overflow:hidden;transition:background .2s,box-shadow .2s,transform .25s cubic-bezier(.22,1,.36,1)}
.ag-mate:hover{background:#fff;box-shadow:0 0 0 1px color-mix(in srgb,var(--c) 25%,rgba(0,0,0,.06)),0 10px 28px -12px color-mix(in srgb,var(--c) 45%,rgba(16,24,40,.22));transform:translateY(-2px)}
.ag-mate:has(.ag-mate-link:focus-visible){box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 35%,transparent)}
.ag-mate-link{position:absolute;inset:0;z-index:1;border-radius:inherit;outline:none}
.ag-mate::after{content:"";position:absolute;right:-30px;top:-30px;width:110px;height:110px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--c) 26%,transparent),transparent 70%);opacity:.45;transition:opacity .4s}
.ag-mate.on::after{opacity:1}
.ag-mate-face{position:relative;display:inline-flex;margin-bottom:4px}
.ag-mate.on .ag-mate-face>svg,.ag-mate.on .ag-mate-face>img{animation:agBob 3.2s ease-in-out infinite}
.ag-mate.off .ag-mate-face>svg,.ag-mate.off .ag-mate-face>img,.ag-mate.paused .ag-mate-face>svg,.ag-mate.paused .ag-mate-face>img{opacity:.9}
.ag-mate-edit{position:absolute;z-index:2;right:-8px;bottom:-6px;width:24px;height:24px;border-radius:50%;border:none;background:#fff;color:#3f3f46;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 0 0 1px rgba(0,0,0,.08),0 2px 6px rgba(16,24,40,.14);opacity:0;transform:scale(.8);transition:opacity .2s,transform .25s cubic-bezier(.34,1.56,.64,1),color .15s}
.ag-mate-edit::before{display:none!important}
.ag-mate-edit svg{width:13px;height:13px}
.ag-mate:hover .ag-mate-edit,.ag-mate-edit:focus-visible,.ag-mate-edit.on{opacity:1;transform:none}
.ag-mate-edit:hover,.ag-mate-edit.on{color:var(--c);transform:rotate(45deg)}
.ag-mate-edit:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 35%,transparent)}
@media (hover:none){.ag-mate-edit{opacity:1;transform:none}}
.ag-mate b{font-size:14.5px;font-weight:700;color:#111;letter-spacing:-.01em}
.ag-mate-state{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:#8e8e93}
.ag-mate-state i{position:relative;width:7px;height:7px;border-radius:50%;background:#d4d4d8}
.ag-mate.on .ag-mate-state{color:#15803d}
.ag-mate.on .ag-mate-state i{background:#22c55e}
.ag-mate.on .ag-mate-state i::after{content:"";position:absolute;inset:0;border-radius:50%;background:#22c55e;animation:agPing 1.8s cubic-bezier(0,0,.2,1) infinite}
.ag-mate.paused .ag-mate-state{color:#b45309}
.ag-mate.paused .ag-mate-state i{background:#f59e0b}
.ag-mate-line{display:flex;flex-direction:column;gap:2px;margin-top:4px;padding-top:8px;border-top:1px dashed #e4e4e7;width:100%;font-size:12.5px;line-height:1.45;color:#52525b}
.ag-mate-line .t{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;animation:agType 1.1s steps(28,end) .25s both}
.ag-mate-line .w{font-size:11.5px;color:#a1a1aa}
@media (max-width:560px){.ag-team{padding:14px}.ag-team-grid{grid-template-columns:1fr 1fr;gap:8px}.ag-mate{padding:12px}}
@keyframes agBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes agPing{0%{transform:scale(1);opacity:.6}80%,100%{transform:scale(2.4);opacity:0}}
@keyframes agType{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@media (prefers-reduced-motion:reduce){.ag-mate,.ag-mate-face>svg,.ag-mate-face>img,.ag-mate-edit{animation:none!important;transition:none}.ag-mate-line .t,.ag-mate-state i::after{animation:none!important}}

`
