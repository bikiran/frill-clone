// Colvy AI working in a note: the change it makes, how that change is taken
// back (Undo), and the mark it leaves ("Assisted by Colvy AI").
//
// Pure, no imports: the assistant's note tools (lib/ai-assistant/tools.ts) use
// it on the server, the Undo button (components/ColvyAssistant) and the Notes
// page use it in the browser.

export type NoteItem = { id: string; text: string; done: boolean; qty?: number; flagged?: boolean; due?: string | null; ai?: boolean; [k: string]: any }
export type NoteLike = { title?: string | null; body?: string | null; checklist?: NoteItem[] | null; reminder_at?: string | null; tags?: string[] | null }

/** What Colvy AI was asked to change. Items are named by id, by their text, or by their number in the list ("3"). */
export type NoteChange = {
  addItems?: string[]
  tickItems?: string[]
  untickItems?: string[]
  removeItems?: string[]
  flagItems?: string[]
  unflagItems?: string[]
  appendText?: string
  title?: string
  reminderAt?: string | null
  clearReminder?: boolean
  addTags?: string[]
}

/** Enough to take back exactly what a change did, and nothing someone has done since. */
export type NoteUndo = {
  addedIds: string[]
  toggled: { id: string; done: boolean }[]
  removed: { item: NoteItem; index: number }[]
  flagged: { id: string; flagged: boolean }[]
  appendedHtml: string | null
  title: { from: string; to: string } | null
  reminder: { from: string | null; to: string | null } | null
  addedTags: string[]
}

export const AI_EDITOR = 'Colvy AI'

