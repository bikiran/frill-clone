// Polls and surveys: the pure parts shared by the admin pages, the public
// pages, the server routes and the tests. No React, no Supabase, no DOM.
//
// Rows come in several historical shapes, all still supported:
//   polls.options     strings (IdeaModal, Colvy AI) or { text, image, description }
//                     (the Polls page), sometimes stored as a JSON string
//   polls.poll_type   'single_choice' (default) | 'multiple_choice' | 'rating' | 'ranking'
//   poll_votes        option = the option's text (current), or option_index (oldest)
//   surveys           one question with type nps / csat / open_feedback / quick_poll /
//                     idea_poll, or a questions[] list (IdeaModal's survey builder)
//   survey_responses  answer + comment (current), or score + response_text (oldest)
// New settings live in one JSONB column (settings, V386); without it every
// setting reads as its default, which is exactly how polls behaved before.

export type EngageKind = 'poll' | 'survey'
export type EngageStatus = 'live' | 'closed' | 'draft'
export type PollType = 'single_choice' | 'multiple_choice' | 'rating' | 'ranking'
export type ShowResults = 'after_vote' | 'always' | 'closed' | 'never'
export type AskField = 'off' | 'optional' | 'required'
export type NotifyMode = 'off' | 'each' | 'low'
export type SurveyMode = 'nps' | 'csat' | 'text' | 'questions'

export type EngageSettings = {
  closes_at: string | null
  allow_change: boolean
  /** Surveys: the same person may answer again a day after their last answer (feedback after each visit). */
  allow_repeat: boolean
  show_results: ShowResults
  ask_name: AskField
  ask_contact: AskField
  thank_you: string
  notify: NotifyMode
  /** CSAT: 5 (1 to 5, new surveys) or 10 (0 to 10, how older CSAT surveys were asked). Rating polls: 5 or 10. */
  scale: 5 | 10
  /** Survey: the prompt above the comment box. */
  follow_up: string
  low_label: string
  high_label: string
}

export const DEFAULT_SETTINGS: EngageSettings = {
  closes_at: null,
  allow_change: false,
  allow_repeat: false,
  show_results: 'after_vote',
  ask_name: 'off',
  ask_contact: 'off',
  thank_you: '',
  notify: 'off',
  scale: 10,
  follow_up: '',
  low_label: '',
  high_label: '',
}

export const POLL_TYPES: { key: PollType; label: string; about: string }[] = [
  { key: 'single_choice', label: 'Single choice', about: 'Pick one answer' },
  { key: 'multiple_choice', label: 'Multiple choice', about: 'Pick any number of answers' },
  { key: 'rating', label: 'Rating', about: 'Rate from 1 to 5' },
  { key: 'ranking', label: 'Ranking', about: 'Put the answers in order' },
]

export const SHOW_RESULTS: { key: ShowResults; label: string }[] = [
  { key: 'after_vote', label: 'After they vote' },
  { key: 'always', label: 'Always, even before voting' },
  { key: 'closed', label: 'Only once the poll closes' },
  { key: 'never', label: 'Never (only your team sees them)' },
]

export type PollOption = { text: string; image?: string; description?: string }

const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max)
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed as readonly string[]).includes(v as string) ? (v as T) : fallback

function parseJson(v: unknown): unknown {
  if (typeof v !== 'string') return v
  try { return JSON.parse(v) } catch { return null }
}

/** A row's settings with defaults filled in. Unknown or bad values fall back to the default. */
export function settingsOf(row: { settings?: unknown } | null | undefined): EngageSettings {
  const raw = parseJson(row?.settings)
  const s = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  const closes = typeof s.closes_at === 'string' && Number.isFinite(Date.parse(s.closes_at)) ? s.closes_at : null
  return {
    closes_at: closes,
    allow_change: s.allow_change === true,
    allow_repeat: s.allow_repeat === true,
    show_results: oneOf(s.show_results, ['after_vote', 'always', 'closed', 'never'] as const, DEFAULT_SETTINGS.show_results),
    ask_name: oneOf(s.ask_name, ['off', 'optional', 'required'] as const, 'off'),
    ask_contact: oneOf(s.ask_contact, ['off', 'optional', 'required'] as const, 'off'),
    thank_you: str(s.thank_you, 500).trim(),
    notify: oneOf(s.notify, ['off', 'each', 'low'] as const, 'off'),
    scale: Number(s.scale) === 5 ? 5 : 10,
    follow_up: str(s.follow_up, 300).trim(),
    low_label: str(s.low_label, 60).trim(),
    high_label: str(s.high_label, 60).trim(),
  }
}

