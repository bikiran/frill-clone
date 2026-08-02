'use client'

import { useEffect } from 'react'

// Permanent banner shown inside a demo workspace. Makes it unmistakable that the
// data is sample data and that external sending/settings are disabled, and gives
// clear conversion CTAs. Rendered by the admin layout only when the current
// company is a demo (company.is_demo).
export default function DemoBanner({ company }: { company: any }) {
  const isDemo = !!company?.is_demo
  // Push the page down so the fixed bar never covers the workspace chrome.
  useEffect(() => {
    if (!isDemo) return
    const prev = document.body.style.paddingTop
    document.body.style.paddingTop = '44px'
    return () => { document.body.style.paddingTop = prev }
  }, [isDemo])

  if (!isDemo) return null

  const btn = (bg: string, color: string, border?: string): React.CSSProperties => ({
    padding: '5px 12px', borderRadius: 8, background: bg, color, border: border || 'none',
    fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap',
  })

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 44, zIndex: 100000, background: 'linear-gradient(90deg,#0b8457,#0e9e6a)', color: '#fff', display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', boxShadow: '0 2px 12px rgba(0,0,0,0.18)' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, minWidth: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#d1fadf', flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          You're exploring the Colvy demo — sample data only. External sending and account settings are disabled.
        </span>
      </span>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <a href="https://colvy.com/signup" style={btn('#fff', '#0b8457')}>Start free trial</a>
        <a href="https://colvy.com/pricing" className="hidden md:inline-flex" style={btn('rgba(255,255,255,0.14)', '#fff', '1px solid rgba(255,255,255,0.4)')}>Book a demo</a>
        <a href="https://colvy.com" style={btn('rgba(255,255,255,0.14)', '#fff', '1px solid rgba(255,255,255,0.4)')}>Exit</a>
      </div>
    </div>
  )
}
