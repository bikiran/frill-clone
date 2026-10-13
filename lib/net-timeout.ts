// Time limits for the browser's reads, so a database that's down (or hanging)
// shows an error in seconds instead of leaving pages spinning for minutes.
//
// Only reads get a limit: uploads and AI requests legitimately take longer, so
// they're left alone. When a read gives up — or the network fails outright —
// a `colvy:backend` event says so (the admin shows a banner); the next
// successful read says it's back.

export const DB_READ_TIMEOUT_MS = 15_000
export const API_READ_TIMEOUT_MS = 30_000

type Health = 'down' | 'up'
let last: Health = 'up'
/** True while the last read gave up or the network failed (no answer since). */
export const isBackendDown = () => last === 'down'
function report(state: Health) {
  if (typeof window === 'undefined' || state === last) return
  last = state
  try { window.dispatchEvent(new CustomEvent('colvy:backend', { detail: { state } })) } catch {}
}

const isAbort = (e: any) => e?.name === 'AbortError' || e?.name === 'TimeoutError'

/**
 * fetch with a time limit when `limitMs` is given and the caller didn't pass
 * its own signal. Reports the backend as down on a timeout or network failure,
 * and up again on any answer from the server.
 */
export async function fetchWithLimit(input: RequestInfo | URL, init: RequestInit | undefined, limitMs: number | null): Promise<Response> {
  const useLimit = !!limitMs && !init?.signal
  const signal = useLimit ? AbortSignal.timeout(limitMs!) : init?.signal
  try {
    const res = await fetch(input, { ...init, ...(signal ? { signal } : {}) })
    // 5xx from the gateway means the database side is unwell; anything else is an answer.
    report(res.status === 502 || res.status === 503 || res.status === 504 ? 'down' : 'up')
    return res
  } catch (e: any) {
    // The caller's own cancel isn't an outage.
    if (!(isAbort(e) && !useLimit)) report('down')
    if (useLimit && isAbort(e)) throw new Error('Colvy took too long to answer. Check your connection and try again.')
    throw e
  }
}

const urlOf = (input: RequestInfo | URL) => typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
const methodOf = (input: RequestInfo | URL, init?: RequestInit) => String(init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase()

/** The fetch the browser's Supabase client uses: a limit on database and sign-in reads only. */
export function supabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = urlOf(input)
  const read = ['GET', 'HEAD'].includes(methodOf(input, init))
  // Database reads (REST) and session checks; never storage uploads or downloads.
  const limited = (url.includes('/rest/v1/') && read) || url.includes('/auth/v1/user') || url.includes('/auth/v1/token')
  return fetchWithLimit(input, init, limited ? DB_READ_TIMEOUT_MS : null)
}
