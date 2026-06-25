'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const SUPER_ADMIN_EMAIL = 'bishalstha76@gmail.com'

export default function UserManagementPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [subscriptions, setSubscriptions] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUser, setSelectedUser] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      setUser(u)
      loadUsers()
    })
  }, [router])

  const loadUsers = async () => {
    try {
      const { data: allUsers } = await supabase.auth.admin.listUsers()
      if (allUsers?.users) {
        setUsers(allUsers.users)
        
        // Load subscriptions
        const { data: subs } = await supabase.from('subscriptions').select('*')
        const subsMap = (subs || []).reduce((acc: any, sub: any) => {
          acc[sub.user_id] = sub
          return acc
        }, {})
        setSubscriptions(subsMap)
      }
    } catch (err) {
      console.error('Load failed:', err)
    }
    setLoading(false)
  }

  const filtered = users.filter(u => 
    u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.user_metadata?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (!user) return <div className="p-8">Loading...</div>

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-bold mb-8" style={{ color: 'var(--ink)' }}>User Management</h1>

      {/* Stats */}
      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Total Users', value: users.length, icon: '👥' },
          { label: 'Active Subscriptions', value: Object.values(subscriptions).filter((s: any) => s.status === 'active').length, icon: '💳' },
          { label: 'Free Tier', value: users.length - Object.keys(subscriptions).length, icon: '🆓' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
            <div className="text-3xl mb-2">{s.icon}</div>
            <p className="text-sm" style={{ color: 'var(--slate)' }}>{s.label}</p>
            <p className="text-3xl font-bold mt-1" style={{ color: 'var(--coral)' }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="mb-6">
        <input type="text" placeholder="Search users..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl border focus:outline-none"
          style={{ borderColor: 'var(--border)' }} />
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--canvas)', borderBottom: '1px solid var(--border)' }}>
              <tr>
                <th className="px-6 py-3 text-left font-semibold" style={{ color: 'var(--ink)' }}>User</th>
                <th className="px-6 py-3 text-left font-semibold" style={{ color: 'var(--ink)' }}>Email</th>
                <th className="px-6 py-3 text-left font-semibold" style={{ color: 'var(--ink)' }}>Tier</th>
                <th className="px-6 py-3 text-left font-semibold" style={{ color: 'var(--ink)' }}>Status</th>
                <th className="px-6 py-3 text-left font-semibold" style={{ color: 'var(--ink)' }}>Joined</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center" style={{ color: 'var(--slate)' }}>Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center" style={{ color: 'var(--slate)' }}>No users found</td></tr>
              ) : (
                filtered.map(u => {
                  const sub = subscriptions[u.id]
                  const tier = sub?.tier || 'free'
                  return (
                    <tr key={u.id} className="border-t hover:bg-gray-50 cursor-pointer" style={{ borderColor: 'var(--border)' }}
                      onClick={() => setSelectedUser(u)}>
                      <td className="px-6 py-4" style={{ color: 'var(--ink)' }}>
                        <div className="font-medium">{u.user_metadata?.name || 'No name'}</div>
                      </td>
                      <td className="px-6 py-4" style={{ color: 'var(--slate)' }}>{u.email}</td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{
                          background: tier === 'pro' ? 'var(--peach)' : tier === 'enterprise' ? 'var(--peach)' : 'var(--canvas)',
                          color: tier === 'free' ? 'var(--slate)' : 'var(--coral)',
                        }}>
                          {tier.charAt(0).toUpperCase() + tier.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4" style={{ color: 'var(--slate)' }}>
                        {sub?.status ? sub.status.charAt(0).toUpperCase() + sub.status.slice(1) : 'Free'}
                      </td>
                      <td className="px-6 py-4" style={{ color: 'var(--slate)' }}>
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Detail Modal */}
      {selectedUser && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setSelectedUser(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>User Details</h2>
              <button onClick={() => setSelectedUser(null)} className="text-2xl cursor-pointer" style={{ color: 'var(--slate)' }}>×</button>
            </div>
            
            <div className="space-y-4">
              <div>
                <p className="text-xs" style={{ color: 'var(--slate)' }}>Name</p>
                <p className="font-semibold" style={{ color: 'var(--ink)' }}>{selectedUser.user_metadata?.name || 'No name'}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--slate)' }}>Email</p>
                <p className="font-semibold" style={{ color: 'var(--ink)' }}>{selectedUser.email}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--slate)' }}>Subscription Tier</p>
                <p className="font-semibold" style={{ color: 'var(--coral)' }}>
                  {(subscriptions[selectedUser.id]?.tier || 'free').toUpperCase()}
                </p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--slate)' }}>Status</p>
                <p className="font-semibold" style={{ color: 'var(--ink)' }}>
                  {selectedUser.confirmed_at ? 'Active' : 'Pending'}
                </p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--slate)' }}>Joined</p>
                <p className="font-semibold" style={{ color: 'var(--ink)' }}>
                  {new Date(selectedUser.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            
            <button onClick={() => setSelectedUser(null)} className="w-full mt-6 py-2.5 rounded-lg text-sm font-semibold text-white cursor-pointer" style={{ background: 'var(--coral)' }}>
              Close
            </button>
          </div>
        </>
      )}
    </div>
  )
}
