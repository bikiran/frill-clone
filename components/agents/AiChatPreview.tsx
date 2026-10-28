'use client'

import { useEffect, useState } from 'react'
import AiBuddy from '@/components/AiBuddy'

// A live preview of a customer chat with Colvy AI, for the AI settings pages:
// change a setting and the conversation replays to show what the customer
// would now see. Colvy AI "types" before each of its messages. With reduced
// motion everything shows at once.

export type PreviewMsg = {
  from: 'them' | 'ai' | 'draft' | 'sys'
  text: string
  /** A small line under an AI message (e.g. "Sent after a 3-second countdown"). */
  note?: string
}

export default function AiChatPreview({ messages, title = 'Live preview', sub = 'What your customer sees', customer = 'Jo Parker', channel = 'Website chat', name = 'Colvy AI' }: {
  messages: PreviewMsg[]; title?: string; sub?: string; customer?: string; channel?: string; name?: string
}) {
  const key = JSON.stringify(messages)
  const [play, setPlay] = useState({ key: '', n: 0, typing: false })
  const [still, setStill] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setStill(mq.matches)
    on(); mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  // Replay the conversation whenever it changes.
  useEffect(() => {
    if (still) return
    const timers: ReturnType<typeof setTimeout>[] = []
    let t = 250
    messages.forEach((m, i) => {
      const ai = m.from === 'ai' || m.from === 'draft'
      if (ai) { timers.push(setTimeout(() => setPlay({ key, n: i, typing: true }), t)); t += 900 }
      timers.push(setTimeout(() => setPlay({ key, n: i + 1, typing: false }), t))
      t += ai ? 500 : 650
    })
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, still])

  const n = still ? messages.length : play.key === key ? play.n : 0
  const typing = !still && play.key === key && play.typing

  return (
    <div className="acp">
      <style>{ACP_CSS}</style>
      <div className="acp-head">
        <span className="acp-live"><i />{title}</span>
        <span className="acp-sub">{sub}</span>
      </div>
      <div className="acp-screen">
        <div className="acp-bar">
          <span className="acp-av">{customer.split(' ').map(w => w[0]).join('')}</span>
          <span className="acp-who"><b>{customer}</b><small>{channel}</small></span>
        </div>
        <div className="acp-thread" aria-live="polite">
          {messages.slice(0, n).map((m, i) => {
            if (m.from === 'sys') return <p key={i} className="acp-sys">{m.text}</p>
            if (m.from === 'them') return <div key={i} className="acp-row them"><p className="acp-b">{m.text}</p></div>
            return (
              <div key={i} className={`acp-row ai${m.from === 'draft' ? ' draft' : ''}`}>
                <span className="acp-face"><AiBuddy size={22} /></span>
                <div className="acp-col">
                  <span className="acp-name">{name}{m.from === 'draft' ? <em>Draft · waits for your team</em> : <em className="ai">AI</em>}</span>
                  <p className="acp-b">{m.text}</p>
                  {m.note && <span className="acp-note">{m.note}</span>}
                </div>
              </div>
            )
          })}
          {typing && (
            <div className="acp-row ai typing">
              <span className="acp-face"><AiBuddy size={22} /></span>
              <p className="acp-b acp-dots" aria-label={`${name} is typing`}><i /><i /><i /></p>
            </div>
          )}
        </div>
        <div className="acp-comp"><span>Message {customer.split(' ')[0]}…</span></div>
      </div>
    </div>
  )
}

const ACP_CSS = `
.acp{background:#fff;border-radius:22px;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04);padding:14px}
.acp-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:2px 4px 12px}
.acp-live{display:inline-flex;align-items:center;gap:8px;font-size:14.5px;font-weight:700;color:var(--ink,#111)}
.acp-live i{position:relative;width:8px;height:8px;border-radius:50%;background:#22c55e}
.acp-live i::after{content:"";position:absolute;inset:0;border-radius:50%;background:#22c55e;animation:acpPing 1.8s cubic-bezier(0,0,.2,1) infinite}
.acp-sub{font-size:12px;color:#8e8e93}
.acp-screen{border-radius:16px;overflow:hidden;background:#f6f6f8;box-shadow:inset 0 0 0 1px rgba(0,0,0,.04)}
.acp-bar{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#fff;border-bottom:1px solid #f0f0f2}
.acp-av{width:30px;height:30px;border-radius:50%;background:color-mix(in srgb,#8b5cf6 16%,#fff);color:#7c3aed;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
.acp-who{display:flex;flex-direction:column;line-height:1.25;min-width:0}
.acp-who b{font-size:13px;color:#18181b}
.acp-who small{font-size:11px;color:#8e8e93}
.acp-thread{min-height:300px;display:flex;flex-direction:column;justify-content:flex-end;gap:8px;padding:14px 12px}
.acp-row{display:flex;gap:7px;align-items:flex-end;animation:acpIn .45s cubic-bezier(.22,1,.36,1) both}
.acp-row.them{justify-content:flex-end}
.acp-b{margin:0;max-width:240px;padding:9px 12px;font-size:13px;line-height:1.45;white-space:pre-line}
.acp-row.them .acp-b{background:#18181b;color:#fff;border-radius:16px 16px 5px 16px}
.acp-row.ai .acp-b{background:#fff;color:#18181b;border-radius:16px 16px 16px 5px;box-shadow:0 0 0 1px #ececef}
.acp-row.draft .acp-b{background:#fafafa;border:1.5px dashed #d4d4d8;box-shadow:none;color:#3f3f46}
.acp-row.ai{align-items:flex-start}
.acp-face{display:inline-flex;flex-shrink:0;margin-top:20px}
.acp-row.typing .acp-face{margin-top:6px}
.acp-col{display:flex;flex-direction:column;gap:3px;min-width:0}
.acp-name{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:#71717a}
.acp-name em{font-style:normal;font-size:10.5px;font-weight:600;color:#8e8e93}
.acp-name em.ai{padding:1px 6px;border-radius:999px;background:color-mix(in srgb,var(--coral,#ff6a4d) 12%,#fff);color:var(--coral,#ff6a4d)}
.acp-note{font-size:11px;color:#8e8e93}
.acp-sys{align-self:center;margin:2px 0;padding:5px 11px;border-radius:999px;background:#ececef;font-size:11.5px;font-weight:500;color:#52525b;text-align:center;animation:acpIn .45s cubic-bezier(.22,1,.36,1) both}
.acp-dots{display:inline-flex;gap:4px;padding:12px 14px!important}
.acp-dots i{width:6px;height:6px;border-radius:50%;background:#a1a1aa;animation:acpDot 1.1s ease-in-out infinite}
.acp-dots i:nth-child(2){animation-delay:.15s}.acp-dots i:nth-child(3){animation-delay:.3s}
.acp-comp{padding:10px 12px;background:#fff;border-top:1px solid #f0f0f2}
.acp-comp span{display:block;padding:8px 12px;border-radius:999px;background:#f4f4f5;font-size:12.5px;color:#a1a1aa}
@media (max-width:700px){.acp-thread{min-height:0}}
@keyframes acpIn{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}
@keyframes acpDot{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-3px);opacity:1}}
@keyframes acpPing{0%{transform:scale(1);opacity:.6}80%,100%{transform:scale(2.4);opacity:0}}
@media (prefers-reduced-motion:reduce){.acp-row,.acp-sys{animation:none}.acp-live i::after,.acp-dots i{animation:none}}
`
