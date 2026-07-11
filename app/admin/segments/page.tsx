'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ConfirmModal from '@/components/ConfirmModal'
import { TrashIcon, PlusIcon, SearchIcon } from '@/components/Icons'
import { SkeletonList } from '@/components/Skeleton'


type Segment = { id: string; name: string; conditions: any[]; match_type: string; created_at: string }

export default function SegmentsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null)
  const [searchUsers, setSearchUsers] = useState('')
  const [visibleCount, setVisibleCount] = useState(50)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newMatchType, setNewMatchType] = useState('all')
  const [newConditions, setNewConditions] = useState([{ field: 'email', operator: 'contains', value: '' }])
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null)
  const [selectedUser, setSelectedUser] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      setUser(u)
    })
    fetchSegments()
    fetchUsers()
  }, [router])

  useEffect(() => { setVisibleCount(50) }, [selectedSegment, searchUsers])

  const fetchSegments = async () => {
    try {
      const { data } = await supabase.from('segments').select('*').order('created_at', { ascending: false })
      if (data) {
        setSegments(data)
        if (data.length > 0 && !selectedSegment) setSelectedSegment(data[0])
      }
    } catch {}
    setLoading(false)
  }

  const fetchUsers = async () => {
    // Resolve the company (subdomain slug → owner → team membership).
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) { setAllUsers([]); return }
    let cid: string | null = null
    const h = typeof window !== 'undefined' ? window.location.hostname : ''
    if (h.endsWith('.colvy.com') && h !== 'colvy.com' && h !== 'www.colvy.com') {
      const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', h.replace('.colvy.com', '')).maybeSingle()
      cid = co?.id || null
    }
    if (!cid) {
      const { data: ownCo } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
      cid = ownCo?.id || null
    }
    if (!cid) {
      const { data: tm } = await (supabase as any).from('team_members').select('company_id').eq('user_id', session.user.id).maybeSingle()
      cid = tm?.company_id || null
    }

    // A single map keyed by email (or a synthetic key) so the same person from
    // multiple sources merges into one row with combined source tags.
    const userMap = new Map<string, any>()
    const add = (key: string, data: any, source: string) => {
      const k = (key || '').toLowerCase() || `${source}-${Math.random()}`
      const existing = userMap.get(k)
      if (existing) {
        existing.sources = Array.from(new Set([...(existing.sources || []), source]))
        // Fill any missing fields
        for (const f of ['name', 'email', 'phone', 'total_spend', 'total_orders']) if (!existing[f] && data[f]) existing[f] = data[f]
      } else {
        userMap.set(k, { ...data, sources: [source] })
      }
    }

    // 1) Feedback board users (ideas) — scoped to THIS company only.
    if (cid) {
      try {
        const { data: ideas } = await supabase.from('ideas').select('user_id, created_by_name, created_at').eq('company_id', cid)
        ;(ideas || []).forEach((i: any) => { if (i.user_id) add(i.user_id, { id: i.user_id, name: i.created_by_name || 'Anonymous', last_seen: i.created_at }, 'feedback') })
      } catch {}
    }

    if (cid) {
      // 2) Chat contacts
      try {
        const { data: contacts } = await (supabase as any).from('contacts').select('id, name, email, phone, created_at').eq('company_id', cid)
        ;(contacts || []).forEach((c: any) => add(c.email || c.id, { id: c.id, name: c.name || 'Contact', email: c.email, phone: c.phone, last_seen: c.created_at }, 'chat'))
      } catch {}
      // 3) WooCommerce customers
      try {
        const { data: woo } = await (supabase as any).from('woocommerce_customers').select('id, email, first_name, last_name, phone, total_spend, total_orders').eq('company_id', cid)
        ;(woo || []).forEach((c: any) => add(c.email || c.id, { id: c.id, name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email, email: c.email, phone: c.phone, total_spend: c.total_spend, total_orders: c.total_orders }, 'woocommerce'))
      } catch {}
      // 4) Shopify customers
      try {
        const { data: shop } = await (supabase as any).from('shopify_customers').select('id, email, first_name, last_name, phone, total_spend, total_orders').eq('company_id', cid)
        ;(shop || []).forEach((c: any) => add(c.email || c.id, { id: c.id, name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email, email: c.email, phone: c.phone, total_spend: c.total_spend, total_orders: c.total_orders }, 'shopify'))
      } catch {}
    }

    setAllUsers(Array.from(userMap.values()))
  }

  const matchUser = (u: any, segment: Segment) => {
    if (!segment.conditions || segment.conditions.length === 0) return true
    const checks = segment.conditions.map((c: any) => {
      // 'source' is an array of tags; match if any tag matches.
      if (c.field === 'source') {
        const target = (c.value || '').toLowerCase()
        const srcs = (u.sources || []).map((s: string) => s.toLowerCase())
        if (c.operator === 'is_equal_to') return srcs.includes(target)
        return srcs.some((s: string) => s.includes(target))
      }
      const val = (u[c.field] || u.name || '').toLowerCase()
      const target = (c.value || '').toLowerCase()
      if (c.operator === 'contains') return val.includes(target)
      if (c.operator === 'is_equal_to') return val === target
      if (c.operator === 'starts_with') return val.startsWith(target)
      return true
    })
    return segment.match_type === 'all' ? checks.every(Boolean) : checks.some(Boolean)
  }

  const segmentUsers = selectedSegment
    ? allUsers.filter(u => matchUser(u, selectedSegment)).filter(u => !searchUsers || (u.name || '').toLowerCase().includes(searchUsers.toLowerCase()) || (u.email || '').toLowerCase().includes(searchUsers.toLowerCase()))
    : allUsers.filter(u => !searchUsers || (u.name || '').toLowerCase().includes(searchUsers.toLowerCase()) || (u.email || '').toLowerCase().includes(searchUsers.toLowerCase()))
  const visibleUsers = segmentUsers.slice(0, visibleCount)

  const createSegment = async () => {
    if (!newName.trim()) return
    const { error } = await supabase.from('segments').insert({
      name: newName.trim(),
      match_type: newMatchType,
      conditions: newConditions.filter(c => c.value.trim()),
    })
    if (error) {
      alert('Failed to create segment. Run DATABASE_SETUP.sql.\n' + error.message)
      return
    }
    setNewName('')
    setNewConditions([{ field: 'email', operator: 'contains', value: '' }])
    setShowCreate(false)
    fetchSegments()
  }

  const deleteSegment = async (id: string) => {
    await supabase.from('segments').delete().eq('id', id)
    if (selectedSegment?.id === id) setSelectedSegment(null)
    fetchSegments()
    setConfirmDelete(null)
  }

  if (loading || !user) return <SkeletonList rows={6} />

  return (
    <div className="flex min-h-[calc(100vh-56px)]">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 bg-white border-r" style={{ borderColor: 'var(--border)' }}>
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <Link href="/admin" className="text-sm font-medium hover:opacity-70 transition-smooth" style={{ color: 'var(--coral)' }}>← Admin</Link>
          <button onClick={() => setShowCreate(true)} className="p-2 rounded-lg hover:bg-gray-100 transition-smooth cursor-pointer" title="Create Segment">
            <PlusIcon size={16} color="var(--coral)" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2 px-2">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--slate)' }}>Segments</p>
          <button
            onClick={() => setSelectedSegment(null)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-smooth hover:bg-gray-50 cursor-pointer"
            style={{ background: !selectedSegment ? 'var(--canvas)' : 'transparent', color: 'var(--ink)', fontWeight: !selectedSegment ? 600 : 400 }}>
            <span>All Customers</span>
            <span className="text-xs px-1.5 rounded" style={{ background: 'var(--canvas)', color: 'var(--slate)' }}>{allUsers.length}</span>
          </button>
          {segments.map(s => (
            <button
              key={s.id}
              onClick={() => setSelectedSegment(s)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-smooth hover:bg-gray-50 cursor-pointer"
              style={{ background: selectedSegment?.id === s.id ? 'var(--canvas)' : 'transparent', color: 'var(--ink)', fontWeight: selectedSegment?.id === s.id ? 600 : 400 }}>
              <span className="truncate">{s.name}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>{selectedSegment ? selectedSegment.name : 'All Customers'}</h1>
              <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>{segmentUsers.length} {segmentUsers.length === 1 ? 'customer' : 'customers'}</p>
            </div>
            <div className="flex items-center gap-2">
              {selectedSegment && (
                <button onClick={() => setConfirmDelete({ id: selectedSegment.id, name: selectedSegment.name })} className="px-3 py-2 rounded-lg border text-sm text-red-600 hover:bg-red-50 transition-smooth cursor-pointer" style={{ borderColor: '#fca5a5' }}>
                  <TrashIcon size={14} color="#dc2626" />
                </button>
              )}
              <button onClick={() => setShowCreate(true)} className="px-4 py-2.5 rounded-xl font-semibold text-white text-sm transition-smooth press-effect cursor-pointer flex items-center gap-2" style={{ background: 'var(--coral)' }}>
                <PlusIcon size={14} color="white" /> Create Segment
              </button>
            </div>
          </div>

          <div className="flex gap-6">
            {/* User list */}
            <div className="flex-1">
              <div className="mb-4">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                  <SearchIcon size={16} color="var(--slate)" />
                  <input type="text" value={searchUsers} onChange={e => setSearchUsers(e.target.value)} placeholder="Search customers" className="flex-1 text-sm focus:outline-none" style={{ fontSize: '16px' }} />
                </div>
              </div>
              <div className="space-y-1">
                {visibleUsers.map(u => {
                  const SRC: Record<string, { label: string; bg: string; c: string }> = {
                    woocommerce: { label: 'WooCommerce', bg: '#f3e8ff', c: '#96588A' },
                    shopify: { label: 'Shopify', bg: '#eefbe0', c: '#5c8a1b' },
                    chat: { label: 'Chat', bg: '#e0f2fe', c: '#0369a1' },
                    feedback: { label: 'Feedback', bg: '#fef3c7', c: '#b45309' },
                  }
                  return (
                  <button key={u.id} onClick={() => setSelectedUser(selectedUser?.id === u.id ? null : u)} className="w-full flex items-center gap-3 p-3 rounded-xl border transition-smooth hover:shadow-md cursor-pointer text-left" style={{ borderColor: selectedUser?.id === u.id ? 'var(--coral)' : 'var(--border)', background: selectedUser?.id === u.id ? 'var(--peach)' : 'white' }}>
                    <span className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: 'var(--coral)' }}>
                      {(u.name || 'A')[0].toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{u.name}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--slate)' }}>{u.email || (u.last_seen ? `Last seen ${new Date(u.last_seen).toLocaleDateString()}` : '')}{u.total_spend ? ` · $${u.total_spend} spent` : ''}</p>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {(u.sources || []).map((s: string) => {
                          const meta = SRC[s] || { label: s, bg: '#f3f4f6', c: '#6b7280' }
                          return <span key={s} style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: meta.bg, color: meta.c }}>{meta.label}</span>
                        })}
                      </div>
                    </div>
                  </button>
                )})}
                {segmentUsers.length === 0 && <p className="text-center py-8" style={{ color: 'var(--slate)' }}>No customers found</p>}
                {visibleCount < segmentUsers.length && (
                  <button onClick={() => setVisibleCount(c => c + 50)} className="w-full py-2.5 mt-2 rounded-lg border text-sm font-medium" style={{ borderColor: 'var(--border)', color: 'var(--coral)' }}>
                    Load more ({segmentUsers.length - visibleCount} remaining)
                  </button>
                )}
              </div>
            </div>

            {/* User detail */}
            {selectedUser && (
              <div className="hidden lg:block w-80 bg-white rounded-2xl border p-6 h-fit sticky top-6" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold" style={{ background: 'var(--coral)' }}>
                    {(selectedUser.name || 'A')[0].toUpperCase()}
                  </span>
                  <div>
                    <p className="font-bold" style={{ color: 'var(--ink)' }}>{selectedUser.name}</p>
                    <p className="text-xs" style={{ color: 'var(--slate)' }}>Joined {new Date(selectedUser.last_seen).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Create segment modal */}
      {showCreate && (
        <>
          <div className="fixed inset-0 z-50 backdrop-blur-sm animate-backdrop" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowCreate(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-xl bg-white rounded-2xl shadow-2xl animate-modal mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>
                Segment name
                <button className="p-1 hover:bg-gray-100 rounded cursor-pointer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg></button>
              </h2>
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Power Users, Enterprise, Beta Testers..." className="w-full mt-3 px-4 py-2.5 rounded-lg border text-sm focus:outline-none" style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
            </div>
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4 text-sm" style={{ color: 'var(--ink)' }}>
                Match customers that meet
                <select value={newMatchType} onChange={e => setNewMatchType(e.target.value)} className="px-3 py-1.5 rounded-lg border text-sm" style={{ borderColor: 'var(--border)' }}>
                  <option value="all">All</option>
                  <option value="any">Any</option>
                </select>
                of the following conditions:
              </div>

              {newConditions.map((c, i) => (
                <div key={i} className="flex gap-2 mb-2 items-center">
                  <select value={c.field} onChange={e => { const nc = [...newConditions]; nc[i].field = e.target.value; setNewConditions(nc) }} className="flex-1 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--border)' }}>
                    <option value="name">Name</option>
                    <option value="email">Email</option>
                    <option value="phone">Phone</option>
                    <option value="source">Source (woocommerce/shopify/chat/feedback)</option>
                  </select>
                  <select value={c.operator} onChange={e => { const nc = [...newConditions]; nc[i].operator = e.target.value; setNewConditions(nc) }} className="flex-1 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--border)' }}>
                    <option value="contains">Contains</option>
                    <option value="is_equal_to">Is equal to</option>
                    <option value="starts_with">Starts with</option>
                  </select>
                  <input type="text" value={c.value} onChange={e => { const nc = [...newConditions]; nc[i].value = e.target.value; setNewConditions(nc) }} placeholder="Value" className="flex-1 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--border)', fontSize: '14px' }} />
                  {newConditions.length > 1 && (
                    <button onClick={() => setNewConditions(newConditions.filter((_, idx) => idx !== i))} className="p-1.5 rounded hover:bg-gray-100 cursor-pointer" style={{ color: 'var(--slate)' }}>−</button>
                  )}
                </div>
              ))}

              <button onClick={() => setNewConditions([...newConditions, { field: 'name', operator: 'contains', value: '' }])} className="text-sm font-medium mt-2 cursor-pointer" style={{ color: 'var(--coral)' }}>
                + Add condition
              </button>
            </div>
            <div className="flex gap-3 p-6 border-t" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-smooth cursor-pointer" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>Cancel</button>
              <button onClick={createSegment} disabled={!newName.trim()} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-smooth disabled:opacity-50 cursor-pointer" style={{ background: 'var(--coral)' }}>Save</button>
            </div>
          </div>
        </>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Segment"
          message={`Delete "${confirmDelete.name}"?`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => deleteSegment(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
