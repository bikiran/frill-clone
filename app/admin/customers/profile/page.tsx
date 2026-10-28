'use client'

import { statusMeta } from '@/lib/orders'
import { authFetch } from '@/lib/auth-fetch'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useSearchParams, useRouter } from 'next/navigation'
import { SegmentationService } from '@/lib/segmentation-service'
import { contactMessageHref } from '@/lib/channel-choice'
import { notifyIntegrations } from '@/lib/integrations-notify'
import CustomerTimeline from '@/components/CustomerTimeline'
import EmptyScroll from '@/components/EmptyScroll'

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
  // Products / Calls / Orders cards fold away once the timeline (which already
  // shows calls and orders) takes the centre; a tap opens them.
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({})
  // Bumped when a note or task is added or ticked off here, so the timeline
  // re-reads and shows it.
  const [timelineTick, setTimelineTick] = useState(0)

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
            // A Shopify customer for this contact (linked, or by email).
            if (!customerData) {
              let sq = (supabase as any).from('shopify_customers').select('*').eq('company_id', resolvedCompanyId)
              sq = contact.email ? sq.or(`contact_id.eq.${contact.id},email.eq.${String(contact.email).toLowerCase()}`) : sq.eq('contact_id', contact.id)
              const { data: shopRows } = await sq.limit(1)
              const sc = shopRows?.[0]
              if (sc) {
                const a = sc.address || {}
                customerData = {
                  ...sc, id: contact.id, contact_id: contact.id, _channel: 'shopify',
                  email: /@no-email\.colvy\.internal$/i.test(sc.email || '') ? contact.email : sc.email,
                  items_purchased: [],
                  address: { address_1: a.address1 || '', address_2: a.address2 || '', city: a.city || '', state: a.provinceCode || a.province_code || a.province || '', postcode: a.zip || '', country: a.countryCodeV2 || a.country_code || a.country || '' },
                }
              }
            }
            // No matching store customer — show the contact as a minimal customer
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
          // Shopify orders from the operational orders table, shaped like the
          // WooCommerce rows this page renders.
          try {
            const cidForOrders = customerData.is_contact_only || customerData._channel === 'shopify' ? customerData.id : (customerData.contact_id || null)
            const ors = [cidForOrders ? `contact_id.eq.${cidForOrders}` : '', email ? `customer_email.eq.${String(email).toLowerCase()}` : ''].filter(Boolean).join(',')
            if (ors) {
              const { data: shopOrders } = await (supabase as any).from('orders')
                .select('id, order_number, status, payment_status, total, currency, order_date, customer_email, shipping_address, order_items(product_name, quantity, sku, total_price, image_url)')
                .eq('company_id', resolvedCompanyId).eq('sales_channel', 'shopify').or(ors)
                .order('order_date', { ascending: false }).limit(100)
              for (const o of shopOrders || []) ordersData.push({
                woo_order_id: o.order_number, order_number: o.order_number, _channel: 'shopify', _orderId: o.id,
                status: statusMeta(o.status).label.toLowerCase(), total: o.total, currency: o.currency, order_date: o.order_date,
                customer_email: o.customer_email, billing: o.shipping_address || null,
                line_items: (o.order_items || []).map((li: any) => ({ name: li.product_name, quantity: li.quantity, sku: li.sku, total: li.total_price, image: li.image_url ? { src: li.image_url } : null })),
              })
            }
          } catch {}
          ordersData.sort((a: any, b: any) => (b.order_date || '').localeCompare(a.order_date || ''))

          // Live fallback: if nothing has synced yet, pull orders straight from
          // WooCommerce (same as the inbox sidebar does), so the profile isn't
          // blank just because the background sync hasn't caught up.
          if (ordersData.length === 0 && email) {
            try {
              const res = await authFetch(`/api/orders/list?companyId=${resolvedCompanyId}&email=${encodeURIComponent(email)}`)
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

  if (loading) return (
    <div style={{ padding: '20px 28px', maxWidth: 1240, margin: '0 auto' }} aria-busy="true" aria-label="Loading customer">
      <style>{`@keyframes cpPulse{0%,100%{opacity:1}50%{opacity:.5}}.cp-sk{background:#f4f4f5;animation:cpPulse 1.4s ease-in-out infinite}`}</style>
      <div className="cp-sk" style={{ width: 72, height: 32, borderRadius: 999, marginBottom: 16 }} />
      <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 20 }}>
        <div className="cp-sk" style={{ width: 76, height: 76, borderRadius: '50%' }} />
        <div style={{ flex: 1 }}><div className="cp-sk" style={{ width: '40%', height: 28, borderRadius: 10, marginBottom: 10 }} /><div className="cp-sk" style={{ width: '25%', height: 14, borderRadius: 8 }} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>{[0, 1, 2, 3].map(i => <div key={i} className="cp-sk" style={{ height: 104, borderRadius: 20 }} />)}</div>
    </div>
  )
  if (error || !customer) return (
    <div style={{ padding: '48px 20px' }}>
      <EmptyScroll kinds={['contact']} title={error === 'Customer not found' || !customer ? 'Customer not found' : 'Couldn’t open this customer'}
        line={error && error !== 'Customer not found' ? error : 'They may have been merged or removed. Find them again from Contacts.'}
        action={<button type="button" className="cv-btn" onClick={() => router.push('/admin/contacts')}>Go to Contacts</button>} />
    </div>
  )

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
      setTimelineTick(n => n + 1)
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
      if (inserted?.id) notifyIntegrations('task.created', { id: inserted.id, companyId })
      if (inserted) { setTasks(ts => [inserted, ...ts]); setTimelineTick(n => n + 1) }
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
      setTimelineTick(n => n + 1)
    } catch {}
  }

  const updateRelationship = async (rt: string) => {
    if (!contactId) return
    setContactRow((c: any) => ({ ...(c || {}), relationship_type: rt }))
    try { await (supabase as any).from('contacts').update({ relationship_type: rt, ...(rt === 'customer' ? {} : { subscribed_to_marketing: false }) }).eq('id', contactId) } catch {}
  }

  const focusNote = () => { noteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => noteRef.current?.focus(), 300) }
  const focusTask = () => { taskRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => taskRef.current?.focus(), 300) }

  const I = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const dial = () => window.dispatchEvent(new CustomEvent('colvy:dial', { detail: { number: customer.phone, name: fullName, contactId: contactId || undefined, autoStart: true } }))
  const emailHref = contactId ? `/admin/inbox?contact=${contactId}&channel=email` : conversationId ? `/admin/inbox?conversation=${conversationId}` : '/admin/inbox'
  // Opens their conversation on SMS when their mobile may be texted, else
  // email (lib/channel-choice) — not whichever channel Colvy's last automated
  // message happened to use.
  const messageHref = contactId
    ? contactMessageHref({ id: contactId, phone: customer.phone, email: customer.email, unsubscribed_at: (customer as any).unsubscribed_at, is_blocked: (customer as any).is_blocked, source: contactRow?.source, consent_basis: contactRow?.consent_basis }, null, conversationId)
    : `/admin/inbox?conversation=${conversationId}`
  const relLabel = (RELATIONSHIPS.find(([v]) => v === relationship) || [relationship, relationship])[1]

  // Compact stat tile: label, big number, a quiet line under it.
  const statCard = (icon: React.ReactNode, label: string, value: string, sub: string | undefined, accent: string) => (
    <div className="cp-card cp-stat">
      <div className="cp-stat-top">
        <span className="cp-label">{label}</span>
        <span className="cp-ic" style={{ background: `color-mix(in srgb, ${accent} 12%, #fff)`, color: accent }}>{icon}</span>
      </div>
      <span className="cp-stat-v">{value}</span>
      {sub && <span className="cp-sub">{sub}</span>}
    </div>
  )

  // A card heading that folds the card. With the timeline on the page the
  // detail cards start folded; without one (no linked contact) they start open.
  // They stay folded while the contact is still being looked up, so they don't
  // open and then snap shut as the timeline arrives.
  const isOpen = (k: string) => openCards[k] ?? (!!companyId && !contactId)
  const foldHead = (k: string, title: string, count: number | null, extra?: React.ReactNode) => (
    <div className={`cp-fold${isOpen(k) ? ' open' : ''}`}>
      <button type="button" className="cp-fold-btn" onClick={() => setOpenCards(o => ({ ...o, [k]: !isOpen(k) }))} aria-expanded={isOpen(k)}>
        <span className="cp-h3">{title}</span>
        {count != null && <span className="cp-count">{count}</span>}
        <span className="cp-chev" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" {...I} strokeWidth={2.4}><polyline points="6 9 12 15 18 9"/></svg></span>
      </button>
      {isOpen(k) && extra}
    </div>
  )

  return (
    <div className="cp">
      <style>{CP_CSS}</style>

      <button type="button" className="cp-back" onClick={() => { if (window.history.length > 1) router.back(); else router.push('/admin/contacts') }}>
        <svg width="15" height="15" viewBox="0 0 24 24" {...I} strokeWidth={2.4}><path d="m15 18-6-6 6-6"/></svg>
        Back
      </button>

      {/* Header: who they are, and the things you'd do next. */}
      <div className="cp-head">
        <span className="cp-av" style={{ background: avatarBg, color: avatarFg }}>{initials}</span>
        <div className="cp-who">
          <h1>{fullName}</h1>
          <p className="cp-meta">
            {customer.email && <span>{customer.email}</span>}
            {customer.phone && <span>{customer.phone}</span>}
          </p>
          <div className="cp-tags">
            <span className="cp-tag dot" style={tint(status.dot)}>{rfmCategory}</span>
            {relationship !== 'customer' && <span className="cp-tag dot" style={tint('#6366f1')}>{relLabel}</span>}
            {allTags.slice(0, 6).map((t, i) => <span key={i} className="cp-tag">{t}</span>)}
            {allTags.length > 6 && <span className="cp-tag">+{allTags.length - 6}</span>}
          </div>
        </div>
        <div className="cp-acts">
          {customer.phone && (
            <button type="button" className="cp-ic-btn" onClick={dial} title="Call in Colvy" aria-label="Call">
              <svg width="17" height="17" viewBox="0 0 24 24" {...I}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            </button>
          )}
          {(conversationId || contactId) && (
            <button type="button" className="cp-ic-btn" onClick={() => router.push(messageHref)} title="Message" aria-label="Message">
              <svg width="17" height="17" viewBox="0 0 24 24" {...I}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </button>
          )}
          {customer.email && (
            <button type="button" className="cp-ic-btn" onClick={() => router.push(emailHref)} title="Email in Colvy" aria-label="Email">
              <svg width="17" height="17" viewBox="0 0 24 24" {...I}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
            </button>
          )}
          <button type="button" onClick={focusNote} className="cv-btn">
            <svg width="15" height="15" viewBox="0 0 24 24" {...I}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            Add note
          </button>
          <button type="button" onClick={focusTask} className="cv-btn cv-btn-primary">
            <svg width="15" height="15" viewBox="0 0 24 24" {...I}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            Create task
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="cp-stats">
        {statCard(<svg width="16" height="16" viewBox="0 0 24 24" {...I}><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>, 'Total spend', displaySpend > 0 ? fmtMoney(displaySpend) : '—', 'Lifetime', '#16a34a')}
        {statCard(<svg width="16" height="16" viewBox="0 0 24 24" {...I}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>, 'Orders', String(displayOrders), lastOrderDate ? `Last order ${daysSinceLast === 0 ? 'today' : `${daysSinceLast} day${daysSinceLast === 1 ? '' : 's'} ago`}` : 'None yet', '#7c3aed')}
        {statCard(<svg width="16" height="16" viewBox="0 0 24 24" {...I}><path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.2" fill="currentColor" stroke="none"/></svg>, 'Average order', displayAov > 0 ? fmtMoney(displayAov) : '—', 'Per order', '#d97706')}
        {statCard(<svg width="16" height="16" viewBox="0 0 24 24" {...I}><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>, 'RFM score', `${rfmScore}/9`, rfmCategory, '#3b82f6')}
      </div>

      <div className="cp-cols">
        {/* ── MAIN COLUMN ─────────────────────────────────────────────────── */}
        <div className="cp-main">

          {/* Timeline — everything that's happened with this customer, on every
              channel, in one stream. The centre of the profile. */}
          {contactId && (
            <div className="cp-card cp-pad">
              <div className="cp-card-h">
                <span className="cp-h3">Timeline</span>
                <span className="cp-sub">Messages, orders, bookings, calls and more</span>
              </div>
              <CustomerTimeline contactId={contactId} contactName={fullName} refreshKey={timelineTick} />
            </div>
          )}

          {/* Contact details */}
          <div className="cp-card cp-pad">
            <div className="cp-card-h">
              <span className="cp-h3">Contact details</span>
              {fillPatch && (
                <button type="button" className="cp-pill" onClick={fillFromOrder} title="Fill the blank details in from their most recent order">
                  <svg width="14" height="14" viewBox="0 0 24 24" {...I}><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>
                  Fill in from their last order
                </button>
              )}
            </div>
            <div className="cp-fields">
              <div className="cp-field">
                <span className="cp-k">Email</span>
                {customer.email
                  ? <button type="button" className="cp-v link" onClick={() => router.push(emailHref)} title="Email in Colvy">{customer.email}</button>
                  : <span className="cp-v muted">—</span>}
              </div>
              <div className="cp-field">
                <span className="cp-k">Phone</span>
                {customer.phone
                  ? <button type="button" className="cp-v link" onClick={dial} title="Call in Colvy">{customer.phone}</button>
                  : <span className="cp-v muted">—</span>}
              </div>
              {hasWooAddr ? (
                <div className="cp-field">
                  <span className="cp-k">Address</span>
                  <span className="cp-v">
                    {[addr.address_1, addr.address_2].filter(Boolean).join(', ')}
                    {(addr.address_1 || addr.address_2) && <br />}
                    {[addr.city, (addr.state || '').toUpperCase(), addr.postcode].filter(Boolean).join(' ')}
                    {(addr.city || addr.state || addr.postcode) && addr.country && <br />}
                    {addr.country}
                  </span>
                </div>
              ) : contactAddrStr ? (
                <div className="cp-field"><span className="cp-k">Address</span><span className="cp-v">{contactAddrStr}</span></div>
              ) : null}
              {firstOrderDate && (
                <div className="cp-field"><span className="cp-k">Customer since</span><span className="cp-v">{firstOrderDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
              )}
              <div className="cp-field">
                <span className="cp-k">Relationship</span>
                {contactId ? (
                  <select className="cp-select" value={relationship} onChange={e => updateRelationship(e.target.value)} aria-label="Relationship">
                    {RELATIONSHIPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                ) : <span className="cp-v">{relLabel}</span>}
              </div>
            </div>
            {allTags.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <span className="cp-k">Tags</span>
                <div className="cp-tags" style={{ marginTop: 8 }}>
                  {allTags.map((t, i) => <span key={i} className="cp-tag">{t}</span>)}
                </div>
              </div>
            )}
          </div>

          {/* Products purchased — searchable accordion list */}
          {rawItems.length > 0 && (
            <div className="cp-card cp-pad">
              {foldHead('products', 'Products purchased', rawItems.length, (
                <div className="cp-search">
                  <svg width="14" height="14" viewBox="0 0 24 24" {...I}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
                  <input type="text" placeholder="Search products…" value={productSearch} onChange={e => setProductSearch(e.target.value)} aria-label="Search products" />
                </div>
              ))}

              {/* Rows must not shrink: in a height-capped flex column with overflow
                  hidden they squash into empty slivers instead of scrolling. */}
              {isOpen('products') && <div className="cp-list" style={{ maxHeight: 520, overflowY: 'auto', paddingRight: 4 }}>
                {filteredProducts.length === 0 && (
                  <EmptyScroll compact kinds={['order']} title="No matches" line={`No products match “${productSearch.trim()}”.`}
                    action={<button type="button" className="cv-btn" onClick={() => setProductSearch('')}>Clear search</button>} />
                )}
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
                  const open = expandedProducts.has(idx)
                  return (
                    <div key={idx} className={`cp-item${open ? ' open' : ''}`}>
                      <button type="button" className="cp-item-btn" aria-expanded={open}
                        onClick={() => {
                          const next = new Set(expandedProducts)
                          if (open) next.delete(idx); else next.add(idx)
                          setExpandedProducts(next)
                        }}>
                        {/* Fixed thumbnail box: a fallback icon always sits behind, and
                            the photo fills the box on top — so a broken/oversized image
                            can never collapse or overflow the row. */}
                        <span className="cp-thumb">
                          <svg width="18" height="18" viewBox="0 0 24 24" {...I}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                          {image && (
                            <img src={image} alt="" loading="lazy" decoding="async"
                              onError={(e: any) => { e.currentTarget.style.display = 'none' }} />
                          )}
                        </span>
                        <span className="cp-item-main">
                          <span className="cp-item-t">{name}</span>
                          {category && <span className="cp-item-s">{category}</span>}
                        </span>
                        {qty !== '' && qty != null && <span className="cp-item-q">×{qty}</span>}
                        {price !== '' && !isNaN(parseFloat(price)) && <span className="cp-item-p">${parseFloat(price).toFixed(2)}</span>}
                        <span className="cp-chev sm" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 24 24" {...I} strokeWidth={2.4}><polyline points="6 9 12 15 18 9"/></svg></span>
                      </button>
                      {open && (
                        <div className="cp-item-more">
                          <div className="cp-minis">
                            {qty && <div><span className="cp-k">Quantity</span>{qty}</div>}
                            {price !== '' && !isNaN(parseFloat(price)) && <div><span className="cp-k">Price</span>${parseFloat(price).toFixed(2)}</div>}
                            {category && <div><span className="cp-k">Category</span>{category}</div>}
                            {sku && <div><span className="cp-k">SKU</span>{sku}</div>}
                          </div>
                          {description ? <p style={{ margin: '10px 0 0' }}>{description.replace(/<[^>]+>/g, '')}</p> : (!qty && !price && !category && !sku && <p style={{ margin: 0, color: '#a1a1aa' }}>No further details available for this product.</p>)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>}
            </div>
          )}

          {/* Call history */}
          {calls.length > 0 && (
            <div className="cp-card cp-pad">
              {foldHead('calls', 'Calls', calls.length)}
              {isOpen('calls') && <div className="cp-list">
                {calls.map((call: any) => {
                  const dur = call.duration_seconds || 0
                  const durStr = dur > 0 ? `${Math.floor(dur / 60)}m ${dur % 60}s` : (call.status === 'completed' ? 'No answer' : call.status)
                  const ok = call.status === 'answered' || call.status === 'completed'
                  return (
                    <div key={call.id} className="cp-row">
                      <div className="cp-row-top">
                        <span className="cp-ic round" style={{ background: '#eff6ff', color: '#2563eb' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" {...I}>{call.direction === 'inbound' ? <path d="M16 2v6h6M22 2l-6 6" /> : <path d="M22 8V2h-6M16 8l6-6" />}<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                        </span>
                        <span className="cp-item-main">
                          <span className="cp-item-t">{call.direction === 'inbound' ? 'Incoming' : 'Outgoing'} call · {durStr}</span>
                          <span className="cp-item-s">{call.created_at ? new Date(call.created_at).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''}{call.agent_name ? ` · ${call.agent_name}` : ''}</span>
                        </span>
                        <span className="cp-tag dot" style={{ ...tint(ok ? '#22c55e' : '#f59e0b'), textTransform: 'capitalize' }}>{call.status}</span>
                      </div>
                      {call.ai_summary && (
                        <div className="cp-ai">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="#7c3aed" aria-hidden="true" style={{ flexShrink: 0, marginTop: 4 }}><path d="M12 2l1.6 5.3L19 9l-5.4 1.7L12 16l-1.6-5.3L5 9l5.4-1.7z" /></svg>
                          <span>{call.ai_summary}</span>
                        </div>
                      )}
                      <div className="cp-row-acts">
                        {call.recording_url && !call.ai_summary && (
                          <button type="button" className="cp-mini violet" onClick={async () => {
                            const res = await authFetch('/api/telnyx/call-summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId: call.id }) })
                            const d = await res.json()
                            if (d.summary) setCalls(cs => cs.map(c => c.id === call.id ? { ...c, ai_summary: d.summary } : c))
                          }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.6 5.3L19 9l-5.4 1.7L12 16l-1.6-5.3L5 9l5.4-1.7z" /></svg>
                            AI summary
                          </button>
                        )}
                        <button type="button" className="cp-mini" onClick={focusNote}>
                          <svg width="13" height="13" viewBox="0 0 24 24" {...I}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                          Add note
                        </button>
                        <button type="button" className="cp-mini" onClick={focusTask}>
                          <svg width="13" height="13" viewBox="0 0 24 24" {...I}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                          Create task
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>}
            </div>
          )}

          {/* Order history */}
          <div className="cp-card cp-pad">
            {foldHead('orders', 'Orders', customer.total_orders || orders.length || 0)}
            {!isOpen('orders') ? null : orders.length > 0 ? (
              <div className="cp-list">
                {orders.map((order: any, oi: number) => {
                  const orderTotal = parseFloat(order.total || order.order_total || 0)
                  const lineItems: any[] = order.line_items || []
                  const st = String(order.status || order.order_status || 'unknown')
                  const dot = st === 'completed' ? '#22c55e' : st === 'processing' ? '#3b82f6' : ['refunded', 'cancelled', 'failed'].includes(st) ? '#ef4444' : '#f59e0b'
                  return (
                    <div key={order.id || `${order.woo_order_id}-${oi}`} className="cp-row">
                      <div className="cp-row-top">
                        <span className="cp-item-main">
                          <span className="cp-item-t">Order #{order.woo_order_id}</span>
                          <span className="cp-item-s">
                            {order.order_date ? new Date(order.order_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date unknown'}
                            {lineItems.length > 0 && ` · ${lineItems.length} item${lineItems.length !== 1 ? 's' : ''}`}
                          </span>
                        </span>
                        <span className="cp-tag dot" style={{ ...tint(dot), textTransform: 'capitalize' }}>{st}</span>
                        <span className="cp-item-p big">{orderTotal > 0 ? `$${orderTotal.toFixed(2)}` : '—'}</span>
                      </div>
                      {lineItems.length > 0 && (
                        <div className="cp-lines">
                          {/* All items — no "+N more" truncation. */}
                          {lineItems.map((li: any, i: number) => {
                            const qty = li.quantity || 1
                            const lineTotal = parseFloat(li.total ?? li.subtotal ?? (li.price ? li.price * qty : 0)) || 0
                            return (
                              <div key={i} className="cp-line">
                                <span>{li.name || li.product_name}{qty > 1 ? <span className="cp-x"> ×{qty}</span> : null}</span>
                                {lineTotal > 0 && <span>${lineTotal.toFixed(2)}</span>}
                              </div>
                            )
                          })}
                          {(() => {
                            // Shipping line + a total that actually adds up (items +
                            // shipping), matching the order total.
                            const shipping = parseFloat(order.shipping_total ?? order.shipping ?? 0) || 0
                            return (
                              <>
                                {shipping > 0 && <div className="cp-line"><span>Shipping</span><span>${shipping.toFixed(2)}</span></div>}
                                <div className="cp-line total"><span>Total</span><span>${orderTotal.toFixed(2)}</span></div>
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
              <EmptyScroll compact kinds={['order']}
                title={displayOrders > 0 ? 'Order history is still syncing' : 'No orders yet'}
                line={displayOrders > 0
                  ? `They have ${displayOrders} orders, but the details haven’t finished syncing. Run Sync Now in the WooCommerce integration; it keeps going in the background until it’s done.`
                  : 'Orders from your store show up here once they sync. Run Sync Now in the WooCommerce integration to load them.'} />
            )}
          </div>
        </div>{/* main column */}

        {/* ── SIDEBAR ─────────────────────────────────────────────────── */}
        <div className="cp-side">

          {/* Notes */}
          <div className="cp-card cp-pad">
            <div className="cp-card-h"><span className="cp-h3">Notes</span>{notes.length > 0 && <span className="cp-count">{notes.length}</span>}</div>
            <textarea ref={noteRef} className="cp-input" value={noteBody} onChange={e => setNoteBody(e.target.value)}
              placeholder="Add a note…" rows={2} aria-label="New note" />
            <button type="button" className="cv-btn cv-btn-primary cp-add" onClick={addNote} disabled={savingNote || !noteBody.trim()}>
              {savingNote ? 'Saving…' : 'Add note'}
            </button>
            {notes.length > 0 && (
              <div className="cp-notes">
                {notes.map((n: any) => (
                  <div key={n.id} className="cp-note">
                    <p>{n.content}</p>
                    <span>{n.author ? `${n.author} · ` : ''}{n.created_at ? relTime(n.created_at) : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tasks */}
          <div className="cp-card cp-pad">
            <div className="cp-card-h"><span className="cp-h3">Tasks</span>{tasks.length > 0 && <span className="cp-count">{tasks.length}</span>}</div>
            <input ref={taskRef} className="cp-input" value={taskText} onChange={e => setTaskText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTask() }}
              placeholder="Add a task…" aria-label="New task" />
            <div className="cp-task-row">
              <input type="datetime-local" className="cp-input sm" value={taskDue} onChange={e => setTaskDue(e.target.value)} aria-label="Due" />
              <button type="button" className="cv-btn cv-btn-primary cp-add" onClick={addTask} disabled={savingTask || !taskText.trim()}>
                {savingTask ? '…' : 'Add'}
              </button>
            </div>
            {tasks.length > 0 && (
              <div className="cp-tasks">
                {tasks.map((t: any) => {
                  const done = t.done || t.status === 'done'
                  return (
                    <div key={t.id} className={`cp-task${done ? ' done' : ''}`}>
                      <button type="button" className={`cp-check${done ? ' on' : ''}`} onClick={() => toggleTask(t)} aria-label={done ? 'Mark not done' : 'Mark done'}>
                        {done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p>{t.title || t.text}</p>
                        {t.due_date && <span>Due {new Date(t.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Customer value */}
          <div className="cp-card cp-pad">
            <div className="cp-card-h"><span className="cp-h3">Customer value</span></div>
            {([
              ['First order', firstOrderDate ? firstOrderDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'],
              ['Last order', lastOrderDate ? lastOrderDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'],
              ['Total spend', displaySpend > 0 ? fmtMoney(displaySpend) : '—'],
              ['Average order', displayAov > 0 ? fmtMoney(displayAov) : '—'],
              ['Total orders', String(displayOrders)],
              ...(daysSinceLast !== null ? [['Since last order', `${daysSinceLast} day${daysSinceLast === 1 ? '' : 's'}`]] : []),
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="cp-kv"><span>{k}</span><b>{v}</b></div>
            ))}
            {firstOrderDate && (() => {
              const d = Math.floor((Date.now() - firstOrderDate.getTime()) / 864e5)
              const lbl = d < 1 ? 'Today'
                : d < 30 ? `${d} day${d === 1 ? '' : 's'}`
                : d < 365 ? `${Math.floor(d / 30)} month${Math.floor(d / 30) === 1 ? '' : 's'}`
                : `${Math.floor(d / 365)} year${Math.floor(d / 365) === 1 ? '' : 's'}`
              return <div className="cp-since"><span>Customer for</span><b>{lbl}</b></div>
            })()}
          </div>

          {/* Lifetime status */}
          <div className="cp-card cp-pad">
            <div className="cp-card-h"><span className="cp-h3">Lifetime status</span></div>
            <span className="cp-tag dot lg" style={tint(status.dot)}>{rfmCategory}</span>
            <div className="cp-rfm" aria-label={`RFM score ${rfmScore} of 9`}>
              {Array.from({ length: 9 }).map((_, i) => <i key={i} style={{ background: i < rfmScore ? status.dot : '#f0f0f2' }} />)}
            </div>
            <p className="cp-fine">RFM score <b>{rfmScore}/9</b>: how recently, how often and how much they’ve bought, across their order history.</p>
          </div>

        </div>
      </div>
    </div>
  )
}

const tint = (c: string) => ({ ['--t' as any]: c }) as React.CSSProperties

// The profile look: a big header on the page itself, then white rounded
// cards with bold titles, soft grey fields and dot-and-tint tags.
const CP_CSS = `
.cp{padding:20px 28px 48px;max-width:1240px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink)}
.cp button::before{display:none}
.cp-back{display:inline-flex;align-items:center;gap:4px;height:32px;padding:0 12px 0 8px;border:none;border-radius:999px;background:#f4f4f5;color:#18181b;font:inherit;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:16px;transition:background-color .15s}
.cp-back:hover{background-color:#ececef}
.cp-head{display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-bottom:20px}
.cp-av{width:76px;height:76px;border-radius:50%;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;font-size:26px;font-weight:800}
.cp-who{flex:1;min-width:220px}
.cp-who h1{margin:0;font-size:30px;font-weight:800;letter-spacing:-.025em;line-height:1.15;color:var(--ink);overflow-wrap:anywhere}
.cp-meta{display:flex;flex-wrap:wrap;gap:4px 14px;margin:6px 0 10px;font-size:14px;color:#71717a}
.cp-meta span{overflow-wrap:anywhere}
.cp-tags{display:flex;flex-wrap:wrap;gap:6px}
.cp-tag{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border-radius:999px;font-size:12.5px;font-weight:600;background:#f4f4f5;color:#52525b;white-space:nowrap}
.cp-tag.dot{background:color-mix(in srgb,var(--t) 12%,#fff);color:color-mix(in srgb,var(--t) 78%,#000)}
.cp-tag.dot::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--t)}
.cp-tag.lg{height:30px;padding:0 12px;font-size:14px}
.cp-acts{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cp-ic-btn{width:38px;height:38px;flex-shrink:0;padding:0;border:none;border-radius:999px;background:#f4f4f5;color:#3f3f46;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background-color .15s,color .15s}
.cp-ic-btn:hover{background-color:#ececef;color:#18181b}
.cp-ic-btn:focus-visible,.cp-back:focus-visible,.cp-fold-btn:focus-visible,.cp-item-btn:focus-visible,.cp-mini:focus-visible,.cp-pill:focus-visible,.cp-check:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 28%,transparent)}
.cp-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}
.cp-card{background:#fff;border-radius:20px;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04);min-width:0}
.cp-pad{padding:18px 20px}
.cp-stat{display:flex;flex-direction:column;gap:4px;padding:16px 18px}
.cp-stat-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
.cp-label{font-size:13.5px;font-weight:600;color:#71717a}
.cp-ic{width:32px;height:32px;border-radius:10px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center}
.cp-ic.round{border-radius:50%}
.cp-stat-v{margin-top:4px;font-size:26px;font-weight:800;letter-spacing:-.02em;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cp-sub{font-size:12.5px;color:#8e8e93}
.cp-cols{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
.cp-main{flex:1 1 620px;min-width:0;display:flex;flex-direction:column;gap:16px}
.cp-side{flex:0 1 320px;min-width:270px;display:flex;flex-direction:column;gap:16px}
.cp-card-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.cp-h3{font-size:17px;font-weight:800;letter-spacing:-.01em;color:var(--ink)}
.cp-count{min-width:22px;height:22px;padding:0 7px;box-sizing:border-box;border-radius:999px;background:#f4f4f5;color:#52525b;font-size:12px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
.cp-pill{margin-left:auto;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border:none;border-radius:999px;background:color-mix(in srgb,var(--coral) 10%,#fff);color:color-mix(in srgb,var(--coral) 80%,#000);font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:background-color .15s}
.cp-pill:hover{background-color:color-mix(in srgb,var(--coral) 16%,#fff)}
.cp-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px 20px}
.cp-field{display:flex;flex-direction:column;gap:5px;min-width:0}
.cp-k{display:block;font-size:13px;font-weight:500;color:#8e8e93}
.cp-v{font-size:14.5px;font-weight:500;color:var(--ink);line-height:1.5;overflow-wrap:anywhere}
.cp-v.muted{color:#a1a1aa}
button.cp-v{padding:0;border:none;background:none;font:inherit;font-size:14.5px;font-weight:600;text-align:left;cursor:pointer}
.cp-v.link{color:var(--coral)}
.cp-v.link:hover{text-decoration:underline}
.cp-select{appearance:none;-webkit-appearance:none;align-self:flex-start;height:36px;padding:0 34px 0 14px;border:none;border-radius:999px;background-color:#f4f4f5;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;background-size:14px;font:inherit;font-size:13.5px;font-weight:600;color:var(--ink);cursor:pointer}
.cp-select:hover{background-color:#ececef}
.cp-fold{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.cp-fold.open{margin-bottom:14px}
.cp-fold-btn{display:inline-flex;align-items:center;gap:10px;padding:0;border:none;background:none;font:inherit;cursor:pointer;text-align:left;border-radius:10px}
.cp-chev{width:28px;height:28px;border-radius:999px;background:#f4f4f5;color:#52525b;display:inline-flex;align-items:center;justify-content:center;transition:transform .2s ease,background-color .15s}
.cp-chev.sm{width:24px;height:24px;flex-shrink:0;background:transparent;color:#a1a1aa}
.cp-fold-btn:hover .cp-chev{background-color:#ececef}
.cp-fold-btn[aria-expanded="true"] .cp-chev,.cp-item.open .cp-chev{transform:rotate(180deg)}
.cp-search{display:flex;align-items:center;gap:8px;height:36px;padding:0 14px;border-radius:999px;background:#f4f4f5;color:#a1a1aa;min-width:220px;border:1.5px solid transparent;box-sizing:border-box}
.cp-search:focus-within{background:#fff;border-color:#d4d4d8;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 16%,transparent)}
.cp-search input{flex:1;min-width:0;border:none;outline:none;background:transparent;font:inherit;font-size:13.5px;color:var(--ink)}
.cp-list{display:flex;flex-direction:column;gap:8px}
.cp-item{flex-shrink:0;border-radius:16px;background:#fafafa;overflow:hidden;transition:background-color .15s}
.cp-item.open{background:#f4f4f5}
.cp-item-btn{width:100%;display:flex;align-items:center;gap:12px;padding:10px 12px;border:none;background:none;font:inherit;text-align:left;cursor:pointer;border-radius:16px}
.cp-item-btn:hover{background-color:#f4f4f5}
.cp-thumb{position:relative;width:44px;height:44px;border-radius:12px;flex-shrink:0;overflow:hidden;background:#fff;color:#a1a1aa;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 0 0 1px rgba(0,0,0,.05)}
.cp-thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cp-item-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.cp-item-t{font-size:14px;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cp-item-s{font-size:12.5px;color:#8e8e93;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cp-item-q{flex-shrink:0;font-size:13px;color:#8e8e93}
.cp-item-p{flex-shrink:0;font-size:14px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums}
.cp-item-p.big{font-size:15.5px}
.cp-item-more{padding:4px 14px 14px 68px;font-size:13.5px;color:#52525b;line-height:1.5}
.cp-minis{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}
.cp-minis .cp-k{margin-bottom:2px}
.cp-row{flex-shrink:0;padding:12px 14px;border-radius:16px;background:#fafafa}
.cp-row-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.cp-ai{margin-top:10px;padding:9px 12px;border-radius:12px;background:#f5f3ff;font-size:13px;color:var(--ink);line-height:1.5;display:flex;gap:7px;align-items:flex-start}
.cp-row-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.cp-mini{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 10px;border:none;border-radius:999px;background:#fff;color:#52525b;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;box-shadow:0 0 0 1px rgba(0,0,0,.06);transition:background-color .15s,color .15s}
.cp-mini:hover{color:#18181b;background-color:#f4f4f5}
.cp-mini.violet{color:#7c3aed}
.cp-lines{margin-top:10px;padding-top:8px;border-top:1px solid #ececef}
.cp-line{display:flex;justify-content:space-between;gap:12px;padding:3px 0;font-size:13.5px;color:#3f3f46}
.cp-line > span:last-child{color:#71717a;flex-shrink:0;font-variant-numeric:tabular-nums}
.cp-line.total{margin-top:6px;padding-top:8px;border-top:1px dashed #e4e4e7;font-weight:700;color:var(--ink)}
.cp-line.total > span:last-child{color:var(--ink)}
.cp-x{color:#a1a1aa}
.cp-input{display:block;width:100%;box-sizing:border-box;min-height:40px;padding:9px 14px;border:1.5px solid transparent;border-radius:12px;background:#f4f4f5;font:inherit;font-size:14px;color:var(--ink);outline:none;resize:vertical;transition:background-color .15s,border-color .15s,box-shadow .15s}
.cp-input::placeholder{color:#a1a1aa}
.cp-input:focus{background:#fff;border-color:#d4d4d8;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 16%,transparent)}
.cp-input.sm{flex:1;min-width:0;font-size:13px;color:#52525b}
.cp-add{margin-top:8px;height:34px!important;padding:0 14px!important;font-size:13.5px!important}
.cp-task-row{display:flex;gap:8px;align-items:center;margin-top:8px}
.cp-task-row .cp-add{margin-top:0}
.cp-notes{display:flex;flex-direction:column;gap:8px;margin-top:14px}
.cp-note{padding:10px 12px;border-radius:14px;background:#fefce8}
.cp-note p{margin:0;font-size:13.5px;color:var(--ink);line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
.cp-note span{display:block;margin-top:5px;font-size:12px;color:#8e8e93}
.cp-tasks{display:flex;flex-direction:column;gap:4px;margin-top:14px}
.cp-task{display:flex;align-items:flex-start;gap:10px;padding:8px 6px;border-radius:12px}
.cp-task p{margin:0;font-size:14px;color:var(--ink);line-height:1.4;overflow-wrap:anywhere}
.cp-task span{display:block;margin-top:2px;font-size:12px;color:#8e8e93}
.cp-task.done p{color:#a1a1aa;text-decoration:line-through}
.cp-check{width:20px;height:20px;flex-shrink:0;margin-top:1px;padding:0;border-radius:50%;border:1.5px solid #d4d4d8;background:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background-color .15s,border-color .15s}
.cp-check:hover{border-color:#a1a1aa}
.cp-check.on{background:#22c55e;border-color:#22c55e}
.cp-kv{display:flex;justify-content:space-between;gap:10px;padding:8px 0;font-size:14px;border-top:1px solid #f4f4f5}
.cp-kv:first-of-type{border-top:none}
.cp-kv span{color:#71717a}
.cp-kv b{font-weight:700;color:var(--ink);text-align:right;font-variant-numeric:tabular-nums}
.cp-since{display:flex;justify-content:space-between;gap:10px;margin-top:10px;padding:10px 14px;border-radius:14px;background:color-mix(in srgb,var(--coral) 9%,#fff);color:color-mix(in srgb,var(--coral) 82%,#000);font-size:13.5px;font-weight:600}
.cp-rfm{display:grid;grid-template-columns:repeat(9,1fr);gap:4px;margin:14px 0 10px}
.cp-rfm i{height:8px;border-radius:999px}
.cp-fine{margin:0;font-size:13px;color:#71717a;line-height:1.5}
.cp-fine b{color:var(--ink)}
@media(max-width:900px){.cp-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.cp-side{flex:1 1 100%;min-width:0}}
@media(max-width:640px){
  .cp{padding:14px 14px 40px}
  .cp-head{gap:14px}
  .cp-av{width:60px;height:60px;font-size:21px}
  .cp-who h1{font-size:24px}
  .cp-acts{width:100%;flex-wrap:nowrap}
  .cp-acts .cv-btn{flex:1;min-width:0;padding:0 12px}
  .cp-acts .cv-btn svg{display:none}
  .cp-stat{padding:14px}
  .cp-stat-v{font-size:22px}
  .cp-search{min-width:0;width:100%}
  .cp-item-more{padding-left:14px}
}
`
