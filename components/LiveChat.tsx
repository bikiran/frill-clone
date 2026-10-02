'use client'

import { useState, useEffect } from 'react'
import Portal from './Portal'

export default function LiveChat({ slug: slugProp }: { slug?: string } = {}) {
  const [open, setOpen] = useState(false)
  const [slug, setSlug] = useState(slugProp || '')
  const [mounted, setMounted] = useState(false)
  // Brand pulled from the same source the embedded launcher uses, so the pop-up
  // on the help centre / custom domain matches the widget on the customer's own
  // site (accent colour instead of the default Colvy coral).
  const [accent, setAccent] = useState<string>('')

  // Target workspace: an explicit slug (e.g. Colvy's own support board on the
  // marketing site) wins; otherwise derive it from the board subdomain, or —
  // on a custom help/board domain — resolve it from the domain itself.
  useEffect(() => {
    setMounted(true)
    if (slugProp) { setSlug(slugProp); return }
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname
      const isLocal = hostname.includes('localhost') || hostname.endsWith('vercel.app')
      if (hostname && !isLocal && hostname !== 'colvy.com' && hostname !== 'www.colvy.com') {
        // Resolve the workspace from the host itself. This correctly maps a
        // company's help/board domain (e.g. help.colvy.com → the Colvy workspace)
        // AND a plain <slug>.colvy.com board — instead of blindly treating the
        // first label as the slug, which made help.colvy.com resolve to a
        // non-existent "help" workspace (unbranded widget, "companyId is required").
        fetch(`/api/widget-data?domain=${encodeURIComponent(hostname)}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => {
            if (d?.company?.slug) setSlug(d.company.slug)
            else if (hostname.endsWith('.colvy.com')) setSlug(hostname.replace('.colvy.com', ''))
          })
          .catch(() => { if (hostname.endsWith('.colvy.com')) setSlug(hostname.replace('.colvy.com', '')) })
      }
    }
  }, [slugProp])

  // Once we know the workspace, load its accent colour so the launcher matches
  // the configured brand (the widget iframe already brands itself from slug).
  useEffect(() => {
    if (!slug) return
    let cancelled = false
    fetch(`/api/widget-data?slug=${encodeURIComponent(slug)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d?.company?.accent_color) setAccent(d.company.accent_color) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [slug])

  // Any "Start Chat" / "Live Chat" button on the page opens the widget.
  useEffect(() => {
    const openChat = () => setOpen(true)
    window.addEventListener('colvy-open-chat', openChat)
    return () => window.removeEventListener('colvy-open-chat', openChat)
  }, [])

  // Where to load the widget iframe from. On a colvy subdomain (or the
  // marketing site) same-origin works. On a custom help/board domain, `/widget`
  // would be rewritten to the custom-domain renderer by the proxy, so load it
  // from the board's canonical colvy origin instead — exactly like the embedded
  // launcher (widget.js) does from the customer's own site.
  const widgetOrigin = () => {
    if (typeof window === 'undefined') return ''
    const host = window.location.hostname
    const isColvy = host === 'colvy.com' || host.endsWith('.colvy.com')
    const isLocal = host.includes('localhost') || host.endsWith('vercel.app')
    if (!isColvy && !isLocal && slug) return `https://${slug}.colvy.com`
    return window.location.origin
  }

  if (!mounted) return null

  return (
    <Portal>
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: scale(0.8);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {/* Floating button - truly fixed to viewport */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: accent || 'var(--coral)',
          color: 'white',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          cursor: 'pointer',
          boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
          transition: 'all 0.3s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.95)')}
        onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}>
        {open ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        )}
      </button>

      {/* Widget window - truly fixed to viewport */}
      {open && (
        <div
          style={{
            position: 'fixed',
            // Fit within the viewport on phones: cap width/height to the screen and
            // never let the panel run off the top or sides. On desktop it stays the
            // usual 384×600 floating panel above the launcher.
            bottom: 88,
            right: 24,
            width: 'min(384px, calc(100vw - 48px))',
            height: 'min(600px, calc(100dvh - 112px))',
            maxHeight: 'calc(100dvh - 112px)',
            borderRadius: 16,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: 'white',
            zIndex: 9998,
            border: '1px solid var(--border)',
            animation: 'slideUp 0.3s ease',
          }}>
          
          {/* Header */}
          <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', borderBottom: '1px solid var(--border)', background: 'white' }}>
            <button 
              onClick={() => setOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 20,
                fontWeight: 'bold',
                color: '#9ca3af',
                cursor: 'pointer',
                padding: 0,
                width: 24,
                height: 24,
              }}>
              ×
            </button>
          </div>

          {/* Widget iframe */}
          <div style={{ flex: 1, overflow: 'hidden', width: '100%' }}>
            <iframe
              src={`${widgetOrigin()}/widget?embedded=true${slug ? `&slug=${slug}` : ''}`}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
              }}
              title="Colvy Widget"
            />
          </div>
        </div>
      )}
    </Portal>
  )
}