/**
 * Only the settings that differ from the defaults, for saving. The scale is
 * kept when `keepScale` says so even at its default: a rating poll reads a
 * missing scale as 5, a CSAT survey as 10, so the editor saves it explicitly.
 */
export function compactSettings(s: Partial<EngageSettings>, keepScale = false): Partial<EngageSettings> {
  const full = settingsOf({ settings: s })
  const out: Partial<EngageSettings> = {}
  for (const k of Object.keys(full) as (keyof EngageSettings)[]) {
    if (full[k] !== DEFAULT_SETTINGS[k] || (k === 'scale' && keepScale && s.scale != null)) (out as any)[k] = full[k]
  }
  return out
}

/** The stored settings as they are (no defaults filled in), without the close date. */
export function settingsWithoutClose(row: { settings?: unknown }): Record<string, unknown> {
  const raw = parseJson(row?.settings)
  const out = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {}
  delete out.closes_at
  return out
}

/** Live (taking answers), closed or a draft (never shown to the public). */
export function statusOf(row: { is_active?: unknown; status?: unknown; settings?: unknown } | null | undefined, now = Date.now()): EngageStatus {
  if (!row) return 'closed'
  if (row.status === 'draft') return 'draft'
  if (row.is_active === false || row.status === 'closed') return 'closed'
  const closes = settingsOf(row).closes_at
  if (closes && Date.parse(closes) <= now) return 'closed'
  return 'live'
}

/** The columns that put a row in a status (is_active and status move together). */
export function statusFields(status: EngageStatus): { is_active: boolean; status: string } {
  if (status === 'draft') return { is_active: false, status: 'draft' }
  if (status === 'closed') return { is_active: false, status: 'closed' }
  return { is_active: true, status: 'active' }
}

/**
 * The columns that publish or reopen a row. A close date that has already
 * passed is cleared too, or the row would close again straight away.
 */
export function reopenFields(row: { settings?: unknown } & Record<string, unknown>, now = Date.now()): Record<string, unknown> {
  const out: Record<string, unknown> = { ...statusFields('live') }
  const closes = settingsOf(row).closes_at
  if ('settings' in row && closes && Date.parse(closes) <= now) out.settings = settingsWithoutClose(row)
  return out
}

// ── Polls ───────────────────────────────────────────────────────────────────

export function parsePollOptions(v: unknown): PollOption[] {
  const raw = parseJson(v)
  if (!Array.isArray(raw)) return []
  const out: PollOption[] = []
  const seen = new Set<string>()
  for (const o of raw) {
    const text = (typeof o === 'string' ? o : str((o as any)?.text, 300)).trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    const opt: PollOption = { text }
    if (o && typeof o === 'object') {
      const image = str((o as any).image, 1000).trim()
      const description = str((o as any).description, 300).trim()
      if (image) opt.image = image
      if (description) opt.description = description
    }
    out.push(opt)
  }
  return out
}

export function pollTypeOf(p: { poll_type?: unknown } | null | undefined): PollType {
  return oneOf(p?.poll_type, ['single_choice', 'multiple_choice', 'rating', 'ranking'] as const, 'single_choice')
}

/** What a voter picks from: the option texts, or the scores of a rating poll. */
export function pollChoices(p: { poll_type?: unknown; options?: unknown; settings?: unknown }): string[] {
  if (pollTypeOf(p) === 'rating') return Array.from({ length: ratingTop(p) }, (_, i) => String(i + 1))
  return parsePollOptions(p.options).map(o => o.text)
}

/** Rating polls are 1 to 5 unless the settings say 10. */
export function ratingTop(p: { settings?: unknown }): number {
  const raw = parseJson(p.settings) as any
  return raw && Number(raw.scale) === 10 ? 10 : 5
}

export type VoteRow = {
  id?: string
  option?: unknown
  option_index?: unknown
  voter_key?: unknown
  rank?: unknown
  created_at?: unknown
  respondent?: unknown
  contact_id?: unknown
}

/** The option a vote row is for (text, or the oldest rows' index), or null. */
export function voteOption(v: VoteRow, choices: string[]): string | null {
  if (typeof v.option === 'string' && v.option.trim()) return v.option.trim()
  const i = Number(v.option_index)
  if (v.option_index != null && Number.isInteger(i) && i >= 0 && i < choices.length) return choices[i]
  return null
}

