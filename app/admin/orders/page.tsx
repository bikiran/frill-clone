'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser } from '@/lib/client-cache'
import {
  STATUS_TABS, statusMeta, channelMeta, orderAge, fmtMoney,
  CARRIERS, CARRIER_LABEL, CARRIER_SERVICES, isClickCollect,
} from '@/lib/orders'
import OrderPrintDoc from '@/components/OrderPrintDoc'
import OrderItemsPanel from '@/components/OrderItemsPanel'
import CreateOrderPanel from '@/components/CreateOrderPanel'
import { CARRIERS as TRACK_CARRIERS, carrierByKey } from '@/lib/carriers'
import { barcodeSVG } from '@/lib/barcode'

type Order = any

// WooCommerce brand mark — a white "W" on the WooCommerce purple, instead of a
// plain purple dot.
function WooLogo({ size = 16 }: { size?: number }) {
  const box = size + 6
  return (
    <span title="WooCommerce" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: box, height: box, borderRadius: 6, background: '#7f54b3', flexShrink: 0 }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M4 8.6c.15-.5.5-.85 1.05-.85.5 0 .82.3 1 .82l1.35 4.1 1.5-3.85c.2-.5.5-.85 1.02-.85.5 0 .82.32 1 .85l1.5 3.85 1.35-4.1c.18-.52.5-.82 1-.82.55 0 .9.35 1.05.85.05.2.03.4-.05.62l-2.35 6.35c-.2.55-.56.9-1.08.9-.5 0-.86-.35-1.06-.9L11 12.2l-1.28 3.75c-.2.55-.56.9-1.06.9-.52 0-.88-.35-1.08-.9L5.23 9.6c-.08-.22-.1-.42-.05-.62z" fill="#fff" />
      </svg>
    </span>
  )
}
export function ChannelIcon({ channel, size = 15 }: { channel?: string | null; size?: number }) {
  if (channel === 'woocommerce') return <WooLogo size={size} />
  return <span style={{ fontSize: size + 1 }}>{channelMeta(channel).icon}</span>
}
// Click & Collect — a storefront/shopping bag with a check, in place of the 🏬 emoji.
export function ClickCollectIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <path d="M3 6h18" />
      <path d="m9 13 2 2 4-4" />
    </svg>
  )
}

// ── Colour-coded tags ─────────────────────────────────────────────────────────
export const TAG_PALETTE = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0891b2', '#4b5563', '#e11d48', '#ca8a04']
export function hashColor(name: string): string { let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return TAG_PALETTE[h % TAG_PALETTE.length] }
export function readableText(hex?: string): string {
  const h = (hex || '').replace('#', ''); if (h.length < 6) return '#fff'
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#111827' : '#ffffff'
}
export function TagChip({ name, color, onRemove }: { name: string; color?: string; onRemove?: () => void }) {
  const bg = color || hashColor(name); const fg = readableText(bg)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20, background: bg, color: fg, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.01em' }}>
      {name}{onRemove && <button type="button" onClick={e => { e.stopPropagation(); onRemove() }} title="Remove" style={{ background: 'none', border: 'none', color: fg, cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1, opacity: 0.85 }}>×</button>}
    </span>
  )
}

export function CopyBtn({ onClick, title }: { onClick: () => void; title?: string }) {
  return (
    <button type="button" title={title || 'Copy'} onClick={e => { e.stopPropagation(); e.preventDefault(); onClick() }}
      style={{ background: 'none', border: 'none', padding: 2, cursor: 'copy', color: 'var(--slate)', display: 'inline-flex', lineHeight: 0, borderRadius: 4, flexShrink: 0 }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
    </button>
  )
}

export async function copyToClipboard(text: string, flash?: (m: string) => void) {
  const t = (text || '').trim()
  if (!t) return
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(t)
    else { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove() }
    flash?.('Copied to clipboard')
  } catch { flash?.('Copy failed') }
}

