'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { authFetch } from '@/lib/auth-fetch'
import EmptyScroll from '@/components/EmptyScroll'
import { resolveCompanyUser } from '@/lib/client-cache'
import { AdminPage, Panel } from '@/components/ui/AdminKit'


// SVG Icons for activity types
function getActivityIcon(type: string) {
  switch(type) {
    case 'form_created':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
    case 'form_updated':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
    case 'form_deleted':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
    case 'form_published':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
    case 'response_received':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    case 'idea_created':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
    case 'idea_updated':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
    case 'announcement_created':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    case 'announcement_deleted':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    case 'team_member_role_changed':
    case 'team_member_permissions_changed':
    case 'team_member_updated':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
    case 'team_member_invited':
    case 'team_member_invite_resent':
    case 'team_member_added':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
    case 'team_member_removed':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
    case 'settings_updated':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
    case 'refund_issued':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>
    case 'coupon_sent':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a3 3 0 0 0 0-6V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/><path d="m9 15 6-6"/></svg>
    case 'order_created':
    case 'order_updated':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
    case 'card_charged':
    case 'payment_requested':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
    case 'doa_resolved':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/></svg>
    case 'ai_agent_updated':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 14h.01M15 14h.01"/></svg>
    case 'phone_number_updated':
    case 'phone_number_removed':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
    case 'conv_status':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    case 'conv_block':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>
    case 'conv_task':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/></svg>
    case 'conv_review':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
    case 'integration_added':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="8"/></svg>
    default:
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  }
}

// add_activity_logs.sql made created_at a TIMESTAMP with no time zone, so it
// comes back without an offset and new Date() would read it as local time (a
// 2pm change in Sydney listed at 3am). It's UTC. COLVY_V367 fixes the column;
// this keeps the times right until it has run.
const loggedAt = (v: string) => new Date(/Z$|[+-]\d{2}:?\d{2}$/.test(v) ? v : v.replace(' ', 'T') + 'Z')

// One row of the log, whichever record it came from.
type Entry = {
  id: string
  at: Date
  /** Picks the icon and colour: an activity_logs type, or a mapped one. */
  kind: string
  /** The filter group. */
  cat: string
  tag: string
  text: string
  who: string
  ctx?: { label: string; href: string }
  ip?: string | null
}

const CATS = ['Conversations', 'Tasks', 'AI agents', 'Orders & money', 'Team', 'Settings']

// activity_logs (what Colvy's server records) → filter group.
const logCat = (t: string) =>
  /refund|coupon|order|card_charged|payment|doa/.test(t) ? 'Orders & money'
  : /ai_agent/.test(t) ? 'AI agents'
  : /team_member/.test(t) ? 'Team'
  : 'Settings'

// The inbox's own trail (conversation_events: assigned, closed, blocked…).
const CONV: Record<string, { kind: string; tag: string; cat?: string }> = {
  assigned: { kind: 'team_member_updated', tag: 'Assigned' },
  status_change: { kind: 'conv_status', tag: 'Conversation' },
  closed: { kind: 'conv_status', tag: 'Closed' },
  reopened: { kind: 'conv_status', tag: 'Reopened' },
  snoozed: { kind: 'conv_status', tag: 'Snoozed' },
  note_added: { kind: 'form_updated', tag: 'Note' },
  note: { kind: 'form_updated', tag: 'Note' },
  contact_blocked: { kind: 'conv_block', tag: 'Blocked' },
  contact_unblocked: { kind: 'conv_block', tag: 'Unblocked' },
  spam_reported: { kind: 'conv_block', tag: 'Spam' },
  protection: { kind: 'conv_block', tag: 'Spam' },
  review_request: { kind: 'conv_review', tag: 'Review request' },
  refunded: { kind: 'refund_issued', tag: 'Refund', cat: 'Orders & money' },
  payment_refunded: { kind: 'refund_issued', tag: 'Refund', cat: 'Orders & money' },
  payment_reminder: { kind: 'payment_requested', tag: 'Payment', cat: 'Orders & money' },
  tracking_sent: { kind: 'order_updated', tag: 'Tracking', cat: 'Orders & money' },
  pickup_notified: { kind: 'order_updated', tag: 'Pickup', cat: 'Orders & money' },
  collected: { kind: 'order_updated', tag: 'Collected', cat: 'Orders & money' },
  task_completed: { kind: 'conv_task', tag: 'Task', cat: 'Tasks' },
  task: { kind: 'conv_task', tag: 'Task', cat: 'Tasks' },
  ai_update: { kind: 'ai_agent_updated', tag: 'Colvy AI', cat: 'AI agents' },
}
const capFirst = (x: string) => x ? x.charAt(0).toUpperCase() + x.slice(1) : x

