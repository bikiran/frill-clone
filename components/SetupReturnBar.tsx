'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { safeSetupPath, rememberSetupReturn, readSetupReturn, clearSetupReturn } from '@/lib/setup-return'

// A slim "Back to setup" bar on the settings pages the setup checklist sends
// people to. It appears when the page was opened with `?returnTo=/admin?…`
// (or earlier in this tab's setup trip, so it survives a round trip through
// Shopify or the phone-number checkout) and goes away once they're back on the
// dashboard or close it. The admin layout renders it inside <Suspense> (it
// reads the query string) and keys it by path, so closing it lasts one page.
export default function SetupReturnBar() {
  const pathname = usePathname()
  const fromUrl = safeSetupPath(useSearchParams().get('returnTo'))
  const [closed, setClosed] = useState(false)

  useEffect(() => {
    // Back on the dashboard: the trip is over. Otherwise remember where this
    // page was asked to send people, for the rest of the trip in this tab.
    if (pathname === '/admin') clearSetupReturn()
    else if (fromUrl) rememberSetupReturn(fromUrl)
  }, [pathname, fromUrl])

  const back = closed || pathname === '/admin' ? '' : (fromUrl || readSetupReturn())
  if (!back) return null

  return (
    <div className="setup-return" role="region" aria-label="Setup">
      <style>{`
        .setup-return { display: flex; align-items: center; gap: 10px; padding: 9px 16px; background: #fff7ed; border-bottom: 1px solid #fed7aa; flex-wrap: wrap; }
        .setup-return-text { flex: 1; min-width: 180px; font-size: 13px; color: #9a3412; line-height: 1.4; }
        .setup-return-text strong { font-weight: 700; }
        .setup-return-go { display: inline-flex; align-items: center; gap: 6px; padding: 7px 13px; border-radius: 9px; background: var(--coral); color: #fff; font-size: 12.5px; font-weight: 700; text-decoration: none; white-space: nowrap; }
        .setup-return-x { width: 30px; height: 30px; border: 0; background: transparent; border-radius: 8px; color: #9a3412; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
        .setup-return-x:hover { background: #ffedd5; }
        @media (max-width: 520px) { .setup-return-go { flex: 1; justify-content: center; } }
      `}</style>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
      <span className="setup-return-text"><strong>Setting up Colvy.</strong> When you’re done here, head back to your checklist.</span>
      <Link href={back} className="setup-return-go">
        Back to setup
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
      </Link>
      <button type="button" className="setup-return-x" aria-label="Close" onClick={() => { clearSetupReturn(); setClosed(true) }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </div>
  )
}
