'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser } from '@/lib/client-cache'
import { readLocal, writeLocal } from '@/lib/local-cache'
import { track } from '@/lib/analytics'
import {
  STATUS_TABS, statusMeta, displayStatus, isAwaitingPayment, channelMeta, orderAge, fmtMoney,
  CARRIERS, CARRIER_LABEL, CARRIER_SERVICES, isClickCollect, variationFromMeta,
} from '@/lib/orders'
import OrderPrintDoc from '@/components/OrderPrintDoc'
import OrderItemsPanel from '@/components/OrderItemsPanel'
import CollapseSection from '@/components/CollapseSection'
import CreateOrderPanel from '@/components/CreateOrderPanel'
import { PlatformLogo } from '@/components/StoreLogo'
import OrderDraftsPanel, { useOrderDraftCount } from '@/components/OrderDraftsPanel'
import OutOfStockModal from '@/components/OutOfStockModal'
import RefundOrderModal from '@/components/RefundOrderModal'
import EmptyScroll from '@/components/EmptyScroll'
import { CARRIERS as TRACK_CARRIERS, carrierByKey } from '@/lib/carriers'
import { barcodeSVG } from '@/lib/barcode'
import { confirmDialog } from '@/components/ConfirmDialog'
import { notifyIntegrations } from '@/lib/integrations-notify'
import { authFetch } from '@/lib/auth-fetch'
import { loadStaffRows } from '@/lib/team-list'
import type { OrderRefund } from '@/lib/order-refunds'
import { sanitizeHtml } from '@/lib/safe-html'

type Order = any

// WooCommerce brand mark — the official Woo logo (public/logos/woocommerce.svg).
function WooLogo({ size = 16 }: { size?: number }) {
  const box = size + 6
  return <img src="/logos/woocommerce.svg" alt="WooCommerce" title="WooCommerce" width={box} height={box} style={{ width: box, height: box, borderRadius: 6, flexShrink: 0, display: 'inline-block' }} />
}
export function ChannelIcon({ channel, size = 15 }: { channel?: string | null; size?: number }) {
  if (channel === 'woocommerce') return <WooLogo size={size} />
  if (channel === 'shopify') return <PlatformLogo platform="shopify" size={size + 6} />
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

// "Awaiting Shipment" → "Awaiting shipment" for chips and tags.
const sentence = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s

// The page's line icons (one stroke style, like the rest of the admin).
const ORD_ICONS: Record<string, React.ReactNode> = {
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M9 15h6" /></>,
  plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  box: <><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="m3 8 9 5 9-5" /><path d="M12 13v8" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>,
  pause: <><circle cx="12" cy="12" r="9" /><line x1="10" y1="9" x2="10" y2="15" /><line x1="14" y1="9" x2="14" y2="15" /></>,
  truck: <><path d="M1 4h13v12H1z" /><path d="M14 8h4l4 4v4h-8" /><circle cx="5.5" cy="18.5" r="2" /><circle cx="18.5" cy="18.5" r="2" /></>,
  alert: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
  star: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />,
  printer: <><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></>,
  tag: <><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></>,
  chev: <polyline points="6 9 12 15 18 9" />,
  x: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
  search: <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
  pin: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>,
  store: <><path d="M3 9 4.5 4h15L21 9" /><path d="M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z" /><path d="M5 12v8h14v-8" /></>,
  inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  bookmark: <path d="M19 21 12 16 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />,
  refresh: <><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></>,
  sliders: <><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></>,
  panel: <><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="15" y1="3" x2="15" y2="21" /></>,
  up: <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></>,
  down: <><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></>,
  left: <polyline points="15 18 9 12 15 6" />,
  right: <polyline points="9 18 15 12 9 6" />,
}
function OrdIcon({ name, size = 16, fill, className }: { name: string; size?: number; fill?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {ORD_ICONS[name]}
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
  const c = color || hashColor(name)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: onRemove ? '0 5px 0 9px' : '0 10px 0 9px', borderRadius: 999, background: `color-mix(in srgb, ${c} 10%, #fff)`, color: `color-mix(in srgb, ${c} 88%, #000)`, fontSize: 12.5, fontWeight: 600, lineHeight: 1, whiteSpace: 'nowrap', boxSizing: 'border-box' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c, flexShrink: 0 }} />
      {name}{onRemove && <button type="button" onClick={e => { e.stopPropagation(); onRemove() }} title="Remove" aria-label={`Remove ${name}`} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, width: 16, height: 16, borderRadius: 999, fontSize: 14, lineHeight: 1, opacity: 0.7, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>×</button>}
    </span>
  )
}

