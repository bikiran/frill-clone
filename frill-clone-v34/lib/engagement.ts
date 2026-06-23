import { supabase } from '@/lib/supabase'

// Stable per-browser guest id so anonymous users keep their likes/subs.
export function getGuestId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('guest_id')
  if (!id) {
    id = 'guest_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem('guest_id', id)
  }
  return id
}

type Table = 'idea_likes' | 'idea_subscriptions'

async function identity() {
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user?.id || null
  return { userId, guestId: userId ? null : getGuestId() }
}

// Returns the new state: true = now active (liked/subscribed), false = removed.
export async function toggleEngagement(table: Table, ideaId: string, currentlyActive: boolean): Promise<boolean> {
  const { userId, guestId } = await identity()
  const match: Record<string, string> = { idea_id: ideaId }
  if (userId) match.user_id = userId
  else if (guestId) match.guest_id = guestId

  if (currentlyActive) {
    let q = supabase.from(table).delete().eq('idea_id', ideaId)
    q = userId ? q.eq('user_id', userId) : q.eq('guest_id', guestId as string)
    await q
    return false
  } else {
    await supabase.from(table).insert({ idea_id: ideaId, user_id: userId, guest_id: guestId })
    return true
  }
}

// Fetch the set of idea ids the current identity has engaged with.
export async function fetchEngagedIdeaIds(table: Table): Promise<Set<string>> {
  const { userId, guestId } = await identity()
  let q = supabase.from(table).select('idea_id')
  q = userId ? q.eq('user_id', userId) : q.eq('guest_id', guestId as string)
  const { data } = await q
  return new Set((data || []).map((r: { idea_id: string }) => r.idea_id))
}
