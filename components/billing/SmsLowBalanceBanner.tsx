'use client'

// "SMS balance A$4.20, enough for about 28 texts. Top up" — shown when a
// workspace's prepaid SMS credit is low (below its auto top-up point, else
// A$10). Used by Billing → SMS credits, and meant for the campaign editor too:
//
//   <SmsLowBalanceBanner companyId={company.id} />            fetches the balance
//   <SmsLowBalanceBanner balanceCents={420} pricePerPart={0.15} />  given values
//
// Renders nothing while loading, before the wallet exists (V395 not run), when
// the balance is fine, or on any error.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { authFetch } from '@/lib/auth-fetch'
import { lowBalanceInfo } from '@/lib/sms-credits-core'
import { DEFAULT_PRICING } from '@/lib/sms-pricing'

const WarnIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
)

export default function SmsLowBalanceBanner(props: {
  companyId?: string | null
  balanceCents?: number
  pricePerPart?: number
  /** Show below this balance (cents). Default: the auto top-up point, else A$10. */
  thresholdCents?: number
  /** Auto top-up is on, so the line says it will top up by itself. */
  autoTopUp?: boolean
  topUpHref?: string
  /** Click handler instead of a link (Billing scrolls to its own top-up buttons). */
  onTopUp?: () => void
  /** Show even when the balance isn't low (screenshots, previews). */
  force?: boolean
  /** false: Colvy manages top-ups for this account, so the link says to contact Colvy. */
  canTopUp?: boolean
}) {
  const given = typeof props.balanceCents === 'number'
  const [fetched, setFetched] = useState<{ balanceCents: number; pricePerPart: number; low: boolean; autoTopUp: boolean; canTopUp: boolean } | null>(null)

  useEffect(() => {
    if (given || !props.companyId) return
    let live = true
    authFetch(`/api/sms-credits?companyId=${encodeURIComponent(props.companyId)}&summary=1`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (live && d?.ready) setFetched({ balanceCents: d.balanceCents, pricePerPart: d.pricePerPart, low: !!d.low, autoTopUp: !!d.autoTopUp, canTopUp: d.canTopUp !== false }) })
      .catch(() => {})
    return () => { live = false }
  }, [given, props.companyId])

  const balanceCents = given ? (props.balanceCents as number) : fetched?.balanceCents
  if (balanceCents == null) return null
  const pricing = { ...DEFAULT_PRICING, price_per_part: props.pricePerPart ?? fetched?.pricePerPart ?? DEFAULT_PRICING.price_per_part }
  const info = lowBalanceInfo(balanceCents, pricing, props.thresholdCents)
  const low = given ? info.low : !!fetched?.low
  if (!low && !props.force) return null
  const auto = props.autoTopUp ?? fetched?.autoTopUp
  const empty = balanceCents <= 0
  const canTopUp = props.canTopUp ?? fetched?.canTopUp ?? true

  const linkStyle: React.CSSProperties = { color: 'var(--coral)', fontWeight: 700, whiteSpace: 'nowrap', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 'inherit' }
  return (
    <div role="status" className="flex items-start gap-3 p-3.5 rounded-xl text-sm" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
      <span className="shrink-0 mt-px" style={{ color: '#d97706' }}><WarnIcon /></span>
      <p style={{ margin: 0, lineHeight: 1.5, minWidth: 0 }}>
        <span style={{ color: '#78350f', fontWeight: 600 }}>{info.message}</span>{' '}
        {auto
          ? 'Auto top-up will add more when it drops below your set point.'
          : empty
            ? 'Texts beyond your monthly allowance won’t send until you top up.'
            : 'Texts beyond your monthly allowance stop when it runs out.'}{' '}
        {!canTopUp
          ? <span>Contact Colvy to add credit.</span>
          : props.onTopUp
          ? <button type="button" onClick={props.onTopUp} style={linkStyle}>Top up</button>
          : <Link href={props.topUpHref || '/admin/billing#sms-credits'} style={linkStyle}>Top up</Link>}
      </p>
    </div>
  )
}
