'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser } from '@/lib/client-cache'
import {
  STATUS_TABS, statusMeta, channelMeta, orderAge, fmtMoney, SAVED_FILTERS,
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
  const [search, setSearch] = useState('')
  const [fStore, setFStore] = useState('all')
  const [defaultOutlet, setDefaultOutlet] = useState<string | null>(null)
  const [savedViews, setSavedViews] = useState<{ id: string; name: string; f: any }[]>([])
  const [activeView, setActiveView] = useState<string | null>(null)
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
    // Read through the service-role API so the board shows rows regardless of RLS
    // state (a mis-applied policy can hide rows from the anon client with no error).
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      const res = await fetch(`/api/orders?companyId=${encodeURIComponent(cid)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d.error) { setToast(`Couldn’t load orders: ${d.error || res.status}`); setTimeout(() => setToast(''), 6000) }
      setOrders(Array.isArray(d.orders) ? d.orders : [])
    } catch (e: any) { setToast(`Couldn’t load orders: ${e?.message || e}`); setTimeout(() => setToast(''), 6000) }
  }, [])

  const runSync = useCallback(async (cid: string) => {
    setSyncing(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      const res = await fetch('/api/orders/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ companyId: cid }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d.error) { setToast(`Sync failed: ${d.error || res.status}`); setTimeout(() => setToast(''), 8000) }
      else if (typeof d.synced === 'number') { setToast(d.synced > 0 ? `Synced ${d.synced} new orders` : 'Orders are up to date'); setTimeout(() => setToast(''), 3000) }
      await loadOrders(cid)
    } catch (e: any) { setToast(`Sync error: ${e?.message || e}`); setTimeout(() => setToast(''), 8000) }
    setSyncing(false)
  }, [loadOrders])

  useEffect(() => {
    (async () => {
      const cid = await getMyCompanyId()
      if (!cid) { setLoading(false); return }
      setCompanyId(cid)
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
      await loadOrders(cid)
      setLoading(false)
      // Bring the operational table up to date from the storefront in the
      // background (idempotent), then refresh.
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

  // ── Filter + sort ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
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
      if (q) {
        const hay = `${o.order_number || ''} ${o.customer_name || ''} ${o.customer_email || ''} ${(o.tags || []).join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    rows = rows.slice().sort((a: any, b: any) => {
      let av: any, bv: any
      if (sortCol === 'total') { av = Number(a.total) || 0; bv = Number(b.total) || 0 }
      else if (sortCol === 'order_number') { av = a.order_number || ''; bv = b.order_number || '' }
      else { av = new Date(a.order_date || 0).getTime(); bv = new Date(b.order_date || 0).getTime() } // age & date sort by date
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return rows
  }, [orders, tab, search, fStore, fAssignee, fTag, fDate, saved, sortCol, sortDir, locMatch])

  useEffect(() => { setPage(0); setSelected(new Set()) }, [tab, search, fStore, fAssignee, fTag, fDate, saved])
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
          <button type="button" onClick={() => setShowCreateOrder(true)} className="ord-create-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 17px', borderRadius: 11, border: '1.5px solid var(--border)', background: '#fff', color: '#0f172a', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.01em' }}>
            <span className="ord-plus" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </span>
            Create Order
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {kpi('All Orders', counts.all, 'var(--ink)')}
          {kpi('Awaiting', counts.awaiting_shipment || 0, ACCENT)}
          {kpi('On Hold', counts.on_hold || 0, '#d97706')}
          {kpi('Shipped', counts.shipped || 0, '#16a34a')}
          {kpi('Alerts', counts.alerts || 0, '#dc2626')}
        </div>
      </div>

      {/* Location filters — a row of outlet chips; star sets a default that
          pre-filters the board (shared with Tasks/Calendar). */}
      {locations.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
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
      )}

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: 22, borderBottom: '1px solid var(--border)', marginBottom: 16, overflowX: 'auto' }}>
        {STATUS_TABS.map(t => {
          const n = t.key === 'all' ? counts.all : t.key === 'alerts' ? counts.alerts : (counts[t.match![0]] || 0)
          const active = tab === t.key
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              style={{ padding: '8px 2px', background: 'none', border: 'none', borderBottom: `2px solid ${active ? ACCENT : 'transparent'}`, color: active ? ACCENT : 'var(--slate)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 7 }}>
              {t.label}
              <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 20, background: active ? `color-mix(in srgb, ${ACCENT} 15%, transparent)` : 'var(--canvas)', color: active ? ACCENT : 'var(--slate)' }}>{n}</span>
            </button>
          )
        })}
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
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search orders…" style={{ ...ctrl, minWidth: 200, paddingRight: search ? 28 : 10, cursor: 'text', fontWeight: 500 }} />
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
                </div>
              </>
            )}
          </div>
          <select value={fDate} onChange={e => setFDate(e.target.value)} style={ctrl}><option value="all">All time</option><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select>
          <select value={saved} onChange={e => setSaved(e.target.value)} style={{ ...ctrl, color: saved ? ACCENT : 'var(--ink)' }}><option value="">Saved Filters</option>{SAVED_FILTERS.map(s => <option key={s} value={s}>{s}</option>)}{locations.map(l => <option key={l.id} value={`loc:${l.id}`}>{l.name}</option>)}</select>
          <button type="button" onClick={() => runSync(companyId!)} disabled={syncing} style={{ ...ctrl, color: ACCENT }}>{syncing ? 'Syncing…' : 'Sync'}</button>
          <button type="button" onClick={() => setManageTagsOpen(true)} title="Create, rename, recolour or delete order tags" style={ctrl}>⚙ Tags</button>
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
                  <tr key={o.id} className="ord-row" onClick={() => openOrder(o.id)} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: drawerId === o.id ? `color-mix(in srgb, ${ACCENT} 10%, transparent)` : sel ? `color-mix(in srgb, ${ACCENT} 5%, transparent)` : isClickCollect(o) ? `color-mix(in srgb, ${ACCENT} 6%, transparent)` : undefined }}>
                    <td style={td} onClick={e => { e.stopPropagation(); toggleOne(o.id) }}><input type="checkbox" checked={sel} onChange={() => {}} /></td>
                    <td style={{ ...td, color: ACCENT, fontWeight: 700 }}>{o.order_number}</td>
                    <td style={{ ...td, fontWeight: 700, color: age.color }}>{age.label}</td>
                    <td style={{ ...td, color: 'var(--slate)' }}>{o.order_date ? new Date(o.order_date).toLocaleString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{o.customer_name || '—'}</td>
                    <td style={td}>{o.item_count || 0}</td>
                    <td style={{ ...td, color: 'var(--slate)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.primary_sku || '—'}</td>
                    <td style={{ ...td, color: 'var(--slate)' }}>{isClickCollect(o)
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700, color: ACCENT }}><span style={{ fontSize: 13 }}>🏬</span>Click &amp; Collect</span>
                      : (Number(o.shipping_total) || 0) > 0 ? <span>{o.shipping_method || 'Shipping'} <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{fmtMoney(o.shipping_total, o.currency)}</span></span> : (o.shipping_method || '—')}</td>
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
          onPrintSlip={(id: string) => openPrint('packing_slip', [id])} />
      )}

      {labelOrder && (
        <CreateLabelModal order={labelOrder} companyId={companyId!} accent={ACCENT}
          onClose={() => setLabelOrder(null)}
          onDone={(patch: any) => { patchOrder([labelOrder.id], patch); setLabelOrder(null) }}
          onFlash={flash} onPrintLabel={(id: string) => openPrint('label', [id])} />
      )}

      {manageTagsOpen && (
        <ManageTagsModal companyId={companyId!} accent={ACCENT} tagDefs={tagDefs} setTagDefs={setTagDefs}
          orders={orders} setOrders={setOrders} onFlash={flash} onClose={() => setManageTagsOpen(false)} />
      )}

      {printModal && <PrintModal doc={printModal.doc} companyId={companyId!} ids={printModal.ids} title={printModal.title} accent={ACCENT} onClose={() => setPrintModal(null)} />}

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
export function CreateLabelModal({ order, companyId, accent, onClose, onDone, onFlash, onPrintLabel }: any) {
  const ACCENT = accent || 'var(--coral)'
  const [carrier, setCarrier] = useState<string>(order.carrier || 'australia_post')
  const [service, setService] = useState<string>(CARRIER_SERVICES[order.carrier || 'australia_post']?.[0] || '')
  const [weight, setWeight] = useState<string>('') // kg
  const [dims, setDims] = useState({ length: '', width: '', height: '' })
  const [markShipped, setMarkShipped] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => { setService(CARRIER_SERVICES[carrier]?.[0] || '') }, [carrier])

  const submit = async () => {
    setBusy(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      const parcel = (dims.length || dims.width || dims.height)
        ? { length: Number(dims.length) || undefined, width: Number(dims.width) || undefined, height: Number(dims.height) || undefined }
        : null
      const res = await fetch('/api/orders/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ companyId, orderId: order.id, carrier, service, weightGrams: weight ? Math.round(Number(weight) * 1000) : null, parcel, markShipped }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) { onFlash(`Label failed: ${j.error || res.status}`); setBusy(false); return }
      onDone(j.patch || {})
      onFlash(j.live ? 'Label purchased' : 'Label created')
      if (onPrintLabel) onPrintLabel(order.id)
    } catch (e: any) { onFlash(`Label error: ${e?.message || e}`); setBusy(false) }
  }

  const field: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, outline: 'none', boxSizing: 'border-box', background: 'var(--card,#fff)', color: 'var(--ink)' }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'block', marginBottom: 5 }
  const addr = order.shipping_address || {}
  const hasAddr = addr.address_1 || addr.city
  const isLiveCarrier = false // no carrier API wired yet — printable label path

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 4600 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 440, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto', background: 'var(--card, #fff)', borderRadius: 16, zIndex: 4601, boxShadow: '0 24px 60px rgba(0,0,0,0.28)' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Create Label</h2>
            <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>Order {order.order_number} · {order.customer_name}</p>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--slate)', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!hasAddr && <div style={{ padding: '9px 12px', borderRadius: 9, background: '#fef3c7', color: '#92400e', fontSize: 12.5 }}>No shipping address on this order — the label will print without a delivery address.</div>}

          <div>
            <label style={lbl}>Carrier</label>
            <select value={carrier} onChange={e => setCarrier(e.target.value)} style={field}>
              {CARRIERS.map(c => <option key={c} value={c}>{CARRIER_LABEL[c] || c}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Service</label>
            <select value={service} onChange={e => setService(e.target.value)} style={field}>
              {(CARRIER_SERVICES[carrier] || ['Standard']).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Weight (kg)</label>
              <input type="number" min="0" step="0.01" value={weight} onChange={e => setWeight(e.target.value)} placeholder="0.50" style={field} />
            </div>
            <div style={{ flex: 2 }}>
              <label style={lbl}>Dimensions (cm)</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['length', 'width', 'height'] as const).map(k => (
                  <input key={k} type="number" min="0" value={(dims as any)[k]} onChange={e => setDims(d => ({ ...d, [k]: e.target.value }))} placeholder={k[0].toUpperCase()} style={{ ...field, padding: '8px 6px', textAlign: 'center' }} />
                ))}
              </div>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
            <input type="checkbox" checked={markShipped} onChange={e => setMarkShipped(e.target.checked)} />
            Mark order as Shipped after creating the label
          </label>

          <div style={{ padding: '9px 12px', borderRadius: 9, background: 'var(--canvas)', fontSize: 11.5, color: 'var(--slate)', lineHeight: 1.5 }}>
            {carrier === 'team_global_express'
              ? 'Team Global Express: prints a scannable label now. Live consignment lodging switches on once TGE onboarding is complete and credentials are set.'
              : 'Generates a scannable printable label and tracking number. Live carrier lodging switches on when that carrier’s account is connected.'}
          </div>
        </div>

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={onClose} style={{ padding: '9px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button type="button" onClick={submit} disabled={busy} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? 'Creating…' : isLiveCarrier ? 'Buy Label' : 'Create & Print'}</button>
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
function OrderDrawer({ order, companyId, me, team, locations, accent, allTags, tagDefs, tagColor, onEnsureTag, onManageTags, onClose, onPatch, onFlash, onLabel, onPrintSlip, teamName, outletName, fullScreen = false }: any) {
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
      const money = (v: any) => `$${(parseFloat(v || 0)).toFixed(2)}`
      let y = 20
      doc.setFontSize(15); doc.setFont('helvetica', 'bold'); doc.text(String(co.name || 'Invoice'), 16, y)
      doc.setFontSize(10); doc.setFont('helvetica', 'normal')
      doc.text(`Tax Invoice — Order #${o.number || order.order_number}`, 16, y + 8)
      doc.text(`Date: ${o.date_created ? new Date(o.date_created).toLocaleDateString('en-AU') : ''}`, 16, y + 13)
      const b = o.billing || {}
      y += 26; doc.setFont('helvetica', 'bold'); doc.text('Bill To', 16, y); doc.setFont('helvetica', 'normal')
      doc.text(`${b.first_name || ''} ${b.last_name || ''}`.trim() || String(order.customer_name || ''), 16, y + 5);
      [[b.address_1, b.address_2].filter(Boolean).join(', '), [b.city, b.state, b.postcode].filter(Boolean).join(' '), b.country].filter(Boolean).forEach((l: any, i: number) => doc.text(String(l), 16, y + 10 + i * 5))
      y += 34; doc.setFont('helvetica', 'bold'); doc.text('Item', 16, y); doc.text('Qty', 150, y); doc.text('Total', 194, y, { align: 'right' }); doc.setFont('helvetica', 'normal'); y += 6
      for (const li of (o.line_items || [])) { doc.text(String(li.name || 'Item').slice(0, 58), 16, y); doc.text(String(li.quantity), 150, y); doc.text(money(li.total), 194, y, { align: 'right' }); y += 6; if (y > 270) { doc.addPage(); y = 20 } }
      y += 3; doc.line(16, y, 194, y); y += 6; doc.setFont('helvetica', 'bold')
      doc.text('Total', 150, y); doc.text(`${money(o.total)} ${o.currency || order.currency || ''}`, 194, y, { align: 'right' })
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
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '9px 6px', borderRadius: 11, border: `1px solid ${primary ? ACCENT : 'var(--border)'}`, background: primary ? ACCENT : 'var(--card, #fff)', color: primary ? '#fff' : 'var(--ink)', cursor: 'pointer', flex: 1, minWidth: 64 }}>
      {icon}<span style={{ fontSize: 10.5, fontWeight: 700 }}>{label}</span>
    </button>
  )
  const I = { width: 17, height: 17, fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }

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
          {/* Quick actions */}
          <div style={{ ...sect, display: 'flex', gap: 8 }}>
            {quick(<svg {...I}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18" /></svg>, 'Label', () => onLabel(order), true)}
            {quick(<svg {...I}><path d="M6 9V2h12v7" /><rect x="6" y="14" width="12" height="8" /><path d="M6 18H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2" /></svg>, 'Slip', () => onPrintSlip(order.id))}
            {quick(<svg {...I}><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" /><path d="m9 14 2 2 4-4" /></svg>, 'Pick', () => { setPickMode(v => { const n = !v; if (n) { const el = document.getElementById('ord-items-panel'); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); onFlash('Picking — tap each item as you pick it') } return n }) }, pickMode)}
            {quick(<svg {...I}><path d="M20 6 9 17l-5-5" /></svg>, 'Packed', () => { onPatch({ status: 'packed' }, { type: 'packed', detail: 'Marked packed' }); order.status = 'packed'; logEvent('packed', 'Marked packed') })}
            {quick(<svg {...I}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>, 'Note', () => { (document.getElementById('ord-note') as HTMLTextAreaElement)?.focus() })}
            {quick(<svg {...I}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>, 'Contact', () => { if (convHref) location.href = convHref; else onFlash('No linked conversation yet.') })}
          </div>

          {/* Order barcode — scannable Code128 of the order number */}
          {order.order_number && (
            <div style={{ ...sect, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div title={`Order ${order.order_number}`} style={{ width: '100%', maxWidth: 320, display: 'flex', justifyContent: 'center' }}
                dangerouslySetInnerHTML={{ __html: barcodeSVG(String(order.order_number), { moduleWidth: 2, height: 54 }) }} />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--ink)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{order.order_number}</span>
            </div>
          )}

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
                ['Shipping', isClickCollect(order) ? `🏬 ${order.shipping_method || 'Click & Collect'}` : (Number(order.shipping_total) || 0) > 0 ? `${fmtMoney(order.shipping_total, order.currency)}${order.shipping_method ? ` · ${order.shipping_method}` : ''}` : (order.shipping_method || 'Free')],
                ['Total', `${fmtMoney(order.total, order.currency)} ${order.currency || ''}`],
              ] as [string, any][]).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
                  <span style={{ color: 'var(--slate)' }}>{k}</span>
                  <span style={{ fontWeight: k === 'Total' ? 800 : 600, color: 'var(--ink)', textAlign: 'right', textTransform: k === 'Payment' || k === 'Fulfilment' ? 'capitalize' : 'none' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

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