export function CopyBtn({ onClick, title }: { onClick: () => void; title?: string }) {
  const [done, setDone] = useState(false)
  // Give the copy a felt gesture: a quick press-pop, then swap the icon for a
  // green tick for ~1s so the click registers visually (not just the toast).
  return (
    <button type="button" title={done ? 'Copied' : (title || 'Copy')}
      onClick={e => { e.stopPropagation(); e.preventDefault(); onClick(); setDone(true); setTimeout(() => setDone(false), 1100) }}
      style={{
        background: 'none', border: 'none', padding: 2, cursor: 'copy',
        color: done ? '#16a34a' : 'var(--slate)', display: 'inline-flex', lineHeight: 0, borderRadius: 4, flexShrink: 0,
        transform: done ? 'scale(1.25)' : 'scale(1)',
        transition: 'transform .14s cubic-bezier(.34,1.56,.64,1), color .14s ease',
      }}
      onPointerDown={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(.82)' }}
      onPointerUp={e => { (e.currentTarget as HTMLElement).style.transform = done ? 'scale(1.25)' : 'scale(1)' }}
      onPointerLeave={e => { (e.currentTarget as HTMLElement).style.transform = done ? 'scale(1.25)' : 'scale(1)' }}>
      {done
        ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>}
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

// ── Board cache (stale-while-revalidate across visits) ──────────────────────
// The last board is kept in localStorage so a revisit paints instantly while the
// fresh load runs. Only the columns the board itself reads (table row, tab
// counts, filters, search, bulk actions) are stored, column-wise (no repeated
// keys) with the address cut to its searchable parts, so a book of thousands
// fits comfortably.
// Cached rows carry `__c: 1` and are replaced by full rows as their page of the
// fresh load lands. The drawer never renders a cached row: opening one before
// its page lands fetches the full row first (the drawer and the label modal
// write back fields such as metadata, which a partial row doesn't carry).
const ORDERS_CACHE_MAX = 6000
const ORDER_CACHE_FIELDS = [
  'id', 'order_number', 'order_date', 'customer_name', 'customer_email', 'customer_phone', 'item_count', 'primary_sku',
  'shipping_method', 'shipping_total', 'total', 'currency', 'status', 'payment_status', 'fulfilment_status',
  'assignee_id', 'assignee_name', 'tags', 'flagged', 'store_location_id', 'sales_channel', 'contact_id', 'conversation_id',
  'external_order_id', 'carrier', 'tracking_number', 'shipping_address',
] as const
const ADDR_FIELDS = ['address_1', 'address_2', 'city', 'state', 'postcode', 'country'] as const
type OrdersCache = { v: 1; cols: string[]; rows: any[][] }
function encodeOrdersCache(rows: any[]): OrdersCache {
  return {
    v: 1, cols: [...ORDER_CACHE_FIELDS],
    rows: rows.map(o => ORDER_CACHE_FIELDS.map(k => {
      const v = o[k]
      if (k !== 'shipping_address') return v ?? null
      if (!v || typeof v !== 'object') return null
      const sa: any = {}
      for (const f of ADDR_FIELDS) if (v[f]) sa[f] = v[f]
      return sa
    })),
  }
}
function decodeOrdersCache(c: any): any[] | null {
  if (!c || c.v !== 1 || !Array.isArray(c.cols) || !Array.isArray(c.rows)) return null
  const cols: string[] = c.cols
  return c.rows.map((r: any[]) => {
    const o: any = { __c: 1 }
    for (let i = 0; i < cols.length; i++) o[cols[i]] = r[i]
    return o
  })
}

// Assignee avatar. Module-level (it used to be re-declared inside the page on
// every render, which gave React a new component type each time and remounted
// every row's avatar on every state change).
function Avatar({ name }: { name: string | null }) {
  if (!name) return <span style={{ fontSize: 12, color: 'var(--slate)' }}>—</span>
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const hue = Array.from(name).reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return <span title={name} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', background: `hsl(${hue} 60% 90%)`, color: `hsl(${hue} 45% 38%)`, fontSize: 10.5, fontWeight: 800 }}>{initials}</span>
}

export default function OrdersPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  // The company's own brand colour drives the accent (active tab, primary
  // actions) — not a hard-coded blue. Falls back to Colvy's coral.
  const [accent, setAccent] = useState<string>('var(--coral)')
  const ACCENT = accent
  const [me, setMe] = useState<{ id: string | null; name: string }>({ id: null, name: 'You' })
  const [orders, setOrders] = useState<Order[]>([])
  // Order ids with an unresolved out-of-stock alert — powers the "Order Alerts"
  // tab/count so it mirrors the Out of Stock list.
  const [oosOrderIds, setOosOrderIds] = useState<Set<string>>(new Set())
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])
  const [team, setTeam] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [toast, setToast] = useState('')

  const [tab, setTab] = useState('all')
  const [locMenuOpen, setLocMenuOpen] = useState(false)
  const [viewsMenuOpen, setViewsMenuOpen] = useState(false)
  const [displayMenuOpen, setDisplayMenuOpen] = useState(false)
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
  const [showDrafts, setShowDrafts] = useState(false)
  const [openDraft, setOpenDraft] = useState<any>(null)
  const [draftBump, setDraftBump] = useState(0)
  const draftCount = useOrderDraftCount(companyId, draftBump)
  const [showOOS, setShowOOS] = useState(false)
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

  // Publish the open order to the floating Colvy AI assistant so "refund this
  // order" / "mark this order completed" resolve to the drawer's order.
  useEffect(() => {
    const o = drawerId ? orders.find(x => x.id === drawerId) : null
    try {
      window.dispatchEvent(new CustomEvent('colvy:ai-context', {
        detail: { orderId: drawerId || null, contactId: (o as any)?.contact_id || null, conversationId: (o as any)?.conversation_id || null },
      }))
    } catch {}
  }, [drawerId, orders])

  const [printModal, setPrintModal] = useState<{ doc: 'packing_slip' | 'label'; ids: string[]; title: string } | null>(null)
  // Open the print preview (packing slips or labels) as an in-page modal.
  const openPrint = useCallback((docType: 'packing_slip' | 'label', ids: string[]) => {
    if (!ids.length || !companyId) { flash('Select at least one order'); return }
    track(docType === 'label' ? 'order_labels_printed' : 'order_slips_printed', { count: ids.length })
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

  // Bumped by every loadOrders call so a superseded load (e.g. a sync-triggered
  // reload, or a workspace switch) stops writing into state.
  const loadGenRef = useRef(0)
  const userIdRef = useRef<string | null>(null)
  const activeCidRef = useRef<string | null>(null)
  // Persist the last full board (see encodeOrdersCache) so a revisit paints
  // instantly while the fresh load runs. Deferred off the load's critical path;
  // if storage is short, keep the newest orders that fit.
  const writeOrdersCache = (cid: string, rows: any[]) => {
    const uid = userIdRef.current
    if (!uid) return
    setTimeout(() => {
      try {
        for (let n = Math.min(rows.length, ORDERS_CACHE_MAX); n > 0; n = Math.floor(n / 2)) {
          if (writeLocal('orders', uid, cid, encodeOrdersCache(rows.slice(0, n)))) return
          if (n < 500) return
        }
      } catch {}
    }, 0)
  }

  const loadOrders = useCallback(async (cid: string) => {
    // Read the orders table DIRECTLY via PostgREST (always warm, index-served on
    // (company_id, order_date)) instead of the serverless /api/orders — that
    // route cold-starts and re-validates the auth token on every request, which
    // is the bulk of the load time. The orders table's RLS is permissive, so the
    // anon client reads it fine.
    //
    // Speed: a SMALL first page paints (and drops the spinner) as fast as
    // possible, then the following 1000-row pages are requested several at a
    // time instead of one after another — a big book used to take N sequential
    // round trips. Each landed prefix is merged over whatever is on screen
    // (cached rows from the last visit, or the previous load), so a refresh
    // never shrinks the board/counts while it streams in.
    const gen = ++loadGenRef.current
    const FIRST = 250, PAGE = 1000, WINDOW = 4, MAX = 100000
    // PostgREST builders are lazy (they only send on .then), so .then() here
    // fires the request immediately — that's what lets pages overlap.
    const pageQ = (from: number, to: number): Promise<{ data: any[] | null; error: any }> => (supabase as any).from('orders').select('*')
      .eq('company_id', cid).order('order_date', { ascending: false }).range(from, to)
      .then((r: any) => r, (e: any) => ({ data: null, error: e }))
    const seen = new Set<string>()
    const acc: any[] = []
    const add = (rows: any[]) => { for (const r of rows) { if (seen.has(r.id)) continue; seen.add(r.id); acc.push(r) } }
    // The fetched prefix is authoritative for every order newer than its oldest
    // row; older on-screen rows stay until their own page lands.
    const show = (complete: boolean) => {
      if (gen !== loadGenRef.current) return
      const fresh = acc.slice()
      setOrders(prev => {
        if (complete || !prev.length) return fresh
        const last = fresh[fresh.length - 1]?.order_date
        if (!last) return fresh
        const tail = prev.filter(o => !seen.has(o.id) && o.order_date && o.order_date < last)
        return tail.length ? fresh.concat(tail) : fresh
      })
    }
    const fail = (msg: string) => { if (gen !== loadGenRef.current) return; setToast(`Couldn’t load orders: ${msg}`); setTimeout(() => setToast(''), 6000); setLoading(false) }
    try {
      // The small first page goes out ALONE so it isn't sharing bandwidth with
      // the bulk pages — it's what paints the board.
      const first = await pageQ(0, FIRST - 1)
      if (gen !== loadGenRef.current) return
      if (first.error) { fail(first.error.message); return }
      add(first.data || [])
      if ((first.data || []).length < FIRST) { show(true); setLoading(false); writeOrdersCache(cid, acc); return }
      show(false); setLoading(false)
      // Remaining pages — detached so they never block the caller/interaction.
      // A sliding window keeps WINDOW pages in flight (instead of one round trip
      // per page); they're consumed in order, and the big-list re-derivation
      // (counts, filter, sort) re-runs once per WINDOW pages, not per page.
      ;(async () => {
        const inflight: Promise<{ data: any[] | null; error: any }>[] = []
        let next = FIRST
        const fire = () => { if (next < MAX) { inflight.push(pageQ(next, next + PAGE - 1)); next += PAGE } }
        for (let i = 0; i < WINDOW; i++) fire()
        let failed = false, sinceShow = 0
        while (inflight.length) {
          const { data, error } = await inflight.shift()!
          if (gen !== loadGenRef.current) return
          if (error) { failed = true; break }
          if (!data?.length) break
          add(data)
          if (data.length < PAGE) break
          fire()
          if (++sinceShow >= WINDOW) { show(false); sinceShow = 0 }
        }
        // A failed page keeps the older on-screen rows rather than dropping them.
        show(!failed)
        if (!failed) writeOrdersCache(cid, acc)
      })()
    } catch (e: any) { fail(e?.message || String(e)) }
  }, [])

  // Load which orders have an unresolved out-of-stock alert, so the "Order
  // Alerts" tab/count reflects the Out of Stock list. Terminal orders (shipped/
  // cancelled) are excluded to match how the OOS list treats them as done.
  const loadOos = useCallback(async (cid: string) => {
    try {
      const { data } = await (supabase as any).from('order_stock_alerts')
        .select('order_id, status').eq('company_id', cid).neq('status', 'resolved').limit(2000)
      if (activeCidRef.current && activeCidRef.current !== cid) return // superseded workspace
      setOosOrderIds(new Set((data || []).map((r: any) => r.order_id).filter(Boolean)))
    } catch { /* table may not exist yet — leave the set empty */ }
  }, [])

  // Build a per-order product search index (name + SKU) so the board search can
  // match by product, which the order rows themselves don't carry. Loaded in the
  // background — search works on order#/name/email/phone/address immediately and
  // gains product matching once this resolves.
  const loadItemIndex = useCallback(async (cid: string) => {
    try {
      const map: Record<string, string> = {}
      const page = 1000, WAVE = 4
      // Pages are fetched in parallel waves rather than strictly one by one.
      const q = (from: number) => (supabase as any).from('order_items')
        .select('order_id, product_name, sku').eq('company_id', cid).range(from, from + page - 1)
        .then((r: any) => r, (e: any) => ({ data: null, error: e }))
      outer: for (let from = 0; ; from += WAVE * page) {
        const res = await Promise.all(Array.from({ length: WAVE }, (_, i) => q(from + i * page)))
        for (const { data, error } of res) {
          if (error || !data?.length) break outer
          for (const it of data) {
            const s = `${it.product_name || ''} ${it.sku || ''}`.toLowerCase()
            map[it.order_id] = map[it.order_id] ? `${map[it.order_id]} ${s}` : s
          }
          if (data.length < page) break outer
        }
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

  // Opening the Orders page clears the "new orders" nav badge: stamp the seen
  // time and tell the sidebar to zero the count immediately.
  useEffect(() => {
    try { localStorage.setItem('colvy-orders-seen-at', new Date().toISOString()); window.dispatchEvent(new Event('orders-seen')) } catch {}
  }, [])

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
            const wr = await authFetch('/api/woocommerce/sync', { method: 'POST', headers: authH, body: JSON.stringify({ companyId: cid, mode: 'orders', page, modifiedAfter: since }) })
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

  // Board metadata (accent, outlets, team, tags, alert ids, filter prefs) is
  // cached alongside the rows so a revisit paints in its final shape (default
  // outlet/status already applied) rather than flashing "All" first.
  const [metaFresh, setMetaFresh] = useState(false)
  useEffect(() => {
    if (!metaFresh || !companyId) return
    writeLocal('orders-meta', userIdRef.current, companyId, {
      accent, locations, team, tagDefs, oos: Array.from(oosOrderIds),
      prefs: { outlet: defaultOutlet, status: defaultStatus, views: savedViews },
    })
  }, [metaFresh, companyId, accent, locations, team, tagDefs, oosOrderIds, defaultOutlet, defaultStatus, savedViews])

  useEffect(() => {
    (async () => {
      // Paint the last board seen on this device first (stale-while-revalidate)
      // and start the fresh load at once — before the workspace lookup, which
      // can itself be a round trip. getSession() reads local storage.
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id || null
      userIdRef.current = uid
      if (session?.user) setMe({ id: session.user.id, name: session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || 'You' })
      let started: string | null = null
      let cachedPrefs: { outlet: string | null; status: string | null } = { outlet: null, status: null }
      const cached = readLocal<OrdersCache>('orders', uid)
      const cachedRows = cached?.companyId ? decodeOrdersCache(cached.data) : null
      if (cached && cachedRows) {
        started = cached.companyId
        const meta = readLocal<any>('orders-meta', uid)
        if (meta && meta.companyId === started && meta.data) {
          const m = meta.data
          if (m.accent) setAccent(m.accent)
          if (Array.isArray(m.locations)) setLocations(m.locations)
          if (Array.isArray(m.team)) setTeam(m.team)
          if (Array.isArray(m.tagDefs)) setTagDefs(m.tagDefs)
          if (Array.isArray(m.oos)) setOosOrderIds(new Set(m.oos))
          const p = m.prefs || {}
          if (p.outlet) { cachedPrefs.outlet = p.outlet; setDefaultOutlet(p.outlet); setFStore(p.outlet) }
          if (p.status && STATUS_TABS.some(t => t.key === p.status)) { cachedPrefs.status = p.status; setDefaultStatus(p.status); setTab(p.status) }
          if (Array.isArray(p.views)) setSavedViews(p.views)
        }
        activeCidRef.current = started
        setCompanyId(started); setOrders(cachedRows); setLoading(false)
        loadOrders(started)
        loadOos(started)
      }

      const cid = await getMyCompanyId()
      if (!cid) { if (!started) setLoading(false); return }
      if (cid !== started) {
        // First visit on this device, or a different workspace — start clean.
        if (started) {
          cachedPrefs = { outlet: null, status: null }
          setOrders([]); setOosOrderIds(new Set()); setLoading(true)
          setAccent('var(--coral)'); setLocations([]); setTeam([]); setTagDefs([]); setSavedViews([])
          setDefaultOutlet(null); setFStore('all'); setDefaultStatus(null); setTab('all')
        }
        activeCidRef.current = cid
        setCompanyId(cid)
        // Kick the orders load off immediately, in parallel with the accent /
        // locations / prefs / team setup below — the board never waits on any
        // of that before its first paint.
        loadOrders(cid)
        loadOos(cid)
      }
      loadTagDefs(cid)

      // The setup lookups are independent, so they run in parallel (they used
      // to be five sequential round trips before outlets/filters/team settled).
      const [coRes, locRes, prefs, tmRes] = await Promise.all([
        (supabase as any).from('companies').select('accent_color, owner_id, name').eq('id', cid).maybeSingle().then((r: any) => r, () => null),
        (supabase as any).from('company_locations').select('id, label, suburb, is_primary').eq('company_id', cid).order('is_primary', { ascending: false }).then((r: any) => r, () => null),
        session?.user
          ? authFetch(`/api/user-prefs?userId=${session.user.id}&companyId=${cid}`).then(r => r.json()).catch(() => null)
          : Promise.resolve(null),
        loadStaffRows(supabase, cid).then(data => ({ data }), () => null),
      ])
      const coRow = coRes?.data
      if (coRow?.accent_color) setAccent(coRow.accent_color)
      const locs = locRes?.data
      setLocations((locs || []).map((l: any) => ({ id: l.id, name: l.label || l.suburb || 'Outlet' })))

      // Default outlet — shared with the Tasks/Calendar pages. Pre-filters the
      // board. A cached default was already applied at first paint; only move a
      // filter if the saved default changed and the user hasn't picked another.
      if (session?.user && prefs) {
        try {
          const dv = prefs?.prefs?.default_outlet
          const outlet: string | null = dv?.id && (locs || []).some((l: any) => l.id === dv.id) ? dv.id : null
          if (outlet && outlet !== cachedPrefs.outlet) {
            setDefaultOutlet(outlet); setFStore(cur => cur === (cachedPrefs.outlet || 'all') ? outlet : cur)
          } else if (!outlet && cachedPrefs.outlet) {
            setDefaultOutlet(null); setFStore(cur => cur === cachedPrefs.outlet ? 'all' : cur)
          }
          const dsRaw = prefs?.prefs?.default_status?.key
          const ds: string | null = dsRaw && STATUS_TABS.some(t => t.key === dsRaw) ? dsRaw : null
          if (ds && ds !== cachedPrefs.status) {
            setDefaultStatus(ds); setTab(cur => cur === (cachedPrefs.status || 'all') ? ds : cur)
          } else if (!ds && cachedPrefs.status) {
            setDefaultStatus(null); setTab(cur => cur === cachedPrefs.status ? 'all' : cur)
          }
          const vs = prefs?.prefs?.order_views?.views
          if (Array.isArray(vs)) setSavedViews(vs)
        } catch {}
      }

      // Team — mirror the inbox: the company owner, then the staff (board
      // visitors can't be assigned, and on a busy board they'd crowd staff out
      // of one read).
      const members: { id: string; name: string }[] = []
      if (coRow?.owner_id) members.push({ id: coRow.owner_id, name: coRow.name ? `${coRow.name} (Owner)` : 'Owner' })
      for (const m of tmRes?.data || []) {
        if (m.company_id && m.company_id !== cid) continue
        const uid = m.user_id || m.id
        if (!uid || members.some(x => x.id === uid)) continue
        members.push({ id: uid, name: m.name || m.display_name || m.email?.split('@')[0] || 'Teammate' })
      }
      const needIds = members.filter(m => !m.name || m.name === 'Teammate').map(m => m.id)
      if (needIds.length) { try { const r = await authFetch('/api/team/names', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userIds: needIds }) }); const names = (await r.json()).names || {}; for (const m of members) if (names[m.id]?.name) m.name = names[m.id].name } catch {} }
      setTeam(members)
      setMetaFresh(true)

      // Orders are already loading (kicked off above). Bring the operational
      // table up to date from the storefront in the background (idempotent).
      // The product-search index loads lazily on first search use, not here.
      runSync(cid)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A drawer opened on a cached (partial) row before its fresh page has landed
  // pulls that order's full row straight away; the drawer renders once it's in.
  const drawerIsPartial = !!(drawerId && orders.find(x => x.id === drawerId)?.__c)
  useEffect(() => {
    if (!drawerId || !drawerIsPartial) return
    let alive = true
    ;(supabase as any).from('orders').select('*').eq('id', drawerId).maybeSingle().then(({ data, error }: any) => {
      if (!alive) return
      if (data) setOrders(os => os.map(x => x.id === data.id && x.__c ? data : x))
      else if (!error) setDrawerId(null) // order no longer exists
    }, () => {})
    return () => { alive = false }
  }, [drawerId, drawerIsPartial])

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

  // An order is "alerted" if it has an unresolved out-of-stock line (unless it's
  // already shipped/cancelled) or was manually flagged. This is what the Order
  // Alerts tab/count and the Alerts KPI surface.
  const isAlerted = useCallback((o: any) => (
    (oosOrderIds.has(o.id) && !['shipped', 'cancelled'].includes(o.status)) || !!o.flagged
  ), [oosOrderIds])

  // ── Counts for the tabs (scoped to the current Location filter) ─────────────
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, alerts: 0, awaiting_shipment: 0, awaiting_payment: 0, on_hold: 0, manual: 0, shipped: 0, cancelled: 0, packed: 0, click_and_collect: 0 }
    for (const o of orders) {
      if (!locMatch(o)) continue
      c.all++
      // An order that hasn't been PAID isn't ready to ship — keep it out of the
      // Awaiting Shipment queue (and its count). It still counts under All Orders.
      const bucket = displayStatus(o)
      c[bucket] = (c[bucket] || 0) + 1
      if (isAlerted(o)) c.alerts++
    }
    return c
  }, [orders, locMatch, isAlerted])

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
    const tabDef = STATUS_TABS.find(t => t.key === tab) // once, not per row
    const rows = orders.filter((o: any) => {
      if (tab === 'alerts') { if (!isAlerted(o)) return false }
      else if (tab === 'awaiting_payment') { if (!isAwaitingPayment(o)) return false }
      else if (tabDef?.match) { if (!tabDef.match.includes(o.status)) return false }
      // Unpaid orders aren't shippable — they live under Awaiting Payment, not
      // the Awaiting Shipment queue.
      if (tab === 'awaiting_shipment' && isAwaitingPayment(o)) return false
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
    // `rows` is already a fresh array from filter(), so sort it in place.
    rows.sort((a: any, b: any) => {
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
  }, [orders, tab, debouncedSearch, fStore, fAssignee, fTag, fDate, saved, sortCol, sortDir, locMatch, hayIndex, isAlerted])

  useEffect(() => { setPage(0); setSelected(new Set()) }, [tab, debouncedSearch, fStore, fAssignee, fTag, fDate, saved])
  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize)
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))

  // ── Mutations ──────────────────────────────────────────────────────────────
  const patchOrder = async (ids: string[], patch: any, event?: { type: string; detail: string }) => {
    setOrders(os => os.map(o => ids.includes(o.id) ? { ...o, ...patch } : o))
    // Analytics: emit named fulfilment events from the one choke point every
    // status/assign/outlet change flows through (bulk toolbar AND single-order
    // drawer), so the funnel/throughput dashboards see them uniformly. No-op
    // unless PostHog is configured; never throws.
    const n = ids.length
    if (patch.status) track('order_status_set', { status: patch.status, count: n, bulk: n > 1 })
    if ('assignee_id' in patch) track('order_assigned', { count: n, unassign: !patch.assignee_id })
    if ('store_location_id' in patch) track('order_outlet_assigned', { count: n })
    try {
      await (supabase as any).from('orders').update({ ...patch, updated_at: new Date().toISOString() }).in('id', ids)
      if (patch.status) ids.forEach(id => notifyIntegrations('order.status_changed', { id }))
      if (event && companyId) {
        await (supabase as any).from('order_events').insert(ids.map(id => ({ order_id: id, company_id: companyId, type: event.type, detail: event.detail, actor_id: me.id, actor_name: me.name })))
      }
    } catch {}
  }
  const setStatus = (ids: string[], status: string) => patchOrder(ids, { status, ...(status === 'shipped' ? { shipped_at: new Date().toISOString(), fulfilment_status: 'fulfilled' } : {}) }, { type: status === 'shipped' ? 'shipped' : status === 'packed' ? 'packed' : 'status_changed', detail: `Status set to ${statusMeta(status).label}` })
  const assign = (ids: string[], userId: string | null) => patchOrder(ids, { assignee_id: userId, assignee_name: teamName(userId) }, { type: 'assigned', detail: userId ? `Assigned to ${teamName(userId)}` : 'Unassigned' })
  const outletName = (id: string | null) => locations.find(l => l.id === id)?.name || null
  const setDefaultOutletPref = (id: string | null) => {
    setDefaultOutlet(id); setFStore(id || 'all')
    if (companyId && me.id) authFetch('/api/user-prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: me.id, companyId, key: 'default_outlet', value: { id } }) }).catch(() => {})
  }
  const setDefaultStatusPref = (key: string | null) => {
    setDefaultStatus(key); if (key) setTab(key)
    if (companyId && me.id) authFetch('/api/user-prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: me.id, companyId, key: 'default_status', value: { key } }) }).catch(() => {})
  }
  // Saved views — a named combination of filters (like ShipStation).
  const persistViews = (views: { id: string; name: string; f: any }[]) => {
    setSavedViews(views)
    if (companyId && me.id) authFetch('/api/user-prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: me.id, companyId, key: 'order_views', value: { views } }) }).catch(() => {})
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
  // How many orders each status chip holds (scoped to the Location filter).
  const countFor = (t: { key: string; match?: string[] }) => t.key === 'all' ? counts.all : t.key === 'alerts' ? counts.alerts : t.key === 'awaiting_payment' ? (counts.awaiting_payment || 0) : (t.match || []).reduce((n: number, s: string) => n + (counts[s] || 0), 0)
  const tabLabel = (key: string | null) => sentence(STATUS_TABS.find(t => t.key === key)?.label || '')
  const thisYear = new Date().getFullYear()
  const fmtDate = (d?: string | null) => {
    if (!d) return '—'
    const t = new Date(d); if (isNaN(t.getTime())) return '—'
    return t.toLocaleString('en-AU', { day: 'numeric', month: 'short', ...(t.getFullYear() !== thisYear ? { year: 'numeric' } : {}), hour: 'numeric', minute: '2-digit' })
  }
  const locLabel = fStore === 'all' ? 'All stores' : fStore === 'unassigned' ? 'Unassigned' : (locations.find(l => l.id === fStore)?.name || 'All stores')
  const viewName = savedViews.find(v => v.id === activeView)?.name
  const filtersOn = tab !== 'all' || !!search || fStore !== 'all' || fAssignee !== 'all' || fTag !== 'all' || fDate !== 'all' || !!saved
  const clearFilters = () => { setTab('all'); setSearch(''); setFStore('all'); setFAssignee('all'); setFTag('all'); setFDate('all'); setSaved(''); setActiveView(null) }
  const stats = [
    { key: 'all', label: 'All orders', n: counts.all, color: '#18181b', icon: 'box' as const },
    { key: 'awaiting_shipment', label: 'Awaiting shipment', n: (counts.awaiting_shipment || 0) + (counts.packed || 0) + (counts.click_and_collect || 0), color: ACCENT, icon: 'clock' as const },
    { key: 'on_hold', label: 'On hold', n: counts.on_hold || 0, color: '#d97706', icon: 'pause' as const },
    { key: 'shipped', label: 'Shipped', n: counts.shipped || 0, color: '#16a34a', icon: 'truck' as const },
    { key: 'alerts', label: 'Alerts', n: counts.alerts || 0, color: '#dc2626', icon: 'alert' as const },
  ]
  const cols: [string, string][] = [['order_number', 'Order'], ['age', 'Age'], ['order_date', 'Date'], ['customer', 'Customer'], ['items', 'Items'], ['sku', 'SKU'], ['shipping', 'Shipping'], ['status', 'Status'], ['assignee', 'Assignee'], ['total', 'Total'], ['ind', '']]

  if (loading) return <div style={{ padding: 24, color: 'var(--slate)', display: 'flex', gap: 8 }}><div style={{ width: 18, height: 18, border: '2px solid var(--border)', borderTopColor: ACCENT, borderRadius: '50%', animation: 'ospin .8s linear infinite' }} /><style>{`@keyframes ospin{to{transform:rotate(360deg)}}`}</style>Loading orders…</div>

  const selCount = selected.size
  const drawerOrder = orders.find(o => o.id === drawerId) || null

  return (
    <div className="ord-page" style={{ ['--ord-accent' as any]: ACCENT }}>
      <style>{`@keyframes ospin{to{transform:rotate(360deg)}} .tag-opt:hover{background:var(--canvas)} .ord-item:hover{background:var(--canvas)} .ord-note-actions{opacity:0;transition:opacity .12s} .ord-note:hover .ord-note-actions{opacity:1}
        @keyframes ordFade{from{opacity:0}to{opacity:1}}
        @keyframes ordPop{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes ordMenuIn{from{opacity:0;transform:translateY(-4px) scale(.98)}to{opacity:1;transform:none}}
        .ord-page { padding: 26px 28px 28px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }

        /* Header */
        .ord-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
        .ord-head h1 { margin: 0; font-size: 30px; font-weight: 800; letter-spacing: -0.025em; line-height: 1.1; color: var(--ink); }
        .ord-head p { margin: 6px 0 0; font-size: 14px; color: #71717a; }
        .ord-actions { display: flex; gap: 8px; }
        .ord-primary { background: var(--ord-accent); border-color: transparent; color: #fff; box-shadow: inset 0 1px 0 rgba(255,255,255,.22), 0 1px 2px rgba(16,24,40,.12); }
        .ord-primary svg { color: currentColor; }
        .ord-primary:hover { background: var(--ord-accent); border-color: transparent; filter: brightness(.95); }
        .ord-count { min-width: 20px; height: 20px; padding: 0 6px; box-sizing: border-box; border-radius: 999px; background: var(--ord-accent); color: #fff; font-size: 11.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }

        /* Stat cards — each one is also a shortcut to its status */
        .ord-stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
        .ord-stat { display: flex; align-items: center; gap: 14px; padding: 16px 18px; border-radius: 20px; border: 1.5px solid transparent; background: var(--card, #fff); box-shadow: 0 0 0 1px rgba(0,0,0,.05), 0 1px 2px rgba(16,24,40,.04); font: inherit; text-align: left; cursor: pointer; transition: box-shadow .15s ease, border-color .15s ease, transform .1s ease; }
        .ord-stat::before { display: none; }
        .ord-stat:hover { box-shadow: 0 0 0 1px rgba(0,0,0,.08), 0 6px 18px rgba(16,24,40,.07); }
        .ord-stat:active { transform: scale(.99); }
        .ord-stat.on { border-color: var(--ink); box-shadow: none; }
        .ord-stat:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--ord-accent) 28%, transparent); }
        .ord-stat-ic { width: 42px; height: 42px; border-radius: 14px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--c) 10%, #fff); color: var(--c); }
        .ord-stat-l { display: block; font-size: 13px; font-weight: 500; color: #71717a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ord-stat-n { display: block; margin-top: 2px; font-size: 26px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; color: var(--ink); font-variant-numeric: tabular-nums; }

        /* The list card */
        .ord-card { border-radius: 22px; background: var(--card, #fff); box-shadow: 0 0 0 1px rgba(0,0,0,.05), 0 1px 2px rgba(16,24,40,.04); }
        .ord-tools { padding: 16px 18px 14px; display: flex; flex-direction: column; gap: 12px; border-bottom: 1px solid #f0f0f2; }
        .ord-row1, .ord-row2 { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .ord-chips { display: flex; align-items: center; gap: 6px; overflow-x: auto; scrollbar-width: none; min-width: 0; flex: 1; padding: 1px; }
        .ord-chips::-webkit-scrollbar { display: none; }
        .ord-chip { flex-shrink: 0; height: 32px; display: inline-flex; align-items: center; gap: 7px; padding: 0 12px; border: none; border-radius: 999px; background: #f4f4f5; color: #52525b; font: inherit; font-size: 13.5px; font-weight: 600; white-space: nowrap; cursor: pointer; transition: background .15s ease, color .15s ease; }
        .ord-chip::before { display: none; }
        .ord-chip:hover { background: #ececef; color: #18181b; }
        .ord-chip.on { background: #18181b; color: #fff; }
        .ord-chip-n { min-width: 18px; height: 18px; padding: 0 6px; box-sizing: border-box; border-radius: 999px; background: #fff; color: #52525b; font-size: 11.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; font-variant-numeric: tabular-nums; }
        .ord-chip.on .ord-chip-n { background: rgba(255,255,255,.18); color: #fff; }
        .ord-chip-star { color: #f59e0b; font-size: 12px; line-height: 1; margin-left: -2px; }
        .ord-search-wrap { position: relative; flex: 1 1 240px; min-width: 180px; max-width: 380px; }
        .ord-search-wrap > svg { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: #a1a1aa; pointer-events: none; }
        .ord-search { width: 100%; box-sizing: border-box; height: 38px; padding: 0 34px 0 38px; border: 1.5px solid transparent; border-radius: 999px; background: #f4f4f5; font: inherit; font-size: 14px; color: var(--ink); outline: none; transition: background .15s ease, border-color .15s ease, box-shadow .15s ease; }
        .ord-search::placeholder { color: #a1a1aa; }
        .ord-search:focus { background: #fff; border-color: #d4d4d8; box-shadow: 0 0 0 3px color-mix(in srgb, var(--ord-accent) 16%, transparent); }
        .ord-search-x { position: absolute; right: 7px; top: 50%; transform: translateY(-50%); width: 24px; height: 24px; border: none; border-radius: 999px; background: #e4e4e7; color: #52525b; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
        .ord-search-x::before { display: none; }
        .ord-pill, .ord-select { flex-shrink: 0; height: 38px; display: inline-flex; align-items: center; gap: 7px; padding: 0 14px; border: none; border-radius: 999px; background: #f4f4f5; color: #18181b; font: inherit; font-size: 13.5px; font-weight: 600; white-space: nowrap; cursor: pointer; transition: background .15s ease, color .15s ease; }
        .ord-pill::before { display: none; }
        .ord-pill > svg { color: #71717a; flex-shrink: 0; }
        .ord-pill:hover, .ord-select:hover, .ord-pill[aria-expanded="true"] { background: #ececef; }
        .ord-pill.set, .ord-select.set { background: color-mix(in srgb, var(--ord-accent) 12%, #fff); color: color-mix(in srgb, var(--ord-accent) 85%, #000); }
        .ord-pill.set > svg { color: currentColor; }
        .ord-pill .cv-chev { margin-right: -3px; }
        .ord-pill.danger { background: #fef2f2; color: #dc2626; }
        .ord-pill.danger > svg { color: currentColor; }
        .ord-pill.danger:hover { background: #fee2e2; }
        .ord-pill.dark { background: #18181b; color: #fff; }
        .ord-pill.dark > svg { color: currentColor; }
        .ord-pill.dark:hover { background: #2a2a2e; }
        .ord-select { appearance: none; -webkit-appearance: none; padding-right: 34px; outline: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 12px center; background-size: 14px; }
        .ord-pill:focus-visible, .ord-select:focus-visible, .ord-chip:focus-visible, .ord-icon:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--ord-accent) 28%, transparent); }
        .ord-icon { flex-shrink: 0; width: 38px; height: 38px; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: none; border-radius: 999px; background: transparent; color: #52525b; cursor: pointer; transition: background .15s ease, color .15s ease; }
        .ord-icon::before { display: none; }
        .ord-icon:hover { background: #f4f4f5; color: #18181b; }
        .ord-icon:disabled { opacity: .4; cursor: default; background: transparent; }
        .ord-icon.on { color: #f59e0b; }
        .ord-spin { animation: ospin .9s linear infinite; }
        .ord-row2 { align-items: flex-start; }
        .ord-row2-rest { display: flex; align-items: center; gap: 8px; flex: 1 1 auto; min-width: 0; flex-wrap: wrap; }
        .ord-push { margin-left: auto; display: flex; align-items: center; gap: 4px; }
        .ord-select.w-assignee { width: 170px; text-overflow: ellipsis; }
        .ord-select.w-date { width: 140px; }
        .ord-pill-t { max-width: 190px; overflow: hidden; text-overflow: ellipsis; }
        .ord-sync:disabled { opacity: 1; }
        .ord-oos svg { color: #dc2626; }
        .ord-m { display: none; }
        .ord-menu-row .ord-switch { padding: 0; margin-right: 4px; }
        .ord-sep { width: 1px; height: 22px; background: #e4e4e7; flex-shrink: 0; margin: 0 2px; }
        .ord-switch { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; font-size: 13.5px; font-weight: 600; color: #52525b; cursor: pointer; user-select: none; white-space: nowrap; padding: 0 4px; }
        .ord-switch i { position: relative; width: 34px; height: 20px; border-radius: 999px; background: #d4d4d8; transition: background .18s ease; flex-shrink: 0; }
        .ord-switch i::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.2); transition: transform .18s cubic-bezier(.22,1,.36,1); }
        .ord-switch input { position: absolute; opacity: 0; pointer-events: none; }
        .ord-switch input:checked + i { background: var(--ord-accent); }
        .ord-switch input:checked + i::after { transform: translateX(14px); }
        .ord-switch input:focus-visible + i { box-shadow: 0 0 0 3px color-mix(in srgb, var(--ord-accent) 28%, transparent); }
        .ord-selbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .ord-selbar b { font-size: 14px; font-weight: 700; color: var(--ink); margin-right: 4px; }
        .ord-link { background: none; border: none; padding: 0; font: inherit; font-size: 13.5px; font-weight: 600; color: var(--ord-accent); cursor: pointer; }
        .ord-link::before { display: none; }

        /* Menus */
        .ord-pop { position: relative; flex-shrink: 0; }
        .ord-menu { position: absolute; top: calc(100% + 6px); left: 0; z-index: 4501; min-width: 230px; max-height: 340px; overflow-y: auto; padding: 6px; border-radius: 16px; background: var(--card, #fff); box-shadow: 0 16px 44px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.05); transform-origin: top left; animation: ordMenuIn .18s cubic-bezier(.22,1,.36,1); }
        .ord-menu.right { left: auto; right: 0; transform-origin: top right; }
        .ord-menu-h { padding: 6px 10px 6px; font-size: 12.5px; font-weight: 500; color: #8e8e93; }
        .ord-menu-row { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 36px; padding: 0 6px 0 10px; margin-bottom: 2px; border: none; border-radius: 10px; background: none; font: inherit; font-size: 14px; color: var(--ink); text-align: left; cursor: pointer; box-sizing: border-box; }
        .ord-menu-row::before { display: none; }
        .ord-menu-row:last-child { margin-bottom: 0; }
        .ord-menu-row:hover { background: #f7f7f8; }
        .ord-menu-row.cur { background: #efeff1; font-weight: 650; }
        .ord-menu-row > svg { color: #71717a; flex-shrink: 0; }
        .ord-menu-row .grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 8px 0; }
        .ord-menu-row .sub { display: block; font-size: 12px; font-weight: 400; color: #8e8e93; margin-top: 1px; }
        .ord-menu-row.accent { color: var(--ord-accent); font-weight: 600; }
        .ord-menu-row.accent > svg { color: currentColor; }
        .ord-menu-tool { flex-shrink: 0; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border: none; border-radius: 999px; background: none; color: #a1a1aa; cursor: pointer; padding: 0; font-size: 14px; line-height: 1; }
        .ord-menu-tool::before { display: none; }
        .ord-menu-tool:hover { background: #e4e4e7; color: #18181b; }
        .ord-menu-tool.on { color: #f59e0b; }
        .ord-menu-sep { height: 1px; background: #f0f0f2; margin: 4px 6px 6px; }
        .ord-menu-empty { padding: 8px 10px 10px; font-size: 13px; color: #8e8e93; }

        /* Table */
        .ord-scrollbox { overflow: auto; max-height: max(420px, calc(100vh - 56px - var(--admin-banners-h, 0px) - 380px)); }
        .ord-table { width: 100%; border-collapse: collapse; min-width: 1000px; }
        .ord-table th { position: sticky; top: 0; z-index: 1; padding: 11px 12px; background: var(--card, #fff); border-bottom: 1px solid #f0f0f2; font-size: 12.5px; font-weight: 500; color: #8e8e93; text-align: left; white-space: nowrap; user-select: none; }
        .ord-table th:first-child, .ord-table td:first-child { padding-left: 20px; }
        .ord-table th:last-child, .ord-table td:last-child { padding-right: 18px; }
        .ord-table th.sort { cursor: pointer; }
        .ord-table th.sort:hover { color: #18181b; }
        .ord-table th.sorted { color: #18181b; }
        .ord-th { display: inline-flex; align-items: center; gap: 4px; }
        .ord-table td { padding: 12px; font-size: 13.5px; color: var(--ink); white-space: nowrap; border-bottom: 1px solid #f4f4f5; }
        .ord-table tbody tr:last-child td { border-bottom: none; }
        .ord-row { cursor: pointer; transition: background .12s ease; }
        .ord-row:hover { background: #fafafa; }
        .ord-row.cc { background: color-mix(in srgb, #3b82f6 5%, transparent); }
        .ord-row.sel { background: color-mix(in srgb, var(--ord-accent) 6%, transparent); }
        .ord-row.open { background: color-mix(in srgb, var(--ord-accent) 10%, transparent); }
        .ord-check { width: 16px; height: 16px; margin: 0; accent-color: #18181b; cursor: pointer; vertical-align: middle; }
        .ord-num { font-weight: 650; }
        .ord-num span { color: #a1a1aa; font-weight: 500; }
        .ord-age { display: inline-flex; align-items: center; gap: 7px; font-weight: 600; }
        .ord-age::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
        .ord-muted { color: #71717a; }
        .ord-tag { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px 0 9px; border-radius: 999px; background: color-mix(in srgb, var(--tag) 10%, #fff); color: color-mix(in srgb, var(--tag) 88%, #000); font-size: 12.5px; font-weight: 600; line-height: 1; white-space: nowrap; }
        .ord-tag::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--tag); flex-shrink: 0; }
        .ord-empty { padding: 28px 12px 36px; white-space: normal; }
                .ord-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 12px 18px 14px; border-top: 1px solid #f0f0f2; }
        .ord-foot-l { font-size: 13.5px; color: #71717a; }
        .ord-foot-r { display: flex; align-items: center; gap: 4px; }
        .ord-foot-r .pg { font-size: 13.5px; font-weight: 600; color: var(--ink); padding: 0 6px; font-variant-numeric: tabular-nums; }

        @media (max-width: 1100px) {
          .ord-stats { grid-template-columns: repeat(5, minmax(150px, 1fr)); overflow-x: auto; scrollbar-width: none; margin: 0 -28px 16px; padding: 2px 28px; }
          .ord-stats::-webkit-scrollbar { display: none; }
        }
        @media (max-width: 640px) {
          .ord-page { padding: 18px 16px 20px; }
          .ord-head { align-items: flex-start; margin-bottom: 16px; }
          .ord-head h1 { font-size: 26px; }
          .ord-actions { width: 100%; }
          .ord-actions > :not(.ord-sync):not(.ord-oos) { flex: 1 1 0; }
          .ord-oos { width: 38px; padding: 0; }
          .ord-oos-t { display: none; }
          .ord-stats { margin: 0 -16px 14px; padding: 2px 16px; grid-template-columns: repeat(5, 148px); }
          .ord-stat { flex-direction: column; align-items: flex-start; padding: 13px 14px; gap: 10px; border-radius: 18px; }
          .ord-stat-ic { width: 36px; height: 36px; border-radius: 12px; }
          .ord-stat-n { font-size: 22px; }
          .ord-card { border-radius: 20px; }
          .ord-tools { padding: 14px 14px 12px; }
          .ord-row2 { flex-wrap: wrap; }
          .ord-search-wrap { flex: 1 1 100%; max-width: none; }
          .ord-row2-rest { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; flex: 1 1 100%; margin: 0 -14px; padding: 0 14px; }
          .ord-row2-rest::-webkit-scrollbar { display: none; }
          .ord-row2-rest .ord-sep { display: none; }
          .ord-push { margin-left: 0 !important; }
          .ord-menu { position: fixed; top: auto !important; bottom: 12px; left: 12px !important; right: 12px !important; max-height: 60vh; }
          .ord-foot { padding: 12px 14px; }
          .ord-scrollbox { max-height: none; overflow: visible; }
          .ord-table { min-width: 0; }
          .ord-table thead { display: none; }
          .ord-table td:not(:first-child):not(.ord-m) { display: none; }
          .ord-table td:first-child { padding: 14px 4px 14px 14px; vertical-align: top; width: 1%; }
          .ord-table td.ord-empty-td { width: auto; padding: 0; }
          .ord-table td.ord-m { display: table-cell; padding: 12px 14px 12px 8px; white-space: normal; }
          .ord-m-top, .ord-m-mid { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-width: 0; }
          .ord-m-top { font-size: 14px; }
          .ord-m-top .ord-age { font-size: 12.5px; margin-left: 8px; }
          .ord-m-mid { margin-top: 5px; }
          .ord-m-name { font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .ord-m-sub { display: flex; align-items: center; gap: 6px; margin-top: 5px; font-size: 12.5px; color: #71717a; min-width: 0; }
          .ord-m-sub > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        }
        @media (prefers-reduced-motion: reduce) { .ord-menu { animation: none; } }`}</style>

      {/* Header */}
      <div className="ord-head">
        <div>
          <h1>Orders</h1>
          <p>Manage and fulfil customer orders{syncing ? ' · syncing…' : ''}</p>
        </div>
        <div className="ord-actions">
          <button type="button" className="cv-btn cv-btn-icon ord-sync" onClick={() => runSync(companyId!, true)} disabled={syncing} title={syncing ? 'Syncing…' : 'Sync every order from the store'} aria-label="Sync orders">
            <OrdIcon name="refresh" size={17} className={syncing ? 'ord-spin' : undefined} />
          </button>
          <button type="button" className="cv-btn ord-oos" onClick={() => setShowOOS(true)} title="Items flagged out of stock across all orders" aria-label="Out of stock list">
            <OrdIcon name="alert" size={16} /><span className="ord-oos-t">Out of stock</span>
          </button>
          <button type="button" onClick={() => setShowDrafts(true)} className="cv-btn" title="Draft orders saved to finish later">
            <OrdIcon name="file" size={16} />
            Drafts
            {draftCount > 0 && <span className="ord-count">{draftCount}</span>}
          </button>
          <button type="button" onClick={() => { setOpenDraft(null); setShowCreateOrder(true) }} className="cv-btn ord-primary">
            <OrdIcon name="plus" size={16} />
            Create order
          </button>
        </div>
      </div>

      {/* Stats — click one to show just those orders */}
      <div className="ord-stats">
        {stats.map(st => (
          <button key={st.key} type="button" className={`ord-stat${tab === st.key ? ' on' : ''}`} aria-pressed={tab === st.key}
            onClick={() => setTab(tab === st.key && st.key !== 'all' ? 'all' : st.key)} title={`Show ${st.label.toLowerCase()}`}>
            <span className="ord-stat-ic" style={{ ['--c' as any]: st.color }}><OrdIcon name={st.icon} size={19} /></span>
            <span style={{ minWidth: 0 }}>
              <span className="ord-stat-l">{st.label}</span>
              <span className="ord-stat-n">{st.n.toLocaleString('en-AU')}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="ord-card">
        <div className="ord-tools">
          {/* Status chips. Right-click one (or use the star) to make it your default. */}
          <div className="ord-row1">
            <div className="ord-chips" role="tablist" aria-label="Order status">
              {STATUS_TABS.map(t => {
                const on = tab === t.key
                return (
                  <button key={t.key} type="button" role="tab" aria-selected={on} className={`ord-chip${on ? ' on' : ''}`}
                    onClick={() => setTab(t.key)}
                    onContextMenu={e => { e.preventDefault(); setDefaultStatusPref(defaultStatus === t.key ? null : t.key) }}
                    title={defaultStatus === t.key ? 'Your default · right-click to clear' : 'Right-click to make this your default'}>
                    {sentence(t.label)}
                    <span className="ord-chip-n">{countFor(t).toLocaleString('en-AU')}</span>
                    {defaultStatus === t.key && <span className="ord-chip-star" aria-label="Default">★</span>}
                  </button>
                )
              })}
            </div>
            <button type="button" className={`ord-icon${defaultStatus === tab ? ' on' : ''}`} aria-pressed={defaultStatus === tab}
              onClick={() => setDefaultStatusPref(defaultStatus === tab ? null : tab)}
              title={defaultStatus === tab ? `“${tabLabel(tab)}” opens first · click to clear` : `Open on “${tabLabel(tab)}” next time`}
              aria-label={defaultStatus === tab ? 'Clear default status' : 'Make this status my default'}>
              <OrdIcon name="star" size={17} fill={defaultStatus === tab} />
            </button>
          </div>

          {selCount > 0 ? (
            <div className="ord-selbar">
              <b>{selCount} selected</b>
              {/* Selection is per-page; let staff extend it to the whole filtered
                  queue so a bulk action isn't capped at one page of results. */}
              {selCount < filtered.length && pageRows.length > 0 && pageRows.every(o => selected.has(o.id)) && (
                <button type="button" className="ord-link" onClick={() => setSelected(new Set(filtered.map(o => o.id)))}>Select all {filtered.length}</button>
              )}
              {selCount === filtered.length && filtered.length > pageSize && <span className="ord-muted" style={{ fontSize: 13 }}>· all in filter</span>}
              <span className="ord-sep" />
              <button type="button" className="ord-pill dark" onClick={() => openPrint('packing_slip', [...selected])}><OrdIcon name="file" size={15} />Packing slips</button>
              <button type="button" className="ord-pill" onClick={() => openPrint('label', [...selected])}><OrdIcon name="printer" size={15} />Print labels</button>
              <select className="ord-select" aria-label="Assign" value="" onChange={e => { if (e.target.value) { assign([...selected], e.target.value === 'none' ? null : e.target.value); setSelected(new Set()) } }}>
                <option value="">Assign…</option>
                <option value="none">Unassign</option>
                {team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {locations.length > 0 && (
                <select className="ord-select" aria-label="Assign outlet" value="" onChange={e => { if (e.target.value) { assignOutlet([...selected], e.target.value === 'none' ? null : e.target.value); setSelected(new Set()) } }}>
                  <option value="">{locations.find(l => l.id === fStore) ? `Outlet: ${locations.find(l => l.id === fStore)!.name}` : 'Assign outlet…'}</option>
                  {locations.find(l => l.id === fStore) && <option value={fStore}>✓ Assign to {locations.find(l => l.id === fStore)!.name}</option>}
                  <option value="none">No outlet</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              )}
              <div className="ord-pop">
                <button type="button" className="ord-pill" aria-expanded={tagMenuOpen} onClick={() => setTagMenuOpen(v => !v)}><OrdIcon name="tag" size={15} />Tag<OrdIcon name="chev" size={14} className="cv-chev" /></button>
                {tagMenuOpen && (
                  <TagApplyMenu tagDefs={tagDefs} selectedOrders={orders.filter(o => selected.has(o.id))} accent={ACCENT}
                    onClose={() => setTagMenuOpen(false)}
                    onToggle={(t: string, on: boolean) => applyTagToSelected([...selected], t, on)}
                    onCreate={async (name: string, color?: string) => { await ensureTagDef(name, color); await applyTagToSelected([...selected], name, true) }}
                    onManage={() => { setTagMenuOpen(false); setManageTagsOpen(true) }} />
                )}
              </div>
              <select className="ord-select" aria-label="Update status" value="" onChange={e => { if (e.target.value) { setStatus([...selected], e.target.value); setSelected(new Set()) } }}>
                <option value="">Update status…</option>
                <option value="awaiting_shipment">Awaiting shipment</option>
                <option value="packed">Packed</option>
                <option value="on_hold">On hold</option>
                <option value="shipped">Shipped</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button type="button" className="ord-pill" onClick={() => flash('Allocation arrives with the inventory phase.')}>Allocate</button>
              <button type="button" className="ord-icon" onClick={() => setSelected(new Set())} title="Clear selection" aria-label="Clear selection"><OrdIcon name="x" size={17} /></button>
            </div>
          ) : (
            <div className="ord-row2">
              <div className="ord-search-wrap">
                <OrdIcon name="search" size={16} />
                <input className="ord-search" value={search} onFocus={ensureItemIndex} onChange={e => { ensureItemIndex(); setSearch(e.target.value) }} placeholder="Order #, name, phone, email, address, SKU, product…" aria-label="Search orders" />
                {search && <button type="button" className="ord-search-x" onClick={() => setSearch('')} title="Clear search" aria-label="Clear search"><OrdIcon name="x" size={13} /></button>}
              </div>
              <div className="ord-row2-rest">
                {locations.length > 0 && (
                  <div className="ord-pop">
                    <button type="button" className={`ord-pill${fStore !== 'all' ? ' set' : ''}`} aria-expanded={locMenuOpen} onClick={() => setLocMenuOpen(v => !v)}>
                      <OrdIcon name="pin" size={15} /><span className="ord-pill-t">{locLabel}</span><OrdIcon name="chev" size={14} className="cv-chev" />
                    </button>
                    {locMenuOpen && (
                      <>
                        <div onClick={() => setLocMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 4500 }} />
                        <div className="ord-menu" style={{ minWidth: 280 }}>
                          <div className="ord-menu-h">Location · ☆ sets your default</div>
                          <button type="button" className={`ord-menu-row${fStore === 'all' ? ' cur' : ''}`} onClick={() => { setFStore('all'); setLocMenuOpen(false) }}>
                            <OrdIcon name="store" size={16} /><span className="grow">All stores</span>
                          </button>
                          <button type="button" className={`ord-menu-row${fStore === 'unassigned' ? ' cur' : ''}`} onClick={() => { setFStore('unassigned'); setLocMenuOpen(false) }}>
                            <OrdIcon name="inbox" size={16} /><span className="grow">Unassigned<span className="sub">Not assigned to an outlet yet</span></span>
                          </button>
                          <div className="ord-menu-sep" />
                          {locations.map(l => {
                            const isDefault = defaultOutlet === l.id
                            return (
                              <div key={l.id} role="button" tabIndex={0} className={`ord-menu-row${fStore === l.id ? ' cur' : ''}`}
                                onClick={() => { setFStore(l.id); setLocMenuOpen(false) }}
                                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFStore(l.id); setLocMenuOpen(false) } }}>
                                <OrdIcon name="pin" size={16} /><span className="grow">{l.name}</span>
                                <button type="button" className={`ord-menu-tool${isDefault ? ' on' : ''}`} title={isDefault ? 'Clear default outlet' : 'Set as my default outlet'} aria-label={isDefault ? 'Clear default outlet' : 'Set as my default outlet'}
                                  onClick={e => { e.stopPropagation(); setDefaultOutletPref(isDefault ? null : l.id) }}>{isDefault ? '★' : '☆'}</button>
                              </div>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
                <select className={`ord-select w-assignee${fAssignee !== 'all' ? ' set' : ''}`} aria-label="Assignee" value={fAssignee} onChange={e => setFAssignee(e.target.value)}>
                  <option value="all">Any assignee</option><option value="none">Unassigned</option>{team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <div className="ord-pop">
                  <button type="button" className={`ord-pill${fTag !== 'all' ? ' set' : ''}`} aria-expanded={tagFilterOpen} onClick={() => setTagFilterOpen(v => !v)}>
                    <OrdIcon name="tag" size={15} /><span className="ord-pill-t">{fTag === 'all' ? 'Any tag' : fTag}</span><OrdIcon name="chev" size={14} className="cv-chev" />
                  </button>
                  {tagFilterOpen && (
                    <>
                      <div onClick={() => setTagFilterOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 4500 }} />
                      <div className="ord-menu">
                        <button type="button" className={`ord-menu-row${fTag === 'all' ? ' cur' : ''}`} onClick={() => { setFTag('all'); setTagFilterOpen(false) }}>
                          <OrdIcon name="tag" size={16} /><span className="grow">Any tag</span>
                        </button>
                        {Array.from(new Set([...tagDefs.map(t => t.name), ...allTags])).map(t => (
                          <button key={t} type="button" className={`ord-menu-row${fTag === t ? ' cur' : ''}`} onClick={() => { setFTag(t); setTagFilterOpen(false) }}>
                            <span style={{ width: 16, display: 'inline-flex', justifyContent: 'center' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: tagColor(t) }} /></span>
                            <span className="grow">{t}</span>
                          </button>
                        ))}
                        <div className="ord-menu-sep" />
                        <button type="button" className="ord-menu-row" onClick={() => { setTagFilterOpen(false); setManageTagsOpen(true) }}>
                          <OrdIcon name="gear" size={16} /><span className="grow">Manage tags…</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <select className={`ord-select w-date${fDate !== 'all' ? ' set' : ''}`} aria-label="Date" value={fDate} onChange={e => setFDate(e.target.value)}>
                  <option value="all">All time</option><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option>
                </select>
                {/* Saved views — a named combination of filters (ShipStation-style) */}
                <div className="ord-pop">
                  <button type="button" className={`ord-pill${viewName ? ' set' : ''}`} aria-expanded={viewsMenuOpen} onClick={() => setViewsMenuOpen(v => !v)}>
                    <OrdIcon name="bookmark" size={15} /><span className="ord-pill-t">{viewName || 'Views'}</span><OrdIcon name="chev" size={14} className="cv-chev" />
                  </button>
                  {viewsMenuOpen && (
                    <>
                      <div onClick={() => setViewsMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 4500 }} />
                      <div className="ord-menu" style={{ minWidth: 250 }}>
                        <div className="ord-menu-h">Saved views</div>
                        {savedViews.length === 0 && <div className="ord-menu-empty">None yet. Save the filters you use most.</div>}
                        {savedViews.map(v => (
                          <div key={v.id} role="button" tabIndex={0} className={`ord-menu-row${activeView === v.id ? ' cur' : ''}`}
                            onClick={() => { applyView(v); setViewsMenuOpen(false) }}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applyView(v); setViewsMenuOpen(false) } }}>
                            <OrdIcon name="bookmark" size={16} /><span className="grow">{v.name}</span>
                            <button type="button" className="ord-menu-tool" title="Delete view" aria-label={`Delete view ${v.name}`}
                              onClick={async e => { e.stopPropagation(); if (await confirmDialog(`Delete view “${v.name}”?`)) deleteView(v.id) }}><OrdIcon name="x" size={14} /></button>
                          </div>
                        ))}
                        <div className="ord-menu-sep" />
                        <button type="button" className="ord-menu-row accent" onClick={() => { setViewsMenuOpen(false); saveView() }}>
                          <OrdIcon name="plus" size={16} /><span className="grow">Save current filters…</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <div className="ord-push">
                  {filtersOn && <button type="button" className="ord-link" onClick={clearFilters} style={{ padding: '0 6px', whiteSpace: 'nowrap' }}>Clear filters</button>}
                  <div className="ord-pop">
                    <button type="button" className="ord-icon" aria-expanded={displayMenuOpen} onClick={() => setDisplayMenuOpen(v => !v)} title="Display options" aria-label="Display options">
                      <OrdIcon name="sliders" size={17} />
                    </button>
                    {displayMenuOpen && (
                      <>
                        <div onClick={() => setDisplayMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 4500 }} />
                        <div className="ord-menu right" style={{ minWidth: 270 }}>
                          <label className="ord-menu-row" title="On: an order opens in a side panel. Off: it opens full screen.">
                            <OrdIcon name="panel" size={16} />
                            <span className="grow">Open orders in a side panel</span>
                            <span className="ord-switch"><input type="checkbox" checked={showSidebar} onChange={e => setSidebarPref(e.target.checked)} /><i /></span>
                          </label>
                          <button type="button" className="ord-menu-row" onClick={() => { setDisplayMenuOpen(false); setManageTagsOpen(true) }}>
                            <OrdIcon name="gear" size={16} /><span className="grow">Manage tags…</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="ord-scrollbox">
          <table className="ord-table">
            <thead>
              <tr>
                <th style={{ width: 34 }}><input type="checkbox" className="ord-check" aria-label="Select all on this page" checked={pageRows.length > 0 && pageRows.every(o => selected.has(o.id))} onChange={toggleAll} /></th>
                {cols.map(([key, label]) => {
                  const sortable = ['order_number', 'age', 'order_date', 'total'].includes(key)
                  const col = key === 'age' ? 'order_date' : key
                  const sorted = sortable && key !== 'age' && sortCol === col
                  return <th key={key} className={`${sortable ? 'sort' : ''}${sorted ? ' sorted' : ''}`} style={{ textAlign: key === 'total' ? 'right' : 'left' }}
                    aria-sort={sorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                    onClick={() => { if (!sortable) return; if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col as any); setSortDir('desc') } }}>
                    <span className="ord-th">{label}{sorted && <OrdIcon name={sortDir === 'asc' ? 'up' : 'down'} size={13} />}</span>
                  </th>
                })}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr><td colSpan={13} className="ord-empty-td" style={{ borderBottom: 'none' }}>
                  <div className="ord-empty">
                    {/* The same drifting cards as an empty inbox or ticket list. */}
                    <EmptyScroll kinds={['order']}
                      title={!orders.length ? 'No orders yet' : search.trim() ? 'No matches' : 'No orders match these filters'}
                      line={!orders.length ? 'Orders from your store show up here as they come in.' : search.trim() ? `Nothing matches “${search.trim()}”. Try an order number, name, phone or SKU.` : 'Try another status, or clear a filter to see more.'}
                      action={orders.length > 0 && filtersOn ? <button type="button" className="cv-btn" onClick={clearFilters}>Clear filters</button> : undefined} />
                  </div>
                </td></tr>
              )}
              {pageRows.map((o: any) => {
                const sm = statusMeta(displayStatus(o))
                const age = orderAge(o.order_date)
                const sel = selected.has(o.id)
                const cc = isClickCollect(o)
                return (
                  <tr key={o.id} className={`ord-row${drawerId === o.id ? ' open' : sel ? ' sel' : cc ? ' cc' : ''}`} onClick={() => openOrder(o.id)}>
                    <td onClick={e => { e.stopPropagation(); toggleOne(o.id) }}><input type="checkbox" className="ord-check" aria-label={`Select order ${o.order_number}`} checked={sel} onChange={() => {}} /></td>
                    <td className="ord-m">
                      <div className="ord-m-top"><span><span className="ord-num"><span>#</span>{o.order_number}</span><span className="ord-age" style={{ color: age.color }}>{age.label}</span></span><b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(o.total, o.currency)}</b></div>
                      <div className="ord-m-mid"><span className="ord-m-name">{o.customer_name || '—'}</span><span className="ord-tag" style={{ ['--tag' as any]: sm.fg }}>{sentence(sm.label)}</span></div>
                      <div className="ord-m-sub"><ChannelIcon channel={o.sales_channel} size={12} /><span>{cc ? 'Click & Collect' : (o.shipping_method || 'Free shipping')} · {o.item_count || 0} item{(o.item_count || 0) === 1 ? '' : 's'}{(o.assignee_name || teamName(o.assignee_id)) ? ` · ${o.assignee_name || teamName(o.assignee_id)}` : ''}</span></div>
                    </td>
                    <td className="ord-num"><span>#</span>{o.order_number}</td>
                    <td><span className="ord-age" style={{ color: age.color }}>{age.label}</span></td>
                    <td className="ord-muted">{fmtDate(o.order_date)}</td>
                    <td style={{ fontWeight: 600 }}>{o.customer_name || '—'}</td>
                    <td>{o.item_count || 0}</td>
                    <td className="ord-muted" style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.primary_sku || '—'}</td>
                    <td className="ord-muted">{cc
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#2563eb' }}><ClickCollectIcon size={14} />Click &amp; Collect</span>
                      : (Number(o.shipping_total) || 0) > 0 ? <span>{o.shipping_method || 'Shipping'} <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{fmtMoney(o.shipping_total, o.currency)}</span></span> : (o.shipping_method || 'Free')}</td>
                    <td><span className="ord-tag" style={{ ['--tag' as any]: sm.fg }}>{sentence(sm.label)}</span></td>
                    <td><Avatar name={o.assignee_name || teamName(o.assignee_id)} /></td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(o.total, o.currency)}</td>
                    <td><ChannelIcon channel={o.sales_channel} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="ord-foot">
          <span className="ord-foot-l">Showing {filtered.length === 0 ? 0 : page * pageSize + 1}–{Math.min(filtered.length, (page + 1) * pageSize)} of {filtered.length.toLocaleString('en-AU')}</span>
          <div className="ord-foot-r">
            <button type="button" className="ord-icon" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} aria-label="Previous page"><OrdIcon name="left" size={17} /></button>
            <span className="pg">Page {page + 1} of {totalPages}</span>
            <button type="button" className="ord-icon" disabled={page + 1 >= totalPages} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} aria-label="Next page"><OrdIcon name="right" size={17} /></button>
            <select className="ord-select" aria-label="Orders per page" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0) }} style={{ marginLeft: 6, height: 34 }}>{[25, 50, 100].map(n => <option key={n} value={n}>{n} per page</option>)}</select>
          </div>
        </div>
      </div>

      {toast && <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', background: 'var(--ink)', color: '#fff', padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 5000, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>{toast}</div>}

      {drawerOrder && !drawerOrder.__c && (
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
        <CreateOrderPanel key={openDraft?.id || 'new'} companyId={companyId} staffName={me.name} staffId={me.id || undefined}
          draft={openDraft} contactId={openDraft?.contact_id || undefined} conversationId={openDraft?.conversation_id || undefined}
          onClose={() => { setShowCreateOrder(false); setOpenDraft(null); setDraftBump(b => b + 1) }}
          onDraftSaved={() => setDraftBump(b => b + 1)}
          onCreated={() => { flash('Order created'); runSync(companyId); setDraftBump(b => b + 1) }} />
      )}

      {showDrafts && companyId && (
        <OrderDraftsPanel companyId={companyId} accent={ACCENT}
          onClose={() => setShowDrafts(false)}
          onChanged={() => setDraftBump(b => b + 1)}
          onOpen={d => { setShowDrafts(false); setOpenDraft(d); setShowCreateOrder(true) }} />
      )}

      {showOOS && companyId && (
        <OutOfStockModal companyId={companyId} accent={ACCENT} locations={locations}
          onClose={() => { setShowOOS(false); if (companyId) loadOos(companyId) }}
          onOpenOrder={(id: string) => openOrder(id)} />
      )}

      {saveViewName !== null && (
        <div onClick={() => setSaveViewName(null)} style={{ position: 'fixed', inset: 0, zIndex: 5200, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'ordFade .15s ease' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: 'var(--card,#fff)', borderRadius: 22, boxShadow: '0 24px 60px rgba(0,0,0,0.22)', padding: 24, animation: 'ordPop .18s cubic-bezier(.16,1,.3,1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 10, background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`, color: ACCENT }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
              </span>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--ink)' }}>Save this view</h3>
            </div>
            <p style={{ margin: '0 0 14px 44px', fontSize: 12.5, color: 'var(--slate)' }}>Give the current filters a name so you can jump back to them.</p>
            <input autoFocus value={saveViewName} onChange={e => setSaveViewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmSaveView(); else if (e.key === 'Escape') setSaveViewName(null) }}
              placeholder="e.g. Somerton — Backorder"
              className="ord-search" style={{ height: 42, padding: '0 16px', fontSize: 14.5 }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button type="button" className="cv-btn" onClick={() => setSaveViewName(null)}>Cancel</button>
              <button type="button" className="cv-btn ord-primary" onClick={confirmSaveView} disabled={!saveViewName.trim()}>Save view</button>
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
      <div style={{ position: 'absolute', top: 'calc(100% + 6px)', [align]: 0, zIndex: 4501, width: 240, background: 'var(--card, #fff)', borderRadius: 16, boxShadow: '0 16px 44px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.05)', padding: 6 }}>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && query) { onPick(query); onClose() } else if (e.key === 'Escape') onClose() }}
          placeholder="Find or create a tag…"
          style={{ width: '100%', height: 36, padding: '0 12px', borderRadius: 999, border: 'none', background: '#f4f4f5', fontSize: 13.5, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
        <div style={{ maxHeight: 214, overflowY: 'auto', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {filtered.map(t => (
            <button key={t} type="button" className="tag-opt" onClick={() => { onPick(t); onClose() }}
              style={{ display: 'flex', alignItems: 'center', gap: 9, minHeight: 34, textAlign: 'left', padding: '0 10px', borderRadius: 10, border: 'none', background: 'none', fontSize: 13.5, color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: hashColor(t), flexShrink: 0 }} />{t}
            </button>
          ))}
          {canCreate && (
            <button type="button" className="tag-opt" onClick={() => { onPick(query); onClose() }}
              style={{ display: 'flex', alignItems: 'center', minHeight: 34, textAlign: 'left', padding: '0 10px', borderRadius: 10, border: 'none', background: 'none', fontSize: 13.5, fontWeight: 600, color: accent, cursor: 'pointer', fontFamily: 'inherit' }}>
              + Create “{query}”
            </button>
          )}
          {!filtered.length && !canCreate && <span style={{ padding: '8px 10px', fontSize: 13, color: '#8e8e93' }}>No tags yet. Type a name to create one.</span>}
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
  const lbl: React.CSSProperties = { fontSize: 12.5, fontWeight: 500, color: '#8e8e93', display: 'block', marginBottom: 5 }
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
              <div style={{ fontSize: 12.5, fontWeight: 500, color: '#8e8e93' }}>Cost review</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.1 }}>{costLabel}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: '#8e8e93' }}>Est. arrival</div>
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
  // Print only once the documents (data and images) are ready. Pressing Print
  // earlier queues it: the print dialog opens the moment they are, instead of
  // printing the "Preparing documents…" placeholder.
  const [ready, setReady] = useState(false)
  const [queued, setQueued] = useState(false)
  useEffect(() => {
    if (!ready || !queued) return
    const t = setTimeout(() => { setQueued(false); try { window.print() } catch {} }, 50)
    return () => clearTimeout(t)
  }, [ready, queued])
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
          <button type="button" onClick={() => { if (ready) window.print(); else setQueued(true) }} aria-busy={!ready}
            style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: queued ? 'progress' : 'pointer', opacity: ready ? 1 : 0.75 }}>
            {ready ? 'Print' : queued ? 'Printing when ready…' : 'Preparing…'}
          </button>
          <button type="button" onClick={onClose} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
        </div>
        <div className="order-print-scroll" style={{ flex: 1, overflow: 'auto', background: '#f1f5f9' }}>
          <OrderPrintDoc doc={doc} companyId={companyId} ids={ids} onLoaded={() => setReady(true)} />
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
      <div className="ord-menu" style={{ width: 270, maxHeight: 'none', overflow: 'visible' }}>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && canCreate) { onCreate(query); setQ('') } else if (e.key === 'Escape') onClose() }}
          placeholder="Find or create a tag…" className="ord-search" style={{ height: 36, padding: '0 12px' }} />
        <div style={{ maxHeight: 240, overflowY: 'auto', marginTop: 6 }}>
          {list.map((t: any) => {
            const c = countWith(t.name); const all = n > 0 && c === n
            return (
              <button key={t.id} type="button" className="ord-menu-row" onClick={() => onToggle(t.name, !all)}>
                <input type="checkbox" readOnly tabIndex={-1} checked={all} ref={el => { if (el) el.indeterminate = c > 0 && !all }} className="ord-check" style={{ pointerEvents: 'none' }} />
                <span className="grow" style={{ display: 'flex' }}><TagChip name={t.name} color={t.color} /></span>
              </button>
            )
          })}
          {canCreate && (
            <button type="button" className="ord-menu-row accent" onClick={() => { onCreate(query); setQ('') }}>
              <OrdIcon name="plus" size={16} /><span className="grow">Create “{query}”</span></button>
          )}
          {!list.length && !canCreate && <div className="ord-menu-empty">No tags yet. Type a name to create one.</div>}
        </div>
        <div className="ord-menu-sep" />
        <button type="button" className="ord-menu-row" onClick={onManage}><OrdIcon name="gear" size={16} /><span className="grow">Manage tags…</span></button>
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
    if (!await confirmDialog(`Delete tag “${t.name}”? It will be removed from all orders.`)) return
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
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 500, color: '#8e8e93', padding: '10px 0 6px' }}><span>Name</span><span>Actions</span></div>
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
          <p style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 500, color: '#8e8e93' }}>Add a tag</p>
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
  // Coupon codes, discount and manual fees — not stored on the synced order row,
  // so fetched live from WooCommerce when the drawer opens (best-effort).
  const [financials, setFinancials] = useState<{ discount: number; coupons: string[]; fees: { name: string; total: number }[] } | null>(null)
  // The order's refunds (which items, shipping, general amounts), read live
  // from the store once we know there are any.
  const [refunds, setRefunds] = useState<OrderRefund[] | null>(null)
  const [pickMode, setPickMode] = useState(false)
  const [showRefund, setShowRefund] = useState(false)
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
          const r = await authFetch('/api/short-links/create', {
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

  // ── Store order actions (WooCommerce or Shopify) ──────────────────────────
  // The order routes take "shopify-<id>" for a Shopify order and act in Shopify.
  const isShopifyOrder = order.sales_channel === 'shopify'
  const storeRef = isShopifyOrder ? `shopify-${order.external_order_id}` : order.external_order_id
  const storeName = isShopifyOrder ? 'Shopify' : 'WooCommerce'
  const refundsAsked = useRef<string | null>(null)
  const orderIdRef = useRef(order.id)
  const loadRefunds = useCallback(async (force = false) => {
    if (!companyId || !order.external_order_id || (order.sales_channel !== 'woocommerce' && !isShopifyOrder)) return
    if (!force && refundsAsked.current === order.id) return
    refundsAsked.current = order.id
    const forOrder = order.id
    try {
      const res = await authFetch(`/api/orders/refunds?companyId=${encodeURIComponent(companyId)}&orderId=${encodeURIComponent(storeRef)}`)
      const j = await res.json().catch(() => ({}))
      if (res.ok && forOrder === orderIdRef.current) setRefunds(j.refunds || [])
    } catch { /* best-effort — the summary still shows the order */ }
  }, [companyId, order.id, order.external_order_id, order.sales_channel, isShopifyOrder, storeRef])
  // A refunded / partly refunded order loads its refunds straight away; a
  // WooCommerce order that stays "completed" after a partial refund is caught
  // by the live details read below.
  useEffect(() => {
    orderIdRef.current = order.id
    setRefunds(null)
    refundsAsked.current = null
    if (/refund/i.test(`${order.payment_status || ''} ${order.status || ''}`)) loadRefunds()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id])
  const refundedTotal = refunds ? refunds.reduce((s, r) => s + r.amount, 0) : Math.abs(Number(order.total_refunded) || 0)
  const markCompleted = async (opts: { allSent?: boolean } = {}) => {
    const ok = opts.allSent
      ? await confirmDialog({
          title: 'All items sent. Order completed?',
          message: isShopifyOrder
            ? `Mark order ${order.order_number} as completed? This marks it paid (if it isn't yet) and fulfilled in Shopify.`
            : `Mark order ${order.order_number} as completed in ${storeName}?`,
          confirmLabel: 'Yes, complete', cancelLabel: 'No', tone: 'primary',
        })
      : await confirmDialog(isShopifyOrder
        ? `Mark order ${order.order_number} as completed?\n\nThis marks it paid (if it isn't yet) and fulfilled in Shopify.`
        : `Mark order ${order.order_number} as completed in WooCommerce?`)
    if (!ok) return
    setActBusy('done')
    try {
      const res = await authFetch('/api/orders/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, orderId: storeRef, status: 'completed', conversationId: order.conversation_id || undefined }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) onFlash(`Failed: ${j.error || res.status}`)
      else { onPatch({ status: 'shipped', fulfilment_status: 'fulfilled' }, { type: 'status_changed', detail: `Marked completed in ${storeName}` }); order.status = 'shipped'; onFlash('Order marked completed') }
    } catch (e: any) { onFlash(`Error: ${e?.message || e}`) }
    setActBusy('')
  }
  // Every item just got marked sent: offer to complete the order.
  const onAllItemsSent = async () => {
    if (['shipped', 'cancelled', 'refunded'].includes(order.status)) return
    const isStore = order.sales_channel === 'woocommerce' || (isShopifyOrder && !!order.external_order_id)
    if (isStore) return markCompleted({ allSent: true })
    // Manual / POS orders complete in Colvy only.
    if (!await confirmDialog({ title: 'All items sent. Order completed?', message: `Mark order ${order.order_number} as completed?`, confirmLabel: 'Yes, complete', cancelLabel: 'No', tone: 'primary' })) return
    onPatch({ status: 'shipped', fulfilment_status: 'fulfilled' }, { type: 'status_changed', detail: 'Marked completed' }); order.status = 'shipped'
    onFlash('Order marked completed')
  }
  // ── Click & Collect actions ───────────────────────────────────────────────
  const notifyPickup = async () => {
    setActBusy('notify')
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      // outletName is a resolver (id → name), not a string. Call it with the
      // order's outlet id; only name the place when it actually resolves.
      const outlet = order.store_location_id && typeof outletName === 'function' ? outletName(order.store_location_id) : null
      const where = outlet ? ` at ${outlet}` : ''
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
    if (!await confirmDialog(`Mark order ${order.order_number} as collected by the customer?`)) return
    onPatch({ status: 'shipped', fulfilment_status: 'fulfilled' }, { type: 'collected', detail: 'Collected by customer' }); order.status = 'shipped'
    logEvent('collected', 'Order collected by customer')
    onFlash('Marked collected')
  }
  // Full, itemised refund — opens the rich modal (same capability as the inbox).
  const issueRefund = () => setShowRefund(true)
  const genInvoice = async () => {
    setActBusy('invoice')
    try {
      const res = await authFetch(`/api/orders/details?companyId=${companyId}&orderId=${encodeURIComponent(storeRef)}`)
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

  // Render synced order data instantly from Supabase. The live-Woo enrichment
  // (variations, coupons/fees) happens in the background effect below, so the
  // drawer never blocks on an external round-trip.
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

  // One live WooCommerce round-trip per order, in the background. It carries
  // two things the synced row doesn't: coupons/discount/fees (financials) and,
  // for older synced items, the picked variation. Merged into state when it
  // returns — synced items and totals already render, so this never blocks.
  useEffect(() => {
    let cancelled = false
    setFinancials(null)
    if (order.sales_channel !== 'woocommerce' || !order.order_number) return
    ;(async () => {
      try {
        const res = await authFetch(`/api/orders/details?companyId=${encodeURIComponent(companyId)}&orderId=${encodeURIComponent(order.order_number)}`)
        const j = await res.json().catch(() => ({}))
        if (cancelled) return
        const o = j?.order
        if (o?.refund_count > 0) loadRefunds()
        if (o) {
          setFinancials({
            discount: parseFloat(o.discount_total) || 0,
            coupons: (o.coupon_lines || []).map((c: any) => c.code).filter(Boolean),
            fees: (o.fee_lines || []).map((f: any) => ({ name: f.name || 'Fee', total: parseFloat(f.total) || 0 })).filter((f: any) => f.total),
          })
        }
        // Backfill the picked variation for synced rows that are missing it
        // (older syncs didn't capture meta_data). Match on the stored Woo line
        // id, then fall back to position.
        const lines: any[] = o?.line_items || []
        if (lines.length) {
          const byId = new Map<string, string>()
          lines.forEach((li: any) => { if (li?.id != null) byId.set(String(li.id), variationFromMeta(li.meta_data)) })
          setItems(prev => prev.some((r: any) => !r?.metadata?.variation)
            ? prev.map((r: any, i: number) => {
                if (r?.metadata?.variation) return r
                const wl = r?.metadata?.woo_line_id
                let v = wl != null ? byId.get(String(wl)) : undefined
                if (!v && lines[i]) v = variationFromMeta(lines[i].meta_data)
                return v ? { ...r, metadata: { ...(r.metadata || {}), variation: v } } : r
              })
            : prev)
        }
      } catch { /* best-effort — summary still shows subtotal/total */ }
    })()
    return () => { cancelled = true }
  }, [order.id, order.order_number, order.sales_channel, companyId])

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
    if (!await confirmDialog('Delete this note?')) return
    setNotes(ns => ns.filter(x => x.id !== n.id))
    try { await (supabase as any).from('order_notes').delete().eq('id', n.id) } catch {}
  }
  const addTask = async () => {
    const text = taskText.trim(); if (!text) return
    const row = { company_id: companyId, text, title: text, done: false, status: 'todo', priority: 'normal', created_by: me.name, created_by_id: me.id, assignees: [], order_id: order.id, order_number: order.order_number, order_customer: order.customer_name, order_total: Number(order.total) || null }
    try {
      let { data, error } = await (supabase as any).from('conversation_tasks').insert(row).select().maybeSingle()
      if (error) { const r = await (supabase as any).from('conversation_tasks').insert({ company_id: companyId, text, done: false, order_id: order.id }).select().maybeSingle(); data = r.data }
      if (data) { setTasks(t => [data, ...t]); notifyIntegrations('task.created', { id: data.id, companyId }) }
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

  const sm = statusMeta(displayStatus(order))
  const age = orderAge(order.order_date)
  const addr = order.shipping_address || {}
  const store = locations.find((l: any) => l.id === order.store_location_id)?.name
  const convHref = order.conversation_id ? `/admin/inbox?conversation=${order.conversation_id}` : null
  const contactHref = order.contact_id ? `/admin/customers/profile?id=${order.contact_id}` : null
  // Can we reach this customer at all? Gate the "start a conversation" fallback.
  const canContact = !!(order.customer_email || order.customer_phone || order.contact_id)
  // No linked thread yet: reuse the contact's most recent conversation if one
  // exists, otherwise open a fresh one, link it to the order, and jump to it.
  const startConversation = async () => {
    try {
      let convId: string | null = order.conversation_id || null
      if (!convId && order.contact_id) {
        const { data: c } = await (supabase as any).from('conversations').select('id').eq('company_id', companyId).eq('contact_id', order.contact_id).order('last_message_at', { ascending: false }).limit(1).maybeSingle()
        if (c?.id) convId = c.id
      }
      if (!convId) {
        const { data: nc } = await (supabase as any).from('conversations').insert({ company_id: companyId, contact_id: order.contact_id || null, status: 'open', channel: order.customer_phone ? 'sms' : 'email', sms_number: order.customer_phone || null, subject: `Order ${order.order_number}`, last_message_at: new Date().toISOString() }).select('id').maybeSingle()
        convId = nc?.id || null
      }
      if (!convId) { onFlash('Could not start a conversation'); return }
      if (convId !== order.conversation_id) { order.conversation_id = convId; onPatch({ conversation_id: convId }); try { await (supabase as any).from('orders').update({ conversation_id: convId }).eq('id', order.id) } catch {} }
      window.location.href = `/admin/inbox?conversation=${convId}`
    } catch { onFlash('Could not start a conversation') }
  }

  // Each section is a white card on the panel's soft grey.
  const sect: React.CSSProperties = { margin: '0 12px 10px', padding: '15px 16px', background: 'var(--card, #fff)', borderRadius: 18, boxShadow: '0 0 0 1px rgba(0,0,0,.045)' }
  const act = (icon: React.ReactNode, label: string, onClick: () => void, opts: { primary?: boolean; on?: boolean } = {}) => (
    <button type="button" onClick={onClick} title={label} aria-pressed={opts.on || undefined} className={`od-act${opts.primary ? ' primary' : ''}${opts.on ? ' on' : ''}`}>
      {icon}<span>{label}</span>
    </button>
  )
  const I = { width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  const when = (d?: string | null) => d ? new Date(d).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
  const custName = String(order.customer_name || '')
  const custInitials = custName.split(' ').filter(Boolean).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || '?'
  const custHue = Array.from(custName).reduce((a: number, c: string) => a + c.charCodeAt(0), 0) % 360
  const addrText = [order.customer_name, [addr.address_1, addr.address_2].filter(Boolean).join(', '), [addr.city, (addr.state || '').toUpperCase(), addr.postcode].filter(Boolean).join(' '), addr.country].filter(Boolean).join('\n')

  // Reprint or void the order's existing label. Reprint opens the carrier PDF
  // (or the printable-label route as a fallback); void cancels at the carrier
  // and returns the order to Awaiting Shipment so it can be re-labelled.
  const labelAction = async (action: 'reprint' | 'void') => {
    if (action === 'void' && !await confirmDialog('Void this shipping label? The order goes back to Awaiting Shipment.')) return
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

  // Side mode floats in from the right; full-screen mode slides up over the
  // whole viewport (same tab) with the content centred.
  return (
    <>
      <style>{`@keyframes ordSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes odIn{from{transform:translateX(28px);opacity:0}to{transform:none;opacity:1}}
        @keyframes odFade{from{opacity:0}to{opacity:1}}
        .od-scrim { position: fixed; inset: 0; z-index: 4000; background: rgba(15,15,20,.3); animation: odFade .2s ease; }
        .od-panel { position: fixed; top: 8px; right: 8px; bottom: 8px; width: 440px; max-width: calc(100vw - 16px); z-index: 4001; display: flex; flex-direction: column; background: #f4f4f5; border-radius: 24px; overflow: hidden; box-shadow: 0 24px 64px rgba(0,0,0,.22), 0 0 0 1px rgba(0,0,0,.05); animation: odIn .32s cubic-bezier(.22,1,.36,1); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .od-panel.full { inset: 0; width: auto; max-width: none; border-radius: 0; box-shadow: none; animation: ordSlideUp .28s cubic-bezier(.16,.84,.44,1); }
        .od-panel.full .od-in { max-width: 760px; margin: 0 auto; }
        .od-head { flex-shrink: 0; background: var(--card, #fff); border-bottom: 1px solid #ececef; padding: 18px 18px 14px; }
        .od-top { display: flex; align-items: center; gap: 2px; margin: -4px -6px 0 0; }
        .od-title { margin: 0; font-size: 23px; font-weight: 800; letter-spacing: -0.025em; line-height: 1.15; color: var(--ink); cursor: copy; }
        .od-title span { color: #a1a1aa; font-weight: 600; }
        .od-meta { margin-top: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; color: #71717a; }
        .od-meta .ord-age { font-size: 13px; }
        .od-placed { margin-top: 7px; font-size: 13px; color: #8e8e93; }
        .od-acts { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; margin: 14px -18px 0; padding: 0 18px 1px; }
        .od-acts::-webkit-scrollbar { display: none; }
        .od-act { flex-shrink: 0; height: 36px; display: inline-flex; align-items: center; gap: 7px; padding: 0 13px; border: none; border-radius: 999px; background: #f4f4f5; color: #18181b; font: inherit; font-size: 13.5px; font-weight: 600; white-space: nowrap; cursor: pointer; transition: background .15s ease, color .15s ease; }
        .od-act::before { display: none; }
        .od-act svg { color: #52525b; flex-shrink: 0; }
        .od-act:hover { background: #ececef; }
        .od-act.primary { background: var(--ord-accent); color: #fff; }
        .od-act.primary:hover { background: var(--ord-accent); filter: brightness(.95); }
        .od-act.on { background: #18181b; color: #fff; }
        .od-act.primary svg, .od-act.on svg { color: currentColor; }
        .od-act:focus-visible, .od-small:focus-visible, .od-choice:focus-visible, .od-rowbtn:focus-visible, .od-check:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--ord-accent) 28%, transparent); }
        .od-body { flex: 1; overflow-y: auto; padding: 12px 0 14px; }
        .od-cust { display: flex; align-items: flex-start; gap: 12px; margin-top: 12px; }
        .od-av { width: 42px; height: 42px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; }
        .od-name { font-size: 15px; font-weight: 700; color: var(--ink); text-decoration: none; }
        a.od-name:hover { text-decoration: underline; }
        .od-line { display: flex; align-items: center; gap: 8px; width: fit-content; max-width: 100%; margin-top: 6px; font-size: 13.5px; color: #52525b; cursor: copy; }
        .od-line > svg { color: #a1a1aa; flex-shrink: 0; }
        .od-line > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .od-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 4px 0; font-size: 13.5px; }
        .od-row > :first-child { color: #71717a; flex-shrink: 0; }
        .od-row > :last-child { color: var(--ink); font-weight: 600; text-align: right; min-width: 0; }
        .od-row.total { margin-top: 6px; padding-top: 11px; border-top: 1px solid #f0f0f2; font-size: 15px; }
        .od-row.total > :first-child { color: var(--ink); font-weight: 600; }
        .od-row.total > :last-child { font-weight: 800; font-variant-numeric: tabular-nums; }
        .od-small { height: 32px; display: inline-flex; align-items: center; gap: 6px; padding: 0 13px; border: none; border-radius: 999px; background: #f4f4f5; color: #18181b; font: inherit; font-size: 13px; font-weight: 600; white-space: nowrap; text-decoration: none; cursor: pointer; transition: background .15s ease; }
        .od-small::before { display: none; }
        .od-small:hover { background: #ececef; }
        .od-small:disabled { opacity: .5; cursor: default; }
        .od-small svg { color: #71717a; flex-shrink: 0; }
        .od-small.accent { color: var(--ord-accent); }
        .od-small.accent svg { color: currentColor; }
        .od-small.green { color: #15803d; } .od-small.green svg { color: currentColor; }
        .od-small.amber { color: #b45309; } .od-small.amber svg { color: currentColor; }
        .od-small.blue { color: #2563eb; } .od-small.blue svg { color: currentColor; }
        .od-small.primary { background: var(--ord-accent); color: #fff; }
        .od-small.primary:hover { filter: brightness(.95); }
        .od-small.primary:disabled { background: #e4e4e7; color: #a1a1aa; filter: none; }
        .od-wrap { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
        .od-field { width: 100%; box-sizing: border-box; height: 40px; padding: 0 14px; border: 1.5px solid transparent; border-radius: 12px; background: #f4f4f5; font: inherit; font-size: 14px; color: var(--ink); outline: none; transition: background .15s ease, border-color .15s ease, box-shadow .15s ease; }
        .od-field::placeholder { color: #a1a1aa; }
        .od-field:focus { background: #fff; border-color: #d4d4d8; box-shadow: 0 0 0 3px color-mix(in srgb, var(--ord-accent) 16%, transparent); }
        textarea.od-field { height: auto; padding: 10px 14px; resize: vertical; line-height: 1.45; }
        .od-label { display: block; margin: 12px 0 6px; font-size: 12.5px; font-weight: 500; color: #8e8e93; }
        .od-choices { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        .od-choice { height: 36px; border: none; border-radius: 999px; background: #f4f4f5; color: #52525b; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: background .15s ease, color .15s ease; }
        .od-choice::before { display: none; }
        .od-choice:hover { background: #ececef; color: #18181b; }
        .od-choice.on { background: #18181b; color: #fff; }
        .od-rowbtn { display: flex; align-items: center; gap: 12px; width: 100%; padding: 0; border: none; background: none; font: inherit; text-align: left; cursor: pointer; border-radius: 12px; }
        .od-rowbtn::before { display: none; }
        .od-rowbtn-ic { width: 38px; height: 38px; border-radius: 13px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--ord-accent) 11%, #fff); color: var(--ord-accent); }
        .od-rowbtn b { display: block; font-size: 14.5px; font-weight: 700; color: var(--ink); }
        .od-rowbtn small { display: block; margin-top: 1px; font-size: 12.5px; color: #8e8e93; }
        .od-rowbtn > svg:last-child { margin-left: auto; color: #a1a1aa; transition: transform .2s ease; }
        .od-rowbtn[aria-expanded="true"] > svg:last-child { transform: rotate(180deg); }
        .od-note { position: relative; padding: 10px 12px; border-radius: 14px; background: #fefce8; }
        .od-note.blue { background: #eff6ff; }
        .od-note p { margin: 0; font-size: 13.5px; color: var(--ink); white-space: pre-wrap; line-height: 1.5; }
        .od-note .meta { margin-top: 5px; font-size: 12px; color: #8e8e93; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .od-note-tools { position: absolute; top: 6px; right: 6px; display: flex; gap: 2px; opacity: 0; transition: opacity .12s ease; }
        .od-note:hover .od-note-tools, .od-note:focus-within .od-note-tools { opacity: 1; }
        .od-tool { width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: none; border-radius: 999px; background: rgba(255,255,255,.85); color: #71717a; cursor: pointer; }
        .od-tool::before { display: none; }
        .od-tool:hover { background: #fff; color: #18181b; }
        .od-tool.danger:hover { color: #dc2626; }
        .od-tl { position: relative; display: flex; gap: 11px; padding-bottom: 14px; }
        .od-tl::before { content: ""; position: absolute; left: 3.5px; top: 15px; bottom: 0; width: 1.5px; background: #ececef; }
        .od-tl:last-child { padding-bottom: 0; }
        .od-tl:last-child::before { display: none; }
        .od-tl-dot { width: 8px; height: 8px; margin-top: 5px; border-radius: 50%; flex-shrink: 0; background: var(--ord-accent); }
        .od-tl p { margin: 0; font-size: 13.5px; color: var(--ink); }
        .od-tl small { display: block; margin-top: 2px; font-size: 12px; color: #8e8e93; }
        .od-task { display: flex; align-items: center; gap: 10px; padding: 5px 0; font-size: 13.5px; color: var(--ink); }
        .od-check { width: 18px; height: 18px; flex-shrink: 0; padding: 0; border-radius: 50%; border: 1.5px solid #d4d4d8; background: transparent; color: #fff; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
        .od-check::before { display: none; }
        .od-check.on { background: #18181b; border-color: #18181b; }
        .od-refund { padding: 11px 12px; border-radius: 14px; background: #fafafa; display: flex; flex-direction: column; gap: 5px; }
        .od-muted { margin: 10px 0 0; font-size: 13px; color: #8e8e93; }
        @media (max-width: 640px) {
          .od-panel { top: 6px; right: 6px; bottom: 6px; left: 6px; width: auto; max-width: none; border-radius: 22px; }
          .od-panel.full { inset: 0; border-radius: 0; }
        }
        @media (prefers-reduced-motion: reduce) { .od-panel, .od-scrim { animation: none; } }`}</style>
      {!fullScreen && <div className="od-scrim" onClick={onClose} />}
      <div className={`od-panel${fullScreen ? ' full' : ''}`} role="dialog" aria-label={`Order ${order.order_number}`}>
        {/* Header: order number, status, and the everyday actions */}
        <div className="od-head">
          <div className="od-in">
            <div className="od-top">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 className="od-title" onClick={() => copyToClipboard(String(order.order_number), onFlash)} title="Click to copy order number">
                  Order <span>#</span>{order.order_number}
                </h2>
              </div>
              <button type="button" className="ord-icon" onClick={() => copyToClipboard(String(order.order_number), onFlash)} title="Copy order number" aria-label="Copy order number">
                <svg {...I} width={17} height={17}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
              </button>
              {!fullScreen && (
                <a className="ord-icon" href={`/admin/orders/${order.id}`} title="Open the full order page" aria-label="Open the full order page">
                  <svg {...I} width={17} height={17}><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
                </a>
              )}
              <button type="button" className="ord-icon" onClick={onClose} title="Close" aria-label="Close">
                <svg {...I} width={18} height={18}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="od-meta">
              <span className="ord-tag" style={{ ['--tag' as any]: sm.fg }}>{sentence(sm.label)}</span>
              <span className="ord-age" style={{ color: age.color }}>{age.label} old</span>
            </div>
            {order.order_date && <div className="od-placed">Placed {when(order.order_date)}{order.sales_channel ? ` · ${channelMeta(order.sales_channel).label}` : ''}</div>}

            {/* Quick actions — one row that scrolls sideways when it runs out of room */}
            <div className="od-acts">
              {act(<svg {...I}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18" /></svg>, 'Create label', () => onLabel(order), { primary: true })}
              {order.tracking_number && act(<svg {...I}><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>, 'Reprint', () => labelAction('reprint'))}
              {order.tracking_number && act(<svg {...I}><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>, 'Void label', () => labelAction('void'))}
              {act(<svg {...I}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M9 15h6" /></svg>, 'Slip', () => onPrintSlip(order.id))}
              {act(<svg {...I}><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" /><path d="m9 14 2 2 4-4" /></svg>, 'Pick', () => { setPickMode(v => { const n = !v; if (n) { const el = document.getElementById('ord-items-panel'); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); onFlash('Picking — tap each item as you pick it') } return n }) }, { on: pickMode })}
              {act(<svg {...I}><path d="M20 6 9 17l-5-5" /></svg>, order.status === 'packed' ? 'Packed' : 'Pack', () => {
                const wasPacked = order.status === 'packed'
                const next = wasPacked ? 'awaiting_shipment' : 'packed'
                onPatch({ status: next }, { type: wasPacked ? 'unpacked' : 'packed', detail: wasPacked ? 'Marked unpacked' : 'Marked packed' }); order.status = next
                logEvent(wasPacked ? 'unpacked' : 'packed', wasPacked ? 'Marked unpacked' : 'Marked packed')
                onFlash(wasPacked ? 'Order unpacked' : 'Order marked packed')
              }, { on: order.status === 'packed' })}
              {isClickCollect(order) && act(<svg {...I}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>, actBusy === 'notify' ? 'Notifying…' : 'Notify pickup', notifyPickup)}
              {isClickCollect(order) && act(<svg {...I}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18" /><path d="m9 12 2 2 4-4" /></svg>, 'Collected', markCollected, { on: order.status === 'shipped' })}
              {act(<svg {...I}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>, 'Message', () => { if (convHref) location.href = convHref; else if (canContact) startConversation(); else onFlash('No email or phone for this customer') })}
              {act(<svg {...I}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>, 'Note', () => { const el = document.getElementById('ord-note') as HTMLTextAreaElement | null; el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); el?.focus() })}
            </div>
          </div>
        </div>

        <div className="od-body">
          <div className="od-in">
          {/* Customer */}
          <CollapseSection style={sect} storageKey="order-customer" title="Customer">
            <div className="od-cust">
              <span className="od-av" style={{ background: `hsl(${custHue} 60% 92%)`, color: `hsl(${custHue} 45% 36%)` }}>{custInitials}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {contactHref ? <a href={contactHref} className="od-name" title="Open customer profile">{order.customer_name || 'Customer'}</a> : <span className="od-name">{order.customer_name || 'Customer'}</span>}
                  {order.customer_name && <CopyBtn onClick={() => copyToClipboard(order.customer_name, onFlash)} title="Copy name" />}
                  {(order.tags || []).includes('VIP') && <TagChip name="VIP" color={tagColor?.('VIP')} />}
                </div>
                {order.customer_email && (
                  <div className="od-line" onClick={() => copyToClipboard(order.customer_email, onFlash)} title="Click to copy email">
                    <svg {...I} width={15} height={15}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>
                    <span>{order.customer_email}</span><CopyBtn onClick={() => copyToClipboard(order.customer_email, onFlash)} title="Copy email" />
                  </div>
                )}
                {order.customer_phone && (
                  <div className="od-line" onClick={() => copyToClipboard(order.customer_phone, onFlash)} title="Click to copy phone">
                    <svg {...I} width={15} height={15}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                    <span>{order.customer_phone}</span><CopyBtn onClick={() => copyToClipboard(order.customer_phone, onFlash)} title="Copy phone" />
                  </div>
                )}
              </div>
            </div>
            {(convHref || canContact) && (
              <div className="od-wrap">
                {convHref
                  ? <a href={convHref} className="od-small accent"><svg {...I} width={14} height={14}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>Open conversation</a>
                  : <button type="button" onClick={startConversation} className="od-small accent"><svg {...I} width={14} height={14}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>Start a conversation</button>}
              </div>
            )}
          </CollapseSection>

          {/* Shipping address */}
          {(addr.address_1 || addr.city) && (
            <CollapseSection style={sect} storageKey="order-address" title="Shipping address"
              right={<CopyBtn title="Copy address" onClick={() => copyToClipboard(addrText, onFlash)} />}>
              <p onClick={() => copyToClipboard(addrText, onFlash)} title="Click to copy address" style={{ margin: '10px 0 0', fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.6, cursor: 'copy' }}>
                {order.customer_name}<br />
                {[addr.address_1, addr.address_2].filter(Boolean).join(', ')}<br />
                {[addr.city, (addr.state || '').toUpperCase(), addr.postcode].filter(Boolean).join(' ')}<br />
                {addr.country}
              </p>
            </CollapseSection>
          )}

          {/* Order summary */}
          <CollapseSection style={sect} storageKey="order-summary" title="Order summary">
            <div style={{ marginTop: 8 }}>
              {([
                ['Outlet', store || 'No outlet'],
                ['Order date', order.order_date ? when(order.order_date) : '—'],
                ['Sales channel', <span key="ch" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ChannelIcon channel={order.sales_channel} size={13} />{channelMeta(order.sales_channel).label}</span>],
                ['Payment', order.payment_status ? sentence(String(order.payment_status)) : '—'],
                ['Fulfilment', order.fulfilment_status ? sentence(String(order.fulfilment_status)) : '—'],
                ['Subtotal', order.subtotal != null ? fmtMoney(order.subtotal, order.currency) : '—'],
                ...(financials?.coupons?.length ? [['Coupon', financials.coupons.join(', ')]] as [string, any][] : []),
                ...(financials && financials.discount > 0 ? [['Discount', <span key="disc" style={{ color: '#15803d' }}>−{fmtMoney(financials.discount, order.currency)}</span>]] as [string, any][] : []),
                ...((financials?.fees || []).map(f => [f.name, fmtMoney(f.total, order.currency)]) as [string, any][]),
                ['Shipping', isClickCollect(order)
                  ? <span key="cc" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#2563eb' }}><ClickCollectIcon size={13} />{order.shipping_method || 'Click & Collect'}</span>
                  : (Number(order.shipping_total) || 0) > 0 ? `${fmtMoney(order.shipping_total, order.currency)}${order.shipping_method ? ` · ${order.shipping_method}` : ''}` : (order.shipping_method || 'Free')],
              ] as [string, any][]).map(([k, v]) => (
                <div key={k} className="od-row"><span>{k}</span><span>{v}</span></div>
              ))}
              <div className="od-row total"><span>Total</span><span>{fmtMoney(order.total, order.currency)} <span style={{ color: '#a1a1aa', fontWeight: 600, fontSize: 12.5 }}>{order.currency || ''}</span></span></div>
              {refundedTotal > 0.004 && <>
                <div className="od-row"><span>Refunded</span><span style={{ color: '#b45309' }}>−{fmtMoney(refundedTotal, order.currency)}</span></div>
                <div className="od-row"><span>Net</span><span>{fmtMoney(Math.max(0, (Number(order.total) || 0) - refundedTotal), order.currency)}</span></div>
              </>}
            </div>
          </CollapseSection>

          {/* Order barcode — scannable Code128 of the order number */}
          {order.order_number && (
            <div style={{ ...sect, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div title={`Order ${order.order_number}`} style={{ width: '100%', maxWidth: 320, display: 'flex', justifyContent: 'center' }}
                dangerouslySetInnerHTML={{ __html: barcodeSVG(String(order.order_number), { moduleWidth: 2, height: 54 }) }} />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--ink)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{order.order_number}</span>
            </div>
          )}

          {/* Items */}
          <div style={sect} id="ord-items-panel">
            <OrderItemsPanel order={order} companyId={companyId} items={items} accent={ACCENT}
              pickMode={pickMode} onExitPick={() => setPickMode(false)}
              onLog={logEvent} onFlash={onFlash} onOpenItem={(idx: number) => setGalleryIdx(idx)} onAllSent={onAllItemsSent} refunds={refunds} />
          </div>

          {/* Refunds — each one with its items, shipping and any general amount */}
          {refunds && refunds.length > 0 && (
            <CollapseSection style={sect} storageKey="order-refunds"
              title={<>Refunds · {fmtMoney(refundedTotal, order.currency)}<span style={{ color: '#b45309' }}>{refundedTotal + 0.005 >= (Number(order.total) || 0) ? ' · Full' : ' · Partial'}</span></>}>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {refunds.map(r => {
                  const general = !r.items.length && !r.shipping
                  const row = (label: React.ReactNode, amount: number, key: string) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, color: 'var(--ink)' }}>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                      <span style={{ flexShrink: 0, color: '#71717a', fontWeight: 600 }}>{fmtMoney(amount, order.currency)}</span>
                    </div>
                  )
                  const n = r.items.reduce((s, l) => s + (l.qty || 0), 0) || r.items.length
                  return (
                    <div key={r.id} className="od-refund">
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
                          {general ? 'Partial refund' : r.items.length ? `${n} item${n === 1 ? '' : 's'} refunded` : 'Shipping refunded'}
                          {r.at && <span style={{ fontWeight: 500, color: '#8e8e93', fontSize: 12 }}> · {when(r.at)}</span>}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#b45309', flexShrink: 0 }}>−{fmtMoney(r.amount, order.currency)}</span>
                      </div>
                      {r.items.map((l, i) => row(<>{l.qty > 0 ? <strong>{l.qty} × </strong> : null}{l.name}</>, l.amount, `i${i}`))}
                      {r.shipping > 0 && row('Shipping', r.shipping, 'ship')}
                      {r.other > 0 && !general && row(<span style={{ color: '#71717a' }}>Extra amount (not tied to an item)</span>, r.other, 'other')}
                      {general && <span style={{ fontSize: 12.5, color: '#8e8e93' }}>A general amount, not tied to any item.</span>}
                      {r.reason && <span style={{ fontSize: 12.5, color: '#71717a', fontStyle: 'italic' }}>&ldquo;{r.reason}&rdquo;</span>}
                    </div>
                  )
                })}
              </div>
            </CollapseSection>
          )}

          {/* Tags */}
          <CollapseSection style={sect} storageKey="order-tags" title="Tags"
            right={
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
                <button type="button" className="od-small" onClick={() => onManageTags?.()} style={{ height: 28 }}>Manage</button>
                <button type="button" className="od-small accent" onClick={() => setAddingTag(v => !v)} style={{ height: 28 }}>
                  {addingTag ? 'Cancel' : <><svg {...I} width={13} height={13}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>Add</>}
                </button>
                {addingTag && (
                  <TagMenu tags={Array.from(new Set([...(tagDefs || []).map((t: any) => t.name), ...(allTags || [])])).filter((t: string) => !(order.tags || []).includes(t))} accent={ACCENT} align="right"
                    onClose={() => setAddingTag(false)} onPick={t => addTag(t)} />
                )}
              </div>
            }>
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(order.tags || []).map((t: string) => (
                <TagChip key={t} name={t} color={tagColor?.(t)} onRemove={() => removeTag(t)} />
              ))}
              {(order.tags || []).length === 0 && !addingTag && <span style={{ fontSize: 13, color: '#8e8e93' }}>No tags yet</span>}
            </div>
          </CollapseSection>

          {/* Assign outlet */}
          {locations && locations.length > 0 && (
            <CollapseSection style={sect} storageKey="order-outlet" title="Assign outlet">
              <select className="ord-select" aria-label="Outlet" value={order.store_location_id || ''} onChange={e => { const v = e.target.value || null; onPatch({ store_location_id: v }, { type: 'outlet', detail: v ? `Assigned to ${outletName?.(v) || 'outlet'}` : 'Outlet cleared' }); order.store_location_id = v }}
                style={{ width: '100%', marginTop: 10 }}>
                <option value="">No outlet</option>
                {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </CollapseSection>
          )}

          {/* Send tracking — expands inline below (no popup) */}
          <div style={sect}>
            <button type="button" className="od-rowbtn" aria-expanded={showTracking} onClick={() => setShowTracking(v => !v)}>
              <span className="od-rowbtn-ic"><svg {...I} width={18} height={18}><rect x="1" y="3" width="15" height="13" rx="1" /><path d="M16 8h4l3 3v5h-7V8z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg></span>
              <span><b>Send tracking</b><small>Text or email the customer their tracking link</small></span>
              <svg {...I} width={16} height={16}><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            {showTracking && (
              <div style={{ marginTop: 4 }}>
                <span className="od-label">Carrier</span>
                <div className="od-choices">
                  {TRACK_CARRIERS.map((c: any) => (
                    <button key={c.key} type="button" className={`od-choice${trkCarrier === c.key ? ' on' : ''}`} aria-pressed={trkCarrier === c.key} onClick={() => setTrkCarrier(c.key)}>{c.label}</button>
                  ))}
                </div>
                <span className="od-label">Tracking number</span>
                <input className="od-field" value={trkNumber} onChange={e => setTrkNumber(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submitTracking() }} placeholder="e.g. 33ABC123456789" />
                {trkCarrier === 'manual' && (
                  <input className="od-field" value={trkCustomUrl} onChange={e => setTrkCustomUrl(e.target.value)} placeholder="Tracking URL (https://…)" style={{ marginTop: 6 }} />
                )}
                {carrierByKey(trkCarrier)?.note && <p className="od-muted" style={{ marginTop: 6, fontSize: 12 }}>{carrierByKey(trkCarrier)!.note}</p>}
                <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                  <button type="button" className="cv-btn" onClick={() => setShowTracking(false)} style={{ height: 36 }}>Cancel</button>
                  <button type="button" className="cv-btn ord-primary" onClick={submitTracking} disabled={trkSending || !trkNumber.trim()} style={{ height: 36 }}>{trkSending ? 'Sending…' : 'Send tracking'}</button>
                </div>
              </div>
            )}
          </div>

          {/* Order actions */}
          <CollapseSection style={sect} storageKey="order-actions" title="Order actions">
            <div className="od-wrap">
              {(() => {
                const isWoo = order.sales_channel === 'woocommerce'
                const isStore = isWoo || (isShopifyOrder && !!order.external_order_id)
                const shopDomain = order.metadata?.shopify?.shop
                return <>
                  {isWoo && wooStoreUrl && <button type="button" className="od-small" onClick={editInWoo}><svg {...I} width={14} height={14}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>Edit in WooCommerce</button>}
                  {isShopifyOrder && shopDomain && order.external_order_id && <a className="od-small" href={`https://${shopDomain}/admin/orders/${order.external_order_id}`} target="_blank" rel="noopener noreferrer"><svg {...I} width={14} height={14}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>Open in Shopify</a>}
                  {isStore && !['shipped', 'cancelled', 'refunded'].includes(order.status) && <button type="button" className="od-small green" disabled={actBusy === 'done'} onClick={() => markCompleted()}><svg {...I} width={14} height={14}><path d="M20 6 9 17l-5-5" /></svg>{actBusy === 'done' ? 'Completing…' : 'Complete'}</button>}
                  {isClickCollect(order) && order.status !== 'shipped' && order.status !== 'cancelled' && <button type="button" className="od-small blue" disabled={actBusy === 'notify'} onClick={notifyPickup}><svg {...I} width={14} height={14}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>{actBusy === 'notify' ? 'Sending…' : 'Ready for pickup'}</button>}
                  {isStore && order.status !== 'refunded' && !(refundedTotal > 0 && refundedTotal + 0.005 >= (Number(order.total) || 0)) && <button type="button" className="od-small amber" disabled={actBusy === 'refund'} onClick={issueRefund}><svg {...I} width={14} height={14}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>{actBusy === 'refund' ? '…' : 'Refund'}</button>}
                  <button type="button" className="od-small" disabled={actBusy === 'invoice'} onClick={genInvoice}><svg {...I} width={14} height={14}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></svg>{actBusy === 'invoice' ? 'Making…' : 'Invoice'}</button>
                  <button type="button" className="od-small" onClick={copyOrderLink}><svg {...I} width={14} height={14}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>Copy link</button>
                </>
              })()}
            </div>
          </CollapseSection>

          {/* Tasks */}
          <CollapseSection style={sect} storageKey="order-tasks" title="Tasks">
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <input className="od-field" value={taskText} onChange={e => setTaskText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTask() }} placeholder="Add a task, e.g. Pack the aquarium" aria-label="New task" />
              <button type="button" className="od-small primary" onClick={addTask} disabled={!taskText.trim()} style={{ height: 40, padding: '0 16px' }}>Add</button>
            </div>
            {tasks.length > 0 && <div style={{ marginTop: 8 }}>
              {tasks.map((t: any) => { const done = t.done || t.status === 'done'; return (
                <div key={t.id} className="od-task">
                  <button type="button" className={`od-check${done ? ' on' : ''}`} onClick={() => toggleTask(t)} aria-label={done ? 'Mark not done' : 'Mark done'} aria-pressed={done}>
                    {done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                  </button>
                  <span style={{ color: done ? '#a1a1aa' : 'var(--ink)', textDecoration: done ? 'line-through' : 'none' }}>{t.title || t.text}</span>
                </div>
              ) })}
            </div>}
          </CollapseSection>

          {/* WooCommerce customer notes — the checkout note + notes-to-customer
              (the private system/stock/payment logs are hidden). */}
          {order.sales_channel === 'woocommerce' && (() => {
            const customerWoo = (wooNotes || []).filter((n: any) => n.customer_note)
            const checkoutNote = (order.customer_note || wooCustomerNote || '').trim()
            const hasCheckout = !!checkoutNote
            return (
              <CollapseSection style={sect} storageKey="order-cust-notes" title="Customer notes">
                {wooNotes === null && !hasCheckout && <p className="od-muted">Loading notes…</p>}
                {wooNotes !== null && customerWoo.length === 0 && !hasCheckout && <p className="od-muted">No customer notes.</p>}
                {(hasCheckout || customerWoo.length > 0) && <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {hasCheckout && (
                    <div className="od-note">
                      <p style={{ paddingRight: 28 }}>{checkoutNote}</p>
                      <div className="meta">Customer note at checkout</div>
                      <div className="od-note-tools"><CopyBtn title="Copy note" onClick={() => copyToClipboard(checkoutNote, onFlash)} /></div>
                    </div>
                  )}
                  {customerWoo.map((n: any) => (
                    <div key={n.id} className="od-note blue">
                      <p style={{ paddingRight: 28 }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(String(n.note || '')) }} />
                      <div className="meta">
                        <span className="ord-tag" style={{ ['--tag' as any]: '#2563eb', height: 20, fontSize: 11.5 }}>To customer</span>
                        {n.author || 'WooCommerce'}{n.date ? ` · ${when(n.date)}` : ''}
                      </div>
                      <div className="od-note-tools"><CopyBtn title="Copy note" onClick={() => copyToClipboard(String(n.note || '').replace(/<[^>]+>/g, ''), onFlash)} /></div>
                    </div>
                  ))}
                </div>}
              </CollapseSection>
            )
          })()}

          {/* Timeline + notes */}
          <CollapseSection style={{ ...sect, marginBottom: 0 }} storageKey="order-timeline" title="Order timeline">
            <div style={{ margin: '10px 0 14px' }}>
              <textarea id="ord-note" className="od-field" value={noteBody} onChange={e => setNoteBody(e.target.value)} placeholder="Add a note… use @ to mention someone" rows={2}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addNote() }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="od-small primary" onClick={addNote} disabled={!noteBody.trim()}>Add note</button>
              </div>
            </div>
            {notes.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {notes.map((n: any) => (
                <div key={n.id} className="od-note">
                  {editNoteId === n.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <textarea autoFocus className="od-field" value={editNoteText} onChange={e => setEditNoteText(e.target.value)} rows={2} style={{ background: '#fff' }} />
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button type="button" className="od-small" onClick={() => setEditNoteId(null)} style={{ background: '#fff' }}>Cancel</button>
                        <button type="button" className="od-small primary" onClick={() => saveNoteEdit(n)}>Save</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p style={{ paddingRight: 84 }}>{n.body}</p>
                      <div className="meta">{n.author_name || 'Someone'}{n.created_at ? ` · ${when(n.created_at)}` : ''}</div>
                      <div className="od-note-tools">
                        <button type="button" className="od-tool" title="Copy" aria-label="Copy note" onClick={() => copyToClipboard(n.body, onFlash)}><svg {...I} width={13} height={13}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg></button>
                        <button type="button" className="od-tool" title="Edit" aria-label="Edit note" onClick={() => { setEditNoteId(n.id); setEditNoteText(n.body || '') }}><svg {...I} width={13} height={13}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg></button>
                        <button type="button" className="od-tool danger" title="Delete" aria-label="Delete note" onClick={() => deleteNote(n)}><svg {...I} width={13} height={13}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg></button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>}
            {events.length > 0 && <div>
              {events.map((ev: any) => (
                <div key={ev.id} className="od-tl">
                  <span className="od-tl-dot" />
                  <div>
                    <p>{ev.detail || ev.type}</p>
                    <small>{when(ev.created_at)}{ev.actor_name ? ` · ${ev.actor_name}` : ''}</small>
                  </div>
                </div>
              ))}
            </div>}
            {notes.length === 0 && events.length === 0 && <p className="od-muted" style={{ marginTop: 0 }}>No activity yet.</p>}
          </CollapseSection>
          </div>
        </div>
      </div>

      {/* Full itemised refund (WooCommerce) */}
      {showRefund && companyId && (
        <RefundOrderModal companyId={companyId} order={order} accent={ACCENT}
          onClose={() => setShowRefund(false)}
          onDone={(amount: number) => {
            onFlash(`Refunded${amount ? ` $${amount.toFixed(2)}` : ''}`)
            // Only flip to "refunded" when the whole order is now refunded;
            // a partial refund leaves the payment status as-is.
            const totalRefunded = (Number(order.total_refunded) || 0) + (amount || 0)
            const full = totalRefunded + 0.005 >= (Number(order.total) || 0)
            order.total_refunded = totalRefunded
            if (full) onPatch({ payment_status: 'refunded' }, { type: 'refunded', detail: `Refund issued · $${amount.toFixed(2)}` })
            else logEvent('refunded', `Partial refund · $${amount.toFixed(2)}`)
            // Show what was just refunded on the items and in the Refunds section.
            loadRefunds(true)
          }} />
      )}

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
