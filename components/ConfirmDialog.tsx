'use client'

import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

// In-app replacement for window.confirm(): a Colvy-styled dialog that
// animates in (a bottom sheet on phones). Call it from anywhere — no provider:
//
//   if (!(await confirmDialog('Remove this customer?'))) return
//   await confirmDialog({ title: 'Delete service?', message: '…', confirmLabel: 'Delete', tone: 'danger' })
//
// Esc / clicking outside = cancel, Enter = confirm.

export type ConfirmOptions = {
  title?: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'primary' | 'danger'
}

export function confirmDialog(opts: string | ConfirmOptions): Promise<boolean> {
  const o: ConfirmOptions = typeof opts === 'string' ? { message: opts } : opts
  if (typeof document === 'undefined') return Promise.resolve(false)
  return new Promise(resolve => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const done = (v: boolean) => {
      resolve(v)
      setTimeout(() => { root.unmount(); host.remove() }, 220)
    }
    root.render(<Dialog {...o} onDone={done} />)
  })
}

// A confirm that reads like a question: first sentence → title, rest → body.
function split(o: ConfirmOptions) {
  if (o.title || !o.message) return { title: o.title || 'Are you sure?', body: o.message || '' }
  const m = o.message.match(/^(.{1,90}?[?.!])\s+([\s\S]+)$/)
  return m ? { title: m[1], body: m[2] } : { title: o.message, body: '' }
}

const DANGER = /\b(delete|remove|cancel|discard|disconnect|revoke|clear|reset|archive|end|leave|block)\b/i

function Dialog({ onDone, confirmLabel, cancelLabel, tone, ...o }: ConfirmOptions & { onDone: (v: boolean) => void }) {
  const [closing, setClosing] = useState<null | boolean>(null)
  const okRef = useRef<HTMLButtonElement>(null)
  const { title, body } = split(o)
  const danger = tone ? tone === 'danger' : DANGER.test(`${o.title || ''} ${o.message || ''}`)
  const close = (v: boolean) => { if (closing !== null) return; setClosing(v); onDone(v) }
  // "Remove X from…?" → a "Remove" button, rather than a generic "Yes".
  const verb = (o.title || o.message || '').match(/^\s*(delete|remove|cancel|discard|disconnect|revoke|clear|reset|archive|end|leave|block|send|text|publish|archive|restore|resend|refund|mark|move|merge|unlink|suspend|reactivate)\b/i)?.[1]
  const okLabel = confirmLabel || (verb ? verb.charAt(0).toUpperCase() + verb.slice(1).toLowerCase() : danger ? 'Yes, continue' : 'OK')

  useEffect(() => {
    okRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(false) }
      else if (e.key === 'Enter') { e.preventDefault(); close(true) }
    }
    window.addEventListener('keydown', onKey, true)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey, true); document.body.style.overflow = prev }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const out = closing !== null
  return (
    <div className={`cd-overlay${out ? ' out' : ''}`} onMouseDown={e => { if (e.target === e.currentTarget) close(false) }} role="presentation">
      <style>{`
        .cd-overlay{position:fixed;inset:0;z-index:5000;background:rgba(17,17,20,.38);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px;animation:cdFade .18s ease both;font-family:inherit}
        .cd-overlay.out{animation:cdFadeOut .2s ease both}
        .cd-box{width:100%;max-width:400px;background:#fff;border-radius:18px;box-shadow:0 30px 70px -20px rgba(0,0,0,.4);padding:22px 22px 18px;animation:cdIn .32s cubic-bezier(.22,1,.36,1) both}
        .cd-overlay.out .cd-box{animation:cdOut .2s ease both}
        .cd-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}
        .cd-btn{min-height:40px;padding:0 18px;border-radius:11px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;transition:transform .15s cubic-bezier(.22,1,.36,1),filter .15s,background .15s}
        .cd-btn:active{transform:scale(.96)}
        .cd-cancel{border:1px solid var(--border,#e5e7eb);background:#fff;color:var(--ink,#111)}
        .cd-cancel:hover{background:#f7f7f8}
        .cd-ok{border:none;color:#fff}
        .cd-ok:hover{filter:brightness(1.06)}
        .cd-ok:focus-visible,.cd-cancel:focus-visible{outline:3px solid rgba(255,122,107,.35);outline-offset:2px}
        @keyframes cdFade{from{opacity:0}to{opacity:1}}
        @keyframes cdFadeOut{from{opacity:1}to{opacity:0}}
        @keyframes cdIn{from{opacity:0;transform:translate3d(0,10px,0) scale(.96)}to{opacity:1;transform:none}}
        @keyframes cdOut{from{opacity:1;transform:none}to{opacity:0;transform:scale(.97)}}
        @media(max-width:560px){
          .cd-overlay{align-items:flex-end;padding:0}
          .cd-box{max-width:none;border-radius:20px 20px 0 0;padding:22px 18px calc(16px + env(safe-area-inset-bottom));animation-name:cdUp}
          .cd-overlay.out .cd-box{animation-name:cdDown}
          .cd-actions{flex-direction:column-reverse}
          .cd-btn{min-height:48px;width:100%;font-size:15px}
        }
        @keyframes cdUp{from{transform:translate3d(0,100%,0)}to{transform:none}}
        @keyframes cdDown{from{transform:none}to{transform:translate3d(0,100%,0)}}
        @media (prefers-reduced-motion: reduce){.cd-overlay,.cd-box{animation:none!important}}
      `}</style>
      <div className="cd-box" role="alertdialog" aria-modal="true" aria-labelledby="cd-title" aria-describedby={body ? 'cd-body' : undefined}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: danger ? '#fef2f2' : 'var(--peach,#fff1ee)', color: danger ? '#dc2626' : 'var(--coral,#ff7a6b)' }}>
            {danger
              ? <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9.5v4M12 17h.01" /></svg>
              : <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.3M12 17h.01" /></svg>}
          </span>
          <div style={{ minWidth: 0, paddingTop: 2 }}>
            <div id="cd-title" style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink,#111)', lineHeight: 1.35 }}>{title}</div>
            {body && <div id="cd-body" style={{ fontSize: 13.5, color: 'var(--slate,#6b7280)', marginTop: 6, lineHeight: 1.55, whiteSpace: 'pre-line' }}>{body}</div>}
          </div>
        </div>
        <div className="cd-actions">
          <button className="cd-btn cd-cancel" onClick={() => close(false)}>{cancelLabel || 'Cancel'}</button>
          <button ref={okRef} className="cd-btn cd-ok" style={{ background: danger ? '#dc2626' : 'var(--coral,#ff7a6b)' }} onClick={() => close(true)}>{okLabel}</button>
        </div>
      </div>
    </div>
  )
}
