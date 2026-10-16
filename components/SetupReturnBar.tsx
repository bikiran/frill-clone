'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { safeSetupPath, rememberSetupReturn, readSetupReturn, clearSetupReturn, isSetupPage } from '@/lib/setup-return'

// A slim "Back to setup" bar on the settings pages the setup checklist sends
// people to. It appears when the page was opened with `?returnTo=/admin?…`
// (or earlier in this tab's setup trip, so it survives a round trip through
// Shopify or the phone-number checkout) and goes away once they're back on the
// dashboard, head off to a page no setup step uses, or close it. The admin
// layout renders it inside <Suspense> (it reads the query string) and keys it
// by path. Closing it is remembered (localStorage) for a week, across pages.
const DISMISS_KEY = 'colvy-setup-bar-dismissed'
const DISMISS_MS = 7 * 24 * 3600_000

/** Closed in the last week? (localStorage, so it holds across pages and tabs.) */
function wasDismissed(): boolean {
  try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < DISMISS_MS } catch { return false }
}

export default function SetupReturnBar() {
  const pathname = usePathname()
  const fromUrl = safeSetupPath(useSearchParams().get('returnTo'))
  // Start hidden and decide after mount: the dismissal lives in localStorage,
  // and reading it during render would mismatch the server HTML.
  const [closed, setClosed] = useState(true)

  useEffect(() => {
    // Back on the dashboard, or somewhere setup doesn't go (the inbox, say):
    // the trip is over. Otherwise remember where this page was asked to send
    // people, for the rest of the trip in this tab.
    if (pathname === '/admin') clearSetupReturn()
    else if (fromUrl) rememberSetupReturn(fromUrl)
    else if (!isSetupPage(pathname)) clearSetupReturn()
    setClosed(wasDismissed())
  }, [pathname, fromUrl])

  const back = closed || pathname === '/admin' ? '' : (fromUrl || (isSetupPage(pathname) ? readSetupReturn() : ''))
  // Nothing to go back to: render nothing at all (never an empty bar).
  if (!back) return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch {}
    clearSetupReturn(); setClosed(true)
  }

  return (
    <div className="setup-return" role="region" aria-label="Setup">
      <style>{`
        .setup-return { display: flex; align-items: center; gap: 10px; padding: 8px 10px 8px 16px; background: #fff7ed; border-bottom: 1px solid #fed7aa; }
        .setup-return-ic { flex-shrink: 0; }
        .setup-return-body { flex: 1; min-width: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; }
        .setup-return-text { flex: 1 1 260px; min-width: 0; margin: 0; font-size: 13px; color: #9a3412; line-height: 1.4; }
        .setup-return-text strong { font-weight: 700; }
        .setup-return-go { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 9px; background: var(--coral); color: #fff; font-size: 12.5px; font-weight: 700; text-decoration: none; white-space: nowrap; flex-shrink: 0; }
        .setup-return-x { width: 30px; height: 30px; flex-shrink: 0; border: 0; background: transparent; border-radius: 8px; color: #9a3412; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
        .setup-return-x:hover { background: #ffedd5; }
        @media (max-width: 640px) {
          /* One compact row: icon, "Setting up Colvy.", a small button, and the
             close button pinned at the right. The longer sentence is desktop-only. */
          .setup-return { gap: 8px; padding: 6px 6px 6px 12px; }
          .setup-return-body { flex-wrap: nowrap; gap: 8px; }
          .setup-return-text { flex: 1 1 auto; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .setup-return-go { padding: 5px 10px; font-size: 12px; border-radius: 8px; }
          .setup-return-x { width: 28px; height: 28px; }
          .setup-return-long { display: none; }
        }
      `}</style>
      <svg className="setup-return-ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
      <div className="setup-return-body">
        <p className="setup-return-text"><strong>Setting up Colvy.</strong> <span className="setup-return-long">When you’re done here, head back to your checklist.</span></p>
        <Link href={back} className="setup-return-go">
          Back to setup
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
        </Link>
      </div>
      <button type="button" className="setup-return-x" aria-label="Close" title="Close" onClick={dismiss}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </div>
  )
}
