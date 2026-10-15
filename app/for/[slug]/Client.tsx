'use client'

import { ReactNode } from 'react'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import ScrollStory from '@/components/ScrollStory'
import { useShell, Reveal, Arrow, SectionHead, Faq, WorkflowRail, usePointerParallax, CtaBand, FONT } from '@/components/marketing/Kit'
import { FOR_PAGES } from '@/lib/for-pages'
import { FOR_CONTENT, FOR_ORDER } from './content'

// A workflow page for one kind of business (/for/ecommerce, /for/restaurants…).
// Instead of a feature list it walks through how a real customer moves through
// Colvy for that business: the journey rail in the hero, the pinned scroll
// story, then the same steps in plain words with the feature behind each one.

export default function ForClient({ slug }: { slug: string }) {
  const c = FOR_CONTENT[slug]
  const meta = FOR_PAGES[slug]
  const accent = c.accent
  const t = useShell(accent)
  const heroRef = usePointerParallax<HTMLDivElement>()

  return (
    // overflow-x: clip (not hidden) so the scroll story can stay pinned.
    <div style={{ background: t.bg, color: t.text, fontFamily: FONT, minHeight: '100vh', overflowX: 'clip', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        @keyframes forFloat { 0%,100% { translate: 0 0 } 50% { translate: 0 -12px } }
        @keyframes forIn { from { opacity: 0; transform: translateY(26px) } to { opacity: 1; transform: none } }
        .for-hero-copy > * { animation: forIn .8s cubic-bezier(.16,1,.3,1) both }
        .for-hero-copy > :nth-child(2) { animation-delay: .06s } .for-hero-copy > :nth-child(3) { animation-delay: .12s }
        .for-hero-copy > :nth-child(4) { animation-delay: .18s } .for-hero-copy > :nth-child(5) { animation-delay: .24s }
        .for-card { transition: transform .25s cubic-bezier(.16,1,.3,1), box-shadow .25s, border-color .25s }
        .for-card:hover { transform: translateY(-5px) }
        .for-link:hover { gap: 10px !important }
        @media (max-width: 900px) {
          .for-hero { grid-template-columns: 1fr !important; padding-top: 104px !important }
          .for-stack { height: 360px !important; transform: scale(.82); transform-origin: top center }
          .for-steps { grid-template-columns: 1fr !important }
          .for-measure { grid-template-columns: 1fr !important }
          .for-more { grid-template-columns: 1fr 1fr !important }
        }
        @media (prefers-reduced-motion: reduce) {
          .for-hero-copy > *, .for-float { animation: none !important }
        }
      `}</style>

      <MarketingNav dark={t.dark} onToggleDark={t.toggleDark} />

      {/* HERO */}
      <section ref={heroRef} className="for-hero" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 40, alignItems: 'center', maxWidth: 1280, margin: '0 auto', padding: 'clamp(110px, 13vw, 150px) 24px 70px' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: t.grid, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', pointerEvents: 'none' }} />
        <div aria-hidden style={{ position: 'absolute', width: 520, height: 520, borderRadius: '50%', background: accent, opacity: t.dark ? 0.16 : 0.12, filter: 'blur(90px)', right: '4%', top: '18%', pointerEvents: 'none' }} />

        <div className="for-hero-copy" style={{ position: 'relative', minWidth: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 999, background: accent + '16', color: accent, fontSize: 13, fontWeight: 800, letterSpacing: '0.02em' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: accent }} />{c.eyebrow}
          </span>
          <h1 style={{ fontSize: 'clamp(42px, 6.2vw, 80px)', fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 0.98, margin: '20px 0 22px' }}>{c.h1}</h1>
          <p style={{ fontSize: 'clamp(17px, 1.6vw, 20px)', lineHeight: 1.6, color: t.muted, maxWidth: 580, margin: '0 0 30px' }}>{c.sub}</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 30 }}>
            <button onClick={t.go} style={t.btnPrimary}>{t.user ? 'Go to your dashboard' : 'Start free'} <Arrow /></button>
            <a href="#workflow" style={t.btnGhost}>See the workflow</a>
          </div>
          <WorkflowRail steps={c.rail} accent={accent} dark={t.dark} />
        </div>

        {/* Three cards from the story, fanned out and drifting with the pointer. */}
        <div className="for-stack" aria-hidden style={{ position: 'relative', height: 460, minWidth: 0 }}>
          {c.heroCards.map((k, i) => {
            const spots = [{ l: '2%', t: '4%', r: -5, d: 18 }, { l: '30%', t: '34%', r: 3, d: -26 }, { l: '8%', t: '64%', r: -2, d: 34 }]
            const s = spots[i] || spots[0]
            return (
              <div key={k} className="for-float" style={{ position: 'absolute', left: s.l, top: s.t, zIndex: 3 - i, animation: `forFloat ${6 + i}s ease-in-out ${i * 0.8}s infinite` }}>
                <div style={{ transform: `translate3d(calc(var(--mx, 0) * ${s.d}px), calc(var(--my, 0) * ${s.d * 0.6}px), 0) rotate(${s.r}deg)`, transition: 'transform .4s cubic-bezier(.16,1,.3,1)' }}>
                  <div style={{ animation: `forIn .9s cubic-bezier(.16,1,.3,1) ${0.25 + i * 0.12}s both` }}>{c.cards[k]}</div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* THE STORY: pinned while you scroll through the five beats */}
      <div id="workflow">
        <ScrollStory stages={c.stages} cards={c.cards} order={c.order} label={`How Colvy works for ${meta.name.toLowerCase()}`} />
      </div>

      {/* STEP BY STEP */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(70px, 9vw, 110px) 24px 30px' }}>
        <Reveal>
          <SectionHead eyebrow="Step by step" accent={accent} muted={t.muted}
            title={<>The whole workflow, in plain words.</>}
            sub="Every step is something you can switch on in Colvy today. Here’s what happens and which part of Colvy does it." />
        </Reveal>
        <div className="for-steps" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
          {c.steps.map((s, i) => (
            <Reveal key={s.title} delay={(i % 2) * 0.06}>
              <div className="for-card" style={{ height: '100%', boxSizing: 'border-box', display: 'flex', gap: 16, padding: '22px 22px 20px', borderRadius: 20, background: t.cardBg, border: `1px solid ${t.cardBorder}` }}>
                <span style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 12, background: accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 16 }}>{i + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.01em', margin: '6px 0 6px' }}>{s.title}</h3>
                  <p style={{ fontSize: 15, lineHeight: 1.6, color: t.muted, margin: '0 0 12px' }}>{s.body}</p>
                  <a href={s.href} className="for-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 800, color: accent, textDecoration: 'none', transition: 'gap .2s' }}>Uses: {s.uses} <Arrow size={14} /></a>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* WHAT YOU CAN SEE */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '60px 24px 30px' }}>
        <Reveal>
          <SectionHead eyebrow="Measure it" accent={accent} muted={t.muted} title="See what each step brings in." sub="Colvy keeps the numbers as the work happens, so you can see what’s working without a spreadsheet." />
        </Reveal>
        <div className="for-measure" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
          {c.measure.map((m, i) => (
            <Reveal key={m.title} delay={i * 0.07}>
              <div className="for-card" style={{ height: '100%', boxSizing: 'border-box', padding: '24px 22px', borderRadius: 20, background: `linear-gradient(160deg, ${accent}14, transparent 70%), ${t.cardBg}`, border: `1px solid ${t.cardBorder}` }}>
                <MeasureIcon i={i} accent={accent} />
                <h3 style={{ fontSize: 18, fontWeight: 900, margin: '14px 0 6px' }}>{m.title}</h3>
                <p style={{ fontSize: 15, lineHeight: 1.6, color: t.muted, margin: 0 }}>{m.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.1}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 34 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: t.muted, marginRight: 4 }}>Works with</span>
            {c.works.map(w => (
              <span key={w} style={{ fontSize: 13.5, fontWeight: 700, padding: '8px 14px', borderRadius: 999, border: `1px solid ${t.cardBorder}`, background: t.cardBg }}>{w}</span>
            ))}
          </div>
        </Reveal>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 820, margin: '0 auto', padding: '70px 24px 40px' }}>
        <Reveal><SectionHead eyebrow="Questions" accent={accent} muted={t.muted} title="Good questions." /></Reveal>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {meta.faqs.map(f => <Faq key={f.q} q={f.q} a={f.a} accent={accent} text={t.text} muted={t.muted} cardBg={t.cardBg} cardBorder={t.cardBorder} />)}
        </div>
      </section>

      {/* OTHER BUSINESSES */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '50px 24px 30px' }}>
        <Reveal><SectionHead eyebrow="Also built for" accent={accent} muted={t.muted} title="See the workflow for other businesses." /></Reveal>
        <div className="for-more" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
          {FOR_ORDER.filter(k => k !== slug).map((k, i) => (
            <Reveal key={k} delay={i * 0.05}>
              <a href={`/for/${k}`} className="for-card" style={{ display: 'block', height: '100%', boxSizing: 'border-box', padding: '18px 18px 16px', borderRadius: 18, border: `1px solid ${t.cardBorder}`, background: t.cardBg, textDecoration: 'none', color: t.text }}>
                <span style={{ display: 'block', width: 28, height: 6, borderRadius: 3, background: FOR_CONTENT[k].accent, marginBottom: 14 }} />
                <span style={{ display: 'block', fontSize: 16, fontWeight: 900, marginBottom: 4 }}>{FOR_PAGES[k].name}</span>
                <span style={{ display: 'block', fontSize: 13.5, lineHeight: 1.5, color: t.muted }}>{FOR_CONTENT[k].h1}</span>
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      <CtaBand title={`Run your ${meta.name.toLowerCase()} business from one place.`} sub="Start free, connect your channels and switch on the steps you need. You can be answering customers from one inbox today." accent={accent} onGo={t.go} user={t.user} secondary={{ label: 'See pricing', href: '/pricing' }} />
      <MarketingFooter dark={t.dark} />
    </div>
  )
}

function MeasureIcon({ i, accent }: { i: number; accent: string }): ReactNode {
  const paths = [
    <><line key="a" x1="18" y1="20" x2="18" y2="10" /><line key="b" x1="12" y1="20" x2="12" y2="4" /><line key="c" x1="6" y1="20" x2="6" y2="14" /></>,
    <><polyline key="a" points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline key="b" points="17 6 23 6 23 12" /></>,
    <><circle key="a" cx="12" cy="12" r="9" /><polyline key="b" points="12 7 12 12 15 14" /></>,
  ]
  return (
    <span style={{ width: 42, height: 42, borderRadius: 13, background: accent + '1c', color: accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{paths[i % 3]}</svg>
    </span>
  )
}

