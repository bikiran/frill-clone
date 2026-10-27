'use client'

// The Colvy chat in the inbox (lib/colvy-chat): a "Colvy" row pinned at the top
// of the conversation list, with the official-account tick, and its thread.
// The welcome, the updates the Colvy team posts, and a reply box that reaches
// the Colvy team; only this person sees it. Read through /api/colvy-chat, so
// it never touches the workspace's own conversations.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { authFetch } from '@/lib/auth-fetch'
import type { ColvyItem } from '@/lib/colvy-chat-core'

const LOGO = '/icon-192.png'
const SUMMARY_MS = 60_000
const THREAD_MS = 10_000

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
    el.style.height = 'auto'
    const full = el.scrollHeight + 2 // + its border (border-box)
    el.style.height = `${Math.min(full, 160)}px`
    el.style.overflowY = full > 160 ? 'auto' : 'hidden'
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

  return (
    <div className="colvy-chat" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: '#f9f9f9' }}>
      <style>{`
        .cc-in { animation: ccIn .32s cubic-bezier(.2,.9,.3,1.1) both; }
        @keyframes ccIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .cc-in { animation: none; } }
        .cc-bubble { max-width: min(560px, 82%); padding: 10px 13px; border-radius: 16px; font-size: 13.5px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
        .cc-send { border: none; border-radius: 12px; padding: 0 16px; height: 42px; background: var(--coral); color: #fff; font-weight: 700; font-size: 13.5px; cursor: pointer; font-family: inherit; flex-shrink: 0; }
        .cc-box { flex: 1; box-sizing: border-box; display: block; resize: none; min-height: 42px; max-height: 160px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border); font: inherit; font-size: 13.5px; line-height: 20px; outline: none; background: #fafafa; overflow-y: hidden; transition: border-color .15s ease, box-shadow .15s ease, background .15s ease; }
        .cc-box:focus { border-color: var(--coral); background: #fff; box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 14%, transparent); }
        .cc-send:disabled { opacity: .45; cursor: default; }
        /* The floating Colvy AI button sits bottom right: on a phone it steps
           aside while this chat is open (as for any conversation), and on a
           wider screen the reply box leaves it room. */
        @media (max-width: 767px) { html body:has(.inbox-pane-thread .colvy-chat) .colvy-ai-orb-wrap { display: none !important; } }
        @media (min-width: 768px) { .colvy-chat .cc-reply { padding-right: 76px !important; } }
      `}</style>

      {/* Header */}
      <div className="inbox-thread-header" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#fff' }}>
        {onBack && (
          <button type="button" className="inbox-mobile-only" onClick={onBack} aria-label="Back to chats"
            style={{ display: 'none', width: 34, height: 34, borderRadius: 10, border: 'none', background: 'var(--peach)', color: 'var(--coral)', cursor: 'pointer', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} alt="" width={38} height={38} style={{ width: 38, height: 38, borderRadius: 11 }} />
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 5, fontSize: 15, fontWeight: 750, color: 'var(--ink)' }}>Colvy <Tick size={15} /></p>
          <p style={{ margin: '1px 0 0', fontSize: 12, color: '#8e8e93' }}>Updates and help from the Colvy team</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scroller} onScroll={e => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80 }}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 16px 10px' }}>
        <p style={{ margin: '0 auto 16px', maxWidth: 420, textAlign: 'center', fontSize: 12, color: '#8e8e93', lineHeight: 1.5 }}>
          These messages are just between you and Colvy. Your colleagues can’t see them.
        </p>
        {items === null && <p style={{ textAlign: 'center', fontSize: 13, color: '#8e8e93' }}>Loading…</p>}
        {(items || []).map(i => {
          if (i.kind === 'me') return (
            <div key={i.id} className="cc-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', margin: '0 0 10px' }}>
              <div className="cc-bubble" style={{ background: 'var(--coral)', color: '#fff', borderBottomRightRadius: 6 }}><Linked text={i.text} /></div>
              <span style={{ fontSize: 10.5, color: '#9ca3af', marginTop: 3 }}>{shortTime(i.at)}{i.id.startsWith('tmp-') ? ' · Sending…' : ''}</span>
            </div>
          )
          return (
            <div key={i.id} className="cc-in" style={{ display: 'flex', gap: 8, alignItems: 'flex-end', margin: '0 0 12px' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO} alt="" width={28} height={28} style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0 }} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0, flex: 1 }}>
                {i.kind === 'team' && i.from && <span style={{ fontSize: 11, color: '#8e8e93', margin: '0 0 3px 4px' }}>{i.from} · Colvy team</span>}
                {i.kind === 'update' ? (
                  <div className="cc-bubble" style={{ background: '#fff', border: '1px solid var(--border)', borderBottomLeftRadius: 6, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                    <span style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--coral)', marginBottom: 4 }}>What’s new</span>
                    <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'normal' }}>{i.title}</p>
                    {i.text && <span style={{ color: '#3a3a3c' }}><Linked text={i.text} /></span>}
                    {i.link && <div>{
                      i.link.url.startsWith('/')
                        ? <Link href={i.link.url} style={{ display: 'inline-block', marginTop: 10, padding: '6px 12px', borderRadius: 9, background: 'var(--peach)', color: 'var(--coral)', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>{i.link.label}</Link>
                        : <a href={i.link.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 10, padding: '6px 12px', borderRadius: 9, background: 'var(--peach)', color: 'var(--coral)', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>{i.link.label}</a>
                    }</div>}
                  </div>
                ) : (
                  <div className="cc-bubble" style={{ background: '#fff', color: 'var(--ink)', border: '1px solid var(--border)', borderBottomLeftRadius: 6 }}><Linked text={i.text} /></div>
                )}
                <span style={{ fontSize: 10.5, color: '#9ca3af', margin: '3px 0 0 4px' }}>{shortTime(i.at)}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Reply */}
      <div className="inbox-composer cc-reply" style={{ padding: '10px 14px 12px', borderTop: '1px solid var(--border)', background: '#fff' }}>
        {err && <p role="alert" style={{ margin: '0 0 8px', fontSize: 12.5, color: '#b42318' }}>{err}</p>}
        {canReply ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <textarea ref={box} className="cc-box" value={text} onChange={e => setText(e.target.value)} rows={1} maxLength={4000}
              placeholder="Message the Colvy team…" aria-label="Message the Colvy team"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }} />
            <button type="button" className="cc-send" onClick={send} disabled={busy || !text.trim()}>{busy ? 'Sending…' : 'Send'}</button>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 12.5, color: '#8e8e93' }}>Messaging Colvy isn’t available right now. Email support@colvy.com instead.</p>
        )}
        <p style={{ margin: '7px 2px 0', fontSize: 11, color: '#9ca3af' }}>A real person on the Colvy team reads and answers this.</p>
      </div>
    </div>
  )
}
