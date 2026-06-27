'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ConfirmModal from '@/components/ConfirmModal'


export default function TeamPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('editor')
  const [createEmail, setCreateEmail] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createName, setCreateName] = useState('')
  const [createRole, setCreateRole] = useState('editor')
  const [working, setWorking] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<any>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      setUser(u)
    })
    fetchMembers()
  }, [router])

  const fetchMembers = async () => {
    try {
      const { data } = await supabase.from('team_members').select('*').order('created_at', { ascending: false })
      if (data) setMembers(data)
    } catch {}
    setLoading(false)
  }

  const showMsg = (text: string) => {
    setMsg(text)
    setTimeout(() => setMsg(''), 4000)
  }

  const inviteMember = async () => {
    if (!inviteEmail.trim()) return
    setWorking(true)
    try {
      const { error } = await supabase.from('team_members').insert({
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        status: 'invited',
        invited_by: user?.id,
      })
      if (error) throw error
      // Send magic link invite
      await supabase.auth.signInWithOtp({ email: inviteEmail.trim(), options: { emailRedirectTo: `${window.location.origin}/auth/callback` } })
      showMsg(`Invitation sent to ${inviteEmail}!`)
      setInviteEmail('')
      setShowInvite(false)
      fetchMembers()
    } catch (err: any) {
      alert('Failed: ' + err.message + '\n\nMake sure DATABASE_SETUP.sql has been run.')
    }
    setWorking(false)
  }

  const createUser = async () => {
    if (!createEmail.trim()) return
    // Generate a secure random temporary password — user will reset via forgot-password
    const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).toUpperCase().slice(-4) + '!1'
    setWorking(true)
    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: createEmail.trim(),
          password: tempPassword,
          name: createName.trim(),
          role: createRole,
        }),
      })
      const result = await res.json()
      if (result.error) throw new Error(result.error)

      showMsg(`✅ User ${result.email} created successfully!`)
      setCreateEmail('')
      setCreatePassword('')
      setCreateName('')
      setShowCreate(false)
      fetchMembers()
    } catch (err: any) {
      alert('Failed to create user: ' + err.message)
    }
    setWorking(false)
  }

  const updateRole = async (id: string, role: string) => {
    await supabase.from('team_members').update({ role }).eq('id', id)
    fetchMembers()
  }

  const removeMember = async (id: string) => {
    await supabase.from('team_members').delete().eq('id', id)
    setConfirmDelete(null)
    fetchMembers()
  }

  if (!user) return <div className="p-8" style={{ color: 'var(--slate)' }}>Loading...</div>

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>Team Members</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>Manage who can access your feedback board</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg border text-sm font-medium transition-smooth cursor-pointer hover:bg-gray-50"
            style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
            + Create User
          </button>
          <button onClick={() => setShowInvite(true)}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-smooth cursor-pointer"
            style={{ background: 'var(--coral)' }}>
            + Invite Member
          </button>
        </div>
      </div>

      {msg && (
        <div className="mb-4 p-3 rounded-lg text-sm font-medium" style={{ background: '#d1fae5', color: '#059669' }}>
          ✓ {msg}
        </div>
      )}

      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        {/* Header */}
        <div className="grid grid-cols-12 px-5 py-3 border-b text-xs font-semibold uppercase tracking-wider" style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
          <div className="col-span-5">User</div>
          <div className="col-span-3">Role</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {/* Current admin */}
        <div className="grid grid-cols-12 px-5 py-4 border-b items-center" style={{ borderColor: 'var(--border)' }}>
          <div className="col-span-5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: 'var(--coral)' }}>
              {user.email?.[0].toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{user.email}</p>
              <p className="text-xs" style={{ color: 'var(--slate)' }}>You (Owner)</p>
            </div>
          </div>
          <div className="col-span-3">
            <span className="text-xs px-2 py-1 rounded-full font-semibold" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>Owner</span>
          </div>
          <div className="col-span-2">
            <span className="text-xs px-2 py-1 rounded-full" style={{ background: '#d1fae5', color: '#059669' }}>Active</span>
          </div>
          <div className="col-span-2 text-right text-xs" style={{ color: 'var(--slate)' }}>—</div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--slate)' }}>Loading...</div>
        ) : members.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-4xl mb-3">👥</div>
            <p className="text-sm mb-2 font-medium" style={{ color: 'var(--ink)' }}>No team members yet</p>
            <p className="text-xs mb-4" style={{ color: 'var(--slate)' }}>Invite colleagues or create users on-the-fly</p>
            <div className="flex gap-2 justify-center">
              <button onClick={() => setShowCreate(true)} className="text-sm font-medium cursor-pointer hover:opacity-70" style={{ color: 'var(--coral)' }}>+ Create User</button>
              <span style={{ color: 'var(--slate)' }}>·</span>
              <button onClick={() => setShowInvite(true)} className="text-sm font-medium cursor-pointer hover:opacity-70" style={{ color: 'var(--coral)' }}>+ Invite Member</button>
            </div>
          </div>
        ) : (
          members.map(m => (
            <div key={m.id} className="grid grid-cols-12 px-5 py-4 border-b last:border-b-0 items-center" style={{ borderColor: 'var(--border)' }}>
              <div className="col-span-5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: '#6b7280' }}>
                  {m.email?.[0].toUpperCase()}
                </div>
                <p className="text-sm truncate" style={{ color: 'var(--ink)' }}>{m.email}</p>
              </div>
              <div className="col-span-3">
                <select value={m.role} onChange={e => updateRole(m.id, e.target.value)}
                  className="text-xs px-2 py-1 rounded border focus:outline-none cursor-pointer bg-white"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                  <option value="admin">Admin</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <div className="col-span-2">
                <span className="text-xs px-2 py-1 rounded-full"
                  style={{ background: m.status === 'active' ? '#d1fae5' : '#fef3c7', color: m.status === 'active' ? '#059669' : '#ca8a04' }}>
                  {m.status === 'active' ? 'Active' : 'Invited'}
                </span>
              </div>
              <div className="col-span-2 text-right">
                <button onClick={() => setConfirmDelete(m)} className="text-xs font-medium cursor-pointer hover:underline" style={{ color: '#dc2626' }}>
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Role legend */}
      <div className="mt-6 p-4 rounded-xl border" style={{ background: '#eff6ff', borderColor: '#bfdbfe' }}>
        <p className="text-sm font-bold mb-2 text-blue-900">Role permissions</p>
        <div className="grid sm:grid-cols-3 gap-2 text-xs text-blue-800">
          <div><strong>Admin</strong> — Full access, settings, team</div>
          <div><strong>Editor</strong> — Manage ideas, statuses, comments</div>
          <div><strong>Viewer</strong> — Read-only dashboard access</div>
        </div>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm animate-backdrop" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowInvite(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white rounded-2xl shadow-2xl animate-modal mx-4">
            <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Invite team member</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>They'll receive a magic link to sign in</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Email address</label>
                <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com" autoFocus
                  className="w-full px-4 py-2.5 rounded-lg border focus:outline-none"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Role</label>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border focus:outline-none cursor-pointer bg-white"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }}>
                  <option value="admin">Admin</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setShowInvite(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border cursor-pointer" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>Cancel</button>
              <button onClick={inviteMember} disabled={!inviteEmail.trim() || working}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--coral)' }}>
                {working ? 'Sending...' : 'Send Invite'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Create User Modal */}
      {showCreate && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm animate-backdrop" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowCreate(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white rounded-2xl shadow-2xl animate-modal mx-4">
            <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Create new user</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>Add a user to your team on-the-fly</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Email address</label>
                <input type="email" value={createEmail} onChange={e => setCreateEmail(e.target.value)}
                  placeholder="user@company.com" autoFocus
                  className="w-full px-4 py-2.5 rounded-lg border focus:outline-none"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Display name (optional)</label>
                <input type="text" value={createName} onChange={e => setCreateName(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full px-4 py-2.5 rounded-lg border focus:outline-none"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Role</label>
                <select value={createRole} onChange={e => setCreateRole(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border focus:outline-none cursor-pointer bg-white"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }}>
                  <option value="admin">Admin</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <div className="p-3 rounded-lg text-xs" style={{ background: '#fef3c7', color: '#92400e' }}>
                <strong>Note:</strong> This adds the user to your team roster. They can sign in at any time using their email. To set their password, they use the "Forgot password" flow or you can share their email with them.
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border cursor-pointer" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>Cancel</button>
              <button onClick={createUser} disabled={!createEmail.trim() || working}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--coral)' }}>
                {working ? 'Creating...' : 'Add to Team'}
              </button>
            </div>
          </div>
        </>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Remove member"
          message={`Remove ${confirmDelete.email} from the team?`}
          confirmLabel="Remove"
          variant="danger"
          onConfirm={() => removeMember(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
