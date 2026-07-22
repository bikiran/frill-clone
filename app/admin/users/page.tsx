'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { SkeletonList } from '@/components/Skeleton'
import { SegmentationService } from '@/lib/segmentation-service'

interface TeamMember {
  id: string
  type: 'team'
  email: string
  username?: string
  role: string
  status: string
}

interface Customer {
  id: string
  type: 'customer'
  email: string
  first_name: string
  last_name: string
  phone?: string
  total_spend: number
  total_orders: number
  woo_customer_id: number
  last_order_date?: string | null
  first_order_date?: string | null
  created_at?: string | null
  highest_order?: number
  rfm_score?: number
  rfm_category?: string
  address?: any
  items_purchased?: any
  source?: string
}

type User = TeamMember | Customer

export default function UsersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const slug = searchParams.get('slug') || ''

  const [users, setUsers] = useState<User[]>([])
  const [customerPage, setCustomerPage] = useState(0) // 0-indexed
  const [totalCustomers, setTotalCustomers] = useState(0)
  const [totalSpendDb, setTotalSpendDb] = useState(0)
  const PAGE_SIZE = 100
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'team' | 'customer'>('all')
  // ── Customer filters ──────────────────────────────────────────────────────
  const [showFilters, setShowFilters] = useState(false)
  const [sortBy, setSortBy] = useState<'spend' | 'recent_added' | 'recent_order' | 'highest_order' | 'num_orders' | 'loyalty'>('spend')
  const [fChannel, setFChannel] = useState<'' | 'woocommerce' | 'shopify'>('')
  const [fLoyalty, setFLoyalty] = useState('')       // RFM category
  const [fMinSpend, setFMinSpend] = useState('')
  const [fMinOrders, setFMinOrders] = useState('')
  const [fState, setFState] = useState('')
  const [fPostcode, setFPostcode] = useState('')
  const [fProduct, setFProduct] = useState('')       // sku or title
  const [filterResults, setFilterResults] = useState<Customer[] | null>(null)
  const [filtering, setFiltering] = useState(false)
  const [resolvedCompanyId, setResolvedCompanyId] = useState<string | null>(null)
  const filterInput: React.CSSProperties = { display: 'block', width: '100%', marginTop: 5, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', fontWeight: 500, color: 'var(--ink)' }
  const filtersActive = !!(fChannel || fLoyalty || fMinSpend || fMinOrders || fState || fPostcode || fProduct || sortBy !== 'spend')
  const [hasWooCommerce, setHasWooCommerce] = useState(false)
  const [hasShopify, setHasShopify] = useState(false)

  const loadCustomerPage = async (page: number) => {
    try {
      const sb = supabase as any
      let companyId2: string | null = null
      if (typeof window !== 'undefined') {
        const h = window.location.hostname
        if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
          const { data: co } = await sb.from('companies').select('id').eq('slug', h.replace('.colvy.com', '')).maybeSingle()
          if (co) companyId2 = co.id
        }
      }
      if (!companyId2) {
        const { data: { session } } = await sb.auth.getSession()
        if (session?.user) {
          const { data: ownCo } = await sb.from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
          if (ownCo?.id) companyId2 = ownCo.id
        }
      }
      if (!companyId2) return
      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      const { data: customers } = await (sb as any)
        .from('woocommerce_customers').select('*')
        .eq('company_id', companyId2)
        .order('total_spend', { ascending: false })
        .range(from, to)
      setUsers(prev => {
        const teams = prev.filter(u => u.type === 'team')
        return [...teams, ...(customers || []).map((c: any) => ({ id: c.id, type: 'customer' as const, email: c.email, first_name: c.first_name, last_name: c.last_name, phone: c.phone, total_spend: c.total_spend, total_orders: c.total_orders, woo_customer_id: c.woo_customer_id }))]
      })
    } catch {}
  }

  useEffect(() => {
    if (customerPage > 0) { loadCustomerPage(customerPage) }
  }, [customerPage])

  // Server-side search across ALL customers (not just the loaded page).
  // Debounced ilike query on name/email; clearing the search restores page view.
  const searchTimer = useRef<any>(null)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      const term = searchTerm.trim()
      if (!term) {
        // restore normal paged view
        if (customerPage === 0) return
        setCustomerPage(0)
        loadCustomerPage(0)
        return
      }
      try {
        const sb = supabase as any
        let cid2: string | null = null
        if (typeof window !== 'undefined') {
          const h = window.location.hostname
          if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
            const { data: co } = await sb.from('companies').select('id').eq('slug', h.replace('.colvy.com', '')).maybeSingle()
            if (co) cid2 = co.id
          }
        }
        if (!cid2) {
          const { data: { session } } = await sb.auth.getSession()
          if (session?.user) {
            const { data: ownCo } = await sb.from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
            if (ownCo?.id) cid2 = ownCo.id
          }
        }
        if (!cid2) return
        const like = `%${term}%`
        const { data: matches } = await (sb as any)
          .from('woocommerce_customers').select('*')
          .eq('company_id', cid2)
          .or(`email.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`)
          .order('total_spend', { ascending: false })
          .limit(100)
        setUsers(prev => {
          const teams = prev.filter(u => u.type === 'team')
          return [...teams, ...(matches || []).map((c: any) => ({ id: c.id, type: 'customer' as const, email: c.email, first_name: c.first_name, last_name: c.last_name, phone: c.phone, total_spend: c.total_spend, total_orders: c.total_orders, woo_customer_id: c.woo_customer_id }))]
        })
      } catch {}
    }, 400)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [searchTerm])

  // ── Apply customer filters server-side (across ALL customers, not just the
  //    loaded page). Debounced. Clears back to page view when no filter is set.
  const filterTimer = useRef<any>(null)
  useEffect(() => {
    if (filterTimer.current) clearTimeout(filterTimer.current)
    if (!resolvedCompanyId || !filtersActive) { setFilterResults(null); return }
    setFiltering(true)
    filterTimer.current = setTimeout(async () => {
      try {
        const sb = supabase as any
        const table = fChannel === 'shopify' ? 'shopify_customers' : 'woocommerce_customers'
        let q = (sb as any).from(table).select('*').eq('company_id', resolvedCompanyId)
        // Numeric thresholds — pushed to the DB.
        if (fMinSpend) q = q.gte('total_spend', parseFloat(fMinSpend) || 0)
        if (fMinOrders) q = q.gte('total_orders', parseInt(fMinOrders) || 0)
        // Address lives in a JSONB column; filter with ->> on state/postcode.
        if (fState) q = q.ilike('address->>state', `%${fState.trim()}%`)
        if (fPostcode) q = q.ilike('address->>postcode', `%${fPostcode.trim()}%`)
        // Server-side ordering for the sort options that map to a column.
        const orderCol = sortBy === 'recent_added' ? 'created_at'
          : sortBy === 'recent_order' ? 'last_order_date'
          : sortBy === 'highest_order' ? 'total_spend'  // proxy; refined client-side below
          : sortBy === 'num_orders' ? 'total_orders'
          : 'total_spend'
        q = q.order(orderCol, { ascending: false, nullsFirst: false }).limit(2000)
        const { data } = await q
        let rows: any[] = data || []

        // Product filter (SKU or title) — items_purchased is JSONB; match in JS
        // so we can look inside each item object.
        const prod = fProduct.trim().toLowerCase()
        if (prod) {
          rows = rows.filter(r => {
            let ip = r.items_purchased
            if (typeof ip === 'string') { try { ip = JSON.parse(ip) } catch { ip = [ip] } }
            if (!Array.isArray(ip)) return false
            return ip.some((it: any) => {
              if (typeof it === 'string') return it.toLowerCase().includes(prod)
              const sku = String(it.sku || it.SKU || '').toLowerCase()
              const name = String(it.name || it.title || it.product_name || '').toLowerCase()
              return sku.includes(prod) || name.includes(prod)
            })
          })
        }

        // Attach RFM + a highest-order proxy, then apply loyalty filter and the
        // sorts that need computed values.
        rows = rows.map(r => {
          const score = SegmentationService.getRFMScore(r)
          return { ...r, __rfm: score, __rfmCat: SegmentationService.getRFMCategory(score) }
        })
        if (fLoyalty) rows = rows.filter(r => r.__rfmCat === fLoyalty)
        if (sortBy === 'loyalty') rows.sort((a, b) => b.__rfm - a.__rfm)
        if (sortBy === 'highest_order') {
          const hv = (r: any) => (r.total_orders > 0 ? (parseFloat(r.total_spend) || 0) / r.total_orders : 0)
          rows.sort((a, b) => hv(b) - hv(a))
        }

        const mapped: Customer[] = rows.map((c: any) => ({
          id: c.id, type: 'customer', email: c.email, first_name: c.first_name, last_name: c.last_name,
          phone: c.phone, total_spend: c.total_spend, total_orders: c.total_orders,
          woo_customer_id: c.woo_customer_id, last_order_date: c.last_order_date, created_at: c.created_at,
          rfm_score: c.__rfm, rfm_category: c.__rfmCat, address: c.address, items_purchased: c.items_purchased,
          source: fChannel === 'shopify' ? 'shopify' : undefined,
        }))
        setFilterResults(mapped)
      } catch (e) {
        console.error('Customer filter failed:', e)
        setFilterResults([])
      } finally {
        setFiltering(false)
      }
    }, 350)
    return () => { if (filterTimer.current) clearTimeout(filterTimer.current) }
  }, [resolvedCompanyId, filtersActive, sortBy, fChannel, fLoyalty, fMinSpend, fMinOrders, fState, fPostcode, fProduct])

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const sb = supabase as any

        // Resolve company: query slug → hostname slug → owner → team membership.
        // Previously only ?slug= was used (with a throwing .single()), so on a
        // subdomain without ?slug the page found no company and wrongly showed
        // "WooCommerce Not Connected" and no users.
        let companyId: string | null = null

        if (slug) {
          const { data: co } = await sb.from('companies').select('id').eq('slug', slug).maybeSingle()
          if (co) companyId = co.id
        }

        if (!companyId && typeof window !== 'undefined') {
          const h = window.location.hostname
          if (h.endsWith('.colvy.com') && h !== 'colvy.com' && h !== 'www.colvy.com') {
            const hostSlug = h.replace('.colvy.com', '')
            const { data: co } = await sb.from('companies').select('id').eq('slug', hostSlug).maybeSingle()
            if (co) companyId = co.id
          }
        }

        if (!companyId) {
          const { data: { session } } = await sb.auth.getSession()
          if (session?.user) {
            const { data: ownCo } = await sb.from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
            if (ownCo?.id) {
              companyId = ownCo.id
            } else {
              const { data: memberships } = await sb
                .from('team_members').select('company_id')
                .eq('user_id', session.user.id).limit(1)
              if (memberships && memberships.length > 0) companyId = memberships[0].company_id
            }
          }
        }

        if (!companyId) return
        setResolvedCompanyId(companyId)
        const company = { id: companyId }

        // Check if any WooCommerce integration exists (a company can have several)
        const { data: wooRows } = await sb
          .from('woocommerce_integrations')
          .select('id, is_active')
          .eq('company_id', company.id)
          .limit(1)
        const wooIntegration = wooRows?.[0]

        setHasWooCommerce(!!wooIntegration)

        // Check for a connected Shopify store too
        const { data: shopRows } = await sb
          .from('shopify_integrations')
          .select('id')
          .eq('company_id', company.id)
          .eq('is_active', true)
          .limit(1)
        setHasShopify(!!(shopRows && shopRows.length > 0))

        const { data: teamMembers } = await sb
          .from('team_members')
          .select('*')
          .eq('company_id', company.id)

        const allUsers: User[] = [
          ...(teamMembers || []).map(m => ({
            id: m.id,
            type: 'team' as const,
            email: m.email,
            username: m.username,
            role: m.role,
            status: m.status
          }))
        ]

        // Only load customers if WooCommerce is integrated
        if (wooIntegration) {
          // Trigger auto-sync in background (don't wait)
          fetch('/api/customers/auto-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyId: company.id, force: false })
          }).catch(err => console.error('Auto-sync error:', err))

          // Paginated fetch — Supabase caps at 1000 rows default; we fetch 100/page
          const { data: customers, count: custCount } = await sb
            .from('woocommerce_customers')
            .select('*', { count: 'exact' })
            .eq('company_id', company.id)
            .order('total_spend', { ascending: false })
            .range(0, 99)

          setTotalCustomers(custCount || 0)

          // Aggregate total spend from DB (sum over all rows, not just the page)
          const { data: spendData } = await (sb as any)
            .from('woocommerce_customers')
            .select('total_spend')
            .eq('company_id', company.id)
            .gt('total_spend', 0)
            .limit(10000)  // covers up to 10K customers for the sum

          const dbSpend = (spendData || []).reduce((s: number, r: any) => s + (parseFloat(r.total_spend) || 0), 0)
          setTotalSpendDb(Math.round(dbSpend))

          allUsers.push(
            ...(customers || []).map(c => ({
              id: c.id,
              type: 'customer' as const,
              email: c.email,
              first_name: c.first_name,
              last_name: c.last_name,
              phone: c.phone,
              total_spend: c.total_spend,
              total_orders: c.total_orders,
              woo_customer_id: c.woo_customer_id
            }))
          )
        }

        // Also pull Shopify customers (independent of WooCommerce) so they show
        // even for merchants who only use Shopify.
        try {
          const { data: shopCustomers } = await (sb as any)
            .from('shopify_customers')
            .select('*')
            .eq('company_id', company.id)
            .order('total_spend', { ascending: false })
            .range(0, 99)
          if (shopCustomers && shopCustomers.length > 0) {
            allUsers.push(...shopCustomers.map((c: any) => ({
              id: c.id,
              type: 'customer' as const,
              email: c.email,
              first_name: c.first_name,
              last_name: c.last_name,
              phone: c.phone,
              total_spend: c.total_spend,
              total_orders: c.total_orders,
              source: 'shopify',
            })))
          }
        } catch {}

        setUsers(allUsers)
      } catch (err) {
        console.error('Failed to load users:', err)
      } finally {
        setLoading(false)
      }
    }

    loadUsers()
  }, [slug])

  // Reset filter if no WooCommerce and trying to filter by customer
  const hasEcommerce = hasWooCommerce || hasShopify
  const effectiveFilterType = !hasEcommerce && filterType === 'customer' ? 'all' : filterType

  // When customer filters are active, show the server-side filtered results
  // (across all customers) plus any team members that still match the tab.
  const baseUsers: User[] = filterResults !== null
    ? [
        ...(effectiveFilterType !== 'customer' ? users.filter(u => u.type === 'team') : []),
        ...filterResults,
      ]
    : users
  const filteredUsers = baseUsers.filter(user => {
    const matchesType = effectiveFilterType === 'all' || user.type === effectiveFilterType
    const matchesSearch =
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.type === 'customer' && `${user.first_name} ${user.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (user.type === 'team' && user.username?.toLowerCase().includes(searchTerm.toLowerCase()))
    return matchesType && matchesSearch
  })

  if (loading) {
    return <SkeletonList rows={6} />
  }

  // totalSpend comes from DB aggregate (covers all pages, not just visible 100)

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '8px', color: 'var(--ink)' }}>
          Users & Customers
        </h1>
        <p style={{ fontSize: '14px', color: '#666', margin: '0' }}>
          {hasEcommerce ? 'Manage team members and view customers' : 'Manage team members'}
        </p>
      </div>

      {!hasEcommerce && (
        <div style={{
          padding: '16px',
          borderRadius: '8px',
          background: '#fef3c7',
          border: '1px solid #fcd34d',
          marginBottom: '24px',
          fontSize: '13px',
          color: '#92400e',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <strong>WooCommerce Not Connected</strong> — Connect your WooCommerce store in <a href={`/admin/integrations/woocommerce?slug=${slug}`} style={{ color: '#92400e', textDecoration: 'underline', cursor: 'pointer' }}>Settings → Integrations</a> to import customers.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search by name, email, or username..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ flex: 1, minWidth: '200px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
        />

        <div style={{ display: 'flex', gap: '8px' }}>
          {(['all', 'team', ...(hasEcommerce ? ['customer'] : [])] as const).map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type as any)}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: filterType === type ? 'none' : '1px solid var(--border)',
                background: filterType === type ? 'var(--coral)' : '#fff',
                color: filterType === type ? '#fff' : 'var(--ink)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {type === 'all' && `All (${(users.filter(u => u.type === 'team').length + totalCustomers).toLocaleString()})`}
              {type === 'team' && `Team (${users.filter(u => u.type === 'team').length})`}
              {type === 'customer' && `Customers (${totalCustomers.toLocaleString()})`}
            </button>
          ))}
        </div>
        {hasEcommerce && (
          <button onClick={() => setShowFilters(v => !v)}
            style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid var(--border)', background: filtersActive ? 'var(--peach)' : '#fff', color: filtersActive ? 'var(--coral)' : 'var(--ink)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            Filters{filtersActive ? ' •' : ''}
          </button>
        )}
      </div>

      {hasEcommerce && showFilters && (
        <div style={{ marginBottom: 24, padding: 16, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--canvas)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
            {/* Sort */}
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)' }}>Sort by
              <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} style={filterInput}>
                <option value="spend">Total spend (high→low)</option>
                <option value="recent_added">Recently added</option>
                <option value="recent_order">Most recent order</option>
                <option value="highest_order">Highest order value</option>
                <option value="num_orders">Number of orders</option>
                <option value="loyalty">Loyalty (RFM)</option>
              </select>
            </label>
            {/* Channel */}
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)' }}>Channel
              <select value={fChannel} onChange={e => setFChannel(e.target.value as any)} style={filterInput}>
                <option value="">All channels</option>
                <option value="woocommerce">WooCommerce</option>
                <option value="shopify">Shopify</option>
              </select>
            </label>
            {/* Loyalty */}
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)' }}>Loyalty segment
              <select value={fLoyalty} onChange={e => setFLoyalty(e.target.value)} style={filterInput}>
                <option value="">Any</option>
                <option value="Champions">Champions</option>
                <option value="Loyal Customers">Loyal Customers</option>
                <option value="Potential Loyalists">Potential Loyalists</option>
                <option value="At Risk">At Risk</option>
                <option value="Lost">Lost</option>
              </select>
            </label>
            {/* Min spend */}
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)' }}>Min spend ($)
              <input type="number" value={fMinSpend} onChange={e => setFMinSpend(e.target.value)} placeholder="e.g. 500" style={filterInput} />
            </label>
            {/* Min orders */}
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)' }}>Min orders
              <input type="number" value={fMinOrders} onChange={e => setFMinOrders(e.target.value)} placeholder="e.g. 3" style={filterInput} />
            </label>
            {/* State */}
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)' }}>State
              <input type="text" value={fState} onChange={e => setFState(e.target.value)} placeholder="e.g. VIC" style={filterInput} />
            </label>
            {/* Postcode */}
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)' }}>Postcode
              <input type="text" value={fPostcode} onChange={e => setFPostcode(e.target.value)} placeholder="e.g. 3000" style={filterInput} />
            </label>
            {/* Product */}
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)' }}>Purchased (SKU or title)
              <input type="text" value={fProduct} onChange={e => setFProduct(e.target.value)} placeholder="e.g. 1132 or Pleco" style={filterInput} />
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <button onClick={() => { setSortBy('spend'); setFChannel(''); setFLoyalty(''); setFMinSpend(''); setFMinOrders(''); setFState(''); setFPostcode(''); setFProduct('') }}
              style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--slate)' }}>
              Clear all
            </button>
            <span style={{ fontSize: 12, color: 'var(--slate)' }}>
              {filtering ? 'Filtering…' : filterResults !== null ? `${filterResults.length.toLocaleString()} customer${filterResults.length === 1 ? '' : 's'} match` : ''}
            </span>
          </div>
        </div>
      )}

      <div style={{ borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', background: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--peach)' }}>
              <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: 'var(--ink)' }}>
                Name / Email
              </th>
              <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: 'var(--ink)' }}>
                Type
              </th>
              <th style={{ textAlign: 'right', padding: '12px 16px', fontWeight: 600, color: 'var(--ink)' }}>
                Details
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length > 0 ? (
              filteredUsers.map(user => (
                <tr
                  key={user.id}
                  onClick={() => {
                    if (user.type === 'customer') {
                      router.push(`/admin/customers/profile?slug=${slug}&id=${user.id}`)
                    }
                  }}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    cursor: user.type === 'customer' ? 'pointer' : 'default',
                    background: user.type === 'customer' ? 'rgba(255, 122, 107, 0.05)' : '#fff',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (user.type === 'customer') {
                      (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(255, 122, 107, 0.1)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (user.type === 'customer') {
                      (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(255, 122, 107, 0.05)'
                    }
                  }}
                >
                  <td style={{ padding: '12px 16px', color: 'var(--ink)', fontWeight: 500 }}>
                    {user.type === 'team' ? (
                      <div>
                        <p style={{ margin: '0', fontWeight: 600 }}>{user.username || user.email}</p>
                        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#666' }}>{user.email}</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="1.5" style={{ flexShrink: 0 }}>
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <path d="M12 8v8M16 12H8"/>
                          </svg>
                          <div>
                            <p style={{ margin: '0', fontWeight: 600 }}>
                              {user.first_name} {user.last_name}
                            </p>
                            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#666' }}>{user.email}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </td>

                  <td style={{ padding: '12px 16px', color: '#666', fontSize: '12px' }}>
                    {user.type === 'team' ? (
                      <span style={{ display: 'inline-block', padding: '4px 8px', borderRadius: '4px', background: '#dcfce7', color: '#166534', fontWeight: 600 }}>
                        Team Member
                      </span>
                    ) : (
                      <span style={{ display: 'inline-block', padding: '4px 8px', borderRadius: '4px', background: 'var(--peach)', color: 'var(--coral)', fontWeight: 600 }}>
                        Customer
                      </span>
                    )}
                  </td>

                  <td style={{ textAlign: 'right', padding: '12px 16px', color: '#666' }}>
                    {user.type === 'team' ? (
                      <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'capitalize' }}>
                        {user.role}
                      </span>
                    ) : (
                      <div style={{ fontSize: '12px', textAlign: 'right' }}>
                        <p style={{ margin: '0', fontWeight: 600, color: 'var(--ink)' }}>
                          ${user.total_spend.toFixed(0)}
                        </p>
                        <p style={{ margin: '2px 0 0 0', color: '#999' }}>
                          {user.total_orders} orders
                        </p>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} style={{ padding: '32px', textAlign: 'center', color: '#999' }}>
                  No users found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!hasEcommerce && (
        <div style={{
          borderRadius: '12px',
          border: '1px solid #fbbf24',
          background: '#fef3c7',
          padding: '16px',
          marginTop: '24px',
          marginBottom: '24px'
        }}>
          <p style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: '#92400e' }}>
            🔗 WooCommerce Not Connected
          </p>
          <p style={{ margin: '0', fontSize: '13px', color: '#b45309' }}>
            Connect your WooCommerce store in <strong>Settings → Integrations</strong> to see synced customers here.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '32px' }}>
        <div style={{ borderRadius: '12px', border: '1px solid var(--border)', padding: '16px', background: '#fff' }}>
          <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>Total Users</p>
          <p style={{ margin: '0', fontSize: '24px', fontWeight: 700, color: 'var(--ink)' }}>
            {users.length}
          </p>
        </div>

        <div style={{ borderRadius: '12px', border: '1px solid var(--border)', padding: '16px', background: '#fff' }}>
          <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>Team Members</p>
          <p style={{ margin: '0', fontSize: '24px', fontWeight: 700, color: 'var(--ink)' }}>
            {users.filter(u => u.type === 'team').length}
          </p>
        </div>

        {hasEcommerce && (
          <>
            <div style={{ borderRadius: '12px', border: '1px solid var(--border)', padding: '16px', background: '#fff' }}>
              <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>Synced Customers</p>
              <p style={{ margin: '0', fontSize: '24px', fontWeight: 700, color: 'var(--coral)' }}>
                {totalCustomers.toLocaleString()}
              </p>
            </div>

            <div style={{ borderRadius: '12px', border: '1px solid var(--border)', padding: '16px', background: '#fff' }}>
              <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>Total Customer Spend</p>
              <p style={{ margin: '0', fontSize: '24px', fontWeight: 700, color: 'var(--ink)' }}>
                ${totalSpendDb.toLocaleString()}
              </p>
            </div>
          </>
        )}
      </div>
      {/* Customer pagination */}
      {hasWooCommerce && totalCustomers > PAGE_SIZE && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, padding: '0 4px' }}>
          <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
            Showing {customerPage * PAGE_SIZE + 1}–{Math.min((customerPage + 1) * PAGE_SIZE, totalCustomers)} of {totalCustomers.toLocaleString()} customers
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setCustomerPage(p => Math.max(0, p - 1))}
              disabled={customerPage === 0}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: customerPage === 0 ? '#f9f9f9' : '#fff', color: customerPage === 0 ? '#ccc' : 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: customerPage === 0 ? 'default' : 'pointer' }}>
              ← Previous
            </button>
            <span style={{ padding: '8px 12px', fontSize: 13, color: '#666' }}>
              Page {customerPage + 1} of {Math.ceil(totalCustomers / PAGE_SIZE)}
            </span>
            <button
              onClick={() => setCustomerPage(p => p + 1)}
              disabled={(customerPage + 1) * PAGE_SIZE >= totalCustomers}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: (customerPage + 1) * PAGE_SIZE >= totalCustomers ? '#f9f9f9' : 'var(--coral)', color: (customerPage + 1) * PAGE_SIZE >= totalCustomers ? '#ccc' : '#fff', fontSize: 13, fontWeight: 600, cursor: (customerPage + 1) * PAGE_SIZE >= totalCustomers ? 'default' : 'pointer' }}>
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
