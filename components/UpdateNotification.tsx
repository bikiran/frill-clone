'use client'

import { useState, useEffect, useRef } from 'react'

// Polls for deployment updates and shows a banner when a new version is available
export default function UpdateNotification({ accentColor }: { accentColor?: string } = {}) {
  // Use the company's brand colour when we're inside a branded surface (the
  // widget), otherwise Colvy's own coral.
  const accent = accentColor || 'var(--coral)'
  const accentSoft = accentColor ? `${accentColor}1f` : 'var(--peach)'
  const [show, setShow] = useState(false)
  const buildIdRef = useRef<string | null>(null)

  useEffect(() => {
    // Get the current build ID from Next.js
    const getCurrentBuildId = (): string | null => {
      try {
        // Next.js embeds the build ID in __NEXT_DATA__
        const nextData = (window as any).__NEXT_DATA__
        return nextData?.buildId || null
      } catch { return null }
    }

    // Check for updates by polling /_next/static/chunks/main.js hash or comparing build IDs
    const checkForUpdate = async () => {
      try {
        // Fetch a lightweight endpoint to detect new deployments
        // Using the _next/data route with a cache-busting param
        const res = await fetch(`/api/build-id?t=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'x-check-update': '1' }
        })
        if (!res.ok) return

        const data = await res.json()
        const serverBuildId = data.buildId

        if (!buildIdRef.current) {
          // First check — store current build ID
          buildIdRef.current = serverBuildId || getCurrentBuildId()
          return
        }

        if (serverBuildId && buildIdRef.current && serverBuildId !== buildIdRef.current) {
          // New deployment detected!
          setShow(true)
        }
      } catch { /* silently fail */ }
    }

    // Initial check after 5 seconds
    const initial = setTimeout(checkForUpdate, 5000)

    // Then check every 2 minutes
    const interval = setInterval(checkForUpdate, 2 * 60 * 1000)

    // Also check when tab becomes visible again
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkForUpdate()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearTimeout(initial)
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  if (!show) return null

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2.5 rounded-2xl shadow-2xl border"
      style={{
        background: 'white',
        borderColor: 'var(--border)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        animation: 'slideUp 0.3s ease-out',
        // Fit the container it's in. The old fixed 420px min-width overflowed
        // the chat widget (which is only ~320-360px wide) and broke the layout.
        width: 'calc(100% - 24px)',
        maxWidth: 420,
        padding: '10px 12px',
        boxSizing: 'border-box',
      }}>
      <style>{`
        @keyframes slideUp {
          from { transform: translate(-50%, 20px); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
      `}</style>

      {/* Icon */}
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{ background: accentSoft }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round">
          <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold" style={{ color: 'var(--ink)', fontSize: 13, lineHeight: 1.25, margin: 0 }}>Update available</p>
        <p style={{ color: 'var(--slate)', fontSize: 11.5, lineHeight: 1.3, margin: '1px 0 0' }}>Refresh to get the latest version.</p>
      </div>

      {/* Refresh button */}
      <button
        onClick={() => window.location.reload()}
        className="rounded-lg font-semibold text-white cursor-pointer hover:opacity-90 transition-all shrink-0"
        style={{ background: accent, padding: '6px 12px', fontSize: 12.5, whiteSpace: 'nowrap' }}>
        Refresh
      </button>

      {/* Close */}
      <button
        onClick={() => setShow(false)}
        className="p-1 rounded-lg hover:bg-gray-100 cursor-pointer shrink-0 transition-all"
        style={{ color: 'var(--slate)' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  )
}
