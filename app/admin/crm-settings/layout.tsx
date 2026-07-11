'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

const NAV = [
  { slug: 'profile', label: 'Your Settings' },
  { slug: 'business', label: 'Business' },
  { slug: 'channels', label: 'Channels' },
  { slug: 'conversation-actions', label: 'Conversation Actions' },
  { slug: 'order-automation', label: 'Order Automation' },
  { slug: 'custom-fields', label: 'Custom Fields' },
  { slug: 'power-ups', label: 'Time Savers' },
  { slug: 'ai', label: 'AI' },
  { slug: 'contact-form', label: 'Contact Form' },
  { slug: 'chat-widget', label: 'Chat Widget' },
  { slug: 'archived-spam', label: 'Archived & Spam' },
  { slug: 'imports', label: 'Imports' },
  { slug: 'payments', label: 'Payments' },
  { slug: 'campaigns', label: 'Campaigns' },
  { slug: 'csv-processor', label: 'CSV Processor' },
  { slug: 'policies', label: 'Policies' },
]

export default function CrmSettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const current = NAV.find(n => pathname?.includes(`/crm-settings/${n.slug}`)) || NAV[0]

  return (
    <div style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      {/* Breadcrumb + back */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderBottom: '1px solid var(--border)', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--slate)' }}>
          <Link href="/admin/crm-settings/profile" style={{ color: 'var(--slate)', textDecoration: 'none' }}>Settings</Link>
          <span>/</span>
          <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{current.label}</span>
        </div>
        <Link href="/admin/inbox" style={{ fontSize: 13, color: 'var(--coral)', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Back to Inbox
        </Link>
      </div>

      <div className="crm-settings-body" style={{ display: 'flex', minHeight: 'calc(100vh - 108px)' }}>
        <style>{`
          @media (max-width: 767px) {
            .crm-settings-body { flex-direction: column !important; }
            .crm-settings-nav {
              width: 100% !important; flex-shrink: 0 !important;
              border-right: none !important; border-bottom: 1px solid var(--border) !important;
              display: flex !important; flex-direction: row !important; overflow-x: auto !important;
              white-space: nowrap !important; padding: 8px !important; gap: 6px !important;
            }
            .crm-settings-nav a { display: inline-block !important; margin-bottom: 0 !important; flex-shrink: 0 !important; }
          }
        `}</style>
        {/* Settings sidebar */}
        <div className="crm-settings-nav" style={{ width: 230, flexShrink: 0, borderRight: '1px solid var(--border)', background: '#fafafa', padding: '12px 8px', overflowY: 'auto' }}>
          {NAV.map(n => {
            const active = pathname?.includes(`/crm-settings/${n.slug}`)
            return (
              <Link key={n.slug} href={`/admin/crm-settings/${n.slug}`}
                style={{
                  display: 'block', padding: '9px 14px', borderRadius: 8, fontSize: 13.5, marginBottom: 2,
                  textDecoration: 'none', fontWeight: active ? 600 : 500,
                  background: active ? 'var(--peach)' : 'transparent',
                  color: active ? 'var(--coral)' : 'var(--ink)',
                }}>
                {n.label}
              </Link>
            )
          })}
        </div>

        {/* Page content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', minWidth: 0 }}>
          {children}
        </div>
      </div>
    </div>
  )
}
