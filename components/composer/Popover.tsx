'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { computePopoverPosition, isOutsideClick, popoverKeyAction, popoverRegistry, type Position } from './popover-logic'

// The one popover every composer toolbar button uses (templates, emoji, booking
// link, review request, short link, the + menu). It is drawn in a portal with
// fixed positioning, so a card with overflow:hidden can't clip it and it can't
// drift away from its button:
//   - anchored to its own button, flips above/below and stays on screen;
//   - closes on an outside click, Escape, picking an item (the caller closes),
//     and when another popover opens;
//   - keyboard: focuses the first item (or [data-autofocus]) on open, arrows /
//     Home / End move between [data-pop-item] buttons, Enter activates.

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/**
 * Join the one-open-at-a-time rule from a menu that isn't a Popover (the
 * inbox's "/" quick replies, channel and move menus, @mentions): while `open`,
 * opening any other composer popover calls `close`, and opening this closes it.
 */
export function useOneOpen(open: boolean, close: () => void) {
  const id = useId()
  const closeRef = useRef(close)
  useIsoLayoutEffect(() => { closeRef.current = close })
  useEffect(() => {
    if (!open) return
    popoverRegistry.open(id, () => closeRef.current())
    return () => popoverRegistry.release(id)
  }, [open, id])
}

/** The element to give focus back to: the anchor if it's a control, else the button inside it. */
function focusTarget(a: HTMLElement | null): HTMLElement | null {
  if (!a) return null
  if (a.matches('button, a[href], input, select, textarea, [tabindex]')) return a
  return a.querySelector<HTMLElement>('button, a[href], [tabindex]')
}

export function usePopover() {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement | null>(null)
  const close = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => setOpen(v => !v), [])
  return { open, setOpen, close, toggle, anchorRef }
}

interface Props {
  open: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement | null>
  children: React.ReactNode
  width?: number
  prefer?: 'top' | 'bottom'
  align?: 'start' | 'end'
  label?: string                // accessible name
  role?: 'menu' | 'dialog' | 'listbox'
  padding?: number | string
  autoFocus?: boolean           // focus [data-autofocus] or the first item on open (default true)
  radius?: number               // corner radius (default 12)
}

