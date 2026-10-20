// Local task edits that are still saving, or only just saved.
//
// The Tasks page refetches the whole board whenever a task changes (realtime)
// or the tab regains focus. A refetch can race a save: its query may come back
// with the row as it was a moment ago, and painting that over the optimistic
// state made fresh edits flicker back — checklist items vanished and
// reappeared, typed letters reverted. The board re-applies these pending
// fields over whatever a refetch returns, until the save has landed.

export type PendingEntry = { fields: Record<string, any>; inflight: number; settledAt: number }
export type PendingWrites = Map<string, PendingEntry>

// A refetch that started up to this long before a save finished may still have
// read the old row, so the local fields keep winning for that refetch.
export const SETTLE_MS = 1500
// Settled entries older than this can't affect any refetch and are dropped.
const KEEP_MS = 15000

export function beginWrite(p: PendingWrites, id: string, fields: Record<string, any>) {
  const e = p.get(id)
  if (e) { e.fields = { ...e.fields, ...fields }; e.inflight++ }
  else p.set(id, { fields: { ...fields }, inflight: 1, settledAt: 0 })
}

// A failed save drops the entry, so the refetch that follows shows the real
// (unsaved) state instead of hiding the failure.
export function endWrite(p: PendingWrites, id: string, ok: boolean, now = Date.now()) {
  const e = p.get(id)
  if (!e) return
  if (!ok) { p.delete(id); return }
  e.inflight = Math.max(0, e.inflight - 1)
  e.settledAt = now
}

export function overlayPending<T extends { id: string }>(rows: T[], p: PendingWrites, fetchStartedAt: number, now = Date.now()): T[] {
  if (!p.size) return rows
  p.forEach((e, id) => { if (!e.inflight && e.settledAt < now - KEEP_MS) p.delete(id) })
  if (!p.size) return rows
  return rows.map(r => {
    const e = p.get(r.id)
    return e && (e.inflight > 0 || e.settledAt > fetchStartedAt - SETTLE_MS) ? { ...r, ...e.fields } : r
  })
}

// Saves to one task run one after another. Each checklist save sends the whole
// list, so two requests landing out of order could put an older list back.
export type WriteChains = Map<string, Promise<unknown>>
export function inOrder<T>(chains: WriteChains, id: string, run: () => Promise<T>): Promise<T> {
  const next = (chains.get(id) || Promise.resolve()).then(run, run)
  const tail = next.catch(() => {})
  chains.set(id, tail)
  tail.then(() => { if (chains.get(id) === tail) chains.delete(id) })
  return next
}
