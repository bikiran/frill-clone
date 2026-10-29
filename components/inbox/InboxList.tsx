'use client'

// The conversation list column: search, filters, assignment tabs and the list itself.
// Moved out of app/admin/inbox/page.tsx unchanged. Its names come from the
// inbox controller through useInbox().

import Link from 'next/link'
import EmptyScroll from '@/components/EmptyScroll'
import { Fragment } from 'react'
import BrandLogo, { type BrandKey } from '@/components/BrandLogo'
import PrextyMark from '@/components/PrextyMark'
import { callMatches } from '@/lib/active-call'
import { waitlistPreview } from '@/lib/waitlist-ai'
import WidgetInstallCard from '@/components/inbox/WidgetInstallCard'
import { CallGlyph, Highlight, callGlyphKind, listTime, parseTs, stripCallEmoji } from '@/components/inbox/inbox-shared'
import { useInbox } from '@/components/inbox/InboxContext'

export default function InboxList() {
  const {
    activeCall, activeFilterCount, assignArrows, assignFilter, assignScrollRef, colvyAt, colvyRowEl,
    companyId, companyInfo, conversations, filteredConvs, hasMoreConvs, isManager, isMobile,
    listAnim, listCollapsed, locationFilter, outlets, pinnedIds, searchMsgHits, searchScope,
    searchTerm, selectConversation, selected, setAssignFilter, setConvLimit, setConversations,
    setCtxMenu, setLocationFilter, setSearchScope, setSearchTerm, setShowAddContact, setShowCompose,
    setShowFilters, setShowStatusMenu, setSidebarCollapsed, setStatusFilter, showStatusMenu,
    statusFilter,
  } = useInbox()
  return (
    <>
      {/* ── LEFT: Conversation list ─────────────────────────────────────────── */}
      {/* One column that folds down to a strip of avatars (desktop): the list
          stays mounted and keeps its scroll, and only the width animates. */}
      <div className={`inbox-col-list${isMobile ? '' : ' il-desk'}${listCollapsed ? ' il-collapsed' : ''}${listAnim ? ' il-anim' : ''}`} style={{ width: listCollapsed ? 82 : 300, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: '#fff', position: 'relative' }}>
        {!isMobile && (
          <div className="il-mini" inert={!listCollapsed}>
            <button type="button" onClick={() => setSidebarCollapsed(false)} title="Expand sidebar" aria-label="Expand sidebar" className="il-mini-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              {(() => { const n = conversations.filter(c => c.is_unread && !['closed', 'resolved'].includes(c.status)).length; return n > 0 && <span className="il-mini-count">{n > 99 ? '99+' : n}</span> })()}
            </button>
          </div>
        )}
        <div className="il-inner">
        {/* Floating compose button — start a new outbound message/call */}
        <button type="button" onClick={() => setShowCompose(true)} title="New message" aria-label="New message" className="colvy-page-fab"
          style={{ position: 'absolute', right: 16, bottom: 16, zIndex: 20, width: 52, height: 52, borderRadius: '50%', border: 'none', background: 'var(--coral)', color: '#fff', cursor: 'pointer', boxShadow: '0 6px 18px rgba(255,122,107,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          {/* The title with its unread count, then the actions, kept on one row
              in the column's 300px. */}
          <div className="il-titlerow" inert={listCollapsed} style={{ display: 'flex', alignItems: 'center', marginBottom: 10, gap: 6 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--ink)' }}>Inbox</h2>
            {(() => {
              const n = conversations.filter(c => c.is_unread && !['closed', 'resolved'].includes(c.status)).length
              return n > 0 && (
                <span title={`${n} unread`} aria-label={`${n} unread`} style={{ minWidth: 20, height: 20, padding: '0 6px', boxSizing: 'border-box', borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 700, background: 'var(--peach)', color: 'var(--coral)', flexShrink: 0 }}>
                  {n > 99 ? '99+' : n}
                </span>
              )
            })()}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <button type="button" onClick={() => setShowAddContact(true)} title="Add a contact manually"
                className="cv-btn" style={{ height: 30, padding: '0 12px', gap: 5, fontSize: 12.5 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Contact
              </button>
              <Link href="/admin/crm-settings/profile" title="Inbox settings" aria-label="Inbox settings"
                className="cv-btn cv-btn-icon" style={{ width: 30, height: 30 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </Link>
              {!isMobile && (
                <button type="button" onClick={() => setSidebarCollapsed(true)} title="Collapse sidebar" aria-label="Collapse sidebar"
                  className="cv-btn cv-btn-icon" style={{ width: 30, height: 30 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
              )}
            </div>
          </div>
          <div className="il-fold" inert={listCollapsed}><div>
          <div style={{ position: 'relative' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#71717a', pointerEvents: 'none' }}><circle cx="11" cy="11" r="7"/><line x1="20.5" y1="20.5" x2="16" y2="16"/></svg>
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search conversations…" aria-label="Search conversations"
              className="il-search" style={{ paddingRight: searchTerm ? 36 : undefined }} />
            {searchTerm && (
              <button type="button" onClick={() => { setSearchTerm(''); setSearchScope('all') }}
                title="Clear search"
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 22, height: 22, borderRadius: '50%', border: 'none', background: '#e5e7eb', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>
          {/* Scope pills — refine what the search looks at. Shown while typing.
              Themed to match the assignment tabs (coral/peach) rather than a
              one-off blue, and evenly spaced so the row reads cleanly. */}
          {searchTerm.trim() && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
              {([
                ['all', 'All'], ['contact', 'Contact'], ['messages', 'Messages'],
                ['ai', 'AI & Calls'], ['activity', 'Activity & Marketing'], ['tasks', 'Tasks'], ['notes', 'Notes'],
              ] as const).map(([key, label]) => {
                const on = searchScope === key
                return (
                <button key={key} type="button" onClick={() => setSearchScope(key)} aria-pressed={on} className={`il-chip${on ? ' on' : ''}`}>
                  {label}
                </button>
                )
              })}
            </div>
          )}
          {/* Location filter — scopes the whole inbox to one outlet. Only shown
              when the business actually has more than one location. */}
          {outlets.length > 1 && (
            <div style={{ position: 'relative', marginTop: 10 }}>
              {/* Map-pin icon sits inside the control so the select shows a real
                  SVG rather than an emoji glyph that renders differently per OS. */}
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex', color: locationFilter !== 'all' ? 'var(--coral)' : '#52525b' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              </span>
              <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} aria-label="Location" className={`il-loc${locationFilter !== 'all' ? ' on' : ''}`}
                style={{ appearance: 'none' }}>
                <option value="all">All locations</option>
                {outlets.map(o => (
                  <option key={o.id} value={o.id}>{o.label || o.suburb || 'Outlet'}</option>
                ))}
              </select>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#71717a' }}><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          )}

          {/* Assignment tabs — a horizontally scrollable strip (Coax style).
              Instead of a raw scrollbar, chevron buttons flank the row and appear
              only when it overflows, dimming at each end. */}
          {(() => {
            const showArrows = assignArrows.l || assignArrows.r
            const unreadN = conversations.filter(c => c.is_unread && !['closed', 'resolved'].includes(c.status)).length
            const arrowBtn = (dir: 'l' | 'r', enabled: boolean, dot = false) => (
              <button type="button" aria-label={dir === 'l' ? 'Scroll left' : 'Scroll right'}
                onClick={() => assignScrollRef.current?.scrollBy({ left: dir === 'l' ? -150 : 150, behavior: 'smooth' })}
                disabled={!enabled}
                style={{ position: 'relative', flexShrink: 0, width: 26, height: 26, borderRadius: 999, border: 'none', background: '#f4f4f5', color: '#52525b', cursor: enabled ? 'pointer' : 'default', opacity: enabled ? 1 : 0.35, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, transition: 'opacity 0.12s' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points={dir === 'l' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
                </svg>
                {/* Orange "new" dot: unread conversations live on a tab scrolled
                    out of view in this direction. */}
                {dot && <span style={{ position: 'absolute', top: -3, right: -3, width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', border: '1.5px solid #fff' }} />}
              </button>
            )
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
                {showArrows && arrowBtn('l', assignArrows.l)}
                <div ref={assignScrollRef} className="inbox-assign-tabs" style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: 1, paddingBottom: 0 }}>
                  {([
                    ['all', 'All'],
                    ['unread', 'Unread'],
                    ['mine', 'Assigned to me'],
                    ['unassigned', 'Unassigned'],
                  ] as const).map(([key, label]) => {
                    const unreadN = key === 'unread' ? conversations.filter(c => c.is_unread && !['closed', 'resolved'].includes(c.status)).length : 0
                    return (
                    <button key={key} type="button" onClick={() => setAssignFilter(key)} aria-pressed={assignFilter === key} className={`il-chip${assignFilter === key ? ' on' : ''}`}>
                      {label}{key === 'unread' && unreadN > 0 && <span className="il-chip-n">{unreadN}</span>}
                    </button>
                    )
                  })}
                </div>
                {showArrows && arrowBtn('r', assignArrows.r, unreadN > 0 && assignArrows.r && assignFilter !== 'unread')}
              </div>
            )
          })()}
          {/* Open / Closed — a status menu like Sellio's — and the other filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <div style={{ position: 'relative' }} data-status-menu>
              <button type="button" onClick={() => setShowStatusMenu(v => !v)} aria-haspopup="menu" aria-expanded={showStatusMenu}
                className={`il-status${showStatusMenu ? ' on' : ''}`} title="Filter by status">
                {statusFilter === 'open' ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 13.5 5.6 5.4A1.5 1.5 0 0 1 7 4.5h10a1.5 1.5 0 0 1 1.4.9l2.6 8.1V18.5A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5z"/><path d="M3.4 13.5h4.8l1.6 2.5h4.4l1.6-2.5h4.8"/></svg> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9"/><polyline points="8 12.5 11 15.5 16 9.5"/></svg>}
                {statusFilter === 'open' ? 'Open' : 'Closed'}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ color: '#71717a' }}><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {showStatusMenu && (
                <div className="th-menu" role="menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, width: 210, zIndex: 40, transformOrigin: 'top left' }}>
                  <p className="th-menu-label">Filter by status</p>
                  {([['open', 'Open'], ['closed', 'Closed']] as const).map(([k, label]) => (
                    <button key={k} type="button" role="menuitemradio" aria-checked={statusFilter === k} className={`th-menu-row${statusFilter === k ? ' cur' : ''}`}
                      onClick={() => { setShowStatusMenu(false); if (k !== statusFilter) { setConversations([]); setConvLimit(50); setStatusFilter(k) } }}>
                      {k === 'open' ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 13.5 5.6 5.4A1.5 1.5 0 0 1 7 4.5h10a1.5 1.5 0 0 1 1.4.9l2.6 8.1V18.5A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5z"/><path d="M3.4 13.5h4.8l1.6 2.5h4.4l1.6-2.5h4.8"/></svg> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9"/><polyline points="8 12.5 11 15.5 16 9.5"/></svg>}
                      <span style={{ flex: 1 }}>{label}</span>
                      {statusFilter === k && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#18181b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12"/></svg>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => setShowFilters(true)} title="More filters" aria-label={activeFilterCount > 0 ? `More filters (${activeFilterCount} on)` : 'More filters'}
              className={`th-btn${activeFilterCount > 0 ? ' on' : ''}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><line x1="4" y1="7" x2="20" y2="7"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="17" x2="14" y2="17"/></svg>
              {activeFilterCount > 0 && <span className="il-badge">{activeFilterCount}</span>}
            </button>
          </div>
          </div></div>
        </div>

        {/* List */}
        <div className="il-scroll" style={{ flex: 1, overflowY: 'auto' }}>
          {/* The conversations first; the setup card sits at the foot of the
              column (below a short list, after a long one), clear of the + button. */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
          <div style={{ flex: 'none' }}>
          {colvyAt === 0 && filteredConvs.length === 0 && colvyRowEl}
          {/* Colvy's own chat is a conversation too: no "nothing here" under it. */}
          {filteredConvs.length === 0 && colvyAt !== 0 && (() => {
            // An empty list that still feels alive, worded for what's being looked at.
            const term = searchTerm.trim()
            const [title, line] = term ? ['No matches', `Nothing matches “${term}”. Try a name, number or a word from the chat.`]
              : statusFilter === 'closed' ? ['No closed conversations', 'Conversations you close will show up here.']
              : activeFilterCount > 0 || locationFilter !== 'all' ? ['Nothing matches these filters', 'Try clearing a filter to see more.']
              : assignFilter === 'unread' ? ['You’re all caught up', 'New messages will show up here.']
              : assignFilter === 'mine' ? ['Nothing assigned to you', 'Conversations assigned to you will show up here.']
              : assignFilter === 'unassigned' ? ['Every conversation has an owner', 'New ones without an owner will show up here.']
              : ['No conversations yet', 'New conversations will show up here.']
            return <div className="il-wide-only" style={{ paddingTop: 24 }}><EmptyScroll title={title} line={line} /></div>
          })()}
          {filteredConvs.map((conv, ci) => {
            // Customer name first — the source is a tag, not the headline.
            const c: any = conv
            const contact = c.contacts || {}
            const displayName =
              contact.name ||
              contact.email ||
              contact.phone ||
              c.sms_number ||
              (c.subject && !/^(abandoned cart|order #)/i.test(c.subject) ? c.subject : null) ||
              'Visitor'

            // Where is this conversation happening NOW?
            const subj = (c.subject || '').toLowerCase()
            const ch = String(c.channel || '').toLowerCase()
            // Each tag is its colour: a dot and the label on a soft tint of it.
            let source: { label: string; fg: string }
            // Set when the top tag is the source (Website) and the cart state
            // needs to show alongside it.
            let cartSecond: any = null
            // A live non-web channel wins over the subject-derived tag. Someone
            // who began as an order/cart but is now texting should read "SMS",
            // not keep an "Order Placed" badge forever.
            const CHANNEL_BADGE: Record<string, any> = {
              sms:       { label: 'SMS', fg: '#0d9488' },
              email:     { label: 'Email', fg: '#4f46e5' },
              instagram: { label: 'Instagram', fg: '#db2777' },
              facebook:  { label: 'Messenger', fg: '#2563eb' },
              messenger: { label: 'Messenger', fg: '#2563eb' },
              whatsapp:  { label: 'WhatsApp', fg: '#16a34a' },
              // A phone call is NOT a live-chat enquiry — without this it fell
              // through to the "Live Chat Enquiry" default below.
              phone:     { label: 'Phone', fg: '#0284c7' },
              call:      { label: 'Phone', fg: '#0284c7' },
              voice:     { label: 'Phone', fg: '#0284c7' },
              // Someone's private Colvy chat (Colvy's own inbox only).
              colvy:     { label: 'Colvy app', fg: '#e2553f' },
            }
            if (CHANNEL_BADGE[ch]) {
              source = CHANNEL_BADGE[ch]
            } else if (subj.startsWith('abandoned cart') && !(c as any).order_status && (c as any).cart_status !== 'recovered') {
              // Only an UNrecovered cart shows the "Abandoned Cart" badge.
              // Once it's recovered (an order was placed), the conversation gets
              // an order_status and should read as an order below — otherwise it
              // wrongly stayed "Abandoned Cart" forever after the sale.
              // The top tag is the SOURCE the enquiry came from (the website),
              // with the cart state shown as the second badge.
              source = { label: 'Website', fg: '#7c3aed' }
              cartSecond = { label: 'Abandoned cart', fg: '#e11d48' }
            } else if (subj.startsWith('order #') || (c as any).order_status) {
              // Read the ACTUAL order status. This used to say "Order Placed" for
              // every order conversation — including failed payments, which is
              // exactly backwards: those are the ones needing attention.
              const os = String((c as any).order_status || '').toLowerCase()
              const ORDER_BADGE: Record<string, any> = {
                failed:     { label: 'Payment failed', fg: '#dc2626' },
                cancelled:  { label: 'Order cancelled', fg: '#dc2626' },
                refunded:   { label: 'Order refunded', fg: '#d97706' },
                'on-hold':  { label: 'Order on hold', fg: '#d97706' },
                pending:    { label: 'Payment pending', fg: '#ea580c' },
                completed:  { label: 'Order completed', fg: '#16a34a' },
                processing: { label: 'Order placed', fg: '#16a34a' },
              }
              source = ORDER_BADGE[os] || { label: 'Order placed', fg: '#16a34a' }
            } else {
              source = { label: 'Live Chat Enquiry', fg: '#7c3aed' }
            }
            const isLiveChat = source.label === 'Live Chat Enquiry'
            // Only PULSE as "live" when the visitor is genuinely on the widget
            // right now (heartbeat < 2 min). Otherwise the animated green dot made
            // every stale enquiry look like someone was actively waiting.
            const liveSeenTs = (c as any).page_seen_at ? parseTs((c as any).page_seen_at) : null
            const isLiveNow = !!liveSeenTs && (Date.now() - liveSeenTs.getTime()) < 120000

            // Secondary badge: when the primary badge is the CHANNEL (SMS, email,
            // Messenger…), also surface the order status if this customer has an
            // order — so an SMS conversation with a placed order shows BOTH
            // "SMS" and "Order Placed" rather than hiding the sale.
            let secondBadge: any = cartSecond
            if (CHANNEL_BADGE[ch]) {
              const os2 = String((c as any).order_status || '').toLowerCase()
              const ORDER_BADGE2: Record<string, any> = {
                failed:     { label: 'Payment failed', fg: '#dc2626' },
                cancelled:  { label: 'Order cancelled', fg: '#dc2626' },
                refunded:   { label: 'Order refunded', fg: '#d97706' },
                'on-hold':  { label: 'Order on hold', fg: '#d97706' },
                pending:    { label: 'Payment pending', fg: '#ea580c' },
                completed:  { label: 'Order completed', fg: '#16a34a' },
                processing: { label: 'Order placed', fg: '#16a34a' },
              }
              if (os2 && ORDER_BADGE2[os2]) secondBadge = ORDER_BADGE2[os2]
              else if (subj.startsWith('abandoned cart') && (c as any).cart_status !== 'recovered' && !os2) secondBadge = { label: 'Abandoned cart', fg: '#e11d48' }
            }

            const accent = companyInfo?.accent_color || 'var(--coral)'
            const unread = conv.is_unread && selected?.id !== conv.id

            // How long has the customer been waiting for a reply? Only flag a
            // conversation as overdue when it's genuinely unanswered — i.e. it's
            // UNREAD (the customer's latest message hasn't been actioned) AND the
            // last activity is old. The old code read last_customer_message_at,
            // which is never kept current, so it showed stale "129 hours" even
            // right after a live back-and-forth.
            let waitingHours = 0
            const lastAt = parseTs(conv.last_message_at)
            if (lastAt && conv.status !== 'closed' && conv.status !== 'resolved' && (c as any).is_unread) {
              waitingHours = (Date.now() - lastAt.getTime()) / 3600000
            }
            const isOverdue = waitingHours >= 3

            return (
            <Fragment key={conv.id}>
            {ci === colvyAt && colvyRowEl}
            {(() => {
              const isSel = selected?.id === conv.id
              // The channel as a badge on the avatar (Sellio-style), so the tag
              // row is left for what matters: order and cart state, and where.
              const chBrand = ({ sms: 'sms', email: 'email', instagram: 'instagram', facebook: 'messenger', messenger: 'messenger', whatsapp: 'whatsapp', phone: 'calls', call: 'calls', voice: 'calls', colvy: 'colvy' } as Record<string, BrandKey>)[ch] || 'chat'
              const showSource = !CHANNEL_BADGE[ch]
              const av = (contact as any).avatar_url as string | undefined
              const hue = Array.from(String(displayName)).reduce((h, x) => (h * 31 + x.charCodeAt(0)) % 360, 7)
              const subjLc = String(conv.subject || '').toLowerCase()
              const hasWhere = locationFilter === 'all' && (!!((conv as any).assigned_location_id || (conv as any).location_id) || subjLc.startsWith('abandoned cart') || subjLc.startsWith('order #') || !!(conv as any).order_status || ['chat', 'widget', 'live_chat'].includes(String(conv.channel)))
              const hasTags = showSource || !!secondBadge || hasWhere
              return (
            <button type="button" onClick={() => selectConversation(conv)} data-conv-row={conv.id}
              onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, conv }) }}
              title={listCollapsed ? String(displayName) : undefined}
              className={`ilc${isSel ? ' sel' : ''}${unread ? ' unread' : ''}${hasTags ? ' tagged' : ''}`} style={{ ['--acc' as any]: accent }}>
              <span className="ilc-avcol">
                <span className="ilc-av" style={{ ['--h' as any]: hue }}>
                  {av
                    ? <img src={av} alt="" referrerPolicy="no-referrer" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                    : <span aria-hidden>{String(displayName).replace(/^[^A-Za-z0-9]+/, '').charAt(0).toUpperCase() || '#'}</span>}
                  <span className="ilc-ch" title={CHANNEL_BADGE[ch]?.label || 'Website'}><BrandLogo brand={chBrand} size={18} radius={9} /></span>
                  {unread && <span className="ilc-new" aria-hidden />}
                </span>
                {hasTags && <span className="ilc-line" aria-hidden />}
              </span>
              <span className="ilc-main">
                <span className="ilc-top">
                  {pinnedIds.has(conv.id) && (
                    <span title="Pinned" className="ilc-pin">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14l-1.5-3V7a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7z"/></svg>
                    </span>
                  )}
                  <span className="ilc-name"><Highlight text={displayName} q={searchTerm} accent={accent} /></span>
                  {contact.prexty_customer_id && <PrextyMark size={14} title="Prexty POS customer" />}
                  <span className="ilc-time">
                    {isOverdue && (
                      <span title={`Waiting ${Math.floor(waitingHours)}h for a reply — reply or close this conversation.`} style={{ display: 'inline-flex', color: '#f59e0b' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
                      </span>
                    )}
                    {listTime(conv.last_message_at)}
                  </span>
                </span>
                <span className="ilc-mid">
                  {callMatches(activeCall, { conversationId: c.id, contactId: c.contact_id, phone: contact.phone || c.sms_number || (conv as any).subject || (typeof displayName === 'string' ? displayName : '') }) ? (
                    <p style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 12, color: '#059669', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', animation: 'livePulse 1.6s ease-in-out infinite', flexShrink: 0 }} />
                      {activeCall?.status === 'ringing' ? 'Calling…' : 'Ongoing call'}
                    </p>
                  ) : ((conv.ai_status === 'thinking' || conv.ai_status === 'pending') && (!conv.ai_draft_send_at || Date.parse(conv.ai_draft_send_at) > Date.now() - 30000)) ? (
                    <p style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: '#e2553f', display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff7a6b', animation: 'livePulse 1.6s ease-in-out infinite', flexShrink: 0 }} />
                      {conv.ai_status === 'pending' ? 'Colvy AI is about to reply' : 'Colvy AI is writing…'}
                    </p>
                  ) : (
                  <p style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 12, color: conv.is_unread ? 'var(--ink)' : '#6b7280', fontWeight: conv.is_unread ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
                    {(() => { const k = callGlyphKind(conv.last_message); return k ? <CallGlyph kind={k} /> : null })()}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Highlight text={(callGlyphKind(conv.last_message) ? stripCallEmoji(conv.last_message) : waitlistPreview(conv.last_message)) || 'No messages yet'} q={searchTerm} accent={accent} />
                    </span>
                  </p>
                  )}
                  {conv.assigned_name && (
                    <span className="ilc-who" title={`Assigned to ${conv.assigned_name}`} aria-label={`Assigned to ${conv.assigned_name}`}>{conv.assigned_name.charAt(0).toUpperCase()}</span>
                  )}
                  {conv.unread_count > 0 && <span className="ilc-count">{conv.unread_count}</span>}
                </span>
                {(() => {
                  if (!searchTerm.trim()) return null
                  const hit = searchMsgHits[c.id]
                  if (!hit || hit.field === 'contact' || !hit.snippet) return null
                  const ql = searchTerm.trim().toLowerCase()
                  // Skip if the last-message preview already shows the match.
                  if ((conv.last_message || '').toLowerCase().includes(ql)) return null
                  return (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 3, fontSize: 11, color: '#6b7280', overflow: 'hidden' }}>
                      <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 600, color: '#7c3aed' }}>{hit.field}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                        <Highlight text={hit.snippet} q={searchTerm} accent={accent} />
                      </span>
                    </div>
                  )
                })()}
              </span>
              {hasTags && (
                <span className="ilc-tags">
                  {showSource && (
                    <span className="cv-tag" style={{ ['--tag' as any]: isLiveChat && isLiveNow ? '#16a34a' : source.fg }}>
                      <span className={`cv-tag-dot${isLiveChat && isLiveNow ? ' live' : ''}`} />
                      {isLiveChat ? (isLiveNow ? 'Live chat' : 'Web enquiry') : source.label}
                    </span>
                  )}
                  {secondBadge && (
                    <span className="cv-tag" style={{ ['--tag' as any]: secondBadge.fg }}>
                      <span className="cv-tag-dot" />
                      {secondBadge.label}
                    </span>
                  )}
                  {locationFilter === 'all' && (() => {
                    const locId = (conv as any).assigned_location_id || (conv as any).location_id
                    const loc = outlets.find((o: any) => o.id === locId)
                    // An abandoned cart or a placed order came from the store, not the
                    // chat widget — labelling either "Live Chat" was misleading. Orders
                    // carry the customer's name as the subject, so detect them by
                    // order_status (matching the source badge above), not just subject.
                    const subjLc = String(conv.subject || '').toLowerCase()
                    const isCart = subjLc.startsWith('abandoned cart')
                    const isOrder = !!(conv as any).order_status || subjLc.startsWith('order #')
                    const isWidget = conv.channel === 'chat' || conv.channel === 'widget' || conv.channel === 'live_chat'
                    const label = loc ? (loc.label || loc.suburb)
                      : (isCart || isOrder) ? 'Website'
                      : isWidget ? 'Live Chat'
                      : null
                    if (!label) return null
                    return (
                      <span className="ilc-where">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        <span>{label}</span>
                      </span>
                    )
                  })()}
                </span>
              )}
            </button>
              )
            })()}
            </Fragment>
            )
          })}
          {colvyAt > 0 && colvyAt === filteredConvs.length && colvyRowEl}
          {hasMoreConvs && (
            <button type="button" onClick={() => setConvLimit(l => l + 50)} className="il-wide-only"
              style={{ display: 'block', width: '100%', padding: '12px', border: 'none', background: 'transparent', color: 'var(--coral)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              Load more conversations
            </button>
          )}
          </div>
          {/* Until the chat widget is on their website: how to add it (owners and admins). */}
          {isManager && !searchTerm.trim() && statusFilter !== 'closed' && activeFilterCount === 0 && <div className="il-wide-only"><WidgetInstallCard companyId={companyId} dock /></div>}
          </div>
        </div>
        </div>
      </div>
    </>
  )
}
