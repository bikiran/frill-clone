'use client'
import Greeting from '@/components/Greeting'
import LinkClicksCard from '@/components/LinkClicksCard'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { authFetch } from '@/lib/auth-fetch'
import Link from 'next/link'

import { LightbulbIcon, MegaphoneIcon, SurveyIcon, PollIcon, StarIcon, TicketIcon, CheckIcon } from '@/components/Icons'
import SetupChecklist, { readSetupLink, setupWorthLoading, type SetupLink } from '@/components/SetupChecklist'
import type { SetupStatus } from '@/lib/setup-status'

// ── Admin home ────────────────────────────────────────────────────────────────
// Leads with what needs someone today (unread chats, missed calls, orders to
// pack, overdue tasks…), then today's bookings and tasks, then how the last 30
// days compare with the 30 before. The feedback board sits underneath.
//
// The setup checklist (components/SetupChecklist) opens at the very top for a
// new workspace (under two weeks old) and when someone comes back from a
// connect flow (?setup=1), until everything's connected. For an older
// workspace it sits at the bottom, folded, out of the way of a business in
// full swing.
const SETUP_FRESH_DAYS = 14

type Summary = {
  attention: {
    unread: number; unassigned: number
    missedCalls: number; voicemails: number; callsToday: number
    // Last 7 days. Missing from summaries cached before it existed.
    missedOutcome?: {
      missed: number; recovered: number; textedBack: number; toCallBack: number
      toReturn: { number: string; name: string | null; conversationId: string | null; at: string; attempts: number }[]
    } | null
    awaiting: number; oldestDays: number | null
    overdueTasks: number; dueToday: number
    ticketsOverdue: number; ticketsSoon: number
    reviewsToAnswer: number; lowReviewsToAnswer: number
    waitlist: number; carts: number; cartValue: number
    bookingsToday: number
  }
  today: {
    bookings: { id: string; starts_at: string; ends_at?: string; customer_name?: string; service_name?: string; staff_name?: string; status: string }[]
    tasks: { id: string; text: string; due_date: string; assigned_to?: string; overdue: boolean }[]
  }
  perf: {
    revenue: { now: number; prev: number }
    orders: { now: number; prev: number }
    aov: { now: number; prev: number }
    conversations: { now: number; prev: number }
    calls: { now: number; prev: number }
    reviews: { now: number; prev: number; avgNow: number | null; avgPrev: number | null }
    daily: { day: string; label: string; value: number }[]
  }
  activity: { kind: string; at: string; title: string; detail?: string; href: string; rating?: number }[]
  tz: string
  // What this member may see (Team → Permissions). Numbers for anything else
  // aren't sent by the server at all.
  access?: { full: boolean; features: Record<string, boolean> }
}

// A summary the dashboard can actually render (the API, or an old cache entry,
// may hand back an error object or a partial shape).
const isSummary = (d: any): d is Summary => !!(d && d.attention && d.today && Array.isArray(d.today.bookings) && Array.isArray(d.today.tasks) && d.perf && Array.isArray(d.activity))

// Can the signed-in member see this area? Until the first summary arrives (or
// from an old cached one without `access`) nothing is hidden.
const canSee = (s: Summary | null, key: string) => !s?.access || s.access.full || s.access.features?.[key] !== false

