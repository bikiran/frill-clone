import { supabase } from '@/lib/supabase'

// How much of a reply came from the dictation mic (Colvy Voice), as the mobile
// app records it: 'typed' when 90%+ of its words were dictated, 'assisted' when
// 3+ were, else nothing. Word-level, so fixing a word or two still counts the
// rest. Stored on messages.metadata.voice and shown as a small tag (VoiceTag).
export type VoiceKind = 'typed' | 'assisted'

const words = (s: string) => (String(s || '').toLowerCase().match(/[\p{L}\p{N}']+/gu) || [])

export function voiceKind(content: string, dictated: string[]): VoiceKind | null {
  const sent = words(content)
  if (!sent.length || !dictated.length) return null
  const pool = new Map<string, number>()
  for (const w of dictated.flatMap(words)) pool.set(w, (pool.get(w) || 0) + 1)
  let matched = 0
  for (const w of sent) {
    const n = pool.get(w) || 0
    if (n > 0) { matched++; pool.set(w, n - 1) }
  }
  if (!matched) return null
  if (matched / sent.length >= 0.9) return 'typed'
  return matched >= 3 ? 'assisted' : null
}

/**
 * Mark the reply a send just wrote (the newest of the team's rows with text in
 * this conversation since the send began). The send routes write the row
 * themselves, so it's tagged after. Best-effort.
 */
export async function tagVoice(conversationId: string, since: string, voice: VoiceKind | null): Promise<void> {
  if (!voice || !conversationId) return
  try {
    const { data: rows } = await (supabase as any).from('messages').select('id, metadata')
      .eq('conversation_id', conversationId).eq('sender_type', 'agent').neq('content', '')
      .gte('created_at', since).order('created_at', { ascending: false }).limit(1)
    const row = rows?.[0]
    if (row && !row.metadata?.voice) {
      await (supabase as any).from('messages').update({ metadata: { ...(row.metadata || {}), voice } }).eq('id', row.id)
    }
  } catch { /* the reply is sent either way */ }
}