export default function OrdersPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  // The company's own brand colour drives the accent (active tab, primary
  // actions) — not a hard-coded blue. Falls back to Colvy's coral.
  const [accent, setAccent] = useState<string>('var(--coral)')
  const ACCENT = accent
  const [me, setMe] = useState<{ id: string | null; name: string }>({ id: null, name: 'You' })
  const [orders, setOrders] = useState<Order[]>([])
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])
  const [team, setTeam] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [toast, setToast] = useState('')

  const [tab, setTab] = useState('all')
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [defaultStatus, setDefaultStatus] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [searchTouched, setSearchTouched] = useState(false)
  const itemIndexLoadedRef = useRef(false)
  const [fStore, setFStore] = useState('all')
  const [defaultOutlet, setDefaultOutlet] = useState<string | null>(null)
  const [savedViews, setSavedViews] = useState<{ id: string; name: string; f: any }[]>([])
  const [activeView, setActiveView] = useState<string | null>(null)
  // order_id → lowercased "product name + sku" text, so search can match by
  // product even though the board rows only carry item_count/primary_sku.
  const [itemIndex, setItemIndex] = useState<Record<string, string>>({})
  const [fAssignee, setFAssignee] = useState('all')
  const [fTag, setFTag] = useState('all')
  const [fDate, setFDate] = useState('all')
  const [saved, setSaved] = useState('')
  const [sortCol, setSortCol] = useState<'order_date' | 'age' | 'total' | 'order_number'>('order_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [tagMenuOpen, setTagMenuOpen] = useState(false)
  const [tagFilterOpen, setTagFilterOpen] = useState(false)
  const [showCreateOrder, setShowCreateOrder] = useState(false)
  const [saveViewName, setSaveViewName] = useState<string | null>(null)
  const [labelOrder, setLabelOrder] = useState<Order | null>(null)
  const [labelPdf, setLabelPdf] = useState<string | null>(null)
  const [tagDefs, setTagDefs] = useState<{ id: string; name: string; color: string }[]>([])
  const [manageTagsOpen, setManageTagsOpen] = useState(false)
  const tagColor = useCallback((name: string) => tagDefs.find(t => t.name.toLowerCase() === String(name).toLowerCase())?.color || hashColor(name), [tagDefs])
  const loadTagDefs = useCallback(async (cid: string) => {
    try { const { data } = await (supabase as any).from('order_tags').select('*').eq('company_id', cid).order('name'); setTagDefs((data || []).map((t: any) => ({ id: t.id, name: t.name, color: t.color || hashColor(t.name) }))) } catch {}
  }, [])
  // Show Sidebar: ON → a row opens the slide-in drawer; OFF → it opens the full
  // order details page. Persisted per browser.
  const [showSidebar, setShowSidebar] = useState(true)
  useEffect(() => { try { const v = localStorage.getItem('colvy-orders-sidebar'); if (v != null) setShowSidebar(v === '1') } catch {} }, [])
  const setSidebarPref = (v: boolean) => { setShowSidebar(v); try { localStorage.setItem('colvy-orders-sidebar', v ? '1' : '0') } catch {} }
  // Show Sidebar ON → 420px side drawer. OFF → full-screen slide-up sheet in the
  // SAME tab (not a new tab, not a route change).
  const [drawerFull, setDrawerFull] = useState(false)
  const openOrder = (id: string) => { setDrawerId(id); setDrawerFull(!showSidebar) }

  const [printModal, setPrintModal] = useState<{ doc: 'packing_slip' | 'label'; ids: string[]; title: string } | null>(null)
  // Open the print preview (packing slips or labels) as an in-page modal.
  const openPrint = useCallback((docType: 'packing_slip' | 'label', ids: string[]) => {
    if (!ids.length || !companyId) { flash('Select at least one order'); return }
    setPrintModal({ doc: docType, ids, title: docType === 'label' ? `Shipping Label${ids.length > 1 ? 's' : ''}` : `Packing Slip${ids.length > 1 ? 's' : ''}` })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2400) }

  const getMyCompanyId = async (): Promise<string | null> => {
    const peeked = peekCompanyUser()?.companyId
    if (peeked) return peeked
    if (typeof window !== 'undefined') {
      const h = window.location.hostname
      if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
        const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', h.replace('.colvy.com', '')).maybeSingle()
        if (co?.id) return co.id
      }
    }
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      const { data: co } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
      return co?.id || null
    }
    return null
  }

  const loadOrders = useCallback(async (cid: string) => {
    // Read the orders table DIRECTLY via PostgREST (always warm, index-served on
    // (company_id, order_date)) instead of the serverless /api/orders — that
    // route cold-starts and re-validates the auth token on every request, which
    // is the bulk of the load time. The orders table's RLS is permissive, so the
    // anon client reads it fine. The FIRST page paints and drops the spinner
    // immediately; the rest streams in behind it.
    const PAGE = 1000
    const pageQ = (offset: number) => (supabase as any).from('orders').select('*')
      .eq('company_id', cid).order('order_date', { ascending: false }).range(offset, offset + PAGE - 1)
    try {
      const first = await pageQ(0)
      if (first.error) { setToast(`Couldn’t load orders: ${first.error.message}`); setTimeout(() => setToast(''), 6000); setLoading(false); return }
      let acc: any[] = first.data || []
      setOrders(acc.slice()); setLoading(false)
      if (acc.length < PAGE) return
      // Remaining pages — detached so they never block interaction.
      ;(async () => {
        for (let offset = PAGE; offset < 200000; offset += PAGE) {
          const { data, error } = await pageQ(offset)
          if (error || !data?.length) break
          acc = acc.concat(data); setOrders(acc.slice())
          if (data.length < PAGE) break
        }
      })()
    } catch (e: any) { setToast(`Couldn’t load orders: ${e?.message || e}`); setTimeout(() => setToast(''), 6000); setLoading(false) }
  }, [])

  // Build a per-order product search index (name + SKU) so the board search can
  // match by product, which the order rows themselves don't carry. Loaded in the
  // background — search works on order#/name/email/phone/address immediately and
  // gains product matching once this resolves.
  const loadItemIndex = useCallback(async (cid: string) => {
    try {
      const map: Record<string, string> = {}
      const page = 1000
      for (let from = 0; ; from += page) {
        const { data, error } = await (supabase as any).from('order_items')
          .select('order_id, product_name, sku').eq('company_id', cid).range(from, from + page - 1)
        if (error || !data?.length) break
        for (const it of data) {
          const s = `${it.product_name || ''} ${it.sku || ''}`.toLowerCase()
          map[it.order_id] = map[it.order_id] ? `${map[it.order_id]} ${s}` : s
        }
        if (data.length < page) break
      }
      setItemIndex(map)
    } catch {}
  }, [])
  // Load the product index once, the first time the user actually reaches for
  // search — it's the heaviest query (all line items) and most sessions never
  // search by product, so it stays off the initial load entirely.
  const ensureItemIndex = useCallback(() => {
    setSearchTouched(true)
    if (itemIndexLoadedRef.current || !companyId) return
    itemIndexLoadedRef.current = true
    loadItemIndex(companyId)
  }, [companyId, loadItemIndex])

  // Debounce the search term used for filtering so typing over a large book
  // doesn't refilter on every keystroke.
  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 140); return () => clearTimeout(t) }, [search])

  // full=false (automatic, on open): light pass over recent orders, silent — must
  // not slow the board. full=true (manual button): full-book backfill + reload.
  const runSync = useCallback(async (cid: string, full = false) => {
    if (full) setSyncing(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      const authH = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      // Manual Sync: first pull recently-changed orders straight from the
      // WooCommerce REST API so their AUTHORITATIVE dates land in
      // woocommerce_orders (webhook payloads used to store a wrong date). The
      // Orders Sync reconcile below then rewrites the operational order_date from
      // that corrected source. Bounded to recent orders (all the affected ones).
      if (full) {
        try {
          const since = new Date(Date.now() - 60 * 864e5).toISOString()
          for (let page = 1; page <= 30; page++) {
            const wr = await fetch('/api/woocommerce/sync', { method: 'POST', headers: authH, body: JSON.stringify({ companyId: cid, mode: 'orders', page, modifiedAfter: since }) })
            const wd = await wr.json().catch(() => ({}))
            if (!wr.ok || wd.error || wd.done) break
          }
        } catch {}
      }
      const res = await fetch('/api/orders/sync', { method: 'POST', headers: authH, body: JSON.stringify({ companyId: cid, full }) })
      const d = await res.json().catch(() => ({}))
      if (full) {
        if (!res.ok || d.error) { setToast(`Sync failed: ${d.error || res.status}`); setTimeout(() => setToast(''), 8000) }
        else if (typeof d.synced === 'number') { setToast(d.synced > 0 ? `Synced ${d.synced} new orders` : 'Orders are up to date'); setTimeout(() => setToast(''), 3000) }
        await loadOrders(cid)
      } else if (typeof d.synced === 'number' && d.synced > 0) {
        // Light pass found new orders — refresh quietly.
        loadOrders(cid)
      }
    } catch (e: any) { if (full) { setToast(`Sync error: ${e?.message || e}`); setTimeout(() => setToast(''), 8000) } }
    if (full) setSyncing(false)
  }, [loadOrders])

  useEffect(() => {
    (async () => {
      const cid = await getMyCompanyId()
      if (!cid) { setLoading(false); return }
      setCompanyId(cid)
      // Kick the orders load off immediately, in parallel with the accent /
      // locations / prefs / team setup below — the board no longer waits on any
      // of that before its first paint.
      loadOrders(cid)
      try { const { data: co } = await (supabase as any).from('companies').select('accent_color').eq('id', cid).maybeSingle(); if (co?.accent_color) setAccent(co.accent_color) } catch {}
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) setMe({ id: session.user.id, name: session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || 'You' })

      const { data: locs } = await (supabase as any).from('company_locations').select('id, label, suburb, is_primary').eq('company_id', cid).order('is_primary', { ascending: false })
      setLocations((locs || []).map((l: any) => ({ id: l.id, name: l.label || l.suburb || 'Outlet' })))

      // Default outlet — shared with the Tasks/Calendar pages. Pre-filters the board.
      if (session?.user) {
        try {
          const r = await fetch(`/api/user-prefs?userId=${session.user.id}&companyId=${cid}`)
          const j = await r.json()
          const dv = j?.prefs?.default_outlet
          if (dv?.id && (locs || []).some((l: any) => l.id === dv.id)) { setDefaultOutlet(dv.id); setFStore(dv.id) }
          const ds = j?.prefs?.default_status?.key
          if (ds && STATUS_TABS.some(t => t.key === ds)) { setDefaultStatus(ds); setTab(ds) }
          const vs = j?.prefs?.order_views?.views
          if (Array.isArray(vs)) setSavedViews(vs)
        } catch {}
      }

      // Team — mirror the inbox: include the company owner, and don't filter
      // team_members by company_id (invited members can have a null company_id;
      // RLS already scopes them). Filtering by company_id hid everyone.
      const members: { id: string; name: string }[] = []
      const { data: coRow } = await (supabase as any).from('companies').select('owner_id, name').eq('id', cid).maybeSingle()
      if (coRow?.owner_id) members.push({ id: coRow.owner_id, name: coRow.name ? `${coRow.name} (Owner)` : 'Owner' })
      const { data: tms } = await (supabase as any).from('team_members').select('*')
      for (const m of tms || []) {
        if (m.company_id && m.company_id !== cid) continue
        const uid = m.user_id || m.id
        if (!uid || members.some(x => x.id === uid)) continue
        members.push({ id: uid, name: m.name || m.display_name || m.email?.split('@')[0] || 'Teammate' })
      }
      const needIds = members.filter(m => !m.name || m.name === 'Teammate').map(m => m.id)
      if (needIds.length) { try { const r = await fetch('/api/team/names', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userIds: needIds }) }); const names = (await r.json()).names || {}; for (const m of members) if (names[m.id]?.name) m.name = names[m.id].name } catch {} }
      setTeam(members)

      loadTagDefs(cid)
      // Orders are already loading (kicked off above). Bring the operational
      // table up to date from the storefront in the background (idempotent).
      // The product-search index loads lazily on first search use, not here.
      runSync(cid)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live updates — a new or changed order (from the WooCommerce webhook) shows
  // up here instantly, the same way new chats do. No polling.
  useEffect(() => {
    if (!companyId) return
    const ch = (supabase as any).channel(`orders-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `company_id=eq.${companyId}` }, (p: any) => {
        if (p.eventType === 'DELETE') { setOrders(os => os.filter(o => o.id !== p.old?.id)); return }
        const row = p.new; if (!row) return
        setOrders(os => { const i = os.findIndex(o => o.id === row.id); if (i >= 0) { const nx = os.slice(); nx[i] = { ...nx[i], ...row }; return nx } return [row, ...os] })
      })
      .subscribe()
    return () => { try { (supabase as any).removeChannel(ch) } catch {} }
  }, [companyId])

  // Location scope — the same rule the table uses for the Location chips, so the
  // tab counts match what the Location filter actually shows.
  const locMatch = useCallback((o: any) => {
    if (fStore === 'unassigned') return !o.store_location_id && !(Array.isArray(o.tags) && o.tags.length > 0)
    if (fStore !== 'all') return o.store_location_id === fStore
    return true
  }, [fStore])

  // ── Counts for the tabs (scoped to the current Location filter) ─────────────
  const counts = useMemo(() => {
    const scoped = orders.filter(locMatch)
    const c: Record<string, number> = { all: scoped.length, alerts: 0, awaiting_shipment: 0, on_hold: 0, manual: 0, shipped: 0, cancelled: 0, packed: 0, click_and_collect: 0 }
    for (const o of scoped) { c[o.status] = (c[o.status] || 0) + 1; if (o.flagged) c.alerts++ }
    return c
  }, [orders, locMatch])

  const allTags = useMemo(() => Array.from(new Set(orders.flatMap((o: any) => Array.isArray(o.tags) ? o.tags : []))).filter(Boolean), [orders])
  const teamName = (id: string | null) => team.find(t => t.id === id)?.name || null

  // Prebuilt per-order search string, computed once per data change instead of
  // being rebuilt for every row on every keystroke.
  const hayIndex = useMemo(() => {
    const m = new Map<string, string>()
    if (!searchTouched) return m // nobody's searching yet — skip the work during load
    for (const o of orders) {
      const a = o.shipping_address || {}
      const addr = [a.address_1, a.address_2, a.city, a.state, a.postcode, a.country].filter(Boolean).join(' ')
      m.set(o.id, `${o.order_number || ''} ${o.customer_name || ''} ${o.customer_email || ''} ${o.customer_phone || ''} ${addr} ${o.primary_sku || ''} ${Array.isArray(o.tags) ? o.tags.join(' ') : ''} ${itemIndex[o.id] || ''}`.toLowerCase())
    }
    return m
  }, [orders, itemIndex, searchTouched])

  // ── Filter + sort ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    const now = Date.now()
    let rows = orders.filter((o: any) => {
      const tabDef = STATUS_TABS.find(t => t.key === tab)
      if (tab === 'alerts') { if (!o.flagged) return false }
      else if (tabDef?.match) { if (!tabDef.match.includes(o.status)) return false }
      if (!locMatch(o)) return false
      if (fAssignee !== 'all') { if (fAssignee === 'none' ? o.assignee_id : o.assignee_id !== fAssignee) return false }
      if (fTag !== 'all' && !(Array.isArray(o.tags) && o.tags.includes(fTag))) return false
      if (fDate !== 'all' && o.order_date) {
        const age = now - new Date(o.order_date).getTime()
        if (fDate === 'today' && age > 864e5) return false
        if (fDate === '7d' && age > 7 * 864e5) return false
        if (fDate === '30d' && age > 30 * 864e5) return false
      }
      if (saved === 'Today' && (!o.order_date || now - new Date(o.order_date).getTime() > 864e5)) return false
      if (saved === 'Overdue' && (!o.order_date || now - new Date(o.order_date).getTime() < 48 * 3600e3 || ['shipped', 'cancelled'].includes(o.status))) return false
      if (saved === 'High Priority' && !(o.flagged || (Array.isArray(o.tags) && o.tags.some((t: string) => /urgent|high/i.test(t))))) return false
      if (saved === 'Click & Collect' && o.status !== 'click_and_collect') return false
      if (saved === 'Unassigned' && o.assignee_id) return false
      if (saved.startsWith('loc:') && o.store_location_id !== saved.slice(4)) return false
      if (q) { if (!(hayIndex.get(o.id) || '').includes(q)) return false }
      return true
    })
    rows = rows.slice().sort((a: any, b: any) => {
      let av: any, bv: any
      if (sortCol === 'total') { av = Number(a.total) || 0; bv = Number(b.total) || 0 }
      else if (sortCol === 'order_number') { av = a.order_number || ''; bv = b.order_number || '' }
      // age & date both sort by order_date. It's an ISO string, which sorts
      // chronologically as-is — no per-comparison Date parsing (much faster on a
      // large book).
      else { av = a.order_date || ''; bv = b.order_date || '' }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return rows
  }, [orders, tab, debouncedSearch, fStore, fAssignee, fTag, fDate, saved, sortCol, sortDir, locMatch, hayIndex])

  useEffect(() => { setPage(0); setSelected(new Set()) }, [tab, debouncedSearch, fStore, fAssignee, fTag, fDate, saved])
  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize)
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))

  // ── Mutations ──────────────────────────────────────────────────────────────
  const patchOrder = async (ids: string[], patch: any, event?: { type: string; detail: string }) => {
    setOrders(os => os.map(o => ids.includes(o.id) ? { ...o, ...patch } : o))
    try {
      await (supabase as any).from('orders').update({ ...patch, updated_at: new Date().toISOString() }).in('id', ids)
      if (event && companyId) {
        await (supabase as any).from('order_events').insert(ids.map(id => ({ order_id: id, company_id: companyId, type: event.type, detail: event.detail, actor_id: me.id, actor_name: me.name })))
      }
    } catch {}
  }
  const setStatus = (ids: string[], status: string) => patchOrder(ids, { status, ...(status === 'shipped' ? { shipped_at: new Date().toISOString() } : {}) }, { type: status === 'shipped' ? 'shipped' : status === 'packed' ? 'packed' : 'status_changed', detail: `Status set to ${statusMeta(status).label}` })
  const assign = (ids: string[], userId: string | null) => patchOrder(ids, { assignee_id: userId, assignee_name: teamName(userId) }, { type: 'assigned', detail: userId ? `Assigned to ${teamName(userId)}` : 'Unassigned' })
  const outletName = (id: string | null) => locations.find(l => l.id === id)?.name || null
  const setDefaultOutletPref = (id: string | null) => {
    setDefaultOutlet(id); setFStore(id || 'all')
    if (companyId && me.id) fetch('/api/user-prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: me.id, companyId, key: 'default_outlet', value: { id } }) }).catch(() => {})
  }
  const setDefaultStatusPref = (key: string | null) => {
    setDefaultStatus(key); if (key) setTab(key)
    if (companyId && me.id) fetch('/api/user-prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: me.id, companyId, key: 'default_status', value: { key } }) }).catch(() => {})
  }
  // Saved views — a named combination of filters (like ShipStation).
  const persistViews = (views: { id: string; name: string; f: any }[]) => {
    setSavedViews(views)
    if (companyId && me.id) fetch('/api/user-prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: me.id, companyId, key: 'order_views', value: { views } }) }).catch(() => {})
  }
  const saveView = () => setSaveViewName('')
  const confirmSaveView = () => {
    const name = (saveViewName || '').trim()
    if (!name) { setSaveViewName(null); return }
    const f = { tab, fStore, fAssignee, fTag, fDate, saved, sortCol, sortDir }
    const existing = savedViews.find(v => v.name.toLowerCase() === name.toLowerCase())
    const v = { id: existing?.id || `v${Date.now()}`, name, f }
    persistViews([...savedViews.filter(x => x.id !== v.id), v]); setActiveView(v.id); flash(`View “${name}” saved`)
    setSaveViewName(null)
  }
  const applyView = (v: { id: string; f: any }) => {
    const f = v.f || {}
    setTab(f.tab || 'all'); setFStore(f.fStore || 'all'); setFAssignee(f.fAssignee || 'all'); setFTag(f.fTag || 'all'); setFDate(f.fDate || 'all'); setSaved(f.saved || '')
    if (f.sortCol) setSortCol(f.sortCol); if (f.sortDir) setSortDir(f.sortDir)
    setActiveView(v.id)
  }
  const deleteView = (id: string) => { persistViews(savedViews.filter(v => v.id !== id)); if (activeView === id) setActiveView(null) }
  const assignOutlet = (ids: string[], locId: string | null) => {
    patchOrder(ids, { store_location_id: locId }, { type: 'outlet', detail: locId ? `Assigned to ${outletName(locId)}` : 'Outlet cleared' })
    flash(locId ? `Assigned ${ids.length} order${ids.length === 1 ? '' : 's'} to ${outletName(locId)}` : 'Outlet cleared')
  }
  // Apply or remove a tag across a set of orders (bulk Tag dropdown).
  const applyTagToSelected = async (ids: string[], tag: string, on: boolean) => {
    const t = tag.trim(); if (!t) return
    for (const id of ids) {
      const o = orders.find(x => x.id === id); if (!o) continue
      const cur: string[] = Array.isArray(o.tags) ? o.tags : []
      const next = on ? Array.from(new Set([...cur, t])) : cur.filter(x => x !== t)
      if (next.length !== cur.length) await patchOrder([id], { tags: next })
    }
  }
  // Ensure a tag exists in the registry (so it gets a colour + shows in Manage Tags).
  const ensureTagDef = async (name: string, color?: string) => {
    const n = name.trim(); if (!n || !companyId) return
    if (tagDefs.some(t => t.name.toLowerCase() === n.toLowerCase())) return
    try { const { data } = await (supabase as any).from('order_tags').insert({ company_id: companyId, name: n, color: color || hashColor(n) }).select().maybeSingle(); if (data) setTagDefs(d => [...d, { id: data.id, name: data.name, color: data.color }]) } catch {}
  }
  const addTagTo = async (ids: string[], tag: string) => {
    const t = tag.trim(); if (!t) return
    for (const id of ids) {
      const o = orders.find(x => x.id === id); if (!o) continue
      const next = Array.from(new Set([...(o.tags || []), t]))
      await patchOrder([id], { tags: next })
    }
    flash(`Tagged “${t}”`)
  }

  const toggleAll = () => {
    if (pageRows.every(o => selected.has(o.id))) setSelected(new Set())
    else setSelected(new Set(pageRows.map(o => o.id)))
  }
  const toggleOne = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  // ── Styles ─────────────────────────────────────────────────────────────────
  const card: React.CSSProperties = { borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card, #fff)' }
  const ctrl: React.CSSProperties = { padding: '7px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card, #fff)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', outline: 'none' }
  const th: React.CSSProperties = { padding: '10px 12px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)', whiteSpace: 'nowrap', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--canvas)', zIndex: 1 }
  const td: React.CSSProperties = { padding: '11px 12px', fontSize: 13, color: 'var(--ink)', whiteSpace: 'nowrap' }

  const Avatar = ({ name }: { name: string | null }) => {
    if (!name) return <span style={{ fontSize: 12, color: 'var(--slate)' }}>—</span>
    const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    const hue = Array.from(name).reduce((a, c) => a + c.charCodeAt(0), 0) % 360
    return <span title={name} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', background: `hsl(${hue} 60% 90%)`, color: `hsl(${hue} 45% 38%)`, fontSize: 10.5, fontWeight: 800 }}>{initials}</span>
  }
  const kpi = (label: string, value: number, color: string) => (
    <div style={{ ...card, padding: '10px 14px', minWidth: 96 }}>
      <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--slate)' }}>{label}</p>
      <p style={{ margin: '3px 0 0', fontSize: 19, fontWeight: 800, color }}>{value}</p>
    </div>
  )

  if (loading) return <div style={{ padding: 24, color: 'var(--slate)', display: 'flex', gap: 8 }}><div style={{ width: 18, height: 18, border: '2px solid var(--border)', borderTopColor: ACCENT, borderRadius: '50%', animation: 'ospin .8s linear infinite' }} /><style>{`@keyframes ospin{to{transform:rotate(360deg)}}`}</style>Loading orders…</div>

  const selCount = selected.size
  const drawerOrder = orders.find(o => o.id === drawerId) || null

  return (
    <div style={{ padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <style>{`@keyframes ospin{to{transform:rotate(360deg)}} .ord-row:hover{background:var(--canvas)} .tag-opt:hover{background:var(--canvas)} .ord-item:hover{background:var(--canvas)} .ord-note-actions{opacity:0;transition:opacity .12s} .ord-note:hover .ord-note-actions{opacity:1}
        @keyframes ordFade{from{opacity:0}to{opacity:1}}
        @keyframes ordPop{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
        .ord-create-btn{position:relative;transition:transform .16s cubic-bezier(.16,1,.3,1),box-shadow .16s ease,border-color .16s ease,background .16s ease;box-shadow:0 1px 2px rgba(15,23,42,.06)}
        .ord-create-btn:hover{transform:translateY(-1px);box-shadow:0 8px 20px rgba(15,23,42,.14);border-color:var(--ink)}
        .ord-create-btn:active{transform:translateY(0) scale(.97);box-shadow:0 1px 2px rgba(15,23,42,.08)}
        .ord-create-btn .ord-plus{transition:transform .22s cubic-bezier(.16,1,.3,1)}
        .ord-create-btn:hover .ord-plus{transform:rotate(90deg)}`}</style>

      {/* Header + KPIs */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>Orders</h1>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--slate)' }}>Manage and fulfil customer orders{syncing ? ' · syncing…' : ''}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={() => setShowCreateOrder(true)} className="ord-create-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 11, border: 'none', background: ACCENT, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.01em' }}>
            <span className="ord-plus" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </span>
            Create Order
          </button>
          {kpi('All Orders', counts.all, 'var(--ink)')}
          {kpi('Awaiting', (counts.awaiting_shipment || 0) + (counts.packed || 0) + (counts.click_and_collect || 0), ACCENT)}
          {kpi('On Hold', counts.on_hold || 0, '#d97706')}
          {kpi('Shipped', counts.shipped || 0, '#16a34a')}
          {kpi('Alerts', counts.alerts || 0, '#dc2626')}
        </div>
      </div>

      {/* Location filters (left) + status filter (right) share one row. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
      {locations.length > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)', marginRight: 2 }}>Location</span>
          <button type="button" onClick={() => setFStore('unassigned')} title="Orders not assigned to any outlet"
            style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: `1px solid ${fStore === 'unassigned' ? '#d97706' : 'var(--border)'}`, background: fStore === 'unassigned' ? 'color-mix(in srgb, #d97706 12%, transparent)' : 'var(--card,#fff)', color: fStore === 'unassigned' ? '#b45309' : 'var(--slate)' }}>Unassigned</button>
          <button type="button" onClick={() => setFStore('all')}
            style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: `1px solid ${fStore === 'all' ? ACCENT : 'var(--border)'}`, background: fStore === 'all' ? `color-mix(in srgb, ${ACCENT} 12%, transparent)` : 'var(--card,#fff)', color: fStore === 'all' ? ACCENT : 'var(--slate)' }}>All Stores</button>
          {locations.map(l => {
            const active = fStore === l.id; const isDefault = defaultOutlet === l.id
            return (
              <span key={l.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '4px 6px 4px 12px', borderRadius: 20, border: `1px solid ${active ? ACCENT : 'var(--border)'}`, background: active ? `color-mix(in srgb, ${ACCENT} 12%, transparent)` : 'var(--card,#fff)' }}>
                <button type="button" onClick={() => setFStore(active ? 'all' : l.id)} style={{ background: 'none', border: 'none', padding: 0, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', color: active ? ACCENT : 'var(--slate)' }}>{l.name}</button>
                <button type="button" title={isDefault ? 'Clear default outlet' : 'Set as my default outlet'} onClick={() => setDefaultOutletPref(isDefault ? null : l.id)}
                  style={{ background: 'none', border: 'none', padding: '0 2px', cursor: 'pointer', fontSize: 13, lineHeight: 1, color: isDefault ? '#f59e0b' : 'var(--slate)' }}>{isDefault ? '★' : '☆'}</button>
              </span>
            )
          })}
        </div>
      ) : <div />}

      {/* Status filter — collapsed into a Filters button + dropdown. Right-click
          (or the ★) sets a status as the default, applied on next visit. */}
      {(() => {
        const countFor = (t: any) => t.key === 'all' ? counts.all : t.key === 'alerts' ? counts.alerts : (t.match as string[]).reduce((n: number, s: string) => n + (counts[s] || 0), 0)
        const activeTab = STATUS_TABS.find(t => t.key === tab) || STATUS_TABS[0]
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', position: 'relative' }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)', marginRight: 2 }}>Filter</span>
            <button type="button" onClick={() => setStatusMenuOpen(v => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 20, border: `1px solid ${ACCENT}`, background: `color-mix(in srgb, ${ACCENT} 10%, transparent)`, color: ACCENT, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
              {activeTab.label}
              <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 20, background: `color-mix(in srgb, ${ACCENT} 18%, transparent)` }}>{countFor(activeTab)}</span>
              <span style={{ fontSize: 9, opacity: 0.8 }}>▾</span>
            </button>
            {defaultStatus && defaultStatus !== tab && (
              <button type="button" onClick={() => setTab(defaultStatus)} title="Jump to your default filter" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', background: 'none', border: 'none', cursor: 'pointer' }}>
                Default: {STATUS_TABS.find(t => t.key === defaultStatus)?.label}
              </button>
            )}
            {statusMenuOpen && (
              <>
                <div onClick={() => setStatusMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 4500 }} />
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 4501, width: 268, background: 'var(--card,#fff)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 14px 40px rgba(0,0,0,0.16)', padding: 7 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--slate)', padding: '4px 8px 6px' }}>Order status · right-click to set default</div>
                  {STATUS_TABS.map(t => {
                    const active = tab === t.key; const isDefault = defaultStatus === t.key; const n = countFor(t)
                    return (
                      <div key={t.key} onContextMenu={e => { e.preventDefault(); setDefaultStatusPref(isDefault ? null : t.key) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 9, background: active ? `color-mix(in srgb, ${ACCENT} 12%, transparent)` : 'transparent' }} className="tag-opt">
                        <button type="button" onClick={() => { setTab(t.key); setStatusMenuOpen(false) }}
                          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', background: 'none', border: 'none', cursor: 'pointer', color: active ? ACCENT : 'var(--ink)', fontSize: 13, fontWeight: 700 }}>
                          <span>{t.label}</span>
                          <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 20, background: 'var(--canvas)', color: 'var(--slate)' }}>{n}</span>
                        </button>
                        <button type="button" title={isDefault ? 'Clear default filter' : 'Set as my default filter'} onClick={() => setDefaultStatusPref(isDefault ? null : t.key)}
                          style={{ background: 'none', border: 'none', padding: '0 8px', cursor: 'pointer', fontSize: 14, lineHeight: 1, color: isDefault ? '#f59e0b' : 'var(--slate)' }}>{isDefault ? '★' : '☆'}</button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )
      })()}
      </div>

      {/* Saved views — a named combination of filters (ShipStation-style) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)', marginRight: 2 }}>Views</span>
        {savedViews.length === 0 && <span style={{ fontSize: 12, color: 'var(--slate)' }}>No saved views yet</span>}
        {savedViews.map(v => {
          const on = activeView === v.id
          return (
            <span key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '4px 6px 4px 12px', borderRadius: 20, border: `1px solid ${on ? ACCENT : 'var(--border)'}`, background: on ? `color-mix(in srgb, ${ACCENT} 12%, transparent)` : 'var(--card,#fff)' }}>
              <button type="button" onClick={() => applyView(v)} style={{ background: 'none', border: 'none', padding: 0, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', color: on ? ACCENT : 'var(--slate)' }}>{v.name}</button>
              <button type="button" title="Delete view" onClick={() => { if (window.confirm(`Delete view “${v.name}”?`)) deleteView(v.id) }} style={{ background: 'none', border: 'none', padding: '0 2px', cursor: 'pointer', color: 'var(--slate)', fontSize: 13, lineHeight: 1 }}>×</button>
            </span>
          )
        })}
        <button type="button" onClick={saveView} title="Save the current filters as a view" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 20, border: `1px dashed ${ACCENT}`, background: 'var(--card,#fff)', color: ACCENT, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>＋ Save view</button>
      </div>

      {/* Bulk toolbar OR filter row */}
      {selCount > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: ACCENT }}>{selCount} selected</span>
          <button type="button" onClick={() => openPrint('packing_slip', [...selected])} style={{ ...ctrl, background: ACCENT, color: '#fff', border: 'none', fontWeight: 700 }}>Packing Slips</button>
          <button type="button" onClick={() => openPrint('label', [...selected])} style={ctrl}>Print Labels</button>
          <select value="" onChange={e => { if (e.target.value) { assign([...selected], e.target.value === 'none' ? null : e.target.value); setSelected(new Set()) } }} style={ctrl}>
            <option value="">Assign…</option>
            <option value="none">Unassign</option>
            {team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {locations.length > 0 && (
            <select value="" onChange={e => { if (e.target.value) { assignOutlet([...selected], e.target.value === 'none' ? null : e.target.value); setSelected(new Set()) } }} style={ctrl}>
              <option value="">{locations.find(l => l.id === fStore) ? `Outlet: ${locations.find(l => l.id === fStore)!.name}` : 'Assign outlet…'}</option>
              {locations.find(l => l.id === fStore) && <option value={fStore}>✓ Assign to {locations.find(l => l.id === fStore)!.name}</option>}
              <option value="none">No outlet</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          <div style={{ position: 'relative' }}>
            <button type="button" onClick={() => setTagMenuOpen(v => !v)} style={{ ...ctrl, display: 'flex', alignItems: 'center', gap: 5 }}>Tag<span style={{ fontSize: 9, color: 'var(--slate)' }}>▾</span></button>
            {tagMenuOpen && (
              <TagApplyMenu tagDefs={tagDefs} selectedOrders={orders.filter(o => selected.has(o.id))} accent={ACCENT}
                onClose={() => setTagMenuOpen(false)}
                onToggle={(t, on) => applyTagToSelected([...selected], t, on)}
                onCreate={async (name, color) => { await ensureTagDef(name, color); await applyTagToSelected([...selected], name, true) }}
                onManage={() => { setTagMenuOpen(false); setManageTagsOpen(true) }} />
            )}
          </div>
          <select value="" onChange={e => { if (e.target.value) { setStatus([...selected], e.target.value); setSelected(new Set()) } }} style={ctrl}>
            <option value="">Bulk Update…</option>
            <option value="awaiting_shipment">Awaiting Shipment</option>
            <option value="packed">Packed</option>
            <option value="on_hold">On Hold</option>
            <option value="shipped">Shipped</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button type="button" onClick={() => flash('Allocation arrives with the inventory phase.')} style={ctrl}>Allocate</button>
          <button type="button" onClick={() => setSelected(new Set())} style={{ ...ctrl, color: 'var(--slate)' }}>Clear</button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <input value={search} onFocus={ensureItemIndex} onChange={e => { ensureItemIndex(); setSearch(e.target.value) }} placeholder="Order #, name, phone, email, address, SKU, product…" style={{ ...ctrl, minWidth: 280, paddingRight: search ? 28 : 10, cursor: 'text', fontWeight: 500 }} />
            {search && <button type="button" onClick={() => setSearch('')} title="Clear search" style={{ position: 'absolute', right: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', fontSize: 15, lineHeight: 1, padding: 2 }}>×</button>}
          </div>
          <select value={fAssignee} onChange={e => setFAssignee(e.target.value)} style={ctrl}><option value="all">Any assignee</option><option value="none">Unassigned</option>{team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <div style={{ position: 'relative' }}>
            <button type="button" onClick={() => setTagFilterOpen(v => !v)} style={{ ...ctrl, display: 'flex', alignItems: 'center', gap: 6 }}>
              {fTag === 'all' ? 'Any tag' : <TagChip name={fTag} color={tagColor(fTag)} />}
              <span style={{ fontSize: 9, color: 'var(--slate)' }}>▾</span>
            </button>
            {tagFilterOpen && (
              <>
                <div onClick={() => setTagFilterOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 4500 }} />
                <div style={{ position: 'absolute', top: 'calc(100% + 5px)', left: 0, zIndex: 4501, minWidth: 210, maxHeight: 300, overflowY: 'auto', background: 'var(--card,#fff)', border: '1px solid var(--border)', borderRadius: 11, boxShadow: '0 10px 30px rgba(0,0,0,0.16)', padding: 6 }}>
                  <button type="button" className="tag-opt" onClick={() => { setFTag('all'); setTagFilterOpen(false) }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '7px 9px', borderRadius: 8, border: 'none', background: 'none', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer' }}>{fTag === 'all' ? '✓' : ' '} Any tag</button>
                  {Array.from(new Set([...tagDefs.map(t => t.name), ...allTags])).map(t => (
                    <button key={t} type="button" className="tag-opt" onClick={() => { setFTag(t); setTagFilterOpen(false) }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '7px 9px', borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer' }}>
                      <span style={{ width: 12, color: accent }}>{fTag === t ? '✓' : ''}</span><TagChip name={t} color={tagColor(t)} />
                    </button>
                  ))}
                  <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0 0', paddingTop: 6 }}>
                    <button type="button" className="tag-opt" onClick={() => { setTagFilterOpen(false); setManageTagsOpen(true) }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '7px 9px', borderRadius: 8, border: 'none', background: 'none', fontSize: 12.5, fontWeight: 700, color: ACCENT, cursor: 'pointer' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                      Manage tags…
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
          <select value={fDate} onChange={e => setFDate(e.target.value)} style={ctrl}><option value="all">All time</option><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select>
          <button type="button" onClick={() => runSync(companyId!, true)} disabled={syncing} title="Backfill every order from the store" style={{ ...ctrl, color: ACCENT }}>{syncing ? 'Syncing…' : 'Sync'}</button>
          <label title="On: rows open the side drawer. Off: rows open the full order page." style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto', fontSize: 12.5, fontWeight: 600, color: 'var(--slate)', cursor: 'pointer' }}>
            <input type="checkbox" checked={showSidebar} onChange={e => setSidebarPref(e.target.checked)} style={{ accentColor: ACCENT }} />
            Show Sidebar
          </label>
        </div>
      )}

      {/* Table */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 34 }}><input type="checkbox" checked={pageRows.length > 0 && pageRows.every(o => selected.has(o.id))} onChange={toggleAll} /></th>
                {([['order_number', 'Order #'], ['age', 'Age'], ['order_date', 'Order Date'], ['customer', 'Customer'], ['items', 'Items'], ['sku', 'SKU'], ['shipping', 'Shipping'], ['status', 'Status'], ['assignee', 'Assignee'], ['total', 'Total'], ['ind', '']] as [string, string][]).map(([key, label]) => {
                  const sortable = ['order_number', 'age', 'order_date', 'total'].includes(key)
                  return <th key={key} style={{ ...th, cursor: sortable ? 'pointer' : 'default', textAlign: key === 'total' ? 'right' : 'left' }}
                    onClick={() => { if (!sortable) return; const col = key === 'age' ? 'order_date' : key as any; if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir(key === 'total' ? 'desc' : 'desc') } }}>
                    {label}{sortable && (sortCol === (key === 'age' ? 'order_date' : key) ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '')}
                  </th>
                })}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && <tr><td colSpan={12} style={{ padding: 32, textAlign: 'center', color: 'var(--slate)' }}>No orders match.</td></tr>}
              {pageRows.map((o: any) => {
                const sm = statusMeta(o.status)
                const age = orderAge(o.order_date)
                const sel = selected.has(o.id)
                return (
                  <tr key={o.id} className="ord-row" onClick={() => openOrder(o.id)} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: drawerId === o.id ? `color-mix(in srgb, ${ACCENT} 10%, transparent)` : sel ? `color-mix(in srgb, ${ACCENT} 5%, transparent)` : isClickCollect(o) ? 'color-mix(in srgb, #3b82f6 9%, transparent)' : undefined }}>
                    <td style={td} onClick={e => { e.stopPropagation(); toggleOne(o.id) }}><input type="checkbox" checked={sel} onChange={() => {}} /></td>
                    <td style={{ ...td, color: ACCENT, fontWeight: 700 }}>{o.order_number}</td>
                    <td style={{ ...td, fontWeight: 700, color: age.color }}>{age.label}</td>
                    <td style={{ ...td, color: 'var(--slate)' }}>{o.order_date ? new Date(o.order_date).toLocaleString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{o.customer_name || '—'}</td>
                    <td style={td}>{o.item_count || 0}</td>
                    <td style={{ ...td, color: 'var(--slate)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.primary_sku || '—'}</td>
                    <td style={{ ...td, color: 'var(--slate)' }}>{isClickCollect(o)
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700, color: '#2563eb' }}><ClickCollectIcon size={14} />Click &amp; Collect</span>
                      : (Number(o.shipping_total) || 0) > 0 ? <span>{o.shipping_method || 'Shipping'} <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{fmtMoney(o.shipping_total, o.currency)}</span></span> : (o.shipping_method || 'Free')}</td>
                    <td style={td}><span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: sm.bg, color: sm.fg }}>{sm.label}</span></td>
                    <td style={td}><Avatar name={o.assignee_name || teamName(o.assignee_id)} /></td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtMoney(o.total, o.currency)}</td>
                    <td style={td}><ChannelIcon channel={o.sales_channel} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>Showing {filtered.length === 0 ? 0 : page * pageSize + 1}–{Math.min(filtered.length, (page + 1) * pageSize)} of {filtered.length}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button type="button" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} style={{ ...ctrl, opacity: page === 0 ? 0.4 : 1 }}>‹</button>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>{page + 1} / {totalPages}</span>
            <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} style={{ ...ctrl, opacity: page + 1 >= totalPages ? 0.4 : 1 }}>›</button>
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0) }} style={ctrl}>{[25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}</select>
          </div>
        </div>
      </div>

      {toast && <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', background: 'var(--ink)', color: '#fff', padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 5000, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>{toast}</div>}

      {drawerOrder && (
        <OrderDrawer key={drawerOrder.id} order={drawerOrder} companyId={companyId!} me={me} team={team} locations={locations} accent={accent} allTags={allTags}
          tagDefs={tagDefs} tagColor={tagColor} onEnsureTag={ensureTagDef} onManageTags={() => setManageTagsOpen(true)}
          onClose={() => setDrawerId(null)}
          onPatch={(patch, ev) => patchOrder([drawerOrder.id], patch, ev)}
          onFlash={flash} teamName={teamName} outletName={outletName} fullScreen={drawerFull}
          onLabel={(o: Order) => setLabelOrder(o)}
          onPrintSlip={(id: string) => openPrint('packing_slip', [id])}
          onPrintLabel={(id: string) => openPrint('label', [id])}
          onLabelPdf={(url: string) => setLabelPdf(url)} />
      )}

      {labelOrder && (
        <CreateLabelModal order={labelOrder} companyId={companyId!} accent={ACCENT}
          onClose={() => setLabelOrder(null)}
          onDone={(patch: any) => { patchOrder([labelOrder.id], patch); setLabelOrder(null) }}
          onFlash={flash} onPrintLabel={(id: string) => openPrint('label', [id])}
          onLabelPdf={(url: string) => setLabelPdf(url)} />
      )}

      {manageTagsOpen && (
        <ManageTagsModal companyId={companyId!} accent={ACCENT} tagDefs={tagDefs} setTagDefs={setTagDefs}
          orders={orders} setOrders={setOrders} onFlash={flash} onClose={() => setManageTagsOpen(false)} />
      )}

      {printModal && <PrintModal doc={printModal.doc} companyId={companyId!} ids={printModal.ids} title={printModal.title} accent={ACCENT} onClose={() => setPrintModal(null)} />}

      {labelPdf && <LabelPdfModal url={labelPdf} accent={ACCENT} onClose={() => setLabelPdf(null)} />}

      {showCreateOrder && companyId && (
        <CreateOrderPanel companyId={companyId} staffName={me.name} staffId={me.id || undefined}
          onClose={() => setShowCreateOrder(false)}
          onCreated={() => { flash('Order created'); runSync(companyId) }} />
      )}

      {saveViewName !== null && (
        <div onClick={() => setSaveViewName(null)} style={{ position: 'fixed', inset: 0, zIndex: 5200, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'ordFade .15s ease' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: 'var(--card,#fff)', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.28)', padding: 22, animation: 'ordPop .18s cubic-bezier(.16,1,.3,1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 10, background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`, color: ACCENT }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
              </span>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>Save this view</h3>
            </div>
            <p style={{ margin: '0 0 14px 44px', fontSize: 12.5, color: 'var(--slate)' }}>Give the current filters a name so you can jump back to them.</p>
            <input autoFocus value={saveViewName} onChange={e => setSaveViewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmSaveView(); else if (e.key === 'Escape') setSaveViewName(null) }}
              placeholder="e.g. Somerton — Backorder"
              style={{ width: '100%', padding: '11px 13px', borderRadius: 11, border: `1.5px solid ${ACCENT}`, fontSize: 14, outline: 'none', boxSizing: 'border-box', color: 'var(--ink)', background: 'var(--card,#fff)' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, marginTop: 18 }}>
              <button type="button" onClick={() => setSaveViewName(null)} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--slate)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button type="button" onClick={confirmSaveView} disabled={!saveViewName.trim()} style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: saveViewName.trim() ? ACCENT : 'var(--border)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: saveViewName.trim() ? 'pointer' : 'default' }}>Save view</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tag combobox — type to filter existing tags or create one on the fly ──────
export function TagMenu({ tags, accent, align = 'left', onPick, onClose }: { tags: string[]; accent: string; align?: 'left' | 'right'; onPick: (tag: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const query = q.trim()
  const filtered = tags.filter(t => t.toLowerCase().includes(query.toLowerCase()))
  const canCreate = !!query && !tags.some(t => t.toLowerCase() === query.toLowerCase())
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 4500 }} />
      <div style={{ position: 'absolute', top: 'calc(100% + 5px)', [align]: 0, zIndex: 4501, width: 224, background: 'var(--card, #fff)', border: '1px solid var(--border)', borderRadius: 11, boxShadow: '0 10px 30px rgba(0,0,0,0.16)', padding: 7 }}>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && query) { onPick(query); onClose() } else if (e.key === 'Escape') onClose() }}
          placeholder="Find or create tag…"
          style={{ width: '100%', padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, outline: 'none', boxSizing: 'border-box' }} />
        <div style={{ maxHeight: 214, overflowY: 'auto', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {filtered.map(t => (
            <button key={t} type="button" className="tag-opt" onClick={() => { onPick(t); onClose() }}
              style={{ textAlign: 'left', padding: '7px 9px', borderRadius: 8, border: 'none', background: 'none', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer' }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: accent, marginRight: 8, verticalAlign: 'middle' }} />{t}
            </button>
          ))}
          {canCreate && (
            <button type="button" className="tag-opt" onClick={() => { onPick(query); onClose() }}
              style={{ textAlign: 'left', padding: '7px 9px', borderRadius: 8, border: 'none', background: 'none', fontSize: 12.5, fontWeight: 700, color: accent, cursor: 'pointer' }}>
              + Create “{query}”
            </button>
          )}
          {!filtered.length && !canCreate && <span style={{ padding: '7px 9px', fontSize: 12, color: 'var(--slate)' }}>No tags yet — type to create one</span>}
        </div>
      </div>
    </>
  )
}

// ── Create-label modal — records a shipment, marks shipped, prints label ──────
// Parcel presets so a packer picks a box instead of typing three numbers. Sizes
// in cm — the common Australia Post satchels/boxes plus a Custom escape hatch.
const PACKAGE_PRESETS: { key: string; label: string; dims: { length: number; width: number; height: number } | null }[] = [
  { key: 'custom', label: 'Custom size', dims: null },
  { key: 'satchel_s', label: 'Satchel — Small (DL)', dims: { length: 22, width: 12, height: 4 } },
  { key: 'satchel_m', label: 'Satchel — Medium (A4)', dims: { length: 32, width: 24, height: 5 } },
  { key: 'satchel_l', label: 'Satchel — Large (A3)', dims: { length: 40, width: 30, height: 6 } },
  { key: 'box_s', label: 'Box — Small', dims: { length: 22, width: 16, height: 10 } },
  { key: 'box_m', label: 'Box — Medium', dims: { length: 35, width: 25, height: 20 } },
  { key: 'box_l', label: 'Box — Large', dims: { length: 45, width: 35, height: 30 } },
]

// Guess our internal carrier key from a Starshipit rate's carrier display name,
// so a chosen live rate still stores a clean carrier + tracking link.
function guessCarrierKey(name?: string | null): string {
  const s = String(name || '').toLowerCase()
  if (s.includes('startrack') || s.includes('star track')) return 'startrack'
  if (s.includes('aus') || s.includes('auspost') || (s.includes('post') && !s.includes('star'))) return 'australia_post'
  if (s.includes('global') || s.includes('tge') || s.includes('team')) return 'team_global_express'
  if (s.includes('sendle')) return 'sendle'
  if (s.includes('aramex')) return 'aramex'
  if (s.includes('dhl')) return 'dhl'
  return 'custom'
}

export function CreateLabelModal({ order, companyId, accent, onClose, onDone, onFlash, onPrintLabel, onLabelPdf }: any) {
  const ACCENT = accent || 'var(--coral)'
  // Ship-from locations.
  const [locations, setLocations] = useState<any[]>([])
  const [fromLocationId, setFromLocationId] = useState<string>('')
  // Weight (kg + g) and parcel — prefilled from a previously saved value.
  const savedMeta = order.metadata || {}
  const savedG: number = Number(savedMeta.ship_weight_grams) || 0
  const savedParcel = savedMeta.ship_parcel || null
  const [kg, setKg] = useState<string>(savedG ? String(Math.floor(savedG / 1000)) : '')
  const [g, setG] = useState<string>(savedG ? String(savedG % 1000) : '')
  const [pkgPreset, setPkgPreset] = useState<string>('custom')
  const [dims, setDims] = useState({
    length: savedParcel?.length ? String(savedParcel.length) : '',
    width: savedParcel?.width ? String(savedParcel.width) : '',
    height: savedParcel?.height ? String(savedParcel.height) : '',
  })
  // Rates.
  const [rates, setRates] = useState<any[]>([])
  const [ratesConfigured, setRatesConfigured] = useState<boolean | null>(null)
  const [provider, setProvider] = useState<string>('')
  const [ratesError, setRatesError] = useState<string>('')
  const [loadingRates, setLoadingRates] = useState(false)
  const [selRate, setSelRate] = useState<number>(-1)
  const [diag, setDiag] = useState<any>(null)
  const [diagBusy, setDiagBusy] = useState(false)
  // Manual fallback (no Starshipit).
  const [carrier, setCarrier] = useState<string>(order.carrier || 'australia_post')
  const [service, setService] = useState<string>(CARRIER_SERVICES[order.carrier || 'australia_post']?.[0] || '')
  const [markShipped, setMarkShipped] = useState(true)
  const [busy, setBusy] = useState(false)

  const weightGrams = Math.round((Number(kg) || 0) * 1000 + (Number(g) || 0))
  const parcel = (dims.length || dims.width || dims.height)
    ? { length: Number(dims.length) || undefined, width: Number(dims.width) || undefined, height: Number(dims.height) || undefined }
    : null

  useEffect(() => { setService(CARRIER_SERVICES[carrier]?.[0] || '') }, [carrier])

  // Load ship-from locations (primary first).
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('company_locations').select('id, label, suburb, state, is_primary').eq('company_id', companyId).order('is_primary', { ascending: false })
      const locs = (data as any[]) || []
      setLocations(locs)
      if (locs.length) setFromLocationId(String(order.store_location_id || locs[0].id))
    })()
  }, [companyId, order.store_location_id])

  const applyPreset = (key: string) => {
    setPkgPreset(key)
    const p = PACKAGE_PRESETS.find(x => x.key === key)
    if (p?.dims) setDims({ length: String(p.dims.length), width: String(p.dims.width), height: String(p.dims.height) })
  }

  const fetchRates = useCallback(async () => {
    if (weightGrams <= 0) { setRates([]); setSelRate(-1); return }
    setLoadingRates(true); setRatesError('')
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      const res = await fetch('/api/orders/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ companyId, orderId: order.id, weightGrams, parcel, fromLocationId: fromLocationId || undefined }),
      })
      const j = await res.json().catch(() => ({}))
      setRatesConfigured(!!j.configured)
      if (j.provider) setProvider(String(j.provider))
      setRates(Array.isArray(j.rates) ? j.rates : [])
      setSelRate(j.rates?.length ? 0 : -1)  // cheapest (API sorts ascending)
      if (j.error) setRatesError(String(j.error))
    } catch (e: any) { setRatesError(e?.message || String(e)) }
    finally { setLoadingRates(false) }
  }, [companyId, order.id, weightGrams, JSON.stringify(parcel)])

  // Auto-fetch rates shortly after weight/parcel settle.
  useEffect(() => {
    if (weightGrams <= 0) { setRates([]); setSelRate(-1); return }
    const t = setTimeout(() => { fetchRates() }, 300)
    return () => clearTimeout(t)
  }, [weightGrams, JSON.stringify(parcel)]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pull the raw Starshipit response so the operator can see exactly what the
  // provider returned when a parcel gets zero rates.
  const runDiag = async () => {
    setDiagBusy(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      const res = await fetch('/api/orders/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ companyId, orderId: order.id, weightGrams, parcel, fromLocationId: fromLocationId || undefined, debug: true }),
      })
      const j = await res.json().catch(() => ({}))
      if (j.provider) setProvider(String(j.provider))
      setDiag({ providerRaw: j.providerRaw ?? null, providerRequest: j.providerRequest ?? null, error: j.error ?? null })
    } catch (e: any) { setDiag({ error: e?.message || String(e) }) }
    finally { setDiagBusy(false) }
  }

  // Remember the entered weight + parcel on the order, so it's prefilled next
  // time this order's shipment is configured. Debounced; best-effort.
  useEffect(() => {
    if (weightGrams <= 0) return
    const t = setTimeout(async () => {
      try {
        const meta = { ...(order.metadata || {}), ship_weight_grams: weightGrams, ship_parcel: parcel }
        await (supabase.from('orders') as any).update({ metadata: meta }).eq('id', order.id)
        order.metadata = meta // keep the in-memory row in sync for this session
      } catch {}
    }, 900)
    return () => clearTimeout(t)
  }, [weightGrams, JSON.stringify(parcel)]) // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = selRate >= 0 ? rates[selRate] : null
  const costLabel = chosen?.price != null ? `$${Number(chosen.price).toFixed(2)}` : '$—'
  const etaLabel = chosen?.eta || '—'

  const submit = async () => {
    if (weightGrams <= 0) { onFlash('Please enter a weight.'); return }
    setBusy(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      const payload: any = { companyId, orderId: order.id, weightGrams, parcel, markShipped, fromLocationId: fromLocationId || undefined }
      if (chosen) {
        payload.carrier = guessCarrierKey(chosen.carrier)
        payload.service = chosen.service || null
        payload.serviceCode = chosen.serviceCode || null
        payload.rateId = chosen.rateId || null
        payload.cost = chosen.price ?? null
      } else {
        payload.carrier = carrier
        payload.service = service
      }
      const res = await fetch('/api/orders/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) { onFlash(`Label failed: ${j.error || res.status}`); setBusy(false); return }
      onDone(j.patch || {})
      onFlash(j.live ? 'Label purchased' : 'Label created')
      // Live carriers return a real PDF — show it in-app (a popup-blocker eats a
      // window.open after this await); otherwise our printable-label route.
      if (j.label?.labelUrl && onLabelPdf) onLabelPdf(j.label.labelUrl)
      else if (onPrintLabel) onPrintLabel(order.id)
    } catch (e: any) { onFlash(`Label error: ${e?.message || e}`); setBusy(false) }
  }

  const field: React.CSSProperties = { width: '100%', padding: '9px 10px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, outline: 'none', boxSizing: 'border-box', background: 'var(--card,#fff)', color: 'var(--ink)' }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'block', marginBottom: 5 }
  const addr = order.shipping_address || {}
  const hasAddr = addr.address_1 || addr.city
  const noRates = ratesConfigured === false // no rate provider connected → manual picker
  const providerName = 'your carrier account'

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 4600 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 470, maxWidth: '94vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: 'var(--card, #fff)', borderRadius: 16, zIndex: 4601, boxShadow: '0 24px 60px rgba(0,0,0,0.28)' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flex: '0 0 auto' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Configure Shipment</h2>
            <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>Order {order.order_number} · {order.customer_name}</p>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--slate)', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', flex: '1 1 auto' }}>
          {!hasAddr && <div style={{ padding: '9px 12px', borderRadius: 9, background: '#fef3c7', color: '#92400e', fontSize: 12.5 }}>No shipping address on this order — the label will print without a delivery address.</div>}

          {/* Ship From */}
          <div>
            <label style={lbl}>Ship From</label>
            {locations.length > 1 ? (
              <select value={fromLocationId} onChange={e => setFromLocationId(e.target.value)} style={field}>
                {locations.map(l => <option key={l.id} value={l.id}>{l.label || l.suburb || 'Location'}{l.suburb ? ` · ${l.suburb}` : ''}</option>)}
              </select>
            ) : (
              <div style={{ ...field, display: 'flex', alignItems: 'center', color: 'var(--ink)' }}>{locations[0]?.label || locations[0]?.suburb || 'Primary location'}</div>
            )}
          </div>

          {/* Weight */}
          <div>
            <label style={lbl}>Weight</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input type="number" min="0" step="0.1" value={kg} onChange={e => setKg(e.target.value)} placeholder="0" style={{ ...field, paddingRight: 30 }} />
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--slate)', pointerEvents: 'none' }}>kg</span>
              </div>
              <div style={{ position: 'relative', flex: 1 }}>
                <input type="number" min="0" step="1" value={g} onChange={e => setG(e.target.value)} placeholder="0" style={{ ...field, paddingRight: 26 }} />
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--slate)', pointerEvents: 'none' }}>g</span>
              </div>
            </div>
          </div>

          {/* Package + size */}
          <div>
            <label style={lbl}>Package</label>
            <select value={pkgPreset} onChange={e => applyPreset(e.target.value)} style={field}>
              {PACKAGE_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Size (cm)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['length', 'width', 'height'] as const).map(k => (
                <div key={k} style={{ position: 'relative', flex: 1 }}>
                  <input type="number" min="0" value={(dims as any)[k]} onChange={e => { setPkgPreset('custom'); setDims(d => ({ ...d, [k]: e.target.value })) }} placeholder={k[0].toUpperCase()} style={{ ...field, padding: '9px 6px', textAlign: 'center' }} />
                </div>
              ))}
            </div>
          </div>

          {/* Service / live rates */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <label style={{ ...lbl, marginBottom: 0 }}>Service</label>
              {!noRates && <button type="button" onClick={fetchRates} disabled={weightGrams <= 0 || loadingRates} style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 12, fontWeight: 700, cursor: weightGrams <= 0 ? 'default' : 'pointer', opacity: weightGrams <= 0 ? 0.5 : 1 }}>{loadingRates ? 'Fetching…' : 'Browse rates ↻'}</button>}
            </div>

            {noRates ? (
              <>
                <select value={carrier} onChange={e => setCarrier(e.target.value)} style={{ ...field, marginBottom: 8 }}>
                  {CARRIERS.map(c => <option key={c} value={c}>{CARRIER_LABEL[c] || c}</option>)}
                </select>
                <select value={service} onChange={e => setService(e.target.value)} style={field}>
                  {(CARRIER_SERVICES[carrier] || ['Standard']).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--slate)', lineHeight: 1.5 }}>Connect a shipping carrier to see live prices. Until then this prints a scannable label with a tracking number.</p>
              </>
            ) : weightGrams <= 0 ? (
              <div style={{ padding: '12px', borderRadius: 9, background: 'var(--canvas)', fontSize: 12.5, color: 'var(--slate)', textAlign: 'center' }}>Enter a weight to see live rates.</div>
            ) : loadingRates ? (
              <div style={{ padding: '12px', borderRadius: 9, background: 'var(--canvas)', fontSize: 12.5, color: 'var(--slate)', textAlign: 'center' }}>Fetching live rates…</div>
            ) : rates.length === 0 ? (
              <>
                <div style={{ padding: '12px', borderRadius: 9, background: '#fef3c7', color: '#92400e', fontSize: 12.5, lineHeight: 1.5, marginBottom: 10 }}>
                  {ratesError
                    ? <><strong>Carrier:</strong> {ratesError}</>
                    : 'No rates returned for this parcel.'}
                  <div style={{ marginTop: 6, fontSize: 11.5, color: '#a16207' }}>Check that at least one <strong>carrier is connected</strong> in {providerName}, the <strong>ship-from address</strong> is set, and the destination has a valid postcode.</div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <button type="button" onClick={runDiag} disabled={diagBusy} style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>{diagBusy ? 'Checking…' : 'Show carrier response ▾'}</button>
                  {diag && (
                    <pre style={{ marginTop: 8, padding: '10px 12px', borderRadius: 9, background: 'var(--canvas)', border: '1px solid var(--border)', fontSize: 11, lineHeight: 1.5, color: 'var(--ink)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflowY: 'auto' }}>
{JSON.stringify({ sent: diag.providerRequest, received: diag.providerRaw, error: diag.error }, null, 2)}
                    </pre>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--slate)', marginBottom: 6 }}>Pick a carrier manually to print a label now:</div>
                <select value={carrier} onChange={e => setCarrier(e.target.value)} style={{ ...field, marginBottom: 8 }}>
                  {CARRIERS.map(c => <option key={c} value={c}>{CARRIER_LABEL[c] || c}</option>)}
                </select>
                <select value={service} onChange={e => setService(e.target.value)} style={field}>
                  {(CARRIER_SERVICES[carrier] || ['Standard']).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 220, overflowY: 'auto' }}>
                {rates.map((r, i) => (
                  <button type="button" key={i} onClick={() => setSelRate(i)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                    border: `1.5px solid ${selRate === i ? ACCENT : 'var(--border)'}`, background: selRate === i ? 'color-mix(in srgb, var(--accent, #2563eb) 7%, transparent)' : 'var(--card,#fff)',
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.service || r.carrier || 'Service'}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--slate)' }}>{[r.carrier, r.eta].filter(Boolean).join(' · ') || '—'}</div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{r.price != null ? `$${Number(r.price).toFixed(2)}` : '—'}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
            <input type="checkbox" checked={markShipped} onChange={e => setMarkShipped(e.target.checked)} />
            Mark order as Shipped after creating the label
          </label>
        </div>

        {/* Cost review + action */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', flex: '0 0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Cost review</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.1 }}>{costLabel}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Est. arrival</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{etaLabel}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ padding: '11px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button type="button" onClick={submit} disabled={busy} style={{ flex: 1, padding: '11px 18px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff', fontSize: 13.5, fontWeight: 800, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? 'Creating…' : 'Create + Print Label'}</button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── In-page print preview modal — renders the slip/label inline (no iframe, so
// no app-shell flash) and prints via the scoped print CSS. ───────────────────
export function PrintModal({ doc, companyId, ids, title, accent, onClose }: { doc: 'packing_slip' | 'label'; companyId: string; ids: string[]; title: string; accent: string; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted || typeof document === 'undefined') return null
  // Rendered through a portal at <body> so that when printing we can hide every
  // other body child and let each order's .doc-page break onto its own page
  // (page-break-after fails inside a fixed/absolute-positioned modal).
  return createPortal(
    <div className="order-print-portal">
      <style>{`
        @media print {
          html, body { background: #fff !important; }
          body > *:not(.order-print-portal) { display: none !important; }
          .order-print-portal .no-print, .order-print-backdrop { display: none !important; }
          .order-print-modal { position: static !important; inset: auto !important; transform: none !important; width: auto !important; max-width: none !important; height: auto !important; max-height: none !important; box-shadow: none !important; border-radius: 0 !important; overflow: visible !important; background: #fff !important; }
          .order-print-scroll { overflow: visible !important; height: auto !important; background: #fff !important; }
        }
      `}</style>
      <div className="order-print-backdrop" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 4700 }} />
      <div className="order-print-modal" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 880, maxWidth: '96vw', height: '90vh', background: '#fff', borderRadius: 14, zIndex: 4701, boxShadow: '0 24px 60px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#0f172a', color: '#fff', flexShrink: 0 }}>
          <strong style={{ fontSize: 14 }}>{title}</strong>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={() => window.print()} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Print</button>
          <button type="button" onClick={onClose} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
        </div>
        <div className="order-print-scroll" style={{ flex: 1, overflow: 'auto', background: '#f1f5f9' }}>
          <OrderPrintDoc doc={doc} companyId={companyId} ids={ids} />
        </div>
      </div>
    </div>,
    document.body
  )
}

// A carrier's real label PDF shown in-app (no popup — the pop-up blocker eats a
// window.open fired after an await). Embeds the PDF and offers Print plus an
// "Open in new tab" link that IS a direct user gesture, so it's never blocked.
export function LabelPdfModal({ url, accent, onClose }: { url: string; accent: string; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted || typeof document === 'undefined') return null
  const print = () => { try { iframeRef.current?.contentWindow?.focus(); iframeRef.current?.contentWindow?.print() } catch {} }
  return createPortal(
    <div>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 4700 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 720, maxWidth: '96vw', height: '90vh', background: '#fff', borderRadius: 14, zIndex: 4701, boxShadow: '0 24px 60px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#0f172a', color: '#fff', flexShrink: 0 }}>
          <strong style={{ fontSize: 14 }}>Shipping Label</strong>
          <div style={{ flex: 1 }} />
          <a href={url} target="_blank" rel="noreferrer" style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Open in new tab</a>
          <button type="button" onClick={print} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Print</button>
          <button type="button" onClick={onClose} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
        </div>
        <iframe ref={iframeRef} src={url} title="Shipping Label" style={{ flex: 1, border: 'none', background: '#f1f5f9', width: '100%' }} />
      </div>
    </div>,
    document.body
  )
}

