'use client'

// A coupon as a ticket: the amount on a coloured top, a perforated tear line
// with notches, then the code with Copy and when it runs out. Shown in the
// inbox thread (what the team sent) and in the chat widget (what the customer
// got), from the coupon message's payload (api/coupons/send).

import { useState } from 'react'

const CSS = `
.ctk-wrap{--ctk:#ff7a6b;width:284px;max-width:100%;filter:drop-shadow(0 6px 16px rgba(16,24,40,.14))}
.ctk{border-radius:22px;overflow:hidden;font-family:inherit;text-align:left;
  -webkit-mask:radial-gradient(circle 11px at 0 var(--ctk-cut,96px),transparent 10.5px,#000 11px) left/51% 100% no-repeat,radial-gradient(circle 11px at 100% var(--ctk-cut,96px),transparent 10.5px,#000 11px) right/51% 100% no-repeat;
  mask:radial-gradient(circle 11px at 0 var(--ctk-cut,96px),transparent 10.5px,#000 11px) left/51% 100% no-repeat,radial-gradient(circle 11px at 100% var(--ctk-cut,96px),transparent 10.5px,#000 11px) right/51% 100% no-repeat}
.ctk-top{position:relative;height:var(--ctk-cut,96px);box-sizing:border-box;padding:14px 18px 0;color:#fff;background:linear-gradient(135deg,color-mix(in srgb,var(--ctk) 88%,#fff),color-mix(in srgb,var(--ctk) 78%,#000))}
.ctk-top::after{content:'';position:absolute;right:-18px;top:-26px;width:96px;height:96px;border-radius:50%;background:rgba(255,255,255,.12)}
.ctk-tag{display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;letter-spacing:.02em;opacity:.95}
.ctk-tag b{margin-left:auto;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,.22);font-size:10.5px;font-weight:700}
.ctk-off{margin-top:6px;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:30px;font-weight:800;letter-spacing:-.03em;line-height:1}
.ctk-off small{margin-left:6px;font-family:inherit;font-size:13px;font-weight:600;letter-spacing:0;opacity:.85}
.ctk-bot{position:relative;padding:14px 18px 14px;background:#fff;color:#18181b}
.ctk-bot::before{content:'';position:absolute;left:16px;right:16px;top:0;border-top:2px dashed color-mix(in srgb,var(--ctk) 30%,#e4e4e7)}
.ctk-row{display:flex;align-items:center;gap:10px}
.ctk-code{flex:1;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:19px;font-weight:800;letter-spacing:.08em;color:#18181b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ctk-copy{flex-shrink:0;display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 12px;border:none;border-radius:999px;background:color-mix(in srgb,var(--ctk) 12%,#fff);color:color-mix(in srgb,var(--ctk) 85%,#000);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;transition:background .15s}
.ctk-copy::before{display:none!important}
.ctk-copy:hover{background:color-mix(in srgb,var(--ctk) 20%,#fff)}
.ctk-copy.done{background:#dcfce7;color:#15803d}
.ctk-meta{margin-top:6px;font-size:12px;color:#71717a}
`

const fmtOff = (display?: string | null, amount?: any, type?: string | null) => {
  const d = String(display || '').trim()
  // "$100.00 off" reads better as "$100 off".
  const m = /^\$(\d+)\.00 off$/i.exec(d)
  if (m) return `$${m[1]} off`
  if (d) return d
  const n = Number(amount) || 0
  return type === 'percent' ? `${n}% off` : `$${Number.isInteger(n) ? n : n.toFixed(2)} off`
}
const fmtDate = (s?: string | null) => {
  if (!s) return ''
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00` : s)
  return isNaN(+d) ? String(s) : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function CouponTicket({ payload, accent, label = 'Coupon', onCopied }: {
  payload: { code?: string; display_amount?: string; amount?: any; discount_type?: string; expires?: string | null; one_time?: boolean }
  accent?: string | null
  label?: string
  onCopied?: () => void
}) {
  const [copied, setCopied] = useState(false)
  const code = String(payload?.code || '')
  const off = fmtOff(payload?.display_amount, payload?.amount, payload?.discount_type)
  const [big, ...rest] = off.split(' ')
  const copy = () => {
    try { navigator.clipboard?.writeText(code)?.catch(() => {}) } catch { /* no clipboard */ }
    setCopied(true); onCopied?.()
    setTimeout(() => setCopied(false), 1600)
  }
  return (
    <div className="ctk-wrap" style={{ ...(accent ? { '--ctk': accent } : {}) } as React.CSSProperties} role="group" aria-label={`${label}: ${off}, code ${code}`}>
      <style href="colvy-coupon-ticket" precedence="default">{CSS}</style>
      <div className="ctk">
      <div className="ctk-top">
        <span className="ctk-tag">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a3 3 0 0 0 0-6V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" /><path d="m9 15 6-6M9.5 9.5h.01M14.5 14.5h.01" /></svg>
          {label}
          {payload?.one_time && <b>One use</b>}
        </span>
        <div className="ctk-off">{big}{rest.length > 0 && <small>{rest.join(' ')}</small>}</div>
      </div>
      <div className="ctk-bot">
        <div className="ctk-row">
          <span className="ctk-code" title={code}>{code}</span>
          {code && (
            <button type="button" className={`ctk-copy${copied ? ' done' : ''}`} onClick={copy} aria-label={copied ? 'Code copied' : `Copy code ${code}`}>
              {copied
                ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg> Copied</>
                : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg> Copy</>}
            </button>
          )}
        </div>
        <p className="ctk-meta" style={{ margin: '6px 0 0' }}>{payload?.expires ? `Use by ${fmtDate(payload.expires)}` : 'No expiry'}</p>
      </div>
      </div>
    </div>
  )
}
