'use client'

// The designer's previews, so the email is seen where customers see it:
//   • Phone: a modern phone (titanium edge, Dynamic Island, status bar, side
//     buttons) open in a mail app, with the sender, subject and the email;
//   • Desktop: a mail app window;
//   • Inbox: the phone's inbox list, where the subject and preview text have
//     to earn the open.
// The phone scales down to fit the panel; the email itself is the rendered
// HTML in an iframe, exactly what's sent.

import { useEffect, useRef, useState } from 'react'

export type FrameProps = {
  html: string
  from: string
  fromAddress?: string
  subject: string
  previewText: string
  accent: string
  iframeRef?: React.Ref<HTMLIFrameElement>
  onFrameLoad?: () => void
}

const initial = (s: string) => (String(s || '').trim()[0] || '•').toUpperCase()

function StatusBar() {
  return (
    <div className="dv-status">
      <span>9:41</span>
      <span className="dv-status-r" aria-hidden>
        <svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="currentColor" /><rect x="10" y="3" width="3" height="9" rx="1" fill="currentColor" /><rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor" /></svg>
        <svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 2.2c2.4 0 4.6.9 6.3 2.5l1.2-1.3A10.6 10.6 0 0 0 8 .4C5.2.4 2.5 1.5.5 3.4l1.2 1.3A8.8 8.8 0 0 1 8 2.2zm0 3.7c1.4 0 2.7.5 3.7 1.4l1.2-1.3A7 7 0 0 0 8 4.1 7 7 0 0 0 3.1 6l1.2 1.3c1-.9 2.3-1.4 3.7-1.4zm0 3.6c.5 0 1 .2 1.3.5L8 11.6 6.7 10c.3-.3.8-.5 1.3-.5z" fill="currentColor" /></svg>
        <span className="dv-batt"><i /></span>
      </span>
    </div>
  )
}

