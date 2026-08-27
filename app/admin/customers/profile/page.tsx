'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useSearchParams, useRouter } from 'next/navigation'
import { SegmentationService } from '@/lib/segmentation-service'

export default function CustomerProfilePage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const customerId = searchParams.get('id')
  const slug = searchParams.get('slug')

  const [customer, setCustomer] = useState<any>(null)
  const [orders, setOrders] = useState<any[]>([])
  const [calls, setCalls] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [expandedProducts, setExpandedProducts] = useState<Set<number>>(new Set())

  // Contact-centric data (relationship / tags / address / notes / tasks live on
  // the contact + its conversation, not on the woo customer record).
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [contactId, setContactId] = useState<string | null>(null)
  const [contactRow, setContactRow] = useState<any>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [me, setMe] = useState<{ id: string | null; name: string }>({ id: null, name: 'You' })
  const [notes, setNotes] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [noteBody, setNoteBody] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [taskText, setTaskText] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [savingTask, setSavingTask] = useState(false)
  const noteRef = useRef<HTMLTextAreaElement | null>(null)
  const taskRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const init = async () => {
      try {
        if (!customerId) { setError('Missing customer ID'); return }

        // Three-strategy company resolution
        let resolvedCompanyId: string | null = null
        if (slug) {
          const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle()
          if (co) resolvedCompanyId = co.id
        }
        if (!resolvedCompanyId && typeof window !== 'undefined') {
          const h = window.location.hostname
          if (h.endsWith('.colvy.com') && h !== 'colvy.com' && h !== 'www.colvy.com') {
            const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', h.replace('.colvy.com', '')).maybeSingle()
            if (co) resolvedCompanyId = co.id
          }
        }
        if (!resolvedCompanyId) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user) {
            const { data: ownCo } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
            if (ownCo?.id) resolvedCompanyId = ownCo.id
          }
        }
        if (!resolvedCompanyId) { setError('Company not found'); return }

        // The id param may be a woocommerce_customers.id OR a contacts.id
        // (the inbox links with the contact id). Try both, then fall back to
        // matching by email.
        let customerData: any = null

        // 1. Direct woocommerce_customers lookup
        const { data: byId } = await (supabase as any)
          .from('woocommerce_customers').select('*')
          .eq('company_id', resolvedCompanyId).eq('id', customerId).maybeSingle()
        if (byId) customerData = byId

        // 2. Maybe it's a contact id — resolve the email, then find the woo customer
        let contactEmail: string | null = null
        if (!customerData) {
          const { data: contact } = await (supabase as any)
            .from('contacts').select('*').eq('id', customerId).maybeSingle()
          if (contact) {
            contactEmail = contact.email
            if (contact.email) {
              const { data: byEmail } = await (supabase as any)
                .from('woocommerce_customers').select('*')
                .eq('company_id', resolvedCompanyId).ilike('email', contact.email).maybeSingle()
              if (byEmail) customerData = byEmail
            }
            // No matching woo customer — show the contact as a minimal customer
            if (!customerData) {
              customerData = {
                id: contact.id, email: contact.email,
                first_name: (contact.name || '').split(' ')[0] || '',
                last_name: (contact.name || '').split(' ').slice(1).join(' ') || '',
                phone: contact.phone, total_orders: 0, total_spend: 0,
                items_purchased: [], is_contact_only: true,
              }
            }
          }
        }

        if (!customerData) { setError('Customer not found'); return }
        setCustomer(customerData)
        // Show the profile NOW — the header, stats and contact info are ready.
        // Orders and calls below (which include a slow live WooCommerce fetch)
        // fill in progressively instead of holding the whole page on a spinner.
        setLoading(false)

        // Load order history — match by woo_customer_id OR email (guest orders
        // often have customer_id 0 but the same billing email)
        try {
          const email = customerData.email || contactEmail
          let ordersData: any[] = []
          if (customerData.woo_customer_id) {
            const { data: byCust } = await (supabase as any)
              .from('woocommerce_orders').select('*')
              .eq('company_id', resolvedCompanyId)
              .eq('woo_customer_id', customerData.woo_customer_id)
              .order('order_date', { ascending: false })
            ordersData = byCust || []
          }
          if (email) {
            const { data: byEmailOrders } = await (supabase as any)
              .from('woocommerce_orders').select('*')
              .eq('company_id', resolvedCompanyId)
              .ilike('customer_email', email)
              .order('order_date', { ascending: false })
            // Merge, dedupe by woo_order_id
            const seen = new Set(ordersData.map((o: any) => o.woo_order_id))
            for (const o of byEmailOrders || []) {
              if (!seen.has(o.woo_order_id)) { ordersData.push(o); seen.add(o.woo_order_id) }
            }
          }
          ordersData.sort((a: any, b: any) => (b.order_date || '').localeCompare(a.order_date || ''))

          // Live fallback: if nothing has synced yet, pull orders straight from
          // WooCommerce (same as the inbox sidebar does), so the profile isn't
          // blank just because the background sync hasn't caught up.
          if (ordersData.length === 0 && email) {
            try {
              const res = await fetch(`/api/orders/list?companyId=${resolvedCompanyId}&email=${encodeURIComponent(email)}`)
              const live = await res.json()
              if (live.orders?.length) {
                ordersData = live.orders.map((o: any) => ({
                  woo_order_id: o.id, order_number: o.number, status: o.status, total: o.total,
                  currency: o.currency, order_date: o.date, customer_email: email,
                  line_items: o.items, _live: true,
                }))
              }
            } catch {}
          }
          setOrders(ordersData)
          // If the customer record has no address, derive it from the most recent
          // order's billing so the profile still shows where they are.
          if (!customerData.address?.address_1 && !customerData.address?.city) {
            const withAddr = ordersData.find((o: any) => o.billing?.address_1 || o.billing?.city)
            if (withAddr?.billing) {
              setCustomer((prev: any) => prev ? { ...prev, address: withAddr.billing } : prev)
            }
          }
        } catch { setOrders([]) }

        // Resolve the linked CONTACT (relationship / tags / address / notes /
        // tasks all live on the contact + its conversation, not the woo row).
        let cid: string | null = customerData.is_contact_only ? customerData.id : (customerData.contact_id || null)
        let contactRecord: any = null
        try {
          if (cid) {
            const { data } = await (supabase as any).from('contacts').select('*').eq('id', cid).maybeSingle()
            contactRecord = data
          }
          if (!contactRecord && customerData.email) {
            const { data } = await (supabase as any).from('contacts').select('*')
              .eq('company_id', resolvedCompanyId).ilike('email', customerData.email).maybeSingle()
            if (data) { contactRecord = data; cid = data.id }
          }
        } catch {}
        setContactId(cid); setContactRow(contactRecord); setCompanyId(resolvedCompanyId)

        // Who's viewing — for note/task authorship.
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user) setMe({ id: session.user.id, name: session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || 'You' })
        } catch {}

        // The contact's conversation, so notes/tasks anchor to the same thread
        // the inbox uses.
        let convId: string | null = null
        try {
          if (cid) {
            const { data: conv } = await (supabase as any).from('conversations').select('id')
              .eq('company_id', resolvedCompanyId).eq('contact_id', cid)
              .order('last_message_at', { ascending: false }).limit(1).maybeSingle()
            convId = conv?.id || null
            setConversationId(convId)
          }
        } catch {}

        // Load call history for this contact
        try {
          if (cid) {
            const { data: callData } = await (supabase as any)
              .from('calls').select('*')
              .eq('company_id', resolvedCompanyId)
              .eq('contact_id', cid)
              .order('created_at', { ascending: false }).limit(20)
            setCalls(callData || [])
          }
        } catch { setCalls([]) }

        // Notes — a real woo customer has its own customer_notes store; a
        // contact's notes live on its conversation.
        try {
          if (!customerData.is_contact_only && customerData.id) {
            const { data } = await (supabase as any).from('customer_notes').select('*')
              .eq('customer_id', customerData.id).eq('company_id', resolvedCompanyId)
              .order('created_at', { ascending: false })
            setNotes((data || []).map((n: any) => ({ id: n.id, content: n.content, author: n.author_name || null, created_at: n.created_at })))
          } else if (convId) {
            const { data } = await (supabase as any).from('conversation_notes').select('*')
              .eq('conversation_id', convId).order('created_at', { ascending: false })
            setNotes((data || []).map((n: any) => ({ id: n.id, content: n.content, author: n.author_name || null, created_at: n.created_at })))
          }
        } catch {}

        // Tasks — conversation_tasks anchored to this contact's thread.
        try {
          if (convId) {
            const { data } = await (supabase as any).from('conversation_tasks').select('*')
              .eq('conversation_id', convId).order('created_at', { ascending: false })
            setTasks(data || [])
          }
        } catch {}
      } catch (err: any) {
        setError(err.message || 'Failed to load customer')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [slug, customerId])

  if (loading) return <div style={{ padding: '24px', color: '#666', display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 18, height: 18, border: '2px solid var(--border)', borderTopColor: 'var(--coral)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />Loading customer profile...</div>
  if (error) return <div style={{ padding: '24px', color: '#d32f2f' }}>{error}</div>
  if (!customer) return <div style={{ padding: '24px', color: '#666' }}>Customer not found</div>

  // First/last order dates: prefer the aggregate columns, but fall back to the
  // fetched order history — the aggregates are often null on the customer row
  // (which is exactly what made the RFM score read 0 and mislabel the customer).
  const validDate = (v: any) => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d }
  const custFirst = validDate(customer.first_order_date)
  const custLast = validDate(customer.last_order_date)
  const orderDates = orders.map((o: any) => validDate(o.order_date)).filter(Boolean) as Date[]
  const firstOrderDate = custFirst || (orderDates.length ? orderDates.reduce((a, b) => (a < b ? a : b)) : null)
  const lastOrderDate = custLast || (orderDates.length ? orderDates.reduce((a, b) => (a > b ? a : b)) : null)
  const daysSinceLast = lastOrderDate ? Math.floor((Date.now() - lastOrderDate.getTime()) / 864e5) : null

  // Total spend: prefer the stored value, but if $0 fall back to summing orders
  const totalSpend = parseFloat(customer.total_spend) || 0
  const ordersSpendTotal = orders.reduce((s, o) => s + (parseFloat(o.total || o.order_total || 0)), 0)
  const displaySpend = totalSpend > 0 ? totalSpend : ordersSpendTotal

  // Products: items_purchased can be string[] or object[] from WooCommerce line items
  const rawItems: any[] = (() => {
    let ip: any = customer.items_purchased
    // Fallback: if the customer record has no items_purchased (e.g. a guest
    // customer, or matched via live order fallback), derive the list from the
    // line items across their orders — so Products Purchased still populates.
    if (!ip || (Array.isArray(ip) && ip.length === 0)) {
      const seen = new Map<string, any>()
      for (const o of orders) {
        for (const li of (o.line_items || [])) {
          const name = li.name || li.product_name || li.title
          if (!name) continue
          const key = String(li.product_id || name)
          const existing = seen.get(key)
          const qty = li.quantity || 1
          if (existing) existing.quantity += qty
          else seen.set(key, { name, product_id: li.product_id, image: li.image, quantity: qty })
        }
      }
      if (seen.size > 0) return Array.from(seen.values())
    }
    if (!ip) return []
    // May arrive as a JSON string, a comma-joined string, or a JSONB array
    if (typeof ip === 'string') {
      try { ip = JSON.parse(ip) } catch { ip = ip.split(',').map((s: string) => s.trim()) }
    }
    if (!Array.isArray(ip)) return []
    return ip
      .map((x: any) => {
        if (x == null) return null
        if (typeof x === 'string') return x.trim() ? { name: x.trim() } : null
        if (typeof x === 'object') {
          const name = x.name || x.product_name || x.title || x.label || ''
          if (!name && Object.keys(x).length === 0) return null
          return { ...x, name: name || 'Unnamed product' }
        }
        return { name: String(x) }
      })
      .filter(Boolean)
  })()

  const filteredProducts = rawItems.filter((item: any) => {
    if (!productSearch) return true
    const name = (item.name || item.product_name || '').toLowerCase()
    const cat = (item.category || '').toLowerCase()
    return name.includes(productSearch.toLowerCase()) || cat.includes(productSearch.toLowerCase())
  })

  const addr = customer.address || {}

  // Order-based fallback stats (used when aggregated totals are missing/zero)
  const computedOrders = orders.length
  const displayOrders = customer.total_orders || computedOrders || 0
  const displayAov = displayOrders > 0 ? displaySpend / displayOrders : 0
  const orderItems: any[] = orders.flatMap((o: any) => Array.isArray(o.line_items) ? o.line_items : [])

  // Score RFM from the EFFECTIVE (order-derived) totals and dates, not the raw
  // customer row — otherwise a recent high-value customer whose aggregate
  // columns are still null scores 0/9 and reads "Lost". The lifecycle label
  // also treats a single recent order as "New customer" rather than lapsed.
  const rfmOverride = { totalSpend: displaySpend, totalOrders: displayOrders, lastOrderDate: lastOrderDate, firstOrderDate: firstOrderDate }
  const rfmScore = SegmentationService.getRFMScore(customer, rfmOverride)
  const rfmCategory = SegmentationService.getLifecycleLabel(customer, rfmOverride)

  // ── Presentation helpers ──────────────────────────────────────────────────
  const fullName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || customer.email || 'Customer'
  const initials = (((customer.first_name?.[0] || '') + (customer.last_name?.[0] || '')).toUpperCase()
    || (customer.email?.[0] || '?').toUpperCase())
  // Deterministic soft avatar colour from the name (no Math.random — SSR-safe).
  const hue = Array.from(String(customer.email || fullName)).reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  const avatarBg = `hsl(${hue} 65% 93%)`
  const avatarFg = `hsl(${hue} 50% 42%)`
  // Status pill from the RFM band.
  const status = rfmScore >= 6
    ? { bg: '#dcfce7', fg: '#15803d', dot: '#22c55e' }
    : rfmScore >= 3
      ? { bg: '#fef3c7', fg: '#b45309', dot: '#f59e0b' }
      : { bg: '#fee2e2', fg: '#dc2626', dot: '#ef4444' }
  const tags: string[] = Array.isArray((customer as any).tags) ? (customer as any).tags.filter(Boolean) : []
  const fmtMoney = (n: number) => `$${n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  // A real woo customer keeps its own customer_notes; a contact-only record uses
  // the conversation store.
  const wooCustomerId = customer && !customer.is_contact_only ? customer.id : null
  const RELATIONSHIPS: [string, string][] = [['customer', 'Customer'], ['supplier', 'Supplier'], ['wholesaler', 'Wholesaler'], ['business', 'Business contact']]
  const relationship = contactRow?.relationship_type || 'customer'

  // Contact address (flat text columns) as a fallback to the woo nested address.
  const contactAddrStr = contactRow
    ? [contactRow.address, contactRow.suburb || contactRow.city, (contactRow.state || '').toUpperCase(), contactRow.postcode, contactRow.country].filter(Boolean).join(', ')
    : ''
  const hasWooAddr = !!(addr.address_1 || addr.city)
  const allTags: string[] = Array.from(new Set([
    ...(Array.isArray((customer as any).tags) ? (customer as any).tags : []),
    ...(Array.isArray(contactRow?.tags) ? contactRow.tags : []),
  ].filter(Boolean)))

  // Recent Activity — no contact timeline table exists, so synthesise one from
  // orders + calls + notes + tasks + the contact's creation.
  const activity = [
    ...orders.map((o: any) => ({ t: o.order_date, icon: '🛒', label: `Order #${o.woo_order_id} ${o.status || 'placed'}` })),
    ...calls.map((c: any) => ({ t: c.created_at, icon: c.direction === 'inbound' ? '📥' : '📤', label: `${c.direction === 'inbound' ? 'Incoming' : 'Outgoing'} call${c.status ? ` · ${c.status}` : ''}` })),
    ...notes.map((n: any) => ({ t: n.created_at, icon: '📝', label: 'Note added' })),
    ...tasks.map((t: any) => ({ t: t.created_at, icon: '✅', label: `Task: ${t.title || t.text || ''}`.trim() })),
    ...(contactRow?.created_at ? [{ t: contactRow.created_at, icon: '👤', label: 'Contact created' }] : []),
  ].filter(a => a.t).sort((a, b) => new Date(b.t).getTime() - new Date(a.t).getTime()).slice(0, 8)

  const relTime = (v: string) => {
    const d = new Date(v).getTime(); if (isNaN(d)) return ''
    const mins = Math.floor((Date.now() - d) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24); if (days < 30) return `${days}d ago`
    return new Date(v).toLocaleDateString()
  }

  // "Fill from order": recover blank contact fields (name / phone / address /
  // company) from a linked WooCommerce order's billing. Same two conditions as
  // the inbox: a loaded order with billing, and at least one blank field.
  const orderBilling = orders.map((o: any) => o.billing).find((x: any) => x && (x.first_name || x.last_name || x.phone || x.address_1))
  const curName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || contactRow?.name || ''
  const curPhone = customer.phone || contactRow?.phone || ''
  const curHasAddr = hasWooAddr || !!contactAddrStr
  const curCompany = contactRow?.company_name || (customer as any).company_name || ''
  const fillPatch = (() => {
    const b = orderBilling
    if (!b || !contactId) return null
    const billingName = `${b.first_name || ''} ${b.last_name || ''}`.trim()
    const billingAddr = [b.address_1, b.address_2].filter(Boolean).join(', ')
    const patch: any = {}
    if (!curName && billingName) patch.name = billingName
    if (!curPhone && b.phone) patch.phone = b.phone
    if (!curHasAddr && billingAddr) { patch.address = billingAddr; patch.city = b.city || null; patch.state = b.state || null; patch.postcode = b.postcode || null; patch.country = b.country || null }
    if (!curCompany && b.company) patch.company_name = b.company
    return Object.keys(patch).length ? patch : null
  })()
  const fillFromOrder = async () => {
    if (!fillPatch || !contactId) return
    try { await (supabase as any).from('contacts').update(fillPatch).eq('id', contactId) } catch {}
    setContactRow((c: any) => ({ ...(c || {}), ...fillPatch }))
    setCustomer((c: any) => {
      const nx = { ...c }
      if (fillPatch.name) { const p = String(fillPatch.name).split(' '); nx.first_name = p[0]; nx.last_name = p.slice(1).join(' ') }
      if (fillPatch.phone) nx.phone = fillPatch.phone
      if (fillPatch.address) nx.address = { ...(c.address || {}), address_1: fillPatch.address, city: fillPatch.city, state: fillPatch.state, postcode: fillPatch.postcode, country: fillPatch.country }
      return nx
    })
  }

  // Anchor notes/tasks to the contact's conversation (create one lazily if the
  // contact has never had a thread) so they show in the inbox too.
  const ensureConversationId = async (): Promise<string | null> => {
    if (conversationId) return conversationId
    if (!companyId || !contactId) return null
    try {
      const { data } = await (supabase as any).from('conversations')
        .insert({ company_id: companyId, contact_id: contactId, channel: 'note', status: 'open', last_message_at: new Date().toISOString() })
        .select('id').maybeSingle()
      if (data?.id) { setConversationId(data.id); return data.id }
    } catch {}
    return null
  }

  const addNote = async () => {
    const body = noteBody.trim()
    if (!body || !companyId || savingNote) return
    setSavingNote(true)
    try {
      if (wooCustomerId) {
        const { data } = await (supabase as any).from('customer_notes')
          .insert({ customer_id: wooCustomerId, company_id: companyId, created_by: me.id, content: body }).select().maybeSingle()
        setNotes(ns => [{ id: data?.id || `tmp-${Date.now()}`, content: body, author: me.name, created_at: data?.created_at || new Date().toISOString() }, ...ns])
      } else {
        const convId = await ensureConversationId()
        if (!convId) return
        const { data } = await (supabase as any).from('conversation_notes')
          .insert({ conversation_id: convId, company_id: companyId, author_name: me.name, content: body }).select().maybeSingle()
        setNotes(ns => [{ id: data?.id || `tmp-${Date.now()}`, content: body, author: me.name, created_at: data?.created_at || new Date().toISOString() }, ...ns])
      }
      setNoteBody('')
    } catch {} finally { setSavingNote(false) }
  }

  const addTask = async () => {
    const text = taskText.trim()
    if (!text || !companyId || savingTask) return
    setSavingTask(true)
    try {
      const due = taskDue ? new Date(taskDue).toISOString() : null
      const convId = contactId ? await ensureConversationId() : null
      const full: any = {
        company_id: companyId, text, title: text, done: false, status: 'todo', priority: 'normal',
        created_by: me.name, created_by_id: me.id, assignees: [], mentions: [], order_customer: fullName,
        ...(convId ? { conversation_id: convId } : {}), ...(due ? { due_date: due } : {}),
      }
      let inserted: any = null
      const { data, error } = await (supabase as any).from('conversation_tasks').insert(full).select().maybeSingle()
      if (error) {
        // Retry with only core columns for an un-migrated DB.
        const { data: d2 } = await (supabase as any).from('conversation_tasks')
          .insert({ company_id: companyId, text, done: false, ...(convId ? { conversation_id: convId } : {}), ...(due ? { due_date: due } : {}) }).select().maybeSingle()
        inserted = d2
      } else inserted = data
      if (inserted) setTasks(ts => [inserted, ...ts])
      setTaskText(''); setTaskDue('')
    } catch {} finally { setSavingTask(false) }
  }

  const toggleTask = async (t: any) => {
    const done = !(t.done || t.status === 'done')
    setTasks(ts => ts.map(x => x.id === t.id ? { ...x, done, status: done ? 'done' : 'todo' } : x))
    try {
      await (supabase as any).from('conversation_tasks')
        .update({ done, status: done ? 'done' : 'todo', completed_at: done ? new Date().toISOString() : null, completed_by: done ? me.name : null })
        .eq('id', t.id)
    } catch {}
  }

  const updateRelationship = async (rt: string) => {
    if (!contactId) return
    setContactRow((c: any) => ({ ...(c || {}), relationship_type: rt }))
    try { await (supabase as any).from('contacts').update({ relationship_type: rt, ...(rt === 'customer' ? {} : { subscribed_to_marketing: false }) }).eq('id', contactId) } catch {}
  }

  const focusNote = () => { noteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => noteRef.current?.focus(), 300) }
  const focusTask = () => { taskRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => taskRef.current?.focus(), 300) }

  const card: React.CSSProperties = { borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card, #fff)', padding: 18 }
  const cardTitle: React.CSSProperties = { margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }
  const kicker: React.CSSProperties = { margin: '0 0 4px', fontSize: 10.5, color: 'var(--slate)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }
  const ghostBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card, #fff)', color: 'var(--ink)', fontSize: 13, fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }

  // Compact icon-topped stat card.
  const statCard = (icon: React.ReactNode, label: string, value: string, sub?: string, accent = 'var(--coral)') => (
    <div style={{ ...card, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <span style={{ width: 34, height: 34, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${accent} 13%, transparent)`, color: accent }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <p style={kicker}>{label}</p>
        <p style={{ margin: 0, fontSize: 21, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</p>
        {sub && <p style={{ margin: '2px 0 0', fontSize: 11.5, fontWeight: 600, color: 'var(--slate)' }}>{sub}</p>}
      </div>
    </div>
  )
  const I = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

  return (
    <div style={{ padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* ── MAIN COLUMN ─────────────────────────────────────────────────── */}
        <div style={{ flex: '1 1 620px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Header card */}
          <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ width: 60, height: 60, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: avatarBg, color: avatarFg, fontSize: 21, fontWeight: 800 }}>{initials}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 3px', color: 'var(--ink)', letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName}</h1>
              <p style={{ margin: '0 0 7px', fontSize: 13.5, color: 'var(--slate)', overflowWrap: 'anywhere' }}>{customer.email}</p>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 20, background: status.bg, color: status.fg, fontSize: 11.5, fontWeight: 700 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: status.dot }} /> {rfmCategory}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {customer.phone && (
                <button type="button" style={ghostBtn}
                  onClick={() => window.dispatchEvent(new CustomEvent('colvy:dial', { detail: { number: customer.phone, name: fullName, contactId: contactId || undefined, autoStart: true } }))}>
                  <svg width="15" height="15" viewBox="0 0 24 24" {...I}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  Call
                </button>
              )}
              {(conversationId || contactId) && (
                <button type="button" style={ghostBtn}
                  onClick={() => router.push(conversationId ? `/admin/inbox?conversation=${conversationId}` : `/admin/inbox?contact=${contactId}&channel=sms`)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" {...I}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  Message
                </button>
              )}
              {customer.email && (
                <button type="button" style={ghostBtn}
                  onClick={() => router.push(contactId ? `/admin/inbox?contact=${contactId}&channel=email` : conversationId ? `/admin/inbox?conversation=${conversationId}` : '/admin/inbox')}>
                  <svg width="15" height="15" viewBox="0 0 24 24" {...I}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
                  Email
                </button>
              )}
              <button type="button" onClick={focusNote} style={ghostBtn}>
                <svg width="15" height="15" viewBox="0 0 24 24" {...I}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                Add note
              </button>
              <button type="button" onClick={focusTask} style={{ ...ghostBtn, border: 'none', background: 'var(--coral)', color: '#fff' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" {...I}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                Create task
              </button>
            </div>
          </div>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            {statCard(<svg width="17" height="17" viewBox="0 0 24 24" {...I}><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>, 'RFM Score', `${rfmScore}/9`, rfmCategory, '#3b82f6')}
            {statCard(<svg width="17" height="17" viewBox="0 0 24 24" {...I}><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>, 'Total Spend', displaySpend > 0 ? fmtMoney(displaySpend) : 'N/A', 'Lifetime', '#16a34a')}
            {statCard(<svg width="17" height="17" viewBox="0 0 24 24" {...I}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>, 'Total Orders', String(displayOrders), displayOrders === 1 ? 'Order' : 'Orders', '#7c3aed')}
            {statCard(<svg width="17" height="17" viewBox="0 0 24 24" {...I}><path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.2" fill="currentColor" stroke="none"/></svg>, 'Avg Order Value', displayAov > 0 ? fmtMoney(displayAov) : 'N/A', 'Per order', '#d97706')}
          </div>

          {/* Contact Information */}
          <div style={card}>
            <h3 style={cardTitle}>Contact Information</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <p style={kicker}>Email</p>
                {customer.email ? (
                  <button type="button"
                    onClick={() => router.push(contactId ? `/admin/inbox?contact=${contactId}&channel=email` : conversationId ? `/admin/inbox?conversation=${conversationId}` : '/admin/inbox')}
                    title="Email in Colvy"
                    style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--coral)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', overflowWrap: 'anywhere' }}>{customer.email}</button>
                ) : <span style={{ fontSize: 13.5, color: 'var(--slate)' }}>—</span>}
              </div>
              {customer.phone && (
                <div style={{ minWidth: 0 }}>
                  <p style={kicker}>Phone</p>
                  <button type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('colvy:dial', { detail: { number: customer.phone, name: fullName, contactId: contactId || undefined, autoStart: true } }))}
                    title="Call in Colvy"
                    style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>{customer.phone}</button>
                </div>
              )}
              {hasWooAddr ? (
                <div style={{ minWidth: 0 }}>
                  <p style={kicker}>Address</p>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', lineHeight: 1.5 }}>
                    {[addr.address_1, addr.address_2].filter(Boolean).join(', ')}
                    {(addr.address_1 || addr.address_2) && <br />}
                    {[addr.city, (addr.state || '').toUpperCase(), addr.postcode].filter(Boolean).join(' ')}
                    {(addr.city || addr.state || addr.postcode) && addr.country && <br />}
                    {addr.country}
                  </p>
                </div>
              ) : contactAddrStr && (
                <div style={{ minWidth: 0 }}>
                  <p style={kicker}>Address</p>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', lineHeight: 1.5 }}>{contactAddrStr}</p>
                </div>
              )}
              {firstOrderDate && (
                <div style={{ minWidth: 0 }}>
                  <p style={kicker}>Customer Since</p>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{firstOrderDate.toLocaleDateString()}</p>
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <p style={kicker}>Relationship</p>
                {contactId ? (
                  <select value={relationship} onChange={e => updateRelationship(e.target.value)}
                    style={{ fontSize: 13, fontWeight: 600, padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card, #fff)', color: 'var(--ink)', cursor: 'pointer' }}>
                    {RELATIONSHIPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                ) : (
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', textTransform: 'capitalize' }}>{relationship}</p>
                )}
              </div>
            </div>
            {allTags.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <p style={kicker}>Tags</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {allTags.map((t, i) => (
                    <span key={i} style={{ padding: '3px 10px', borderRadius: 20, background: 'var(--canvas)', border: '1px solid var(--border)', fontSize: 11.5, fontWeight: 600, color: 'var(--slate)' }}>{t}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

      {/* Products Purchased — searchable accordion list */}
      {rawItems.length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
              Products Purchased ({rawItems.length})
            </h3>
            <input
              type="text" placeholder="Search products..."
              value={productSearch} onChange={e => setProductSearch(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none', minWidth: 200 }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 520, overflowY: 'auto', paddingRight: 4 }}>
            {filteredProducts.length === 0 && <p style={{ color: '#888', fontSize: 13 }}>No products match your search.</p>}
            {filteredProducts.map((item: any, idx: number) => {
              // WooCommerce line items vary in shape depending on how they were
              // synced. Be generous about where the name/price/qty might live —
              // previously an unrecognised shape rendered as an empty grey bar.
              const name =
                item.name || item.product_name || item.title ||
                item.parent_name || item.product?.name ||
                (item.sku ? `SKU ${item.sku}` : '') ||
                (item.product_id ? `Product #${item.product_id}` : '') ||
                'Unnamed product'
              const category = item.category || item.categories?.[0]?.name || ''
              const rawImage = item.image?.src || item.image || item.images?.[0]?.src || item.thumbnail || ''
              const image = typeof rawImage === 'string' ? rawImage : ''
              const rawPrice = item.price ?? item.total ?? item.subtotal ?? item.line_total ?? ''
              const price = typeof rawPrice === 'object' ? '' : rawPrice
              const qty = item.quantity ?? item.qty ?? ''
              const description = item.description || item.short_description || ''
              const sku = item.sku || ''
              const isOpen = expandedProducts.has(idx)
              return (
                <div key={idx} style={{ borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', background: isOpen ? 'var(--canvas)' : 'var(--card, #fff)' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const next = new Set(expandedProducts)
                      if (isOpen) next.delete(idx); else next.add(idx)
                      setExpandedProducts(next)
                    }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    {/* Fixed thumbnail box: a fallback icon always sits behind, and
                        the photo fills the box on top — so a broken/oversized image
                        can never collapse or overflow the row. */}
                    <span style={{ position: 'relative', width: 44, height: 44, borderRadius: 9, flexShrink: 0, overflow: 'hidden', background: 'var(--peach)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                      {image && (
                        <img src={image} alt="" loading="lazy" decoding="async"
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e: any) => { e.currentTarget.style.display = 'none' }} />
                      )}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
                      {category && <p style={{ margin: '2px 0 0 0', fontSize: 11, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{category}</p>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                      {qty !== '' && qty != null && <span style={{ fontSize: 12, color: 'var(--slate)', whiteSpace: 'nowrap' }}>×{qty}</span>}
                      {price !== '' && !isNaN(parseFloat(price)) && <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap' }}>${parseFloat(price).toFixed(2)}</span>}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
                    </div>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '10px 14px 14px', borderTop: '1px solid var(--border)', fontSize: 13, color: '#555', lineHeight: 1.5 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: description ? 10 : 0 }}>
                        {qty && <div><span style={{ fontSize: 10.5, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Quantity</span>{qty}</div>}
                        {price !== '' && !isNaN(parseFloat(price)) && <div><span style={{ fontSize: 10.5, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Price</span>${parseFloat(price).toFixed(2)}</div>}
                        {category && <div><span style={{ fontSize: 10.5, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Category</span>{category}</div>}
                        {sku && <div><span style={{ fontSize: 10.5, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>SKU</span>{sku}</div>}
                      </div>
                      {description ? <p style={{ margin: 0 }}>{description.replace(/<[^>]+>/g, '')}</p> : (!qty && !price && !category && !sku && <p style={{ margin: 0, color: '#9ca3af' }}>No further details available for this product.</p>)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Call History */}
      {calls.length > 0 && (
        <div style={card}>
          <h3 style={cardTitle}>Call History ({calls.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {calls.map((call: any) => {
              const dur = call.duration_seconds || 0
              const durStr = dur > 0 ? `${Math.floor(dur / 60)}m ${dur % 60}s` : (call.status === 'completed' ? 'No answer' : call.status)
              return (
                <div key={call.id} style={{ borderRadius: 8, border: '1px solid var(--border)', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 15 }}>{call.direction === 'inbound' ? '📥' : '📤'}</span>
                      <div>
                        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>
                          {call.direction === 'inbound' ? 'Incoming' : 'Outgoing'} call · {durStr}
                        </p>
                        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--slate)' }}>
                          {call.created_at ? new Date(call.created_at).toLocaleString('en-AU') : ''}
                          {call.agent_name ? ` · ${call.agent_name}` : ''}
                        </p>
                      </div>
                    </div>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 600, background: call.status === 'answered' || call.status === 'completed' ? '#dcfce7' : '#fef3c7', color: call.status === 'answered' || call.status === 'completed' ? '#059669' : '#d97706', textTransform: 'capitalize' }}>{call.status}</span>
                  </div>
                  {call.ai_summary && (
                    <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: '#faf5ff', fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.5 }}>
                      ✨ {call.ai_summary}
                    </div>
                  )}
                  {call.recording_url && !call.ai_summary && (
                    <button onClick={async () => {
                      const res = await fetch('/api/telnyx/call-summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId: call.id }) })
                      const d = await res.json()
                      if (d.summary) setCalls(cs => cs.map(c => c.id === call.id ? { ...c, ai_summary: d.summary } : c))
                    }} style={{ marginTop: 8, fontSize: 12, color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                      ✨ Generate AI summary
                    </button>
                  )}
                  <div style={{ display: 'flex', gap: 16, marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                    <button type="button" onClick={focusNote} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--slate)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" {...I}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                      Add note
                    </button>
                    <button type="button" onClick={focusTask} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--slate)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" {...I}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                      Create task
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Order History */}
      <div style={card}>
        <h3 style={cardTitle}>Order History ({customer.total_orders || orders.length || 0})</h3>
        {orders.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {orders.map((order: any) => {
              const orderTotal = parseFloat(order.total || order.order_total || 0)
              const lineItems: any[] = order.line_items || []
              return (
                <div key={order.id} style={{ borderRadius: 8, border: '1px solid var(--border)', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <p style={{ margin: '0 0 3px 0', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Order #{order.woo_order_id}</p>
                      <p style={{ margin: 0, fontSize: 12, color: '#888' }}>
                        {order.order_date ? new Date(order.order_date).toLocaleDateString() : 'Date unknown'}
                        {lineItems.length > 0 && ` • ${lineItems.length} item${lineItems.length !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: '0 0 4px 0', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
                        {orderTotal > 0 ? `$${orderTotal.toFixed(2)}` : '—'}
                      </p>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: order.status === 'completed' ? '#dcfce7' : order.status === 'processing' ? '#dbeafe' : ['refunded', 'cancelled', 'failed'].includes(order.status) ? '#fee2e2' : '#fef3c7', color: order.status === 'completed' ? '#166534' : order.status === 'processing' ? '#1e40af' : ['refunded', 'cancelled', 'failed'].includes(order.status) ? '#dc2626' : '#92400e' }}>
                        {order.status || order.order_status || 'unknown'}
                      </span>
                    </div>
                  </div>
                  {lineItems.length > 0 && (
                    <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                      {/* All items — no "+N more" truncation. */}
                      {lineItems.map((li: any, i: number) => {
                        const qty = li.quantity || 1
                        const lineTotal = parseFloat(li.total ?? li.subtotal ?? (li.price ? li.price * qty : 0)) || 0
                        return (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5, color: '#444', padding: '3px 0' }}>
                            <span>{li.name || li.product_name}{qty > 1 ? ` ×${qty}` : ''}</span>
                            {lineTotal > 0 && <span style={{ color: '#666', flexShrink: 0 }}>${lineTotal.toFixed(2)}</span>}
                          </div>
                        )
                      })}
                      {(() => {
                        // Shipping line + a total that actually adds up (items +
                        // shipping), matching the order total.
                        const shipping = parseFloat(order.shipping_total ?? order.shipping ?? 0) || 0
                        return (
                          <>
                            {shipping > 0 && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#444', padding: '3px 0' }}>
                                <span>Shipping</span><span style={{ color: '#666' }}>${shipping.toFixed(2)}</span>
                              </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: 'var(--ink)', padding: '6px 0 0', marginTop: 4, borderTop: '1px dashed var(--border)' }}>
                              <span>Total</span><span>${orderTotal.toFixed(2)}</span>
                            </div>
                          </>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ padding: '24px 0', textAlign: 'center', color: '#888', fontSize: 13 }}>
            {displayOrders > 0 ? (
              <>
                <p style={{ margin: '0 0 6px 0' }}>This customer has {displayOrders} orders, but the detailed order history hasn&rsquo;t finished syncing.</p>
                <p style={{ margin: 0, fontSize: 12 }}>Run <strong>Sync Now</strong> in the WooCommerce integration — the order sync now runs in the background until it completes.</p>
              </>
            ) : (
              <>
                <p style={{ margin: '0 0 6px 0' }}>No orders synced yet.</p>
                <p style={{ margin: 0, fontSize: 12 }}>Run <strong>Sync Now</strong> in WooCommerce integration to load order history.</p>
              </>
            )}
          </div>
        )}
      </div>
        </div>{/* main column */}

        {/* ── SIDEBAR ─────────────────────────────────────────────────── */}
        <div style={{ flex: '0 1 300px', minWidth: 260, display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Notes */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ ...cardTitle, margin: 0 }}>Notes{notes.length ? ` (${notes.length})` : ''}</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea ref={noteRef} value={noteBody} onChange={e => setNoteBody(e.target.value)}
                placeholder="Add a note…" rows={2}
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }} />
              <button type="button" onClick={addNote} disabled={savingNote || !noteBody.trim()}
                style={{ alignSelf: 'flex-start', padding: '7px 14px', borderRadius: 9, border: 'none', background: noteBody.trim() ? 'var(--coral)' : 'var(--border)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: noteBody.trim() ? 'pointer' : 'default' }}>
                {savingNote ? 'Saving…' : 'Add note'}
              </button>
            </div>
            {notes.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {notes.map((n: any) => (
                  <div key={n.id} style={{ padding: '9px 11px', borderRadius: 10, background: 'var(--canvas)', border: '1px solid var(--border)' }}>
                    <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{n.content}</p>
                    <p style={{ margin: '5px 0 0', fontSize: 10.5, color: 'var(--slate)' }}>{n.author ? `${n.author} · ` : ''}{n.created_at ? relTime(n.created_at) : ''}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tasks */}
          <div style={card}>
            <h3 style={cardTitle}>Tasks{tasks.length ? ` (${tasks.length})` : ''}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input ref={taskRef} value={taskText} onChange={e => setTaskText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addTask() }}
                placeholder="Add a task…"
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, outline: 'none' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="datetime-local" value={taskDue} onChange={e => setTaskDue(e.target.value)}
                  style={{ flex: 1, minWidth: 0, padding: '7px 10px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 12, color: 'var(--slate)', outline: 'none' }} />
                <button type="button" onClick={addTask} disabled={savingTask || !taskText.trim()}
                  style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: taskText.trim() ? 'var(--coral)' : 'var(--border)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: taskText.trim() ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
                  {savingTask ? '…' : 'Add'}
                </button>
              </div>
            </div>
            {tasks.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                {tasks.map((t: any) => {
                  const done = t.done || t.status === 'done'
                  return (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '8px 10px', borderRadius: 10, background: 'var(--canvas)', border: '1px solid var(--border)' }}>
                      <button type="button" onClick={() => toggleTask(t)}
                        style={{ marginTop: 1, width: 16, height: 16, flexShrink: 0, borderRadius: 5, border: `1.5px solid ${done ? 'var(--coral)' : 'var(--slate)'}`, background: done ? 'var(--coral)' : 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                        {done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 12.5, color: done ? 'var(--slate)' : 'var(--ink)', textDecoration: done ? 'line-through' : 'none', lineHeight: 1.4 }}>{t.title || t.text}</p>
                        {t.due_date && <p style={{ margin: '3px 0 0', fontSize: 10.5, color: 'var(--slate)' }}>Due {new Date(t.due_date).toLocaleDateString()}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div style={card}>
            <h3 style={cardTitle}>Customer Value</h3>
            {([
              ['First order', firstOrderDate ? firstOrderDate.toLocaleDateString() : '—'],
              ['Last order', lastOrderDate ? lastOrderDate.toLocaleDateString() : '—'],
              ['Total spend', displaySpend > 0 ? fmtMoney(displaySpend) : '—'],
              ['Avg order value', displayAov > 0 ? fmtMoney(displayAov) : '—'],
              ['Total orders', String(displayOrders)],
              ...(daysSinceLast !== null ? [['Days since last order', `${daysSinceLast} days`]] : []),
            ] as [string, string][]).map(([k, v], i) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
                <span style={{ color: 'var(--slate)' }}>{k}</span>
                <span style={{ fontWeight: 700, color: 'var(--ink)', textAlign: 'right' }}>{v}</span>
              </div>
            ))}
            {firstOrderDate && (() => {
              const d = Math.floor((Date.now() - firstOrderDate.getTime()) / 864e5)
              const lbl = d < 1 ? 'Today'
                : d < 30 ? `${d} day${d === 1 ? '' : 's'}`
                : d < 365 ? `${Math.floor(d / 30)} month${Math.floor(d / 30) === 1 ? '' : 's'}`
                : `${Math.floor(d / 365)} year${Math.floor(d / 365) === 1 ? '' : 's'}`
              return (
                <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 10, background: 'var(--peach)', color: 'var(--coral)', fontSize: 12.5, fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Customer since</span><span>{lbl}</span>
                </div>
              )
            })()}
          </div>

          <div style={card}>
            <h3 style={cardTitle}>Lifetime Status</h3>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 20, background: status.bg, color: status.fg, fontSize: 13, fontWeight: 700 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: status.dot }} /> {rfmCategory}
            </span>
            <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--slate)', lineHeight: 1.5 }}>
              RFM score <strong style={{ color: 'var(--ink)' }}>{rfmScore}/9</strong> — recency, frequency &amp; monetary value across this customer&rsquo;s order history.
            </p>
          </div>

          {/* Recent Activity — synthesised from orders, calls, notes & tasks */}
          {activity.length > 0 && (
            <div style={card}>
              <h3 style={cardTitle}>Recent Activity</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {activity.map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 14, lineHeight: '18px', flexShrink: 0 }}>{a.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.label}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 10.5, color: 'var(--slate)' }}>{relTime(a.t)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>{/* flex wrapper */}
    </div>
  )
}
