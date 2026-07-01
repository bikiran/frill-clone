'use client'

import { useState, useEffect } from 'react'

export default function LiveChat() {
  const [open, setOpen] = useState(true) // Show by default
  const [slug, setSlug] = useState('')

  // Get slug from hostname on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname
      if (hostname.endsWith('.colvy.com') && hostname !== 'colvy.com') {
        const companySlug = hostname.replace('.colvy.com', '')
        setSlug(companySlug)
      }
    }
  }, [])

  return (
    <>
      {/* Widget display - visible by default, toggle with button */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-3">
        {open && (
          <div className="w-96 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            style={{ height: 600, border: '1px solid var(--border)', background: 'white', animation: 'slideUp 0.3s ease' }}>
            <style>{`
              @keyframes slideUp {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
              }
            `}</style>
            
            {/* Close button */}
            <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', borderBottom: '1px solid var(--border)' }}>
              <button onClick={() => setOpen(false)} className="text-slate-400 cursor-pointer hover:text-slate-600"
                style={{ fontSize: 20, fontWeight: 'bold' }}>
                ×
              </button>
            </div>

            {/* Widget iframe */}
            <div className="flex-1 overflow-hidden">
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

        {/* Toggle button - always visible */}
        <button
          onClick={() => setOpen(!open)}
          className="w-14 h-14 rounded-full shadow-lg cursor-pointer transition-all hover:scale-110 active:scale-95 flex items-center justify-center text-xl font-bold"
          style={{ background: 'var(--coral)', color: 'white' }}
          title={open ? 'Hide widget' : 'Show widget'}>
          {open ? '▼' : '💬'}
        </button>
      </div>
    </>
  )
}
