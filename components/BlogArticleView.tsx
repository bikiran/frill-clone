'use client'

import FeatureIcon from '@/components/FeatureIcon'
import type { Article } from '@/lib/blog-store'

const CORAL = '#ff6a4d'

function Cover({ a }: { a: Article }) {
  if (a.cover) return <img src={a.cover} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(150deg, ${a.accent} 0%, ${a.accent}cc 48%, #171a2b 125%)` }}>
      <div style={{ position: 'absolute', top: -40, right: -30, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', filter: 'blur(46px)' }} />
      <div style={{ position: 'absolute', right: 28, bottom: 24, color: 'rgba(255,255,255,0.92)' }}><FeatureIcon name={a.icon} color="rgba(255,255,255,0.92)" size={72} /></div>
    </div>
  )
}

export default function BlogArticleView({ article, related }: { article: Article; related: Article[] }) {
  const a = article
  return (
    <main style={{ paddingBottom: 90 }}>
      <article style={{ maxWidth: 760, margin: '0 auto', padding: '104px 20px 0' }}>
        <nav style={{ fontSize: 13, color: 'var(--blog-muted)', marginBottom: 18 }}>
          <a href="/blog" style={{ color: 'inherit', textDecoration: 'none' }}>Blog</a>
          <span style={{ margin: '0 8px' }}>/</span>
          <span style={{ color: a.accent, fontWeight: 700 }}>{a.category}</span>
        </nav>

        <h1 style={{ fontSize: 'clamp(30px, 4.4vw, 46px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.1, margin: '0 0 16px' }}>{a.title}</h1>
        <p style={{ fontSize: 18.5, color: 'var(--blog-muted)', lineHeight: 1.55, margin: '0 0 22px' }}>{a.excerpt}</p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: 'var(--blog-muted)', marginBottom: 28 }}>
          {a.authorAvatar
            ? <img src={a.authorAvatar} alt={a.author} style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} />
            : <span style={{ width: 34, height: 34, borderRadius: '50%', background: a.accent, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>{(a.author || 'C')[0]}</span>}
          <div>
            <div style={{ fontWeight: 700, color: 'var(--blog-text)' }}>{a.author}</div>
            <div><time dateTime={a.date}>{a.dateLabel}</time> · {a.readTime}</div>
          </div>
        </div>

        <div style={{ position: 'relative', height: 'clamp(220px, 42vw, 400px)', borderRadius: 22, overflow: 'hidden', border: '1px solid var(--blog-border)', marginBottom: 36 }}><Cover a={a} /></div>

        <div className="blog-prose" dangerouslySetInnerHTML={{ __html: a.bodyHtml }} />

        {a.takeaways.length > 0 && (
          <div style={{ marginTop: 34, padding: '22px 24px', borderRadius: 16, background: 'var(--blog-surface)', border: `1px solid var(--blog-border)` }}>
            <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: a.accent }}>Key takeaways</p>
            <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
              {a.takeaways.map((t, i) => <li key={i} style={{ fontSize: 15.5, lineHeight: 1.5 }}>{t}</li>)}
            </ul>
          </div>
        )}

        {/* CTA */}
        <div style={{ marginTop: 40, padding: '30px 28px', borderRadius: 20, textAlign: 'center', background: `linear-gradient(135deg, ${CORAL} 0%, #ff4d8d 100%)`, color: '#fff' }}>
          <h3 style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 6px' }}>Bring every conversation into one inbox</h3>
          <p style={{ fontSize: 15, margin: '0 0 18px', opacity: 0.95 }}>Messages, calls, reviews and feedback — all in Colvy. Start free.</p>
          <a href="/signup" style={{ display: 'inline-flex', padding: '13px 28px', borderRadius: 999, background: '#fff', color: CORAL, fontWeight: 800, textDecoration: 'none' }}>Get started free</a>
        </div>
      </article>

      {related.length > 0 && (
        <section style={{ maxWidth: 1120, margin: '64px auto 0', padding: '0 20px' }}>
          <h2 style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 20px' }}>Keep reading</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
            {related.map(r => (
              <a key={r.slug} href={`/blog/${r.slug}`} style={{ display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'inherit', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--blog-border)', background: 'var(--blog-surface)' }}>
                <div style={{ position: 'relative', height: 150 }}><Cover a={r} /></div>
                <div style={{ padding: '14px 16px 18px' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: r.accent }}>{r.category}</span>
                  <h3 style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', margin: '7px 0 0', lineHeight: 1.25 }}>{r.title}</h3>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      <style>{`
        .blog-prose { font-size: 17.5px; line-height: 1.75; color: var(--blog-text); }
        .blog-prose h2 { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; margin: 38px 0 12px; line-height: 1.25; }
        .blog-prose h3 { font-size: 20px; font-weight: 800; margin: 28px 0 10px; }
        .blog-prose p { margin: 0 0 18px; }
        .blog-prose ul, .blog-prose ol { margin: 0 0 18px; padding-left: 24px; }
        .blog-prose li { margin: 0 0 8px; }
        .blog-prose a { color: ${CORAL}; text-decoration: underline; text-underline-offset: 2px; }
        .blog-prose strong { font-weight: 800; }
        .blog-prose blockquote { margin: 0 0 18px; padding: 4px 0 4px 18px; border-left: 3px solid ${CORAL}; color: var(--blog-muted); font-style: italic; }
        .blog-prose code { background: var(--blog-surface); border: 1px solid var(--blog-border); border-radius: 6px; padding: 1px 6px; font-size: 0.9em; }
        .blog-prose pre { background: var(--blog-surface); border: 1px solid var(--blog-border); border-radius: 12px; padding: 16px 18px; overflow-x: auto; margin: 0 0 18px; }
        .blog-prose pre code { border: none; background: none; padding: 0; }
        .blog-prose figure { margin: 0 0 22px; }
        .blog-prose figure img { width: 100%; border-radius: 14px; border: 1px solid var(--blog-border); }
        .blog-prose hr { border: none; border-top: 1px solid var(--blog-border); margin: 30px 0; }
      `}</style>
    </main>
  )
}
