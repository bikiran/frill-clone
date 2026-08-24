// Resolve an agent's display name from auth metadata (same source as
// /api/team/names), falling back to their team_members email username. Shared by
// the call callbacks so "who answered" reads the same everywhere.

export function prettyFromEmail(email: string): string {
  const local = String(email || '').split('@')[0] || ''
  const pretty = local
    .replace(/[._-]+/g, ' ')
    .replace(/\d+$/, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
  return pretty || local || 'A team member'
}

export async function resolveAgentName(db: any, userId: string, companyId: string): Promise<string> {
  if (!userId) return 'A team member'
  try {
    const { data } = await db.auth.admin.getUserById(userId)
    const u = data?.user
    const meta = (u?.user_metadata?.display_name || u?.user_metadata?.full_name) as string | undefined
    if (meta && meta.trim()) return meta.trim()
    if (u?.email) return prettyFromEmail(u.email)
  } catch { /* service-role unavailable, or not an auth user — fall through */ }
  try {
    const { data: tm } = await db.from('team_members')
      .select('email').eq('user_id', userId).eq('company_id', companyId).maybeSingle()
    if (tm?.email) return prettyFromEmail(tm.email)
  } catch {}
  return 'A team member'
}
