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
  const [password, setPassword] = useState('')
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [acceptError, setAcceptError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setSessionEmail(session?.user?.email || null)
      setCheckingSession(false)
    })()
  }, [])

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

      // Load company (maybeSingle never throws on no-rows, unlike .single)
      const { data: co } = await (supabase as any)
        .from('companies')
        .select('*')
        .eq('slug', company)
        .maybeSingle()

      if (!co) throw new Error('Company not found. Ask your inviter to resend the invitation.')
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
    setAcceptError(null)
    try {
      let { data: { session } } = await supabase.auth.getSession()

      // If already signed in as the invited user, just activate membership.
      if (session?.user && session.user.email === email) {
        const { error: updateErr } = await (supabase as any)
          .from('team_members')
          .update({ status: 'active', user_id: session.user.id, joined_at: new Date().toISOString() })
          .eq('id', invitation.id)
        if (updateErr) throw updateErr
        setAccepted(true)
        setTimeout(() => { router.push('/admin') }, 1500)
        return
      }

      // Otherwise create/confirm the account server-side (email auto-confirmed),
      // which also activates the membership, then sign in with the password.
      if (!password || password.length < 6) {
        throw new Error('Enter a password (at least 6 characters) to join.')
      }
      if (session?.user && session.user.email !== email) {
        await supabase.auth.signOut()
      }

      const res = await fetch('/api/team/accept-invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, companySlug: company }),
      })
      const out = await res.json()
      if (!res.ok) throw new Error(out.error || 'Could not accept the invitation.')

      // Now sign in — the account is confirmed, so this yields a real session.
      const signInRes = await supabase.auth.signInWithPassword({ email: email!, password })
      if (signInRes.error) {
        // Membership is already active; guide them to sign in manually.
        throw new Error('Your account is ready, but automatic sign-in failed. Please sign in with your email and password.')
      }

      setAccepted(true)
      setTimeout(() => { router.push('/admin') }, 1500)
    } catch (err: any) {
      setAcceptError(err.message)
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

        {/* If not already signed in as the invited user, collect a password to
            sign in or create the account. */}
        {!checkingSession && sessionEmail !== email && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: 'var(--slate)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
              {sessionEmail ? `You're signed in as ${sessionEmail}. Enter the password for ${email} to switch and join.` : `Set a password for ${email} (or enter your existing one)`}
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password (min 6 characters)"
              onKeyDown={e => e.key === 'Enter' && handleAccept()}
              style={{ width: '100%', padding: '11px 14px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
        )}

        {acceptError && (
          <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 9, fontSize: 13, marginBottom: 14, lineHeight: 1.4 }}>
            {acceptError}
            {/rese?t/i.test(acceptError) && <> <a href="/reset-password" style={{ color: '#dc2626', fontWeight: 700 }}>Reset password</a></>}
          </div>
        )}

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
          {accepting ? 'Joining…' : 'Accept & Join'}
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
