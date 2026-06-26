'use client'

import { useParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

function useInView() {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => {
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold: 0.1 })
    if (ref.current) o.observe(ref.current)
    return () => o.disconnect()
  }, [])
  return { ref, v }
}

function useParallax(speed = 0.2) {
  const [y, setY] = useState(0)
  useEffect(() => {
    const h = () => setY(window.scrollY * speed)
    window.addEventListener('scroll', h, { passive: true })
    return () => window.removeEventListener('scroll', h)
  }, [speed])
  return y
}

const PAGES: Record<string, any> = {
  ideas: {
    emoji: '💡',
    color: '#ff7a6b',
    gradient: 'linear-gradient(135deg, #ff7a6b 0%, #ff9a8b 50%, #ffd4d0 100%)',
    title: 'Turn feedback into features',
    subtitle: 'Ideas Board',
    hero: 'One beautiful place for all your customer feedback. Collect, prioritize, and act on what matters most.',
    features: [
      { icon: '🗳️', title: 'Public voting', desc: 'Let customers vote on ideas. The most wanted features rise to the top automatically.' },
      { icon: '🏷️', title: 'Topics & tags', desc: 'Organize ideas by category so nothing gets lost in the noise.' },
      { icon: '🔍', title: 'Smart search', desc: 'Find any idea instantly. Full-text search across all submissions.' },
      { icon: '📊', title: 'Priority scoring', desc: 'RICE scoring built in — reach, impact, confidence, effort — calculated automatically.' },
      { icon: '🔔', title: 'Status updates', desc: 'Move ideas through statuses. Users get notified when their idea ships.' },
      { icon: '👤', title: 'Anonymous submission', desc: 'Let users submit without an account. Guest IDs track their votes.' },
    ],
    mockup: [
      { title: 'Dark mode support', votes: 47, status: 'Planned', tag: 'improvement' },
      { title: 'Mobile app for iOS', votes: 38, status: 'In Progress', tag: 'feature' },
      { title: 'CSV data export', votes: 29, status: 'Shipped', tag: 'improvement' },
      { title: 'Slack integration', votes: 24, status: 'Planned', tag: 'integrations' },
    ],
    cta: 'Start collecting feedback',
  },
  roadmap: {
    emoji: '🗺️',
    color: '#6366f1',
    gradient: 'linear-gradient(135deg, #6366f1 0%, #818cf8 50%, #c7d2fe 100%)',
    title: 'Show users what\'s coming',
    subtitle: 'Public Roadmap',
    hero: 'Build trust by being transparent. A beautiful, public roadmap that your customers will actually check.',
    features: [
      { icon: '📋', title: 'Kanban columns', desc: 'Under Review, Planned, In Development, Shipped — drag ideas through your workflow.' },
      { icon: '🎯', title: 'Custom statuses', desc: 'Create your own statuses with custom colors to match your team\'s process.' },
      { icon: '🔗', title: 'Linked to feedback', desc: 'Ideas on your board automatically appear on the roadmap when you update their status.' },
      { icon: '📅', title: 'Timeline view', desc: 'Show delivery dates and milestones in a visual timeline your users will love.' },
      { icon: '🌐', title: 'Embeddable', desc: 'Embed your roadmap on your website or in your app with one line of code.' },
      { icon: '🔒', title: 'Access control', desc: 'Private roadmap for internal use, public for transparency, or gated by SSO.' },
    ],
    mockup: [
      { col: 'Under Review', items: ['API webhooks', 'Dark mode', 'Custom branding'] },
      { col: 'In Development', items: ['Mobile app', 'CSV export'] },
      { col: 'Shipped', items: ['Slack integration', 'Priority scoring'] },
    ],
    cta: 'Build your roadmap',
  },
  announcements: {
    emoji: '📢',
    color: '#10b981',
    gradient: 'linear-gradient(135deg, #10b981 0%, #34d399 50%, #a7f3d0 100%)',
    title: 'Keep users in the loop',
    subtitle: 'Announcements',
    hero: 'A beautiful changelog that celebrates every ship. Tell your story, build loyalty, and reduce support tickets.',
    features: [
      { icon: '✍️', title: 'Rich editor', desc: 'Write beautiful announcements with our markdown editor. Add images, embeds, and formatting.' },
      { icon: '🏷️', title: 'Categorized tags', desc: 'New Feature, Bug Fix, Improvement — color-coded tags so users find what they care about.' },
      { icon: '📬', title: 'Email subscribers', desc: 'Users subscribe to get notified by email when you publish. Built-in newsletter.' },
      { icon: '😍', title: 'Emoji reactions', desc: 'Let users react to updates with emoji. See what lands with your community.' },
      { icon: '📌', title: 'Pin important updates', desc: 'Pin your most important announcements to the top so they never get buried.' },
      { icon: '📊', title: 'View tracking', desc: 'See exactly how many users read each announcement with built-in analytics.' },
    ],
    mockup: [
      { title: 'Dark mode is live! 🌙', tag: 'New Feature', date: 'Jun 19', reactions: '🔥 12', views: 342 },
      { title: 'CSV Export shipped ✅', tag: 'New Feature', date: 'Jun 12', reactions: '👍 8', views: 198 },
      { title: 'Bug fix: voting on mobile', tag: 'Bug Fix', date: 'Jun 8', reactions: '❤️ 5', views: 156 },
    ],
    cta: 'Start your changelog',
  },
  knowledgebase: {
    emoji: '📚',
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 50%, #fde68a 100%)',
    title: 'Answer questions before they\'re asked',
    subtitle: 'Knowledgebase',
    hero: 'A beautiful, searchable help centre that reduces support tickets by 40% on average.',
    features: [
      { icon: '🔍', title: 'Instant search', desc: 'Full-text search across all articles. Users find answers in seconds, not support queues.' },
      { icon: '📂', title: 'Categories', desc: 'Organize articles by category — Getting Started, Features, Billing, Troubleshooting.' },
      { icon: '⭐', title: 'Featured articles', desc: 'Pin your most important articles at the top so new users find them immediately.' },
      { icon: '👍', title: 'Helpfulness rating', desc: 'Users mark articles as helpful. See which docs need improvement.' },
      { icon: '💬', title: 'Live chat integration', desc: 'Can\'t find an answer? Start a live chat or open a support ticket directly from the help centre.' },
      { icon: '🌐', title: 'Custom domain', desc: 'Host your help centre on help.yourcompany.com with full white labeling.' },
    ],
    mockup: [
      { title: 'Getting started', articles: 4, category: '🚀', views: 1420 },
      { title: 'Features', articles: 6, category: '✨', views: 876 },
      { title: 'Integrations', articles: 3, category: '🔗', views: 654 },
      { title: 'Billing', articles: 2, category: '💳', views: 432 },
    ],
    cta: 'Build your help centre',
  },
}

