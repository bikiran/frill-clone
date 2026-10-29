'use client'

// The inbox: conversation list, thread (header, messages, reply box) and the
// contact panel. The state and handlers live in useInboxController; each part of
// the screen is its own component under components/inbox and reads what it
// needs through InboxContext. This file is the layout that puts them together.

import { ColvyChatInfo, ColvyChatThread } from '@/components/inbox/ColvyChat'
import { INBOX_CSS, INBOX_KEYFRAMES_CSS } from '@/components/inbox/inbox-css'
import { useInboxController } from '@/components/inbox/useInboxController'
import { InboxContext } from '@/components/inbox/InboxContext'
import InboxList from '@/components/inbox/InboxList'
import ThreadTop from '@/components/inbox/ThreadTop'
import ThreadMessages from '@/components/inbox/ThreadMessages'
import InboxComposer from '@/components/inbox/InboxComposer'
import ContactPanelHead from '@/components/inbox/ContactPanelHead'
import dynamic from 'next/dynamic'

// Every panel here starts closed, so its code loads after the inbox has shown.
const InboxOverlays = dynamic(() => import('@/components/inbox/InboxOverlays'), { ssr: false })
// The contact panel's tabs load beside the thread rather than holding it up.
const ContactPanelBody = dynamic(() => import('@/components/inbox/ContactPanelBody'), { ssr: false })

export default function InboxPage() {
  const inbox = useInboxController()
  const {
    colvy, colvyOpen, companyId, companyInfo, loading, mobilePane, selected, setMobilePane,
    setTabletContact, tabletContact,
  } = inbox

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--slate)' }}>Loading inbox…</div>

  return (
    <InboxContext.Provider value={inbox}>
    <div className={`inbox-root inbox-pane-${mobilePane}${tabletContact ? ' tablet-contact-open' : ''}`} style={{ display: 'flex', height: '100vh', maxHeight: 'calc(100vh - 56px - var(--admin-banners-h, 0px))', overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <style>{INBOX_CSS}</style>
      {/* IncomingCallListener now lives in the admin layout, so calls ring on
          EVERY admin page — not only here. Mounting it twice would register two
          clients on the same credential. */}

      {/* Conversation action panels */}
      <style>{INBOX_KEYFRAMES_CSS}</style>

      <InboxOverlays />

      <InboxList />

      {/* ── MIDDLE: Chat thread ─────────────────────────────────────────────── */}
      <div className="inbox-col-thread" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f9f9f9', minWidth: 0 }}>
        {!selected && colvyOpen ? (
          <ColvyChatThread companyId={companyId} onBack={() => setMobilePane('list')} onRead={colvy.clearUnread} />
        ) : !selected ? (
          // Nothing open: the business's mark, quietly, and the keyboard keys.
          <div className="inbox-empty-thread" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: 0.9 }}>
              {companyInfo?.logo_url
                ? <img src={companyInfo.logo_url} alt="" style={{ width: 44, height: 44, borderRadius: 12, objectFit: 'cover' }} />
                : <span style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800 }}>{(companyInfo?.name || 'C').slice(0, 1).toUpperCase()}</span>}
              <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{companyInfo?.name || 'Inbox'}</span>
            </div>
            <p style={{ margin: '14px 0 0', fontSize: 13.5, color: '#8e8e93' }}>Pick a conversation to start.</p>
            <div className="inbox-kbd-hints" style={{ position: 'absolute', bottom: 22, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12.5, color: '#8e8e93' }}>
              <span className="inbox-kbd">J</span><span>/</span><span className="inbox-kbd">K</span><span style={{ marginRight: 8 }}>to move,</span>
              <span className="inbox-kbd">R</span><span style={{ marginRight: 8 }}>to reply,</span>
              <span className="inbox-kbd">⌘</span><span className="inbox-kbd">K</span><span>to search</span>
            </div>
          </div>
        ) : (
          <>
            <ThreadTop />

            <ThreadMessages />

            <InboxComposer />
          </>
        )}
      </div>

      {/* ── RIGHT: About Colvy, beside the Colvy chat ─────────────────────── */}
      {!selected && colvyOpen && <ColvyChatInfo />}

      {/* ── RIGHT: Contact info + Page history ─────────────────────────────── */}
      {selected && (
        <>
        <div className="inbox-tablet-scrim" onClick={() => setTabletContact(false)} aria-hidden />
        <div className="inbox-col-contact" style={{ width: 280, flexShrink: 0, borderLeft: '1px solid var(--border)', background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ContactPanelHead />

          <ContactPanelBody />
        </div>
        </>
      )}
    </div>
    </InboxContext.Provider>
  )
}
