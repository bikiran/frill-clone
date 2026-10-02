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
      <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'flex', alignItems: 'center', gap: 5 }}>
        <BellIcon size={14} /> Back-in-stock waitlist
      </p>
      <button type="button" onClick={() => { setDone(''); setOpen(true) }}
        style={{ width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px dashed var(--coral)', background: 'var(--peach)', color: 'var(--coral)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>
        + Notify this customer when an item is back in stock
      </button>
      {done && <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#059669' }}>{done} <a href="/admin/waitlists" style={{ color: 'inherit' }}>View waitlists →</a></p>}
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