/** Votes grouped by voter: rows sharing a voter_key are one person; older rows without one each count once. */
export function groupVoters(votes: VoteRow[]): VoteRow[][] {
  const by = new Map<string, VoteRow[]>()
  const out: VoteRow[][] = []
  for (const v of votes) {
    const k = typeof v.voter_key === 'string' && v.voter_key ? v.voter_key : ''
    if (!k) { out.push([v]); continue }
    const g = by.get(k)
    if (g) g.push(v)
    else { const n = [v]; by.set(k, n); out.push(n) }
  }
  return out
}

export type TallyRow = { label: string; count: number; pct: number; image?: string; description?: string; points?: number; avgRank?: number }
export type PollTally = {
  type: PollType
  rows: TallyRow[]
  /** People who voted. */
  voters: number
  /** Vote rows counted (more than voters for multiple choice). */
  votes: number
  /** Rating polls: the average score. */
  average: number | null
  /** Labels of the answer(s) in front (ties share it); empty with no votes. */
  leaders: string[]
}

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * Counts for a poll. Percentages are of voters (so multiple choice can add up
 * to more than 100%), whole numbers that add to 100 for single choice.
 * Votes for answers no longer on the poll are left out.
 */
export function tallyPoll(poll: { poll_type?: unknown; options?: unknown; settings?: unknown }, votes: VoteRow[]): PollTally {
  const type = pollTypeOf(poll)
  const opts = parsePollOptions(poll.options)
  const choices = pollChoices(poll)
  const known = new Set(choices)
  const counts = new Map<string, number>(choices.map(c => [c, 0]))
  const points = new Map<string, number>(choices.map(c => [c, 0]))
  const rankSum = new Map<string, number>(choices.map(c => [c, 0]))
  const rankN = new Map<string, number>(choices.map(c => [c, 0]))
  let voters = 0
  let voteRows = 0
  let scoreSum = 0
  let scoreN = 0

  for (const group of groupVoters(votes)) {
    const picked = group.map(v => ({ v, o: voteOption(v, choices) })).filter(x => x.o && known.has(x.o)) as { v: VoteRow; o: string }[]
    if (!picked.length) continue
    voters++
    if (type === 'ranking') {
      // Borda points: first of n gets n, last gets 1. Rows without a rank
      // (saved before ranks were stored) count as a first choice.
      const n = choices.length
      const seen = new Set<string>()
      for (const { v, o } of picked) {
        if (seen.has(o)) continue
        seen.add(o)
        const r = Number(v.rank)
        const rank = Number.isInteger(r) && r >= 1 && r <= n ? r : 1
        points.set(o, (points.get(o) || 0) + (n - rank + 1))
        rankSum.set(o, (rankSum.get(o) || 0) + rank)
        rankN.set(o, (rankN.get(o) || 0) + 1)
        if (rank === 1) counts.set(o, (counts.get(o) || 0) + 1)
        voteRows++
      }
      continue
    }
    const uniq = type === 'multiple_choice' ? Array.from(new Set(picked.map(x => x.o))) : [picked[picked.length - 1].o]
    for (const o of uniq) {
      counts.set(o, (counts.get(o) || 0) + 1)
      voteRows++
      if (type === 'rating') { scoreSum += Number(o); scoreN++ }
    }
  }

  const pctOf = (n: number) => (voters ? (n / voters) * 100 : 0)
  let rows: TallyRow[] = choices.map(label => {
    const o = opts.find(x => x.text === label)
    const row: TallyRow = { label, count: counts.get(label) || 0, pct: 0 }
    if (o?.image) row.image = o.image
    if (o?.description) row.description = o.description
    if (type === 'ranking') {
      row.points = points.get(label) || 0
      const rn = rankN.get(label) || 0
      if (rn) row.avgRank = round1((rankSum.get(label) || 0) / rn)
    }
    return row
  })

  if (type === 'ranking') {
    const max = voters * choices.length
    rows.forEach(r => { r.pct = max ? Math.round(((r.points || 0) / max) * 100) : 0 })
    rows = rows.slice().sort((a, b) => (b.points || 0) - (a.points || 0))
  } else if (type === 'single_choice' || type === 'rating') {
    const pcts = largestRemainder(rows.map(r => pctOf(r.count)))
    rows.forEach((r, i) => { r.pct = pcts[i] })
  } else {
    rows.forEach(r => { r.pct = Math.round(pctOf(r.count)) })
  }

  const metric = (r: TallyRow) => (type === 'ranking' ? r.points || 0 : r.count)
  const top = Math.max(0, ...rows.map(metric))
  return {
    type,
    rows,
    voters,
    votes: voteRows,
    average: type === 'rating' && scoreN ? round1(scoreSum / scoreN) : null,
    leaders: top > 0 && type !== 'rating' ? rows.filter(r => metric(r) === top).map(r => r.label) : [],
  }
}

