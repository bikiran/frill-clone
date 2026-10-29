'use client'

// Panels and pop-ups opened from the inbox: forward, schedule, products, proof of
// delivery, filters, the conversation right-click menu, charge card, DOA, orders,
// media, coupons, merge, toast and the send picker.
// Moved out of app/admin/inbox/page.tsx unchanged. Its names come from the
// inbox controller through useInbox().

import { toPublicUrl } from '@/lib/storage-url'
import ResilientImage from '@/components/ResilientImage'
import RefundOrderModal from '@/components/RefundOrderModal'
import FilePickerButton from '@/components/FilePickerButton'
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

export default function InboxOverlays() {
  const {
    activeFilterCount, afterOrderRefund, chargeAmount, chargeCard, chargeCardId, chargeDesc,
    charging, chatGalleryMedia, closeConv, companyId, companyInfo, composeChannel, contact,
    conversations, copyConvLink, couponAmount, couponCode, couponExpiry, couponOneTime,
    couponSaving, couponType, ctxMenu, deliverToCustomer, downloadInvoice, editOrder, editOrderData,
    editOrderLoading, editOrderSaving, editingScheduled, emailGalleryMedia, filteredConvs, filters,
    filtersCustomDates, folderBtnInbox, forwardBusy, forwardPicked, forwardResults, forwardSearch,
    forwardTo, forwarding, galleryFolder, galleryFolders, galleryIndex, galleryItems, gallerySearch,
    gallerySelected, inp, invoicePreview, invoiceSending, loadConversationExtras, loadConversations,
    loadGalleryFolder, markRead, mergeConversation, mrAccept, mrExpiry, mrMaxFiles, mrPrompt,
    mrSaving, myName, orderGallery, orderPrefillCart, outboundChannel, outlets, outletsForSchedule,
    payAddress, payAmount, payDesc, paySending, pickerItems, pickupModal, pickupSending, pinnedIds,
    podFiles, podNote, podSending, productError, productQuery, productSearching, productSent,
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

      {/* Product search — look a product up and send its price or buy link */}
      {showProducts && selected && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, maxWidth: '95vw', background: '#fff', borderLeft: '1px solid var(--border)', boxShadow: '-8px 0 32px rgba(0,0,0,0.10)', zIndex: 250, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
            <div>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>Product search</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--slate)' }}>Send a price or a buy link without leaving the chat.</p>
            </div>
            <button onClick={() => setShowProducts(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', display: 'flex', padding: 4 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <input autoFocus value={productQuery} onChange={e => setProductQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') searchProducts() }}
              placeholder="Search by name or SKU…"
              style={{ flex: 1, padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5 }} />
            <button onClick={searchProducts} disabled={productSearching || !productQuery.trim()}
              style={{ padding: '10px 16px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              {productSearching ? '…' : 'Search'}
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
            {productError && (
              <div style={{ padding: '10px 12px', borderRadius: 9, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 12.5, marginBottom: 12, lineHeight: 1.45 }}>
                {productError}
              </div>
            )}

            {products.length === 0 && !productSearching && !productError && (
              <p style={{ fontSize: 13.5, color: 'var(--slate)', textAlign: 'center', padding: 30 }}>
                {productQuery ? 'No products matched that search.' : 'Search your WooCommerce catalogue.'}
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {products.map(p => {
                const onSale = p.on_sale && p.sale_price
                const price = onSale ? p.sale_price : (p.price || p.regular_price)
                // WooCommerce returns prices like "17.9500" — show 2 decimals ($17.95).
                const fmtPrice = (v: any) => { const n = parseFloat(v); return isNaN(n) ? (v ?? '') : n.toFixed(2) }
                const inStock = p.stock_status === 'instock'
                return (
                  <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: '#fff' }}>
                    <div style={{ display: 'flex', gap: 11, marginBottom: 10 }}>
                      {p.image
                        ? <img src={p.image} alt="" style={{ width: 54, height: 54, borderRadius: 9, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }} />
                        : <div style={{ width: 54, height: 54, borderRadius: 9, background: 'var(--canvas)', flexShrink: 0 }} />}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.35 }}>{p.name}</p>
                        <p style={{ margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>${fmtPrice(price)}</span>
                          {onSale && <span style={{ fontSize: 11.5, color: '#9ca3af', textDecoration: 'line-through' }}>${fmtPrice(p.regular_price)}</span>}
                          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 5, background: inStock ? '#dcfce7' : '#fee2e2', color: inStock ? '#15803d' : '#dc2626' }}>
                            {inStock ? (p.manage_stock && p.stock_quantity != null ? `${p.stock_quantity} in stock` : 'In stock') : 'Out of stock'}
                          </span>
                        </p>
                        {p.sku && <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--slate)' }}>SKU: {p.sku}</p>}
                        {Array.isArray(p.stores) && p.stores.length > 0 && (
                          <div aria-label="Stock by store" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                            {p.stores.map((s: any) => (
                              <span key={s.store} title={`${s.available > 0 ? s.available : 'None'} at ${s.store}`}
                                style={{ fontSize: 10.5, fontWeight: 600, padding: '1px 6px', borderRadius: 5, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: s.available > 0 ? '#ecfdf3' : 'var(--canvas)', color: s.available > 0 ? '#15803d' : 'var(--slate)', border: '1px solid var(--border)' }}>
                                {s.store} · {s.available > 0 ? s.available : 'none'}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => sendProductMessage(p, 'price')}
                        style={{ flex: 1, padding: '7px 0', borderRadius: 8, background: productSent === `${p.id}-price` ? '#dcfce7' : 'var(--coral)', color: productSent === `${p.id}-price` ? '#15803d' : '#fff', border: 'none', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                        {productSent === `${p.id}-price` ? 'Sent ✓' : 'Send price'}
                      </button>
                      <button onClick={() => sendProductMessage(p, 'link')} disabled={!p.permalink}
                        title={p.permalink ? 'Send a link they can buy from' : 'No product URL available'}
                        style={{ flex: 1, padding: '7px 0', borderRadius: 8, background: productSent === `${p.id}-link` ? '#dcfce7' : 'var(--peach)', color: productSent === `${p.id}-link` ? '#15803d' : 'var(--coral)', border: '1px solid var(--coral)', fontSize: 12.5, fontWeight: 700, cursor: p.permalink ? 'pointer' : 'not-allowed', opacity: p.permalink ? 1 : 0.5 }}>
                        {productSent === `${p.id}-link` ? 'Sent ✓' : 'Send link'}
                      </button>
                      <button onClick={() => sendProductMessage(p, 'both')} disabled={!p.permalink}
                        title="Send the price and a buy link together"
                        style={{ padding: '7px 12px', borderRadius: 8, background: '#fff', color: 'var(--ink)', border: '1px solid var(--border)', fontSize: 12.5, fontWeight: 700, cursor: p.permalink ? 'pointer' : 'not-allowed', opacity: p.permalink ? 1 : 0.5 }}>
                        Both
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Proof of Delivery panel */}
      {pickupModal && (() => {
        const loc = outlets.find(o => o.id === pickupModal.locationId)
        const locName = loc ? [loc.label, loc.suburb].filter(Boolean).join(', ') : 'our store'
        const orderNo = pickupModal.payload.order_number || pickupModal.payload.order_id
        const first = contact?.name ? String(contact.name).split(' ')[0] : ''
        const preview = `Hi${first ? ' ' + first : ''}, your order #${orderNo} is ready to be collected at: ${locName}. See you soon!`
        return (
          <div onClick={() => !pickupSending && setPickupModal(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 'min(440px, 96vw)', padding: 22 }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>Ready for pickup</h3>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--slate)' }}>Confirm the collection location, then send the customer an SMS.</p>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Pickup location</label>
              {outlets.length > 0 ? (
                <select value={pickupModal.locationId} onChange={e => setPickupModal(m => m ? { ...m, locationId: e.target.value } : m)}
                  style={{ width: '100%', marginTop: 6, marginBottom: 14, padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, background: '#fff' }}>
                  {outlets.map(o => <option key={o.id} value={o.id}>{[o.label, o.suburb].filter(Boolean).join(' · ')}{o.is_primary ? ' (default)' : ''}</option>)}
                </select>
              ) : (
                <p style={{ margin: '6px 0 14px', fontSize: 12.5, color: '#b45309' }}>No store locations set up yet — add one in Settings to name the pickup spot. The message will say "our store".</p>
              )}
              <div style={{ background: 'var(--peach)', borderRadius: 10, padding: '11px 13px', marginBottom: 16 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', marginBottom: 4 }}>Message preview</div>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>{preview}</p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => setPickupModal(null)} disabled={pickupSending}
                  style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                <button type="button" onClick={sendPickupReady} disabled={pickupSending}
                  style={{ flex: 2, padding: '11px 0', borderRadius: 10, border: 'none', background: '#0891b2', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', opacity: pickupSending ? 0.6 : 1 }}>
                  {pickupSending ? 'Sending…' : 'Send SMS'}
                </button>
              </div>
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
        <div onClick={() => setShowPod(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 320, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 460, maxWidth: '95vw', maxHeight: '88vh', overflowY: 'auto', background: '#fff', borderRadius: 18, padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                {Icon.box(17)} Proof of Delivery
              </h2>
              <button type="button" onClick={() => setShowPod(false)}
                style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--slate)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--slate)', marginBottom: 6 }}>Delivery photo(s)</label>
            <FilePickerButton
              accept="image/*,video/*"
              label={podFiles.length ? `${podFiles.length} file${podFiles.length === 1 ? '' : 's'} selected — add more` : 'Choose photos or video'}
              onFiles={files => setPodFiles(prev => [...prev, ...files])}
            />
            {podFiles.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0 12px' }}>
                {podFiles.map((f, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, padding: '4px 9px', borderRadius: 7, background: 'var(--peach)', color: 'var(--coral)' }}>
                    {f.name}
                    <button type="button" onClick={() => setPodFiles(prev => prev.filter((_, j) => j !== i))}
                      style={{ border: 'none', background: 'none', padding: 0, color: 'var(--coral)', cursor: 'pointer', display: 'flex' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </span>
                ))}
              </div>
            )}

            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--slate)', margin: '10px 0 6px' }}>Message to the customer</label>
            {/* Pre-written openers — tap Insert to drop one in, then edit. */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {[
                'Your order has been delivered. Attached is the proof of delivery — thank you!',
                'Hi! Your parcel has just been delivered and left in a safe spot. Photo attached.',
                'Delivery complete 🐟 Here\u2019s a photo for your records. Reply here if anything\u2019s not right.',
                'Your order arrived today — see the attached photo. Thanks for shopping with us!',
              ].map((tpl, i) => (
                <button key={i} type="button"
                  onClick={() => setPodNote(tpl)}
                  title={tpl}
                  style={{ fontSize: 11.5, fontWeight: 600, padding: '5px 10px', borderRadius: 20, border: '1px solid var(--border)', background: '#fff', color: 'var(--slate)', cursor: 'pointer', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Insert: {tpl.slice(0, 22)}…
                </button>
              ))}
            </div>
            <textarea value={podNote} onChange={e => setPodNote(e.target.value)} rows={4}
              placeholder="Your order has been delivered. Attached is the proof of delivery — thank you!"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none', resize: 'vertical' }} />

            <button type="button" onClick={sendProofOfDelivery} disabled={podSending}
              style={{ width: '100%', marginTop: 14, padding: 12, borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: podSending ? 'wait' : 'pointer' }}>
              {podSending ? 'Sending…' : 'Send proof of delivery'}
            </button>
            <p style={{ fontSize: 11.5, color: 'var(--slate)', marginTop: 9, lineHeight: 1.5 }}>
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
        <div onClick={() => setShowChargeCard(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 380, maxWidth: '92vw', background: '#fff', borderRadius: 16, padding: 22 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Charge saved card</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--slate)' }}>Charges the customer&rsquo;s card on file. They won&rsquo;t need to do anything.</p>

            {savedCards === null ? (
              <div aria-busy="true" style={{ padding: '6px 0 4px' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Card</div>
                <div className="cc-skel" style={{ height: 40, borderRadius: 9, marginBottom: 10 }} />
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)' }}>Loading saved cards…</p>
                <style>{'.cc-skel{background:linear-gradient(90deg,#f1f1f3 25%,#e7e7ea 37%,#f1f1f3 63%);background-size:400% 100%;animation:ccSk 1.2s ease infinite}@keyframes ccSk{0%{background-position:100% 50%}100%{background-position:0 50%}}@media (prefers-reduced-motion: reduce){.cc-skel{animation:none}}'}</style>
              </div>
            ) : savedCards.length === 0 ? (
              <>
                <div style={{ padding: 14, borderRadius: 10, background: 'var(--canvas)', border: '1px solid var(--border)', marginBottom: 14 }}>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>
                    No saved card for this customer yet. Use <strong>Save Card</strong> to send them a secure Stripe link first.
                  </p>
                </div>
                <button type="button" onClick={() => { setShowChargeCard(false); saveCard() }}
                  style={{ width: '100%', padding: '11px 0', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  Send &ldquo;Save Card&rdquo; link
                </button>
              </>
            ) : (
              <>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Card</label>
                <select value={chargeCardId} onChange={e => setChargeCardId(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, marginBottom: 14, boxSizing: 'border-box' }}>
                  {savedCards.map(c => (
                    <option key={c.id} value={c.id}>
                      {(c.brand || 'card').toUpperCase()} •••• {c.last4} — expires {String(c.exp_month).padStart(2, '0')}/{c.exp_year}
                    </option>
                  ))}
                </select>

                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Amount (AUD)</label>
                <input type="number" min="1" step="0.01" value={chargeAmount} onChange={e => setChargeAmount(e.target.value)}
                  placeholder="49.95"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, marginBottom: 14, boxSizing: 'border-box' }} />

                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>What&rsquo;s this for?</label>
                <input value={chargeDesc} onChange={e => setChargeDesc(e.target.value)}
                  placeholder="Replacement part"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, marginBottom: 18, boxSizing: 'border-box' }} />

                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setShowChargeCard(false)}
                    style={{ flex: 1, padding: '11px 0', borderRadius: 10, background: '#fff', color: 'var(--slate)', border: '1px solid var(--border)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                  <button type="button" onClick={chargeCard} disabled={!chargeAmount || charging}
                    style={{ flex: 2, padding: '11px 0', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: (!chargeAmount || charging) ? 0.6 : 1 }}>
                    {charging ? 'Charging…' : `Charge $${chargeAmount || '0'}`}
                  </button>
                </div>
              </>
            )}
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
          onClose={() => setShowDoa(false)}
          onDone={() => { if (selected) selectConversation(selected) }}
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setShowMediaRequest(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: '100%', background: '#fff', borderRadius: 16, overflow: 'hidden', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ color: 'var(--coral)', display: 'inline-flex' }}>{Icon.media(17)}</span> Request Media</h2>
              <button onClick={() => setShowMediaRequest(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--slate)' }}>✕</button>
            </div>
            <div style={{ padding: 20 }}>
              <p style={{ fontSize: 12.5, color: 'var(--slate)', margin: '0 0 16px', lineHeight: 1.5 }}>Send a private upload link. The customer can upload photos, videos, or PDFs at full quality — no MMS compression.</p>

              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 5 }}>What do you need?</label>
              <textarea value={mrPrompt} onChange={e => setMrPrompt(e.target.value)} rows={2} placeholder="e.g. Please upload clear photos of the damaged item and the box."
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', marginBottom: 16 }} />

              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>Accept file types</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {[['image', 'Photos'], ['video', 'Videos'], ['pdf', 'PDFs'], ['audio', 'Audio']].map(([k, label]) => {
                  const on = mrAccept.includes(k)
                  return (
                    <button key={k} onClick={() => setMrAccept(prev => on ? prev.filter(x => x !== k) : [...prev, k])}
                      style={{ padding: '8px 14px', borderRadius: 9, border: on ? '2px solid var(--coral)' : '1px solid var(--border)', background: on ? 'var(--peach)' : '#fff', color: on ? 'var(--coral)' : 'var(--slate)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{label}</button>
                  )
                })}
              </div>

              <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 5 }}>Maximum files</label>
                  <input type="number" min={1} value={mrMaxFiles} onChange={e => setMrMaxFiles(e.target.value)}
                    style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 5 }}>Link expires in</label>
                  <select value={mrExpiry} onChange={e => setMrExpiry(e.target.value)}
                    style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box' }}>
                    <option value="24">24 hours</option>
                    <option value="72">3 days</option>
                    <option value="168">7 days</option>
                    <option value="720">30 days</option>
                    <option value="">Never</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowMediaRequest(false)} style={{ flex: 1, padding: '11px', borderRadius: 10, background: '#fff', color: 'var(--slate)', border: '1px solid var(--border)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button onClick={sendMediaRequest} disabled={mrSaving || mrAccept.length === 0} style={{ flex: 2, padding: '11px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', opacity: mrAccept.length === 0 ? 0.6 : 1 }}>{mrSaving ? 'Sending…' : 'Send Request'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send coupon panel */}
      {showCoupon && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', justifyContent: 'flex-end' }} onClick={() => setShowCoupon(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 400, maxWidth: '100%', height: '100%', background: '#fff', overflowY: 'auto', boxShadow: '-8px 0 32px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Send a coupon</h2>
              <button onClick={() => setShowCoupon(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--slate)' }}>✕</button>
            </div>
            <div style={{ padding: 20 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 5 }}>Discount</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <select value={couponType} onChange={e => setCouponType(e.target.value as any)} style={{ padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, width: 90 }}>
                  <option value="fixed">$ off</option>
                  <option value="percent">% off</option>
                </select>
                <input value={couponAmount} onChange={e => setCouponAmount(e.target.value)} placeholder={couponType === 'percent' ? '10' : '20.00'} autoFocus
                  style={{ flex: 1, padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5 }} />
              </div>

              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 5 }}>Code (leave blank to auto-generate)</label>
              <input value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())} placeholder="e.g. WELCOME10"
                style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box', marginBottom: 14 }} />

              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 5 }}>Expires in (days, optional)</label>
              <input value={couponExpiry} onChange={e => setCouponExpiry(e.target.value)} placeholder="e.g. 30" type="number"
                style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box', marginBottom: 14 }} />

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 8 }}>
                <input type="checkbox" checked={couponOneTime} onChange={e => setCouponOneTime(e.target.checked)} />
                One-time use{contact?.email ? `, restricted to ${contact.email}` : ''}
              </label>
              {!contact?.email && <p style={{ fontSize: 11.5, color: 'var(--slate)', marginBottom: 12 }}>No email on this contact — the coupon won't be email-restricted.</p>}

              <button onClick={sendCoupon} disabled={couponSaving || !couponAmount.trim()}
                style={{ width: '100%', padding: '12px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: couponAmount.trim() ? 'pointer' : 'not-allowed', opacity: couponAmount.trim() ? 1 : 0.6, marginTop: 8 }}>
                {couponSaving ? 'Creating…' : 'Create & send coupon'}
              </button>
            </div>
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
      {sendPicker && (
        <div onClick={() => setSendPicker(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: '100%', maxHeight: '80vh', overflowY: 'auto', background: '#fff', borderRadius: 16, padding: 22, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--ink)', textTransform: 'capitalize' }}>
                {sendPicker === 'payment' ? 'Request Payment' : `Send ${sendPicker}`}
              </h3>
              <button type="button" onClick={() => setSendPicker(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--slate)' }}>×</button>
            </div>

            {sendPicker === 'payment' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', display: 'block', marginBottom: 6 }}>Amount (AUD)</label>
                  <input type="number" min="1" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="49.00" style={{ ...inp, fontSize: 15 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', display: 'block', marginBottom: 6 }}>Description (optional)</label>
                  <input value={payDesc} onChange={e => setPayDesc(e.target.value)} placeholder="Deposit for booking" style={inp} />
                </div>
                {(() => {
                  const def = (['none', 'billing', 'shipping'] as const).find(v => v === (companyInfo as any)?.payment_settings?.paylink_address) || 'none'
                  const cur = payAddress || def
                  return (
                    <div>
                      <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', display: 'block', marginBottom: 6 }}>Ask for an address</label>
                      <div role="radiogroup" aria-label="Ask for an address" className="pay-addr">
                        {([['none', 'No'], ['billing', 'Billing'], ['shipping', 'Delivery']] as const).map(([v, label]) => (
                          <button key={v} type="button" role="radio" aria-checked={cur === v} onClick={() => setPayAddress(v)} className={cur === v ? 'on' : ''}>{label}</button>
                        ))}
                      </div>
                      <style>{`.pay-addr{display:flex;gap:4px;padding:3px;border-radius:10px;background:var(--canvas)}.pay-addr button{flex:1;padding:7px 0;border:none;border-radius:8px;background:transparent;font-size:12.5px;font-weight:600;color:var(--slate);cursor:pointer;transition:background .2s ease,color .2s ease,box-shadow .2s ease}.pay-addr button.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(15,23,42,.12)}`}</style>
                      <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--slate)' }}>{cur === 'none' ? 'Stripe still asks for their email and the name on the card.' : cur === 'billing' ? 'They enter their billing address; it’s saved to their addresses.' : 'They enter where to deliver; it’s saved to their addresses.'}</p>
                    </div>
                  )
                })()}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--slate)', background: 'var(--canvas)', padding: '8px 12px', borderRadius: 8 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  Secure payment via Stripe. Card details are never stored by Colvy.{(companyInfo as any)?.payment_settings?.paylink_fill_contact !== false ? ' Their name and email fill in any blanks on the contact.' : ''}
                </div>
                <button type="button" onClick={sendPayment} disabled={!payAmount || paySending} style={{ padding: '11px 0', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: (!payAmount || paySending) ? 'default' : 'pointer', opacity: paySending ? 0.7 : 1 }}>
                  {(() => { const v = composeChannel(); const chat = v === 'widget' || v === 'chat'; return paySending ? (chat ? 'Sending…' : 'Making the link…') : chat ? 'Send payment request' : 'Add to reply' })()}
                </button>
              </div>
            ) : pickerItems.length === 0 ? (
              <p style={{ fontSize: 13.5, color: 'var(--slate)', textAlign: 'center', padding: '24px 0' }}>
                No {sendPicker}s found. Create one in the {sendPicker === 'poll' ? 'Polls' : sendPicker === 'survey' ? 'Surveys' : 'Forms'} section first.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pickerItems.map(item => (
                  <button key={item.id} type="button" onClick={() => sendInteractive(sendPicker as any, item)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{item.question || item.title || item.name || 'Untitled'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
