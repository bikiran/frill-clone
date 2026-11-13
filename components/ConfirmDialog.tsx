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
//
// With a tick box (e.g. "Notify customer", ticked by default):
//
//   const r = await confirmWithCheck({ title: 'Complete order #1042?', check: { label: 'Notify customer' } })
//   if (!r.ok) return; send({ notifyCustomer: r.checked })
//
// It's usually opened from inside another popup (a refund modal, a side panel),
// so it sits above every other overlay in the app rather than behind them.

export type ConfirmOptions = {
  title?: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'primary' | 'danger'
  /** One button only: an in-app replacement for window.alert(). */
  hideCancel?: boolean
  /** 'info' for a notice rather than a question (the default for one-button dialogs). */
  icon?: 'question' | 'info'
  /** A tick box under the message; its state comes back from confirmWithCheck. */
  check?: ConfirmCheck
}

export type ConfirmCheck = {
  label: string
  /** A line under the label; `hintOff` replaces it while unticked. */
  hint?: string
  hintOff?: string
  /** Ticked unless this is false. */
  defaultChecked?: boolean
}

function open(o: ConfirmOptions): Promise<{ ok: boolean; checked: boolean }> {
  const fallback = o.check?.defaultChecked !== false
  if (typeof document === 'undefined') return Promise.resolve({ ok: false, checked: fallback })
  return new Promise(resolve => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const done = (ok: boolean, checked: boolean) => {
      resolve({ ok, checked })
      setTimeout(() => { root.unmount(); host.remove() }, 220)
    }
    root.render(<Dialog {...o} onDone={done} />)
  })
}

export function confirmDialog(opts: string | ConfirmOptions): Promise<boolean> {
  const o: ConfirmOptions = typeof opts === 'string' ? { message: opts } : opts
  return open(o).then(r => r.ok)
}

/** A confirm with a tick box: { ok, checked }. */
export function confirmWithCheck(opts: ConfirmOptions & { check: ConfirmCheck }): Promise<{ ok: boolean; checked: boolean }> {
  return open(opts)
}

/**
 * The "Notify customer" tick, ticked by default. Resolves null when cancelled,
 * else whether to tell the customer. `channel` names how they'd hear, e.g.
 * "SMS or email".
 */
export async function confirmNotify(opts: ConfirmOptions & { notifyLabel?: string; notifyHint?: string; notifyHintOff?: string }): Promise<{ notify: boolean } | null> {
  const { notifyLabel, notifyHint, notifyHintOff, ...o } = opts
  const r = await open({
    ...o,
    check: {
      label: notifyLabel || 'Notify customer',
      hint: notifyHint || 'They get the usual update by SMS or email.',
      hintOff: notifyHintOff || 'Nothing is sent to the customer about this.',
    },
  })
  return r.ok ? { notify: r.checked } : null
}

// In-app replacement for window.alert(): one button, never a browser popup.
//   await alertDialog({ title: 'Couldn’t save', message: '…' })
export function alertDialog(opts: string | Omit<ConfirmOptions, 'hideCancel' | 'cancelLabel'>): Promise<boolean> {
  const o: ConfirmOptions = typeof opts === 'string' ? { message: opts } : opts
  return confirmDialog({ tone: 'primary', confirmLabel: 'OK', ...o, hideCancel: true })
}

// A confirm that reads like a question: first sentence → title, rest → body.
function split(o: ConfirmOptions) {
  if (o.title || !o.message) return { title: o.title || 'Are you sure?', body: o.message || '' }
  const m = o.message.match(/^(.{1,90}?[?.!])\s+([\s\S]+)$/)
  return m ? { title: m[1], body: m[2] } : { title: o.message, body: '' }
}

const DANGER = /\b(delete|remove|cancel|discard|disconnect|revoke|clear|reset|archive|end|leave|block)\b/i

