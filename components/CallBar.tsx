'use client'

import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getVoiceProvider } from '@/lib/voice-provider-client'
import { setActiveCall, clearActiveCall } from '@/lib/active-call'
import { listCallDevices, handoffFetch } from '@/lib/call-device'

interface CallBarProps {
  companyId: string | null
  toNumber: string | null            // contact's number (E.164 or local)
  contactName?: string | null
  contactId?: string | null
  conversationId?: string | null
  agentName?: string
}

type CallState = 'idle' | 'connecting' | 'ringing' | 'active' | 'ended' | 'error'

// Twilio Voice errors carry a numeric code + a `twilioError` with a human
// description. Surface the most useful text instead of a bare "[object Object]"
// or an unrelated "reading 'message'" TypeError from a blind e.message access.
function fmtCallError(e: any): string {
  if (!e) return 'Call failed'
  if (typeof e === 'string') return e
  const t = e.twilioError || e
  const code = t?.code || e?.code
  const msg = t?.causes?.[0] || t?.description || t?.explanation || t?.message || e?.message
  if (code === 31201 || code === 20101 || code === 31204) return 'Calling isn’t authorised (token rejected). Open Integrations → Calls & SMS and reconnect, or contact support.'
  if (code === 31005 || code === 31009) return 'Call connection failed — check your network and try again.'
  if (msg && code) return `${msg} (Twilio ${code})`
  return msg || (code ? `Call error (Twilio ${code})` : 'Call failed')
}

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

  // Errors and ended calls shouldn't linger — clear the bar automatically so it
  // doesn't sit there permanently.
  useEffect(() => {
    if (state !== 'error' && state !== 'ended') return
    const t = setTimeout(() => { setState('idle'); setErrorMsg('') }, state === 'error' ? 5000 : 2500)
    return () => clearTimeout(t)
  }, [state])
  const [seconds, setSeconds] = useState(0)
  const [muted, setMuted] = useState(false)
  const providerRef = useRef<'telnyx' | 'twilio'>('telnyx')
  const clientRef = useRef<any>(null)
  const callRef = useRef<any>(null)
  const timerRef = useRef<any>(null)
  const callRowId = useRef<string | null>(null)
  // The conversation/contact/number this call belongs to, FROZEN at dial time.
  // The props follow the currently-SELECTED thread, so if the agent opens a
  // different chat mid-call, using the live props would attach the call row,
  // summary and recording to the WRONG conversation. Snapshot the target once.
  const callConvIdRef = useRef<string | null>(null)
  const callContactIdRef = useRef<string | null>(null)
  const callContactNameRef = useRef<string | null>(null)
  const callNumberRef = useRef<string | null>(null)
  const hangupCause = useRef<string | null>(null)
  const placedRef = useRef(false)   // has newCall been placed for this attempt?
  const endedRef = useRef(false)    // has this call ended? (blocks redial on reconnect)
  const audioCtxRef = useRef<any>(null)
  const ringbackRef = useRef<any>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const micStreamRef = useRef<MediaStream | null>(null)
  const [recording, setRecording] = useState(false)
  const [recErr, setRecErr] = useState('')

  // ── Device handoff (Switch device) ──────────────────────────────────────────
  const [switchOpen, setSwitchOpen] = useState(false)
  const [switchDevices, setSwitchDevices] = useState<Array<{ deviceId: string; deviceName: string; platform: string }>>([])
  const [switchBusy, setSwitchBusy] = useState(false)
  const [movedTo, setMovedTo] = useState<string | null>(null)

  const openSwitch = async () => {
    if (!companyId) return
    setSwitchOpen(true); setSwitchDevices([])
    const list = await listCallDevices(companyId)
    setSwitchDevices(list)
  }
  const moveCallTo = async (deviceId: string, name: string) => {
    if (!callRowId.current) return
    setSwitchBusy(true)
    try {
      const res = await handoffFetch(`/api/calls/${callRowId.current}/handoff`, { targetDeviceId: deviceId })
      if (!res.ok) { setErrorMsg(res.data?.error || 'Could not move the call'); setSwitchBusy(false); return }
      // The other device now shows "Take over call". Once it joins, the server
      // drops THIS leg — our Twilio call disconnects and the bar ends cleanly.
      setMovedTo(name); setSwitchOpen(false)
    } catch { setErrorMsg('Could not move the call') }
    setSwitchBusy(false)
  }
  // If the target never accepts within the handoff window, the customer stays on
  // THIS device — clear the "Moving…" label and cancel the pending handoff so the
  // call carries on normally here.
  useEffect(() => {
    if (!movedTo) return
    const t = setTimeout(() => {
      setMovedTo(null)
      if (callRowId.current) { handoffFetch(`/api/calls/${callRowId.current}/handoff/cancel`, { reason: 'cancelled' }).catch(() => {}) }
    }, 33_000)
    return () => clearTimeout(t)
  }, [movedTo])

  // ── Call recording ────────────────────────────────────────────────────────
  // Telnyx records calls placed through Call Control, but a WebRTC/SIP-credential
  // call has no call_control_id, so there's nothing server-side to record. We
  // instead mix BOTH sides in the browser (our mic + the far end's track) and
  // upload the result. Same outcome, and it works with the connection we have.
  const startRecording = (call: any) => {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
      if (!Ctx || typeof MediaRecorder === 'undefined') { setRecErr('Recording unsupported in this browser'); return }
      const ctx = audioCtxRef.current || new Ctx()
      audioCtxRef.current = ctx
      if (ctx.state === 'suspended') ctx.resume()
      const dest = ctx.createMediaStreamDestination()
      let sources = 0

      // OUR side: the mic stream we opened before dialling and deliberately kept.
      const mic = micStreamRef.current
      if (mic && mic.getAudioTracks().length) {
        ctx.createMediaStreamSource(mic).connect(dest)
        sources++
      }

      // THEIR side: the SDK plays the far end through our <audio> element, so
      // capture it straight off that element. This works regardless of whether
      // the SDK exposes call.remoteStream (it often doesn't).
      let remote: MediaStream | null =
        (call?.remoteStream as MediaStream) || (call?.options?.remoteStream as MediaStream) || null
      if (!remote || !remote.getAudioTracks?.().length) {
        const el = document.getElementById('colvy-callbar-audio') as any
        if (el?.captureStream) { try { remote = el.captureStream() } catch {} }
        else if (el?.mozCaptureStream) { try { remote = el.mozCaptureStream() } catch {} }
      }
      if (remote && remote.getAudioTracks?.().length) {
        ctx.createMediaStreamSource(remote).connect(dest)
        sources++
      }

      if (!sources) { setRecErr('No audio to record'); return }

      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '')
      const rec = new MediaRecorder(dest.stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      rec.ondataavailable = e => { if (e.data && e.data.size) chunksRef.current.push(e.data) }
      rec.onstop = () => { void uploadRecording() }
      rec.start(1000)
      recorderRef.current = rec
      setRecording(true)
    } catch (e: any) {
      console.error('[call recording] could not start', e)
      setRecErr(e?.message || 'Recording failed to start')
    }
  }

  const stopRecording = () => {
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
    } catch {}
    recorderRef.current = null
  }

  const uploadRecording = async () => {
    const rowId = callRowId.current
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    chunksRef.current = []
    if (!rowId || !companyId || blob.size < 2000) return   // ignore empty/near-empty audio
    try {
      const path = `${companyId}/${rowId}.webm`
      const { error } = await (supabase as any).storage
        .from('call-recordings')
        .upload(path, blob, { contentType: 'audio/webm', upsert: true })
      if (error) throw error
      const { data: pub } = (supabase as any).storage.from('call-recordings').getPublicUrl(path)
      const url = pub?.publicUrl
      if (!url) return
      await (supabase as any).from('calls').update({ recording_url: url }).eq('id', rowId)

      // Transcribe → AI summary → post the call card into the thread the call
      // belonged to (frozen at dial time — NOT wherever the agent navigated to).
      fetch('/api/telnyx/transcribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: rowId, companyId, conversationId: callConvIdRef.current }),
      }).catch(() => {})
    } catch (e: any) {
      console.error('[call recording] upload failed', e)
      // Don't fail silently — a missing 'call-recordings' bucket (i.e. the V170
      // migration hasn't been run) looks identical to "recording just doesn't
      // work" otherwise.
      const msg = /bucket/i.test(e?.message || '')
        ? 'Recording failed: the call-recordings bucket is missing — run COLVY_V170_CALLS_DELIVERY.sql'
        : `Recording upload failed: ${e?.message || 'unknown error'}`
      setRecErr(msg)
      try { await (supabase as any).from('calls').update({ recording_error: msg }).eq('id', rowId) } catch {}
    }
  }

  // Publish the live call so the inbox list can show "Call in progress" on the
  // matching conversation. Ringing/connecting count as ringing; answered = active.
  useEffect(() => {
    // Use the frozen target, not the live props — so the "Call in progress"
    // badge stays on the call's own conversation even if the agent navigates.
    const t = { conversationId: callConvIdRef.current, contactId: callContactIdRef.current, number: callNumberRef.current, name: callContactNameRef.current }
    if (state === 'active') {
      setActiveCall({ ...t, status: 'active' })
    } else if (state === 'connecting' || state === 'ringing') {
      setActiveCall({ ...t, status: 'ringing' })
    } else {
      clearActiveCall()
    }
  }, [state])

  useEffect(() => () => { clearActiveCall(); cleanup() }, [])

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    stopRingback()
    try { providerRef.current === 'twilio' ? callRef.current?.disconnect?.() : callRef.current?.hangup?.() } catch {}
    try { clientRef.current?.disconnect?.() } catch {}
    try { clientRef.current?.destroy?.() } catch {}   // Twilio Device teardown
    callRef.current = null
    clientRef.current = null
  }

  // ── Twilio outbound ────────────────────────────────────────────────────────
  // Twilio records the call server-side (Dial record="…"), so there's no browser
  // MediaRecorder here — the recording arrives via the recording callback and is
  // transcribed just like a Telnyx call.
  const startCallTwilio = async (dest: string) => {
    if (!companyId) return
    try {
      // Pre-check the mic so a blocked permission fails clearly (the SDK will
      // also request it, but this gives a friendlier message).
      try { micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true }) } catch {
        setErrorMsg('Microphone blocked — allow mic access for this site and try again'); setState('error'); return
      }
      const { data: sess } = await supabase.auth.getSession()
      const userId = sess?.session?.user?.id || null
      const res = await fetch('/api/twilio/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, userId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not get Twilio token')
      const from = data.from || ''

      // Log the call row (so recording/status callbacks can find it via callRowId).
      let rowId: string | null = null
      try {
        const { data: row } = await (supabase as any).from('calls').insert({
          company_id: companyId, conversation_id: callConvIdRef.current, contact_id: callContactIdRef.current,
          direction: 'outbound', provider: 'twilio', from_number: from, to_number: dest,
          status: 'initiated', agent_name: agentName || 'Agent', contact_name: callContactNameRef.current,
        }).select().maybeSingle()
        rowId = row?.id || null
        callRowId.current = rowId
      } catch {}

      if (callConvIdRef.current) {
        try { await (supabase as any).from('conversations').update({ last_message: '📞 Call started', last_message_at: new Date().toISOString() }).eq('id', callConvIdRef.current) } catch {}
      }

      const { Device } = await import('@twilio/voice-sdk')
      const device = new Device(data.token, { codecPreferences: ['opus', 'pcmu'] as any })
      clientRef.current = device
      endedRef.current = false
      // A rejected token / bad API key surfaces here, before the call connects.
      device.on('error', (e: any) => { console.error('[twilio device] error', e); if (state !== 'active') { setErrorMsg(fmtCallError(e)); setState('error') } })

      const call = await device.connect({
        params: { To: dest, From: from, callRowId: rowId || '', companyId, conversationId: callConvIdRef.current || '' },
      })
      callRef.current = call
      setState('ringing'); startRingback()

      call.on('accept', () => { setState('active'); toneConnected(); startTimer(); updateCallRow({ status: 'answered' }) })
      call.on('disconnect', () => { toneEnded(); endCall(false) })
      call.on('cancel', () => { endCall(false) })
      call.on('error', (e: any) => { console.error('[twilio call] error', e); setErrorMsg(fmtCallError(e)); setState('error') })
    } catch (e: any) {
      console.error('[twilio call] connect failed', e)
      setErrorMsg(fmtCallError(e)); setState('error')
    }
  }

  const startCall = async () => {
    const dest = toE164(toNumber || '')
    if (!dest) { setErrorMsg('No valid phone number'); setState('error'); return }
    if (!companyId) { setErrorMsg('No company'); setState('error'); return }

    // Freeze the call's target NOW, before the agent can navigate away. Every
    // write for this call (row, summary, recording, thread card) uses these refs.
    callConvIdRef.current = conversationId || null
    callContactIdRef.current = contactId || null
    callContactNameRef.current = contactName || null
    callNumberRef.current = toNumber || null

    setState('connecting'); setErrorMsg('')
    placedRef.current = false
    endedRef.current = false
    try {
      // Route to whichever calling backend this company uses.
      const prov = await getVoiceProvider(companyId)
      providerRef.current = prov
      if (prov === 'twilio') { await startCallTwilio(dest); return }

      // 0. Ask for the microphone up-front. If it's blocked, fail NOW with a
      // clear message instead of a cryptic mid-call error from the SDK.
      try {
        // KEEP this stream — we record our own side of the call from it. The
        // old code stopped its tracks immediately, and then tried to record
        // from call.remoteStream/localStream, which the Telnyx SDK doesn't
        // reliably expose. dest.stream ended up with zero tracks and recording
        // aborted silently — which is why no recording or summary ever appeared.
        micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {
        setErrorMsg('Microphone blocked — allow mic access for this site and try again')
        setState('error')
        return
      }

      // 1. Get an ephemeral WebRTC token from our server
      // Same per-user credential as the inbound listener, so outbound and
      // inbound use one identity for this browser.
      const { data: sess } = await supabase.auth.getSession()
      const userId = sess?.session?.user?.id || null

      const res = await fetch('/api/telnyx/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, conversationId: callConvIdRef.current, userId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not get call token')
      const { token, from } = data

      // 2. Log the call row
      try {
        const { data: row } = await (supabase as any).from('calls').insert({
          company_id: companyId, conversation_id: callConvIdRef.current, contact_id: callContactIdRef.current,
          direction: 'outbound', from_number: from, to_number: dest, status: 'initiated', agent_name: agentName || 'Agent',
          contact_name: callContactNameRef.current,
        }).select().maybeSingle()
        callRowId.current = row?.id || null
      } catch {}

      // Bump the conversation to the top of the inbox — a call is a new, notable
      // event, so it shouldn't stay buried under older-activity threads.
      if (callConvIdRef.current && companyId) {
        try {
          await (supabase as any).from('conversations').update({
            last_message: `📞 Call started`,
            last_message_at: new Date().toISOString(),
          }).eq('id', callConvIdRef.current)
        } catch {}
      }
      // 3. Load the Telnyx WebRTC SDK and connect
      const { TelnyxRTC } = await import('@telnyx/webrtc')
      const client = new TelnyxRTC({ login_token: token })
      // Without a remote audio element the call CONNECTS but is completely
      // silent — the SDK has nowhere to play the far end's audio.
      ;(client as any).remoteElement = 'colvy-callbar-audio'
      clientRef.current = client
      endedRef.current = false

      client.on('telnyx.ready', () => {
        // Place the call exactly ONCE. Without this guard, if the socket drops
        // after a hangup and auto-reconnects, telnyx.ready fires again and
        // places a SECOND newCall — an endless redial loop with a blaring
        // disconnect tone. Once a call has been placed or ended, never redial.
        if (placedRef.current || endedRef.current) return
        placedRef.current = true
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
        if (s === 'ringing' || s === 'trying') { setState('ringing'); startRingback() }
        if (s === 'active') {
          setState('active')
          toneConnected()
          startTimer()
          updateCallRow({ status: 'answered' })
          startRecording(call)
        }
        if (s === 'hangup' || s === 'destroy') {
          toneEnded()
          stopRecording()
          // Capture WHY the call ended — Telnyx puts a cause on the call object
          // (e.g. CALL_REJECTED, NORMAL_CLEARING, USER_BUSY, or an outbound-
          // permission/routing error). Surfacing this is the key to diagnosing
          // "ringing then cancelled with no audio".
          const cause = call.cause || call.causeCode || call.hangupCause || null
          hangupCause.current = cause
          if (seconds === 0 && cause && cause !== 'NORMAL_CLEARING') {
            setErrorMsg(explainCause(cause))
          }
          endCall(false)
        }
      })

      client.on('telnyx.error', (e: any) => {
        setErrorMsg(e?.error?.message || 'Call error')
        setState('error')
      })

      client.connect()
    } catch (e: any) {
      console.error('[call] start failed', e)
      setErrorMsg(fmtCallError(e))
      setState('error')
    }
  }

  const startTimer = () => {
    setSeconds(0)
    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
  }

  // ── Call tones ───────────────────────────────────────────────────────────
  // The call was silent in EVERY state — no ringback while dialling, no beep on
  // connect or hangup — so there was no way to tell what was happening. These
  // are generated with WebAudio (no audio files to host).
  const beep = (freq: number, ms: number, vol = 0.12) => {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
      if (!Ctx) return
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx()
      const ctx = audioCtxRef.current
      if (ctx.state === 'suspended') ctx.resume()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = ctx.currentTime
      const dur = ms / 1000
      // The old envelope jumped straight to full volume and then decayed, which
      // produces a click/pop at BOTH edges — that's the "big noise" on hangup.
      // Ramp up and back down instead, and stay well clear of zero (an
      // exponential ramp to 0.0001 from a hard start is what cracked).
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.linearRampToValueAtTime(vol, t + 0.015)          // 15ms attack
      gain.gain.setValueAtTime(vol, t + Math.max(0.02, dur - 0.04))
      gain.gain.linearRampToValueAtTime(0.0001, t + dur)          // smooth release
      osc.connect(gain); gain.connect(ctx.destination)
      osc.start(t); osc.stop(t + dur + 0.02)
    } catch {}
  }
  // Australian ringback: two short bursts, then a pause — repeating.
  const startRingback = () => {
    stopRingback()
    const ring = () => { beep(425, 400, 0.07); setTimeout(() => beep(425, 400, 0.07), 600) }
    ring()
    ringbackRef.current = setInterval(ring, 3000)
  }
  const stopRingback = () => { if (ringbackRef.current) { clearInterval(ringbackRef.current); ringbackRef.current = null } }
  const toneConnected = () => { stopRingback(); beep(880, 140, 0.09) }
  // A soft two-note fall, quiet and fully ramped — no click.
  const toneEnded = () => {
    stopRingback()
    beep(520, 130, 0.06)
    setTimeout(() => beep(390, 200, 0.05), 130)
  }

  // Telnyx hangup causes are machine-speak. Say what to actually DO about them.
  const explainCause = (cause: string): string => {
    const c = (cause || '').toUpperCase()
    if (c === 'CALL_REJECTED') return 'Call rejected by the carrier — the number\'s outbound voice profile or caller ID isn\'t set up. Open Integrations → Phone & SMS and click "Set up calling".'
    if (c === 'USER_BUSY') return 'The line was busy'
    if (c === 'NO_ANSWER' || c === 'NO_USER_RESPONSE') return 'No answer'
    if (c === 'UNALLOCATED_NUMBER' || c === 'INVALID_NUMBER_FORMAT') return 'That number doesn\'t exist or is misformatted'
    if (c === 'ORIGINATOR_CANCEL') return 'Call cancelled'
    if (c === 'NORMAL_CLEARING') return 'Call ended'
    return `Call ended: ${cause}`
  }

  const updateCallRow = async (fields: any) => {
    if (!callRowId.current) return
    try { await (supabase as any).from('calls').update(fields).eq('id', callRowId.current) } catch {}
  }

  const endCall = async (userInitiated = true) => {
    // Mark ended FIRST so any socket reconnect can't place a new call, and so a
    // second hangup/destroy notification doesn't re-run all of this.
    if (endedRef.current) return
    endedRef.current = true
    if (timerRef.current) clearInterval(timerRef.current)
    if (userInitiated) { try { providerRef.current === 'twilio' ? callRef.current?.disconnect?.() : callRef.current?.hangup?.() } catch {} }
    stopRecording()   // triggers upload → transcription → AI summary (Telnyx path)
    const cause = hangupCause.current
    const connected = seconds > 0
    updateCallRow({ status: connected ? 'completed' : 'failed', cause: cause || null, ended_at: new Date().toISOString(), duration_seconds: seconds })

    // Post into the thread ONLY when the call actually connected.
    //
    // Previously EVERY attempt posted a "Call not connected" pill, so a few
    // retries buried the real conversation under dozens of grey rows (and a
    // failed call isn't conversation history — it's call history). Failed
    // attempts are still recorded in `calls`, where the dialer's Recent Calls
    // tab shows them. Connected calls post a rich card instead: duration,
    // recording, transcript and AI summary, filled in as they arrive.
    if (connected && callConvIdRef.current && companyId) {
      try {
        await (supabase as any).from('messages').insert({
          conversation_id: callConvIdRef.current, company_id: companyId, sender_type: 'system',
          content: `Call — ${fmtDuration(seconds)}`,
          metadata: {
            call_event: true,
            call_id: callRowId.current,
            direction: 'outbound',
            duration_seconds: seconds,
            agent_name: agentName || 'Agent',
          },
        })
      } catch {}
    }
    setState('ended')
    cleanup()
    setTimeout(() => setState('idle'), 2500)
  }

  const toggleMute = () => {
    try {
      if (providerRef.current === 'twilio') {
        callRef.current?.mute?.(!muted)
      } else if (muted) {
        callRef.current?.unmuteAudio?.()
      } else {
        callRef.current?.muteAudio?.()
      }
      setMuted(m => !m)
    } catch {}
  }

  const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  if (!toNumber) return null

  // Idle → show a call button
  if (state === 'idle') {
    return (<>
      <audio id="colvy-callbar-audio" autoPlay style={{ display: 'none' }} />
      <button type="button" onClick={startCall} data-callbar-btn
        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10, border: '1px solid #059669', background: '#dcfce7', color: '#059669', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        Call
      </button>
    </>)
  }

  // Active call panel
  return (<>
    <style>{`@keyframes recPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.25 } }`}</style>
    <audio id="colvy-callbar-audio" autoPlay style={{ display: 'none' }} />
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 12, background: state === 'error' ? '#fef2f2' : '#0d0d0d', color: '#fff' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {state === 'error' ? <span style={{ color: '#dc2626' }}>{errorMsg}</span> : (callContactNameRef.current || callNumberRef.current || contactName || toNumber)}
        </p>
        <p style={{ margin: 0, fontSize: 11, opacity: 0.7, display: 'flex', alignItems: 'center', gap: 6 }}>
          {state === 'connecting' && 'Connecting…'}
          {state === 'ringing' && 'Ringing…'}
          {state === 'active' && (
            <>
              {movedTo ? `Moving to ${movedTo}…` : fmtDuration(seconds)}
              {recording && !movedTo && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#f87171', fontWeight: 700 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#dc2626', animation: 'recPulse 1.4s ease-in-out infinite' }} />
                  REC
                </span>
              )}
            </>
          )}
          {state === 'ended' && 'Call ended'}
          {recErr && <span style={{ color: '#fca5a5' }}>{recErr}</span>}
        </p>
      </div>
      {state === 'active' && providerRef.current === 'twilio' && !movedTo && (
        <div style={{ position: 'relative' }}>
          <button type="button" onClick={() => (switchOpen ? setSwitchOpen(false) : openSwitch())} title="Switch device"
            style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: switchOpen ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* laptop + phone glyph */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="14" height="9" rx="1"/><path d="M1 17h16"/><rect x="17" y="9" width="6" height="11" rx="1"/></svg>
          </button>
          {switchOpen && (
            <div style={{ position: 'absolute', bottom: 44, right: 0, width: 244, background: 'var(--card, #fff)', color: 'var(--ink)', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.2)', padding: 8, zIndex: 3200 }}>
              <p style={{ margin: '2px 8px 6px', fontSize: 11, fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Continue call on</p>
              {switchDevices.length === 0 ? (
                <p style={{ margin: 0, padding: '8px 8px 10px', fontSize: 12.5, color: 'var(--slate)' }}>No other devices online. Open Colvy in another browser, or on your phone with the latest app version, then try again.</p>
              ) : switchDevices.map(d => (
                <button key={d.deviceId} type="button" disabled={switchBusy} onClick={() => moveCallTo(d.deviceId, d.deviceName)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', borderRadius: 9, border: 'none', background: 'none', cursor: switchBusy ? 'default' : 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 16 }}>{d.platform === 'web' ? '💻' : '📱'}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.deviceName}</span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--slate)' }}>Available</span>
                  </span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {state === 'active' && (
        <button type="button" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}
          style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: muted ? '#dc2626' : 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {muted ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
          )}
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
  </>)
}
