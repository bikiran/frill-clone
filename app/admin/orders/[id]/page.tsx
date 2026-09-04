'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser } from '@/lib/client-cache'
import { statusMeta, channelMeta, orderAge, fmtMoney, isClickCollect } from '@/lib/orders'
import { ChannelIcon, CopyBtn, copyToClipboard, TagMenu, CreateLabelModal, TagChip, hashColor, PrintModal } from '../page'
import OrderItemsPanel from '@/components/OrderItemsPanel'
import { barcodeSVG } from '@/lib/barcode'

type Order = any

// Full-page order details — opened when "Show Sidebar" is off on the board, or
// by navigating to /admin/orders/<id> directly.
export default function OrderDetailPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [accent, setAccent] = useState('var(--coral)')
  const [me, setMe] = useState<{ id: string | null; name: string }>({ id: null, name: 'You' })
  const [order, setOrder] = useState<Order | null>(null)
  const [items, setItems] = useState<any[]>([])
  const [pickMode, setPickMode] = useState(false)
  const [notes, setNotes] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [tagDefs, setTagDefs] = useState<{ id: string; name: string; color: string }[]>([])
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])
  const tagColor = (name: string) => tagDefs.find(t => t.name.toLowerCase() === String(name).toLowerCase())?.color || hashColor(name)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [toast, setToast] = useState('')
  const [noteBody, setNoteBody] = useState('')
  const [taskText, setTaskText] = useState('')
  const [addingTag, setAddingTag] = useState(false)
  const [galleryIdx, setGalleryIdx] = useState<number | null>(null)
  const [showLabel, setShowLabel] = useState(false)
  const [printModal, setPrintModal] = useState<{ doc: 'packing_slip' | 'label'; title: string } | null>(null)

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2400) }
  const orderId = typeof window !== 'undefined' ? decodeURIComponent(window.location.pathname.split('/').filter(Boolean).pop() || '') : ''

  const getMyCompanyId = async (): Promise<string | null> => {
    const peeked = peekCompanyUser()?.companyId
    if (peeked) return peeked
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) { const { data: co } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle(); return co?.id || null }
    return null
  }

  const loadRelated = useCallback(async (oid: string, cid: string) => {
    const [it, nt, ev, tk, allO, tg, loc] = await Promise.all([
      (supabase as any).from('order_items').select('*').eq('order_id', oid),
      (supabase as any).from('order_notes').select('*').eq('order_id', oid).order('created_at', { ascending: false }),
      (supabase as any).from('order_events').select('*').eq('order_id', oid).order('created_at', { ascending: false }),
      (supabase as any).from('conversation_tasks').select('*').eq('company_id', cid).eq('order_id', oid).order('created_at', { ascending: false }),
      (supabase as any).from('orders').select('tags').eq('company_id', cid).limit(2000),
      (supabase as any).from('order_tags').select('*').eq('company_id', cid).order('name'),
      (supabase as any).from('company_locations').select('id, label, suburb, is_primary').eq('company_id', cid).order('is_primary', { ascending: false }),
    ])
    setItems(it.data || []); setNotes(nt.data || []); setEvents(ev.data || []); setTasks(tk.data || [])
    setAllTags(Array.from(new Set((allO.data || []).flatMap((o: any) => Array.isArray(o.tags) ? o.tags : []))).filter(Boolean) as string[])
    setTagDefs((tg.data || []).map((t: any) => ({ id: t.id, name: t.name, color: t.color || hashColor(t.name) })))
    setLocations((loc.data || []).map((l: any) => ({ id: l.id, name: l.label || l.suburb || 'Outlet' })))
  }, [])

  useEffect(() => {
    (async () => {
      const cid = await getMyCompanyId()
      if (!cid || !orderId) { setLoading(false); setNotFound(true); return }
      setCompanyId(cid)
      try { const { data: co } = await (supabase as any).from('companies').select('accent_color').eq('id', cid).maybeSingle(); if (co?.accent_color) setAccent(co.accent_color) } catch {}
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) setMe({ id: session.user.id, name: session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || 'You' })
      try {
        const token = session?.access_token
        const res = await fetch(`/api/orders?companyId=${encodeURIComponent(cid)}&id=${encodeURIComponent(orderId)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        const j = await res.json().catch(() => ({}))
        if (!j.order) { setNotFound(true); setLoading(false); return }
        setOrder(j.order)
        await loadRelated(orderId, cid)
      } catch { setNotFound(true) }
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ACCENT = accent

  const patchOrder = async (patch: any, event?: { type: string; detail: string }) => {
    setOrder((o: Order) => ({ ...o, ...patch }))
    try {
      await (supabase as any).from('orders').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', orderId)
      if (event && companyId) {
        const row = { order_id: orderId, company_id: companyId, type: event.type, detail: event.detail, actor_id: me.id, actor_name: me.name }
        const { data } = await (supabase as any).from('order_events').insert(row).select().maybeSingle()
        if (data) setEvents(e => [data, ...e])
      }
    } catch {}
  }
  const logItemEvent = async (type: string, detail: string) => {
    if (!companyId) return
    try {
      const { data } = await (supabase as any).from('order_events').insert({ order_id: orderId, company_id: companyId, type, detail, actor_id: me.id, actor_name: me.name }).select().maybeSingle()
      if (data) setEvents(e => [data, ...e])
    } catch {}
  }
  const addNote = async () => {
    const body = noteBody.trim(); if (!body || !companyId) return
    const mentions = Array.from(body.matchAll(/@(\w[\w.-]*)/g)).map(m => m[1])
    const row = { order_id: orderId, company_id: companyId, author_id: me.id, author_name: me.name, body, mentions }
    try { const { data } = await (supabase as any).from('order_notes').insert(row).select().maybeSingle(); if (data) setNotes(n => [data, ...n]) } catch {}
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
      if (convId && convId !== order.conversation_id) { setOrder((o: Order) => ({ ...o, conversation_id: convId })); try { await (supabase as any).from('orders').update({ conversation_id: convId }).eq('id', orderId) } catch {} }
      if (convId) await (supabase as any).from('conversation_notes').insert({ conversation_id: convId, company_id: companyId, author_name: me.name, content: `[Order ${order.order_number}] ${body}` })
    } catch {}
    setNoteBody('')
  }
  const addTask = async () => {
    const text = taskText.trim(); if (!text || !companyId) return
    const row = { company_id: companyId, text, title: text, done: false, status: 'todo', priority: 'normal', created_by: me.name, created_by_id: me.id, assignees: [], order_id: orderId, order_number: order.order_number, order_customer: order.customer_name, order_total: Number(order.total) || null }
    try {
      let { data, error } = await (supabase as any).from('conversation_tasks').insert(row).select().maybeSingle()
      if (error) { const r = await (supabase as any).from('conversation_tasks').insert({ company_id: companyId, text, done: false, order_id: orderId }).select().maybeSingle(); data = r.data }
      if (data) setTasks(t => [data, ...t])
    } catch {}
    setTaskText('')
  }
  const toggleTask = async (t: any) => {
    const done = !(t.done || t.status === 'done')
    setTasks(ts => ts.map(x => x.id === t.id ? { ...x, done, status: done ? 'done' : 'todo' } : x))
    try { await (supabase as any).from('conversation_tasks').update({ done, status: done ? 'done' : 'todo', completed_at: done ? new Date().toISOString() : null }).eq('id', t.id) } catch {}
  }
  const addTag = (t: string) => { const tag = t.trim(); if (!tag) return; const next = Array.from(new Set([...(order.tags || []), tag])); patchOrder({ tags: next }); setAddingTag(false) }
  const removeTag = (t: string) => patchOrder({ tags: (order.tags || []).filter((x: string) => x !== t) })
  const openPrint = (docType: 'packing_slip' | 'label') => { if (companyId) setPrintModal({ doc: docType, title: docType === 'label' ? 'Shipping Label' : 'Packing Slip' }) }

  const card: React.CSSProperties = { borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card, #fff)', padding: 18 }
  const kick: React.CSSProperties = { margin: 0, fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)' }
  const btn: React.CSSProperties = { padding: '9px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }

  if (loading) return <div style={{ padding: 24, color: 'var(--slate)' }}>Loading order…</div>
  if (notFound || !order) return <div style={{ padding: 24 }}><a href="/admin/orders" style={{ color: ACCENT, fontWeight: 700, textDecoration: 'none' }}>← Orders</a><p style={{ marginTop: 16, color: 'var(--slate)' }}>Order not found.</p></div>

  const sm = statusMeta(order.status)
  const age = orderAge(order.order_date)
  const addr = order.shipping_address || {}
  const contactHref = order.contact_id ? `/admin/customers/profile?id=${order.contact_id}` : null
  const convHref = order.conversation_id ? `/admin/inbox?conversation=${order.conversation_id}` : null

  return (
    <div style={{ padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', maxWidth: 1100, margin: '0 auto' }}>
      <style>{`.od-item:hover{background:var(--canvas)}`}</style>
      <a href="/admin/orders" style={{ color: ACCENT, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>← Orders</a>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, margin: '12px 0 18px' }}>
        <div>
          <h1 onClick={() => copyToClipboard(String(order.order_number), flash)} title="Click to copy order number" style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em', cursor: 'copy', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Order {order.order_number}<CopyBtn onClick={() => copyToClipboard(String(order.order_number), flash)} title="Copy order number" />
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontWeight: 700, padding: '3px 11px', borderRadius: 20, background: sm.bg, color: sm.fg }}>{sm.label}</span>
            <span style={{ color: age.color, fontWeight: 700 }}>{age.label} old</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--slate)' }}><ChannelIcon channel={order.sales_channel} size={14} />{channelMeta(order.sales_channel).label}</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setShowLabel(true)} style={{ ...btn, background: ACCENT, color: '#fff', border: 'none' }}>Create Label</button>
          <button type="button" onClick={() => openPrint('packing_slip')} style={btn}>Packing Slip</button>
          <button type="button" onClick={() => { setPickMode(v => { const n = !v; if (n) { document.getElementById('ord-items-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); flash('Picking — click each item as you pick it') } return n }) }} style={pickMode ? { ...btn, background: ACCENT, color: '#fff', border: 'none' } : btn}>{pickMode ? 'Picking…' : 'Pick'}</button>
          <button type="button" onClick={() => openPrint('label')} style={btn}>Print Label</button>
          {order.status !== 'shipped' && (order.status === 'packed'
            ? <button type="button" onClick={() => patchOrder({ status: 'awaiting_shipment' }, { type: 'unpacked', detail: 'Marked unpacked' })} style={{ ...btn, background: ACCENT, color: '#fff', border: 'none' }}>✓ Packed — Unpack</button>
            : <button type="button" onClick={() => patchOrder({ status: 'packed' }, { type: 'packed', detail: 'Marked packed' })} style={btn}>Mark Packed</button>)}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Customer */}
          <div style={card}>
            <p style={kick}>Customer</p>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {contactHref ? <a href={contactHref} style={{ fontSize: 16, fontWeight: 700, color: ACCENT, textDecoration: 'none' }}>{order.customer_name}</a> : <span style={{ fontSize: 16, fontWeight: 700 }}>{order.customer_name}</span>}
              {order.customer_name && <CopyBtn onClick={() => copyToClipboard(order.customer_name, flash)} title="Copy name" />}
            </div>
            {order.customer_email && <p onClick={() => copyToClipboard(order.customer_email, flash)} title="Click to copy email" style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--slate)', cursor: 'copy', display: 'flex', width: 'fit-content', maxWidth: '100%', alignItems: 'center', gap: 5 }}>{order.customer_email}<CopyBtn onClick={() => copyToClipboard(order.customer_email, flash)} title="Copy email" /></p>}
            {order.customer_phone && <p onClick={() => copyToClipboard(order.customer_phone, flash)} title="Click to copy phone" style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--slate)', cursor: 'copy', display: 'flex', width: 'fit-content', maxWidth: '100%', alignItems: 'center', gap: 5 }}>{order.customer_phone}<CopyBtn onClick={() => copyToClipboard(order.customer_phone, flash)} title="Copy phone" /></p>}
            {convHref && <a href={convHref} style={{ display: 'inline-block', marginTop: 8, fontSize: 13, fontWeight: 700, color: ACCENT, textDecoration: 'none' }}>Open conversation →</a>}
          </div>

          {/* Shipping address */}
          {(addr.address_1 || addr.city) && (
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={kick}>Shipping Address</p>
                <CopyBtn title="Copy address" onClick={() => copyToClipboard([order.customer_name, [addr.address_1, addr.address_2].filter(Boolean).join(', '), [addr.city, (addr.state || '').toUpperCase(), addr.postcode].filter(Boolean).join(' '), addr.country].filter(Boolean).join('\n'), flash)} />
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.6 }}>
                {order.customer_name}<br />
                {[addr.address_1, addr.address_2].filter(Boolean).join(', ')}<br />
                {[addr.city, (addr.state || '').toUpperCase(), addr.postcode].filter(Boolean).join(' ')}<br />
                {addr.country}
              </p>
            </div>
          )}

          {/* Items */}
          <div style={card} id="ord-items-panel">
            <OrderItemsPanel order={order} companyId={companyId} items={items} accent={ACCENT}
              pickMode={pickMode} onExitPick={() => setPickMode(false)}
              onLog={logItemEvent} onFlash={flash} onOpenItem={(idx: number) => setGalleryIdx(idx)} />
          </div>

          {/* Order summary */}
          <div style={card}>
            <p style={kick}>Order Summary</p>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, alignItems: 'center' }}>
                <span style={{ color: 'var(--slate)' }}>Outlet</span>
                {locations.length > 0
                  ? <select value={order.store_location_id || ''} onChange={e => { const v = e.target.value || null; patchOrder({ store_location_id: v }, { type: 'outlet', detail: v ? `Assigned to ${locations.find(l => l.id === v)?.name || 'outlet'}` : 'Outlet cleared' }) }}
                      style={{ fontWeight: 600, fontSize: 13, padding: '4px 7px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--ink)', cursor: 'pointer', maxWidth: 200 }}>
                      <option value="">No outlet</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  : <span style={{ fontWeight: 600 }}>{locations.find(l => l.id === order.store_location_id)?.name || '—'}</span>}
              </div>
              {([
                ['Order Date', order.order_date ? new Date(order.order_date).toLocaleString('en-AU') : '—'],
                ['Payment', order.payment_status || '—'],
                ['Fulfilment', order.fulfilment_status || '—'],
                ['Subtotal', order.subtotal != null ? fmtMoney(order.subtotal, order.currency) : '—'],
                ['Shipping', isClickCollect(order) ? `🏬 ${order.shipping_method || 'Click & Collect'}` : (Number(order.shipping_total) || 0) > 0 ? `${fmtMoney(order.shipping_total, order.currency)}${order.shipping_method ? ` · ${order.shipping_method}` : ''}` : (order.shipping_method || 'Free')],
                ['Total', `${fmtMoney(order.total, order.currency)} ${order.currency || ''}`],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
                  <span style={{ color: 'var(--slate)' }}>{k}</span>
                  <span style={{ fontWeight: k === 'Total' ? 800 : 600, color: 'var(--ink)', textAlign: 'right', textTransform: k === 'Payment' || k === 'Fulfilment' ? 'capitalize' : 'none' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Order barcode — scannable Code128 of the order number, under the order details */}
          {order.order_number && (
            <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div title={`Order ${order.order_number}`} style={{ width: '100%', maxWidth: 360, display: 'flex', justifyContent: 'center' }}
                dangerouslySetInnerHTML={{ __html: barcodeSVG(String(order.order_number), { moduleWidth: 2, height: 58 }) }} />
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.16em', color: 'var(--ink)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{order.order_number}</span>
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Tags */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={kick}>Tags</p>
              <div style={{ position: 'relative' }}>
                <button type="button" onClick={() => setAddingTag(v => !v)} style={{ fontSize: 12.5, fontWeight: 700, color: ACCENT, background: 'none', border: 'none', cursor: 'pointer' }}>{addingTag ? 'Cancel' : '+ Add'}</button>
                {addingTag && <TagMenu tags={Array.from(new Set([...tagDefs.map(t => t.name), ...allTags])).filter(t => !(order.tags || []).includes(t))} accent={ACCENT} align="right" onClose={() => setAddingTag(false)} onPick={addTag} />}
              </div>
            </div>
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(order.tags || []).map((t: string) => <TagChip key={t} name={t} color={tagColor(t)} onRemove={() => removeTag(t)} />)}
              {(order.tags || []).length === 0 && !addingTag && <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>No tags</span>}
            </div>
          </div>

          {/* Tasks */}
          <div style={card}>
            <p style={kick}>Tasks</p>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <input value={taskText} onChange={e => setTaskText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTask() }} placeholder="Add a task…" style={{ flex: 1, padding: '8px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, outline: 'none' }} />
              <button type="button" onClick={addTask} disabled={!taskText.trim()} style={{ padding: '8px 13px', borderRadius: 9, border: 'none', background: taskText.trim() ? ACCENT : 'var(--border)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: taskText.trim() ? 'pointer' : 'default' }}>Add</button>
            </div>
            {tasks.length > 0 && <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {tasks.map((t: any) => { const done = t.done || t.status === 'done'; return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <button type="button" onClick={() => toggleTask(t)} style={{ marginTop: 1, width: 16, height: 16, flexShrink: 0, borderRadius: 4, border: `1.5px solid ${done ? ACCENT : 'var(--slate)'}`, background: done ? ACCENT : 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>{done && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}</button>
                  <span style={{ fontSize: 13, color: done ? 'var(--slate)' : 'var(--ink)', textDecoration: done ? 'line-through' : 'none' }}>{t.title || t.text}</span>
                </div>
              ) })}
            </div>}
          </div>

          {/* Timeline + notes */}
          <div style={card}>
            <p style={kick}>Order Timeline</p>
            <div style={{ display: 'flex', gap: 6, margin: '10px 0' }}>
              <textarea value={noteBody} onChange={e => setNoteBody(e.target.value)} placeholder="Add a note… use @ to mention someone" rows={2} style={{ flex: 1, padding: '8px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }} />
              <button type="button" onClick={addNote} disabled={!noteBody.trim()} style={{ padding: '0 13px', borderRadius: 9, border: 'none', background: noteBody.trim() ? ACCENT : 'var(--border)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: noteBody.trim() ? 'pointer' : 'default' }}>Note</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
              {notes.map((n: any) => (
                <div key={n.id} style={{ padding: '9px 12px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a' }}>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{n.body}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--slate)' }}>{n.author_name || 'Someone'} · {n.created_at ? new Date(n.created_at).toLocaleString('en-AU') : ''}</p>
                </div>
              ))}
              {events.map((ev: any) => (
                <div key={ev.id} style={{ display: 'flex', gap: 9 }}>
                  <span style={{ marginTop: 5, width: 7, height: 7, borderRadius: '50%', background: ACCENT, flexShrink: 0 }} />
                  <div>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)' }}>{ev.detail || ev.type}</p>
                    <p style={{ margin: '1px 0 0', fontSize: 11, color: 'var(--slate)' }}>{ev.created_at ? new Date(ev.created_at).toLocaleString('en-AU') : ''}{ev.actor_name ? ` by ${ev.actor_name}` : ''}</p>
                  </div>
                </div>
              ))}
              {notes.length === 0 && events.length === 0 && <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)' }}>No activity yet.</p>}
            </div>
          </div>
        </div>
      </div>

      {toast && <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', background: 'var(--ink)', color: '#fff', padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 5000 }}>{toast}</div>}

      {showLabel && <CreateLabelModal order={order} companyId={companyId!} accent={ACCENT} onClose={() => setShowLabel(false)} onDone={(patch: any) => { patchOrder(patch); setShowLabel(false); loadRelated(orderId, companyId!) }} onFlash={flash} onPrintLabel={() => openPrint('label')} />}

      {printModal && <PrintModal doc={printModal.doc} companyId={companyId!} ids={[orderId]} title={printModal.title} accent={ACCENT} onClose={() => setPrintModal(null)} />}

      {/* Item gallery */}
      {galleryIdx != null && items[galleryIdx] && (() => {
        const it = items[galleryIdx]; const multi = items.length > 1
        const go = (d: number) => setGalleryIdx(i => (((i as number) + d + items.length) % items.length))
        return (
          <div onClick={() => setGalleryIdx(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 4700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card,#fff)', borderRadius: 16, width: 480, maxWidth: '94vw', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }}>
              <div style={{ position: 'relative', height: 340, background: 'var(--peach)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {it.image_url ? <img src={it.image_url} alt={it.product_name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} onError={(e: any) => { e.currentTarget.style.display = 'none' }} /> : <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /></svg>}
                <button type="button" onClick={() => setGalleryIdx(null)} style={{ position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 16, cursor: 'pointer' }}>✕</button>
                {multi && <>
                  <button type="button" onClick={() => go(-1)} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 18, cursor: 'pointer' }}>‹</button>
                  <button type="button" onClick={() => go(1)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 18, cursor: 'pointer' }}>›</button>
                </>}
              </div>
              <div style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.35 }}>{it.product_name}</h3>
                  <span style={{ fontSize: 18, fontWeight: 800, whiteSpace: 'nowrap' }}>{fmtMoney(it.total_price ?? it.unit_price, order.currency)}</span>
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
    </div>
  )
}
