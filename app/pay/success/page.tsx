'use client'

import { Suspense } from 'react'

function SuccessInner() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', background: 'var(--canvas)', padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: 'center', background: '#fff', borderRadius: 18, padding: 40, boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: '0 0 8px' }}>Payment successful</h1>
        <p style={{ fontSize: 14, color: 'var(--slate)', margin: '0 0 8px', lineHeight: 1.5 }}>Thank you! Your payment has gone through and a receipt has been emailed to you by Stripe.</p>
        <p style={{ fontSize: 13, color: 'var(--slate)', margin: 0 }}>You can close this window and return to your chat.</p>
      </div>
    </div>
  )
}

export default function PaySuccess() {
  return <Suspense fallback={null}><SuccessInner /></Suspense>
}
