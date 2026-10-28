'use client'

// The Colvy chat in the inbox (lib/colvy-chat): a "Colvy" row pinned at the top
// of the conversation list, with the official-account tick, and its thread.
// The welcome, the updates the Colvy team posts, and a reply box that reaches
// the Colvy team; only this person sees it. Read through /api/colvy-chat, so
// it never touches the workspace's own conversations.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { authFetch } from '@/lib/auth-fetch'
import { COLVY_CONTACT } from '@/lib/colvy-contact'
import type { ColvyItem } from '@/lib/colvy-chat-core'

const LOGO = '/icon-192.png'
const SUMMARY_MS = 60_000
const THREAD_MS = 10_000
// The reply box: two lines to start, growing to about six.
const MIN_BOX = 64
const MAX_BOX = 160

export type ColvySummary = { available: boolean; unread: number; last: { kind: string; text: string; at: string } | null }

/** Whether the Colvy chat shows, its unread count and last line, refreshed every minute. */
export function useColvySummary(companyId: string | null | undefined) {
  const [s, setS] = useState<ColvySummary>({ available: false, unread: 0, last: null })
  const refresh = useCallback(async () => {
    if (!companyId) return
    try {
      const r = await authFetch(`/api/colvy-chat?summary=1&companyId=${encodeURIComponent(companyId)}`)
      if (!r.ok) return
      const d = await r.json()
      setS({ available: !!d.available, unread: Number(d.unread) || 0, last: d.last || null })
    } catch { /* stays as it was */ }
  }, [companyId])
  useEffect(() => {
    refresh()
    const iv = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, SUMMARY_MS)
    return () => clearInterval(iv)
  }, [refresh])
  return { ...s, refresh, clearUnread: () => setS(x => ({ ...x, unread: 0 })) }
}

// The official-account badge: twelve even points around the centre (worked
// out, not drawn by hand, so it sits straight), softened with a round stroke.
const BADGE = Array.from({ length: 24 }, (_, k) => {
  const a = (Math.PI * k) / 12 - Math.PI / 2
  const r = k % 2 === 0 ? 10.6 : 8.9
  return `${(12 + r * Math.cos(a)).toFixed(2)},${(12 + r * Math.sin(a)).toFixed(2)}`
}).join(' ')
const Tick = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-label="Official Colvy account" role="img" style={{ flexShrink: 0, display: 'block' }}>
    <polygon points={BADGE} fill="#1d9bf0" stroke="#1d9bf0" strokeWidth="1.6" strokeLinejoin="round" />
    <path fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="m8.1 12.3 2.6 2.6 5.2-5.3" />
  </svg>
)

const shortTime = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso), now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).replace(/\s?([ap])\.?m\.?/i, ' $1m').toLowerCase()
    : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

// "Received 9:41 am | 27 Oct | Colvy app", as under any other message.
const receipt = (iso: string, mine: boolean) => {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const time = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?([ap])\.?m\.?/i, ' $1m').toLowerCase()
  return `${mine ? 'Sent' : 'Received'} ${time} | ${d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })} | Colvy app`
}

/** Its row in the conversation list: on top while there's something new, else by time. */
export function ColvyChatRow({ summary, active, onOpen }: { summary: ColvySummary; active: boolean; onOpen: () => void }) {
  const unread = summary.unread > 0
  return (
    <button type="button" onClick={onOpen} data-colvy-row aria-label={`Colvy${unread ? `, ${summary.unread} unread` : ''}`}
      style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', padding: '11px 14px', border: 'none', borderBottom: '1px solid var(--border)', borderLeft: unread ? '3px solid var(--coral)' : '3px solid transparent', paddingLeft: 11, cursor: 'pointer', background: active ? 'var(--peach)' : unread ? '#fff6f4' : '#fff', fontFamily: 'inherit' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO} alt="" width={36} height={36} style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0 }} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 13.5, fontWeight: unread ? 750 : 650, color: 'var(--ink)' }}>Colvy</span>
          <Tick />
          {unread && <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--coral)', background: 'var(--peach)', padding: '1px 6px', borderRadius: 99 }}>New</span>}
          <span style={{ marginLeft: 'auto', fontSize: 10.5, color: '#9ca3af', fontStyle: 'italic', flexShrink: 0 }}>{shortTime(summary.last?.at)}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: unread ? 'var(--ink)' : 'var(--slate)', fontWeight: unread ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {summary.last?.kind === 'me' ? 'You: ' : ''}{summary.last?.text || 'Updates and help from the Colvy team'}
          </span>
          {unread && <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 99, background: 'var(--coral)', color: '#fff', fontSize: 10.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{summary.unread}</span>}
        </span>
      </span>
    </button>
  )
}

