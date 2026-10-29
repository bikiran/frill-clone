'use client'

import Popover from '@/components/composer/Popover'

// A Sellio-style dropdown list, in place of the browser's own <select> popup:
// rounded rows with an icon or a colour dot, an optional second line, and a
// tick on the current choice. It rides on the composer Popover, so it's
// anchored to its button, flips to stay on screen, closes on an outside click
// or Escape and works with the arrow keys (it opens on the current choice).

export type MenuOption = {
  value: string
  label: string
  icon?: React.ReactNode
  /** A small colour dot instead of an icon (statuses). */
  dot?: string
  hint?: string
}

export function SelectPopover({ open, onClose, anchorRef, value, options, onPick, label, width = 248, align = 'end', prefer = 'bottom' }: {
  open: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement | null>
  value: string
  options: MenuOption[]
  onPick: (value: string) => void
  label: string
  width?: number
  align?: 'start' | 'end'
  prefer?: 'top' | 'bottom'
}) {
  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} width={width} align={align} prefer={prefer} role="listbox" label={label} padding={6} radius={18}>
      <style>{SMENU_CSS}</style>
      {options.map(o => {
        const on = o.value === value
        return (
          <button key={o.value || '_'} type="button" role="option" aria-selected={on} data-pop-item data-autofocus={on || undefined}
            className={`smenu-item${on ? ' on' : ''}`} onClick={() => { onPick(o.value); onClose() }}>
            {o.dot ? <span className="smenu-dot" style={{ background: o.dot }} aria-hidden />
              : o.icon ? <span className="smenu-ic" aria-hidden>{o.icon}</span> : null}
            <span className="smenu-t">
              <span>{o.label}</span>
              {o.hint && <small>{o.hint}</small>}
            </span>
            {on && <svg className="smenu-tick" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>}
          </button>
        )
      })}
    </Popover>
  )
}

/** A round initial for a person in a menu (teammates). */
export function MenuAvatar({ name, color = '#6366f1' }: { name: string; color?: string }) {
  return <span className="smenu-av" style={{ background: color }}>{(name || '?').charAt(0).toUpperCase()}</span>
}

const SMENU_CSS = `
.smenu-item{display:flex;align-items:center;gap:11px;width:100%;min-height:42px;padding:8px 10px;border:none;border-radius:12px;background:none;font:inherit;font-size:14px;color:var(--ink);text-align:left;cursor:pointer}
.smenu-item::before{display:none!important}
.smenu-item:hover,.smenu-item:focus-visible{background:var(--smenu-hover,#f4f4f5);outline:none}
[data-theme="dark"] .smenu-item:hover,[data-theme="dark"] .smenu-item:focus-visible{--smenu-hover:#2a2a2e}
.smenu-item.on{font-weight:600}
.smenu-ic{width:22px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;color:var(--slate)}
.smenu-dot{width:10px;height:10px;margin:0 6px;flex-shrink:0;border-radius:50%}
.smenu-av{width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-size:11.5px;font-weight:700}
.smenu-t{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.3}
.smenu-t>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.smenu-t small{font-size:12px;font-weight:400;color:var(--slate);white-space:normal}
.smenu-tick{flex-shrink:0;color:var(--ink)}
`
