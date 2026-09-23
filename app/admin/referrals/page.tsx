'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import PageHeader from '@/components/PageHeader'

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

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <PageHeader title="Referrals" subtitle={`Earn ${reward} for every business that subscribes and pays their first month`} bleed={24} bleedTop={32} />

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

          {/* Reward + link */}
          <div style={{ borderRadius: 18, padding: 24, color: '#fff', background: 'linear-gradient(135deg,#2b59ff,#6b4dff)', marginBottom: 18 }}>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.85, fontWeight: 600 }}>Your referral link</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              <input readOnly value={data?.link || 'Generating…'} onFocus={e => e.currentTarget.select()}
                style={{ flex: 1, minWidth: 240, padding: '11px 14px', borderRadius: 10, border: 'none', fontSize: 14, color: '#0f1119' }} />
              <button onClick={copy} disabled={!data?.link}
                style={{ padding: '11px 20px', borderRadius: 10, border: 'none', background: '#fff', color: '#2b59ff', fontWeight: 800, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {copied ? 'Copied ✓' : 'Copy link'}
              </button>
            </div>
            <p style={{ margin: '12px 0 0', fontSize: 13, opacity: 0.85 }}>Share it with a business you know. When they subscribe and pay their first month, you earn {reward} in account credit.</p>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Credit earned', value: money(data?.balanceCents || 0, data?.currency), color: '#059669' },
              { label: 'Qualified', value: data?.stats?.qualified ?? 0, color: '#2563eb' },
              { label: 'Pending', value: data?.stats?.pending ?? 0, color: '#a16207' },
            ].map(s => (
              <div key={s.label} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
                <p style={{ fontSize: 24, fontWeight: 800, color: s.color, margin: 0 }}>{s.value}</p>
                <p style={{ fontSize: 12, color: 'var(--slate)', margin: '2px 0 0' }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* List */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>Your referrals</div>
            {(!data?.referrals || data.referrals.length === 0) ? (
              <div style={{ padding: 28, textAlign: 'center', color: 'var(--slate)', fontSize: 14 }}>No referrals yet — share your link to get started.</div>
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
            Credit is applied to your next invoice once a referral qualifies. See the <a href="/referrals/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--coral)', fontWeight: 600 }}>referral terms</a>.
          </p>
        </>
      )}
    </div>
  )
}