// Web addresses in a message become links (only http/https).
function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"')]+)/g)
  return <>{parts.map((p, i) => /^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>{p}</a> : p)}</>
}

/** The thread: header, the messages, and the reply box. */
export function ColvyChatThread({ companyId, onBack, onRead }: { companyId: string | null; onBack?: () => void; onRead?: () => void }) {
  const [items, setItems] = useState<ColvyItem[] | null>(null)
  const [canReply, setCanReply] = useState(true)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const seen = useRef(0)
  // Whether they're at the bottom: only then does something new pull the view down.
  const atBottom = useRef(true)
  // The parent passes a fresh function each render; keep it out of load's deps.
  const onReadRef = useRef(onRead)
  onReadRef.current = onRead

  const load = useCallback(async () => {
    if (!companyId) return
    try {
      const r = await authFetch(`/api/colvy-chat?companyId=${encodeURIComponent(companyId)}`)
      const d = await r.json().catch(() => null)
      if (!r.ok || !d?.available) { setItems(x => x || []); return }
      // Nothing changed: leave the list (and where they've scrolled) alone.
      const next: ColvyItem[] = d.items || []
      setItems(x => (x && x.length === next.length && x.every((it, k) => it.id === next[k].id && it.text === next[k].text) ? x : next))
      setCanReply(d.canReply !== false)
      // Open in front of them: everything in it has now been seen.
      if (d.unread > 0) {
        authFetch('/api/colvy-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'read' }) }).catch(() => {})
        onReadRef.current?.()
      }
    } catch { setItems(x => x || []) }
  }, [companyId])

  useEffect(() => {
    load()
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load() }, THREAD_MS)
    return () => clearInterval(iv)
  }, [load])

  // Opens on the newest. After that, something new brings the view down only
  // if they're already at the bottom or it's their own message; reading
  // further up, they stay where they are.
  useLayoutEffect(() => {
    const el = scroller.current
    const n = items?.length || 0
    if (el && n > seen.current) {
      const mine = items?.[n - 1]?.kind === 'me'
      if (seen.current === 0 || atBottom.current || mine) { el.scrollTop = el.scrollHeight; atBottom.current = true }
    }
    seen.current = n
  }, [items])

  // The reply box grows with what's typed, and scrolls only past its tallest.
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    // Measured at its smallest, then set through --cc-h, which a phone's
    // fixed reply-box height (an !important rule) also follows.
    el.style.setProperty('--cc-h', '0px')
    const full = Math.max(el.scrollHeight, MIN_BOX)
    el.style.setProperty('--cc-h', `${Math.min(full, MAX_BOX)}px`)
    el.style.overflowY = full > MAX_BOX ? 'auto' : 'hidden'
  }, [text])

  const send = async () => {
    const t = text.trim()
    if (!t || busy || !companyId) return
    setBusy(true); setErr('')
    // Shown straight away; the server's copy replaces it on the next load.
    const temp: ColvyItem = { id: `tmp-${Date.now()}`, kind: 'me', at: new Date().toISOString(), text: t }
    setItems(x => [...(x || []), temp]); setText('')
    try {
      const r = await authFetch('/api/colvy-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'send', text: t, companyId }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Your message couldn’t be sent. Try again.')
      setItems(x => (x || []).map(i => i.id === temp.id ? { ...i, id: d.id, at: d.at || i.at } : i))
    } catch (e: any) {
      setItems(x => (x || []).filter(i => i.id !== temp.id)); setText(t)
      setErr(e.message || 'Your message couldn’t be sent. Try again.')
    } finally { setBusy(false) }
  }

  const sendable = !!text.trim() && !busy
  return (
    <div className="colvy-chat" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* The same look as any other conversation: its header, bubbles and
          "Received … | … | channel" lines, and the inbox's reply card (the
          .cmp-* styles in app/admin/inbox/page.tsx, which only load with an
          open conversation, so the ones used here are repeated). */}
      <style>{`
        @media (max-width: 767px) { html body:has(.inbox-pane-thread .colvy-chat) .colvy-ai-orb-wrap { display: none !important; } }
        .colvy-chat .msg-bubble { white-space: pre-wrap; overflow-wrap: anywhere; }
        .colvy-chat .inbox-composer { container-type: inline-size; }
        .colvy-chat .cmp-card { border: 1px solid var(--border); border-radius: 18px; background: #f8f9fb; transition: border-color .2s, box-shadow .2s, background .2s; }
        .colvy-chat .cmp-card:focus-within { background: #fff; border-color: #d7dae0; box-shadow: 0 0 0 4px rgba(255,122,107,.10), 0 8px 24px -16px rgba(16,24,40,.25); }
        .colvy-chat .cmp-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px 2px; }
        .colvy-chat .cmp-mode { display: inline-flex; padding: 3px; border-radius: 10px; background: rgba(17,24,39,.06); }
        .colvy-chat .cmp-mode span { display: inline-flex; align-items: center; height: 28px; padding: 0 14px; border-radius: 8px; background: #fff; box-shadow: 0 1px 2px rgba(16,24,40,.08), 0 2px 6px -2px rgba(16,24,40,.12); font-size: 12.5px; font-weight: 700; color: var(--ink); }
        .colvy-chat .cmp-via { display: inline-flex; align-items: center; gap: 5px; min-width: 0; font-size: 12px; color: var(--slate); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .colvy-chat .cmp-via b { color: var(--ink); font-weight: 700; }
        .colvy-chat .cmp-input { display: block; width: 100%; box-sizing: border-box; height: var(--cc-h, 64px); min-height: 0; max-height: 160px; padding: 4px 16px 8px; border: none; background: transparent; font: inherit; font-size: 14px; line-height: 1.5; color: var(--ink); resize: none; outline: none; }
        .colvy-chat .cmp-input::placeholder { color: #9ca3af; }
        .colvy-chat .cmp-input:focus { outline: none !important; box-shadow: none !important; border: none !important; }
        .colvy-chat .cmp-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 10px 10px 16px; }
        .colvy-chat .cc-note { min-width: 0; font-size: 11.5px; color: #9ca3af; }
        .colvy-chat .cc-send { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; height: 38px; padding: 0 18px; border: none; border-radius: 12px; font: inherit; font-size: 13px; font-weight: 700; transition: background .15s, color .15s; }
        .colvy-chat .cmp-hint { display: flex; justify-content: flex-end; gap: 14px; padding: 7px 6px 0; font-size: 11.5px; color: #9ca3af; }
        .colvy-chat .cmp-hint kbd { font: inherit; font-weight: 700; color: var(--slate); padding: 1px 6px; border-radius: 5px; background: #f3f4f6; border: 1px solid #e5e7eb; }
        @container (max-width: 560px) { .colvy-chat .cmp-hint { display: none; } }
        @container (max-width: 420px) { .colvy-chat .cc-note { display: none; } .colvy-chat .cc-send { flex: 1; justify-content: center; } }
        /* A phone pins every reply box to two lines; this one grows as they type. */
        @media (max-width: 767px) { .colvy-chat .inbox-composer textarea.cmp-input { height: var(--cc-h, 52px) !important; min-height: 52px !important; margin-bottom: 0 !important; } }
      `}</style>

      {/* Header */}
      <div className="inbox-thread-header" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#fff' }}>
        {onBack && (
          <button type="button" className="inbox-mobile-only" onClick={onBack} title="Back to chats" aria-label="Back to chats"
            style={{ display: 'none', height: 36, flexShrink: 0, borderRadius: 10, border: 'none', background: 'color-mix(in srgb, var(--coral) 12%, #fff)', cursor: 'pointer', alignItems: 'center', gap: 3, padding: '0 10px 0 6px', color: 'var(--coral)', fontSize: 13.5, fontWeight: 700 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            <span className="inbox-back-label">Chats</span>
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} alt="" width={38} height={38} style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0 }} />
        <div className="inbox-header-name" style={{ minWidth: 0 }}>
          <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 5, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Colvy <Tick size={15} /></p>
          <p style={{ margin: '1px 0 0', fontSize: 12, color: 'var(--slate)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Updates and help from the Colvy team</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scroller} className="inbox-messages" onScroll={e => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80 }}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ margin: '0 auto', maxWidth: 460, display: 'flex', alignItems: 'center', gap: 6, textAlign: 'center', fontSize: 11.5, color: '#8a8f98', lineHeight: 1.5 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          Just between you and Colvy. Your colleagues can’t see these messages.
        </p>
        {items === null && <p style={{ margin: 0, textAlign: 'center', fontSize: 13, color: '#8a8f98' }}>Loading…</p>}
        {(items || []).map(i => {
          const mine = i.kind === 'me'
          // Like any conversation: something that's just arrived rises into place; what was there stays still.
          const fresh = Date.now() - Date.parse(i.at) < 15000 ? (mine ? ' msg-in mine' : ' msg-in') : ''
          return (
            <div key={i.id} className={`chat-msg-row${fresh}`} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-end' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {!mine && <img className="chat-cust-av" src={LOGO} alt="" width={28} height={28} style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0 }} />}
              <div className="chat-msg-col" style={{ maxWidth: '70%', minWidth: 0 }}>
                <p style={{ margin: mine ? '0 4px 3px 0' : '0 0 3px 4px', fontSize: 10, color: '#9ca3af', textAlign: mine ? 'right' : 'left' }}>{mine ? 'You' : i.kind === 'team' && i.from ? `${i.from} · Colvy team` : 'Colvy'}</p>
                <div className="msg-bubble" style={{
                  padding: '10px 14px', borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: mine ? 'var(--coral)' : '#fff', color: mine ? '#fff' : 'var(--ink)',
                  border: mine ? 'none' : '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', fontSize: 13, lineHeight: 1.5,
                }}>
                  {i.kind === 'update' ? (
                    <>
                      <span style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--coral)', marginBottom: 3 }}>What’s new</span>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 700, whiteSpace: 'normal', marginBottom: i.text ? 3 : 0 }}>{i.title}</span>
                      {i.text && <Linked text={i.text} />}
                      {i.link && <span style={{ display: 'block', whiteSpace: 'normal' }}>{
                        i.link.url.startsWith('/')
                          ? <Link href={i.link.url} style={{ display: 'inline-block', marginTop: 10, padding: '6px 12px', borderRadius: 9, background: 'var(--peach)', color: 'var(--coral)', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>{i.link.label}</Link>
                          : <a href={i.link.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 10, padding: '6px 12px', borderRadius: 9, background: 'var(--peach)', color: 'var(--coral)', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>{i.link.label}</a>
                      }</span>}
                    </>
                  ) : <Linked text={i.text} />}
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 10.5, color: '#8a8f98', fontStyle: 'italic', textAlign: mine ? 'right' : 'left' }}>
                  {i.id.startsWith('tmp-') ? 'Sending…' : receipt(i.at, mine)}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Reply: the inbox's reply card */}
      <div className="inbox-composer" style={{ padding: '10px 14px', background: '#fff', borderTop: '1px solid var(--border)', position: 'relative' }}>
        {err && <p role="alert" style={{ margin: '0 0 8px', fontSize: 12.5, color: '#b42318' }}>{err}</p>}
        {canReply ? (
          <>
            <div className="cmp-card">
              <div className="cmp-head">
                <div className="cmp-mode"><span>Reply</span></div>
                <span className="cmp-via">Sending to <b>the Colvy team</b> <Tick size={13} /></span>
              </div>
              <textarea ref={box} className="cmp-input" value={text} onChange={e => setText(e.target.value)} maxLength={4000}
                placeholder="Message the Colvy team…" aria-label="Message the Colvy team"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }} />
              <div className="cmp-bar">
                <span className="cc-note">A real person on the Colvy team reads and answers this.</span>
                <button type="button" className="cc-send" onClick={send} disabled={!sendable}
                  style={{ background: sendable ? 'var(--coral)' : '#e5e7eb', color: sendable ? '#fff' : '#9ca3af', cursor: sendable ? 'pointer' : 'default' }}>
                  {busy ? 'Sending…' : <>Send <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M22 2 11 13" /><path d="m22 2-7 20-4-9-9-4z" /></svg></>}
                </button>
              </div>
            </div>
            <div className="cmp-hint"><span><kbd>Enter</kbd> to send</span><span><kbd>Shift</kbd> + <kbd>Enter</kbd> new line</span></div>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 12.5, color: '#8a8f98' }}>Messaging Colvy isn’t available right now. Email support@colvy.com instead.</p>
        )}
      </div>
    </div>
  )
}

// The panel beside the chat, where a conversation shows its contact: who
// Colvy is and the other ways to reach the team. Wide screens only, like the
// desktop three-column inbox.
export function ColvyChatInfo() {
  const row = { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', color: 'var(--ink)', textDecoration: 'none', fontSize: 13.5 } as const
  const label = { margin: '0 0 2px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--slate)' } as const
  const ICON: Record<string, string> = {
    call: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
    text: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    email: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm18 2-10 7L2 6',
  }
  // Calling and texting Colvy happen here, not in the device's phone or
  // Messages app: Call opens Colvy's own dialer with Colvy's number, and Text
  // is this chat (it reaches the same team), so it goes to the reply box.
  // Email still opens their email app.
  const call = (e: React.MouseEvent) => {
    e.preventDefault()
    window.dispatchEvent(new CustomEvent('colvy:dial', { detail: { number: COLVY_CONTACT.phoneE164, name: 'Colvy' } }))
  }
  const write = (e: React.MouseEvent) => {
    e.preventDefault()
    const box = document.querySelector<HTMLTextAreaElement>('.colvy-chat textarea.cmp-input')
    if (!box) return
    box.focus()
    box.closest('.inbox-composer')?.animate?.([{ boxShadow: '0 0 0 0 rgba(37,99,235,.35)' }, { boxShadow: '0 0 0 6px rgba(37,99,235,0)' }], { duration: 700, easing: 'ease-out' })
  }
  const ways = [
    { k: 'call', h: COLVY_CONTACT.telHref, t: 'Call', bg: '#ecfdf3', c: '#059669', go: call },
    { k: 'text', h: '#', t: 'Message', bg: '#eff6ff', c: '#2563eb', go: write },
    { k: 'email', h: COLVY_CONTACT.mailHref, t: 'Email', bg: '#fff1ee', c: 'var(--coral)', go: undefined },
  ]
  const links = [
    { l: 'What’s new in Colvy', h: '/changelog' },
    { l: 'System status', h: '/status' },
    { l: 'Security', h: '/security' },
  ]
  return (
    <aside className="colvy-info" aria-label="About Colvy" style={{ width: 280, flexShrink: 0, background: '#fff', borderLeft: '1px solid var(--border)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @media (max-width: 1100px) { .colvy-info { display: none !important; } }
        @media (min-width: 1101px) { .colvy-info { border-left: none !important; border-radius: 18px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); } }
        .colvy-info a.ci-link:hover { color: var(--coral) !important; }
      `}</style>
      <div style={{ padding: '26px 18px 18px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} alt="" width={84} height={84} style={{ width: 84, height: 84, borderRadius: 22, display: 'block', margin: '0 auto 12px' }} />
        <p style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 19, fontWeight: 800, color: 'var(--ink)' }}>Colvy <Tick size={17} /></p>
        <p style={{ margin: '3px 0 14px', fontSize: 12.5, color: 'var(--slate)' }}>Official account · updates and help</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
          {ways.map(w => (
            <a key={w.k} href={w.h} title={w.t} aria-label={`${w.t} Colvy`} onClick={w.go}
              style={{ width: 44, height: 44, borderRadius: 12, background: w.bg, color: w.c, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICON[w.k]} /></svg>
            </a>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Contact</p>
        <div><p style={label}>Phone and text</p><a href={COLVY_CONTACT.telHref} onClick={call} style={{ fontSize: 13.5, color: 'var(--ink)', textDecoration: 'none' }}>{COLVY_CONTACT.phoneDisplay}</a></div>
        <div><p style={label}>Email</p><a href={COLVY_CONTACT.mailHref} style={{ fontSize: 13.5, color: 'var(--ink)', textDecoration: 'none' }}>{COLVY_CONTACT.email}</a></div>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--slate)', lineHeight: 1.5 }}>Or just write here: it reaches the same team.</p>
      </div>

      <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
        {links.map(l => (
          <a key={l.h} href={l.h} target="_blank" rel="noopener noreferrer" className="ci-link" style={{ ...row, justifyContent: 'space-between' }}>
            {l.l}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 17 17 7" /><path d="M8 7h9v9" /></svg>
          </a>
        ))}
      </div>

      <div style={{ padding: '16px 18px 20px' }}>
        <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Colvy on your phone</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href="https://apps.apple.com/us/app/colvy/id6803380512" target="_blank" rel="noopener noreferrer" aria-label="Download on the App Store"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 11px', borderRadius: 10, background: '#111', color: '#fff', textDecoration: 'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" /></svg>
            <span style={{ lineHeight: 1.1 }}><span style={{ display: 'block', fontSize: 8.5, opacity: 0.75 }}>Download on the</span><span style={{ display: 'block', fontSize: 12.5, fontWeight: 700 }}>App Store</span></span>
          </a>
          <a href="https://play.google.com/store/apps/details?id=com.colvy.app" target="_blank" rel="noopener noreferrer" aria-label="Get it on Google Play"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 11px', borderRadius: 10, background: '#111', color: '#fff', textDecoration: 'none' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden><path fill="#00d2ff" d="M3.6 2.4a1.4 1.4 0 0 0-.32.95v17.3c0 .4.12.72.34.94l.06.05 9.7-9.69v-.2L3.68 2.35l-.08.05z" /><path fill="#00e676" d="M3.68 2.35l9.7 9.7 3.24-3.24L4.86 1.9a1.42 1.42 0 0 0-1.18.45z" /><path fill="#ffd600" d="M13.38 12.05l-9.7 9.69c.35.3.86.33 1.4.02l11.74-6.67-3.44-3.04z" /><path fill="#ff3d00" d="M13.38 12.05l3.44-3.04 3.5 1.99c1 .57 1 1.5 0 2.07l-3.5 1.99-3.44-3.01z" /></svg>
            <span style={{ lineHeight: 1.1 }}><span style={{ display: 'block', fontSize: 8.5, opacity: 0.75 }}>Get it on</span><span style={{ display: 'block', fontSize: 12.5, fontWeight: 700 }}>Google Play</span></span>
          </a>
        </div>
      </div>
    </aside>
  )
}
