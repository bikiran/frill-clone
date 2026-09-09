'use client'

// Shared marketing footer — big and bold (ManyChat-style): tall dark band, many
// link columns (two-up even on mobile, never one long list), a giant Colvy
// wordmark in a grid, social links and a legal bar. Always dark for a strong
// anchor regardless of the page theme.
export default function MarketingFooter({ dark = false }: { dark?: boolean }) {
  void dark
  const CORAL = '#ff6a4d'
  const text = '#ffffff'
  const muted = 'rgba(255,255,255,0.6)'
  const dim = 'rgba(255,255,255,0.34)'
  const line = 'rgba(255,255,255,0.1)'

  const COLS = [
    { title: 'Platform', links: [{ l: 'Inbox & CRM', h: '/inbox-crm' }, { l: 'Media Gallery', h: '/inbox-crm#gallery' }, { l: 'WooCommerce', h: '/inbox-crm#woo' }, { l: 'Payments', h: '/inbox-crm#woo' }, { l: 'Link Reports', h: '/inbox-crm#links' }, { l: 'Insights', h: '/inbox-crm#insights' }] },
    { title: 'Product', links: [{ l: 'Ideas', h: '/features/ideas' }, { l: 'Roadmap', h: '/features/roadmap' }, { l: 'Announcements', h: '/features/announcements' }, { l: 'Knowledgebase', h: '/features/knowledgebase' }, { l: 'Import', h: '/features/import' }] },
    { title: 'Company', links: [{ l: 'Pricing', h: '/pricing' }, { l: 'Sign up', h: '/signup' }, { l: 'Sign in', h: '/signin' }, { l: 'Get started free', h: '/signup' }] },
    { title: 'Channels', links: [{ l: 'WhatsApp', h: '/inbox-crm' }, { l: 'Instagram', h: '/inbox-crm' }, { l: 'Messenger', h: '/inbox-crm' }, { l: 'Email & SMS', h: '/inbox-crm' }, { l: 'Live chat', h: '/inbox-crm' }] },
    { title: 'Legal', links: [{ l: 'Privacy', h: '/privacy' }, { l: 'Terms', h: '/terms' }] },
  ]

  const social: { name: string; h: string; d: string }[] = [
    { name: 'X', h: '#', d: 'M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.4l-5.8-7.58-6.63 7.58H.49l8.6-9.83L0 1.15h7.59l5.24 6.93 6.07-6.93Zm-1.29 19.5h2.04L6.48 3.24H4.29L17.61 20.65Z' },
    { name: 'Instagram', h: '#', d: 'M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16Zm0 3.68A6.16 6.16 0 1 0 18.16 12 6.16 6.16 0 0 0 12 5.84Zm0 10.16A4 4 0 1 1 16 12a4 4 0 0 1-4 4Zm6.4-10.4a1.44 1.44 0 1 0 1.44 1.44 1.44 1.44 0 0 0-1.44-1.44Z' },
    { name: 'YouTube', h: '#', d: 'M23.5 6.2a3 3 0 0 0-2.11-2.12C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.39.53A3 3 0 0 0 .5 6.2 31.2 31.2 0 0 0 0 12a31.2 31.2 0 0 0 .5 5.8 3 3 0 0 0 2.11 2.12c1.89.53 9.39.53 9.39.53s7.5 0 9.39-.53a3 3 0 0 0 2.11-2.12A31.2 31.2 0 0 0 24 12a31.2 31.2 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.24 3.6Z' },
    { name: 'LinkedIn', h: '#', d: 'M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14Zm1.78 13.02H3.55V9h3.57v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z' },
  ]

  const bg = '#0b0c14'
  return (
    <footer style={{ background: bg, color: text, padding: '0' }}>
      <style>{`
        .cvf-wrap{ max-width:1280px; margin:0 auto; padding:72px 24px 28px; }
        .cvf-top{ display:grid; grid-template-columns:1.15fr 1fr; gap:48px; align-items:start; }
        .cvf-cols{ display:grid; grid-template-columns:repeat(4,1fr); gap:28px 24px; }
        .cvf-brandbox{ position:relative; border:1px solid ${line}; border-radius:16px; min-height:220px; overflow:hidden; display:flex; align-items:center; justify-content:center; background:
          linear-gradient(${line} 1px,transparent 1px),linear-gradient(90deg,${line} 1px,transparent 1px); background-size:25% 33.33%; }
        .cvf-word{ font-weight:900; letter-spacing:-0.04em; font-size:clamp(48px,7vw,104px); line-height:1; }
        @media (max-width:820px){
          .cvf-top{ grid-template-columns:1fr; gap:36px; }
          .cvf-cols{ grid-template-columns:repeat(2,1fr); }   /* side by side on mobile, never one long list */
          .cvf-brandbox{ min-height:150px; order:-1; }
        }
      `}</style>
      <div className="cvf-wrap">
        <div className="cvf-top">
          {/* Left: brand blurb + link columns */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, background: CORAL, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 19 }}>C</span>
              <span style={{ fontWeight: 900, fontSize: 22, letterSpacing: '-0.02em' }}>Colvy</span>
            </div>
            <p style={{ fontSize: 14.5, color: muted, lineHeight: 1.6, maxWidth: 340, margin: '0 0 30px' }}>One place to talk to customers across every channel — and sell more.</p>
            <div className="cvf-cols">
              {COLS.map(col => (
                <div key={col.title}>
                  <h4 style={{ fontSize: 12, fontWeight: 800, color: dim, margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{col.title}</h4>
                  {col.links.map(lk => (
                    <a key={lk.l} href={lk.h} className="cvf-link" style={{ display: 'block', fontSize: 14.5, color: muted, textDecoration: 'none', marginBottom: 11, transition: 'color 0.2s' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#fff')} onMouseLeave={e => (e.currentTarget.style.color = muted)}>{lk.l}</a>
                  ))}
                </div>
              ))}
            </div>
          </div>
          {/* Right: giant wordmark in a grid box */}
          <div className="cvf-brandbox">
            <span className="cvf-word">Colvy<span style={{ color: CORAL }}>.</span></span>
          </div>
        </div>

        {/* Social + big CTA line */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', margin: '44px 0 24px', paddingTop: 28, borderTop: `1px solid ${line}` }}>
          <div style={{ display: 'flex', gap: 10 }}>
            {social.map(s => (
              <a key={s.name} href={s.h} aria-label={s.name} style={{ width: 40, height: 40, borderRadius: 11, border: `1px solid ${line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: muted, transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)' }} onMouseLeave={e => { e.currentTarget.style.color = muted; e.currentTarget.style.borderColor = line }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d={s.d} /></svg>
              </a>
            ))}
          </div>
          <a href="/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 999, background: CORAL, color: '#fff', fontSize: 15, fontWeight: 800, textDecoration: 'none' }}>
            Get started free
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
          </a>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <p style={{ fontSize: 13, color: dim, margin: 0 }}>© 2026 Colvy, Inc. All rights reserved.</p>
          <p style={{ fontSize: 13, color: dim, margin: 0 }}>Built with ♥ for growing businesses</p>
        </div>
      </div>
    </footer>
  )
}
