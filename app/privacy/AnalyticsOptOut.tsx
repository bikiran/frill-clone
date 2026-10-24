'use client'

import { useEffect, useState } from 'react'
import { setAnalyticsOptedOut } from '@/lib/analytics'
import { analyticsOptedOut } from '@/lib/analytics-privacy'

// "Website analytics" on the privacy policy, with a switch that stops (or
// resumes) Colvy's own analytics in this browser (components/Analytics).
const P = { fontSize: 15.5, lineHeight: 1.7, color: '#374151', margin: '0 0 12px' } as const

export default function AnalyticsOptOut() {
  const [out, setOut] = useState<boolean | null>(null)
  useEffect(() => { setOut(analyticsOptedOut()) }, [])
  const toggle = () => { const next = !out; setAnalyticsOptedOut(next); setOut(next) }
  return (
    <section id="analytics" style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 10px' }}>Website analytics</h2>
      <p style={P}>
        Colvy uses PostHog to understand how people find and use colvy.com and the Colvy app: pages visited, buttons pressed, where a visit came from
        (for example a search engine or an ad campaign), the type of device and browser, and an approximate location worked out from the IP address.
        Visits are anonymous until you sign in to Colvy. We never record what you type into forms, passwords, payment details or the content of messages,
        and pages a business shares with its own customers (boards, booking, payment and upload pages) aren’t measured at all.
      </p>
      <p style={P}>
        Your browser’s Do Not Track or Global Privacy Control setting turns this off automatically. You can also turn it off here, for this browser:
      </p>
      <button type="button" onClick={toggle} disabled={out === null}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 999, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 14.5, fontWeight: 600, color: '#111' }}>
        <span aria-hidden style={{ width: 34, height: 20, borderRadius: 999, background: out ? '#d1d5db' : '#22c55e', position: 'relative', transition: 'background .2s' }}>
          <span style={{ position: 'absolute', top: 2, left: out ? 2 : 16, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} />
        </span>
        {out === null ? 'Analytics' : out ? 'Analytics is off in this browser' : 'Analytics is on in this browser'}
      </button>
    </section>
  )
}