/** Whole-number percentages that add up to exactly 100 (when the inputs do). */
export function largestRemainder(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0)
  if (total <= 0) return values.map(() => 0)
  const target = Math.round(total)
  const floors = values.map(v => Math.floor(v))
  let left = target - floors.reduce((a, b) => a + b, 0)
  const order = values.map((v, i) => ({ i, r: v - Math.floor(v) })).sort((a, b) => b.r - a.r)
  for (const { i } of order) { if (left <= 0) break; floors[i]++; left-- }
  return floors
}

/** May this visitor see the counts right now? */
export function canSeeResults(show: ShowResults, status: EngageStatus, hasVoted: boolean): boolean {
  if (show === 'always') return true
  if (show === 'never') return false
  if (show === 'closed') return status === 'closed'
  return hasVoted || status === 'closed'
}

/**
 * A ballot from the public page, checked against the poll. Returns the vote
 * rows to save (option text, and rank for ranking) or an error to show.
 */
export function checkBallot(poll: { poll_type?: unknown; options?: unknown; settings?: unknown }, picks: unknown): { rows: { option: string; rank: number | null }[] } | { error: string } {
  const type = pollTypeOf(poll)
  const choices = pollChoices(poll)
  if (!choices.length) return { error: 'This poll has no answers to choose from yet.' }
  const list = (Array.isArray(picks) ? picks : [picks]).map(p => (typeof p === 'number' ? String(p) : typeof p === 'string' ? p.trim() : '')).filter(Boolean)
  const uniq = Array.from(new Set(list))
  if (uniq.some(p => !choices.includes(p))) return { error: 'That answer is no longer on this poll. Reload the page and try again.' }
  if (!uniq.length) return { error: type === 'ranking' ? 'Put the answers in order first.' : 'Choose an answer first.' }
  if (type === 'multiple_choice') return { rows: uniq.map(o => ({ option: o, rank: null })) }
  if (type === 'ranking') {
    // Anything not ranked goes after, in the poll's order.
    const order = [...uniq, ...choices.filter(c => !uniq.includes(c))]
    return { rows: order.map((o, i) => ({ option: o, rank: i + 1 })) }
  }
  if (uniq.length > 1) return { error: 'Choose just one answer.' }
  return { rows: [{ option: uniq[0], rank: null }] }
}

// ── Surveys ─────────────────────────────────────────────────────────────────

export type SurveyQuestion = {
  id: string
  type: 'text' | 'single_choice' | 'multiple_choice' | 'rating'
  title: string
  description?: string
  isRequired: boolean
  options?: string[]
  minRating?: number
  maxRating?: number
}

export function surveyQuestions(s: { questions?: unknown } | null | undefined): SurveyQuestion[] {
  const raw = parseJson(s?.questions)
  if (!Array.isArray(raw)) return []
  return raw.filter(q => q && typeof q === 'object' && str((q as any).title).trim()).map((q: any, i) => ({
    id: str(q.id, 80) || `q${i}`,
    type: oneOf(q.type, ['text', 'single_choice', 'multiple_choice', 'rating'] as const, 'text'),
    title: str(q.title, 300).trim(),
    description: str(q.description, 500).trim() || undefined,
    isRequired: q.isRequired === true || q.required === true,
    options: Array.isArray(q.options) ? q.options.map((o: unknown) => str(o, 200).trim()).filter(Boolean) : undefined,
    minRating: Number.isInteger(q.minRating) ? q.minRating : undefined,
    maxRating: Number.isInteger(q.maxRating) ? q.maxRating : undefined,
  }))
}

