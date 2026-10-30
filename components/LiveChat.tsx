'use client'

import { useState, useEffect, useRef, type CSSProperties } from 'react'
import Portal from './Portal'
import { captureClickRef } from '@/lib/click-ref-client'
import { type WidgetSize, isWidgetSize, fromWidgetFrame } from '@/lib/widget-frame'

export default function LiveChat({ slug: slugProp }: { slug?: string } = {}) {
  const [open, setOpen] = useState(false)
  const [slug, setSlug] = useState(slugProp || '')
  const [mounted, setMounted] = useState(false)
  // Brand pulled from the same source the embedded launcher uses, so the pop-up
  // on the help centre / custom domain matches the widget on the customer's own
  // site (accent colour instead of the default Colvy coral).
  const [accent, setAccent] = useState<string>('')
  // Smart links: the Reel / QR / bio link that brought this visitor here
  // (?clv=, remembered for 7 days on this site — so the booking page on the
  // same site gets it too), passed to the chat so it's credited to that link.
  const [clickRef] = useState<string | null>(() => captureClickRef())
  // The widget's window controls (minimise / expand / full screen) ask us to
  // resize this panel: lib/widget-frame.ts has the protocol.
  const [size, setSize] = useState<WidgetSize>('normal')
  const frameRef = useRef<HTMLIFrameElement | null>(null)

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

  // Messages from our widget iframe only (its window, its origin).
  useEffect(() => {
    if (!open) return
    const onMsg = (e: MessageEvent) => {
      const frame = frameRef.current
      let origin = ''
      try { origin = frame ? new URL(frame.src).origin : '' } catch {}
      if (!fromWidgetFrame(e, frame, origin)) return
      const d: any = e.data
      if (!d || !d.colvy) return
      if (d.type === 'size' && isWidgetSize(d.mode)) setSize(d.mode)
      else if (d.type === 'close') { setSize('normal'); setOpen(false) }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [open])

  // Esc on this page leaves full screen, and the widget hears what's on screen
  // so its buttons match.
  useEffect(() => {
    const frame = frameRef.current
    try { if (frame?.contentWindow) frame.contentWindow.postMessage({ colvy: true, type: 'size_state', mode: size }, new URL(frame.src).origin) } catch {}
    if (size !== 'fullscreen') return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSize('normal') }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [size])

  // Closing always comes back at the normal size next time.
  useEffect(() => { if (!open) setSize('normal') }, [open])

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

      {/* Floating button - truly fixed to viewport. Hidden while the chat
          fills the screen (the widget has its own close button then). */}
      {size !== 'fullscreen' && <button
        className="colvy-chat-launcher"
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Close chat' : 'Chat with us'}
        aria-expanded={open}
        style={{
          position: 'fixed',
          // Rides above the voice-note player while it's open (AudioDock sets --audio-dock-h).
          bottom: 'calc(24px + var(--audio-dock-h, 0px))',
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
          transition: 'transform 0.3s ease, bottom 0.42s cubic-bezier(.32,.72,0,1)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.95)')}
        onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}>
        {open ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        )}
      </button>}

      {/* Widget window - truly fixed to viewport. The widget's own header
          (name, window controls, Board link) is its title bar. */}
      {open && (
        <div
          role="dialog"
          aria-label="Chat"
          data-overlay-ignore
          data-size={size}
          style={{
            position: 'fixed',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: 'white',
            zIndex: 10000,
            animation: 'slideUp 0.3s ease',
            transition: 'width 0.22s ease, height 0.22s ease',
            ...panelStyle(size),
          }}>
          <div style={{ flex: 1, overflow: 'hidden', width: '100%' }}>
            <iframe
              ref={frameRef}
              src={`${widgetOrigin()}/widget?embedded=true${slug ? `&slug=${slug}` : ''}${clickRef ? `&clv=${encodeURIComponent(clickRef)}` : ''}`}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                display: 'block',
              }}
              title="Chat"
              allow="clipboard-write"
            />
          </div>
        </div>
      )}
    </Portal>
  )
}

// Where the panel sits for each size. Normal is the usual floating panel above
// the launcher; expanded is wider and as tall as the window allows; full screen
// covers the page. On a phone, normal and expanded both fill most of the screen.
function panelStyle(size: WidgetSize): CSSProperties {
  if (size === 'fullscreen') {
    return { inset: 0, width: '100vw', height: '100dvh', borderRadius: 0, border: 'none', boxShadow: 'none' }
  }
  const floating: CSSProperties = {
    bottom: 'calc(88px + var(--audio-dock-h, 0px))',
    right: 24,
    borderRadius: 16,
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    border: '1px solid var(--border)',
    maxHeight: 'calc(100dvh - 112px)',
  }
  if (size === 'expanded') {
    return { ...floating, width: 'min(560px, calc(100vw - 48px))', height: 'min(820px, calc(100dvh - 112px))' }
  }
  if (size === 'compact') {
    return { ...floating, width: 'min(320px, calc(100vw - 48px))', height: 'min(460px, calc(100dvh - 112px))' }
  }
  return { ...floating, width: 'min(384px, calc(100vw - 48px))', height: 'min(600px, calc(100dvh - 112px))' }
}
