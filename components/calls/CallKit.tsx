'use client'

// The Sellio look for the Calls & SMS settings cards (When nobody answers, Call
// routing, Call languages, AI receptionist, Move your number): a big rounded
// card with a tinted icon tile and display title, switch rows instead of bare
// checkboxes, grey option tiles that ring when chosen, chip pickers and pill
// buttons. Put <CkStyle /> in the card and use the ck-* classes.

import { useId } from 'react'

export const CK_CSS = `
.ck-card{--ck-fill:#f4f4f5;--ck-fill-2:#ececef;--ck-soft:#f7f7f8;--ck-muted:#71717a;--ck-line:#f0f0f2;
  position:relative;min-width:0;margin-bottom:16px;padding:24px;border-radius:24px;background:var(--card,#fff);color:var(--ink);
  box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04)}
[data-theme="dark"] .ck-card{--ck-fill:#2a2a2e;--ck-fill-2:#333337;--ck-soft:#242428;--ck-muted:#9a9aa0;--ck-line:#2c2c31;box-shadow:0 0 0 1px rgba(255,255,255,.07)}
.ck-card button::before{display:none!important}
.ck-head{display:flex;align-items:flex-start;gap:14px;margin-bottom:18px}
.ck-ic{width:44px;height:44px;flex-shrink:0;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;
  background:color-mix(in srgb,var(--ck-tone,var(--coral)) 13%,var(--card,#fff));color:var(--ck-tone,var(--coral))}
.ck-head-t{flex:1;min-width:0}
.ck-head h3{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:2px 0 0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:19px;font-weight:700;letter-spacing:-.03em;line-height:1.2;color:var(--ink)}
.ck-head p{margin:5px 0 0;font-size:13.5px;line-height:1.55;color:var(--ck-muted)}
.ck-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;font-family:inherit;font-size:11.5px;font-weight:700;letter-spacing:0}
.ck-badge i{width:6px;height:6px;border-radius:50%;background:currentColor}
.ck-sec{margin-top:20px;padding-top:20px;border-top:1px solid var(--ck-line)}
.ck-sec-t{margin:0 0 12px;font-size:15px;font-weight:700;letter-spacing:-.01em;color:var(--ink)}
.ck-lbl{display:block;margin:0 0 8px;font-size:13px;font-weight:600;color:var(--ink)}
.ck-hint{margin:6px 0 0;font-size:12.5px;line-height:1.5;color:var(--ck-muted)}
.ck-gap{height:16px}
.ck-card .ck-in{width:100%;box-sizing:border-box;min-height:46px;padding:11px 14px;border:0;border-radius:14px;background:var(--ck-fill);font:inherit;font-size:14.5px;line-height:1.45;color:var(--ink);outline:none;transition:background .15s,box-shadow .15s}
.ck-card textarea.ck-in{resize:vertical}
.ck-card .ck-in:focus{background:var(--card,#fff);box-shadow:0 0 0 2px color-mix(in srgb,var(--coral) 45%,transparent)}
.ck-card .ck-in::placeholder{color:#a1a1aa}
.ck-chips{display:flex;flex-wrap:wrap;gap:6px}
.ck-chip{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 14px;border:0;border-radius:999px;background:var(--ck-fill);font:inherit;font-size:13.5px;font-weight:600;color:var(--ink);cursor:pointer;transition:background .15s,color .15s}
.ck-chip:hover{background:var(--ck-fill-2)}
.ck-chip.on{background:var(--ink);color:var(--card,#fff)}
.ck-chip.static{cursor:default}
.ck-chip .ck-chip-x{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;margin-right:-6px;padding:0;border:0;border-radius:50%;background:transparent;color:inherit;opacity:.6;cursor:pointer}
.ck-chip .ck-chip-x:hover{opacity:1;background:rgba(127,127,127,.18)}
.ck-chip small{font-weight:500;opacity:.65}
.ck-row{display:flex;align-items:flex-start;gap:14px;padding:14px 16px;border-radius:18px;background:var(--ck-soft);cursor:pointer}
.ck-row+.ck-row{margin-top:8px}
.ck-row.plain{padding:6px 0;background:none}
.ck-row.off{cursor:default;opacity:.55}
.ck-row-t{flex:1;min-width:0}
.ck-row-t b{display:block;font-size:14px;font-weight:600;color:var(--ink);line-height:1.4}
.ck-row-t small{display:block;margin-top:2px;font-size:12.5px;line-height:1.5;color:var(--ck-muted)}
.ck-sw{position:relative;flex-shrink:0;width:40px;height:24px;margin-top:1px;padding:0;border:0;border-radius:999px;background:#d4d4d8;cursor:pointer;transition:background .2s}
.ck-sw::after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .2s cubic-bezier(.22,1,.36,1)}
/* Stronger than the dark-mode colour swap (components/DarkTheme) for the off grey. */
.ck-card .ck-sw[aria-checked="true"]{background:var(--coral)}
.ck-sw[aria-checked="true"]::after{transform:translateX(16px)}
.ck-sw:disabled{cursor:default}
[data-theme="dark"] .ck-sw:not([aria-checked="true"]){background:#52525b}
.ck-opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}
.ck-opt{position:relative;display:flex;gap:11px;align-items:flex-start;min-width:0;padding:13px 14px;border-radius:16px;background:var(--ck-soft);cursor:pointer;transition:background .2s,box-shadow .2s}
.ck-opt:hover{background:var(--ck-fill)}
.ck-opt.on{background:var(--card,#fff);box-shadow:0 0 0 1.5px var(--coral),0 6px 18px -10px color-mix(in srgb,var(--coral) 60%,transparent)}
.ck-opt.off{cursor:default;opacity:.55}
.ck-opt input{position:absolute;opacity:0;pointer-events:none}
.ck-dot{width:18px;height:18px;flex-shrink:0;margin-top:1px;border-radius:50%;background:var(--card,#fff);box-shadow:inset 0 0 0 1.5px #d4d4d8;transition:box-shadow .2s}
.ck-opt.on .ck-dot{box-shadow:inset 0 0 0 5px var(--coral)}
.ck-opt:focus-within{outline:2px solid color-mix(in srgb,var(--coral) 60%,transparent);outline-offset:2px}
.ck-opt-t{min-width:0}
.ck-opt-t b{display:block;font-size:14px;font-weight:600;color:var(--ink);line-height:1.4}
.ck-opt-t small{display:block;margin-top:2px;font-size:12.5px;line-height:1.5;color:var(--ck-muted)}
.ck-note{display:flex;gap:9px;align-items:flex-start;margin:12px 0 0;padding:11px 13px;border-radius:14px;background:#fffbeb;font-size:13px;line-height:1.5;color:#92400e}
.ck-note.info{background:var(--ck-soft);color:var(--ink)}
.ck-note svg{flex-shrink:0;margin-top:1px}
[data-theme="dark"] .ck-note{background:rgba(245,158,11,.12);color:#fcd34d}
[data-theme="dark"] .ck-note.info{background:var(--ck-soft);color:var(--ink)}
.ck-summary{display:flex;gap:11px;align-items:flex-start;margin-top:16px;padding:14px 16px;border-radius:18px;background:color-mix(in srgb,var(--coral) 7%,var(--card,#fff));font-size:13.5px;line-height:1.55;color:var(--ink);overflow-wrap:anywhere}
.ck-summary svg{flex-shrink:0;margin-top:2px;color:var(--coral)}
.ck-foot{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid var(--ck-line)}
.ck-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:42px;padding:0 20px;border:0;border-radius:999px;background:var(--coral);color:#fff;font:inherit;font-size:14px;font-weight:650;white-space:nowrap;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 1px 2px rgba(16,24,40,.12);transition:filter .15s,transform .12s,opacity .15s}
.ck-btn:hover:not(:disabled){filter:brightness(.95)}
.ck-btn:active:not(:disabled){transform:scale(.98)}
.ck-btn:disabled{opacity:.45;cursor:default}
.ck-btn.ghost{background:var(--card,#fff);color:var(--ink);box-shadow:0 0 0 1.5px var(--ck-fill-2)}
.ck-btn.soft{background:var(--ck-fill);color:var(--ink);box-shadow:none}
.ck-btn.sm{height:36px;padding:0 15px;font-size:13px}
.ck-msg{font-size:13px;font-weight:500}
.ck-msg.ok{color:#15803d}.ck-msg.bad{color:#b42318}
[data-theme="dark"] .ck-msg.ok{color:#4ade80}[data-theme="dark"] .ck-msg.bad{color:#f87171}
.ck-card :focus-visible{outline:2px solid var(--coral);outline-offset:2px}
@media (max-width:560px){.ck-card{padding:18px;border-radius:20px}.ck-head{gap:12px}.ck-ic{width:40px;height:40px;border-radius:12px}.ck-head h3{font-size:17px}}
@media (prefers-reduced-motion:reduce){.ck-sw,.ck-sw::after,.ck-opt{transition:none}}
`

