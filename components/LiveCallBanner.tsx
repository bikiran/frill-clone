'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

// A live, cross-agent call indicator for the conversation thread.
//
// The after-the-fact CallCard only appears once a call has CONNECTED/ended, so
// while a call is ringing or in progress the thread showed nothing — you
// couldn't tell someone else (or a phone) had already picked it up. This reads
// the conversation's `calls` row and subscribes to realtime, so the moment a
// webhook stamps who answered (answered_by / status), every agent viewing the
// thread sees "On call · <name>" with a live timer. It renders nothing once the
// call ends (ended_at set) — the CallCard takes over from there.

type LiveCall = {
  id: string
  status: string | null
  direction: string | null
  from_number: string | null
  to_number: string | null
  caller_name: string | null
  contact_name: string | null
  agent_name: string | null
  answered_by: string | null
  answered_at: string | null
  ended_at: string | null
  is_voicemail: boolean | null
  created_at: string
}

const MAX_LIVE_MS = 2 * 60 * 60 * 1000 // ignore rows stuck "live" beyond 2h

const isLive = (c: LiveCall | null): boolean => {
  if (!c || c.ended_at || c.is_voicemail) return false
  if (Date.now() - new Date(c.created_at).getTime() > MAX_LIVE_MS) return false
  const st = String(c.status || '').toLowerCase()
  if (['completed', 'answered', 'missed', 'no-answer', 'no_answer', 'failed', 'busy', 'canceled', 'cancelled'].includes(st) && !c.answered_at) {
    // 'answered' with no answered_at is ambiguous; treat terminal-ish states as not live unless they're clearly ongoing.
    return st === 'answered'
  }
  return true
}

const onCall = (c: LiveCall): boolean => {
  const st = String(c.status || '').toLowerCase()
  return !!c.answered_at || ['answered', 'in_progress', 'in-progress'].includes(st)
}

export default function LiveCallBanner({ conversationId, accent = 'var(--coral)' }: { conversationId: string; accent?: string }) {
  const [call, setCall] = useState<LiveCall | null>(null)
  const [, setTick] = useState(0)
  const chRef = useRef<any>(null)

  const load = async (convId: string) => {
    const { data } = await (supabase as any).from('calls')
      .select('id, status, direction, from_number, to_number, caller_name, contact_name, agent_name, answered_by, answered_at, ended_at, is_voicemail, created_at')
      .eq('conversation_id', convId).is('ended_at', null)
      .order('created_at', { ascending: false }).limit(1)
    const c: LiveCall | null = data?.[0] || null
    setCall(isLive(c) ? c : null)
  }

  useEffect(() => {
    if (!conversationId) { setCall(null); return }
    load(conversationId)
    // Realtime: any change to a call on this conversation (answered on a phone,
    // by another agent, ended) refreshes the banner for everyone viewing it.
    const ch = (supabase as any).channel(`live-call-${conversationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter: `conversation_id=eq.${conversationId}` },
        () => load(conversationId))
      .subscribe()
    chRef.current = ch
    return () => { try { (supabase as any).removeChannel(ch) } catch {} }
  }, [conversationId])

  // Tick the live timer while a call is up.
  useEffect(() => {
    if (!call || !onCall(call)) return
    const iv = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(iv)
  }, [call])

  if (!call) return null

  const ongoing = onCall(call)
  const who = call.answered_by || call.agent_name || ''
  const secs = ongoing ? Math.max(0, Math.floor((Date.now() - new Date(call.answered_at || call.created_at).getTime()) / 1000)) : 0
  const timer = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
  const dot = ongoing ? '#22c55e' : '#f59e0b'
  const bg = ongoing ? 'color-mix(in srgb, #22c55e 12%, transparent)' : 'color-mix(in srgb, #f59e0b 14%, transparent)'
  const border = ongoing ? 'color-mix(in srgb, #22c55e 40%, transparent)' : 'color-mix(in srgb, #f59e0b 45%, transparent)'
  const fg = ongoing ? '#15803d' : '#b45309'

  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0 12px' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 20, background: bg, border: `1px solid ${border}`, color: fg, fontSize: 12.5, fontWeight: 700 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, animation: 'lcbpulse 1.3s ease-in-out infinite' }} />
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
        {ongoing
          ? <>On call{who ? <> · <span style={{ fontWeight: 800 }}>{who}</span></> : ''} <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.8 }}>· {timer}</span></>
          : <>Incoming call — ringing…</>}
      </span>
      <style>{`@keyframes lcbpulse{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>
    </div>
  )
}