const money = (n: number, cents = false) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }).format(n || 0)
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`

function ago(iso: string) {
  const ms = Date.now() - Date.parse(iso)
  if (!isFinite(ms)) return ''
  const m = Math.round(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

// ── Icons (stroke, 24 grid — same style as components/Icons) ─────────────────
const I = ({ d, size = 18, color = 'currentColor' }: { d: React.ReactNode; size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
)
const ChatI = (p: any) => <I {...p} d={<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />} />
const PhoneMissI = (p: any) => <I {...p} d={<><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /><line x1="23" y1="1" x2="17" y2="7" /><line x1="17" y1="1" x2="23" y2="7" /></>} />
const BoxI = (p: any) => <I {...p} d={<><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>} />
const ClipboardI = (p: any) => <I {...p} d={<><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /><path d="m9 14 2 2 4-4" /></>} />
const UserPlusI = (p: any) => <I {...p} d={<><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></>} />
const ClockI = (p: any) => <I {...p} d={<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>} />
const CartI = (p: any) => <I {...p} d={<><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></>} />
const CalendarI = (p: any) => <I {...p} d={<><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>} />
const ArrowI = ({ up, size = 12 }: { up: boolean; size?: number }) => <I size={size} d={up ? <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></> : <><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></>} />

const card = 'bg-white rounded-xl border'
const cardStyle = { borderColor: 'var(--border)' } as const
const eyebrow = 'text-xs font-semibold uppercase tracking-wider'

// Last numbers seen on this device, so the page paints instantly and refreshes
// in the background instead of opening on empty tiles every visit. Scoped to
// the signed-in user and this workspace's hostname.
const CACHE_KEY = 'colvy-dash-v2'   // v2: summaries carry the member's access
const CACHE_MAX_AGE = 7 * 864e5
type DashCache = { host: string; userId: string; companyId: string; at: number; summary?: Summary; sales?: any; stats?: any; setup?: SetupStatus }
function readCache(userId: string | undefined): DashCache | null {
  if (!userId) return null
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as DashCache | null
    if (!c || c.userId !== userId || c.host !== window.location.hostname || Date.now() - c.at > CACHE_MAX_AGE) return null
    return c
  } catch { return null }
}
function writeCache(userId: string | undefined, companyId: string, patch: Partial<DashCache>) {
  if (!userId) return
  try {
    const prev = readCache(userId)
    const base = prev && prev.companyId === companyId ? prev : { host: window.location.hostname, userId, companyId }
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...base, ...patch, at: Date.now() }))
  } catch { /* storage full or blocked — the page just loads without it */ }
}

export default function AdminDashboard() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [summaryError, setSummaryError] = useState('')
  const [sales, setSales] = useState<{ total: number; count: number; byMethod: [string, number][]; bySeller: [string, number][] } | null>(null)
  const [stats, setStats] = useState<{ ideas: number; announcements: number; surveys: number; polls: number; topics: number; statuses: number } | null>(null)
  // True while fresh numbers are on their way and the page is showing cached ones.
  const [refreshing, setRefreshing] = useState(false)
  // Setup progress, worked out on the server from what's connected. `fresh`
  // once it's come from the server rather than this device's cache.
  const [setup, setSetup] = useState<(SetupStatus & { full?: boolean }) | null>(null)
  const [setupFresh, setSetupFresh] = useState(false)
  // What the URL says about setup (?setup=1 after a connect flow), read once
  // on mount; null until then, and the checklist waits for it. Not read while
  // rendering: arriving by a client-side link (the "Back to setup" bar), Next
  // only puts the new URL in the address bar once the page commits, so the
  // first render still sees the page they came from.
  const [setupLink, setSetupLink] = useState<SetupLink | null>(null)
  // The setup numbers last had (cached or fetched), to tell whether checking
  // again is worth the queries.
  const lastSetupRef = useRef<(SetupStatus & { full?: boolean }) | null>(null)
  const userIdRef = useRef<string | undefined>(undefined)

  const resolveCompanyId = async () => {
    if (typeof window !== 'undefined') {
      const h = window.location.hostname
      if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
        const slug = h.replace('.colvy.com', '')
        const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle()
        if (co?.id) return co.id as string
      }
    }
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      const { data: co } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
      if (co?.id) return co.id as string
      const { data: tm } = await (supabase as any).from('team_members').select('company_id').eq('user_id', session.user.id).limit(1)
      if (tm?.[0]?.company_id) return tm[0].company_id as string
    }
    return null
  }

  const loadSummary = useCallback(async (cid: string) => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const res = await authFetch(`/api/dashboard/summary?companyId=${cid}&tz=${encodeURIComponent(tz)}`)
      const data = await res.json()
      if (!res.ok || !isSummary(data)) throw new Error(data?.error || 'Could not load the dashboard')
      setSummary(data); setSummaryError('')
      writeCache(userIdRef.current, cid, { summary: data })
    } catch (e: any) { setSummaryError(e.message || 'Could not load the dashboard') }
    finally { setRefreshing(false) }
  }, [])

  const loadSetup = useCallback(async (cid: string) => {
    try {
      const res = await authFetch(`/api/setup/status?companyId=${cid}`)
      const data = await res.json()
      if (!res.ok || !Array.isArray(data?.steps)) return
      setSetup(data); setSetupFresh(true); lastSetupRef.current = data
      writeCache(userIdRef.current, cid, { setup: data })
    } catch { /* the checklist just doesn't show this time */ }
  }, [])

  const loadSales = async (cid: string) => {
    try {
      const since30 = new Date(Date.now() - 30 * 864e5).toISOString()
      const { data } = await (supabase as any).from('conversation_sales')
        .select('amount, payment_method, sold_by_name, created_at')
        .eq('company_id', cid).gte('created_at', since30).limit(2000)
      let total = 0
      const byMethodM = new Map<string, number>(), bySellerM = new Map<string, number>()
      for (const r of data || []) {
        const a = Number(r.amount) || 0; total += a
        const m = r.payment_method || 'Unspecified'; byMethodM.set(m, (byMethodM.get(m) || 0) + a)
        const s = r.sold_by_name || 'Unattributed'; bySellerM.set(s, (bySellerM.get(s) || 0) + a)
      }
      const top = (mp: Map<string, number>) => Array.from(mp.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4)
      const next = { total, count: (data || []).length, byMethod: top(byMethodM), bySeller: top(bySellerM) }
      setSales(next); writeCache(userIdRef.current, cid, { sales: next })
    } catch { setSales({ total: 0, count: 0, byMethod: [], bySeller: [] }) }
  }

  const loadStats = async (cid: string) => {
    const c = async (t: string) => { try { const { count } = await (supabase as any).from(t).select('id', { count: 'exact', head: true }).eq('company_id', cid); return count || 0 } catch { return 0 } }
    const [ideas, announcements, surveys, polls, topics, statuses] = await Promise.all(['ideas', 'announcements', 'surveys', 'polls', 'topics', 'statuses'].map(c))
    setStats({ ideas, announcements, surveys, polls, topics, statuses })
    writeCache(userIdRef.current, cid, { stats: { ideas, announcements, surveys, polls, topics, statuses } })
    // A brand-new workspace gets sample ideas so the board isn't empty.
    if (ideas === 0) {
      try {
        const { data: co } = await (supabase as any).from('companies').select('name').eq('id', cid).maybeSingle()
        authFetch('/api/seed-company', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId: cid, companyName: co?.name }) }).catch(() => {})
      } catch {}
    }
  }

  useEffect(() => {
    let timer: any = null
    let cid: string | null = null
    // By now the address bar has this page's URL, however they got here.
    const link = readSetupLink()
    const onFocus = () => { if (cid && document.visibilityState === 'visible') loadSummary(cid) }
    // Setup is only checked while the checklist can show on this device.
    const wantSetup = (id: string) => setupWorthLoading(id, lastSetupRef.current, link)
    // Coming back to this tab (e.g. after connecting something in another one)
    // re-checks setup too, so a step ticks without a reload — unless it's not
    // theirs to run (the checklist never shows for restricted staff).
    const onVisible = () => {
      onFocus()
      if (cid && document.visibilityState === 'visible' && lastSetupRef.current?.full !== false && wantSetup(cid)) loadSetup(cid)
    }
    const loadAll = (id: string) => { loadSummary(id); loadSales(id); loadStats(id); if (wantSetup(id)) loadSetup(id) }
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      const u = data.session?.user || null
      setUser(u); setSetupLink(link); userIdRef.current = u?.id
      // Paint the last numbers straight away and start refreshing them without
      // waiting to look the workspace up again.
      const cached = readCache(u?.id)
      if (cached) {
        cid = cached.companyId; setCompanyId(cid)
        if (isSummary(cached.summary)) setSummary(cached.summary)
        if (cached.sales) setSales(cached.sales)
        if (cached.stats) setStats(cached.stats)
        if (cached.setup && Array.isArray(cached.setup.steps)) { setSetup(cached.setup); lastSetupRef.current = cached.setup }
        setRefreshing(isSummary(cached.summary))
        loadAll(cid)
      }
      const resolved = await resolveCompanyId()
      if (resolved !== cid) {
        // First visit on this device, or the workspace changed — start clean.
        cid = resolved; setCompanyId(cid)
        setSummary(null); setSales(null); setStats(null); setSetup(null); setSetupFresh(false); setRefreshing(false)
        lastSetupRef.current = null
        if (!cid) { setSummaryError('No workspace found for this account'); return }
        loadAll(cid)
      }
      // Keep the numbers current while the tab is open.
      timer = setInterval(onFocus, 60_000)
      document.addEventListener('visibilitychange', onVisible)
    })()
    return () => { if (timer) clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [loadSummary, loadSetup])

  if (!user) return <div className="p-8" style={{ color: 'var(--slate)' }}>Loading...</div>

  // Workspace setup is for the people who run it, not restricted staff.
  const runsIt = (!summary?.access || summary.access.full) && setup?.full !== false
  // Not tied to "complete": a finished checklist hides itself (after its
  // celebration), and keeping the slot steady stops it jumping down the page.
  const setupTop = !!setup && (!!setupLink?.open || (setup.ageDays != null && setup.ageDays < SETUP_FRESH_DAYS))
  const checklist = companyId && setup && setupLink && runsIt
    ? <SetupChecklist key={companyId} companyId={companyId} status={setup} fresh={setupFresh} prominent={setupTop} link={setupLink} />
    : null

  return (
    <main className="px-4 md:px-8 py-6 md:py-8">
      <style>{`.dash-rows > li + li { border-top: 1px solid var(--border); }`}</style>
      <div className="max-w-6xl mx-auto">
        <Greeting name={user?.user_metadata?.display_name || user?.email?.split('@')[0]} />

        {summaryError && !summary && (
          <div className={`${card} p-4 mb-6 text-sm`} style={{ ...cardStyle, color: '#b91c1c' }}>{summaryError}</div>
        )}

        {setupTop && checklist}
        <NeedsAttention s={summary} refreshing={refreshing} />
        <Today s={summary} />
        <Performance s={summary} />

        {sales && sales.count > 0 && canSee(summary, 'payments') && (
          <section className="mb-8">
            <h2 className={`${eyebrow} mb-3`} style={{ color: 'var(--slate)' }}>Sales logged in Colvy · last 30 days</h2>
            <div className="grid md:grid-cols-3 gap-3">
              <div className={`${card} p-5`} style={cardStyle}>
                <p className={`${eyebrow} mb-2`} style={{ color: 'var(--slate)' }}>Revenue logged</p>
                <p className="text-3xl font-bold" style={{ color: 'var(--ink)' }}>{money(sales.total)}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{plural(sales.count, 'sale')} recorded from conversations</p>
              </div>
              {([['By team member', sales.bySeller], ['By payment method', sales.byMethod]] as [string, [string, number][]][]).map(([title, list]) => (
                <div key={title} className={`${card} p-5`} style={cardStyle}>
                  <p className={`${eyebrow} mb-3`} style={{ color: 'var(--slate)' }}>{title}</p>
                  {list.map(([name, amt]) => (
                    <div key={name} className="flex items-center justify-between mb-1.5 gap-2">
                      <span className="text-sm truncate" style={{ color: 'var(--ink)' }}>{name}</span>
                      <span className="text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--ink)' }}>{money(amt)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {(() => {
          const links = canSee(summary, 'link_reports')
          const activity = !summary?.access || summary.access.full || summary.activity.length > 0
          if (!links && !activity) return null
          return (
            <div className={`grid ${links && activity ? 'lg:grid-cols-5' : ''} gap-6 mb-8`}>
              {links && <div className={`${activity ? 'lg:col-span-3' : ''} min-w-0`}><LinkClicksCard companyId={companyId} /></div>}
              {activity && <div className={`${links ? 'lg:col-span-2' : ''} min-w-0`}><Activity s={summary} /></div>}
            </div>
          )
        })()}

        <FeedbackStrip stats={stats} s={summary} />
        {!setupTop && checklist}
      </div>
    </main>
  )
}

// ── Needs attention ───────────────────────────────────────────────────────────

function NeedsAttention({ s, refreshing }: { s: Summary | null; refreshing?: boolean }) {
  const a = s?.attention
  // Missed calls stay until someone gets back to the caller, rather than
  // vanishing at midnight. The link opens the call log on the missed ones.
  const mo = a?.missedOutcome
  const cc = canSee(s, 'command_centre')
  const missedHref = cc ? '/admin/command-centre?tab=logs&range=7d&dir=inbound&outcome=missed' : '/admin/calls?filter=missed'
  const tiles = a ? [
    { key: 'unread', feature: 'inbox', label: 'Unread messages', n: a.unread, urgent: true, href: '/admin/inbox?view=unread', icon: ChatI,
      sub: a.unread ? 'Customers waiting on a reply' : 'Inbox is caught up' },
    mo ? { key: 'calls', feature: 'calls', label: 'Missed calls to return', n: mo.toCallBack, urgent: true, href: missedHref, icon: PhoneMissI,
      sub: mo.missed ? `${mo.recovered} of ${plural(mo.missed, 'missed call')} recovered · ${mo.toCallBack} still to call back` : 'None in the last 7 days',
      hint: mo.textedBack ? `Last 7 days. ${plural(mo.textedBack, 'caller')} texted back automatically.` : 'Last 7 days' }
    : { key: 'calls', feature: 'calls', label: 'Missed calls today', n: a.missedCalls + a.voicemails, urgent: true, href: cc ? '/admin/command-centre' : '/admin/calls', icon: PhoneMissI,
      sub: a.voicemails ? `${plural(a.voicemails, 'voicemail')} · ${plural(a.callsToday, 'call')} today` : `${plural(a.callsToday, 'call')} today` },
    { key: 'orders', feature: 'orders', label: 'Orders to fulfil', n: a.awaiting, urgent: (a.oldestDays ?? 0) >= 3, href: '/admin/orders', icon: BoxI,
      sub: a.awaiting ? (a.oldestDays ? `Oldest waiting ${plural(a.oldestDays, 'day')}` : 'All from today') : 'Nothing waiting to ship' },
    { key: 'tasks', feature: 'tasks', label: 'Overdue tasks', n: a.overdueTasks, urgent: true, href: '/admin/tasks?bucket=overdue', icon: ClipboardI,
      sub: a.dueToday ? `${a.dueToday} more due today` : 'Nothing else due today' },
    { key: 'tickets', feature: 'tickets', label: 'Tickets past deadline', n: a.ticketsOverdue, urgent: true, href: '/admin/tickets', icon: (p: any) => <TicketIcon size={p.size} color={p.color} />,
      sub: a.ticketsSoon ? `${a.ticketsSoon} due soon` : 'All within their deadline' },
    { key: 'reviews', feature: 'reviews', label: 'Reviews to answer', n: a.reviewsToAnswer, urgent: a.lowReviewsToAnswer > 0, href: '/admin/reviews', icon: (p: any) => <StarIcon size={p.size} color={p.color} />,
      sub: a.lowReviewsToAnswer ? `${a.lowReviewsToAnswer} rated 3 stars or less` : 'Google reviews from the last 30 days' },
    { key: 'unassigned', feature: 'inbox', label: 'Unassigned chats', n: a.unassigned, urgent: false, href: '/admin/inbox?view=unassigned', icon: UserPlusI,
      sub: 'Active in the last 7 days' },
    { key: 'waitlist', feature: 'waitlists', label: 'On a waitlist', n: a.waitlist, urgent: false, href: '/admin/waitlists', icon: ClockI,
      sub: 'Customers waiting for stock' },
    { key: 'carts', feature: 'orders', label: 'Abandoned carts', n: a.carts, urgent: false, href: '/admin/inbox', icon: CartI,
      sub: a.carts ? `${money(a.cartValue)} left in carts · 7 days` : 'None in the last 7 days' },
  ].filter(t => canSee(s, t.feature)) : []
  // A member who can't open any of these areas doesn't get an empty section.
  if (a && tiles.length === 0) return null
  // Things that need doing first; clear ones keep their place after.
  const ordered = [...tiles.filter(t => t.n > 0), ...tiles.filter(t => t.n === 0)]
  const outstanding = tiles.filter(t => t.n > 0).length

  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between mb-3 gap-3">
        <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Needs attention</h2>
        {a && (
          <span className="text-sm inline-flex items-center gap-2" style={{ color: 'var(--slate)' }}>
            {refreshing && <span className="inline-flex items-center gap-1.5 text-xs" aria-live="polite"><span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--coral)' }} />Updating</span>}
            {outstanding ? `${plural(outstanding, 'area')} to look at` : 'All clear'}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {!a ? Array.from({ length: 6 }).map((_, i) => <div key={i} className={`${card} h-[118px] animate-pulse`} style={{ ...cardStyle, background: 'var(--canvas)' }} />)
          : ordered.map(t => {
            const clear = t.n === 0
            const hot = !clear && t.urgent
            const Icon = t.icon
            return (
              <Link key={t.key} href={t.href} title={'hint' in t ? t.hint : undefined} className={`${card} p-4 flex flex-col sm:flex-row gap-2 sm:gap-3 items-start hover:shadow-md transition-smooth min-w-0`}
                style={{ ...cardStyle, borderColor: hot ? '#fecaca' : 'var(--border)' }}>
                <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: clear ? '#f0fdf4' : hot ? '#fef2f2' : '#eff6ff' }}>
                  {clear ? <CheckIcon size={18} color="#16a34a" /> : <Icon size={18} color={hot ? '#dc2626' : '#2563eb'} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-2xl font-bold tabular-nums leading-none mt-1" style={{ color: clear ? 'var(--slate)' : 'var(--ink)' }}>{t.n}</span>
                  <span className="block text-sm font-semibold leading-snug mt-1.5" style={{ color: 'var(--ink)' }}>{t.label}</span>
                  <span className="block text-xs mt-0.5 leading-snug" style={{ color: 'var(--slate)' }}>{t.sub}</span>
                </span>
              </Link>
            )
          })}
      </div>
    </section>
  )
}

// ── Today ─────────────────────────────────────────────────────────────────────

function Today({ s }: { s: Summary | null }) {
  if (!s) return null
  const { bookings, tasks } = s.today
  const time = (iso: string) => new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: s.tz })
  const showBookings = canSee(s, 'bookings'), showTasks = canSee(s, 'tasks')
  if (!showBookings && !showTasks) return null
  return (
    <section className={`mb-8 grid ${showBookings && showTasks ? 'md:grid-cols-2' : ''} gap-3`}>
      {showBookings && <div className={`${card} overflow-hidden`} style={cardStyle}>
        <div className="px-5 py-3.5 border-b flex items-center justify-between" style={cardStyle}>
          <h3 className="font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--ink)' }}><CalendarI size={16} color="var(--slate)" /> Today’s bookings</h3>
          <Link href="/admin/bookings" className="text-xs font-semibold" style={{ color: 'var(--coral)' }}>All bookings</Link>
        </div>
        {bookings.length === 0 ? (
          <p className="px-5 py-6 text-sm" style={{ color: 'var(--slate)' }}>No bookings today.</p>
        ) : (
          <ul className="dash-rows">
            {bookings.slice(0, 6).map(b => (
              <li key={b.id} className="px-5 py-3 flex items-center gap-3">
                <span className="text-sm font-semibold tabular-nums w-16 shrink-0" style={{ color: 'var(--ink)' }}>{time(b.starts_at)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm truncate" style={{ color: 'var(--ink)' }}>{b.customer_name || 'Customer'}</span>
                  <span className="block text-xs truncate" style={{ color: 'var(--slate)' }}>{[b.service_name, b.staff_name].filter(Boolean).join(' · ')}</span>
                </span>
                {b.status === 'pending' && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: '#fffbeb', color: '#b45309' }}>Pending</span>}
              </li>
            ))}
            {bookings.length > 6 && <li className="px-5 py-2.5 text-xs" style={{ color: 'var(--slate)' }}>+{bookings.length - 6} more</li>}
          </ul>
        )}
      </div>}

      {showTasks && <div className={`${card} overflow-hidden`} style={cardStyle}>
        <div className="px-5 py-3.5 border-b flex items-center justify-between" style={cardStyle}>
          <h3 className="font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--ink)' }}><ClipboardI size={16} color="var(--slate)" /> Tasks due</h3>
          <Link href="/admin/tasks?bucket=today" className="text-xs font-semibold" style={{ color: 'var(--coral)' }}>All tasks</Link>
        </div>
        {tasks.length === 0 ? (
          <p className="px-5 py-6 text-sm" style={{ color: 'var(--slate)' }}>Nothing due today.</p>
        ) : (
          <ul className="dash-rows">
            {tasks.map(t => (
              <li key={t.id}>
                <Link href={`/admin/tasks?task=${t.id}`} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition-smooth">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm truncate" style={{ color: 'var(--ink)' }}>{t.text}</span>
                    {t.assigned_to && <span className="block text-xs truncate" style={{ color: 'var(--slate)' }}>{t.assigned_to}</span>}
                  </span>
                  {t.overdue
                    ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: '#fef2f2', color: '#dc2626' }}>Overdue</span>
                    : <span className="text-xs shrink-0 tabular-nums" style={{ color: 'var(--slate)' }}>{time(t.due_date)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>}
    </section>
  )
}

// ── Last 30 days ──────────────────────────────────────────────────────────────

function Delta({ now, prev, invert = false }: { now: number; prev: number; invert?: boolean }) {
  if (!prev && !now) return <span className="text-xs" style={{ color: 'var(--slate)' }}>No activity</span>
  if (!prev) return <span className="text-xs" style={{ color: 'var(--slate)' }}>New this period</span>
  const pct = Math.round(((now - prev) / prev) * 100)
  if (pct === 0) return <span className="text-xs" style={{ color: 'var(--slate)' }}>Same as before</span>
  const up = pct > 0
  const good = invert ? !up : up
  return (
    <span className="text-xs font-semibold inline-flex items-center gap-0.5" style={{ color: good ? '#15803d' : '#b91c1c' }}
      aria-label={`${up ? 'Up' : 'Down'} ${Math.abs(pct)}% on the previous 30 days`}>
      <ArrowI up={up} /> {Math.abs(pct)}%
      <span className="font-normal ml-1" style={{ color: 'var(--slate)' }}>vs prior 30d</span>
    </span>
  )
}

function Performance({ s }: { s: Summary | null }) {
  if (!s) return null
  const p = s.perf
  const reports = canSee(s, 'reports')
  const tiles = [
    { feature: 'orders', label: 'Revenue', value: money(p.revenue.now), d: <Delta now={p.revenue.now} prev={p.revenue.prev} />, href: reports ? '/admin/orders/reports' : '/admin/orders' },
    { feature: 'orders', label: 'Orders', value: String(p.orders.now), d: <Delta now={p.orders.now} prev={p.orders.prev} />, href: '/admin/orders' },
    { feature: 'orders', label: 'Avg order', value: money(p.aov.now), d: <Delta now={p.aov.now} prev={p.aov.prev} />, href: reports ? '/admin/orders/reports' : '/admin/orders' },
    { feature: 'inbox', label: 'New chats', value: String(p.conversations.now), d: <Delta now={p.conversations.now} prev={p.conversations.prev} />, href: '/admin/inbox' },
    { feature: 'calls', label: 'Calls', value: String(p.calls.now), d: <Delta now={p.calls.now} prev={p.calls.prev} />, href: canSee(s, 'command_centre') ? '/admin/command-centre' : '/admin/calls' },
    { feature: 'reviews', label: 'Google reviews', value: p.reviews.avgNow != null ? `${p.reviews.avgNow.toFixed(1)}` : '—', suffix: p.reviews.now ? ` from ${p.reviews.now}` : '',
      d: <Delta now={p.reviews.now} prev={p.reviews.prev} />, href: '/admin/reviews', star: p.reviews.avgNow != null },
  ].filter(t => canSee(s, t.feature))
  const chart = canSee(s, 'orders')
  if (!tiles.length) return null
  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between mb-3 gap-3">
        <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Last 30 days</h2>
        {reports && <Link href="/admin/orders/reports" className="text-sm font-semibold" style={{ color: 'var(--coral)' }}>Full reports</Link>}
      </div>
      <div className={`grid grid-cols-2 md:grid-cols-3 ${tiles.length >= 6 ? 'lg:grid-cols-6' : ''} gap-3 mb-3`}>
        {tiles.map(t => (
          <Link key={t.label} href={t.href} className={`${card} p-4 hover:shadow-md transition-smooth min-w-0`} style={cardStyle}>
            <p className={`${eyebrow} mb-1.5 truncate`} style={{ color: 'var(--slate)' }}>{t.label}</p>
            <p className="text-2xl font-bold tabular-nums truncate flex items-center gap-1" style={{ color: 'var(--ink)' }}>
              {t.value}
              {t.star && <StarIcon size={16} color="#eab308" />}
              {t.suffix && <span className="text-xs font-normal" style={{ color: 'var(--slate)' }}>{t.suffix}</span>}
            </p>
            <div className="mt-1 truncate">{t.d}</div>
          </Link>
        ))}
      </div>
      {chart && <RevenueChart daily={p.daily} />}
    </section>
  )
}

// Daily revenue, one bar per day. Single series → one hue, no legend; the
// heading names it. Hover (or tap / focus) a bar for the day's figure.
function RevenueChart({ daily }: { daily: Summary['perf']['daily'] }) {
  const [hover, setHover] = useState<number | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const max = Math.max(0, ...daily.map(d => d.value))
  const total = daily.reduce((a, d) => a + d.value, 0)
  // A tidy top gridline just above the tallest bar.
  const top = (() => {
    if (max <= 0) return 0
    const pow = Math.pow(10, Math.floor(Math.log10(max)))
    return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map(m => m * pow).find(v => v >= max) || max
  })()
  const BAR = '#3b7dd8'
  const h = hover != null ? daily[hover] : null
  return (
    <div className={`${card} p-5`} style={cardStyle}>
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Revenue by day</p>
        <p className="text-xs tabular-nums" style={{ color: 'var(--slate)' }}>
          {h ? <><span style={{ color: 'var(--ink)', fontWeight: 600 }}>{money(h.value, true)}</span> · {h.label}</> : `${money(total)} over 30 days`}
        </p>
      </div>
      {top === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: 'var(--slate)' }}>No orders in the last 30 days.</p>
      ) : (
        <div className="relative" ref={wrap}>
          {/* Recessive grid: baseline, midline and a labelled top line. */}
          <div className="absolute inset-x-0 top-0 h-36 pointer-events-none">
            {[0, 0.5, 1].map(f => (
              <div key={f} className="absolute inset-x-0 border-t" style={{ top: `${(1 - f) * 100}%`, borderColor: f === 0 ? '#e5e7eb' : '#f3f4f6', borderStyle: f === 0 ? 'solid' : 'dashed' }}>
                {f > 0 && <span className="absolute right-0 -top-4 text-[10px] tabular-nums" style={{ color: 'var(--slate)' }}>{money(top * f)}</span>}
              </div>
            ))}
          </div>
          <div className="relative h-36 flex items-end" style={{ gap: 2 }} onMouseLeave={() => setHover(null)} role="list" aria-label="Revenue by day, last 30 days">
            {daily.map((d, i) => {
              const pct = top ? (d.value / top) * 100 : 0
              return (
                <button key={d.day} type="button" role="listitem"
                  className="flex-1 h-full flex items-end cursor-default focus:outline-none"
                  onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} onClick={() => setHover(i)}
                  aria-label={`${d.label}: ${money(d.value, true)}`}>
                  <span className="block w-full transition-all duration-200"
                    style={{
                      height: d.value > 0 ? `max(${pct}%, 3px)` : 0,
                      background: BAR, borderRadius: '4px 4px 0 0',
                      opacity: hover == null || hover === i ? 1 : 0.45,
                    }} />
                </button>
              )
            })}
          </div>
          <div className="flex justify-between mt-2 text-[11px]" style={{ color: 'var(--slate)' }}>
            <span>{daily[0]?.label.replace(/^\w+,?\s*/, '')}</span>
            <span>Today</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Recent activity ───────────────────────────────────────────────────────────

const KIND: Record<string, { icon: (p: any) => React.ReactNode; bg: string; fg: string }> = {
  order: { icon: BoxI, bg: '#eff6ff', fg: '#2563eb' },
  review: { icon: (p: any) => <StarIcon size={p.size} color={p.color} />, bg: '#fefce8', fg: '#a16207' },
  waitlist: { icon: ClockI, bg: '#f5f3ff', fg: '#7c3aed' },
  booking: { icon: CalendarI, bg: '#ecfdf5', fg: '#047857' },
  idea: { icon: (p: any) => <LightbulbIcon size={p.size} color={p.color} />, bg: '#fff4f1', fg: '#ea580c' },
}

function Activity({ s }: { s: Summary | null }) {
  return (
    <div className={`${card} overflow-hidden h-full`} style={cardStyle}>
      <div className="px-5 py-4 border-b" style={cardStyle}>
        <h3 className="font-bold" style={{ color: 'var(--ink)' }}>Recent activity</h3>
      </div>
      {!s ? (
        <div className="p-5 space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-9 rounded-lg animate-pulse" style={{ background: 'var(--canvas)' }} />)}</div>
      ) : s.activity.length === 0 ? (
        <p className="px-5 py-8 text-sm text-center" style={{ color: 'var(--slate)' }}>Orders, reviews, bookings and waitlist sign-ups will show here.</p>
      ) : (
        <ul className="dash-rows">
          {s.activity.map((it, i) => {
            const k = KIND[it.kind] || KIND.order
            const Icon = k.icon
            return (
              <li key={i}>
                <Link href={it.href} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-smooth">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: k.bg }}><Icon size={15} color={k.fg} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{it.title}</span>
                    {it.detail && <span className="block text-xs truncate" style={{ color: 'var(--slate)' }}>{it.detail}</span>}
                  </span>
                  <span className="text-xs shrink-0" style={{ color: 'var(--slate)' }}>{ago(it.at)}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── Feedback board ────────────────────────────────────────────────────────────

function FeedbackStrip({ stats, s }: { stats: { ideas: number; announcements: number; surveys: number; polls: number } | null; s: Summary | null }) {
  const items = [
    { feature: 'ideas', label: 'Ideas', n: stats?.ideas, href: '/', icon: <LightbulbIcon size={16} color="var(--coral)" /> },
    { feature: 'announcements', label: 'Announcements', n: stats?.announcements, href: '/announcements', icon: <MegaphoneIcon size={16} color="var(--coral)" /> },
    { feature: 'surveys', label: 'Surveys', n: stats?.surveys, href: '/admin/surveys', icon: <SurveyIcon size={16} color="var(--coral)" /> },
    { feature: 'polls', label: 'Polls', n: stats?.polls, href: '/admin/polls', icon: <PollIcon size={16} color="var(--coral)" /> },
  ].filter(it => canSee(s, it.feature))
  if (!items.length) return null
  return (
    <section className="mb-8">
      <h2 className={`${eyebrow} mb-3`} style={{ color: 'var(--slate)' }}>Feedback board</h2>
      <div className={`${card} grid grid-cols-2 md:grid-cols-4`} style={cardStyle}>
        {items.map((it, i) => (
          <Link key={it.label} href={it.href}
            className={`flex items-center gap-2.5 px-4 py-3.5 hover:bg-gray-50 transition-smooth ${i % 2 ? '' : 'border-r'} ${i < 2 ? 'border-b md:border-b-0' : ''} ${i === 1 ? 'md:border-r' : ''}`}
            style={cardStyle}>
            {it.icon}
            <span className="text-sm flex-1 truncate" style={{ color: 'var(--slate)' }}>{it.label}</span>
            <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{stats ? it.n : '…'}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
