'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function TeamPage() {
  const [company, setCompany] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor')
  const [inviting, setInviting] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      const { data: co } = await (supabase as any)
        .from('companies')
        .select('*')
        .eq('owner_id', session.user.id)
        .maybeSingle()

      setCompany(co)

      if (co?.id) {
        const { data: membersList } = await (supabase as any)
          .from('team_members')
          .select('*')
          .eq('company_id', co.id)

        setMembers(membersList || [])
      }
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleInvite = async () => {
    if (!inviteEmail || !company?.id) return
    setInviting(true)
    try {
      const { data, error } = await (supabase as any)
        .from('team_members')
        .insert({
          company_id: company.id,
          email: inviteEmail,
          role: inviteRole,
          status: 'pending',
          invited_at: new Date().toISOString(),
        })

      if (error) throw error
      
      // Send invitation email via Resend
      try {
        const inviteLink = `${typeof window !== 'undefined' ? window.location.origin : 'https://colvy.com'}/team/join?company=${company.slug}&email=${encodeURIComponent(inviteEmail)}`
        
        await fetch('/api/send-team-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: inviteEmail,
            companyName: company.name,
            role: inviteRole,
            inviteLink,
            inviterName: 'Team Admin',
          }),
        })
      } catch (emailError) {
        console.warn('Team invite email failed:', emailError)
        // Don't fail the whole operation if email fails
      }
      
      setMembers([...members, data[0]])
      setInviteEmail('')
      setInviteRole('editor')
    } catch (error: any) {
      alert('Failed to invite: ' + error.message)
    } finally {
      setInviting(false)
    }
  }

  const updateMemberRole = async (memberId: string, newRole: string) => {
    try {
      await (supabase as any)
        .from('team_members')
        .update({ role: newRole })
        .eq('id', memberId)

      setMembers(members.map(m => m.id === memberId ? { ...m, role: newRole } : m))
    } catch (error) {
      console.error('Failed to update role:', error)
    }
  }

  const removeMember = async (memberId: string) => {
    if (!confirm('Remove this team member?')) return
    try {
      await (supabase as any)
        .from('team_members')
        .delete()
        .eq('id', memberId)

      setMembers(members.filter(m => m.id !== memberId))
    } catch (error) {
      console.error('Failed to remove:', error)
    }
  }

  if (loading) return <div className="p-8" style={{ color: 'var(--slate)' }}>Loading...</div>
  if (!company) return <div className="p-8" style={{ color: 'var(--slate)' }}>Company not found</div>

  const themeColor = company.accent_color || '#ff7a6b'

  return (
    <div className="min-h-screen p-8" style={{ background: 'var(--canvas)' }}>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Link href="/admin/settings" className="text-sm font-medium hover:opacity-70" style={{ color: themeColor }}>
            ← Back to settings
          </Link>
          <h1 className="text-3xl font-bold mt-3" style={{ color: 'var(--ink)' }}>Team Members</h1>
          <p style={{ color: 'var(--slate)' }}>Manage who has access to your feedback board</p>
        </div>

        {/* Invite form */}
        <div className="bg-white rounded-2xl border p-6 mb-8" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-bold mb-4" style={{ color: 'var(--ink)' }}>Invite Team Member</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <input
              type="email"
              placeholder="Email address"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              className="px-4 py-2 rounded-lg border"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
            />
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value as any)}
              className="px-4 py-2 rounded-lg border"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
              <option value="viewer">Viewer (Read-only)</option>
              <option value="editor">Editor (Can edit)</option>
            </select>
            <button
              onClick={handleInvite}
              disabled={inviting || !inviteEmail}
              className="px-6 py-2 rounded-lg font-semibold text-white cursor-pointer"
              style={{ background: themeColor, opacity: inviting || !inviteEmail ? 0.6 : 1 }}>
              {inviting ? 'Inviting...' : 'Send Invite'}
            </button>
          </div>
        </div>

        {/* Members list */}
        <div className="bg-white rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
          <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="font-bold" style={{ color: 'var(--ink)' }}>Members ({members.length})</h2>
          </div>
          {members.length === 0 ? (
            <div className="p-6 text-center" style={{ color: 'var(--slate)' }}>
              No team members yet. Invite someone to get started!
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {members.map(member => (
                <div key={member.id} className="p-6 flex items-center justify-between">
                  <div>
                    <p className="font-medium" style={{ color: 'var(--ink)' }}>{member.email}</p>
                    <p className="text-xs" style={{ color: 'var(--slate)' }}>
                      Status: <span className="capitalize font-semibold">{member.status}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      value={member.role}
                      onChange={e => updateMemberRole(member.id, e.target.value)}
                      className="px-3 py-1.5 rounded-lg border text-sm"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      onClick={() => removeMember(member.id)}
                      className="px-3 py-1.5 rounded-lg border text-sm cursor-pointer hover:bg-red-50"
                      style={{ borderColor: 'var(--border)', color: '#dc2626' }}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Permissions legend */}
        <div className="mt-8 bg-blue-50 rounded-2xl p-6 border" style={{ borderColor: '#e0e7ff' }}>
          <h3 className="font-bold mb-4" style={{ color: 'var(--ink)' }}>Role Permissions</h3>
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <p className="font-medium mb-2" style={{ color: 'var(--ink)' }}>👁️ Viewer</p>
              <ul className="text-sm space-y-1" style={{ color: 'var(--slate)' }}>
                <li>✓ View feedback board</li>
                <li>✓ View analytics</li>
                <li>✗ Cannot edit</li>
              </ul>
            </div>
            <div>
              <p className="font-medium mb-2" style={{ color: 'var(--ink)' }}>✏️ Editor</p>
              <ul className="text-sm space-y-1" style={{ color: 'var(--slate)' }}>
                <li>✓ View feedback board</li>
                <li>✓ Edit settings</li>
                <li>✓ Manage content</li>
              </ul>
            </div>
            <div>
              <p className="font-medium mb-2" style={{ color: 'var(--ink)' }}>👑 Admin</p>
              <ul className="text-sm space-y-1" style={{ color: 'var(--slate)' }}>
                <li>✓ Full access</li>
                <li>✓ Manage team</li>
                <li>✓ Billing</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
