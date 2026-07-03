'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type Member = {
  id: string
  email: string
  user_id: string | null
  role: string
  status: string
  created_at: string
}

const ROLES = [
  { value: 'viewer', label: 'Viewer', desc: 'Can vote, comment, and submit ideas' },
  { value: 'editor', label: 'Editor', desc: 'Can also manage ideas and content' },
  { value: 'admin', label: 'Admin', desc: 'Full access, including team management' },
]

function getCompanyId(): Promise<{ id: string; owner_id: string; name: string } | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(null)
    const h = window.location.hostname
    if (h.endsWith('.colvy.com') && h !== 'colvy.com' && h !== 'www.colvy.com' && !h.includes('localhost')) {
      const slug = h.replace('.colvy.com', '')
      supabase.from('companies').select('id, owner_id, name').eq('slug', slug).maybeSingle().then(({ data }) => {
        resolve((data as any) || null)
      })
    } else {
      // localhost/vercel — fall back to the signed-in user's own company
      supabase.auth.getSession().then(async ({ data }) => {
        const uid = data.session?.user?.id
        if (!uid) return resolve(null)
        const { data: co } = await (supabase as any).from('companies').select('id, owner_id, name').eq('owner_id', uid).maybeSingle()
        resolve(co || null)
      })
    }
  })
}

export default function BoardUsersPage() {
  const [company, setCompany] = useState<{ id: string; owner_id: string; name: string } | null>(null)
  const [ownerEmail, setOwnerEmail] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const co = await getCompanyId()
    setCompany(co)
    if (co) {
      const { data: sess } = await supabase.auth.getSession()
      if (sess.session?.user?.id === co.owner_id) setOwnerEmail(sess.session.user.email || '')
      const { data } = await (supabase as any)
        .from('team_members')
        .select('*')
        .eq('company_id', co.id)
        .order('created_at', { ascending: false })
      setMembers(data || [])
    }
    setLoading(false)
  }

  const showMsg = (text: string) => {
    setMsg(text)
    setTimeout(() => setMsg(''), 3000)
  }

  const updateRole = async (member: Member, role: string) => {
    setSavingId(member.id)
    const { error } = await (supabase as any).from('team_members').update({ role }).eq('id', member.id)
    if (!error) {
      setMembers(prev => prev.map(m => m.id === member.id ? { ...m, role } : m))
      showMsg('Permission updated')
    } else {
      showMsg('Failed to update permission')
    }
    setSavingId(null)
  }

  const filtered = members.filter(m => !search || m.email.toLowerCase().includes(search.toLowerCase()))

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--coral)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (!company) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8">
        <p style={{ color: 'var(--slate)' }}>Could not determine your board. Please refresh.</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>Users</h1>
      </div>
      <p className="text-sm mb-6" style={{ color: 'var(--slate)' }}>
        Everyone who has signed up on <strong>{company.name}</strong>'s board. Update their permissions below.
      </p>

      {msg && (
        <div className="mb-4 px-4 py-2.5 rounded-lg text-sm font-medium animate-fade-in-up" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
          {msg}
        </div>
      )}

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm px-4 py-2.5 rounded-xl border text-sm focus:outline-none"
          style={{ borderColor: 'var(--border)' }}
        />
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--canvas)', borderBottom: '1px solid var(--border)' }}>
              <tr>
                <th className="px-6 py-3 text-left font-semibold" style={{ color: 'var(--ink)' }}>Email</th>
                <th className="px-6 py-3 text-left font-semibold" style={{ color: 'var(--ink)' }}>Permission</th>
                <th className="px-6 py-3 text-left font-semibold" style={{ color: 'var(--ink)' }}>Status</th>
                <th className="px-6 py-3 text-left font-semibold" style={{ color: 'var(--ink)' }}>Joined</th>
              </tr>
            </thead>
            <tbody>
              {/* Owner row — pinned at top, not editable */}
              {ownerEmail && (
                <tr className="border-t" style={{ borderColor: 'var(--border)', background: 'var(--peach)' }}>
                  <td className="px-6 py-4 font-medium" style={{ color: 'var(--ink)' }}>{ownerEmail}</td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: 'var(--coral)', color: 'white' }}>Owner</span>
                  </td>
                  <td className="px-6 py-4" style={{ color: 'var(--slate)' }}>Active</td>
                  <td className="px-6 py-4" style={{ color: 'var(--slate)' }}>—</td>
                </tr>
              )}

              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-10 text-center" style={{ color: 'var(--slate)' }}>
                  {members.length === 0 ? 'No one has signed up on your board yet.' : 'No users match your search.'}
                </td></tr>
              ) : (
                filtered.map(m => (
                  <tr key={m.id} className="border-t hover:bg-gray-50" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-6 py-4" style={{ color: 'var(--ink)' }}>{m.email}</td>
                    <td className="px-6 py-4">
                      <select
                        value={m.role}
                        disabled={savingId === m.id}
                        onChange={e => updateRole(m, e.target.value)}
                        className="px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer focus:outline-none"
                        style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </td>
                    <td className="px-6 py-4" style={{ color: 'var(--slate)' }}>
                      {m.status === 'active' ? 'Active' : m.status ? m.status.charAt(0).toUpperCase() + m.status.slice(1) : '—'}
                    </td>
                    <td className="px-6 py-4" style={{ color: 'var(--slate)' }}>
                      {new Date(m.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs" style={{ color: 'var(--slate)' }}>
        {ROLES.map(r => (
          <span key={r.value}><strong style={{ color: 'var(--ink)' }}>{r.label}:</strong> {r.desc}</span>
        ))}
      </div>
    </div>
  )
}