export function CkStyle() {
  return <style href="colvy-call-kit" precedence="default">{CK_CSS}</style>
}

/** The card's icon tile, title, optional badge and blurb. */
export function CkHead({ icon, tone, title, badge, children }: { icon: React.ReactNode; tone?: string; title: React.ReactNode; badge?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="ck-head">
      <span className="ck-ic" style={tone ? { '--ck-tone': tone } as React.CSSProperties : undefined} aria-hidden>{icon}</span>
      <div className="ck-head-t">
        <h3>{title}{badge}</h3>
        {children && <p>{children}</p>}
      </div>
    </div>
  )
}

/** A switch row: what it does on the left, the switch on the right. Clicking anywhere on the row flips it. */
export function CkToggle({ on, onChange, title, sub, disabled, plain }: { on: boolean; onChange: (v: boolean) => void; title: React.ReactNode; sub?: React.ReactNode; disabled?: boolean; plain?: boolean }) {
  const id = useId()
  return (
    <div className={`ck-row${plain ? ' plain' : ''}${disabled ? ' off' : ''}`} onClick={() => { if (!disabled) onChange(!on) }}>
      <div className="ck-row-t"><b id={id}>{title}</b>{sub ? <small>{sub}</small> : null}</div>
      <button type="button" role="switch" aria-checked={on} aria-labelledby={id} disabled={disabled} className="ck-sw"
        onClick={e => { e.stopPropagation(); if (!disabled) onChange(!on) }} />
    </div>
  )
}

