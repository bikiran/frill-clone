/**
 * iPhone (and Google Messages) reactions arriving over SMS.
 *
 * A tapback isn't a real SMS feature. When someone on an iPhone reacts to a
 * text from a non-iMessage number, the carrier delivers a whole new message
 * whose body is a sentence describing the reaction:
 *
 *   Loved “Hi Lana, good morning. I know the wait is tough…”
 *   Laughed at "see you then"
 *   Reacted 😂 to “that's the one”
 *
 * Left alone, each one lands in the thread as a separate customer message and
 * fires its own push, so a handful of taps buries the real conversation and
 * rings the phone for nothing.
 *
 * These functions recognise that shape and say which message was reacted to,
 * so the reaction can be attached to the original instead.
 */

export type Tapback = { emoji: string; quoted: string }

// Apple's wording. Order matters: "Laughed at" must be tried before "Liked"
// would ever be reached by a looser pattern, and the list is anchored so a
// customer writing "Loved that, thanks" is not mistaken for a reaction.
const APPLE: Array<[RegExp, string]> = [
  [/^Loved\s+/i, '❤️'],
  [/^Liked\s+/i, '👍'],
  [/^Disliked\s+/i, '👎'],
  [/^Laughed at\s+/i, '😂'],
  [/^Emphasi[sz]ed\s+/i, '‼️'],
  [/^Questioned\s+/i, '❓'],
  // Removal — iOS sends these when a tapback is taken back. Treated as a
  // reaction event so it does not land as a message; matchReactedMessage's
  // caller decides what to do with an unknown emoji.
  [/^Removed a heart from\s+/i, '❤️'],
  [/^Removed a like from\s+/i, '👍'],
  [/^Removed a dislike from\s+/i, '👎'],
  [/^Removed a laugh from\s+/i, '😂'],
  [/^Removed an exclamation from\s+/i, '‼️'],
  [/^Removed a question mark from\s+/i, '❓'],
]

// Straight and curly quotes both occur, depending on the sending OS.
const QUOTED = /^[“"'](.*)[”"']$/s

/**
 * Returns the emoji and the quoted original when `body` is a tapback, else
 * null. Deliberately strict: the whole message must be the reaction sentence,
 * so ordinary text that happens to begin with "Loved" is left alone.
 */
export function parseTapback(body: string | null | undefined): Tapback | null {
  const raw = String(body || '').trim()
  if (!raw) return null

  // Google Messages: Reacted <emoji> to "…"
  const g = /^Reacted\s+(\S+)\s+to\s+(.+)$/su.exec(raw)
  if (g) {
    const quoted = QUOTED.exec(g[2].trim())
    if (quoted) return { emoji: g[1], quoted: quoted[1] }
    return null
  }

  for (const [prefix, emoji] of APPLE) {
    if (!prefix.test(raw)) continue
    const rest = raw.replace(prefix, '').trim()
    const quoted = QUOTED.exec(rest)
    if (quoted) return { emoji, quoted: quoted[1] }
    return null
  }
  return null
}

/**
 * Picks the message a tapback refers to, out of the thread's recent messages.
 *
 * Apple truncates a long original and appends an ellipsis, so an exact match is
 * tried first and a prefix match second. Newest first, because reacting twice
 * to the same wording should land on the most recent instance.
 *
 * Returns null when nothing matches — the caller must then keep the message
 * rather than discard it. Losing a customer's words to a failed guess would be
 * far worse than an occasional stray "Loved …" in the thread.
 */
export function matchReactedMessage<T extends { id: string; content?: string | null }>(
  quoted: string,
  messages: T[],
): T | null {
  const norm = (v: unknown) => String(v || '').replace(/\s+/g, ' ').trim()
  // Apple's ellipsis is a single character; some carriers send three dots.
  const want = norm(quoted).replace(/(…|\.\.\.)$/, '')
  if (!want) return null

  const exact = messages.find(m => norm(m.content) === want)
  if (exact) return exact

  // Truncated: the original starts with what was quoted. Require a reasonable
  // length so a two-character quote cannot match half the thread.
  if (want.length < 8) return null
  return messages.find(m => norm(m.content).startsWith(want)) || null
}
