'use client'

import { useState, useEffect } from 'react'

export default function LiveChat() {
  const [open, setOpen] = useState(false)
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
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full shadow-lg cursor-pointer transition-all hover:scale-110 active:scale-95 flex items-center justify-center text-xl font-bold"
        style={{ background: 'var(--coral)', color: 'white' }}
        title="Feedback & Widget">
        {open ? '×' : '💬'}
      </button>

      {/* Widget window */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-96 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          style={{ height: 600, border: '1px solid var(--border)', background: 'white' }}>
          
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
    </>
  )
}
