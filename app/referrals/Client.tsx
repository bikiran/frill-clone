'use client'

import { useEffect, useRef, useState, ReactNode } from 'react'
import Link from 'next/link'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'

// Referral program landing page — Coax/Podium-inspired. Marketing-styled (nav,
// footer). The reward rule is the single source of truth for the copy here and
// on the terms page: $100 account credit per successful referral, earned once
// the referred business subscribes AND pays their first month.
const CORAL = '#ff6a4d', BLUE = '#2b59ff', INK = '#0f1119', SLATE = '#5b6472'
const REWARD = '$100'

function useReveal(threshold = 0.14) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => { const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold }); if (ref.current) o.observe(ref.current); return () => o.disconnect() }, [threshold])
  return { ref, v }
}
function Reveal({ children, delay = 0, y = 26 }: { children: ReactNode; delay?: number; y?: number }) {
  const { ref, v } = useReveal()
  return <div ref={ref} style={{ opacity: v ? 1 : 0, transform: v ? 'none' : `translateY(${y}px)`, transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s` }}>{children}</div>
}

const STEPS = [
  { n: 1, t: 'Share your link', d: 'Grab your personal referral link from your Colvy dashboard and send it to a business that would love Colvy.' },
  { n: 2, t: 'They subscribe & pay', d: 'Your referral signs up on your link, picks a plan and pays their first month — that’s what makes it count.' },
  { n: 3, t: 'You get ' + REWARD, d: `We drop ${REWARD} of account credit onto your next invoice. Refer as many businesses as you like — there’s no cap.` },
]

const FAQ = [
  { q: 'When exactly do I earn the ' + REWARD + '?', a: 'Once the business you referred subscribes to a paid plan and pays their first month in full. Free trials and cancellations before the first payment don’t qualify.' },
  { q: 'Is there a limit?', a: 'No cap. You earn ' + REWARD + ' for every business that becomes a paying customer through your link.' },
  { q: 'How is the reward paid?', a: 'As account credit applied to your next Colvy invoice. It’s not a cash payout.' },
  { q: 'Who can I refer?', a: 'Any new business that isn’t already a Colvy customer. You can’t refer yourself or your own workspaces.' },
]

export default function Client() {
  return (
    <div style={{ background: '#fff', color: INK }}>
      <MarketingNav />

      {/* Hero */}
      <section style={{ maxWidth: 1280, margin: '0 auto', padding: '64px 24px 40px', display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 48, alignItems: 'center' }} className="ref-hero">
        <div>
          <p style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: BLUE, margin: '0 0 18px' }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: BLUE }} /> Colvy Referrals
          </p>
          <h1 style={{ fontSize: 'clamp(40px,6vw,72px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.02, margin: '0 0 20px' }}>
            Refer a business.<br />Earn <span style={{ color: CORAL }}>{REWARD}</span>.
          </h1>
          <p style={{ fontSize: 18.5, color: SLATE, lineHeight: 1.6, maxWidth: 580, margin: '0 0 14px' }}>
            Know a business that’d love Colvy? Send them your link. When they subscribe and pay their first month, you get <strong style={{ color: INK }}>{REWARD} account credit</strong> — every time, no cap.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 22 }}>
            <Link href="/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 26px', borderRadius: 999, background: CORAL, color: '#fff', fontSize: 15.5, fontWeight: 800, textDecoration: 'none' }}>
              Get your referral link
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
            </Link>
            <Link href="/referrals/terms" style={{ display: 'inline-flex', alignItems: 'center', padding: '13px 22px', borderRadius: 999, border: '1px solid #e6e8ec', color: INK, fontSize: 15.5, fontWeight: 700, textDecoration: 'none' }}>
              Read the terms
            </Link>
          </div>
          <p style={{ fontSize: 13, color: SLATE, marginTop: 14 }}>Your link lives in your dashboard once you’re signed in.</p>
        </div>
        {/* Reward card */}
        <Reveal>
          <div style={{ position: 'relative', borderRadius: 24, background: 'linear-gradient(160deg,#eef2ff,#fff)', border: '1px solid #e9edf5', padding: 34, boxShadow: '0 30px 60px -30px rgba(43,89,255,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <img src="/icon-512.png" alt="" width={30} height={30} style={{ borderRadius: 8 }} />
              <span style={{ fontWeight: 800, fontSize: 15 }}>Referral reward</span>
            </div>
            <div style={{ fontSize: 'clamp(56px,9vw,88px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, color: INK }}>{REWARD}</div>
            <p style={{ fontSize: 14.5, color: SLATE, margin: '8px 0 22px' }}>per business that subscribes & pays their first month</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {['No cap on how many you refer', 'Paid as account credit', 'Track referrals from your dashboard'].map(t => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14.5, fontWeight: 600 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 10, background: '#e7f6ec', color: '#137a3e', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </span>
                  {t}
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* How it works */}
      <section style={{ maxWidth: 1280, margin: '0 auto', padding: '48px 24px' }}>
        <Reveal>
          <h2 style={{ fontSize: 'clamp(28px,4vw,42px)', fontWeight: 900, letterSpacing: '-0.02em', textAlign: 'center', margin: '0 0 8px' }}>How it works</h2>
          <p style={{ textAlign: 'center', color: SLATE, fontSize: 16.5, margin: '0 0 40px' }}>Three steps. About a minute to send.</p>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 22 }} className="ref-steps">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.08}>
              <div style={{ border: '1px solid #eceef2', borderRadius: 18, padding: 26, height: '100%', background: '#fff' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: BLUE, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 17, marginBottom: 16 }}>{s.n}</div>
                <h3 style={{ fontSize: 19, fontWeight: 800, margin: '0 0 8px' }}>{s.t}</h3>
                <p style={{ fontSize: 15, color: SLATE, lineHeight: 1.6, margin: 0 }}>{s.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <p style={{ textAlign: 'center', fontSize: 13.5, color: SLATE, marginTop: 26 }}>
            A referral counts once the business pays their first month. Credit is applied to your next invoice. See the <Link href="/referrals/terms" style={{ color: BLUE, fontWeight: 600 }}>full terms</Link>.
          </p>
        </Reveal>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 820, margin: '0 auto', padding: '32px 24px 8px' }}>
        <Reveal><h2 style={{ fontSize: 'clamp(26px,3.5vw,36px)', fontWeight: 900, letterSpacing: '-0.02em', textAlign: 'center', margin: '0 0 28px' }}>Questions</h2></Reveal>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FAQ.map((f, i) => (
            <Reveal key={i} delay={i * 0.05}>
              <div style={{ border: '1px solid #eceef2', borderRadius: 14, padding: '18px 20px' }}>
                <p style={{ fontSize: 16, fontWeight: 800, margin: '0 0 6px' }}>{f.q}</p>
                <p style={{ fontSize: 15, color: SLATE, lineHeight: 1.6, margin: 0 }}>{f.a}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 1280, margin: '0 auto', padding: '48px 24px 72px' }}>
        <Reveal>
          <div style={{ borderRadius: 26, background: INK, color: '#fff', padding: 'clamp(36px,6vw,64px)', textAlign: 'center' }}>
            <h2 style={{ fontSize: 'clamp(28px,4.5vw,48px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 12px' }}>Start earning {REWARD} a referral</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.72)', maxWidth: 520, margin: '0 auto 26px' }}>Sign in, grab your link, and share it with the businesses you already talk to.</p>
            <Link href="/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 30px', borderRadius: 999, background: CORAL, color: '#fff', fontSize: 16, fontWeight: 800, textDecoration: 'none' }}>
              Get your referral link
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
            </Link>
          </div>
        </Reveal>
      </section>

      <style>{`
        @media (max-width: 860px){
          .ref-hero{ grid-template-columns:1fr !important; }
          .ref-steps{ grid-template-columns:1fr !important; }
        }
      `}</style>
      <MarketingFooter />
    </div>
  )
}
