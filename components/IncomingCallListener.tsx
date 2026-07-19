'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  companyId: string | null
  agentName?: string
}

// Registers the Telnyx WebRTC client and listens for INBOUND calls, showing a
// Coax-style popup with caller context (name, past orders) before answering.
export default function IncomingCallListener({ companyId, agentName }: Props) {
  const [incoming, setIncoming] = useState<any>(null)   // the ringing call
  const [caller, setCaller] = useState<any>(null)       // resolved contact context
  const [inCall, setInCall] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [ready, setReady] = useState(false)
  const [connErr, setConnErr] = useState<string | null>(null)
  // Coax shows "RA · Customer name" on an incoming call — the outlet initials
  // so staff know WHICH business the caller rang. We can do that here in the
  // browser popup. (On a native phone's own call screen we cannot: that needs
  // an installed app registering with the OS dialler — see notes.)
  const [companyInitials, setCompanyInitials] = useState('')
  // Hold / warm transfer
  const [onHold, setOnHold] = useState(false)
  const [transferState, setTransferState] = useState<'none' | 'ringing' | 'consulting'>('none')
  const [transferBusy, setTransferBusy] = useState(false)
  const [transferMsg, setTransferMsg] = useState('')

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const { data } = await (supabase as any).from('companies').select('name').eq('id', companyId).maybeSingle()
      const name: string = data?.name || ''
      const initials = name.split(/\s+/).filter(Boolean).map((w: string) => w[0]).join('').slice(0, 3).toUpperCase()
      if (initials) setCompanyInitials(initials)
    })()
  }, [companyId])
  const clientRef = useRef<any>(null)
  const callRef = useRef<any>(null)
  const timerRef = useRef<any>(null)

  useEffect(() => {
    if (!companyId) return
    let cancelled = false

    const connect = async () => {
      try {
        const res = await fetch('/api/telnyx/token', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId }),
        })
        const data = await res.json()
        if (!res.ok || cancelled) return
        const { TelnyxRTC } = await import('@telnyx/webrtc')
        // Register with the connection's SIP username/password when available.
        // Telnyx's Authentication tab is explicit: a Credential SIP Connection
        // requires devices to REGISTER with its username/password to receive
        // inbound calls. The telephony-credential TOKEN connects to the gateway
        // but never registers against this connection (it showed "Unregistered"),
        // so inbound invites were never delivered. Credential login fixes that.
        // Falls back to the token if the SIP creds aren't stored yet.
        const client = (data.sipUser && data.sipPassword)
          ? new TelnyxRTC({ login: data.sipUser, password: data.sipPassword })
          : new TelnyxRTC({ login_token: data.token })
        // Route the far end's audio to our always-mounted element — without
        // this, answered calls connect but have no sound.
        ;(client as any).remoteElement = 'colvy-inbound-audio'
        clientRef.current = client

        client.on('telnyx.ready', () => {
          if (!cancelled) { setReady(true); setConnErr(null); console.log('[telnyx] client registered and ready') }
        })
        client.on('telnyx.error', (e: any) => {
          if (!cancelled) setConnErr(e?.error?.message || 'connection error')
          console.error('[telnyx] client error', e)
        })
        ;(client as any).on?.('telnyx.socket.error', (e: any) => {
          if (!cancelled) setConnErr('socket error')
          console.error('[telnyx] socket error', e)
        })
        client.on('telnyx.notification', (n: any) => {
          // Log the FULL notification so we can see exactly what (if anything)
          // the client receives during an inbound call.
          console.log('[telnyx notification]', JSON.stringify({ type: n?.type, state: n?.call?.state, dir: n?.call?.direction, id: n?.call?.id }))
          const call = n?.call
          if (!call) return
          // Inbound invite — accept several state spellings across SDK versions.
          const st = call.state
          const dir = call.direction
          if ((st === 'ringing' || st === 'new' || st === 'early') && (dir === 'inbound' || dir === 'incoming')) {
            console.log('[telnyx] INCOMING CALL received by browser client')
            callRef.current = call
            setIncoming(call)
            startRing()
            resolveCaller(call.options?.remoteCallerNumber || call.remoteCallerNumber)
          }
          if (call.state === 'active') {
            stopRing()
            setInCall(true); startTimer()
          }
          // Any terminal state tears down the popup — covers the caller hanging
          // up before/after answer, so the browser popup never gets stuck.
          if (['hangup', 'destroy', 'purge', 'done'].includes(String(call.state))) {
            stopRing(); reset()
          }
        })
        client.connect()
      } catch (e) {
        console.error('[telnyx] client setup failed', e)
      }
    }
    connect()

    return () => {
      cancelled = true
      if (timerRef.current) clearInterval(timerRef.current)
      try { clientRef.current?.disconnect?.() } catch {}
    }
  }, [companyId])

  const resolveCaller = async (fromNumber: string) => {
    setCaller({ number: fromNumber, loading: true })
    if (!companyId || !fromNumber) { setCaller({ number: fromNumber }); return }
    try {
      const digits = fromNumber.replace(/\D/g, '').slice(-9)
      const { data: contacts } = await (supabase as any).from('contacts').select('*').eq('company_id', companyId).limit(500)
      const contact = (contacts || []).find((c: any) => c.phone && c.phone.replace(/\D/g, '').slice(-9) === digits)
      if (contact) {
        // Pull WooCommerce context if their email matches
        let woo: any = null
        if (contact.email) {
          const { data } = await (supabase as any).from('woocommerce_customers').select('total_orders,total_spend').eq('company_id', companyId).ilike('email', contact.email).maybeSingle()
          woo = data
        }
        setCaller({ number: fromNumber, name: contact.name, email: contact.email, contactId: contact.id, woo })
      } else {
        setCaller({ number: fromNumber, unknown: true })
      }
    } catch { setCaller({ number: fromNumber }) }
  }

  const startTimer = () => { setSeconds(0); timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000) }

  // A simple ringtone via WebAudio (two-tone, looped) so an incoming call is
  // audible even before it's answered.
  const ringOscRef = useRef<any>(null)
  const startRing = () => {
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext
      if (!AC) return
      const ctx = new AC()
      ringOscRef.current = { ctx, timer: null as any }
      const beep = () => {
        const o = ctx.createOscillator(); const g = ctx.createGain()
        o.frequency.value = 440; o.type = 'sine'
        g.gain.setValueAtTime(0.0001, ctx.currentTime)
        g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.05)
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9)
        o.connect(g); g.connect(ctx.destination)
        o.start(); o.stop(ctx.currentTime + 1)
      }
      beep()
      ringOscRef.current.timer = setInterval(beep, 3000)
    } catch {}
  }
  const stopRing = () => {
    try {
      if (ringOscRef.current) {
        clearInterval(ringOscRef.current.timer)
        ringOscRef.current.ctx?.close?.()
        ringOscRef.current = null
      }
    } catch {}
  }

  const answer = () => {
    stopRing()
    try {
      // Direct SIP delivery model: the call is delivered straight to this
      // registered browser client, so answering the WebRTC call IS the answer —
      // no server-side bridge is needed (the number rings this client directly,
      // it does not go through a Voice API webhook). The SDK owns media: it
      // creates the RTCPeerConnection and captures the mic on answer().
      callRef.current?.answer?.()
    } catch (e) { console.error('[telnyx] answer failed', e) }
    setInCall(true)
  }
  const decline = () => { stopRing(); try { callRef.current?.hangup?.() } catch {}; reset() }
  const hangup = () => { stopRing(); try { callRef.current?.hangup?.() } catch {}; reset() }

  // ── Hold and warm transfer ───────────────────────────────────────────────
  // These run server-side through Telnyx rather than in the browser: the
  // customer's audio lives in a Telnyx call leg, so holding them and adding a
  // colleague has to happen where that leg lives.
  const callAction = async (action: string) => {
    if (!incoming?.id || !companyId) return
    setTransferBusy(true); setTransferMsg('')
    try {
      const res = await fetch('/api/telnyx/call-transfer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, callId: incoming.id, action }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'That did not work')

      if (action === 'hold') { setOnHold(true) }
      if (action === 'unhold') { setOnHold(false) }
      if (action === 'consult') {
        setOnHold(true); setTransferState('ringing')
        // The response says plainly whether one person or the whole team is
        // being rung — don't imply more precision than exists.
        setTransferMsg(d.targeted === false ? `Ringing ${d.ringing || 'the team'}` : `Ringing ${d.ringing || ''}`)
      }
      if (action === 'cancel') { setOnHold(false); setTransferState('none'); setTransferMsg('') }
      if (action === 'conference') { setOnHold(false); setTransferState('consulting'); setTransferMsg('Everyone connected') }
      if (action === 'complete') {
        setTransferMsg('Transferred')
        setTimeout(() => { try { callRef.current?.hangup?.() } catch {}; reset() }, 1200)
      }
    } catch (e: any) {
      setTransferMsg(e.message)
      // A failed consult must not leave the customer stranded on hold.
      if (action === 'consult') { setOnHold(false); setTransferState('none') }
    } finally { setTransferBusy(false) }
  }

  const reset = () => {
    stopRing()
    if (timerRef.current) clearInterval(timerRef.current)
    setIncoming(null); setCaller(null); setInCall(false); setSeconds(0)
    setOnHold(false); setTransferState('none'); setTransferMsg('')
    callRef.current = null
  }

  const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  // Shared style for the answer/decline/hangup buttons — the icons previously
  // had no sizing or alignment rules and rendered squashed against the label.
  const btn = (bg: string): React.CSSProperties => ({
    flex: 1, padding: '14px 0', border: 'none', background: bg, color: '#fff',
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, lineHeight: 1,
  })

  // The audio element must ALWAYS be in the DOM (not just while the popup is
  // showing) — the SDK looks it up by id when call media starts, and without
  // it an answered call is completely silent.
  const audioEl = <audio id="colvy-inbound-audio" autoPlay style={{ display: 'none' }} />

  if (!incoming) return (<>
    {audioEl}
    {/* Tiny phone-status indicator so it's visible whether the WebRTC client is
        actually connected to receive inbound calls (green = ready). */}
    <div title={connErr ? `Phone: ${connErr}` : ready ? 'Phone ready to receive calls' : 'Phone connecting…'}
      style={{ position: 'fixed', bottom: 12, left: 12, zIndex: 40, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 9px', borderRadius: 20, background: '#fff', border: '1px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', fontSize: 11, fontWeight: 700, color: connErr ? '#dc2626' : ready ? '#15803d' : '#b45309' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: connErr ? '#dc2626' : ready ? '#22c55e' : '#f59e0b' }} />
      {connErr ? 'Phone error' : ready ? 'Phone ready' : 'Connecting…'}
    </div>
  </>)

  return (<>
    {audioEl}
    <div style={{ position: 'fixed', top: 20, right: 20, width: 320, background: '#0d0d0d', color: '#fff', borderRadius: 18, boxShadow: '0 16px 48px rgba(0,0,0,0.4)', zIndex: 9999, overflow: 'hidden', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <div style={{ padding: '20px 20px 16px' }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: 1, opacity: 0.6, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
          {inCall ? `In call · ${fmtDur(seconds)}` : 'Incoming call'}
          {companyInitials && <span style={{ opacity: 0.85 }}>· {companyInitials}</span>}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--coral, #ff7a6b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800 }}>
            {(caller?.name || '?')[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {caller?.loading ? 'Looking up…' : (caller?.name || 'Unknown caller')}
            </p>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>{caller?.number}</p>
          </div>
        </div>

        {/* Caller context */}
        {caller?.woo && (
          <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.08)', fontSize: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
              {caller.woo.total_orders || 0} orders · ${(parseFloat(caller.woo.total_spend) || 0).toFixed(0)} spent
            </span>
          </div>
        )}
        {caller?.unknown && (
          <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.08)', fontSize: 12, opacity: 0.8 }}>
            Not in your contacts yet
          </div>
        )}
      </div>

      {/* What's happening with hold / transfer, stated plainly */}
      {inCall && (onHold || transferState !== 'none' || transferMsg) && (
        <div style={{ margin: '0 0 8px', padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.12)', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8 }}>
          {transferState === 'ringing' && (
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fbbf24', flexShrink: 0, animation: 'pulse 1.2s infinite' }} />
          )}
          <span style={{ flex: 1 }}>
            {transferMsg
              || (transferState === 'consulting' ? 'Three-way call'
              : onHold ? 'Customer on hold' : '')}
          </span>
          {onHold && transferState === 'none' && (
            <span style={{ opacity: 0.7, fontSize: 11 }}>they hear hold music</span>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 1 }}>
        {!inCall ? (
          <>
            <button onClick={decline} style={btn('#dc2626')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ transform: 'rotate(135deg)', flexShrink: 0 }}>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              Decline
            </button>
            <button onClick={answer} style={btn('#059669')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              Answer
            </button>
          </>
        ) : (
          <>
            {/* Hold / transfer controls, only while actually on a call */}
            <div style={{ display: 'flex', gap: 1, flex: 1 }}>
              {transferState === 'none' ? (
                <>
                  <button onClick={() => callAction(onHold ? 'unhold' : 'hold')} disabled={transferBusy}
                    style={btn(onHold ? '#b45309' : '#6b7280')}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
                      {onHold
                        ? <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none"/>
                        : <><line x1="9" y1="4" x2="9" y2="20"/><line x1="15" y1="4" x2="15" y2="20"/></>}
                    </svg>
                    {onHold ? 'Resume' : 'Hold'}
                  </button>
                  <button onClick={() => callAction('consult')} disabled={transferBusy}
                    style={btn('#2563eb')}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
                    </svg>
                    {transferBusy ? '…' : 'Ring team'}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => callAction('cancel')} disabled={transferBusy}
                    style={btn('#6b7280')}>
                    Cancel
                  </button>
                  {transferState === 'ringing' && (
                    <button onClick={() => callAction('conference')} disabled={transferBusy}
                      style={btn('#7c3aed')}>
                      3-way
                    </button>
                  )}
                  <button onClick={() => callAction('complete')} disabled={transferBusy}
                    style={btn('#059669')}>
                    Hand over
                  </button>
                </>
              )}
            </div>
            <button onClick={hangup} style={btn('#dc2626')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ transform: 'rotate(135deg)', flexShrink: 0 }}>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              End
            </button>
          </>
        )}
      </div>
    </div>
  </>)
}
