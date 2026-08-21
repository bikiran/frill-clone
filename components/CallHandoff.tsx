'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { setActiveCall, clearActiveCall } from '@/lib/active-call'
import { getCallDeviceId, registerCallDevice, handoffFetch } from '@/lib/call-device'

// Global receiver for active-call device handoff on the WEB.
//  1. Registers this browser session as an available device (+ heartbeat).
//  2. Watches the calls realtime feed for a handoff that targets THIS device
//     and shows a "Take over call" banner.
//  3. On take-over: accepts, mints a Twilio token, and self-joins the call's
//     conference; then renders a compact in-call bar (mute / hang up / timer)
//     for the taken-over call. The timer continues from the original start.
//
// The customer stays connected throughout — this only joins the agent leg into
// the conference the server already promoted the call into.

type Pending = { callId: string; name: string; number: string; startedAt: string | null }

const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export default function CallHandoff({ companyId, userId, agentName }: { companyId: string | null; userId: string | null; agentName?: string | null }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const [active, setActive] = useState<Pending | null>(null)
  const [taking, setTaking] = useState(false)
  const [muted, setMuted] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [err, setErr] = useState('')

  const deviceRef = useRef<any>(null)
  const callRef = useRef<any>(null)
  const timerRef = useRef<any>(null)
  const myDeviceId = typeof window !== 'undefined' ? getCallDeviceId() : ''

  // ── Register this device + heartbeat ───────────────────────────────────────
  useEffect(() => {
    if (!companyId) return
    registerCallDevice(companyId)
    const iv = setInterval(() => registerCallDevice(companyId), 30_000)
    const onVis = () => { if (document.visibilityState === 'visible') registerCallDevice(companyId) }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis) }
  }, [companyId])

  // ── Watch for handoffs targeting this device ───────────────────────────────
  useEffect(() => {
    if (!companyId || !userId || !myDeviceId) return
    const apply = (row: any) => {
      if (!row) return
      const mineTarget = row.handoff_target_device_id === myDeviceId && row.handoff_by_user_id === userId
      const status = String(row.handoff_status || '')
      if (mineTarget && status === 'requested') {
        // Don't offer a takeover on a call that already ended.
        if (row.ended_at) { setPending(null); return }
        setPending({
          callId: row.id,
          name: row.contact_name || row.caller_name || row.from_number || 'Customer',
          number: row.direction === 'inbound' ? (row.from_number || '') : (row.to_number || ''),
          startedAt: row.started_at || row.created_at || null,
        })
      } else if (pending && row.id === pending.callId && status !== 'requested') {
        // The initiator cancelled, it expired, or we already accepted it.
        setPending(null)
      }
      // If this device's active call was ended elsewhere, tear down.
      if (active && row.id === active.callId && (row.ended_at || ['completed', 'failed'].includes(String(row.status || '')))) {
        teardown()
      }
    }
    const ch = (supabase as any)
      .channel(`callhandoff-${companyId}-${myDeviceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter: `company_id=eq.${companyId}` }, (p: any) => apply(p.new))
      .subscribe()
    return () => { try { (supabase as any).removeChannel(ch) } catch {} }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, userId, myDeviceId, pending?.callId, active?.callId])

  // ── Live timer while on the taken-over call ────────────────────────────────
  useEffect(() => {
    if (!active) { if (timerRef.current) clearInterval(timerRef.current); return }
    const base = active.startedAt ? new Date(active.startedAt).getTime() : Date.now()
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - base) / 1000)))
    tick()
    timerRef.current = setInterval(tick, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [active])

  const teardown = () => {
    try { callRef.current?.disconnect?.() } catch {}
    try { deviceRef.current?.destroy?.() } catch {}
    callRef.current = null; deviceRef.current = null
    setActive(null); setMuted(false); setSeconds(0)
    clearActiveCall()
  }

  // ── Take over: accept, mint token, self-join the conference ────────────────
  const takeOver = async () => {
    if (!pending || !companyId) return
    setTaking(true); setErr('')
    try {
      const accept = await handoffFetch(`/api/calls/${pending.callId}/handoff/accept`, { deviceId: myDeviceId })
      if (!accept.ok) throw new Error(accept.data?.error || 'Could not take over the call')
      const { handoffToken, conferenceName } = accept.data

      const tokRes = await fetch('/api/twilio/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, userId }) })
      const tok = await tokRes.json()
      if (!tok?.token) throw new Error('No calling token')

      const { Device } = await import('@twilio/voice-sdk')
      const device = new Device(tok.token, { codecPreferences: ['opus', 'pcmu'] as any })
      deviceRef.current = device
      device.on('error', (e: any) => { console.error('[handoff device] error', e) })

      // NB: no `From` param — Twilio's client:<identity> stays intact so the
      // server can verify this is the same user before joining the conference.
      const call = await device.connect({ params: { handoff: '1', handoffCallId: pending.callId, handoffToken: String(handoffToken || ''), conferenceName: String(conferenceName || '') } })
      callRef.current = call

      const started = pending
      call.on('accept', () => {
        setActive(started)
        setActiveCall({ conversationId: null, contactId: null, number: started.number, name: started.name, status: 'active' })
      })
      call.on('disconnect', () => { teardown() })
      call.on('error', (e: any) => { console.error('[handoff call] error', e); setErr('Call error'); teardown() })
      setPending(null)
    } catch (e: any) {
      setErr(e?.message || 'Could not take over the call')
      try { await handoffFetch(`/api/calls/${pending.callId}/handoff/cancel`, { reason: 'failed' }) } catch {}
    } finally { setTaking(false) }
  }

  const dismiss = async () => {
    if (pending) { try { await handoffFetch(`/api/calls/${pending.callId}/handoff/cancel`, { reason: 'cancelled' }) } catch {} }
    setPending(null)
  }

  const toggleMute = () => {
    const c = callRef.current; if (!c) return
    try { c.mute(!muted); setMuted(m => !m) } catch {}
  }
  const hangUp = () => { try { callRef.current?.disconnect?.() } catch {}; teardown() }

  if (!active && !pending) return null

  // ── Active (taken-over) call bar ───────────────────────────────────────────
  if (active) {
    return (
      <div style={wrap}>
        <div style={{ ...card, background: '#0d0d0d', color: '#fff' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{active.name}</p>
            <p style={{ margin: 0, fontSize: 11, opacity: 0.75 }}>On this device · {fmtDur(seconds)}</p>
          </div>
          <button type="button" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'} style={{ ...iconBtn, background: muted ? '#dc2626' : 'rgba(255,255,255,0.15)' }}>
            {muted ? '🔇' : '🎙️'}
          </button>
          <button type="button" onClick={hangUp} title="Hang up" style={{ ...iconBtn, background: '#dc2626' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ transform: 'rotate(135deg)' }}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          </button>
        </div>
      </div>
    )
  }

  // ── Takeover banner (call active on another device) ────────────────────────
  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--coral)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Call active on another device</p>
          <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pending!.name}</p>
          {pending!.number && <p style={{ margin: 0, fontSize: 12, color: 'var(--slate)' }}>{pending!.number}</p>}
          {err && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#dc2626' }}>{err}</p>}
        </div>
        <button type="button" onClick={dismiss} title="Dismiss" style={{ ...iconBtn, background: 'var(--canvas)', color: 'var(--slate)', width: 30, height: 30 }}>✕</button>
        <button type="button" onClick={takeOver} disabled={taking}
          style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: taking ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
          {taking ? 'Connecting…' : 'Take over call'}
        </button>
      </div>
    </div>
  )
}

const wrap: React.CSSProperties = { position: 'fixed', bottom: 20, right: 20, zIndex: 3000, maxWidth: 'calc(100vw - 40px)' }
const card: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: 'var(--card, #fff)', border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.18)', minWidth: 300 }
const iconBtn: React.CSSProperties = { width: 34, height: 34, borderRadius: '50%', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }
