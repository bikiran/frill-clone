// Saved Super Admin reports, server only.
//
// A report is answered from (in order) this server's memory, the saved copy
// in admin_report_cache (V418), or by computing it. A copy older than its
// freshness window but younger than `maxStaleMs` is still returned at once,
// marked stale, and recomputed in the background (after the response), so
// opening a page never waits on PostHog or a slow query when anything has
// been computed before. "Refresh" (fresh) always recomputes. Before V418 runs
// this is a memory-only cache, as before.

import { after } from 'next/server'

type Entry = { at: number; data: any }
const memory = new Map<string, Entry>()
const inflight = new Map<string, Promise<any>>()
let tableMissing = false

function remember(key: string, e: Entry) {
  memory.set(key, e)
  if (memory.size > 300) {
    const oldest = [...memory.entries()].sort((a, b) => a[1].at - b[1].at)[0]
    if (oldest) memory.delete(oldest[0])
  }
}

async function readSaved(db: any, key: string): Promise<Entry | null> {
  if (tableMissing || !db) return null
  try {
    const { data, error } = await db.from('admin_report_cache').select('data, computed_at').eq('key', key).maybeSingle()
    if (error) { if (/admin_report_cache|42P01|PGRST205/.test(`${error.code} ${error.message}`)) tableMissing = true; return null }
    return data ? { at: Date.parse(data.computed_at), data: data.data } : null
  } catch { return null }
}

async function save(db: any, key: string, e: Entry) {
  if (tableMissing || !db) return
  try {
    const { error } = await db.from('admin_report_cache').upsert({ key, data: e.data, computed_at: new Date(e.at).toISOString() }, { onConflict: 'key' })
    if (error && /admin_report_cache|42P01|PGRST205/.test(`${error.code} ${error.message}`)) tableMissing = true
  } catch {}
}

/** Compute, remember and save; concurrent callers for one key share the work. */
export function compute<T>(db: any, key: string, fn: () => Promise<T>): Promise<Entry> {
  const running = inflight.get(key)
  if (running) return running
  const p = (async () => {
    const e = { at: Date.now(), data: await fn() }
    remember(key, e)
    await save(db, key, e)
    return e
  })().finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

export type Cached<T> = T & { cachedAt: string; stale?: boolean }

export async function cachedReport<T>(db: any, key: string, opts: { ttlMs: number; maxStaleMs: number; fresh?: boolean }, fn: () => Promise<T>): Promise<Cached<T>> {
  const out = (e: Entry, stale = false) => ({ ...e.data, cachedAt: new Date(e.at).toISOString(), ...(stale ? { stale: true } : {}) })
  if (!opts.fresh) {
    let hit: Entry | null = memory.get(key) || null
    if (!hit || Date.now() - hit.at >= opts.ttlMs) {
      const saved = await readSaved(db, key)
      if (saved && (!hit || saved.at > hit.at)) { hit = saved; remember(key, saved) }
    }
    if (hit) {
      const age = Date.now() - hit.at
      if (age < opts.ttlMs) return out(hit)
      if (age < opts.maxStaleMs) {
        // Serve the saved copy now; bring it up to date after the response.
        const refresh = () => compute(db, key, fn).catch(e => console.warn('[report-cache]', key, e?.message || e))
        try { after(refresh) } catch { void refresh() }
        return out(hit, true)
      }
    }
  }
  return out(await compute(db, key, fn))
}
