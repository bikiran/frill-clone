'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { resolveCompanyUser } from '@/lib/client-cache'
import { readLocal, writeLocal } from '@/lib/local-cache'
import { SkeletonList } from '@/components/Skeleton'
import WaitlistAddModal from '@/components/WaitlistAddModal'
import Pagination, { usePagination } from '@/components/Pagination'
import { confirmDialog } from '@/components/ConfirmDialog'
import { waitlistItemKey } from '@/lib/waitlist-keys'
import { WAITLIST_SEEN_KEY, resolveNewSince, collectNewIds, isTaggedNew, countNew, sortNewFirst } from '@/lib/waitlist-new'
import { isAiAdded, countAiAdded } from '@/lib/waitlist-ai'
import { AiAddedPill, AiSpark, AI_VIOLET } from '@/components/AiAddedBadge'
import { GearIcon, PlusIcon, ChatIcon, TagIcon, XIcon, EditIcon, ExternalIcon, ChevronDownIcon } from '@/components/booking/icons'
import EmptyScroll from '@/components/EmptyScroll'

// Back-in-stock waitlists. Customers who asked for something that's out of
// stock are grouped by item; when it's back, everyone waiting gets one SMS —
// automatically for products linked to WooCommerce or Shopify, or with "Notify now".

const DEFAULT_TEMPLATE = 'Hi {name}, good news — {item} is back in stock at {business}! {link} Reply STOP to opt out.'
const OPEN = ['waiting', 'queued', 'sending', 'failed']

const STATUS_PILL: Record<string, { label: string; c: string }> = {
  waiting: { label: 'Waiting', c: '#3b82f6' },
  queued: { label: 'Sends at 9am', c: '#f59e0b' },
  sending: { label: 'Sending…', c: '#8b5cf6' },
  notified: { label: 'Notified', c: '#22c55e' },
  failed: { label: 'Failed', c: '#ef4444' },
  cancelled: { label: 'Removed', c: '#a1a1aa' },
}

// A dot tag or tile tinted from one colour.
const tint = (c: string) => ({ ['--t' as any]: c }) as React.CSSProperties
const HUES = ['#f97316', '#8b5cf6', '#06b6d4', '#ec4899', '#22c55e', '#3b82f6', '#eab308', '#ef4444']
const hueOf = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return HUES[h % HUES.length] }
const initialsOf = (s: string) => s.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?'

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const t = data?.session?.access_token
  return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
}

const groupKey = (e: any) => { const k = waitlistItemKey(e); return k ? `p:${k}` : `n:${String(e.item_name || '').trim().toLowerCase()}` }
// Only real web links open in a new tab (staff can type an item link by hand).
const webUrl = (u?: string | null) => (u && /^https?:\/\//i.test(u) ? u : null)
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
const money = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)
const isWaiting = (e: any) => e.status === 'waiting' || e.status === 'queued'
// In the tab being viewed, and matching the search (q: lower-cased, trimmed).
const inView = (e: any, tab: string, newIds: ReadonlySet<string>, q: string) =>
  (tab === 'all' || (tab === 'new' ? isTaggedNew(e, newIds) : tab === 'waiting' ? OPEN.includes(e.status) : e.status === 'notified'))
  && (!q || [e.item_name, e.customer_name, e.phone, e.email].some(v => String(v || '').toLowerCase().includes(q)))

