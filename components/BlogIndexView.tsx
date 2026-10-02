'use client'

import { useMemo, useState } from 'react'
import FeatureIcon from '@/components/FeatureIcon'
import type { Article } from '@/lib/blog-store'

// Foxiz-style magazine index: a large featured story, category filter chips, and
// a responsive card grid. Cards show a real cover image when present, otherwise
// an accent-gradient tile with the post's icon.

function Cover({ a, tall = false }: { a: Article; tall?: boolean }) {
  const [failed, setFailed] = useState(false)
  if (a.cover && !failed) {
    return <img src={a.cover} alt="" aria-hidden onError={() => setFailed(true)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
  }
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(150deg, ${a.accent} 0%, ${a.accent}cc 48%, #171a2b 125%)` }}>
      <div style={{ position: 'absolute', top: -30, right: -24, width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', filter: 'blur(30px)' }} />
      <div style={{ position: 'absolute', right: 18, bottom: 16, color: 'rgba(255,255,255,0.92)' }}>
        <FeatureIcon name={a.icon} color="rgba(255,255,255,0.92)" size={tall ? 56 : 40} />
      </div>
    </div>
  )
}

const Chip = ({ label, accent }: { label: string; accent: string }) => (
  <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: accent }}>{label}</span>
)

function Meta({ a }: { a: Article }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--blog-muted)' }}>
      <span>{a.author}</span><span>·</span><time dateTime={a.date}>{a.dateLabel}</time><span>·</span><span>{a.readTime}</span>
    </div>
  )
}

export default function BlogIndexView({ articles }: { articles: Article[] }) {
  const [cat, setCat] = useState('All')
  const cats = useMemo(() => ['All', ...Array.from(new Set(articles.map(a => a.category)))], [articles])
  const filtered = cat === 'All' ? articles : articles.filter(a => a.category === cat)
  const [featured, ...rest] = filtered

  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: '110px 24px 96px' }}>
      <header style={{ marginBottom: 30 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ff6a4d' }}>The Colvy Blog</p>
        <h1 style={{ fontSize: 'clamp(34px, 5vw, 52px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '6px 0 0' }}>Playbooks for customer communication</h1>
        <p style={{ fontSize: 17, color: 'var(--blog-muted)', margin: '12px 0 0', maxWidth: 640, lineHeight: 1.6 }}>Practical, honest advice on running support, sales and feedback for a growing business — from the team building Colvy.</p>
      </header>

      {/* Category filter */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 34 }}>
        {cats.map(c => (
          <button key={c} type="button" onClick={() => setCat(c)}
            style={{ padding: '7px 15px', borderRadius: 999, border: `1px solid ${c === cat ? 'transparent' : 'var(--blog-border)'}`, background: c === cat ? '#ff6a4d' : 'transparent', color: c === cat ? '#fff' : 'var(--blog-text)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {c}
          </button>
        ))}
      </div>

      {/* Featured */}
      {featured && (
        <a href={`/blog/${featured.slug}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,1fr)', gap: 28, textDecoration: 'none', color: 'inherit', marginBottom: 46, alignItems: 'stretch' }} className="blog-featured">
          <div style={{ position: 'relative', minHeight: 320, borderRadius: 20, overflow: 'hidden', border: '1px solid var(--blog-border)' }}><Cover a={featured} tall /></div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Chip label={featured.category} accent={featured.accent} />
            <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '10px 0 12px', lineHeight: 1.15 }}>{featured.title}</h2>
            <p style={{ fontSize: 16, color: 'var(--blog-muted)', lineHeight: 1.6, margin: '0 0 16px' }}>{featured.excerpt}</p>
            <Meta a={featured} />
          </div>
        </a>
      )}

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 26 }}>
        {rest.map(a => (
          <a key={a.slug} href={`/blog/${a.slug}`} style={{ display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'inherit', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--blog-border)', background: 'var(--blog-surface)' }}>
            <div style={{ position: 'relative', height: 180 }}><Cover a={a} /></div>
            <div style={{ padding: '16px 18px 20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
              <Chip label={a.category} accent={a.accent} />
              <h3 style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em', margin: '8px 0 8px', lineHeight: 1.25 }}>{a.title}</h3>
              <p style={{ fontSize: 14.5, color: 'var(--blog-muted)', lineHeight: 1.55, margin: '0 0 14px', flex: 1 }}>{a.excerpt}</p>
              <Meta a={a} />
            </div>
          </a>
        ))}
      </div>

      <style>{`@media (max-width: 780px){ .blog-featured{ grid-template-columns: 1fr !important; } }`}</style>
    </main>
  )
}
