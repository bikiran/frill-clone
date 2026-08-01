'use client'

import Link from 'next/link'
import { useEntitlements } from '@/lib/entitlements-client'

interface ProGateProps {
  feature: string
  // Optional now: the gate resolves the company's EFFECTIVE entitlements
  // (plan + super-admin overrides). `plan` is only a fallback used before the
  // async resolve completes, so pro users don't briefly see the locked state.
  plan?: 'free' | 'trial' | 'pro' | 'enterprise'
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

export default function ProGate({ feature, plan = 'free', children, inline }: ProGateProps) {
  const ent = useEntitlements()
  // Once entitlements have resolved, a per-company override wins: force-on
  // unlocks the feature even on a lower plan, force-off locks it even on Pro.
  // For features without an override entry, fall back to the plan's default
  // (Pro/Enterprise). Before the resolve completes, use the `plan` prop so the
  // UI doesn't flash the locked state at a Pro user.
  const allowed = ent.ready
    ? (feature in ent.features ? ent.hasFeature(feature) : (ent.plan === 'pro' || ent.plan === 'enterprise'))
    : (plan === 'pro' || plan === 'enterprise')
  if (allowed) return <>{children}</>

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
