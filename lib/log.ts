/**
 * Server-side logging.
 *
 * Every console call inside a Vercel function becomes a billed observability
 * event. With ~140 log statements across the API routes and a cron running on
 * a schedule, informational logging was the single largest line on the bill —
 * larger than the compute it was describing.
 *
 * The rule here: in production, record what you'd actually act on (errors and
 * warnings) and drop the running commentary. Locally, log everything.
 *
 * Set LOG_VERBOSE=1 in the Vercel environment to temporarily turn the detail
 * back on while debugging something, then remove it.
 */

const verbose =
  process.env.NODE_ENV !== 'production' || process.env.LOG_VERBOSE === '1'

export const log = {
  /** Routine progress. Dropped in production. */
  info: (...args: any[]) => { if (verbose) console.log(...args) },
  /** Something unexpected but survivable. Kept — it's usually the first clue. */
  warn: (...args: any[]) => { console.warn(...args) },
  /** Something failed. Always kept. */
  error: (...args: any[]) => { console.error(...args) },
  /** Noisy per-item detail inside a loop. Dropped unless explicitly enabled. */
  debug: (...args: any[]) => { if (verbose) console.log(...args) },
}
