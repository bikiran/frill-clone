'use client'

import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface CallBarProps {
  companyId: string | null
  toNumber: string | null            // contact's number (E.164 or local)
  contactName?: string | null
  contactId?: string | null
  conversationId?: string | null
  agentName?: string
}

type CallState = 'idle' | 'connecting' | 'ringing' | 'active' | 'ended' | 'error'

// Normalise to E.164 defaulting to Australia
function toE164(raw: string): string | null {
  if (!raw) return null
  let s = raw.replace(/[^\d+]/g, '')
  if (s.startsWith('+')) return s
  if (s.startsWith('0')) return '+61' + s.slice(1)
  if (s.startsWith('61')) return '+' + s
  if (s.length === 9) return '+61' + s
  return '+' + s
}

export default function CallBar({ companyId, toNumber, contactName, contactId, conversationId, agentName }: CallBarProps) {
  const [state, setState] = useState<CallState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [muted, setMuted] = useState(false)
  const clientRef = useRef<any>(null)
  const callRef = useRef<any>(null)
  const timerRef = useRef<any>(null)
  const callRowId = useRef<string | null>(null)

  useEffect(() => () => { cleanup() }, [])

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    try { callRef.current?.hangup?.() } catch {}
    try { clientRef.current?.disconnect?.() } catch {}
    callRef.current = null
    clientRef.current = null
  }

  const startCall = async () => {
    const dest = toE164(toNumber || '')
    if (!dest) { setErrorMsg('No valid phone number'); setState('error'); return }
    if (!companyId) { setErrorMsg('No company'); setState('error'); return }

    setState('connecting'); setErrorMsg('')
    try {
      // 1. Get an ephemeral WebRTC token from our server
      const res = await fetch('/api/telnyx/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not get call token')
      const { token, from } = data

      // 2. Log the call row
      try {
        const { data: row } = await (supabase as any).from('calls').insert({
          company_id: companyId, conversation_id: conversationId || null, contact_id: contactId || null,
          direction: 'outbound', from_number: from, to_number: dest, status: 'initiated', agent_name: agentName || 'Agent',
        }).select().maybeSingle()
        callRowId.current = row?.id || null
      } catch {}

      // 3. Load the Telnyx WebRTC SDK and connect
      const { TelnyxRTC } = await import('@telnyx/webrtc')
      const client = new TelnyxRTC({ login_token: token })
      clientRef.current = client

      client.on('telnyx.ready', () => {
        // 4. Place the call
        const call = client.newCall({
          destinationNumber: dest,
          callerNumber: from || undefined,
          audio: true,
          video: false,
        })
        callRef.current = call
      })

      client.on('telnyx.notification', (notification: any) => {
        const call = notification?.call
        if (!call) return
        const s = call.state
        if (s === 'ringing' || s === 'trying') setState('ringing')
        if (s === 'active') {
          setState('active')
          startTimer()
          updateCallRow({ status: 'answered' })
        }
        if (s === 'hangup' || s === 'destroy') {
          endCall(false)
        }
      })

      client.on('telnyx.error', (e: any) => {
        setErrorMsg(e?.error?.message || 'Call error')
        setState('error')
      })

      client.connect()
    } catch (e: any) {
      setErrorMsg(e.message || 'Call failed')
      setState('error')
    }
  }

  const startTimer = () => {
    setSeconds(0)
    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
  }

  const updateCallRow = async (fields: any) => {
    if (!callRowId.current) return
    try { await (supabase as any).from('calls').update(fields).eq('id', callRowId.current) } catch {}
  }

  const endCall = async (userInitiated = true) => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (userInitiated) { try { callRef.current?.hangup?.() } catch {} }
    updateCallRow({ status: 'completed', ended_at: new Date().toISOString(), duration_seconds: seconds })
    // Log a note into the conversation thread
    if (conversationId && companyId && state !== 'idle') {
      try {
        await (supabase as any).from('messages').insert({
          conversation_id: conversationId, company_id: companyId, sender_type: 'system',
          content: `📞 Call ${seconds > 0 ? `— ${fmtDuration(seconds)}` : '(no answer)'}`,
        })
      } catch {}
    }
    setState('ended')
    cleanup()
    setTimeout(() => setState('idle'), 2500)
  }

  const toggleMute = () => {
    try {
      if (muted) callRef.current?.unmuteAudio?.()
      else callRef.current?.muteAudio?.()
      setMuted(m => !m)
    } catch {}
  }

  const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  if (!toNumber) return null

  // Idle → show a call button
  if (state === 'idle') {
    return (
      <button type="button" onClick={startCall}
        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10, border: '1px solid #059669', background: '#dcfce7', color: '#059669', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        Call
      </button>
    )
  }

  // Active call panel
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 12, background: state === 'error' ? '#fef2f2' : '#0d0d0d', color: '#fff' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {state === 'error' ? <span style={{ color: '#dc2626' }}>{errorMsg}</span> : (contactName || toNumber)}
        </p>
        <p style={{ margin: 0, fontSize: 11, opacity: 0.7 }}>
          {state === 'connecting' && 'Connecting…'}
          {state === 'ringing' && 'Ringing…'}
          {state === 'active' && fmtDuration(seconds)}
          {state === 'ended' && 'Call ended'}
        </p>
      </div>
      {state === 'active' && (
        <button type="button" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}
          style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: muted ? '#dc2626' : 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', fontSize: 14 }}>
          {muted ? '🔇' : '🎙'}
        </button>
      )}
      {(state === 'connecting' || state === 'ringing' || state === 'active') && (
        <button type="button" onClick={() => endCall(true)} title="Hang up"
          style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ transform: 'rotate(135deg)' }}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        </button>
      )}
      {(state === 'error' || state === 'ended') && (
        <button type="button" onClick={() => setState('idle')} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', fontSize: 12 }}>Close</button>
      )}
    </div>
  )
}
