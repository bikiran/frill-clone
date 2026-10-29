'use client'

// The contact panel's top: close buttons, tabs and the + Action button.
// Moved out of app/admin/inbox/page.tsx unchanged. Its names come from the
// inbox controller through useInbox().

import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/inbox/inbox-shared'
import { useInbox } from '@/components/inbox/InboxContext'

export default function ContactPanelHead() {
  const {
    activePanel, convActions, doaMatch, openTicket, sendInteractive, setActivePanel,
    setCouponAmount, setCouponCode, setCouponExpiry, setCouponOneTime, setCouponType, setMobilePane,
    setPodFiles, setPodNote, setShowActionMenu, setShowCoupon, setShowCreateOrder, setShowDoa,
    setShowPod, setShowRecordSale, setTabletContact, showActionMenu, showToast,
  } = useInbox()
  return (
    <>
      {/* Tablet: close the drawer */}
      <button type="button" className="inbox-tablet-only inbox-drawer-close" onClick={() => setTabletContact(false)} aria-label="Close contact panel" title="Close"
        style={{ display: 'none', position: 'absolute', top: 10, right: 10, zIndex: 2, width: 32, height: 32, borderRadius: 999, border: 'none', background: '#f3f4f6', color: 'var(--slate)', cursor: 'pointer', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
      </button>
      {/* Mobile: back to thread */}
      <button type="button" className="inbox-mobile-only" onClick={() => setMobilePane('thread')}
        style={{ display: 'none', alignItems: 'center', gap: 6, padding: '10px 14px', border: 'none', borderBottom: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--slate)', fontSize: 13, fontWeight: 600 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back to conversation
      </button>
      {/* Panel tabs */}
      <div className="cp-tabs" role="tablist" aria-label="Contact panel">
        {/* The Orders tab used to appear only once orders had finished
            loading (wooCustomer || wooOrders.length), so on first open it was
            missing and you had to click Timeline to trigger the load before
            it showed. Always render it; it shows its own empty state. */}
        {(['info', 'timeline', 'orders'] as const).map(p => (
          <button key={p} type="button" role="tab" aria-selected={activePanel === p} onClick={() => setActivePanel(p)} className={`cp-tab${activePanel === p ? ' on' : ''}`}>
            {p === 'info' ? 'Information' : p === 'timeline' ? 'Timeline' : 'Orders'}
          </button>
        ))}
      </div>

      {/* + Action button — shows enabled conversation actions */}
      {(() => {
        const enabledActions = Object.entries(convActions).filter(([, v]: any) => v?.enabled)
        const ACTION_META: Record<string, { label: string; icon: (s?: number) => React.ReactNode }> = {
          doa: { label: 'DOA claim', icon: Icon.box },
          warranty: { label: 'Warranty claim', icon: Icon.shield },
          return_refund: { label: 'Return or refund', icon: Icon.refund },
          create_order: { label: 'Create order', icon: Icon.cart },
          send_coupon: { label: 'Send coupon', icon: Icon.coupon },
          booking: { label: 'Booking', icon: Icon.calendar },
          support_ticket: { label: 'Support ticket', icon: Icon.ticket },
          proof_of_delivery: { label: 'Proof of delivery', icon: Icon.box },
          custom_form: { label: 'Custom form', icon: Icon.form },
        }
        return (
          <div style={{ padding: '12px 14px 4px', position: 'relative' }}>
            <button type="button" onClick={() => setShowActionMenu(v => !v)} aria-haspopup="menu" aria-expanded={showActionMenu} className={`cp-action${showActionMenu ? ' on' : ''}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span style={{ flex: 1, textAlign: 'left' }}>Action</span>
              <svg className="cp-action-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {showActionMenu && (
              <div className="th-menu" style={{ position: 'absolute', top: '100%', left: 14, right: 14, zIndex: 20, marginTop: 2 }}>
                {/* Record sale — always available, and can be used multiple times. */}
                <button type="button" onClick={() => { setShowActionMenu(false); setShowRecordSale(true) }}
                  className="th-menu-row cp-act-row">
                  <span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                  </span> Record sale
                </button>
                {[...enabledActions, ...(enabledActions.some(([k]: any) => k === 'proof_of_delivery') ? [] : [['proof_of_delivery', {}]])].map(([key, cfg]: any) => {
                  const meta = ACTION_META[key] || { label: key, icon: (s?: number) => <span>•</span> }
                  return (
                    <button key={key} type="button"
                      onClick={async () => {
                        setShowActionMenu(false)
                        if (key === 'doa' || key === 'return_refund') setShowDoa(true)
                        else if (key === 'create_order') setShowCreateOrder(true)
                        else if (key === 'send_coupon') { setCouponAmount(''); setCouponCode(''); setCouponType('fixed'); setCouponOneTime(true); setCouponExpiry(''); setShowCoupon(true) }
                        else if (key === 'support_ticket') openTicket()
                        else if (key === 'proof_of_delivery') { setPodNote(''); setPodFiles([]); setShowPod(true) }
                        else if (cfg.form_id) {
                          const { data: form } = await (supabase as any).from('forms').select('*').eq('id', cfg.form_id).maybeSingle()
                          if (form) sendInteractive('form', form)
                          else showToast('The linked form was not found.')
                        }
                        else showToast(`"${meta.label}" isn't configured yet — set it up in Settings → Conversation Actions.`)
                      }}
                      className="th-menu-row cp-act-row">
                      <span>{meta.icon(16)}</span> {meta.label}
                    </button>
                  )
                })}
              </div>
            )}
            {doaMatch && convActions.doa?.enabled && (
              <button type="button" onClick={() => setShowDoa(true)} className="cp-hint" title="Start a DOA claim for this customer's order">
                <span className="cp-hint-ic">{Icon.box(15)}</span>
                <span style={{ flex: 1, minWidth: 0, fontWeight: 600, color: '#18181b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Matches an order</span>
                <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--coral)', whiteSpace: 'nowrap' }}>DOA claim</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ color: '#a1a1aa', flexShrink: 0, marginLeft: -4 }}><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            )}
          </div>
        )
      })()}
    </>
  )
}
