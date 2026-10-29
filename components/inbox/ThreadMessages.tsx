'use client'

// The messages of the open conversation.
// Moved out of app/admin/inbox/page.tsx unchanged. Its names come from the
// inbox controller through useInbox().

import DraftTasks from '@/components/DraftTasks'
import { draftsCollapsed } from '@/lib/task-dedupe'
import { threadHeaderLine } from '@/lib/thread-header'
import LiveCallBanner from '@/components/LiveCallBanner'
import { ProtectionBanner, ProtectionCard } from '@/components/inbox/ProtectionCard'
import CallCard from '@/components/CallCard'
import { roleFromName } from '@/components/agents/useAgentTeam'
import AgentFace from '@/components/agents/AgentFace'
import { WhyLink } from '@/components/WhyAgent'
import AiCallNote from '@/components/AiCallNote'
import { isWaitlistNote } from '@/lib/waitlist-ai'
import { WaitlistNoteLine } from '@/components/AiAddedBadge'
import { posSaleInfo } from '@/lib/prexty-pos'
import PrextyMark from '@/components/PrextyMark'
import EmailMessage from '@/components/EmailMessage'
import { VoiceTag } from '@/components/VoiceTag'
import { MediaItem } from '@/components/MediaGallery'
import StoryReplyPreview from '@/components/StoryReplyPreview'
import { sizedImageFallback, sizedImageUrl, toPublicUrl } from '@/lib/storage-url'
import VoicePlayer from '@/components/VoicePlayer'
import LinkCards, { LastOpen } from '@/components/LinkCards'
import { mightNeedTranslation } from '@/lib/call-languages'
import { STATUS_LABEL as WA_STATUS_LABEL } from '@/lib/whatsapp-core'
import AiLiveReply from '@/components/AiLiveReply'
import AgentSuggestion from '@/components/AgentSuggestion'
import { AiSparkIcon, Icon, LifecycleIcon, ReviewCard, dayLabel, fmtReceipt, fmtTime, initialsOf, isEmailWithoutChannel, mergeEvents, receiptChannel, timeAgo, tsOf, videoPoster } from '@/components/inbox/inbox-shared'
import { THREAD_MESSAGES_CSS } from '@/components/inbox/inbox-css'
import { useInbox } from '@/components/inbox/InboxContext'

