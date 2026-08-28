'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Colvy AI — floating command bar (web + mobile).
//
// A natural-language ACTION interface: the user types (or speaks) an
// instruction, the server turns it into one of our controlled tools, and we
// render a compact action card for whatever happened. Sensitive actions (send
// a message) come back as a confirmation the user must approve before anything
// leaves the building. This component is a thin client — all logic, tenancy and
// permissions live behind /api/ai/assistant.
// ─────────────────────────────────────────────────────────────────────────────

type Card = {
  kind: string
  title: string
  lines?: string[]
  href?: string
  undo?: { entityType: string; entityId: string } | null
}
type ConfirmPayload = { tool: string; args: any; preview: any }
type Msg =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text?: string; cards?: Card[]; confirm?: ConfirmPayload | null; error?: string; pending?: boolean }

type PageCtx = { conversationId?: string | null; contactId?: string | null; orderId?: string | null; callId?: string | null; outletId?: string | null }

// Suggested commands per area — a starting point, not a menu of the only things
// that work. Freeform typing is always the point.
function suggestionsFor(path: string): string[] {
  if (path.includes('/inbox')) return ['Reply to this customer', 'Create a task to follow up tomorrow', 'Call this customer']
  if (path.includes('/contacts')) return ['Find a contact', 'Call this contact', 'Book an appointment next Tuesday 10am']
  if (path.includes('/orders')) return ['Show pending orders', 'How did we do this week?', "What's out of stock?"]
  if (path.includes('/calendar')) return ['Book a delivery for Friday 9am', 'Remind me about it the night before']
  if (path.includes('/tasks')) return ['Create a high-priority task', 'Mark a task done', 'Reassign a task']
  if (path.includes('/calls')) return ['Summarise my last call', 'Create a task from this call', 'Remind me to call them back tomorrow']
  return ['How did we do this week?', 'Create a task', "What's out of stock?", 'Show pending orders']
}

const SUGGEST_LABEL: Record<string, string> = {
  task: 'View tasks', reminder: 'View reminders', calendar_event: 'Open calendar', message: 'Open conversation', order: 'Open orders',
}

