// What's open on the page, for the floating Colvy AI assistant (components/
// ColvyAssistant): "reply to this customer" means the open conversation.
//
// Kept on window as well as sent as an event: the assistant lives in the
// layout, so its listener (and its reset when the page changes) can run after
// a page has already published — reading the latest value when a question is
// asked can't miss it. It's tagged with the page it came from, so it never
// leaks onto another page.

export type AiPageContext = { conversationId?: string | null; contactId?: string | null; orderId?: string | null; callId?: string | null; outletId?: string | null }

export function publishAiContext(detail: AiPageContext) {
  if (typeof window === 'undefined') return
  try {
    ;(window as any).__colvyAiCtx = { ...((window as any).__colvyAiCtx?.route === window.location.pathname ? (window as any).__colvyAiCtx : {}), ...detail, route: window.location.pathname }
    window.dispatchEvent(new CustomEvent('colvy:ai-context', { detail }))
  } catch {}
}

/** The latest context published on this page, if any. */
export function readAiContext(pathname: string): AiPageContext {
  if (typeof window === 'undefined') return {}
  const c = (window as any).__colvyAiCtx
  if (!c || c.route !== pathname) return {}
  const { route: _route, ...rest } = c
  return rest
}
