'use client'

import { useEffect, useRef, useState } from 'react'
import CallBar from './CallBar'

// A persistent, DRAGGABLE floating panel that hosts an outbound call, mounted
// once in the admin shell. Every "Call" button dispatches a `colvy:call` event;
// this host places the call (via CallBar) and shows it in a movable dark card —
// so the call survives navigating between pages and switching conversations, and
// the agent can drag it out of the way (same feel as the incoming-call panel).
//
// Hold / warm-transfer / ring-team for OUTBOUND need provider call-control that
// isn't wired yet; those remain a follow-up. This delivers the draggable panel
// with the controls CallBar already supports (mute, switch device, hang up,
// recording + AI summary). A full page reload still ends the call — the browser
// tears down the WebRTC session with the page.

interface Session { number: string; name?: string | null; contactId?: string | null; conversationId?: string | null; key: number }

export default function GlobalCallBar({ companyId, agentName }: { companyId: string | null; agentName?: string }) {
  const [session, setSession] = useState<Session | null>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const ref = useRef<HTMLDivElement | null>(null)
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null)

  useEffect(() => {
    const onCall = (e: Event) => {
      const d = (e as CustomEvent).detail || {}
      const number = d.number || d.phone
      if (!number) return
      // Ignore a new request while a call is up (remounting CallBar would hang
      // the live call up).
      setSession(prev => prev || { number, name: d.name, contactId: d.contactId, conversationId: d.conversationId, key: Date.now() })
    }
    window.addEventListener('colvy:call', onCall as EventListener)
    return () => window.removeEventListener('colvy:call', onCall as EventListener)
  }, [])

  // ── draggable ──────────────────────────────────────────────────────────────
  const onMove = (e: PointerEvent) => {
    if (!dragOffset.current) return
    const w = ref.current?.offsetWidth || 320
    const h = ref.current?.offsetHeight || 140
    const x = Math.min(Math.max(6, e.clientX - dragOffset.current.dx), window.innerWidth - w - 6)
    const y = Math.min(Math.max(6, e.clientY - dragOffset.current.dy), window.innerHeight - h - 6)
    setPos({ x, y })
  }
  const onUp = () => {
    dragOffset.current = null
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return   // don't hijack the controls
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    dragOffset.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    setPos({ x: rect.left, y: rect.top })
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    e.preventDefault()
  }
  useEffect(() => () => onUp(), [])

  if (!session) return null

  return (
    <div ref={ref} style={{ position: 'fixed', width: 320, maxWidth: '92vw', zIndex: 9998, background: '#0d0d0d', borderRadius: 16, boxShadow: '0 20px 50px rgba(0,0,0,0.45)', overflow: 'hidden', ...(pos ? { left: pos.x, top: pos.y } : { bottom: 20, right: 20 }) }}>
      <div onPointerDown={onDown}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', color: '#fff', cursor: dragOffset.current ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.7 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>
        Outbound call
      </div>
      <div style={{ padding: '0 8px 8px' }}>
        <CallBar
          key={session.key}
          companyId={companyId}
          toNumber={session.number}
          contactName={session.name}
          contactId={session.contactId}
          conversationId={session.conversationId}
          agentName={agentName}
          autoStart
          onEnded={() => { setSession(null); setPos(null) }}
        />
      </div>
    </div>
  )
}
