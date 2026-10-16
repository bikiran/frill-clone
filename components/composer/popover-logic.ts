// Pure helpers behind the composer's toolbar popovers (templates, emoji,
// booking link, review request, short link, the + menu). Kept free of React and
// the DOM so the rules — where a popover sits, what counts as an outside click,
// which key does what, and "only one open at a time" — can be tested directly.

export interface Box { top: number; left: number; right: number; bottom: number; width: number; height: number }

export interface PositionInput {
  anchor: Box                              // the button's rect (viewport coords)
  size: { width: number; height: number }  // the popover's natural size
  viewport: { width: number; height: number }
  prefer?: 'top' | 'bottom'                // the side to try first
  align?: 'start' | 'end'                  // line up with the button's left or right edge
  gap?: number                             // space between button and popover
  margin?: number                          // closest the popover may get to the screen edge
}

export interface Position { top: number; left: number; width: number; maxHeight: number; placement: 'top' | 'bottom' }

/**
 * Where a popover goes: next to its own button, on the preferred side when it
 * fits, flipped when it doesn't, and always clamped inside the viewport (on a
 * phone it narrows to the screen width minus the margins). When neither side
 * has room for the whole thing it takes the roomier side and scrolls.
 */
export function computePopoverPosition(i: PositionInput): Position {
  const gap = i.gap ?? 6
  const margin = i.margin ?? 8
  const vw = Math.max(0, i.viewport.width)
  const vh = Math.max(0, i.viewport.height)
  const width = Math.max(0, Math.min(i.size.width, vw - margin * 2))

  // Horizontal: start at the button's edge, then clamp into the screen.
  let left = (i.align === 'end') ? i.anchor.right - width : i.anchor.left
  left = Math.min(left, vw - margin - width)
  left = Math.max(left, margin)

  // Vertical: preferred side if it fits, else the other side if that fits,
  // else whichever side has more room (and scroll inside it).
  const below = vh - i.anchor.bottom - gap - margin
  const above = i.anchor.top - gap - margin
  const h = i.size.height
  const prefer = i.prefer ?? 'bottom'
  let placement: 'top' | 'bottom'
  if (prefer === 'bottom') placement = h <= below ? 'bottom' : h <= above ? 'top' : (below >= above ? 'bottom' : 'top')
  else placement = h <= above ? 'top' : h <= below ? 'bottom' : (above >= below ? 'top' : 'bottom')
  const room = Math.max(0, placement === 'bottom' ? below : above)
  const maxHeight = Math.max(80, Math.floor(room))
  const shown = Math.min(h, maxHeight)
  let top = placement === 'bottom' ? i.anchor.bottom + gap : i.anchor.top - gap - shown
  // Never off the top or bottom of the screen.
  top = Math.min(top, vh - margin - shown)
  top = Math.max(top, margin)
  return { top: Math.round(top), left: Math.round(left), width: Math.round(width), maxHeight, placement }
}

/** Minimal "contains" shape so this is testable without a DOM. */
export interface ContainsLike { contains(other: any): boolean }

/**
 * A pointer-down closes the popover only when it lands outside the popover AND
 * outside its own button (the button toggles it itself, so counting it as
 * outside would close-then-reopen).
 */
export function isOutsideClick(target: unknown, inside: Array<ContainsLike | null | undefined>): boolean {
  if (!target) return false
  for (const el of inside) if (el && el.contains(target)) return false
  return true
}

export type KeyAction =
  | { type: 'focus'; index: number }
  | { type: 'close' }
  | { type: 'none' }

/**
 * Keyboard inside an open popover: arrows move between items (wrapping), Home
 * and End jump, Escape closes. Enter / Space are left to the focused button,
 * which activates natively. `index` is the focused item (-1 = none, e.g. the
 * search box has focus).
 */
export function popoverKeyAction(key: string, index: number, count: number): KeyAction {
  if (key === 'Escape') return { type: 'close' }
  if (count <= 0) return { type: 'none' }
  if (key === 'ArrowDown') return { type: 'focus', index: index < 0 ? 0 : (index + 1) % count }
  if (key === 'ArrowUp') return { type: 'focus', index: index < 0 ? count - 1 : (index - 1 + count) % count }
  if (key === 'Home') return { type: 'focus', index: 0 }
  if (key === 'End') return { type: 'focus', index: count - 1 }
  return { type: 'none' }
}

/**
 * One popover open at a time across the composer: opening one closes the
 * previous. Each Popover registers its close function while open.
 */
export function createOpenRegistry() {
  let current: { id: string; close: () => void } | null = null
  return {
    open(id: string, close: () => void) {
      if (current && current.id !== id) { const prev = current; current = null; prev.close() }
      current = { id, close }
    },
    release(id: string) { if (current?.id === id) current = null },
    currentId: () => current?.id ?? null,
  }
}

export const popoverRegistry = createOpenRegistry()