const str = (v: unknown) => String(v ?? '').trim()
const norm = (v: unknown) => str(v).toLowerCase().replace(/\s+/g, ' ')
export const newItemId = () => `ai${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** Plain text as the note editor's paragraphs. */
export function textToHtml(text: string): string {
  return str(text).split(/\n+/).map(l => l.trim()).filter(Boolean).map(l => `<p>${escapeHtml(l)}</p>`).join('')
}
/** A note's body as plain text (for reading it, and for search). */
export const htmlToText = (html: unknown) => String(html ?? '').replace(/<(br|\/p|\/li|\/h\d)\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim()

/** The checklist item a reference names: its id, its number ("3", "#3"), its exact text, else the one item containing it. */
export function findItem(list: NoteItem[], ref: string): NoteItem | null {
  const r = str(ref)
  if (!r) return null
  const byId = list.find(i => i.id === r)
  if (byId) return byId
  const n = r.match(/^#?(\d{1,3})$/)
  if (n) { const i = Number(n[1]) - 1; if (i >= 0 && i < list.length) return list[i] }
  const exact = list.filter(i => norm(i.text) === norm(r))
  if (exact.length === 1) return exact[0]
  const part = list.filter(i => norm(i.text).includes(norm(r)))
  return part.length === 1 ? part[0] : exact[0] || null
}

/** A change applied to a note: the fields to save, how to undo it, what happened, and any item it couldn't find. */
export function applyNoteChange(note: NoteLike, change: NoteChange): { patch: Partial<NoteLike>; undo: NoteUndo; done: string[]; missing: string[] } {
  const undo: NoteUndo = { addedIds: [], toggled: [], removed: [], flagged: [], appendedHtml: null, title: null, reminder: null, addedTags: [] }
  const done: string[] = []
  const missing: string[] = []
  const patch: Partial<NoteLike> = {}
  let list: NoteItem[] = Array.isArray(note.checklist) ? note.checklist.map(i => ({ ...i })) : []
  let listChanged = false

  const each = (refs: string[] | undefined, fn: (item: NoteItem) => boolean | void, label: string) => {
    const hit: string[] = []
    for (const ref of refs || []) {
      const item = findItem(list, ref)
      if (!item) { missing.push(str(ref)); continue }
      if (fn(item) !== false) hit.push(item.text)
    }
    if (hit.length) { done.push(`${label}: ${hit.join('; ')}`); listChanged = true }
  }

  each(change.tickItems, i => { if (i.done) return false; undo.toggled.push({ id: i.id, done: i.done }); i.done = true }, 'Ticked')
  each(change.untickItems, i => { if (!i.done) return false; undo.toggled.push({ id: i.id, done: i.done }); i.done = false }, 'Unticked')
  each(change.flagItems, i => { if (i.flagged) return false; undo.flagged.push({ id: i.id, flagged: !!i.flagged }); i.flagged = true }, 'Flagged')
  each(change.unflagItems, i => { if (!i.flagged) return false; undo.flagged.push({ id: i.id, flagged: !!i.flagged }); i.flagged = false }, 'Unflagged')
  // Removing last, so a tick and a removal in one request both find their item.
  const toRemove: NoteItem[] = []
  each(change.removeItems, i => { if (toRemove.includes(i)) return false; toRemove.push(i) }, 'Removed')
  for (const i of toRemove) { const index = list.indexOf(i); undo.removed.push({ item: i, index }); list = list.filter(x => x !== i) }

  const adds = (change.addItems || []).map(str).filter(Boolean)
  // Not twice: an item already on the list (same words) isn't added again.
  const fresh = adds.filter((t, k) => !list.some(i => norm(i.text) === norm(t)) && adds.findIndex(x => norm(x) === norm(t)) === k)
  if (fresh.length) {
    const added = fresh.map(text => ({ id: newItemId(), text, done: false, ai: true }))
    list = [...list, ...added]
    undo.addedIds = added.map(i => i.id)
    done.push(`Added: ${fresh.join('; ')}`)
    listChanged = true
  }
  if (adds.length > fresh.length) done.push(`Already on the list: ${adds.filter(t => !fresh.includes(t)).join('; ')}`)
  if (listChanged) patch.checklist = list

  if (str(change.appendText)) {
    const html = textToHtml(change.appendText!)
    patch.body = `${note.body || ''}${html}`
    undo.appendedHtml = html
    done.push('Added text')
  }
  if (str(change.title) && str(change.title) !== str(note.title)) {
    undo.title = { from: str(note.title), to: str(change.title) }
    patch.title = str(change.title)
    done.push(`Renamed to "${str(change.title)}"`)
  }
  if (change.clearReminder || change.reminderAt) {
    const to = change.clearReminder ? null : (change.reminderAt || null)
    if ((note.reminder_at || null) !== to) {
      undo.reminder = { from: note.reminder_at || null, to }
      patch.reminder_at = to
      done.push(to ? 'Reminder set' : 'Reminder removed')
    }
  }
  const have = new Set((note.tags || []).map(t => norm(t)))
  const tags = (change.addTags || []).map(t => str(t).replace(/^#/, '')).filter(t => t && !have.has(norm(t)))
  if (tags.length) {
    patch.tags = [...(note.tags || []), ...tags]
    undo.addedTags = tags
    done.push(`Tagged ${tags.map(t => '#' + t).join(' ')}`)
  }
  return { patch, undo, done, missing }
}

/**
 * The fields that take a change back on the note as it is now: the items it
 * added go, items it ticked/flagged go back unless someone changed them since,
 * items it removed come back where they were, its text and tags go, and the
 * title or reminder go back only if nobody has changed them since.
 */
export function revertNoteChange(note: NoteLike, undo: NoteUndo): Partial<NoteLike> {
  const patch: Partial<NoteLike> = {}
  let list: NoteItem[] = Array.isArray(note.checklist) ? note.checklist.map(i => ({ ...i })) : []
  const before = JSON.stringify(list)
  if (undo.addedIds?.length) list = list.filter(i => !undo.addedIds.includes(i.id))
  for (const t of undo.toggled || []) { const i = list.find(x => x.id === t.id); if (i && i.done === !t.done) i.done = t.done }
  for (const f of undo.flagged || []) { const i = list.find(x => x.id === f.id); if (i && !!i.flagged === !f.flagged) i.flagged = f.flagged }
  for (const r of [...(undo.removed || [])].sort((a, b) => a.index - b.index)) {
    if (!list.some(x => x.id === r.item.id)) list.splice(Math.min(Math.max(r.index, 0), list.length), 0, r.item)
  }
  if (JSON.stringify(list) !== before) patch.checklist = list
  if (undo.appendedHtml && String(note.body || '').includes(undo.appendedHtml)) patch.body = String(note.body).replace(undo.appendedHtml, '')
  if (undo.title && str(note.title) === undo.title.to) patch.title = undo.title.from
  if (undo.reminder && (note.reminder_at || null) === undo.reminder.to) patch.reminder_at = undo.reminder.from
  if (undo.addedTags?.length) patch.tags = (note.tags || []).filter(t => !undo.addedTags.includes(t))
  return patch
}

/** The note's edit log entry for something Colvy AI did, asked by `by`. */
export const aiLogEntry = (by: string, what: string, at = new Date().toISOString()) =>
  ({ name: AI_EDITOR, ai: true, by: str(by) || null, what: str(what).slice(0, 200), at })

/** The latest thing Colvy AI did on a note, if it has: for "Assisted by Colvy AI". */
export function aiAssist(log: unknown): { at: string; by: string | null; what: string; count: number } | null {
  const entries = (Array.isArray(log) ? log : []).filter((e: any) => e && e.ai)
  if (!entries.length) return null
  const last: any = entries.reduce((a: any, b: any) => (String(b.at || '') > String(a.at || '') ? b : a))
  return { at: String(last.at || ''), by: last.by || null, what: String(last.what || ''), count: entries.length }
}

/** Edits by people (viewers, teammates), without Colvy AI's own entries. */
export const peopleEdits = <T>(log: T[] | null | undefined): T[] => (Array.isArray(log) ? log : []).filter((e: any) => !e?.ai)