export default function ThreadMessages() {
  const {
    EMOJIS, agentFaceOf, aiTodos, canSeeEmailWhy, chatDraftAnchor, companyId, companyInfo, contact,
    contactReviews, convCalls, events, galleryMessages, generateInvoice, isMobile,
    lastThreadScrollTop, latestChat, loadConversationExtras, loadOlderMessages, loadingOlder,
    loadingOlderRef, mComposerOpen, markNotSpam, messages, messagesEndRef, messagesScrollRef,
    msgSearch, myName, onAiTasksCreated, openChatMedia, openEmailMedia, openForward, outlets,
    protectionBusy, quickMrBusy, reactToMessage, renderTextWithLinks, renderWithMentions,
    requestMediaQuick, revealedMsgs, searchTerm, selected, sendOrderPaymentRequest,
    setChatDraftsClosed, setGalleryIndex, setMComposerOpen, setReply, setReplyTo, setRevealedMsgs,
    setShowReactPicker, setStoryView, showMsgSearch, showOriginalMsgs, showReactPicker, showToast,
    tasks, teamMembers, textareaRef, threadIndex, threadWin, threadWinRef, toggleBlockContact,
    toggleMsgOriginal, translateMsg, translatingMsgs, updateOrderStatus, user, visibleReadBy,
    wooOrders,
  } = useInbox()
  return (
    <>
      {/* Messages */}
      <div ref={messagesScrollRef} className="inbox-messages"
        onScroll={e => {
          // Scrolling UP near the top of a windowed thread pulls the
          // previous page in (the viewport stays anchored). Downward
          // scrolls — including the open's own scroll-to-bottom — never do.
          const el = e.currentTarget
          const prevTop = lastThreadScrollTop.current
          lastThreadScrollTop.current = el.scrollTop
          if (el.scrollTop < prevTop && el.scrollTop < 400 && threadWinRef.current.since && !loadingOlderRef.current) loadOlderMessages()
        }}
        style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14, scrollBehavior: 'auto' }}>
        {/* AI-detected action items → draft tasks. Sits inline at the top of
            the thread and scrolls with the conversation (not sticky/floating),
            so it never covers the newest messages. Mirrored in Timeline. */}
        {aiTodos.length > 0 && !tasks.some((tk: any) => {
          // Server-backed suppression: once these action items have been
          // turned into tasks (or the panel was created/dismissed before),
          // don't nag again — on any device, not just this browser.
          if (tk.source === 'ai_summary' || tk.source === 'call_summary') return true
          const tx = String(tk.text || tk.title || '').trim().toLowerCase()
          if (!tx) return false
          return aiTodos.some((td: any) => { const s = String(td.text || '').trim().toLowerCase(); return !!s && (tx === s || tx.includes(s) || s.includes(tx)) })
        }) && (
          <div style={{ maxWidth: 560, width: '100%', margin: '0 auto 4px', alignSelf: 'center', background: '#faf5ff', border: '1px solid #ede9fe', borderRadius: 14, padding: '4px 14px 14px' }}>
            <DraftTasks
              todos={aiTodos.map((t: any) => t.text).filter(Boolean)}
              source="ai_summary" storageKey={`colvy-conv-tasks-${selected.id}`}
              conversationId={selected.id} companyId={companyId || undefined}
              teamMembers={teamMembers} outlets={outlets}
              defaultLocationId={(selected as any)?.assigned_location_id || (selected as any)?.location_id || null}
              actor={{ id: user?.id, name: myName }}
              onCreated={() => { if (selected) loadConversationExtras(selected.id) }}
              onClosedChange={setChatDraftsClosed}
              contactName={contact?.name || null}
              collapsible={chatDraftAnchor != null && draftsCollapsed(chatDraftAnchor, latestChat)}
              bare
            />
          </div>
        )}
        {(() => {
          // In-conversation search no longer FILTERS the thread down to
          // matches — that hid the surrounding conversation and had no way
          // back to the top. We keep the whole thread and instead highlight
          // matches in place, scrolling the active one into view (see the
          // find bar's next/previous nav).
          const list = messages
          // Lookup from a message's attachment to its gallery index (all
          // images/videos in the thread, memoised in threadIndex).
          const { mediaIndexOf } = threadIndex
          // Only the newest page of a long history is loaded: keep events,
          // calls and engagement older than it out until that page is (they
          // would otherwise pile up above the first loaded message).
          const windowStart = threadWin.convId === selected.id && threadWin.since ? tsOf(threadWin.since) : 0
          const inWindow = (x: any) => !windowStart || tsOf(x.created_at) >= windowStart
          let lastDay = ''
          const enquiryName = contact?.name || contact?.email || contact?.phone || 'a customer'
          const SRC: Record<string, string> = {
            sms: 'SMS Enquiry', email: 'Email Enquiry', instagram: 'Instagram Enquiry',
            facebook: 'Messenger Enquiry', messenger: 'Messenger Enquiry',
            whatsapp: 'WhatsApp Enquiry', phone: 'Phone Call',
            colvy: 'message in the Colvy app',
          }
          const subj = (selected.subject || '').toLowerCase()
          // Order threads carry the customer's NAME as the subject once a
          // contact is known, so a subject-only check misses them and they
          // fell through to "Live Chat Enquiry". Detect the order by its
          // order_status too — these came from the store, not the widget.
          const enquiryKind = subj.startsWith('abandoned cart') ? 'Abandoned Cart'
            : (subj.startsWith('order #') || (selected as any).order_status) ? 'Order Placed'
            : (SRC[(selected.channel || '').toLowerCase()] || 'Live Chat Enquiry')

          // The "New … Enquiry" line marks the START of the conversation,
          // so while older history is still unloaded the top of the thread
          // offers it instead (it also loads on scrolling up).
          const header = windowStart ? (
            <div key="enquiry-header" style={{ textAlign: 'center', margin: '4px 0 6px' }}>
              <button type="button" onClick={() => loadOlderMessages()} disabled={loadingOlder}
                style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', background: '#eef0f2', padding: '3px 12px', borderRadius: 20, border: 'none', cursor: loadingOlder ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                {loadingOlder ? 'Loading earlier messages…' : 'Load earlier messages'}
              </button>
            </div>
          ) : (
            <div key="enquiry-header" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 14px' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate)', textAlign: 'center', minWidth: 0, overflowWrap: 'anywhere' }}>
                {threadHeaderLine(enquiryKind, list, enquiryName)}
              </span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
          )

          // Calls that already have a timeline message (server-posted or
          // browser-posted card) — don't double-render those from convCalls.
          const { linkedCallIds } = threadIndex
          // Which calls belong in the thread. Connected calls (duration
          // alone is unreliable — Telnyx inbound can finalise at 0s — so a
          // recording, a summary or a completed/answered status also count),
          // plus voicemails and missed calls. Only in-progress/ringing
          // attempts and dial-pad calls (no conversation) stay out.
          const extraCalls = convCalls
            .filter((c: any) => {
              if (linkedCallIds.has(c.id)) return false
              if (!inWindow(c)) return false
              const st = String(c.status || '')
              const connected = (c.duration_seconds || 0) > 0 || c.recording_url || c.ai_summary || ['completed', 'answered'].includes(st)
              const voicemail = c.is_voicemail || st.startsWith('voicemail')
              const missed = ['missed', 'no-answer', 'no_answer', 'failed', 'busy', 'canceled', 'cancelled'].includes(st)
              return connected || voicemail || missed
            })
            .map((c: any) => ({ __call: true, ...c }))

          const liveBanner = <LiveCallBanner key="live-call-banner" conversationId={selected.id} accent={companyInfo?.accent_color || 'var(--coral)'} />
          // A flagged customer message nobody has decided on yet (conversation protection).
          const undecided = (list as any[]).filter((m: any) => m.sender_type === 'visitor' && m.metadata?.protection?.verdict && m.metadata.protection.verdict !== 'clean' && !m.metadata.protection.cleared)
          const protectionBanner = (undecided.length > 0 || (contact as any)?.is_blocked) ? (
            <ProtectionBanner key="protection-banner" verdict={(contact as any)?.is_blocked ? 'blocked' : undecided[undecided.length - 1].metadata.protection.verdict}
              busy={protectionBusy} blocked={!!(contact as any)?.is_blocked} onNotSpam={markNotSpam} onBlock={contact?.id ? toggleBlockContact : undefined} />
          ) : null
          // Synthetic thread events for this customer's off-inbox engagement
          // (Google reviews + FB/IG comments), sorted in among the messages
          // by their own timestamp so the thread shows the whole relationship.
          const engagementEvents = [
            ...contactReviews.reviews.map((r: any) => ({ id: `rev-${r.id}`, event_type: 'google_review', created_at: r.createdAt || new Date().toISOString(), __engRating: r.rating, __engComment: r.comment, __engReviewId: r.id })),
            ...contactReviews.socialComments.map((c: any) => ({ id: `cmt-${c.id}`, event_type: 'social_comment', created_at: c.commentedAt || new Date().toISOString(), __engPlatform: c.platform, __engComment: c.message, __engCommentId: c.id })),
          ]
          const threadEvents = windowStart ? [...events, ...engagementEvents].filter(inWindow) : [...events, ...engagementEvents]
          return [header, liveBanner, protectionBanner, ...mergeEvents(list, threadEvents, extraCalls).map((item: any) => {
          if (item.__call) {
            const thisDay = dayLabel(item.created_at)
            const showDivider = thisDay && thisDay !== lastDay
            if (thisDay) lastDay = thisDay
            return (
              <div key={`call-${item.id}`}>
                {showDivider ? (
                  <div style={{ textAlign: 'center', margin: '10px 0 4px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', background: '#eef0f2', padding: '3px 12px', borderRadius: 20 }}>{thisDay}</span>
                  </div>
                ) : null}
                <CallCard callId={item.id} meta={{ direction: item.direction, duration_seconds: item.duration_seconds, agent_name: item.agent_name }} timestamp={item.created_at} collapseDrafts={draftsCollapsed(item.created_at, latestChat)} contactName={contact?.name || null} highlight={(showMsgSearch && msgSearch.trim()) ? msgSearch : searchTerm} accent={companyInfo?.accent_color || 'var(--coral)'} actor={{ id: user?.id, name: myName }} teamMembers={teamMembers} outlets={outlets} defaultLocationId={(selected as any)?.assigned_location_id || (selected as any)?.location_id || null} onTasksCreated={onAiTasksCreated} />
              </div>
            )
          }
          if (item.__event) {
            const ev = item
            // This customer left a Google review — a slim, centered pill
            // that opens the review inside Colvy.
            if (ev.event_type === 'google_review') {
              const stars = Math.max(0, Math.min(5, ev.__engRating || 0))
              return (
                <div key={`ev-${ev.id}`} style={{ textAlign: 'center', padding: '4px 0' }}>
                  <a href={`/admin/reviews?review=${encodeURIComponent(ev.__engReviewId)}`}
                    title={ev.__engComment ? `“${ev.__engComment}” — view review` : 'View review'}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', background: '#fff7e6', color: '#b7791f', border: '1px solid #f2d693', padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, maxWidth: 460 }}>
                    <img src="https://www.google.com/favicon.ico" alt="" style={{ width: 13, height: 13 }} />
                    Wrote a Google review
                    <span style={{ color: '#f5b301', letterSpacing: 0.5 }}>{'★'.repeat(stars)}</span>
                    {ev.created_at && <span style={{ color: '#c8b578', fontWeight: 500 }}>· {fmtTime(ev.created_at)}</span>}
                  </a>
                </div>
              )
            }
            // This customer commented on a post/ad — a slim, centered pill
            // that opens the comment in the Social Engagement manager.
            if (ev.event_type === 'social_comment') {
              const ig = ev.__engPlatform === 'instagram'
              return (
                <div key={`ev-${ev.id}`} style={{ textAlign: 'center', padding: '4px 0' }}>
                  <a href={`/admin/social?comment=${encodeURIComponent(ev.__engCommentId)}`}
                    title={ev.__engComment ? `“${ev.__engComment}” — view comment` : 'View comment'}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', background: ig ? '#fdeef6' : '#eef2ff', color: ig ? '#c13584' : '#1d4ed8', border: `1px solid ${ig ? '#f6c6e0' : '#c7d2fe'}`, padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, maxWidth: 460 }}>
                    💬 Commented on {ig ? 'Instagram' : 'Facebook'}
                    {ev.created_at && <span style={{ opacity: 0.7, fontWeight: 500 }}>· {fmtTime(ev.created_at)}</span>}
                  </a>
                </div>
              )
            }
            // A task finished on the Tasks page announces itself here as a
            // green completion pill (and shows in the Timeline tab too).
            if (ev.event_type === 'task_completed') {
              return (
                <div key={`ev-${ev.id}`} style={{ textAlign: 'center', padding: '4px 0' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#dcfce7', color: '#15803d', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, maxWidth: 420 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12" /></svg>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.detail || 'Task completed'}</span>
                    {ev.created_at && <span style={{ color: '#4d9e6a', fontWeight: 500 }}> · {fmtTime(ev.created_at)}</span>}
                  </span>
                </div>
              )
            }
            // Colvy AI action — a sparkle divider, tinted, attributed to
            // Colvy AI (e.g. "Address and delivery updated by Colvy AI").
            if (ev.event_type === 'ai_update' || ev.actor_name === 'Colvy AI') {
              return (
                <div key={`ev-${ev.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
                  <div style={{ flex: 1, height: 1, background: 'color-mix(in srgb, var(--coral, #ff7a6b) 22%, transparent)' }} />
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: ev.metadata?.agent_run_id ? agentFaceOf(roleFromName(ev.actor_name)).color : 'var(--coral, #ff7a6b)', whiteSpace: 'nowrap', maxWidth: 460, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {ev.metadata?.agent_run_id
                      ? <AgentFace face={agentFaceOf(roleFromName(ev.actor_name))} size={18} />
                      : <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}><path d="M12 2l1.6 4.6L18 8l-4.4 1.4L12 14l-1.6-4.6L6 8l4.4-1.4L12 2zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14zM5 15l.7 1.8L7.5 17l-1.8.7L5 19.5l-.7-1.8L2.5 17l1.8-.7L5 15z"/></svg>}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.detail || 'Updated by Colvy AI'}</span>
                    <span style={{ opacity: 0.75, fontWeight: 500 }}>· {ev.metadata?.agent_run_id ? (ev.actor_name || 'Support Agent').replace(/^Colvy /, '') : 'Colvy AI'}</span>
                    {ev.created_at && <span style={{ opacity: 0.55, fontWeight: 500 }}> · {fmtTime(ev.created_at)}</span>}
                  </span>
                  {ev.metadata?.agent_run_id && <WhyLink companyId={companyId} runId={ev.metadata.agent_run_id} style={{ fontSize: 11.5, flexShrink: 0 }} />}
                  <div style={{ flex: 1, height: 1, background: 'color-mix(in srgb, var(--coral, #ff7a6b) 22%, transparent)' }} />
                </div>
              )
            }
            // Inline timeline event: "Conversation assigned to X",
            // "Now chatting through SMS", "Enquiry moved to …"
            const isPageView = ev.event_type === 'page_view'
            return (
              <div key={`ev-${ev.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
                <div style={{ flex: 1, height: 1, background: '#eceef0' }} />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: isPageView ? '#0284c7' : '#9ca3af', whiteSpace: 'nowrap', maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {isPageView ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  )}
                  {ev.detail || ev.event_type}
                  {ev.created_at && (
                    <span style={{ color: '#c2c6cb', fontWeight: 500 }}> · {fmtTime(ev.created_at)}</span>
                  )}
                </span>
                <div style={{ flex: 1, height: 1, background: '#eceef0' }} />
              </div>
            )
          }
          const msg = item
          const thisDay = dayLabel(msg.created_at)
          const showDivider = thisDay && thisDay !== lastDay
          if (thisDay) lastDay = thisDay
          const isAgent = msg.sender_type === 'agent'
          const isSystem = msg.sender_type === 'system'
          const isInternal = !!(msg as any).is_internal
          const dateDivider = showDivider ? (
            <div key={`div-${msg.id}`} style={{ textAlign: 'center', margin: '10px 0 4px' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', background: '#eef0f2', padding: '3px 12px', borderRadius: 20 }}>{thisDay}</span>
            </div>
          ) : null
          // Internal staff-only note — sits inline in the timeline so the
          // team reads it in sequence, but is visually unmistakable (amber
          // card with a left accent, a lock, a "Team only" badge and the
          // author) so it's never confused with a customer message.
          // The AI phone agent's call: one compact card with the transcript
          // on demand, instead of a call card plus a long note.
          if (isInternal && (msg as any).metadata?.phone_agent) return (
            <div key={msg.id} id={`cmsg-${msg.id}`} data-cmsg="1">
              {dateDivider}
              <AiCallNote content={msg.content} metadata={(msg as any).metadata} createdAt={msg.created_at} highlight={(showMsgSearch && msgSearch.trim()) ? msgSearch : searchTerm} />
            </div>
          )
          // A waitlist note (a person's or an AI's add, old ones too): one quiet event line, not a note card.
          if (isWaitlistNote(msg)) return (
            <div key={msg.id} id={`cmsg-${msg.id}`} data-cmsg="1">
              {dateDivider}
              <WaitlistNoteLine msg={msg} companyId={companyId} fmtTime={fmtTime} />
            </div>
          )
          if (isInternal) {
            const noteAuthor = (msg as any).sender_name || 'Team'
            const noteInitials = noteAuthor.split(/\s+/).filter(Boolean).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || 'T'
            const noteRel = timeAgo(msg.created_at)
            return (
            <div key={msg.id} id={`cmsg-${msg.id}`} data-cmsg="1">
              {dateDivider}
              <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
                <div style={{ maxWidth: '86%', width: '100%', background: '#fffbeb', border: '1px solid #fde68a', borderLeft: '4px solid #f59e0b', borderRadius: 14, padding: '12px 14px', boxShadow: '0 1px 2px rgba(180,83,9,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, rowGap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ width: 26, height: 26, borderRadius: 8, background: '#fef3c7', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      </span>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: '#78350f' }}>Internal note</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: '#fff', border: '1px solid #fde68a', color: '#a16207', fontSize: 10.5, fontWeight: 700 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19M6.61 6.61A18.5 18.5 0 0 0 2 12s3 8 10 8a9.12 9.12 0 0 0 5.39-1.61"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        Team only
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                      <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#fde68a', color: '#92400e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 800, flexShrink: 0 }}>{noteInitials}</span>
                      <span style={{ fontSize: 11.5, color: '#a16207', whiteSpace: 'nowrap' }}>{noteAuthor} · {noteRel === 'now' ? 'just now' : `${noteRel} ago`}</span>
                    </div>
                  </div>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#422006', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {renderWithMentions(msg.content)}
                  </p>
                </div>
              </div>
            </div>
            )
          }
          // A connected call renders as a full Coax-style card — AI
          // summary, action items, recording player, transcript — not a
          // grey one-line pill.
          if (isSystem && (msg as any).metadata?.call_event && (msg as any).metadata?.call_id) return (
            <div key={msg.id} id={`cmsg-${msg.id}`} data-cmsg="1">
              {dateDivider}
              <CallCard callId={(msg as any).metadata.call_id} meta={(msg as any).metadata} timestamp={msg.created_at} collapseDrafts={draftsCollapsed(msg.created_at, latestChat)} contactName={contact?.name || null} highlight={(showMsgSearch && msgSearch.trim()) ? msgSearch : searchTerm} accent={companyInfo?.accent_color || 'var(--coral)'} actor={{ id: user?.id, name: myName }} teamMembers={teamMembers} outlets={outlets} defaultLocationId={(selected as any)?.assigned_location_id || (selected as any)?.location_id || null} onTasksCreated={onAiTasksCreated} />
            </div>
          )
          if (isSystem) {
            // A lifecycle marker (order placed/refunded, cart abandoned/
            // recovered) renders as a compact, modern card: a neutral chip
            // with a small tinted icon and a clean title/detail, plus any
            // link surfaced as a button instead of a raw URL. Everything
            // else keeps the tiny neutral pill (e.g. "started a chat").
            const sm: any = (msg as any).metadata || {}
            const orderStatus = String(sm.status || sm.order_automation || '').toLowerCase()
            let kind = '', accent = '', title = ''
            if (sm.sale_event) { kind = 'sale'; accent = '#16a34a'; title = 'Sale recorded' }
            else if (sm.abandoned_cart) { kind = 'cart'; accent = '#d97706'; title = 'Abandoned cart' }
            else if (sm.cart_recovered) { kind = 'recovered'; accent = '#16a34a'; title = 'Cart recovered' }
            else if (sm.order_event || sm.order_id || sm.order_automation) {
              if (orderStatus === 'refunded') { kind = 'refunded'; accent = '#d97706'; title = 'Order refunded' }
              else if (orderStatus === 'failed') { kind = 'failed'; accent = '#dc2626'; title = 'Payment failed' }
              else if (orderStatus === 'cancelled') { kind = 'failed'; accent = '#dc2626'; title = 'Order cancelled' }
              else if (orderStatus === 'completed') { kind = 'placed'; accent = '#16a34a'; title = 'Order completed' }
              else { kind = 'placed'; accent = '#16a34a'; title = 'Order placed' }
            }
            // A Prexty in-store sale reads as one, naming the receipt and the
            // shop: "In-store sale · Receipt R49971 · Roxy Aquarium Somerton ·
            // Order #125043 · $31.84". Newer lines carry it in metadata;
            // older ones are matched to the order in the panel.
            let posLine: string | null = null
            if (kind || sm.prexty_order) {
              const wo: any = sm.order_id != null ? wooOrders.find((o: any) => String(o.order_id || o.woo_order_id || o.id) === String(sm.order_id)) : null
              const wpos = wo ? (wo.pos_source === 'prexty' ? { isPos: true, saleId: wo.pos_sale_id || '', outlet: wo.pos_outlet || '' } : posSaleInfo(wo)) : null
              const isPos = sm.pos === 'prexty' || !!sm.prexty_order || !!wpos?.isPos
              if (isPos) {
                const locId = sm.location_id || wo?.pos_location_id || null
                const loc = locId ? outlets.find((x: any) => x.id === locId) : null
                const shop = (loc ? (loc.label || loc.suburb) : null) || sm.shop || sm.outlet || sm.pos_outlet || wpos?.outlet || ''
                const saleId = sm.pos_sale_id || wpos?.saleId || ''
                const raw0 = String(msg.content || '')
                const num = sm.order_number || wo?.order_number || (raw0.match(/#\s*([\w-]+)/) || [])[1] || ''
                const amt = (raw0.match(/\$\s?[\d,]+(?:\.\d+)?/) || [])[0] || (wo ? `$${(parseFloat(wo.total) || 0).toFixed(2)}` : '')
                if (orderStatus === 'refunded') { kind = 'refunded'; accent = '#d97706'; title = 'In-store sale refunded' }
                else if (orderStatus === 'cancelled' || orderStatus === 'failed') { kind = 'failed'; accent = '#dc2626'; title = 'In-store sale cancelled' }
                else { kind = 'placed'; accent = '#16a34a'; title = 'In-store sale' }
                posLine = [saleId ? `Receipt ${saleId}` : '', shop, num ? `Order #${num}` : '', amt].filter(Boolean).join(' · ')
                if (sm.prexty_order && Array.isArray(sm.items) && sm.items.length) posLine += ` · ${sm.items.map((i: any) => `${i.qty}× ${i.name}`).join(', ')}`
              }
            }

            if (!kind) {
              // Plain system line — keep it light and unobtrusive.
              return (
                <div key={msg.id} id={`cmsg-${msg.id}`} data-cmsg="1">
                  {dateDivider}
                  <div style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', padding: '4px 0' }}>
                    <span style={{ background: '#f3f4f6', padding: '3px 10px', borderRadius: 20 }}>{msg.content}</span>
                  </div>
                </div>
              )
            }

            // Pull a link out of the body and strip the leading emoji /
            // redundant title so the card reads cleanly.
            const raw = String(msg.content || '')
            const urlMatch = raw.match(/https?:\/\/\S+/)
            const link = urlMatch ? urlMatch[0] : null
            let detail = posLine ?? raw
              .replace(link || '', '')
              .replace(/^[^\p{L}\p{N}#$]+/u, '')          // leading emoji / arrows
              .replace(new RegExp(`^\\s*${title}\\s*[—:\\-]*`, 'i'), '') // redundant title
              .replace(/[\s:•\-–—]+$/u, '')                // trailing separators
              .trim()

            return (
              <div key={msg.id} id={`cmsg-${msg.id}`} data-cmsg="1">
                {dateDivider}
                <div style={{ display: 'flex', justifyContent: 'center', padding: '5px 0' }}>
                  {/* Grows to the full stream width and wraps to more lines
                      rather than truncating, so the whole cart/order detail
                      is readable. Keeps the rounded-pill look on one line. */}
                  <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 8, maxWidth: '100%', background: `color-mix(in srgb, ${accent} 13%, transparent)`, color: accent, padding: '7px 15px', borderRadius: 16, lineHeight: 1.45 }}>
                    <span style={{ flexShrink: 0, display: 'inline-flex', marginTop: 2 }}>{posLine != null ? <PrextyMark size={14} /> : <LifecycleIcon kind={kind} />}</span>
                    <span style={{ minWidth: 0, fontSize: 12, overflowWrap: 'anywhere' }}>
                      <span style={{ fontWeight: 700 }}>{title}</span>
                      {detail && <span style={{ opacity: 0.8, fontWeight: 500 }}>{` · ${detail}`}</span>}
                      {link && (
                        <a href={link} target="_blank" rel="noreferrer" title={link}
                          style={{ color: accent, marginLeft: 6, display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M17 7H8M17 7v9"/></svg>
                        </a>
                      )}
                    </span>
                  </span>
                </div>
              </div>
            )
          }
          const reactions = Array.isArray((msg as any).reactions) ? (msg as any).reactions : []
          const readBy = visibleReadBy((msg as any).read_by, (msg as any).company_id)
          const atts = Array.isArray(msg.attachments) ? msg.attachments : []
          // Who sent it, for agent messages ("Support Agent · approved by Roxy
          // Aquarium · Why?"), and which teammates have read it. Shared by
          // chat bubbles and email cards so both say the same thing.
          const aiCredit = (msg as any).is_ai && (msg.metadata?.agent_run_id ? (
                // Sent by an agent (Agent Engine): who let it go out, and why.
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: agentFaceOf(roleFromName(msg.metadata.agent_name)).color, fontWeight: 700 }}>
                  <AgentFace face={agentFaceOf(roleFromName(msg.metadata.agent_name))} size={16} />
                  {msg.metadata.agent_name || 'Support Agent'} · {msg.metadata.approved_by ? `${msg.metadata.edited ? 'edited' : 'approved'} by ${msg.metadata.approved_by}` : 'sent on its own'}
                  <span aria-hidden="true">·</span>
                  <WhyLink companyId={companyId} runId={msg.metadata.agent_run_id} style={{ color: agentFaceOf(roleFromName(msg.metadata.agent_name)).color }} />
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#8b5cf6', fontWeight: 700 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.6 5.3L19 9l-5.4 1.7L12 16l-1.6-5.3L5 9l5.4-1.7z"/></svg>
                  AI reply · AI can make mistakes
                </span>
              ))
          const readByChip = readBy.length > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <span>Read by:</span>
                  <span style={{ display: 'inline-flex', gap: 2 }}>
                    {readBy.slice(0, 3).map((r: any, ri: number) => {
                      // Prefer a real profile photo: the reader stamps
                      // their own avatar; older entries fall back to the
                      // team-member list, then to the initial.
                      const rAvatar = r.avatar || teamMembers.find((t: any) => t.name === r.name)?.avatar
                      const tip = `Read by ${r.name}${r.at ? ` · ${new Date(r.at).toLocaleString('en-AU', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })}` : ''}`
                      return rAvatar ? (
                        <img key={ri} src={rAvatar} alt={r.name || ''} title={tip} loading="lazy" decoding="async"
                          style={{ width: 15, height: 15, borderRadius: '50%', objectFit: 'cover', display: 'inline-block' }} />
                      ) : (
                        <span key={ri} title={tip}
                          style={{ width: 16, height: 16, borderRadius: '50%', background: companyInfo?.accent_color || 'var(--coral)', color: '#fff', fontSize: 7.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          {r.name ? initialsOf(r.name) : (r.initial || '?')}
                        </span>
                      )
                    })}
                    {readBy.length > 3 && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af' }}>+{readBy.length - 3}</span>
                    )}
                  </span>
                </span>
              )

          // Held back as possible spam (conversation protection): hidden until
          // someone chooses to review it.
          const prot = !isAgent && (msg as any).metadata?.protection
          if (prot && prot.verdict && prot.verdict !== 'clean' && !prot.cleared && !revealedMsgs.has(msg.id)) {
            return (
              <div key={msg.id} id={`cmsg-${msg.id}`} data-cmsg="1">
                {dateDivider}
                <ProtectionCard name={contact?.name || msg.sender_name || 'Visitor'} verdict={prot.verdict} reasons={prot.reasons}
                  firstContact={(prot.reasons || []).includes('First message from an unknown sender')}
                  blocked={!!(contact as any)?.is_blocked} busy={protectionBusy}
                  onReview={() => setRevealedMsgs(prev => new Set(prev).add(msg.id))}
                  onNotSpam={markNotSpam} onBlock={contact?.id ? toggleBlockContact : undefined} />
              </div>
            )
          }

          // Email messages render as a full Coax-style card (From/To/Cc,
          // subject, formatted body, quoted history, attachments) rather
          // than a chat bubble of stripped text.
          if (String((msg as any).delivery_channel || '').toLowerCase() === 'email'
              && ((msg as any).email_html || (msg as any).email_from || (msg as any).email_subject)) {
            return (
              <div key={msg.id} id={`cmsg-${msg.id}`} data-cmsg="1">
                {dateDivider}
                {/* The card shows when it was received / sent itself. */}
                <EmailMessage msg={msg} agentColor={companyInfo?.accent_color} businessName={companyInfo?.name} onOpenMedia={t => 'url' in t ? openChatMedia(t.url) : openEmailMedia(msg.id, t.index)} showWhy={canSeeEmailWhy} />
                {/* The same credit line a text gets: which agent wrote it,
                    who approved or edited it, Why?, and who has read it. */}
                {(aiCredit || readByChip) && (
                  <p style={{ margin: '-2px 0 8px', fontSize: 10.5, color: '#8a8f98', display: 'flex', gap: 6, alignItems: 'center', justifyContent: isAgent ? 'flex-end' : 'flex-start', flexWrap: 'wrap' }}>
                    {aiCredit}
                    {readByChip}
                  </p>
                )}
              </div>
            )
          }

          const repliedMsg = (msg as any).reply_to ? (threadIndex.byId.get((msg as any).reply_to) || null) : null
          // Instagram theme: when enabled (Settings → Channels), agent
          // replies on an Instagram thread get the Instagram gradient +
          // rounder bubbles so the thread reads like the Instagram app.
          const igThemed = isAgent && selected?.channel === 'instagram' && !!(companyInfo as any)?.inbox_settings?.instagram_theme
          // Messenger equivalent: agent replies on a Facebook thread get the
          // Messenger blue + rounder bubbles when the theme is enabled.
          const msgrThemed = isAgent && (selected?.channel === 'facebook' || selected?.channel === 'messenger') && !!(companyInfo as any)?.inbox_settings?.messenger_theme
          // Automated (order automation, review reminders, etc.) — sent by
          // Colvy on the business's behalf, not by a team member.
          const isAutoMsg = isAgent && !!((msg as any).metadata?.auto)
          // Group reactions by emoji
          const reactionCounts: Record<string, number> = {}
          reactions.forEach((r: any) => { reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1 })
          return (
            <div key={msg.id} id={`cmsg-${msg.id}`} data-cmsg="1">
              {dateDivider}
              <div className={`chat-msg-row${Date.now() - Date.parse((msg as any).created_at || '') < 15000 ? (isAgent ? ' msg-in mine' : ' msg-in') : ''}`} style={{ display: 'flex', justifyContent: isAgent ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-end', position: 'relative' }}>
              {!isAgent && (
                <div className="chat-cust-av" style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--peach)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--coral)', flexShrink: 0 }}>
                  {(contact?.name || msg.sender_name || 'V')[0].toUpperCase()}
                </div>
              )}
              <div className="chat-msg-col" style={{ maxWidth: '70%', minWidth: 0, position: 'relative' }}
                onMouseEnter={() => setShowReactPicker(null)}>
                {!isAgent && <p style={{ margin: '0 0 3px 4px', fontSize: 10, color: '#9ca3af' }}>{contact?.name || msg.sender_name || 'Visitor'}</p>}
                {/* Outbound messages name the team member that sent them, so
                    an agent reply isn't mistaken for a customer message.
                    Automated messages (order automation, etc.) are sent by
                    Colvy on the business's behalf, so they're labelled
                    "Delivered by Colvy" with a spark badge rather than a
                    person's name. */}
                {isAgent && (isAutoMsg ? (
                  <p style={{ margin: '0 4px 3px 0', fontSize: 10, color: '#8b5cf6', fontWeight: 700, textAlign: 'right', display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
                    <AiSparkIcon size={10} /> Delivered by Colvy
                  </p>
                ) : (
                  <p style={{ margin: '0 4px 3px 0', fontSize: 10, color: '#9ca3af', textAlign: 'right' }}>{msg.sender_name || 'Team'}</p>
                ))}

                {/* Reply-to quote */}
                {repliedMsg && (
                  <div style={{ fontSize: 11, color: '#6b7280', borderLeft: '3px solid var(--coral)', padding: '2px 8px', marginBottom: 3, background: 'var(--canvas)', borderRadius: 4, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    ↩ {repliedMsg.sender_name}: {repliedMsg.content.slice(0, 50)}
                  </div>
                )}

                <div className="msg-bubble" style={{
                  padding: (() => {
                    const hasMedia = atts.some((a: any) => a.kind === 'image' || a.kind === 'video')
                    // A media-only message shows the collage flush to the
                    // bubble edge; with text it gets a small frame.
                    if (hasMedia && !msg.content) return 0
                    if (hasMedia) return 4
                    return isMobile ? '7px 11px' : '10px 14px'
                  })(),
                  borderRadius: (igThemed || msgrThemed) ? '18px 18px 5px 18px' : (isAgent ? '14px 14px 4px 14px' : '14px 14px 14px 4px'),
                  background: igThemed ? 'linear-gradient(135deg,#5B51D8 0%,#A033C4 55%,#E1306C 100%)' : msgrThemed ? 'linear-gradient(135deg,#00B2FF 0%,#006AFF 100%)' : (isAgent ? 'var(--coral)' : '#fff'),
                  color: isAgent ? '#fff' : 'var(--ink)',
                  fontSize: 13, lineHeight: 1.5,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  border: isAgent ? 'none' : '1px solid var(--border)',
                  position: 'relative',
                  // A message carrying media caps at a phone-like width so a
                  // short caption wraps UNDER the media instead of stretching
                  // the bubble wide and leaving empty bubble colour beside a
                  // portrait clip (which is how it read on desktop before).
                  // A story-reply bubble hugs its portrait preview (≈150px)
                  // instead of stretching wide with empty space beside it.
                  maxWidth: (msg as any).metadata?.story_reply ? 182 : (atts.some((a: any) => a.kind === 'image' || a.kind === 'video') ? 300 : undefined),
                  width: (msg as any).metadata?.story_reply ? 'fit-content' : undefined,
                }}>
                  {isAgent && (msg as any).metadata?.voice && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', margin: atts.length ? '4px 8px 2px' : '0 0 2px' }}>
                      <VoiceTag kind={(msg as any).metadata.voice} onColour />
                    </div>
                  )}
                  {/* Instagram story reply — show the story they replied
                      to (thumbnail) above their message, like Coax. */}
                  {(msg as any).metadata?.story_reply && (() => {
                    const sr = (msg as any).metadata.story_reply
                    const url: string | null = sr.story_url || null
                    // Newer story replies carry story_type (rehosted at
                    // ingestion). Older ones stored the raw Instagram
                    // messaging-CDN URL with no extension — the preview
                    // tries an image, then a (hover-playable) video.
                    const knownVideo = sr.story_type === 'video' || (!!url && /\.(mp4|mov|webm)(\?|$)/i.test(url))
                    // Open the full gallery player: the story first, then the
                    // thread's other shared media as thumbnails.
                    const openStory = (kind: 'image' | 'video') => {
                      if (!url) return
                      const chatMedia: MediaItem[] = []
                      galleryMessages.forEach((mm: any) => (Array.isArray(mm.attachments) ? mm.attachments : []).forEach((a: any) => {
                        const isImg = a.kind === 'image' || String(a.type || '').startsWith('image')
                        const isVid = a.kind === 'video' || String(a.type || '').startsWith('video')
                        if ((isImg || isVid) && a.url && a.url !== url) chatMedia.push({ url: a.url, name: a.name, kind: isVid ? 'video' : 'image', poster: videoPoster(a) })
                      }))
                      setStoryView({ items: [{ url, kind, name: 'Story' }, ...chatMedia], index: 0 })
                    }
                    return (
                      <div style={{ marginBottom: 6 }}>
                        <span style={{ display: 'block', fontSize: 11, opacity: 0.85, fontStyle: 'italic', marginBottom: 4 }}>Replied to your story</span>
                        {url ? (
                          <StoryReplyPreview url={url} knownVideo={knownVideo} onOpen={openStory} />
                        ) : (
                          <span style={{ display: 'block', width: 120, aspectRatio: '9 / 16', borderRadius: 10, background: 'linear-gradient(135deg,#F47133,#BC3081)' }} />
                        )}
                      </div>
                    )
                  })()}

                  {/* Attachments.
                      Facebook-style mosaic: every tile is edge-to-edge
                      with hairline gutters, and the shape of the grid
                      changes with the count. Tiles are cropped to fill
                      (object-fit: cover) so there are no letterbox bars
                      or ragged edges — that mismatch was what made the
                      old layout look unfinished. */}
                  {(() => {
                    const media = atts.filter((a: any) => a.kind === 'image' || a.kind === 'video')
                    const files = atts.filter((a: any) => a.kind !== 'image' && a.kind !== 'video')
                    const n = media.length
                    const shown = n > 5 ? media.slice(0, 5) : media
                    const W = 268                     // collage width
                    const GAP = 2
                    // A lone video WITH a caption should fill the bubble width
                    // (a landscape tile) so it reads like the mobile app —
                    // rather than hugging a narrow portrait strip beside the
                    // text. A media-only lone video keeps its tight fit.
                    const loneVideoWithText = n === 1 && shown[0]?.kind === 'video' && !!msg.content

                    // Facebook picks a shape per count. Each entry gives
                    // the grid template and the row heights.
                    const layout = (() => {
                      switch (Math.min(n, 5)) {
                        case 1: return { cols: '1fr', rows: 'auto' }
                        case 2: return { cols: '1fr 1fr', rows: '180px' }
                        case 3: return { cols: '2fr 1fr', rows: '96px 96px' }
                        case 4: return { cols: '1fr 1fr', rows: '110px 110px' }
                        default: return { cols: '1fr 1fr 1fr', rows: '132px 88px' }
                      }
                    })()

                    // Which cells span more than one track.
                    const spanOf = (i: number): React.CSSProperties => {
                      if (n === 3 && i === 0) return { gridRow: 'span 2' }
                      if (n >= 5) {
                        if (i === 0) return { gridColumn: 'span 2' }
                        if (i === 1) return { gridColumn: 'span 1' }
                      }
                      return {}
                    }

                    return (
                      <>
                        {n > 0 && (
                          <div style={{
                            display: 'grid',
                            // A lone video: let the single column hug the clip
                            // ('auto'), not stretch to 1fr of the collage width —
                            // otherwise a portrait clip leaves the bubble colour
                            // (blue on outbound) showing beside it.
                            gridTemplateColumns: n === 1 && shown[0]?.kind === 'video' && !loneVideoWithText ? 'auto' : layout.cols,
                            gridAutoRows: layout.rows.split(' ')[0],
                            gridTemplateRows: layout.rows,
                            gap: GAP,
                            justifyContent: 'start',
                            // A lone video wraps tightly (fit-content) so a
                            // portrait clip isn't letterboxed into a tall
                            // grey box; a lone image still fills the width.
                            // With a caption it fills the bubble width instead.
                            width: loneVideoWithText ? '100%' : n === 1 ? (shown[0]?.kind === 'video' ? 'fit-content' : 'auto') : W,
                            maxWidth: W,
                            borderRadius: 14,
                            overflow: 'hidden',
                            marginBottom: (msg.content || files.length) ? 6 : 0,
                          }}>
                            {shown.map((a: any, ai: number) => {
                              const extra = n > 5 && ai === 4 ? n - 5 : 0
                              return (
                                <div key={ai} className="chat-att"
                                  onClick={() => setGalleryIndex(mediaIndexOf[a.url] ?? 0)}
                                  style={{
                                    ...spanOf(ai),
                                    position: 'relative', cursor: 'pointer',
                                    // Black (not grey) so a lone video that doesn't
                                    // perfectly fill reads as a clean video frame,
                                    // never a stray coloured bar.
                                    background: a.kind === 'video' ? '#000' : '#e5e7eb', overflow: 'hidden',
                                    // A lone video tile hugs the clip; a lone photo
                                    // keeps its shape; in a mosaic tiles fill cells.
                                    // With a caption the lone video fills a
                                    // landscape tile (like mobile) instead.
                                    ...(loneVideoWithText ? { width: '100%', aspectRatio: '4 / 3' } : n === 1 && a.kind === 'video' ? { width: 'fit-content', maxHeight: 320 } : n === 1 ? { maxHeight: 320 } : {}),
                                  }}>
                                  {a.kind === 'image' ? (
                                    <img
                                      /* The small preview made at upload time —
                                         a fraction of the bytes at this size.
                                         Falls back to the full image for older
                                         attachments that have no preview. */
                                      src={a.thumbUrl ? toPublicUrl(a.thumbUrl) : sizedImageUrl(a.url, 320)}
                                      onError={a.thumbUrl ? undefined : sizedImageFallback(a.url)}
                                      alt={a.name}
                                      loading="lazy"
                                      decoding="async"
                                      style={{ width: '100%', height: n === 1 ? 'auto' : '100%', maxHeight: n === 1 ? 320 : undefined, objectFit: n === 1 ? 'contain' : 'cover', display: 'block' }} />
                                  ) : (
                                    <>
                                      {/* No generated thumbnail? Seek a hair into the
                                         clip (#t=0.1) so the frame the browser paints
                                         isn't the usual black leader frame. Only set a
                                         poster when we actually have one — an empty
                                         poster forces that black first frame. */}
                                      <video
                                        src={a.thumbUrl ? toPublicUrl(a.url) : toPublicUrl(a.url) + '#t=0.1'}
                                        preload="metadata"
                                        muted
                                        playsInline
                                        {...(a.thumbUrl ? { poster: toPublicUrl(a.thumbUrl) } : {})}
                                        style={{ width: loneVideoWithText || n !== 1 ? '100%' : 'auto', height: loneVideoWithText || n !== 1 ? '100%' : 'auto', maxWidth: '100%', maxHeight: loneVideoWithText ? undefined : n === 1 ? 280 : undefined, objectFit: loneVideoWithText || n !== 1 ? 'cover' : 'contain', display: 'block', pointerEvents: 'none', background: '#111' }} />
                                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <div style={{ width: 38, height: 38, borderRadius: 19, background: 'rgba(0,0,0,0.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>▶</div>
                                      </div>
                                    </>
                                  )}

                                  {extra > 0 && (
                                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, fontWeight: 700 }}>
                                      +{extra}
                                    </div>
                                  )}

                                  <button type="button" className="chat-att-fwd"
                                    onClick={e => { e.stopPropagation(); openForward(media) }}
                                    title={n > 1 ? 'Forward these photos to another contact' : 'Forward to another contact'}
                                    style={{ position: 'absolute', top: 5, right: 5, width: 24, height: 24, borderRadius: 7, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, backdropFilter: 'blur(3px)', opacity: 0, transition: 'opacity 0.12s' }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {files.map((a: any, ai: number) => {
                          // A voice note / audio clip plays inline rather than
                          // linking out.
                          const isAudio = a.kind === 'audio' || /^audio\//.test(a.type || '') || /\.(webm|ogg|m4a|mp3|wav|aac)(\?|$)/i.test(a.url || '')
                          if (isAudio) {
                            return (
                              <div key={`f${ai}`} style={{ marginBottom: msg.content ? 6 : 0, width: 'min(300px, 62vw)', maxWidth: '100%' }}>
                                <VoicePlayer src={toPublicUrl(a.url)} name={a.name || 'Voice message'} style={{ background: '#fff' }} />
                              </div>
                            )
                          }
                          return (
                            <a key={`f${ai}`} href={a.url} target="_blank" rel="noopener"
                              style={{ display: 'flex', alignItems: 'center', gap: 8, color: isAgent ? '#fff' : 'var(--coral)', textDecoration: 'none', fontSize: 13, fontWeight: 600, marginBottom: msg.content ? 6 : 0 }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{Icon.attach(12)}{a.name}</span>
                            </a>
                          )
                        })}
                      </>
                    )
                  })()}
                  {/* Media-expiry badge — "Expires in 7 days" / "Expired". */}
                  {(() => {
                    const exp = atts.map((a: any) => a.expires_at).filter(Boolean).sort()[0]
                    if (!exp) return null
                    const ms = new Date(exp).getTime() - Date.now()
                    const del = atts.some((a: any) => a.expiry_mode === 'delete')
                    let label: string
                    if (ms <= 0) label = 'Expired'
                    else {
                      const days = Math.ceil(ms / 86400000)
                      const hrs = Math.ceil(ms / 3600000)
                      label = days >= 1 ? `Expires in ${days} day${days === 1 ? '' : 's'}` : `Expires in ${hrs} hour${hrs === 1 ? '' : 's'}`
                    }
                    return (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, margin: '2px 6px 4px', padding: '2px 8px', borderRadius: 20, fontSize: 10.5, fontWeight: 700, background: isAgent ? 'rgba(255,255,255,0.2)' : 'var(--canvas)', color: isAgent ? '#fff' : 'var(--slate)' }}
                        title={del ? 'Auto-deletes from Colvy at expiry' : 'Recipient access is revoked at expiry'}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
                        {label}{del ? ' · auto-delete' : ''}
                      </div>
                    )
                  })()}
                  {(msg as any).metadata?.review_request ? (
                    <div style={{ padding: '4px 2px 2px' }}>
                      {/* Review-request card, shown to the agent — mirrors
                          what the customer received. Updates to "completed"
                          once the customer leaves the review. */}
                      <ReviewCard msg={msg} companyId={companyId} render={(linkStats: any) => {
                        const completed = !!(msg as any).metadata?.review_completed
                        const rating = (msg as any).metadata?.review_rating || 0
                        const clicks = Math.max((msg as any).metadata?.review_clicks || 0, linkStats?.clicks || 0)
                        const title = completed ? 'Review Left' : ((msg as any).metadata?.review_title || 'Review Request Sent')
                        return (
                          // A neat, centered card (mirrors what the customer
                          // received) — white on the blue bubble, everything
                          // centered and even rather than left-hugging.
                          <div style={{ background: '#fff', borderRadius: 16, padding: '20px 16px 16px', width: 320, maxWidth: '100%', margin: '0 auto', boxSizing: 'border-box', position: 'relative', textAlign: 'center' }}>
                            {/* Google Business marker, top-left */}
                            <img src="https://www.google.com/favicon.ico" alt="Google" style={{ position: 'absolute', left: 13, top: 13, width: 16, height: 16 }} />
                            {/* Clicks / result badge, top-right */}
                            <span style={{ position: 'absolute', right: 12, top: 12, fontSize: 10.5, fontWeight: 700, background: completed ? '#fff4d6' : '#e7f6ec', color: completed ? '#a97a12' : '#137a3e', padding: '3px 9px', borderRadius: 20 }}>
                              {completed ? `★ ${rating}/5` : `${clicks} Click${clicks === 1 ? '' : 's'}`}
                            </span>
                            {/* Centered star avatar */}
                            <span style={{ width: 40, height: 40, borderRadius: 20, background: '#eef2ff', color: '#3b6ef5', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, marginBottom: 8 }}>★</span>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#5b6470', marginBottom: 10 }}>{title}</div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                              {[1, 2, 3, 4, 5].map(s => (
                                <span key={s} style={{ fontSize: 26, lineHeight: 1, color: completed && s <= rating ? '#f5b301' : '#dfe3e8' }}>★</span>
                              ))}
                            </div>
                            {completed && rating > 0 && (
                              <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#8a929c' }}>Customer left {rating} star{rating === 1 ? '' : 's'}</p>
                            )}
                            <LastOpen s={linkStats} />
                          </div>
                        )
                      }} />
                      {/* The message text (with the /m/ link) below the card —
                          capped to the card's width and centred so the whole
                          bubble reads as one balanced, even block. */}
                      <div style={{ marginTop: 10, maxWidth: 320, marginLeft: 'auto', marginRight: 'auto', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{renderTextWithLinks(msg.content)}</div>
                    </div>
                  ) : (
                    msg.content && (() => {
                      // Non-English inbound message → show the English
                      // translation by default, with a "View original" toggle.
                      const tLang = (msg as any).content_lang
                      const hasTr = !isAgent && !!(msg as any).translated_content && !!tLang && !/^en/i.test(String(tLang)) && tLang !== 'unknown'
                      const showOrig = showOriginalMsgs.has(msg.id)
                      const body = hasTr && !showOrig ? (msg as any).translated_content : msg.content
                      let langName = ''
                      if (hasTr) {
                        const c = String(tLang).toLowerCase()
                        try { const n = new Intl.DisplayNames(['en'], { type: 'language' }).of(c); langName = (n && n.toLowerCase() !== c) ? n : c.charAt(0).toUpperCase() + c.slice(1) } catch { langName = c }
                      }
                      return (
                        <div style={{ padding: atts.length && atts[0].kind !== 'file' ? '4px 10px 6px' : 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {/* Links Colvy sent the customer → a card with opens / device / city. */}
                          {isAgent && /https?:\/\//.test(body || '') && <div style={{ whiteSpace: 'normal', marginTop: 2 }}><LinkCards companyId={companyId} text={body} conversationId={selected?.id || null} at={(msg as any).created_at || null} /></div>}
                          {renderTextWithLinks(body)}
                          {!hasTr && !isAgent && !(msg as any).translated_content && !/^en/i.test(String(tLang || '')) && mightNeedTranslation(msg.content) && (
                            <div style={{ marginTop: 4, fontSize: 10.5 }}>
                              <button type="button" onClick={() => translateMsg(msg.id)} disabled={translatingMsgs.has(msg.id)}
                                style={{ background: 'none', border: 'none', padding: 0, cursor: translatingMsgs.has(msg.id) ? 'wait' : 'pointer', color: '#2563eb', fontSize: 10.5, fontWeight: 700, textDecoration: 'underline' }}>
                                {translatingMsgs.has(msg.id) ? 'Translating…' : 'Translate'}
                              </button>
                            </div>
                          )}
                          {hasTr && (
                            <div style={{ marginTop: 4, fontSize: 10.5, opacity: 0.8, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                              <span style={{ color: isAgent ? 'rgba(255,255,255,0.8)' : 'var(--slate)' }}>{showOrig ? `Original · ${langName}` : 'Translated · English'}</span>
                              <button type="button" onClick={() => toggleMsgOriginal(msg.id)}
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: isAgent ? '#fff' : '#2563eb', fontSize: 10.5, fontWeight: 700, textDecoration: 'underline' }}>
                                {showOrig ? 'View translation' : 'View original'}
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })()
                  )}

                  {/* Nothing to show (no text, no files) — say so instead of
                      drawing an empty bubble. Older customer emails that were
                      only a photo or video arrived like this. */}
                  {!isAgent && !String(msg.content || '').trim() && atts.length === 0 && (!msg.message_type || msg.message_type === 'text')
                    && !(msg as any).metadata?.story_reply && !(msg as any).metadata?.media_attempt && !(msg as any).metadata?.review_request && (
                    <span style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12.5, fontStyle: 'italic', color: 'var(--slate)', lineHeight: 1.45 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2, display: 'inline-block' }}><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      {isEmailWithoutChannel(msg)
                        ? 'This email came through with no text. If it had photos or a video, they weren\u2019t saved \u2014 open it in your mailbox to see them.'
                        : 'This message came through empty.'}
                    </span>
                  )}

                  {/* Customer tried to send media the carrier couldn't
                      deliver (MMS on an AU number). Surface it plainly with a
                      one-tap "Request media" → secure upload link. */}
                  {!isAgent && (msg as any).metadata?.media_attempt && (
                    <div style={{ marginTop: msg.content ? 6 : 0, padding: '11px 13px', borderRadius: 12, background: 'var(--peach)', border: '1px solid #ffd9d1' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--coral)' }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)' }}>Customer attempted to send media</span>
                      </div>
                      <p style={{ margin: '5px 0 9px', fontSize: 12, color: 'var(--slate)', lineHeight: 1.45 }}>
                        MMS media could not be received on this number. Send them a secure upload link to receive it.
                      </p>
                      <button type="button" onClick={requestMediaQuick} disabled={quickMrBusy}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 12.5, fontWeight: 700, cursor: quickMrBusy ? 'default' : 'pointer', opacity: quickMrBusy ? 0.6 : 1 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        {quickMrBusy ? 'Sending…' : 'Request media'}
                      </button>
                    </div>
                  )}
                  {msg.message_type === 'payment' && msg.message_payload && (() => {
                    // The payment's card: amount, what it's for, and whether it's
                    // been paid (checked with Stripe while pending, see above).
                    const pp = msg.message_payload
                    const paid = pp.status === 'paid', refunded = pp.status === 'refunded'
                    const tone = paid ? '#059669' : refunded ? '#64748b' : '#635BFF'
                    return (
                      <div style={{ marginTop: 6, padding: '10px 12px', borderRadius: 10, background: '#fff', border: `1px solid ${paid ? '#bbf7d0' : 'var(--border)'}`, color: 'var(--ink)', whiteSpace: 'normal' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={tone} strokeWidth="2" style={{ flexShrink: 0 }}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                          <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>${(pp.amount_cents / 100).toFixed(2)} {String(pp.currency || 'aud').toUpperCase()}</span>
                          <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 6, background: paid ? '#dcfce7' : refunded ? '#f1f5f9' : '#ede9fe', color: tone, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{paid ? '✓ Paid' : refunded ? 'Refunded' : 'Awaiting payment'}</span>
                        </div>
                        {pp.description && <p style={{ margin: 0, fontSize: 12, color: 'var(--slate)' }}>{pp.description}</p>}
                        {paid && (pp.paid_at || pp.card_last4 || pp.receipt_url) && (
                          <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#059669', display: 'flex', columnGap: 8, rowGap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span>{[
                              pp.paid_at ? `Paid ${new Date(pp.paid_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : 'Paid',
                              pp.card_last4 ? `${String(pp.card_brand || 'Card').replace(/^./, (c: string) => c.toUpperCase())} ····${pp.card_last4}` : '',
                            ].filter(Boolean).join(' · ')}</span>
                            {pp.receipt_url && <a href={pp.receipt_url} target="_blank" rel="noopener noreferrer" style={{ color: '#059669', fontWeight: 700 }}>Receipt</a>}
                          </p>
                        )}
                      </div>
                    )
                  })()}
                  {['poll', 'survey', 'form'].includes(msg.message_type) && (
                    <div style={{ marginTop: 6, padding: '8px 12px', borderRadius: 10, background: '#fff', border: '1px solid var(--border)', color: 'var(--slate)', fontSize: 12 }}>
                      Interactive {msg.message_type} sent — the customer can respond in the widget.
                    </div>
                  )}
                  {msg.message_type === 'coupon' && msg.message_payload && (
                    <div style={{ marginTop: 6, padding: '14px 16px', borderRadius: 12, background: 'linear-gradient(135deg, #fff4f1, #fff)', border: '1.5px dashed var(--coral)', color: 'var(--ink)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--coral)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 5 }}>{Icon.coupon(13)} Coupon sent</div>
                      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 1, margin: '4px 0' }}>{msg.message_payload.code}</div>
                      <div style={{ fontSize: 13, color: 'var(--slate)' }}>{msg.message_payload.display_amount}{msg.message_payload.expires ? ` · expires ${msg.message_payload.expires}` : ''}</div>
                    </div>
                  )}
                  {msg.message_type === 'media_request' && msg.message_payload && (
                    <div style={{ marginTop: 6, padding: '12px 14px', borderRadius: 12, background: '#fff', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, color: 'var(--coral)' }}>{Icon.media(15)}<span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Media requested</span></div>
                      <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--ink)' }}>{msg.message_payload.prompt}</p>
                      <button type="button" onClick={() => { navigator.clipboard?.writeText(msg.message_payload.link); showToast('Upload link copied') }}
                        style={{ fontSize: 12, fontWeight: 600, color: 'var(--coral)', background: 'var(--peach)', border: '1px solid var(--coral)', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>Copy upload link</button>
                    </div>
                  )}
                  {msg.message_type === 'order' && msg.message_payload && (
                    <div style={{ marginTop: 6, padding: '12px 14px', borderRadius: 10, background: '#fff', border: '1px solid var(--border)', color: 'var(--ink)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ color: "var(--coral)", display: "inline-flex" }}>{Icon.cart(15)}</span>
                        <span style={{ fontSize: 13.5, fontWeight: 700 }}>Order #{msg.message_payload.order_number}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#eef2ff', color: '#4f46e5', textTransform: 'uppercase' }}>{msg.message_payload.status}</span>
                      </div>
                      <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--slate)' }}>{msg.message_payload.currency || 'AUD'} ${msg.message_payload.total}</p>
                      {msg.message_payload.channel === 'shopify' ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {msg.message_payload.admin_url && <a href={msg.message_payload.admin_url} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 12, fontWeight: 600, color: '#008060', textDecoration: 'none', padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 7 }}>Open in Shopify</a>}
                        {msg.message_payload.pay_link && (
                          <button type="button" onClick={() => { navigator.clipboard?.writeText(msg.message_payload.pay_link); showToast('Payment link copied') }}
                            style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', background: '#fff', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>Copy payment link</button>
                        )}
                        {!msg.message_payload.draft && (
                          <button type="button" onClick={() => generateInvoice(msg.message_payload)}
                            style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', background: '#fff', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>Invoice PDF</button>
                        )}
                        <button type="button" onClick={() => updateOrderStatus(msg.message_payload, 'processing')}
                          style={{ fontSize: 12, fontWeight: 600, color: '#4f46e5', background: '#fff', border: '1px solid #c7d2fe', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>Mark paid (bank/other)</button>
                        <button type="button" onClick={() => updateOrderStatus(msg.message_payload, 'completed')}
                          style={{ fontSize: 12, fontWeight: 600, color: '#059669', background: '#fff', border: '1px solid #bbf7d0', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>Mark completed</button>
                        <button type="button" onClick={() => updateOrderStatus(msg.message_payload, 'cancelled')}
                          style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', background: '#fff', border: '1px solid #fecaca', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>{msg.message_payload.draft ? 'Delete draft' : 'Cancel'}</button>
                      </div>
                      ) : (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <a href={`${msg.message_payload.store_url}/wp-admin/post.php?post=${msg.message_payload.order_id}&action=edit`} target="_blank" rel="noopener"
                          style={{ fontSize: 12, fontWeight: 600, color: 'var(--coral)', textDecoration: 'none', padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 7 }}>View order</a>
                        <button type="button" onClick={() => sendOrderPaymentRequest(msg.message_payload)}
                          style={{ fontSize: 12, fontWeight: 600, color: '#635BFF', background: '#fff', border: '1px solid #c7d2fe', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>Send payment request</button>
                        <button type="button" onClick={() => generateInvoice(msg.message_payload)}
                          style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', background: '#fff', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>Invoice PDF</button>
                        {msg.message_payload.pay_link && (
                          <button type="button" onClick={() => { navigator.clipboard?.writeText(msg.message_payload.pay_link); showToast('Payment link copied') }}
                            style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', background: '#fff', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>Copy link</button>
                        )}
                        <button type="button" onClick={() => updateOrderStatus(msg.message_payload, 'processing')}
                          style={{ fontSize: 12, fontWeight: 600, color: '#4f46e5', background: '#fff', border: '1px solid #c7d2fe', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>Mark paid (bank/other)</button>
                        <button type="button" onClick={() => updateOrderStatus(msg.message_payload, 'completed')}
                          style={{ fontSize: 12, fontWeight: 600, color: '#059669', background: '#fff', border: '1px solid #bbf7d0', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>Mark completed</button>
                        <button type="button" onClick={() => updateOrderStatus(msg.message_payload, 'cancelled')}
                          style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', background: '#fff', border: '1px solid #fecaca', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>Cancel</button>
                      </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Reactions */}
                {Object.keys(reactionCounts).length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 3, justifyContent: isAgent ? 'flex-end' : 'flex-start' }}>
                    {Object.entries(reactionCounts).map(([emoji, count]) => (
                      <span key={emoji} onClick={() => reactToMessage(msg, emoji)}
                        style={{ fontSize: 12, background: '#fff', border: '1px solid var(--border)', borderRadius: 20, padding: '1px 7px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
                        {emoji} {count > 1 ? count : ''}
                      </span>
                    ))}
                  </div>
                )}

                {/* Timestamp + channel + read receipt — Coax style:
                    "Received 3:42 PM | 29 May | Facebook   Read by: SG" */}
                <p style={{ margin: '4px 0 0', fontSize: 10.5, color: '#8a8f98', textAlign: isAgent ? 'right' : 'left', display: 'flex', gap: 6, alignItems: 'center', justifyContent: isAgent ? 'flex-end' : 'flex-start', flexWrap: 'wrap' }}>
                  <span style={{ fontStyle: 'italic' }}>
                    {fmtReceipt(msg.created_at, isAgent, receiptChannel(msg, selected.channel)) || fmtTime(msg.created_at)}
                  </span>

                  {/* WhatsApp delivery: Sent / Delivered / Read, or why it wasn't delivered. */}
                  {isAgent && (msg as any).delivery_channel === 'whatsapp' && msg.metadata?.whatsapp?.status && (() => {
                    const w = msg.metadata.whatsapp
                    const bad = w.status === 'failed' || w.status === 'undelivered'
                    return (
                      <span title={bad ? (w.error || undefined) : undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: bad ? '#dc2626' : w.status === 'read' ? '#2563eb' : '#16a34a', fontWeight: 700 }}>
                        {WA_STATUS_LABEL[w.status] || w.status}{w.template?.name ? ' · template' : ''}{bad && w.error ? ` · ${w.error}` : ''}
                      </span>
                    )
                  })()}

                  {aiCredit}

                  {/* Who on the team has seen it. Shown on BOTH sides — on an
                      agent message it answers "did my colleague see this?",
                      which is the question people actually have. Automated
                      (Colvy-sent) messages keep this too — seeing which
                      teammate has read an automation is genuinely useful. */}
                  {readByChip}
                </p>

                {/* Hover actions: react + reply */}
                <div className={`chat-msg-actions${showReactPicker === msg.id ? ' pinned' : ''}`} style={{ position: 'absolute', top: -10, [isAgent ? 'left' : 'right']: -8, display: 'flex', gap: 2, background: '#fff', borderRadius: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.12)', padding: '2px 4px', opacity: 0, transition: 'opacity 0.12s', pointerEvents: 'none' } as any}>
                  <button type="button" onClick={() => setShowReactPicker(showReactPicker === msg.id ? null : msg.id)}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px 4px', color: 'var(--slate)', display: 'inline-flex' }} title="React">{Icon.smile(14)}</button>
                  <button type="button" onClick={() => { setReplyTo(msg); textareaRef.current?.focus(); if (!mComposerOpen) { setMComposerOpen(true); setTimeout(() => textareaRef.current?.focus(), 30) } }}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, padding: '2px 4px' }} title="Reply">↩</button>
                </div>

                {/* Reaction picker */}
                {showReactPicker === msg.id && (
                  <div data-react-picker className="chat-react-picker"
                    onMouseDown={e => e.stopPropagation()}
                    style={{ position: 'absolute', top: -40, [isAgent ? 'right' : 'left']: 0, display: 'flex', gap: 2, background: '#fff', borderRadius: 24, boxShadow: '0 4px 16px rgba(0,0,0,0.16)', padding: '5px 8px', zIndex: 20 } as any}>
                    {EMOJIS.slice(0, 8).map(e => (
                      <button key={e} type="button" onClick={() => reactToMessage(msg, e)}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 17, padding: 2, borderRadius: 6 }}
                        onMouseEnter={(ev: any) => ev.currentTarget.style.background = 'var(--canvas)'}
                        onMouseLeave={(ev: any) => ev.currentTarget.style.background = 'none'}>{e}</button>
                    ))}
                  </div>
                )}
              </div>
              {isAgent && (
                companyInfo?.logo_url ? (
                  <img className="chat-agent-av" src={companyInfo.logo_url} alt="" loading="lazy" decoding="async" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={(e: any) => { e.target.style.display = 'none' }} />
                ) : (
                  <div className="chat-agent-av" style={{ width: 28, height: 28, borderRadius: '50%', background: companyInfo?.accent_color || 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                    {(companyInfo?.name || msg.sender_name || 'A')[0].toUpperCase()}
                  </div>
                )
              )}
            </div>
            </div>
          )
        })]
        })()}
        {/* Colvy AI replying, live: writing… then a countdown with Send now / Edit / Cancel. */}
        <AiLiveReply
          conv={selected as any}
          onEdit={(text) => { setReply(text); setMComposerOpen(true); setTimeout(() => textareaRef.current?.focus(), 30) }}
          onChange={() => setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 60)}
        />
        {/* Support Agent (Agent Engine): a suggested reply waiting for the team. */}
        <AgentSuggestion
          companyId={companyId}
          conversationId={selected?.id || null}
          onChange={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })}
        />
        <div ref={messagesEndRef} />
      </div>

      <style>{THREAD_MESSAGES_CSS}</style>
    </>
  )
}
