'use client'

import { useParams } from 'next/navigation'
import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import FeatureIcon from '@/components/FeatureIcon'
import { getPost, relatedPosts } from '@/lib/blog'

// Individual blog article. Data-driven from lib/blog.ts: a gradient banner keyed
// to the post's accent, the article body (intro, sections, key takeaways), a
// "keep reading" strip and a CTA. Same look as the rest of the marketing site.

const CORAL = '#ff6a4d', PINK = '#ff4d8d', PURPLE = '#7c5cff', INK = '#0f1119'

function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => { const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold }); if (ref.current) o.observe(ref.current); return () => o.disconnect() }, [threshold])
  return { ref, v }
}
function Reveal({ children, delay = 0, y = 22 }: { children: ReactNode; delay?: number; y?: number }) {
  const { ref, v } = useReveal()
  return <div ref={ref} style={{ opacity: v ? 1 : 0, transform: v ? 'none' : `translateY(${y}px)`, transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s` }}>{children}</div>
}

export default function BlogPostPage() {
  const params = useParams()
  const slug = (params?.slug as string) || ''
  const post = getPost(slug)
  const related = relatedPosts(slug, 3)
  const [dark, setDark] = useState(false)
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

  if (!post) {
    return (
      <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh' }}>
        <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '180px 24px 120px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 10px' }}>Post not found</h1>
          <p style={{ color: muted, margin: '0 0 24px' }}>That article may have moved. Head back to the blog to find it.</p>
          <a href="/blog" style={{ display: 'inline-flex', padding: '13px 26px', borderRadius: 999, background: CORAL, color: '#fff', fontWeight: 800, textDecoration: 'none' }}>← Back to the blog</a>
        </div>
        <MarketingFooter dark={dark} />
      </div>
    )
  }

  const accent = post.accent

  return (
    <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        .bp-card{ transition:transform .24s cubic-bezier(0.16,1,0.3,1), box-shadow .24s cubic-bezier(0.16,1,0.3,1); }
        .bp-card:hover{ transform:translateY(-5px); box-shadow:0 18px 40px rgba(15,17,25,0.12); }
        .bp-body p{ font-size:17px; line-height:1.75; color:${muted}; margin:0 0 18px; }
        .bp-body p.bp-intro{ font-size:19px; line-height:1.7; color:${text}; font-weight:500; margin:0 0 22px; }
        @media (prefers-reduced-motion:reduce){ .bp-card{ transition:none !important } }
      `}</style>

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* ARTICLE HEADER */}
      <article>
        <header style={{ maxWidth: 760, margin: '0 auto', padding: '140px 24px 8px' }}>
          <Reveal>
            <a href="/blog" style={{ display: 'inline-block', fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: accent, background: accent + '16', padding: '6px 14px', borderRadius: 999, textDecoration: 'none', marginBottom: 18 }}>← Blog</a>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: accent, marginBottom: 12 }}>{post.category}</span>
            <h1 style={{ fontSize: 'clamp(30px, 4.6vw, 52px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.08, margin: '0 0 18px' }}>{post.title}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: muted, fontWeight: 600 }}>
              <span>{post.author}</span><span aria-hidden>·</span><time dateTime={post.date}>{post.dateLabel}</time><span aria-hidden>·</span><span>{post.readTime}</span>
            </div>
          </Reveal>
        </header>

        {/* BANNER */}
        <div style={{ maxWidth: 900, margin: '24px auto 0', padding: '0 24px' }}>
          <Reveal delay={0.05}>
            <div aria-hidden style={{ position: 'relative', overflow: 'hidden', borderRadius: 24, minHeight: 220, background: `linear-gradient(150deg, ${accent} 0%, ${accent}cc 46%, #171a2b 125%)`, boxShadow: `0 24px 60px ${accent}3d` }}>
              <div style={{ position: 'absolute', top: -40, right: -30, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', filter: 'blur(36px)' }} />
              <div style={{ position: 'absolute', bottom: -50, left: -30, width: 180, height: 180, borderRadius: '50%', background: 'rgba(0,0,0,0.22)', filter: 'blur(40px)' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.95)' }}><FeatureIcon name={post.icon} color="rgba(255,255,255,0.95)" size={72} /></div>
            </div>
          </Reveal>
        </div>

        {/* BODY */}
        <div className="bp-body" style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 10px' }}>
          <Reveal>
            <p className="bp-intro">{post.intro}</p>
          </Reveal>
          {post.sections.map((s, i) => (
            <Reveal key={s.h} delay={0.02}>
              <h2 style={{ fontSize: 'clamp(21px, 2.6vw, 27px)', fontWeight: 800, letterSpacing: '-0.02em', color: text, margin: '30px 0 12px' }}>{s.h}</h2>
              {s.p.map((para, j) => <p key={j}>{para}</p>)}
            </Reveal>
          ))}

          {/* KEY TAKEAWAYS */}
          <Reveal>
            <div style={{ borderRadius: 20, padding: 26, background: accent + '0f', border: `1px solid ${accent}2e`, margin: '18px 0 8px' }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: accent, margin: '0 0 14px' }}>Key takeaways</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 11 }}>
                {post.takeaways.map(t => (
                  <li key={t} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, fontSize: 15.5, fontWeight: 600, color: text, lineHeight: 1.5 }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: accent + '22', color: accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>{t}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </article>

      {/* KEEP READING */}
      {related.length > 0 && (
        <section style={{ maxWidth: 1120, margin: '0 auto', padding: '40px 24px 20px' }}>
          <Reveal><h2 style={{ fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 22px' }}>Keep reading</h2></Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
            {related.map((p, i) => (
              <Reveal key={p.slug} delay={(i % 3) * 0.05}>
                <a href={`/blog/${p.slug}`} className="bp-card" style={{ display: 'block', height: '100%', overflow: 'hidden', borderRadius: 18, background: cardBg, border: `1px solid ${cardBorder}`, textDecoration: 'none' }}>
                  <div aria-hidden style={{ position: 'relative', overflow: 'hidden', minHeight: 120, background: `linear-gradient(150deg, ${p.accent} 0%, ${p.accent}cc 50%, #171a2b 130%)` }}>
                    <div style={{ position: 'absolute', top: 12, left: 12, fontSize: 11.5, fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 999, padding: '4px 10px' }}>{p.category}</div>
                    <div style={{ position: 'absolute', right: 12, bottom: 10, color: 'rgba(255,255,255,0.9)' }}><FeatureIcon name={p.icon} color="rgba(255,255,255,0.9)" size={30} /></div>
                  </div>
                  <div style={{ padding: '16px 18px 18px' }}>
                    <h3 style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.28, margin: '0 0 6px', color: text }}>{p.title}</h3>
                    <div style={{ fontSize: 12.5, color: muted, fontWeight: 600 }}>{p.readTime}</div>
                  </div>
                </a>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section style={{ padding: 'clamp(48px, 8vw, 88px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${CORAL}, ${PINK} 60%, ${PURPLE})`, marginTop: 40 }}>
        <Reveal>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(26px, 4.6vw, 46px)', fontWeight: 900, letterSpacing: '-0.03em', color: '#fff', margin: '0 0 12px' }}>One place for every conversation</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 26px' }}>Try Colvy free — no card, live the same afternoon.</p>
            <a href="/signup" style={{ display: 'inline-flex', padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, textDecoration: 'none', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Start free</a>
          </div>
        </Reveal>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
