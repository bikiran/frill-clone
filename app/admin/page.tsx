'use client'
import Greeting from '@/components/Greeting'
import CountUp from '@/components/CountUp'
import LinkClicksCard from '@/components/LinkClicksCard'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { authFetch } from '@/lib/auth-fetch'
import { parseDbTime } from '@/lib/db-time'
import Link from 'next/link'

import { LightbulbIcon, MegaphoneIcon, SurveyIcon, PollIcon, StarIcon, TicketIcon, CheckIcon } from '@/components/Icons'
import SetupChecklist, { readSetupLink, setupWorthLoading, type SetupLink } from '@/components/SetupChecklist'
import EmptyScroll from '@/components/EmptyScroll'
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
      toReturn: { number: string; name: string | null; conversationId: string | null; at: string; attempts: number; voicemail?: boolean; textedBack?: boolean }[]
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
  const ms = Date.now() - parseDbTime(iso)
  if (!isFinite(ms)) return ''
  const m = Math.round(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(parseDbTime(iso)).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
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
    <main className="dh">
      <style>{DASH_CSS}</style>
      <div className="dh-in">
        <Greeting name={user?.user_metadata?.display_name || user?.email?.split('@')[0]} />

        {summaryError && !summary && <div className="dh-err" role="alert">{summaryError}</div>}

        {setupTop && checklist}
        <NeedsAttention s={summary} refreshing={refreshing} />
        <Today s={summary} />
        <Performance s={summary} />

        {sales && sales.count > 0 && canSee(summary, 'payments') && (
          <section className="dh-sec">
            <div className="dh-h"><h2>Sales logged in Colvy</h2><span className="dh-h-sub">Last 30 days</span></div>
            <div className="dh-sales">
              <div className="dh-card dh-pad">
                <p className="dh-label">Revenue logged</p>
                <p className="dh-big">{money(sales.total)}</p>
                <p className="dh-sub">{plural(sales.count, 'sale')} recorded from conversations</p>
              </div>
              {([['By team member', sales.bySeller], ['By payment method', sales.byMethod]] as [string, [string, number][]][]).map(([title, list]) => (
                <div key={title} className="dh-card dh-pad">
                  <p className="dh-label" style={{ marginBottom: 12 }}>{title}</p>
                  {list.map(([name, amt]) => (
                    <div key={name} className="dh-share">
                      <div className="dh-share-row"><span className="n">{name}</span><span className="v">{money(amt)}</span></div>
                      <span className="dh-share-bar" aria-hidden="true"><i style={{ width: `${sales.total ? Math.max(3, Math.round((amt / sales.total) * 100)) : 0}%` }} /></span>
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
            <div className={`dh-sec dh-two${links && activity ? ' both' : ''}`}>
              {links && <div className="min-w-0"><LinkClicksCard companyId={companyId} /></div>}
              {activity && <div className="min-w-0"><Activity s={summary} /></div>}
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
  const [allCallBack, setAllCallBack] = useState(false)
  // Missed calls stay until someone gets back to the caller, rather than
  // vanishing at midnight. The tile opens the list of callers still waiting
  // (under the tiles); the call log shows every incoming call of the week,
  // voicemails included, since its "missed" filter leaves those out. Only this
  // list knows who is still waiting, so it shows five and the rest on request.
  const mo = a?.missedOutcome
  const cc = canSee(s, 'command_centre')
  const missedHref = cc ? '/admin/command-centre?tab=logs&range=7d&dir=inbound' : '/admin/calls?filter=inbound'
  const callBack = mo?.toReturn || []
  const callBackShown = allCallBack ? callBack : callBack.slice(0, 5)
  const notSent = mo ? mo.toCallBack - callBack.length : 0
  const tiles = a ? [
    { key: 'unread', feature: 'inbox', label: 'Unread messages', n: a.unread, urgent: true, href: '/admin/inbox?view=unread', icon: ChatI,
      sub: a.unread ? 'Customers waiting on a reply' : 'Inbox is caught up' },
    mo ? { key: 'calls', feature: 'calls', label: 'Missed calls to return', n: mo.toCallBack, urgent: true, href: callBack.length ? '#call-back' : missedHref, icon: PhoneMissI,
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
  // Areas that need someone get a tile; the clear ones fold into one quiet
  // "all clear" card underneath, each still a link.
  const busy = tiles.filter(t => t.n > 0)
  const clear = tiles.filter(t => t.n === 0)
  const outstanding = busy.length

  return (
    <section className="dh-sec">
      <div className="dh-h">
        <h2>Needs attention</h2>
        {a && (
          <>
            <span className={`dh-pill ${outstanding ? 'warn' : 'ok'}`}>{outstanding ? `${plural(outstanding, 'area')} to look at` : 'All clear'}</span>
            {refreshing && <span className="dh-updating" aria-live="polite"><i />Updating</span>}
          </>
        )}
      </div>
      {(!a || busy.length > 0) && (
        <div className="dh-tiles">
          {!a ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="dh-card dh-skel" style={{ height: 132 }} />)
            : busy.map(t => {
              const hot = t.urgent
              const Icon = t.icon
              return (
                <Link key={t.key} href={t.href} title={'hint' in t ? t.hint : undefined} className={`dh-card dh-tile${hot ? ' hot' : ''}`}>
                  <span className="dh-tile-top">
                    <span className="dh-ic"><Icon size={18} color={hot ? '#dc2626' : '#2563eb'} /></span>
                    {hot && <span className="dh-dot" aria-label="Needs you" />}
                  </span>
                  <span className="dh-n">{t.n}</span>
                  <span className="dh-tile-l">{t.label}</span>
                  <span className="dh-tile-s">{t.sub}</span>
                </Link>
              )
            })}
        </div>
      )}
      {a && clear.length > 0 && (
        <div className={`dh-card dh-clear${busy.length ? '' : ' alone'}`}>
          <span className="dh-ic" style={{ background: '#f0fdf4' }}><CheckIcon size={18} color="#16a34a" /></span>
          <div className="min-w-0 flex-1">
            <p className="dh-clear-t">{busy.length ? 'All clear here' : 'You’re all caught up'}</p>
            <div className="dh-clear-list">
              {clear.map(t => <Link key={t.key} href={t.href} className="dh-clear-i" title={t.sub}>{t.label}</Link>)}
            </div>
          </div>
        </div>
      )}
      {callBack.length > 0 && canSee(s, 'calls') && (
        <div id="call-back" className="dh-card dh-list" style={{ marginTop: 12, scrollMarginTop: 80 }}>
          <div className="dh-list-h">
            <h3><span className="dh-ic sm" style={{ background: '#fef2f2' }}><PhoneMissI size={15} color="#dc2626" /></span>Still to call back</h3>
            <Link href={missedHref} className="dh-link">Call log</Link>
          </div>
          <ul className="dh-rows">
            {callBackShown.map(r => {
              const detail = [r.name ? r.number : '', r.attempts > 1 ? plural(r.attempts, 'missed call') : '', r.voicemail ? 'Voicemail' : '', r.textedBack ? 'Texted back' : ''].filter(Boolean).join(' · ')
              const body = (
                <>
                  <span className="dh-av" style={avatarStyle(r.name || r.number)}>{initialsOf(r.name || '')}</span>
                  <span className="min-w-0 flex-1">
                    <span className="dh-row-t">{r.name || r.number}</span>
                    {detail && <span className="dh-row-s">{detail}</span>}
                  </span>
                  <span className="dh-row-at">{ago(r.at)}</span>
                </>
              )
              // Their conversation, where the call (and any text back) sits; else ring them.
              return (
                <li key={r.number}>
                  {r.conversationId && canSee(s, 'inbox')
                    ? <Link href={`/admin/inbox?conversation=${r.conversationId}`} className="dh-row">{body}</Link>
                    : <a href={`tel:${r.number}`} className="dh-row">{body}</a>}
                </li>
              )
            })}
            {callBack.length > 5 && (
              <li>
                <button type="button" onClick={() => setAllCallBack(v => !v)} className="dh-more">
                  {allCallBack ? 'Show fewer' : `Show ${callBack.length - 5} more`}
                </button>
              </li>
            )}
            {/* Past the 50 the summary sends (or an older cached summary's 5). */}
            {notSent > 0 && (allCallBack || callBack.length <= 5) && (
              <li className="dh-row-note">{plural(notSent, 'older caller')} not listed</li>
            )}
          </ul>
        </div>
      )}
    </section>
  )
}

// ── Today ─────────────────────────────────────────────────────────────────────

function Today({ s }: { s: Summary | null }) {
  if (!s) return null
  const { bookings, tasks } = s.today
  const time = (iso: string) => new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: s.tz }).replace(':00', '').replace(/\s/g, '').toLowerCase()
  const showBookings = canSee(s, 'bookings'), showTasks = canSee(s, 'tasks')
  if (!showBookings && !showTasks) return null
  return (
    <section className="dh-sec">
      <div className="dh-h"><h2>Today</h2></div>
      <div className={`dh-two${showBookings && showTasks ? ' even' : ''}`}>
        {showBookings && <div className="dh-card dh-list">
          <div className="dh-list-h">
            <h3><span className="dh-ic sm" style={{ background: '#ecfdf5' }}><CalendarI size={15} color="#047857" /></span>Bookings<span className="dh-count">{bookings.length}</span></h3>
            <Link href="/admin/bookings" className="dh-link">All bookings</Link>
          </div>
          {bookings.length === 0 ? (
            <EmptyScroll compact kinds={['calendar']} title="No bookings today" line="Today’s appointments show up here." />
          ) : (
            <ul className="dh-rows">
              {bookings.slice(0, 6).map(b => (
                <li key={b.id} className="dh-row static">
                  <span className="dh-time">{time(b.starts_at)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="dh-row-t">{b.customer_name || 'Customer'}</span>
                    <span className="dh-row-s">{[b.service_name, b.staff_name].filter(Boolean).join(' · ')}</span>
                  </span>
                  {b.status === 'pending' && <span className="dh-tag" style={tint('#f59e0b')}>Pending</span>}
                </li>
              ))}
              {bookings.length > 6 && <li className="dh-row-note">+{bookings.length - 6} more</li>}
            </ul>
          )}
        </div>}

        {showTasks && <div className="dh-card dh-list">
          <div className="dh-list-h">
            <h3><span className="dh-ic sm" style={{ background: '#f5f3ff' }}><ClipboardI size={15} color="#7c3aed" /></span>Tasks due<span className="dh-count">{tasks.length}</span></h3>
            <Link href="/admin/tasks?bucket=today" className="dh-link">All tasks</Link>
          </div>
          {tasks.length === 0 ? (
            <EmptyScroll compact kinds={['task']} title="Nothing due today" line="Tasks due today, and any that are late, show up here." />
          ) : (
            <ul className="dh-rows">
              {tasks.map(t => (
                <li key={t.id}>
                  <Link href={`/admin/tasks?task=${t.id}`} className="dh-row">
                    <span className={`dh-check${t.overdue ? ' late' : ''}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="dh-row-t">{t.text}</span>
                      {t.assigned_to && <span className="dh-row-s">{t.assigned_to}</span>}
                    </span>
                    {t.overdue
                      ? <span className="dh-tag" style={tint('#dc2626')}>Overdue</span>
                      : <span className="dh-row-at">{time(t.due_date)}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>}
      </div>
    </section>
  )
}

// ── Last 30 days ──────────────────────────────────────────────────────────────

function Delta({ now, prev, invert = false }: { now: number; prev: number; invert?: boolean }) {
  if (!prev && !now) return <span className="dh-delta flat">No activity</span>
  if (!prev) return <span className="dh-delta flat">New this period</span>
  const pct = Math.round(((now - prev) / prev) * 100)
  if (pct === 0) return <span className="dh-delta flat">Same as before</span>
  const up = pct > 0
  const good = invert ? !up : up
  return (
    <span className={`dh-delta ${good ? 'up' : 'down'}`} title="Compared with the 30 days before"
      aria-label={`${up ? 'Up' : 'Down'} ${Math.abs(pct)}% on the previous 30 days`}>
      <ArrowI up={up} size={11} /> {Math.abs(pct)}%
    </span>
  )
}

function Performance({ s }: { s: Summary | null }) {
  if (!s) return null
  const p = s.perf
  const reports = canSee(s, 'reports')
  const tiles = [
    { feature: 'orders', label: 'Revenue', value: <CountUp id="dash-revenue" value={p.revenue.now} format={n => money(n)} />, d: <Delta now={p.revenue.now} prev={p.revenue.prev} />, href: reports ? '/admin/orders/reports' : '/admin/orders' },
    { feature: 'orders', label: 'Orders', value: <CountUp id="dash-orders" value={p.orders.now} />, d: <Delta now={p.orders.now} prev={p.orders.prev} />, href: '/admin/orders' },
    { feature: 'orders', label: 'Average order', value: <CountUp id="dash-aov" value={p.aov.now} format={n => money(n)} />, d: <Delta now={p.aov.now} prev={p.aov.prev} />, href: reports ? '/admin/orders/reports' : '/admin/orders' },
    { feature: 'inbox', label: 'New chats', value: <CountUp id="dash-chats" value={p.conversations.now} />, d: <Delta now={p.conversations.now} prev={p.conversations.prev} />, href: '/admin/inbox' },
    { feature: 'calls', label: 'Calls', value: <CountUp id="dash-calls" value={p.calls.now} />, d: <Delta now={p.calls.now} prev={p.calls.prev} />, href: canSee(s, 'command_centre') ? '/admin/command-centre' : '/admin/calls' },
    { feature: 'reviews', label: 'Google reviews', value: p.reviews.avgNow != null ? `${p.reviews.avgNow.toFixed(1)}` : '—', suffix: p.reviews.now ? `from ${p.reviews.now}` : '',
      d: <Delta now={p.reviews.now} prev={p.reviews.prev} />, href: '/admin/reviews', star: p.reviews.avgNow != null },
  ].filter(t => canSee(s, t.feature))
  const chart = canSee(s, 'orders')
  if (!tiles.length) return null
  return (
    <section className="dh-sec">
      <div className="dh-h">
        <h2>Last 30 days</h2>
        <span className="dh-h-sub">Compared with the 30 days before</span>
        {reports && <Link href="/admin/orders/reports" className="cv-btn dh-h-btn">Full reports</Link>}
      </div>
      <div className={`cascade dh-kpis${tiles.length >= 6 ? ' six' : ''}`}>
        {tiles.map(t => (
          <Link key={t.label} href={t.href} className="dh-card dh-kpi">
            <span className="dh-label">{t.label}</span>
            <span className="dh-kpi-v">
              {t.value}
              {t.star && <StarIcon size={17} color="#eab308" />}
              {t.suffix && <small>{t.suffix}</small>}
            </span>
            {t.d}
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
  const BAR = 'var(--coral, #ff7a6b)'
  const h = hover != null ? daily[hover] : null
  return (
    <div className="dh-card dh-pad" style={{ marginTop: 12 }}>
      <div className="dh-chart-h">
        <div>
          <p className="dh-label">Revenue by day</p>
          <p className="dh-chart-v">{h ? money(h.value, true) : money(total)}</p>
        </div>
        <p className="dh-chart-when">{h ? h.label : 'Last 30 days'}</p>
      </div>
      {top === 0 ? (
        <p className="dh-chart-empty">No orders in the last 30 days.</p>
      ) : (
        <div className="relative" ref={wrap}>
          {/* Recessive grid: baseline, midline and a labelled top line. */}
          <div className="absolute inset-x-0 top-0 h-36 pointer-events-none">
            {[0, 0.5, 1].map(f => (
              <div key={f} className="absolute inset-x-0 border-t" style={{ top: `${(1 - f) * 100}%`, borderColor: f === 0 ? '#e4e4e7' : '#f4f4f5', borderStyle: f === 0 ? 'solid' : 'dashed' }}>
                {f > 0 && <span className="absolute right-0 -top-4 text-[10.5px] tabular-nums" style={{ color: '#a1a1aa' }}>{money(top * f)}</span>}
              </div>
            ))}
          </div>
          {/* Bars rise from the baseline, left to right, when the chart appears. */}
          <div className="relative h-36 flex items-end" style={{ gap: 3 }} onMouseLeave={() => setHover(null)} role="list" aria-label="Revenue by day, last 30 days" data-no-press>
            {daily.map((d, i) => {
              const pct = top ? (d.value / top) * 100 : 0
              return (
                <button key={d.day} type="button" role="listitem"
                  className="dh-barbtn flex-1 h-full flex items-end cursor-default focus:outline-none"
                  onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} onClick={() => setHover(i)}
                  aria-label={`${d.label}: ${money(d.value, true)}`}>
                  <span className="dash-bar block w-full transition-all duration-200"
                    style={{
                      height: d.value > 0 ? `max(${pct}%, 4px)` : 0,
                      background: BAR, borderRadius: '6px 6px 2px 2px',
                      opacity: hover == null || hover === i ? 1 : 0.35,
                      transformOrigin: 'bottom', animation: `dashBarUp .55s cubic-bezier(.2,.8,.2,1) ${i * 14}ms both`,
                    }} />
                </button>
              )
            })}
          </div>
          <div className="flex justify-between mt-2 text-[11.5px]" style={{ color: '#a1a1aa' }}>
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
    <div className="dh-card dh-list" style={{ height: '100%' }}>
      <div className="dh-list-h"><h3>Recent activity</h3></div>
      {!s ? (
        <div style={{ padding: '6px 18px 18px', display: 'grid', gap: 10 }}>{Array.from({ length: 4 }).map((_, i) => <div key={i} className="dh-skel" style={{ height: 40, borderRadius: 12 }} />)}</div>
      ) : s.activity.length === 0 ? (
        <EmptyScroll compact kinds={['order', 'review', 'calendar']} title="Nothing yet" line="Orders, reviews, bookings and waitlist sign-ups show up here." />
      ) : (
        <ul className="dh-rows">
          {s.activity.map((it, i) => {
            const k = KIND[it.kind] || KIND.order
            const Icon = k.icon
            return (
              <li key={i}>
                <Link href={it.href} className="dh-row">
                  <span className="dh-ic sm round" style={{ background: k.bg }}><Icon size={15} color={k.fg} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="dh-row-t">{it.title}</span>
                    {it.detail && <span className="dh-row-s">{it.detail}</span>}
                  </span>
                  <span className="dh-row-at">{ago(it.at)}</span>
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
    { feature: 'ideas', label: 'Ideas', n: stats?.ideas, href: '/', icon: <LightbulbIcon size={17} color="#ea580c" />, bg: '#fff4f1' },
    { feature: 'announcements', label: 'Announcements', n: stats?.announcements, href: '/announcements', icon: <MegaphoneIcon size={17} color="#db2777" />, bg: '#fdf2f8' },
    { feature: 'surveys', label: 'Surveys', n: stats?.surveys, href: '/admin/surveys', icon: <SurveyIcon size={17} color="#0d9488" />, bg: '#f0fdfa' },
    { feature: 'polls', label: 'Polls', n: stats?.polls, href: '/admin/polls', icon: <PollIcon size={17} color="#4f46e5" />, bg: '#eef2ff' },
  ].filter(it => canSee(s, it.feature))
  if (!items.length) return null
  return (
    <section className="dh-sec">
      <div className="dh-h"><h2>Feedback board</h2></div>
      <div className="dh-fb">
        {items.map(it => (
          <Link key={it.label} href={it.href} className="dh-card dh-fb-i">
            <span className="dh-ic" style={{ background: it.bg }}>{it.icon}</span>
            <span className="dh-fb-l">{it.label}</span>
            <span className="dh-fb-n">{stats ? it.n : '…'}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

const tint = (c: string) => ({ ['--t' as any]: c }) as React.CSSProperties
const initialsOf = (n: string) => n.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '#'
const avatarStyle = (n: string): React.CSSProperties => {
  let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % 360
  return { background: `hsl(${h} 60% 92%)`, color: `hsl(${h} 45% 36%)` }
}

// The dashboard look: big bold section titles, white cards on a soft ring,
// tinted icon tiles, pill tags.
const DASH_CSS = `
.dh{padding:28px 28px 48px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.dh-in{max-width:1152px;margin:0 auto}
.dh .cv-greet h1{font-size:34px!important;font-weight:800!important;letter-spacing:-.03em!important}
.dh-sec{margin-bottom:34px}
.dh-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.dh-h h2{margin:0;font-size:22px;font-weight:800;letter-spacing:-.02em;color:var(--ink)}
.dh-h-sub{font-size:13.5px;color:#8e8e93}
.dh-h-btn{margin-left:auto;height:34px!important;padding:0 14px!important;font-size:13.5px!important}
.dh-pill{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:999px;font-size:12.5px;font-weight:600}
.dh-pill::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor}
.dh-pill.warn{background:#fef2f2;color:#b91c1c}
.dh-pill.ok{background:#f0fdf4;color:#15803d}
.dh-updating{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:#8e8e93}
.dh-updating i{width:6px;height:6px;border-radius:50%;background:var(--coral);animation:dhPulse 1.2s ease-in-out infinite}
.dh-err{margin-bottom:20px;padding:12px 16px;border-radius:16px;background:#fef2f2;color:#b91c1c;font-size:14px}
.dh-card{background:#fff;border-radius:20px;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04);text-decoration:none;color:inherit;min-width:0}
a.dh-card{transition:box-shadow .2s ease,transform .2s cubic-bezier(.22,1,.36,1)}
a.dh-card:hover{box-shadow:0 0 0 1px rgba(0,0,0,.07),0 12px 28px -14px rgba(0,0,0,.25);transform:translateY(-1px)}
.dh-pad{padding:18px 20px}
.dh-skel{background:#f4f4f5;box-shadow:none;animation:dhPulse 1.4s ease-in-out infinite}
.dh-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.dh-tile{display:flex;flex-direction:column;align-items:flex-start;padding:16px 18px;min-height:132px;box-sizing:border-box}
.dh-tile-top{display:flex;align-items:center;justify-content:space-between;width:100%}
.dh-ic{width:38px;height:38px;border-radius:12px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;background:#eff6ff}
.dh-ic.sm{width:30px;height:30px;border-radius:10px}
.dh-ic.round{border-radius:50%}
.dh-tile.hot .dh-ic{background:#fef2f2}
.dh-tile.clear .dh-ic{background:#f0fdf4}
.dh-dot{width:8px;height:8px;border-radius:50%;background:#ef4444;box-shadow:0 0 0 4px #fee2e2}
.dh-n{margin-top:12px;font-size:30px;font-weight:800;letter-spacing:-.02em;line-height:1;color:var(--ink);font-variant-numeric:tabular-nums}
.dh-tile.clear .dh-n{color:#a1a1aa}
.dh-tile-l{margin-top:7px;font-size:14.5px;font-weight:600;color:var(--ink);line-height:1.3}
.dh-tile-s{margin-top:3px;font-size:12.5px;color:#8e8e93;line-height:1.4}
.dh-clear{display:flex;align-items:flex-start;gap:14px;margin-top:12px;padding:14px 16px}
.dh-clear.alone{margin-top:0;padding:18px 20px}
.dh-clear-t{margin:2px 0 8px;font-size:14.5px;font-weight:600;color:var(--ink)}
.dh-clear.alone .dh-clear-t{font-size:16px}
.dh-clear-list{display:flex;flex-wrap:wrap;gap:6px}
.dh-clear-i{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 11px;border-radius:999px;background:#f4f4f5;color:#52525b;font-size:13px;font-weight:500;text-decoration:none;transition:background-color .15s,color .15s}
.dh-clear-i::before{content:'';width:5px;height:9px;margin:-2px 2px 0 0;border:solid #16a34a;border-width:0 2px 2px 0;transform:rotate(45deg)}
.dh-clear-i:hover{background-color:#ececef;color:#18181b}
.dh-list{overflow:hidden}
.dh-list-h{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px 18px 8px}
.dh-list-h h3{margin:0;display:flex;align-items:center;gap:10px;font-size:15.5px;font-weight:700;color:var(--ink)}
.dh-count{min-width:22px;height:22px;padding:0 7px;box-sizing:border-box;border-radius:999px;background:#f4f4f5;color:#52525b;font-size:12px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
.dh-link{height:30px;padding:0 12px;border-radius:999px;background:#f4f4f5;color:#18181b;font-size:13px;font-weight:600;text-decoration:none;display:inline-flex;align-items:center;white-space:nowrap;transition:background-color .15s}
.dh-link:hover{background-color:#ececef}
.dh-rows{list-style:none;margin:0;padding:4px 8px 10px}
.dh-row{display:flex;align-items:center;gap:12px;padding:10px 10px;border-radius:14px;text-decoration:none;color:inherit;transition:background-color .12s ease}
a.dh-row:hover{background-color:#f7f7f8}
.dh-row-t{display:block;font-size:14px;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dh-row-s{display:block;margin-top:1px;font-size:12.5px;color:#8e8e93;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dh-row-at{flex-shrink:0;font-size:12.5px;color:#a1a1aa;font-variant-numeric:tabular-nums}
.dh-row-note{padding:6px 10px 2px;font-size:12.5px;color:#8e8e93}
.dh-more{display:block;width:100%;text-align:left;padding:9px 10px;border:none;border-radius:12px;background:none;font:inherit;font-size:13px;font-weight:600;color:var(--coral);cursor:pointer}
.dh-more::before{display:none}
.dh-more:hover{background-color:#f7f7f8}
.dh-av{width:34px;height:34px;border-radius:50%;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:700}
.dh-time{width:58px;flex-shrink:0;font-size:14px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums}
.dh-check{width:18px;height:18px;flex-shrink:0;border-radius:50%;border:1.5px solid #d4d4d8}
.dh-check.late{border-color:#fca5a5}
.dh-tag{flex-shrink:0;display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border-radius:999px;font-size:12px;font-weight:600;background:color-mix(in srgb,var(--t) 12%,#fff);color:color-mix(in srgb,var(--t) 78%,#000)}
.dh-tag::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--t)}
.dh-two{display:grid;gap:12px}
.dh-two.even{grid-template-columns:repeat(2,minmax(0,1fr))}
.dh-two.both{grid-template-columns:minmax(0,3fr) minmax(0,2fr)}
.dh-label{display:block;margin:0;font-size:13.5px;font-weight:600;color:#71717a}
.dh-big{margin:8px 0 2px;font-size:32px;font-weight:800;letter-spacing:-.02em;color:var(--ink);font-variant-numeric:tabular-nums}
.dh-sub{margin:0;font-size:12.5px;color:#8e8e93}
.dh-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.dh-kpis.six{grid-template-columns:repeat(6,minmax(0,1fr))}
.dh-kpi{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:16px 18px}
.dh-kpi-v{display:flex;align-items:center;gap:5px;max-width:100%;font-size:26px;font-weight:800;letter-spacing:-.02em;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden}
.dh-kpi-v small{font-size:12.5px;font-weight:500;color:#8e8e93;letter-spacing:0}
.dh-delta{display:inline-flex;align-items:center;gap:3px;height:22px;padding:0 8px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap}
.dh-delta.up{background:#f0fdf4;color:#15803d}
.dh-delta.down{background:#fef2f2;color:#b91c1c}
.dh-delta.flat{background:#f4f4f5;color:#71717a;font-weight:500}
.dh-chart-h{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:18px}
.dh-chart-v{margin:6px 0 0;font-size:26px;font-weight:800;letter-spacing:-.02em;color:var(--ink);font-variant-numeric:tabular-nums}
.dh-chart-when{margin:0;font-size:13px;color:#8e8e93}
.dh-chart-empty{margin:0;padding:32px 0;text-align:center;font-size:14px;color:#8e8e93}
.dh-sales{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.dh-share{margin-bottom:12px}
.dh-share:last-child{margin-bottom:0}
.dh-share-row{display:flex;justify-content:space-between;gap:10px;font-size:14px}
.dh-share-row .n{color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dh-share-row .v{font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap}
.dh-share-bar{display:block;height:6px;margin-top:6px;border-radius:999px;background:#f4f4f5;overflow:hidden}
.dh-share-bar i{display:block;height:100%;border-radius:999px;background:var(--coral)}
.dh-fb{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.dh-fb-i{display:flex;align-items:center;gap:12px;padding:14px 16px}
.dh-fb-l{flex:1;min-width:0;font-size:14.5px;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dh-fb-n{font-size:18px;font-weight:800;color:var(--ink);font-variant-numeric:tabular-nums}
@keyframes dashBarUp{from{transform:scaleY(0)}to{transform:none}}
@keyframes dhPulse{0%,100%{opacity:1}50%{opacity:.5}}
@media(max-width:1024px){.dh-kpis.six{grid-template-columns:repeat(3,minmax(0,1fr))}.dh-two.both{grid-template-columns:1fr}}
@media(max-width:820px){.dh-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.dh-two.even,.dh-sales{grid-template-columns:1fr}.dh-fb{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:640px){
  .dh{padding:18px 14px 40px}
  .dh .cv-greet h1{font-size:28px!important}
  .dh-sec{margin-bottom:28px}
  .dh-h h2{font-size:20px}
  .dh-h-sub{display:none}
  .dh-tile{min-height:0;padding:14px}
  .dh-n{font-size:26px;margin-top:10px}
  .dh-tile-l{font-size:13.5px}
  .dh-kpis,.dh-kpis.six{grid-template-columns:repeat(2,minmax(0,1fr))}
  .dh-kpi{padding:14px}
  .dh-kpi-v{font-size:22px}
}
@media (prefers-reduced-motion: reduce){.dash-bar,.dh-skel,.dh-updating i{animation:none!important}a.dh-card:hover{transform:none}}
`
