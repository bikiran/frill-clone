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

// ── Waitlist notes in a conversation ─────────────────────────────────────────
// Adding someone to a waitlist leaves a staff-only note in their conversation
// (messages.metadata.waitlist). The inbox shows it as one quiet centred line,
// like its other event lines, not as a big internal-note card. Older notes
// predate the metadata fields (and started with an emoji), so they're read
// from their text too.

const OLD_NOTE = /^\s*📋\s*Added to the waitlist for /

/** A waitlist note, new or old. */
export const isWaitlistNote = (m: any): boolean => !!m && (!!m.metadata?.waitlist || OLD_NOTE.test(String(m.content || '')))

const tidy = (s: string) => String(s || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]️?/gu, '').replace(/\s+/g, ' ').trim()

export type WaitlistNoteLine = { ai: boolean; text: string; by: string | null; href: string; runId: string | null }

/** What the quiet line says: "Added to the waitlist for X · gets an SMS when it’s back", who, and where it links. */
export function waitlistNoteLine(m: any): WaitlistNoteLine {
  const md = m?.metadata || {}
  const content = String(m?.content || '')
  const href = md.waitlist_href || (md.waitlist_id ? waitlistEntryHref(String(md.waitlist_id)) : '/admin/waitlists')
  const runId = md.agent_run_id || null
  if (md.waitlist_ai) {
    // "Colvy AI (Support Agent) added Thi to the waitlist for X. They’ll get a text…\nhttps://…"
    const first = tidy(content.split('\n')[0]).replace(/\.\s+They(’|')ll get .*$/i, '').replace(/\.$/, '').replace(/waiting list/g, 'waitlist')
    return { ai: true, text: first || `${md.added_by || 'Colvy AI'} added them to the waitlist${md.item_name ? ` for ${md.item_name}` : ''}`, by: null, href, runId }
  }
  const by = md.added_by_name || (m?.sender_name && m.sender_type !== 'system' ? m.sender_name : null) || md.added_by || null
  const old = tidy(content).match(/^Added to the waitlist for (.+?) [—-] they(?:’|')ll get (an SMS|an email|a text)/i)
  const item = md.item_name || old?.[1] || null
  if (item && (md.notify_by || old || /^Added to the waitlist/.test(tidy(content)))) {
    const via = md.notify_by === 'email' || /email/i.test(old?.[2] || '') ? 'an email' : 'an SMS'
    return { ai: false, text: `Added to the waitlist for ${item} · gets ${via} when it’s back`, by, href, runId }
  }
  // Anything else (e.g. "Waiting for X — joined the back-in-stock waitlist on your website on 16 Oct.").
  return { ai: false, text: tidy(content).replace(/\s+[—-]\s+/g, ' · ').replace(/\.$/, ''), by, href, runId }
}

/** A conversation-list preview never shows a waitlist note as-is. */
export function waitlistPreview(text: string | null | undefined): string | null {
  const t = String(text || '')
  if (!OLD_NOTE.test(t)) return text ?? null
  const item = tidy(t).match(/^Added to the waitlist for (.+?)(?: [—-] |$)/i)?.[1]
  return item ? `Added to waitlist: ${item}` : 'Added to waitlist'
}
