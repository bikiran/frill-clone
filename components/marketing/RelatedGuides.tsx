'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { SectionHead, Reveal } from '@/components/marketing/Kit'

// "Guides" on a marketing page: up to three blog articles that link to it (or
// were picked for it), so readers and search engines can move from a feature
// to the guides that show it in use, and back. The page's server component
// works the list out (lib/guides-for.ts, which reads every article) and hands
// it down through GuidesProvider, so no article text reaches the browser.

export type GuideCard = { slug: string; title: string; cover: string; category: string; readTime: string }

const Guides = createContext<GuideCard[]>([])

export function GuidesProvider({ guides, children }: { guides: GuideCard[]; children: ReactNode }) {
  return <Guides.Provider value={guides}>{children}</Guides.Provider>
}

export default function RelatedGuides({ accent, dark, eyebrow = 'Guides', title = 'See it in action.', sub = 'Practical guides that show this working in a real day.' }: { accent: string; dark: boolean; eyebrow?: string; title?: string; sub?: string }) {
  const guides = useContext(Guides)
  if (!guides.length) return null
  const text = dark ? '#f4f5fb' : '#0f1119'
  const muted = dark ? 'rgba(244,245,251,0.62)' : 'rgba(15,17,25,0.6)'
  return (
    <section aria-label="Guides" style={{ maxWidth: 1120, margin: '0 auto', padding: '40px 24px 20px', color: text }}>
      <style>{`
        .rg-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
        .rg-card{display:flex;flex-direction:column;height:100%;text-decoration:none;color:inherit;border-radius:22px;overflow:hidden;background:${dark ? 'rgba(255,255,255,0.045)' : '#fff'};box-shadow:0 0 0 1px ${dark ? 'rgba(255,255,255,0.09)' : 'rgba(15,17,25,0.08)'},0 18px 40px -30px rgba(15,17,25,${dark ? '0.7' : '0.35'});transition:transform .25s ease,box-shadow .25s ease}
        .rg-card:hover{transform:translateY(-3px);box-shadow:0 0 0 1px ${dark ? 'rgba(255,255,255,0.14)' : 'rgba(15,17,25,0.12)'},0 24px 48px -30px rgba(15,17,25,${dark ? '0.8' : '0.45'})}
        .rg-img{aspect-ratio:16/10;width:100%;object-fit:cover;display:block;background:${dark ? '#1b1d26' : '#f1f2f5'}}
        .rg-body{padding:16px 18px 20px;display:flex;flex-direction:column;gap:8px;flex:1}
        .rg-cat{font-size:11.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
        .rg-title{font-size:17px;font-weight:800;line-height:1.3;letter-spacing:-.01em}
        .rg-meta{margin-top:auto;font-size:13px}
        @media (max-width:900px){.rg-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media (max-width:600px){.rg-grid{grid-template-columns:minmax(0,1fr)}}
        @media (prefers-reduced-motion:reduce){.rg-card{transition:none}.rg-card:hover{transform:none}}
      `}</style>
      <Reveal><SectionHead eyebrow={eyebrow} accent={accent} muted={muted} title={title} sub={sub} /></Reveal>
      <div className="rg-grid">
        {guides.map((g, i) => (
          <Reveal key={g.slug} delay={i * 0.05}>
            <a href={`/blog/${g.slug}`} className="rg-card">
              <img className="rg-img" src={g.cover} alt="" loading="lazy" decoding="async" />
              <span className="rg-body">
                <span className="rg-cat" style={{ color: accent }}>{g.category}</span>
                <span className="rg-title">{g.title}</span>
                <span className="rg-meta" style={{ color: muted }}>{g.readTime} →</span>
              </span>
            </a>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
