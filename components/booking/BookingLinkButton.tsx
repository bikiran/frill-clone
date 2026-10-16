'use client'

import { useEffect, useState } from 'react'
import { api } from '@/components/booking/admin/shared'
import { SparkleIcon, CalendarIcon } from '@/components/booking/icons'
import Popover, { usePopover } from '@/components/composer/Popover'

// Inbox composer: "Booking link" → pick a service (or any) → a personal link
// for this customer is dropped into the reply (never sent on its own). Their
// details come pre-filled and the booking lands back in this conversation.
// The list is the shared composer Popover: anchored to this button, closes on
// an outside click, Escape, a pick, or when another popover opens.

export default function BookingLinkButton({ companyId, conversationId, contactId, onInsert, height = 32, iconOnly = false }: {
  companyId: string | null; conversationId: string | null; contactId?: string | null
  onInsert: (text: string) => void; height?: number; iconOnly?: boolean
}) {
  const pop = usePopover()
  const open = pop.open, setOpen = pop.setOpen
  const [services, setServices] = useState<any[] | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || services || !companyId) return
    api(`/api/bookings/services?companyId=${companyId}`).then(d => setServices((d.services || []).filter((s: any) => s.active))).catch(e => setError(e.message))
  }, [open, services, companyId])

  const pick = async (serviceId: string | null, name?: string) => {
    if (!companyId || busy) return
    setBusy(serviceId || 'any'); setError('')
    try {
      const d = await api('/api/bookings/invite', { method: 'POST', json: { companyId, conversationId, contactId: contactId || null, serviceId } })
      onInsert(name ? `You can book your ${name} here: ${d.url}` : `You can book a time here: ${d.url}`)
      setOpen(false)
    } catch (e: any) { setError(e.message) } finally { setBusy('') }
  }

  if (!companyId || !conversationId) return null
  return (
    <>
      {iconOnly ? (
        <button type="button" ref={pop.anchorRef} onClick={() => setOpen(o => !o)} title="Insert a booking link" aria-label="Insert a booking link" aria-haspopup="menu" aria-expanded={open} className="cmp-tool"
          style={{ width: height, height, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 11, border: 'none', background: open ? 'var(--peach,#fff1ee)' : '#f3f4f6', color: open ? 'var(--coral,#ff7a6b)' : '#6b7280', cursor: 'pointer', flexShrink: 0 }}>
          <CalendarIcon size={16} />
        </button>
      ) : (
      <button type="button" ref={pop.anchorRef} onClick={() => setOpen(o => !o)} title="Insert a booking link for this customer" aria-haspopup="menu" aria-expanded={open}
        style={{ height, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 11px', borderRadius: 8, border: '1px solid var(--border,#e5e7eb)', background: open ? '#f5f5f6' : '#fff', color: 'var(--ink,#111)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
        <CalendarIcon size={14} />
        Booking link
      </button>
      )}
      <Popover open={open} onClose={pop.close} anchorRef={pop.anchorRef} width={280} prefer="top" label="Insert a booking link" role="menu">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--slate,#6b7280)', textTransform: 'uppercase', letterSpacing: '.05em', padding: '6px 10px 4px' }}>Insert a booking link</div>
          {services === null && !error && <div style={{ padding: 10, fontSize: 13, color: '#9ca3af' }}>Loading…</div>}
          {services && !services.length && (
            <div style={{ padding: 10, fontSize: 13, color: 'var(--slate,#6b7280)' }}>No services yet. <a href="/admin/bookings?tab=services" style={{ color: 'var(--coral,#ff7a6b)' }}>Add one →</a></div>
          )}
          {services && services.length > 0 && (
            <>
              {services.length > 1 && <button type="button" role="menuitem" data-pop-item className="cpop-item" onClick={() => pick(null)} disabled={!!busy}><SparkleIcon size={14} style={{ color: 'var(--coral,#ff7a6b)' }} /> <span style={{ flex: 1 }}>Any service</span>{busy === 'any' && '…'}</button>}
              {services.map(s => (
                <button key={s.id} type="button" role="menuitem" data-pop-item className="cpop-item" onClick={() => pick(s.id, s.name)} disabled={!!busy}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color || 'var(--coral,#ff7a6b)', flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                  {busy === s.id ? '…' : <span style={{ fontSize: 11.5, color: '#9ca3af' }}>{s.duration_mins}m</span>}
                </button>
              ))}
            </>
          )}
          {error && <div style={{ padding: '8px 10px', fontSize: 12.5, color: '#b91c1c' }}>{error}</div>}
          <div style={{ padding: '6px 10px 4px', fontSize: 11.5, color: '#9ca3af', lineHeight: 1.4 }}>Added to your reply to check before sending. Their name, mobile and email are pre-filled.</div>
      </Popover>
    </>
  )
}
