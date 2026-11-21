// Does this Enter key press send the message?
//
// On a computer, Enter sends and Shift+Enter starts a new line. On a phone or
// tablet's on-screen keyboard, Enter adds a new line and the Send button
// sends, as in WhatsApp and Messenger: that key is drawn as a return arrow,
// people press it expecting a new line, and a reply went out three times when
// someone did.
//
// "Touch keyboard" is a device whose main pointer is a finger (no hover, coarse
// pointer). A tablet used with a trackpad reports a fine pointer and keeps
// Enter to send.

type EnterEvent = { key: string; shiftKey: boolean; nativeEvent?: { isComposing?: boolean; keyCode?: number } }

/** True on a phone or tablet typed on with its on-screen keyboard. */
export function onTouchKeyboard(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try { return window.matchMedia('(hover: none) and (pointer: coarse)').matches } catch { return false }
}

/**
 * True when this key press should send: Enter without Shift, not while an
 * input method is still composing a word (Chinese, Japanese, Korean and the
 * like), and not on a touch keyboard, where Enter adds a new line.
 */
export function isSendEnter(e: EnterEvent, touch: boolean = onTouchKeyboard()): boolean {
  if (e.key !== 'Enter' || e.shiftKey) return false
  if (e.nativeEvent?.isComposing || e.nativeEvent?.keyCode === 229) return false
  return !touch
}
