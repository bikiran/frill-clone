// Customer-facing wording a workspace can rename (Settings → Terminology).
//
// Saved per workspace in site_settings ('general') as `termValues`
// ({ [key]: label }); only the terms someone changed are stored, so a blank
// value always means "use the default". Status names live on the Statuses page
// (they're per status, with colours), not here.

export interface TermDef {
  key: string
  default: string
  /** Where people will see it, shown next to the field. */
  where: string
}

export interface TermGroup {
  id: string
  label: string
  description: string
  terms: TermDef[]
}

export const TERM_GROUPS: TermGroup[] = [
  {
    id: 'nav', label: 'Menu',
    description: 'The links across the top of your board, help centre and widget.',
    terms: [
      { key: 'nav_ideas', default: 'Ideas', where: 'Top menu' },
      { key: 'nav_roadmap', default: 'Roadmap', where: 'Top menu and widget tab' },
      { key: 'nav_updates', default: 'Updates', where: 'Top menu and widget tab' },
      { key: 'nav_help', default: 'Help', where: 'Top menu and widget tab' },
    ],
  },
  {
    id: 'ideas', label: 'Ideas board',
    description: 'What your customers call the things they suggest and vote on.',
    terms: [
      { key: 'ideas_title', default: 'Ideas', where: 'Heading on the ideas board' },
      { key: 'idea_singular', default: 'idea', where: 'Counts — “1 idea”' },
      { key: 'idea_plural', default: 'ideas', where: 'Counts, search and sorting — “12 ideas total”, “Latest ideas”' },
      { key: 'submit_idea', default: 'Submit Idea', where: 'Main button on the board' },
      { key: 'statuses_heading', default: 'Statuses', where: 'Board sidebar heading' },
      { key: 'topics_heading', default: 'Topics', where: 'Board sidebar heading' },
    ],
  },
  {
    id: 'roadmap', label: 'Roadmap',
    description: 'The public roadmap page.',
    terms: [
      { key: 'roadmap_title', default: 'Roadmap', where: 'Roadmap page heading' },
      { key: 'roadmap_subtitle', default: 'See what we’re planning, building and shipping', where: 'Under the roadmap heading' },
    ],
  },
  {
    id: 'help', label: 'Help centre',
    description: 'Your help centre, on your board and on a custom help domain.',
    terms: [
      { key: 'help_search', default: 'Search articles…', where: 'Help centre search box' },
      { key: 'help_featured', default: 'Featured Articles', where: 'Help centre section heading' },
      { key: 'help_browse', default: 'Browse by Topic', where: 'Help centre section heading' },
    ],
  },
  {
    id: 'widget', label: 'Widget',
    description: 'Tabs in the chat and feedback widget on your website.',
    terms: [
      { key: 'widget_feedback', default: 'Feedback', where: 'Widget tab' },
      { key: 'widget_chat', default: 'Chat', where: 'Widget tab' },
    ],
  },
]

export const TERM_DEFAULTS: Record<string, string> = Object.fromEntries(
  TERM_GROUPS.flatMap(g => g.terms.map(t => [t.key, t.default])),
)

/** The workspace's wording for `key`, or the default when it hasn't changed it. */
export function termFor(custom: Record<string, any> | null | undefined, key: string): string {
  const v = custom?.[key]
  return typeof v === 'string' && v.trim() ? v.trim() : (TERM_DEFAULTS[key] ?? key)
}

/** Keep only real, changed values — what gets saved. */
export function cleanTerms(values: Record<string, any> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(values || {})) {
    if (!(k in TERM_DEFAULTS) || typeof v !== 'string') continue
    const t = v.trim().slice(0, 80)
    if (t && t !== TERM_DEFAULTS[k]) out[k] = t
  }
  return out
}

/** "1 idea" / "12 ideas" with the workspace's words. */
export function countLabel(custom: Record<string, any> | null | undefined, n: number): string {
  return `${n} ${n === 1 ? termFor(custom, 'idea_singular') : termFor(custom, 'idea_plural')}`
}
