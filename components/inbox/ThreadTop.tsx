'use client'

// The top of an open conversation: header with its tools, the customer glance,
// the live-page banner and find-in-conversation.
// Moved out of app/admin/inbox/page.tsx unchanged. Its names come from the
// inbox controller through useInbox().

import { MOODS, MOOD_COLOR, MOOD_LABEL, MoodBadge, MoodFace, isMood, launchMood } from '@/components/inbox/Mood'
import { decodeEntities as dec } from '@/lib/decode-entities'
import { supabase } from '@/lib/supabase'
import CustomerGlance from '@/components/inbox/CustomerGlance'
import { CHANNEL_NAME, STATUS_COLOR, STATUS_ICON, timeAgo } from '@/components/inbox/inbox-shared'
import { useInbox } from '@/components/inbox/InboxContext'

export default function ThreadTop() {
  const {
    activeChannel, answeringRole, assignSearch, assignTo, companyId, contact, contactReviews,
    copyChatLink, generateAiSummary, headerName, igThemeActive, isOnPageNow, isWebChat, linkCopied,
    mToolsOpen, moveMenuRef, moveToOutlet, msgMatchIds, msgSearch, msgSearchIdx, msgrThemeActive,
    outlets, pinnedIds, selected, setActivePanel, setAssignSearch, setMToolsOpen, setMobilePane,
    setMsgSearch, setMsgSearchIdx, setSelected, setSentiment, setShowActions, setShowAssignMenu,
    setShowDialer, setShowMergePicker, setShowMoveMenu, setShowMsgSearch, setShowProducts,
    setShowSnooze, setStatus, setTabletContact, showActions, showAssignMenu, showMoveMenu,
    showMsgSearch, showProducts, showSnooze, showToast, snoozeConversation, tabletContact,
    teamMembers, togglePin, user, wooOrders,
  } = useInbox()
  return (
    <>
      {/* Detected contact details are auto-saved silently to empty fields;
          the contact card marks each with a sparkle ("Colvy AI saved
          this …"). No banner here — it was intrusive. */}

      {/* Thread header */}
      <div className={`inbox-thread-header${mToolsOpen ? ' m-tools-open' : ''}`} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: igThemeActive ? 'linear-gradient(135deg, rgba(131,58,180,0.08), rgba(225,48,108,0.08))' : msgrThemeActive ? 'linear-gradient(135deg, rgba(0,178,255,0.08), rgba(0,106,255,0.08))' : '#fff', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* Mobile: back to conversation list */}
        <button type="button" className="inbox-mobile-only" onClick={() => setMobilePane('list')} title="Back to chats" aria-label="Back to chats"
          style={{ display: 'none', height: 36, flexShrink: 0, borderRadius: 999, border: 'none', background: 'color-mix(in srgb, var(--coral) 12%, #fff)', cursor: 'pointer', alignItems: 'center', gap: 3, padding: '0 10px 0 6px', color: 'var(--coral)', fontSize: 13.5, fontWeight: 700, order: -2 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          <span className="inbox-back-label">Chats</span>
        </button>
        {/* Contact avatar — real profile photo (from Messenger/Instagram)
            when we have it, initials otherwise. */}
        {(() => {
          const nm = headerName
          const av = (contact as any)?.avatar_url
          return av ? (
            <img src={av} alt={nm} referrerPolicy="no-referrer"
              style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
          ) : (
            <span style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, flexShrink: 0 }}>
              {nm.charAt(0).toUpperCase()}
            </span>
          )
        })()}
        <div className="inbox-header-name" style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
              {headerName}
            </span>
            {contact?.id && (
              <a href={`/admin/customers/profile?id=${contact.id}`}
                title="Open full customer profile"
                style={{ display: 'inline-flex', alignItems: 'center', color: '#2563eb', flexShrink: 0 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M17 7H8M17 7v9"/></svg>
              </a>
            )}
            {/* The customer's mood: flies here from the menu, then idles */}
            {isMood((selected as any).sentiment) && <MoodBadge mood={(selected as any).sentiment} size={20} />}
          </p>
          {/* Subtitle line: last-activity / channel, plus compact
              engagement chips (Google review · social comment) so the name
              line above stays uncluttered. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            {isWebChat
              ? (isOnPageNow && selected.page_title && <span style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>On: {dec(selected.page_title)}</span>)
              : (() => {
                  // "Last activity 5m ago", Coax-style, from the customer's
                  // most recent message on the conversation.
                  const la = (selected as any).last_customer_activity_at || (selected as any).last_message_at
                  const rel = la ? timeAgo(la) : null
                  return rel
                    ? <span style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>Last activity {rel === 'now' ? 'just now' : `${rel} ago`}</span>
                    : <span style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>via {CHANNEL_NAME[activeChannel] || activeChannel}</span>
                })()}
            {contactReviews.count > 0 && contactReviews.latest && (
              <a href={`/admin/reviews?review=${encodeURIComponent(contactReviews.latest.id)}`}
                title={`Reviewed ${contactReviews.latest.rating}/5 on Google — view review`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: '#fff7e6', color: '#b7791f', textDecoration: 'none' }}>
                <img src="https://www.google.com/favicon.ico" alt="" style={{ width: 10, height: 10 }} /> ★{contactReviews.latest.rating}
              </a>
            )}
            {contactReviews.commentCount > 0 && contactReviews.latestComment && (
              <a href={`/admin/social?comment=${encodeURIComponent(contactReviews.latestComment.id)}`}
                title={`Commented on ${contactReviews.latestComment.platform === 'instagram' ? 'Instagram' : 'Facebook'} — view comment`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: contactReviews.latestComment.platform === 'instagram' ? '#fdeef6' : '#eef2ff', color: contactReviews.latestComment.platform === 'instagram' ? '#c13584' : '#1d4ed8', textDecoration: 'none' }}>
                💬 {contactReviews.latestComment.platform === 'instagram' ? 'IG' : 'FB'}
              </a>
            )}
          </div>
        </div>

        {/* Browser calling — opens the draggable floating call panel
            (GlobalCallBar) so the call survives navigating away or
            switching conversations. */}
        {(contact?.phone || (selected as any).sms_number) && (
          <button type="button" title="Call" data-callbar-btn className="th-pill th-call"
            onClick={() => window.dispatchEvent(new CustomEvent('colvy:call', { detail: {
              number: contact?.phone || (selected as any).sms_number,
              name: contact?.name,
              contactId: contact?.id,
              conversationId: selected.id,
            } }))}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            <span className="inbox-call-label">Call</span>
          </button>
        )}

        {/* Tablet: slide the contact panel in */}
        <button type="button" className={`inbox-tablet-only th-btn${tabletContact ? ' on' : ''}`} style={{ display: 'none' }} onClick={() => setTabletContact(v => !v)} title="Contact info" aria-label="Contact info" aria-expanded={tabletContact}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M15 4v16"/></svg>
        </button>
        {/* Mobile: open contact panel */}
        <button type="button" className="inbox-mobile-only th-btn" style={{ display: 'none' }} onClick={() => setMobilePane('contact')} title="Contact info" aria-label="Contact info">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a8.38 8.38 0 0 1 13 0"/></svg>
        </button>
        {/* Phones: everything else (pin, assign, status, AI, products,
            dialler, search, snooze…) opens in a tray under this row, so
            the name row stays one tidy line with nothing cut off. */}
        <button type="button" className={`inbox-mobile-only inbox-m-more th-btn${mToolsOpen ? ' on' : ''}`} style={{ display: 'none' }} onClick={() => setMToolsOpen(v => !v)}
          title={mToolsOpen ? 'Hide actions' : 'More actions'} aria-label={mToolsOpen ? 'Hide actions' : 'More actions'} aria-expanded={mToolsOpen}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
        </button>
        <span className="inbox-m-break" aria-hidden style={{ display: 'none' }} />


        {/* Status: a tinted pill with its icon, like Sellio's. */}
        {(() => {
          const st = STATUS_COLOR[selected.status] || { bg: '#f3f4f6', color: '#6b7280' }
          return (
            <div className="inbox-status-pill th-status" style={{ ['--st-bg' as any]: st.bg, ['--st-fg' as any]: st.color }}>
              <span className="th-status-ic" aria-hidden>{STATUS_ICON[selected.status] || STATUS_ICON.open}</span>
              <select value={selected.status} onChange={e => setStatus(e.target.value)} aria-label="Conversation status">
                {Object.entries(STATUS_COLOR).map(([k, v]) => <option key={k} value={k}>{v.color && k.charAt(0).toUpperCase() + k.slice(1)}</option>)}
              </select>
              <svg className="th-status-chev" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          )
        })()}

        {/* Assign and ⋯ are TRUE siblings of the scrolling tools strip (not
            inside it) — the strip's overflow-x/mask was clipping their taps
            and dropdown menus when they lived inside it. */}
        {/* Assign: who has it (or "Assign"), and a menu to find a teammate. */}
        <div style={{ position: 'relative' }} data-assign-menu>
          <button type="button" onClick={() => { setShowAssignMenu(v => !v); setAssignSearch('') }} aria-expanded={showAssignMenu}
            title={selected.assigned_name ? `Assigned to ${selected.assigned_name}` : 'Assign this conversation'} aria-label={selected.assigned_name ? `Assigned to ${selected.assigned_name}` : 'Assign'}
            className={`th-pill th-assign${selected.assigned_name ? '' : ' none'}${showAssignMenu ? ' on' : ''}`}>
            {selected.assigned_name
              ? <><span className="th-av">{selected.assigned_name.charAt(0).toUpperCase()}</span><span className="th-assign-name">{selected.assigned_name}</span></>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="9" cy="7.5" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M19 8v6M16 11h6"/></svg>}
          </button>
          {showAssignMenu && (() => {
            const q = assignSearch.trim().toLowerCase()
            const matches = teamMembers.filter((m: any) => !q || (m.name || '').toLowerCase().includes(q))
            const mine = teamMembers.find((m: any) => m.user_id && m.user_id === user?.id)
            const row = (m: any, label?: string) => {
              const cur = selected.assigned_to === m.user_id
              return (
                <button key={(label ? 'me-' : '') + m.id} type="button" onClick={() => assignTo(m)} className={`th-menu-row${cur ? ' cur' : ''}`}>
                  <span className="th-av sm">{m.name?.charAt(0).toUpperCase()}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label || m.name}</span>
                  {cur && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-label="Assigned"><polyline points="20 6 9 17 4 12"/></svg>}
                </button>
              )
            }
            return (
              <div className="th-menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 260 }}>
                <div style={{ position: 'relative' }}>
                  <input autoFocus value={assignSearch} onChange={e => setAssignSearch(e.target.value)} placeholder="Find a teammate" aria-label="Find a teammate" className="th-menu-search" />
                  {assignSearch && (
                    <button type="button" onClick={() => setAssignSearch('')} aria-label="Clear"
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center', padding: 2 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </div>
                <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                  {mine && !q && <>{row(mine, 'Assign to me')}<div className="th-menu-sep" /><p className="th-menu-label">Teammates</p></>}
                  {matches.map(m => row(m))}
                  {matches.length === 0 && <p style={{ margin: 0, padding: '10px', fontSize: 13, color: '#9ca3af' }}>No teammates match.</p>}
                  {selected.assigned_to && !q && <><div className="th-menu-sep" /><button type="button" onClick={() => assignTo(null)} className="th-menu-row danger">Unassign</button></>}
                </div>
              </div>
            )
          })()}
        </div>

        {/* Tools strip: plain round icons. On phones this becomes a single
            horizontally scrollable row under the customer's name — the
            native chat-app pattern. */}
        <div className="inbox-header-tools">
        {/* Dialler — call any number */}
        <button type="button" onClick={() => setShowDialer(true)} title="Dialler — call any number" aria-label="Dialler" className="th-btn th-dial">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden>
            <circle cx="5.5" cy="4.5" r="1.8"/><circle cx="12" cy="4.5" r="1.8"/><circle cx="18.5" cy="4.5" r="1.8"/>
            <circle cx="5.5" cy="11" r="1.8"/><circle cx="12" cy="11" r="1.8"/><circle cx="18.5" cy="11" r="1.8"/>
            <circle cx="5.5" cy="17.5" r="1.8"/><circle cx="12" cy="17.5" r="1.8"/><circle cx="18.5" cy="17.5" r="1.8"/>
          </svg>
        </button>

        {/* Search messages toggle */}
        <button type="button" onClick={() => { setShowMsgSearch(v => !v); setMsgSearch(''); setMsgSearchIdx(0) }} title="Search messages" aria-label="Search messages" aria-pressed={showMsgSearch}
          className={`th-btn${showMsgSearch ? ' on' : ''}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7"/><line x1="20.5" y1="20.5" x2="16" y2="16"/></svg>
        </button>

        {/* AI on/off for this conversation (the agent bar above the reply box has it when an agent answers here) */}
        {!answeringRole(selected) && <button type="button"
          onClick={async () => {
            if (!selected) return
            // null = follow the company default; false = silenced here.
            const next = (selected as any).ai_enabled === false ? null : false
            await (supabase as any).from('conversations').update({ ai_enabled: next }).eq('id', selected.id)
            setSelected({ ...selected, ai_enabled: next } as any)
            showToast(next === false ? 'AI paused for this chat' : 'AI following your default setting')
          }}
          title={(selected as any).ai_enabled === false ? 'AI is paused here — click to re-enable' : 'AI may reply here — click to pause it'}
          aria-label={(selected as any).ai_enabled === false ? 'Turn AI back on here' : 'Pause AI here'}
          className={`th-btn th-ai${(selected as any).ai_enabled === false ? ' off' : ''}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2l1.6 5.3L19 9l-5.4 1.7L12 16l-1.6-5.3L5 9l5.4-1.7z"/><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg>
          {(selected as any).ai_enabled === false && <span className="th-ai-slash" aria-hidden />}
        </button>}

        {/* Product search */}
        <button type="button" onClick={() => setShowProducts(true)} title="Product search — send a price or buy link" aria-label="Product search"
          className={`th-btn${showProducts ? ' on' : ''}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
        </button>

        {/* Move or view enquiries across outlets */}
        {outlets.length > 0 && (
          <div ref={moveMenuRef} style={{ position: 'relative' }} data-move-menu>
            <button type="button" onClick={() => setShowMoveMenu(v => !v)} title="Move or view enquiries" aria-label="Move or view enquiries" aria-expanded={showMoveMenu}
              className={`th-btn${showMoveMenu ? ' on' : ''}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
            </button>
            {showMoveMenu && (
              <div className="th-menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 260, zIndex: 80 }}>
                <p className="th-menu-label" style={{ marginTop: 4 }}>Move or view enquiries</p>
                {outlets.map(o => {
                  const isCurrent = (selected as any).assigned_location_id === o.id
                  return (
                    <button key={o.id} type="button" onClick={() => !isCurrent && moveToOutlet(o)} className={`th-menu-row${isCurrent ? ' cur' : ''}`} style={{ cursor: isCurrent ? 'default' : 'pointer' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label || o.suburb}</span>
                      {isCurrent && <span style={{ fontSize: 12, fontWeight: 600, color: '#71717a', background: '#f4f4f5', borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>Current</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
        </div>

        {/* Pin / unpin this conversation for the current agent. Mirrors the
            right-click action so it's reachable while the thread is open. */}
        {(() => {
          const isPinned = pinnedIds.has(selected.id)
          return (
            <button type="button" className={`inbox-pin-btn th-btn${isPinned ? ' on' : ''}`} onClick={() => togglePin(selected)}
              title={isPinned ? 'Unpin from top' : 'Pin to top'} aria-label={isPinned ? 'Unpin conversation' : 'Pin conversation'} aria-pressed={isPinned}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14l-1.5-3V7a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7z"/></svg>
            </button>
          )
        })()}

        {/* More: snooze, copy link, merge, AI summary, and the customer's mood */}
        <div style={{ position: 'relative' }} data-actions-menu>
          <button type="button" onClick={() => setShowActions(v => !v)} title="More actions" aria-label="More actions" aria-expanded={showActions}
            className={`th-btn${showActions ? ' on' : ''}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
          </button>
          {showActions && (
            <div className="th-menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 236 }}>
              <button type="button" onClick={() => { setShowActions(false); setShowSnooze(true) }} className="th-menu-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Snooze
              </button>
              <button type="button" onClick={() => { copyChatLink(); setShowActions(false) }} className="th-menu-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> {linkCopied ? 'Copied!' : 'Copy chat link'}
              </button>
              <button type="button" onClick={() => { setShowActions(false); setShowMergePicker(true) }} className="th-menu-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8L22 12L18 16"/><path d="M2 12H22"/><path d="M6 8L2 12L6 16"/></svg> Merge conversation
              </button>
              <button type="button" onClick={() => { generateAiSummary(); setActivePanel('info'); setShowActions(false) }} className="th-menu-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/></svg> AI summary &amp; to-dos
              </button>
              <div className="th-menu-sep" />
              <p className="th-menu-label">Customer mood</p>
              <div style={{ display: 'flex', gap: 4, padding: '2px 4px 4px' }}>
                {MOODS.map(m => {
                  const on = (selected as any).sentiment === m
                  return (
                    <button key={m} type="button"
                      onClick={e => {
                        // Picking a mood sends it flying to the name; picking the current one clears it.
                        if (!on) launchMood(m, e.currentTarget.querySelector('.mf') || e.currentTarget)
                        setShowActions(false)
                        setSentiment(on ? null : m)
                      }}
                      title={on ? `${MOOD_LABEL[m]} (click to clear)` : MOOD_LABEL[m]} aria-label={on ? `Clear mood ${MOOD_LABEL[m]}` : `Mark ${MOOD_LABEL[m]}`} aria-pressed={on}
                      className={`th-mood mf-play${on ? ' on' : ''}`} style={{ ['--mood' as any]: MOOD_COLOR[m] }}>
                      <MoodFace mood={m} size={22} idle={on} />
                      <span className="th-mood-l">{MOOD_LABEL[m]}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Snooze menu */}
        {showSnooze && (
          <div style={{ position: 'absolute', top: 54, right: 16, width: 200, background: '#fff', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.14)', zIndex: 60, overflow: 'hidden' }}>
            <p style={{ margin: 0, padding: '10px 14px 6px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Snooze until</p>
            {[['1 hour', 1], ['3 hours', 3], ['Tomorrow', 24], ['Next week', 168]].map(([label, hrs]) => (
              <button key={label as string} type="button" onClick={() => snoozeConversation(new Date(Date.now() + (hrs as number) * 3600000))}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                {label}
              </button>
            ))}
            <button type="button" onClick={() => setShowSnooze(false)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', borderTop: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: 13, color: '#9ca3af' }}>Cancel</button>
          </div>
        )}
      </div>

      {/* Who this is: spent, orders, last order, tags; click for recent orders. */}
      <CustomerGlance companyId={companyId} contactId={contact?.id} orders={wooOrders} tags={contact?.tags}
        onOpenOrders={() => {
          setActivePanel('orders')
          // Phones show one pane at a time; tablets slide the panel in.
          const w = window.innerWidth
          if (w < 768) setMobilePane('contact')
          else if (w <= 1100) setTabletContact(true)
        }} />

      {/* AI detection banner */}
      {/* NOTE: the "AI saved: …" banner used to appear every time you
          opened a conversation, because detection re-runs on each select.
          It was pure noise. The sparkle beside each AI-filled contact
          field (with its "Auto added by Colvy AI" tooltip) already says
          the same thing, once, where it matters. */}

      {/* Page history banner — LIVE CHAT ONLY.
          "Currently on: <page>" claims the customer is browsing the site
          right now. That's only true for the on-site widget. For an SMS
          or email thread it's stale data from a previous web visit, and
          it misleads the agent into thinking someone is live on the page
          when they're actually texting. */}
      {selected.page_url && isWebChat && isOnPageNow && (
        <div style={{ background: '#f0f9ff', borderBottom: '1px solid #bae6fd', padding: '6px 16px', fontSize: 11, color: '#0369a1', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          <span>Currently on:</span>
          <a href={selected.page_url} target="_blank" rel="noopener" style={{ color: '#0369a1', fontWeight: 600, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selected.page_title || selected.page_url}
          </a>
          {selected.page_history?.length > 1 && <span style={{ color: '#64748b' }}>({selected.page_history.length} pages visited)</span>}
        </div>
      )}

      {/* Message search bar — find-in-conversation with match counter,
          previous/next navigation (top-down) and a clear/close button. */}
      {showMsgSearch && (() => {
        const total = msgMatchIds.length
        const has = total > 0
        const cur = has ? Math.min(msgSearchIdx, total - 1) + 1 : 0
        const goNext = () => { if (total) setMsgSearchIdx(i => (Math.min(i, total - 1) + 1) % total) }
        const goPrev = () => { if (total) setMsgSearchIdx(i => (Math.min(i, total - 1) - 1 + total) % total) }
        const close = () => { setShowMsgSearch(false); setMsgSearch(''); setMsgSearchIdx(0) }
        const navBtn: React.CSSProperties = { width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: '#fff', cursor: has ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', color: has ? 'var(--slate)' : '#cbd5e1', flexShrink: 0 }
        return (
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--canvas)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <style>{`.cmsg-active-hit{border-radius:12px;box-shadow:0 0 0 2px color-mix(in srgb, var(--coral) 55%, transparent);background:color-mix(in srgb, var(--coral) 8%, transparent);scroll-margin:16px;}`}</style>
          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input autoFocus value={msgSearch} onChange={e => setMsgSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? goPrev() : goNext() } else if (e.key === 'Escape') { e.preventDefault(); close() } }}
              placeholder="Search in this conversation…"
              style={{ width: '100%', padding: '8px 64px 8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            {msgSearch && (
              <span style={{ position: 'absolute', right: 10, fontSize: 11, fontWeight: 600, color: has ? 'var(--slate)' : '#ef4444', whiteSpace: 'nowrap' }}>
                {has ? `${cur} / ${total}` : 'No matches'}
              </span>
            )}
          </div>
          <button type="button" onClick={goPrev} disabled={!has} title="Previous match (Shift+Enter)" style={navBtn}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
          </button>
          <button type="button" onClick={goNext} disabled={!has} title="Next match (Enter)" style={navBtn}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
          <button type="button" onClick={close} title="Close search (Esc)" style={{ ...navBtn, cursor: 'pointer', color: 'var(--slate)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        )
      })()}
    </>
  )
}