export const POPOVER_CSS = `
.cpop{animation:cpopIn .16s cubic-bezier(.22,1,.36,1) both}
@keyframes cpopIn{from{opacity:0;transform:translate3d(0,4px,0) scale(.98)}to{opacity:1;transform:none}}
.cpop-item{display:flex;align-items:center;gap:9px;width:100%;text-align:left;padding:9px 10px;border:none;background:none;border-radius:8px;cursor:pointer;font:inherit;font-size:13px;color:var(--ink)}
.cpop-item:hover,.cpop-item:focus-visible,.cpop-item[data-active="true"]{background:var(--canvas,#f5f6f8);outline:none}
.cpop-item:disabled{opacity:.55;cursor:default}
.cpop [role=menuitem][data-pop-item]:hover,.cpop [data-pop-item]:focus-visible{background:var(--canvas,#f5f6f8)!important;outline:none}
.cpop-head{margin:2px 8px 6px;font-size:11px;font-weight:800;letter-spacing:.04em;color:var(--slate);text-transform:uppercase}
/* Sellio menu rows (the composer + menu, booking links): a tinted icon tile and a label, in labelled groups. */
.cpop .cmp-plus-item::before,.cpop .cmp-pop-btn::before{display:none}
.cmp-plus-group+.cmp-plus-group{margin-top:4px;padding-top:4px;border-top:1px solid color-mix(in srgb,var(--border,#e5e7eb) 70%,transparent)}
.cmp-plus-head{margin:6px 10px 4px;font-size:11.5px;font-weight:600;color:var(--slate)}
.cmp-plus-item{--tint:var(--slate);display:flex;align-items:center;gap:11px;width:100%;min-height:42px;padding:5px 8px;border:none;border-radius:13px;background:none;font:inherit;font-size:13.5px;font-weight:550;color:var(--ink);text-align:left;cursor:pointer;transition:background .12s}
.cpop .cmp-plus-item:hover,.cpop .cmp-plus-item:focus-visible{background:color-mix(in srgb,var(--slate,#64748b) 8%,transparent)!important;outline:none}
.cmp-plus-item:disabled{opacity:.5;cursor:default}
.cmp-plus-ic{width:32px;height:32px;flex-shrink:0;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;color:var(--tint);background:color-mix(in srgb,var(--tint) 13%,transparent)}
.cmp-plus-item b{display:block;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cmp-plus-item small{display:block;margin-top:1px;font-size:12px;font-weight:450;color:var(--slate);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cmp-pop-head{display:flex;gap:12px;align-items:flex-start;margin-bottom:14px}
.cmp-pop-head b{display:block;font-family:var(--font-display),-apple-system,sans-serif;font-size:17px;font-weight:700;letter-spacing:-.02em;color:var(--ink)}
.cmp-pop-head small{display:block;margin-top:3px;font-size:12.5px;line-height:1.45;color:var(--slate)}
.cmp-pop-badge{width:38px;height:38px;flex-shrink:0;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;background:var(--peach,#fff4f1);color:var(--coral,#ff7a6b)}
.cmp-pop-in{width:100%;box-sizing:border-box;height:46px;padding:0 14px;border-radius:14px;border:1.5px solid transparent;background:color-mix(in srgb,var(--slate,#64748b) 8%,var(--card,#fff));font:inherit;font-size:14px;color:var(--ink);outline:none;transition:background .15s,box-shadow .15s}
.cmp-pop-in:focus{background:var(--card,#fff);border-color:color-mix(in srgb,var(--slate,#64748b) 14%,transparent);box-shadow:0 0 0 3px color-mix(in srgb,var(--coral,#ff7a6b) 14%,transparent)}
[data-theme="dark"] .cmp-pop-in{background:#2a2a2e!important;border-color:transparent!important}
[data-theme="dark"] .cmp-pop-in:focus{background:#333337!important}
.cmp-pop-err{margin:8px 2px 0;font-size:12.5px;font-weight:600;color:#dc2626}
.cmp-pop-acts{display:flex;gap:8px;margin-top:12px}
.cmp-pop-btn{flex:1;height:42px;padding:0 16px;border:none;border-radius:999px;background:color-mix(in srgb,var(--slate,#64748b) 9%,var(--card,#fff));color:var(--ink);font:inherit;font-size:13.5px;font-weight:650;cursor:pointer;white-space:nowrap;transition:filter .15s,background .15s}
.cmp-pop-btn:hover{background:color-mix(in srgb,var(--slate,#64748b) 14%,var(--card,#fff))}
.cmp-pop-btn.primary{flex:1.6;background:var(--coral,#ff7a6b);color:#fff}
.cmp-pop-btn.primary:hover{filter:brightness(.95)}
.cmp-pop-btn:disabled{opacity:.45;cursor:not-allowed;filter:none}
@media (prefers-reduced-motion:reduce){.cpop{animation:none}}
`