export function surveyModeOf(s: { type?: unknown; questions?: unknown } | null | undefined): SurveyMode {
  if (surveyQuestions(s).length) return 'questions'
  if (s?.type === 'nps') return 'nps'
  if (s?.type === 'csat') return 'csat'
  // A questions-less survey with no type was made by an old builder with
  // nothing in it; the database default made the rest NPS.
  if (s?.type == null || s?.type === '') return 'nps'
  return 'text'
}

export const SURVEY_TYPE_LABEL: Record<string, string> = {
  nps: 'NPS', csat: 'Satisfaction', open_feedback: 'Open feedback', quick_poll: 'Quick question', idea_poll: 'Idea feedback', questions: 'Questions',
}

export function surveyTypeLabel(s: { type?: unknown; questions?: unknown }): string {
  const mode = surveyModeOf(s)
  if (mode === 'questions') return `${surveyQuestions(s).length} questions`
  return SURVEY_TYPE_LABEL[String(s.type || 'nps')] || 'Survey'
}

/** The score range a survey asks for: NPS 0 to 10; CSAT 1 to 5 (new) or 0 to 10 (older ones). */
export function scoreRange(s: { type?: unknown; questions?: unknown; settings?: unknown }): { min: number; max: number } | null {
  const mode = surveyModeOf(s)
  if (mode === 'nps') return { min: 0, max: 10 }
  if (mode === 'csat') return settingsOf(s).scale === 5 ? { min: 1, max: 5 } : { min: 0, max: 10 }
  return null
}

export const DEFAULT_QUESTION: Record<string, string> = {
  nps: 'How likely are you to recommend us to a friend?',
  csat: 'How would you rate your experience?',
  open_feedback: 'What could we do better?',
  quick_poll: 'Quick question for you',
  idea_poll: 'Which of our ideas matters most to you?',
}

export function scaleLabels(s: { type?: unknown; questions?: unknown; settings?: unknown }): { low: string; high: string } {
  const st = settingsOf(s)
  const mode = surveyModeOf(s)
  const low = st.low_label || (mode === 'nps' ? 'Not likely' : 'Very unhappy')
  const high = st.high_label || (mode === 'nps' ? 'Very likely' : 'Very happy')
  return { low, high }
}

export type ResponseRow = {
  id?: string
  answer?: unknown
  score?: unknown
  comment?: unknown
  response_text?: unknown
  answers?: unknown
  respondent?: unknown
  contact_id?: unknown
  created_at?: unknown
}

export function responseScore(r: ResponseRow): number | null {
  const raw = r.answer ?? r.score
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && Number.isInteger(n) ? n : null
}

export function responseComment(r: ResponseRow): string {
  const c = r.comment ?? r.response_text
  // An open-feedback answer is saved in `answer` (there is no score).
  if (c != null && String(c).trim()) return String(c).trim()
  const a = r.answer
  if (typeof a === 'string' && a.trim() && !/^-?\d+$/.test(a.trim())) return a.trim()
  return ''
}

export function respondentOf(r: { respondent?: unknown }): { name: string; contact: string } {
  const raw = parseJson(r.respondent) as any
  return { name: str(raw?.name, 120).trim(), contact: str(raw?.contact, 160).trim() }
}

export function responseAnswers(r: ResponseRow): Record<string, unknown> {
  const raw = parseJson(r.answers)
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
}

export type NpsBand = 'promoter' | 'passive' | 'detractor'
export function npsBand(score: number): NpsBand {
  return score >= 9 ? 'promoter' : score >= 7 ? 'passive' : 'detractor'
}

/** Is this a low score worth a heads-up (detractor / unhappy)? */
export function isLowScore(s: { type?: unknown; questions?: unknown; settings?: unknown }, score: number | null): boolean {
  if (score == null) return false
  const range = scoreRange(s)
  if (!range) return false
  if (surveyModeOf(s) === 'nps') return score <= 6
  return range.max === 5 ? score <= 2 : score <= 4
}

export type QuestionSummary = {
  id: string
  title: string
  type: SurveyQuestion['type']
  answered: number
  rows?: TallyRow[]
  average?: number | null
  texts?: { text: string; at: string; id?: string }[]
}

export type SurveySummary = {
  mode: SurveyMode
  responses: number
  scored: number
  average: number | null
  nps: number | null
  bands: { promoter: number; passive: number; detractor: number }
  /** CSAT: share of happy answers (4 or 5 of 5; 8 or more of 10). */
  satisfied: number | null
  distribution: { score: number; count: number }[]
  comments: { id?: string; text: string; score: number | null; at: string; name: string }[]
  questions: QuestionSummary[]
  lastAt: string | null
}

