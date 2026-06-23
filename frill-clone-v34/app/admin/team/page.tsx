'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import ConfirmModal from '@/components/ConfirmModal'

const ADMIN_EMAIL = 'bishalstha76@gmail.com'

interface TeamMember {
  id: string
  email: string
  role: string
  status: string
  created_at: string
}

export default function TeamMembersPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('admin')
  const [inviting, setInviting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<TeamMember | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      if (u?.email !== ADMIN_EMAIL) {
        router.push('/')
        return
      }
      setUser(u)
    })
    fetchMembers()
  }, [router])

  const fetchMembers = async () => {
    try {
      const { data } = await supabase
        .from('team_members')
        .select('*')
        .order('created_at', { ascending: false })
      if (data) setMembers(data)
    } catch {}
    setLoading(false)
  }

  const inviteMember = async () => {
    if (!inviteEmail.trim()) return
    setInviting(true)
    try {
      // Check if already exists
      const { data: existing } = await supabase
        .from('team_members')
        .select('*')
        .eq('email', inviteEmail.trim())
        .single()
      
      if (existing) {
        alert('This user is already on your team!')
        setInviting(false)
        return
      }

      const { error } = await supabase.from('team_members').insert({
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        status: 'invited',
        invited_by: user?.id,
      })

      if (error) throw error

      // Optional: Send Supabase magic link invite
      try {
        await supabase.auth.signInWithOtp({
          email: inviteEmail.trim(),
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        })
      } catch (e) {
        console.log('Invite email may not have sent:', e)
      }

      alert(`Invitation sent to ${inviteEmail}!\nThey'll receive an email to join your team.`)
      setInviteEmail('')
      setShowInvite(false)
      fetchMembers()
    } catch (err: any) {
      alert('Failed to invite: ' + err.message + '\n\nMake sure DATABASE_SETUP.sql has been run.')
    }
    setInviting(false)
  }

  const updateRole = async (memberId: string, newRole: string) => {
    await supabase.from('team_members').update({ role: newRole }).eq('id', memberId)
    fetchMembers()
  }

  const removeMember = async (memberId: string) => {
    await supabase.from('team_members').delete().eq('id', memberId)
    setConfirmDelete(null)
    fetchMembers()
  }

  if (!user) return <div className="p-8" style={{ color: 'var(--slate)' }}>Loading...</div>

  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--ink)' }}>Team Members</h1>
            <p className="text-sm" style={{ color: 'var(--slate)' }}>Manage who has access to your feedback board</p>
          </div>
          <button
            onClick={() => setShowInvite(true)}
            className="px-4 py-2 rounded-lg font-semibold text-white text-sm transition-smooth press-effect cursor-pointer"
            style={{ background: 'var(--coral)' }}>
            + Invite Member
          </button>
        </div>

        {/* Members list */}
        <div className="bg-white rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
          {/* Header */}
          <div className="grid grid-cols-12 gap-3 px-5 py-3 border-b text-xs font-semibold uppercase tracking-wider" 
            style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
            <div className="col-span-5">User</div>
            <div className="col-span-3">Role</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {/* Current user */}
          <div className="grid grid-cols-12 gap-3 px-5 py-4 border-b items-center" style={{ borderColor: 'var(--border)' }}>
            <div className="col-span-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ background: 'var(--coral)' }}>
                {user.email?.[0].toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{user.email}</p>
                <p className="text-xs" style={{ color: 'var(--slate)' }}>You</p>
              </div>
            </div>
            <div className="col-span-3">
              <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
                Owner
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: '#d1fae5', color: '#059669' }}>
                Active
              </span>
            </div>
            <div className="col-span-2 text-right text-xs" style={{ color: 'var(--slate)' }}>
              —
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm" style={{ color: 'var(--slate)' }}>Loading...</div>
          ) : members.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm mb-3" style={{ color: 'var(--slate)' }}>No team members yet</p>
              <button
                onClick={() => setShowInvite(true)}
                className="text-sm font-medium cursor-pointer hover:opacity-70"
                style={{ color: 'var(--coral)' }}>
                + Invite your first team member
              </button>
            </div>
          ) : (
            members.map(m => (
              <div key={m.id} className="grid grid-cols-12 gap-3 px-5 py-4 border-b items-center last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                <div className="col-span-5 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ background: '#6b7280' }}>
                    {m.email?.[0].toUpperCase()}
                  </div>
                  <p className="text-sm" style={{ color: 'var(--ink)' }}>{m.email}</p>
                </div>
                <div className="col-span-3">
                  <select
                    value={m.role}
                    onChange={(e) => updateRole(m.id, e.target.value)}
                    className="text-xs px-2 py-1 rounded border focus:outline-none cursor-pointer"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                    <option value="admin">Admin</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <span className="text-xs px-2 py-1 rounded-full font-medium" 
                    style={{ 
                      background: m.status === 'active' ? '#d1fae5' : '#fef3c7', 
                      color: m.status === 'active' ? '#059669' : '#ca8a04',
                    }}>
                    {m.status === 'active' ? 'Active' : 'Invited'}
                  </span>
                </div>
                <div className="col-span-2 text-right">
                  <button
                    onClick={() => setConfirmDelete(m)}
                    className="text-xs font-medium cursor-pointer hover:underline"
                    style={{ color: '#dc2626' }}>
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Role descriptions */}
        <div className="mt-6 p-4 rounded-xl bg-blue-50 border border-blue-200">
          <h3 className="text-sm font-bold mb-2 text-blue-900">Roles</h3>
          <ul className="text-xs space-y-1 text-blue-800">
            <li><strong>Owner</strong> — Full access to everything, including billing & team management</li>
            <li><strong>Admin</strong> — Can manage ideas, comments, settings, and team members</li>
            <li><strong>Editor</strong> — Can manage ideas, comments, and update statuses</li>
            <li><strong>Viewer</strong> — Read-only access to admin dashboard</li>
          </ul>
        </div>
      </main>

      {/* Invite Modal */}
      {showInvite && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm animate-backdrop" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowInvite(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white rounded-2xl shadow-2xl animate-modal mx-4">
            <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Invite team member</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
                Send an invitation to join your feedback board
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Email address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  className="w-full px-4 py-2.5 rounded-lg border focus:outline-none"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border focus:outline-none cursor-pointer"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }}>
                  <option value="admin">Admin</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t" style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={() => setShowInvite(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-smooth cursor-pointer"
                style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                Cancel
              </button>
              <button
                onClick={inviteMember}
                disabled={!inviteEmail.trim() || inviting}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-smooth cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--coral)' }}>
                {inviting ? 'Sending...' : 'Send Invite'}
              </button>
            </div>
          </div>
        </>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Remove team member"
          message={`Are you sure you want to remove ${confirmDelete.email} from your team? They'll lose access immediately.`}
          confirmLabel="Remove"
          variant="danger"
          onConfirm={() => removeMember(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
