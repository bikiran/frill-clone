// Where a bell notification takes you when it's clicked (the panel, the
// browser pop-up and the phone push all use this). Pure, so it can be tested.
//
//   order          → that order on the Orders board (by the number in the
//                    message, "#130650"), else its conversation
//   message types,
//   AI agent, assigned,
//   mentions, carts     → the conversation
//   bookings / tasks /
//   calendar / integrations → their page, or the conversation when there is one
//   board types    → the idea, roadmap, update or help article
//
// A link the sender stored (calendar reminders, team notices) is used when
// it's one of our own paths.

/** The order number an order notification names ("… · #130650 from …"), else null. */
export function orderRefOf(n: any): string | null {
  if (n?.order_number) return String(n.order_number).replace(/^#/, '')
  const m = String(n?.message || n?.body || '').match(/#\s?([A-Za-z0-9-]*\d[A-Za-z0-9-]*)/)
  return m ? m[1] : null
}

/** A stored link, when it's a path inside Colvy (never another site). */
function ownLink(n: any): string | null {
  const l = n?.link
  return typeof l === 'string' && l.startsWith('/') && !l.startsWith('//') ? l : null
}

export function notificationPath(n: any, now: number = Date.now()): string {
  const conv = n?.conversation_id || n?.conversationId
  const inbox = conv ? `/admin/inbox?conversation=${conv}` : '/admin/inbox'
  const link = ownLink(n)
  switch (n?.type) {
    case 'idea': return n.idea_id ? `/?idea=${n.idea_id}` : '/'
    case 'roadmap': return '/roadmap'
    case 'announcement': return n.announcement_id ? `/announcements?id=${n.announcement_id}` : (link && link.startsWith('/announcements') ? link : '/announcements')
    case 'help': return n.article_id ? `/help/${n.article_id}` : '/help'
    case 'form': return n.form_id ? `/forms/${n.form_id}` : (link || '/admin/forms')
    case 'settings': return link || '/admin/settings'
    case 'order': {
      // `at` makes a second click on the same order a new link, so it opens
      // again even when the Orders board is already showing.
      const ref = orderRefOf(n)
      if (ref) return `/admin/orders?order=${encodeURIComponent(ref)}&at=${now}`
      return link || (conv ? inbox : '/admin/orders')
    }
    case 'task': case 'task_assigned': case 'task_comment': return link || '/admin/tasks'
    case 'booking': return link || (conv ? inbox : '/admin/bookings')
    case 'calendar': return link || (conv ? inbox : '/admin/calendar')
    case 'integration': return link || '/admin/integrations'
    case 'chat': case 'sms': case 'call': case 'email': case 'whatsapp': case 'messenger': case 'instagram':
    case 'agent_escalation': case 'conversation_assigned': case 'mention':
    case 'ticket': case 'cart': case 'activity':
      return link || inbox
    default: return link || (conv ? inbox : '/admin')
  }
}

/** The conversation an inbox path opens (`/admin/inbox?conversation=<id>`), else null. */
export function conversationOfPath(path: string): string | null {
  const m = /^\/admin\/inbox\?(?:.*&)?conversation=([^&#]+)/.exec(path || '')
  return m ? decodeURIComponent(m[1]) : null
}

/**
 * Go to a notification's page. Already in the inbox, a conversation link
 * changes the address in place (the native History API, which Next's router
 * keeps in step with) and tells the open inbox which conversation to show: a
 * router.push to the same page with only a new ?conversation= never finished,
 * so the click did nothing. Anywhere else it's an ordinary navigation, and
 * the inbox reads ?conversation= when it opens.
 */
export function goToNotificationPath(router: { push: (p: string) => void }, path: string) {
  const conv = conversationOfPath(path)
  if (conv && typeof window !== 'undefined' && window.location.pathname === '/admin/inbox') {
    try { window.history.pushState(null, '', path) } catch {}
    try { window.dispatchEvent(new CustomEvent('colvy:open-conversation', { detail: { conversationId: conv } })) } catch {}
    return
  }
  router.push(path)
}
