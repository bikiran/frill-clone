'use client'

// The Sellio look for the order and payment pop-ups (Record a sale, Refund,
// Send a coupon, Proof of delivery, Create order…), shared so they match the
// Send tracking modal: a big rounded card (a side panel or a centred modal; a
// bottom sheet on phones), an icon badge and display title, soft grey fields,
// and pill buttons. Put <SkStyle /> in the component and use the sk-* classes.

import { useEffect, useRef, useState } from 'react'

export const SK_CSS = `
.sk-scrim{position:fixed;inset:0;z-index:var(--sk-z,10000);display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,15,20,.32);animation:skFade .16s ease both}
.sk-scrim.side{justify-content:flex-end;padding:0}
.sk{--sk-fill:#f4f4f5;--sk-fill-2:#ececef;--sk-muted:#71717a;--sk-line:#f0f0f2;
  width:var(--sk-w,460px);max-width:100%;max-height:92vh;overflow-y:auto;overscroll-behavior:contain;background:var(--card,#fff);border-radius:26px;padding:24px;display:flex;flex-direction:column;color:var(--ink);
  box-shadow:0 0 0 1px rgba(0,0,0,.05),0 30px 80px -20px rgba(16,24,40,.35);animation:skIn .28s cubic-bezier(.22,1,.36,1) both}
.sk:not(.side)>*{flex-shrink:0}
.sk.side{height:100%;max-height:none;border-radius:26px 0 0 26px;padding:0;animation-name:skSlide}
.sk.side .sk-body{flex:1;overflow-y:auto;padding:4px 24px 24px}
.sk.side .sk-head{position:sticky;top:0;z-index:2;margin:0;padding:22px 24px 14px;background:var(--card,#fff)}
.sk.side .sk-foot{position:sticky;bottom:0;padding:14px 24px calc(14px + env(safe-area-inset-bottom));background:var(--card,#fff);box-shadow:0 -1px 0 var(--sk-line)}
[data-theme="dark"] .sk{--sk-fill:#2a2a2e;--sk-fill-2:#333337;--sk-muted:#9a9aa0;--sk-line:#2c2c31}
/* The global dark rule paints every field #1e1e1e, which vanishes on the sheet. */
[data-theme="dark"] .sk .sk-in{background:var(--sk-fill)!important;border-color:transparent!important}
[data-theme="dark"] .sk .sk-in:focus{background:var(--sk-fill-2)!important;border-color:var(--sk-fill-2)!important}
.sk button::before,.sk a::before{display:none!important}
.sk-head{display:flex;align-items:flex-start;gap:13px;margin-bottom:6px}
.sk-badge{width:44px;height:44px;flex-shrink:0;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;background:var(--peach,#fff4f1);color:var(--coral,#ff7a6b)}
.sk-head h2,.sk-head h3{margin:1px 0 0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:22px;font-weight:700;letter-spacing:-.03em;line-height:1.15;color:var(--ink)}
.sk-sub{margin:4px 0 0;font-size:13.5px;line-height:1.45;color:var(--sk-muted)}
.sk-x{margin-left:auto;width:36px;height:36px;flex-shrink:0;border:none;border-radius:50%;background:var(--sk-fill);color:var(--ink);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s}
.sk-x:hover{background:var(--sk-fill-2)}
.sk-lbl{display:flex;align-items:baseline;gap:6px;margin:18px 0 8px;font-size:13px;font-weight:600;color:var(--ink);text-transform:none;letter-spacing:0}
.sk-lbl .sk-opt,.sk-opt{font-weight:400;color:var(--sk-muted)}
.sk-lbl-row{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:18px 0 8px}
.sk-lbl-row .sk-lbl{margin:0}
.sk .sk-in{width:100%;box-sizing:border-box;height:50px;padding:0 15px;border-radius:16px;border:1.5px solid transparent;background:var(--sk-fill);font:inherit;font-size:15px;color:var(--ink);outline:none;box-shadow:none;transition:background .15s,border-color .15s,box-shadow .15s}
.sk .sk-in::placeholder{color:var(--sk-muted)}
.sk .sk-in:focus{background:var(--card,#fff);border-color:var(--sk-fill-2);box-shadow:0 0 0 3px color-mix(in srgb,var(--coral,#ff7a6b) 14%,transparent)}
.sk select.sk-in{appearance:none;-webkit-appearance:none;padding-right:40px;cursor:pointer;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 15px center}
.sk textarea.sk-in{height:auto;min-height:96px;padding:13px 15px;line-height:1.45;resize:vertical}
.sk input[type=number]{-moz-appearance:textfield;appearance:textfield}
.sk input[type=number]::-webkit-outer-spin-button,.sk input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.sk-field{display:flex;align-items:center;gap:10px;height:50px;padding:0 15px;border-radius:16px;background:var(--sk-fill);color:var(--sk-muted);border:1.5px solid transparent;transition:background .15s,border-color .15s}
.sk-field:focus-within{background:var(--card,#fff);border-color:var(--sk-fill-2)}
.sk .sk-field input{flex:1;min-width:0;height:100%;border:none!important;outline:none;background:transparent!important;box-shadow:none!important;padding:0;font:inherit;font-size:15px;color:var(--ink)!important}
.sk .sk-field input::placeholder{color:var(--sk-muted)}
.sk-pre{font-size:15px;font-weight:600;color:var(--sk-muted)}
.sk .pmp-trigger{height:50px!important;padding:0 15px!important;border-radius:16px!important;border:1.5px solid transparent!important;background:var(--sk-fill)!important;font-size:15px!important}
.sk-row{display:flex;gap:8px}
.sk-row>*{flex:1;min-width:0}
.sk-card{border-radius:20px;background:var(--sk-fill);padding:14px 16px}
.sk-item{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:18px;background:var(--sk-fill)}
.sk-item+.sk-item{margin-top:8px}
.sk-item-t{flex:1;min-width:0}
.sk-item-t b{display:block;font-size:14.5px;font-weight:650;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sk-item-t small{display:block;margin-top:2px;font-size:12.5px;color:var(--sk-muted)}
.sk-amt{font-size:14.5px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap}
.sk-chips{display:flex;flex-wrap:wrap;gap:8px}
.sk-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;min-height:36px;padding:7px 14px;border:none;border-radius:999px;background:var(--sk-fill);font:inherit;font-size:13.5px;font-weight:600;color:var(--ink);cursor:pointer;text-align:left;transition:background .15s,color .15s}
.sk-chip:hover{background:var(--sk-fill-2)}
.sk-chip.on{background:var(--ink);color:var(--card,#fff)}
.sk-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sk-seg{display:flex;padding:4px;border-radius:999px;background:var(--sk-fill)}
.sk-seg button{flex:1;height:38px;border:none;border-radius:999px;background:transparent;font:inherit;font-size:13.5px;font-weight:600;color:var(--sk-muted);cursor:pointer;white-space:nowrap}
.sk-seg button.on{background:var(--card,#fff);color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.12)}
.sk-check{display:flex;align-items:center;gap:11px;margin-top:14px;font-size:14px;line-height:1.4;color:var(--ink);cursor:pointer}
.sk-check input{width:20px;height:20px;flex-shrink:0;margin:0;accent-color:var(--coral,#ff7a6b);cursor:pointer}
.sk-check.box{margin-top:8px;padding:13px 15px;border-radius:18px;background:var(--sk-fill)}
.sk-sum{display:flex;flex-direction:column;gap:8px;margin-top:18px;padding:16px;border-radius:20px;background:var(--sk-fill)}
.sk-sum-r{display:flex;align-items:baseline;justify-content:space-between;gap:12px;font-size:14px;color:var(--sk-muted)}
.sk-sum-r b{color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums}
.sk-sum-r.total{padding-top:8px;border-top:1px solid var(--sk-fill-2);font-size:16px;font-weight:700;color:var(--ink)}
.sk-sum-r.total b{font-size:20px;font-weight:800;letter-spacing:-.02em}
.sk-add{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:6px 2px;border:none;background:none;font:inherit;font-size:13.5px;font-weight:650;color:var(--coral,#ff7a6b);cursor:pointer}
.sk-add:hover{text-decoration:underline}
.sk-stepper{display:inline-flex;align-items:center;gap:2px;padding:3px;border-radius:999px;background:var(--card,#fff);box-shadow:0 0 0 1px var(--sk-fill-2)}
.sk-stepper button{width:30px;height:30px;border:none;border-radius:50%;background:transparent;color:var(--ink);font-size:17px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.sk-stepper button:hover:not(:disabled){background:var(--sk-fill)}
.sk-stepper button:disabled{opacity:.35;cursor:not-allowed}
.sk-stepper span{min-width:22px;text-align:center;font-size:14px;font-weight:700;font-variant-numeric:tabular-nums}
.sk-drop{display:flex;align-items:center;justify-content:center;gap:9px;min-height:64px;padding:14px;border-radius:18px;border:1.5px dashed var(--sk-fill-2);background:var(--sk-fill);font-size:14px;font-weight:600;color:var(--ink);cursor:pointer;transition:border-color .15s,background .15s}
.sk-drop:hover{border-color:var(--coral,#ff7a6b);background:var(--peach,#fff4f1)}
.sk-drop.over{border-color:var(--coral,#ff7a6b);background:var(--peach,#fff4f1)}
.sk-drop small{display:block;font-size:12.5px;font-weight:500;color:var(--sk-muted)}
.sk-thumbs{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.sk-thumb{position:relative;width:72px;height:72px;border-radius:16px;overflow:hidden;background:var(--sk-fill);display:inline-flex;align-items:center;justify-content:center;color:var(--sk-muted);font-size:11px;font-weight:600;text-align:center;line-height:1.2;padding:0}
.sk-thumb img,.sk-thumb video{width:100%;height:100%;object-fit:cover;display:block}
.sk-thumb .sk-thumb-x{position:absolute;top:4px;right:4px;width:22px;height:22px;border:none;border-radius:50%;background:rgba(15,15,20,.6);color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
.sk-thumb .sk-thumb-x:hover{background:rgba(15,15,20,.8)}
.sk-err{margin:12px 0 0;padding:10px 13px;border-radius:14px;background:#fef2f2;color:#dc2626;font-size:13px;font-weight:600}
.sk-note{margin:10px 2px 0;font-size:12.5px;line-height:1.5;color:var(--sk-muted)}
.sk-sep{height:1px;margin:20px 0 4px;background:var(--sk-line)}
.sk-actions{display:flex;gap:8px;margin-top:22px}
.sk-btn{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:8px;height:50px;padding:0 18px;border:none;border-radius:999px;background:var(--sk-fill);color:var(--ink);font:inherit;font-size:14.5px;font-weight:650;cursor:pointer;white-space:nowrap;transition:background .15s,filter .15s,transform .12s}
.sk-btn:hover{background:var(--sk-fill-2)}
.sk-btn.primary{flex:2;background:var(--coral,#ff7a6b);color:#fff}
.sk-btn.dark{background:var(--ink);color:var(--card,#fff)}
.sk-btn.primary:hover,.sk-btn.dark:hover{filter:brightness(.95)}
.sk-btn.ghost{flex:0 0 auto;background:transparent;box-shadow:inset 0 0 0 1.5px var(--sk-fill-2)}
.sk-btn.sm{height:40px;font-size:13.5px;flex:0 0 auto}
.sk-btn:active{transform:scale(.985)}
.sk-btn:disabled{opacity:.45;cursor:not-allowed;transform:none;filter:none}
.sk-icon-btn{width:34px;height:34px;flex-shrink:0;border:none;border-radius:50%;background:transparent;color:var(--sk-muted);display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.sk-icon-btn:hover{background:var(--sk-fill-2);color:var(--ink)}
.sk-icon-btn.danger:hover{background:#fef2f2;color:#dc2626}
.sk :focus-visible{outline:2px solid var(--coral,#ff7a6b);outline-offset:2px}
[data-theme="dark"] .sk-err{background:rgba(239,68,68,.12);color:#fca5a5}
@keyframes skIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
@keyframes skSlide{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}
@keyframes skFade{from{opacity:0}to{opacity:1}}
@media (max-width:560px){
  .sk-scrim{align-items:flex-end;padding:0}
  .sk{border-radius:24px 24px 0 0;max-height:94vh;padding:20px 18px calc(20px + env(safe-area-inset-bottom))}
  .sk.side{width:100%;height:auto;max-height:94vh;border-radius:24px 24px 0 0;padding:0}
  .sk.side .sk-head{padding:18px 18px 12px}
  .sk.side .sk-body{padding:4px 18px 18px}
  .sk.side .sk-foot{padding:12px 18px calc(12px + env(safe-area-inset-bottom))}
  .sk-head h2,.sk-head h3{font-size:20px}
}
@media (prefers-reduced-motion:reduce){.sk,.sk-scrim{animation:none}}
`

