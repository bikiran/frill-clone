'use client'

// The contact panel's tabs: Info (contact, addresses, notes, media), Timeline and Orders.
// Moved out of app/admin/inbox/page.tsx unchanged. Its names come from the
// inbox controller through useInbox().

import CustomerMatchCard from '@/components/CustomerMatchCard'
import { supabase } from '@/lib/supabase'
import AddressAutocomplete from '@/components/AddressAutocomplete'
import { CPD_CSS, CPD_ICON, DELIVERY_STATUS_OPTIONS, PT_CSS, PanelItem } from '@/components/inbox/ContactPanelBits'
import { confirmDialog } from '@/components/ConfirmDialog'
import { MenuAvatar } from '@/components/ui/SelectMenu'
import WaitlistQuickAdd from '@/components/WaitlistQuickAdd'
import SuperAdminContactWorkspaces from '@/components/SuperAdminContactWorkspaces'
import Link from 'next/link'
import CustomerAddresses from '@/components/CustomerAddresses'
import { decodeEntities as dec } from '@/lib/decode-entities'
import { emailAttachmentKind, emailAttachmentUrl } from '@/components/EmailMessage'
import { sizedImageFallback, sizedImageUrl, toPublicUrl } from '@/lib/storage-url'
import ReviewRequestButton from '@/components/composer/ReviewRequestButton'
import { posSaleInfo, prextySpendIncGst } from '@/lib/prexty-pos'
import PrextyMark from '@/components/PrextyMark'
import ResilientImage from '@/components/ResilientImage'
import { AiSparkIcon, CHANNEL_ICON, CHANNEL_NAME, Highlight, Icon, STATUS_COLOR, STATUS_ICON, VideoTileMark, fmtDateTime, fmtTime, timeOpts, videoPoster } from '@/components/inbox/inbox-shared'
import { ENGAGEMENT_CSS, FacebookComment, GoogleReview, InstagramComment } from '@/components/inbox/EngagementCards'
import { useInbox } from '@/components/inbox/InboxContext'

