'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function JoinTeamContent() {
  const params = useSearchParams()
  const router = useRouter()
  const company = params.get('company')
  const email = params.get('email')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [companyData, setCompanyData] = useState<any>(null)
  const [invitation, setInvitation] = useState<any>(null)
  const [accepting, setAccepting] = useState(false)
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    loadInvitation()
  }, [company, email])

  const loadInvitation = async () => {
    try {
      if (!company || !email) {
        setError('Invalid invitation link')
        setLoading(false)
        return
      }

      // Load company
      const { data: co } = await (supabase as any)
        .from('companies')
        .select('*')
        .eq('slug', company)
        .single()

      if (!co) throw new Error('Company not found')
      setCompanyData(co)

      // Load invitation
      const { data: inv } = await (supabase as any)
        .from('team_members')
        .select('*')
        .eq('company_id', co.id)
        .eq('email', email)
        .maybeSingle()

      if (!inv) throw new Error('Invitation not found or expired')
      if (inv.status === 'active') {
        setError('You are already a member of this team')
        setLoading(false)
        return
      }

      setInvitation(inv)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAccept = async () => {
    setAccepting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) throw new Error('Please sign in first')

      if (session.user.email !== email) {
        throw new Error(`You must sign in with ${email} to accept this invitation`)
      }

      // Update invitation status
      const { error: updateErr } = await (supabase as any)
        .from('team_members')
        .update({
          status: 'active',
          user_id: session.user.id,
          joined_at: new Date().toISOString(),
        })
        .eq('id', invitation.id)

      if (updateErr) throw updateErr

      setAccepted(true)
      setTimeout(() => {
        router.push(`/admin`)
      }, 2000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setAccepting(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--canvas)' }}>
      <div className="text-center">
        <div style={{ width: 40, height: 40, margin: '0 auto 16px', border: '3px solid var(--border)', borderTopColor: 'var(--coral)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: 'var(--slate)' }}>Verifying invitation...</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--canvas)' }}>
      <div className="max-w-400 text-center">
        <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Invitation Invalid</h1>
        <p style={{ color: 'var(--slate)', marginBottom: 24 }}>{error}</p>
        <a href="/" style={{ display: 'inline-block', padding: '12px 24px', background: 'var(--coral)', color: 'white', textDecoration: 'none', borderRadius: 8, fontWeight: 600 }}>
          Back to home
        </a>
      </div>
    </div>
  )

  if (accepted) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--canvas)' }}>
      <div className="max-w-400 text-center">
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Welcome!</h1>
        <p style={{ color: 'var(--slate)', marginBottom: 24 }}>You've successfully joined {companyData?.name}'s team. Redirecting...</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--canvas)' }}>
      <div className="max-w-400 w-full bg-white rounded-2xl border p-8" style={{ borderColor: 'var(--border)' }}>
        <div style={{ fontSize: 48, textAlign: 'center', marginBottom: 16 }}>👋</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)', marginBottom: 8, textAlign: 'center' }}>Join the team</h1>
        <p style={{ color: 'var(--slate)', marginBottom: 24, textAlign: 'center' }}>
          You're invited to join <strong>{companyData?.name}</strong> as a <strong>{invitation?.role}</strong>
        </p>

        <div style={{ background: 'var(--canvas)', padding: 16, borderRadius: 12, marginBottom: 24 }}>
          <p style={{ fontSize: 12, color: 'var(--slate)', marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}>Role Permissions</p>
          <p style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 600 }}>
            {invitation?.role === 'viewer' && '👁️ Viewer - View only access'}
            {invitation?.role === 'editor' && '✏️ Editor - Can edit content'}
            {invitation?.role === 'admin' && '👑 Admin - Full administrative access'}
          </p>
        </div>

        <button
          onClick={handleAccept}
          disabled={accepting}
          style={{
            width: '100%',
            padding: '12px 24px',
            background: 'var(--coral)',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 16,
            cursor: 'pointer',
            opacity: accepting ? 0.6 : 1,
            marginBottom: 12,
          }}>
          {accepting ? '⏳ Accepting...' : '✅ Accept Invitation'}
        </button>

        <p style={{ fontSize: 12, color: 'var(--slate)', textAlign: 'center' }}>
          This invitation was sent to <strong>{email}</strong>
        </p>
      </div>
    </div>
  )
}

export default function JoinTeamPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>}>
      <JoinTeamContent />
    </Suspense>
  )
}
