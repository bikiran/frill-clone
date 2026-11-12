'use client'

// The card a locked Inbox-plan feature shows on its settings page or screen
// (lib/plan-gate): what it is, that it's on the Inbox and Everything plans,
// and a way to Billing. `compact` is the one-line version for inside a card,
// e.g. in place of the inbox composer.

import Link from 'next/link'
import { GATED, type GatedFeature } from '@/lib/plan-gate'

const Lock = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="10.5" width="16" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></svg>
)

export default function PlanLockCard({ feature, title, body, compact = false }: { feature: GatedFeature; title?: string; body?: string; compact?: boolean }) {
  const copy = GATED[feature]
  const text = body || copy.locked.replace(/ Upgrade in Billing.*$/, '')
  if (compact) {
    return (
      <div className="plk plk-c" role="note">
        <span className="plk-ic"><Lock size={15} /></span>
        <span className="plk-t">{text}</span>
        <Link href="/admin/billing#plans" className="plk-go">Upgrade</Link>
        <style>{CSS}</style>
      </div>
    )
  }
  return (
    <section className="plk" role="note">
      <span className="plk-ic big"><Lock /></span>
      <div className="plk-b">
        <h3>{title || `${copy.name} is on the Inbox plan`}</h3>
        <p>{text}</p>
      </div>
      <Link href="/admin/billing#plans" className="plk-go">See plans</Link>
      <style>{CSS}</style>
    </section>
  )
}

const CSS = `
.plk{display:flex;align-items:center;gap:14px;padding:18px 20px;border-radius:22px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04);margin:0 0 14px}
.plk-ic{flex-shrink:0;width:34px;height:34px;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,#2b59ff 12%,transparent);color:#2b59ff}
.plk-ic.big{width:44px;height:44px;border-radius:14px}
.plk-b{flex:1;min-width:0}
.plk h3{margin:0;font-size:16px;font-weight:700;letter-spacing:-.01em;color:var(--ink)}
.plk p{margin:3px 0 0;font-size:13.5px;line-height:1.5;color:var(--slate,#6b7280)}
.plk-t{flex:1;min-width:0;font-size:13.5px;line-height:1.45;color:var(--ink)}
.plk-go{flex-shrink:0;height:38px;padding:0 18px;border-radius:999px;display:inline-flex;align-items:center;font-size:13.5px;font-weight:700;text-decoration:none;color:#fff;background:linear-gradient(180deg,#5b8cff,#2b59ff);box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 10px 22px -12px #2b59ff;white-space:nowrap}
.plk-go:hover{filter:brightness(1.05)}
.plk-c{padding:10px 10px 10px 12px;border-radius:18px;margin:0}
@media (max-width:560px){.plk{flex-wrap:wrap}.plk-go{margin-left:auto}}
[data-theme="dark"] .plk{background:rgba(255,255,255,.04);box-shadow:0 0 0 1px rgba(255,255,255,.08)}
[data-theme="dark"] .plk-ic{background:rgba(91,140,255,.16);color:#93b4ff}
`
