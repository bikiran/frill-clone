'use client'

// The reply box: SMS / email / notes / tickets, attachments, scheduling and send.
// Moved out of app/admin/inbox/page.tsx unchanged. Its names come from the
// inbox controller through useInbox().

import AgentBar from '@/components/agents/AgentBar'
import { agentName } from '@/components/agents/useAgentTeam'
import TicketComposer, { type TicketPriority } from '@/components/inbox/TicketComposer'
import EmailComposer from '@/components/EmailComposer'
import { composerSubject } from '@/lib/email-subject'
import Popover from '@/components/composer/Popover'
import WhatsAppComposerBar from '@/components/inbox/WhatsAppComposerBar'
import { AiDraftButton, AiDraftInfo } from '@/components/AiDraft'
import { TranslateButton, TranslateStrip, customerLanguage } from '@/components/inbox/ReplyTranslate'
import VoiceDictationButton from '@/components/VoiceDictationButton'
import { Icon, sendChannelGlyph, toolBtn } from '@/components/inbox/inbox-shared'
import { useInbox } from '@/components/inbox/InboxContext'

export default function InboxComposer() {
  const {
    EMOJIS, agentFaceOf, agentTeam, agentTyping, aiDraft, answeringRole, anyExpiring,
    applyBulkExpiry, applyMention, applyQuickResponse, assignTo, broadcastAgentTyping,
    bulkCustomDate, bulkExpiryCode, bulkExpiryOpen, channelMenuRef, channelPick, channelResolving,
    companyId, companyInfo, composerDragging, composerH, contact, convHasSale, createTicket,
    customDateFor, deleteScheduled, dictatedRef, discardTicket, dismissSalePrompt, draft,
    emailDraftText, emailFromLabel, emailSignature, emojiBtnRef, expirable, expiryChip,
    expiryDeleteMode, expiryMenuFor, fileInputRef, fmtRec, handleFileUpload, internalMode, isMobile,
    lastInboundId, liveTyping, loadConversations, logAiUpdate, mComposerOpen, mentionIndex,
    mentionMatches, mentionQuery, messages, myName, openMediaPicker, openMobileComposer,
    openScheduleMsg, openTicket, outboundChannel, paymentSignal, quickIndex, quickMatches,
    quickMenuRef, recSeconds, recording, reloadThread, renderLinkTools, renderModeHead,
    renderSendMenu, reply, replyTo, replyTr, saleDismissed, scheduledBusy, scheduledList,
    scheduledWhen, scrollBottom, selected, sendAndClose, sendChannel, sendReply, sendScheduledNow,
    sending, setBulkCustomDate, setBulkExpiryOpen, setComposerH, setConvAi, setCustomDateFor,
    setEditingScheduled, setEmailDraftText, setExpiryDeleteMode, setExpiryMenuFor, setInternalMode,
    setMComposerOpen, setMentionIndex, setMentionQuery, setQuickIndex, setReply, setReplyTo,
    setSendChannel, setShowChannelMenu, setShowEmoji, setShowQuickMenu, setShowRecordSale,
    setSmsCreditError, setStagedExpiry, setStagedMedia, setStatus, setTicketDesc, setTicketPriority,
    setTicketSubject, showChannelMenu, showEmailComposer, showEmoji, showQuickMenu, showToast,
    smsCreditError, smsDestination, smsIncluded, smsOptOut, stagedExpiry, stagedMedia,
    startComposerResize, stopVoiceNote, takeControl, teamMembers, templateVars, textareaRef,
    themeGradient, themeSolid, ticketDesc, ticketMode, ticketPriority, ticketSaving, ticketSubject,
    toLocalInput, wooOrders,
  } = useInbox()
  return (
    <>
      {/* Reply box */}
      <div className={`inbox-composer ${mComposerOpen ? 'mcmp-open' : 'mcmp-collapsed'}`} style={{ padding: '10px 14px', background: '#fff', borderTop: '1px solid var(--border)', position: 'relative' }}>
        {(() => {
          const role = answeringRole(selected)
          if (!role || !selected) return null
          return (
            <AgentBar face={agentFaceOf(role)} name={agentName(role)} aiOff={(selected as any).ai_enabled === false}
              autoSend={!!agentTeam?.autoSend && role === 'support'}
              members={teamMembers.filter(m => m.name).map(m => ({ user_id: m.user_id, name: m.name }))} assignedTo={(selected as any).assigned_to}
              onTakeControl={takeControl} onHandBack={() => setConvAi(null)} onPause={() => setConvAi(false)}
              onAssign={m => assignTo(m ? (teamMembers.find(t => t.user_id === m.user_id) || null) : null)}
              onNote={() => { setInternalMode(true); setMComposerOpen(true); setTimeout(() => textareaRef.current?.focus(), 30) }}
              onTicket={openTicket} />
          )
        })()}
        {/* Phones: the composer starts as this one-line bar so the thread
            gets the screen. Tap it to write; the full composer (and any
            draft) is still mounted underneath, just hidden. */}
        {(() => {
          const ch = sendChannel !== 'auto' ? sendChannel : outboundChannel
          const chName = ({ sms: 'SMS', email: 'Email', chat: 'Live chat', instagram: 'Instagram', messenger: 'Messenger', whatsapp: 'WhatsApp', call: 'SMS', colvy: 'Colvy app' } as Record<string, string>)[ch] || 'Chat'
          const draftText = ((showEmailComposer && !internalMode) ? emailDraftText : reply).replace(/\s+/g, ' ').trim()
          const first = contact?.name ? contact.name.split(' ')[0] : 'customer'
          return (
            <div className="mcmp-bar">
              <button type="button" className={`mcmp-reply${internalMode ? ' note' : ''}`} onClick={() => openMobileComposer()}
                aria-label={internalMode ? 'Write an internal note' : `Reply by ${chName}`}>
                <span className="mcmp-ch" title={internalMode ? 'Internal note' : `Sending by ${chName}`}>
                  {internalMode
                    ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/></svg>
                    : sendChannelGlyph(ch, 15)}
                  <span className="mcmp-ch-name">{internalMode ? 'Note' : chName}</span>
                </span>
                <span className={`mcmp-text${draftText ? ' has-draft' : ''}`}>
                  {draftText ? <><b>Draft:</b> {draftText}</> : internalMode ? 'Write a note for your team…' : `Reply to ${first}…`}
                </span>
              </button>
              <button type="button" className={`mcmp-note${internalMode ? ' on' : ''}`} onClick={() => openMobileComposer(!internalMode)}
                aria-pressed={internalMode} title={internalMode ? 'Switch to a reply' : 'Write an internal note'}
                aria-label={internalMode ? 'Switch to a reply' : 'Write an internal note'}>
                {internalMode
                  ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
                  : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/></svg>}
                {internalMode ? 'Reply' : 'Note'}
              </button>
            </div>
          )
        })()}
        {/* Coax-style resize grip: drag the top border of the composer up
            or down to grow/shrink the reply box — the chat box and the
            email body share the same remembered height. */}
        <div
          onMouseDown={(e) => { e.preventDefault(); startComposerResize(e.clientY) }}
          onTouchStart={(e) => { if (e.touches[0]) startComposerResize(e.touches[0].clientY) }}
          onDoubleClick={() => { setComposerH(96); try { localStorage.setItem('colvy_composer_h', '96') } catch {} }}
          title="Drag up or down to resize"
          className="composer-grip"
          style={{
            position: 'absolute', top: -11, left: 0, right: 0, height: 22,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'ns-resize', zIndex: 30, touchAction: 'none',
          }}>
          <span className="composer-grip-pill" style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: composerDragging ? '5px 12px' : '3px 9px', borderRadius: 999,
            background: '#1f2430', color: '#fff', fontSize: 12, fontWeight: 600,
            boxShadow: '0 6px 18px rgba(0,0,0,0.22)', whiteSpace: 'nowrap',
            opacity: composerDragging ? 1 : 0, transform: composerDragging ? 'translateY(0)' : 'translateY(2px)',
            transition: 'opacity .12s ease, transform .12s ease, padding .12s ease', pointerEvents: 'none',
          }}>
            <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden><circle cx="2.5" cy="2.5" r="1.3"/><circle cx="7.5" cy="2.5" r="1.3"/><circle cx="2.5" cy="7" r="1.3"/><circle cx="7.5" cy="7" r="1.3"/><circle cx="2.5" cy="11.5" r="1.3"/><circle cx="7.5" cy="11.5" r="1.3"/></svg>
            {composerDragging ? `${composerH}px` : 'Drag up or down to resize'}
          </span>
        </div>
        {/* Email threads get a proper email composer (To/Cc/Subject +
            signature) instead of the plain chat box. */}
        {ticketMode ? (
          <TicketComposer head={renderModeHead()} customer={contact?.name || (selected as any)?.contacts?.name || contact?.email || (selected as any)?.sms_number || ''}
            subject={ticketSubject} onSubject={setTicketSubject} description={ticketDesc} onDescription={setTicketDesc}
            priority={ticketPriority} onPriority={(p: TicketPriority) => setTicketPriority(p)}
            saving={ticketSaving} onCreate={createTicket} onDiscard={discardTicket} bodyHeight={isMobile ? undefined : composerH} />
        ) : channelResolving && !internalMode ? (
          <div className="cmp-card" aria-busy="true" style={{ overflow: 'hidden' }}>
            {renderModeHead()}
            <div style={{ height: isMobile ? 64 : composerH, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--slate)', fontSize: 12.5 }}>Choosing how to reach this customer…</div>
          </div>
        ) : showEmailComposer && !internalMode ? (
          <EmailComposer
            header={renderModeHead()}
            bodyHeight={isMobile ? undefined : composerH}
            compact={isMobile}
            onBodyText={setEmailDraftText}
            conversationId={selected.id}
            companyId={companyId}
            toEmail={contact?.email || ''}
            defaultSubject={composerSubject(messages, selected as any, { businessName: companyInfo?.name, contactName: contact?.name, contactPhone: contact?.phone, contactEmail: contact?.email, contactSource: contact?.source, contactTags: contact?.tags })}
            fromLabel={emailFromLabel}
            replyTo={channelPick?.convId === selected.id ? channelPick.replyTo || null : null}
            signature={emailSignature}
            agentName={myName}
            keyterms={[contact?.name, (contact as any)?.company_name].filter(Boolean) as string[]}
            templateVars={templateVars}
            extraTools={(insert) => <>{renderSendMenu(true, insert)}{renderLinkTools(true, insert)}</>}
            onAiAssist={() => logAiUpdate('Reply drafted with Colvy AI')}
            onSent={async () => {
              await reloadThread(selected.id)
              scrollBottom()
              loadConversations()
            }}
          />
        ) : (
        <>
        {/* Reply-to preview */}
        {replyTo && (() => {
          // A photo message has no text content, so the preview used to be
          // blank — you couldn't tell what you were replying to. Show the
          // thumbnail instead.
          const rAtts = Array.isArray((replyTo as any).attachments) ? (replyTo as any).attachments : []
          const rMedia = rAtts.find((a: any) => a.kind === 'image' || a.kind === 'video')
          const label = (replyTo.content || '').trim()
            || (rMedia ? (rMedia.kind === 'video' ? 'Video' : 'Photo') : '')
            || (rAtts.length ? rAtts[0].name || 'Attachment' : 'Message')
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--canvas)', borderRadius: 8, marginBottom: 8, borderLeft: '3px solid var(--coral)' }}>
              {rMedia && (
                rMedia.kind === 'video' ? (
                  <video src={rMedia.url} style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <img src={rMedia.url} alt="" style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                )
              )}
              <span style={{ fontSize: 12, color: '#6b7280', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                ↩ Replying to {replyTo.sender_name}: {label.slice(0, 50)}
              </span>
              <button type="button" onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 14 }}>✕</button>
            </div>
          )
        })()}

        {/* Emoji picker */}
        <Popover open={showEmoji} onClose={() => setShowEmoji(false)} anchorRef={emojiBtnRef} width={252} prefer="top" label="Emoji" padding={8}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
            {EMOJIS.map(e => (
              <button key={e} type="button" data-pop-item className="cpop-item" aria-label={`Insert ${e}`} onClick={() => { setReply(r => r + e); setShowEmoji(false) }}
                style={{ width: 34, height: 34, padding: 0, justifyContent: 'center', fontSize: 20, borderRadius: 6 }}>{e}</button>
            ))}
          </div>
        </Popover>

        {/* Quick responses — type "/" to pick a saved reply */}
        {showQuickMenu && (
          <div ref={quickMenuRef} style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 6, background: '#fff', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.14)', zIndex: 70, overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
            <p style={{ margin: 0, padding: '8px 14px 6px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)' }}>Quick responses</p>
            {quickMatches.map((r, i) => (
              <button key={r.id} type="button"
                onMouseEnter={() => setQuickIndex(i)}
                onClick={() => applyQuickResponse(r)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', background: i === quickIndex ? 'var(--peach)' : 'none', cursor: 'pointer' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{r.title || 'Reply'}</span>
                  <code style={{ fontSize: 11, color: 'var(--coral)', background: 'var(--canvas)', padding: '1px 6px', borderRadius: 5 }}>/{(r.shortcut || '').replace(/^\//, '')}</code>
                </span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--slate)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.body}</span>
              </button>
            ))}
          </div>
        )}

        {/* Unsent replies are kept per conversation, so you can leave and
            come back without losing what you'd written. */}
        {draft.saved && reply.trim() && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--slate)', marginBottom: 4 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Draft saved
          </div>
        )}

        {/* Voice-note recording bar */}
        {recording && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', marginBottom: 8, borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#dc2626', flexShrink: 0, animation: 'recPulse 1s infinite' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c' }}>Recording</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c', fontVariantNumeric: 'tabular-nums' }}>{fmtRec(recSeconds)}</span>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => stopVoiceNote(false)}
              style={{ height: 30, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--slate)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="button" onClick={() => stopVoiceNote(true)}
              style={{ height: 30, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>
              Stop &amp; attach
            </button>
          </div>
        )}

        {/* Attached-but-unsent media — preview cards, delivered on Send.
            New uploads carry a Media-expiry selector (Keep forever by
            default); gallery picks don't, they're already kept there. */}
        {stagedMedia.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
            {/* Bulk expiry — set one expiry for every staged item at once
                (mirrors the mobile app). Only worth showing for 2+ items. */}
            {((!internalMode && expirable.length > 1) || stagedMedia.length > 3) && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '2px 2px 0' }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  {stagedMedia.length} attachments
                  {stagedMedia.length > 3 && (
                    <button type="button" onClick={() => { setStagedMedia([]); setStagedExpiry({}) }}
                      style={{ border: 'none', background: 'none', padding: 0, color: 'var(--coral)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                      Remove all
                    </button>
                  )}
                </span>
                {!internalMode && expirable.length > 1 && <div data-bulk-expiry style={{ position: 'relative', flexShrink: 0 }}>
                  <button type="button"
                    onClick={() => { setBulkExpiryOpen(v => !v); setBulkCustomDate(false) }}
                    title="Set when all of these expire"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 28, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: bulkExpiryCode && bulkExpiryCode !== 'forever' ? 'var(--peach)' : '#fff', color: bulkExpiryCode && bulkExpiryCode !== 'forever' ? 'var(--coral)' : 'var(--slate)', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
                    Set expiry for all{bulkExpiryCode === '' ? '' : ` · ${expiryChip(bulkExpiryCode)}`}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  {bulkExpiryOpen && (
                    <div style={{ position: 'absolute', bottom: '120%', right: 0, width: 180, background: '#fff', borderRadius: 10, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.14)', zIndex: 60, overflow: 'hidden', padding: '4px 0' }}>
                      {[['forever', 'Keep forever'], ['1d', '1 day'], ['7d', '7 days'], ['30d', '30 days']].map(([val, label]) => (
                        <button key={val} type="button"
                          onClick={() => { applyBulkExpiry(val); setBulkExpiryOpen(false) }}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: bulkExpiryCode === val ? 'var(--peach)' : 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)', fontWeight: bulkExpiryCode === val ? 700 : 500 }}>
                          {label}
                          {bulkExpiryCode === val && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </button>
                      ))}
                      <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                      {bulkCustomDate ? (
                        <div style={{ padding: '6px 10px' }}>
                          <input type="date" autoFocus
                            min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                            onChange={e => { if (e.target.value) { applyBulkExpiry(e.target.value); setBulkExpiryOpen(false); setBulkCustomDate(false) } }}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12.5, boxSizing: 'border-box' }} />
                        </div>
                      ) : (
                        <button type="button" onClick={() => setBulkCustomDate(true)}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                          Choose a date…
                        </button>
                      )}
                    </div>
                  )}
                </div>}
              </div>
            )}
            {/* Lots of attachments → a compact strip of thumbnails (scrolls
                after two rows) so the reply box stays usable. Expiry for
                these is set with "Set expiry for all" above. */}
            {stagedMedia.length > 3 && (
              <div className="staged-strip" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 148, overflowY: 'auto', padding: 2 }}>
                {stagedMedia.map((m: any) => {
                  const imgThumb = m.thumbnail_url && m.thumbnail_url !== m.url && !/\.(mp4|mov|webm|m4v)(\?|$)/i.test(m.thumbnail_url) ? m.thumbnail_url : null
                  const code = stagedExpiry[m.id]
                  const isDoc = !!m.kind && !['image', 'video', 'audio'].includes(m.kind)
                  return (
                    <div key={m.id} title={m.title || 'media'} style={{ position: 'relative', width: 64, height: 64, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', background: m.kind === 'audio' ? 'var(--peach)' : 'var(--canvas)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {m.kind === 'audio'
                        ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
                        : m.kind === 'video'
                        ? (imgThumb
                            ? <img src={imgThumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <video src={m.url + '#t=0.1'} preload="metadata" muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />)
                        : isDoc
                        ? <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--slate)' }}>{String(m.title || '').split('.').pop()?.toUpperCase().slice(0, 4) || 'FILE'}</span>
                        : <img src={imgThumb || m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                      {m.kind === 'video' && (
                        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                          <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="#fff"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                          </span>
                        </span>
                      )}
                      {!internalMode && code && code !== 'forever' && (
                        <span style={{ position: 'absolute', left: 3, bottom: 3, fontSize: 9.5, fontWeight: 800, padding: '1px 5px', borderRadius: 999, background: 'var(--coral)', color: '#fff' }}>{expiryChip(code)}</span>
                      )}
                      <button type="button" title="Remove" aria-label={`Remove ${m.title || 'attachment'}`}
                        onClick={() => { setStagedMedia(prev => prev.filter((x: any) => x.id !== m.id)); setStagedExpiry(prev => { const n = { ...prev }; delete n[m.id]; return n }) }}
                        style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: '50%', background: 'rgba(15,17,25,0.65)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            {stagedMedia.length <= 3 && stagedMedia.map((m: any) => {
              const imgThumb = m.thumbnail_url && m.thumbnail_url !== m.url && !/\.(mp4|mov|webm|m4v)(\?|$)/i.test(m.thumbnail_url) ? m.thumbnail_url : null
              const code = stagedExpiry[m.id]
              const isDoc = !!m.kind && !['image', 'video', 'audio'].includes(m.kind)
              const kindLabel = m.kind === 'video' ? 'Video' : m.kind === 'audio' ? 'Voice note' : isDoc ? (String(m.title || '').split('.').pop()?.toUpperCase().slice(0, 5) || 'File') : 'Image'
              const keeps = !code || code === 'forever'
              return (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, border: '1px solid var(--border)', background: '#fff' }}>
                  <div style={{ position: 'relative', width: 40, height: 40, borderRadius: 8, overflow: 'hidden', background: m.kind === 'audio' ? 'var(--peach)' : 'var(--canvas)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {m.kind === 'audio'
                      ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
                      : m.kind === 'video'
                      ? (imgThumb
                          ? <img src={imgThumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <video src={m.url + '#t=0.1'} preload="metadata" muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />)
                      : isDoc
                      ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      : <img src={imgThumb || m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                    {m.kind === 'video' && (
                      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                        <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="#fff"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                        </span>
                      </span>
                    )}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title || 'media'}</p>
                    <p style={{ margin: '1px 0 0', fontSize: 11.5, color: 'var(--slate)' }}>{kindLabel}</p>
                  </div>

                  {/* Media-expiry selector — only for customer-facing sends
                      (an internal note is never delivered, so it can't expire). */}
                  {!internalMode && m._fromGallery && (
                    <span title="Already saved in your Colvy gallery" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      From gallery
                    </span>
                  )}
                  {!internalMode && !m._fromGallery && (
                  <div data-expiry-picker style={{ position: 'relative', flexShrink: 0 }}>
                    <button type="button"
                      onClick={() => { setExpiryMenuFor(expiryMenuFor === m.id ? null : m.id); setCustomDateFor(null) }}
                      title="Set when this media expires"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: keeps ? '#fff' : 'var(--peach)', color: keeps ? 'var(--slate)' : 'var(--coral)', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
                      {expiryChip(code)}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    {expiryMenuFor === m.id && (
                      <div style={{ position: 'absolute', bottom: '120%', right: 0, width: 180, background: '#fff', borderRadius: 10, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.14)', zIndex: 60, overflow: 'hidden', padding: '4px 0' }}>
                        {[['forever', 'Keep forever'], ['1d', '1 day'], ['7d', '7 days'], ['30d', '30 days']].map(([val, label]) => (
                          <button key={val} type="button"
                            onClick={() => { setStagedExpiry(prev => { const n = { ...prev }; if (val === 'forever') delete n[m.id]; else n[m.id] = val; return n }); setExpiryMenuFor(null) }}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: (code === val || (val === 'forever' && keeps)) ? 'var(--peach)' : 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)', fontWeight: (code === val || (val === 'forever' && keeps)) ? 700 : 500 }}>
                            {label}
                            {(code === val || (val === 'forever' && keeps)) && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                          </button>
                        ))}
                        <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                        {customDateFor === m.id ? (
                          <div style={{ padding: '6px 10px' }}>
                            <input type="date" autoFocus
                              min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                              onChange={e => { if (e.target.value) { setStagedExpiry(prev => ({ ...prev, [m.id]: e.target.value })); setExpiryMenuFor(null); setCustomDateFor(null) } }}
                              style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12.5, boxSizing: 'border-box' }} />
                          </div>
                        ) : (
                          <button type="button" onClick={() => setCustomDateFor(m.id)}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                            Choose a date…
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  )}

                  <button type="button" title="Remove"
                    onClick={() => { setStagedMedia(prev => prev.filter((x: any) => x.id !== m.id)); setStagedExpiry(prev => { const n = { ...prev }; delete n[m.id]; return n }) }}
                    style={{ width: 24, height: 24, borderRadius: 7, background: 'none', color: 'var(--slate)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              )
            })}

            {/* Advanced: auto-delete. Only relevant once something expires,
                and off by default — expiring access alone keeps the
                original safe in the gallery. */}
            {anyExpiring && (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '2px 2px', cursor: 'pointer' }}>
                <input type="checkbox" checked={expiryDeleteMode} onChange={e => setExpiryDeleteMode(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--coral)' }} />
                <span style={{ fontSize: 11.5, color: 'var(--slate)', lineHeight: 1.4 }}>
                  <span style={{ fontWeight: 700, color: 'var(--ink)' }}>Delete from Colvy after expiry</span>{' '}— permanently removes the media from your gallery too, not just the recipient's access.
                </span>
              </label>
            )}
          </div>
        )}

        {/* Smart prompt: a recent message reads like a payment — offer to log
            the sale. Suppressed once a sale is recorded for this thread or the
            customer already matches an ecommerce order (already on record). */}
        {/* Scheduled replies on this conversation — what's queued, when it
            goes, and Edit / Send now / Delete for each. */}
        {selected && scheduledList.length > 0 && (
          <div className="sched-list" style={{ margin: '0 0 8px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--canvas, #fafafa)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', fontSize: 11.5, fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
              Scheduled · {scheduledList.length}
            </div>
            <div style={{ maxHeight: 168, overflowY: 'auto' }}>
              {scheduledList.map(sm => {
                const busy = scheduledBusy === sm.id
                const failed = sm.status === 'failed'
                const sending = sm.status === 'sending'
                return (
                  <div key={sm.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderTop: '1px solid var(--border)', background: '#fff', flexWrap: 'wrap', opacity: busy ? 0.6 : 1, transition: 'opacity .2s ease' }}>
                    <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: failed ? '#dc2626' : 'var(--ink)' }}>{failed ? 'Couldn’t send' : sending ? 'Sending…' : scheduledWhen(sm.scheduled_for)}</span>
                        {sm.channel && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: 'var(--peach, #fff1ee)', color: 'var(--coral)', textTransform: 'uppercase' }}>{String(sm.channel) === 'widget' ? 'Chat' : sm.channel}</span>}
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }} title={sm.message}>{sm.message}</div>
                    </div>
                    {!sending && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <button type="button" className="sched-btn" disabled={busy}
                          onClick={() => setEditingScheduled({ id: sm.id, message: sm.message || '', at: toLocalInput(failed && new Date(sm.scheduled_for).getTime() < Date.now() + 60000 ? new Date(Date.now() + 3600000).toISOString() : sm.scheduled_for) })}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                          Edit
                        </button>
                        <button type="button" className="sched-btn primary" disabled={busy} onClick={() => sendScheduledNow(sm)}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                          {busy ? 'Sending…' : failed ? 'Retry now' : 'Send now'}
                        </button>
                        <button type="button" className="sched-btn icon" disabled={busy} onClick={() => deleteScheduled(sm)} title="Delete" aria-label="Delete scheduled message">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* SMS upsell — shown exactly when an agent could be texting this
            customer (a mobile is on file) but the plan doesn't include SMS.
            This is the highest-intent moment to convert, so link straight to
            the upgrade page. */}
        {selected && !internalMode && !smsIncluded && !!smsDestination() && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 8px', padding: '10px 12px', borderRadius: 10, background: 'linear-gradient(135deg, #fff1ee 0%, #ffe9f0 100%)', border: '1px solid #ffd0c4' }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>💬</span>
            <span style={{ flex: 1, fontSize: 12.5, color: '#9a3412', fontWeight: 600, lineHeight: 1.4 }}>
              Reply by text and reach {contact?.name ? contact.name.split(' ')[0] : 'this customer'} on their phone — SMS isn’t on your current plan.
            </span>
            <a href="/admin/upgrade"
              style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--coral, #ff7a6b)', color: '#fff', fontSize: 12.5, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
              Enable SMS
            </a>
          </div>
        )}
        {selected && !internalMode && smsCreditError && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 8px', padding: '10px 12px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span style={{ flex: 1, fontSize: 12.5, color: '#991b1b', fontWeight: 600, lineHeight: 1.4 }}>
              Your text wasn’t sent. {smsCreditError}
            </span>
            <a href="/admin/billing#sms-credits"
              style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--coral, #ff7a6b)', color: '#fff', fontSize: 12.5, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
              Top up
            </a>
            <button type="button" onClick={() => setSmsCreditError('')} aria-label="Dismiss"
              style={{ border: 'none', background: 'none', color: '#991b1b', cursor: 'pointer', padding: 2, display: 'flex' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}
        {/* Opted out: staff can still type a text (a reply they were asked
            for), but they should know. Automatic texts are blocked. */}
        {selected && !internalMode && outboundChannel === 'sms' && (smsOptOut === 'opted_out' || (contact as any)?.unsubscribed_at || (contact as any)?.is_blocked) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 8px', padding: '9px 12px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca' }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>⛔</span>
            <span style={{ flex: 1, fontSize: 12.5, color: '#991b1b', fontWeight: 600, lineHeight: 1.4 }}>
              {(contact as any)?.is_blocked ? 'This customer is blocked.' : 'This customer opted out of texts (they replied STOP).'} Automatic texts to them are stopped — only text them if they’ve asked you to.
            </span>
          </div>
        )}
        {/* WhatsApp: the 24-hour window, opt-outs, and templates once it has closed. */}
        {selected && !internalMode && sendChannel === 'auto' && outboundChannel === 'whatsapp' && (
          <WhatsAppComposerBar conversationId={selected.id} refreshKey={lastInboundId} contactName={contact?.name || null} agentName={myName}
            onSent={async () => { if (await reloadThread(selected.id)) scrollBottom() }} onError={t => showToast(t)} />
        )}
        {selected && paymentSignal && !saleDismissed.has(selected.id) && !convHasSale && wooOrders.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 8px', padding: '9px 12px', borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>💰</span>
            <span style={{ flex: 1, fontSize: 12.5, color: '#065f46', fontWeight: 600 }}>Looks like a payment — did this convert to a sale?</span>
            <button type="button" onClick={() => { dismissSalePrompt(selected.id); setShowRecordSale(true) }}
              style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Yes, record</button>
            <button type="button" onClick={() => dismissSalePrompt(selected.id)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #a7f3d0', background: '#fff', color: '#065f46', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>Not now</button>
          </div>
        )}
        {!internalMode && <AiDraftInfo info={aiDraft.info} error={aiDraft.error} busy={aiDraft.busy} onRedo={i => aiDraft.run(i)} onClose={aiDraft.clear} />}
        {!internalMode && <TranslateStrip t={replyTr} suggested={customerLanguage(messages)} hasText={!!reply.trim()} />}

        {/* @mention picker */}
        {mentionQuery !== null && mentionMatches.length > 0 && (
          <div style={{ position: 'absolute', bottom: '100%', left: 12, right: 12, marginBottom: 6, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 10px 28px rgba(0,0,0,0.14)', maxHeight: 220, overflowY: 'auto', zIndex: 60 }}>
            <p style={{ margin: 0, padding: '8px 12px 4px', fontSize: 10.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Mention a team member</p>
            {mentionMatches.map((m: any, i: number) => (
              <button key={m.id} type="button" onClick={() => applyMention(m)}
                style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: i === mentionIndex ? 'var(--peach)' : '#fff', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  {(m.name || '?').charAt(0).toUpperCase()}
                </span>
                {m.name}
              </button>
            ))}
          </div>
        )}

        {/* Live typing preview — what the customer is typing right now.
            Admin-only; the customer never sees the agent's draft. */}
        {liveTyping.trim() && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 12px', borderRadius: 10, background: '#f0f9ff', border: '1px dashed #7dd3fc', marginBottom: 8 }}>
            <span style={{ display: 'flex', gap: 2, paddingTop: 5, flexShrink: 0 }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: '#0284c7', animation: `typingDot 1.2s ${i * 0.15}s infinite` }} />
              ))}
            </span>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Customer is typing</p>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: '#0c4a6e', fontStyle: 'italic', wordBreak: 'break-word' }}>{liveTyping}</p>
            </div>
          </div>
        )}

        {agentTyping && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', marginBottom: 8 }}>
            <span style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: '#8b5cf6', animation: `typingDot 1.2s ${i * 0.15}s infinite` }} />
              ))}
            </span>
            <p style={{ margin: 0, fontSize: 12, color: '#7c3aed', fontStyle: 'italic', fontWeight: 600 }}>{agentTyping} is typing…</p>
          </div>
        )}

        <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" style={{ display: 'none' }}
          onChange={e => { handleFileUpload(e.target.files); e.target.value = '' }} />

        <div className={`cmp-card${internalMode ? ' note' : ''}`}>
          {renderModeHead()}
        <textarea ref={textareaRef} value={reply} onChange={e => {
            const v = e.target.value
            setReply(v)
            if (v.trim()) broadcastAgentTyping()
            // Detect an in-progress "@name" token at the caret so the
            // mention picker can offer team members.
            const caret = e.target.selectionStart ?? v.length
            const upto = v.slice(0, caret)
            const m = upto.match(/@([\w.\-]*)$/)
            if (m) { setMentionQuery(m[1]); setMentionIndex(0) } else setMentionQuery(null)
          }}
          onKeyDown={e => {
            // @mention picker takes priority when it's open.
            if (mentionQuery !== null && mentionMatches.length) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => (i + 1) % mentionMatches.length); return }
              if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => (i - 1 + mentionMatches.length) % mentionMatches.length); return }
              if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                e.preventDefault(); applyMention(mentionMatches[mentionIndex]); return
              }
              if (e.key === 'Escape') { setMentionQuery(null); return }
            }
            // Quick-response picker takes priority over sending.
            if (showQuickMenu && quickMatches.length) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setQuickIndex(i => (i + 1) % quickMatches.length); return }
              if (e.key === 'ArrowUp') { e.preventDefault(); setQuickIndex(i => (i - 1 + quickMatches.length) % quickMatches.length); return }
              if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                e.preventDefault(); applyQuickResponse(quickMatches[quickIndex]); return
              }
              if (e.key === 'Escape') { setShowQuickMenu(false); return }
            }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() }
          }}
          placeholder={internalMode
            ? 'Write a note for your team — @ to mention someone'
            : `Reply to ${contact?.name ? contact.name.split(' ')[0] : 'customer'}…`}
          className="cmp-input"
          style={{ width: '100%', height: composerH, padding: '4px 16px 8px', border: 'none', background: 'transparent', fontStyle: internalMode ? 'italic' : 'normal', fontSize: 14, lineHeight: 1.5, resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', display: 'block', color: 'var(--ink)' }} />

        <div className="composer-bar cmp-bar">
          <div className="composer-tools cmp-tools">
            {/* Colvy Voice — dictate into the reply (Whispr-Flow style). */}
            <VoiceDictationButton
              size={34}
              soft
              title="Voice type"
              keyterms={[contact?.name, (contact as any)?.company_name].filter(Boolean) as string[]}
              onText={(t) => { dictatedRef.current.push(t); setReply(prev => (prev.trim() ? prev.replace(/\s*$/, ' ') : '') + t) }}
            />
            {renderSendMenu(false)}
            {/* Attach */}
            <button type="button" className="cmp-tool" onClick={() => fileInputRef.current?.click()} title="Attach a file" aria-label="Attach a file"
              style={toolBtn()}>
              {<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>}
            </button>
            {/* Gallery */}
            <button type="button" className="cmp-tool" onClick={openMediaPicker} title="Send from gallery" aria-label="Send from gallery"
              style={toolBtn()}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
            </button>
            {/* Emoji */}
            <button type="button" ref={emojiBtnRef} className="cmp-tool" onClick={() => setShowEmoji(v => !v)} title="Emoji" aria-label="Emoji" aria-haspopup="dialog" aria-expanded={showEmoji}
              style={toolBtn(showEmoji)}>{Icon.smile(17)}</button>
            {!internalMode && <TranslateButton t={replyTr} suggested={customerLanguage(messages)} className="cmp-tool" style={toolBtn(!!replyTr.done)} />}
            {renderLinkTools(false)}
          </div>
          <div className="cmp-send">
            {!internalMode && <AiDraftButton orb height={38} busy={aiDraft.busy} onClick={() => aiDraft.run()} />}
            <button type="button" className="cmp-tool cmp-resolve" onClick={() => setStatus('resolved')} title="Resolve conversation" aria-label="Resolve conversation"
              style={{ ...toolBtn(false, { bg: '#ecfdf3', c: '#059669' }), width: 38, height: 38, borderRadius: '50%' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.7 2.7L16 9.8"/></svg>
            </button>
            {/* Send + channel selector */}
            <div ref={channelMenuRef} style={{ position: 'relative', display: 'flex' }}>
              <button type="button" onClick={sendReply} disabled={sending || (!reply.trim() && stagedMedia.length === 0)}
                style={{ height: 38, padding: internalMode ? '0 18px' : '0 14px 0 18px', borderRadius: internalMode ? 999 : '999px 0 0 999px', background: (!reply.trim() && stagedMedia.length === 0) ? '#e5e7eb' : internalMode ? '#f59e0b' : (themeGradient || 'var(--coral)'), color: (reply.trim() || stagedMedia.length) ? '#fff' : '#9ca3af', border: 'none', fontSize: 13, fontWeight: 700, cursor: (reply.trim() || stagedMedia.length) ? 'pointer' : 'default', transition: 'all 0.15s' }}>
                {sending
                  ? (internalMode ? 'Saving…' : 'Sending…')
                  : internalMode
                    ? 'Add note'
                    : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        Send {sendChannelGlyph(sendChannel !== 'auto' ? sendChannel : outboundChannel, 15)}
                      </span>
                    )}
              </button>
              {!internalMode && (
              <>
              <button type="button" onClick={() => setShowChannelMenu(v => !v)} disabled={sending}
                title="Choose a channel"
                style={{ height: 38, padding: '0 13px 0 10px', borderRadius: '0 999px 999px 0', background: (reply.trim() || stagedMedia.length) ? themeSolid : '#e5e7eb', color: (reply.trim() || stagedMedia.length) ? '#fff' : '#9ca3af', border: 'none', borderLeft: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15"/></svg>
              </button>

              {showChannelMenu && (
                <div style={{ position: 'absolute', bottom: '120%', right: 0, width: 190, background: '#fff', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.14)', zIndex: 60, overflow: 'hidden', padding: '4px 0' }}>
                  <button type="button" onClick={() => { setShowChannelMenu(false); sendAndClose() }} disabled={sending || (!reply.trim() && stagedMedia.length === 0)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: (reply.trim() || stagedMedia.length) ? 'var(--ink)' : '#9ca3af', fontWeight: 600 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg>
                    Send &amp; close
                  </button>
                  <button type="button" onClick={() => { setShowChannelMenu(false); openScheduleMsg() }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
                    Schedule message
                  </button>
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                  <p style={{ margin: 0, padding: '6px 14px 4px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)' }}>Send via</p>
                  {([
                    ['auto', 'Automatic', true],
                    ['chat', 'Live chat', true],
                    ['sms', 'SMS', !!((selected as any).sms_number || contact?.phone)],
                    ['email', 'Email', !!contact?.email],
                  ] as any[]).map(([key, label, available]: any) => (
                    <button key={key} type="button" disabled={!available}
                      onClick={() => { setSendChannel(key); setShowChannelMenu(false) }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', background: sendChannel === key ? 'var(--peach)' : 'none', cursor: available ? 'pointer' : 'not-allowed', fontSize: 13, color: available ? 'var(--ink)' : '#c0c4cc', fontWeight: sendChannel === key ? 700 : 500 }}>
                      {label}
                      {!available && <span style={{ fontSize: 10, color: '#c0c4cc' }}>n/a</span>}
                      {sendChannel === key && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </button>
                  ))}
                </div>
              )}
              </>
              )}
            </div>
          </div>
        </div>
        </div>
        <div className="cmp-hint">
          <span><kbd>Enter</kbd> to send</span><span><kbd>Shift</kbd> + <kbd>Enter</kbd> new line</span>{internalMode ? <span><kbd>@</kbd> mention</span> : <span><kbd>/</kbd> quick replies</span>}
        </div>
        </>
        )}
      </div>
    </>
  )
}
