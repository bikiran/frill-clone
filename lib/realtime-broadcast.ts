// Fire-and-forget Supabase Realtime broadcast from the server (service role).
//
// Used to nudge live UIs to refetch when data changes — the payload carries no
// sensitive content (just ids), so it needs no table RLS/publication changes and
// never leaks data: every client re-fetches through its access-controlled API.
// Clients subscribe with:  supabase.channel(topic).on('broadcast', {event}, cb)
export async function broadcast(topic: string, event: string, payload: any): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic, event, payload }] }),
    })
  } catch { /* best-effort: a missed nudge just means a manual reload */ }
}
