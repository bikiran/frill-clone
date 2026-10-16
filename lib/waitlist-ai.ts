// Waitlist entries the AI added — shared by the Waitlists page, /api/waitlist
// and the code that adds them (lib/waitlist-add.ts). Pure helpers, safe on the
// client and in tests.
//
//   source 'ai_agent'  an AI agent added them from a conversation (agent_run_id
//                      is the run, added_by e.g. "Colvy AI (Support Agent)")
//   source 'colvy_ai'  Colvy AI added them when a team member asked
//                      (added_by "Colvy AI (requested by Sam)")

export const AI_WAITLIST_SOURCES = ['ai_agent', 'colvy_ai'] as const

export const isAiAdded = (e: any): boolean => !!e && (AI_WAITLIST_SOURCES as readonly string[]).includes(String(e.source || ''))

/** "Colvy AI (Support Agent)" — who added it, in words. */
export function aiAddedBy(e: any): string {
  const saved = String(e?.added_by || '').trim()
  if (saved) return saved
  return e?.source === 'colvy_ai' ? 'Colvy AI (asked by a team member)' : 'Colvy AI agent'
}

export function countAiAdded(entries: any[]): number {
  let n = 0
  for (const e of entries || []) if (isAiAdded(e) && e.status !== 'cancelled') n++
  return n
}

/** Where a waitlist entry opens on the Waitlists page. */
export const waitlistEntryHref = (id: string) => `/admin/waitlists?entry=${encodeURIComponent(id)}`

/** The agent's name for "added_by": "Colvy Support Agent" → "Colvy AI (Support Agent)". */
export const agentAddedBy = (roleName: string) => `Colvy AI (${String(roleName || 'agent').replace(/^Colvy\s+/i, '').trim() || 'agent'})`

/** Colvy AI acting for a team member. */
export const assistantAddedBy = (staffName?: string | null) => `Colvy AI (requested by ${String(staffName || '').trim() || 'a team member'})`
