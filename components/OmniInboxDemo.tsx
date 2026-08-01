'use client'

// A self-contained, CSS-animated mockup of the omnichannel inbox + CRM. It
// loops on its own (messages arrive, an agent types, a reply lands, channels
// pulse) so it reads like a live product demo without shipping a video file.
// Theme-aware via the `dark` prop so it drops into the light/dark landing.

const CH = [
  { key: 'wa', label: 'WhatsApp', color: '#25D366', badge: 3, path: 'M12 2a10 10 0 0 0-8.5 15.3L2 22l4.9-1.4A10 10 0 1 0 12 2z' },
  { key: 'ig', label: 'Instagram', color: '#E1306C', badge: 1, path: 'M12 2.2c3.2 0 3.6 0 4.9.07 1.2.06 1.8.25 2.2.42.6.22 1 .48 1.4.9.4.4.7.8.9 1.4.17.4.36 1 .42 2.2.06 1.3.07 1.7.07 4.9s0 3.6-.07 4.9c-.06 1.2-.25 1.8-.42 2.2-.22.6-.48 1-.9 1.4-.4.4-.8.7-1.4.9-.4.17-1 .36-2.2.42-1.3.06-1.7.07-4.9.07s-3.6 0-4.9-.07c-1.2-.06-1.8-.25-2.2-.42-.6-.22-1-.48-1.4-.9-.4-.4-.7-.8-.9-1.4-.17-.4-.36-1-.42-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.07-4.9c.06-1.2.25-1.8.42-2.2.22-.6.48-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.17 1-.36 2.2-.42C8.4 2.2 8.8 2.2 12 2.2z' },
  { key: 'fb', label: 'Messenger', color: '#0084FF', badge: 0, path: 'M12 2C6.5 2 2 6.1 2 11.2c0 2.9 1.4 5.5 3.7 7.2V22l3.4-1.9c.9.25 1.9.4 2.9.4 5.5 0 10-4.1 10-9.2S17.5 2 12 2z' },
  { key: 'em', label: 'Email', color: '#8b5cf6', badge: 2, path: 'M4 4h16v16H4z M22 6l-10 7L2 6' },
  { key: 'sms', label: 'SMS', color: '#0891b2', badge: 0, path: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
]

export default function OmniInboxDemo({ dark = false }: { dark?: boolean }) {
  const panel = dark ? 'rgba(255,255,255,0.04)' : '#ffffff'
  const border = dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)'
  const sub = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'
  const ink = dark ? '#f0f0f0' : '#0d0d0d'
  const rail = dark ? 'rgba(255,255,255,0.03)' : '#f8f8f8'
  const inbound = dark ? 'rgba(255,255,255,0.07)' : '#f1f2f4'

  return (
    <div style={{ width: '100%', maxWidth: 720, margin: '0 auto', borderRadius: 20, border: `1px solid ${border}`, background: panel, boxShadow: dark ? '0 30px 80px rgba(0,0,0,0.5)' : '0 30px 80px rgba(0,0,0,0.14)', overflow: 'hidden' }}>
      <style>{`
        @keyframes oi-pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.18);opacity:.7} }
        @keyframes oi-b1 { 0%,6%{opacity:0;transform:translateY(10px)} 11%,90%{opacity:1;transform:none} 100%{opacity:0} }
        @keyframes oi-b2 { 0%,30%{opacity:0;transform:translateY(10px)} 35%,90%{opacity:1;transform:none} 100%{opacity:0} }
        @keyframes oi-type { 0%,50%{opacity:0} 55%,66%{opacity:1} 70%,100%{opacity:0} }
        @keyframes oi-b3 { 0%,70%{opacity:0;transform:translateY(10px)} 75%,92%{opacity:1;transform:none} 100%{opacity:0} }
        @keyframes oi-dot { 0%,80%,100%{transform:translateY(0);opacity:.4} 40%{transform:translateY(-4px);opacity:1} }
        @keyframes oi-sweep { 0%{transform:translateX(-100%)} 100%{transform:translateX(320%)} }
        .oi-b1{animation:oi-b1 11s ease-in-out infinite}
        .oi-b2{animation:oi-b2 11s ease-in-out infinite}
        .oi-b3{animation:oi-b3 11s ease-in-out infinite}
        .oi-type{animation:oi-type 11s ease-in-out infinite}
        .oi-chip{animation:oi-pulse 2.4s ease-in-out infinite}
        @media(max-width:560px){ .oi-grid{grid-template-columns:46px 1fr !important} .oi-crm{display:none !important} }
      `}</style>

      {/* window chrome */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 16px', borderBottom: `1px solid ${border}`, background: rail }}>
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f57' }} />
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#febc2e' }} />
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#28c840' }} />
        <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 700, color: sub }}>Colvy — Shared Inbox</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981' }} className="oi-chip" /> Live
        </span>
      </div>

      <div className="oi-grid" style={{ display: 'grid', gridTemplateColumns: '58px 1fr 150px' }}>
        {/* channel rail */}
        <div style={{ borderRight: `1px solid ${border}`, background: rail, padding: '12px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          {CH.map(c => (
            <div key={c.key} style={{ position: 'relative', width: 34, height: 34, borderRadius: 10, background: c.color + (dark ? '22' : '18'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={c.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={c.path} /></svg>
              {c.badge > 0 && (
                <span className="oi-chip" style={{ position: 'absolute', top: -4, right: -4, minWidth: 15, height: 15, padding: '0 4px', borderRadius: 999, background: '#ff5247', color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${rail}` }}>{c.badge}</span>
              )}
            </div>
          ))}
        </div>

        {/* conversation */}
        <div style={{ padding: '14px 16px', minHeight: 250, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, paddingBottom: 12, borderBottom: `1px solid ${border}`, marginBottom: 14 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#ff7a6b,#a78bfa)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>SR</div>
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: ink }}>Sam Rivera</div>
              <div style={{ fontSize: 11, color: sub, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#25D366' }} /> via WhatsApp
              </div>
            </div>
            <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: '#10b981', padding: '3px 9px', borderRadius: 999, background: '#10b98115' }}>Open</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
            <div className="oi-b1" style={{ alignSelf: 'flex-start', maxWidth: '78%', padding: '9px 13px', borderRadius: '14px 14px 14px 4px', background: inbound, color: ink, fontSize: 12.5, lineHeight: 1.5 }}>
              Hi! Do you still have the 4ft reef tank in stock? 🐠
            </div>
            <div className="oi-b2" style={{ alignSelf: 'flex-end', maxWidth: '78%', padding: '9px 13px', borderRadius: '14px 14px 4px 14px', background: 'linear-gradient(135deg,#ff7a6b,#ff5247)', color: '#fff', fontSize: 12.5, lineHeight: 1.5 }}>
              Yes — 2 left! Here's a photo from our gallery 📷
            </div>
            <div className="oi-type" style={{ alignSelf: 'flex-start', display: 'inline-flex', gap: 4, padding: '10px 13px', borderRadius: 12, background: inbound, width: 'fit-content' }}>
              {[0, 1, 2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: sub, animation: `oi-dot 1.2s ${i * 0.15}s ease-in-out infinite` }} />)}
            </div>
            <div className="oi-b3" style={{ alignSelf: 'flex-end', maxWidth: '78%', padding: '9px 13px', borderRadius: '14px 14px 4px 14px', background: 'linear-gradient(135deg,#ff7a6b,#ff5247)', color: '#fff', fontSize: 12.5, lineHeight: 1.5 }}>
              Sent you a payment link 💳 — order created ✅
            </div>
          </div>

          {/* composer */}
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 12, border: `1px solid ${border}`, background: rail }}>
            <span style={{ fontSize: 12, color: sub, flex: 1 }}>Reply to Sam…</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#8b5cf6' }}>AI ✨</span>
            <span style={{ width: 24, height: 24, borderRadius: 8, background: '#ff7a6b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>↑</span>
          </div>
        </div>

        {/* CRM card */}
        <div className="oi-crm" style={{ borderLeft: `1px solid ${border}`, padding: '14px 12px', background: rail, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: sub, margin: 0 }}>Customer</p>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: ink }}>Sam Rivera</div>
            <div style={{ fontSize: 10.5, color: sub }}>Roxy Aquarium · VIP</div>
          </div>
          {[['Lifetime', '$4,280'], ['Orders', '17'], ['Outlet', 'Sydney']].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: sub }}>{k}</span><span style={{ color: ink, fontWeight: 700 }}>{v}</span>
            </div>
          ))}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
            {['Reef', 'Repeat', 'SMS-ok'].map(t => (
              <span key={t} style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: '#ff7a6b18', color: '#ff7a6b' }}>{t}</span>
            ))}
          </div>
          <div style={{ marginTop: 'auto', position: 'relative', overflow: 'hidden', borderRadius: 8, height: 5, background: dark ? 'rgba(255,255,255,0.06)' : '#eceef1' }}>
            <span style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: '30%', borderRadius: 8, background: 'linear-gradient(90deg,#ff7a6b,#a78bfa)', animation: 'oi-sweep 2.6s linear infinite' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
