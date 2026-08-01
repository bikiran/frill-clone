'use client'

// Shared marketing footer used across the landing pages so they stay identical.
export default function MarketingFooter({ dark = false }: { dark?: boolean }) {
  const text = dark ? '#f0f0f0' : '#0d0d0d'
  const textMuted = dark ? 'rgba(240,240,240,0.55)' : 'rgba(13,13,13,0.55)'
  const textDim = dark ? 'rgba(240,240,240,0.3)' : 'rgba(13,13,13,0.35)'
  const cardBorder = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'

  const COLS = [
    { title: 'Platform', links: [{ l: 'Inbox & CRM', h: '/inbox-crm' }, { l: 'Media Gallery', h: '/inbox-crm#gallery' }, { l: 'WooCommerce', h: '/inbox-crm#woo' }, { l: 'Link Reports', h: '/inbox-crm#links' }, { l: 'Insights', h: '/inbox-crm#insights' }] },
    { title: 'Product', links: [{ l: 'Ideas', h: '/features/ideas' }, { l: 'Roadmap', h: '/features/roadmap' }, { l: 'Announcements', h: '/features/announcements' }, { l: 'Knowledgebase', h: '/features/knowledgebase' }] },
    { title: 'Company', links: [{ l: 'Pricing', h: '/pricing' }, { l: 'Sign up', h: '/signup' }, { l: 'Sign in', h: '/signin' }] },
    { title: 'Legal', links: [{ l: 'Privacy', h: '/privacy' }, { l: 'Terms', h: '/terms' }] },
  ]

  return (
    <footer style={{ padding: '48px 24px 32px', borderTop: `1px solid ${cardBorder}` }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 32, marginBottom: 48 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#ff7a6b', marginBottom: 12 }}>Colvy</div>
            <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.6 }}>One place to talk to customers and sell more.</p>
          </div>
          {COLS.map(col => (
            <div key={col.title}>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: text, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{col.title}</h4>
              {col.links.map(lk => (
                <a key={lk.l} href={lk.h} style={{ display: 'block', fontSize: 14, color: textMuted, textDecoration: 'none', marginBottom: 8 }}>{lk.l}</a>
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 24, borderTop: `1px solid ${cardBorder}`, flexWrap: 'wrap', gap: 12 }}>
          <p style={{ fontSize: 13, color: textDim }}>© 2026 Colvy. All rights reserved.</p>
          <p style={{ fontSize: 13, color: textDim }}>Built with ♥ for growing businesses</p>
        </div>
      </div>
    </footer>
  )
}
