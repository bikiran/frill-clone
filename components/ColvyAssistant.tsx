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
  // report / list cards
  stats?: { label: string; value: string }[]
  lists?: { heading: string; rows: { label: string; value: string }[] }[]
  rows?: { label: string; sub?: string }[]
}
type ConfirmPayload = { tool: string; args: any; preview: any }
type Msg =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text?: string; cards?: Card[]; confirm?: ConfirmPayload | null; error?: string; pending?: boolean }

// Colvy AI's own brand colour, the same on every workspace (the workspace
// accent can be anything, and the AI should always look like the AI).
const GRAD = 'linear-gradient(135deg, #ff7a6b, #ff9d72)'
const AI_CORAL = '#e2553f'
const HISTORY_MAX = 80

type PageCtx = { conversationId?: string | null; contactId?: string | null; orderId?: string | null; callId?: string | null; outletId?: string | null }

// Suggested commands per area — a starting point, not a menu of the only things
// that work. Freeform typing is always the point.
function suggestionsFor(path: string): string[] {
  if (path.includes('/inbox')) return ['Reply to this customer', 'Send them a payment link for $20', 'Ask them for photos', 'Follow-up task for tomorrow']
  if (path.includes('/tickets')) return ['Reply to this ticket', 'Summarise this ticket', 'Assign it to me']
  if (path.includes('/reviews')) return ['Reply to my latest Google review', 'Show reviews with no reply']
  if (path.includes('/contacts')) return ['Call this contact', 'Send them a booking link', 'Book an appointment next Tuesday 10am']
  if (path.includes('/orders')) return ['Show pending orders', 'Show orders with no outlet', 'How did we do this week?', "What's out of stock?"]
  if (path.includes('/calendar')) return ['Book a delivery for Friday 9am', 'Remind me about it the night before']
  if (path.includes('/tasks')) return ['Create a high-priority task', 'Mark a task done', 'Reassign a task']
  if (path.includes('/calls')) return ['Summarise my last call', 'Create a task from this call', 'Remind me to call them back tomorrow']
  return ['How did we do this week?', 'Reply to my latest Google review', 'Send a payment link to a customer', "What's out of stock?"]
}

const SUGGEST_LABEL: Record<string, string> = {
  task: 'View tasks', reminder: 'View reminders', calendar_event: 'Open calendar', message: 'Open conversation', order: 'Open orders',
  payment_link: 'Open conversation', media_request: 'Open conversation', review_reply: 'Open reviews', comment_reply: 'Open comments',
  ticket_reply: 'Open ticket', booking_link: 'Open conversation', fact: 'Open AI knowledge', idea: 'Open roadmap',
  form: 'Edit form', poll: 'Open poll', survey: 'Open survey',
}

