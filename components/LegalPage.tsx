'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { COLVY_CONTACT } from '@/lib/colvy-contact'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'

// The Privacy Policy and Terms of Service: the site's own header and footer
// (MarketingNav / MarketingFooter, so the legal pages read as part of
// colvy.com), a title block with a switch between the two documents, an "On
// this page" list built from the headings (sticky beside the text on a
// computer, folded away on a phone), and a contact card at the end.
//
// The sections come from legal_pages (edited in Admin → Legal). `children`
// render after them whatever the database holds (and while it loads), for
// text that must always be on the page.

const CORAL = '#ff6a4d'
const DOCS = [
  { slug: 'privacy', label: 'Privacy Policy', href: '/privacy' },
  { slug: 'terms', label: 'Terms of Service', href: '/terms' },
] as const

const slugify = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

export default function LegalPage({ slug, children }: { slug: 'privacy' | 'terms'; children?: React.ReactNode }) {
  const [page, setPage] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [dark, setDark] = useState(false)
  const [toc, setToc] = useState<{ id: string; label: string }[]>([])
  const [active, setActive] = useState('')
  const [tocOpen, setTocOpen] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const { data } = await (supabase as any)
          .from('legal_pages').select('*')
          .eq('slug', slug).is('company_id', null).maybeSingle()
        setPage(data)
      } catch {} finally { setLoading(false) }
    })()
  }, [slug])

  const title = page?.title || (slug === 'privacy' ? 'Privacy Policy' : 'Terms of Service')
  const sections: any[] = page?.sections || []

  // The contents list: every heading in the document, including the ones the
  // page adds itself (children), each given an anchor.
  useEffect(() => {
    const root = bodyRef.current
    if (!root) return
    const heads = Array.from(root.querySelectorAll('h2')) as HTMLElement[]
    const used = new Set<string>()
    const items = heads.map(h => {
      const host = h.closest('section') as HTMLElement | null
      let id = host?.id || h.id || slugify(h.textContent || '')
      while (used.has(id)) id += '-2'
      used.add(id)
      if (host && !host.id) host.id = id
      else if (!host) h.id = id
      return { id, label: (h.textContent || '').trim() }
    }).filter(i => i.label)
    setToc(items)
    if (!items.length) return
    const io = new IntersectionObserver(entries => {
      const vis = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (vis[0]) setActive((vis[0].target as HTMLElement).id)
    }, { rootMargin: '-90px 0px -65% 0px' })
    items.forEach(i => { const el = document.getElementById(i.id); if (el) io.observe(el) })
    return () => io.disconnect()
  }, [loading, sections.length])

  const updated = page?.updated_at ? new Date(page.updated_at).toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' }) : ''

  return (
    <div className={`lg${dark ? ' lg-dk' : ''}`}>
      <style>{`
        .lg{ --bg:#fff; --ink:#0f1119; --text:#374151; --muted:#6b7280; --line:rgba(15,17,25,.09); --soft:#f6f6f8;
          min-height:100vh; background:var(--bg); color:var(--ink); font-family:inherit; overflow-x:clip; }
        .lg-dk{ --bg:#0a0b12; --ink:#f4f5fb; --text:rgba(244,245,251,.78); --muted:rgba(244,245,251,.55); --line:rgba(255,255,255,.09); --soft:rgba(255,255,255,.045); }
        .lg-hero{ position:relative; max-width:1120px; margin:0 auto; padding:clamp(104px,13vw,150px) 20px 28px; }
        .lg-glow{ position:absolute; top:40px; left:-120px; width:420px; height:320px; border-radius:50%; background:${CORAL}; opacity:.09; filter:blur(90px); pointer-events:none; }
        .lg-dk .lg-glow{ opacity:.14; }
        .lg-eyebrow{ display:inline-flex; align-items:center; gap:8px; padding:6px 13px; border-radius:999px; background:${CORAL}17; color:${CORAL}; font-size:12.5px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; }
        .lg-h1{ position:relative; margin:16px 0 10px; font-size:clamp(38px,5.6vw,64px); font-weight:900; letter-spacing:-.035em; line-height:1.04; }
        .lg-meta{ position:relative; margin:0; font-size:15px; color:var(--muted); }
        .lg-docs{ position:relative; display:inline-flex; gap:4px; margin-top:24px; padding:4px; border-radius:999px; background:var(--soft); border:1px solid var(--line); }
        .lg-docs a{ padding:9px 16px; border-radius:999px; font-size:14px; font-weight:700; color:var(--muted); text-decoration:none; transition:background .15s, color .15s; }
        .lg-docs a:hover{ color:var(--ink); }
        .lg-docs a.on{ background:var(--bg); color:var(--ink); box-shadow:0 1px 2px rgba(0,0,0,.06), 0 4px 14px -6px rgba(0,0,0,.18); }
        .lg-grid{ max-width:1120px; margin:0 auto; padding:18px 20px clamp(40px,7vw,90px); display:grid; grid-template-columns:240px minmax(0,1fr); gap:clamp(28px,5vw,72px); align-items:start; }
        .lg-toc{ position:sticky; top:96px; }
        .lg-toc h3{ margin:0 0 10px; font-size:12px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
        .lg-toc ol{ list-style:none; margin:0; padding:0; display:grid; gap:2px; border-left:1px solid var(--line); }
        .lg-toc a{ display:block; margin-left:-1px; padding:7px 0 7px 14px; border-left:2px solid transparent; font-size:13.5px; line-height:1.35; color:var(--muted); text-decoration:none; transition:color .15s, border-color .15s; }
        .lg-toc a:hover{ color:var(--ink); }
        .lg-toc a.on{ color:var(--ink); font-weight:700; border-left-color:${CORAL}; }
        .lg-toc-btn{ display:none; }
        .lg-body{ max-width:720px; min-width:0; }
        .lg-body section{ scroll-margin-top:96px; padding:26px 0; border-top:1px solid var(--line); margin:0 !important; }
        .lg-body section:first-child{ border-top:0; padding-top:4px; }
        .lg-body h2{ margin:0 0 12px !important; font-size:clamp(21px,2.2vw,25px) !important; font-weight:800 !important; letter-spacing:-.02em; line-height:1.25; color:var(--ink) !important; }
        .lg-body p, .lg-body li{ font-size:16px !important; line-height:1.75 !important; color:var(--text) !important; }
        .lg-body p{ margin:0 0 12px !important; }
        .lg-body a{ color:${CORAL}; text-decoration:underline; text-underline-offset:3px; }
        .lg-body b, .lg-body strong{ color:var(--ink); }
        .lg-empty{ color:var(--muted); font-size:15.5px; }
        .lg-skel{ height:14px; border-radius:7px; background:var(--soft); margin:12px 0; animation:lgPulse 1.2s ease-in-out infinite; }
        @keyframes lgPulse{ 50%{ opacity:.55; } }
        .lg-contact{ margin-top:34px; padding:24px; border-radius:22px; background:var(--soft); border:1px solid var(--line); display:flex; align-items:center; gap:18px; flex-wrap:wrap; }
        .lg-contact h3{ margin:0 0 4px; font-size:18px; font-weight:800; letter-spacing:-.01em; }
        .lg-contact p{ margin:0 !important; font-size:14.5px !important; color:var(--muted) !important; line-height:1.5 !important; }
        .lg-contact-acts{ display:flex; gap:10px; flex-wrap:wrap; margin-left:auto; }
        .lg-pill{ display:inline-flex; align-items:center; gap:8px; height:44px; padding:0 18px; border-radius:999px; font-size:14.5px; font-weight:800; text-decoration:none !important; white-space:nowrap; }
        .lg-pill.go{ background:${CORAL}; color:#fff !important; }
        .lg-pill.ghost{ background:var(--bg); color:var(--ink) !important; border:1px solid var(--line); }
        .lg-body .lg-legal{ margin:18px 0 0 !important; font-size:13px !important; line-height:1.5 !important; color:var(--muted) !important; }
        @media (max-width:900px){
          .lg-grid{ grid-template-columns:minmax(0,1fr); gap:18px; }
          .lg-toc{ position:static; border:1px solid var(--line); border-radius:18px; background:var(--soft); padding:0 8px; overflow:hidden; }
          .lg-toc h3{ display:none; }
          /* The site-wide button hover tint (globals.css button::before) sticks
             after a tap on phones and painted a grey block here: not on this one. */
          .lg-toc .lg-toc-btn{ display:flex; width:100%; align-items:center; justify-content:space-between; padding:14px 8px; border:0; border-radius:12px; background:transparent; font:inherit; font-size:14.5px; font-weight:700; color:var(--ink); cursor:pointer; -webkit-tap-highlight-color:transparent; }
          .lg-toc .lg-toc-btn::before{ display:none !important; }
          .lg-toc-btn svg{ transition:transform .2s; color:var(--muted); }
          .lg-toc.open .lg-toc-btn svg{ transform:rotate(180deg); }
          /* A plain list on phones (the desktop rail line and its indent go). */
          .lg-toc ol{ display:none; gap:2px; border-left:0; padding:6px 0 10px; border-top:1px solid var(--line); }
          .lg-toc.open ol{ display:grid; }
          .lg-toc a{ margin:0; padding:10px 8px; border-left:0; border-radius:10px; font-size:14.5px; -webkit-tap-highlight-color:transparent; }
          .lg-toc a.on{ background:var(--bg); box-shadow:0 1px 2px rgba(0,0,0,.05); }
          .lg-contact-acts{ margin-left:0; width:100%; }
          .lg-contact-acts .lg-pill{ flex:1 1 0; justify-content:center; }
        }
        @media (prefers-reduced-motion:reduce){ .lg-skel{ animation:none; } }
      `}</style>

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      <header className="lg-hero">
        <span aria-hidden className="lg-glow" />
        <span className="lg-eyebrow">Legal</span>
        <h1 className="lg-h1">{title}</h1>
        <p className="lg-meta">{updated ? <>Last updated {updated}</> : 'Wallets Way Pty Ltd, trading as Colvy'}</p>
        <nav className="lg-docs" aria-label="Legal documents">
          {DOCS.map(d => <Link key={d.slug} href={d.href} className={d.slug === slug ? 'on' : ''} aria-current={d.slug === slug ? 'page' : undefined}>{d.label}</Link>)}
        </nav>
      </header>

      <div className="lg-grid">
        <aside className={`lg-toc${tocOpen ? ' open' : ''}`} aria-label="On this page">
          <button type="button" className="lg-toc-btn" aria-expanded={tocOpen} onClick={() => setTocOpen(v => !v)}>
            On this page
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="6 9 12 15 18 9" /></svg>
          </button>
          <h3>On this page</h3>
          <ol>
            {toc.map(i => (
              <li key={i.id}><a href={`#${i.id}`} className={active === i.id ? 'on' : ''} onClick={() => setTocOpen(false)}>{i.label}</a></li>
            ))}
          </ol>
        </aside>

        <article className="lg-body" ref={bodyRef}>
          {loading ? (
            <div aria-label="Loading">{[90, 100, 96, 70, 100, 84].map((w, i) => <div key={i} className="lg-skel" style={{ width: `${w}%` }} />)}</div>
          ) : sections.length === 0 ? (
            <p className="lg-empty">This page hasn’t been written yet.</p>
          ) : (
            sections.map((s, i) => (
              <section key={i} id={s.heading ? slugify(s.heading) : undefined}>
                {s.heading && <h2>{s.heading}</h2>}
                {(s.body || '').split('\n').filter(Boolean).map((para: string, j: number) => <p key={j}>{para}</p>)}
              </section>
            ))
          )}
          {children}

          <div className="lg-contact">
            <div>
              <h3>Questions about this page?</h3>
              <p>Talk to a real person at Colvy, in Australia.</p>
            </div>
            <div className="lg-contact-acts">
              <a className="lg-pill go" href={COLVY_CONTACT.telHref}>Call {COLVY_CONTACT.phoneDisplay}</a>
              <a className="lg-pill ghost" href={COLVY_CONTACT.mailHref}>Email us</a>
            </div>
          </div>
          <p className="lg-legal">© {new Date().getFullYear()} Wallets Way Pty Ltd (ACN 666 674 602, ABN 54 666 674 602) trading as Colvy.</p>
        </article>
      </div>

      {/* The contact card above does the Let's talk job here. */}
      <MarketingFooter dark={dark} talk={false} />
    </div>
  )
}
