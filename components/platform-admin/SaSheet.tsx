'use client'

// The console's side panels (a sign-up, a company…) in the Sellio style: a
// floating sheet with round corners on the soft canvas, a sticky head with a
// badge and display title, pill buttons and tabs, and sections as cards. Built
// on the console's own --sa-* colours so it follows its light and dark modes.

import { useEffect } from 'react'

export const SA_SHEET_CSS = `
.sas-scrim{position:fixed;inset:0;z-index:var(--sas-z,380);display:flex;justify-content:flex-end;background:rgba(15,15,20,.34);animation:sasFade .18s ease both}
.sas{width:var(--sas-w,580px);max-width:100vw;height:100%;display:flex;flex-direction:column;background:var(--sa-bg);border-radius:26px 0 0 26px;box-shadow:0 0 0 1px var(--sa-ring),-24px 0 60px -20px rgba(16,24,40,.35);overflow:hidden;animation:sasIn .3s cubic-bezier(.22,1,.36,1) both}
.sas button::before{display:none!important}
.sas-head{flex-shrink:0;background:var(--sa-card);padding:22px 22px 16px;box-shadow:0 1px 0 var(--sa-border)}
.sas-top{display:flex;align-items:flex-start;gap:14px}
.sas-badge{width:48px;height:48px;flex-shrink:0;border-radius:15px;display:inline-flex;align-items:center;justify-content:center;font-size:19px;font-weight:800;color:#fff;background:#ff7a6b;overflow:hidden}
.sas-badge.soft{background:color-mix(in srgb,#ff7a6b 13%,var(--sa-card));color:#ff6a4d}
.sas-title{margin:2px 0 0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:22px;font-weight:700;letter-spacing:-.03em;line-height:1.15;color:var(--sa-text);overflow-wrap:anywhere}
.sas-sub{margin:4px 0 0;font-size:13.5px;line-height:1.45;color:var(--sa-muted);overflow-wrap:anywhere}
.sas-chips{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:10px}
.sas-x{margin-left:auto;width:36px;height:36px;flex-shrink:0;border:none;border-radius:50%;background:var(--sa-field);color:var(--sa-text);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s}
.sas-x:hover{background:var(--sa-hover)}
.sas-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.sas-pill{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:40px;padding:0 16px;border:none;border-radius:999px;background:var(--sa-field);color:var(--sa-text);font:inherit;font-size:13.5px;font-weight:650;cursor:pointer;white-space:nowrap;text-decoration:none;transition:background .15s,filter .15s,transform .12s}
.sas-pill:hover{background:var(--sa-hover)}
.sas-pill:active{transform:scale(.98)}
.sas-pill:disabled,.sas-pill[aria-disabled=true]{opacity:.5;cursor:not-allowed;transform:none}
.sas-pill.primary{background:#ff6a4d;color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 1px 2px rgba(16,24,40,.12)}
.sas-pill.primary:hover{filter:brightness(.95)}
.sas-pill.danger{color:#dc2626}
.sas-pill.danger:hover{background:color-mix(in srgb,#dc2626 10%,var(--sa-card))}
.sas-pill svg{flex-shrink:0}
.sas-tabs{display:flex;gap:4px;margin:16px -22px -16px;padding:0 22px 12px;overflow-x:auto;scrollbar-width:none}
.sas-tabs::-webkit-scrollbar{display:none}
.sas-tab{flex-shrink:0;height:34px;padding:0 14px;border:none;border-radius:999px;background:transparent;color:var(--sa-muted);font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background .15s,color .15s}
.sas-tab:hover{background:var(--sa-hover);color:var(--sa-text)}
.sas-tab.on{background:var(--sa-text);color:var(--sa-card)}
.sas-body{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:18px 22px 28px}
.sas-sec{margin-top:22px}
.sas-sec:first-child{margin-top:0}
.sas-sec-t{margin:0 0 8px 2px;font-size:13.5px;font-weight:650;color:var(--sa-text)}
.sas-card{border-radius:20px;background:var(--sa-card);box-shadow:0 0 0 1px var(--sa-ring),0 1px 2px rgba(16,24,40,.04);padding:4px 16px}
.sas-card.pad{padding:14px 16px}
.sas-row{display:flex;gap:14px;padding:11px 0;min-width:0}
.sas-row+.sas-row{box-shadow:0 -1px 0 var(--sa-border)}
.sas-row-k{width:128px;flex-shrink:0;font-size:13px;color:var(--sa-muted)}
.sas-row-v{flex:1;min-width:0;font-size:13.5px;color:var(--sa-text);overflow-wrap:anywhere}
.sas-msg{margin-top:12px;padding:10px 14px;border-radius:14px;font-size:13px;font-weight:600}
.sas-msg.ok{background:color-mix(in srgb,#059669 12%,var(--sa-card));color:#059669}
.sas-msg.err{background:color-mix(in srgb,#dc2626 12%,var(--sa-card));color:#dc2626}
.sas-foot-note{margin:18px 2px 0;font-size:12px;line-height:1.5;color:var(--sa-muted)}
@keyframes sasIn{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}
@keyframes sasFade{from{opacity:0}to{opacity:1}}
@media (max-width:640px){
  .sas-scrim{align-items:flex-end}
  .sas{width:100%;height:94vh;border-radius:24px 24px 0 0}
  .sas-head{padding:18px 16px 14px}
  .sas-tabs{margin:14px -16px -14px;padding:0 16px 10px}
  .sas-body{padding:16px 16px calc(24px + env(safe-area-inset-bottom))}
  .sas-title{font-size:20px}
  .sas-row{flex-direction:column;gap:2px}
  .sas-row-k{width:auto;font-size:12.5px}
}
@media (prefers-reduced-motion:reduce){.sas,.sas-scrim{animation:none}}
`

/** The scrim and the sheet. Escape and a click outside close it. */
export function SaSheet({ onClose, label, width, z, children }: { onClose: () => void; label: string; width?: number; z?: number; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="sas-scrim" onClick={onClose} style={{ ...(z ? { '--sas-z': z } : {}) } as React.CSSProperties}>
      <style>{SA_SHEET_CSS}</style>
      <aside className="sas" role="dialog" aria-modal="true" aria-label={label} onClick={e => e.stopPropagation()}
        style={{ ...(width ? { '--sas-w': `${width}px` } : {}) } as React.CSSProperties}>
        {children}
      </aside>
    </div>
  )
}

export function SaClose({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="sas-x" onClick={onClick} aria-label="Close">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
    </button>
  )
}

/** A titled section with its rows in a card. */
export function SaSection({ title, children, pad }: { title: string; children: React.ReactNode; pad?: boolean }) {
  return (
    <section className="sas-sec">
      <h3 className="sas-sec-t">{title}</h3>
      <div className={`sas-card${pad ? ' pad' : ''}`}>{children}</div>
    </section>
  )
}

export function SaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="sas-row">
      <span className="sas-row-k">{label}</span>
      <span className="sas-row-v">{children ?? <span style={{ color: 'var(--sa-muted)' }}>—</span>}</span>
    </div>
  )
}
