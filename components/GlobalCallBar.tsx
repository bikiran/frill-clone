'use client'

import { useEffect, useState } from 'react'
import CallBar from './CallBar'

// A persistent, minimizable floating call bar mounted once in the admin shell.
//
// The active call used to live inside the inbox conversation view, so navigating
// to another page (or switching conversations) unmounted CallBar and hung up the
// call. Now every "Call" button dispatches a `colvy:call` event; this host — which
// lives in the layout and survives route changes — mounts the single CallBar for
// the call, so it keeps running until it actually ends.
//
// (A full page RELOAD still ends the call: the browser tears down the WebRTC
// session with the page. That's a browser limitation, not something we can hold.)

interface Session { number: string; name?: string | null; contactId?: string | null; conversationId?: string | null; key: number }

export default function GlobalCallBar({ companyId, agentName }: { companyId: string | null; agentName?: string }) {
  const [session, setSession] = useState<Session | null>(null)
  const [minimized, setMinimized] = useState(false)

  useEffect(() => {
    const onCall = (e: Event) => {
      const d = (e as CustomEvent).detail || {}
      const number = d.number || d.phone
      if (!number) return
      // If a call is already up, ignore a new request rather than dropping the
      // live one (remounting CallBar would hang the current call up).
      setSession(prev => prev || { number, name: d.name, contactId: d.contactId, conversationId: d.conversationId, key: Date.now() })
      setMinimized(false)
    }
    window.addEventListener('colvy:call', onCall as EventListener)
    return () => window.removeEventListener('colvy:call', onCall as EventListener)
  }, [])

  if (!session) return null

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 3000, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
      {minimized && (
        <button type="button" onClick={() => setMinimized(false)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 999, border: 'none', background: '#0d0d0d', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 4px rgba(34,197,94,0.25)' }} />
          On call — tap to expand
        </button>
      )}
      {/* CallBar stays mounted while minimized (display:none) so audio keeps playing and the call isn't torn down. */}
      <div style={{ display: minimized ? 'none' : 'block', position: 'relative', width: 340, maxWidth: '92vw', background: '#0d0d0d', borderRadius: 14, padding: 8, boxShadow: '0 20px 50px rgba(0,0,0,0.4)' }}>
        <button type="button" onClick={() => setMinimized(true)} title="Minimize"
          style={{ position: 'absolute', top: -10, left: -10, width: 26, height: 26, borderRadius: '50%', border: 'none', background: '#374151', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 1 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
        <CallBar
          key={session.key}
          companyId={companyId}
          toNumber={session.number}
          contactName={session.name}
          contactId={session.contactId}
          conversationId={session.conversationId}
          agentName={agentName}
          autoStart
          onEnded={() => { setSession(null); setMinimized(false) }}
        />
      </div>
    </div>
  )
}
