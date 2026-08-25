'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fmtMoney, buildOrderLineKeys, gstInclFactor } from '@/lib/orders'

/**
 * Per-line-item fulfilment + ShipStation-style split shipments.
 *
 * Fulfilment state lives in its OWN table (order_fulfillments), keyed on a
 * stable line key rather than order_items.id — the WooCommerce webhook path
 * deletes and re-inserts a whole order's items on any update, which would
 * otherwise wipe every "sent" flag. The line key prefers the WooCommerce line
 * id (stored in metadata by the sync), falling back to product/sku/occurrence
 * so legacy rows still match across a re-sync.
 */

type Ful = { line_key: string; sent: boolean; sent_at: string | null; ship_group: number; picked: boolean; picked_at: string | null }

export default function OrderItemsPanel({
  order, companyId, items, accent, onLog, onFlash, onOpenItem, pickMode = false, onExitPick,
}: {
  order: any
  companyId: string
  items: any[]
  accent?: string
  onLog?: (type: string, detail: string) => void
  onFlash?: (msg: string) => void
  onOpenItem?: (index: number) => void
  pickMode?: boolean
  onExitPick?: () => void
}) {
  const ACCENT = accent || 'var(--coral)'
  const currency = order?.currency || 'AUD'
  // Show GST-inclusive line prices (the ex-GST figures confused packers vs the
  // order total). Factor derived from the order's own totals.
  const gstF = gstInclFactor(order)
  const priceIncl = (v: any) => fmtMoney((Number(v) || 0) * gstF, currency)
  const [ful, setFul] = useState<Map<string, Ful>>(new Map())
  const [splitMode, setSplitMode] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [reassign, setReassign] = useState<string | null>(null)
  // Line keys currently flagged out of stock (status='pending'). Lives in its
  // own table so the "Out of Stock List" view is one cheap denormalised query.
  const [oos, setOos] = useState<Set<string>>(new Set())

  // Deterministic order so occurrence-based keys are stable, and grouping is
  // predictable. Sort by the stored id only as a final tiebreak.
  const ordered = useMemo(() => items.map((it, i) => ({ it, idx: i })), [items])
  const lineKeys = useMemo(() => buildOrderLineKeys(items), [items])
  const keyOf = useCallback((it: any) => lineKeys.get(it.id) || `id:${it.id}`, [lineKeys])

  const load = useCallback(async () => {
    if (!order?.id) return
    try {
      const { data } = await (supabase as any)
        .from('order_fulfillments').select('line_key, sent, sent_at, ship_group, picked, picked_at').eq('order_id', order.id)
      const m = new Map<string, Ful>()
      for (const r of data || []) m.set(r.line_key, { line_key: r.line_key, sent: !!r.sent, sent_at: r.sent_at, ship_group: Number(r.ship_group) || 1, picked: !!r.picked, picked_at: r.picked_at })
      setFul(m)
    } catch { /* table may not exist yet (migration pending) — treat as none */ }
  }, [order?.id])
  useEffect(() => { load() }, [load])

  const loadOos = useCallback(async () => {
    if (!order?.id) return
    try {
      const { data } = await (supabase as any)
        .from('order_stock_alerts').select('line_key, status').eq('order_id', order.id).eq('status', 'pending')
      setOos(new Set((data || []).map((r: any) => r.line_key)))
    } catch { /* table may not exist yet (migration pending) */ }
  }, [order?.id])
  useEffect(() => { loadOos() }, [loadOos])

  const oosOf = (it: any) => oos.has(keyOf(it))

  // Flag / clear an out-of-stock line. Denormalises the order + customer +
  // product detail so the list view needs no joins. Clearing deletes the row.
  const toggleOos = async (it: any) => {
    const k = keyOf(it)
    const now = !oos.has(k)
    setOos(prev => { const n = new Set(prev); now ? n.add(k) : n.delete(k); return n })
    if (now) {
      // Full row (denormalised). If a newer optional column (image_url) is
      // missing because an older V286 was applied, the insert would fail as a
      // whole — so retry without the optional columns rather than lose the flag.
      const full: any = {
        company_id: companyId, order_id: order.id, order_number: order.order_number,
        order_date: order.order_date || order.created_at || null, customer_name: order.customer_name,
        customer_phone: order.customer_phone || null, customer_email: order.customer_email || null,
        store_location_id: order.store_location_id || null, line_key: k,
        product_name: it.product_name, sku: it.sku || null, image_url: it.image_url || null, quantity: it.quantity || 1,
        status: 'pending', resolved_at: null, created_by_name: null, updated_at: new Date().toISOString(),
      }
      const minimal: any = {
        company_id: companyId, order_id: order.id, order_number: order.order_number,
        customer_name: order.customer_name, store_location_id: order.store_location_id || null, line_key: k,
        product_name: it.product_name, sku: it.sku || null, quantity: it.quantity || 1, status: 'pending',
      }
      let saved = false
      try {
        const { error } = await (supabase as any).from('order_stock_alerts').upsert(full, { onConflict: 'order_id,line_key' })
        if (error) throw error
        saved = true
      } catch {
        try {
          const { error } = await (supabase as any).from('order_stock_alerts').upsert(minimal, { onConflict: 'order_id,line_key' })
          if (!error) saved = true
        } catch {}
      }
      if (saved) {
        onLog?.('item_out_of_stock', `Flagged out of stock: ${it.product_name}${it.quantity ? ` ×${it.quantity}` : ''}`)
        onFlash?.('Marked out of stock')
      } else {
        // Roll the optimistic flag back so the UI matches reality.
        setOos(prev => { const n = new Set(prev); n.delete(k); return n })
        onFlash?.('Could not save — apply the Out of Stock migration (COLVY_V286) and try again')
      }
    } else {
      try {
        await (supabase as any).from('order_stock_alerts').delete().eq('order_id', order.id).eq('line_key', k)
        onLog?.('item_in_stock', `Cleared out-of-stock flag: ${it.product_name}`)
        onFlash?.('Out-of-stock cleared')
      } catch { onFlash?.('Could not clear — try again') }
    }
  }

  const stateOf = (it: any): Ful => {
    const k = keyOf(it)
    return ful.get(k) || { line_key: k, sent: false, sent_at: null, ship_group: 1, picked: false, picked_at: null }
  }
  const groupOf = (it: any) => stateOf(it).ship_group || 1
  const sentOf = (it: any) => stateOf(it).sent
  const pickedOf = (it: any) => stateOf(it).picked

  // Persist one line's fulfilment, merging with whatever we already hold so a
  // "mark sent" keeps its shipment and vice-versa.
  const write = async (it: any, patch: Partial<Ful>) => {
    const k = keyOf(it)
    const cur = ful.get(k) || { line_key: k, sent: false, sent_at: null, ship_group: 1, picked: false, picked_at: null }
    const next: Ful = { ...cur, ...patch, line_key: k }
    setFul(prev => { const m = new Map(prev); m.set(k, next); return m })
    try {
      await (supabase as any).from('order_fulfillments').upsert(
        { company_id: companyId, order_id: order.id, line_key: k, sent: next.sent, sent_at: next.sent_at, ship_group: next.ship_group, picked: next.picked, picked_at: next.picked_at, updated_at: new Date().toISOString() },
        { onConflict: 'order_id,line_key' },
      )
    } catch { onFlash?.('Saved locally — apply the fulfilments migration to persist') }
  }
  const writeMany = async (its: any[], patch: Partial<Ful>) => { for (const it of its) await write(it, patch) }

  const toggleSent = async (it: any) => {
    const now = !sentOf(it)
    await write(it, { sent: now, sent_at: now ? new Date().toISOString() : null })
    // Sending a line resolves any out-of-stock flag on it — the customer got it,
    // so it should drop off the Out of Stock List (shown struck through there).
    if (now && oos.has(keyOf(it))) {
      setOos(prev => { const n = new Set(prev); n.delete(keyOf(it)); return n })
      try { await (supabase as any).from('order_stock_alerts').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('order_id', order.id).eq('line_key', keyOf(it)).eq('status', 'pending') } catch {}
    }
    onLog?.(now ? 'item_sent' : 'item_unsent', `${now ? 'Marked sent' : 'Unmarked sent'}: ${it.product_name}${it.quantity ? ` ×${it.quantity}` : ''}`)
    onFlash?.(now ? 'Item marked sent' : 'Item marked unsent')
  }

  const togglePicked = async (it: any) => {
    const now = !pickedOf(it)
    await write(it, { picked: now, picked_at: now ? new Date().toISOString() : null })
    onLog?.(now ? 'item_picked' : 'item_unpicked', `${now ? 'Picked' : 'Un-picked'}: ${it.product_name}${it.quantity ? ` ×${it.quantity}` : ''}`)
  }

  // Reflect overall progress on the order row (unfulfilled / partial / fulfilled)
  // whenever the fulfilment map changes — derived, so it can never read stale
  // state. Skips the very first render and only writes when the status moves.
  const lastStatusRef = useRef<string | null>(null)
  const primedRef = useRef(false)
  useEffect(() => {
    if (!primedRef.current) { primedRef.current = true; return }
    if (!items.length || !order?.id) return
    const s = items.reduce((n, it) => n + (sentOf(it) ? 1 : 0), 0)
    const status = s === 0 ? 'unfulfilled' : s >= items.length ? 'fulfilled' : 'partial'
    if (status === lastStatusRef.current || status === order.fulfilment_status) { lastStatusRef.current = status; return }
    lastStatusRef.current = status
    ;(async () => { try { await (supabase as any).from('orders').update({ fulfilment_status: status }).eq('id', order.id) } catch {} })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ful])

  const groups = useMemo(() => {
    const g = new Map<number, { it: any; idx: number }[]>()
    for (const row of ordered) { const gr = groupOf(row.it); if (!g.has(gr)) g.set(gr, []); g.get(gr)!.push(row) }
    return [...g.entries()].sort((a, b) => a[0] - b[0])
  }, [ordered, ful])
  const groupNums = groups.map(([n]) => n)
  const multi = groups.length > 1

  const moveToNewShipment = async () => {
    if (!sel.size) { setSplitMode(false); return }
    const next = (groupNums.length ? Math.max(...groupNums) : 1) + 1
    const chosen = items.filter(it => sel.has(it.id))
    await writeMany(chosen, { ship_group: next })
    onLog?.('order_split', `Split ${chosen.length} item${chosen.length === 1 ? '' : 's'} into Shipment ${next}`)
    onFlash?.(`Moved to Shipment ${next}`)
    setSel(new Set()); setSplitMode(false)
  }
  const moveTo = async (it: any, g: number) => { await write(it, { ship_group: g }); setReassign(null); onLog?.('order_split', `Moved ${it.product_name} to Shipment ${g}`) }
  const markGroup = async (rows: { it: any }[], sent: boolean) => {
    await writeMany(rows.map(r => r.it), { sent, sent_at: sent ? new Date().toISOString() : null })
    onLog?.(sent ? 'item_sent' : 'item_unsent', `${sent ? 'Marked all sent' : 'Unmarked all'} · ${rows.length} item${rows.length === 1 ? '' : 's'}`)
  }

  const kick: any = { margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--slate)' }
  const sentTotal = items.reduce((n, it) => n + (sentOf(it) ? 1 : 0), 0)
  const pickedTotal = items.reduce((n, it) => n + (pickedOf(it) ? 1 : 0), 0)
  const allPicked = items.length > 0 && pickedTotal >= items.length

  const renderItem = (it: any, idx: number) => {
    const sent = sentOf(it)
    const picked = pickedOf(it)
    const oosFlag = oosOf(it)
    const checked = sel.has(it.id)
    const rowClick = pickMode ? () => togglePicked(it) : () => onOpenItem?.(idx)
    return (
      <div key={it.id} className="ord-item"
        onClick={pickMode ? () => togglePicked(it) : undefined}
        title={pickMode ? (picked ? 'Picked — tap to undo' : 'Tap to mark picked') : (sent ? 'Item sent' : 'Click to view')}
        style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 9, padding: pickMode ? 8 : oosFlag ? 8 : 4, margin: pickMode ? 0 : oosFlag ? 0 : -4, opacity: sent && !pickMode ? 0.5 : 1, transition: 'opacity .15s, background .15s, box-shadow .15s',
          cursor: pickMode ? 'pointer' : 'default',
          background: pickMode && picked ? 'color-mix(in srgb, #059669 10%, transparent)' : oosFlag ? 'color-mix(in srgb, #dc2626 7%, transparent)' : 'transparent',
          boxShadow: pickMode ? `inset 0 0 0 1.5px ${picked ? '#059669' : 'var(--border)'}` : oosFlag ? 'inset 0 0 0 1.5px #f4b4b4' : 'none' }}>
        {splitMode && (
          <input type="checkbox" checked={checked} onChange={() => setSel(s => { const n = new Set(s); n.has(it.id) ? n.delete(it.id) : n.add(it.id); return n })}
            style={{ width: 16, height: 16, accentColor: ACCENT, cursor: 'pointer', flexShrink: 0 }} />
        )}
        <span onClick={rowClick} style={{ position: 'relative', width: 40, height: 40, borderRadius: 8, flexShrink: 0, overflow: 'hidden', background: 'var(--peach)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /></svg>
          {it.image_url && <img src={it.image_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={(e: any) => { e.currentTarget.style.display = 'none' }} />}
          {pickMode && picked && (
            <span style={{ position: 'absolute', inset: 0, background: 'rgba(5,150,105,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </span>
          )}
        </span>
        <div onClick={rowClick} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: sent && !pickMode ? 'line-through' : 'none' }}>{it.product_name}</p>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--slate)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {it.sku ? <span>SKU: {it.sku}</span> : null}
            {oosFlag && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 7px', borderRadius: 20, background: '#fee2e2', color: '#b91c1c', fontWeight: 800, fontSize: 10, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>⚠ OUT OF STOCK</span>}
            {sent && !pickMode && <span style={{ color: '#059669', fontWeight: 700 }}>✓ Sent</span>}
            {picked && !pickMode && <span style={{ color: '#059669', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>✓ Picked</span>}
          </p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--slate)' }}>Qty {it.quantity}</p>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{priceIncl(it.total_price ?? it.unit_price)}</p>
        </div>
        {pickMode && (
          <span aria-hidden style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', border: `2px solid ${picked ? '#059669' : 'var(--border)'}`, background: picked ? '#059669' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            {picked && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
          </span>
        )}
        {!pickMode && multi && !splitMode && (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button type="button" title="Move to another shipment" onClick={() => setReassign(r => r === it.id ? null : it.id)}
              style={{ width: 24, height: 24, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--slate)', cursor: 'pointer', fontSize: 12 }}>⇄</button>
            {reassign === it.id && (
              <div style={{ position: 'absolute', top: 28, right: 0, zIndex: 40, background: 'var(--card,#fff)', border: '1px solid var(--border)', borderRadius: 9, boxShadow: '0 10px 30px rgba(0,0,0,.14)', padding: 6, minWidth: 130 }}>
                {groupNums.filter(g => g !== groupOf(it)).map(g => (
                  <button key={g} type="button" onClick={() => moveTo(it, g)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: 7, border: 'none', background: 'none', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer' }}>Shipment {g}</button>
                ))}
                <button type="button" onClick={() => moveTo(it, (Math.max(...groupNums)) + 1)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: 7, border: 'none', background: 'none', fontSize: 12.5, fontWeight: 700, color: ACCENT, cursor: 'pointer' }}>+ New shipment</button>
              </div>
            )}
          </div>
        )}
        {!pickMode && !splitMode && (
          <button type="button" onClick={() => toggleOos(it)} title={oosFlag ? 'In stock — clear out-of-stock flag' : 'Flag as out of stock'} aria-label={oosFlag ? 'Clear out-of-stock flag' : 'Flag as out of stock'}
            style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: `1px solid ${oosFlag ? '#dc2626' : 'var(--border)'}`, background: oosFlag ? '#dc2626' : 'var(--card,#fff)', color: oosFlag ? '#fff' : 'var(--slate)', cursor: 'pointer' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          </button>
        )}
        {!pickMode && (
          <button type="button" onClick={() => toggleSent(it)} title={sent ? 'Mark as not sent' : 'Mark item sent'}
            style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 8, border: `1px solid ${sent ? '#059669' : 'var(--border)'}`, background: sent ? '#059669' : 'var(--card,#fff)', color: sent ? '#fff' : 'var(--slate)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            {sent ? 'Sent' : 'Send'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div>
      {pickMode && (
        <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 11, background: allPicked ? 'color-mix(in srgb, #059669 12%, transparent)' : `color-mix(in srgb, ${ACCENT} 10%, transparent)`, border: `1px solid ${allPicked ? '#059669' : `color-mix(in srgb, ${ACCENT} 40%, transparent)`}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 800, color: allPicked ? '#047857' : 'var(--ink)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" /><path d="m9 14 2 2 4-4" /></svg>
            {allPicked ? 'All items picked' : `Picking · ${pickedTotal}/${items.length}`}
          </span>
          <button type="button" onClick={() => onExitPick?.()} style={{ fontSize: 12, fontWeight: 800, color: '#fff', background: allPicked ? '#059669' : ACCENT, border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>Done</button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <p style={kick}>Items ({items.length}{items.length ? ` · ${sentTotal} sent` : ''}{pickedTotal ? ` · ${pickedTotal} picked` : ''}){gstF > 1 ? <span style={{ textTransform: 'none', fontWeight: 600, color: 'var(--slate)' }}> · incl GST</span> : null}</p>
        {!pickMode && items.length > 1 && (
          splitMode ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" onClick={moveToNewShipment} disabled={!sel.size}
                style={{ fontSize: 12, fontWeight: 700, color: sel.size ? '#fff' : 'var(--slate)', background: sel.size ? ACCENT : 'var(--border)', border: 'none', borderRadius: 8, padding: '5px 10px', cursor: sel.size ? 'pointer' : 'default' }}>Move {sel.size || ''} to new shipment</button>
              <button type="button" onClick={() => { setSplitMode(false); setSel(new Set()) }} style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate)', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
            </div>
          ) : (
            <button type="button" onClick={() => setSplitMode(true)} title="Split this order into multiple shipments"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: ACCENT, background: 'none', border: 'none', cursor: 'pointer' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></svg>
              Split ship
            </button>
          )
        )}
      </div>

      {splitMode && (
        <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--slate)' }}>Tick the items to move into a separate shipment, then “Move to new shipment”.</p>
      )}

      {!multi && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ordered.map(({ it, idx }) => renderItem(it, idx))}
          {items.length === 0 && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)' }}>No items synced.</p>}
        </div>
      )}

      {multi && groups.map(([g, rows]) => {
        const allSent = rows.every(r => sentOf(r.it))
        return (
          <div key={g} style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 11, padding: 12, background: 'color-mix(in srgb, var(--slate) 3%, transparent)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 800, color: 'var(--ink)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 6, background: ACCENT, color: '#fff', fontSize: 11 }}>{g}</span>
                Shipment {g} · {rows.length} item{rows.length === 1 ? '' : 's'}
                {allSent && <span style={{ color: '#059669', fontSize: 11, fontWeight: 700 }}>✓ All sent</span>}
              </span>
              <button type="button" onClick={() => markGroup(rows, !allSent)} style={{ fontSize: 11.5, fontWeight: 700, color: ACCENT, background: 'none', border: 'none', cursor: 'pointer' }}>{allSent ? 'Unmark all' : 'Mark all sent'}</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rows.map(({ it, idx }) => renderItem(it, idx))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
