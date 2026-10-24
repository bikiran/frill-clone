'use client'

import { Faq, SectionHead, Reveal } from '@/components/marketing/Kit'
import { seoFaqs } from '@/lib/seo-faqs'

// The "Questions" block on a marketing landing page (lib/seo-faqs.ts). The
// page's server component publishes the same questions as FAQPage data.
// Renders nothing for a page without questions.
export default function SeoFaqSection({ path, accent, dark, title = 'Good questions.' }: { path: string; accent: string; dark: boolean; title?: string }) {
  const faqs = seoFaqs(path)
  if (!faqs.length) return null
  const text = dark ? '#f4f5fb' : '#0f1119'
  const muted = dark ? 'rgba(244,245,251,0.62)' : 'rgba(15,17,25,0.6)'
  const cardBg = dark ? 'rgba(255,255,255,0.045)' : '#ffffff'
  const cardBorder = dark ? 'rgba(255,255,255,0.09)' : 'rgba(15,17,25,0.09)'
  return (
    <section style={{ maxWidth: 820, margin: '0 auto', padding: '40px 24px 70px', color: text }}>
      <Reveal><SectionHead eyebrow="Questions" accent={accent} muted={muted} title={title} /></Reveal>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {faqs.map(f => <Faq key={f.q} q={f.q} a={f.a} accent={accent} text={text} muted={muted} cardBg={cardBg} cardBorder={cardBorder} />)}
      </div>
    </section>
  )
}
