// Notebooks (folders) for notes. Kept in lock-step with the mobile app
// (colvy-mobile lib/notebooks.ts): the shared `notes` table has no notebook
// column that both clients agree on, so a note's notebook is encoded as a
// reserved tag `nb:<name>`. It persists like any tag — and syncs to mobile —
// while the tag UI hides these so they never show as `#nb:…`.
export const NB_PREFIX = 'nb:'

export const isNotebookTag = (t: string) => t.startsWith(NB_PREFIX)

/** The note's notebook name, or null if it's unfiled. Falls back to the legacy
 *  `notes.notebook` column so notebooks assigned before the switch still show;
 *  any change re-files them onto the shared tag. */
export const notebookOf = (note: { tags?: string[]; notebook?: string | null }): string | null => {
  const t = (note.tags || []).find(isNotebookTag)
  if (t) return t.slice(NB_PREFIX.length)
  return note.notebook ? String(note.notebook) : null
}

/** Tags to show the user — the real ones, without the notebook marker. */
export const visibleTags = (tags?: string[]): string[] => (tags || []).filter(t => !isNotebookTag(t))

/** A tag array that files the note under `name` (or unfiles it). A note belongs
 *  to at most one notebook, so any existing marker is replaced. */
export const withNotebook = (tags: string[] | undefined, name: string | null): string[] => {
  const base = visibleTags(tags)
  const clean = (name || '').trim()
  return clean ? [`${NB_PREFIX}${clean}`, ...base] : base
}

/** Every notebook in use across the given notes, sorted. */
export const listNotebooks = (notes: { tags?: string[]; notebook?: string | null }[]): string[] =>
  Array.from(new Set(notes.map(notebookOf).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b))
