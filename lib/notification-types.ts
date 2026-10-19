// Bell notification types that carry a workspace's own business (customers'
// messages, orders, bookings, calls, team tasks) and so may only ever reach that
// workspace's staff: its owner, or a team member who isn't a board visitor
// ('viewer') and hasn't been removed (lib/company-access.ts staffUserIds).
//
// Everything else (vote, comment, reply, status_change, assigned, announcement)
// is a public-board notification a visitor may legitimately get.
//
// Keep in step with migrations/COLVY_V383_PRUNE_VISITOR_NOTIFICATIONS.sql,
// which deleted old rows of these types held by non-staff.
export const STAFF_ONLY_NOTIFICATION_TYPES: readonly string[] = [
  'chat', 'visitor', 'activity',
  'sms', 'email', 'facebook', 'instagram', 'whatsapp',
  'order', 'cart',
  'booking', 'ticket', 'call', 'calendar',
  'realestate', 'integration', 'agent_escalation',
  'mention', 'task_assigned', 'task_mention', 'task_comment', 'media_note',
]

// The types a browser may write for any user: public-board notifications about
// someone's own idea or comment (lib/notifications.ts createNotification).
// 'announcement' is board-legitimate too but only the server writes it.
// Keep in step with migrations/COLVY_V384_NOTIFICATIONS_INSERT_POLICY.sql. From
// a browser the database takes these only with related_idea_id and with no
// company_id, conversation_id, title, body or link; it takes a staff-only type
// only when the sender and the recipient are staff of company_id (other
// staff-only rows are skipped); anything else is refused.
export const BOARD_NOTIFICATION_TYPES: readonly string[] = [
  'vote', 'comment', 'reply', 'status_change', 'assigned',
]

const STAFF_ONLY = new Set(STAFF_ONLY_NOTIFICATION_TYPES)
const BOARD = new Set(BOARD_NOTIFICATION_TYPES)

export function isStaffOnlyNotificationType(type: string | null | undefined): boolean {
  return STAFF_ONLY.has(String(type || '').trim().toLowerCase())
}

export function isBoardNotificationType(type: string | null | undefined): boolean {
  return BOARD.has(String(type || '').trim().toLowerCase())
}
