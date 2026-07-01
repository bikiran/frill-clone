'use client'

import { useState, useEffect } from 'react'
import Portal from './Portal'

export default function LiveChat() {
  const [open, setOpen] = useState(false)
  const [slug, setSlug] = useState('')
  const [mounted, setMounted] = useState(false)

  // Get slug from hostname
  useEffect(() => {
    setMounted(true)
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname
      if (hostname.endsWith('.colvy.com') && hostname !== 'colvy.com') {
        const companySlug = hostname.replace('.colvy.com', '')
        setSlug(companySlug)
      }
    }
  }, [])

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
          background: 'var(--coral)',
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
            bottom: 88,
            right: 24,
            width: 384,
            height: 600,
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
              src={`${typeof window !== 'undefined' ? window.location.origin : ''}/widget?embedded=true${slug ? `&slug=${slug}` : ''}`}
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
