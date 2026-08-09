'use client'

import { supabase } from '@/lib/supabase'

/**
 * Live notes sync (web ⇄ mobile), over Broadcast — same proven transport as the
 * chat widget (lib/chat-broadcast.ts). We announce over the WebSocket rather
 * than the REST broadcast endpoint because that's the path the app already uses
 * successfully everywhere else.
 *
 * The payload carries only ids — never note content — so it needs no table
 * RLS/publication changes and leaks nothing: every listener refetches through
 * its own access-controlled /api/notes call.
 *
 * Echo suppression is keyed on a per-session client id (see the notes page), NOT
 * the user id: the same person is often signed in on both web and mobile, so
 * suppressing by user id would make each device ignore the other's changes.
 * Delivery is best effort — a missed nudge just means that view catches up on
 * its next manual reload.
 */

export const notesChannelName = (companyId: string) => `notes:${companyId}`

export interface NotesChangePayload {
  id?: string | null
  action: string
  by: string // per-session client id of the originator
}

export async function broadcastNotesChange(companyId: string, payload: NotesChangePayload) {
  if (!companyId) return
  try {
    const ch = supabase.channel(notesChannelName(companyId), {
      config: { broadcast: { self: false } },
    })
    await ch.subscribe()
    await ch.send({ type: 'broadcast', event: 'changed', payload })
    // Nothing listens on this throwaway channel; release it rather than
    // accumulating one per change.
    setTimeout(() => { try { supabase.removeChannel(ch) } catch {} }, 1500)
  } catch {
    /* the change is already saved — the other side catches up on refetch */
  }
}
