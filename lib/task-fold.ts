// Repeating tasks without the pile-up.
//
// A repeating task is saved as a batch of dated copies (one row per
// occurrence, sharing a series_id). Shown one by one, every copy nobody ticked
// stays "overdue" forever and every future copy sits in "Upcoming", so a single
// daily task becomes 50 overdue cards and 60 upcoming ones.
//
// This works out, per series, which copies are worth showing:
//  - Missed copies: an open copy in the past is "missed" once a later copy is
//    due (today's copy, or a newer missed one) or a later copy was done. Only
//    the most recent missed copy stays visible as overdue, and only while it
//    is the latest one due; the rest are folded into a "Missed N" count on the
//    card that is shown.
//  - Future copies: only the next one is shown in Upcoming/All, with a count of
//    the copies after it. (Day / Week / Month / Date views still list each one.)
//
// Display only: nothing is changed in the data.

export type FoldTask = { id: string; series_id?: string | null; due_date?: string | null; [k: string]: any }

export type Fold = {
  /** Older missed copies — hidden everywhere unless "show every repeat" is on. */
  missedHidden: Set<string>
  /** Future copies after the next one — hidden in Upcoming and All. */
  laterHidden: Set<string>
  /** Shown card id → ids of the missed copies folded into it. */
  missedOf: Map<string, string[]>
  /** Next future copy id → how many more copies are scheduled after it. */
  laterOf: Map<string, number>
}

export function foldRepeats(
  tasks: FoldTask[],
  opts: { today: number; dayOf: (t: FoldTask) => number | null; isClosed: (t: FoldTask) => boolean },
): Fold {
  const fold: Fold = { missedHidden: new Set(), laterHidden: new Set(), missedOf: new Map(), laterOf: new Map() }
  const series = new Map<string, { t: FoldTask; d: number }[]>()
  for (const t of tasks) {
    if (!t.series_id || String(t.id).startsWith('cal:')) continue
    const d = opts.dayOf(t)
    if (d == null) continue
    const list = series.get(t.series_id)
    if (list) list.push({ t, d }); else series.set(t.series_id, [{ t, d }])
  }
  const { today, isClosed } = opts
  for (const rows of series.values()) {
    if (rows.length < 2) continue
    rows.sort((a, b) => a.d - b.d)
    const past = rows.filter(r => r.d < today)
    const openPast = past.filter(r => !isClosed(r.t))
    const dueToday = rows.some(r => r.d === today)
    const latestPast = past[past.length - 1]
    const nextOpen = rows.find(r => r.d >= today && !isClosed(r.t))

    // The one past copy that still reads as "overdue": the latest one due,
    // while nothing newer has come due (no copy today) and it isn't done.
    let overdueRep = !dueToday && latestPast && !isClosed(latestPast.t) ? latestPast : null
    let missed = openPast.filter(r => r !== overdueRep)
    // Nowhere to fold them into (the series has ended and its last copy was
    // done): keep the newest missed one visible so the work isn't lost.
    if (!overdueRep && !nextOpen && missed.length) {
      overdueRep = missed[missed.length - 1]
      missed = missed.slice(0, -1)
    }
    const holder = overdueRep || nextOpen
    if (holder && missed.length) {
      fold.missedOf.set(holder.t.id, missed.map(r => r.t.id))
      for (const r of missed) fold.missedHidden.add(r.t.id)
    }

    const future = rows.filter(r => r.d > today && !isClosed(r.t))
    if (future.length > 1) {
      fold.laterOf.set(future[0].t.id, future.length - 1)
      for (const r of future.slice(1)) fold.laterHidden.add(r.t.id)
    }
  }
  return fold
}
