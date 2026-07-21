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

      // Load invitation.
      //
      // Two things previously made valid invites read as "not found":
      //   1. Emails are stored lowercased, but the link keeps the original case,
      //      and .eq() is case-sensitive — so "John@x.com" missed "john@x.com".
      //   2. Invited rows can have a NULL company_id (the company wasn't resolved
      //      when the invite was created), so filtering by company_id dropped
      //      them.
      // Match on the email (case-insensitive) and accept either this company or
      // a null company_id.
      const emailLc = decodeURIComponent(email).trim().toLowerCase()
      const { data: candidates } = await (supabase as any)
        .from('team_members')
        .select('*')
        .ilike('email', emailLc)
      const inv = (candidates || []).find((r: any) =>
        r.company_id === co.id || r.company_id == null) || (candidates || [])[0] || null

      if (!inv) throw new Error('Invitation not found or expired')
      // Backfill the company link if it was missing, so acceptance works.
      if (inv.company_id == null) {
        try { await (supabase as any).from('team_members').update({ company_id: co.id }).eq('id', inv.id) } catch {}
        inv.company_id = co.id
      }
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
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--canvas)' }}>
      <div style={{ width: '100%', maxWidth: 360, background: '#fff', borderRadius: 18, border: '1px solid var(--border)', padding: 28, textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,0.06)' }}>
        <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', margin: '0 0 6px' }}>Invitation not available</h1>
        <p style={{ color: 'var(--slate)', fontSize: 13.5, margin: '0 0 20px', lineHeight: 1.5 }}>{error}</p>
        <a href="/" style={{ display: 'inline-block', padding: '11px 22px', background: 'var(--coral)', color: 'white', textDecoration: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14 }}>
          Back to home
        </a>
      </div>
    </div>
  )

  if (accepted) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--canvas)' }}>
      <div style={{ width: '100%', maxWidth: 360, background: '#fff', borderRadius: 18, border: '1px solid var(--border)', padding: 28, textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,0.06)' }}>
        <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--peach)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', margin: '0 0 6px' }}>Welcome aboard!</h1>
        <p style={{ color: 'var(--slate)', fontSize: 13.5, margin: 0, lineHeight: 1.5 }}>You've joined {companyData?.name}'s team. Taking you in…</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--canvas)' }}>
      <div style={{ width: '100%', maxWidth: 380, background: '#fff', borderRadius: 18, border: '1px solid var(--border)', padding: 28, boxShadow: '0 10px 40px rgba(0,0,0,0.06)' }}>
        {/* Company badge */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 18 }}>
          {companyData?.logo_url ? (
            <img src={companyData.logo_url} alt="" style={{ width: 52, height: 52, borderRadius: 13, objectFit: 'cover', marginBottom: 12 }} />
          ) : (
            <div style={{ width: 52, height: 52, borderRadius: 13, background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
              {(companyData?.name || 'C')[0].toUpperCase()}
            </div>
          )}
          <h1 style={{ fontSize: 19, fontWeight: 800, color: 'var(--ink)', margin: 0, textAlign: 'center' }}>Join {companyData?.name}</h1>
          <p style={{ color: 'var(--slate)', fontSize: 13.5, margin: '5px 0 0', textAlign: 'center' }}>
            You've been invited as {invitation?.role === 'admin' ? 'an' : 'a'} <strong style={{ color: 'var(--ink)' }}>{invitation?.role}</strong>
          </p>
        </div>

        <div style={{ background: 'var(--canvas)', padding: '11px 14px', borderRadius: 11, marginBottom: 18, fontSize: 13, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>
            {invitation?.role === 'viewer' && '👁️'}
            {invitation?.role === 'editor' && '✏️'}
            {invitation?.role === 'admin' && '👑'}
          </span>
          <span>
            {invitation?.role === 'viewer' && 'View-only access'}
            {invitation?.role === 'editor' && 'Can view and edit content'}
            {invitation?.role === 'admin' && 'Full administrative access'}
          </span>
        </div>

        {!checkingSession && sessionEmail !== email && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: 'var(--slate)', fontWeight: 600, display: 'block', marginBottom: 6, lineHeight: 1.4 }}>
              {sessionEmail ? `Signed in as ${sessionEmail}. Enter the password for ${email} to switch and join.` : `Set a password for ${email} (or enter your existing one)`}
            </label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Password (min 6 characters)"
              onKeyDown={e => e.key === 'Enter' && handleAccept()}
              style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
        )}

        {acceptError && (
          <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14, lineHeight: 1.4 }}>
            {acceptError}
            {/rese?t/i.test(acceptError) && <> <a href="/reset-password" style={{ color: '#dc2626', fontWeight: 700 }}>Reset password</a></>}
          </div>
        )}

        <button onClick={handleAccept} disabled={accepting}
          style={{ width: '100%', padding: '12px 24px', background: 'var(--coral)', color: 'white', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: accepting ? 'wait' : 'pointer', opacity: accepting ? 0.6 : 1, marginBottom: 12 }}>
          {accepting ? 'Joining…' : 'Accept & Join'}
        </button>

        <p style={{ fontSize: 11.5, color: 'var(--slate)', textAlign: 'center', margin: 0 }}>
          Invitation sent to <strong>{email}</strong>
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