/** A phone body that scales to fit its box. */
function Phone({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const fit = () => {
      const r = el.getBoundingClientRect()
      setScale(Math.max(0.45, Math.min(1, (r.height - 8) / 844, (r.width - 8) / 410)))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div className="dv-fit" ref={box}>
      <div className="dv-phone" style={{ transform: `scale(${scale})` }}>
        <span className="dv-btn act" aria-hidden /><span className="dv-btn up" aria-hidden /><span className="dv-btn down" aria-hidden /><span className="dv-btn pwr" aria-hidden />
        <div className="dv-screen">
          <span className="dv-island" aria-hidden />
          <StatusBar />
          {children}
          <span className="dv-home" aria-hidden />
        </div>
      </div>
    </div>
  )
}

export function PhonePreview({ html, from, subject, accent, iframeRef, onFrameLoad }: FrameProps) {
  return (
    <Phone>
      <div className="dv-mailbar">
        <span className="dv-back"><svg width="11" height="18" viewBox="0 0 11 18" aria-hidden><path d="M9 1 1.5 9 9 17" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>Inbox</span>
        <span className="dv-mailbar-r" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 15 6-6 6 6" /></svg>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>
        </span>
      </div>
      <div className="dv-msghead">
        <span className="dv-av" style={{ background: accent }}>{initial(from)}</span>
        <div className="dv-msghead-t">
          <div className="dv-row"><b>{from}</b><small>9:41 AM</small></div>
          <span className="dv-to">To: Sarah</span>
        </div>
      </div>
      <p className="dv-subject">{subject || 'No subject yet'}</p>
      <iframe ref={iframeRef} className="dv-frame" title="Email on a phone" srcDoc={html} sandbox="allow-same-origin" onLoad={onFrameLoad} />
    </Phone>
  )
}

export function DesktopPreview({ html, from, fromAddress, subject, accent, iframeRef, onFrameLoad }: FrameProps) {
  return (
    <div className="dv-win">
      <div className="dv-win-bar">
        <span className="dv-dots" aria-hidden><i /><i /><i /></span>
        <span className="dv-win-title">Inbox</span>
        <span className="dv-win-tools" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" /></svg>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 17 4 12l5-5M20 18v-2a4 4 0 0 0-4-4H4" /></svg>
        </span>
      </div>
      <div className="dv-win-head">
        <span className="dv-av" style={{ background: accent }}>{initial(from)}</span>
        <div className="dv-win-head-t">
          <div className="dv-row"><b>{from}</b>{fromAddress && <span className="dv-addr">&lt;{fromAddress}&gt;</span>}<small>Today, 9:41 AM</small></div>
          <p>{subject || 'No subject yet'}</p>
        </div>
      </div>
      <iframe ref={iframeRef} className="dv-frame" title="Email on a computer" srcDoc={html} sandbox="allow-same-origin" onLoad={onFrameLoad} />
    </div>
  )
}

// Neighbours in the inbox: plain, made-up senders, greyed so the email stands out.
const OTHERS = [
  { from: 'Parcel tracking', subject: 'Your parcel is on its way', pre: 'It should arrive in 2–3 business days.', time: '8:12 AM' },
  { from: 'Your bank', subject: 'Your monthly statement is ready', pre: 'Log in to view your statement for October.', time: 'Yesterday' },
  { from: 'Weekly newsletter', subject: 'This week’s top stories', pre: 'Five things worth reading this weekend.', time: 'Yesterday' },
]

export function InboxPreview({ from, subject, previewText, accent }: FrameProps) {
  return (
    <Phone>
      <div className="dv-inbox">
        <div className="dv-inbox-top"><span className="dv-back"><svg width="11" height="18" viewBox="0 0 11 18" aria-hidden><path d="M9 1 1.5 9 9 17" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>Mailboxes</span><span className="dv-edit">Edit</span></div>
        <h4>Inbox</h4>
        <div className="dv-search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>Search</div>
        <div className="dv-item me">
          <span className="dv-unread" style={{ background: accent }} aria-hidden />
          <div className="dv-item-t">
            <div className="dv-row"><b>{from}</b><small>9:41 AM</small></div>
            <span className="dv-item-s">{subject || 'No subject yet'}</span>
            <span className="dv-item-p">{previewText || 'Your preview text shows here. Without it, inboxes show the first words of the email.'}</span>
          </div>
        </div>
        {OTHERS.map(o => (
          <div key={o.from} className="dv-item">
            <span className="dv-unread off" aria-hidden />
            <div className="dv-item-t">
              <div className="dv-row"><b>{o.from}</b><small>{o.time}</small></div>
              <span className="dv-item-s">{o.subject}</span>
              <span className="dv-item-p">{o.pre}</span>
            </div>
          </div>
        ))}
      </div>
    </Phone>
  )
}

export const DEVICES_CSS = `
.dv-fit{position:relative;flex:1;min-height:0;display:flex;align-items:flex-start;justify-content:center;overflow:hidden}
.dv-phone{position:relative;flex-shrink:0;width:400px;height:836px;padding:11px;border-radius:64px;transform-origin:top center;
  background:linear-gradient(150deg,#e7e4df 0%,#a19d97 18%,#d9d5cf 38%,#7d7a74 62%,#c8c4be 82%,#8e8a84 100%);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.55),inset 0 0 0 2.5px rgba(0,0,0,.18),0 0 0 1px rgba(0,0,0,.18),0 40px 80px -30px rgba(16,24,40,.55),0 18px 36px -18px rgba(16,24,40,.35)}
.dv-btn{position:absolute;width:4px;border-radius:2px;background:linear-gradient(90deg,#6f6c67,#b5b1ab 60%,#7f7b76)}
.dv-btn.act{left:-3px;top:150px;height:32px}
.dv-btn.up{left:-3px;top:206px;height:60px}
.dv-btn.down{left:-3px;top:278px;height:60px}
.dv-btn.pwr{right:-3px;top:236px;height:96px}
.dv-screen{position:relative;width:100%;height:100%;display:flex;flex-direction:column;overflow:hidden;border-radius:53px;background:#fff;box-shadow:0 0 0 5px #0b0b0d}
.dv-island{position:absolute;top:11px;left:50%;z-index:3;width:122px;height:35px;border-radius:20px;background:#000;transform:translateX(-50%)}
.dv-status{display:flex;align-items:center;justify-content:space-between;height:54px;padding:6px 30px 0 40px;flex-shrink:0;font:600 16px/1 -apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif;color:#000}
.dv-status-r{display:flex;align-items:center;gap:6px}
.dv-batt{position:relative;display:inline-block;width:25px;height:12px;border-radius:4px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.4)}
.dv-batt::after{content:'';position:absolute;right:-3px;top:4px;width:2px;height:4px;border-radius:0 1px 1px 0;background:rgba(0,0,0,.4)}
.dv-batt i{position:absolute;inset:2px;width:16px;border-radius:2px;background:#000}
.dv-home{position:absolute;bottom:8px;left:50%;width:136px;height:5px;border-radius:3px;background:#111;transform:translateX(-50%);z-index:3}
.dv-mailbar{display:flex;align-items:center;justify-content:space-between;padding:4px 18px 8px 12px;flex-shrink:0;color:#0a84ff}
.dv-back{display:inline-flex;align-items:center;gap:5px;font:400 17px/1 -apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif;color:#0a84ff}
.dv-mailbar-r{display:flex;gap:14px}
.dv-msghead{display:flex;align-items:center;gap:10px;padding:6px 18px 4px;flex-shrink:0}
.dv-av{width:40px;height:40px;flex-shrink:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font:700 17px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff}
.dv-msghead-t,.dv-win-head-t,.dv-item-t{flex:1;min-width:0}
.dv-row{display:flex;align-items:baseline;gap:8px;min-width:0}
.dv-row b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:600 15px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111}
.dv-row small{margin-left:auto;flex-shrink:0;font:400 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#8e8e93}
.dv-to{font:400 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#8e8e93}
.dv-subject{margin:6px 0 0;padding:0 18px 10px;flex-shrink:0;border-bottom:1px solid #ececef;font:700 19px/1.25 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;overflow-wrap:anywhere}
.dv-frame{flex:1;min-height:0;width:100%;border:0;display:block;background:#fff}
.dv-win{display:flex;flex-direction:column;flex:1;min-height:0;border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.08),0 24px 50px -26px rgba(16,24,40,.4)}
.dv-win-bar{position:relative;display:flex;align-items:center;gap:10px;height:42px;padding:0 14px;flex-shrink:0;background:linear-gradient(#f7f7f8,#efeff1);border-bottom:1px solid #e4e4e7}
.dv-dots{display:flex;gap:7px}
.dv-dots i{width:12px;height:12px;border-radius:50%;background:#ff5f57;box-shadow:inset 0 0 0 .5px rgba(0,0,0,.15)}
.dv-dots i:nth-child(2){background:#febc2e}.dv-dots i:nth-child(3){background:#28c840}
.dv-win-title{position:absolute;left:50%;transform:translateX(-50%);font:600 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#6b6b70}
.dv-win-tools{display:flex;gap:14px;margin-left:auto;color:#7a7a80}
.dv-win-head{display:flex;align-items:flex-start;gap:12px;padding:16px 22px;flex-shrink:0;border-bottom:1px solid #f0f0f2}
.dv-win-head p{margin:4px 0 0;font:700 18px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;overflow-wrap:anywhere}
.dv-addr{flex-shrink:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:400 13px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#8e8e93}
.dv-inbox{flex:1;min-height:0;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif}
.dv-inbox-top{display:flex;align-items:center;justify-content:space-between;padding:4px 18px 0 12px}
.dv-edit{font-size:17px;color:#0a84ff}
.dv-inbox h4{margin:8px 18px 10px;font-size:34px;font-weight:700;letter-spacing:-.02em;color:#000}
.dv-search{display:flex;align-items:center;gap:7px;height:36px;margin:0 16px 8px;padding:0 10px;border-radius:10px;background:#efeff0;font-size:16px;color:#8e8e93}
.dv-item{display:flex;gap:6px;padding:11px 18px 11px 8px;border-bottom:1px solid #ececef}
.dv-item:not(.me){opacity:.45}
.dv-item.me{background:color-mix(in srgb,#0a84ff 6%,#fff)}
.dv-unread{width:10px;height:10px;flex-shrink:0;margin-top:5px;border-radius:50%}
.dv-unread.off{background:transparent}
.dv-item-s{display:block;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;font-weight:500;color:#111}
.dv-item.me .dv-item-s{font-weight:600}
.dv-item-p{display:-webkit-box;margin-top:2px;overflow:hidden;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:14px;line-height:1.35;color:#8e8e93}
`
