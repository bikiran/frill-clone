'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ColvyLogo from '@/components/ColvyLogo'

// What each invited role is called (as on the Team page) and its icon (SVG; no emoji in the UI).
const ROLE_NAME: Record<string, string> = { viewer: 'Viewer', editor: 'Agent', admin: 'Admin' }
const ROLE_ICON: Record<string, React.ReactNode> = {
  viewer: <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />,
  editor: <path d="M12 20h9 M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />,
  admin: <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6z M9 12l2 2 4-4" />,
}

export const dynamic = 'force-dynamic'

function JoinTeamContent() {
  const params = useSearchParams()
  const router = useRouter()
  const company = params.get('company')
  const email = params.get('email')
  const inviteToken = params.get('token')
  // The role the invite offers: from the server, else the link (display only;
  // accepting uses the role stored with the invite).
  const roleParam = params.get('role')

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
  }, [company, email, inviteToken])

  const loadInvitation = async () => {
    try {
      if (!company || !email) {
        setError('Invalid invitation link')
        setLoading(false)
        return
      }
      if (!inviteToken) {
        setError('This invite link is missing its code. Ask your inviter to send a new invite.')
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
      // Asked of the server, which knows the two things that used to make valid
      // invites read as "not found" — the email's case, and rows whose
      // company_id was never filled in. It answers with whether an invitation
      // exists and its status, and nothing else: the row itself is not the
      // browser's business, and the acceptance below no longer needs its id.
      // It only answers for this link's code, which is cleared once the invite
      // is accepted and replaced when it's resent.
      const emailLc = decodeURIComponent(email).trim().toLowerCase()
      const invRes = await fetch(`/api/team/invite?email=${encodeURIComponent(emailLc)}&companySlug=${encodeURIComponent(company)}&token=${encodeURIComponent(inviteToken)}`)
      const inv = await invRes.json().catch(() => ({ found: false }))

      if (!inv?.found) throw new Error('This invite link isn’t valid any more: it has been used, or a newer one was sent. If you’ve already joined, sign in; otherwise ask your inviter for a new link.')
      if (inv.status === 'active') {
        setError('You are already a member of this team')
        setLoading(false)
        return
      }

      const offered = [inv.role, roleParam].find(r => r === 'viewer' || r === 'editor' || r === 'admin') || null
      setInvitation({ email: emailLc, status: inv.status, company_id: co.id, role: offered })
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

      // Already signed in as the invited person → activate on the server.
      //
      // This was an UPDATE straight onto team_members from the browser, which
      // only worked because anyone could write to that table — the same
      // permission that let a stranger add themselves to any company and, via
      // is_company_member, read everything in it. The endpoint takes the access
      // token and the link's code, and activates only the invitation addressed
      // to THAT session's email with that code.
      if (session?.user && session.user.email === email) {
        const res = await fetch('/api/team/activate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ companySlug: company, token: inviteToken }),
        })
        const out = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(out?.error || 'Could not accept the invitation.')
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
        await supabase.auth.signOut({ scope: 'local' })
      }

      const res = await fetch('/api/team/accept-invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, companySlug: company, token: inviteToken }),
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
            {invitation?.role
              ? <>You've been invited as {invitation.role === 'viewer' ? 'a' : 'an'} <strong style={{ color: 'var(--ink)' }}>{ROLE_NAME[invitation.role]}</strong></>
              : <>You've been invited to join the team</>}
          </p>
        </div>

        {invitation?.role && ROLE_ICON[invitation.role] && (
          <div style={{ background: 'var(--canvas)', padding: '11px 14px', borderRadius: 11, marginBottom: 18, fontSize: 13, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>{ROLE_ICON[invitation.role]}</svg>
            <span>
              {invitation.role === 'viewer' && 'View-only access'}
              {invitation.role === 'editor' && 'Can view and edit content'}
              {invitation.role === 'admin' && 'Full administrative access'}
            </span>
          </div>
        )}

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
            {/sign in with it/i.test(acceptError) && <> <a href="/signin" style={{ color: '#dc2626', fontWeight: 700 }}>Sign in</a></>}
          </div>
        )}

        <button onClick={handleAccept} disabled={accepting}
          style={{ width: '100%', padding: '12px 24px', background: 'var(--coral)', color: 'white', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: accepting ? 'wait' : 'pointer', opacity: accepting ? 0.6 : 1, marginBottom: 12 }}>
          {accepting ? 'Joining…' : 'Accept & Join'}
        </button>

        <p style={{ fontSize: 11.5, color: 'var(--slate)', textAlign: 'center', margin: 0 }}>
          Invitation sent to <strong>{email}</strong>
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <ColvyLogo size={20} fontSize={13} />
        </div>
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
