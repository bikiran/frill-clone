'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

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
}

type User = TeamMember | Customer

export default function UsersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const slug = searchParams.get('slug') || ''

  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'team' | 'customer'>('all')
  const [hasWooCommerce, setHasWooCommerce] = useState(false)

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const sb = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL || '',
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
        )

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
        const company = { id: companyId }

        // Check if WooCommerce integration exists — maybeSingle never throws
        const { data: wooIntegration } = await sb
          .from('woocommerce_integrations')
          .select('id, is_active')
          .eq('company_id', company.id)
          .maybeSingle()

        setHasWooCommerce(!!wooIntegration)

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

          const { data: customers } = await sb
            .from('woocommerce_customers')
            .select('*')
            .eq('company_id', company.id)
            .order('total_spend', { ascending: false })

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
  const effectiveFilterType = !hasWooCommerce && filterType === 'customer' ? 'all' : filterType

  const filteredUsers = users.filter(user => {
    const matchesType = effectiveFilterType === 'all' || user.type === effectiveFilterType
    const matchesSearch =
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.type === 'customer' && `${user.first_name} ${user.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (user.type === 'team' && user.username?.toLowerCase().includes(searchTerm.toLowerCase()))
    return matchesType && matchesSearch
  })

  if (loading) {
    return <div style={{ padding: '24px', color: '#666' }}>Loading users...</div>
  }

  const totalSpend = users.filter(u => u.type === 'customer').reduce((sum, u) => sum + (u.type === 'customer' ? u.total_spend : 0), 0)

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '8px', color: 'var(--ink)' }}>
          Users & Customers
        </h1>
        <p style={{ fontSize: '14px', color: '#666', margin: '0' }}>
          {hasWooCommerce ? 'Manage team members and view WooCommerce customers' : 'Manage team members'}
        </p>
      </div>

      {!hasWooCommerce && (
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
          {(['all', 'team', ...(hasWooCommerce ? ['customer'] : [])] as const).map(type => (
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
              {type === 'all' && `All (${users.length})`}
              {type === 'team' && `Team (${users.filter(u => u.type === 'team').length})`}
              {type === 'customer' && `Customers (${users.filter(u => u.type === 'customer').length})`}
            </button>
          ))}
        </div>
      </div>

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

      {!hasWooCommerce && (
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

        {hasWooCommerce && (
          <>
            <div style={{ borderRadius: '12px', border: '1px solid var(--border)', padding: '16px', background: '#fff' }}>
              <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>Synced Customers</p>
              <p style={{ margin: '0', fontSize: '24px', fontWeight: 700, color: 'var(--coral)' }}>
                {users.filter(u => u.type === 'customer').length}
              </p>
            </div>

            <div style={{ borderRadius: '12px', border: '1px solid var(--border)', padding: '16px', background: '#fff' }}>
              <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>Total Customer Spend</p>
              <p style={{ margin: '0', fontSize: '24px', fontWeight: 700, color: 'var(--ink)' }}>
                ${totalSpend.toFixed(0)}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
