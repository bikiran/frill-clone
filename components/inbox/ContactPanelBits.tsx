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
