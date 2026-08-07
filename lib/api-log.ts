import { createClient } from '@supabase/supabase-js'

// Persists server-side log lines (warnings/errors) into `api_logs` so the Super
// Admin console can show what's failing in production. Wired into lib/log.ts so
// a single instrumentation point covers every route and library that already
// logs through it.
//
// Rules, same as the other loggers:
//   • Never throw, and NEVER call back into log.* (that would recurse forever).
//   • Fire-and-forget — the caller does not await; a logging hiccup must not
//     slow or fail the request.
//   • Self-disable if the table is absent (migration not applied).
//   • Server-only — guarded by the dynamic import in lib/log.ts, and again here.

let missing = false
// True while we're inside our own DB write. If the Supabase client (or anything
// it calls) logs during the insert, the console capture must skip it — otherwise
// a logging failure would record itself, recursively. Spans the await so the
// whole insert window is covered.
let sinkActive = false

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Turn an arbitrary log argument into a string. Errors keep their stack.
function serialize(a: any): string {
  if (a instanceof Error) return a.stack || `${a.name}: ${a.message}`
  if (typeof a === 'object' && a !== null) {
    try { return JSON.stringify(a) } catch { return String(a) }
  }
  return String(a)
}

// A leading "[tag]" (e.g. "[telnyx inbound] …") becomes the source. Falls back
// to 'app'. Kept short and slug-like so it groups well in the UI.
function tagOf(first: any): string {
  if (typeof first === 'string') {
    const m = first.match(/^\s*\[([^\]]+)\]/)
    if (m) return m[1].trim().toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9_-]/g, '').slice(0, 24) || 'app'
  }
  return 'app'
}

export type ApiLogEvent = {
  level?: 'error' | 'warn' | 'info'
  source?: string
  message?: string
  meta?: any
  route?: string | null
  companyId?: string | null
}

// Explicit structured logging (available for routes that want to record more
// than a bare message — status, route, company).
export async function logApiEvent(ev: ApiLogEvent): Promise<void> {
  if (missing || sinkActive || typeof window !== 'undefined') return
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return
  sinkActive = true
  try {
    const db = admin()
    const { error } = await db.from('api_logs').insert({
      level: ev.level || 'error',
      source: ev.source || 'app',
      message: ev.message ? String(ev.message).slice(0, 2000) : null,
      meta: ev.meta ?? null,
      route: ev.route || null,
      company_id: ev.companyId || null,
    })
    if (error && /does not exist|schema cache/i.test(error.message)) missing = true
  } catch {
    /* logging must never break the caller */
  } finally {
    sinkActive = false
  }
}

// Record a captured console line.
function recordLog(level: 'error' | 'warn', args: any[]): void {
  if (missing || sinkActive || typeof window !== 'undefined') return
  try {
    const parts = (args || []).map(serialize)
    const message = parts.join(' ').slice(0, 2000)
    if (!message.trim()) return
    void logApiEvent({ level, source: tagOf(args?.[0]), message })
  } catch {
    /* never throw from the logging path */
  }
}

// Install a one-time global capture of console.error / console.warn on the
// server. The app logs failures with raw console.error in ~200 places rather
// than through a single helper, so patching the console is the only way to get
// complete coverage without touching every call site.
//
// Safety:
//   • Reentrancy guard — the Supabase client itself may console.error on a
//     failure; without the guard that would recurse. `capturing` short-circuits
//     any nested call so the original console still prints but we don't re-record.
//   • The original console methods are always called first, so nothing is lost
//     from Vercel's own logs.
//   • Fire-and-forget insert; never throws.
let installed = false
let capturing = false
export function installConsoleCapture(): void {
  if (installed || typeof window !== 'undefined') return
  installed = true
  const wrap = (orig: (...a: any[]) => void, level: 'error' | 'warn') =>
    (...args: any[]) => {
      orig(...args)
      if (capturing) return
      capturing = true
      try { recordLog(level, args) } catch { /* ignore */ } finally { capturing = false }
    }
  try {
    // eslint-disable-next-line no-console
    console.error = wrap(console.error.bind(console), 'error')
    // eslint-disable-next-line no-console
    console.warn = wrap(console.warn.bind(console), 'warn')
  } catch { /* leave console untouched if patching fails */ }
}
