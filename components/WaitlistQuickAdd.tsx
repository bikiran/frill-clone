'use client'

import { useState } from 'react'
import WaitlistAddModal from '@/components/WaitlistAddModal'
import { BellIcon } from '@/components/booking/icons'

// Contact-panel shortcut: when a customer asks for something that's out of
// stock ("any diamond eye molly?"), put them on its back-in-stock waitlist
// without leaving the conversation.
export default function WaitlistQuickAdd({ companyId, contact, conversationId }: {
  companyId: string | null
  contact: { id: string; name?: string | null; phone?: string | null; email?: string | null } | null
  conversationId: string | null
}) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState('')
  if (!companyId || !contact?.id) return null

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        Back-in-stock waitlist
      </p>
      <button type="button" className="colvy-wl-row" onClick={() => { setDone(''); setOpen(true) }}>
        <span className="colvy-wl-icon"><BellIcon size={15} /></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}>Notify when back in stock</span>
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--slate)', lineHeight: 1.35, marginTop: 1 }}>Add {contact.name ? contact.name.split(' ')[0] : 'this customer'} to a product&rsquo;s waitlist</span>
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#c4c4c8', flexShrink: 0 }}><path d="m9 6 6 6-6 6" /></svg>
      </button>
      {done && (
        <p style={{ margin: '8px 2px 0', fontSize: 11.5, color: '#059669', display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          {done} <a href="/admin/waitlists" style={{ color: 'inherit', fontWeight: 600 }}>View waitlists</a>
        </p>
      )}
      <style>{`
        .colvy-wl-row { width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border); background: #fff; cursor: pointer; text-align: left; font: inherit; box-shadow: 0 1px 2px rgba(0,0,0,0.04); transition: background 0.18s ease, box-shadow 0.18s ease, transform 0.12s ease; }
        .colvy-wl-row:hover { background: #fafafa; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
        .colvy-wl-row:active { transform: scale(0.985); }
        .colvy-wl-row:focus-visible { outline: 2px solid var(--coral); outline-offset: 2px; }
        .colvy-wl-icon { width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; background: var(--peach); color: var(--coral); }
        @media (prefers-reduced-motion: reduce) { .colvy-wl-row { transition: none; } .colvy-wl-row:active { transform: none; } }
      `}</style>
      {open && (
        <WaitlistAddModal
          companyId={companyId}
          presetContact={contact}
          conversationId={conversationId}
          onClose={() => setOpen(false)}
          onAdded={(dup) => { setOpen(false); setDone(dup ? 'Already on that waitlist.' : 'Added to the waitlist.') }}
        />
      )}
    </div>
  )
}
