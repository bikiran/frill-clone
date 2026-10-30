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
      <Popover open={open} onClose={pop.close} anchorRef={pop.anchorRef} width={300} prefer="top" label="Insert a booking link" role="menu" padding={8} radius={20}>
          <div className="cmp-pop-head" style={{ margin: '6px 6px 10px' }}>
            <span className="cmp-pop-badge" aria-hidden><CalendarIcon size={18} /></span>
            <span style={{ minWidth: 0 }}>
              <b>Insert a booking link</b>
              <small>A personal link goes into your reply, with their details filled in.</small>
            </span>
          </div>
          {services === null && !error && (
            <div aria-busy="true" aria-label="Loading services">
              {[0, 1, 2].map(i => <div key={i} className="blb-skel" style={{ animationDelay: `${i * 120}ms` }} />)}
            </div>
          )}
          {services && !services.length && (
            <div className="blb-empty">No services yet. <a href="/admin/bookings?tab=services">Add one →</a></div>
          )}
          {services && services.length > 0 && (
            <div className="cmp-plus-group">
              {services.length > 1 && (
                <button type="button" role="menuitem" data-pop-item className="cmp-plus-item" onClick={() => pick(null)} disabled={!!busy} style={{ '--tint': 'var(--coral,#ff7a6b)' } as React.CSSProperties}>
                  <span className="cmp-plus-ic" aria-hidden><SparkleIcon size={15} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}><b>Any service</b><small>They choose when they book</small></span>
                  {busy === 'any' && <span className="blb-spin" aria-label="Making the link" />}
                </button>
              )}
              {services.map(s => (
                <button key={s.id} type="button" role="menuitem" data-pop-item className="cmp-plus-item" onClick={() => pick(s.id, s.name)} disabled={!!busy} style={{ '--tint': s.color || 'var(--coral,#ff7a6b)' } as React.CSSProperties}>
                  <span className="cmp-plus-ic" aria-hidden><CalendarIcon size={15} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}><b>{s.name}</b>{s.duration_mins ? <small>{s.duration_mins >= 60 && s.duration_mins % 60 === 0 ? `${s.duration_mins / 60} hr` : `${s.duration_mins} min`}</small> : null}</span>
                  {busy === s.id && <span className="blb-spin" aria-label="Making the link" />}
                </button>
              ))}
            </div>
          )}
          {error && <p className="cmp-pop-err" role="alert" style={{ margin: '8px 8px 0' }}>{error}</p>}
          <p className="blb-foot">You check it before it&rsquo;s sent. The booking lands back in this conversation.</p>
          <style href="booking-link-pop" precedence="default">{BLB_CSS}</style>
      </Popover>
    </>
  )
}

const BLB_CSS = `
.blb-skel{height:42px;margin:2px 0;border-radius:13px;background:linear-gradient(90deg,color-mix(in srgb,var(--slate,#64748b) 7%,transparent) 25%,color-mix(in srgb,var(--slate,#64748b) 13%,transparent) 50%,color-mix(in srgb,var(--slate,#64748b) 7%,transparent) 75%);background-size:200% 100%;animation:blbShimmer 1.2s ease-in-out infinite}
.blb-empty{margin:0 4px;padding:14px;border-radius:14px;background:color-mix(in srgb,var(--slate,#64748b) 7%,transparent);font-size:13px;color:var(--slate)}
.blb-empty a{color:var(--coral,#ff7a6b);font-weight:650;text-decoration:none}
.blb-foot{margin:8px 8px 4px;font-size:12px;line-height:1.45;color:var(--slate)}
.blb-spin{width:16px;height:16px;flex-shrink:0;border-radius:50%;border:2px solid color-mix(in srgb,var(--tint) 25%,transparent);border-top-color:var(--tint);animation:blbSpin .7s linear infinite}
@keyframes blbShimmer{from{background-position:100% 0}to{background-position:-100% 0}}
@keyframes blbSpin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.blb-skel,.blb-spin{animation:none}}
`
