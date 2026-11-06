'use client'

// Send receipt: email or text a customer the receipt / tax invoice for an
// order, as a private link they can open, print or save as a PDF (the same
// receipt their customer account shows). Opened from the Orders page drawer
// and the inbox's order cards. Server: app/api/orders/receipt.

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'

type Target = { orderId?: string; wooOrderId?: number | string; key?: string }
type Prep = {
  url: string
  to: { email: string | null; phone: string | null; name: string | null }
  receipt: { title: string; number: string; total: string; gst: string | null; status: string; statusLabel: string; customer: string | null }
}

export default function SendReceipt({ companyId, target, onClose, onSent }: { companyId: string; target: Target; onClose: () => void; onSent?: (msg: string) => void }) {
  const [prep, setPrep] = useState<Prep | null>(null)
  const [err, setErr] = useState('')
  const [channel, setChannel] = useState<'email' | 'sms'>('email')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const post = (body: any) => authFetch('/api/orders/receipt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, ...target, ...body }) })
    .then(async r => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))

  useEffect(() => {
    let live = true
    post({ action: 'prepare' }).then(({ ok, data }) => {
      if (!live) return
      if (!ok) { setErr(data.error || 'Couldn’t load the receipt.'); return }
      setPrep(data)
      const ch = data.to?.email ? 'email' : data.to?.phone ? 'sms' : 'email'
      setChannel(ch); setTo(ch === 'email' ? (data.to?.email || '') : (data.to?.phone || ''))
    })
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => { live = false; document.removeEventListener('keydown', esc) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (ch: 'email' | 'sms') => { setChannel(ch); setErr(''); setTo(ch === 'email' ? (prep?.to.email || '') : (prep?.to.phone || '')) }
  const send = async () => {
    if (!to.trim()) { setErr(channel === 'email' ? 'Add an email address.' : 'Add a mobile number.'); return }
    setBusy(true); setErr('')
    const { ok, data } = await post({ action: 'send', channel, to: to.trim() })
    setBusy(false)
    if (!ok) { setErr(data.error || 'Couldn’t send it. Please try again.'); return }
    onSent?.(`${prep?.receipt.title || 'Receipt'} ${channel === 'email' ? 'emailed' : 'texted'} to ${to.trim()}`)
    onClose()
  }
  const copy = async () => {
    if (!prep) return
    try { await navigator.clipboard.writeText(prep.url); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { window.prompt('Copy the receipt link', prep.url) }
  }

  const r = prep?.receipt
  return (
    <div className="srx-wrap" role="dialog" aria-modal="true" aria-label="Send receipt" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <style>{SRX_CSS}</style>
      <div className="srx">
        <div className="srx-head">
          <div>
            <h3>Send receipt</h3>
            <p>The customer gets a private link to view, print or save it as a PDF.</p>
          </div>
          <button type="button" className="srx-x" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {!prep && !err && <div className="srx-skel" />}
        {r && (
          <div className="srx-card">
            <div className="srx-ico" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>
            </div>
            <div className="srx-main">
              <b>{r.title} {r.number}</b>
              <span>{[r.customer, r.gst ? `${r.total} incl. GST ${r.gst}` : r.total].filter(Boolean).join(' · ')}</span>
            </div>
            <span className={`srx-st ${r.status}`}>{r.statusLabel}</span>
          </div>
        )}

        {prep && (
          <>
            <div className="srx-seg" role="tablist" aria-label="Send by">
              <button type="button" role="tab" aria-selected={channel === 'email'} className={channel === 'email' ? 'on' : ''} onClick={() => pick('email')}>Email</button>
              <button type="button" role="tab" aria-selected={channel === 'sms'} className={channel === 'sms' ? 'on' : ''} onClick={() => pick('sms')}>Text</button>
            </div>
            <label className="srx-field">
              <span>{channel === 'email' ? 'Email address' : 'Mobile number'}</span>
              <input value={to} onChange={e => setTo(e.target.value)} inputMode={channel === 'email' ? 'email' : 'tel'} type={channel === 'email' ? 'email' : 'tel'}
                placeholder={channel === 'email' ? 'name@example.com' : '04xx xxx xxx'} autoFocus onKeyDown={e => { if (e.key === 'Enter') send() }} />
            </label>
          </>
        )}
        {err && <p className="srx-err" role="alert">{err}</p>}

        <div className="srx-acts">
          {prep && (
            <>
              <a className="srx-ghost" href={prep.url} target="_blank" rel="noreferrer">Preview</a>
              <button type="button" className="srx-ghost" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
            </>
          )}
          <button type="button" className="srx-go" disabled={!prep || busy} onClick={send}>{busy ? 'Sending…' : channel === 'email' ? 'Email receipt' : 'Text receipt'}</button>
        </div>
      </div>
    </div>
  )
}

const SRX_CSS = `
.srx-wrap{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(17,17,17,.42);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);animation:srxFade .18s ease}
@keyframes srxFade{from{opacity:0}}
@keyframes srxRise{from{opacity:0;transform:translateY(10px) scale(.98)}}
.srx{width:100%;max-width:440px;background:var(--card,#fff);color:var(--ink,#111);border-radius:24px;padding:22px 22px 18px;box-shadow:0 30px 80px -30px rgba(0,0,0,.45);display:flex;flex-direction:column;gap:14px;animation:srxRise .24s cubic-bezier(.22,1,.36,1)}
.srx-head{display:flex;justify-content:space-between;gap:12px}
.srx-head h3{margin:0;font-size:19px;font-weight:800;letter-spacing:-.01em}
.srx-head p{margin:4px 0 0;font-size:13.5px;line-height:1.5;color:var(--slate,#6b7280)}
.srx-x{flex-shrink:0;width:34px;height:34px;border-radius:999px;border:1px solid var(--border,#ececef);background:var(--card,#fff);color:var(--slate,#6b7280);display:grid;place-items:center;cursor:pointer}
.srx-x svg{width:15px;height:15px}
.srx-skel{height:64px;border-radius:16px;background:linear-gradient(90deg,#f3f3f5,#ebebee,#f3f3f5);background-size:200% 100%;animation:srxShim 1.2s linear infinite}
@keyframes srxShim{to{background-position:-200% 0}}
.srx-card{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;background:var(--soft,#f7f7f8);border:1px solid var(--border,#ececef)}
.srx-ico{width:38px;height:38px;border-radius:12px;background:var(--card,#fff);border:1px solid var(--border,#ececef);display:grid;place-items:center;color:var(--coral,#ff7a6b);flex-shrink:0}
.srx-ico svg{width:19px;height:19px}
.srx-main{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
.srx-main b{font-size:14.5px}
.srx-main span{font-size:12.5px;color:var(--slate,#6b7280);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.srx-st{font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:999px;background:#ecfdf3;color:#067647;flex-shrink:0}
.srx-st.unpaid{background:#fffaeb;color:#b54708}
.srx-st.refunded,.srx-st.cancelled{background:#f4f4f5;color:#52525b}
.srx-seg{display:flex;gap:4px;padding:4px;border-radius:999px;background:var(--soft,#f4f4f5);align-self:flex-start}
.srx-seg button{border:0;background:transparent;padding:7px 16px;border-radius:999px;font-size:13px;font-weight:700;color:var(--slate,#6b7280);cursor:pointer}
.srx-seg button.on{background:var(--card,#fff);color:var(--ink,#111);box-shadow:0 1px 3px rgba(0,0,0,.12)}
.srx-field{display:flex;flex-direction:column;gap:6px}
.srx-field span{font-size:12.5px;font-weight:700;color:var(--slate,#6b7280)}
.srx-field input{height:44px;border-radius:12px;border:1px solid var(--border,#e4e4e7);background:var(--soft,#f7f7f8);padding:0 14px;font-size:15px;color:var(--ink,#111);outline:none}
.srx-field input:focus{border-color:var(--coral,#ff7a6b);background:var(--card,#fff);box-shadow:0 0 0 3px rgba(255,122,107,.18)}
.srx-err{margin:0;font-size:13px;color:#b42318}
.srx-acts{display:flex;align-items:center;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:2px}
.srx-ghost{height:40px;padding:0 15px;border-radius:999px;border:1px solid var(--border,#e4e4e7);background:var(--card,#fff);color:var(--ink,#111);font-size:13.5px;font-weight:700;display:inline-flex;align-items:center;text-decoration:none;cursor:pointer}
.srx-go{height:40px;padding:0 18px;border-radius:999px;border:0;background:var(--coral,#ff7a6b);color:#fff;font-size:13.5px;font-weight:800;cursor:pointer}
.srx-go:disabled{opacity:.6;cursor:default}
@media(max-width:480px){.srx-wrap{align-items:flex-end;padding:0}.srx{border-radius:24px 24px 0 0;padding-bottom:calc(18px + env(safe-area-inset-bottom))}.srx-acts .srx-go{flex:1}}
`
