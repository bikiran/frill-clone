'use client'

import Link from 'next/link'

interface ProGateProps {
  feature: string
  plan: 'free' | 'pro' | 'enterprise'
  children: React.ReactNode
  inline?: boolean
}

const FEATURE_LABELS: Record<string, string> = {
  boostAnnouncements: 'Boost Announcements',
  whiteListing: 'White Labeling',
  apiAccess: 'API Access',
  customDomain: 'Custom Domain',
  advancedAnalytics: 'Advanced Analytics',
  webhooks: 'Webhooks',
  segments: 'Advanced Segments',
  removesBranding: 'Remove Branding',
}

export default function ProGate({ feature, plan, children, inline }: ProGateProps) {
  const isPro = plan === 'pro' || plan === 'enterprise'
  if (isPro) return <>{children}</>

  if (inline) {
    return (
      <div className="relative">
        <div className="opacity-40 pointer-events-none select-none">{children}</div>
        <div className="absolute inset-0 flex items-center justify-center rounded-xl" style={{ background: 'rgba(255,255,255,0.85)' }}>
          <Link href="/admin/upgrade" className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold text-white cursor-pointer hover:opacity-90"
            style={{ background: 'var(--coral)' }}>
            🔒 Pro feature — Upgrade
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border-2 border-dashed p-6 text-center" style={{ borderColor: 'var(--border)' }}>
      <div className="text-3xl mb-2">⭐</div>
      <p className="font-bold mb-1" style={{ color: 'var(--ink)' }}>{FEATURE_LABELS[feature] || feature}</p>
      <p className="text-sm mb-4" style={{ color: 'var(--slate)' }}>This feature is available on the Pro plan</p>
      <Link href="/admin/upgrade"
        className="inline-block px-5 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer hover:opacity-90"
        style={{ background: 'var(--coral)' }}>
        Upgrade to Pro →
      </Link>
    </div>
  )
}