export default function WaitlistsPage() {
  const router = useRouter()
  const [companyId, setCompanyId] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [entries, setEntries] = useState<any[]>([])
  const [stock, setStock] = useState<Record<string, any>>({})
  const [settings, setSettings] = useState<any>({ auto_notify: true, template: DEFAULT_TEMPLATE, timezone: 'Australia/Melbourne' })
  const [loading, setLoading] = useState(true)
  const [setupMsg, setSetupMsg] = useState('')
  const [tab, setTab] = useState<'waiting' | 'notified' | 'all' | 'new'>('waiting')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<string | null>(null)

  // "New" tags: sign-ups since the previous visit, collected as entries load
  // and kept for this whole visit (notifying or editing doesn't clear them).
  const [newSince, setNewSince] = useState<string | null>(null)
  const [firstVisit, setFirstVisit] = useState(false)
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(() => new Set())
  const newSinceRef = useRef<string | null>(null)

  // Opening Waitlists clears the side-menu "new sign-ups" badge. The previous
  // visit is read first — it's what this visit's "New" tags are judged from.
  useEffect(() => {
    if (!newSinceRef.current) {
      let prev: string | null = null
      try { prev = localStorage.getItem(WAITLIST_SEEN_KEY) } catch {}
      const r = resolveNewSince(prev)
      newSinceRef.current = r.since
      setNewSince(r.since); setFirstVisit(r.firstVisit)
    }
    try { localStorage.setItem(WAITLIST_SEEN_KEY, new Date().toISOString()); window.dispatchEvent(new Event('waitlist-seen')) } catch {}
  }, [])
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  // "Added by AI" filter, and ?entry= (a link from an AI note or the agents' activity) to open one entry.
  const [aiOnly, setAiOnly] = useState(false)
  const [focusId, setFocusId] = useState<string | null>(null)
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search)
      if (q.get('filter') === 'ai') setAiOnly(true)
      if (q.get('entry')) setFocusId(q.get('entry'))
    } catch {}
  }, [])

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 5000) }

  const userIdRef = useRef<string | null>(null)
  const stockRef = useRef(stock)
  stockRef.current = stock
  // Two steps so the list never waits on WooCommerce: the database first
  // (sizes priced from their product for now), then live size prices from the
  // store, merged in when they arrive. The result is kept on this device so the
  // next visit paints straight away.
  const load = async (cid: string) => {
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/waitlist?companyId=${cid}&live=0`, { headers })
      const d = await res.json()
      if (d.needsMigration) setSetupMsg(d.error)
      else if (!res.ok) { setSetupMsg(d.error || 'Could not load waitlists'); return }
      else setSetupMsg('')
      const fresh: Record<string, any> = d.stock || {}
      // Keep a live size price we already know until the new one arrives, so
      // prices don't flick to "from $…" and back.
      const known = stockRef.current
      const shown = { ...fresh }
      for (const k in shown) if (shown[k]?.approx && known[k] && !known[k].approx) shown[k] = known[k]
      setStock(shown)
      setEntries(d.entries || [])
      // Tag from the server's list (not the cached one) so the count matches the badge.
      setNewIds(prev => collectNewIds(prev, d.entries || [], newSinceRef.current))
      if (d.settings) setSettings(d.settings)
      if (d.businessName) setBusinessName(d.businessName)
      setLoading(false)
      const snap = { entries: d.entries || [], stock: fresh, settings: d.settings, businessName: d.businessName || '' }
      writeLocal('waitlists', userIdRef.current, cid, snap)
      const approxIds = Object.keys(fresh).filter(k => fresh[k]?.approx)
      if (!approxIds.length) return
      const lr = await fetch(`/api/waitlist?companyId=${cid}&op=variation-stock&ids=${approxIds.join(',')}`, { headers })
      const ld = await lr.json().catch(() => ({}))
      const liveStock: Record<string, any> = ld.stock || {}
      const merged = { ...fresh }
      for (const k of approxIds) merged[k] = (liveStock[k] && !liveStock[k].approx) ? liveStock[k] : (known[k] && !known[k].approx ? known[k] : fresh[k])
      setStock(merged)
      writeLocal('waitlists', userIdRef.current, cid, { ...snap, stock: merged })
    } catch { setSetupMsg(s => s || 'Could not load waitlists') }
  }

  useEffect(() => {
    ;(async () => {
      // Paint the last list seen on this device straight away.
      const { data: sess } = await supabase.auth.getSession()
      const uid = sess.session?.user?.id || null
      userIdRef.current = uid
      const cached = readLocal<any>('waitlists', uid)
      let cid: string | null = null
      if (cached) {
        cid = cached.companyId
        setCompanyId(cid)
        setEntries(cached.data.entries || []); setStock(cached.data.stock || {})
        if (cached.data.settings) setSettings(cached.data.settings)
        setBusinessName(cached.data.businessName || '')
        setLoading(false)
        load(cid)
      }
      const { companyId: cidRaw, user } = await resolveCompanyUser()
      if (!user) { router.push('/signin'); return }
      let resolved = cidRaw
      if (!resolved) {
        const { data: tm } = await (supabase as any).from('team_members').select('company_id').eq('user_id', user.id).limit(1)
        resolved = tm?.[0]?.company_id || null
      }
      if (resolved && resolved !== cid) {
        // First visit on this device, or a different workspace — start clean.
        setEntries([]); setStock({})
        setCompanyId(resolved)
        await load(resolved)
      }
      setLoading(false)
    })()
  }, [])

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const map = new Map<string, any>()
    for (const e of entries) {
      if (!inView(e, tab, newIds, q)) continue
      if (aiOnly && !isAiAdded(e)) continue
      const k = groupKey(e)
      const g = map.get(k) || { key: k, name: e.item_name, image: e.item_image, url: e.item_url, productId: waitlistItemKey(e), entries: [] as any[] }
      g.image = g.image || e.item_image
      g.url = g.url || e.item_url
      g.entries.push(e)
      map.set(k, g)
    }
    const list = Array.from(map.values())
    list.forEach(g => { g.url = webUrl(g.url) || webUrl(g.productId ? stock[String(g.productId)]?.permalink : null) })
    list.forEach(g => {
      g.waiting = g.entries.filter(isWaiting).length
      g.newCount = g.entries.filter((e: any) => isTaggedNew(e, newIds)).length
      g.aiCount = g.entries.filter((e: any) => isAiAdded(e) && e.status !== 'cancelled').length
      // Current price from the store, and what the waitlist is worth if each
      // person waiting buys one once it's back.
      const p = g.productId ? stock[String(g.productId)] : null
      g.price = p?.price ?? null
      g.regular = p?.on_sale ? p.regular_price : null
      g.approx = !!p?.approx
      g.potential = g.price != null ? g.price * g.waiting : null
    })
    // Items with new customers float to the top of the usual order.
    return sortNewFirst(list, (a, b) => b.waiting - a.waiting || b.entries.length - a.entries.length)
  }, [entries, tab, search, stock, newIds, aiOnly])

  const stats = useMemo(() => {
    const monthAgo = Date.now() - 30 * 86400000
    const waiting = entries.filter(isWaiting)
    let potential = 0, unpriced = 0
    for (const e of waiting) {
      const k = waitlistItemKey(e)
      const price = k ? stock[k]?.price : null
      if (price != null) potential += price; else unpriced++
    }
    return {
      potential, unpriced,
      waiting: waiting.length,
      items: new Set(waiting.map(groupKey)).size,
      queued: entries.filter(e => e.status === 'queued').length,
      notified30: entries.filter(e => e.status === 'notified' && e.notified_at && new Date(e.notified_at).getTime() > monthAgo).length,
      newWaiting: waiting.filter(e => isTaggedNew(e, newIds)).length,
      newTotal: countNew(entries, newIds),
      // The filter's count: AI-added customers in the tab (and search) you're looking at.
      aiTotal: countAiAdded(entries.filter(e => inView(e, tab, newIds, search.trim().toLowerCase()))),
    }
  }, [entries, stock, newIds, tab, search])

  // Opened from a link to one entry: show it (whatever its status), open its item and bring it into view — once.
  const focusDone = useRef(false)
  useEffect(() => {
    if (!focusId || !entries.length || focusDone.current) return
    const e = entries.find(x => String(x.id) === focusId)
    if (!e) return
    focusDone.current = true
    if (!OPEN.includes(e.status)) setTab('all')
    setOpen(o => ({ ...o, [groupKey(e)]: true }))
    const t = setTimeout(() => { try { document.getElementById(`wl-e-${e.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) } catch {} }, 450)
    return () => clearTimeout(t)
  }, [focusId, entries])

  // The New filter only shows while there's something new in it.
  useEffect(() => { if (tab === 'new' && !stats.newTotal) setTab('waiting') }, [tab, stats.newTotal])

  // One card per item; page through them once the list gets long.
  const pg = usePagination(groups, { key: 'waitlists', defaultSize: 25, resetOn: [tab, search, aiOnly] })

  const notifyGroup = async (g: any) => {
    const ids = g.entries.filter((e: any) => e.status === 'waiting' || e.status === 'queued').map((e: any) => e.id)
    if (!ids.length) return
    if (!await confirmDialog({ title: `Text ${ids.length} customer${ids.length === 1 ? '' : 's'}?`, message: `They'll get an SMS that ${g.name} is back in stock.`, confirmLabel: ids.length === 1 ? 'Send text' : `Send ${ids.length} texts`, tone: 'primary' })) return
    setBusy(g.key)
    try {
      const res = await fetch('/api/waitlist/notify', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ companyId, ids }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed')
      const parts = [`${d.sent} sent`]
      if (d.failed) parts.push(`${d.failed} failed`)
      if (d.skipped) parts.push(`${d.skipped} opted out`)
      flash(`${g.name}: ${parts.join(', ')}.`)
      await load(companyId)
    } catch (e: any) { flash(e.message) } finally { setBusy('') }
  }

  // Website sign-ups have no thread yet: find or create their contact and
  // conversation, then open it in the inbox.
  const openChat = async (e: any) => {
    setBusy(`chat:${e.id}`)
    try {
      const res = await fetch('/api/waitlist', { method: 'PATCH', headers: await authHeaders(), body: JSON.stringify({ companyId, id: e.id, action: 'chat' }) })
      const d = await res.json()
      if (!res.ok || !d.conversationId) throw new Error(d.error || 'Could not open a chat')
      router.push(`/admin/inbox?conversation=${d.conversationId}`)
    } catch (err: any) { flash(err.message); setBusy('') }
  }

  const removeEntry = async (e: any) => {
    if (!await confirmDialog({ title: 'Remove from waitlist?', message: `${e.customer_name || e.phone || 'This customer'} won't be told when ${e.item_name} is back.`, confirmLabel: 'Remove', tone: 'danger' })) return
    setBusy(e.id)
    try {
      const res = await fetch('/api/waitlist', { method: 'PATCH', headers: await authHeaders(), body: JSON.stringify({ companyId, id: e.id, action: 'cancel' }) })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed')
      await load(companyId)
    } catch (err: any) { flash(err.message) } finally { setBusy('') }
  }

  const stockBadge = (g: any) => {
    if (!g.productId) return { label: 'Not listed online', c: '#a1a1aa' }
    const s = stock[String(g.productId)]
    if (!s || !s.stock_status) return { label: 'Linked product', c: '#a1a1aa' }
    if (s.stock_status === 'instock') return { label: `In stock${s.stock_quantity != null ? ` · ${s.stock_quantity}` : ''}`, c: '#22c55e' }
    if (s.stock_status === 'onbackorder') return { label: 'On backorder', c: '#f59e0b' }
    return { label: 'Out of stock', c: '#ef4444' }
  }

  if (loading) return <div style={{ padding: '24px 28px', maxWidth: 1280, margin: '0 auto' }}><SkeletonList /></div>

  const I = (d: React.ReactNode) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
  const tiles: any[] = [
    { label: 'Customers waiting', value: String(stats.waiting), c: '#3b82f6',
      icon: I(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>),
      ...(stats.newWaiting ? { sub: `+${stats.newWaiting} new ${firstVisit ? 'in the last 2 days' : 'since your last visit'}`, hot: true } : { sub: 'Across every item' }) },
    { label: 'Items with a waitlist', value: String(stats.items), c: '#8b5cf6', sub: 'Out of stock or not yet in',
      icon: I(<><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></>) },
    { label: 'Potential revenue', value: money(stats.potential), c: '#22c55e',
      sub: stats.unpriced ? `${stats.unpriced} without a price` : 'If everyone waiting buys one',
      title: 'Current store price × each customer waiting. Items not listed online have no price, so they aren’t counted.',
      icon: I(<><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>) },
    ...(stats.queued ? [{ label: 'Texts queued for 9am', value: String(stats.queued), c: '#f59e0b', sub: 'Back in stock overnight',
      title: 'Texts only go out 9am–8pm. Anything back in stock overnight is sent at 9am.',
      icon: I(<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>) }] : []),
    { label: 'Notified (30 days)', value: String(stats.notified30), c: '#06b6d4', sub: 'Told it’s back in stock',
      icon: I(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />) },
  ]

  return (
    <div className="wl">
      <style>{WL_CSS}</style>
      <div className="wl-head">
        <div>
          <h1>Back-in-stock waitlists</h1>
          <p>Customers waiting for an item. When it&apos;s back, they get one SMS.</p>
        </div>
        <div className="wl-head-acts">
          <button type="button" className={`cv-btn${showSettings ? ' wl-on' : ''}`} onClick={() => setShowSettings(s => !s)} aria-expanded={showSettings}><GearIcon size={15} /> Settings</button>
          <button type="button" className="cv-btn cv-btn-primary" onClick={() => setShowAdd(true)} disabled={!!setupMsg}><PlusIcon size={15} strokeWidth={2.4} /> Add to waitlist</button>
        </div>
      </div>

      {setupMsg && <div className="wl-note" role="alert">{setupMsg}</div>}

      {showSettings && <SettingsPanel companyId={companyId} businessName={businessName} settings={settings} onSaved={s => { setSettings(s); flash('Settings saved.') }} />}

      <div className="wl-tiles">
        {tiles.map(t => (
          <div key={t.label} className="wl-tile" title={t.title} style={tint(t.c)}>
            <span className="wl-tile-top"><span className="wl-tile-l">{t.label}</span><span className="wl-tile-ic">{t.icon}</span></span>
            <span className="wl-tile-v">{t.value}</span>
            {t.sub && <span className={`wl-tile-s${t.hot ? ' hot' : ''}`}>{t.sub}</span>}
          </div>
        ))}
      </div>

      {/* Tabs + search */}
      <div className="wl-bar">
        <div className="wl-seg" role="tablist" aria-label="Show">
          {(['waiting', 'notified', 'all', ...(stats.newTotal ? ['new' as const] : [])] as const).map(t => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={`${tab === t ? 'on' : ''}${t === 'new' ? ' new' : ''}`} onClick={() => setTab(t)}>
              {t === 'new' ? <>New <span className="wl-seg-n">{stats.newTotal}</span></> : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        {(stats.aiTotal > 0 || aiOnly) && (
          <button type="button" className={`wl-ai${aiOnly ? ' on' : ''}`} onClick={() => setAiOnly(v => !v)} aria-pressed={aiOnly} title="Only customers an AI agent or Colvy AI added"
            style={{ ['--ai' as any]: AI_VIOLET.c }}>
            <AiSpark size={12} /> Added by AI <span className="wl-seg-n">{stats.aiTotal}</span>
          </button>
        )}
        <label className="wl-search">
          {I(<><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>)}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search item or customer" aria-label="Search item or customer" />
          {search && <button type="button" className="wl-x" onClick={() => setSearch('')} aria-label="Clear search"><XIcon size={11} /></button>}
        </label>
      </div>

      {groups.length === 0 ? (
        <div className="wl-card" style={{ padding: '24px 12px' }}>
          {search.trim()
            ? <EmptyScroll kinds={['order', 'sms']} title="No matches" line={`Nobody here matches “${search.trim()}”. Try an item or a customer’s name.`}
                action={<button type="button" className="cv-btn" onClick={() => setSearch('')}>Clear search</button>} />
            : <EmptyScroll kinds={['order', 'sms']} title={aiOnly ? 'No one added by AI here' : tab === 'waiting' ? 'Nobody is waiting right now' : 'Nothing here yet'}
                line={<>When a customer asks for something that's out of stock, add them here (or with <b>Waitlist</b> on their conversation). The moment it's back, they get a text.</>}
                action={!setupMsg ? <button type="button" className="cv-btn cv-btn-primary" onClick={() => setShowAdd(true)}><PlusIcon size={15} strokeWidth={2.4} /> Add to waitlist</button> : undefined} />}
        </div>
      ) : (
        <div className="wl-groups">
          {pg.items.map(g => {
            const badge = stockBadge(g)
            const isOpen = open[g.key] ?? groups.length <= 3
            return (
              <div key={g.key} className="wl-card">
                <div className="wl-g">
                  <button type="button" className="wl-g-main" onClick={() => setOpen(o => ({ ...o, [g.key]: !isOpen }))}>
                    {g.image
                      ? <img src={g.image} alt="" className="wl-g-img" />
                      : <span className="wl-g-img wl-g-ph"><TagIcon size={22} /></span>}
                    <span className="wl-g-txt">
                      <span className="wl-title">
                        {g.name}
                        {g.price != null && (
                          <span className="wl-price" title={g.approx ? 'Couldn’t reach your store for this size, so this is the product’s starting price' : undefined}> · {g.approx ? 'from ' : ''}{money(g.price)}
                            {g.regular != null && <s>{money(g.regular)}</s>}
                          </span>
                        )}
                      </span>
                      <span className="wl-g-meta">
                        <span className="wl-tag" style={tint(badge.c)}>{badge.label}</span>
                        <span>
                          <b>{g.waiting} waiting</b>{g.newCount > 0 && <> · <span className="wl-hot">{g.newCount} new</span></>}{g.aiCount > 0 && <> · <span className="wl-ai-count" title={`${g.aiCount} added by an AI agent or Colvy AI`} style={{ color: AI_VIOLET.c, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}><AiSpark /> {g.aiCount} by AI</span></>} · {g.entries.length} total
                          {g.potential != null && g.waiting > 0 && <> · <span className="wl-money">{money(g.potential)} potential</span></>}
                        </span>
                      </span>
                    </span>
                  </button>
                  <div className="wl-g-acts">
                    {g.url && (
                      <a href={g.url} target="_blank" rel="noopener noreferrer" className="wl-pill" title="View product on your website" aria-label={`View ${g.name} on your website`}>
                        <ExternalIcon size={14} /> <span className="wl-hide-sm">View product</span>
                      </a>
                    )}
                    {g.waiting > 0 && (
                      <button type="button" className="cv-btn cv-btn-primary wl-notify" onClick={() => notifyGroup(g)} disabled={busy === g.key}>
                        {busy === g.key ? 'Sending…' : `Notify ${g.waiting} now`}
                      </button>
                    )}
                    <button type="button" className={`wl-chev${isOpen ? ' open' : ''}`} onClick={() => setOpen(o => ({ ...o, [g.key]: !isOpen }))}
                      aria-expanded={isOpen} aria-label={isOpen ? `Hide customers waiting for ${g.name}` : `Show customers waiting for ${g.name}`}>
                      <ChevronDownIcon size={18} strokeWidth={2.4} />
                    </button>
                  </div>
                </div>
                <div className={`wl-panel${isOpen ? ' open' : ''}`} aria-hidden={!isOpen}>
                  <div inert={!isOpen}>
                  <div className="wl-rows">
                    {g.entries.map((e: any, i: number) => {
                      const pill = STATUS_PILL[e.status] || STATUS_PILL.waiting
                      if (editing === e.id) return (
                        <EditEntry key={e.id} entry={e} companyId={companyId}
                          onCancel={() => setEditing(null)}
                          onSaved={async () => { setEditing(null); flash('Customer details saved.'); await load(companyId) }} />
                      )
                      const who = e.customer_name || e.phone || e.email || 'Customer'
                      const live = ['waiting', 'queued', 'failed'].includes(e.status)
                      return (
                        <div key={e.id} id={`wl-e-${e.id}`} className="wl-row" style={{ ['--i' as any]: Math.min(i, 12), ...(focusId === String(e.id) ? (isAiAdded(e) ? { background: AI_VIOLET.bg, boxShadow: `inset 3px 0 0 ${AI_VIOLET.c}` } : { background: 'var(--peach, #fff1ee)', boxShadow: 'inset 3px 0 0 var(--coral, #ff7a6b)' }) : {}) }}>
                          <span className="wl-av" style={tint(hueOf(String(who)))}>{initialsOf(String(e.customer_name || who))}</span>
                          <div className="wl-who">
                            <div className="wl-name">
                              {e.customer_name || 'Customer'}
                              {isTaggedNew(e, newIds) && <NewPill since={newSince} firstVisit={firstVisit} />}
                              {isAiAdded(e) && <AiAddedPill entry={e} companyId={companyId} />}
                            </div>
                            <div className="wl-contact">{[e.phone, e.email].filter(Boolean).join(' · ')}</div>
                            {e.note && <div className="wl-contact" style={{ fontStyle: 'italic', marginTop: 2 }}>“{e.note}”</div>}
                            {e.status === 'failed' && e.error && <div className="wl-contact" style={{ color: '#dc2626', marginTop: 2 }}>{e.error}</div>}
                          </div>
                          {/* Date, status and actions stay together on one line — on a phone
                              the remove button used to wrap onto a line of its own. */}
                          <div className="wl-acts">
                            <span className="wl-when">
                              {e.status === 'notified' && e.notified_at ? `${e.notified_via === 'email' ? 'Emailed' : 'Texted'} ${fmtDate(e.notified_at)}` : `Added ${fmtDate(e.created_at)}`}{e.source === 'inbox' ? ' · from inbox' : e.source === 'website' ? ' · from website' : e.source === 'ai_agent' ? ' · from AI agent' : e.source === 'colvy_ai' ? ' · via Colvy AI' : ''}
                            </span>
                            <span className="wl-tag" style={tint(pill.c)}>{pill.label}</span>
                            {e.conversation_id
                              ? <a href={`/admin/inbox?conversation=${e.conversation_id}`} className="wl-ib" title="Open conversation" aria-label="Open conversation"><ChatIcon size={15} /></a>
                              : (e.phone || e.email || e.contact_id) && (
                                <button type="button" className="wl-ib" onClick={() => openChat(e)} disabled={busy === `chat:${e.id}`} title="Chat with this customer" aria-label="Chat with this customer"><ChatIcon size={15} /></button>
                              )}
                            {live && (
                              <button type="button" className="wl-ib" onClick={() => setEditing(e.id)} title="Edit customer details" aria-label="Edit customer details"><EditIcon size={14} /></button>
                            )}
                            {live && (
                              <button type="button" className="wl-ib danger" onClick={() => removeEntry(e)} disabled={busy === e.id} title="Remove from waitlist" aria-label="Remove from waitlist"><XIcon size={13} /></button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    {g.waiting > 0 && (
                      <div className="wl-row wl-foot" style={{ ['--i' as any]: Math.min(g.entries.length, 13) }}>
                        <span>
                          {g.price != null
                            ? <>Potential revenue · {g.waiting} waiting × {money(g.price)} each{g.approx ? ' (starting price, an estimate)' : ''}</>
                            : g.productId ? 'No price on this product in your store yet' : 'Not listed online, so there’s no price to estimate from'}
                        </span>
                        {g.potential != null && <b>{money(g.potential)}</b>}
                      </div>
                    )}
                  </div>
                  </div>
                </div>
              </div>
            )
          })}
          <Pagination {...pg} noun="items" />
        </div>
      )}

      {toast && (
        <div className="wl-toast" role="status">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
          {toast}
        </div>
      )}

      {showAdd && <WaitlistAddModal companyId={companyId} onClose={() => setShowAdd(false)} onAdded={async (dup) => { setShowAdd(false); flash(dup ? 'Already on that waitlist.' : 'Added to the waitlist.'); await load(companyId) }} />}
    </div>
  )
}

// ── "New" tag ──────────────────────────────────────────────────────────────────
const NEW_PILL = { bg: '#fff1ee', c: '#d6402c' }
function NewPill({ since, firstVisit }: { since: string | null; firstVisit: boolean }) {
  const title = firstVisit || !since ? 'Joined in the last 2 days' : `Joined since your last visit (${new Date(since).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })})`
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 20, fontSize: 11.5, fontWeight: 600, padding: '0 8px', borderRadius: 999, background: NEW_PILL.bg, color: NEW_PILL.c, whiteSpace: 'nowrap', flexShrink: 0 }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" /></svg>
      New
    </span>
  )
}

// ── Edit a waiting customer ───────────────────────────────────────────────────
function EditEntry({ entry, companyId, onCancel, onSaved }: { entry: any; companyId: string; onCancel: () => void; onSaved: () => void }) {
  const [name, setName] = useState<string>(entry.customer_name || '')
  const [phone, setPhone] = useState<string>(entry.phone || '')
  const [email, setEmail] = useState<string>(entry.email || '')
  const [note, setNote] = useState<string>(entry.note || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!phone.trim() && !email.trim()) { setErr('Add a phone number or an email so they can be told it’s back.'); return }
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/waitlist', { method: 'PATCH', headers: await authHeaders(), body: JSON.stringify({ companyId, id: entry.id, action: 'edit', customerName: name, phone, email, note }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not save')
      onSaved()
    } catch (e: any) { setErr(e.message) } finally { setSaving(false) }
  }

  const field = (label: string, el: React.ReactNode) => (
    <label style={{ display: 'block', flex: '1 1 180px', minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#71717a', marginBottom: 5 }}>{label}</span>
      {el}
    </label>
  )
  return (
    <form onSubmit={save} className="wl-edit">
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {field('Name', <input value={name} onChange={e => setName(e.target.value)} placeholder="Customer name" autoFocus className="wl-inp" />)}
        {field('Mobile', <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0412 345 678" inputMode="tel" autoComplete="off" className="wl-inp" />)}
        {field('Email', <input value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" type="email" inputMode="email" autoComplete="off" className="wl-inp" />)}
      </div>
      <div style={{ marginTop: 10 }}>
        {field('Note (staff only)', <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. wants 2, happy to pick up" className="wl-inp" />)}
      </div>
      <p style={{ fontSize: 12.5, color: '#8e8e93', margin: '8px 0 0' }}>They’re texted when it’s back, or emailed if there’s no mobile.</p>
      {err && <p role="alert" style={{ fontSize: 12.5, color: '#dc2626', margin: '6px 0 0' }}>{err}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
        <button type="button" className="cv-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="cv-btn cv-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  )
}

// ── Settings ─────────────────────────────────────────────────────────────────
function SettingsPanel({ companyId, businessName, settings, onSaved }: { companyId: string; businessName: string; settings: any; onSaved: (s: any) => void }) {
  const [auto, setAuto] = useState<boolean>(settings.auto_notify !== false)
  const [tpl, setTpl] = useState<string>(settings.template || DEFAULT_TEMPLATE)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const preview = tpl.replace(/\{name\}/g, 'Sam').replace(/\{item\}/g, 'Diamond Eye Molly').replace(/\{business\}/g, businessName || 'your store')
    .replace(/\{link\}/g, 'https://shop.example/p/molly').replace(/[ \t]{2,}/g, ' ').trim()
  const segments = preview.length <= 160 ? 1 : Math.ceil(preview.length / 153)

  const save = async () => {
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/waitlist', { method: 'PATCH', headers: await authHeaders(), body: JSON.stringify({ companyId, settings: { auto_notify: auto, template: tpl } }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed')
      onSaved(d.settings)
    } catch (e: any) { setErr(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="wl-card wl-settings">
      <p className="wl-settings-h">Waitlist settings</p>
      <label className="wl-auto">
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Text customers automatically when a linked product is back in stock</span>
          <span style={{ display: 'block', fontSize: 13, color: '#71717a', marginTop: 3, lineHeight: 1.55 }}>
            Triggered by WooCommerce or Shopify stock updates. Texts only go out 9am–8pm; anything that arrives overnight is sent at 9am.
            Items not listed online are sent with <b>Notify now</b>. If stock changes don't come through, re-register webhooks under Integrations → WooCommerce, or sync the store under Integrations → Shopify.
          </span>
        </span>
        <input type="checkbox" role="switch" className="wl-switch" checked={auto} onChange={e => setAuto(e.target.checked)} />
      </label>
      <label htmlFor="wl-tpl" style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>SMS message</label>
      <textarea id="wl-tpl" className="wl-inp" value={tpl} onChange={e => setTpl(e.target.value)} rows={3} style={{ resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
        {['{name}', '{item}', '{business}', '{link}'].map(t => (
          <button key={t} type="button" className="wl-token" onClick={() => setTpl(v => `${v} ${t}`.trim())}>{t}</button>
        ))}
      </div>
      <div className="wl-preview">
        <span className="wl-preview-h">Preview · {preview.length} characters · {segments} SMS</span>
        {preview}
      </div>
      {!/stop/i.test(tpl) && <p style={{ fontSize: 12.5, color: '#b45309', margin: '8px 0 0' }}>Tip: keep "Reply STOP to opt out" — it's the required unsubscribe option for marketing texts in Australia.</p>}
      {err && <p style={{ fontSize: 12.5, color: '#dc2626', margin: '8px 0 0' }}>{err}</p>}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="cv-btn" onClick={() => setTpl(DEFAULT_TEMPLATE)}>Reset to default</button>
        <button type="button" className="cv-btn cv-btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
      </div>
    </div>
  )
}

// The Waitlists look: a big bold header, soft tiles, a pill toolbar and one
// white card per item that opens to the customers waiting for it.
const WL_CSS = `
.wl{padding:24px 28px 48px;max-width:1280px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink)}
.wl button::before{display:none}
.wl-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:22px}
.wl-head h1{margin:0;font-size:30px;font-weight:800;letter-spacing:-.025em;line-height:1.1}
.wl-head p{margin:6px 0 0;font-size:14.5px;color:#71717a}
.wl-head-acts{display:flex;gap:8px;flex-wrap:wrap}
.wl-head-acts .cv-btn{display:inline-flex;align-items:center;gap:7px}
.cv-btn.wl-on{background:#18181b!important;color:#fff!important}
.wl-note{margin-bottom:16px;padding:12px 16px;border-radius:16px;background:#fffbeb;box-shadow:0 0 0 1px #fde68a;color:#92400e;font-size:13.5px;line-height:1.5}
.wl-card{background:#fff;border-radius:20px;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04);overflow:hidden}
.wl-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin-bottom:18px}
.wl-tile{display:flex;flex-direction:column;align-items:flex-start;gap:3px;padding:14px 16px;border-radius:18px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.07),0 1px 2px rgba(16,24,40,.04);min-width:0}
.wl-tile-top{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%}
.wl-tile-l{font-size:13.5px;font-weight:600;color:#71717a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wl-tile-ic{width:30px;height:30px;border-radius:10px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--t) 11%,#fff);color:var(--t)}
.wl-tile-ic svg{width:15px;height:15px}
.wl-tile-v{margin-top:2px;font-size:26px;font-weight:800;letter-spacing:-.02em;line-height:1.1;font-variant-numeric:tabular-nums;white-space:nowrap}
.wl-tile-s{font-size:12.5px;color:#8e8e93;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.wl-tile-s.hot{color:#d6402c;font-weight:600}
.wl-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.wl-seg{display:inline-flex;gap:2px;padding:3px;border-radius:999px;background:#f4f4f5}
.wl-seg button{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 14px;border:none;border-radius:999px;background:transparent;color:#71717a;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background-color .15s,color .15s}
.wl-seg button:hover{color:#18181b}
.wl-seg button.on{background:#fff;color:#18181b;box-shadow:0 1px 3px rgba(0,0,0,.1)}
.wl-seg button.new{color:#d6402c}
.wl-seg-n{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:color-mix(in srgb,currentColor 14%,#fff);font-size:11px;font-weight:700}
.wl-ai{display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 14px;border:none;border-radius:999px;background:color-mix(in srgb,var(--ai) 10%,#fff);color:var(--ai);font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;white-space:nowrap}
.wl-ai.on{background:var(--ai);color:#fff}
.wl-ai.on .wl-seg-n{background:rgba(255,255,255,.22)}
.wl-search{flex:1;min-width:0;max-width:340px;margin-left:auto;display:flex;align-items:center;gap:8px;height:38px;padding:0 10px 0 14px;border-radius:999px;border:1.5px solid transparent;background:#f4f4f5;color:#a1a1aa;box-sizing:border-box;transition:background-color .15s,border-color .15s,box-shadow .15s}
.wl-search svg{width:15px;height:15px;flex-shrink:0}
.wl-search:focus-within{background:#fff;border-color:#d4d4d8;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 16%,transparent)}
.wl-search input{flex:1;min-width:0;border:none;outline:none;background:transparent;font:inherit;font-size:14px;color:var(--ink)}
.wl-search input:focus{box-shadow:none}
.wl-x{width:22px;height:22px;padding:0;border:none;border-radius:999px;background:#e4e4e7;color:#52525b;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0}
.wl-groups{display:flex;flex-direction:column;gap:12px}
.wl-g{display:flex;align-items:center;gap:12px 14px;padding:16px 18px;flex-wrap:wrap}
.wl-g-main{display:flex;align-items:center;gap:14px;flex:1 1 300px;min-width:0;padding:0;border:none;background:none;font:inherit;color:inherit;text-align:left;cursor:pointer}
.wl-g-img{width:52px;height:52px;border-radius:14px;object-fit:cover;flex-shrink:0;box-shadow:0 0 0 1px rgba(0,0,0,.06)}
.wl-g-ph{display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--coral) 10%,#fff);color:var(--coral);box-shadow:none}
.wl-g-txt{display:block;min-width:0}
.wl-title{display:block;font-size:15.5px;font-weight:700;color:var(--ink);letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wl-price{font-weight:600;color:#52525b}
.wl-price s{margin-left:6px;font-size:13px;font-weight:500;color:#a1a1aa}
.wl-g-meta{display:flex;align-items:center;gap:8px;margin-top:5px;flex-wrap:wrap;font-size:13px;color:#8e8e93}
.wl-g-meta b{font-weight:600;color:#3f3f46}
.wl-hot{color:#d6402c;font-weight:600}
.wl-money{color:#15803d;font-weight:600}
.wl-tag{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 9px;border-radius:999px;background:color-mix(in srgb,var(--t) 12%,#fff);color:color-mix(in srgb,var(--t) 78%,#000);font-size:12px;font-weight:600;white-space:nowrap;flex-shrink:0}
.wl-tag::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--t)}
.wl-g-acts{display:flex;align-items:center;gap:8px;margin-left:auto}
.wl-pill{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;border-radius:999px;background:#f4f4f5;color:#18181b;font-size:13.5px;font-weight:600;white-space:nowrap;transition:background-color .15s}
.wl-pill:hover{background:#ececef}
.wl-notify{white-space:nowrap}
.wl-chev{width:36px;height:36px;padding:0;border:none;border-radius:50%;background:#f4f4f5;color:#52525b;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:background-color .2s,color .2s}
.wl-chev:hover{background:#ececef;color:#18181b}
.wl-chev svg{transition:transform .38s cubic-bezier(.16,1,.3,1)}
.wl-chev.open svg{transform:rotate(180deg)}
/* Open/close: the panel's height eases between 0 and its content, and
   each customer row slides up in turn as it opens. */
.wl-panel{display:grid;grid-template-rows:0fr;transition:grid-template-rows .38s cubic-bezier(.16,1,.3,1)}
.wl-panel.open{grid-template-rows:1fr}
.wl-panel > div{overflow:hidden;min-height:0}
.wl-rows{margin:0 10px 10px;border-radius:16px;background:#fafafa;overflow:hidden}
.wl-row{display:flex;align-items:center;gap:12px;padding:12px 14px;flex-wrap:wrap;opacity:0;transform:translateY(-6px);transition:opacity .22s ease,transform .3s cubic-bezier(.16,1,.3,1)}
.wl-row + .wl-row,.wl-edit + .wl-row,.wl-row + .wl-edit{border-top:1px solid #efeff1}
.wl-panel.open .wl-row{opacity:1;transform:none;transition-delay:calc(var(--i,0) * 35ms + 60ms)}
.wl-av{width:34px;height:34px;border-radius:50%;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--t) 16%,#fff);color:color-mix(in srgb,var(--t) 80%,#000);font-size:12.5px;font-weight:700}
.wl-who{flex:1 1 200px;min-width:0}
.wl-name{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:14px;font-weight:600;color:var(--ink)}
.wl-contact{font-size:12.5px;color:#8e8e93;margin-top:1px;overflow-wrap:anywhere}
.wl-acts{display:flex;align-items:center;gap:6px;margin-left:auto;min-width:0}
.wl-when{font-size:12.5px;color:#8e8e93;white-space:nowrap;min-width:0;margin-right:2px}
.wl-ib{width:32px;height:32px;padding:0;border:none;border-radius:50%;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.07);color:#52525b;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:background-color .15s,color .15s}
.wl-ib:hover{background:#f4f4f5;color:#18181b}
.wl-ib.danger:hover{background:#fef2f2;color:#dc2626}
.wl-ib:disabled{opacity:.5;cursor:default}
.wl-foot{justify-content:space-between;font-size:13px;color:#71717a}
.wl-foot b{font-size:15px;font-weight:800;color:#15803d;font-variant-numeric:tabular-nums}
.wl-edit{padding:14px;background:#fff}
.wl-inp{display:block;width:100%;box-sizing:border-box;padding:10px 14px;border:1.5px solid transparent;border-radius:12px;background:#f4f4f5;font:inherit;font-size:14px;color:var(--ink);outline:none;transition:background-color .15s,border-color .15s,box-shadow .15s}
.wl-inp:focus{background:#fff;border-color:#d4d4d8!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 16%,transparent)}
.wl-settings{padding:20px;margin-bottom:18px;overflow:visible}
.wl-settings-h{margin:0 0 14px;font-size:17px;font-weight:700;letter-spacing:-.01em}
.wl-auto{display:flex;align-items:flex-start;gap:16px;margin-bottom:18px;padding:14px 16px;border-radius:16px;background:#fafafa;cursor:pointer}
.wl-switch{appearance:none;-webkit-appearance:none;position:relative;width:42px;height:24px;margin:2px 0 0;border-radius:999px;background:#d4d4d8;cursor:pointer;flex-shrink:0;transition:background-color .2s}
.wl-switch::after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .2s cubic-bezier(.22,1,.36,1)}
.wl-switch:checked{background:#34c759}
.wl-switch:checked::after{transform:translateX(18px)}
.wl-switch:focus{box-shadow:none}
.wl-switch:focus-visible{box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 28%,transparent)}
.wl-token{height:28px;padding:0 11px;border:none;border-radius:999px;background:#f4f4f5;color:#3f3f46;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
.wl-token:hover{background:#ececef;color:#18181b}
.wl-preview{padding:12px 14px;border-radius:14px;background:#fafafa;box-shadow:0 0 0 1px rgba(0,0,0,.05);font-size:13.5px;color:var(--ink);line-height:1.55;overflow-wrap:anywhere}
.wl-preview-h{display:block;margin-bottom:4px;font-size:12.5px;font-weight:600;color:#71717a}
.wl-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:5800;display:flex;align-items:flex-start;gap:8px;padding:12px 18px;border-radius:18px;background:#18181b;color:#fff;font-size:13.5px;font-weight:500;line-height:1.45;box-shadow:0 12px 30px rgba(0,0,0,.25);width:max-content;max-width:min(560px,calc(100vw - 32px))}
.wl-toast svg{flex-shrink:0;margin-top:1px;color:#4ade80}
.wl-seg button:focus-visible,.wl-ai:focus-visible,.wl-chev:focus-visible,.wl-ib:focus-visible,.wl-pill:focus-visible,.wl-token:focus-visible,.wl-g-main:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 28%,transparent)}
@media (prefers-reduced-motion: reduce){
  .wl-panel,.wl-row,.wl-chev svg{transition:none!important}
  .wl-panel.open .wl-row{transition-delay:0s!important}
}
@media (max-width:640px){
  .wl{padding:16px 14px 40px}
  .wl-head{align-items:flex-start}
  .wl-head h1{font-size:26px}
  .wl-head-acts{width:100%}
  .wl-head-acts .cv-btn{flex:1;justify-content:center}
  .wl-tiles{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .wl-tiles > :first-child:nth-last-child(2n+1){grid-column:1 / -1}
  .wl-tile{padding:12px 14px}
  .wl-tile-l{white-space:normal;line-height:1.3}
  .wl-tile-top{align-items:flex-start}
  .wl-tile-v{font-size:22px}
  .wl-seg{flex:1}
  .wl-seg button{flex:1;justify-content:center;padding:0 8px}
  .wl-search{max-width:none;flex-basis:100%;margin-left:0}
  .wl-search input,.wl-inp{font-size:16px}
  .wl-g{padding:14px}
  .wl-g-main{flex-basis:100%}
  .wl-g-acts{width:100%}
  .wl-g-acts .wl-notify{flex:1;justify-content:center}
  .wl-chev{margin-left:auto}
  .wl-title{white-space:normal;line-height:1.3}
  .wl-hide-sm{display:none}
  .wl-rows{margin:0 8px 8px}
  .wl-acts{width:100%;padding-left:46px;box-sizing:border-box;flex-wrap:wrap;row-gap:8px}
  .wl-when{flex:1 1 100%;margin:0}
  .wl-acts .wl-tag{margin-right:auto}
  .wl-settings{padding:16px}
}
`
