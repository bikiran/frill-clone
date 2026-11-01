'use client'

import { useRef, useState } from 'react'
import { SelectPopover, type MenuOption } from '@/components/ui/SelectMenu'

// Building blocks for the inbox contact panel's Information tab (Sellio-style):
// the details card (one quiet row per filled-in field, icon first), "+ Email"
// chips for the empty ones, and the settings list (Rings first, back-in-stock
// alert, delivery) with one line per setting instead of a box and a paragraph.

const s = (d: React.ReactNode, size = 15) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>

export const CPD_ICON: Record<string, React.ReactNode> = {
  name: s(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>),
  company_name: s(<><path d="M3 21h18M5 21V7l7-4 7 4v14" /><path d="M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1" /></>),
  email: s(<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></>),
  phone: s(<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />),
  address: s(<><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></>),
  ring: s(<><path d="M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94" /><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></>),
  bell: s(<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>),
  calendar: s(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>),
  box: s(<><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" /></>),
  truck: s(<><rect x="1" y="3" width="15" height="13" rx="1.5" /><path d="M16 8h4l3 3v5h-7z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></>),
  chev: s(<polyline points="9 18 15 12 9 6" />, 14),
  down: s(<polyline points="6 9 12 15 18 9" />, 13),
}

export const CPD_CSS = `
.cpd-card{border-radius:16px;background:#f6f6f7;padding:3px 0}
.cpd-row{display:flex;align-items:center;gap:10px;min-height:40px;padding:6px 10px 6px 12px;border-radius:12px}
.cpd-row+.cpd-row{box-shadow:0 -1px 0 #ececee}
.cpd-ic{width:18px;flex-shrink:0;display:inline-flex;justify-content:center;color:#8e8e93}
.cpd-val{margin:0;flex:1;min-width:0;font-size:13.5px;line-height:1.4;color:#18181b;word-break:break-word;cursor:pointer}
.cpd-tag{margin-left:6px;font-size:10px;font-weight:600;color:#2563eb;background:#eef4ff;padding:1px 6px;border-radius:999px;white-space:nowrap}
.cpd-row.editing{flex-direction:column;align-items:stretch;gap:5px;padding:8px 10px}
.cpd-row.editing .cpd-lbl{font-size:11.5px;font-weight:600;color:#8e8e93;display:flex;align-items:center;gap:6px}
.cpd-add{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.cpd-chip{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 11px;border:none;border-radius:999px;background:#f4f4f5;color:#52525b;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;transition:background .15s,color .15s}
.cpd-chip:hover{background:#ebebee;color:#18181b}
.cpd-chip::before,.cpd-li::before,.cpd-li *::before{display:none!important}
.cpd-list{border-radius:16px;background:#f6f6f7;padding:3px 0;margin-top:14px}
.cpd-li{position:relative;display:flex;align-items:center;gap:10px;width:100%;min-height:42px;padding:6px 12px;border:none;background:none;font:inherit;text-align:left;color:#18181b;cursor:pointer;border-radius:12px}
.cpd-li+.cpd-li{box-shadow:0 -1px 0 #ececee}
.cpd-li:hover,.cpd-li.open{background:#efeff1}
.cpd-li:focus-visible{outline:2px solid var(--coral);outline-offset:-2px}
.cpd-li-t{flex:0 0 auto;font-size:13.5px;font-weight:500;white-space:nowrap}
.cpd-li-v{flex:1;min-width:0;justify-content:flex-end;display:inline-flex;align-items:center;gap:3px;font-size:13px;color:#71717a;white-space:nowrap}
.cpd-li-v>span{overflow:hidden;text-overflow:ellipsis}
.cpd-li-v.set{color:#18181b;font-weight:600}
.cpd-li-v svg{color:#a1a1aa;flex-shrink:0}
.cpd-done{margin:6px 12px 4px;font-size:12px;color:#059669}
.cpd-done a{color:inherit;font-weight:600}
`

/** Delivery statuses, each with its colour (the contact panel and the delivery sheet). */
export const DELIVERY_STATUS_OPTIONS: MenuOption[] = [
  { value: 'pending', label: 'Pending', dot: '#f59e0b' },
  { value: 'scheduled', label: 'Scheduled', dot: '#3b82f6' },
  { value: 'out_for_delivery', label: 'Out for delivery', dot: '#8b5cf6' },
  { value: 'delivered', label: 'Delivered', dot: '#16a34a' },
  { value: 'failed', label: 'Failed', dot: '#ef4444' },
]

/** One setting in the list: icon, name, and its current value on the right.
 *  With `menu` the row opens a dropdown of choices (SelectMenu) instead of
 *  running `onClick`. */
export function PanelItem({ icon, label, value, set, onClick, title, menu }: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  set?: boolean
  onClick?: () => void
  title?: string
  menu?: { value: string; options: MenuOption[]; onChange: (v: string) => void; label: string; width?: number }
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement | null>(null)
  return (
    <>
      <button ref={ref} type="button" className={`cpd-li${open ? ' open' : ''}`} title={title}
        aria-haspopup={menu ? 'listbox' : undefined} aria-expanded={menu ? open : undefined}
        onClick={menu ? () => setOpen(v => !v) : onClick}>
        <span className="cpd-ic">{icon}</span>
        <span className="cpd-li-t">{label}</span>
        <span className={`cpd-li-v${set ? ' set' : ''}`}><span>{value}</span>{menu ? CPD_ICON.down : CPD_ICON.chev}</span>
      </button>
      {menu && (
        <SelectPopover open={open} onClose={() => setOpen(false)} anchorRef={ref} value={menu.value} options={menu.options}
          onPick={menu.onChange} label={menu.label} width={menu.width} />
      )}
    </>
  )
}

// The Timeline and Orders tabs (pt-*): an AI summary card with round ticks,
// a timeline rail, pages visited as quiet rows, store stats as tiles, and
// order cards with grey action pills.
export const PT_CSS = `
.pt-ai,.pt-orders,.pt-sec{--pt-fill:#f4f4f5;--pt-fill-2:#ececef;--pt-line:#ececee;--pt-ink:var(--ink,#18181b);--pt-muted:#71717a;--pt-soft:#8e8e93}
[data-theme="dark"] .pt-ai,[data-theme="dark"] .pt-orders,[data-theme="dark"] .pt-sec{--pt-fill:#2a2a2e;--pt-fill-2:#333337;--pt-line:#2e2e33;--pt-muted:#a1a1aa;--pt-soft:#8b8b90}
.pt-ai button::before,.pt-sec button::before,.pt-orders button::before,.pt-pill::before{display:none!important}
.pt-ai{margin-bottom:18px;padding:14px 14px 14px;border-radius:18px;background:color-mix(in srgb,#8b5cf6 7%,var(--card,#fff))}
.pt-ai-head{display:flex;align-items:center;gap:8px}
.pt-ai-ic{width:28px;height:28px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,#8b5cf6 16%,var(--card,#fff));color:#7c3aed}
.pt-ai h3{margin:0;flex:1;font-size:14px;font-weight:650;color:var(--pt-ink)}
.pt-ai-btn{height:30px;padding:0 13px;border:none;border-radius:999px;background:#7c3aed;color:#fff;font:inherit;font-size:12.5px;font-weight:650;cursor:pointer;transition:filter .15s}
.pt-ai-btn:hover{filter:brightness(1.08)}
.pt-ai-btn:disabled{opacity:.6;cursor:default}
.pt-ai-text{margin:10px 0 0;font-size:13.5px;line-height:1.55;color:var(--pt-ink)}
.pt-ai-empty{margin:8px 0 0;font-size:13px;line-height:1.5;color:var(--pt-muted)}
.pt-todos{display:flex;flex-direction:column;gap:2px;margin-top:12px;padding-top:10px;border-top:1px solid color-mix(in srgb,#8b5cf6 14%,transparent)}
.pt-lbl{font-size:12px;font-weight:600;color:#7c3aed;margin-bottom:4px}
.pt-todo{position:relative;display:flex;align-items:flex-start;gap:9px;padding:5px 2px;font-size:13px;line-height:1.45;color:var(--pt-ink);cursor:pointer}
.pt-todo input{position:absolute;opacity:0;width:1px;height:1px}
.pt-tick{width:18px;height:18px;margin-top:1px;flex-shrink:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:transparent;box-shadow:inset 0 0 0 1.6px color-mix(in srgb,#8b5cf6 45%,transparent);transition:background .15s,color .15s}
.pt-todo.done .pt-tick{background:#7c3aed;color:#fff;box-shadow:none}
.pt-todo.done .pt-todo-t{text-decoration:line-through;color:var(--pt-muted)}
.pt-todo input:focus-visible+.pt-tick{outline:2px solid #7c3aed;outline-offset:2px}
.pt-ai-foot{margin:6px 0 0;font-size:11.5px;color:var(--pt-muted)}
.pt-sec{margin-bottom:18px}
.pt-sec-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
.pt-sec-h h3,.pt-orders .pt-sec-h h3{margin:0;display:inline-flex;align-items:center;gap:7px;font-size:14px;font-weight:650;color:var(--pt-ink)}
.pt-count{min-width:20px;height:20px;padding:0 6px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:var(--pt-fill);font-size:11.5px;font-weight:600;color:var(--pt-muted);font-variant-numeric:tabular-nums}
.pt-pill{height:30px;padding:0 12px;border:none;border-radius:999px;background:var(--pt-fill,#f4f4f5);color:var(--pt-ink,#18181b);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap}
.pt-pill:hover{background:var(--pt-fill-2,#ececef)}
.pt-icon-btn{width:32px;height:32px;border:none;border-radius:50%;background:var(--pt-fill);color:var(--pt-muted);display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.pt-icon-btn:hover,.pt-icon-btn.on{background:var(--pt-fill-2);color:var(--pt-ink)}
.pt-empty{margin:0;font-size:13px;color:var(--pt-soft)}
.pt-tl{list-style:none;margin:0;padding:0}
.pt-tl li{position:relative;display:flex;gap:12px;padding-bottom:14px}
.pt-tl li:not(:last-child)::after{content:'';position:absolute;left:4px;top:14px;bottom:0;width:1.5px;border-radius:2px;background:var(--pt-line)}
.pt-tl-dot{width:10px;height:10px;margin-top:5px;flex-shrink:0;border-radius:50%;background:var(--coral,#ff7a6b);box-shadow:0 0 0 3px color-mix(in srgb,var(--coral,#ff7a6b) 18%,transparent)}
.pt-tl-body{min-width:0}
.pt-tl-text{margin:0;font-size:13.5px;line-height:1.5;color:var(--pt-ink);overflow-wrap:anywhere}
.pt-tl-meta{margin:3px 0 0;font-size:11.5px;color:var(--pt-soft)}
.pt-pages{list-style:none;margin:0;padding:3px 0;border-radius:16px;background:var(--pt-fill)}
.pt-page{display:flex;align-items:center;gap:10px;padding:9px 12px;text-decoration:none;border-radius:12px}
.pt-pages li+li .pt-page{box-shadow:0 -1px 0 var(--pt-line)}
.pt-page:hover{background:var(--pt-fill-2)}
.pt-page-t{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.35}
.pt-page-t b{font-size:13px;font-weight:600;color:var(--pt-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pt-page-t small{font-size:11.5px;color:var(--pt-soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pt-page-time{flex-shrink:0;display:inline-flex;flex-direction:column;align-items:flex-end;gap:2px;font-size:11px;color:var(--pt-soft)}
.pt-page-time em{font-style:normal;font-size:10.5px;font-weight:700;color:var(--coral,#ff7a6b)}
.pt-card{margin-bottom:12px;padding:12px;border-radius:18px;background:var(--pt-fill)}
.pt-card-h{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.pt-card-h b{font-size:13.5px;font-weight:650;color:var(--pt-ink)}
.pt-card-h small{margin-left:auto;font-size:11.5px;color:var(--pt-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.pt-card-ic{width:26px;height:26px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;background:var(--card,#fff);color:#7c3aed}
.pt-card-ic.plain{background:none}
.pt-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(78px,1fr));gap:6px}
.pt-stats.n3{grid-template-columns:repeat(3,minmax(0,1fr))}
.pt-stats.n4{grid-template-columns:repeat(2,minmax(0,1fr))}
.pt-stats.px2,.pt-stats.px3{grid-template-columns:repeat(2,minmax(0,1fr))}
.pt-stats.px3>div:first-child{grid-column:1/-1}
.pt-stats.n3 span{font-size:15px}
.pt-stats>div{min-width:0;padding:9px 10px;border-radius:12px;background:var(--card,#fff);display:flex;flex-direction:column;gap:1px}
.pt-stats span{font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:17px;font-weight:700;letter-spacing:-.03em;color:var(--pt-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.pt-stats small{font-size:11px;font-weight:500;color:var(--pt-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pt-card-link{display:inline-flex;align-items:center;gap:3px;margin-top:9px;padding:4px 2px;font-size:12.5px;font-weight:600;color:var(--pt-muted);text-decoration:none}
.pt-card-link:hover{color:var(--pt-ink)}
.pt-order{padding:12px;border-radius:18px;background:var(--card,#fff);box-shadow:0 0 0 1px var(--pt-line),0 1px 2px rgba(16,24,40,.04)}
.pt-order.pt-ring{animation:ptRing 2.6s ease}
@keyframes ptRing{0%,70%{box-shadow:0 0 0 2px var(--coral),0 0 0 6px color-mix(in srgb,var(--coral) 18%,transparent)}100%{box-shadow:0 0 0 1px var(--pt-line),0 1px 2px rgba(16,24,40,.04)}}
@media (prefers-reduced-motion:reduce){.pt-order.pt-ring{animation:none;box-shadow:0 0 0 2px var(--coral)}}
.pt-order-n{font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:700;letter-spacing:-.02em;color:var(--pt-ink)}
.pt-status{font-size:11.5px;padding:2px 9px;border-radius:999px;font-weight:650;text-transform:capitalize;white-space:nowrap}
.pt-order-total{font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:700;letter-spacing:-.02em;color:var(--pt-ink);white-space:nowrap;font-variant-numeric:tabular-nums}
.pt-order-date{font-size:11.5px;color:var(--pt-soft);white-space:nowrap}
.pt-li{display:flex;align-items:center;gap:10px;margin:6px 0}
.pt-thumb{width:40px;height:40px;flex-shrink:0;border-radius:11px;object-fit:cover;background:var(--pt-fill)}
.pt-thumb.ph{display:flex;align-items:center;justify-content:center;color:var(--pt-soft)}
.pt-li-t{margin:0;font-size:12.5px;line-height:1.4;color:var(--pt-ink)}
.pt-li-t b{font-weight:650}
.pt-li-sku{margin:1px 0 0;font-size:11px;color:var(--pt-soft);font-variant-numeric:tabular-nums}
.pt-link{margin-top:4px;padding:0;border:none;background:none;font:inherit;font-size:12.5px;font-weight:600;color:var(--coral,#ff7a6b);cursor:pointer}
.pt-ship{margin:8px 0 0;display:flex;align-items:center;gap:7px;font-size:12px;color:var(--pt-muted)}
.pt-orders{display:flex;flex-direction:column}
`
