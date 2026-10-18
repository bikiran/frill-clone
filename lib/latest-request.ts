/**
 * Keep only the newest of a stream of requests.
 *
 * Each start() aborts the request before it and hands back a signal plus an
 * isCurrent() check. A response is used only if isCurrent() is still true when
 * it arrives — so a slow answer to an old question can never overwrite the
 * answer to the newest one (the abort alone isn't enough: a response already
 * on its way when abort() is called still resolves).
 */
export interface LatestTicket { id: number; signal: AbortSignal | undefined; isCurrent: () => boolean }

export function latestOnly() {
  let seq = 0
  let ctrl: AbortController | null = null
  return {
    start(): LatestTicket {
      ctrl?.abort()
      ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
      const id = ++seq
      return { id, signal: ctrl?.signal, isCurrent: () => id === seq }
    },
    /** Drop whatever is in flight (nothing that's pending will be used). */
    cancel() { ctrl?.abort(); ctrl = null; seq++ },
  }
}

/** Was this error an abort we asked for? */
export const isAbort = (e: any) => e?.name === 'AbortError'
