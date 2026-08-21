'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser } from '@/lib/client-cache'
import {
  STATUS_TABS, statusMeta, channelMeta, orderAge, fmtMoney, SAVED_FILTERS,
  CARRIERS, CARRIER_LABEL, CARRIER_SERVICES,
} from '@/lib/orders'

type Order = any

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
  const [labelOrder, setLabelOrder] = useState<Order | null>(null)

  // Open the print route (packing slips or labels) for a set of orders in a new tab.
  const openPrint = useCallback((docType: 'packing_slip' | 'label', ids: string[]) => {
    if (!ids.length || !companyId) { flash('Select at least one order'); return }
    window.open(`/admin/orders/print?doc=${docType}&company=${encodeURIComponent(companyId)}&ids=${ids.join(',')}`, '_blank')
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

      const { data: tms } = await (supabase as any).from('team_members').select('user_id, name').eq('company_id', cid)
      const uids = Array.from(new Set((tms || []).map((t: any) => t.user_id).filter(Boolean)))
      let names: Record<string, any> = {}
      if (uids.length) { try { const r = await fetch('/api/team/names', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userIds: uids }) }); names = (await r.json()).names || {} } catch {} }
      setTeam((tms || []).map((t: any) => ({ id: t.user_id, name: t.name || names[t.user_id]?.name || 'Teammate' })).filter((t: any) => t.id))

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

  // ── Counts for the tabs ────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length, alerts: 0, awaiting_shipment: 0, on_hold: 0, manual: 0, shipped: 0, cancelled: 0, packed: 0, click_and_collect: 0 }
    for (const o of orders) { c[o.status] = (c[o.status] || 0) + 1; if (o.flagged) c.alerts++ }
    return c
  }, [orders])

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
      if (fStore !== 'all' && o.store_location_id !== fStore) return false
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
  }, [orders, tab, search, fStore, fAssignee, fTag, fDate, saved, sortCol, sortDir])

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
      <style>{`@keyframes ospin{to{transform:rotate(360deg)}} .ord-row:hover{background:var(--canvas)} .tag-opt:hover{background:var(--canvas)}`}</style>

      {/* Header + KPIs */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>Orders</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--slate)' }}>Manage and fulfil customer orders{syncing ? ' · syncing…' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {kpi('All Orders', counts.all, 'var(--ink)')}
          {kpi('Awaiting', counts.awaiting_shipment || 0, ACCENT)}
          {kpi('On Hold', counts.on_hold || 0, '#d97706')}
          {kpi('Shipped', counts.shipped || 0, '#16a34a')}
          {kpi('Alerts', counts.alerts || 0, '#dc2626')}
        </div>
      </div>

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
          <div style={{ position: 'relative' }}>
            <button type="button" onClick={() => setTagMenuOpen(v => !v)} style={{ ...ctrl, display: 'flex', alignItems: 'center', gap: 5 }}>Tag<span style={{ fontSize: 9, color: 'var(--slate)' }}>▾</span></button>
            {tagMenuOpen && (
              <TagMenu tags={allTags} accent={ACCENT} onClose={() => setTagMenuOpen(false)}
                onPick={t => { addTagTo([...selected], t); setSelected(new Set()); setTagMenuOpen(false) }} />
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search orders…" style={{ ...ctrl, minWidth: 200, cursor: 'text', fontWeight: 500 }} />
          <select value={fStore} onChange={e => setFStore(e.target.value)} style={ctrl}><option value="all">All Stores</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          <select value={fAssignee} onChange={e => setFAssignee(e.target.value)} style={ctrl}><option value="all">Any assignee</option><option value="none">Unassigned</option>{team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <select value={fTag} onChange={e => setFTag(e.target.value)} style={ctrl}><option value="all">Any tag</option>{allTags.map(t => <option key={t} value={t}>{t}</option>)}</select>
          <select value={fDate} onChange={e => setFDate(e.target.value)} style={ctrl}><option value="all">All time</option><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select>
          <select value={saved} onChange={e => setSaved(e.target.value)} style={{ ...ctrl, color: saved ? ACCENT : 'var(--ink)' }}><option value="">Saved Filters</option>{SAVED_FILTERS.map(s => <option key={s} value={s}>{s}</option>)}{locations.map(l => <option key={l.id} value={`loc:${l.id}`}>{l.name}</option>)}</select>
          <button type="button" onClick={() => runSync(companyId!)} disabled={syncing} style={{ ...ctrl, color: ACCENT }}>{syncing ? 'Syncing…' : 'Sync'}</button>
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
                  <tr key={o.id} className="ord-row" onClick={() => setDrawerId(o.id)} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: drawerId === o.id ? `color-mix(in srgb, ${ACCENT} 10%, transparent)` : sel ? `color-mix(in srgb, ${ACCENT} 5%, transparent)` : undefined }}>
                    <td style={td} onClick={e => { e.stopPropagation(); toggleOne(o.id) }}><input type="checkbox" checked={sel} onChange={() => {}} /></td>
                    <td style={{ ...td, color: ACCENT, fontWeight: 700 }}>{o.order_number}</td>
                    <td style={{ ...td, fontWeight: 700, color: age.color }}>{age.label}</td>
                    <td style={{ ...td, color: 'var(--slate)' }}>{o.order_date ? new Date(o.order_date).toLocaleString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{o.customer_name || '—'}</td>
                    <td style={td}>{o.item_count || 0}</td>
                    <td style={{ ...td, color: 'var(--slate)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.primary_sku || '—'}</td>
                    <td style={{ ...td, color: 'var(--slate)' }}>{o.shipping_method || '—'}</td>
                    <td style={td}><span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: sm.bg, color: sm.fg }}>{sm.label}</span></td>
                    <td style={td}><Avatar name={o.assignee_name || teamName(o.assignee_id)} /></td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtMoney(o.total, o.currency)}</td>
                    <td style={td}><span style={{ fontSize: 14 }}>{channelMeta(o.sales_channel).icon}</span></td>
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
          onClose={() => setDrawerId(null)}
          onPatch={(patch, ev) => patchOrder([drawerOrder.id], patch, ev)}
          onFlash={flash} teamName={teamName}
          onLabel={(o: Order) => setLabelOrder(o)}
          onPrintSlip={(id: string) => openPrint('packing_slip', [id])} />
      )}

      {labelOrder && (
        <CreateLabelModal order={labelOrder} companyId={companyId!} accent={ACCENT}
          onClose={() => setLabelOrder(null)}
          onDone={(patch: any) => { patchOrder([labelOrder.id], patch); setLabelOrder(null) }}
          onFlash={flash} onPrintLabel={(id: string) => openPrint('label', [id])} />
      )}
    </div>
  )
}

