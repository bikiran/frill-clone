// The chat widget (app/widget) runs in an iframe. Its window controls ask the
// page around it to resize the panel, and that page tells it back what it did.
// Two hosts speak this protocol:
//   - public/widget.js        the embed script on a business's own site
//   - components/LiveChat.tsx the chat bubble on colvy.com and board pages
//
// Widget -> host (window.parent.postMessage):
//   { colvy: true, type: 'size', mode: WidgetSize }   resize the panel
//   { colvy: true, type: 'close', reason?: string }    fold back into the bubble
// Host -> widget (iframe.contentWindow.postMessage, to the widget's origin):
//   { colvy: true, type: 'size_state', mode: WidgetSize }  what's on screen now
//   { colvy: true, type: 'widget_open', open: boolean }
//
// Hosts only act on messages whose source is their own widget iframe.

export type WidgetSize = 'normal' | 'compact' | 'expanded' | 'fullscreen'

export const WIDGET_SIZES: readonly WidgetSize[] = ['normal', 'compact', 'expanded', 'fullscreen']

export function isWidgetSize(v: unknown): v is WidgetSize {
  return typeof v === 'string' && (WIDGET_SIZES as readonly string[]).includes(v)
}

/** Send a message to the page embedding the widget. The host can be any site
 *  (a business's own), so the target is '*'; nothing private is ever sent. */
export function postToHost(msg: Record<string, unknown>): void {
  try {
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) window.parent.postMessage(msg, '*')
  } catch {}
}

/** The widget's "Board" link: the board address plus campaign tags. */
export function boardLinkFor(boardUrl: string, slug: string): string {
  try {
    const u = new URL(boardUrl)
    u.searchParams.set('utm_source', 'widget')
    u.searchParams.set('utm_medium', 'colvy_widget')
    u.searchParams.set('utm_campaign', slug || 'colvy')
    return u.toString()
  } catch {
    return boardUrl
  }
}

/** Is this message from our own widget iframe? Used by hosts. */
export function fromWidgetFrame(e: { source: unknown; origin: string }, frame: { contentWindow: unknown } | null, origin: string): boolean {
  return !!frame && !!e.source && e.source === frame.contentWindow && e.origin === origin
}