function Dialog({ onDone, confirmLabel, cancelLabel, tone, hideCancel, icon, check, ...o }: ConfirmOptions & { onDone: (v: boolean, checked: boolean) => void }) {
  const [closing, setClosing] = useState<null | boolean>(null)
  const [checked, setChecked] = useState(check?.defaultChecked !== false)
  const checkedRef = useRef(checked)
  checkedRef.current = checked
  const okRef = useRef<HTMLButtonElement>(null)
  const { title, body } = split(o)
  const danger = tone ? tone === 'danger' : DANGER.test(`${o.title || ''} ${o.message || ''}`)
  const close = (v: boolean) => { if (closing !== null) return; setClosing(v); onDone(v, checkedRef.current) }
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
        .cd-overlay{position:fixed;inset:0;z-index:2147483600;background:rgba(17,17,20,.38);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px;animation:cdFade .18s ease both;font-family:inherit}
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
        .cd-check{display:flex;gap:11px;align-items:flex-start;margin:16px 0 0;padding:12px 13px;border-radius:13px;background:#f6f6f7;cursor:pointer;user-select:none;transition:background .15s}
        .cd-check:hover{background:#f0f0f2}
        .cd-check input{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}
        .cd-box-tick{width:21px;height:21px;border-radius:7px;flex-shrink:0;margin-top:1px;display:flex;align-items:center;justify-content:center;border:2px solid #c9cbd1;background:#fff;color:#fff;transition:background .18s,border-color .18s,transform .18s cubic-bezier(.22,1,.36,1)}
        .cd-check.on .cd-box-tick{background:var(--coral,#ff7a6b);border-color:var(--coral,#ff7a6b)}
        .cd-check:active .cd-box-tick{transform:scale(.9)}
        .cd-check input:focus-visible + .cd-box-tick{outline:3px solid rgba(255,122,107,.35);outline-offset:2px}
        .cd-box-tick svg{opacity:0;transform:scale(.6);transition:opacity .15s,transform .2s cubic-bezier(.22,1,.36,1)}
        .cd-check.on .cd-box-tick svg{opacity:1;transform:none}
        .cd-check-l{font-size:14px;font-weight:700;color:var(--ink,#111);line-height:1.35}
        .cd-check-h{font-size:12.5px;color:var(--slate,#6b7280);margin-top:2px;line-height:1.45}
        @keyframes cdUp{from{transform:translate3d(0,100%,0)}to{transform:none}}
        @keyframes cdDown{from{transform:none}to{transform:translate3d(0,100%,0)}}
        @media (prefers-reduced-motion: reduce){.cd-overlay,.cd-box{animation:none!important}.cd-box-tick,.cd-box-tick svg{transition:none!important}}
      `}</style>
      <div className="cd-box" role="alertdialog" aria-modal="true" aria-labelledby="cd-title" aria-describedby={body ? 'cd-body' : undefined}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: danger ? '#fef2f2' : 'var(--peach,#fff1ee)', color: danger ? '#dc2626' : 'var(--coral,#ff7a6b)' }}>
            {danger
              ? <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9.5v4M12 17h.01" /></svg>
              : (icon ? icon === 'info' : hideCancel)
              ? <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
              : <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.3M12 17h.01" /></svg>}
          </span>
          <div style={{ minWidth: 0, paddingTop: 2 }}>
            <div id="cd-title" style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink,#111)', lineHeight: 1.35 }}>{title}</div>
            {body && <div id="cd-body" style={{ fontSize: 13.5, color: 'var(--slate,#6b7280)', marginTop: 6, lineHeight: 1.55, whiteSpace: 'pre-line' }}>{body}</div>}
          </div>
        </div>
        {check && (
          <label className={`cd-check${checked ? ' on' : ''}`}>
            <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />
            <span className="cd-box-tick" aria-hidden><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>
            <span style={{ minWidth: 0 }}>
              <span className="cd-check-l" style={{ display: 'block' }}>{check.label}</span>
              {(checked ? check.hint : (check.hintOff ?? check.hint)) && <span className="cd-check-h" style={{ display: 'block' }}>{checked ? check.hint : (check.hintOff ?? check.hint)}</span>}
            </span>
          </label>
        )}
        <div className="cd-actions">
          {!hideCancel && <button className="cd-btn cd-cancel" onClick={() => close(false)}>{cancelLabel || 'Cancel'}</button>}
          <button ref={okRef} className="cd-btn cd-ok" style={{ background: danger ? '#dc2626' : 'var(--coral,#ff7a6b)' }} onClick={() => close(true)}>{okLabel}</button>
        </div>
      </div>
    </div>
  )
}
