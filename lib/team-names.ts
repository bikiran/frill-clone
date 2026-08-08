/**
 * Fill in real profile display names for team members.
 *
 * Names live in each user's auth metadata (display_name), which the browser can
 * only read for the current user. So member lists fell back to the email
 * username. This asks the server (service-role) to resolve names for a batch of
 * user ids and rewrites each member's `name` in place — but only when the
 * member doesn't already have an explicit team_members.name.
 */
export async function enrichNames(
  members: { user_id?: string; id: string; name: string; email?: string; avatar?: string | null; _explicitName?: boolean }[]
): Promise<void> {
  const ids = Array.from(new Set(members.map(m => m.user_id).filter(Boolean))) as string[]
  if (ids.length === 0) return
  try {
    const res = await fetch('/api/team/names', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: ids }),
    })
    const { names } = await res.json()
    for (const m of members) {
      const resolved = m.user_id ? names?.[m.user_id]?.name : null
      if (resolved) m.name = resolved
      // Also carry the profile image through, so avatars (e.g. read receipts)
      // can show a real photo instead of an initial.
      const avatar = m.user_id ? names?.[m.user_id]?.avatar_url : null
      if (avatar && !m.avatar) m.avatar = avatar
    }
  } catch { /* keep the fallbacks */ }
}
