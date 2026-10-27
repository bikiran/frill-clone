'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Ref = { id: string; referred_name?: string; referred_email?: string; status: string; credit_cents: number; currency: string; created_at: string; qualified_at?: string }

const money = (cents: number, cur = 'aud') => {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur.toUpperCase() }).format((cents || 0) / 100) } catch { return `$${((cents || 0) / 100).toFixed(0)}` }
}

export default function ReferralsPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/referrals', { headers: { Authorization: `Bearer ${session?.access_token || ''}` } })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error || 'Could not load referrals')
        setData(d)
      } catch (e: any) { setErr(e.message) } finally { setLoading(false) }
    })()
  }, [])

  const copy = async () => {
    if (!data?.link) return
    try { await navigator.clipboard.writeText(data.link); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch {}
  }
  const share = async () => {
    if (!data?.link) return
    const shareData = { title: 'Colvy referral', text: 'Try Colvy — one place to talk to customers across every channel.', url: data.link }
    try { if (navigator.share) { await navigator.share(shareData); return } } catch {}
    copy()
  }

  const reward = money(data?.rewardCents ?? 10000, data?.currency)
  const statusPill = (s: string) => {
    const map: Record<string, { bg: string; c: string; t: string }> = {
      qualified: { bg: '#dcfce7', c: '#15803d', t: 'Qualified' },
      pending: { bg: '#fef3c7', c: '#a16207', t: 'Pending' },
      reversed: { bg: '#fee2e2', c: '#b91c1c', t: 'Reversed' },
    }
    const m = map[s] || map.pending
    return <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: m.bg, color: m.c }}>{m.t}</span>
  }

  const CORAL = 'var(--coral, #ff6a4d)'
  const signups = (data?.stats?.qualified ?? 0) + (data?.stats?.pending ?? 0)
  const earned = money(data?.balanceCents || 0, data?.currency)
  const linkText = data?.link ? data.link.replace(/^https?:\/\//, '') : 'Generating…'

  // Like Sellio's Refer & earn: the invite card (headline, the link to copy,
  // sign-ups and what's been earned), then earnings, how it works and the list.
  return (
    <div className="ref-page" style={{ padding: '36px 44px 48px', maxWidth: 1040 }}>
      <style>{`
        .ref-hero { position: relative; overflow: hidden; border-radius: 22px; background: #fff; box-shadow: 0 0 0 1px #ececf0, 0 1px 2px rgba(0,0,0,.03); }
        /* A soft coral glow and a dot pattern in the top-right corner. */
        .ref-hero::before { content: ''; position: absolute; inset: 0; background: radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--coral) 38%, transparent) 0%, color-mix(in srgb, var(--coral) 10%, transparent) 38%, transparent 62%); pointer-events: none; }
        .ref-hero::after { content: ''; position: absolute; top: 0; right: 0; width: 46%; height: 78%; background-image: radial-gradient(circle, color-mix(in srgb, var(--coral) 75%, #000 0%) 1.1px, transparent 1.6px); background-size: 7px 7px; -webkit-mask-image: radial-gradient(90% 90% at 100% 0%, #000 0%, transparent 70%); mask-image: radial-gradient(90% 90% at 100% 0%, #000 0%, transparent 70%); opacity: .55; pointer-events: none; }
        .ref-hero > * { position: relative; z-index: 1; }
        .ref-link { display: flex; align-items: center; gap: 8px; max-width: 620px; padding: 6px 6px 6px 18px; border-radius: 16px; background: #f4f4f5; }
        .ref-stat-l { margin: 0; font-size: 13px; color: #71717a; }
        .ref-stat-v { margin: 3px 0 0; font-size: 17px; font-weight: 700; color: #111; }
        @media (max-width: 720px) {
          .ref-page { padding: 20px 16px 32px !important; }
          .ref-steps, .ref-band { grid-template-columns: 1fr !important; }
          .ref-hero h2 { font-size: 27px !important; }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 22 }}>
        <h1 style={{ margin: 0 }}>Refer &amp; earn</h1>
        <a href="/referrals" target="_blank" rel="noopener noreferrer" className="cv-btn" style={{ height: 34, fontSize: 13 }}>How it works ↗</a>
      </div>

      {loading ? (
        <p style={{ color: 'var(--slate)', fontSize: 14 }}>Loading…</p>
      ) : err ? (
        <div style={{ padding: '12px 14px', borderRadius: 12, background: '#fee2e2', color: '#b91c1c', fontSize: 14 }}>{err}</div>
      ) : (
        <>
          {data?.needsMigration && (
            <div style={{ padding: '12px 14px', borderRadius: 12, background: '#fff7e6', color: '#a16207', fontSize: 13.5, marginBottom: 16 }}>
              Referrals aren’t fully set up yet — run migration <b>COLVY_V314_REFERRALS.sql</b> to activate link tracking and credit.
            </div>
          )}

          {/* The invite */}
          <div className="ref-hero">
            <div style={{ padding: '56px 36px 30px' }}>
              <h2 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.12, color: '#111', maxWidth: 480 }}>
                Invite others to Colvy and earn {reward}
              </h2>
              <p style={{ margin: '12px 0 24px', fontSize: 15.5, color: '#52525b' }}>
                You earn <b style={{ color: '#111' }}>{reward}</b> credit when a business you refer pays its first month.
              </p>
              <div className="ref-link">
                <span style={{ flex: 1, minWidth: 0, fontSize: 15, color: '#71717a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linkText}</span>
                <button type="button" onClick={share} disabled={!data?.link} className="cv-btn cv-btn-icon" aria-label="Share" title="Share" style={{ width: 40, height: 40, background: 'transparent', border: 'none', boxShadow: 'none' }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></svg>
                </button>
                <button type="button" onClick={copy} disabled={!data?.link} className="cv-btn cv-btn-dark" style={{ height: 42, padding: '0 18px' }}>
                  {copied
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px 12px', padding: '16px 36px', borderTop: '1px solid #f0f0f2', fontSize: 14.5, background: 'rgba(255,255,255,.7)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, color: '#111', whiteSpace: 'nowrap' }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#52525b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.6M18.5 14.3A6.5 6.5 0 0 1 21.5 20" /></svg>
                {signups ? `${signups} sign-up${signups === 1 ? '' : 's'}` : 'No sign-ups yet'}
              </span>
              <span style={{ color: '#71717a', whiteSpace: 'nowrap' }}>{earned} earned in total</span>
            </div>
          </div>

          {/* Earnings */}
          <h2 style={{ margin: '36px 0 14px', fontSize: 18, fontWeight: 700, color: '#111' }}>Earnings</h2>
          <div style={{ borderRadius: 20, background: '#f6f6f7', padding: 6 }}>
            <div style={{ borderRadius: 16, background: '#fff', padding: '22px 26px', boxShadow: '0 0 0 1px #ececf0' }}>
              <p className="ref-stat-l" style={{ fontSize: 15 }}>Credit earned</p>
              <p style={{ margin: '4px 0 0', fontSize: 42, fontWeight: 800, letterSpacing: '-0.02em', color: '#111' }}>{earned}</p>
              <p className="ref-stat-l" style={{ marginTop: 10 }}>Taken off your next invoice once a referral qualifies.</p>
            </div>
            <div className="ref-band" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: '16px 22px 12px' }}>
              <div><p className="ref-stat-l">Qualified</p><p className="ref-stat-v">{data?.stats?.qualified ?? 0}</p></div>
              <div><p className="ref-stat-l">Pending</p><p className="ref-stat-v">{data?.stats?.pending ?? 0}</p></div>
              <div><p className="ref-stat-l">Earned in total</p><p className="ref-stat-v">{earned}</p></div>
            </div>
          </div>

          {/* How it works */}
          <h2 style={{ margin: '36px 0 14px', fontSize: 18, fontWeight: 700, color: '#111' }}>How it works</h2>
          <div className="ref-steps" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[
              { t: 'Share your link', d: 'Send it to business owners or anyone who’d benefit from Colvy.' },
              { t: 'They subscribe', d: 'They sign up on your link and pay their first month.' },
              { t: `You earn ${reward}`, d: 'Taken off your next invoice once they qualify.' },
            ].map((x, i) => (
              <div key={i} style={{ padding: 18, borderRadius: 16, boxShadow: '0 0 0 1px #ececf0' }}>
                <span style={{ width: 28, height: 28, borderRadius: 9, background: 'var(--peach, #ffe9e2)', color: CORAL, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13.5 }}>{i + 1}</span>
                <p style={{ margin: '12px 0 0', fontSize: 15, fontWeight: 700, color: '#111' }}>{x.t}</p>
                <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#71717a', lineHeight: 1.5 }}>{x.d}</p>
              </div>
            ))}
          </div>

          {/* The list */}
          <h2 style={{ margin: '36px 0 14px', fontSize: 18, fontWeight: 700, color: '#111' }}>Your referrals</h2>
          <div style={{ borderRadius: 16, boxShadow: '0 0 0 1px #ececf0', overflow: 'hidden' }}>
            {(!data?.referrals || data.referrals.length === 0) ? (
              <div style={{ padding: '36px 20px', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#111' }}>No referrals yet</p>
                <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#71717a' }}>When someone signs up with your link, they’ll show here.</p>
              </div>
            ) : (
              data.referrals.map((r: Ref, i: number) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 20px', borderBottom: i < data.referrals.length - 1 ? '1px solid #f0f0f2' : 'none' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.referred_name || r.referred_email || 'A business'}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#71717a' }}>{new Date(r.created_at).toLocaleDateString()}{r.status === 'qualified' && r.qualified_at ? ` · qualified ${new Date(r.qualified_at).toLocaleDateString()}` : ''}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, whiteSpace: 'nowrap' }}>
                    {statusPill(r.status)}
                    <span style={{ fontSize: 14.5, fontWeight: 700, color: r.status === 'qualified' ? '#059669' : '#71717a' }}>{r.status === 'qualified' ? `+${money(r.credit_cents, r.currency)}` : money(r.credit_cents, r.currency)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <p style={{ fontSize: 13, color: '#71717a', marginTop: 16 }}>
            See the <a href="/referrals/terms" target="_blank" rel="noopener noreferrer" style={{ color: CORAL, fontWeight: 600 }}>referral terms</a>.
          </p>
        </>
      )}
    </div>
  )
}
