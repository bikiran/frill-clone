'use client'

// Panels and pop-ups opened from the inbox: forward, schedule, products, proof of
// delivery, filters, the conversation right-click menu, charge card, DOA, orders,
// media, coupons, merge, toast and the send picker.
// Moved out of app/admin/inbox/page.tsx unchanged. Its names come from the
// inbox controller through useInbox().

import { toPublicUrl } from '@/lib/storage-url'
import ResilientImage from '@/components/ResilientImage'
import RefundOrderModal from '@/components/RefundOrderModal'
import { SkClose, SkFiles, SkIcon, SkStyle } from '@/components/ui/SheetKit'
import DeliveryPanel from '@/components/DeliveryPanel'
import ContactTimeline from '@/components/ContactTimeline'
import { supabase } from '@/lib/supabase'
import Dialer from '@/components/Dialer'
import ComposeMessage from '@/components/ComposeMessage'
import AddContactModal from '@/components/AddContactModal'
import PhoneUploadQR from '@/components/PhoneUploadQR'
import SendTrackingModal from '@/components/SendTrackingModal'
import DoaPanel from '@/components/DoaPanel'
import CreateOrderPanel from '@/components/CreateOrderPanel'
import { decodeEntities as dec } from '@/lib/decode-entities'
import RecordSaleModal from '@/components/RecordSaleModal'
import MediaGallery, { MediaItem } from '@/components/MediaGallery'
import { waitlistPreview } from '@/lib/waitlist-ai'
import { CHANNEL_NAME, IFL_CSS, Icon } from '@/components/inbox/inbox-shared'
import { useInbox } from '@/components/inbox/InboxContext'
import { useRef } from 'react'

