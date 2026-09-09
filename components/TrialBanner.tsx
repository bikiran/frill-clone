'use client'

import { useState } from 'react'
import Link from 'next/link'

// Trial countdown + expiry conversion nudge.
//
// Shown only for companies actually on a trial with an end date (never demo,
// complimentary, or paid). During the trial it's a slim, per-session-dismissible
// countdown; once the trial has ended it becomes a persistent (non-dismissible)
// upgrade bar plus a soft "upgrade wall" modal — snoozable for the session so we
// nudge hard toward checkout without hard-locking the account.
export default function TrialBanner({ company }: { company: any }) {
  const [dismissed, setDismissed] = useState(false)
  const [snoozed, setSnoozed] = useState(() => {
    if (typeof window === 'undefined') return false
    try { return sessionStorage.getItem('colvy_trial_wall_snoozed') === '1' } catch { return false }
  })

  if (!company) return null
  const plan = String(company.plan || '').toLowerCase()
  if (plan !== 'trial' || company.is_demo || company.is_complimentary) return null
  const endMs = company.trial_ends_at ? new Date(company.trial_ends_at).getTime() : 0
  if (!endMs) return null // no end date set — nothing to count down to

  const now = Date.now()
  const expired = endMs <= now
  const daysLeft = Math.max(0, Math.ceil((endMs - now) / 86400000))

  const snooze = () => {
    try { sessionStorage.setItem('colvy_trial_wall_snoozed', '1') } catch {}
    setSnoozed(true)
  }
  const dismiss = () => setDismissed(true)

  // ── Active trial: slim countdown, dismissible for the session ───────────────
  if (!expired) {
    if (dismissed) return null
    const urgent = daysLeft <= 3
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '9px 44px 9px 16px', background: urgent ? '#b45309' : '#f59e0b', color: '#fff', position: 'relative', fontSize: 13.5, fontWeight: 600 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>
        <span style={{ textAlign: 'center' }}>
          {daysLeft === 0 ? 'Your Colvy trial ends today.' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left in your Colvy trial.`}
        </span>
        <Link href="/admin/billing" style={{ color: '#fff', textDecoration: 'underline', fontWeight: 800, whiteSpace: 'nowrap' }}>Upgrade now →</Link>
        <button onClick={dismiss} aria-label="Dismiss" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', padding: 4 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
    )
  }

  // ── Expired: persistent bar + soft upgrade wall ─────────────────────────────
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '10px 16px', background: '#dc2626', color: '#fff', fontSize: 13.5, fontWeight: 700 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
        <span style={{ textAlign: 'center' }}>Your Colvy trial has ended.</span>
        <Link href="/admin/billing" style={{ color: '#dc2626', background: '#fff', textDecoration: 'none', fontWeight: 800, whiteSpace: 'nowrap', padding: '4px 12px', borderRadius: 8 }}>Upgrade to keep using Colvy →</Link>
      </div>

      {!snoozed && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ maxWidth: 440, width: '100%', background: '#fff', borderRadius: 18, padding: 28, boxShadow: '0 24px 64px rgba(0,0,0,0.3)', textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--peach, #ffe9e4)', color: 'var(--coral, #ff7a6b)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 11 12 6 7 11" /><line x1="12" y1="18" x2="12" y2="6" /></svg>
            </div>
            <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: 'var(--ink, #111827)' }}>Your free trial has ended</h2>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--slate, #6b7280)', lineHeight: 1.55 }}>
              Upgrade now to keep your inbox, orders, calls and everything you set up. Your data is safe — pick a plan to pick up right where you left off.
            </p>
            <Link href="/admin/billing" onClick={snooze} style={{ display: 'block', padding: '12px 16px', borderRadius: 12, background: 'var(--coral, #ff7a6b)', color: '#fff', textDecoration: 'none', fontSize: 15, fontWeight: 800, marginBottom: 10 }}>
              See plans & upgrade
            </Link>
            <button onClick={snooze} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate, #6b7280)', fontSize: 13, fontWeight: 600 }}>
              Maybe later
            </button>
          </div>
        </div>
      )}
    </>
  )
}