/** One choice in a group of option tiles (a styled radio). */
export function CkOption({ name, checked, onChange, title, sub, disabled }: { name: string; checked: boolean; onChange: () => void; title: React.ReactNode; sub?: React.ReactNode; disabled?: boolean }) {
  return (
    <label className={`ck-opt${checked ? ' on' : ''}${disabled ? ' off' : ''}`}>
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} />
      <span className="ck-dot" aria-hidden />
      <span className="ck-opt-t"><b>{title}</b>{sub ? <small>{sub}</small> : null}</span>
    </label>
  )
}

/** Save button, an optional extra (Undo), and the result. */
export function CkSave({ dirty, busy, onSave, msg, children }: { dirty: boolean; busy: boolean; onSave: () => void; msg?: { ok: boolean; text: string } | null; children?: React.ReactNode }) {
  return (
    <div className="ck-foot">
      <button type="button" className="ck-btn" onClick={onSave} disabled={!dirty || busy}>{busy ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>
      {children}
      {msg && <span role={msg.ok ? 'status' : 'alert'} className={`ck-msg ${msg.ok ? 'ok' : 'bad'}`}>{msg.text}</span>}
    </div>
  )
}

const s = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
export const CK_ICON = {
  voicemail: <svg {...s}><circle cx="6" cy="12" r="4" /><circle cx="18" cy="12" r="4" /><path d="M6 16h12" /></svg>,
  route: <svg {...s}><circle cx="6" cy="19" r="2.5" /><circle cx="18" cy="5" r="2.5" /><path d="M8.5 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5" /></svg>,
  globe: <svg {...s}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>,
  sparkle: <svg {...s}><path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>,
  move: <svg {...s}><path d="M5 12h14M13 6l6 6-6 6" /><rect x="2" y="4" width="5" height="16" rx="1.5" /></svg>,
  info: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9.5" /><path d="M12 16v-4M12 8h.01" /></svg>,
  warn: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9.5v4M12 17h.01" /></svg>,
  x: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>,
}