export default function AuditLogsPage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCat, setFilterCat] = useState<string | null>(null)
  const [filterUser, setFilterUser] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(40)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setOpen(o => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n })

  useEffect(() => { loadData() }, [])

  // Three records make the log: activity_logs (refunds, coupons, settings,
  // team changes… written by the server since it started logging), the inbox's
  // conversation trail, and task changes. Each is read on its own, so one that
  // isn't there (or that this workspace can't read) doesn't empty the page.
  const loadData = async () => {
    try {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return
      // The workspace you're signed in to (owner or team member; looking it
      // up by owner only left every other admin with an empty log).
      const { companyId } = await resolveCompanyUser()
      if (!companyId) return
      const read = async (q: () => PromiseLike<any>) => { try { const { data, error } = await q(); return error ? [] : (data || []) } catch { return [] } }
      const [logsData, convData, taskData] = await Promise.all([
        read(() => (supabase as any).from('activity_logs').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200)),
        read(() => (supabase as any).from('conversation_events').select('id, conversation_id, event_type, actor_name, detail, created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(400)),
        read(() => (supabase as any).from('task_activity').select('id, task_id, actor_id, actor_name, kind, detail, created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(300)),
      ])

      // Names for the people in activity_logs. supabase.auth.admin needs the
      // service-role key, so resolve them server-side.
      const userMap = new Map<string, string>()
      const userIds = [...new Set(logsData.map((l: any) => l.user_id).filter(Boolean))] as string[]
      if (userIds.length) {
        try {
          const res = await authFetch('/api/team/names', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userIds }) })
          const { names } = await res.json()
          for (const uid of userIds) { const n = names?.[uid]; if (n) userMap.set(uid, n.name || n.email || 'Someone') }
        } catch { /* names are a nicety */ }
      }

      // Who each conversation is with, and each task's title, for context.
      const convIds = [...new Set(convData.map((e: any) => e.conversation_id).filter(Boolean))] as string[]
      const taskIds = [...new Set(taskData.map((e: any) => e.task_id).filter(Boolean))] as string[]
      const [convs, tasks] = await Promise.all([
        convIds.length ? read(() => (supabase as any).from('conversations').select('id, contact_id, customer_name, customer_email, sms_number, subject').in('id', convIds.slice(0, 300))) : [],
        taskIds.length ? read(() => (supabase as any).from('conversation_tasks').select('*').in('id', taskIds.slice(0, 200))) : [],
      ])
      const contactIds = [...new Set(convs.map((c: any) => c.contact_id).filter(Boolean))] as string[]
      const contacts = contactIds.length ? await read(() => (supabase as any).from('contacts').select('id, name, email, phone').in('id', contactIds.slice(0, 300))) : []
      const contactName = new Map<string, string>(contacts.map((c: any) => [c.id, c.name || c.email || c.phone]))
      const convName = new Map<string, string>(convs.map((c: any) => [c.id, contactName.get(c.contact_id) || c.customer_name || c.customer_email || c.sms_number || c.subject || 'a customer']))
      const taskTitle = new Map<string, string>(tasks.map((t: any) => [String(t.id), String(t.title || t.text || 'a task').slice(0, 80)]))

      const out: Entry[] = []
      for (const l of logsData) {
        out.push({
          id: `l-${l.id}`, at: loggedAt(l.created_at), kind: l.activity_type, cat: logCat(l.activity_type), tag: LABELS[l.activity_type] || capFirst(String(l.activity_type || '').replace(/_/g, ' ')),
          text: l.description, who: userMap.get(l.user_id) || l.metadata?.actor_email || (l.user_id ? 'Someone' : 'Colvy'), ip: l.ip_address,
          ...(l.metadata?.conversation_id ? { ctx: { label: 'Open conversation', href: `/admin/inbox?conversation=${l.metadata.conversation_id}` } } : {}),
        })
      }
      // The server now logs refunds itself; skip the inbox's copy of the same one.
      const loggedRefunds = logsData.filter((l: any) => l.activity_type === 'refund_issued' && l.metadata?.conversation_id)
      for (const e of convData) {
        const m = CONV[e.event_type] || { kind: 'conv_status', tag: capFirst(String(e.event_type || 'Update').replace(/_/g, ' ')) }
        const at = new Date(e.created_at)
        if (m.kind === 'refund_issued' && loggedRefunds.some((l: any) => l.metadata.conversation_id === e.conversation_id && Math.abs(loggedAt(l.created_at).getTime() - at.getTime()) < 5 * 60000)) continue
        const name = e.conversation_id ? convName.get(e.conversation_id) : null
        out.push({
          id: `c-${e.id}`, at, kind: m.kind, cat: m.cat || 'Conversations', tag: m.tag,
          text: capFirst(String(e.detail || m.tag)), who: e.actor_name || 'Colvy',
          ...(e.conversation_id ? { ctx: { label: name ? `With ${name}` : 'Open conversation', href: `/admin/inbox?conversation=${e.conversation_id}` } } : {}),
        })
      }
      for (const t of taskData) {
        const title = taskTitle.get(String(t.task_id))
        const detail = String(t.detail || 'updated a task')
        const named = title && /\bthis task\b/.test(detail)
        out.push({
          id: `t-${t.id}`, at: new Date(t.created_at), kind: 'conv_task', cat: 'Tasks', tag: 'Task',
          text: capFirst(named ? detail.replace(/\bthis task\b/, `“${title}”`) : detail), who: t.actor_name || 'Someone',
          ...(!named && title ? { ctx: { label: title, href: `/admin/tasks?task=${t.task_id}` } } : named ? { ctx: { label: 'Open task', href: `/admin/tasks?task=${t.task_id}` } } : {}),
        })
      }
      out.sort((a, b) => b.at.getTime() - a.at.getTime())
      setEntries(out.slice(0, 900))
    } catch (error) {
      console.error('Failed to load audit logs:', error)
    } finally {
      setLoading(false)
    }
  }

  const tone = (t: string) => /refund/.test(t) ? '#f97316' : /coupon/.test(t) ? '#ec4899' : /card_charged|payment/.test(t) ? '#059669' : /doa/.test(t) ? '#b45309' : /order_/.test(t) ? '#10b981' : /ai_agent/.test(t) ? '#8b5cf6' : /conv_block/.test(t) ? '#ef4444' : /conv_status/.test(t) ? '#0ea5e9' : /conv_task/.test(t) ? '#10b981' : /conv_review/.test(t) ? '#f59e0b' : /deleted|removed/.test(t) ? '#ef4444' : /created|added|invited|published/.test(t) ? '#16a34a' : /team_member/.test(t) ? '#6366f1' : /settings|integration|phone/.test(t) ? '#0ea5e9' : /response|announcement|form_updated/.test(t) ? '#f59e0b' : '#71717a'
  const dayOf = (d: Date) => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const x = new Date(d); x.setHours(0, 0, 0, 0)
    const diff = Math.round((today.getTime() - x.getTime()) / 86400000)
    return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: today.getFullYear() === d.getFullYear() ? undefined : 'numeric' })
  }
  const q = query.trim().toLowerCase()
  const matches = (e: Entry) => (!filterCat || e.cat === filterCat) && (!filterUser || e.who === filterUser)
    && (!q || e.text.toLowerCase().includes(q) || e.who.toLowerCase().includes(q) || (e.ctx?.label || '').toLowerCase().includes(q))
  const shown = entries.filter(matches)

  // Runs of the same thing by the same person (a task edited six times, the
  // AI handing a dozen chats over) fold into one row you can open.
  type Group = { id: string; items: Entry[]; day: string }
  const groupsAll: Group[] = []
  const openRuns = new Map<string, Group>()
  for (const e of shown) {
    const day = dayOf(e.at)
    // Same person, same kind (and for tasks, the same task), the same day,
    // within 90 minutes of the run's latest entry, even with other things
    // in between.
    const key = `${day}|${e.who}|${e.tag}|${e.cat === 'Tasks' ? e.ctx?.href || '' : ''}`
    const g = openRuns.get(key)
    if (g && (g.items[0].at.getTime() - e.at.getTime()) < 90 * 60000) g.items.push(e)
    else { const n = { id: e.id, items: [e], day }; groupsAll.push(n); openRuns.set(key, n) }
  }
  const groups = groupsAll.slice(0, limit)
  const counts = new Map<string, number>()
  for (const e of entries) if ((!filterUser || e.who === filterUser)) counts.set(e.cat, (counts.get(e.cat) || 0) + 1)
  const cats = CATS.filter(c => counts.get(c))
  const people = [...new Set(entries.map(e => e.who))].sort((a, b) => a.localeCompare(b))
  const isAi = (who: string) => /colvy|agent|\bai\b/i.test(who)
  const initials = (who: string) => who.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?'
  const hue = (who: string) => ['#ff7a6b', '#f59e0b', '#10b981', '#0ea5e9', '#6366f1', '#ec4899', '#14b8a6'][[...who].reduce((a, c) => a + c.charCodeAt(0), 0) % 7]
  const time = (d: Date) => d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
  const titleOf = (g: Group) => {
    const n = g.items.length
    if (n === 1) return g.items[0].text
    const lead = (t: string) => t.split(' — ')[0].split(': ')[0]
    const l = lead(g.items[0].text)
    if (g.items.every(i => lead(i.text) === l) && l.length < 60) return `${l} ×${n}`
    if (g.items[0].cat === 'Tasks' && g.items[0].ctx) return `${n} changes to “${g.items[0].ctx.label === 'Open task' ? 'a task' : g.items[0].ctx.label}”`
    return `${n} ${g.items[0].tag.toLowerCase()} updates`
  }
  let lastDay = ''

  return (
    <AdminPage width="md" title="Activity log" sub="Who did what in Colvy, newest first. Repeats are folded together; open one to see each step.">
      <div className="al-chips" role="tablist" aria-label="Kind of activity">
        <button type="button" role="tab" aria-selected={!filterCat} className={`al-chip${!filterCat ? ' on' : ''}`} onClick={() => { setFilterCat(null); setLimit(40) }}>All <b>{[...counts.values()].reduce((a, b) => a + b, 0)}</b></button>
        {cats.map(c => (
          <button key={c} type="button" role="tab" aria-selected={filterCat === c} className={`al-chip${filterCat === c ? ' on' : ''}`} style={{ '--t': CAT_TONE[c] } as React.CSSProperties} onClick={() => { setFilterCat(filterCat === c ? null : c); setLimit(40) }}>
            <i />{c} <b>{counts.get(c)}</b>
          </button>
        ))}
      </div>
      <div className="al-tools">
        <label className="al-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input className="ak-field" value={query} onChange={e => { setQuery(e.target.value); setLimit(40) }} placeholder="Search activity, people or customers" aria-label="Search activity" />
        </label>
        {people.length > 1 && (
          <select className="ak-select" value={filterUser || ''} onChange={e => { setFilterUser(e.target.value || null); setLimit(40) }} aria-label="Person">
            <option value="">Everyone</option>
            {people.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <Panel><div className="al-skel">{[0, 1, 2, 3, 4].map(i => <span key={i} />)}</div></Panel>
      ) : groups.length === 0 ? (
        <Panel>
          <EmptyScroll kinds={['note', 'contact', 'task']} title={filterCat || filterUser || q ? 'Nothing matches' : 'No activity yet'}
            line={filterCat || filterUser || q ? 'Try another filter or search, or clear them.' : 'Conversations, refunds, coupons, orders, tasks and settings changes show up here as your team works.'} />
        </Panel>
      ) : (
        <Panel flush>
          <ul className="al-feed">
            {groups.map(g => {
              const e = g.items[0]
              const many = g.items.length > 1
              const isOpen = open.has(g.id)
              const showDay = g.day !== lastDay
              lastDay = g.day
              return (
                <li key={g.id} className={isOpen ? 'open' : ''}>
                  {showDay && <h3 className="al-day">{g.day}</h3>}
                  <div className="al-row" role={many ? 'button' : undefined} tabIndex={many ? 0 : undefined} aria-expanded={many ? isOpen : undefined}
                    onClick={() => many && toggle(g.id)} onKeyDown={ev => { if (many && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); toggle(g.id) } }}>
                    <span className={`al-av${isAi(e.who) ? ' ai' : ''}`} style={{ '--h': hue(e.who) } as React.CSSProperties} aria-hidden>{isAi(e.who) ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" /></svg> : initials(e.who)}</span>
                    <div className="al-body">
                      <p className="al-line"><b>{e.who}</b> <span className="al-txt">{titleOf(g)}</span></p>
                      <div className="al-meta">
                        <span className="al-tag" style={{ '--t': tone(e.kind) } as React.CSSProperties}>{e.tag}</span>
                        {e.ctx && (!many || g.items.every(x => x.ctx?.href === e.ctx?.href)) && <a href={e.ctx.href} className="al-ctx" onClick={ev => ev.stopPropagation()}>{e.ctx.label}</a>}
                        {many && <span className="al-more">{isOpen ? 'Hide' : `Show all ${g.items.length}`}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="6 9 12 15 18 9" /></svg></span>}
                        {!many && e.ip && e.ip !== 'unknown' && <span>IP {e.ip}</span>}
                      </div>
                    </div>
                    <time className="al-time">{many && <span className="al-t0">{time(g.items[g.items.length - 1].at)}–</span>}{time(e.at)}</time>
                  </div>
                  {many && isOpen && (
                    <ul className="al-sub">
                      {g.items.map(i => (
                        <li key={i.id}>
                          <span className="al-dot" style={{ '--t': tone(i.kind) } as React.CSSProperties} aria-hidden />
                          <p>{i.text}</p>
                          {i.ctx && !g.items.every(x => x.ctx?.href === i.ctx?.href) && <a href={i.ctx.href} className="al-ctx">{i.ctx.label}</a>}
                          <time>{time(i.at)}</time>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
          {groupsAll.length > limit && (
            <div className="al-foot">
              <button type="button" className="ak-btn" onClick={() => setLimit(l => l + 40)}>Show more <span className="al-foot-n">{groupsAll.length - limit} left</span></button>
            </div>
          )}
        </Panel>
      )}
      <style>{AL_CSS}</style>
    </AdminPage>
  )
}

const CAT_TONE: Record<string, string> = {
  'Orders & money': '#f97316', Conversations: '#0ea5e9', Tasks: '#10b981', Team: '#6366f1', 'AI agents': '#8b5cf6', Settings: '#71717a',
}

const LABELS: Record<string, string> = {
  refund_issued: 'Refund', coupon_sent: 'Coupon', order_created: 'Order', order_updated: 'Order',
  card_charged: 'Card charge', payment_requested: 'Payment link', doa_resolved: 'DOA claim',
  ai_agent_updated: 'AI agents', phone_number_updated: 'Phone number', phone_number_removed: 'Phone number',
  integration_added: 'Integration', integration_removed: 'Integration', settings_updated: 'Settings',
  team_member_invited: 'Team', team_member_invite_resent: 'Team', team_member_added: 'Team', team_member_removed: 'Team',
  team_member_role_changed: 'Team', team_member_permissions_changed: 'Team', team_member_updated: 'Team',
}

const AL_CSS = `
.al-chips{display:flex;gap:6px;margin-bottom:12px;overflow-x:auto;scrollbar-width:none;padding:2px}
.al-chips::-webkit-scrollbar{display:none}
.al-chip{flex-shrink:0;display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 14px;border:none;border-radius:999px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.07);font:inherit;font-size:13.5px;font-weight:600;color:var(--ink);cursor:pointer;white-space:nowrap;transition:background .15s,color .15s,box-shadow .15s}
.al-chip:hover{background:var(--f)}
.al-chip i{width:8px;height:8px;border-radius:50%;background:var(--t)}
.al-chip b{font-weight:650;color:var(--soft);font-variant-numeric:tabular-nums}
.al-chip.on{background:var(--ink);color:var(--card,#fff);box-shadow:none}
.al-chip.on b{color:inherit;opacity:.65}
.al-tools{display:flex;gap:8px;margin-bottom:14px}
.al-search{position:relative;flex:1;min-width:0}
.al-search svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--soft);pointer-events:none;z-index:1}
.ak .al-search .ak-field{padding-left:38px}
.al-tools .ak-select{width:auto;min-width:170px}
@media (max-width:560px){.al-tools{flex-direction:column}.al-tools .ak-select{width:100%}}
.al-feed{list-style:none;margin:0;padding:4px 8px 8px}
.al-day{position:sticky;top:0;z-index:2;margin:0;padding:14px 12px 6px;background:var(--card,#fff);font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;font-weight:700;letter-spacing:-.01em;color:var(--ink)}
.al-row{display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:14px;transition:background .15s}
.al-row:hover{background:color-mix(in srgb,var(--f) 70%,transparent)}
.al-row[role=button]{cursor:pointer}
.al-feed>li.open>.al-row{background:var(--f)}
.al-av{width:30px;height:30px;flex-shrink:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--h) 16%,var(--card,#fff));color:color-mix(in srgb,var(--h) 80%,#000);font-size:11.5px;font-weight:700}
.al-av.ai{background:linear-gradient(140deg,#c4b5fd,#8b5cf6);color:#fff}
.al-body{flex:1;min-width:0}
.al-line{margin:0;font-size:14px;line-height:1.4;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.al-line b{font-weight:650;color:var(--ink)}
.al-txt{color:var(--ink)}
.al-meta{display:flex;align-items:center;flex-wrap:wrap;gap:4px 10px;margin-top:2px;font-size:12px;color:var(--soft)}
.al-tag{display:inline-flex;align-items:center;gap:5px;font-weight:600;color:color-mix(in srgb,var(--t) 85%,var(--ink))}
.al-tag::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--t)}
.al-ctx{color:var(--coral);font-weight:600;text-decoration:none;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.al-ctx:hover{text-decoration:underline}
.al-more{display:inline-flex;align-items:center;gap:3px;font-weight:650;color:var(--ink)}
.al-feed>li.open .al-more svg{transform:rotate(180deg)}
.al-time{flex-shrink:0;font-size:12px;color:var(--soft);font-variant-numeric:tabular-nums;white-space:nowrap}
.al-sub{list-style:none;margin:2px 0 8px 54px;padding:4px 0 4px 14px;border-left:2px solid var(--line);animation:alIn .25s cubic-bezier(.22,1,.36,1) both}
.al-sub li{display:flex;align-items:baseline;gap:8px;padding:5px 8px;border-radius:10px;font-size:13px;line-height:1.45}
.al-sub li:hover{background:color-mix(in srgb,var(--f) 60%,transparent)}
.al-sub p{flex:1;min-width:0;margin:0;color:var(--ink);overflow-wrap:anywhere}
.al-sub time{flex-shrink:0;font-size:11.5px;color:var(--soft);font-variant-numeric:tabular-nums}
.al-dot{width:6px;height:6px;flex-shrink:0;border-radius:50%;background:var(--t);transform:translateY(-1px)}
@keyframes alIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
@media (max-width:560px){.al-sub{margin-left:20px}.al-sub li{flex-wrap:wrap}.al-time{align-self:flex-start;margin-top:3px}.al-t0{display:none}.al-row{align-items:flex-start}.al-line{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}}
.al-foot{display:flex;justify-content:center;padding:6px 0 16px}
.al-foot-n{margin-left:4px;font-weight:500;color:var(--soft)}
.al-skel{display:flex;flex-direction:column;gap:10px}
.al-skel span{height:44px;border-radius:12px;background:linear-gradient(90deg,var(--f) 25%,var(--f2) 37%,var(--f) 63%);background-size:400% 100%;animation:alSk 1.2s ease infinite}
@keyframes alSk{0%{background-position:100% 50%}100%{background-position:0 50%}}
`