// ── Tag combobox — type to filter existing tags or create one on the fly ──────
function TagMenu({ tags, accent, align = 'left', onPick, onClose }: { tags: string[]; accent: string; align?: 'left' | 'right'; onPick: (tag: string) => void; onClose: () => void }) {
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
function CreateLabelModal({ order, companyId, accent, onClose, onDone, onFlash, onPrintLabel }: any) {
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

// ── Right-side order drawer ───────────────────────────────────────────────────
function OrderDrawer({ order, companyId, me, team, locations, accent, allTags, onClose, onPatch, onFlash, onLabel, onPrintSlip, teamName }: any) {
  const ACCENT = accent || 'var(--coral)'
  const [items, setItems] = useState<any[]>([])
  const [notes, setNotes] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [noteBody, setNoteBody] = useState('')
  const [taskText, setTaskText] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [addingTag, setAddingTag] = useState(false)

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

  const logEvent = async (type: string, detail: string) => {
    const row = { order_id: order.id, company_id: companyId, type, detail, actor_id: me.id, actor_name: me.name }
    try { const { data } = await (supabase as any).from('order_events').insert(row).select().maybeSingle(); if (data) setEvents(e => [data, ...e]) } catch {}
  }
  const addNote = async () => {
    const body = noteBody.trim(); if (!body) return
    const mentions = Array.from(body.matchAll(/@(\w[\w.-]*)/g)).map(m => m[1])
    const row = { order_id: order.id, company_id: companyId, author_id: me.id, author_name: me.name, body, mentions }
    try { const { data } = await (supabase as any).from('order_notes').insert(row).select().maybeSingle(); if (data) { setNotes(n => [data, ...n]); logEvent('note_added', 'Internal note added') } } catch {}
    setNoteBody('')
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

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.28)', zIndex: 4000 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, maxWidth: '94vw', background: 'var(--card, #fff)', zIndex: 4001, boxShadow: '-12px 0 40px rgba(0,0,0,0.16)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ ...sect, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>Order {order.order_number}</h2>
            <p style={{ margin: '5px 0 0', fontSize: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: sm.bg, color: sm.fg }}>{sm.label}</span>
              <span style={{ color: age.color, fontWeight: 700 }}>{age.label} old</span>
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--slate)', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Quick actions */}
          <div style={{ ...sect, display: 'flex', gap: 8 }}>
            {quick(<svg {...I}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18" /></svg>, 'Label', () => onLabel(order), true)}
            {quick(<svg {...I}><path d="M6 9V2h12v7" /><rect x="6" y="14" width="12" height="8" /><path d="M6 18H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2" /></svg>, 'Slip', () => onPrintSlip(order.id))}
            {quick(<svg {...I}><path d="M20 6 9 17l-5-5" /></svg>, 'Packed', () => { onPatch({ status: 'packed' }, { type: 'packed', detail: 'Marked packed' }); order.status = 'packed'; logEvent('packed', 'Marked packed') })}
            {quick(<svg {...I}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>, 'Note', () => { (document.getElementById('ord-note') as HTMLTextAreaElement)?.focus() })}
            {quick(<svg {...I}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>, 'Contact', () => { if (convHref) location.href = convHref; else onFlash('No linked conversation yet.') })}
          </div>

          {/* Customer */}
          <div style={sect}>
            <p style={kick}>Customer</p>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {contactHref ? <a href={contactHref} style={{ fontSize: 15, fontWeight: 700, color: ACCENT, textDecoration: 'none' }}>{order.customer_name}</a> : <span style={{ fontSize: 15, fontWeight: 700 }}>{order.customer_name}</span>}
              {(order.tags || []).includes('VIP') && <span style={{ fontSize: 10, fontWeight: 800, color: '#15803d', background: '#dcfce7', padding: '1px 7px', borderRadius: 20 }}>VIP</span>}
            </div>
            {order.customer_email && <p style={{ margin: '5px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>{order.customer_email}</p>}
            {order.customer_phone && <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>{order.customer_phone}</p>}
            {convHref && <a href={convHref} style={{ display: 'inline-block', marginTop: 8, fontSize: 12.5, fontWeight: 700, color: ACCENT, textDecoration: 'none' }}>Open conversation →</a>}
          </div>

          {/* Shipping address */}
          {(addr.address_1 || addr.city) && (
            <div style={sect}>
              <p style={kick}>Shipping Address</p>
              <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--ink)', lineHeight: 1.6 }}>
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
              {([['Order Date', order.order_date ? new Date(order.order_date).toLocaleString('en-AU') : '—'], ['Store', store || '—'], ['Sales Channel', `${channelMeta(order.sales_channel).icon} ${channelMeta(order.sales_channel).label}`], ['Payment', order.payment_status || '—'], ['Fulfilment', order.fulfilment_status || '—'], ['Total', `${fmtMoney(order.total, order.currency)} ${order.currency || ''}`]] as [string, string][]).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
                  <span style={{ color: 'var(--slate)' }}>{k}</span>
                  <span style={{ fontWeight: k === 'Total' ? 800 : 600, color: 'var(--ink)', textAlign: 'right', textTransform: k === 'Payment' || k === 'Fulfilment' ? 'capitalize' : 'none' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Items */}
          <div style={sect}>
            <p style={kick}>Items ({items.length})</p>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map((it: any) => (
                <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ position: 'relative', width: 40, height: 40, borderRadius: 8, flexShrink: 0, overflow: 'hidden', background: 'var(--peach)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /></svg>
                    {it.image_url && <img src={it.image_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={(e: any) => { e.currentTarget.style.display = 'none' }} />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.product_name}</p>
                    {it.sku && <p style={{ margin: 0, fontSize: 11, color: 'var(--slate)' }}>SKU: {it.sku}</p>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, fontSize: 11.5, color: 'var(--slate)' }}>Qty {it.quantity}</p>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{fmtMoney(it.total_price ?? it.unit_price, order.currency)}</p>
                  </div>
                </div>
              ))}
              {items.length === 0 && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)' }}>No items synced.</p>}
            </div>
          </div>

          {/* Tags */}
          <div style={sect}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={kick}>Tags</p>
              <div style={{ position: 'relative' }}>
                <button type="button" onClick={() => setAddingTag(v => !v)} style={{ fontSize: 12, fontWeight: 700, color: ACCENT, background: 'none', border: 'none', cursor: 'pointer' }}>{addingTag ? 'Cancel' : '+ Add'}</button>
                {addingTag && (
                  <TagMenu tags={(allTags || []).filter((t: string) => !(order.tags || []).includes(t))} accent={ACCENT} align="right"
                    onClose={() => setAddingTag(false)} onPick={t => addTag(t)} />
                )}
              </div>
            </div>
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(order.tags || []).map((t: string) => (
                <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 20, background: 'var(--canvas)', border: '1px solid var(--border)', fontSize: 11.5, fontWeight: 600, color: 'var(--slate)' }}>
                  {t}<button type="button" onClick={() => removeTag(t)} style={{ background: 'none', border: 'none', color: 'var(--slate)', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1 }}>×</button>
                </span>
              ))}
              {(order.tags || []).length === 0 && !addingTag && <span style={{ fontSize: 12, color: 'var(--slate)' }}>No tags</span>}
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

          {/* Timeline + notes */}
          <div style={{ ...sect, borderBottom: 'none' }}>
            <p style={kick}>Order Timeline</p>
            <div style={{ display: 'flex', gap: 6, margin: '10px 0' }}>
              <textarea id="ord-note" value={noteBody} onChange={e => setNoteBody(e.target.value)} placeholder="Add a note… use @ to mention someone" rows={2} style={{ flex: 1, padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 12.5, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }} />
              <button type="button" onClick={addNote} disabled={!noteBody.trim()} style={{ padding: '0 12px', borderRadius: 9, border: 'none', background: noteBody.trim() ? ACCENT : 'var(--border)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: noteBody.trim() ? 'pointer' : 'default' }}>Note</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
              {notes.map((n: any) => (
                <div key={n.id} style={{ padding: '8px 11px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a' }}>
                  <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{n.body}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 10.5, color: 'var(--slate)' }}>{n.author_name || 'Someone'} · {n.created_at ? new Date(n.created_at).toLocaleString('en-AU') : ''}</p>
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
    </>
  )
}
