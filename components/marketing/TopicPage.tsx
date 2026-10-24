'use client'

import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import { ChatCard, Ico } from '@/components/story/StoryCards'
import { useShell, Reveal, Arrow, SectionHead, Faq, CtaBand, FONT } from '@/components/marketing/Kit'
import { TOPIC_PAGES } from '@/lib/topic-pages'

// A topic landing page (lib/topic-pages.ts): a hero with a live-looking chat,
// a plain explanation of the topic, what Colvy does about it, how it works,
// questions and related reading. Same look as the other marketing pages.
export default function TopicPage({ slug }: { slug: string }) {
  const p = TOPIC_PAGES[slug]
  const a = p.accent
  const t = useShell(a)
  return (
    <div style={{ background: t.bg, color: t.text, fontFamily: FONT, minHeight: '100vh', overflowX: 'clip', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        @keyframes tpUp { from { opacity: 0; transform: translateY(26px) } to { opacity: 1; transform: none } }
        .tp-hero-copy > * { animation: tpUp .8s cubic-bezier(.16,1,.3,1) both }
        .tp-hero-copy > :nth-child(2) { animation-delay: .06s } .tp-hero-copy > :nth-child(3) { animation-delay: .12s } .tp-hero-copy > :nth-child(4) { animation-delay: .18s }
        .tp-card { transition: transform .25s cubic-bezier(.16,1,.3,1), border-color .25s } .tp-card:hover { transform: translateY(-5px) }
        a.tp-card:hover { border-color: ${a}66 !important }
        @media (max-width: 900px) {
          .tp-hero { grid-template-columns: 1fr !important; padding-top: 104px !important }
          .tp-grid3 { grid-template-columns: 1fr !important } .tp-grid2 { grid-template-columns: 1fr !important }
          .tp-chat { transform: none !important }
        }
        @media (prefers-reduced-motion: reduce) { .tp-hero-copy > * { animation: none !important } }
      `}</style>
      <MarketingNav dark={t.dark} onToggleDark={t.toggleDark} />

      {/* HERO */}
      <section className="tp-hero" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 44, alignItems: 'center', maxWidth: 1240, margin: '0 auto', padding: 'clamp(110px, 13vw, 150px) 24px 70px' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: t.grid, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', pointerEvents: 'none' }} />
        <div aria-hidden style={{ position: 'absolute', width: 520, height: 520, borderRadius: '50%', background: a, opacity: t.dark ? 0.16 : 0.12, filter: 'blur(90px)', right: '6%', top: '14%', pointerEvents: 'none' }} />
        <div className="tp-hero-copy" style={{ position: 'relative', minWidth: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 999, background: a + '16', color: a, fontSize: 13, fontWeight: 800 }}>
            {p.eyebrow}{p.comingSoon && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: a, color: '#fff' }}>Coming to Colvy</span>}
          </span>
          <h1 style={{ fontSize: 'clamp(40px, 5.6vw, 70px)', fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 1, margin: '20px 0 22px' }}>{p.h1}</h1>
          <p style={{ fontSize: 'clamp(17px, 1.6vw, 20px)', lineHeight: 1.6, color: t.muted, maxWidth: 580, margin: '0 0 30px' }}>{p.sub}</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={t.go} style={t.btnPrimary}>{t.user ? 'Go to your dashboard' : p.primaryCta} <Arrow /></button>
            <a href="#how" style={t.btnGhost}>How it works</a>
          </div>
        </div>
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', minWidth: 0, animation: 'tpUp .9s cubic-bezier(.16,1,.3,1) .2s both' }}>
          <div className="tp-chat" style={{ transform: 'scale(1.12)', transformOrigin: 'center', filter: `drop-shadow(0 40px 60px ${a}33)`, maxWidth: '100%' }}>
            <ChatCard title={p.chat.who} sub={`via ${p.chat.channel}`} channel={p.chat.channel} lines={p.chat.lines} chips={p.chat.chips} width={340} />
          </div>
        </div>
      </section>

      {/* WHAT IT IS */}
      <section style={{ maxWidth: 820, margin: '0 auto', padding: '30px 24px 30px' }}>
        <Reveal>
          <h2 style={{ fontSize: 'clamp(28px, 3.6vw, 42px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.08, margin: '0 0 16px' }}>{p.intro.title}</h2>
          {p.intro.paragraphs.map(x => <p key={x.slice(0, 24)} style={{ fontSize: 17.5, lineHeight: 1.7, color: t.muted, margin: '0 0 14px' }}>{x}</p>)}
        </Reveal>
      </section>

      {/* SECTIONS */}
      {p.sections.map(sec => (
        <section key={sec.title} style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(50px, 7vw, 80px) 24px 20px' }}>
          <Reveal><SectionHead eyebrow={sec.eyebrow} accent={a} muted={t.muted} title={sec.title} sub={sec.sub} /></Reveal>
          <div className={sec.items.length === 4 ? 'tp-grid2' : 'tp-grid3'} style={{ display: 'grid', gridTemplateColumns: sec.items.length === 4 ? 'repeat(2, minmax(0,1fr))' : 'repeat(3, minmax(0,1fr))', gap: 16 }}>
            {sec.items.map((it, i) => {
              const inner = (
                <>
                  <span style={{ width: 42, height: 42, borderRadius: 13, background: a + '1a', color: a, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Ico name={it.icon} size={20} /></span>
                  <h3 style={{ fontSize: 18, fontWeight: 900, margin: '14px 0 6px', color: t.text }}>{it.title}</h3>
                  <p style={{ fontSize: 15, lineHeight: 1.6, color: t.muted, margin: 0 }}>{it.body}</p>
                  {it.href && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 14, fontWeight: 800, color: a }}>Learn more <Arrow size={13} /></span>}
                </>
              )
              const style: React.CSSProperties = { display: 'block', height: '100%', boxSizing: 'border-box', padding: '24px 22px', borderRadius: 20, background: t.cardBg, border: `1px solid ${t.cardBorder}`, textDecoration: 'none' }
              return (
                <Reveal key={it.title} delay={(i % 3) * 0.06}>
                  {it.href ? <a href={it.href} className="tp-card" style={style}>{inner}</a> : <div className="tp-card" style={style}>{inner}</div>}
                </Reveal>
              )
            })}
          </div>
        </section>
      ))}

      {/* HOW */}
      <section id="how" style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(60px, 8vw, 100px) 24px 30px' }}>
        <Reveal><SectionHead eyebrow={p.comingSoon ? 'Choosing one' : 'How it works'} accent={a} muted={t.muted} title={p.stepsTitle} /></Reveal>
        <div className="tp-grid3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 16 }}>
          {p.steps.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.07}>
              <div className="tp-card" style={{ height: '100%', boxSizing: 'border-box', padding: '26px 24px', borderRadius: 22, background: t.cardBg, border: `1px solid ${t.cardBorder}` }}>
                <span style={{ width: 40, height: 40, borderRadius: 13, background: a, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 17 }}>{i + 1}</span>
                <h3 style={{ fontSize: 19, fontWeight: 900, margin: '16px 0 8px' }}>{s.title}</h3>
                <p style={{ fontSize: 15, lineHeight: 1.6, color: t.muted, margin: 0 }}>{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 820, margin: '0 auto', padding: '70px 24px 30px' }}>
        <Reveal><SectionHead eyebrow="Questions" accent={a} muted={t.muted} title="Good questions." /></Reveal>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {p.faqs.map(f => <Faq key={f.q} q={f.q} a={f.a} accent={a} text={t.text} muted={t.muted} cardBg={t.cardBg} cardBorder={t.cardBorder} />)}
        </div>
      </section>

      {/* RELATED */}
      <section style={{ maxWidth: 820, margin: '0 auto', padding: '20px 24px 50px' }}>
        <Reveal>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.muted, marginBottom: 12 }}>Keep reading</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {p.related.map(r => (
              <a key={r.href} href={r.href} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 999, border: `1px solid ${t.cardBorder}`, background: t.cardBg, color: t.text, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>{r.label} <Arrow size={13} /></a>
            ))}
          </div>
        </Reveal>
      </section>

      <CtaBand title={p.cta.title} sub={p.cta.sub} accent={a} onGo={t.go} user={t.user} secondary={p.cta.secondary} />
      <MarketingFooter dark={t.dark} />
    </div>
  )
}
