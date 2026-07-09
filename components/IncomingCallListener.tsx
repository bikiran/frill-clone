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
        const client = new TelnyxRTC({ login_token: data.token })
        clientRef.current = client

        client.on('telnyx.ready', () => { if (!cancelled) setReady(true) })
        client.on('telnyx.notification', (n: any) => {
          const call = n?.call
          if (!call) return
          // Inbound invite
          if (call.state === 'ringing' && call.direction === 'inbound') {
            callRef.current = call
            setIncoming(call)
            resolveCaller(call.options?.remoteCallerNumber || call.remoteCallerNumber)
          }
          if (call.state === 'active') { setInCall(true); startTimer() }
          if (call.state === 'hangup' || call.state === 'destroy') { reset() }
        })
        client.connect()
      } catch (e) { /* silent — calling just won't be available */ }
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

  if (!incoming) return null

  return (
    <div style={{ position: 'fixed', top: 20, right: 20, width: 320, background: '#0d0d0d', color: '#fff', borderRadius: 18, boxShadow: '0 16px 48px rgba(0,0,0,0.4)', zIndex: 9999, overflow: 'hidden', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <div style={{ padding: '20px 20px 16px' }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: 1, opacity: 0.6, textTransform: 'uppercase' }}>
          {inCall ? `In call · ${fmtDur(seconds)}` : 'Incoming call'}
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
            🛒 {caller.woo.total_orders || 0} orders · ${(parseFloat(caller.woo.total_spend) || 0).toFixed(0)} spent
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
            <button onClick={decline} style={{ flex: 1, padding: '14px 0', border: 'none', background: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Decline</button>
            <button onClick={answer} style={{ flex: 1, padding: '14px 0', border: 'none', background: '#059669', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Answer</button>
          </>
        ) : (
          <button onClick={hangup} style={{ flex: 1, padding: '14px 0', border: 'none', background: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>End call</button>
        )}
      </div>
    </div>
  )
}
