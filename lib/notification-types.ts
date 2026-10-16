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
  'sms', 'email', 'facebook', 'instagram',
  'order', 'cart',
  'booking', 'ticket', 'call', 'calendar',
  'realestate', 'integration', 'agent_escalation',
  'mention', 'task_assigned', 'task_mention', 'task_comment', 'media_note',
]

const STAFF_ONLY = new Set(STAFF_ONLY_NOTIFICATION_TYPES)

export function isStaffOnlyNotificationType(type: string | null | undefined): boolean {
  return STAFF_ONLY.has(String(type || '').trim().toLowerCase())
}
