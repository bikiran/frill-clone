'use client'

import { useEffect } from 'react'

// Shown before Colvy sends someone to Google's Gmail consent screen. Two
// things on that screen trip people up:
//   1. while Google is still reviewing Colvy, a "Google hasn't verified this
//      app" warning comes first (Advanced → Go to Colvy gets past it);
//   2. the two permissions are separate checkboxes, unticked, and pressing
//      Continue without ticking both connects nothing useful.
// It also offers the ways in that don't need Google at all: forwarding to the
// Colvy address, or a domain mailbox.
//
// Set NEXT_PUBLIC_GOOGLE_APP_VERIFIED=true once Google has verified the app
// and the warning step disappears.

export const GOOGLE_APP_VERIFIED = /^(1|true|yes)$/i.test(process.env.NEXT_PUBLIC_GOOGLE_APP_VERIFIED || '')

const GoogleG = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z"/><path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
)

const Tick = () => (
  <span style={{ width: 18, height: 18, borderRadius: 4, background: '#1a73e8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
  </span>
)

export default function GmailConnectExplainer({ onContinue, onCancel, onAddDomain, onCopyAlias, forwardingAlias, busy }: {
  onContinue: () => void
  onCancel: () => void
  onAddDomain: () => void
  onCopyAlias: () => void
  forwardingAlias: string
  busy?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onCancel])

  const steps: { title: string; body: React.ReactNode }[] = []
  if (!GOOGLE_APP_VERIFIED) steps.push({
    title: 'Google may say “Google hasn’t verified this app”',
    body: (
      <>
        Colvy is still going through Google’s review, so Google shows this warning first. Tap <strong>Advanced</strong>, then <strong>Go to Colvy (unsafe)</strong>. Google only says “unsafe” because its review isn’t finished.
        <span className="gx-mock gx-mock-row">
          <span style={{ textDecoration: 'underline', color: 'var(--slate)' }}>Advanced</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          <span style={{ textDecoration: 'underline', color: '#1a73e8' }}>Go to Colvy (unsafe)</span>
        </span>
      </>
    ),
  })
  steps.push({
    title: 'Tick both boxes',
    body: (
      <>
        Google lists two permissions and leaves them unticked. Colvy needs both: one to bring your email in, one to send your replies. Tick each box, or <strong>Select all</strong>.
        <span className="gx-mock">
          <span className="gx-perm"><span>View your email messages and settings</span><Tick /></span>
          <span className="gx-perm"><span>Send email on your behalf</span><Tick /></span>
        </span>
      </>
    ),
  })
  steps.push({
    title: 'Press Continue',
    body: <>You’ll come straight back here and your Gmail inbox starts syncing. Colvy can’t delete or change your email.</>,
  })

  return (
    <div className="gx-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onCancel() }}>
      <style>{`
        .gx-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(17,17,20,.38);display:flex;align-items:center;justify-content:center;padding:16px}
        .gx-box{width:100%;max-width:760px;max-height:calc(100vh - 32px);overflow-y:auto;background:#fff;border-radius:18px;border:1px solid var(--border);box-shadow:0 30px 70px -20px rgba(0,0,0,.35);padding:24px}
        .gx-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .gx-step{display:flex;gap:12px;padding:14px 0;border-top:1px solid var(--border)}
        .gx-num{width:26px;height:26px;border-radius:50%;background:var(--peach);color:var(--coral);font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .gx-mock{display:flex;flex-direction:column;gap:0;margin-top:10px;border:1px solid var(--border);border-radius:10px;padding:2px 12px;background:var(--canvas)}
        .gx-mock-row{flex-direction:row;align-items:center;gap:10px;padding:9px 12px;font-size:13px;font-weight:600;width:max-content;max-width:100%}
        .gx-perm{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;font-size:13px;color:var(--ink)}
        .gx-perm+.gx-perm{border-top:1px solid var(--border)}
        .gx-alt{border:1px solid var(--border);border-radius:12px;padding:14px;background:#fff;display:flex;flex-direction:column;gap:8px}
        .gx-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:6px}
        .gx-btn{min-height:42px;padding:0 18px;border-radius:10px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px}
        @media(max-width:640px){
          .gx-overlay{align-items:flex-end;padding:0}
          .gx-box{max-width:none;max-height:92vh;border-radius:20px 20px 0 0;padding:20px 16px calc(16px + env(safe-area-inset-bottom))}
          .gx-grid{grid-template-columns:1fr}
          .gx-actions{flex-direction:column-reverse}
          .gx-btn{width:100%;min-height:48px;font-size:15px}
        }
      `}</style>
      <div className="gx-box" role="dialog" aria-modal="true" aria-labelledby="gx-title">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><GoogleG size={20} /></span>
          <div style={{ minWidth: 0 }}>
            <h2 id="gx-title" style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>Connect a Gmail account</h2>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--slate)' }}>Takes about a minute. Here’s what Google will show you.</p>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          {steps.map((s, i) => (
            <div key={i} className="gx-step">
              <span className="gx-num">{i + 1}</span>
              <div style={{ minWidth: 0, fontSize: 13.5, color: 'var(--slate)', lineHeight: 1.55 }}>
                <p style={{ margin: '2px 0 4px', fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>{s.title}</p>
                {s.body}
              </div>
            </div>
          ))}
        </div>

        <div className="gx-actions" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <button className="gx-btn" onClick={onCancel} style={{ border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)' }}>Cancel</button>
          <button className="gx-btn" onClick={onContinue} disabled={busy} style={{ border: 'none', background: 'var(--coral)', color: '#fff', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Opening Google…' : 'Continue to Google'}
          </button>
        </div>

        <p style={{ margin: '20px 0 10px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--slate)' }}>Rather not sign in with Google?</p>
        <div className="gx-grid">
          <div className="gx-alt">
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 17l5-5-5-5" /><path d="M4 18v-2a4 4 0 0 1 4-4h12" /></svg>
              Forward your email to Colvy
            </p>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.55 }}>
              Works with Gmail, Outlook and any email host. In Gmail: Settings, See all settings, Forwarding and POP/IMAP, Add a forwarding address. Replies are sent by Colvy under your business name.
            </p>
            {forwardingAlias ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <code style={{ flex: 1, minWidth: 0, padding: '7px 9px', borderRadius: 8, background: 'var(--canvas)', border: '1px solid var(--border)', fontSize: 12.5, wordBreak: 'break-all' }}>{forwardingAlias}</code>
                <button onClick={onCopyAlias} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', color: 'var(--ink)' }}>Copy</button>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--slate)' }}>Your Colvy forwarding address appears at the bottom of this page once inbound email is on for your workspace.</p>
            )}
          </div>
          <div className="gx-alt">
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>
              Add a domain mailbox
            </p>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.55 }}>
              For an address on your own domain, like info@yourshop.com.au. Mail is routed to Colvy by your email host; no Google sign-in needed.
            </p>
            <button onClick={onAddDomain} style={{ alignSelf: 'flex-start', padding: '7px 12px', borderRadius: 8, border: '1px solid var(--coral)', background: 'var(--peach)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', color: 'var(--coral)' }}>Add a domain mailbox</button>
          </div>
        </div>
      </div>
    </div>
  )
}