function IdeasMockup({ data, color }: any) {
  return (
    <div className="space-y-2">
      {data.map((i: any, idx: number) => (
        <div key={idx} className="flex items-center gap-3 p-3 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="w-10 h-10 rounded-xl flex flex-col items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ background: color + '25', border: `1px solid ${color}40` }}>
            <span style={{ color }}>▲</span>
            <span style={{ color }}>{i.votes}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: 'rgba(255,255,255,0.85)' }}>{i.title}</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>#{i.tag}</p>
          </div>
          <span className="text-xs px-2 py-1 rounded-full shrink-0 font-medium"
            style={{ background: color + '20', color }}>
            {i.status}
          </span>
        </div>
      ))}
    </div>
  )
}

function RoadmapMockup({ data, color }: any) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {data.map((col: any) => (
        <div key={col.col} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-xs font-bold mb-2" style={{ color }}>{col.col}</p>
          <div className="space-y-1.5">
            {col.items.map((item: string) => (
              <div key={item} className="p-2 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)' }}>{item}</div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function AnnouncementMockup({ data, color }: any) {
  return (
    <div className="space-y-3">
      {data.map((a: any, i: number) => (
        <div key={i} className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: color + '20', color }}>{a.tag}</span>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{a.date}</span>
          </div>
          <p className="text-sm font-semibold mb-2" style={{ color: 'rgba(255,255,255,0.85)' }}>{a.title}</p>
          <div className="flex items-center gap-3 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
            <span>{a.reactions}</span>
            <span>👁 {a.views} views</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function KbMockup({ data, color }: any) {
  return (
    <div className="space-y-2">
      {data.map((cat: any, i: number) => (
        <div key={i} className="flex items-center justify-between p-3 rounded-xl cursor-pointer group"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3">
            <span className="text-xl">{cat.category}</span>
            <div>
              <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.85)' }}>{cat.title}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{cat.articles} articles · {cat.views} views</p>
            </div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: color, opacity: 0.6 }}><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      ))}
    </div>
  )
}

export default function FeaturePage() {
  const params = useParams()
  const feature = (params?.feature as string) || 'ideas'
  const page = PAGES[feature] || PAGES.ideas
  const parallax = useParallax(0.25)
  const { ref: f1, v: v1 } = useInView()
  const { ref: f2, v: v2 } = useInView()
  const { ref: f3, v: v3 } = useInView()

  return (
    <div style={{ background: '#000', color: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif', minHeight: '100vh' }}>
      <style>{`
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        .float { animation: float 5s ease-in-out infinite; }
        .slide-up { animation: slideUp 0.8s cubic-bezier(0.16,1,0.3,1) forwards; }
        .slide-up-1 { animation-delay:.1s; opacity:0; }
        .slide-up-2 { animation-delay:.2s; opacity:0; }
        .slide-up-3 { animation-delay:.3s; opacity:0; }
        .feat-card { transition: all 0.35s cubic-bezier(0.16,1,0.3,1); }
        .feat-card:hover { transform: translateY(-6px); background: rgba(255,255,255,0.07) !important; }
        .feat-card:hover .feat-icon { transform: scale(1.2) rotate(8deg); }
        .feat-icon { display:inline-block; transition: transform 0.4s cubic-bezier(0.34,1.56,0.64,1); }
      `}</style>

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b"
        style={{ background: 'rgba(0,0,0,0.8)', borderColor: 'rgba(255,255,255,0.08)' }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/landing" className="text-xl font-bold" style={{ color: '#ff7a6b' }}>Colvy</Link>
          <div className="hidden md:flex items-center gap-1">
            {[
              { label: 'Ideas', href: '/features/ideas' },
              { label: 'Roadmap', href: '/features/roadmap' },
              { label: 'Announcements', href: '/features/announcements' },
              { label: 'Knowledgebase', href: '/features/knowledgebase' },
              { label: 'Pricing', href: '/pricing' },
            ].map(n => (
              <Link key={n.label} href={n.href}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all hover:bg-white/10"
                style={{ color: n.href.includes(feature) ? '#fff' : 'rgba(255,255,255,0.55)', fontWeight: n.href.includes(feature) ? 600 : 400 }}>
                {n.label}
              </Link>
            ))}
          </div>
          <Link href="/signup"
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105"
            style={{ background: page.color }}>
            Get started free
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden px-6" style={{ paddingTop: 80 }}>
        {/* Orbs */}
        <div className="absolute rounded-full pointer-events-none"
          style={{ width: 700, height: 700, background: `radial-gradient(circle, ${page.color}35 0%, transparent 65%)`, top: '5%', left: '15%', filter: 'blur(60px)', transform: `translateY(${parallax * 0.4}px)` }} />
        <div className="absolute rounded-full pointer-events-none"
          style={{ width: 400, height: 400, background: `radial-gradient(circle, ${page.color}20 0%, transparent 70%)`, bottom: '10%', right: '10%', filter: 'blur(60px)', transform: `translateY(${-parallax * 0.2}px)` }} />

        {/* Grid */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)', backgroundSize: '50px 50px', WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)' }} />

        <div className="relative max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6 slide-up slide-up-1"
                style={{ background: page.color + '20', border: `1px solid ${page.color}40`, color: page.color }}>
                <span className="text-lg">{page.emoji}</span> {page.subtitle}
              </div>
              <h1 className="text-4xl md:text-6xl font-black mb-6 leading-tight slide-up slide-up-1" style={{ letterSpacing: '-0.03em' }}>
                {page.title}
              </h1>
              <p className="text-lg mb-8 leading-relaxed slide-up slide-up-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
                {page.hero}
              </p>
              <div className="flex gap-4 slide-up slide-up-3">
                <Link href="/signup"
                  className="px-6 py-3.5 rounded-2xl text-sm font-bold text-white transition-all hover:scale-105 hover:shadow-2xl"
                  style={{ background: `linear-gradient(135deg, ${page.color}, ${page.color}cc)`, boxShadow: `0 0 30px ${page.color}40` }}>
                  {page.cta} →
                </Link>
                <Link href="/landing"
                  className="px-6 py-3.5 rounded-2xl text-sm font-semibold transition-all hover:bg-white/10"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
                  See all features
                </Link>
              </div>
            </div>

            {/* Right — Mockup */}
            <div className="float">
              <div className="rounded-2xl overflow-hidden shadow-2xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', padding: '1px' }}>
                <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(12,12,12,0.95)' }}>
                  {/* Browser bar */}
                  <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <div className="flex gap-1.5">
                      {['#ff5f57','#ffbd2e','#28ca41'].map(c => <div key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />)}
                    </div>
                    <div className="flex-1 mx-3 px-3 py-1 rounded-md text-xs text-center" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)' }}>
                      yourcompany.colvy.com/{feature === 'knowledgebase' ? 'help' : feature}
                    </div>
                  </div>
                  <div className="p-4">
                    {feature === 'ideas' && <IdeasMockup data={page.mockup} color={page.color} />}
                    {feature === 'roadmap' && <RoadmapMockup data={page.mockup} color={page.color} />}
                    {feature === 'announcements' && <AnnouncementMockup data={page.mockup} color={page.color} />}
                    {feature === 'knowledgebase' && <KbMockup data={page.mockup} color={page.color} />}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES GRID */}
      <section className="py-24 px-6" ref={f1 as any}>
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-black text-center mb-4"
            style={{ opacity: v1 ? 1 : 0, transform: v1 ? 'none' : 'translateY(30px)', transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)' }}>
            Everything you need
          </h2>
          <p className="text-center mb-16 text-lg"
            style={{ color: 'rgba(255,255,255,0.4)', opacity: v1 ? 1 : 0, transition: 'all 0.7s 0.1s' }}>
            No compromises. No cobbling tools together.
          </p>
          <div className="grid md:grid-cols-3 gap-5">
            {page.features.map((f: any, i: number) => (
              <div key={f.title} className="feat-card p-6 rounded-2xl"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  opacity: v1 ? 1 : 0,
                  transform: v1 ? 'none' : 'translateY(40px)',
                  transition: `all 0.7s cubic-bezier(0.16,1,0.3,1) ${0.05 * i}s`,
                }}>
                <div className="feat-icon text-3xl mb-4">{f.icon}</div>
                <h3 className="text-lg font-bold mb-2">{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6" ref={f2 as any}>
        <div className="max-w-2xl mx-auto text-center"
          style={{ opacity: v2 ? 1 : 0, transform: v2 ? 'none' : 'translateY(30px)', transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)' }}>
          <div className="text-5xl mb-6">{page.emoji}</div>
          <h2 className="text-4xl font-black mb-4">Ready to try {page.subtitle}?</h2>
          <p className="mb-8" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Set up in 4 minutes. Free forever for small teams.
          </p>
          <Link href="/signup"
            className="inline-block px-10 py-4 rounded-2xl text-base font-bold text-white transition-all hover:scale-105"
            style={{ background: `linear-gradient(135deg, ${page.color}, ${page.color}cc)`, boxShadow: `0 0 40px ${page.color}40` }}>
            Get started free →
          </Link>
        </div>
      </section>

      {/* Other features nav */}
      <section className="py-16 px-6 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }} ref={f3 as any}>
        <div className="max-w-4xl mx-auto">
          <p className="text-center text-sm mb-8" style={{ color: 'rgba(255,255,255,0.3)' }}>Explore all features</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Ideas Board', href: '/features/ideas', emoji: '💡', color: '#ff7a6b' },
              { label: 'Roadmap', href: '/features/roadmap', emoji: '🗺️', color: '#6366f1' },
              { label: 'Announcements', href: '/features/announcements', emoji: '📢', color: '#10b981' },
              { label: 'Knowledgebase', href: '/features/knowledgebase', emoji: '📚', color: '#f59e0b' },
            ].filter(f => !f.href.includes(feature)).map(f => (
              <Link key={f.label} href={f.href}
                className="feat-card p-4 rounded-2xl text-center"
                style={{
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                  opacity: v3 ? 1 : 0, transform: v3 ? 'none' : 'translateY(20px)',
                  transition: 'all 0.6s cubic-bezier(0.16,1,0.3,1)',
                }}>
                <div className="text-2xl mb-2 feat-icon">{f.emoji}</div>
                <p className="text-sm font-medium" style={{ color: f.color }}>{f.label}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