export default function ContactPanelBody() {
  const {
    abandonedCarts, activeChannel, activePanel, addrToString, aiSavedFields, aiSummary, aiTodos,
    assignTo, attToken, cardAction, cardAssignSearch, companyId, companyInfo, contact,
    contactReviews, convertAbandonedCart, copyField, createReviewLink, dismissAbandonedCart,
    editContact, editField, editFieldValue, events, fieldBtn, galleryMessages, generateAiSummary,
    generateInvoice, generatingAi, inp, internalMode, isWebChat, issueOrderRefund, joinAddressParts,
    linkedChannels, markOrderCompleted, miniBtn, msgSearch, myName, openEmailMedia, openForward,
    openOrderEditor, orderBilling, orderDateFrom, orderDateTo, orderSearch, outlets, prextyCustomer,
    renderNotesSection, renderTasksSection, reportSpam, reviewAlready, reviewChannel, saveContact,
    saveSingleField, savingContact, searchTerm, selectConversation, selected,
    sendOrderPaymentRequest, sendReviewRequest, setActivePanel, setAiTodos, setCardAssignSearch,
    setContact, setEditContact, setEditField, setEditFieldValue, setGalleryIndex, setMobilePane,
    setOrderDateFrom, setOrderDateTo, setOrderGallery, setOrderSearch, setPickupModal, setReply,
    setShowCardAssign, setShowCardMore, setShowContactEdit, setShowDeliveryPanel,
    setShowOrderSearch, setShowTimeline, setShowTracking, setStatus, showCardAssign, showCardMore,
    showContactEdit, showEmailComposer, showMsgSearch, showOrderSearch, showToast, teamMembers,
    toggleBlockContact, user, wooCustomer, wooOrders, wooOrdersLoading,
  } = useInbox()
  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px' }}>
        {activePanel === 'info' && (
          <>
            {/* Cross-channel customer match — links an Instagram/Messenger/
                WhatsApp visitor to an existing customer (masked until confirmed). */}
            {selected && ['instagram', 'facebook', 'whatsapp'].includes(String((selected as any).channel || '')) && (
              <CustomerMatchCard
                conversationId={selected.id}
                channel={(selected as any).channel}
                companyId={companyId}
                userId={user?.id}
                userName={myName}
                onLinked={async () => {
                  // Confirming a match repoints conversations.contact_id to the
                  // customer, so re-fetch the row (the local `selected` still
                  // holds the old visitor id) before reloading the panel.
                  try {
                    const { data } = await (supabase as any).from('conversations').select('*').eq('id', selected.id).maybeSingle()
                    await selectConversation(data || selected)
                  } catch { await selectConversation(selected) }
                }}
              />
            )}
            {/* Coax-style contact card header */}
            {contact && !showContactEdit && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '4px 0 16px', borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
                {(contact as any).avatar_url ? (
                  <img src={(contact as any).avatar_url} alt={contact.name || ''} style={{ width: 84, height: 84, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 84, height: 84, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 800 }}>
                    {(contact.name || contact.email || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                {/* Channel chips — which channels we can reach this contact on */}
                <div style={{ display: 'flex', gap: 7, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {[
                    ['phone', !!contact.phone, '#6b7280', (s: number) => Icon.phone?.(s)],
                    ['email', !!contact.email, '#6b7280', (s: number) => Icon.mail?.(s)],
                  ].filter(([, on]) => on).map(([key], idx) => (
                    <span key={idx} style={{ width: 30, height: 30, borderRadius: '50%', background: '#f1f2f4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4b5563' }}>
                      {key === 'phone'
                        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>}
                    </span>
                  ))}
                </div>
                <h3 title="Click to edit the name" onClick={() => { setEditField('name'); setEditFieldValue(contact.name || '') }} style={{ margin: '12px 0 0', fontSize: 20, fontWeight: 800, color: 'var(--ink)', maxWidth: '100%', overflowWrap: 'anywhere', wordBreak: 'break-word', textAlign: 'center', cursor: 'text' }}>{contact.name || contact.email || 'Visitor'}</h3>
                {(contact as any).is_blocked && (
                  <span style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', padding: '3px 9px', borderRadius: 20 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>
                    Blocked
                  </span>
                )}
                {/* Quick actions */}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  {/* Assign — its own dropdown, anchored to THIS button.
                      It used to trigger the header's assign menu via a
                      synthetic click, which opened a panel up at the top of
                      the page and looked broken. */}
                  <div style={{ position: 'relative' }} data-card-assign>
                    <button type="button" title="Assign"
                      onClick={() => { setShowCardAssign(v => !v); setCardAssignSearch('') }}
                      style={cardAction('#ecfdf5', '#059669')}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                    </button>
                    {showCardAssign && (() => {
                      const q = cardAssignSearch.trim().toLowerCase()
                      const matches = teamMembers.filter((m: any) => !q || (m.name || '').toLowerCase().includes(q))
                      const mine = teamMembers.find((m: any) => m.user_id && m.user_id === user?.id)
                      const row = (m: any, label?: string) => {
                        const cur = selected?.assigned_to === m.user_id
                        return (
                          <button key={(label ? 'me-' : '') + m.id} type="button" onClick={() => { assignTo(m); setShowCardAssign(false) }} className={`th-menu-row${cur ? ' cur' : ''}`}>
                            <span className="th-av sm">{m.name?.charAt(0).toUpperCase()}</span>
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label || m.name}</span>
                            {cur && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-label="Assigned"><polyline points="20 6 9 17 4 12"/></svg>}
                          </button>
                        )
                      }
                      return (
                        <div className="th-menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, width: 240, zIndex: 70, textAlign: 'left', transformOrigin: 'top left' }}>
                          <div style={{ position: 'relative' }}>
                            <input autoFocus value={cardAssignSearch} onChange={e => setCardAssignSearch(e.target.value)} placeholder="Find a teammate" aria-label="Find a teammate" className="th-menu-search" />
                            {cardAssignSearch && (
                              <button type="button" onClick={() => setCardAssignSearch('')} aria-label="Clear"
                                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', padding: 2 }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              </button>
                            )}
                          </div>
                          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                            {mine && !q && <>{row(mine, 'Assign to me')}<div className="th-menu-sep" /><p className="th-menu-label">Teammates</p></>}
                            {matches.map(m => row(m))}
                            {matches.length === 0 && <p style={{ margin: 0, padding: '10px', fontSize: 13, color: '#9ca3af' }}>No teammates match.</p>}
                            {selected?.assigned_to && !q && <><div className="th-menu-sep" /><button type="button" onClick={() => { assignTo(null); setShowCardAssign(false) }} className="th-menu-row danger">Unassign</button></>}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                  <button type="button" title="Edit contact" onClick={() => { setShowContactEdit(true); setEditContact(contact) }}
                    style={cardAction('#eff6ff', '#2563eb')}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <a href={`/admin/customers/profile?id=${contact.id}`} title="Full profile"
                    style={{ ...cardAction('#eff6ff', '#2563eb'), textDecoration: 'none' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </a>
                  <button type="button" title="Close conversation" onClick={() => setStatus('closed')}
                    style={cardAction('#fef2f2', '#dc2626')}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  </button>
                  {/* More options — block / report spam live in here rather
                      than as extra buttons on the row, which overflowed. */}
                  <div style={{ position: 'relative' }} data-card-more>
                    <button type="button" title="More options"
                      onClick={() => setShowCardMore(v => !v)}
                      style={cardAction('#f3f4f6', '#4b5563')}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>
                    </button>
                    {showCardMore && (
                      <div className="th-menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 220, zIndex: 70, textAlign: 'left' }}>
                        <button type="button" onClick={() => { setShowCardMore(false); reportSpam() }}
                          className="th-menu-row" style={{ color: '#c2410c' }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                          Report spam
                        </button>
                        <button type="button" onClick={() => { setShowCardMore(false); toggleBlockContact() }}
                          className="th-menu-row" style={{ color: (contact as any).is_blocked ? '#059669' : '#dc2626' }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>
                          {(contact as any).is_blocked ? 'Unblock this contact' : 'Block this contact'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            {/* Contact card */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Contact</h3>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {contact && !showContactEdit && (
                  <button type="button" title="Edit all details" aria-label="Edit all details" onClick={() => { setShowContactEdit(true); setEditContact(contact) }}
                    className="th-btn" style={{ width: 30, height: 30 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                )}
                {(showContactEdit || !contact) && (
                  <button type="button" onClick={() => { setShowContactEdit(v => !v); setEditContact(contact || ((selected as any)?.sms_number ? { phone: (selected as any).sms_number } : {})) }}
                    className={`cp-mini${showContactEdit ? '' : ' accent'}`}>
                    {showContactEdit ? 'Cancel' : '+ Create'}
                  </button>
                )}
              </div>
            </div>

            {showContactEdit ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Fill blank fields from the linked WooCommerce order's
                    billing — recovers name / phone / address when the order
                    matched the contact only by email and left them empty. */}
                {(() => {
                  const b = orderBilling
                  if (!b) return null
                  const billingName = `${b.first_name || ''} ${b.last_name || ''}`.trim()
                  const billingAddr = [b.address_1, b.address_2].filter(Boolean).join(', ')
                  const ec: any = editContact
                  const canFill = (!ec.name && billingName) || (!ec.phone && b.phone) || (!ec.address && billingAddr) || (!ec.company_name && b.company)
                  if (!canFill) return null
                  return (
                    <button type="button" onClick={() => setEditContact((c: any) => ({
                      ...c,
                      name: c.name || billingName || c.name,
                      phone: c.phone || b.phone || c.phone,
                      address: c.address || billingAddr || c.address,
                      city: c.city || b.city || c.city,
                      state: c.state || b.state || c.state,
                      postcode: c.postcode || b.postcode || c.postcode,
                      country: c.country || b.country || c.country,
                      company_name: c.company_name || b.company || c.company_name,
                    }))}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 8, border: '1px dashed var(--coral)', background: 'var(--peach)', color: 'var(--coral)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      Fill from order
                    </button>
                  )
                })()}
                {[['name', 'Name', 'text'], ['email', 'Email', 'email'], ['phone', 'Phone', 'tel'], ['address', 'Address', 'text'], ['city', 'City', 'text'], ['state', 'State', 'text'], ['postcode', 'Postcode', 'text'], ['country', 'Country', 'text']].map(([field, label, type]) => (
                  <div key={field}>
                    <label style={{ fontSize: 12.5, fontWeight: 500, color: '#8e8e93', display: 'block', marginBottom: 3 }}>{label}</label>
                    {field === 'address' ? (
                      // Address lookup (keyless by default; Google when a key is
                      // set). Picking a suggestion fills the street line and
                      // splits city/state/postcode/country into their own fields.
                      // The custom dropdown never blocks typing.
                      <AddressAutocomplete value={(editContact as any).address || ''}
                        onChange={v => setEditContact(c => ({ ...c, address: v }))}
                        onSelect={(parts) => setEditContact(c => ({
                          ...c,
                          address: parts.line1 || parts.formatted,
                          city: parts.city || (c as any).city,
                          state: parts.state || (c as any).state,
                          postcode: parts.postcode || (c as any).postcode,
                          country: parts.country || (c as any).country,
                        }))}
                        style={{ ...inp, fontSize: 12 }} />
                    ) : (
                      <input type={type} value={(editContact as any)[field] || ''} onChange={e => setEditContact(c => ({ ...c, [field]: e.target.value }))}
                        style={{ ...inp, fontSize: 12 }} />
                    )}
                  </div>
                ))}
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 500, color: '#8e8e93', display: 'block', marginBottom: 3 }}>Relationship</label>
                  <select
                    value={(editContact as any).relationship_type || 'customer'}
                    onChange={e => {
                      const rt = e.target.value
                      // A non-customer (supplier/wholesaler/business) is excluded
                      // from marketing by default.
                      setEditContact(c => ({ ...c, relationship_type: rt, ...(rt === 'customer' ? {} : { subscribed_to_marketing: false }) }))
                    }}
                    style={{ ...inp, fontSize: 12, cursor: 'pointer' }}>
                    <option value="customer">Customer</option>
                    <option value="supplier">Supplier</option>
                    <option value="wholesaler">Wholesaler</option>
                    <option value="business">Business contact</option>
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" id="marketing" checked={!!editContact.subscribed_to_marketing} onChange={e => setEditContact(c => ({ ...c, subscribed_to_marketing: e.target.checked }))} />
                  <label htmlFor="marketing" style={{ fontSize: 12, color: 'var(--slate)' }}>Subscribed to marketing</label>
                </div>
                {/* Why this contact is (or isn't) marketable — the basis you'd
                    need to be able to point to if an opt-out is disputed. */}
                {((editContact as any).consent_basis || (editContact as any).unsubscribed_at) && (
                  <div style={{ marginTop: -6, marginBottom: 8, fontSize: 11, color: 'var(--slate)', lineHeight: 1.5 }}>
                    {(editContact as any).unsubscribed_at ? (
                      <span style={{ color: '#dc2626', fontWeight: 600 }}>
                        Unsubscribed {(editContact as any).unsubscribe_method === 'sms_keyword' ? 'by replying STOP' : ''} · do not include in campaigns
                      </span>
                    ) : (
                      <>
                        Consent: <strong style={{ color: 'var(--ink)' }}>{(editContact as any).consent_basis}</strong>
                        {(editContact as any).consent_source ? ` — ${(editContact as any).consent_source}` : ''}
                      </>
                    )}
                  </div>
                )}
                <div style={{ display: 'none' }}>
                </div>
                <textarea value={editContact.notes || ''} onChange={e => setEditContact(c => ({ ...c, notes: e.target.value }))} placeholder="Notes…" rows={2}
                  style={{ ...inp, resize: 'vertical', fontSize: 12 }} />
                <button type="button" onClick={saveContact} disabled={savingContact} className="cv-btn cv-btn-primary" style={{ width: '100%' }}>
                  {savingContact ? 'Saving…' : 'Save Contact'}
                </button>
              </div>
            ) : contact ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {(() => {
                  // Prefer the contact's own address; if blank, pull the
                  // billing address from their most recent WooCommerce order
                  // (a customer who's ordered has an address on file even if
                  // their Colvy contact record is empty).
                  // Join the parts, but skip any that the address line
                  // already contains — otherwise a Google-formatted address
                  // ("33 Magnesium St, Narangba QLD 4504, Australia") plus a
                  // separately stored city and country rendered as
                  // "…, Australia, Narangba, Australia".
                  const ownAddress = joinAddressParts(
                    addrToString(contact.address),
                    (contact as any).city,
                    (contact as any).state,
                    (contact as any).postcode,
                    (contact as any).country,
                  )
                  let addressValue = ownAddress
                  let addressFromOrder = false
                  if (!ownAddress && wooOrders.length > 0) {
                    const b = wooOrders.find((o: any) => o.billing?.address_1)?.billing
                    if (b) {
                      addressValue = joinAddressParts(b.address_1, b.address_2, b.city, b.state, b.postcode, b.country)
                      addressFromOrder = true
                    }
                  }
                  // Also fall back to an abandoned cart's address (it often
                  // carries the shipping/billing address the customer entered
                  // at checkout even though they didn't complete the order).
                  if (!addressValue && abandonedCarts.length > 0) {
                    const c: any = abandonedCarts.find((ac: any) => ac.address || ac.billing_address_1 || ac.city || ac.address_1)
                    if (c) {
                      addressValue = addrToString(c.address)
                        || joinAddressParts(c.address_1 || c.billing_address_1, c.city || c.billing_city, c.state || c.billing_state, c.postcode || c.billing_postcode)
                      addressFromOrder = true
                    }
                  }
                  const fields = ([
                  ['name', 'Name', contact.name],
                  // The contacts table column is `company_name` (there is no
                  // `company` column); keying this row on `company` made every
                  // save write a non-existent column, so it silently reverted.
                  ['company_name', 'Company', (contact as any).company_name],
                  ['email', 'Email', contact.email],
                  ['phone', 'Phone', contact.phone],
                  ['address', 'Address', addressValue],
                ] as [string, string, string][])
                  // Filled-in fields are quiet rows in one card (the name is
                  // already the card's heading above); empty ones are "+ Email"
                  // chips underneath instead of a column of "Add …" lines.
                  const shown = fields.filter(([field, , value]) => editField === field || (!!value && field !== 'name'))
                  const missing = fields.filter(([field, , value]) => !value && editField !== field)
                  return (<>
                  {shown.length > 0 && (
                  <div className="cpd-card">
                  {shown.map(([field, label, value]) => {
                    const aiFilled = aiSavedFields.has(field as string) && !!value
                    const showOrderTag = field === 'address' && addressFromOrder && !!value
                    if (editField === field) return (
                      <div key={field} className="cpd-row editing">
                        <span className="cpd-lbl">{CPD_ICON[field]}{label}</span>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          {field === 'address' ? (
                            <div style={{ flex: 1 }}>
                              <AddressAutocomplete value={editFieldValue}
                                onChange={setEditFieldValue}
                                onSelect={(parts) => { setEditFieldValue(parts.formatted); saveSingleField('address', parts.formatted) }}
                                style={{ ...inp, fontSize: 12, padding: '5px 8px' }} />
                            </div>
                          ) : (
                          <input autoFocus value={editFieldValue} onChange={e => setEditFieldValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveSingleField(field, editFieldValue); if (e.key === 'Escape') setEditField(null) }}
                            placeholder={label} aria-label={label}
                            style={{ ...inp, fontSize: 12.5, padding: '6px 9px' }} />
                          )}
                          <button type="button" onClick={() => saveSingleField(field, editFieldValue)} style={fieldBtn('#059669')} title="Save">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          </button>
                          <button type="button" onClick={() => setEditField(null)} style={fieldBtn('var(--slate)')} title="Cancel">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </div>
                      </div>
                    )
                    return (
                      <div key={field} className="contact-field-row cpd-row">
                        <span className="cpd-ic" title={label}>{CPD_ICON[field]}</span>
                        {aiFilled && (
                          <span className="ai-spark" title="" style={{ position: 'relative', display: 'inline-flex', flexShrink: 0, color: '#8b5cf6', marginLeft: -4 }}>
                            <AiSparkIcon size={13} />
                            <span className="ai-tip" style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, whiteSpace: 'nowrap', background: '#1a1a1a', color: '#fff', fontSize: 11, fontWeight: 600, padding: '5px 9px', borderRadius: 7, opacity: 0, pointerEvents: 'none', transition: 'opacity 0.12s', zIndex: 20 }}>
                              Colvy AI saved this {label.toLowerCase()}
                            </span>
                          </span>
                        )}
                        <p className="cpd-val" title={`${label}: click to edit`}
                           onClick={() => { setEditField(field); setEditFieldValue(value || '') }}>
                          {value}
                          {showOrderTag && <span className="cpd-tag">from order</span>}
                        </p>
                        <div className="contact-field-actions" style={{ display: 'flex', gap: 3, opacity: 0, transition: 'opacity 0.12s' }}>
                          {field === 'phone' && (
                            <button type="button" title="Call" onClick={() => { const bar = document.querySelector('[data-callbar-btn]') as HTMLButtonElement; bar?.click() }}
                              style={fieldBtn('#059669')}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                            </button>
                          )}
                          <button type="button" title="Copy" onClick={() => copyField(value)} style={fieldBtn('var(--slate)')}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                          </button>
                          <button type="button" title="Delete" onClick={async () => { if (await confirmDialog(`Clear ${label.toLowerCase()}?`)) { await (supabase as any).from('contacts').update({ [field]: null }).eq('id', contact.id); setContact((c: any) => ({ ...c, [field]: null })); showToast('Cleared') } }} style={fieldBtn('#dc2626')}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  </div>
                  )}
                  {missing.length > 0 && (
                    <div className="cpd-add">
                      {missing.map(([field, label]) => (
                        <button key={field} type="button" className="cpd-chip" onClick={() => { setEditField(field); setEditFieldValue('') }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                  </>)
                })()}

                {/* ── What they said in public ───────────────────────────
                    Their latest Google review and Instagram / Facebook comment,
                    drawn the way each platform shows them. Each opens its
                    manager (Reviews, Social Engagement). */}
                {(contactReviews.latest || contactReviews.latestComment) && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
                    <p style={{ margin: '0 0 8px 0', fontSize: 12.5, fontWeight: 500, color: '#8e8e93' }}>Reviews &amp; comments</p>
                    {contactReviews.count > 0 && contactReviews.latest && (
                      <GoogleReview r={contactReviews.latest} count={contactReviews.count} avg={contactReviews.avg} />
                    )}
                    {contactReviews.commentCount > 0 && contactReviews.latestComment && (
                      contactReviews.latestComment.platform === 'instagram'
                        ? <InstagramComment c={contactReviews.latestComment} count={contactReviews.commentCount} business={companyInfo?.name || 'You'} />
                        : <FacebookComment c={contactReviews.latestComment} count={contactReviews.commentCount} business={companyInfo?.name || 'You'} />
                    )}
                    <style href="colvy-engagement-cards" precedence="default">{ENGAGEMENT_CSS}</style>
                  </div>
                )}

                {/* ── Settings for this customer, one line each ──────────
                    Rings first: on a call from this customer, this person
                    rings first; if they don't pick up, everyone else rings.
                    Back-in-stock alert: put them on a product's waitlist
                    (one SMS when it's back). Delivery: the calendar
                    slide-out, the delivery status and a tracking link. */}
                {(() => {
                  const uid = (contact as any).preferred_agent_user_id || ''
                  const ringName = uid ? (teamMembers.find((m: any) => m.user_id === uid)?.name || (contact as any).preferred_agent_name || 'A teammate') : ''
                  const when = (contact as any).scheduled_delivery
                  const dStatus = (contact as any).delivery_status || ''
                  const D_LABEL: Record<string, string> = { pending: 'Pending', scheduled: 'Scheduled', out_for_delivery: 'Out for delivery', delivered: 'Delivered', failed: 'Failed' }
                  return (
                    <div className="cpd-list">
                      <PanelItem icon={CPD_ICON.ring} label="Rings first" value={ringName || 'Everyone'} set={!!uid}
                        title="When this customer calls, this person rings first. If they don’t pick up, everyone else rings."
                        menu={{
                          label: 'Who rings first when this customer calls', value: uid, width: 260,
                          options: [
                            { value: '', label: 'Everyone at once', hint: 'All phones ring together', icon: CPD_ICON.ring },
                            ...teamMembers.filter((m: any) => m.user_id).map((m: any, i: number) => ({ value: m.user_id, label: m.name || 'Teammate', icon: <MenuAvatar name={m.name || '?'} color={['#6366f1', '#16a34a', '#f59e0b', '#ef4444', '#0ea5e9', '#d946ef'][i % 6]} /> })),
                          ],
                          onChange: async (v: string) => {
                            const next = v || null
                            const nm = next ? (teamMembers.find((m: any) => m.user_id === next)?.name || null) : null
                            setContact((c: any) => ({ ...c, preferred_agent_user_id: next, preferred_agent_name: nm }))
                            try {
                              await (supabase as any).from('contacts').update({ preferred_agent_user_id: next, preferred_agent_name: nm }).eq('id', contact.id)
                              showToast(next ? `${nm} will ring first for this customer` : 'Everyone rings at once for this customer')
                            } catch { showToast('Could not save who rings first') }
                          },
                        }} />
                      <WaitlistQuickAdd compact companyId={companyId} contact={contact as any} conversationId={selected?.id || null} />
                      <PanelItem icon={CPD_ICON.calendar} label="Delivery" set={!!when} onClick={() => setShowDeliveryPanel(true)}
                        value={when ? new Date(when).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Schedule'} />
                      <PanelItem icon={CPD_ICON.box} label="Delivery status" value={D_LABEL[dStatus] || 'Not set'} set={!!dStatus}
                        menu={{
                          label: 'Delivery status', value: dStatus,
                          options: [{ value: '', label: 'Not set', dot: '#d4d4d8' }, ...DELIVERY_STATUS_OPTIONS],
                          onChange: async (v: string) => {
                            const next = v || null
                            setContact((c: any) => ({ ...c, delivery_status: next }))
                            await (supabase as any).from('contacts').update({ delivery_status: next }).eq('id', contact.id)
                            showToast('Delivery status updated')
                          },
                        }} />
                      <PanelItem icon={CPD_ICON.truck} label="Send tracking link" value="" onClick={() => setShowTracking(true)} />
                    </div>
                  )
                })()}

                <SuperAdminContactWorkspaces email={(contact as any)?.email || null} />

                {/* ── Notes ─────────────────────────────────────────────
                    The same conversation_notes shown in the Timeline tab —
                    one store, two locations, with @mention + edit/copy/delete
                    and synced to mobile. Replaces the old single contact.notes
                    field. */}
                <div style={{ paddingTop: 14 }}>
                  {renderNotesSection()}
                </div>

                {/* ── Tasks ─────────────────────────────────────────────
                    Same conversation_tasks as the Timeline tab, shown here
                    below Notes with assignment + @mention + copy/edit/delete. */}
                <div style={{ paddingTop: 14 }}>
                  {renderTasksSection()}
                </div>

                {contact.subscribed_to_marketing && <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>✓ Subscribed to marketing</span>}
                <Link href={`/admin/customers/profile?id=${contact.id}`}
                  style={{ fontSize: 12, color: 'var(--coral)', fontWeight: 600, textDecoration: 'none' }}>
                  View full profile →
                </Link>
                <style>{`.contact-field-row:hover .contact-field-actions { opacity: 1 !important; }` + CPD_CSS}</style>
              </div>
            ) : (
              (selected as any)?.sms_number ? (
                <div>
                  <p style={{ margin: '0 0 2px', fontSize: 12.5, fontWeight: 500, color: '#8e8e93' }}>Phone</p>
                  <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--ink)' }}>{(selected as any).sms_number}</p>
                  <p style={{ fontSize: 12.5, color: '#9ca3af', margin: 0 }}>Not saved as a contact yet. Click &ldquo;+ Create&rdquo; to add their name and details.</p>
                </div>
              ) : (
                <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>No contact linked yet. Click &ldquo;+ Create&rdquo; to create one.</p>
              )
            )}

            {/* Delivery address book — every address the customer has used,
                with source + default selection (never overwrites). */}
            {contact && (
              <CustomerAddresses
                contactId={contact.id}
                userName={myName}
              />
            )}

            {/* Conversation metadata */}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 14 }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Details</h3>

              {/* Cross-channel identity: every channel this person has used,
                  linked by shared email/phone. Same human, one profile. */}
              {linkedChannels.length > 1 && (
                <div style={{ marginBottom: 14, padding: 10, borderRadius: 10, background: 'var(--canvas)', border: '1px solid var(--border)' }}>
                  <p style={{ margin: '0 0 7px', fontSize: 12.5, fontWeight: 500, color: '#8e8e93' }}>Also reachable on</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {linkedChannels.map((lc, i) => {
                      const isCommerce = ['woocommerce', 'pos', 'shopify', 'prexty'].includes(String(lc.channel).toLowerCase())
                      const isCurrent = lc.conversationId && lc.conversationId === selected?.id
                      const clickable = (!!lc.conversationId && !isCurrent) || isCommerce
                      const go = async () => {
                        if (lc.conversationId && !isCurrent) {
                          try {
                            const { data } = await (supabase as any).from('conversations').select('*').eq('id', lc.conversationId).maybeSingle()
                            if (data) await selectConversation(data)
                          } catch {}
                        } else if (isCommerce) {
                          setActivePanel('orders'); setMobilePane('thread')
                        }
                      }
                      return (
                        <button key={i} type="button" disabled={!clickable} onClick={go}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '5px 6px', margin: '0 -6px', borderRadius: 8, border: 'none', background: 'none', cursor: clickable ? 'pointer' : 'default' }}
                          onMouseEnter={e => { if (clickable) e.currentTarget.style.background = '#fff' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>
                          <span style={{ display: 'flex', flexShrink: 0 }}>{CHANNEL_ICON[String(lc.channel).toLowerCase()] || Icon.chat(14)}</span>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {CHANNEL_NAME[String(lc.channel).toLowerCase()] || lc.channel}
                            {lc.label ? <span style={{ color: 'var(--slate)' }}> · {lc.label}</span> : null}
                            {isCurrent ? <span style={{ color: '#9ca3af' }}> · current</span> : null}
                          </span>
                          {clickable && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* The customer's whole history — every channel, orders,
                  bookings, calls, payments, tasks and notes — for anyone
                  with a contact, not just people on several channels. */}
              {contact && (
                <button type="button" onClick={() => setShowTimeline(true)}
                  className="cv-btn" style={{ marginBottom: 14, width: '100%', height: 36, fontSize: 13 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                  Customer timeline
                </button>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <p style={{ margin: '0 0 2px', fontSize: 12.5, fontWeight: 500, color: '#8e8e93' }}>Channel</p>
                  {/* The LIVE channel, not the one the conversation started
                      on — a customer who began on the widget and is now
                      texting should read "SMS" here. */}
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {CHANNEL_ICON[activeChannel] || Icon.chat(14)}
                    {CHANNEL_NAME[activeChannel] || activeChannel}
                  </p>
                  {!isWebChat && String((selected as any).channel || '').toLowerCase() !== activeChannel && (
                    <p style={{ margin: '2px 0 0', fontSize: 10.5, color: '#9ca3af' }}>
                      Started on {CHANNEL_NAME[String((selected as any).channel || '').toLowerCase()] || 'live chat'}
                    </p>
                  )}
                </div>
                <div>
                  <p style={{ margin: '0 0 2px', fontSize: 12.5, fontWeight: 500, color: '#8e8e93' }}>Status</p>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 11px 0 9px', borderRadius: 999, background: STATUS_COLOR[selected.status]?.bg || '#f3f4f6', color: STATUS_COLOR[selected.status]?.color || '#6b7280', fontSize: 12.5, fontWeight: 650, textTransform: 'capitalize' }}>
                    {STATUS_ICON[selected.status] || STATUS_ICON.open}{selected.status}
                  </span>
                </div>
                <div>
                  <p style={{ margin: '0 0 2px', fontSize: 12.5, fontWeight: 500, color: '#8e8e93' }}>Started</p>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--ink)' }}>{fmtDateTime(selected.updated_at)}</p>
                </div>
                {selected.assigned_name && (
                  <div>
                    <p style={{ margin: '0 0 2px', fontSize: 12.5, fontWeight: 500, color: '#8e8e93' }}>Assigned to</p>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>{Icon.person(13)}{selected.assigned_name}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Abandoned cart — what the customer was trying to buy */}
            {abandonedCarts.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ color: 'var(--coral)', display: 'inline-flex' }}>{Icon.cart(15)}</span> Abandoned Cart <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 6, background: '#fef3c7', color: '#b45309' }}>{abandonedCarts.length}</span></h3>
                {abandonedCarts.map(cart => (
                  <div key={cart.id} style={{ border: '1.5px solid #fde68a', borderRadius: 12, padding: 14, marginBottom: 10, background: 'linear-gradient(135deg,#fffbeb,#fff)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 11.5, color: 'var(--slate)' }}>{cart.created_at ? new Date(cart.created_at).toLocaleDateString('en-AU') : ''}</span>
                      <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>${(parseFloat(cart.total) || 0).toFixed(2)}</span>
                    </div>
                    {Array.isArray(cart.items) && cart.items.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        {cart.items.map((it: any, i: number) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink)', padding: '2px 0' }}>
                            <span>{it.quantity}× {dec(it.name)}{it.sku ? ` (${it.sku})` : ''}</span>
                            {it.price != null && <span style={{ color: 'var(--slate)' }}>${(parseFloat(it.price) || 0).toFixed(2)}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 11.5, color: 'var(--slate)', lineHeight: 1.7, borderTop: '1px solid #fde68a', paddingTop: 8 }}>
                      {cart.coupon && <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ color: 'var(--coral)', display: 'inline-flex' }}>{Icon.coupon(12)}</span> Coupon: <strong>{cart.coupon}</strong></div>}
                      {cart.shipping?.label && <div>🚚 {cart.shipping.label}{cart.shipping.cost ? ` — $${cart.shipping.cost}` : ''}</div>}
                      {cart.address?.address_1 && <div>📍 {[cart.address.address_1, cart.address.city, cart.address.state, cart.address.postcode].filter(Boolean).join(', ')}</div>}
                      {cart.notes && <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}><span style={{ color: 'var(--slate)', display: 'inline-flex', marginTop: 2 }}>{Icon.survey(12)}</span> {cart.notes}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      <button onClick={() => convertAbandonedCart(cart)} className="cv-btn cv-btn-primary" style={{ flex: 1, height: 34, fontSize: 13 }}>Convert to order</button>
                      <button onClick={() => dismissAbandonedCart(cart)} title="Dismiss" className="cv-btn" style={{ height: 34, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Dismiss</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Shared media & files — chat attachments PLUS anything that
                arrived on an email in this thread (images shown as thumbs,
                other files as document tiles). */}
            {(() => {
              // Chat image/video keeps the lightbox gallery (indices must
              // match the thread's gallery source, so this stays separate).
              const media: any[] = []
              galleryMessages.forEach(m => (Array.isArray(m.attachments) ? m.attachments : []).forEach((a: any) => {
                const isImg = a.kind === 'image' || String(a.type||'').startsWith('image'); const isVid = a.kind === 'video' || String(a.type||'').startsWith('video'); if ((isImg || isVid) && a.url) media.push({ ...a, kind: isVid ? 'video' : 'image' })
              }))
              // Email attachments (Gmail streams via /api/email/attachment;
              // webhook emails carry a direct url).
              const emailAtts: any[] = []
              galleryMessages.forEach(m => (Array.isArray(m.email_attachments) ? m.email_attachments : []).forEach((a: any, ai: number) => {
                const url = emailAttachmentUrl(m, a, attToken)
                if (!url) return
                const kind = emailAttachmentKind(a)
                emailAtts.push({ url, thumbUrl: a.thumbUrl || null, name: a.name || 'file', isImage: kind === 'image', isVideo: kind === 'video', messageId: m.id, index: ai })
              }))
              const total = media.length + emailAtts.length
              if (total === 0) return null
              return (
                <div style={{ marginTop: 18 }}>
                  <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Shared media &amp; files ({total})</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                    {media.map((a, i) => (
                      <div key={`c${i}`}
                        style={{ position: 'relative', paddingTop: '100%', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: 'var(--canvas)' }}>
                        <div onClick={() => setGalleryIndex(i)} style={{ position: 'absolute', inset: 0 }}>
                          {(a.kind === 'video' || String(a.type).startsWith('video'))
                            // Nothing loads for a video tile until it's opened: its
                            // still stands in, or a play mark on a plain tile.
                            ? <>
                                <video src={toPublicUrl(a.url)} poster={videoPoster(a)} preload="none" muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', background: videoPoster(a) ? '#000' : 'var(--canvas)' }} />
                                <VideoTileMark />
                              </>
                            // The stored thumbnail first; older photos without one get
                            // a resized copy (or, failing that, the original).
                            : <img src={a.thumbUrl ? toPublicUrl(a.thumbUrl) : sizedImageUrl(a.url, 120)} onError={sizedImageFallback(a.url)} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                        </div>
                        {/* Forward it to another customer */}
                        <button type="button"
                          onClick={e => { e.stopPropagation(); openForward([a]) }}
                          title="Forward to another contact"
                          style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, backdropFilter: 'blur(3px)' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
                        </button>
                      </div>
                    ))}
                    {emailAtts.map((a, i) => (
                      <a key={`e${i}`} href={a.url} target="_blank" rel="noopener noreferrer" title={a.name}
                        onClick={(a.isImage || a.isVideo) ? (e => { e.preventDefault(); openEmailMedia(a.messageId, a.index) }) : undefined}
                        style={{ position: 'relative', paddingTop: '100%', borderRadius: 8, overflow: 'hidden', background: 'var(--canvas)', display: 'block', textDecoration: 'none', cursor: (a.isImage || a.isVideo) ? 'zoom-in' : 'pointer' }}>
                        {a.isImage ? (
                          <img src={a.thumbUrl ? toPublicUrl(a.thumbUrl) : sizedImageUrl(a.url, 120)} onError={sizedImageFallback(a.url)} alt={a.name} loading="lazy" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : a.isVideo ? (
                          <>
                            <video src={a.url} preload="none" muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: 'var(--canvas)' }} />
                            <VideoTileMark />
                          </>
                        ) : (
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 4, color: '#64748b' }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            <span style={{ fontSize: 9, fontWeight: 700, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{a.name}</span>
                          </div>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )
            })()}
          </>
        )}

        {activePanel === 'timeline' && (
          <>
            <style>{PT_CSS}</style>
            {/* AI summary & next steps */}
            <section className="pt-ai">
              <div className="pt-ai-head">
                <span className="pt-ai-ic" aria-hidden><AiSparkIcon size={15} /></span>
                <h3>AI summary</h3>
                <button type="button" onClick={generateAiSummary} disabled={generatingAi} className="pt-ai-btn">
                  {generatingAi ? 'Thinking…' : aiSummary ? 'Refresh' : 'Summarise'}
                </button>
              </div>
              {aiSummary ? (
                <p className="pt-ai-text">
                  <Highlight text={aiSummary} q={(showMsgSearch && msgSearch.trim()) ? msgSearch : searchTerm} accent={companyInfo?.accent_color || 'var(--coral)'} />
                </p>
              ) : (
                <p className="pt-ai-empty">{generatingAi ? 'Reading the conversation…' : 'A short summary of this conversation and what to do next.'}</p>
              )}
              {aiTodos.length > 0 && (
                <div className="pt-todos">
                  <span className="pt-lbl">Next steps</span>
                  {aiTodos.map((t: any, i: number) => (
                    <label key={i} className={`pt-todo${t.done ? ' done' : ''}`}>
                      <input type="checkbox" checked={!!t.done} onChange={() => {
                        const upd = aiTodos.map((x: any, xi: number) => xi === i ? { ...x, done: !x.done } : x)
                        setAiTodos(upd)
                        ;(supabase as any).from('conversations').update({ ai_todos: upd }).eq('id', selected.id)
                          // A query builder only runs once awaited/then'd — without this the tick was never saved.
                          .then(() => {}, () => {})
                      }} />
                      <span className="pt-tick" aria-hidden><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>
                      <span className="pt-todo-t"><Highlight text={t.text} q={(showMsgSearch && msgSearch.trim()) ? msgSearch : searchTerm} accent={companyInfo?.accent_color || 'var(--coral)'} /></span>
                    </label>
                  ))}
                  <p className="pt-ai-foot">Draft tasks from these appear in the conversation.</p>
                </div>
              )}
            </section>

            {/* Timeline events */}
            <section className="pt-sec">
              <div className="pt-sec-h">
                <h3>Timeline</h3>
                <ReviewRequestButton buttonLabel="Ask for a review" key={`rvp-${selected?.id || ''}`} buttonClassName="pt-pill"
                  channel={reviewChannel()} alreadyReviewed={reviewAlready()} getLink={createReviewLink} onSend={sendReviewRequest} onError={showToast}
                  onInsert={showEmailComposer && !internalMode ? undefined : (t => setReply(r => (r.trim() ? r.trimEnd() + '\n' : '') + t))} />
              </div>
              {events.length === 0 ? (
                <p className="pt-empty">Nothing has happened here yet.</p>
              ) : (
                <ol className="pt-tl">
                  {events.map(ev => {
                    const d = new Date(ev.created_at)
                    return (
                      <li key={ev.id}>
                        <span className="pt-tl-dot" aria-hidden />
                        <div className="pt-tl-body">
                          <p className="pt-tl-text">{ev.detail}</p>
                          <p className="pt-tl-meta">{d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · {d.toLocaleTimeString([], timeOpts())}{ev.actor_name ? ` · ${ev.actor_name}` : ''}</p>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </section>

            {/* Notes */}
            {renderNotesSection()}

            {/* Tasks */}
            {renderTasksSection()}

            {/* Pages they visited (website chat), newest first */}
            {Array.isArray(selected.page_history) && selected.page_history.length > 0 && (
              <section className="pt-sec">
                <div className="pt-sec-h"><h3>Pages visited</h3></div>
                <ol className="pt-pages">
                  {[...selected.page_history].reverse().map((h: any, i: number) => {
                    const where = (() => { try { const u = new URL(h.url); return u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname : '') } catch { return h.url } })()
                    return (
                      <li key={i}>
                        <a href={h.url} target="_blank" rel="noopener" className={`pt-page${i === 0 ? ' latest' : ''}`} title={h.url}>
                          <span className="pt-page-t"><b>{dec(h.title) || 'Untitled'}</b><small>{where}</small></span>
                          <span className="pt-page-time">{i === 0 && <em>Latest</em>}{fmtTime(h.ts)}</span>
                        </a>
                      </li>
                    )
                  })}
                </ol>
              </section>
            )}
          </>
        )}

        {activePanel === 'orders' && (
          <div className="pt-orders">
            <style>{PT_CSS}</style>
            {/* Store customer summary (WooCommerce, or Shopify when there's no WooCommerce match) */}
            {wooCustomer && (() => {
              const spend = (parseFloat(wooCustomer.total_spend) || 0) || wooOrders.reduce((s, o) => s + (parseFloat(o.total) || 0), 0)
              return (
                <section className="pt-card">
                  <div className="pt-card-h">
                    <span className="pt-card-ic">{Icon.cart(15)}</span>
                    <b>{wooCustomer._channel === 'shopify' ? 'Shopify' : 'WooCommerce'}</b>
                    <small>Online store</small>
                  </div>
                  <div className="pt-stats">
                    <div><span>{spend > 0 ? `$${spend.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</span><small>Total spend</small></div>
                    <div><span>{wooCustomer.total_orders || wooOrders.length || 0}</span><small>Orders</small></div>
                  </div>
                  {contact?.id && (
                    <a className="pt-card-link" href={`/admin/customers/profile?id=${contact.id}`}>
                      Full profile <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="9 18 15 12 9 6" /></svg>
                    </a>
                  )}
                </section>
              )
            })()}

            {/* Prexty POS customer — a compact strip rather than a big tinted
                block, so the order history below stays the focus. */}
            {prextyCustomer && (() => {
              const money = (n: any) => `$${Number(n || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              const stats = [
                // Including GST, like every other price in Colvy (Prexty's own figure is before GST).
                { label: 'Spent inc GST', value: prextyCustomer.totalSpent > 0 || prextyCustomer.totalSpentIncTax > 0
                  ? money(prextySpendIncGst(prextyCustomer, wooOrders.filter((o: any) => o.pos_source === 'prexty' || posSaleInfo(o).isPos)))
                  : '—' },
                { label: prextyCustomer.totalOrders === 1 ? 'Sale' : 'Sales', value: String(prextyCustomer.totalOrders || 0) },
                ...(prextyCustomer.loyaltyPoints > 0 ? [{ label: 'Points', value: String(prextyCustomer.loyaltyPoints) }] : []),
                ...(prextyCustomer.storeCredit > 0 ? [{ label: 'Credit', value: money(prextyCustomer.storeCredit) }] : []),
              ]
              const where = [prextyCustomer.city, prextyCustomer.state].filter(Boolean).join(', ')
              const since = prextyCustomer.memberSince ? new Date(prextyCustomer.memberSince).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }) : ''
              return (
                <section className="pt-card">
                  <div className="pt-card-h">
                    <span className="pt-card-ic plain"><PrextyMark size={16} /></span>
                    <b>Prexty POS</b>
                    {(since || where) && <small>{since ? `Since ${since}` : where}</small>}
                  </div>
                  <div className={`pt-stats n${stats.length}`}>
                    {stats.map(st => (
                      <div key={st.label}><span title={st.value}>{st.value}</span><small title={st.label}>{st.label}</small></div>
                    ))}
                  </div>
                </section>
              )
            })()}

            {/* Order history */}
            <div className="pt-sec-h" style={{ marginTop: 4 }}>
              <h3>Orders <span className="pt-count">{wooOrders.length}</span></h3>
              <button type="button" onClick={() => setShowOrderSearch(v => !v)} title="Search orders" aria-label="Search orders" aria-pressed={showOrderSearch}
                className={`pt-icon-btn${showOrderSearch ? ' on' : ''}`}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </button>
            </div>
            {showOrderSearch && (
              <div style={{ marginBottom: 12, padding: 10, borderRadius: 10, background: 'var(--canvas)', border: '1px solid var(--border)' }}>
                <input value={orderSearch} onChange={e => setOrderSearch(e.target.value)} placeholder="Order #, name, email, phone, address, item…"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, boxSizing: 'border-box', marginBottom: 8 }} />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: 'var(--slate)', fontWeight: 600 }}>From</label>
                    <input type="date" value={orderDateFrom} onChange={e => setOrderDateFrom(e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: 'var(--slate)', fontWeight: 600 }}>To</label>
                    <input type="date" value={orderDateTo} onChange={e => setOrderDateTo(e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, boxSizing: 'border-box' }} />
                  </div>
                  {(orderSearch || orderDateFrom || orderDateTo) && (
                    <button onClick={() => { setOrderSearch(''); setOrderDateFrom(''); setOrderDateTo('') }} style={{ alignSelf: 'flex-end', fontSize: 11, color: 'var(--coral)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: '6px 4px' }}>Clear</button>
                  )}
                </div>
              </div>
            )}
            {(() => {
              const q = orderSearch.trim().toLowerCase()
              const from = orderDateFrom ? new Date(orderDateFrom).getTime() : null
              const to = orderDateTo ? new Date(orderDateTo).getTime() + 86400000 : null
              const filteredOrders = wooOrders.filter(o => {
                if (from || to) {
                  const t = o.order_date ? new Date(o.order_date).getTime() : 0
                  if (from && t < from) return false
                  if (to && t > to) return false
                }
                if (!q) return true
                const hay = [
                  o.order_number, o.order_id, o.woo_order_id, o.status, o.customer_email, o.customer_name,
                  o.billing?.first_name, o.billing?.last_name, o.billing?.phone, o.billing?.email,
                  o.billing?.address_1, o.billing?.city, o.billing?.postcode,
                  ...(Array.isArray(o.line_items) ? o.line_items.map((li: any) => li.name) : []),
                ].filter(Boolean).join(' ').toLowerCase()
                return hay.includes(q)
              })
              return filteredOrders.length === 0 ? (
                wooOrdersLoading ? (
                  <p style={{ fontSize: 12, color: '#9ca3af', margin: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite' }}><path fill="currentColor" d="M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8z" /></svg>
                    Loading orders…
                  </p>
                ) : (
                  <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>{wooOrders.length === 0 ? "No orders found for this customer's email." : 'No orders match your search.'}</p>
                )
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {filteredOrders.map(o => {
                  const oid = o.order_id || o.woo_order_id || o.id
                  const onum = o.order_number || o.woo_order_id || o.id
                  const payload = { order_id: oid, order_number: onum, total: o.total, currency: o.currency, status: o.status, pay_link: o.payment_url || (o.store_url && o.order_key ? `${o.store_url}/checkout/order-pay/${oid}/?pay_for_order=true&key=${o.order_key}` : null), store_url: o.store_url, integration_id: o.integration_id }
                  return (
                  <div key={oid} className="pt-order">
                    {(() => {
                      // Header: number + status on the left, total on the right.
                      // A Prexty in-store sale (V407 columns, or the order's own
                      // meta when it came live from the store) gets its own line
                      // naming the shop and receipt, instead of a pill squeezed
                      // in beside the order number.
                      const pos = o.pos_source === 'prexty' ? { isPos: true, saleId: o.pos_sale_id || '', outlet: o.pos_outlet || '' } : posSaleInfo(o)
                      const shopLoc = pos.isPos ? outlets.find((x: any) => x.id === o.pos_location_id) : null
                      // The short name (suburb) fits the narrow card; the full one is in the tooltip.
                      const shop = pos.isPos ? (shopLoc?.suburb || shopLoc?.label || pos.outlet) : ''
                      const st = String(o.status || '').toLowerCase()
                      const tone = st === 'completed' ? ['#dcfce7', '#059669'] : st === 'processing' ? ['#dbeafe', '#2563eb'] : st === 'cancelled' || st === 'failed' ? ['#fee2e2', '#dc2626'] : st === 'refunded' ? ['#f3e8ff', '#7c3aed'] : ['#fef3c7', '#d97706']
                      const date = o.order_date ? new Date(o.order_date).toLocaleDateString('en-AU') : ''
                      return (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                              <span className="pt-order-n">#{onum}</span>
                              <span className="pt-status" style={{ background: tone[0], color: tone[1] }}>{o.status}</span>
                            </span>
                            <span className="pt-order-total">${(parseFloat(o.total) || 0).toFixed(2)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            {pos.isPos ? (
                              <span title={`Prexty POS sale${pos.saleId ? ` ${pos.saleId}` : ''}${shopLoc?.label || pos.outlet ? ` · ${shopLoc?.label || pos.outlet}` : ''}`}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, fontSize: 11, color: 'var(--slate)' }}>
                                <PrextyMark size={12} />
                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  In store{pos.saleId ? <> · <b style={{ color: 'var(--ink)', fontWeight: 700 }}>{pos.saleId}</b></> : null}{shop ? ` · ${shop}` : ''}
                                </span>
                              </span>
                            ) : <span />}
                            <span className="pt-order-date">{date}</span>
                          </div>
                        </>
                      )
                    })()}
                    {Number(o.total_refunded) > 0 && o.status !== 'refunded' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                        <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 6, background: '#f3e8ff', color: '#7c3aed', fontWeight: 700 }}>
                          {Number(o.total_refunded) + 0.005 >= (parseFloat(o.total) || 0) ? 'Refunded' : 'Partially refunded'}
                        </span>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#dc2626' }}>−${Number(o.total_refunded).toFixed(2)}</span>
                      </div>
                    )}
                    {Array.isArray(o.line_items) && o.line_items.length > 0 && (() => {
                      const withImg = o.line_items.filter((li: any) => li.image?.src)
                      const images = withImg.map((li: any) => ({ src: li.image.src, name: dec(li.name) }))
                      const openAt = (src?: string) => {
                        if (!images.length) return
                        const idx = src ? Math.max(0, images.findIndex((im: any) => im.src === src)) : 0
                        setOrderGallery({ images, index: idx })
                      }
                      return (
                        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                          {o.line_items.map((li: any, i: number) => {
                            const placeholder = (
                              <div className="pt-thumb ph">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                              </div>
                            )
                            return (
                            <div key={i} className="pt-li">
                              {li.image?.src ? (
                                <ResilientImage src={li.image.src} onClick={(e) => { e.stopPropagation(); openAt(li.image.src) }}
                                  fallback={placeholder}
                                  className="pt-thumb" style={{ cursor: 'pointer' }} />
                              ) : placeholder}
                              <div style={{ minWidth: 0 }}>
                                <p className="pt-li-t"><b>{li.quantity}×</b> {dec(li.name)}</p>
                                {li.sku ? <p className="pt-li-sku">SKU {li.sku}</p> : null}
                              </div>
                            </div>
                          )})}
                          {images.length > 0 && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); openAt() }}
                              className="pt-link">
                              View {images.length} product image{images.length > 1 ? 's' : ''}
                            </button>
                          )}
                          {(o.shipping_method || o.shipping_total != null) && (
                            <p className="pt-ship">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="1" y="3" width="15" height="13" rx="1.5" /><path d="M16 8h4l3 3v5h-7z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>
                              {o.shipping_method || 'Shipping'}{Number(o.shipping_total) > 0 ? ` — $${Number(o.shipping_total).toFixed(2)}` : ' — Free'}
                            </p>
                          )}
                        </div>
                      )
                    })()}
                    {/* Per-order actions. Shopify orders get the same actions —
                        the routes see the "shopify-<id>" order id and make the
                        change in Shopify (lib/shopify-order-actions). */}
                    {o._channel === 'shopify' ? (
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                      {!['cancelled', 'refunded'].includes(String(o.status || '').toLowerCase()) && (
                        <button type="button" onClick={() => openOrderEditor(payload)} style={miniBtn('var(--coral)')}>Edit</button>
                      )}
                      {['processing', 'pending'].includes(String(o.status || '').toLowerCase()) && (
                        <button type="button" onClick={() => markOrderCompleted(payload)} style={miniBtn('#15803d')}>Mark completed</button>
                      )}
                      {['processing', 'completed'].includes(String(o.status || '').toLowerCase()) && (
                        <button type="button" onClick={() => issueOrderRefund(payload)} style={miniBtn('#b45309')}>Issue refund</button>
                      )}
                      <button type="button" onClick={() => generateInvoice(payload)} style={miniBtn('var(--ink)')}>Invoice</button>
                      {o.shop && <a href={`https://${o.shop}/admin/orders/${o.external_order_id}`} target="_blank" rel="noopener noreferrer" style={{ ...miniBtn('#008060'), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Open in Shopify</a>}
                      {o.status_url && <button type="button" onClick={() => { navigator.clipboard?.writeText(o.status_url); showToast('Order status link copied') }} style={miniBtn('var(--slate)')}>Copy status link</button>}
                    </div>
                    ) : (
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                      <button type="button" onClick={() => openOrderEditor(payload)} style={miniBtn('var(--coral)')}>Edit</button>
                      {/* A paid order doesn't need a payment request — the
                          useful action there is refunding it. */}
                      {String(o.status || '').toLowerCase() === 'processing' && (
                        <button type="button" onClick={() => markOrderCompleted(payload)} style={miniBtn('#15803d')}>Mark completed</button>
                      )}
                      {/pickup|collect/i.test(String(o.shipping_method || '')) && (
                        <button type="button"
                          onClick={() => setPickupModal({ payload, locationId: (selected as any)?.assigned_location_id || outlets.find(x => x.is_primary)?.id || outlets[0]?.id || '' })}
                          style={miniBtn('#0891b2')}>Ready for pickup</button>
                      )}
                      {['processing', 'completed'].includes(String(o.status || '').toLowerCase())
                        ? <button type="button" onClick={() => issueOrderRefund(payload)} style={miniBtn('#b45309')}>Issue refund</button>
                        : <button type="button" onClick={() => sendOrderPaymentRequest(payload)} style={miniBtn('#635BFF')}>Payment request</button>}
                      <button type="button" onClick={() => generateInvoice(payload)} style={miniBtn('var(--ink)')}>Invoice</button>
                      {payload.pay_link && <button type="button" onClick={() => { navigator.clipboard?.writeText(payload.pay_link!); showToast('Pay link copied') }} style={miniBtn('var(--slate)')}>Copy link</button>}
                    </div>
                    )}
                  </div>
                )})}
              </div>
              )
            })()}
          </div>
        )}
      </div>
    </>
  )
}
