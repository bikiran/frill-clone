'use client'

import React from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import SettingsShell from '@/components/settings/SettingsShell'

// Business Settings (/admin/crm-settings/*) sit inside the Settings area,
// whose menu lists them with every other setting (components/settings).
// A channel's own page (/crm-settings/channels/<slug>) gets a "‹ Channels"
// link above it, back to the list of channels.
const CHANNEL_LABELS: Record<string, string> = {
  email: 'Email', telnyx: 'SMS & Calls', calls: 'SMS & Calls', 'google-reviews': 'Google Reviews',
  instagram: 'Instagram', facebook: 'Messenger', whatsapp: 'WhatsApp',
  meta: 'Facebook & Instagram', 'web-form': 'Web Form', realestate: 'RealEstate',
  'chat-widget': 'Chat Widget', 'sending-domain': 'Email sending domain',
}

export default function CrmSettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const channelSlug = pathname?.match(/\/crm-settings\/channels\/([^/?#]+)/)?.[1] || null
  const channelLabel = channelSlug ? (CHANNEL_LABELS[channelSlug] || channelSlug) : null

  return (
    <SettingsShell>
      <div className="crm-settings-content" style={{ padding: '36px 44px 48px', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
        {/* Pages are as wide as their two-column sections need. */}
        <style>{`.crm-settings-content > div { max-width: 1040px !important; } @media (max-width: 860px) { .crm-settings-content { padding: 20px 16px 32px !important; } }`}</style>
        {channelLabel && (
          <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '-12px 0 18px', fontSize: 13.5, color: '#8e8e93' }}>
            <Link href="/admin/crm-settings/channels" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--coral)', fontWeight: 600, textDecoration: 'none' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="15 18 9 12 15 6" /></svg>
              Channels
            </Link>
            <span aria-hidden>/</span>
            <span style={{ color: '#111', fontWeight: 600 }}>{channelLabel}</span>
          </nav>
        )}
        {children}
      </div>
    </SettingsShell>
  )
}
