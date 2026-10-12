'use client'

import React from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

// Settings tabs, grouped so related ones sit together. (The team Calendar used
// to be a tab here too; it's an everyday tool, so /crm-settings/calendar now
// forwards to /admin/calendar in the sidebar.)
const NAV_GROUPS: { title: string; items: { slug: string; label: string }[] }[] = [
  { title: 'General', items: [
    { slug: 'business', label: 'Business' },
    { slug: 'profile', label: 'Your Settings' },
  ]},
  { title: 'Inbox & channels', items: [
    { slug: 'channels', label: 'Channels' },
    { slug: 'chat-widget', label: 'Chat Widget' },
    { slug: 'contact-form', label: 'Contact Form' },
    { slug: 'auto-replies', label: 'Automatic Replies' },
    { slug: 'power-ups', label: 'Time Savers' },
    { slug: 'conversation-actions', label: 'Conversation Actions' },
    { slug: 'custom-fields', label: 'Custom Fields' },
    { slug: 'archived-spam', label: 'Archived & Spam' },
  ]},
  { title: 'AI', items: [
    { slug: 'ai', label: 'AI Settings' },
    { slug: 'ai-knowledge', label: 'AI Knowledge' },
  ]},
  { title: 'Sales & orders', items: [
    { slug: 'payments', label: 'Payments' },
    { slug: 'order-automation', label: 'Order Automation' },
    { slug: 'campaigns', label: 'Campaigns' },
    { slug: 'policies', label: 'Policies' },
  ]},
  { title: 'Data', items: [
    { slug: 'imports', label: 'Imports' },
    { slug: 'csv-processor', label: 'CSV Processor' },
  ]},
]
const NAV = NAV_GROUPS.flatMap(g => g.items)

export default function CrmSettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // Match a whole path segment, so /ai doesn't also light up for /ai-knowledge.
  const isAt = (slug: string) => new RegExp(`/crm-settings/${slug}(/|$|[?#])`).test(pathname || '')
  const current = NAV.find(n => isAt(n.slug)) || NAV[0]

  // Channel detail pages live under /crm-settings/channels/<slug>. Show them as a
  // third breadcrumb level with a "Back to channels" link, so people don't lose
  // the settings navigation when they drill into a channel.
  const CHANNEL_LABELS: Record<string, string> = {
    email: 'Email', telnyx: 'SMS & Calls', calls: 'SMS & Calls', 'google-reviews': 'Google Reviews',
    instagram: 'Instagram', facebook: 'Messenger', whatsapp: 'WhatsApp',
    meta: 'Facebook & Instagram', 'web-form': 'Web Form', realestate: 'RealEstate',
    'chat-widget': 'Chat Widget',
  }
  const channelMatch = pathname?.match(/\/crm-settings\/channels\/([^/?#]+)/)
  const channelSlug = channelMatch?.[1] || null
  const channelLabel = channelSlug ? (CHANNEL_LABELS[channelSlug] || channelSlug) : null

  return (
    <div style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      {/* Breadcrumb + back */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderBottom: '1px solid var(--border)', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--slate)' }}>
          <Link href="/admin/crm-settings/business" style={{ color: 'var(--slate)', textDecoration: 'none' }}>Business Settings</Link>
          <span>/</span>
          {channelLabel ? (
            <>
              <Link href="/admin/crm-settings/channels" style={{ color: 'var(--slate)', textDecoration: 'none' }}>Channels</Link>
              <span>/</span>
              <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{channelLabel}</span>
            </>
          ) : (
            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{current.label}</span>
          )}
        </div>

        {channelLabel ? (
          <Link href="/admin/crm-settings/channels" style={{ fontSize: 13, color: 'var(--coral)', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            Back to channels
          </Link>
        ) : (
          <Link href="/admin/inbox" style={{ fontSize: 13, color: 'var(--coral)', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            Back to Inbox
          </Link>
        )}
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
            .crm-settings-nav .crm-settings-group-title { display: none !important; }
            .crm-settings-content { padding: 20px 16px !important; }
          }
        `}</style>
        {/* Settings sidebar */}
        <div className="crm-settings-nav" style={{ width: 230, flexShrink: 0, borderRight: '1px solid var(--border)', background: '#fafafa', padding: '12px 8px', overflowY: 'auto' }}>
          {NAV_GROUPS.map((g, gi) => (
            <React.Fragment key={g.title}>
              <p className="crm-settings-group-title" style={{ margin: gi === 0 ? '2px 14px 6px' : '14px 14px 6px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--slate)' }}>
                {g.title}
              </p>
              {g.items.map(n => {
                const active = isAt(n.slug)
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
            </React.Fragment>
          ))}
        </div>

        {/* Page content */}
        <div className="crm-settings-content" style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', minWidth: 0 }}>
          {children}
        </div>
      </div>
    </div>
  )
}