export default function Popover({ open, onClose, anchorRef, children, width = 280, prefer = 'bottom', align = 'start', label, role = 'dialog', padding = 6, autoFocus = true, radius = 12 }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<Position | null>(null)
  const onCloseRef = useRef(onClose)
  useIsoLayoutEffect(() => { onCloseRef.current = onClose })

  // One open at a time: opening this one closes whichever was open.
  useOneOpen(open, onClose)

  // Once open, keep to the side it opened on while it still fits, so it
  // doesn't jump above/below as a search narrows the list.
  const sideRef = useRef<'top' | 'bottom' | null>(null)
  const place = useCallback(() => {
    const a = anchorRef.current, inner = innerRef.current
    if (!a || !inner) return
    const r = a.getBoundingClientRect()
    const next = computePopoverPosition({
      anchor: { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
      size: { width, height: inner.offsetHeight + 2 },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      prefer: sideRef.current || prefer, align,
    })
    sideRef.current = next.placement
    setPos(cur => (cur && cur.top === next.top && cur.left === next.left && cur.width === next.width && cur.maxHeight === next.maxHeight && cur.placement === next.placement) ? cur : next)
  }, [anchorRef, width, prefer, align])

  useIsoLayoutEffect(() => {
    if (!open) { setPos(null); sideRef.current = null; return }
    place()
  }, [open, place])

  // Keep it attached while the page scrolls / resizes / the content changes.
  useEffect(() => {
    if (!open) return
    const re = () => place()
    window.addEventListener('resize', re)
    window.addEventListener('scroll', re, true)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(re) : null
    if (ro && innerRef.current) ro.observe(innerRef.current)
    return () => { window.removeEventListener('resize', re); window.removeEventListener('scroll', re, true); ro?.disconnect() }
  }, [open, place])

  // Outside click + Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent | MouseEvent) => {
      if (isOutsideClick(e.target, [panelRef.current, anchorRef.current])) onCloseRef.current()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onCloseRef.current()
      try { focusTarget(anchorRef.current)?.focus({ preventScroll: true }) } catch {}
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('keydown', onKey, true) }
  }, [open, anchorRef])

  // Focus the first item once it's placed.
  const focusedRef = useRef(false)
  const triedRef = useRef(false)
  useEffect(() => {
    if (!open) { focusedRef.current = false; triedRef.current = false; return }
    if (!pos || focusedRef.current || !autoFocus) return
    // Content that loads after opening (a list of services) re-places the
    // popover, which runs this again until there's something to focus — unless
    // they've meanwhile moved on to something else on the page.
    if (triedRef.current) {
      const ae = document.activeElement
      if (ae && ae !== document.body && ae !== anchorRef.current && !panelRef.current?.contains(ae)) { focusedRef.current = true; return }
    }
    triedRef.current = true
    const el = panelRef.current?.querySelector<HTMLElement>('[data-autofocus]') || items()[0]
    if (!el) return
    focusedRef.current = true
    try { el.focus({ preventScroll: true }) } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pos, autoFocus])

  const items = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[data-pop-item]:not([disabled])') || [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    const t = e.target as HTMLElement
    if (t.tagName === 'TEXTAREA') return
    if ((e.key === 'Home' || e.key === 'End') && t.tagName === 'INPUT') return
    const list = items()
    const a = popoverKeyAction(e.key, list.indexOf(document.activeElement as HTMLElement), list.length)
    if (a.type === 'focus') { e.preventDefault(); list[a.index]?.focus() }
  }

  if (!open) return null

  const panel = (
    <div ref={panelRef} role={role} aria-label={label} onKeyDown={onKeyDown}
      className="cpop" data-placement={pos?.placement}
      style={{
        position: 'fixed', zIndex: 10000,
        top: pos?.top ?? 0, left: pos?.left ?? 0, width: pos?.width ?? width, maxHeight: pos?.maxHeight,
        visibility: pos ? 'visible' : 'hidden',
        overflowY: 'auto', overscrollBehavior: 'contain', boxSizing: 'border-box',
        background: 'var(--card, #fff)', border: '1px solid var(--border)', borderRadius: radius,
        boxShadow: '0 16px 40px -12px rgba(0,0,0,.25), 0 2px 6px rgba(0,0,0,.06)',
      }}>
      <style>{POPOVER_CSS}</style>
      <div ref={innerRef} style={{ padding }}>{children}</div>
    </div>
  )
  // Server render (tests): no document — render in place.
  if (typeof document === 'undefined') return panel
  return createPortal(panel, document.body)
}
