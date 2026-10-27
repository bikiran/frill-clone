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
    { slug: 'install', label: 'Install Widget' },
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
  const navRef = React.useRef<HTMLDivElement>(null)
  // On a phone the tabs are a horizontal strip: bring the active one into
  // view (scrolling only the strip, never the page).
  React.useEffect(() => {
    const nav = navRef.current
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return
    const a = active.getBoundingClientRect(), n = nav.getBoundingClientRect()
    const left = nav.scrollLeft + (a.left - n.left) - (nav.clientWidth - a.width) / 2
    nav.scrollTo({ left: Math.max(0, left), behavior: 'auto' })
  }, [pathname])
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
    'chat-widget': 'Chat Widget', 'sending-domain': 'Email sending domain',
  }
  const channelMatch = pathname?.match(/\/crm-settings\/channels\/([^/?#]+)/)
  const channelSlug = channelMatch?.[1] || null
  const channelLabel = channelSlug ? (CHANNEL_LABELS[channelSlug] || channelSlug) : null

  return (
    <div style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      {/* Breadcrumb + back. On a phone the tab strip below already shows
          where you are, so the bar only appears on a channel's own page, as a
          single "‹ Channels / Email" back link. */}
      <div className={`crm-settings-crumbs${channelLabel ? ' is-channel' : ''}`}>
        <div className="crm-settings-trail">
          <Link href="/admin/crm-settings/business" className="crm-settings-root" style={{ color: 'var(--slate)', textDecoration: 'none' }}>Business Settings</Link>
          <span className="crm-settings-root" aria-hidden="true">/</span>
          {channelLabel ? (
            <>
              <Link href="/admin/crm-settings/channels" className="crm-settings-up" style={{ color: 'var(--slate)', textDecoration: 'none' }}>
                <svg className="crm-settings-up-ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
                Channels
              </Link>
              <span aria-hidden="true">/</span>
              <span className="crm-settings-here" style={{ color: 'var(--ink)', fontWeight: 600 }}>{channelLabel}</span>
            </>
          ) : (
            <span className="crm-settings-here" style={{ color: 'var(--ink)', fontWeight: 600 }}>{current.label}</span>
          )}
        </div>

        {channelLabel ? (
          <Link href="/admin/crm-settings/channels" className="crm-settings-back" style={{ fontSize: 13, color: 'var(--coral)', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            Back to channels
          </Link>
        ) : (
          <Link href="/admin/inbox" className="crm-settings-back" style={{ fontSize: 13, color: 'var(--coral)', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            Back to Inbox
          </Link>
        )}
      </div>

      <div className="crm-settings-body" style={{ display: 'flex', minHeight: 'calc(100vh - 108px)' }}>
        <style>{`
          .crm-settings-crumbs { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 24px; border-bottom: 1px solid var(--border); background: #fff; }
          .crm-settings-trail { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 13px; color: var(--slate); }
          .crm-settings-trail > * { white-space: nowrap; }
          .crm-settings-here { overflow: hidden; text-overflow: ellipsis; }
          .crm-settings-up { display: inline-flex; align-items: center; }
          .crm-settings-up-ic { display: none; }
          .crm-settings-back { white-space: nowrap; flex-shrink: 0; }
          @media (max-width: 767px) {
            .crm-settings-crumbs { display: none; }
            .crm-settings-crumbs.is-channel { display: flex; padding: 10px 16px; }
            .crm-settings-crumbs .crm-settings-root, .crm-settings-crumbs .crm-settings-back { display: none !important; }
            .crm-settings-up { color: var(--coral) !important; font-weight: 600; gap: 2px; margin-left: -4px; }
            .crm-settings-up-ic { display: block; }
            .crm-settings-body { flex-direction: column !important; }
            /* The tabs: one clean horizontal scroller, no scrollbar, edge fades. */
            .crm-settings-nav {
              width: 100% !important; flex-shrink: 0 !important;
              border-right: none !important; border-bottom: 1px solid var(--border) !important;
              display: flex !important; flex-direction: row !important; overflow-x: auto !important; overflow-y: hidden !important;
              white-space: nowrap !important; padding: 8px 12px !important; gap: 4px !important;
              background: #fff !important; scrollbar-width: none; -webkit-overflow-scrolling: touch;
              scroll-padding-inline: 12px; overscroll-behavior-x: contain;
            }
            .crm-settings-nav::-webkit-scrollbar { display: none; }
            .crm-settings-nav a { display: inline-block !important; margin-bottom: 0 !important; flex-shrink: 0 !important; padding: 7px 12px !important; }
            .crm-settings-nav .crm-settings-group-title { display: none !important; }
            .crm-settings-content { padding: 20px 16px !important; }
          }
        `}</style>
        {/* Settings sidebar */}
        <div ref={navRef} className="crm-settings-nav" style={{ width: 230, flexShrink: 0, borderRight: '1px solid var(--border)', background: '#fafafa', padding: '12px 8px', overflowY: 'auto' }}>
          {NAV_GROUPS.map((g, gi) => (
            <React.Fragment key={g.title}>
              <p className="crm-settings-group-title" style={{ margin: gi === 0 ? '2px 14px 6px' : '14px 14px 6px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--slate)' }}>
                {g.title}
              </p>
              {g.items.map(n => {
                const active = isAt(n.slug)
                return (
                  <Link key={n.slug} href={`/admin/crm-settings/${n.slug}`} aria-current={active ? 'page' : undefined}
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