export default function InboxOverlays() {
  const {
    activeFilterCount, afterOrderRefund, chargeAmount, chargeCard, chargeCardId, chargeDesc,
    charging, chatGalleryMedia, closeConv, companyId, companyInfo, composeChannel, contact,
    conversations, copyConvLink, couponAmount, couponCode, couponExpiry, couponOneTime,
    couponSaving, couponType, ctxMenu, deliverToCustomer, downloadInvoice, editOrder, editOrderData,
    editOrderLoading, editOrderSaving, editingScheduled, emailGalleryMedia, filteredConvs, filters,
    filtersCustomDates, folderBtnInbox, forwardBusy, forwardPicked, forwardResults, forwardSearch,
    forwardTo, forwarding, galleryFolder, galleryFolders, galleryIndex, galleryItems, gallerySearch,
    gallerySelected, invoicePreview, invoiceSending, loadConversationExtras, loadConversations,
    loadGalleryFolder, markRead, mergeConversation, mrAccept, mrExpiry, mrMaxFiles, mrPrompt,
    mrSaving, myName, orderGallery, orderPrefillCart, outboundChannel, outlets, outletsForSchedule,
    payAddress, payAmount, payDesc, paySending, pickerItems, pickupModal, pickupSending, pinnedIds,
    podFiles, podNote, podSending, productError, productQuery, productSearchedFor, productSearching, productSent,
    products, refundOrder, reopenConv, reply, resetFilters, saveCard, saveOrderEdit, saveSchedule,
    saveScheduledEdit, savedCards, schedule, scheduleMessage, scheduleMsgAt, scheduledBusy,
    scheduling, schedulingMsg, searchForwardTargets, searchProducts, selectConversation, selected,
    sendCoupon, sendInteractive, sendInvoiceInChat, sendMediaRequest, sendPayment, sendPicker,
    sendPickupReady, sendProductMessage, sendProofOfDelivery, sendTrackingMessage,
    setAbandonedCarts, setChargeAmount, setChargeCardId, setChargeDesc, setContact, setConvHasSale,
    setCouponAmount, setCouponCode, setCouponExpiry, setCouponOneTime, setCouponType, setCtxMenu,
    setEditOrder, setEditOrderData, setEditingScheduled, setFilters, setFiltersCustomDates,
    setForwardPicked, setForwarding, setGalleryIndex, setGallerySearch, setGallerySelected,
    setInvoicePreview, setMrAccept, setMrExpiry, setMrMaxFiles, setMrPrompt, setOrderGallery,
    setOrderPrefillCart, setPayAddress, setPayAmount, setPayDesc, setPickupModal, setPodFiles,
    setPodNote, setProductQuery, setRefundOrder, setSchedule, setScheduleMsgAt, setSendPicker,
    setShowAddContact, setShowChargeCard, setShowCompose, setShowCoupon, setShowCreateOrder,
    setShowDeliveryPanel, setShowDialer, setShowDoa, setShowFilters, setShowInboxQR,
    setShowMediaPicker, setShowMediaRequest, setShowMergePicker, setShowPod, setShowProducts,
    setShowRecordSale, setShowSchedule, setShowScheduleMsg, setShowTimeline, setShowTracking,
    setStoryView, showAddContact, showChargeCard, showCompose, showCoupon, showCreateOrder,
    showDeliveryPanel, showDialer, showDoa, showFilters, showInboxQR, showMediaPicker,
    showMediaRequest, showMergePicker, showPod, showProducts, showRecordSale, showSchedule,
    showScheduleMsg, showTimeline, showToast, showTracking, snoozeConv, stageQrMedia,
    stageSelectedMedia, storyView, teamMembers, toast, togglePin, user,
  } = useInbox()
  // A DOA claim was processed: reload the conversation (its claim note, the
  // order's new status) once the panel closes. Reloading straight away closed
  // the panel before its "Claim sorted" screen could show.
  const doaDone = useRef(false)
  return (
    <>
      {/* Forward media to another contact */}
      {forwarding && (
        <div onClick={() => setForwarding(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 360, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 420, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto', background: '#fff', borderRadius: 18, padding: 22 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Forward to…</h3>

            {forwarding.length === 1 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, background: 'var(--canvas)', marginBottom: 16 }}>
                {forwarding[0].kind === 'video'
                  ? <video src={toPublicUrl(forwarding[0].url)} style={{ width: 46, height: 46, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                  : <img src={toPublicUrl(forwarding[0].thumbUrl || forwarding[0].url)} alt="" style={{ width: 46, height: 46, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
                <span style={{ fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {forwarding[0].name || (forwarding[0].kind === 'video' ? 'Video' : 'Photo')}
                </span>
              </div>
            ) : (
              <div style={{ padding: 10, borderRadius: 10, background: 'var(--canvas)', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{forwardPicked.filter(Boolean).length} of {forwarding.length} selected</span>
                  <span style={{ fontSize: 11.5, color: 'var(--slate)' }}>Tap to leave one out</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))', gap: 6 }}>
                  {forwarding.map((a, i) => {
                    const on = !!forwardPicked[i]
                    return (
                      <button key={i} type="button" aria-pressed={on} aria-label={`${on ? 'Leave out' : 'Include'} ${a.name || (a.kind === 'video' ? 'video' : 'photo')} ${i + 1}`}
                        onClick={() => setForwardPicked(p => p.map((v, j) => j === i ? !v : v))}
                        style={{ position: 'relative', aspectRatio: '1', padding: 0, border: 'none', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: '#e5e7eb', outline: on ? '2px solid var(--coral)' : 'none', outlineOffset: -2 }}>
                        {a.kind === 'video' && !a.thumbUrl
                          ? <video src={toPublicUrl(a.url) + '#t=0.1'} preload="metadata" muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: on ? 1 : 0.4 }} />
                          : <img src={toPublicUrl(a.thumbUrl || a.url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: on ? 1 : 0.4 }} />}
                        <span style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? 'var(--coral)' : 'rgba(255,255,255,0.85)', border: on ? 'none' : '1.5px solid #a1a1aa', color: '#fff' }}>
                          {on && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <input autoFocus value={forwardSearch}
              onChange={e => searchForwardTargets(e.target.value)}
              placeholder="Search contacts by name, email or phone…"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, marginBottom: 12, boxSizing: 'border-box' }} />

            {forwardSearch.trim().length < 2 ? (
              <p style={{ fontSize: 13, color: 'var(--slate)', textAlign: 'center', padding: 20 }}>Type at least 2 characters.</p>
            ) : forwardResults.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--slate)', textAlign: 'center', padding: 20 }}>No contacts match.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {forwardResults.map(c => (
                  <button key={c.id} type="button" onClick={() => forwardTo(c)} disabled={forwardBusy || !forwardPicked.some(Boolean)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer' }}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{c.name || 'No name'}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--slate)' }}>{[c.email, c.phone].filter(Boolean).join(' · ')}</span>
                    </span>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
                  </button>
                ))}
              </div>
            )}

            <button onClick={() => setForwarding(null)}
              style={{ width: '100%', marginTop: 16, padding: '10px 0', borderRadius: 10, background: '#fff', color: 'var(--slate)', border: '1px solid var(--border)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Schedule a delivery */}
      {showScheduleMsg && selected && (
        <div onClick={() => setShowScheduleMsg(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 320, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 420, maxWidth: '95vw', background: '#fff', borderRadius: 18, padding: 24 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>Schedule message</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>
              Sends your reply automatically at the chosen time, on this conversation&rsquo;s channel.
            </p>
            <div style={{ fontSize: 13, color: 'var(--ink)', background: 'var(--canvas)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', marginBottom: 14, maxHeight: 90, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
              {reply.trim() || <span style={{ color: 'var(--slate)' }}>No message typed.</span>}
            </div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Send at</label>
            <input type="datetime-local" value={scheduleMsgAt} onChange={e => setScheduleMsgAt(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, marginBottom: 18 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowScheduleMsg(false)}
                style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--slate)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button type="button" onClick={scheduleMessage} disabled={schedulingMsg || !reply.trim()}
                style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: (schedulingMsg || !reply.trim()) ? 'default' : 'pointer', opacity: (schedulingMsg || !reply.trim()) ? 0.6 : 1 }}>
                {schedulingMsg ? 'Scheduling…' : 'Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit a scheduled reply */}
      {editingScheduled && selected && (
        <div onClick={() => setEditingScheduled(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 320, padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 460, maxWidth: '100%', background: '#fff', borderRadius: 18, padding: 22, boxSizing: 'border-box' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>Edit scheduled message</h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>Change the wording or the time. It still sends on this conversation&rsquo;s channel.</p>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Message</label>
            <textarea value={editingScheduled.message} autoFocus rows={5}
              onChange={e => setEditingScheduled(s => (s ? { ...s, message: e.target.value } : s))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, lineHeight: 1.5, resize: 'vertical', marginBottom: 14, boxSizing: 'border-box', fontFamily: 'inherit' }} />
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Send at</label>
            <input type="datetime-local" value={editingScheduled.at}
              onChange={e => setEditingScheduled(s => (s ? { ...s, at: e.target.value } : s))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, marginBottom: 18, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setEditingScheduled(null)}
                style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--slate)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button type="button" onClick={saveScheduledEdit} disabled={!!scheduledBusy || !editingScheduled.message.trim()}
                style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', opacity: (scheduledBusy || !editingScheduled.message.trim()) ? 0.6 : 1 }}>
                {scheduledBusy === editingScheduled.id ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSchedule && selected && (
        <div onClick={() => setShowSchedule(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 320, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 440, maxWidth: '95vw', maxHeight: '88vh', overflowY: 'auto', background: '#fff', borderRadius: 18, padding: 24 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>Schedule delivery</h3>
            <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>
              Books it into the team calendar so every outlet can see the run{contact?.name ? `, for ${contact.name}` : ''}.
            </p>

            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Date</label>
            <input type="date" value={schedule.date}
              onChange={e => setSchedule({ ...schedule, date: e.target.value })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, marginBottom: 14, boxSizing: 'border-box' }} />

            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Time window</label>
            <div style={{ display: 'flex', gap: 5, marginBottom: 10, flexWrap: 'wrap' }}>
              {['9am – 12pm', '12pm – 3pm', '3pm – 6pm', 'Anytime'].map(w => (
                <button key={w} type="button" onClick={() => setSchedule({ ...schedule, time_window: w })}
                  style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${schedule.time_window === w ? 'var(--coral)' : 'var(--border)'}`, background: schedule.time_window === w ? 'var(--peach)' : '#fff', color: schedule.time_window === w ? 'var(--coral)' : 'var(--slate)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                  {w}
                </button>
              ))}
            </div>
            <input value={schedule.time_window} placeholder="Or type a custom window"
              onChange={e => setSchedule({ ...schedule, time_window: e.target.value })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, marginBottom: 14, boxSizing: 'border-box' }} />

            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Delivery address</label>
            <input value={schedule.address} placeholder="5 Clunes Avenue, Dallas VIC"
              onChange={e => setSchedule({ ...schedule, address: e.target.value })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, marginBottom: 14, boxSizing: 'border-box' }} />

            {outletsForSchedule.length > 0 && (
              <>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Delivering from</label>
                <select value={schedule.location_id}
                  onChange={e => setSchedule({ ...schedule, location_id: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, marginBottom: 14, boxSizing: 'border-box', background: '#fff' }}>
                  <option value="">Any outlet</option>
                  {outletsForSchedule.map(o => <option key={o.id} value={o.id}>{o.label || o.suburb}</option>)}
                </select>
              </>
            )}

            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Notes for the team</label>
            <textarea value={schedule.notes} placeholder="Heavy — two people. Gate code 1234."
              onChange={e => setSchedule({ ...schedule, notes: e.target.value })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, minHeight: 64, resize: 'vertical', marginBottom: 14, boxSizing: 'border-box', fontFamily: 'inherit' }} />

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <input type="checkbox" checked={schedule.notify}
                onChange={e => setSchedule({ ...schedule, notify: e.target.checked })}
                style={{ width: 17, height: 17, accentColor: 'var(--coral)' }} />
              <span style={{ fontSize: 13.5, color: 'var(--ink)' }}>Tell the customer the date and window</span>
            </label>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setShowSchedule(false)}
                style={{ flex: 1, padding: '11px 0', borderRadius: 10, background: '#fff', color: 'var(--slate)', border: '1px solid var(--border)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button type="button" onClick={saveSchedule} disabled={!schedule.date || scheduling}
                style={{ flex: 2, padding: '11px 0', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: (!schedule.date || scheduling) ? 0.6 : 1 }}>
                {scheduling ? 'Scheduling…' : 'Schedule delivery'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product search — look a product up and send its price or buy link.
          No scrim: the chat stays usable beside it. Above the Feedback tab and
          Colvy orb; the toast (same layer, later in the page) still shows on top. */}
      {showProducts && selected && (() => {
        const q = productQuery.trim()
        const pending = q.length >= 2 && productSearchedFor !== q && !productError
        const noMatch = q.length >= 2 && !pending && !productSearching && !productError && products.length === 0
        // WooCommerce returns prices like "17.9500" — show 2 decimals ($17.95).
        const fmtPrice = (v: any) => { const n = parseFloat(v); return isNaN(n) ? (v ?? '') : n.toFixed(2) }
        return (
          <div className="sk-scrim side ps-dock" style={{ '--sk-z': 9999 } as React.CSSProperties}>
            <SkStyle />
            <div className="sk side ps" role="dialog" aria-labelledby="ps-title" style={{ '--sk-w': '440px' } as React.CSSProperties}
              onKeyDown={e => { if (e.key === 'Escape') setShowProducts(false) }}>
              <div className="sk-head">
                <span className="sk-badge" aria-hidden>{PS_ICON.tag}</span>
                <div style={{ minWidth: 0 }}>
                  <h2 id="ps-title">Product search</h2>
                  <p className="sk-sub">Send a price or a buy link without leaving the chat.</p>
                </div>
                <SkClose onClick={() => setShowProducts(false)} />
              </div>

              <div className="ps-search">
                <label className="sk-field">
                  {productSearching ? <span className="ps-spin" aria-hidden /> : SkIcon.search}
                  <input autoFocus value={productQuery} onChange={e => setProductQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') searchProducts() }}
                    placeholder="Product name or SKU" aria-label="Search products" enterKeyHint="search" />
                  {productQuery && (
                    <button type="button" className="ps-clear" onClick={() => setProductQuery('')} aria-label="Clear search">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  )}
                </label>
              </div>

              <div className="sk-body" aria-live="polite" aria-busy={productSearching || pending}>
                {productError && <p className="sk-err" role="alert" style={{ marginTop: 0 }}>{productError}</p>}

                {products.length === 0 && (productSearching || pending) && (
                  <div className="ps-list" aria-hidden>
                    {[0, 1, 2].map(i => (
                      <div key={i} className="ps-card ps-skel">
                        <div className="ps-top"><span className="ps-img" /><div className="ps-info"><i style={{ width: '70%' }} /><i style={{ width: '35%', height: 16 }} /><i style={{ width: '50%' }} /></div></div>
                      </div>
                    ))}
                  </div>
                )}

                {products.length === 0 && !productSearching && !pending && !productError && (
                  <div className="ps-empty">
                    <span className="ps-empty-ic" aria-hidden>{noMatch ? SkIcon.search : PS_ICON.box}</span>
                    <b>{noMatch ? <>Nothing matched &ldquo;{q}&rdquo;</> : 'Find a product'}</b>
                    <span>{noMatch ? 'Try fewer words, or search by SKU.' : 'Type a name or SKU. Results show up as you type.'}</span>
                  </div>
                )}

                {products.length > 0 && (
                  <>
                    <p className="ps-count">
                      {products.length >= 20 ? 'Top 20 matches' : `${products.length} ${products.length === 1 ? 'match' : 'matches'}`}
                      {productSearchedFor && <> for <b>&ldquo;{productSearchedFor}&rdquo;</b></>}
                    </p>
                    <div className={`ps-list${productSearching || pending ? ' stale' : ''}`}>
                      {products.map(p => {
                        const onSale = p.on_sale && p.sale_price
                        const price = onSale ? p.sale_price : (p.price || p.regular_price)
                        const stock = p.stock_status === 'instock' ? 'in' : p.stock_status === 'onbackorder' ? 'back' : 'out'
                        const stockLabel = stock === 'in'
                          ? (p.manage_stock && p.stock_quantity != null ? `${p.stock_quantity} in stock` : 'In stock')
                          : stock === 'back' ? 'On backorder' : 'Out of stock'
                        const sent = (kind: string) => productSent === `${p.id}-${kind}`
                        return (
                          <div key={p.id} className={`ps-card${stock === 'out' ? ' out' : ''}`}>
                            <div className="ps-top">
                              <span className="ps-img">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {p.image ? <img src={p.image} alt="" loading="lazy" /> : PS_ICON.box}
                              </span>
                              <div className="ps-info">
                                <b className="ps-name">{dec(p.name)}</b>
                                <div className="ps-price">
                                  <span className="ps-amt">${fmtPrice(price)}</span>
                                  {onSale && <s>${fmtPrice(p.regular_price)}</s>}
                                  {onSale && <span className="ps-sale">Sale</span>}
                                </div>
                                <div className="ps-meta">
                                  <span className={`ps-stock ${stock}`}><i aria-hidden />{stockLabel}</span>
                                  {p.sku && <span className="ps-sku">SKU {p.sku}</span>}
                                </div>
                              </div>
                            </div>

                            {Array.isArray(p.stores) && p.stores.length > 0 && (
                              <div className="ps-stores" aria-label="Stock by store">
                                {p.stores.map((s: any) => (
                                  <span key={s.store} className={s.available > 0 ? 'has' : ''} title={`${s.available > 0 ? s.available : 'None'} at ${s.store}`}>
                                    <i aria-hidden /><em>{s.store}</em><b>{s.available > 0 ? s.available : 0}</b>
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="ps-acts">
                              <button type="button" className={`ps-act${sent('price') ? ' sent' : ''}`} onClick={() => sendProductMessage(p, 'price')}>
                                {sent('price') ? PS_ICON.check : PS_ICON.tag}{sent('price') ? 'Sent' : 'Send price'}
                              </button>
                              <button type="button" className={`ps-act${sent('link') ? ' sent' : ''}`} onClick={() => sendProductMessage(p, 'link')} disabled={!p.permalink}
                                title={p.permalink ? 'Send a link they can buy from' : 'No product URL available'}>
                                {sent('link') ? PS_ICON.check : PS_ICON.link}{sent('link') ? 'Sent' : 'Send link'}
                              </button>
                              <button type="button" className={`ps-act${sent('both') ? ' sent' : ''}`} onClick={() => sendProductMessage(p, 'both')} disabled={!p.permalink}
                                title={p.permalink ? 'Send the price and a buy link together' : 'No product URL available'}>
                                {sent('both') ? PS_ICON.check : null}{sent('both') ? 'Sent' : 'Both'}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
              <style>{PS_CSS}</style>
            </div>
          </div>
        )
      })()}

      {/* Proof of Delivery panel */}
      {pickupModal && (() => {
        const loc = outlets.find(o => o.id === pickupModal.locationId)
        const locName = loc ? [loc.label, loc.suburb].filter(Boolean).join(', ') : 'our store'
        const orderNo = pickupModal.payload.order_number || pickupModal.payload.order_id
        const first = contact?.name ? String(contact.name).split(' ')[0] : ''
        const preview = `Hi${first ? ' ' + first : ''}, your order #${orderNo} is ready to be collected at: ${locName}. See you soon!`
        return (
          <div className="sk-scrim" style={{ '--sk-z': 1000 } as React.CSSProperties} onClick={() => !pickupSending && setPickupModal(null)}>
            <SkStyle />
            <div className="sk" role="dialog" aria-modal="true" aria-labelledby="pk-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape' && !pickupSending) setPickupModal(null) }}>
              <div className="sk-head">
                <span className="sk-badge" aria-hidden>{SkIcon.box}</span>
                <div style={{ minWidth: 0 }}>
                  <h3 id="pk-title">Ready for pickup</h3>
                  <p className="sk-sub">Confirm where they collect it, then text the customer.</p>
                </div>
                <SkClose onClick={() => !pickupSending && setPickupModal(null)} />
              </div>
              <label className="sk-lbl" htmlFor="pk-loc">Pickup location</label>
              {outlets.length > 0 ? (
                <select id="pk-loc" className="sk-in" value={pickupModal.locationId} onChange={e => setPickupModal(m => m ? { ...m, locationId: e.target.value } : m)}>
                  {outlets.map(o => <option key={o.id} value={o.id}>{[o.label, o.suburb].filter(Boolean).join(' · ')}{o.is_primary ? ' (default)' : ''}</option>)}
                </select>
              ) : (
                <p className="sk-card" style={{ margin: 0, fontSize: 13, color: '#b45309', background: '#fffbeb' }}>No store locations set up yet. Add one in Settings to name the pickup spot; until then the message says &ldquo;our store&rdquo;.</p>
              )}
              <span className="sk-lbl">Message preview</span>
              <div className="sk-card pk-bubble">{preview}</div>
              <div className="sk-actions">
                <button type="button" className="sk-btn" onClick={() => setPickupModal(null)} disabled={pickupSending}>Cancel</button>
                <button type="button" className="sk-btn primary" onClick={sendPickupReady} disabled={pickupSending}>
                  {pickupSending ? 'Sending…' : 'Send SMS'}
                </button>
              </div>
              <style>{`.pk-bubble{position:relative;border-radius:20px 20px 6px 20px;background:var(--peach,#fff4f1);font-size:14px;line-height:1.5;color:var(--ink)}`}</style>
            </div>
          </div>
        )
      })()}

      {invoicePreview && (
        <div onClick={() => { if (!invoiceSending) { URL.revokeObjectURL(invoicePreview.url); setInvoicePreview(null) } }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 14, width: 'min(680px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>Invoice #{invoicePreview.orderNumber}</h3>
              <button type="button" onClick={() => { URL.revokeObjectURL(invoicePreview.url); setInvoicePreview(null) }}
                style={{ background: 'none', border: 'none', fontSize: 24, lineHeight: 1, color: 'var(--slate)', cursor: 'pointer' }}>×</button>
            </div>
            <iframe src={invoicePreview.url} title="Invoice preview" style={{ flex: 1, width: '100%', border: 'none', minHeight: 420, background: '#f5f5f5' }} />
            <div style={{ display: 'flex', gap: 10, padding: '14px 18px', borderTop: '1px solid var(--border)' }}>
              <button type="button" onClick={downloadInvoice} disabled={invoiceSending}
                style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
                Download
              </button>
              <button type="button" onClick={sendInvoiceInChat} disabled={invoiceSending || !selected}
                style={{ flex: 2, padding: '11px 0', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', opacity: invoiceSending ? 0.6 : 1 }}>
                {invoiceSending ? 'Sending…' : 'Send in chat'}
              </button>
            </div>
          </div>
        </div>
      )}

      {orderGallery && (
        <div onClick={() => setOrderGallery(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.86)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <button type="button" onClick={() => setOrderGallery(null)}
            style={{ position: 'absolute', top: 18, right: 24, background: 'none', border: 'none', color: '#fff', fontSize: 30, lineHeight: 1, cursor: 'pointer' }}>×</button>
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, maxWidth: '92vw' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {orderGallery.images.length > 1 && (
                <button type="button" onClick={() => setOrderGallery(g => g ? { ...g, index: (g.index - 1 + g.images.length) % g.images.length } : g)}
                  style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 40, height: 40, borderRadius: '50%', fontSize: 22, cursor: 'pointer', flexShrink: 0 }}>‹</button>
              )}
              <ResilientImage src={orderGallery.images[orderGallery.index].src}
                fallback={<div style={{ width: 320, height: 320, maxWidth: '80vw', maxHeight: '68vh', borderRadius: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>Image unavailable</div>}
                style={{ maxWidth: '80vw', maxHeight: '68vh', objectFit: 'contain', borderRadius: 10, background: '#fff' }} />
              {orderGallery.images.length > 1 && (
                <button type="button" onClick={() => setOrderGallery(g => g ? { ...g, index: (g.index + 1) % g.images.length } : g)}
                  style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 40, height: 40, borderRadius: '50%', fontSize: 22, cursor: 'pointer', flexShrink: 0 }}>›</button>
              )}
            </div>
            <p style={{ color: '#fff', fontSize: 13.5, margin: 0, textAlign: 'center', maxWidth: '80vw' }}>
              {orderGallery.images[orderGallery.index].name}
              {orderGallery.images.length > 1 && <span style={{ color: '#9ca3af', marginLeft: 8 }}>{orderGallery.index + 1} / {orderGallery.images.length}</span>}
            </p>
            {orderGallery.images.length > 1 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '90vw' }}>
                {orderGallery.images.map((im, i) => (
                  <ResilientImage key={i} src={im.src} onClick={() => setOrderGallery(g => g ? { ...g, index: i } : g)}
                    fallback={<div style={{ width: 50, height: 50, borderRadius: 7, background: 'rgba(255,255,255,0.12)', border: i === orderGallery.index ? '2px solid var(--coral)' : '2px solid transparent' }} />}
                    style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 7, cursor: 'pointer', border: i === orderGallery.index ? '2px solid var(--coral)' : '2px solid transparent', opacity: i === orderGallery.index ? 1 : 0.55 }} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {refundOrder && companyId && (
        <RefundOrderModal companyId={companyId} order={refundOrder} accent={companyInfo?.accent_color || 'var(--coral)'}
          onClose={() => setRefundOrder(null)}
          onDone={(amt, reason) => { const o = refundOrder; setRefundOrder(null); afterOrderRefund(o, amt, reason) }} />
      )}

      {showPod && (
        <div className="sk-scrim" style={{ '--sk-z': 320 } as React.CSSProperties} onClick={() => !podSending && setShowPod(false)}>
          <SkStyle />
          <div className="sk" role="dialog" aria-modal="true" aria-labelledby="pod-title" style={{ '--sk-w': '480px' } as React.CSSProperties} onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape' && !podSending) setShowPod(false) }}>
            <div className="sk-head">
              <span className="sk-badge" aria-hidden>{SkIcon.box}</span>
              <div style={{ minWidth: 0 }}>
                <h3 id="pod-title">Proof of delivery</h3>
                <p className="sk-sub">Send a photo of the delivered parcel. It&rsquo;s marked as delivered too.</p>
              </div>
              <SkClose onClick={() => !podSending && setShowPod(false)} />
            </div>

            <span className="sk-lbl">Delivery photos</span>
            <SkFiles files={podFiles} accept="image/*,video/*" label="Add photos or video" hint="Tap to choose, or drop them here"
              onAdd={files => setPodFiles(prev => [...prev, ...files])}
              onRemove={i => setPodFiles(prev => prev.filter((_, j) => j !== i))} />

            <label className="sk-lbl" htmlFor="pod-note">Message to the customer</label>
            {/* Pre-written openers: tap one to drop it in, then edit. */}
            <div className="sk-chips" style={{ marginBottom: 10 }}>
              {[
                ['Delivered', 'Your order has been delivered. Attached is the proof of delivery. Thank you!'],
                ['Safe spot', 'Hi! Your parcel has just been delivered and left in a safe spot. Photo attached.'],
                ['For your records', 'Delivery complete 🐟 Here\u2019s a photo for your records. Reply here if anything\u2019s not right.'],
                ['Arrived today', 'Your order arrived today. See the attached photo. Thanks for shopping with us!'],
              ].map(([name, tpl]) => (
                <button key={name} type="button" className={`sk-chip${podNote === tpl ? ' on' : ''}`} onClick={() => setPodNote(tpl)} title={tpl}><span>{name}</span></button>
              ))}
            </div>
            <textarea id="pod-note" className="sk-in" value={podNote} onChange={e => setPodNote(e.target.value)} rows={4}
              placeholder="Your order has been delivered. Attached is the proof of delivery. Thank you!" />

            <div className="sk-actions">
              <button type="button" className="sk-btn" onClick={() => setShowPod(false)} disabled={podSending}>Cancel</button>
              <button type="button" className="sk-btn primary" onClick={sendProofOfDelivery} disabled={podSending}>
                {podSending ? 'Sending…' : 'Send proof of delivery'}
              </button>
            </div>
            <p className="sk-note" style={{ textAlign: 'center' }}>
              Sent in the chat, texted to their mobile if we have one, and the delivery is marked as delivered.
            </p>
          </div>
        </div>
      )}

      {/* Delivery calendar slide-out */}
      {showDeliveryPanel && contact && (
        <DeliveryPanel
          companyId={companyId}
          contact={contact}
          onClose={() => setShowDeliveryPanel(false)}
          onSaved={(patch: any) => setContact((c: any) => ({ ...c, ...patch }))}
        />
      )}

      {showTimeline && contact && (
        <ContactTimeline contactId={contact.id} contactName={contact.name || contact.email || undefined}
          onClose={() => setShowTimeline(false)}
          onOpenConversation={async (id: string) => {
            // Open that thread right here rather than reloading the inbox.
            setShowTimeline(false)
            if (id === selected?.id) return
            try {
              const { data } = await supabase.from('conversations').select('*').eq('id', id).maybeSingle()
              if (data) await selectConversation(data)
            } catch {}
          }} />
      )}

      {showDialer && (
        <Dialer companyId={companyId} agentName={myName}
          onClose={() => setShowDialer(false)} />
      )}

      {showCompose && companyId && (
        <ComposeMessage
          companyId={companyId}
          senderName={myName}
          onClose={() => setShowCompose(false)}
          onStarted={(convId) => { setShowCompose(false); loadConversations(); }}
        />
      )}

      {showAddContact && companyId && (
        <AddContactModal
          companyId={companyId}
          onClose={() => setShowAddContact(false)}
          onCreated={() => { setShowAddContact(false); loadConversations(); showToast('Contact added'); setShowCompose(true) }}
        />
      )}

      {showInboxQR && companyId && (
        <PhoneUploadQR
          companyId={companyId}
          onUploaded={(items) => stageQrMedia(items)}
          onClose={() => setShowInboxQR(false)}
        />
      )}

      {showTracking && companyId && selected && (
        <SendTrackingModal
          companyId={companyId}
          conversationId={selected.id}
          contactId={contact?.id || null}
          orderNumber={(contact as any)?.last_order_number || null}
          senderName={myName}
          onClose={() => setShowTracking(false)}
          onSent={async ({ text }) => {
            setShowTracking(false)
            await sendTrackingMessage(text)
          }}
        />
      )}

      {/* Filter panel (Coax style) */}
      {showFilters && (() => {
        // Sellio-style filters: pills for the short lists, grey fields for the
        // long ones, quick date ranges, and a footer that says what you'll get.
        const set = (k: string, v: any) => setFilters({ ...filters, [k]: v })
        const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d) }
        const today = iso(new Date())
        const range = !filters.dateFrom && !filters.dateTo ? 'any'
          : filters.dateTo === today && filters.dateFrom === today ? 'today'
          : filters.dateTo === today && filters.dateFrom === daysAgo(7) ? '7'
          : filters.dateTo === today && filters.dateFrom === daysAgo(30) ? '30' : 'custom'
        const [customOpen, setCustomOpen] = [range === 'custom' || filtersCustomDates, setFiltersCustomDates]
        const chips = (k: string, opts: [string, string][]) => (
          <div className="ifl-chips">
            {opts.map(([v, label]) => (
              <button key={v || 'all'} type="button" aria-pressed={filters[k] === v} className={`il-chip${filters[k] === v ? ' on' : ''}`} onClick={() => set(k, v)}>{label}</button>
            ))}
          </div>
        )
        const n = filteredConvs.length
        return (
        <div className="ifl-wrap" onClick={() => setShowFilters(false)}>
          <style>{IFL_CSS}</style>
          <div className="ifl" role="dialog" aria-modal="true" aria-label="Filter conversations" onClick={e => e.stopPropagation()}>
            <div className="ifl-head">
              <h2>Filters{activeFilterCount > 0 && <span className="ifl-count">{activeFilterCount}</span>}</h2>
              <button type="button" className="ifl-x" onClick={() => setShowFilters(false)} aria-label="Close filters">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="ifl-body">
              <section>
                <p className="ifl-l">Last activity</p>
                <div className="ifl-chips">
                  {([['any', 'Any time'], ['today', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days']] as const).map(([k, label]) => (
                    <button key={k} type="button" aria-pressed={range === k && !customOpen} className={`il-chip${range === k && !customOpen ? ' on' : ''}`}
                      onClick={() => { setCustomOpen(false); setFilters({ ...filters, dateFrom: k === 'any' ? '' : k === 'today' ? today : daysAgo(Number(k)), dateTo: k === 'any' ? '' : today }) }}>{label}</button>
                  ))}
                  <button type="button" aria-pressed={customOpen} className={`il-chip${customOpen ? ' on' : ''}`} onClick={() => setCustomOpen(true)}>Custom</button>
                </div>
                {customOpen && (
                  <div className="ifl-dates">
                    <label><span>From</span><input type="date" value={filters.dateFrom} onChange={e => set('dateFrom', e.target.value)} /></label>
                    <label><span>To</span><input type="date" value={filters.dateTo} onChange={e => set('dateTo', e.target.value)} /></label>
                  </div>
                )}
              </section>

              <section>
                <p className="ifl-l">Channel</p>
                {chips('channel', [['', 'All'], ['chat', 'Live chat'], ['sms', 'SMS'], ['email', 'Email'], ['instagram', 'Instagram'], ['whatsapp', 'WhatsApp']])}
              </section>

              <section>
                <p className="ifl-l">Source</p>
                {chips('source', [['', 'Any'], ['chat', 'Live chat enquiry'], ['order', 'Order placed'], ['cart', 'Abandoned cart']])}
              </section>

              <section>
                <p className="ifl-l">Relationship</p>
                {chips('relationship', [['', 'Everyone'], ['customer', 'Customers'], ['supplier', 'Suppliers'], ['wholesaler', 'Wholesalers'], ['business', 'Business contacts']])}
              </section>

              <div className="ifl-two">
                <section>
                  <p className="ifl-l">Assigned to</p>
                  <select className="ifl-field" value={filters.assignedTo} onChange={e => set('assignedTo', e.target.value)}>
                    <option value="">Anyone</option>
                    <option value="__unassigned">Unassigned</option>
                    {teamMembers.map((t: any) => (
                      <option key={t.user_id || t.id} value={t.user_id || t.id}>{t.name || t.email}</option>
                    ))}
                  </select>
                </section>
                <section>
                  <p className="ifl-l">Order status</p>
                  <select className="ifl-field" value={filters.orderStatus} onChange={e => set('orderStatus', e.target.value)}>
                    <option value="">Any status</option>
                    <option value="pending">Placed (pending payment)</option>
                    <option value="processing">Processing</option>
                    <option value="on-hold">On hold</option>
                    <option value="completed">Completed</option>
                    <option value="refunded">Refunded</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="failed">Failed</option>
                  </select>
                </section>
              </div>

              <section>
                <p className="ifl-l">Bought</p>
                <div className="ifl-search">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7"/><line x1="20.5" y1="20.5" x2="16" y2="16"/></svg>
                  <input className="ifl-field" value={filters.purchased} onChange={e => set('purchased', e.target.value)} placeholder="A product name or SKU, e.g. Pleco or 1132" />
                </div>
                <p className="ifl-hint">Matches the customer’s order history.</p>
              </section>

              <section>
                <p className="ifl-l">Order</p>
                <div className="ifl-seg" role="tablist" aria-label="Order">
                  <span className="cmp-mode-thumb" aria-hidden style={{ transform: filters.oldestFirst ? 'translateX(100%)' : 'none' }} />
                  <button type="button" role="tab" aria-selected={!filters.oldestFirst} onClick={() => set('oldestFirst', false)}>Newest first</button>
                  <button type="button" role="tab" aria-selected={!!filters.oldestFirst} onClick={() => set('oldestFirst', true)}>Oldest first</button>
                </div>
              </section>
            </div>

            <div className="ifl-foot">
              <button type="button" className="ifl-reset" onClick={() => { resetFilters(); setFiltersCustomDates(false) }} disabled={activeFilterCount === 0}>Reset</button>
              <button type="button" className="ifl-go" onClick={() => setShowFilters(false)}>Show {n} conversation{n === 1 ? '' : 's'}</button>
            </div>
          </div>
        </div>
        )
      })()}

      {/* Right-click menu on a conversation */}
      {ctxMenu && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ position: 'fixed', top: Math.min(ctxMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 240), left: Math.min(ctxMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 210), width: 200, background: '#fff', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.16)', zIndex: 500, overflow: 'hidden', padding: '4px 0' }}>
          {([
            [pinnedIds.has(ctxMenu.conv.id) ? 'Unpin' : 'Pin to top', <svg key="p" width="15" height="15" viewBox="0 0 24 24" fill={pinnedIds.has(ctxMenu.conv.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14l-1.5-3V7a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7z"/></svg>, () => togglePin(ctxMenu.conv)],
            [ctxMenu.conv.is_unread ? 'Mark as read' : 'Mark as unread', <svg key="r" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>, () => markRead(ctxMenu.conv)],
            ['Open in new tab', <svg key="o" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>, () => window.open(`/admin/inbox?conversation=${ctxMenu.conv.id}`, '_blank')],
            ['Copy link', <svg key="c" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>, () => copyConvLink(ctxMenu.conv)],
            ['closed', 'resolved'].includes(String(ctxMenu.conv.status || ''))
              ? ['Open enquiry', <svg key="ro" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 3 3 9 9 9"/></svg>, () => reopenConv(ctxMenu.conv)]
              : ['Close enquiry', <svg key="x" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>, () => closeConv(ctxMenu.conv)],
          ] as any[]).map(([label, icon, fn]: any) => (
            <button key={label} type="button" onClick={() => { fn(); setCtxMenu(null) }}
              style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--canvas)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              <span style={{ color: 'var(--slate)', display: 'inline-flex' }}>{icon}</span>{label}
            </button>
          ))}

          <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
          <div style={{ padding: '4px 14px 6px' }}>
            <p style={{ margin: '0 0 5px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Snooze
            </p>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 4, 24].map(h => (
                <button key={h} type="button" onClick={() => { snoozeConv(ctxMenu.conv, h); setCtxMenu(null) }}
                  style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
                  {h === 24 ? '1d' : `${h}h`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Charge a saved card */}
      {showChargeCard && selected && (
        <div className="sk-scrim" style={{ '--sk-z': 200 } as React.CSSProperties} onClick={() => !charging && setShowChargeCard(false)}>
          <SkStyle />
          <div className="sk" role="dialog" aria-modal="true" aria-labelledby="cc-title" style={{ '--sk-w': '440px' } as React.CSSProperties} onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape' && !charging) setShowChargeCard(false) }}>
            <div className="sk-head">
              <span className="sk-badge" aria-hidden>
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
              </span>
              <div style={{ minWidth: 0 }}>
                <h3 id="cc-title">Charge a saved card</h3>
                <p className="sk-sub">Charges the card they have on file. They don&rsquo;t need to do anything.</p>
              </div>
              <SkClose onClick={() => !charging && setShowChargeCard(false)} />
            </div>

            {savedCards === null ? (
              <div aria-busy="true">
                <span className="sk-lbl">Card</span>
                <div className="cc-skel" style={{ height: 50, borderRadius: 16 }} />
                <p className="sk-note">Loading saved cards…</p>
                <style>{'.cc-skel{background:linear-gradient(90deg,var(--sk-fill) 25%,var(--sk-fill-2) 37%,var(--sk-fill) 63%);background-size:400% 100%;animation:ccSk 1.2s ease infinite}@keyframes ccSk{0%{background-position:100% 50%}100%{background-position:0 50%}}@media (prefers-reduced-motion: reduce){.cc-skel{animation:none}}'}</style>
              </div>
            ) : savedCards.length === 0 ? (
              <>
                <div className="sk-card" style={{ marginTop: 14 }}>
                  <p style={{ margin: 0, fontSize: 14, color: 'var(--ink)', lineHeight: 1.5 }}>
                    No saved card for this customer yet. Send them a secure Stripe link to save one first.
                  </p>
                </div>
                <div className="sk-actions">
                  <button type="button" className="sk-btn" onClick={() => setShowChargeCard(false)}>Cancel</button>
                  <button type="button" className="sk-btn primary" onClick={() => { setShowChargeCard(false); saveCard() }}>Send a save-card link</button>
                </div>
              </>
            ) : (
              <>
                <span className="sk-lbl">Card</span>
                <div className="cc-cards" role="radiogroup" aria-label="Card">
                  {savedCards.map(c => (
                    <button key={c.id} type="button" role="radio" aria-checked={chargeCardId === c.id} className={`cc-card${chargeCardId === c.id ? ' on' : ''}`} onClick={() => setChargeCardId(c.id)}>
                      <span className="cc-brand">{String(c.brand || 'card').toUpperCase()}</span>
                      <span className="sk-item-t"><b>•••• {c.last4}</b><small>Expires {String(c.exp_month).padStart(2, '0')}/{String(c.exp_year).slice(-2)}</small></span>
                      <span className="cc-radio" aria-hidden />
                    </button>
                  ))}
                </div>

                <label className="sk-lbl" htmlFor="cc-amt">Amount</label>
                <div className="sk-field">
                  <span className="sk-pre">$</span>
                  <input id="cc-amt" type="number" min="1" step="0.01" value={chargeAmount} onChange={e => setChargeAmount(e.target.value)} placeholder="49.95" inputMode="decimal" />
                  <span className="sk-pre" style={{ fontSize: 13 }}>AUD</span>
                </div>

                <label className="sk-lbl" htmlFor="cc-desc">What&rsquo;s this for?</label>
                <input id="cc-desc" className="sk-in" value={chargeDesc} onChange={e => setChargeDesc(e.target.value)} placeholder="Replacement part" />

                <div className="sk-actions">
                  <button type="button" className="sk-btn" onClick={() => setShowChargeCard(false)} disabled={charging}>Cancel</button>
                  <button type="button" className="sk-btn primary" onClick={chargeCard} disabled={!chargeAmount || charging}>
                    {charging ? 'Charging…' : `Charge $${chargeAmount || '0'}`}
                  </button>
                </div>
              </>
            )}
            <style>{`.cc-cards{display:flex;flex-direction:column;gap:8px}.cc-card{display:flex;align-items:center;gap:12px;width:100%;padding:11px 14px;border:none;border-radius:18px;background:var(--sk-fill);font:inherit;text-align:left;cursor:pointer;box-shadow:inset 0 0 0 1.5px transparent;transition:box-shadow .15s,background .15s}.cc-card.on{background:var(--card,#fff);box-shadow:inset 0 0 0 2px var(--coral,#ff7a6b)}.cc-brand{flex-shrink:0;min-width:46px;height:30px;padding:0 6px;border-radius:8px;background:var(--ink);color:var(--card,#fff);font-size:10px;font-weight:800;letter-spacing:.06em;display:inline-flex;align-items:center;justify-content:center}.cc-radio{width:20px;height:20px;flex-shrink:0;border-radius:50%;box-shadow:inset 0 0 0 2px var(--sk-fill-2);transition:box-shadow .15s}.cc-card.on .cc-radio{box-shadow:inset 0 0 0 6px var(--coral,#ff7a6b)}`}</style>
          </div>
        </div>
      )}

      {showDoa && selected && companyId && (
        <DoaPanel
          companyId={companyId}
          conversationId={selected.id}
          contactId={contact?.id}
          contact={contact}
          channel={['widget', 'chat'].includes(outboundChannel) ? null : outboundChannel}
          channelLabel={['widget', 'chat'].includes(outboundChannel) ? null : (CHANNEL_NAME[outboundChannel] || outboundChannel)}
          onDeliver={deliverToCustomer}
          onClose={() => { setShowDoa(false); if (doaDone.current && selected) { doaDone.current = false; selectConversation(selected) } }}
          onDone={() => { doaDone.current = true }}
        />
      )}

      {showCreateOrder && selected && companyId && (
        <CreateOrderPanel
          companyId={companyId}
          conversationId={selected.id}
          contactId={contact?.id}
          contact={contact}
          staffName={myName}
          staffId={user?.id}
          prefillCart={orderPrefillCart}
          channel={['widget', 'chat'].includes(outboundChannel) ? null : outboundChannel}
          channelLabel={['widget', 'chat'].includes(outboundChannel) ? null : (CHANNEL_NAME[outboundChannel] || outboundChannel)}
          onDeliver={deliverToCustomer}
          onClose={() => { setShowCreateOrder(false); setOrderPrefillCart(null) }}
          onCreated={(order) => {
            if (orderPrefillCart?.id) { (supabase as any).from('abandoned_carts').update({ status: 'recovered', recovered_order_id: order?.id }).eq('id', orderPrefillCart.id).then(() => {}, () => {}); setAbandonedCarts(prev => prev.filter(c => c.id !== orderPrefillCart.id)) }
            if (selected) selectConversation(selected)
          }}
        />
      )}

      {/* Media gallery picker */}
      {showMediaPicker && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowMediaPicker(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 720, maxWidth: '92vw', height: 560, maxHeight: '86vh', background: '#fff', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 7 }}>{Icon.media(16)} Send from gallery</h2>
              <button onClick={() => setShowMediaPicker(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--slate)' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
              <div style={{ width: 170, borderRight: '1px solid var(--border)', padding: 12, overflowY: 'auto', flexShrink: 0 }}>
                <button onClick={() => loadGalleryFolder(null)} style={folderBtnInbox(galleryFolder === null)}>All media</button>
                {(() => {
                  // Walk the parent_id tree in parent→children order with a depth
                  // tag, so nested folders show under their parent (indented ↳)
                  // instead of as a flat list — matching the Gallery sidebar.
                  const flatten = (parentId: any = null, depth = 0): { f: any; depth: number }[] =>
                    galleryFolders
                      .filter((f: any) => (f.parent_id || null) === (parentId || null))
                      .flatMap((f: any) => [{ f, depth }, ...flatten(f.id, depth + 1)])
                  return flatten().map(({ f, depth }) => (
                    <button key={f.id} onClick={() => loadGalleryFolder(f.id)}
                      style={{ ...folderBtnInbox(galleryFolder === f.id), paddingLeft: 10 + depth * 14 }}>
                      {depth ? '↳ ' : ''}{f.name}
                    </button>
                  ))
                })()}
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                  <input value={gallerySearch} onChange={e => { setGallerySearch(e.target.value); loadGalleryFolder(galleryFolder, e.target.value) }} placeholder="Search media…" style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
                  {galleryItems.length === 0 ? (
                    <p style={{ color: 'var(--slate)', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>No media here. Add some in the Gallery.</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
                      {galleryItems.map(item => {
                        const sel = gallerySelected.has(item.id)
                        return (
                          <div key={item.id} onClick={() => setGallerySelected(prev => { const n = new Set(prev); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n })}
                            style={{ position: 'relative', paddingTop: '75%', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', border: sel ? '3px solid var(--coral)' : '1px solid var(--border)', background: 'var(--canvas)' }}>
                            {(() => {
                              const imgThumb = item.thumbnail_url && item.thumbnail_url !== item.url && !/\.(mp4|mov|webm|m4v)(\?|$)/i.test(item.thumbnail_url) ? item.thumbnail_url : null
                              return item.kind === 'video'
                                ? (imgThumb
                                    ? <img src={imgThumb} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                    : <video src={item.url + '#t=0.1'} preload="metadata" muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />)
                                : <img src={imgThumb || item.url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                            })()}
                            {item.kind === 'video' && (
                              <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                                <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                                </span>
                              </span>
                            )}
                            {sel && <div style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, zIndex: 1 }}>✓</div>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>{gallerySelected.size} selected</span>
                  <button onClick={stageSelectedMedia} disabled={gallerySelected.size === 0}
                    style={{ padding: '9px 20px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 700, cursor: gallerySelected.size ? 'pointer' : 'not-allowed', opacity: gallerySelected.size ? 1 : 0.5 }}>
                    Attach {gallerySelected.size > 0 ? gallerySelected.size : ''}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Order editor panel */}
      {editOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', justifyContent: 'flex-end' }} onClick={() => setEditOrder(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 420, maxWidth: '100%', height: '100%', background: '#fff', overflowY: 'auto', boxShadow: '-8px 0 32px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Edit order {editOrderData ? `#${editOrderData.number}` : ''}</h2>
              <button onClick={() => setEditOrder(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--slate)' }}>✕</button>
            </div>
            <div style={{ padding: 20 }}>
              {editOrderLoading || !editOrderData ? (
                <p style={{ color: 'var(--slate)', fontSize: 13.5 }}>Loading order…</p>
              ) : (
                <>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>Items (set quantity to 0 to remove)</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                    {editOrderData.items.map((it: any) => (
                      <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 9 }}>
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>{dec(it.name)}</span>
                        <input type="number" min={0} value={it.quantity} onChange={e => setEditOrderData((d: any) => ({ ...d, items: d.items.map((x: any) => x.key === it.key ? { ...x, quantity: Math.max(0, parseInt(e.target.value) || 0) } : x) }))}
                          style={{ width: 60, padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13 }} />
                        <span style={{ fontSize: 12.5, fontWeight: 600, width: 60, textAlign: 'right' }}>${(parseFloat(it.total) || 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 5 }}>Status</label>
                  <select value={editOrderData.status} onChange={e => setEditOrderData((d: any) => ({ ...d, status: e.target.value }))}
                    style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, marginBottom: 14 }}>
                    {['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>

                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 5 }}>Add a customer note (optional)</label>
                  <textarea value={editOrderData.customerNote} onChange={e => setEditOrderData((d: any) => ({ ...d, customerNote: e.target.value }))} rows={2}
                    style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box', marginBottom: 18, resize: 'vertical', fontFamily: 'inherit' }} />

                  <button onClick={saveOrderEdit} disabled={editOrderSaving}
                    style={{ width: '100%', padding: '12px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    {editOrderSaving ? 'Saving…' : 'Save changes'}
                  </button>
                  <p style={{ fontSize: 11, color: 'var(--slate)', marginTop: 10, lineHeight: 1.5 }}>WooCommerce recalculates totals and tax when items change. Changing an item's quantity may adjust stock.</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Request Media popup */}
      {showRecordSale && selected && companyId && (
        <RecordSaleModal
          companyId={companyId}
          conversation={selected}
          contact={contact}
          teamMembers={teamMembers as any}
          currentUser={{ id: user?.id, name: myName }}
          currency="AUD"
          onClose={() => setShowRecordSale(false)}
          onSaved={() => { setConvHasSale(true); if (selected) loadConversationExtras(selected.id) }}
        />
      )}
      {showMediaRequest && selected && (
        <div className="sk-scrim" style={{ '--sk-z': 10000 } as React.CSSProperties} onClick={() => setShowMediaRequest(false)}>
          <SkStyle />
          <div className="sk" role="dialog" aria-modal="true" aria-labelledby="mr-title" style={{ '--sk-w': '480px' } as React.CSSProperties} onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setShowMediaRequest(false) }}>
            <div className="sk-head">
              <span className="sk-badge" aria-hidden>{Icon.media(20)}</span>
              <div style={{ minWidth: 0 }}>
                <h3 id="mr-title">Request photos or video</h3>
                <p className="sk-sub">A private upload link. They send photos, videos or PDFs at full quality, with no MMS squashing.</p>
              </div>
              <SkClose onClick={() => setShowMediaRequest(false)} />
            </div>

            <label className="sk-lbl" htmlFor="mr-prompt">What do you need?</label>
            <textarea id="mr-prompt" className="sk-in" value={mrPrompt} onChange={e => setMrPrompt(e.target.value)} rows={2} style={{ minHeight: 80 }} placeholder="e.g. Please upload clear photos of the damaged item and the box." />

            <span className="sk-lbl">They can send</span>
            <div className="sk-chips" role="group" aria-label="Accepted file types">
              {[['image', 'Photos'], ['video', 'Videos'], ['pdf', 'PDFs'], ['audio', 'Audio']].map(([k, label]) => {
                const on = mrAccept.includes(k)
                return (
                  <button key={k} type="button" className={`sk-chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => setMrAccept(prev => on ? prev.filter(x => x !== k) : [...prev, k])}>
                    {on && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>}
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>

            <div className="sk-row">
              <div>
                <label className="sk-lbl" htmlFor="mr-max">Up to</label>
                <div className="sk-field">
                  <input id="mr-max" type="number" min={1} value={mrMaxFiles} onChange={e => setMrMaxFiles(e.target.value)} inputMode="numeric" />
                  <span className="sk-pre" style={{ fontSize: 13.5 }}>files</span>
                </div>
              </div>
              <div>
                <label className="sk-lbl" htmlFor="mr-exp">Link expires</label>
                <select id="mr-exp" className="sk-in" value={mrExpiry} onChange={e => setMrExpiry(e.target.value)}>
                  <option value="24">In 24 hours</option>
                  <option value="72">In 3 days</option>
                  <option value="168">In 7 days</option>
                  <option value="720">In 30 days</option>
                  <option value="">Never</option>
                </select>
              </div>
            </div>

            <div className="sk-actions">
              <button type="button" className="sk-btn" onClick={() => setShowMediaRequest(false)}>Cancel</button>
              <button type="button" className="sk-btn primary" onClick={sendMediaRequest} disabled={mrSaving || mrAccept.length === 0}>{mrSaving ? 'Sending…' : 'Send request'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Send coupon panel */}
      {showCoupon && selected && (
        <div className="sk-scrim side" style={{ '--sk-z': 10000 } as React.CSSProperties} onClick={() => setShowCoupon(false)}>
          <SkStyle />
          <div className="sk side" role="dialog" aria-modal="true" aria-labelledby="cp-title" style={{ '--sk-w': '440px' } as React.CSSProperties} onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setShowCoupon(false) }}>
            <div className="sk-head">
              <span className="sk-badge" aria-hidden>{SkIcon.coupon}</span>
              <div style={{ minWidth: 0 }}>
                <h2 id="cp-title">Send a coupon</h2>
                <p className="sk-sub">Made in your store and sent in this chat.</p>
              </div>
              <SkClose onClick={() => setShowCoupon(false)} />
            </div>
            <div className="sk-body">
              {(() => {
                const amt = couponAmount.trim()
                const off = amt ? (couponType === 'percent' ? `${amt}% off` : `$${amt} off`) : couponType === 'percent' ? '10% off' : '$20 off'
                return (
                  <div className={`cp-ticket${amt ? '' : ' empty'}`} aria-hidden>
                    <span className="cp-ticket-off">{off}</span>
                    <span className="cp-ticket-code">{couponCode.trim() || 'AUTO-CODE'}</span>
                    <span className="cp-ticket-meta">{couponExpiry ? `Expires in ${couponExpiry} day${couponExpiry === '1' ? '' : 's'}` : 'No expiry'}{couponOneTime ? ' · one use' : ''}</span>
                  </div>
                )
              })()}

              <span className="sk-lbl">Discount</span>
              <div className="sk-row cp-disc">
                <div className="sk-seg" role="group" aria-label="Discount type">
                  <button type="button" className={couponType === 'fixed' ? 'on' : ''} aria-pressed={couponType === 'fixed'} onClick={() => setCouponType('fixed' as any)}>$ off</button>
                  <button type="button" className={couponType === 'percent' ? 'on' : ''} aria-pressed={couponType === 'percent'} onClick={() => setCouponType('percent' as any)}>% off</button>
                </div>
                <div className="sk-field">
                  <span className="sk-pre">{couponType === 'percent' ? '%' : '$'}</span>
                  <input value={couponAmount} onChange={e => setCouponAmount(e.target.value)} placeholder={couponType === 'percent' ? '10' : '20.00'} autoFocus inputMode="decimal" aria-label="Discount amount" />
                </div>
              </div>

              <label className="sk-lbl" htmlFor="cp-code">Code <span className="sk-opt">leave blank to make one up</span></label>
              <input id="cp-code" className="sk-in" value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())} placeholder="e.g. WELCOME10" style={{ letterSpacing: '.04em', fontWeight: 600 }} />

              <span className="sk-lbl">Expires <span className="sk-opt">optional</span></span>
              <div className="sk-chips">
                {[['', 'Never'], ['7', '7 days'], ['14', '14 days'], ['30', '30 days']].map(([v, label]) => (
                  <button key={label} type="button" className={`sk-chip${couponExpiry === v ? ' on' : ''}`} aria-pressed={couponExpiry === v} onClick={() => setCouponExpiry(v)}><span>{label}</span></button>
                ))}
                <span className="sk-field cp-days">
                  <input value={['', '7', '14', '30'].includes(couponExpiry) ? '' : couponExpiry} onChange={e => setCouponExpiry(e.target.value.replace(/\D/g, ''))} placeholder="Other" inputMode="numeric" aria-label="Expires in days" />
                  <span className="sk-pre" style={{ fontSize: 13 }}>days</span>
                </span>
              </div>

              <label className="sk-check box" style={{ marginTop: 16 }}>
                <input type="checkbox" checked={couponOneTime} onChange={e => setCouponOneTime(e.target.checked)} />
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>One-time use{contact?.email ? <span style={{ color: 'var(--sk-muted)' }}>, only for {contact.email}</span> : ''}</span>
              </label>
              {!contact?.email && <p className="sk-note">No email on this contact, so the coupon can&rsquo;t be tied to them.</p>}
            </div>
            <div className="sk-foot">
              <div className="sk-actions" style={{ marginTop: 0 }}>
                <button type="button" className="sk-btn" onClick={() => setShowCoupon(false)}>Cancel</button>
                <button type="button" className="sk-btn primary" onClick={sendCoupon} disabled={couponSaving || !couponAmount.trim()}>
                  {couponSaving ? 'Creating…' : 'Create & send coupon'}
                </button>
              </div>
            </div>
            <style>{CP_CSS}</style>
          </div>
        </div>
      )}

      {/* Media gallery / lightbox */}
      {galleryIndex !== null && (() => {
        const media: MediaItem[] = [...chatGalleryMedia(), ...emailGalleryMedia().map(({ key: _k, ...x }) => x)]
        return <MediaGallery items={media} index={galleryIndex} onClose={() => setGalleryIndex(null)} onIndex={setGalleryIndex} />
      })()}

      {/* Story-reply viewer — the story plus the thread's other media, so it
          reads like the normal gallery player with a thumbnail strip. */}
      {storyView && (
        <MediaGallery items={storyView.items} index={storyView.index}
          onClose={() => setStoryView(null)}
          onIndex={(i) => setStoryView(s => (s ? { ...s, index: i } : s))} />
      )}


      {/* Merge picker */}
      {showMergePicker && selected && (
        <div onClick={() => setShowMergePicker(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 420, maxWidth: '100%', maxHeight: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Merge a conversation into this one</p>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>Its messages move here; the other is archived.</p>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {conversations.filter(c => c.id !== selected.id).map(c => (
                <button key={c.id} type="button" onClick={() => mergeConversation(c.id)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 18px', border: 'none', borderBottom: '1px solid var(--border)', background: '#fff', cursor: 'pointer' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{(c as any).contacts?.name || dec(c.subject) || (c as any).sms_number || 'Visitor'}</div>
                  <div style={{ fontSize: 12, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{waitlistPreview(c.last_message) || 'No messages'}</div>
                </button>
              ))}
              {conversations.filter(c => c.id !== selected.id).length === 0 && (
                <p style={{ padding: 24, textAlign: 'center', color: 'var(--slate)', fontSize: 13 }}>No other conversations to merge.</p>
              )}
            </div>
          </div>
        </div>
      )}


      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#0d0d0d', color: '#fff', padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          {toast}
        </div>
      )}

      {/* Interactive send picker modal */}
      {sendPicker && (() => {
        const what = sendPicker === 'payment' ? null : sendPicker
        const icon = sendPicker === 'payment' ? Icon.payment() : sendPicker === 'poll' ? Icon.poll() : sendPicker === 'survey' ? Icon.survey() : Icon.form()
        return (
        <div className="sk-scrim" style={{ '--sk-z': 200 } as React.CSSProperties} onClick={() => setSendPicker(null)}>
          <SkStyle />
          <div className="sk" role="dialog" aria-modal="true" aria-labelledby="sp-title" style={{ '--sk-w': '460px' } as React.CSSProperties} onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setSendPicker(null) }}>
            <div className="sk-head">
              <span className="sk-badge" aria-hidden>{icon}</span>
              <div style={{ minWidth: 0 }}>
                <h3 id="sp-title">{sendPicker === 'payment' ? 'Send a payment link' : `Send a ${what}`}</h3>
                <p className="sk-sub">{sendPicker === 'payment' ? 'A secure Stripe checkout for any amount.' : `Pick one. It shows up in the chat for them to answer.`}</p>
              </div>
              <SkClose onClick={() => setSendPicker(null)} />
            </div>

            {sendPicker === 'payment' ? (
              <>
                <label className="sk-lbl" htmlFor="sp-amt">Amount</label>
                <div className="sk-field">
                  <span className="sk-pre">$</span>
                  <input id="sp-amt" type="number" min="1" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="49.00" inputMode="decimal" autoFocus />
                  <span className="sk-pre" style={{ fontSize: 13 }}>AUD</span>
                </div>
                <label className="sk-lbl" htmlFor="sp-desc">What&rsquo;s it for? <span className="sk-opt">optional</span></label>
                <input id="sp-desc" className="sk-in" value={payDesc} onChange={e => setPayDesc(e.target.value)} placeholder="Deposit for booking" />
                {(() => {
                  const def = (['none', 'billing', 'shipping'] as const).find(v => v === (companyInfo as any)?.payment_settings?.paylink_address) || 'none'
                  const cur = payAddress || def
                  return (
                    <>
                      <span className="sk-lbl">Ask for an address</span>
                      <div role="radiogroup" aria-label="Ask for an address" className="sk-seg">
                        {([['none', 'No'], ['billing', 'Billing'], ['shipping', 'Delivery']] as const).map(([v, label]) => (
                          <button key={v} type="button" role="radio" aria-checked={cur === v} onClick={() => setPayAddress(v)} className={cur === v ? 'on' : ''}>{label}</button>
                        ))}
                      </div>
                      <p className="sk-note">{cur === 'none' ? 'Stripe still asks for their email and the name on the card.' : cur === 'billing' ? 'They enter their billing address; it’s saved to their addresses.' : 'They enter where to deliver; it’s saved to their addresses.'}</p>
                    </>
                  )
                })()}
                <div className="sk-card" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 14, fontSize: 12.5, lineHeight: 1.5, color: 'var(--sk-muted)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  <span>Secure payment via Stripe. Card details are never stored by Colvy.{(companyInfo as any)?.payment_settings?.paylink_fill_contact !== false ? ' Their name and email fill in any blanks on the contact.' : ''}</span>
                </div>
                <div className="sk-actions">
                  <button type="button" className="sk-btn" onClick={() => setSendPicker(null)}>Cancel</button>
                  <button type="button" className="sk-btn primary" onClick={sendPayment} disabled={!payAmount || paySending}>
                    {(() => { const v = composeChannel(); const chat = v === 'widget' || v === 'chat'; return paySending ? (chat ? 'Sending…' : 'Making the link…') : chat ? 'Send payment request' : 'Add to reply' })()}
                  </button>
                </div>
              </>
            ) : pickerItems.length === 0 ? (
              <div className="sk-card" style={{ marginTop: 14, textAlign: 'center', padding: '24px 18px' }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>No {what}s yet</p>
                <p className="sk-note" style={{ margin: '6px 0 0' }}>Make one in {sendPicker === 'poll' ? 'Polls' : sendPicker === 'survey' ? 'Surveys' : 'Forms'} first, then send it from here.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                {pickerItems.map(item => (
                  <button key={item.id} type="button" className="sp-row" onClick={() => sendInteractive(sendPicker as any, item)}>
                    <span className="sp-row-ic" aria-hidden>{icon}</span>
                    <span className="sk-item-t"><b style={{ whiteSpace: 'normal' }}>{item.question || item.title || item.name || 'Untitled'}</b></span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--sk-muted)' }} aria-hidden><path d="m9 6 6 6-6 6" /></svg>
                  </button>
                ))}
              </div>
            )}
            <style>{`.sp-row{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;border:none;border-radius:18px;background:var(--sk-fill);font:inherit;text-align:left;cursor:pointer;color:var(--ink);transition:background .15s,transform .12s}.sp-row:hover{background:var(--sk-fill-2)}.sp-row:active{transform:scale(.99)}.sp-row-ic{width:36px;height:36px;flex-shrink:0;border-radius:12px;background:var(--card,#fff);color:var(--coral,#ff7a6b);display:inline-flex;align-items:center;justify-content:center}`}</style>
          </div>
        </div>
        )
      })()}
    </>
  )
}

const CP_CSS = `
.cp-ticket{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;margin:10px 0 2px;padding:22px 18px 18px;border-radius:22px;background:linear-gradient(135deg,color-mix(in srgb,var(--coral,#ff7a6b) 88%,#fff),color-mix(in srgb,var(--coral,#ff7a6b) 80%,#000));color:#fff;text-align:center;overflow:hidden;transition:opacity .2s}
.cp-ticket.empty{opacity:.55}
.cp-ticket::before,.cp-ticket::after{content:'';position:absolute;top:50%;width:22px;height:22px;margin-top:-11px;border-radius:50%;background:var(--card,#fff)}
.cp-ticket::before{left:-11px}.cp-ticket::after{right:-11px}
.cp-ticket-off{font-family:var(--font-display),-apple-system,sans-serif;font-size:30px;font-weight:800;letter-spacing:-.03em;line-height:1.05}
.cp-ticket-code{margin-top:4px;padding:5px 14px;border-radius:999px;border:1.5px dashed rgba(255,255,255,.7);font-size:13px;font-weight:700;letter-spacing:.08em;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cp-ticket-meta{font-size:12px;font-weight:600;opacity:.9}
.cp-disc .sk-seg{flex:0 0 150px;height:50px;box-sizing:border-box}
.cp-disc .sk-seg button{height:42px}
.cp-days{height:36px;width:112px;padding:0 12px;border-radius:999px}
.sk .cp-days input{font-size:13.5px}
`

const PS_ICON = {
  tag: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.3" /></svg>,
  link: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>,
  box: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="m3 8 9 5 9-5M12 13v8" /></svg>,
  check: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>,
}

const PS_CSS = `
.ps-dock{background:transparent;pointer-events:none;animation:none}
.ps-dock>.sk{pointer-events:auto}
.ps-search{flex-shrink:0;padding:2px 24px 14px}
.ps .sk-field{height:52px;color:var(--sk-muted)}
.ps-clear{width:24px;height:24px;flex-shrink:0;padding:0;border:none;border-radius:50%;background:var(--sk-fill-2);color:var(--sk-muted);display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.ps-clear:hover{color:var(--ink)}
.ps-spin{width:16px;height:16px;flex-shrink:0;box-sizing:border-box;border-radius:50%;border:2px solid var(--sk-fill-2);border-top-color:var(--coral,#ff7a6b);animation:psSpin .7s linear infinite}
.ps-count{margin:2px 4px 10px;font-size:12.5px;color:var(--sk-muted)}
.ps-count b{font-weight:600;color:var(--ink)}
.ps-list{display:flex;flex-direction:column;gap:10px;transition:opacity .15s}
.ps-list.stale{opacity:.55}
.ps-card{padding:12px;border-radius:22px;background:var(--sk-fill)}
.ps-top{display:flex;align-items:flex-start;gap:13px}
.ps-img{width:68px;height:68px;flex-shrink:0;border-radius:16px;overflow:hidden;background:var(--card,#fff);color:var(--sk-muted);display:inline-flex;align-items:center;justify-content:center}
.ps-img img{width:100%;height:100%;object-fit:cover;display:block}
.ps-card.out .ps-img img{filter:grayscale(.6);opacity:.7}
.ps-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;padding-top:2px}
.ps-name{font-size:14.5px;font-weight:650;line-height:1.3;color:var(--ink);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ps-price{display:flex;align-items:baseline;flex-wrap:wrap;gap:7px}
.ps-amt{font-family:var(--font-display),-apple-system,sans-serif;font-size:19px;font-weight:700;letter-spacing:-.02em;color:var(--ink);font-variant-numeric:tabular-nums}
.ps-price s{font-size:13px;color:var(--sk-muted)}
.ps-sale{align-self:center;padding:2px 8px;border-radius:999px;background:var(--coral,#ff7a6b);color:#fff;font-size:11px;font-weight:700}
.ps-meta{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px}
.ps-stock{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600}
.ps-stock i{width:7px;height:7px;border-radius:50%;background:currentColor}
.ps-stock.in{color:#15803d}.ps-stock.back{color:#b45309}.ps-stock.out{color:#dc2626}
.ps-sku{font-size:12px;color:var(--sk-muted);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.ps-stores{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.ps-stores span{display:inline-flex;align-items:center;gap:6px;max-width:100%;height:28px;padding:0 11px;border-radius:999px;background:var(--card,#fff);font-size:12px;color:var(--sk-muted)}
.ps-stores i{width:6px;height:6px;flex-shrink:0;border-radius:50%;background:var(--sk-fill-2)}
.ps-stores .has i{background:#22c55e}
.ps-stores em{font-style:normal;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ps-stores b{font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums}
.ps-acts{display:flex;gap:6px;margin-top:12px}
.ps-act{flex:1;min-width:0;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:40px;padding:0 12px;border:none;border-radius:999px;background:var(--card,#fff);color:var(--ink);font:inherit;font-size:13.5px;font-weight:650;white-space:nowrap;cursor:pointer;box-shadow:0 1px 2px rgba(16,24,40,.06);transition:background .15s,color .15s,transform .12s}
.ps-act svg{color:var(--coral,#ff7a6b);flex-shrink:0}
.ps-act:last-child{flex:0 0 auto;padding:0 16px}
.ps-act:hover:not(:disabled){background:var(--peach,#fff4f1);color:var(--coral,#ff7a6b)}
.ps-act:active:not(:disabled){transform:scale(.97)}
.ps-act:disabled{opacity:.45;cursor:not-allowed}
.ps-act.sent,.ps-act.sent:hover{background:#dcfce7;color:#15803d}
.ps-act.sent svg{color:currentColor}
.ps-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:52px 20px;text-align:center}
.ps-empty-ic{width:56px;height:56px;margin-bottom:8px;border-radius:18px;background:var(--sk-fill);color:var(--sk-muted);display:inline-flex;align-items:center;justify-content:center}
.ps-empty b{font-size:16px;font-weight:650;color:var(--ink);overflow-wrap:anywhere}
.ps-empty span{max-width:260px;font-size:13.5px;line-height:1.45;color:var(--sk-muted)}
.ps-skel .ps-img,.ps-skel i{background:linear-gradient(90deg,var(--sk-fill-2) 25%,var(--card,#fff) 50%,var(--sk-fill-2) 75%);background-size:200% 100%;animation:psShimmer 1.3s ease-in-out infinite}
.ps-skel i{display:block;height:12px;border-radius:6px}
.ps-skel .ps-info{gap:9px;padding-top:6px}
[data-theme="dark"] .ps-stock.in{color:#4ade80}
[data-theme="dark"] .ps-stock.back{color:#fbbf24}
[data-theme="dark"] .ps-stock.out{color:#f87171}
[data-theme="dark"] .ps-act:hover:not(:disabled){background:color-mix(in srgb,var(--coral,#ff7a6b) 16%,transparent)}
[data-theme="dark"] .ps-act.sent,[data-theme="dark"] .ps-act.sent:hover{background:rgba(34,197,94,.16);color:#4ade80}
@keyframes psSpin{to{transform:rotate(360deg)}}
@keyframes psShimmer{from{background-position:100% 0}to{background-position:-100% 0}}
@media (max-width:560px){
  .ps.sk.side{height:88vh}
  .ps-search{padding:0 18px 12px}
  .ps-img{width:60px;height:60px;border-radius:14px}
}
@media (prefers-reduced-motion:reduce){.ps-spin,.ps-skel .ps-img,.ps-skel i{animation:none}}
`