export function SkStyle() {
  return <style href="colvy-sheet-kit" precedence="default">{SK_CSS}</style>
}

export function SkClose({ onClick, label = 'Close' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="sk-x" onClick={onClick} aria-label={label}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
    </button>
  )
}

/** Little line icons for the badges. */
export const SkIcon = {
  sale: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
  refund: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>,
  coupon: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a3 3 0 0 0 0-6V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" /><path d="m9 15 6-6M9.5 9.5h.01M14.5 14.5h.01" /></svg>,
  box: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="m3 8 9 5 9-5M12 13v8" /></svg>,
  cart: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2.5 3h2.6l2.4 12.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6" /></svg>,
  search: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  plus: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>,
  upload: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 15V3M7 8l5-5 5 5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg>,
  edit: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>,
  chat: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
  trash: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
}

/** A drop zone (click or drag files on) with previews of what's picked. */
export function SkFiles({ files, onAdd, onRemove, accept, label = 'Add photos or video', hint }: {
  files: File[]; onAdd: (f: File[]) => void; onRemove: (index: number) => void; accept?: string; label?: string; hint?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [urls, setUrls] = useState<string[]>([])
  useEffect(() => {
    const next = files.map(f => (/^(image|video)\//.test(f.type) ? URL.createObjectURL(f) : ''))
    setUrls(next)
    return () => next.forEach(u => u && URL.revokeObjectURL(u))
  }, [files])
  const take = (list: FileList | null) => { const f = Array.from(list || []); if (f.length) onAdd(f) }
  return (
    <>
      <input ref={input} type="file" accept={accept} multiple hidden onChange={e => { take(e.target.files); e.target.value = '' }} />
      <button type="button" className={`sk-drop${over ? ' over' : ''}`} style={{ width: '100%', font: 'inherit' }}
        onClick={() => input.current?.click()}
        onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); take(e.dataTransfer.files) }}>
        {SkIcon.upload}
        <span style={{ textAlign: 'left' }}>{files.length ? `${files.length} added · add more` : label}{hint && <small>{hint}</small>}</span>
      </button>
      {files.length > 0 && (
        <div className="sk-thumbs">
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="sk-thumb" title={f.name}>
              {urls[i] && f.type.startsWith('image/')
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={urls[i]} alt={f.name} />
                : urls[i] ? <video src={urls[i]} muted playsInline preload="metadata" /> : <span style={{ padding: 6, overflowWrap: 'anywhere' }}>{f.name}</span>}
              <button type="button" className="sk-thumb-x" onClick={() => onRemove(i)} aria-label={`Remove ${f.name}`}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </span>
          ))}
        </div>
      )}
    </>
  )
}