export default function ColvyAssistant({ companyId, userId, agentName }: { companyId?: string | null; userId?: string | null; agentName?: string | null }) {
  const pathname = usePathname() || ''
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [listening, setListening] = useState(false)
  const [toast, setToast] = useState<{ text: string } | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  // History survives closing the panel, reloading and navigating — per user and
  // workspace, on this device. Unsent confirmations come back as "not sent", so
  // an old preview can never be fired off by accident later.
  const historyKey = companyId ? `colvy-ai-history:${companyId}:${userId || 'me'}` : ''
  const loadedRef = useRef(false)
  useEffect(() => {
    if (!historyKey || loadedRef.current) return
    loadedRef.current = true
    try {
      const raw = localStorage.getItem(historyKey)
      if (!raw) return
      const saved: Msg[] = JSON.parse(raw)
      setMsgs(saved.filter(m => !(m as any).pending).map(m => m.role === 'assistant' && m.confirm
        ? { ...m, confirm: null, text: [m.text, 'Not sent.'].filter(Boolean).join(' ') }
        : m))
    } catch {}
  }, [historyKey])
  useEffect(() => {
    if (!historyKey || !loadedRef.current) return
    try { localStorage.setItem(historyKey, JSON.stringify(msgs.filter(m => !(m as any).pending).slice(-HISTORY_MAX))) } catch {}
  }, [msgs, historyKey])
  const newChat = () => { setMsgs([]); setInput(''); try { if (historyKey) localStorage.removeItem(historyKey) } catch {} }
  // Grow the input with the text (up to a few lines).
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 132) + 'px'
  }, [input, open])
  useEffect(() => {
    if (!open) return
    setTimeout(() => inputRef.current?.focus(), 220)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

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
  // Touch devices have no hover, so the hover-to-reveal close tab was
  // unreachable there — keep it visible on coarse-pointer / no-hover devices.
  const [isTouch, setIsTouch] = useState(false)
  const dragRef = useRef<{ ox: number; oy: number; sx: number; sy: number; moved: boolean; x: number; y: number } | null>(null)

  useEffect(() => {
    try { const p = localStorage.getItem('colvy-ai-orb-pos'); if (p) setOrbPos(JSON.parse(p)) } catch {}
    try { if (sessionStorage.getItem('colvy-ai-dismissed') === '1') setDismissed(true) } catch {}
    try { setIsTouch(window.matchMedia('(hover: none), (pointer: coarse)').matches) } catch {}
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
    // 10px, not 4 — a finger tap wobbles a few px, which the old threshold read
    // as a drag, so the orb never opened on mobile (it just nudged and saved).
    if (Math.abs(e.clientX - d.sx) > 10 || Math.abs(e.clientY - d.sy) > 10) d.moved = true
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

  async function confirmSend(confirm: ConfirmPayload, msgIdx: number, editedText?: string) {
    if (busy || !companyId) return
    setBusy(true)
    try {
      const res = await fetch('/api/ai/assistant/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ tool: confirm.tool, args: editedText != null && confirm.args && 'text' in confirm.args ? { ...confirm.args, text: editedText } : confirm.args, context: buildContext(), companyId }),
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
    const { entityType, entityId, restore, rows } = card.undo as any
    const table = entityType === 'calendar_event' ? 'calendar_events' : entityType === 'sale' ? 'conversation_sales' : entityType === 'order_outlet' ? 'orders'
      : entityType === 'form' ? 'forms' : entityType === 'poll' ? 'polls' : entityType === 'survey' ? 'surveys' : 'conversation_tasks'
    try {
      // An edit (task_update, order_outlet) is undone by restoring the prior
      // values; a created row is undone by deleting it.
      if (Array.isArray(rows)) {
        for (const r of rows) {
          const { error } = await (supabase as any).from(table).update(r.restore).eq('id', r.id)
          if (error) throw error
        }
        if (entityType === 'order_outlet') {
          try { await (supabase as any).from('order_events').insert(rows.map((r: any) => ({ order_id: r.id, company_id: companyId, type: 'outlet', detail: 'Outlet change undone' }))) } catch {}
        }
      }
      else if (restore) await (supabase as any).from(table).update(restore).eq('id', entityId)
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

  return (
    <>
      {/* Launcher orb — draggable anywhere; a hover tab dismisses it for the
          session. Above the mobile nav bar and other floats. */}
      {!open && !dismissed && (
        <div
          className="colvy-ai-orb-wrap"
          data-default-pos={orbPos ? undefined : ''}
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
              position: 'absolute', top: -6, right: -6, width: isTouch ? 24 : 20, height: isTouch ? 24 : 20, borderRadius: '50%',
              border: '1.5px solid #fff', background: '#111827', color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, zIndex: 2,
              opacity: (orbHover || isTouch) ? 1 : 0, transform: (orbHover || isTouch) ? 'scale(1)' : 'scale(0.6)',
              transition: 'opacity .14s ease, transform .14s ease', pointerEvents: (orbHover || isTouch) ? 'auto' : 'none',
              boxShadow: isTouch ? '0 2px 6px rgba(0,0,0,0.3)' : 'none',
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
              background: GRAD, boxShadow: '0 12px 28px -6px rgba(255,122,107,0.6)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none',
            }}
          >
            <SparkIcon />
          </button>
        </div>
      )}

      <div className={`cai ${open ? 'cai-open' : ''}`} aria-hidden={!open}>
        <div className="cai-scrim" onClick={() => setOpen(false)} />
        <div className="cai-panel" role="dialog" aria-label="Colvy AI">
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 14px 12px 16px', borderBottom: '1px solid #f1f1f3' }}>
            <Orb size={30} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: '#0d0d0d', lineHeight: 1.15 }}>Colvy AI</p>
              <p style={{ margin: 0, fontSize: 12, color: '#8b8b94' }}>Ask me to do things</p>
            </div>
            {msgs.length > 0 && (
              <button type="button" className="cai-icon-btn" onClick={newChat} disabled={busy} aria-label="New chat" title="New chat">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              </button>
            )}
            <button type="button" className="cai-icon-btn" onClick={() => setOpen(false)} aria-label="Close Colvy AI">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>

          {/* Conversation */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '18px 16px 8px', overscrollBehavior: 'contain' }}>
            {msgs.length === 0 && (
              <div className="cai-msg" style={{ textAlign: 'center', padding: '24px 4px 8px' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}><Orb size={52} /></div>
                <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#0d0d0d', letterSpacing: '-.01em' }}>Hi {agentName || 'there'}, what can I do?</h3>
                <p style={{ margin: '8px auto 0', maxWidth: 320, fontSize: 13.5, lineHeight: 1.55, color: '#6b7280' }}>
                  Tell me in plain words. I&rsquo;ll get it done, and show you anything that goes to a customer before it&rsquo;s sent.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 20 }}>
                  {suggestions.map(sug => <button key={sug} type="button" className="cai-chip" onClick={() => send(sug)}>{sug}</button>)}
                </div>
              </div>
            )}

            {msgs.map((m, i) => m.role === 'user' ? (
              <div key={i} className="cai-msg" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                <div style={{ maxWidth: '84%', background: '#f4f4f5', color: '#0d0d0d', padding: '10px 14px', borderRadius: '18px 18px 6px 18px', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>
              </div>
            ) : (
              <div key={i} className="cai-msg" style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <Orb size={26} />
                <div style={{ flex: 1, minWidth: 0, paddingTop: 3 }}>
                  {(m as any).pending ? <TypingDots /> : (
                    <>
                      {m.text && <div style={{ marginBottom: (m.cards?.length || m.confirm) ? 10 : 0 }}><RichText text={m.text} /></div>}
                      {m.error && <p style={{ margin: 0, fontSize: 14, color: '#b42318', lineHeight: 1.55 }}>{m.error}</p>}
                      {m.cards?.map((c, ci) => <ActionCard key={ci} card={c} onUndo={() => undo(c)} />)}
                      {m.confirm && (
                        <ConfirmCard
                          confirm={m.confirm}
                          busy={busy}
                          onCancel={() => cancelConfirm(i)}
                          onSend={(edited) => confirmSend(m.confirm!, i, edited)}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Composer */}
          <div style={{ padding: '8px 12px calc(12px + env(safe-area-inset-bottom, 0px))' }}>
            {msgs.length > 0 && !busy && (
              <div className="cai-chips" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'none' }}>
                {suggestions.slice(0, 3).map(sug => <button key={sug} type="button" className="cai-chip" style={{ padding: '6px 11px', fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => send(sug)}>{sug}</button>)}
              </div>
            )}
            <div className="cai-box" style={{ display: 'flex', alignItems: 'flex-end', gap: 6, padding: '7px 7px 7px 14px' }}>
              <textarea
                ref={inputRef}
                className="cai-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !(e.nativeEvent as any).isComposing) { e.preventDefault(); send(input) } }}
                placeholder={listening ? 'Listening…' : 'Ask Colvy AI to do something…'}
                aria-label="Message Colvy AI"
                rows={1}
                style={{ flex: 1, resize: 'none', fontFamily: 'inherit', fontSize: 14.5, color: '#0d0d0d', maxHeight: 132, lineHeight: 1.45, padding: '6px 0' }}
              />
              <button type="button" onClick={toggleMic} aria-label={listening ? 'Stop listening' : 'Speak'} title="Voice"
                className="cai-icon-btn" style={{ width: 34, height: 34, borderRadius: '50%', background: listening ? GRAD : 'transparent', color: listening ? '#fff' : '#71717a', flexShrink: 0 }}>
                <MicIcon />
              </button>
              <button type="button" onClick={() => send(input)} disabled={busy || !input.trim()} aria-label="Send"
                style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', flexShrink: 0, cursor: input.trim() && !busy ? 'pointer' : 'default', background: input.trim() && !busy ? GRAD : '#ececef', color: input.trim() && !busy ? '#fff' : '#a1a1aa', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .2s ease' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className="cai-toast" role="status">{toast.text}</div>
      )}

      <style>{`
        .colvy-ai-orb:hover { filter: brightness(1.04); transform: translateY(-1px); }
        .colvy-ai-orb { transition: transform .15s ease, filter .15s ease; }
        /* Phones: in an open inbox thread the orb's default spot sits on the
           Send button — lift it above the reply box (unless they've dragged it). */
        @media (max-width: 860px) {
          body:has(.inbox-composer .cmp-card) .colvy-ai-orb-wrap[data-default-pos] { bottom: calc(58px + env(safe-area-inset-bottom, 0px) + 250px) !important; }
          /* …and steps aside while an auto-reply countdown card needs its buttons. */
          .colvy-ai-orb-wrap { transition: opacity .2s ease, transform .2s ease; }
          body:has(.ailr-card) .colvy-ai-orb-wrap { opacity: 0; transform: scale(.85); pointer-events: none; }
        }
        .cai-scrim{position:fixed;inset:0;z-index:935;background:rgba(15,23,42,.28);opacity:0;pointer-events:none;transition:opacity .24s ease}
        .cai-panel{position:fixed;z-index:940;right:18px;bottom:18px;width:min(420px,calc(100vw - 36px));height:min(680px,calc(100dvh - 96px));
          background:#fff;border:1px solid #ececef;border-radius:22px;box-shadow:0 30px 70px -20px rgba(16,24,40,.35);display:flex;flex-direction:column;overflow:hidden;
          opacity:0;transform:translate3d(0,14px,0) scale(.985);transform-origin:bottom right;pointer-events:none;
          transition:opacity .24s cubic-bezier(.22,1,.36,1),transform .3s cubic-bezier(.22,1,.36,1)}
        .cai-open .cai-panel{opacity:1;transform:none;pointer-events:auto}
        .cai-open .cai-scrim{opacity:1;pointer-events:auto}
        @media (min-width:861px){.cai-scrim{background:transparent}}
        @media (max-width:640px){
          .cai-panel{left:0;right:0;bottom:0;width:100%;height:calc(100dvh - 40px);border-radius:22px 22px 0 0;transform:translate3d(0,40px,0)}
        }
        body:has(.cai-open) button[title="Send feedback"]{display:none!important}
        .cai-msg{animation:caiIn .32s cubic-bezier(.22,1,.36,1) both}
        @keyframes caiIn{from{opacity:0;transform:translate3d(0,8px,0)}to{opacity:1;transform:none}}
        .cai-chip{border:1px solid #ececef;background:#fff;border-radius:999px;padding:8px 13px;font-size:13px;font-weight:600;color:#3f3f46;cursor:pointer;font-family:inherit;transition:border-color .15s ease,background .15s ease,transform .15s ease}
        .cai-chip:hover{border-color:#ffc9bf;background:#fff7f5;transform:translateY(-1px)}
        .cai-chips{mask-image:linear-gradient(90deg,#000 85%,transparent);-webkit-mask-image:linear-gradient(90deg,#000 85%,transparent)}
        .cai-box{border:1px solid #e4e4e7;border-radius:18px;background:#fff;transition:border-color .15s ease,box-shadow .15s ease}
        .cai-box:focus-within{border-color:#ffb4a6;box-shadow:0 0 0 4px rgba(255,122,107,.12)}
        .cai-input{border:none!important;outline:none!important;box-shadow:none!important;background:transparent!important;border-radius:0!important;min-height:0!important}
        .cai-icon-btn{width:32px;height:32px;border-radius:10px;border:none;background:transparent;color:#6b7280;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s ease,color .15s ease}
        .cai-icon-btn:hover{background:#f4f4f5;color:#111827}
        .cai-card{border:1px solid #ececef;border-radius:14px;background:#fff;margin-bottom:8px;overflow:hidden}
        .cai-toast{position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:950;padding:10px 16px;border-radius:12px;background:#111827;color:#fff;font-size:13px;font-weight:600;box-shadow:0 12px 30px -10px rgba(0,0,0,.4)}
        @keyframes caiDot{0%,80%,100%{transform:translateY(0);opacity:.5}40%{transform:translateY(-4px);opacity:1}}
        @media (prefers-reduced-motion:reduce){.cai-panel,.cai-scrim{transition:none}.cai-msg{animation:none}}
      `}</style>
    </>
  )
}

const CARD_ICON: Record<string, string> = {
  calendar_event: 'calendar', reminder: 'clock', message: 'chat', order: 'cart', call: 'phone', task: 'check',
  payment_link: 'card', media_request: 'camera', review_reply: 'star', comment_reply: 'chat', ticket_reply: 'ticket',
  booking_link: 'calendar', fact: 'book', idea: 'bulb', form: 'form', poll: 'poll', survey: 'poll',
}

function CardIcon({ name, size = 16 }: { name: string; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  switch (name) {
    case 'calendar': return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
    case 'clock': return <svg {...p}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>
    case 'chat': return <svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
    case 'cart': return <svg {...p}><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
    case 'phone': return <svg {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
    case 'card': return <svg {...p}><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>
    case 'camera': return <svg {...p}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
    case 'star': return <svg {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
    case 'ticket': return <svg {...p}><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z" /></svg>
    case 'book': return <svg {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
    case 'bulb': return <svg {...p}><path d="M9 18h6" /><path d="M10 22h4" /><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" /></svg>
    case 'form': return <svg {...p}><rect x="5" y="3" width="14" height="18" rx="2" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="13" y2="16" /></svg>
    case 'poll': return <svg {...p}><line x1="6" y1="20" x2="6" y2="13" /><line x1="12" y1="20" x2="12" y2="5" /><line x1="18" y1="20" x2="18" y2="10" /></svg>
    default: return <svg {...p} strokeWidth={2.6}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
  }
}

const Orb = ({ size = 28 }: { size?: number }) => (
  <span style={{ width: size, height: size, borderRadius: '50%', background: GRAD, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 6px 16px -6px rgba(255,122,107,.7)' }}>
    <SparkIcon size={Math.round(size * 0.55)} />
  </span>
)

function ActionCard({ card, onUndo }: { card: Card; onUndo: () => void }) {
  if (card.kind === '__undone') {
    return <div className="cai-card" style={{ borderStyle: 'dashed', padding: '10px 12px', fontSize: 12.5, color: '#71717a' }}>Undone</div>
  }
  if (card.kind === 'report') return <ReportCard card={card} />
  if (card.kind === 'list') return <ListCard card={card} />
  return (
    <div className="cai-card" style={{ display: 'flex', gap: 10, padding: '11px 12px' }}>
      <span style={{ width: 28, height: 28, borderRadius: 9, background: '#ecfdf3', color: '#067647', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <CardIcon name={CARD_ICON[card.kind] || 'check'} size={15} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#0d0d0d', lineHeight: 1.35 }}>{card.title}</p>
        {(card.lines || []).filter(Boolean).map((l, i) => (
          <p key={i} style={{ margin: '1px 0 0', fontSize: 12.5, color: '#6b7280', lineHeight: 1.45, wordBreak: 'break-word' }}>{l}</p>
        ))}
        {(card.href || card.undo) && (
          <div style={{ display: 'flex', gap: 14, marginTop: 7 }}>
            {card.href && <a href={card.href} style={{ fontSize: 12.5, fontWeight: 700, color: AI_CORAL, textDecoration: 'none' }}>{SUGGEST_LABEL[card.kind] || 'Open'}</a>}
            {card.undo && <button type="button" onClick={onUndo} style={{ fontSize: 12.5, fontWeight: 700, color: '#71717a', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>Undo</button>}
          </div>
        )}
      </div>
    </div>
  )
}

function ReportCard({ card }: { card: Card }) {
  return (
    <div className="cai-card" style={{ padding: 12 }}>
      <p style={{ margin: '0 0 9px', fontSize: 11.5, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{card.title}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {(card.stats || []).map((st, i) => (
          <div key={i} style={{ background: '#f8f8fa', borderRadius: 10, padding: '8px 9px' }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0d0d0d', lineHeight: 1.15 }}>{st.value}</p>
            <p style={{ margin: '1px 0 0', fontSize: 10.5, color: '#71717a' }}>{st.label}</p>
          </div>
        ))}
      </div>
      {(card.lists || []).map((l, i) => (
        <div key={i} style={{ marginTop: 10 }}>
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#71717a' }}>{l.heading}</p>
          {l.rows.map((r, j) => (
            <div key={j} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '2px 0', fontSize: 12.5, color: '#0d0d0d' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
              <span style={{ color: '#71717a', flexShrink: 0 }}>{r.value}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function ListCard({ card }: { card: Card }) {
  return (
    <div className="cai-card" style={{ padding: '11px 12px' }}>
      <p style={{ margin: (card.rows || []).length ? '0 0 6px' : 0, fontSize: 13, fontWeight: 700, color: '#0d0d0d' }}>{card.title}</p>
      {(card.rows || []).map((r, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', borderTop: i ? '1px solid #f1f1f3' : 'none' }}>
          <span style={{ fontSize: 12.5, color: '#0d0d0d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
          {r.sub && <span style={{ fontSize: 11.5, color: '#71717a', flexShrink: 0, maxWidth: '55%', textAlign: 'right' }}>{r.sub}</span>}
        </div>
      ))}
    </div>
  )
}

// Lightweight markdown for assistant replies: paragraphs, bullet/numbered
// lists, **bold**, and [links](url). No tables — data comes back as cards.
function RichText({ text }: { text: string }) {
  const inline = (s: string, keyBase: string): React.ReactNode[] => {
    const out: React.ReactNode[] = []
    const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^)]+)\)|(https?:\/\/[^\s]+)/g
    let last = 0, m: RegExpExecArray | null, k = 0
    while ((m = re.exec(s))) {
      if (m.index > last) out.push(s.slice(last, m.index))
      if (m[1] != null) out.push(<strong key={`${keyBase}-${k++}`}>{m[1]}</strong>)
      else if (m[2] != null) out.push(<a key={`${keyBase}-${k++}`} href={m[3]} target="_blank" rel="noreferrer" style={{ color: AI_CORAL }}>{m[2]}</a>)
      else if (m[4] != null) out.push(<a key={`${keyBase}-${k++}`} href={m[4]} target="_blank" rel="noreferrer" style={{ color: AI_CORAL }}>{m[4]}</a>)
      last = re.lastIndex
    }
    if (last < s.length) out.push(s.slice(last))
    return out
  }
  const lines = String(text || '').split('\n')
  return (
    <div style={{ fontSize: 14, color: '#1f2937', lineHeight: 1.55 }}>
      {lines.map((ln, i) => {
        const t = ln.trim()
        if (!t) return <div key={i} style={{ height: 6 }} />
        const bullet = /^[-*•]\s+/.test(t)
        const num = /^\d+\.\s+/.test(t)
        if (bullet || num) {
          return (
            <div key={i} style={{ display: 'flex', gap: 7, paddingLeft: 2 }}>
              <span style={{ color: '#9ca3af', flexShrink: 0 }}>{num ? t.match(/^\d+\./)![0] : '•'}</span>
              <span>{inline(t.replace(/^([-*•]|\d+\.)\s+/, ''), `l${i}`)}</span>
            </div>
          )
        }
        return <p key={i} style={{ margin: 0 }}>{inline(t, `p${i}`)}</p>
      })}
    </div>
  )
}

// The "check before it goes out" card. One tap to send; the wording can be
// tweaked right here first, so there's no back-and-forth to change a word.
function ConfirmCard({ confirm, busy, onCancel, onSend }: { confirm: ConfirmPayload; busy: boolean; onCancel: () => void; onSend: (editedText?: string) => void }) {
  const p = confirm.preview || {}
  const kind: string = p.kind || 'send_message'
  const editable = typeof p.text === 'string' && confirm.args && 'text' in confirm.args
  const [text, setText] = useState<string>(p.text || '')
  const isRefund = kind === 'refund_order'
  const isOrder = kind === 'order_status' || isRefund
  const heading = isRefund ? 'Check the refund' : isOrder ? 'Check the order change'
    : kind === 'payment_link' ? 'Check the payment link'
    : kind === 'review_reply' ? 'Check your review reply'
    : kind === 'comment_reply' ? 'Check your comment reply'
    : 'Check before sending'
  const cta = isRefund ? 'Refund' : isOrder ? 'Confirm' : kind === 'review_reply' || kind === 'comment_reply' ? 'Post reply' : 'Send'
  const rows: [string, string][] = [
    p.to ? ['To', `${p.to}${p.via ? ` · ${p.via}` : ''}`] : null,
    p.about ? ['Replying to', p.about] : null,
    p.amount ? ['Amount', p.amount] : null,
    p.orderLabel ? ['Order', p.orderLabel] : null,
    p.action ? ['Change', `${p.action}${p.current ? ` (now ${p.current})` : ''}`] : null,
  ].filter(Boolean) as [string, string][]
  return (
    <div className="cai-card" style={{ borderColor: '#ffd6cc', boxShadow: '0 10px 24px -18px rgba(226,85,63,.6)' }}>
      <div style={{ padding: '10px 12px', background: '#fff7f5', borderBottom: '1px solid #ffe4dc', display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ color: AI_CORAL, display: 'flex' }}><CardIcon name={CARD_ICON[kind] || (isOrder ? 'cart' : 'chat')} size={14} /></span>
        <span style={{ fontSize: 12, fontWeight: 800, color: AI_CORAL, textTransform: 'uppercase', letterSpacing: '.04em' }}>{heading}</span>
      </div>
      <div style={{ padding: 12 }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.5 }}>
            <span style={{ color: '#71717a', width: 82, flexShrink: 0 }}>{k}</span>
            <span style={{ color: '#0d0d0d', fontWeight: 600, minWidth: 0, wordBreak: 'break-word' }}>{v}</span>
          </div>
        ))}
        {p.quote && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#52525b', lineHeight: 1.5, borderLeft: '3px solid #ececef', paddingLeft: 9, fontStyle: 'italic' }}>{p.quote}</p>}
        {editable && (
          <textarea value={text} onChange={e => setText(e.target.value)} rows={Math.min(8, Math.max(3, Math.ceil(text.length / 48)))} aria-label="Message to send"
            className="cai-edit"
            style={{ width: '100%', boxSizing: 'border-box', marginTop: 10, padding: '10px 12px', borderRadius: 12, border: '1px solid #e4e4e7', fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.5, color: '#0d0d0d', resize: 'vertical', outline: 'none', background: '#fff' }} />
        )}
        {p.warn && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#b42318' }}>{p.warn}</p>}
        {p.note && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#71717a' }}>{p.note}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" onClick={() => onSend(editable ? text : undefined)} disabled={busy || (editable && !text.trim())}
            style={{ flex: 1, padding: '10px 12px', borderRadius: 12, border: 'none', background: isRefund ? '#dc2626' : GRAD, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1, fontFamily: 'inherit' }}>
            {busy ? 'Working…' : cta}
          </button>
          <button type="button" onClick={onCancel} disabled={busy}
            style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid #e4e4e7', background: '#fff', color: '#0d0d0d', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <span style={{ display: 'inline-flex', gap: 4, padding: '8px 2px' }} aria-label="Colvy AI is working">
      {[0, 1, 2].map(i => (
        <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#c4c4cc', display: 'inline-block', animation: `caiDot 1.1s ${i * 0.15}s infinite ease-in-out` }} />
      ))}
    </span>
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