export function summariseSurvey(s: { type?: unknown; questions?: unknown; settings?: unknown }, rows: ResponseRow[]): SurveySummary {
  const mode = surveyModeOf(s)
  const range = scoreRange(s)
  const scores: number[] = []
  const comments: SurveySummary['comments'] = []
  let lastAt: string | null = null
  for (const r of rows) {
    const at = typeof r.created_at === 'string' ? r.created_at : ''
    if (at && (!lastAt || at > lastAt)) lastAt = at
    const sc = responseScore(r)
    const inRange = sc != null && (!range || (sc >= range.min && sc <= range.max))
    if (inRange && range) scores.push(sc as number)
    const text = responseComment(r)
    if (text) comments.push({ id: r.id, text, score: inRange ? sc : null, at, name: respondentOf(r).name })
  }
  comments.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  const bands = { promoter: 0, passive: 0, detractor: 0 }
  if (mode === 'nps') for (const n of scores) bands[npsBand(n)]++
  const scored = scores.length
  const distribution = range ? Array.from({ length: range.max - range.min + 1 }, (_, i) => ({ score: range.min + i, count: scores.filter(n => n === range.min + i).length })) : []
  const happy = range && range.max === 5 ? scores.filter(n => n >= 4).length : scores.filter(n => n >= 8).length

  return {
    mode,
    responses: rows.length,
    scored,
    average: scored ? round1(scores.reduce((a, b) => a + b, 0) / scored) : null,
    nps: mode === 'nps' && scored ? Math.round(((bands.promoter - bands.detractor) / scored) * 100) : null,
    bands,
    satisfied: mode === 'csat' && scored ? Math.round((happy / scored) * 100) : null,
    distribution,
    comments,
    questions: mode === 'questions' ? summariseQuestions(surveyQuestions(s), rows) : [],
    lastAt,
  }
}

function summariseQuestions(questions: SurveyQuestion[], rows: ResponseRow[]): QuestionSummary[] {
  return questions.map(q => {
    const values = rows.map(r => ({ v: responseAnswers(r)[q.id], at: typeof r.created_at === 'string' ? r.created_at : '', id: r.id }))
      .filter(x => x.v != null && x.v !== '' && !(Array.isArray(x.v) && !x.v.length))
    const out: QuestionSummary = { id: q.id, title: q.title, type: q.type, answered: values.length }
    if (q.type === 'single_choice' || q.type === 'multiple_choice') {
      const opts = q.options || []
      const counts = new Map(opts.map(o => [o, 0]))
      for (const { v } of values) for (const o of (Array.isArray(v) ? v : [v]).map(x => String(x))) if (counts.has(o)) counts.set(o, (counts.get(o) || 0) + 1)
      const raw = opts.map(o => (values.length ? ((counts.get(o) || 0) / values.length) * 100 : 0))
      const pcts = q.type === 'single_choice' ? largestRemainder(raw) : raw.map(Math.round)
      out.rows = opts.map((o, i) => ({ label: o, count: counts.get(o) || 0, pct: pcts[i] }))
    } else if (q.type === 'rating') {
      const min = q.minRating ?? 1, max = q.maxRating ?? 5
      const nums = values.map(x => Number(x.v)).filter(n => Number.isFinite(n) && n >= min && n <= max)
      out.average = nums.length ? round1(nums.reduce((a, b) => a + b, 0) / nums.length) : null
      const raw = Array.from({ length: max - min + 1 }, (_, i) => (nums.length ? (nums.filter(n => n === min + i).length / nums.length) * 100 : 0))
      const pcts = largestRemainder(raw)
      out.rows = Array.from({ length: max - min + 1 }, (_, i) => ({ label: String(min + i), count: nums.filter(n => n === min + i).length, pct: pcts[i] }))
    } else {
      out.texts = values.map(x => ({ text: String(x.v).slice(0, 2000), at: x.at, id: x.id })).sort((a, b) => (a.at < b.at ? 1 : -1))
    }
    return out
  })
}

/**
 * A response from the public page, checked against the survey. Returns the
 * columns to save, or an error to show.
 */
