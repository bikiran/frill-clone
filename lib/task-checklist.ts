// Activity wording for a task checklist change. Each phrase follows the actor's
// name on the card ("Amit ticked off “Order filters”"). Returns null when
// nothing meaningful changed, so a no-op save doesn't add an Activity row.

type Item = { id?: string; text?: string; done?: boolean }

const q = (s?: string) => `“${String(s || '').trim().slice(0, 60)}”`

export function checklistActivity(before: unknown, after: unknown): string | null {
  const a: Item[] = Array.isArray(before) ? before : []
  const b: Item[] = Array.isArray(after) ? after : []
  const key = (it: Item, i: number) => it.id || `#${i}`
  const prev = new Map(a.map((it, i) => [key(it, i), it]))
  const next = new Map(b.map((it, i) => [key(it, i), it]))
  const added = b.filter((it, i) => !prev.has(key(it, i)))
  const removed = a.filter((it, i) => !next.has(key(it, i)))
  const ticked: Item[] = [], unticked: Item[] = [], edited: Item[] = []
  b.forEach((it, i) => {
    const old = prev.get(key(it, i))
    if (!old) return
    if (!!old.done !== !!it.done) (it.done ? ticked : unticked).push(it)
    if ((old.text || '') !== (it.text || '')) edited.push(it)
  })
  const changes = added.length + removed.length + ticked.length + unticked.length + edited.length
  if (!changes) {
    const order = (l: Item[]) => l.map(key).join('|')
    return order(a) !== order(b) ? 'reordered the checklist' : null
  }
  if (changes > 1) {
    if (added.length === changes) return `added ${added.length} checklist items`
    if (ticked.length === changes) return `ticked off ${ticked.length} checklist items`
    return 'updated the checklist'
  }
  if (added.length) return `added ${q(added[0].text)} to the checklist`
  if (removed.length) return `removed ${q(removed[0].text)} from the checklist`
  if (ticked.length) return `ticked off ${q(ticked[0].text)}`
  if (unticked.length) return `unticked ${q(unticked[0].text)}`
  return `edited the checklist item ${q(edited[0].text)}`
}
