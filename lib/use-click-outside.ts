import { useEffect } from 'react'

/**
 * Close a popover/dropdown when the user clicks anywhere else, or presses Escape.
 *
 * Menus that only close by clicking the same button again are quietly annoying —
 * this makes every dropdown behave the way people expect.
 */
export function useClickOutside(
  isOpen: boolean,
  onClose: () => void,
  refs: Array<React.RefObject<HTMLElement | null>>
) {
  useEffect(() => {
    if (!isOpen) return

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node
      // Ignore clicks inside any of the elements we were told to protect
      // (the menu itself, and usually the button that opens it).
      for (const ref of refs) {
        if (ref.current && ref.current.contains(target)) return
      }
      onClose()
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    // 'mousedown' rather than 'click' so the menu closes before any click
    // handler underneath it fires.
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [isOpen, onClose, refs])
}