export function checkSurveyAnswer(s: { type?: unknown; questions?: unknown; settings?: unknown }, body: { score?: unknown; comment?: unknown; answers?: unknown }):
  { answer: string | null; comment: string | null; answers: Record<string, string | string[] | number> | null; score: number | null } | { error: string } {
  const mode = surveyModeOf(s)
  const comment = str(body.comment, 4000).trim() || null
  if (mode === 'questions') {
    const qs = surveyQuestions(s)
    const given = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? body.answers as Record<string, unknown> : {}
    const out: Record<string, string | string[] | number> = {}
    for (const q of qs) {
      const v = given[q.id]
      if (q.type === 'text') {
        const t = str(v, 4000).trim()
        if (t) out[q.id] = t
      } else if (q.type === 'single_choice') {
        const t = str(v, 200).trim()
        if (t && !(q.options || []).includes(t)) return { error: `“${q.title}” has changed. Reload the page and try again.` }
        if (t) out[q.id] = t
      } else if (q.type === 'multiple_choice') {
        const list = Array.from(new Set((Array.isArray(v) ? v : v ? [v] : []).map(x => str(x, 200).trim()).filter(Boolean)))
        if (list.some(t => !(q.options || []).includes(t))) return { error: `“${q.title}” has changed. Reload the page and try again.` }
        if (list.length) out[q.id] = list
      } else {
        const n = Number(v)
        const min = q.minRating ?? 1, max = q.maxRating ?? 5
        if (v != null && v !== '' && (!Number.isInteger(n) || n < min || n > max)) return { error: `Pick a rating from ${min} to ${max} for “${q.title}”.` }
        if (v != null && v !== '') out[q.id] = n
      }
      if (q.isRequired && out[q.id] == null) return { error: `Please answer “${q.title}”.` }
    }
    if (!Object.keys(out).length && !comment) return { error: 'Answer at least one question first.' }
    return { answer: null, comment, answers: out, score: null }
  }
  const range = scoreRange(s)
  if (range) {
    const n = Number(body.score)
    if (body.score == null || body.score === '' || !Number.isInteger(n) || n < range.min || n > range.max) return { error: `Pick a score from ${range.min} to ${range.max} first.` }
    return { answer: String(n), comment, answers: null, score: n }
  }
  if (!comment) return { error: 'Write your answer first.' }
  return { answer: comment, comment: null, answers: null, score: null }
}

// ── Respondent details ──────────────────────────────────────────────────────

/** Email address or phone number, tidied. Empty when it is neither. */
export function cleanContact(v: unknown): string {
  const s = str(v, 160).trim()
  if (!s) return ''
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return s.toLowerCase()
  const digits = s.replace(/[^\d+]/g, '')
  if (/^\+?\d{8,15}$/.test(digits)) {
    // Australian mobiles: 04xx… and +614xx… are the same person.
    if (/^04\d{8}$/.test(digits)) return `+61${digits.slice(1)}`
    return digits
  }
  return ''
}

export function checkRespondent(settings: EngageSettings, body: { name?: unknown; contact?: unknown }): { respondent: { name?: string; contact?: string } | null } | { error: string } {
  const name = settings.ask_name === 'off' ? '' : str(body.name, 120).replace(/\s+/g, ' ').trim()
  const rawContact = settings.ask_contact === 'off' ? '' : str(body.contact, 160).trim()
  const contact = rawContact ? cleanContact(rawContact) : ''
  if (settings.ask_name === 'required' && !name) return { error: 'Please add your name.' }
  if (rawContact && !contact) return { error: 'That email or mobile number doesn’t look right.' }
  if (settings.ask_contact === 'required' && !contact) return { error: 'Please add your email or mobile number.' }
  if (!name && !contact) return { respondent: null }
  return { respondent: { ...(name ? { name } : {}), ...(contact ? { contact } : {}) } }
}

// ── Lists ───────────────────────────────────────────────────────────────────

export type EngageListItem = {
  id: string
  kind: EngageKind
  title: string
  subtitle: string
  status: EngageStatus
  count: number | null
  created_at: string | null
  updated_at: string | null
  closes_at: string | null
  /** The raw row, for duplicate and the menu. */
  row: Record<string, any>
}

export type EngageFilter = 'all' | EngageStatus
export type EngageSort = 'updated' | 'created' | 'name' | 'count'

export const ENGAGE_SORTS: { key: EngageSort; label: string }[] = [
  { key: 'updated', label: 'Last updated' },
  { key: 'created', label: 'Date created' },
  { key: 'name', label: 'Name' },
  { key: 'count', label: 'Most answers' },
]

