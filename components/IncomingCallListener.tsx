'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getVoiceProvider } from '@/lib/voice-provider-client'
import { setActiveCall, clearActiveCall } from '@/lib/active-call'
import { listCallDevices, handoffFetch } from '@/lib/call-device'

// Pull the useful bit out of a Twilio Voice SDK error for the status pill.
function twErr(e: any): string {
  const t = e?.twilioError || e
  const code = t?.code || e?.code
  const msg = t?.description || t?.explanation || t?.message || e?.message
  if (code === 31201 || code === 20101 || code === 31204) return 'calling not authorised (token rejected)'
  return code ? `${msg || 'error'} (${code})` : (msg || 'connection error')
}

interface Props {
  companyId: string | null
  agentName?: string
}

// A caller's known origin/channel, made human. A plain phone call carries no
// referrer — so on a shared number we can't prove THIS call came from Google;
// what we CAN show is where this customer is already known from.
const SOURCE_LABELS: Record<string, string> = {
  woocommerce: 'WooCommerce order', woo: 'WooCommerce order', order: 'Online order',
  website: 'Website', widget: 'Website chat', chat: 'Website chat', live_chat: 'Website chat',
  contact_form: 'Website form', form: 'Website form',
  sms: 'SMS', email: 'Email', phone: 'Phone', call: 'Phone',
  instagram: 'Instagram', facebook: 'Messenger', messenger: 'Messenger', whatsapp: 'WhatsApp',
  google: 'Google', gbp: 'Google Business', rea: 'realestate.com.au', realestate: 'realestate.com.au',
  manual: 'Added manually', import: 'Imported', csv: 'Imported', prexty: 'Prexty POS',
}
const prettySource = (s?: string | null): string | null => {
  if (!s) return null
  const key = String(s).toLowerCase().trim()
  return SOURCE_LABELS[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1).replace(/[_-]+/g, ' ') : null)
}