// ── Bulk Tag dropdown — apply/remove managed tags across selected orders ──────
function TagApplyMenu({ tagDefs, selectedOrders, accent, onToggle, onCreate, onManage, onClose }: any) {
  const [q, setQ] = useState('')
  const query = q.trim()
  const list = tagDefs.filter((t: any) => t.name.toLowerCase().includes(query.toLowerCase()))
  const canCreate = !!query && !tagDefs.some((t: any) => t.name.toLowerCase() === query.toLowerCase())
  const n = selectedOrders.length
  const countWith = (name: string) => selectedOrders.filter((o: any) => (o.tags || []).includes(name)).length
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 4500 }} />
      <div style={{ position: 'absolute', top: 'calc(100% + 5px)', left: 0, zIndex: 4501, width: 260, background: 'var(--card, #fff)', border: '1px solid var(--border)', borderRadius: 11, boxShadow: '0 10px 30px rgba(0,0,0,0.16)', padding: 7 }}>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && canCreate) { onCreate(query); setQ('') } else if (e.key === 'Escape') onClose() }}
          placeholder="Find or create tag…" style={{ width: '100%', padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, outline: 'none', boxSizing: 'border-box' }} />
        <div style={{ maxHeight: 240, overflowY: 'auto', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {list.map((t: any) => {
            const c = countWith(t.name); const all = n > 0 && c === n
            return (
              <button key={t.id} type="button" className="tag-opt" onClick={() => onToggle(t.name, !all)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <input type="checkbox" readOnly checked={all} ref={el => { if (el) el.indeterminate = c > 0 && !all }} style={{ accentColor: accent, pointerEvents: 'none' }} />
                <TagChip name={t.name} color={t.color} />
              </button>
            )
          })}
          {canCreate && (
            <button type="button" className="tag-opt" onClick={() => { onCreate(query); setQ('') }}
              style={{ textAlign: 'left', padding: '7px 8px', borderRadius: 8, border: 'none', background: 'none', fontSize: 12.5, fontWeight: 700, color: accent, cursor: 'pointer' }}>+ Create “{query}”</button>
          )}
          {!list.length && !canCreate && <span style={{ padding: '7px 8px', fontSize: 12, color: 'var(--slate)' }}>No tags — type to create one</span>}
        </div>
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
          <button type="button" onClick={onManage} style={{ width: '100%', textAlign: 'left', padding: '7px 8px', borderRadius: 8, border: 'none', background: 'none', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', cursor: 'pointer' }}>⚙ Manage Tags</button>
        </div>
      </div>
    </>
  )
}

// ── Manage Tags dialog — create / rename / recolour / delete the palette ──────
function ManageTagsModal({ companyId, accent, tagDefs, setTagDefs, orders, setOrders, onFlash, onClose }: any) {
  const PALETTE = Array.from(new Set([...TAG_PALETTE, '#111827', '#0ea5e9', '#22c55e', '#f59e0b', '#ec4899']))
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editName, setEditName] = useState(''); const [editColor, setEditColor] = useState('')
  const [newName, setNewName] = useState(''); const [newColor, setNewColor] = useState(PALETTE[0])
  const [busy, setBusy] = useState(false)

  // Show every tag: the managed palette PLUS any tag already applied to orders
  // that isn't in the palette yet (e.g. created before tags were managed).
  const rowKey = (t: any) => t.id || `n:${String(t.name).toLowerCase()}`
  const applied: string[] = Array.from(new Set((orders || []).flatMap((o: any) => Array.isArray(o.tags) ? o.tags : []))).filter(Boolean) as string[]
  const rows = [
    ...tagDefs.map((t: any) => ({ ...t, unregistered: false })),
    ...applied.filter(a => !tagDefs.some((t: any) => t.name.toLowerCase() === a.toLowerCase())).map(name => ({ id: null, name, color: hashColor(name), unregistered: true })),
  ]

  const rewriteOrders = async (from: string, to: string | null) => {
    const affected = orders.filter((o: any) => (o.tags || []).includes(from))
    setOrders((os: any[]) => os.map(o => (o.tags || []).includes(from) ? { ...o, tags: to ? (o.tags || []).map((x: string) => x === from ? to : x) : (o.tags || []).filter((x: string) => x !== from) } : o))
    for (const o of affected) {
      const next = to ? (o.tags || []).map((x: string) => x === from ? to : x) : (o.tags || []).filter((x: string) => x !== from)
      try { await (supabase as any).from('orders').update({ tags: next }).eq('id', o.id) } catch {}
    }
  }
  const create = async () => {
    const n = newName.trim(); if (!n) return
    if (tagDefs.some((t: any) => t.name.toLowerCase() === n.toLowerCase())) { onFlash('Tag already exists'); return }
    setBusy(true)
    try { const { data } = await (supabase as any).from('order_tags').insert({ company_id: companyId, name: n, color: newColor }).select().maybeSingle(); if (data) { setTagDefs((d: any[]) => [...d, { id: data.id, name: data.name, color: data.color }]); setNewName('') } } catch { onFlash('Could not create tag') }
    setBusy(false)
  }
  const startEdit = (t: any) => { setEditingKey(rowKey(t)); setEditName(t.name); setEditColor(t.color) }
  const saveEdit = async (t: any) => {
    const n = editName.trim() || t.name
    setBusy(true)
    try {
      if (t.id) {
        await (supabase as any).from('order_tags').update({ name: n, color: editColor }).eq('id', t.id)
        setTagDefs((d: any[]) => d.map(x => x.id === t.id ? { ...x, name: n, color: editColor } : x))
      } else {
        // Unregistered (applied-only) tag → register it now with the chosen colour.
        const { data } = await (supabase as any).from('order_tags').insert({ company_id: companyId, name: n, color: editColor }).select().maybeSingle()
        if (data) setTagDefs((d: any[]) => [...d, { id: data.id, name: data.name, color: data.color }])
      }
      if (n !== t.name) await rewriteOrders(t.name, n)
    } catch { onFlash('Could not save tag') }
    setEditingKey(null); setBusy(false)
  }
  const del = async (t: any) => {
    if (!window.confirm(`Delete tag “${t.name}”? It will be removed from all orders.`)) return
    setBusy(true)
    try { if (t.id) await (supabase as any).from('order_tags').delete().eq('id', t.id); await rewriteOrders(t.name, null); setTagDefs((d: any[]) => d.filter(x => x.id !== t.id)) } catch { onFlash('Could not delete tag') }
    setBusy(false)
  }
  const Swatches = ({ value, onPick }: { value: string; onPick: (c: string) => void }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {PALETTE.map(c => <button key={c} type="button" onClick={() => onPick(c)} title={c} style={{ width: 20, height: 20, borderRadius: 5, background: c, border: value === c ? '2px solid var(--ink)' : '2px solid transparent', cursor: 'pointer' }} />)}
    </div>
  )
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 4600 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 480, maxWidth: '94vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'var(--card,#fff)', borderRadius: 16, zIndex: 4601, boxShadow: '0 24px 60px rgba(0,0,0,0.28)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Manage Tags</h2>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--slate)', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: '8px 20px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)', padding: '10px 0 6px' }}><span>Name</span><span>Actions</span></div>
          {rows.length === 0 && <p style={{ fontSize: 13, color: 'var(--slate)', padding: '8px 0' }}>No tags yet. Add one below.</p>}
          {rows.map((t: any) => {
            const editing = editingKey === rowKey(t)
            return (
            <div key={rowKey(t)} style={{ padding: '10px 0', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              {editing ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input value={editName} onChange={e => setEditName(e.target.value)} style={{ padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none' }} />
                  <Swatches value={editColor} onPick={setEditColor} />
                </div>
              ) : <TagChip name={t.name} color={t.color} />}
              <div style={{ display: 'flex', gap: 14, flexShrink: 0 }}>
                {editing
                  ? <><button type="button" disabled={busy} onClick={() => saveEdit(t)} style={{ background: 'none', border: 'none', color: accent, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Save</button><button type="button" onClick={() => setEditingKey(null)} style={{ background: 'none', border: 'none', color: 'var(--slate)', fontSize: 13, cursor: 'pointer' }}>Cancel</button></>
                  : <><button type="button" onClick={() => startEdit(t)} style={{ background: 'none', border: 'none', color: accent, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Edit</button><button type="button" onClick={() => del(t)} style={{ background: 'none', border: 'none', color: '#dc2626', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Delete</button></>}
              </div>
            </div>
          )})}
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)' }}>Add Tag</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') create() }} placeholder="Tag name…" style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none' }} />
            <button type="button" onClick={create} disabled={busy || !newName.trim()} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: newName.trim() ? accent : 'var(--border)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: newName.trim() ? 'pointer' : 'default' }}>Add</button>
          </div>
          <div style={{ marginTop: 8 }}><Swatches value={newColor} onPick={setNewColor} /></div>
        </div>
      </div>
    </>
  )
}

// ── Right-side order drawer ───────────────────────────────────────────────────
function OrderDrawer({ order, companyId, me, team, locations, accent, allTags, tagDefs, tagColor, onEnsureTag, onManageTags, onClose, onPatch, onFlash, onLabel, onPrintSlip, onPrintLabel, onLabelPdf, teamName, outletName, fullScreen = false }: any) {
  const ACCENT = accent || 'var(--coral)'
  const [items, setItems] = useState<any[]>([])
  const [pickMode, setPickMode] = useState(false)
  const [notes, setNotes] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [noteBody, setNoteBody] = useState('')
  const [taskText, setTaskText] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [addingTag, setAddingTag] = useState(false)
  const [galleryIdx, setGalleryIdx] = useState<number | null>(null)
  const [wooNotes, setWooNotes] = useState<any[] | null>(null)
  const [wooCustomerNote, setWooCustomerNote] = useState<string | null>(null)
  const [wooStoreUrl, setWooStoreUrl] = useState<string | null>(null)
  const [actBusy, setActBusy] = useState('')
  const [editNoteId, setEditNoteId] = useState<string | null>(null)
  const [editNoteText, setEditNoteText] = useState('')
  const [showTracking, setShowTracking] = useState(false)
  const [trkCarrier, setTrkCarrier] = useState('auspost')
  const [trkNumber, setTrkNumber] = useState('')
  const [trkCustomUrl, setTrkCustomUrl] = useState('')
  const [trkSending, setTrkSending] = useState(false)

  // Build a branded tracking short link + message, then deliver it (SMS/email).
  const submitTracking = async () => {
    const carrier = carrierByKey(trkCarrier)!
    const isManual = trkCarrier === 'manual'
    if (!trkNumber.trim()) { onFlash('Enter the tracking number'); return }
    if (isManual && !trkCustomUrl.trim()) { onFlash('Enter the tracking URL'); return }
    setTrkSending(true)
    try {
      const targetUrl = isManual ? trkCustomUrl.trim() : carrier.url(trkNumber.trim())
      let shortUrl = ''
      if (targetUrl) {
        try {
          const r = await fetch('/api/short-links/create', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyId, kind: 'redirect', url: targetUrl, label: `${carrier.label} tracking — order ${order.order_number}`, conversationId: order.conversation_id || undefined, sentBy: me.name }),
          })
          const d = await r.json(); if (r.ok && d.url) shortUrl = d.url
        } catch {}
      }
      const lines = [`Your order ${order.order_number} has been dispatched.`, '', `${carrier.label} tracking: ${trkNumber.trim()}`]
      if (shortUrl) lines.push('', shortUrl)
      await sendTracking({ text: lines.join('\n'), url: shortUrl, carrierLabel: carrier.label, number: trkNumber.trim() })
      setTrkNumber(''); setTrkCustomUrl(''); setShowTracking(false)
    } catch (e: any) { onFlash(`Tracking error: ${e?.message || e}`) }
    setTrkSending(false)
  }

  // ── WooCommerce order actions ─────────────────────────────────────────────
  const markCompleted = async () => {
    if (!window.confirm(`Mark order ${order.order_number} as completed in WooCommerce?`)) return
    setActBusy('done')
    try {
      const res = await fetch('/api/orders/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, orderId: order.external_order_id, status: 'completed', conversationId: order.conversation_id || undefined }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) onFlash(`Failed: ${j.error || res.status}`)
      else { onPatch({ status: 'shipped', fulfilment_status: 'fulfilled' }, { type: 'status_changed', detail: 'Marked completed in WooCommerce' }); order.status = 'shipped'; onFlash('Order marked completed') }
    } catch (e: any) { onFlash(`Error: ${e?.message || e}`) }
    setActBusy('')
  }
  // ── Click & Collect actions ───────────────────────────────────────────────
  const notifyPickup = async () => {
    setActBusy('notify')
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      const where = outletName ? ` at ${outletName}` : ''
      const text = [
        `Hi ${order.customer_name || 'there'},`, '',
        `Your order ${order.order_number} is ready for collection${where}.`,
        'Please bring your order number or ID when you come to pick it up. Thank you!',
      ].join('\n')
      const res = await fetch('/api/orders/send-tracking', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ companyId, orderId: order.id, text, senderName: me.name }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) onFlash(`Notify failed: ${j.error || res.status}`)
      else { onFlash(j.channel === 'email' ? 'Pickup notice emailed' : 'Pickup notice sent'); logEvent('pickup_notified', 'Customer notified — order ready for collection') }
    } catch (e: any) { onFlash(`Notify error: ${e?.message || e}`) }
    setActBusy('')
  }
  const markCollected = async () => {
    if (!window.confirm(`Mark order ${order.order_number} as collected by the customer?`)) return
    onPatch({ status: 'shipped', fulfilment_status: 'fulfilled' }, { type: 'collected', detail: 'Collected by customer' }); order.status = 'shipped'
    logEvent('collected', 'Order collected by customer')
    onFlash('Marked collected')
  }
  const issueRefund = async () => {
    const amtStr = window.prompt(`Refund amount for order ${order.order_number} (${order.currency || 'AUD'}). Leave blank for a full refund.`, String(order.total || ''))
    if (amtStr === null) return
    const amount = amtStr.trim() ? Number(amtStr) : undefined
    if (amtStr.trim() && (isNaN(amount!) || amount! <= 0)) { onFlash('Enter a valid amount'); return }
    if (!window.confirm(`Refund ${amount ? `$${amount.toFixed(2)}` : 'the full amount'} for order ${order.order_number}? This returns money through the payment gateway and cannot be undone.`)) return
    setActBusy('refund')
    try {
      const res = await fetch('/api/orders/refund', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, orderId: order.external_order_id, amount, reason: 'Refund from Orders board', conversationId: order.conversation_id || undefined }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) onFlash(`Refund failed: ${j.error || res.status}`)
      else { onFlash(`Refunded${j.amount ? ` $${Number(j.amount).toFixed(2)}` : ''}`); onPatch({ payment_status: 'refunded' }, { type: 'refunded', detail: `Refund issued${j.amount ? ` · $${Number(j.amount).toFixed(2)}` : ''}` }) }
    } catch (e: any) { onFlash(`Refund error: ${e?.message || e}`) }
    setActBusy('')
  }
  const genInvoice = async () => {
    setActBusy('invoice')
    try {
      const res = await fetch(`/api/orders/details?companyId=${companyId}&orderId=${order.external_order_id}`)
      const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Could not load order')
      const o = data.order || {}, co = data.company || {}
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const W = 210, L = 16, R = 194
      const money = (v: any) => `$${(Number(v) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      const hexToRgb = (hex: string): [number, number, number] => {
        const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
        if (!m) return [15, 23, 42]
        const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      }
      const accent = hexToRgb(co.accent_color || '#0f172a')
      const ink: [number, number, number] = [15, 23, 42]
      const slate: [number, number, number] = [100, 116, 139]
      const line: [number, number, number] = [226, 232, 240]
      // Try to embed the company logo (best-effort; CORS-tainted images fall back).
      const loadLogo = (url: string) => new Promise<{ data: string; w: number; h: number } | null>(resolve => {
        if (!url) return resolve(null)
        let done = false
        const finish = (v: any) => { if (!done) { done = true; resolve(v) } }
        // Never let a slow/hung image download stall the whole invoice.
        setTimeout(() => finish(null), 4000)
        const img = new Image(); img.crossOrigin = 'anonymous'
        img.onload = () => {
          try {
            const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight
            const ctx = cv.getContext('2d'); if (!ctx) return finish(null)
            ctx.drawImage(img, 0, 0)
            finish({ data: cv.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight })
          } catch { finish(null) }
        }
        img.onerror = () => finish(null)
        img.src = url
      })
      const logo = await loadLogo(co.logo_url)

      // ── Header ──────────────────────────────────────────────────────────────
      let leftX = L
      if (logo) {
        const h = 16, w = Math.min(42, (logo.w / logo.h) * h)
        try { doc.addImage(logo.data, 'PNG', L, 15, w, h) } catch {}
        leftX = L + w + 5
      } else {
        doc.setFillColor(...accent); doc.roundedRect(L, 15, 16, 16, 2.5, 2.5, 'F')
        doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15)
        doc.text(String(co.name || 'C')[0].toUpperCase(), L + 8, 26, { align: 'center' })
        leftX = L + 21
      }
      doc.setTextColor(...ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(15)
      doc.text(String(co.name || 'Invoice'), leftX, 21)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...slate)
      const coLines = [
        co.business_address || '',
        [co.business_phone && `☎ ${co.business_phone}`, co.business_email && `✉ ${co.business_email}`].filter(Boolean).join('   '),
        co.website || co.business_website || '',
        co.abn_acn ? `ABN ${co.abn_acn}` : '',
      ].filter(Boolean)
      coLines.forEach((l: string, i: number) => doc.text(String(l), leftX, 26 + i * 4))

      doc.setTextColor(...ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(20)
      doc.text('TAX INVOICE', R, 22, { align: 'right' })
      doc.setFontSize(9.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...slate)
      doc.text(`Order #${o.number || order.order_number}`, R, 28, { align: 'right' })
      doc.text(`Date: ${o.date ? new Date(o.date).toLocaleDateString('en-AU') : new Date().toLocaleDateString('en-AU')}`, R, 32.5, { align: 'right' })
      if (o.payment_method) doc.text(String(o.payment_method), R, 37, { align: 'right' })

      // Accent divider
      doc.setDrawColor(...accent); doc.setLineWidth(0.8); doc.line(L, 43, R, 43)

      // ── Bill To / Ship To ───────────────────────────────────────────────────
      const b = o.billing || {}, s = o.shipping || {}
      const nameOf = (a: any) => `${a.first_name || ''} ${a.last_name || ''}`.trim() || String(order.customer_name || '')
      const addrBlock = (a: any) => [nameOf(a), [a.address_1, a.address_2].filter(Boolean).join(', '), [a.city, (a.state || '').toUpperCase(), a.postcode].filter(Boolean).join(' '), a.country, a.email, a.phone].filter(Boolean)
      let y = 52
      doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...slate)
      doc.text('BILL TO', L, y)
      const hasShip = s && (s.address_1 || s.city)
      if (hasShip) doc.text('SHIP TO', 110, y)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...ink); doc.setFontSize(10)
      addrBlock(b).forEach((l, i) => doc.text(String(l), L, y + 6 + i * 4.6))
      if (hasShip) addrBlock(s).forEach((l, i) => doc.text(String(l), 110, y + 6 + i * 4.6))
      y += 6 + Math.max(addrBlock(b).length, hasShip ? addrBlock(s).length : 0) * 4.6 + 8

      // ── Items table ─────────────────────────────────────────────────────────
      const cols = { item: L, sku: 108, unit: 150, qty: 168, total: R }
      doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...slate)
      doc.text('ITEM', cols.item, y); doc.text('SKU', cols.sku, y)
      doc.text('UNIT', cols.unit, y, { align: 'right' }); doc.text('QTY', cols.qty, y, { align: 'right' }); doc.text('TOTAL', cols.total, y, { align: 'right' })
      y += 2; doc.setDrawColor(...ink); doc.setLineWidth(0.5); doc.line(L, y, R, y); y += 6
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...ink); doc.setFontSize(9.5)
      for (const li of (o.line_items || [])) {
        const qty = Number(li.quantity) || 1
        const lineTotal = Number(li.total) || 0
        const unit = lineTotal / qty
        const nameLines = doc.splitTextToSize(String(li.name || 'Item'), cols.sku - cols.item - 4)
        const rowH = Math.max(1, nameLines.length) * 4.6 + 4
        // Draw every cell top-aligned (baseline:'top' → y is the TOP of the glyphs)
        // so the row separator below can never cut through a wrapped item name.
        doc.setTextColor(...ink); doc.setFontSize(9.5); doc.setFont('helvetica', 'normal')
        doc.text(nameLines, cols.item, y + 1, { baseline: 'top' })
        doc.setTextColor(...slate); doc.setFontSize(8.5)
        doc.text(String(li.sku || '—'), cols.sku, y + 1, { baseline: 'top' })
        doc.setTextColor(...ink); doc.setFontSize(9.5)
        doc.text(money(unit), cols.unit, y + 1, { align: 'right', baseline: 'top' })
        doc.text(String(qty), cols.qty, y + 1, { align: 'right', baseline: 'top' })
        doc.setFont('helvetica', 'bold'); doc.text(money(lineTotal), cols.total, y + 1, { align: 'right', baseline: 'top' }); doc.setFont('helvetica', 'normal')
        y += rowH
        doc.setDrawColor(...line); doc.setLineWidth(0.2); doc.line(L, y, R, y)
        if (y > 250) { doc.addPage(); y = 20 }
      }
      y += 2

      // ── Totals ──────────────────────────────────────────────────────────────
      const subtotal = (o.line_items || []).reduce((n: number, li: any) => n + (Number(li.total) || 0), 0)
      const tax = Number(o.total_tax) || 0
      const shipping = Number(o.shipping_total) || 0
      const discount = Number(o.discount_total) || 0
      y += 4
      const tX = 140, tV = R
      const totRow = (label: string, val: string, strong = false) => {
        doc.setFont('helvetica', strong ? 'bold' : 'normal'); doc.setFontSize(strong ? 11 : 9.5)
        doc.setTextColor(...(strong ? ink : slate)); doc.text(label, tX, y)
        doc.setTextColor(...ink); doc.text(val, tV, y, { align: 'right' }); y += strong ? 7 : 5.5
      }
      totRow('Subtotal', money(subtotal))
      if (discount > 0) totRow('Discount', `-${money(discount)}`)
      totRow('Tax (GST)', money(tax))
      totRow('Shipping', shipping > 0 ? money(shipping) : 'Free')
      doc.setDrawColor(...accent); doc.setLineWidth(0.6); doc.line(tX, y - 1, tV, y - 1); y += 4
      totRow('Grand Total', `${money(o.total)} ${o.currency || order.currency || 'AUD'}`, true)

      // ── Footer ──────────────────────────────────────────────────────────────
      const footY = 285
      doc.setDrawColor(...line); doc.setLineWidth(0.3); doc.line(L, footY - 6, R, footY - 6)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...slate)
      doc.text(String(co.invoice_footer || 'Thank you for your business.'), L, footY, { maxWidth: R - L })

      doc.save(`invoice-${o.number || order.order_number}.pdf`)
    } catch (e: any) { onFlash(`Invoice failed: ${e?.message || e}`) }
    setActBusy('')
  }
  const copyOrderLink = () => copyToClipboard(`${window.location.origin}/admin/orders/${order.id}`, onFlash)
  const editInWoo = () => { if (wooStoreUrl && order.external_order_id) window.open(`${wooStoreUrl.replace(/\/$/, '')}/wp-admin/post.php?post=${order.external_order_id}&action=edit`, '_blank'); else onFlash('WooCommerce store link unavailable') }

  const sendTracking = async (info: { text: string; url: string; carrierLabel: string; number: string }) => {
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      const res = await fetch('/api/orders/send-tracking', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ companyId, orderId: order.id, text: info.text, trackingNumber: info.number, trackingUrl: info.url, senderName: me.name }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) { onFlash(`Tracking failed: ${j.error || res.status}`); return }
      onPatch({ tracking_number: info.number }); order.tracking_number = info.number
      logEvent('tracking_sent', `Tracking sent to customer · ${info.carrierLabel} ${info.number}`)
      onFlash(j.channel === 'email' ? 'Tracking emailed to customer' : 'Tracking sent to customer')
    } catch (e: any) { onFlash(`Tracking error: ${e?.message || e}`) }
  }

  const load = useCallback(async () => {
    const [it, nt, ev, tk] = await Promise.all([
      (supabase as any).from('order_items').select('*').eq('order_id', order.id),
      (supabase as any).from('order_notes').select('*').eq('order_id', order.id).order('created_at', { ascending: false }),
      (supabase as any).from('order_events').select('*').eq('order_id', order.id).order('created_at', { ascending: false }),
      (supabase as any).from('conversation_tasks').select('*').eq('company_id', companyId).eq('order_id', order.id).order('created_at', { ascending: false }),
    ])
    setItems(it.data || []); setNotes(nt.data || []); setEvents(ev.data || []); setTasks(tk.data || [])
  }, [order.id, companyId])
  useEffect(() => { load() }, [load])

  // WooCommerce order-note history (system + staff + customer notes), fetched
  // live from the store for WooCommerce orders.
  useEffect(() => {
    let cancelled = false
    if (order.sales_channel !== 'woocommerce' || !order.external_order_id) { setWooNotes([]); return }
    setWooNotes(null)
    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const token = data?.session?.access_token
        const res = await fetch(`/api/orders/woo-notes?companyId=${encodeURIComponent(companyId)}&wooOrderId=${encodeURIComponent(order.external_order_id)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        const j = await res.json().catch(() => ({}))
        if (!cancelled) { setWooNotes(Array.isArray(j.notes) ? j.notes : []); setWooCustomerNote(j.customerNote || null); setWooStoreUrl(j.storeUrl || null) }
      } catch { if (!cancelled) setWooNotes([]) }
    })()
    return () => { cancelled = true }
  }, [order.id, order.external_order_id, order.sales_channel, companyId])

  const logEvent = async (type: string, detail: string) => {
    const row = { order_id: order.id, company_id: companyId, type, detail, actor_id: me.id, actor_name: me.name }
    try { const { data } = await (supabase as any).from('order_events').insert(row).select().maybeSingle(); if (data) setEvents(e => [data, ...e]) } catch {}
  }
  const addNote = async () => {
    const body = noteBody.trim(); if (!body) return
    const mentions = Array.from(body.matchAll(/@(\w[\w.-]*)/g)).map(m => m[1])
    const row = { order_id: order.id, company_id: companyId, author_id: me.id, author_name: me.name, body, mentions }
    try { const { data } = await (supabase as any).from('order_notes').insert(row).select().maybeSingle(); if (data) { setNotes(n => [data, ...n]); logEvent('note_added', 'Internal note added') } } catch {}
    // One-way link: mirror the note into the inbox chat so it also shows in the
    // conversation's Notes section. Prefer the order's / contact's existing chat;
    // create one only if the customer has none yet.
    try {
      let convId: string | null = order.conversation_id || null
      if (!convId && order.contact_id) {
        const { data: c } = await (supabase as any).from('conversations').select('id').eq('company_id', companyId).eq('contact_id', order.contact_id).order('last_message_at', { ascending: false }).limit(1).maybeSingle()
        if (c?.id) convId = c.id
      }
      if (!convId) {
        const { data: nc } = await (supabase as any).from('conversations').insert({ company_id: companyId, contact_id: order.contact_id || null, status: 'open', channel: order.customer_phone ? 'sms' : 'email', sms_number: order.customer_phone || null, subject: `Order ${order.order_number}`, last_message: 'Order note', last_message_at: new Date().toISOString() }).select('id').maybeSingle()
        convId = nc?.id || null
      }
      if (convId && convId !== order.conversation_id) { order.conversation_id = convId; onPatch({ conversation_id: convId }) }
      if (convId) await (supabase as any).from('conversation_notes').insert({ conversation_id: convId, company_id: companyId, author_name: me.name, content: `[Order ${order.order_number}] ${body}` })
    } catch {}
    setNoteBody('')
  }
  const saveNoteEdit = async (n: any) => {
    const t = editNoteText.trim(); if (!t) { setEditNoteId(null); return }
    setNotes(ns => ns.map(x => x.id === n.id ? { ...x, body: t } : x))
    try { await (supabase as any).from('order_notes').update({ body: t }).eq('id', n.id) } catch {}
    setEditNoteId(null)
  }
  const deleteNote = async (n: any) => {
    if (!window.confirm('Delete this note?')) return
    setNotes(ns => ns.filter(x => x.id !== n.id))
    try { await (supabase as any).from('order_notes').delete().eq('id', n.id) } catch {}
  }
  const addTask = async () => {
    const text = taskText.trim(); if (!text) return
    const row = { company_id: companyId, text, title: text, done: false, status: 'todo', priority: 'normal', created_by: me.name, created_by_id: me.id, assignees: [], order_id: order.id, order_number: order.order_number, order_customer: order.customer_name, order_total: Number(order.total) || null }
    try {
      let { data, error } = await (supabase as any).from('conversation_tasks').insert(row).select().maybeSingle()
      if (error) { const r = await (supabase as any).from('conversation_tasks').insert({ company_id: companyId, text, done: false, order_id: order.id }).select().maybeSingle(); data = r.data }
      if (data) setTasks(t => [data, ...t])
    } catch {}
    setTaskText('')
  }
  const toggleTask = async (t: any) => {
    const done = !(t.done || t.status === 'done')
    setTasks(ts => ts.map(x => x.id === t.id ? { ...x, done, status: done ? 'done' : 'todo' } : x))
    try { await (supabase as any).from('conversation_tasks').update({ done, status: done ? 'done' : 'todo', completed_at: done ? new Date().toISOString() : null }).eq('id', t.id) } catch {}
  }
  const addTag = async (t: string) => {
    const tag = t.trim(); if (!tag) return
    const next = Array.from(new Set([...(order.tags || []), tag]))
    onPatch({ tags: next }); order.tags = next; setTagInput(''); setAddingTag(false)
    onEnsureTag?.(tag) // register in the palette so it gets a colour + appears in Manage Tags
  }
  const removeTag = (t: string) => { const next = (order.tags || []).filter((x: string) => x !== t); onPatch({ tags: next }); order.tags = next }

  const sm = statusMeta(order.status)
  const age = orderAge(order.order_date)
  const addr = order.shipping_address || {}
  const store = locations.find((l: any) => l.id === order.store_location_id)?.name
  const convHref = order.conversation_id ? `/admin/inbox?conversation=${order.conversation_id}` : null
  const contactHref = order.contact_id ? `/admin/customers/profile?id=${order.contact_id}` : null

  const sect: React.CSSProperties = { padding: '16px 18px', borderBottom: '1px solid var(--border)' }
  const kick: React.CSSProperties = { margin: 0, fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)' }
  const quick = (icon: React.ReactNode, label: string, onClick: () => void, primary = false) => (
    <button type="button" onClick={onClick} title={label}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '9px 6px', borderRadius: 11, border: `1px solid ${primary ? ACCENT : 'var(--border)'}`, background: primary ? ACCENT : 'var(--card, #fff)', color: primary ? '#fff' : 'var(--ink)', cursor: 'pointer', flex: '0 0 auto', width: 72 }}>
      {icon}<span style={{ fontSize: 10.5, fontWeight: 700 }}>{label}</span>
    </button>
  )
  const I = { width: 17, height: 17, fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }

  // Reprint or void the order's existing label. Reprint opens the carrier PDF
  // (or the printable-label route as a fallback); void cancels at the carrier
  // and returns the order to Awaiting Shipment so it can be re-labelled.
  const labelAction = async (action: 'reprint' | 'void') => {
    if (action === 'void' && !confirm('Void this shipping label? The order goes back to Awaiting Shipment.')) return
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      const res = await fetch('/api/orders/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ companyId, orderId: order.id, action }),
      })
      const j = await res.json().catch(() => ({}))
      if (action === 'reprint') {
        if (j.labelUrl && onLabelPdf) onLabelPdf(j.labelUrl)
        else if (j.labelUrl) { try { window.open(j.labelUrl, '_blank') } catch {} }
        else if (onPrintLabel) onPrintLabel(order.id)   // printable-label fallback
        else onFlash(`Reprint failed: ${j.error || res.status}`)
        return
      }
      // void
      if (!res.ok || j.error) { onFlash(`Void failed: ${j.error || res.status}`); return }
      onPatch(j.patch || {}, { type: 'label_voided', detail: 'Label voided' })
      Object.assign(order, j.patch || {})
      onFlash(j.voided ? 'Label voided' : `Voided here — carrier could not confirm (${j.message || 'unknown'})`)
    } catch (e: any) { onFlash(`Error: ${e?.message || e}`) }
  }

  // Full-screen mode slides up over the whole viewport (same tab); side mode is
  // the 420px right drawer.
  const panelStyle: React.CSSProperties = fullScreen
    ? { position: 'fixed', inset: 0, background: 'var(--canvas, #f6f7f9)', zIndex: 4001, display: 'flex', flexDirection: 'column', animation: 'ordSlideUp .28s cubic-bezier(.16,.84,.44,1)' }
    : { position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, maxWidth: '94vw', background: 'var(--card, #fff)', zIndex: 4001, boxShadow: '-12px 0 40px rgba(0,0,0,0.16)', display: 'flex', flexDirection: 'column' }
  return (
    <>
      <style>{`@keyframes ordSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      {!fullScreen && <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.28)', zIndex: 4000 }} />}
      <div style={panelStyle}>
        {/* Header */}
        <div style={{ ...sect, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, maxWidth: fullScreen ? 980 : undefined, width: '100%', margin: fullScreen ? '0 auto' : undefined, boxSizing: 'border-box' }}>
          <div>
            <h2 onClick={() => copyToClipboard(String(order.order_number), onFlash)} title="Click to copy order number" style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--ink)', cursor: 'copy', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              Order {order.order_number}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            </h2>
            <p style={{ margin: '5px 0 0', fontSize: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: sm.bg, color: sm.fg }}>{sm.label}</span>
              <span style={{ color: age.color, fontWeight: 700 }}>{age.label} old</span>
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--slate)', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', ...(fullScreen ? { maxWidth: 980, width: '100%', margin: '0 auto', background: 'var(--card,#fff)' } : {}) }}>
          {/* Quick actions — horizontally scrollable so every action stays reachable
              in the narrow side drawer instead of the last one being clipped. */}
          <div style={{ ...sect, display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'thin' }}>
            {quick(<svg {...I}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18" /></svg>, 'Label', () => onLabel(order), true)}
            {order.tracking_number && quick(<svg {...I}><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>, 'Reprint', () => labelAction('reprint'))}
            {order.tracking_number && quick(<svg {...I}><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>, 'Void', () => labelAction('void'))}
            {quick(<svg {...I}><path d="M6 9V2h12v7" /><rect x="6" y="14" width="12" height="8" /><path d="M6 18H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2" /></svg>, 'Slip', () => onPrintSlip(order.id))}
            {quick(<svg {...I}><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" /><path d="m9 14 2 2 4-4" /></svg>, 'Pick', () => { setPickMode(v => { const n = !v; if (n) { const el = document.getElementById('ord-items-panel'); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); onFlash('Picking — tap each item as you pick it') } return n }) }, pickMode)}
            {quick(<svg {...I}><path d="M20 6 9 17l-5-5" /></svg>, order.status === 'packed' ? 'Packed' : 'Pack', () => {
              const wasPacked = order.status === 'packed'
              const next = wasPacked ? 'awaiting_shipment' : 'packed'
              onPatch({ status: next }, { type: wasPacked ? 'unpacked' : 'packed', detail: wasPacked ? 'Marked unpacked' : 'Marked packed' }); order.status = next
              logEvent(wasPacked ? 'unpacked' : 'packed', wasPacked ? 'Marked unpacked' : 'Marked packed')
              onFlash(wasPacked ? 'Order unpacked' : 'Order marked packed')
            }, order.status === 'packed')}
            {quick(<svg {...I}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>, 'Note', () => { (document.getElementById('ord-note') as HTMLTextAreaElement)?.focus() })}
            {quick(<svg {...I}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>, 'Contact', () => { if (convHref) location.href = convHref; else onFlash('No linked conversation yet.') })}
            {isClickCollect(order) && quick(<svg {...I}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>, actBusy === 'notify' ? '…' : 'Notify', notifyPickup)}
            {isClickCollect(order) && quick(<svg {...I}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18" /><path d="m9 12 2 2 4-4" /></svg>, 'Collected', markCollected, order.status === 'shipped')}
          </div>

          {/* Customer */}
          <div style={sect}>
            <p style={kick}>Customer</p>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {contactHref ? <a href={contactHref} style={{ fontSize: 15, fontWeight: 700, color: ACCENT, textDecoration: 'none' }}>{order.customer_name}</a> : <span style={{ fontSize: 15, fontWeight: 700 }}>{order.customer_name}</span>}
              {order.customer_name && <CopyBtn onClick={() => copyToClipboard(order.customer_name, onFlash)} title="Copy name" />}
              {(order.tags || []).includes('VIP') && <span style={{ fontSize: 10, fontWeight: 800, color: '#15803d', background: '#dcfce7', padding: '1px 7px', borderRadius: 20 }}>VIP</span>}
            </div>
            {order.customer_email && <p onClick={() => copyToClipboard(order.customer_email, onFlash)} title="Click to copy email" style={{ margin: '5px 0 0', fontSize: 12.5, color: 'var(--slate)', cursor: 'copy', display: 'inline-flex', alignItems: 'center', gap: 5 }}>{order.customer_email}<CopyBtn onClick={() => copyToClipboard(order.customer_email, onFlash)} title="Copy email" /></p>}
            {order.customer_phone && <p onClick={() => copyToClipboard(order.customer_phone, onFlash)} title="Click to copy phone" style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--slate)', cursor: 'copy', display: 'inline-flex', alignItems: 'center', gap: 5 }}>{order.customer_phone}<CopyBtn onClick={() => copyToClipboard(order.customer_phone, onFlash)} title="Copy phone" /></p>}
            {convHref && <a href={convHref} style={{ display: 'inline-block', marginTop: 8, fontSize: 12.5, fontWeight: 700, color: ACCENT, textDecoration: 'none' }}>Open conversation →</a>}
          </div>

          {/* Shipping address */}
          {(addr.address_1 || addr.city) && (
            <div style={sect}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={kick}>Shipping Address</p>
                <CopyBtn title="Copy address" onClick={() => copyToClipboard([order.customer_name, [addr.address_1, addr.address_2].filter(Boolean).join(', '), [addr.city, (addr.state || '').toUpperCase(), addr.postcode].filter(Boolean).join(' '), addr.country].filter(Boolean).join('\n'), onFlash)} />
              </div>
              <p onClick={() => copyToClipboard([order.customer_name, [addr.address_1, addr.address_2].filter(Boolean).join(', '), [addr.city, (addr.state || '').toUpperCase(), addr.postcode].filter(Boolean).join(' '), addr.country].filter(Boolean).join('\n'), onFlash)} title="Click to copy address" style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--ink)', lineHeight: 1.6, cursor: 'copy' }}>
                {order.customer_name}<br />
                {[addr.address_1, addr.address_2].filter(Boolean).join(', ')}<br />
                {[addr.city, (addr.state || '').toUpperCase(), addr.postcode].filter(Boolean).join(' ')}<br />
                {addr.country}
              </p>
            </div>
          )}

          {/* Order summary */}
          <div style={sect}>
            <p style={kick}>Order Summary</p>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {([
                ['Outlet', store || 'No outlet'],
                ['Order Date', order.order_date ? new Date(order.order_date).toLocaleString('en-AU') : '—'],
                ['Sales Channel', <span key="ch" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ChannelIcon channel={order.sales_channel} size={14} />{channelMeta(order.sales_channel).label}</span>],
                ['Payment', order.payment_status || '—'],
                ['Fulfilment', order.fulfilment_status || '—'],
                ['Subtotal', order.subtotal != null ? fmtMoney(order.subtotal, order.currency) : '—'],
                ['Shipping', isClickCollect(order)
                  ? <span key="cc" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#2563eb', fontWeight: 700 }}><ClickCollectIcon size={13} />{order.shipping_method || 'Click & Collect'}</span>
                  : (Number(order.shipping_total) || 0) > 0 ? `${fmtMoney(order.shipping_total, order.currency)}${order.shipping_method ? ` · ${order.shipping_method}` : ''}` : (order.shipping_method || 'Free')],
                ['Total', `${fmtMoney(order.total, order.currency)} ${order.currency || ''}`],
              ] as [string, any][]).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
                  <span style={{ color: 'var(--slate)' }}>{k}</span>
                  <span style={{ fontWeight: k === 'Total' ? 800 : 600, color: 'var(--ink)', textAlign: 'right', textTransform: k === 'Payment' || k === 'Fulfilment' ? 'capitalize' : 'none' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Order barcode — scannable Code128 of the order number, under the order details */}
          {order.order_number && (
            <div style={{ ...sect, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div title={`Order ${order.order_number}`} style={{ width: '100%', maxWidth: 320, display: 'flex', justifyContent: 'center' }}
                dangerouslySetInnerHTML={{ __html: barcodeSVG(String(order.order_number), { moduleWidth: 2, height: 54 }) }} />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--ink)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{order.order_number}</span>
            </div>
          )}

          {/* Items */}
          <div style={sect} id="ord-items-panel">
            <OrderItemsPanel order={order} companyId={companyId} items={items} accent={ACCENT}
              pickMode={pickMode} onExitPick={() => setPickMode(false)}
              onLog={logEvent} onFlash={onFlash} onOpenItem={(idx: number) => setGalleryIdx(idx)} />
          </div>

          {/* Tags */}
          <div style={sect}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={kick}>Tags</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
                <button type="button" onClick={() => onManageTags?.()} style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate)', background: 'none', border: 'none', cursor: 'pointer' }}>Manage</button>
                <button type="button" onClick={() => setAddingTag(v => !v)} style={{ fontSize: 12, fontWeight: 700, color: ACCENT, background: 'none', border: 'none', cursor: 'pointer' }}>{addingTag ? 'Cancel' : '+ Add'}</button>
                {addingTag && (
                  <TagMenu tags={Array.from(new Set([...(tagDefs || []).map((t: any) => t.name), ...(allTags || [])])).filter((t: string) => !(order.tags || []).includes(t))} accent={ACCENT} align="right"
                    onClose={() => setAddingTag(false)} onPick={t => addTag(t)} />
                )}
              </div>
            </div>
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(order.tags || []).map((t: string) => (
                <TagChip key={t} name={t} color={tagColor?.(t)} onRemove={() => removeTag(t)} />
              ))}
              {(order.tags || []).length === 0 && !addingTag && <span style={{ fontSize: 12, color: 'var(--slate)' }}>No tags</span>}
            </div>
          </div>

          {/* Assign Outlet */}
          {locations && locations.length > 0 && (
            <div style={sect}>
              <p style={kick}>Assign Outlet</p>
              <select value={order.store_location_id || ''} onChange={e => { const v = e.target.value || null; onPatch({ store_location_id: v }, { type: 'outlet', detail: v ? `Assigned to ${outletName?.(v) || 'outlet'}` : 'Outlet cleared' }); order.store_location_id = v }}
                style={{ width: '100%', marginTop: 8, padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer', outline: 'none' }}>
                <option value="">No outlet</option>
                {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}

          {/* Send tracking — expands an inline box below (no popup) */}
          <div style={sect}>
            <button type="button" onClick={() => setShowTracking(v => !v)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 12px', borderRadius: 11, border: `1px solid ${ACCENT}`, background: showTracking ? `color-mix(in srgb, ${ACCENT} 8%, transparent)` : 'var(--card,#fff)', color: ACCENT, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1" /><path d="M16 8h4l3 3v5h-7V8z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>
              Send tracking
            </button>
            {showTracking && (
              <div style={{ marginTop: 10, padding: 12, borderRadius: 11, border: '1px solid var(--border)', background: 'var(--canvas)' }}>
                <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: 'var(--slate)' }}>Carrier</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {TRACK_CARRIERS.map((c: any) => {
                    const on = trkCarrier === c.key
                    return <button key={c.key} type="button" onClick={() => setTrkCarrier(c.key)}
                      style={{ padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1px solid ${on ? ACCENT : 'var(--border)'}`, background: on ? `color-mix(in srgb, ${ACCENT} 12%, transparent)` : 'var(--card,#fff)', color: on ? ACCENT : 'var(--slate)' }}>{c.label}</button>
                  })}
                </div>
                <p style={{ margin: '10px 0 6px', fontSize: 11, fontWeight: 700, color: 'var(--slate)' }}>Tracking number</p>
                <input value={trkNumber} onChange={e => setTrkNumber(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submitTracking() }} placeholder="e.g. 33ABC123456789" style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                {trkCarrier === 'manual' && (
                  <input value={trkCustomUrl} onChange={e => setTrkCustomUrl(e.target.value)} placeholder="Tracking URL (https://…)" style={{ width: '100%', marginTop: 6, padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                )}
                {carrierByKey(trkCarrier)?.note && <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--slate)', lineHeight: 1.4 }}>{carrierByKey(trkCarrier)!.note}</p>}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button type="button" onClick={() => setShowTracking(false)} style={{ flex: 1, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--slate)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                  <button type="button" onClick={submitTracking} disabled={trkSending || !trkNumber.trim()} style={{ flex: 2, padding: '9px 12px', borderRadius: 9, border: 'none', background: (trkSending || !trkNumber.trim()) ? 'var(--border)' : ACCENT, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: (trkSending || !trkNumber.trim()) ? 'default' : 'pointer' }}>{trkSending ? 'Sending…' : 'Send tracking'}</button>
                </div>
              </div>
            )}
          </div>

          {/* Order actions */}
          <div style={sect}>
            <p style={kick}>Order Actions</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {(() => { const b = (color: string): React.CSSProperties => ({ fontSize: 12, fontWeight: 700, color, background: 'var(--card,#fff)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 12px', cursor: 'pointer' })
                const isWoo = order.sales_channel === 'woocommerce'
                return <>
                  {isWoo && wooStoreUrl && <button type="button" onClick={editInWoo} style={b(ACCENT)}>Edit</button>}
                  {isWoo && !['shipped', 'cancelled'].includes(order.status) && <button type="button" disabled={actBusy === 'done'} onClick={markCompleted} style={b('#15803d')}>{actBusy === 'done' ? '…' : 'Mark completed'}</button>}
                  {isWoo && <button type="button" disabled={actBusy === 'refund'} onClick={issueRefund} style={b('#b45309')}>{actBusy === 'refund' ? '…' : 'Issue refund'}</button>}
                  <button type="button" disabled={actBusy === 'invoice'} onClick={genInvoice} style={b('var(--ink)')}>{actBusy === 'invoice' ? '…' : 'Invoice'}</button>
                  <button type="button" onClick={copyOrderLink} style={b('var(--slate)')}>Copy link</button>
                </>
              })()}
            </div>
          </div>

          {/* Tasks */}
          <div style={sect}>
            <p style={kick}>Tasks</p>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input value={taskText} onChange={e => setTaskText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTask() }} placeholder="Add a task (e.g. Pack aquarium)…" style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, outline: 'none' }} />
              <button type="button" onClick={addTask} disabled={!taskText.trim()} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: taskText.trim() ? ACCENT : 'var(--border)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: taskText.trim() ? 'pointer' : 'default' }}>Add</button>
            </div>
            {tasks.length > 0 && <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {tasks.map((t: any) => { const done = t.done || t.status === 'done'; return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <button type="button" onClick={() => toggleTask(t)} style={{ marginTop: 1, width: 15, height: 15, flexShrink: 0, borderRadius: 4, border: `1.5px solid ${done ? ACCENT : 'var(--slate)'}`, background: done ? ACCENT : 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>{done && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}</button>
                  <span style={{ fontSize: 12.5, color: done ? 'var(--slate)' : 'var(--ink)', textDecoration: done ? 'line-through' : 'none' }}>{t.title || t.text}</span>
                </div>
              ) })}
            </div>}
          </div>

          {/* WooCommerce customer notes — the checkout note + notes-to-customer
              (the private system/stock/payment logs are hidden). */}
          {order.sales_channel === 'woocommerce' && (() => {
            const customerWoo = (wooNotes || []).filter((n: any) => n.customer_note)
            const checkoutNote = (order.customer_note || wooCustomerNote || '').trim()
            const hasCheckout = !!checkoutNote
            return (
              <div style={sect}>
                <p style={kick}>Customer Notes</p>
                {wooNotes === null && !hasCheckout && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>Loading notes…</p>}
                {wooNotes !== null && customerWoo.length === 0 && !hasCheckout && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>No customer notes.</p>}
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {hasCheckout && (
                    <div className="ord-note" style={{ position: 'relative', padding: '8px 11px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a' }}>
                      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5, paddingRight: 24 }}>{checkoutNote}</p>
                      <p style={{ margin: '4px 0 0', fontSize: 10.5, color: 'var(--slate)' }}>Customer note at checkout</p>
                      <div className="ord-note-actions" style={{ position: 'absolute', top: 6, right: 8 }}><CopyBtn title="Copy note" onClick={() => copyToClipboard(checkoutNote, onFlash)} /></div>
                    </div>
                  )}
                  {customerWoo.map((n: any) => (
                    <div key={n.id} className="ord-note" style={{ position: 'relative', padding: '8px 11px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5, paddingRight: 24 }} dangerouslySetInnerHTML={{ __html: String(n.note || '').replace(/<script[\s\S]*?<\/script>/gi, '') }} />
                      <p style={{ margin: '4px 0 0', fontSize: 10.5, color: 'var(--slate)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 9, fontWeight: 800, color: '#1d4ed8', background: '#dbeafe', padding: '1px 6px', borderRadius: 20 }}>TO CUSTOMER</span>
                        {n.author || 'WooCommerce'}{n.date ? ` · ${new Date(n.date).toLocaleString('en-AU')}` : ''}
                      </p>
                      <div className="ord-note-actions" style={{ position: 'absolute', top: 6, right: 8 }}><CopyBtn title="Copy note" onClick={() => copyToClipboard(String(n.note || '').replace(/<[^>]+>/g, ''), onFlash)} /></div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Timeline + notes */}
          <div style={{ ...sect, borderBottom: 'none' }}>
            <p style={kick}>Order Timeline</p>
            <div style={{ display: 'flex', gap: 6, margin: '10px 0' }}>
              <textarea id="ord-note" value={noteBody} onChange={e => setNoteBody(e.target.value)} placeholder="Add a note… use @ to mention someone" rows={2} style={{ flex: 1, padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 12.5, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }} />
              <button type="button" onClick={addNote} disabled={!noteBody.trim()} style={{ padding: '0 12px', borderRadius: 9, border: 'none', background: noteBody.trim() ? ACCENT : 'var(--border)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: noteBody.trim() ? 'pointer' : 'default' }}>Note</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
              {notes.map((n: any) => (
                <div key={n.id} className="ord-note" style={{ position: 'relative', padding: '8px 11px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a' }}>
                  {editNoteId === n.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <textarea autoFocus value={editNoteText} onChange={e => setEditNoteText(e.target.value)} rows={2} style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => setEditNoteId(null)} style={{ background: 'none', border: 'none', color: 'var(--slate)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                        <button type="button" onClick={() => saveNoteEdit(n)} style={{ background: 'none', border: 'none', color: ACCENT, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Save</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5, paddingRight: 60 }}>{n.body}</p>
                      <p style={{ margin: '4px 0 0', fontSize: 10.5, color: 'var(--slate)' }}>{n.author_name || 'Someone'} · {n.created_at ? new Date(n.created_at).toLocaleString('en-AU') : ''}</p>
                      <div className="ord-note-actions" style={{ position: 'absolute', top: 6, right: 8, display: 'flex', gap: 4 }}>
                        <button type="button" title="Copy" onClick={() => copyToClipboard(n.body, onFlash)} style={{ background: 'var(--card,#fff)', border: '1px solid var(--border)', borderRadius: 6, padding: 4, cursor: 'pointer', color: 'var(--slate)', display: 'inline-flex' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg></button>
                        <button type="button" title="Edit" onClick={() => { setEditNoteId(n.id); setEditNoteText(n.body || '') }} style={{ background: 'var(--card,#fff)', border: '1px solid var(--border)', borderRadius: 6, padding: 4, cursor: 'pointer', color: 'var(--slate)', display: 'inline-flex' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg></button>
                        <button type="button" title="Delete" onClick={() => deleteNote(n)} style={{ background: 'var(--card,#fff)', border: '1px solid var(--border)', borderRadius: 6, padding: 4, cursor: 'pointer', color: '#dc2626', display: 'inline-flex' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg></button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {events.map((ev: any) => (
                <div key={ev.id} style={{ display: 'flex', gap: 9 }}>
                  <span style={{ marginTop: 4, width: 7, height: 7, borderRadius: '50%', background: ACCENT, flexShrink: 0 }} />
                  <div>
                    <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink)' }}>{ev.detail || ev.type}</p>
                    <p style={{ margin: '1px 0 0', fontSize: 10.5, color: 'var(--slate)' }}>{ev.created_at ? new Date(ev.created_at).toLocaleString('en-AU') : ''}{ev.actor_name ? ` by ${ev.actor_name}` : ''}</p>
                  </div>
                </div>
              ))}
              {notes.length === 0 && events.length === 0 && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)' }}>No activity yet.</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Item gallery / lightbox */}
      {galleryIdx != null && items[galleryIdx] && (() => {
        const it = items[galleryIdx]
        const multi = items.length > 1
        const go = (d: number) => setGalleryIdx(i => { const n = ((i as number) + d + items.length) % items.length; return n })
        return (
          <div onClick={() => setGalleryIdx(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 4700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card,#fff)', borderRadius: 16, width: 460, maxWidth: '94vw', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }}>
              <div style={{ position: 'relative', width: '100%', height: 320, background: 'var(--peach)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {it.image_url
                  ? <img src={it.image_url} alt={it.product_name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} onError={(e: any) => { e.currentTarget.style.display = 'none' }} />
                  : <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /></svg>}
                <button type="button" onClick={() => setGalleryIdx(null)} style={{ position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 16, cursor: 'pointer' }}>✕</button>
                {multi && <>
                  <button type="button" onClick={() => go(-1)} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 18, cursor: 'pointer' }}>‹</button>
                  <button type="button" onClick={() => go(1)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 18, cursor: 'pointer' }}>›</button>
                </>}
              </div>
              <div style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.35 }}>{it.product_name}</h3>
                  <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{fmtMoney(it.total_price ?? it.unit_price, order.currency)}</span>
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 16, fontSize: 12.5, color: 'var(--slate)', flexWrap: 'wrap' }}>
                  {it.sku && <span>SKU: <strong style={{ color: 'var(--ink)' }}>{it.sku}</strong></span>}
                  <span>Qty: <strong style={{ color: 'var(--ink)' }}>{it.quantity}</strong></span>
                  {it.unit_price != null && <span>Unit: <strong style={{ color: 'var(--ink)' }}>{fmtMoney(it.unit_price, order.currency)}</strong></span>}
                  {multi && <span style={{ marginLeft: 'auto' }}>{(galleryIdx as number) + 1} / {items.length}</span>}
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}
