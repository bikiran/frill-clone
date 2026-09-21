'use client'

import { useState } from 'react'
import FeatureIcon from '@/components/FeatureIcon'
import type { Article } from '@/lib/blog-store'

const CORAL = '#ff6a4d'

// Cover image with a graceful fallback: if the image is missing or fails to
// load, show the accent-gradient tile instead of a broken image.
function Cover({ a, big = false }: { a: Article; big?: boolean }) {
  const [failed, setFailed] = useState(false)
  if (a.cover && !failed) {
    return <img src={a.cover} alt="" aria-hidden onError={() => setFailed(true)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
  }
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(150deg, ${a.accent} 0%, ${a.accent}cc 48%, #171a2b 125%)` }}>
      <div style={{ position: 'absolute', top: -40, right: -30, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', filter: 'blur(46px)' }} />
      <div style={{ position: 'absolute', right: 24, bottom: 20, color: 'rgba(255,255,255,0.92)' }}><FeatureIcon name={a.icon} color="rgba(255,255,255,0.92)" size={big ? 64 : 40} /></div>
    </div>
  )
}

function Share({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false)
  const enc = encodeURIComponent
  const links = [
    { name: 'X', href: `https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(title)}`, d: 'M18.9 1.2h3.7l-8 9.1L24 22.8h-7.4l-5.8-7.6-6.6 7.6H.5l8.6-9.8L0 1.2h7.6l5.2 6.9zM17.6 20.6h2L6.5 3.3H4.3z' },
    { name: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`, d: 'M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z' },
    { name: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`, d: 'M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z' },
  ]
  const btn: React.CSSProperties = { width: 32, height: 32, borderRadius: 8, border: '1px solid var(--blog-border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blog-muted)' }
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {links.map(l => (
        <a key={l.name} href={l.href} target="_blank" rel="noopener" aria-label={`Share on ${l.name}`} title={`Share on ${l.name}`} style={btn}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d={l.d} /></svg>
        </a>
      ))}
      <button type="button" onClick={() => { try { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {} }} aria-label="Copy link" title="Copy link" style={{ ...btn, cursor: 'pointer', background: 'transparent' }}>
        {copied
          ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>}
      </button>
    </div>
  )
}

function SideCard({ a }: { a: Article }) {
  return (
    <a href={`/blog/${a.slug}`} style={{ display: 'flex', gap: 12, textDecoration: 'none', color: 'inherit', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: 72, height: 56, flexShrink: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--blog-border)' }}><Cover a={a} /></div>
      <div>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: a.accent }}>{a.category}</span>
        <h4 style={{ margin: '3px 0 0', fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{a.title}</h4>
      </div>
    </a>
  )
}

export default function BlogArticleView({ article, related, recent, url }: { article: Article; related: Article[]; recent: Article[]; url: string }) {
  const a = article
  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', padding: '104px 24px 0' }}>
      {/* Header — full width */}
      <nav style={{ fontSize: 13, color: 'var(--blog-muted)', marginBottom: 16 }}>
        <a href="/blog" style={{ color: 'inherit', textDecoration: 'none' }}>Blog</a>
        <span style={{ margin: '0 8px' }}>/</span>
        <span style={{ color: a.accent, fontWeight: 700 }}>{a.category}</span>
      </nav>
      <div style={{ maxWidth: 820 }}>
        <h1 style={{ fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.08, margin: '0 0 16px' }}>{a.title}</h1>
        <p style={{ fontSize: 19, color: 'var(--blog-muted)', lineHeight: 1.5, margin: '0 0 22px' }}>{a.excerpt}</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: 'var(--blog-muted)' }}>
          {a.authorAvatar
            ? <img src={a.authorAvatar} alt={a.author} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
            : <span style={{ width: 40, height: 40, borderRadius: '50%', background: a.accent, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15 }}>{(a.author || 'C')[0]}</span>}
          <div>
            <div style={{ fontWeight: 700, color: 'var(--blog-text)' }}>{a.author}</div>
            <div><time dateTime={a.date}>{a.dateLabel}</time> · {a.readTime}</div>
          </div>
        </div>
        <Share url={url} title={a.title} />
      </div>

      {/* Full-width cover */}
      <div style={{ position: 'relative', height: 'clamp(240px, 46vw, 460px)', borderRadius: 22, overflow: 'hidden', border: '1px solid var(--blog-border)', marginBottom: 40 }}><Cover a={a} big /></div>

      {/* Body + sidebar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 48, alignItems: 'start' }} className="blog-body-grid">
        <div>
          <div className="blog-prose" dangerouslySetInnerHTML={{ __html: a.bodyHtml }} />

          {a.takeaways.length > 0 && (
            <div style={{ marginTop: 34, padding: '22px 24px', borderRadius: 16, background: 'var(--blog-surface)', border: `1px solid var(--blog-border)` }}>
              <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: a.accent }}>Key takeaways</p>
              <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
                {a.takeaways.map((t, i) => <li key={i} style={{ fontSize: 15.5, lineHeight: 1.5 }}>{t}</li>)}
              </ul>
            </div>
          )}

          <div style={{ marginTop: 40, padding: '30px 28px', borderRadius: 20, textAlign: 'center', background: `linear-gradient(135deg, ${CORAL} 0%, #ff4d8d 100%)`, color: '#fff' }}>
            <h3 style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 6px' }}>Bring every conversation into one inbox</h3>
            <p style={{ fontSize: 15, margin: '0 0 18px', opacity: 0.95 }}>Messages, calls, reviews and feedback — all in Colvy. Start free.</p>
            <a href="/signup" style={{ display: 'inline-flex', padding: '13px 28px', borderRadius: 999, background: '#fff', color: CORAL, fontWeight: 800, textDecoration: 'none' }}>Get started free</a>
          </div>
        </div>

        {/* Sidebar */}
        <aside style={{ position: 'sticky', top: 90, display: 'grid', gap: 22, alignSelf: 'start' }} className="blog-sidebar">
          <div style={{ padding: '20px 20px', borderRadius: 16, background: 'var(--blog-surface)', border: '1px solid var(--blog-border)' }}>
            <p style={{ margin: '0 0 6px', fontSize: 15.5, fontWeight: 800 }}>Try Colvy free</p>
            <p style={{ margin: '0 0 14px', fontSize: 13.5, color: 'var(--blog-muted)', lineHeight: 1.5 }}>One inbox for every channel, a lightweight CRM and feedback boards.</p>
            <a href="/signup" style={{ display: 'inline-flex', padding: '10px 18px', borderRadius: 999, background: CORAL, color: '#fff', fontWeight: 800, fontSize: 13.5, textDecoration: 'none' }}>Get started</a>
          </div>
          {recent.length > 0 && (
            <div>
              <p style={{ margin: '0 0 14px', fontSize: 12.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--blog-muted)', borderLeft: `3px solid ${CORAL}`, paddingLeft: 10 }}>Latest articles</p>
              <div style={{ display: 'grid', gap: 16 }}>
                {recent.map(r => <SideCard key={r.slug} a={r} />)}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Keep reading */}
      {related.length > 0 && (
        <section style={{ margin: '64px 0 0' }}>
          <h2 style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 20px' }}>Keep reading</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24, paddingBottom: 90 }}>
            {related.map(r => (
              <a key={r.slug} href={`/blog/${r.slug}`} style={{ display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'inherit', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--blog-border)', background: 'var(--blog-surface)' }}>
                <div style={{ position: 'relative', height: 160 }}><Cover a={r} /></div>
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
        @media (max-width: 900px){ .blog-body-grid{ grid-template-columns: 1fr !important; } .blog-sidebar{ position: static !important; } }
        .blog-prose { font-size: 18px; line-height: 1.78; color: var(--blog-text); }
        .blog-prose > p:first-of-type::first-letter { float: left; font-size: 3.4em; line-height: 0.78; font-weight: 900; padding: 6px 10px 0 0; color: ${CORAL}; }
        .blog-prose h2 { font-size: 27px; font-weight: 800; letter-spacing: -0.02em; margin: 40px 0 12px; line-height: 1.22; }
        .blog-prose h3 { font-size: 20px; font-weight: 800; margin: 28px 0 10px; }
        .blog-prose p { margin: 0 0 18px; }
        .blog-prose ul, .blog-prose ol { margin: 0 0 18px; padding-left: 24px; }
        .blog-prose li { margin: 0 0 8px; }
        .blog-prose a { color: ${CORAL}; text-decoration: underline; text-underline-offset: 2px; }
        .blog-prose strong { font-weight: 800; }
        .blog-prose blockquote { margin: 26px 0; padding: 6px 0 6px 22px; border-left: 4px solid ${CORAL}; font-size: 22px; font-weight: 700; font-style: italic; line-height: 1.4; }
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