// Registers the Telnyx WebRTC client and listens for INBOUND calls, showing a
// Coax-style popup with caller context (name, past orders) before answering.
export default function IncomingCallListener({ companyId, agentName }: Props) {
  const router = useRouter()
  const [incoming, setIncoming] = useState<any>(null)   // the ringing call
  const [caller, setCaller] = useState<any>(null)       // resolved contact context
  const [inCall, setInCall] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [ready, setReady] = useState(false)
  const [connErr, setConnErr] = useState<string | null>(null)
  // Bumping this re-runs the registration effect so the phone can re-connect
  // without a page reload — after the socket drops on tab-sleep or a token
  // expiry, coming back to the tab (or the periodic check) recovers it.
  const [reconnectNonce, setReconnectNonce] = useState(0)
  // Coax shows "RA · Customer name" on an incoming call — the outlet initials
  // so staff know WHICH business the caller rang. We can do that here in the
  // browser popup. (On a native phone's own call screen we cannot: that needs
  // an installed app registering with the OS dialler — see notes.)
  const [companyInitials, setCompanyInitials] = useState('')
  // Hold / warm transfer
  // The little phone-status pill can be dismissed if it's in the way. We keep
  // that in component state only (not storage), so it comes back on refresh.
  const [pillDismissed, setPillDismissed] = useState(false)
  const [pillHover, setPillHover] = useState(false)
  const [onHold, setOnHold] = useState(false)
  const [transferState, setTransferState] = useState<'none' | 'ringing' | 'consulting'>('none')
  const [transferBusy, setTransferBusy] = useState(false)
  const [transferMsg, setTransferMsg] = useState('')
  // In-call DTMF keypad (send tones for IVR menus / extensions).
  const [showKeypad, setShowKeypad] = useState(false)
  // Post-call review card: shown briefly after a connected call ends, with a
  // 👍/👎 and a countdown auto-dismiss.
  const [ended, setEnded] = useState<null | { callId?: string; name?: string; number?: string; seconds: number }>(null)
  const [endedCountdown, setEndedCountdown] = useState(3)
  const [endedRating, setEndedRating] = useState<0 | 1 | -1>(0)
  const endedTimerRef = useRef<any>(null)
  const startedAtRef = useRef<number>(0)
  // ── Server-bridged OUTBOUND call ────────────────────────────────────────────
  // When Colvy places an outbound call server-side (see /api/telnyx/outbound-
  // start), the server rings THIS browser back with a SIP leg. We auto-answer
  // that leg and show the same rich panel used for inbound — so hold / transfer /
  // ring-team work on outbound too. outboundCallId is the calls-row id the
  // transfer route acts on; expectingOutbound.current holds the pending request
  // until its callback invite arrives.
  const [outboundCallId, setOutboundCallId] = useState<string | null>(null)
  const outboundCallIdRef = useRef<string | null>(null)
  outboundCallIdRef.current = outboundCallId
  const expectingOutbound = useRef<{ callId: string; number: string; name?: string; contactId?: string; conversationId?: string; at: number } | null>(null)
  // ── Switch device (move this live call to another of my devices) ────────────
  const [switchOpen, setSwitchOpen] = useState(false)
  const [switchDevices, setSwitchDevices] = useState<Array<{ deviceId: string; deviceName: string; platform: string }>>([])
  const [switchBusy, setSwitchBusy] = useState(false)
  const [movedTo, setMovedTo] = useState<string | null>(null)

  // ── Draggable popup ───────────────────────────────────────────────────────
  // Let the agent move the call card out of the way. Defaults to the top-right;
  // once dragged we switch to absolute x/y. Resets on refresh (kept in state).
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null)

  const onDragMove = (e: PointerEvent) => {
    if (!dragOffset.current) return
    const w = popupRef.current?.offsetWidth || 320
    const h = popupRef.current?.offsetHeight || 200
    const x = Math.min(Math.max(6, e.clientX - dragOffset.current.dx), window.innerWidth - w - 6)
    const y = Math.min(Math.max(6, e.clientY - dragOffset.current.dy), window.innerHeight - h - 6)
    setPos({ x, y })
  }
  const onDragEnd = () => {
    dragOffset.current = null
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragEnd)
  }
  const onDragStart = (e: React.PointerEvent) => {
    // Don't hijack a button press (answer/hold/hangup live in this card too).
    if ((e.target as HTMLElement).closest('button')) return
    const rect = popupRef.current?.getBoundingClientRect()
    if (!rect) return
    dragOffset.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    setPos({ x: rect.left, y: rect.top })   // pin to current spot, then follow the pointer
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragEnd)
    e.preventDefault()
  }
  useEffect(() => () => onDragEnd(), [])   // clean up listeners if we unmount mid-drag

  // Publish an answered inbound call so the inbox list can show "Call in
  // progress" on the caller's conversation. We match by contact id / number
  // (an inbound call has no conversation id to hand).
  useEffect(() => {
    if (inCall) {
      setActiveCall({ contactId: caller?.contactId || null, number: caller?.number || null, name: caller?.name || null, status: 'active' })
    } else {
      clearActiveCall()
    }
  }, [inCall, caller])
  useEffect(() => () => clearActiveCall(), [])

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const { data } = await (supabase as any).from('companies').select('name').eq('id', companyId).maybeSingle()
      const name: string = data?.name || ''
      const initials = name.split(/\s+/).filter(Boolean).map((w: string) => w[0]).join('').slice(0, 3).toUpperCase()
      if (initials) setCompanyInitials(initials)
    })()
  }, [companyId])
  // Which calling backend this company uses. Drives whether we register the
  // Telnyx WebRTC client or the Twilio Voice SDK, and how answer/decline/hangup
  // are actioned. Warm-transfer/hold is Telnyx-only for now.
  const [provider, setProvider] = useState<'telnyx' | 'twilio'>('telnyx')
  const clientRef = useRef<any>(null)
  const callRef = useRef<any>(null)
  const timerRef = useRef<any>(null)
  // The id of the call currently in the popup, and the set of ids we've already
  // declined. On the direct-SIP (Telnyx) path, dropping a leg can make the
  // server re-offer the SAME ringing call — without this it re-opened the popup
  // and restarted the ringtone, so Decline looked like it did nothing.
  const callIdRef = useRef<string | null>(null)
  const declinedIds = useRef<Set<string>>(new Set())
  // The signed-in agent's user id, so a call we accept can notify the REST of
  // the team (excludeUserId = us) to stop their phones ringing.
  const userIdRef = useRef<string | null>(null)
  // Live mirror of the call/connection state, read by the auto-recovery effect
  // without making it depend on (and re-subscribe to) every state change.
  const liveRef = useRef({ ready: false, inCall: false, incoming: false })
  liveRef.current = { ready, inCall, incoming: !!incoming }
  // Fresh snapshots so end handlers (registered once, at connect time) can read
  // the CURRENT caller/incoming instead of a stale closure value.
  const callerRef = useRef<any>(null); callerRef.current = caller
  const incomingRef = useRef<any>(null); incomingRef.current = incoming
  // Publish whether the rich (bridged/incoming) panel owns a call, so the direct
  // dialler (GlobalCallBar) never opens a second panel on top of it.
  useEffect(() => { try { (window as any).__colvyRichCallActive = !!incoming || inCall } catch {} }, [incoming, inCall])
  // Throttle so a flurry of focus/visibility/online events triggers at most one
  // reconnect attempt every few seconds.
  const lastRecoverRef = useRef(0)

  useEffect(() => {
    if (!companyId) return
    let cancelled = false

    const connect = async () => {
      try {
        const prov = await getVoiceProvider(companyId)
        if (!cancelled) setProvider(prov)

        // ── Twilio Voice SDK path ────────────────────────────────────────────
        // Twilio rings this browser directly (Dial <Client>) and bridges the
        // caller on accept — no server bridge, unlike Telnyx. So all we do here
        // is register the Device and surface incoming calls in the same popup.
        if (prov === 'twilio') {
          const { data: sess } = await supabase.auth.getSession()
          const userId = sess?.session?.user?.id || null
          userIdRef.current = userId
          const tRes = await fetch('/api/twilio/token', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyId, userId }),
          })
          const tData = await tRes.json()
          if (!tRes.ok || cancelled) { if (!cancelled) setConnErr(tData.error || 'Twilio token error'); return }
          const { Device } = await import('@twilio/voice-sdk')
          const device = new Device(tData.token, { codecPreferences: ['opus', 'pcmu'] as any })
          clientRef.current = device
          // Silence the SDK's OWN incoming ringtone — we play our branded
          // /ringtone.mp3 (startRing) instead. Without this the browser rings
          // twice: Twilio's default tone and ours at the same time.
          const muteSdkRing = () => { try { (device as any).audio?.incoming?.(false); (device as any).audio?.outgoing?.(false) } catch {} }
          muteSdkRing()
          device.on('registered', () => { if (!cancelled) { setReady(true); setConnErr(null); console.log('[twilio voice] registered'); muteSdkRing() } })
          device.on('unregistered', () => { if (!cancelled) { setReady(false); console.log('[twilio voice] unregistered') } })
          // Twilio access tokens are short-lived. Refresh in place before expiry
          // so a long-idle tab keeps its registration instead of silently dying.
          device.on('tokenWillExpire', async () => {
            try {
              const r = await fetch('/api/twilio/token', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ companyId, userId }),
              })
              const d = await r.json()
              if (r.ok && d.token && !cancelled) { device.updateToken(d.token); console.log('[twilio voice] token refreshed') }
            } catch (e) { console.error('[twilio voice] token refresh failed', e) }
          })
          device.on('error', (e: any) => { if (!cancelled) { setReady(false); setConnErr(twErr(e)) } console.error('[twilio voice] error', e) })
          device.on('incoming', (call: any) => {
            console.log('[twilio voice] INCOMING CALL')
            // Already on a call? Don't clobber it — but IGNORE this leg, never
            // reject() it. The <Client> identity (u_<userId>) is shared across
            // every tab/device this user has open, so Twilio forks one inbound
            // call to ALL of them. reject() sends a decline/busy that tears down
            // the WHOLE forked <Client> leg — so a second, idle-but-"busy" tab
            // (or a stale registration) killed the ring on the tab actually
            // looking at the call: "1 ring → straight to voicemail". ignore()
            // silently drops only THIS registration and lets the others keep
            // ringing until someone answers or the dial times out.
            if (liveRef.current.inCall) { try { call.ignore?.() } catch { try { call.reject?.() } catch {} }; return }
            callRef.current = call
            const fromNum = call.parameters?.From || call.parameters?.from || ''
            // The inbound TwiML passes our calls-row id as a custom parameter so
            // warm transfer can reference the exact call reliably.
            const rowId = call.customParameters?.get?.('callRowId') || null
            setIncoming({ id: call.parameters?.CallSid || 'twilio', callRowId: rowId, from: fromNum })
            startRing()
            resolveCaller(fromNum)
            call.on('accept', () => { stopRing(); setInCall(true); startTimer() })
            call.on('disconnect', () => { stopRing(); finishCall() })
            call.on('cancel', () => { stopRing(); reset() })
            call.on('reject', () => { stopRing(); reset() })
          })
          try { await device.register() } catch (e: any) { if (!cancelled) setConnErr(twErr(e)); console.error('[twilio voice] register failed', e) }
          return
        }

        // Send userId so this browser gets its OWN telephony credential.
        // Sharing one credential meant Telnyx routed each call to whichever
        // client registered most recently — so a phone signing in silenced the
        // browser, and vice versa. With a credential each, the webhook rings
        // every registered device.
        const { data: sess } = await supabase.auth.getSession()
        const userId = sess?.session?.user?.id || null
        userIdRef.current = userId

        const res = await fetch('/api/telnyx/token', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, userId }),
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
          if (!cancelled) { setReady(false); setConnErr(e?.error?.message || 'connection error') }
          console.error('[telnyx] client error', e)
        })
        ;(client as any).on?.('telnyx.socket.error', (e: any) => {
          if (!cancelled) { setReady(false); setConnErr('socket error') }
          console.error('[telnyx] socket error', e)
        })
        ;(client as any).on?.('telnyx.socket.close', () => {
          if (!cancelled) { setReady(false); console.log('[telnyx] socket closed') }
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
            // Is this the callback leg for an outbound call WE placed? If so,
            // auto-answer it and show the in-call panel straight away — no
            // "incoming call" popup, no ringtone. Match on the X-Colvy-Outbound
            // header when the SDK surfaces it, otherwise on the caller number
            // (the server sets the leg's caller id to the customer we dialled),
            // within a 30s window of the request.
            const exp = expectingOutbound.current
            if (exp) {
              const fresh = Date.now() - exp.at < 30000
              if (!fresh) { expectingOutbound.current = null }
              else {
                const hdrs = call.options?.customHeaders || (call as any).customHeaders || []
                const hdr = Array.isArray(hdrs) ? hdrs.find((h: any) => String(h?.name || '').toLowerCase() === 'x-colvy-outbound') : null
                const remote = call.options?.remoteCallerNumber || call.remoteCallerNumber || ''
                const tail = (s: string) => (s || '').replace(/\D/g, '').slice(-9)
                const isOurs = (hdr?.value && hdr.value === exp.callId) || (remote && tail(remote) === tail(exp.number))
                if (isOurs) {
                  expectingOutbound.current = null
                  callRef.current = call
                  callIdRef.current = call.id || null
                  setOutboundCallId(exp.callId)
                  // Synthetic "incoming" so the panel renders; id/callRowId are the
                  // calls-row id the transfer + handoff routes act on.
                  setIncoming({ id: exp.callId, callRowId: exp.callId, outbound: true, from: exp.number })
                  setCaller({ number: exp.number, name: exp.name, contactId: exp.contactId })
                  setInCall(true)   // go straight to in-call controls (hold/transfer)
                  try { call.answer?.() } catch (err) { console.error('[telnyx outbound] auto-answer failed', err) }
                  return
                }
              }
            }
            // Already declined this call? The server is re-offering the same leg.
            // Reject it again silently — don't reopen the popup or ring.
            if (call.id && declinedIds.current.has(call.id)) {
              try { call.hangup?.() } catch {}
              return
            }
            // Already on a call? Reject this second leg so it rings the other
            // available agents instead of interrupting the live call.
            if (liveRef.current.inCall) { try { call.hangup?.() } catch {}; return }
            console.log('[telnyx] INCOMING CALL received by browser client')
            callRef.current = call
            callIdRef.current = call.id || null
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
            if (call.id) declinedIds.current.delete(call.id)   // truly over — forget it
            stopRing(); finishCall()
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
      try { clientRef.current?.destroy?.() } catch {}   // Twilio Device teardown
      clientRef.current = null
    }
  }, [companyId, reconnectNonce])

  // ── Auto-recovery ─────────────────────────────────────────────────────────
  // Browsers throttle/suspend background tabs, which can drop the WebRTC socket;
  // it used to stay dead ("Phone error") until a manual reload. Instead, when
  // the tab becomes visible again — or on network 'online', or via a periodic
  // check — we tear down and re-register by bumping reconnectNonce. Guarded so
  // we never disturb a live or ringing call, and throttled so a burst of events
  // is a single attempt.
  useEffect(() => {
    if (!companyId) return
    const tryRecover = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      const s = liveRef.current
      if (s.ready || s.inCall || s.incoming) return   // healthy, or mid-call — leave it
      const now = Date.now()
      if (now - lastRecoverRef.current < 4000) return
      lastRecoverRef.current = now
      console.log('[phone] auto-reconnect')
      setConnErr(null)
      setReconnectNonce(n => n + 1)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') tryRecover() }
    window.addEventListener('focus', tryRecover)
    window.addEventListener('online', tryRecover)
    document.addEventListener('visibilitychange', onVisible)
    const iv = setInterval(tryRecover, 30000)
    return () => {
      window.removeEventListener('focus', tryRecover)
      window.removeEventListener('online', tryRecover)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(iv)
    }
  }, [companyId])

  // ── Start a server-bridged outbound call ────────────────────────────────────
  // GlobalCallBar dispatches this (Telnyx + flag on). We ask the server to place
  // the call; it rings this browser back with a SIP leg that the telnyx
  // notification handler below auto-answers. On any failure we re-dispatch
  // colvy:call with _noBridge so GlobalCallBar falls back to the direct WebRTC
  // dial — outbound calling must never break because the bridge is unavailable.
  useEffect(() => {
    const onBridge = async (e: Event) => {
      const d = (e as CustomEvent).detail || {}
      const number = d.number
      if (!number || !companyId) return
      if (liveRef.current.inCall) return   // already on a call — don't clobber it
      if ((window as any).__colvyDirectCallActive) return   // direct dialler already owns a call
      // Falling back to the direct dialler: tear down any rich panel we've shown
      // FIRST, so we never leave two call panels on screen ("two calls came").
      const fallback = () => {
        reset()
        // Defer a tick so reset()'s state settles and __colvyRichCallActive
        // clears before the direct dialler picks this up (GlobalCallBar also
        // bypasses that guard for _noBridge, so the fallback dial never drops).
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('colvy:call', {
            detail: { number, name: d.name, contactId: d.contactId, conversationId: d.conversationId, _noBridge: true },
          }))
        }, 0)
      }
      const prov = d.provider || provider
      try {
        const { data: sess } = await supabase.auth.getSession()
        const userId = sess?.session?.user?.id || null

        // ── Twilio: place the call on the already-registered Voice device ────────
        // device.connect runs the outbound TwiML (bridge=1), which stamps both leg
        // SIDs onto the row so hold/transfer/ring-team work. We show the same rich
        // panel, keyed to the row id.
        if (prov === 'twilio') {
          const device = clientRef.current
          if (!device) { fallback(); return }
          const tRes = await fetch('/api/twilio/token', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyId, userId }),
          })
          const tData = await tRes.json().catch(() => ({}))
          if (!tRes.ok) { fallback(); return }
          const fromNo = tData.from || ''
          const { data: row } = await (supabase as any).from('calls').insert({
            company_id: companyId, direction: 'outbound', provider: 'twilio',
            from_number: fromNo, to_number: number,
            conversation_id: d.conversationId || null, contact_id: d.contactId || null,
            contact_name: d.name || null, agent_name: agentName || 'Agent',
            answered_by_user_id: userId, status: 'initiated',
          }).select('id').maybeSingle()
          const callRowId = row?.id
          if (!callRowId) { fallback(); return }
          try {
            const call = await device.connect({ params: { To: number, From: fromNo, callRowId, companyId, conversationId: d.conversationId || '', bridge: '1' } })
            callRef.current = call
            setOutboundCallId(callRowId)
            setIncoming({ id: callRowId, callRowId, outbound: true, from: number })
            setCaller({ number, name: d.name, contactId: d.contactId })
            setInCall(true)   // go straight to in-call controls; no Answer/Decline for outbound
            startRingback(callRowId)   // audible "brr-brr" until the customer answers
            call.on('accept', () => { startTimer() })
            call.on('disconnect', () => { twilioServerHangup(callRowId); finishCall() })
            call.on('cancel', () => reset())
            call.on('error', (err: any) => { setTransferMsg(twErr(err)); reset() })
          } catch {
            try { await (supabase as any).from('calls').update({ status: 'failed', ended_at: new Date().toISOString() }).eq('id', callRowId) } catch {}
            fallback()
          }
          return
        }

        // ── Telnyx: ask the server to place the call and ring us back ────────────
        const res = await fetch('/api/telnyx/outbound-start', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId, to: number, name: d.name, contactName: d.name,
            contactId: d.contactId, conversationId: d.conversationId,
            agentName, userId,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.callId) { fallback(); return }
        expectingOutbound.current = { callId: data.callId, number, name: d.name, contactId: d.contactId, conversationId: d.conversationId, at: Date.now() }
        startRingback(data.callId)   // audible "brr-brr" until the customer answers
      } catch { fallback() }
    }
    window.addEventListener('colvy:outbound-bridge', onBridge as EventListener)
    return () => window.removeEventListener('colvy:outbound-bridge', onBridge as EventListener)
  }, [companyId, agentName])

  const resolveCaller = async (fromNumber: string) => {
    setCaller({ number: fromNumber, loading: true })
    if (!companyId || !fromNumber) { setCaller({ number: fromNumber }); return }
    try {
      const digits = fromNumber.replace(/\D/g, '').slice(-9)
      const matchDigits = (list: any[]) => (list || []).find((c: any) => c.phone && c.phone.replace(/\D/g, '').slice(-9) === digits)
      // Look the caller up by number, not by scanning a capped list. The old
      // `.limit(500)` silently missed contacts past the first 500 on busy boards
      // (the call log resolved them server-side, so the popup disagreed). Query
      // the digits directly; fall back to a wide scan only for numbers stored
      // with separators that a substring match can't catch.
      let { data: cands } = await (supabase as any).from('contacts')
        .select('*').eq('company_id', companyId).ilike('phone', `%${digits}%`).limit(10)
      let contact = matchDigits(cands)
      if (!contact) {
        const { data: more } = await (supabase as any).from('contacts')
          .select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(2000)
        contact = matchDigits(more)
      }
      if (contact) {
        // Pull WooCommerce context if their email matches
        let woo: any = null
        if (contact.email) {
          const { data } = await (supabase as any).from('woocommerce_customers').select('total_orders,total_spend').eq('company_id', companyId).ilike('email', contact.email).maybeSingle()
          woo = data
        }
        setCaller({ number: fromNumber, name: contact.name, email: contact.email, contactId: contact.id, woo, source: contact.source || null, channels: Array.isArray(contact.channels_seen) ? contact.channels_seen : null })
      } else {
        setCaller({ number: fromNumber, unknown: true })
      }
    } catch { setCaller({ number: fromNumber }) }
  }

  const startTimer = () => { setSeconds(0); startedAtRef.current = Date.now(); timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000) }

  // Send a DTMF tone on the live call (IVR menus, extensions, "press 1").
  const sendDTMF = (digit: string) => {
    try {
      if (provider === 'twilio') callRef.current?.sendDigits?.(digit)
      else callRef.current?.dtmf?.(digit)   // Telnyx call
    } catch {}
  }

  // End the call and show the brief review card (only for a call that actually
  // connected), then reset. Duration comes from the start timestamp so it's
  // accurate even from a long-lived disconnect handler.
  const finishCall = () => {
    const wasLive = liveRef.current.inCall && startedAtRef.current > 0
    const secs = startedAtRef.current > 0 ? Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000)) : 0
    const inc = incomingRef.current
    const cal = callerRef.current
    const snap = { callId: outboundCallIdRef.current || inc?.callRowId || inc?.id || undefined, name: cal?.name, number: cal?.number || inc?.from, seconds: secs }
    reset()
    if (!wasLive) return
    setEnded(snap); setEndedRating(0); setEndedCountdown(3)
    let n = 3
    endedTimerRef.current = setInterval(() => {
      n -= 1; setEndedCountdown(n)
      if (n <= 0) { try { clearInterval(endedTimerRef.current) } catch {}; setEnded(null) }
    }, 1000)
  }
  const dismissEnded = () => { try { clearInterval(endedTimerRef.current) } catch {}; setEnded(null) }
  const rateCall = async (rating: 1 | -1) => {
    setEndedRating(rating)
    try { clearInterval(endedTimerRef.current) } catch {}   // stop the countdown once they engage
    const callId = ended?.callId
    if (!callId) { setTimeout(() => setEnded(null), 900); return }
    try {
      const { data: sess } = await supabase.auth.getSession()
      await fetch('/api/calls/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sess?.session?.access_token || ''}` },
        body: JSON.stringify({ callId, rating }),
      })
    } catch {}
    setTimeout(() => setEnded(null), 900)
  }

  // Incoming-call ringtone. Prefer the branded ringtone file (the same one the
  // mobile app rings with, so a call sounds the same on web and phone); fall back
  // to a WebAudio two-tone only if the audio file can't play (autoplay blocked,
  // decode error) so a call is never silent before it's answered.
  const ringOscRef = useRef<any>(null)
  const ringAudioRef = useRef<HTMLAudioElement | null>(null)
  const startOscRing = () => {
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
  const startRing = () => {
    try {
      const a = new Audio('/ringtone.mp3')
      a.loop = true
      a.volume = 0.6
      ringAudioRef.current = a
      // If the browser blocks autoplay or the file fails, ring via WebAudio so the
      // call is still audible.
      a.play().catch(() => { ringAudioRef.current = null; startOscRing() })
    } catch { startOscRing() }
  }
  const stopRing = () => {
    try {
      if (ringAudioRef.current) {
        ringAudioRef.current.pause()
        ringAudioRef.current.currentTime = 0
        ringAudioRef.current = null
      }
    } catch {}
    try {
      if (ringOscRef.current) {
        clearInterval(ringOscRef.current.timer)
        ringOscRef.current.ctx?.close?.()
        ringOscRef.current = null
      }
    } catch {}
  }

  // ── Outbound ringback ("brr-brr") ────────────────────────────────────────────
  // On an outbound call the agent joins a silent conference immediately and only
  // hears the customer once they answer — so there's no carrier ringback and the
  // agent can't tell the call is ringing. We synthesise the AU/UK double-ring
  // tone locally from the moment we place the call, and keep it looping until the
  // customer actually answers (the calls row gets answered_at) or the call reaches
  // a terminal / voicemail state. A 90s safety cap means it can never play forever.
  const ringbackRef = useRef<any>(null)
  const stopRingback = () => {
    const r = ringbackRef.current
    if (!r) return
    ringbackRef.current = null
    try { clearInterval(r.cadence) } catch {}
    try { clearInterval(r.poll) } catch {}
    try { clearTimeout(r.timeout) } catch {}
    try { if (r.channel) supabase.removeChannel(r.channel) } catch {}
    try { r.ctx?.close?.() } catch {}
  }
  // The tone must stop the instant the customer is actually on the line. Keep
  // ringing through every pre-answer state — the row legitimately moves
  // dialing_agent → dialing_customer → ringing while the customer is still
  // ringing, and Twilio stamps in_progress on the AGENT leg (no answered_at yet)
  // before the customer picks up — so those are NOT "answered". Stop only once
  // the customer has truly answered (answered_at is set on real pickup by both
  // providers) or the call reaches a terminal / voicemail state.
  const RINGBACK_STOP_STATES = ['completed', 'failed', 'no_answer', 'no-answer', 'busy', 'canceled', 'cancelled', 'voicemail', 'voicemail_greeting', 'recording_voicemail']
  const ringbackShouldStop = (row: any) =>
    !!row && (!!row.answered_at || RINGBACK_STOP_STATES.includes(String(row.status || '')))
  const startRingback = (callId: string) => {
    if (ringbackRef.current) return
    let ctx: any = null, cadence: any = null
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext
      if (AC) {
        ctx = new AC()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'; osc.frequency.value = 425
        gain.gain.value = 0.0001
        osc.connect(gain); gain.connect(ctx.destination)
        osc.start()
        // One cadence cycle = brr (0.4s) · gap (0.2s) · brr (0.4s) · silence → 3s.
        const cycle = () => {
          const t = ctx.currentTime
          const burst = (at: number) => {
            gain.gain.setValueAtTime(0.0001, t + at)
            gain.gain.exponentialRampToValueAtTime(0.22, t + at + 0.03)
            gain.gain.setValueAtTime(0.22, t + at + 0.37)
            gain.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.4)
          }
          burst(0); burst(0.6)
        }
        cycle()
        cadence = setInterval(cycle, 3000)
      }
    } catch {}
    // TWO independent stop signals, because relying on realtime alone left the
    // tone playing over a live conversation whenever the answered_at UPDATE
    // didn't reach the browser (realtime can drop events). The 1s DB poll is the
    // reliable backstop; the realtime subscription is just the fast path.
    let channel: any = null
    try {
      channel = supabase
        .channel(`ringback-${callId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${callId}` }, (payload: any) => {
          if (ringbackShouldStop(payload?.new)) stopRingback()
        })
        .subscribe()
    } catch {}
    const poll = setInterval(async () => {
      try {
        // Select the whole row (not 'status, answered_at') so that if answered_at
        // is momentarily unknown to the schema cache the query still succeeds and
        // returns status — a named missing column 400s the whole request.
        const { data } = await (supabase as any).from('calls').select('*').eq('id', callId).maybeSingle()
        if (ringbackShouldStop(data)) stopRingback()
      } catch {}
    }, 1000)
    const timeout = setTimeout(stopRingback, 90000)
    ringbackRef.current = { ctx, cadence, poll, timeout, channel }
  }

  const answer = () => {
    stopRing()
    try {
      // Direct SIP delivery model: the call is delivered straight to this
      // registered browser client, so answering the WebRTC call IS the answer —
      // no server-side bridge is needed (the number rings this client directly,
      // it does not go through a Voice API webhook). The SDK owns media: it
      // creates the RTCPeerConnection and captures the mic on answer().
      if (provider === 'twilio') callRef.current?.accept?.()
      else callRef.current?.answer?.()
    } catch (e) { console.error('[call] answer failed', e) }
    setInCall(true)
    notifyTeamCallAccepted()
  }

  // Tell everyone ELSE on the team that this call was picked up, so their phones
  // (and browsers) can stop ringing. Whole team minus the accepter. Fire-and-
  // forget — the call is already answered; a push hiccup mustn't block it.
  const notifyTeamCallAccepted = () => {
    if (!companyId) return
    const who = agentName || 'a teammate'
    fetch('/api/push/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId,
        excludeUserId: userIdRef.current || undefined,
        title: 'Call answered',
        body: `Phone call accepted by ${who}`,
        // No conversationId → no 'message' category (this isn't a chat), and the
        // default 'messages' channel so Android always renders it.
      }),
    }).catch(() => {})
  }
  const decline = () => {
    stopRing()
    // Remember this call id so a Telnyx re-offer of the same leg is auto-rejected
    // instead of ringing again.
    const cid = callIdRef.current || callRef.current?.id
    if (cid) declinedIds.current.add(cid)
    try {
      if (provider === 'twilio') callRef.current?.reject?.()
      // Telnyx: reject the ringing invite. hangup() sends the decline; some SDK
      // builds also expose reject() — call whichever exists.
      else { callRef.current?.reject?.(); callRef.current?.hangup?.() }
    } catch {}
    reset()
  }
  // Twilio: end the customer (and any consult) leg SERVER-SIDE. Disconnecting our
  // own browser leg alone can leave the customer's phone connected — Twilio's
  // <Dial> teardown races with answerOnBridge, and a call moved into a conference
  // (hold/transfer) stays up when only the browser drops. So hang up every leg by
  // SID. Fire-and-forget: the local UI resets immediately either way.
  const twilioServerHangup = (rowId?: string | null) => {
    if (!companyId) return
    const callId = rowId || incoming?.callRowId || (incoming?.outbound ? incoming?.id : undefined)
    const callSid = incoming?.outbound ? undefined : incoming?.id
    if (!callId && !callSid) return
    fetch('/api/twilio/call-transfer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, action: 'hangup', callId: callId || undefined, callSid }),
    }).catch(() => {})
  }

  const hangup = () => {
    stopRing()
    if (provider === 'twilio') twilioServerHangup()
    try { provider === 'twilio' ? callRef.current?.disconnect?.() : callRef.current?.hangup?.() } catch {}
    finishCall()
  }

  // ── Hold and warm transfer ───────────────────────────────────────────────
  // These run server-side through Telnyx rather than in the browser: the
  // customer's audio lives in a Telnyx call leg, so holding them and adding a
  // colleague has to happen where that leg lives.
  const callAction = async (action: string) => {
    if (!incoming?.id || !companyId) return
    setTransferBusy(true); setTransferMsg('')
    try {
      // Twilio identifies the call by the browser leg's Call SID (which the
      // transfer route resolves to the row); Telnyx uses its own call id.
      const res = await fetch(provider === 'twilio' ? '/api/twilio/call-transfer' : '/api/telnyx/call-transfer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(provider === 'twilio'
          // Prefer the exact calls-row id from the custom parameter; fall back to
          // the CallSid for older calls that predate it.
          ? { companyId, callId: incoming.callRowId || undefined, callSid: incoming.id, action, actorName: agentName }
          : { companyId, callId: incoming.id, action }),
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

  // Jump to this caller's conversation in the inbox. The inbox find-or-creates a
  // thread from ?contact=<id>; without a known contact we just open the inbox.
  const openInInbox = () => {
    // Client-side navigation (NOT window.location) so the page doesn't reload —
    // a full reload tears down the Twilio Device and drops the live call. This
    // listener lives in the persistent admin shell, so a router push keeps the
    // call alive while the inbox opens.
    const cid = caller?.contactId
    const conv = (caller as any)?.conversationId
    // Fire an explicit event FIRST: when the inbox is already open (the common
    // case — you take the call from the inbox), a same-route router.push does not
    // re-run the inbox's deep-link effect, so the push alone did nothing. The
    // event opens the conversation live; the push covers being on another page.
    try { window.dispatchEvent(new CustomEvent('colvy:open-contact', { detail: { contactId: cid || null, conversationId: conv || null } })) } catch {}
    try {
      router.push(cid
        ? `/admin/inbox?contact=${encodeURIComponent(cid)}`
        : conv ? `/admin/inbox?conversation=${encodeURIComponent(conv)}` : '/admin/inbox')
    } catch {}
  }

  // ── Switch device: move this live call to another of my devices ────────────
  const openSwitch = async () => {
    if (!companyId) return
    setSwitchOpen(true); setSwitchDevices([])
    const list = await listCallDevices(companyId)
    setSwitchDevices(list)
  }
  const moveCallTo = async (deviceId: string, name: string) => {
    // Inbound calls surface with only a CallSid; the server resolves either an
    // id or a SID, so pass whichever we hold.
    const callId = incoming?.callRowId || incoming?.id
    if (!callId) { setTransferMsg('This call can’t be moved.'); return }
    setSwitchBusy(true); setTransferMsg('')
    try {
      const res = await handoffFetch(`/api/calls/${encodeURIComponent(callId)}/handoff`, { targetDeviceId: deviceId })
      if (!res.ok) { setTransferMsg(res.data?.error || 'Could not move the call'); setSwitchBusy(false); return }
      // The other device now shows "Take over call". Once it joins, the server
      // drops this leg — our call disconnects and the popup closes cleanly.
      setMovedTo(name); setSwitchOpen(false)
    } catch { setTransferMsg('Could not move the call') }
    setSwitchBusy(false)
  }
  // If the target never accepts within the handoff window, the call stays here —
  // clear the "Moving…" label and cancel the pending handoff.
  useEffect(() => {
    if (!movedTo) return
    const callId = incoming?.callRowId || incoming?.id
    const t = setTimeout(() => {
      setMovedTo(null)
      if (callId) handoffFetch(`/api/calls/${encodeURIComponent(callId)}/handoff/cancel`, { reason: 'cancelled' }).catch(() => {})
    }, 33000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movedTo])

  const reset = () => {
    stopRing()
    stopRingback()
    if (timerRef.current) clearInterval(timerRef.current)
    setIncoming(null); setCaller(null); setInCall(false); setSeconds(0)
    setOnHold(false); setTransferState('none'); setTransferMsg('')
    setSwitchOpen(false); setSwitchDevices([]); setSwitchBusy(false); setMovedTo(null)
    setOutboundCallId(null)
    setShowKeypad(false)
    startedAtRef.current = 0
    callRef.current = null
  }

  const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  // Shared style for the answer/decline/hangup buttons — the icons previously
  // had no sizing or alignment rules and rendered squashed against the label.
  const btn = (bg: string): React.CSSProperties => ({
    flex: 1, padding: '14px 6px', border: 'none', background: bg, color: '#fff',
    fontSize: 13.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, lineHeight: 1,
  })

  // The audio element must ALWAYS be in the DOM (not just while the popup is
  // showing) — the SDK looks it up by id when call media starts, and without
  // it an answered call is completely silent.
  const audioEl = <audio id="colvy-inbound-audio" autoPlay style={{ display: 'none' }} />

  if (!incoming) return (<>
    {audioEl}
    {/* Post-call review card — brief, with a 👍/👎 and a countdown auto-dismiss. */}
    {ended && (
      <div style={{ position: 'fixed', top: 20, right: 20, width: 300, background: '#fff', color: '#111', borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.28)', zIndex: 9999, overflow: 'hidden', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#0d0d0d', color: '#fff' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            Call ended
          </span>
          <span style={{ fontSize: 11.5, opacity: 0.7 }}>{endedRating === 0 ? `Closing in ${endedCountdown}s` : 'Thanks!'}</span>
        </div>
        <div style={{ padding: '14px 16px' }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ended.name || ended.number || 'Call'}</p>
          <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#6b7280' }}>{ended.number} · {fmtDur(ended.seconds)}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <span style={{ fontSize: 12, color: '#6b7280', marginRight: 'auto' }}>How was the call?</span>
            <button type="button" aria-label="Good call" onClick={() => rateCall(1)}
              style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--border, #eee)', background: endedRating === 1 ? '#dcfce7' : '#fff', color: endedRating === 1 ? '#15803d' : '#6b7280', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88z"/></svg>
            </button>
            <button type="button" aria-label="Bad call" onClick={() => rateCall(-1)}
              style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--border, #eee)', background: endedRating === -1 ? '#fee2e2' : '#fff', color: endedRating === -1 ? '#b91c1c' : '#6b7280', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88z"/></svg>
            </button>
            <button type="button" aria-label="Dismiss" onClick={dismissEnded}
              style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--border, #eee)', background: '#fff', color: '#6b7280', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      </div>
    )}
    {/* Tiny phone-status indicator so it's visible whether the WebRTC client is
        actually connected to receive inbound calls (green = ready). Dismissable
        — hovering reveals a cross that hides it until the next page refresh. */}
    {!pillDismissed && (
      <div
        onMouseEnter={() => setPillHover(true)}
        onMouseLeave={() => setPillHover(false)}
        title={connErr ? `Phone: ${connErr}` : ready ? 'Phone ready to receive calls' : 'Phone connecting…'}
        style={{ position: 'fixed', bottom: 12, left: 12, zIndex: 40, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 9px', borderRadius: 20, background: '#fff', border: '1px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', fontSize: 11, fontWeight: 700, color: connErr ? '#dc2626' : ready ? '#15803d' : '#b45309' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: connErr ? '#dc2626' : ready ? '#22c55e' : '#f59e0b' }} />
        {connErr ? 'Phone error' : ready ? 'Phone ready' : 'Connecting…'}
        {/* Extends out from the pill on hover; click to dismiss. */}
        <button type="button"
          aria-label="Hide phone status"
          onClick={(e) => { e.stopPropagation(); setPillDismissed(true) }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            width: pillHover ? 15 : 0, height: 15, marginLeft: pillHover ? 1 : -6,
            padding: 0, border: 'none', borderRadius: '50%', cursor: 'pointer',
            background: '#f3f4f6', color: '#6b7280',
            opacity: pillHover ? 1 : 0, overflow: 'hidden',
            transition: 'width 0.18s ease, opacity 0.18s ease, margin-left 0.18s ease',
          }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    )}
  </>)

  return (<>
    {audioEl}
    <div ref={popupRef} style={{ position: 'fixed', width: 320, background: '#0d0d0d', color: '#fff', borderRadius: 18, boxShadow: '0 16px 48px rgba(0,0,0,0.4)', zIndex: 9999, overflow: 'hidden', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      ...(pos ? { left: pos.x, top: pos.y } : { top: 20, right: 20 }) }}>
      <div onPointerDown={onDragStart} style={{ padding: '20px 20px 16px', cursor: dragOffset.current ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none' }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: 1, opacity: 0.6, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
          {inCall
            ? (movedTo ? `Moving to ${movedTo}…` : `${incoming?.outbound ? 'Outbound' : 'In call'} · ${fmtDur(seconds)}`)
            : (incoming?.outbound ? 'Calling…' : 'Incoming call')}
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

        {/* Where this caller is known from. Labelled "Known from" — NOT "this
            call came via X": the number is shared, so the call itself has no
            provable source. This is the customer's origin + channels on record. */}
        {!caller?.loading && (() => {
          const src = prettySource(caller?.source)
          const chans = Array.from(new Set((caller?.channels || [])
            .map((c: string) => prettySource(c)).filter(Boolean))) as string[]
          const extraChans = chans.filter(c => c !== src).slice(0, 4)
          if (!src && !extraChans.length) return null
          return (
            <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.08)', fontSize: 12 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7 }}><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                <span style={{ opacity: 0.65 }}>Known from:</span>
                {src && <span style={{ fontWeight: 700 }}>{src}</span>}
                {extraChans.map(c => (
                  <span key={c} style={{ padding: '1px 7px', borderRadius: 20, background: 'rgba(255,255,255,0.12)', fontSize: 11 }}>{c}</span>
                ))}
              </span>
            </div>
          )
        })()}

        {/* Jump to this caller's conversation in the inbox. */}
        {!caller?.loading && (
          <button type="button" onClick={openInInbox}
            style={{ marginTop: 8, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>
            Open in inbox
          </button>
        )}
      </div>

      {/* Switch device: move this live call to another of my signed-in devices
          (web ⇄ phone) without dropping the customer. */}
      {inCall && provider === 'twilio' && !movedTo && transferState === 'none' && (
        <div style={{ margin: '0 20px 8px' }}>
          <button type="button" onClick={() => (switchOpen ? setSwitchOpen(false) : openSwitch())}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, border: 'none', background: switchOpen ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="2" y="4" width="14" height="9" rx="1"/><path d="M1 17h16"/><rect x="17" y="9" width="6" height="11" rx="1"/></svg>
            Switch device
          </button>
          {switchOpen && (
            <div style={{ marginTop: 6, borderRadius: 10, background: 'rgba(255,255,255,0.06)', padding: 6 }}>
              <p style={{ margin: '2px 8px 6px', fontSize: 10.5, fontWeight: 800, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Continue call on</p>
              {switchDevices.length === 0 ? (
                <p style={{ margin: 0, padding: '6px 8px 8px', fontSize: 12, opacity: 0.75, lineHeight: 1.4 }}>No other devices online. Open Colvy in another browser, or on your phone with the latest app version, then try again.</p>
              ) : switchDevices.map(d => (
                <button key={d.deviceId} type="button" disabled={switchBusy} onClick={() => moveCallTo(d.deviceId, d.deviceName)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px', borderRadius: 8, border: 'none', background: 'none', color: '#fff', cursor: switchBusy ? 'default' : 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>{d.platform === 'web' ? '💻' : '📱'}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.deviceName}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
      {/* In-call DTMF keypad — for IVR menus, extensions, "press 1", etc. */}
      {inCall && transferState === 'none' && (
        <div style={{ margin: '0 20px 8px' }}>
          <button type="button" onClick={() => setShowKeypad(v => !v)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, border: 'none', background: showKeypad ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="5" r="1.6"/><circle cx="12" cy="5" r="1.6"/><circle cx="19" cy="5" r="1.6"/><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/><circle cx="5" cy="19" r="1.6"/><circle cx="12" cy="19" r="1.6"/><circle cx="19" cy="19" r="1.6"/></svg>
            Keypad
          </button>
          {showKeypad && (
            <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(d => (
                <button key={d} type="button" onClick={() => sendDTMF(d)}
                  style={{ padding: '11px 0', borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 18, fontWeight: 700, cursor: 'pointer' }}>{d}</button>
              ))}
            </div>
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
            {/* Hold / transfer controls, only while actually on a call. Both
                providers run this through conferences (Telnyx / Twilio). */}
            <div style={{ display: 'flex', gap: 1, flex: 2 }}>
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
