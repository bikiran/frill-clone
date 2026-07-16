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
  // Coax shows "RA · Customer name" on an incoming call — the outlet initials
  // so staff know WHICH business the caller rang. We can do that here in the
  // browser popup. (On a native phone's own call screen we cannot: that needs
  // an installed app registering with the OS dialler — see notes.)
  const [companyInitials, setCompanyInitials] = useState('')

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
        // Register with the connection credentials (login/password) rather than a
        // JWT login_token. Credential registration makes the browser a REGISTERED
        // SIP endpoint, so inbound Call Control can actually dial and reach it
        // (a token connection does not register, so inbound legs dropped in ~1s).
        const client = (data.sipUser && data.sipPassword)
          ? new TelnyxRTC({ login: data.sipUser, password: data.sipPassword })
          : new TelnyxRTC({ login_token: data.token })
        // Route the far end's audio to our always-mounted element — without
        // this, answered calls connect but have no sound.
        ;(client as any).remoteElement = 'colvy-inbound-audio'
        clientRef.current = client

        client.on('telnyx.ready', () => {
          if (!cancelled) { setReady(true); console.log('[telnyx] client registered and ready') }
        })
        client.on('telnyx.error', (e: any) => {
          console.error('[telnyx] client error', e)
        })
        ;(client as any).on?.('telnyx.socket.error', (e: any) => {
          console.error('[telnyx] socket error', e)
        })
        client.on('telnyx.notification', (n: any) => {
          // Log every notification so we can see whether the inbound invite is
          // reaching this browser client at all (vs being dropped by Telnyx
          // before delivery).
          console.log('[telnyx notification]', n?.type, n?.call?.state, n?.call?.direction)
          const call = n?.call
          if (!call) return
          // Inbound invite
          if (call.state === 'ringing' && call.direction === 'inbound') {
            console.log('[telnyx] INCOMING CALL received by browser client')
            callRef.current = call
            setIncoming(call)
            resolveCaller(call.options?.remoteCallerNumber || call.remoteCallerNumber)
          }
          if (call.state === 'active') { setInCall(true); startTimer() }
          if (call.state === 'hangup' || call.state === 'destroy') { reset() }
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

  const answer = () => { try { callRef.current?.answer?.() } catch {}; setInCall(true) }
  const decline = () => { try { callRef.current?.hangup?.() } catch {}; reset() }
  const hangup = () => { try { callRef.current?.hangup?.() } catch {}; reset() }

  const reset = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setIncoming(null); setCaller(null); setInCall(false); setSeconds(0)
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

  if (!incoming) return audioEl

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
          <button onClick={hangup} style={btn('#dc2626')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ transform: 'rotate(135deg)', flexShrink: 0 }}>
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            End call
          </button>
        )}
      </div>
    </div>
  </>)
}
