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

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Referrals</h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--slate)' }}>Earn {reward} for every business that subscribes and pays their first month.</p>
        </div>
        <a href="/referrals" target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--slate)', textDecoration: 'none', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Learn more
        </a>
      </div>

      {loading ? (
        <p style={{ color: 'var(--slate)', fontSize: 14 }}>Loading…</p>
      ) : err ? (
        <div style={{ padding: '12px 14px', borderRadius: 10, background: '#fee2e2', color: '#b91c1c', fontSize: 14 }}>{err}</div>
      ) : (
        <>
          {data?.needsMigration && (
            <div style={{ padding: '12px 14px', borderRadius: 10, background: '#fff7e6', color: '#a16207', fontSize: 13.5, marginBottom: 16 }}>
              Referrals aren’t fully set up yet — run migration <b>COLVY_V314_REFERRALS.sql</b> to activate link tracking and credit.
            </div>
          )}

          {/* Hero banner */}
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 20, padding: '30px 32px', marginBottom: 16, background: 'linear-gradient(120deg, var(--peach, #ffe9e2) 0%, #fff6f2 60%, #fff 100%)', border: '1px solid #ffe1d6' }}>
            <div style={{ maxWidth: 560 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: CORAL }}>Grow together</p>
              <h2 style={{ margin: '8px 0 10px', fontSize: 'clamp(26px,4vw,38px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.05, color: 'var(--ink)' }}>
                Refer businesses.<br /><span style={{ color: CORAL }}>Earn {reward} credit.</span>
              </h2>
              <p style={{ margin: 0, fontSize: 15, color: 'var(--slate)', lineHeight: 1.55, maxWidth: 460 }}>
                Share Colvy with other businesses. When they subscribe and pay their first month, you’ll earn {reward} in account credit.
              </p>
            </div>
            {/* Decorative gift on the right (hidden on narrow) */}
            <div className="ref-hero-art" style={{ position: 'absolute', right: 26, top: '50%', transform: 'translateY(-50%)', width: 108, height: 108, borderRadius: 26, background: '#fff', border: '1px solid #ffe1d6', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 20px 40px -20px rgba(255,106,77,0.4)' }}>
              <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke={CORAL} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
            </div>
          </div>

          {/* Referral link + reward */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 18, padding: 22, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 20, alignItems: 'stretch', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 340px', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--peach, #ffe9e2)', color: CORAL, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                  </span>
                  <div>
                    <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>Your referral link</p>
                    <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)' }}>Share this link with a business you know.</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input readOnly value={data?.link || 'Generating…'} onFocus={e => e.currentTarget.select()}
                    style={{ flex: '1 1 240px', minWidth: 0, padding: '11px 13px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13.5, color: 'var(--ink)', background: '#fafafa' }} />
                  <button onClick={copy} disabled={!data?.link}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 18px', borderRadius: 10, border: 'none', background: CORAL, color: '#fff', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    {copied ? 'Copied ✓' : 'Copy link'}
                  </button>
                  <button onClick={share} disabled={!data?.link}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 16px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                    Share
                  </button>
                </div>
              </div>
              {/* Reward blurb */}
              <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 12, borderLeft: '1px solid var(--border)', paddingLeft: 20 }} className="ref-reward-blurb">
                <span style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--peach, #ffe9e2)', color: CORAL, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
                </span>
                <div style={{ maxWidth: 190 }}>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: 'var(--ink)' }}>{reward} credit</p>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--slate)', lineHeight: 1.4 }}>for every business that subscribes and pays their first month.</p>
                </div>
              </div>
            </div>

            {/* How it works */}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 18, paddingTop: 16 }}>
              <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>How it works</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }} className="ref-steps">
                {[
                  { t: 'Share your link', d: 'Send it to business owners or anyone who’d benefit from Colvy.' },
                  { t: 'Business subscribes', d: 'They sign up on your link and pay their first month.' },
                  { t: `You earn ${reward} credit`, d: 'Applied to your next invoice once they qualify.' },
                ].map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10 }}>
                    <span style={{ width: 26, height: 26, borderRadius: 13, background: 'var(--peach, #ffe9e2)', color: CORAL, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{i + 1}</span>
                    <div>
                      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{s.t}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.45 }}>{s.d}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }} className="ref-stats">
            {[
              { label: 'Credit earned', sub: 'Total referral credit earned.', value: money(data?.balanceCents || 0, data?.currency), color: '#059669', bg: '#e7f6ec', icon: <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /> },
              { label: 'Qualified', sub: 'Subscribed and paid their first month.', value: data?.stats?.qualified ?? 0, color: '#2563eb', bg: '#e8f0ff', icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></> },
              { label: 'Pending', sub: 'Still in progress.', value: data?.stats?.pending ?? 0, color: '#a16207', bg: '#fef3c7', icon: <><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></> },
            ].map(s => (
              <div key={s.label} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
                <span style={{ width: 34, height: 34, borderRadius: 10, background: s.bg, color: s.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{s.icon}</svg>
                </span>
                <p style={{ fontSize: 24, fontWeight: 800, color: s.color, margin: 0 }}>{s.value}</p>
                <p style={{ fontSize: 12.5, color: 'var(--ink)', margin: '2px 0 0', fontWeight: 600 }}>{s.label}</p>
                <p style={{ fontSize: 11.5, color: 'var(--slate)', margin: '1px 0 0' }}>{s.sub}</p>
              </div>
            ))}
          </div>

          {/* List */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>Your referrals</span>
            </div>
            {(!data?.referrals || data.referrals.length === 0) ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--peach, #ffe9e2)', color: CORAL, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
                </div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>No referrals yet — share your link to get started.</p>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>Once someone signs up using your link, they’ll appear here.</p>
              </div>
            ) : (
              data.referrals.map((r: Ref, i: number) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 18px', borderBottom: i < data.referrals.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.referred_name || r.referred_email || 'A business'}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--slate)' }}>{new Date(r.created_at).toLocaleDateString()}{r.status === 'qualified' && r.qualified_at ? ` · qualified ${new Date(r.qualified_at).toLocaleDateString()}` : ''}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, whiteSpace: 'nowrap' }}>
                    {statusPill(r.status)}
                    <span style={{ fontSize: 14, fontWeight: 700, color: r.status === 'qualified' ? '#059669' : 'var(--slate)' }}>{r.status === 'qualified' ? `+${money(r.credit_cents, r.currency)}` : money(r.credit_cents, r.currency)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <p style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 16 }}>
            Credit is applied to your next invoice once a referral qualifies. See the <a href="/referrals/terms" target="_blank" rel="noopener noreferrer" style={{ color: CORAL, fontWeight: 600 }}>referral terms</a>.
          </p>
        </>
      )}

      <style>{`
        @media (max-width: 720px){
          .ref-hero-art{ display:none !important; }
          .ref-reward-blurb{ border-left:none !important; padding-left:0 !important; }
          .ref-steps{ grid-template-columns:1fr !important; }
          .ref-stats{ grid-template-columns:1fr !important; }
        }
      `}</style>
    </div>
  )
}