export default function ColvyAssistant({ companyId, userId, agentName }: { companyId?: string | null; userId?: string | null; agentName?: string | null }) {
  const pathname = usePathname() || ''
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [listening, setListening] = useState(false)
  const [toast, setToast] = useState<{ text: string } | null>(null)

  // Latest page context, kept fresh by pages that publish `colvy:ai-context`.
  const pageCtxRef = useRef<PageCtx>({})
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const recogRef = useRef<any>(null)

  // Floating orb: draggable anywhere (position remembered across sessions), and
  // dismissable for the session via a close tab that slides out on hover.
  const ORB = 54
  const [orbPos, setOrbPos] = useState<{ x: number; y: number } | null>(null)
  const [orbHover, setOrbHover] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const dragRef = useRef<{ ox: number; oy: number; sx: number; sy: number; moved: boolean; x: number; y: number } | null>(null)

  useEffect(() => {
    try { const p = localStorage.getItem('colvy-ai-orb-pos'); if (p) setOrbPos(JSON.parse(p)) } catch {}
    try { if (sessionStorage.getItem('colvy-ai-dismissed') === '1') setDismissed(true) } catch {}
  }, [])
  // Keep the orb on-screen if the window is resized smaller.
  useEffect(() => {
    const onResize = () => setOrbPos(p => p ? { x: Math.min(p.x, window.innerWidth - ORB - 8), y: Math.min(p.y, window.innerHeight - ORB - 8) } : p)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  function onOrbPointerDown(e: React.PointerEvent) {
    const el = e.currentTarget as HTMLElement
    try { el.setPointerCapture(e.pointerId) } catch {}
    const r = el.getBoundingClientRect()
    dragRef.current = { ox: e.clientX - r.left, oy: e.clientY - r.top, sx: e.clientX, sy: e.clientY, moved: false, x: r.left, y: r.top }
  }
  function onOrbPointerMove(e: React.PointerEvent) {
    const d = dragRef.current; if (!d) return
    if (Math.abs(e.clientX - d.sx) > 4 || Math.abs(e.clientY - d.sy) > 4) d.moved = true
    if (!d.moved) return
    d.x = Math.min(Math.max(8, e.clientX - d.ox), window.innerWidth - ORB - 8)
    d.y = Math.min(Math.max(8, e.clientY - d.oy), window.innerHeight - ORB - 8)
    setOrbPos({ x: d.x, y: d.y })
  }
  function onOrbPointerUp() {
    const d = dragRef.current; dragRef.current = null
    if (!d) return
    if (d.moved) { try { localStorage.setItem('colvy-ai-orb-pos', JSON.stringify({ x: d.x, y: d.y })) } catch {} }
    else setOpen(true)   // a tap (not a drag) opens the panel
  }
  function dismissOrb(e: React.MouseEvent) {
    e.stopPropagation()
    setDismissed(true)
    try { sessionStorage.setItem('colvy-ai-dismissed', '1') } catch {}
  }

  // Reset page context on navigation; pages re-publish what's open.
  useEffect(() => { pageCtxRef.current = {} }, [pathname])

  useEffect(() => {
    const onCtx = (e: any) => { pageCtxRef.current = { ...pageCtxRef.current, ...(e?.detail || {}) } }
    window.addEventListener('colvy:ai-context', onCtx as any)
    // Let other UI open the assistant (e.g. a header button) and optionally seed it.
    const onOpen = (e: any) => { setOpen(true); setDismissed(false); try { sessionStorage.removeItem('colvy-ai-dismissed') } catch {}; const q = e?.detail?.prompt; if (q) setInput(String(q)) }
    window.addEventListener('colvy:ai-open', onOpen as any)
    return () => { window.removeEventListener('colvy:ai-context', onCtx as any); window.removeEventListener('colvy:ai-open', onOpen as any) }
  }, [])

  useEffect(() => { if (open) setTimeout(() => scrollRef.current?.scrollTo({ top: 9e9, behavior: 'smooth' }), 60) }, [msgs, open])

  const suggestions = useMemo(() => suggestionsFor(pathname), [pathname])

  const buildContext = () => ({
    currentRoute: pathname,
    ...pageCtxRef.current,
  })

  async function authHeaders(): Promise<Record<string, string>> {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
    } catch { return {} }
  }

  // The plain-text history the server replays (no cards / tool traffic).
  function historyPayload(): { role: 'user' | 'assistant'; text: string }[] {
    const out: { role: 'user' | 'assistant'; text: string }[] = []
    for (const m of msgs) {
      if (m.role === 'user') out.push({ role: 'user', text: m.text })
      else if (m.text) out.push({ role: 'assistant', text: m.text })
    }
    return out.slice(-12)
  }

  async function send(text: string) {
    const message = text.trim()
    if (!message || busy || !companyId) return
    setInput('')
    const history = historyPayload()
    setMsgs(m => [...m, { role: 'user', text: message }, { role: 'assistant', pending: true }])
    setBusy(true)
    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ message, history, context: buildContext(), companyId }),
      })
      const data = await res.json().catch(() => ({}))
      setMsgs(m => {
        const copy = m.slice()
        const idx = copy.map(x => x.role === 'assistant' && (x as any).pending).lastIndexOf(true)
        const reply: Msg = res.ok
          ? { role: 'assistant', text: data.text, cards: data.cards || [], confirm: data.confirm || null }
          : { role: 'assistant', error: data?.error || 'Something went wrong.' }
        if (idx >= 0) copy[idx] = reply; else copy.push(reply)
        return copy
      })
      if (res.ok) runClientActions(data.clientActions)
    } catch (e: any) {
      setMsgs(m => {
        const copy = m.slice()
        const idx = copy.map(x => x.role === 'assistant' && (x as any).pending).lastIndexOf(true)
        const reply: Msg = { role: 'assistant', error: e?.message || 'Network error.' }
        if (idx >= 0) copy[idx] = reply; else copy.push(reply)
        return copy
      })
    } finally { setBusy(false) }
  }

  async function confirmSend(confirm: ConfirmPayload, msgIdx: number) {
    if (busy || !companyId) return
    setBusy(true)
    try {
      const res = await fetch('/api/ai/assistant/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ tool: confirm.tool, args: confirm.args, context: buildContext(), companyId }),
      })
      const data = await res.json().catch(() => ({}))
      setMsgs(m => {
        const copy = m.slice()
        const target = copy[msgIdx]
        if (target && target.role === 'assistant') {
          const next: Msg = res.ok
            ? { role: 'assistant', text: 'Done.', cards: data.card ? [data.card] : [], confirm: null }
            : { role: 'assistant', error: data?.error || 'Could not complete that.', confirm: null }
          copy[msgIdx] = next
        }
        return copy
      })
    } catch (e: any) {
      setMsgs(m => { const copy = m.slice(); const t = copy[msgIdx]; if (t && t.role === 'assistant') copy[msgIdx] = { role: 'assistant', error: e?.message || 'Network error.', confirm: null }; return copy })
    } finally { setBusy(false) }
  }

  // Run directives the server returned for the browser — currently just placing
  // an outbound call through the app's softphone (the GlobalDialer listens for
  // `colvy:dial`). The server can't open a WebRTC call; the browser does.
  function runClientActions(actions?: any[]) {
    if (!Array.isArray(actions)) return
    for (const a of actions) {
      if (a?.type === 'dial' && a?.number) {
        try { window.dispatchEvent(new CustomEvent('colvy:dial', { detail: { number: a.number, name: a.name, contactId: a.contactId, autoStart: true } })) } catch {}
      }
    }
  }

  function cancelConfirm(msgIdx: number) {
    setMsgs(m => { const copy = m.slice(); const t = copy[msgIdx]; if (t && t.role === 'assistant') copy[msgIdx] = { role: 'assistant', text: 'Okay, I won\'t send it.', confirm: null }; return copy })
  }

  // Undo a reversible action by removing the row we just created. RLS is
  // permissive, so the client can do this directly and immediately.
  async function undo(card: Card) {
    if (!card.undo) return
    const { entityType, entityId, restore } = card.undo as any
    const table = entityType === 'calendar_event' ? 'calendar_events' : 'conversation_tasks'
    try {
      // An edit (task_update) is undone by restoring the prior values; a created
      // row is undone by deleting it.
      if (restore) await (supabase as any).from(table).update(restore).eq('id', entityId)
      else await (supabase as any).from(table).delete().eq('id', entityId)
      setToast({ text: 'Undone' })
      setMsgs(m => m.map(msg => msg.role === 'assistant' && msg.cards
        ? { ...msg, cards: msg.cards.map(c => c === card ? { ...c, kind: '__undone', title: 'Removed', lines: [], undo: null } : c) }
        : msg))
    } catch { setToast({ text: "Couldn't undo that" }) }
    setTimeout(() => setToast(null), 2500)
  }

  function toggleMic() {
    const SR = (typeof window !== 'undefined') && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    if (!SR) { setToast({ text: 'Voice input isn\'t supported on this browser' }); setTimeout(() => setToast(null), 2500); return }
    if (listening) { try { recogRef.current?.stop() } catch {}; return }
    try {
      const r = new SR()
      r.lang = 'en-AU'; r.interimResults = true; r.continuous = false
      let finalText = ''
      r.onresult = (ev: any) => {
        let interim = ''
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const t = ev.results[i][0].transcript
          if (ev.results[i].isFinal) finalText += t; else interim += t
        }
        setInput((finalText + interim).trim())
      }
      r.onerror = () => { setListening(false) }
      r.onend = () => {
        setListening(false)
        // Voice feeds the SAME command endpoint as typing.
        const t = (finalText || '').trim()
        if (t) send(t)
      }
      recogRef.current = r
      setListening(true)
      r.start()
    } catch { setListening(false) }
  }

  if (!companyId) return null

  const CORAL = 'var(--coral)'

  return (
    <>
      {/* Launcher orb — draggable anywhere; a hover tab dismisses it for the
          session. Above the mobile nav bar and other floats. */}
      {!open && !dismissed && (
        <div
          className="colvy-ai-orb-wrap"
          onMouseEnter={() => setOrbHover(true)}
          onMouseLeave={() => setOrbHover(false)}
          style={{
            position: 'fixed', zIndex: 930, width: ORB, height: ORB, touchAction: 'none',
            ...(orbPos
              ? { left: orbPos.x, top: orbPos.y }
              : { right: 18, bottom: 'calc(58px + env(safe-area-inset-bottom, 0px) + 16px)' }),
          }}
        >
          {/* Dismiss-for-session tab — slides out on hover. */}
          <button
            type="button"
            onClick={dismissOrb}
            aria-label="Hide Colvy AI for now"
            title="Hide for now"
            style={{
              position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%',
              border: '1.5px solid var(--card, #fff)', background: '#111827', color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, zIndex: 2,
              opacity: orbHover ? 1 : 0, transform: orbHover ? 'scale(1)' : 'scale(0.6)',
              transition: 'opacity .14s ease, transform .14s ease', pointerEvents: orbHover ? 'auto' : 'none',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
          <button
            type="button"
            onPointerDown={onOrbPointerDown}
            onPointerMove={onOrbPointerMove}
            onPointerUp={onOrbPointerUp}
            aria-label="Open Colvy AI (drag to move)"
            className="colvy-ai-orb"
            style={{
              width: ORB, height: ORB, borderRadius: '50%', border: 'none', cursor: 'grab',
              background: `linear-gradient(135deg, ${CORAL}, #ff9d72)`,
              boxShadow: '0 10px 28px rgba(255,122,107,0.45)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none',
            }}
          >
            <SparkIcon />
          </button>
        </div>
      )}

      {open && (
        <>
          {/* Scrim (mobile mainly) */}
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(2px)', zIndex: 935 }} />
          <div
            className="colvy-ai-panel"
            style={{
              position: 'fixed', right: 0, bottom: 0, zIndex: 940,
              width: 'min(420px, 100vw)', maxHeight: '82vh',
              display: 'flex', flexDirection: 'column',
              background: 'var(--card)', color: 'var(--ink)',
              borderTopLeftRadius: 18, borderTopRightRadius: 18,
              boxShadow: '0 -12px 48px rgba(0,0,0,0.22)', overflow: 'hidden',
              marginRight: 'max(0px, env(safe-area-inset-right, 0px))',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ width: 30, height: 30, borderRadius: '50%', background: `linear-gradient(135deg, ${CORAL}, #ff9d72)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                <SparkIcon size={16} />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.1 }}>Colvy AI</p>
                <p style={{ fontSize: 11, color: 'var(--slate)' }}>Ask me to do things</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--slate)', padding: 6, display: 'flex' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            {/* Conversation */}
            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 6px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {msgs.length === 0 && (
                <div style={{ padding: '6px 2px 2px' }}>
                  <p style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 10, lineHeight: 1.5 }}>
                    Hi {agentName || 'there'} — tell me what you need. I can pull sales figures, check stock, look up contacts, orders and calls, create and update tasks, book events, place a call, update or refund an order, and draft a message to a customer (I'll ask before anything is sent, changed or refunded).
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {suggestions.map(s => (
                      <button key={s} type="button" onClick={() => send(s)}
                        style={{ fontSize: 12.5, padding: '7px 11px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', cursor: 'pointer' }}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {msgs.map((m, i) => (
                <div key={i}>
                  {m.role === 'user' ? (
                    <div style={{ alignSelf: 'flex-end', marginLeft: 'auto', maxWidth: '85%', background: 'var(--peach)', color: 'var(--ink)', padding: '8px 12px', borderRadius: 14, borderBottomRightRadius: 4, fontSize: 13.5, lineHeight: 1.45, width: 'fit-content' }}>
                      {m.text}
                    </div>
                  ) : (
                    <div style={{ maxWidth: '92%' }}>
                      {(m as any).pending ? (
                        <TypingDots />
                      ) : (
                        <>
                          {m.text && <p style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.5, marginBottom: (m.cards?.length || m.confirm) ? 8 : 0 }}>{m.text}</p>}
                          {m.error && <p style={{ fontSize: 13, color: '#b91c1c', lineHeight: 1.5 }}>{m.error}</p>}

                          {m.cards?.map((c, ci) => <ActionCard key={ci} card={c} onUndo={() => undo(c)} />)}

                          {m.confirm && (
                            <ConfirmCard
                              confirm={m.confirm}
                              busy={busy}
                              onCancel={() => cancelConfirm(i)}
                              onSend={() => confirmSend(m.confirm!, i)}
                            />
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Composer */}
            <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px calc(10px + env(safe-area-inset-bottom, 0px))', background: 'var(--card)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14, padding: '6px 6px 6px 12px' }}>
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
                  placeholder="Ask Colvy…"
                  rows={1}
                  style={{ flex: 1, resize: 'none', border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--ink)', maxHeight: 96, lineHeight: 1.4, padding: '5px 0' }}
                />
                <button type="button" onClick={toggleMic} aria-label={listening ? 'Stop' : 'Voice'}
                  title="Voice"
                  style={{ border: 'none', background: listening ? CORAL : 'transparent', color: listening ? '#fff' : 'var(--slate)', cursor: 'pointer', width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <MicIcon />
                </button>
                <button type="button" onClick={() => send(input)} disabled={busy || !input.trim()} aria-label="Send"
                  style={{ border: 'none', background: input.trim() && !busy ? CORAL : 'var(--border)', color: '#fff', cursor: input.trim() && !busy ? 'pointer' : 'default', width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))', left: '50%', transform: 'translateX(-50%)', zIndex: 950, padding: '9px 14px', borderRadius: 10, background: '#111827', color: '#fff', fontSize: 13, fontWeight: 500, boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}>
          {toast.text}
        </div>
      )}

      <style>{`
        .colvy-ai-orb:hover { filter: brightness(1.04); transform: translateY(-1px); }
        .colvy-ai-orb { transition: transform .15s ease, filter .15s ease; }
        @media (min-width: 861px) {
          .colvy-ai-panel { right: 18px !important; bottom: 18px !important; border-radius: 18px !important; }
        }
      `}</style>
    </>
  )
}

function ActionCard({ card, onUndo }: { card: Card; onUndo: () => void }) {
  if (card.kind === '__undone') {
    return <div style={{ border: '1px dashed var(--border)', borderRadius: 12, padding: '10px 12px', fontSize: 12.5, color: 'var(--slate)', marginBottom: 8 }}>Removed</div>
  }
  const icon = card.kind === 'calendar_event' ? '📅' : card.kind === 'reminder' ? '⏰' : card.kind === 'message' ? '💬' : card.kind === 'order' ? '🛒' : card.kind === 'call' ? '📞' : '✅'
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '11px 12px', marginBottom: 8, background: 'var(--white)' }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <span style={{ fontSize: 17, lineHeight: 1.2 }}>{icon}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.35 }}>{card.title}</p>
          {(card.lines || []).filter(Boolean).map((l, i) => (
            <p key={i} style={{ fontSize: 12, color: 'var(--slate)', lineHeight: 1.4 }}>{l}</p>
          ))}
          <div style={{ display: 'flex', gap: 14, marginTop: 7 }}>
            {card.href && <a href={card.href} style={{ fontSize: 12, fontWeight: 600, color: 'var(--coral)', textDecoration: 'none' }}>{SUGGEST_LABEL[card.kind] || 'Open'}</a>}
            {card.undo && <button type="button" onClick={onUndo} style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Undo</button>}
          </div>
        </div>
      </div>
    </div>
  )
}

function ConfirmCard({ confirm, busy, onCancel, onSend }: { confirm: ConfirmPayload; busy: boolean; onCancel: () => void; onSend: () => void }) {
  const p = confirm.preview || {}
  const isRefund = p.kind === 'refund_order'
  const isOrder = p.kind === 'order_status' || isRefund
  const heading = isRefund ? 'Confirm refund' : isOrder ? 'Confirm order change' : 'Confirm send'
  const cta = isRefund ? 'Refund' : isOrder ? 'Confirm' : 'Send'
  return (
    <div style={{ border: '1px solid var(--coral)', borderRadius: 12, padding: '12px', background: 'var(--peach)' }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--coral)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>{heading}</p>

      {isOrder ? (
        <>
          <p style={{ fontSize: 13, color: 'var(--ink)', marginBottom: 2 }}><strong>{p.orderLabel}</strong>{p.to ? ` · ${p.to}` : ''}</p>
          {isRefund
            ? <p style={{ fontSize: 13, color: 'var(--ink)', marginBottom: 2 }}>Refund <strong>{p.amount}</strong></p>
            : <p style={{ fontSize: 13, color: 'var(--ink)', marginBottom: 2 }}>{p.action} <span style={{ color: 'var(--slate)' }}>(now {p.current})</span></p>}
          {p.warn && <p style={{ fontSize: 12, color: '#b91c1c', margin: '6px 0 10px' }}>{p.warn}</p>}
          {!p.warn && <div style={{ height: 6 }} />}
        </>
      ) : (
        <>
          <p style={{ fontSize: 12.5, color: 'var(--ink)', marginBottom: 2 }}><strong>To:</strong> {p.to || 'customer'} {p.via ? `· ${p.via}` : ''}</p>
          <p style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.45, background: 'var(--white)', borderRadius: 8, padding: '8px 10px', margin: '6px 0 10px' }}>{p.text}</p>
        </>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onSend} disabled={busy}
          style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
          {busy ? 'Working…' : cta}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}
          style={{ padding: '9px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '6px 2px' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--slate)', opacity: 0.5, animation: `colvyBlink 1.2s ${i * 0.15}s infinite ease-in-out` }} />
      ))}
      <style>{`@keyframes colvyBlink { 0%,80%,100%{opacity:.25;transform:translateY(0)} 40%{opacity:.9;transform:translateY(-2px)} }`}</style>
    </div>
  )
}

function SparkIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
      <path d="M19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  )
}
