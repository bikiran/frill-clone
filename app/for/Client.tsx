'use client'

import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import { useShell, Reveal, Arrow, CtaBand, FONT } from '@/components/marketing/Kit'
import { FOR_PAGES } from '@/lib/for-pages'
import { FOR_CONTENT, FOR_ORDER } from './[slug]/content'

// /for — the hub for the workflow pages. Each card shows the business type, its
// one-line promise, the customer journey and a real card from its story.

const ACCENT = '#ff4d8d'

export default function ForHub() {
  const t = useShell(ACCENT)
  return (
    <div style={{ background: t.bg, color: t.text, fontFamily: FONT, minHeight: '100vh', overflowX: 'clip', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        .forhub-card { transition: transform .3s cubic-bezier(.16,1,.3,1), box-shadow .3s }
        .forhub-card:hover { transform: translateY(-6px) }
        .forhub-card:hover .forhub-peek { transform: translateY(-6px) rotate(-1deg) }
        @media (max-width: 900px) { .forhub-grid { grid-template-columns: 1fr !important } .forhub-peek { display: none !important } }
      `}</style>
      <MarketingNav dark={t.dark} onToggleDark={t.toggleDark} />

      <section style={{ position: 'relative', maxWidth: 980, margin: '0 auto', padding: 'clamp(120px, 14vw, 160px) 24px 50px', textAlign: 'center' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: t.grid, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 60% 60% at 50% 40%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 60% 60% at 50% 40%, #000 40%, transparent 80%)', pointerEvents: 'none' }} />
        <Reveal>
          <h1 style={{ position: 'relative', fontSize: 'clamp(42px, 6.4vw, 82px)', fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 0.98, margin: '0 0 22px' }}>Built around how your business works.</h1>
          <p style={{ position: 'relative', fontSize: 'clamp(17px, 1.7vw, 21px)', lineHeight: 1.6, color: t.muted, maxWidth: 680, margin: '0 auto' }}>Pick your kind of business and walk through the real workflow: from the first message to the paid order, the booking and the review.</p>
        </Reveal>
      </section>

      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '10px 24px 60px' }}>
        <div className="forhub-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 18 }}>
          {FOR_ORDER.map((k, i) => {
            const c = FOR_CONTENT[k]
            return (
              <Reveal key={k} delay={(i % 2) * 0.07}>
                <a href={`/for/${k}`} className="forhub-card" style={{ position: 'relative', display: 'block', height: '100%', minHeight: 300, boxSizing: 'border-box', overflow: 'hidden', padding: '28px 28px 26px', borderRadius: 26, textDecoration: 'none', color: '#fff', background: `linear-gradient(150deg, ${c.accent}, ${c.stages[1].bg})` }}>
                  <div style={{ position: 'relative', zIndex: 2, maxWidth: '58%' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.85 }}>{FOR_PAGES[k].name}</span>
                    <h2 style={{ fontSize: 'clamp(26px, 2.6vw, 34px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.04, margin: '10px 0 14px' }}>{c.h1}</h2>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
                      {c.rail.slice(0, 4).map(s => <span key={s} style={{ fontSize: 11.5, fontWeight: 800, padding: '4px 9px', borderRadius: 999, background: 'rgba(255,255,255,0.18)' }}>{s}</span>)}
                    </div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 900, fontSize: 15 }}>See the workflow <Arrow /></span>
                  </div>
                  <div className="forhub-peek" aria-hidden style={{ position: 'absolute', right: -40, bottom: -24, transform: 'rotate(-4deg)', transition: 'transform .35s cubic-bezier(.16,1,.3,1)', transformOrigin: 'bottom right', zIndex: 1 }}>
                    <div style={{ transform: 'scale(.82)', transformOrigin: 'bottom right' }}>{c.cards[c.heroCards[1]]}</div>
                  </div>
                </a>
              </Reveal>
            )
          })}
          <Reveal delay={0.07}>
            <a href="/industries" className="forhub-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', minHeight: 300, boxSizing: 'border-box', padding: '28px', borderRadius: 26, textDecoration: 'none', color: t.text, border: `1px solid ${t.cardBorder}`, background: t.soft }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.muted }}>More industries</span>
              <h2 style={{ fontSize: 'clamp(24px, 2.4vw, 30px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.08, margin: '10px 0 12px' }}>SaaS, agencies, hospitality and healthcare.</h2>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 900, fontSize: 15, color: ACCENT }}>Browse industries <Arrow /></span>
            </a>
          </Reveal>
        </div>
      </section>

      <CtaBand title="Start with the workflow that fits." sub="Sign up free, connect your channels and switch on the steps you need, one at a time." accent={ACCENT} onGo={t.go} user={t.user} secondary={{ label: 'See pricing', href: '/pricing' }} />
      <MarketingFooter dark={t.dark} />
    </div>
  )
}