export function pollListItem(p: Record<string, any>, count: number | null, now = Date.now()): EngageListItem {
  const type = pollTypeOf(p)
  const n = type === 'rating' ? 0 : parsePollOptions(p.options).length
  const typeLabel = POLL_TYPES.find(t => t.key === type)?.label || 'Poll'
  return {
    id: String(p.id), kind: 'poll',
    title: str(p.question, 300).trim() || 'Untitled poll',
    subtitle: type === 'rating' ? `${typeLabel} · 1 to ${ratingTop(p)}` : `${typeLabel} · ${n} answer${n === 1 ? '' : 's'}`,
    status: statusOf(p, now), count,
    created_at: p.created_at || null, updated_at: p.updated_at || p.created_at || null,
    closes_at: settingsOf(p).closes_at, row: p,
  }
}

export function surveyListItem(s: Record<string, any>, count: number | null, now = Date.now()): EngageListItem {
  const mode = surveyModeOf(s)
  const q = mode === 'questions' ? surveyQuestions(s)[0]?.title : str(s.question, 300).trim()
  return {
    id: String(s.id), kind: 'survey',
    title: str(s.title, 200).trim() || 'Untitled survey',
    subtitle: [surveyTypeLabel(s), q].filter(Boolean).join(' · '),
    status: statusOf(s, now), count,
    created_at: s.created_at || null, updated_at: s.updated_at || s.created_at || null,
    closes_at: settingsOf(s).closes_at, row: s,
  }
}

const timeOf = (v: string | null) => { const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : 0 }

export function filterEngage(items: EngageListItem[], opts: { query?: string; status?: EngageFilter }): EngageListItem[] {
  const q = (opts.query || '').trim().toLowerCase()
  return items.filter(i => (opts.status && opts.status !== 'all' ? i.status === opts.status : true)
    && (!q || i.title.toLowerCase().includes(q) || i.subtitle.toLowerCase().includes(q)))
}

export function sortEngage(items: EngageListItem[], sort: EngageSort): EngageListItem[] {
  const out = items.slice()
  if (sort === 'name') out.sort((a, b) => a.title.localeCompare(b.title, 'en-AU', { sensitivity: 'base' }))
  else if (sort === 'created') out.sort((a, b) => timeOf(b.created_at) - timeOf(a.created_at))
  else if (sort === 'count') out.sort((a, b) => (b.count ?? -1) - (a.count ?? -1) || timeOf(b.updated_at) - timeOf(a.updated_at))
  else out.sort((a, b) => timeOf(b.updated_at) - timeOf(a.updated_at))
  return out
}

export function engageCounts(items: EngageListItem[]): Record<EngageFilter, number> {
  const c: Record<EngageFilter, number> = { all: items.length, live: 0, closed: 0, draft: 0 }
  for (const i of items) c[i.status]++
  return c
}

/** "Closes in 3 days" / "Closed 2 Oct" / "" for the list and the public page. */
export function closeNote(closesAt: string | null, now = Date.now()): string {
  if (!closesAt) return ''
  const t = Date.parse(closesAt)
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  const day = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  if (t <= now) return `Closed ${day}`
  const hours = (t - now) / 3_600_000
  if (hours < 1) return 'Closes within the hour'
  if (hours < 24) return `Closes in ${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'}`
  const days = Math.round(hours / 24)
  return days <= 14 ? `Closes in ${days} day${days === 1 ? '' : 's'}` : `Closes ${day}`
}

// ── Duplicating ─────────────────────────────────────────────────────────────

/** A copy as a draft: same question, answers and settings, no votes. Only columns the source row has. */
export function duplicateRow(kind: EngageKind, row: Record<string, any>): Record<string, any> {
  const keep = kind === 'poll'
    ? ['company_id', 'question', 'description', 'image_url', 'options', 'poll_type', 'settings']
    : ['company_id', 'title', 'type', 'question', 'description', 'questions', 'settings']
  const out: Record<string, any> = {}
  for (const k of keep) if (k in row && row[k] !== undefined) out[k] = row[k]
  if (kind === 'poll') out.question = `${str(row.question, 280).trim() || 'Untitled poll'} (copy)`
  else out.title = `${str(row.title, 180).trim() || 'Untitled survey'} (copy)`
  if ('settings' in out) out.settings = settingsWithoutClose(out)
  return { ...out, ...statusFields('draft') }
}
