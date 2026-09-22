'use client'

import { useEffect, useRef, useState } from 'react'
import CallBar from './CallBar'
import { getVoiceProvider } from '@/lib/voice-provider-client'

// Outbound calls are placed so they gain controllable legs — hold / warm-
// transfer / ring-team / switch-device — handled by the rich panel in
// IncomingCallListener, exactly like inbound (Telnyx: server-dialled; Twilio:
// device.connect into a conference-capable bridge). This is ON by default so
// outbound looks and behaves like the incoming-call panel. If the bridge can't
// start, we auto-fall back to the direct WebRTC dial in this draggable panel, so
// outbound calling never breaks.
//
// Opt OUT (revert to the direct dialer) with:
//   NEXT_PUBLIC_OUTBOUND_BRIDGE=0         → both providers
//   NEXT_PUBLIC_TELNYX_OUTBOUND_BRIDGE=0  → Telnyx only
//   NEXT_PUBLIC_TWILIO_OUTBOUND_BRIDGE=0  → Twilio only
const off = (v?: string) => v === '0' || v === 'false'
const BRIDGE_OFF_ALL = off(process.env.NEXT_PUBLIC_OUTBOUND_BRIDGE)
const BRIDGE_TELNYX = !BRIDGE_OFF_ALL && !off(process.env.NEXT_PUBLIC_TELNYX_OUTBOUND_BRIDGE)
const BRIDGE_TWILIO = !BRIDGE_OFF_ALL && !off(process.env.NEXT_PUBLIC_TWILIO_OUTBOUND_BRIDGE)

// A persistent, DRAGGABLE floating panel that hosts an outbound call, mounted
// once in the admin shell. Every "Call" button dispatches a `colvy:call` event;
// this host places the call (via CallBar) and shows it in a movable dark card —
// so the call survives navigating between pages and switching conversations, and
// the agent can drag it out of the way (same feel as the incoming-call panel).
//
// This draggable panel is now the FALLBACK direct WebRTC dial (mute, hang up,
// recording + AI summary), used only when the server-bridge is disabled or
// fails to start. By default outbound is handed to IncomingCallListener's
// server-bridged panel, which shows the full rich card at parity with inbound
// (hold / warm-transfer / ring-team / switch-device).

interface Session { number: string; name?: string | null; contactId?: string | null; conversationId?: string | null; key: number }

export default function GlobalCallBar({ companyId, agentName }: { companyId: string | null; agentName?: string }) {
  const [session, setSession] = useState<Session | null>(null)
  const sessionRef = useRef<Session | null>(null)
  sessionRef.current = session
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const ref = useRef<HTMLDivElement | null>(null)
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null)

  useEffect(() => {
    const onCall = async (e: Event) => {
      const d = (e as CustomEvent).detail || {}
      const number = d.number || d.phone
      if (!number) return
      // Ignore a new request while a call is up (remounting CallBar would hang
      // the live call up).
      if (sessionRef.current) return
      // Never open the direct dialler on top of the rich bridged panel
      // (IncomingCallListener). Without this a bridge + a fallback direct dial
      // could both show for one call ("two calls came"). EXCEPT a _noBridge
      // re-dispatch: that IS the bridge's own fallback (it just called reset()),
      // and __colvyRichCallActive is still true this tick because the flag only
      // clears on a later effect — bailing here dropped the fallback dial and the
      // call silently vanished after ~one ring.
      if (!d._noBridge && (window as any).__colvyRichCallActive) return

      // Server-bridge path. `_noBridge` marks a fallback re-dispatch from
      // IncomingCallListener when the bridge couldn't start — take the direct
      // WebRTC dial then instead of looping.
      if (!d._noBridge && companyId && (BRIDGE_TELNYX || BRIDGE_TWILIO)) {
        try {
          const prov = await getVoiceProvider(companyId)
          if ((prov === 'telnyx' && BRIDGE_TELNYX) || (prov === 'twilio' && BRIDGE_TWILIO)) {
            // Hand off to IncomingCallListener, which owns the registered voice
            // client and the hold/transfer/ring-team panel.
            window.dispatchEvent(new CustomEvent('colvy:outbound-bridge', { detail: { number, name: d.name, contactId: d.contactId, conversationId: d.conversationId, provider: prov } }))
            return
          }
        } catch { /* fall through to the direct dial */ }
      }

      setSession({ number, name: d.name, contactId: d.contactId, conversationId: d.conversationId, key: Date.now() })
    }
    window.addEventListener('colvy:call', onCall as EventListener)
    return () => window.removeEventListener('colvy:call', onCall as EventListener)
  }, [companyId])

  // Publish whether the direct dialler is showing a call, so the bridged panel
  // (IncomingCallListener) never doubles up on top of it.
  useEffect(() => { try { (window as any).__colvyDirectCallActive = !!session } catch {} }, [session])

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
