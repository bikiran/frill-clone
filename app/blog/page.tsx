'use client'

import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import FeatureIcon from '@/components/FeatureIcon'
import { POSTS, CATEGORIES, BlogPost } from '@/lib/blog'

// Blog index — a featured post, category filter chips and a card grid. Cards use
// accent-gradient cover tiles keyed by category (editorial style) rather than a
// photo per post. Same look/animation language as the rest of the marketing site.

const CORAL = '#ff6a4d', PINK = '#ff4d8d', PURPLE = '#7c5cff', INK = '#0f1119'

function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => { const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold }); if (ref.current) o.observe(ref.current); return () => o.disconnect() }, [threshold])
  return { ref, v }
}
function Reveal({ children, delay = 0, y = 24 }: { children: ReactNode; delay?: number; y?: number }) {
  const { ref, v } = useReveal()
  return <div ref={ref} style={{ opacity: v ? 1 : 0, transform: v ? 'none' : `translateY(${y}px)`, transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s` }}>{children}</div>
}

function Cover({ post, tall = false }: { post: BlogPost; tall?: boolean }) {
  return (
    <div aria-hidden style={{ position: 'relative', overflow: 'hidden', minHeight: tall ? 260 : 168, height: tall ? '100%' : undefined, background: `linear-gradient(150deg, ${post.accent} 0%, ${post.accent}cc 48%, #171a2b 125%)` }}>
      <div style={{ position: 'absolute', top: -30, right: -24, width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', filter: 'blur(30px)' }} />
      <div style={{ position: 'absolute', bottom: -34, left: -24, width: 140, height: 140, borderRadius: '50%', background: 'rgba(0,0,0,0.22)', filter: 'blur(34px)' }} />
      <div style={{ position: 'absolute', top: tall ? 20 : 16, left: tall ? 20 : 16 }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', color: '#fff', background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 999, padding: '5px 12px' }}>{post.category}</span>
      </div>
      <div style={{ position: 'absolute', right: tall ? 20 : 16, bottom: tall ? 20 : 14, color: 'rgba(255,255,255,0.92)' }}><FeatureIcon name={post.icon} color="rgba(255,255,255,0.92)" size={tall ? 52 : 38} /></div>
    </div>
  )
}

export default function BlogIndex() {
  const [dark, setDark] = useState(false)
  const [cat, setCat] = useState<string>('All')
  useEffect(() => {
    const { data: l } = supabase.auth.onAuthStateChange(() => {})
    return () => { l?.subscription?.unsubscribe() }
  }, [])

  const bg = dark ? '#0a0b12' : '#ffffff'
  const text = dark ? '#f4f5fb' : INK
  const muted = dark ? 'rgba(244,245,251,0.62)' : 'rgba(15,17,25,0.6)'
  const cardBg = dark ? 'rgba(255,255,255,0.045)' : '#ffffff'
  const cardBorder = dark ? 'rgba(255,255,255,0.09)' : 'rgba(15,17,25,0.09)'
  const font = '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Inter,sans-serif'
  const gridImg = `linear-gradient(${dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,17,25,0.045)'} 1px,transparent 1px),linear-gradient(90deg,${dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,17,25,0.045)'} 1px,transparent 1px)`

  const featured = POSTS[0]
  const rest = POSTS.slice(1)
  const shown = cat === 'All' ? rest : rest.filter(p => p.category === cat)
  const chips = ['All', ...CATEGORIES]

  return (
    <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        .bl-card{ transition:transform .24s cubic-bezier(0.16,1,0.3,1), box-shadow .24s cubic-bezier(0.16,1,0.3,1), border-color .24s; }
        .bl-card:hover{ transform:translateY(-6px); box-shadow:0 20px 44px rgba(15,17,25,0.12); }
        .bl-card:hover .bl-arrow{ transform:translateX(4px); }
        .bl-arrow{ transition:transform .22s cubic-bezier(0.16,1,0.3,1); }
        .bl-chip{ transition:all .18s cubic-bezier(0.16,1,0.3,1); cursor:pointer; }
        @media (max-width:820px){ .bl-feat{ grid-template-columns:1fr !important; } }
        @media (prefers-reduced-motion:reduce){ .bl-card,.bl-arrow,.bl-chip{ transition:none !important } }
      `}</style>

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* HEADER */}
      <section style={{ position: 'relative', textAlign: 'center', padding: '150px 24px 20px', maxWidth: 900, margin: '0 auto' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 30%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 70% at 50% 30%, #000 40%, transparent 80%)', pointerEvents: 'none' }} />
        <Reveal>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: CORAL + '18', color: CORAL, fontSize: 12.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 18 }}><FeatureIcon name="book" color={CORAL} size={15} />Blog</span>
          <h1 style={{ fontSize: 'clamp(38px, 5.6vw, 66px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.04, margin: '0 0 16px' }}>Ideas for <span style={{ color: CORAL }}>growing businesses</span></h1>
          <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, maxWidth: 600, margin: '0 auto', lineHeight: 1.6 }}>Practical playbooks on customer communication — support, sales, reviews and the tools that tie them together.</p>
        </Reveal>
      </section>

      {/* FEATURED */}
      <section style={{ maxWidth: 1120, margin: '0 auto', padding: '30px 24px 8px' }}>
        <Reveal>
          <a href={`/blog/${featured.slug}`} className="bl-card bl-feat" style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 0, overflow: 'hidden', borderRadius: 24, background: cardBg, border: `1px solid ${cardBorder}`, textDecoration: 'none' }}>
            <Cover post={featured} tall />
            <div style={{ padding: 'clamp(22px, 3vw, 36px)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: featured.accent, marginBottom: 10 }}>Featured · {featured.category}</span>
              <h2 style={{ fontSize: 'clamp(22px, 2.8vw, 32px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.15, margin: '0 0 10px', color: text }}>{featured.title}</h2>
              <p style={{ fontSize: 15.5, lineHeight: 1.6, color: muted, margin: '0 0 16px' }}>{featured.excerpt}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: muted, fontWeight: 600 }}>
                <span>{featured.author}</span><span aria-hidden>·</span><time dateTime={featured.date}>{featured.dateLabel}</time><span aria-hidden>·</span><span>{featured.readTime}</span>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14.5, fontWeight: 800, color: featured.accent, marginTop: 18 }}>Read the post<span className="bl-arrow" style={{ display: 'inline-flex' }}>→</span></span>
            </div>
          </a>
        </Reveal>
      </section>

      {/* FILTER CHIPS */}
      <section style={{ maxWidth: 1120, margin: '0 auto', padding: '26px 24px 6px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
          {chips.map(c => {
            const active = cat === c
            return (
              <button key={c} type="button" onClick={() => setCat(c)} className="bl-chip" style={{ padding: '8px 16px', borderRadius: 999, fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', border: `1.5px solid ${active ? CORAL : cardBorder}`, background: active ? CORAL : 'transparent', color: active ? '#fff' : muted }}>{c}</button>
            )
          })}
        </div>
      </section>

      {/* POST GRID */}
      <section style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 24px 80px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 22 }}>
          {shown.map((p, i) => (
            <Reveal key={p.slug} delay={(i % 3) * 0.05}>
              <a href={`/blog/${p.slug}`} className="bl-card" style={{ display: 'block', height: '100%', overflow: 'hidden', borderRadius: 20, background: cardBg, border: `1px solid ${cardBorder}`, textDecoration: 'none' }}>
                <Cover post={p} />
                <div style={{ padding: '20px 22px 22px' }}>
                  <h3 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.25, margin: '0 0 8px', color: text }}>{p.title}</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.55, color: muted, margin: '0 0 14px' }}>{p.excerpt}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: muted, fontWeight: 600 }}>
                    <time dateTime={p.date}>{p.dateLabel}</time><span aria-hidden>·</span><span>{p.readTime}</span>
                  </div>
                </div>
              </a>
            </Reveal>
          ))}
        </div>
        {shown.length === 0 && <p style={{ textAlign: 'center', color: muted, padding: '40px 0' }}>No posts in this category yet.</p>}
      </section>

      {/* CTA */}
      <section style={{ padding: 'clamp(48px, 8vw, 90px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${CORAL}, ${PINK} 60%, ${PURPLE})` }}>
        <Reveal>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(28px, 5vw, 50px)', fontWeight: 900, letterSpacing: '-0.03em', color: '#fff', margin: '0 0 12px' }}>Put these ideas to work</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 28px' }}>Bring every customer conversation into one place — start free, no card.</p>
            <a href="/signup" style={{ display: 'inline-flex', padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, border: 'none', cursor: 'pointer', textDecoration: 'none', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Start free</a>
          </div>
        </Reveal>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
