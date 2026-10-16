// Server side of the public poll and survey pages:
//   GET  /api/polls/[id]            the poll as the public page shows it, plus totals when allowed
//   POST /api/polls/[id]/vote       one vote per person, rate limited
//   GET  /api/surveys/[id]          the survey as the public page shows it
//   POST /api/surveys/[id]/respond  one response per person, rate limited
//
// V386 closes poll_votes and survey_responses to the public key, so these use
// the service role and make the "may a stranger see / do this?" decision
// themselves:
//   • a draft is never shown (404); a closed poll or survey takes no answers;
//   • the totals are only returned when the poll's "show results" allows it,
//     and the rows themselves never are;
//   • one person = the voter id kept in their browser (an HttpOnly cookie, or
//     localStorage when cookies are blocked in an embed), or the customer a
//     campaign link was sent to (?clv=), or the email / mobile they typed. A
//     second vote is refused, or replaces the first when the poll allows
//     changes;
//   • one connection can only send so many per poll per day (a salted hash of
//     the IP, never the IP itself), plus a per-minute burst limit.
// Before V386 adds voter_key and friends, it falls back to a per-poll cookie
// and saves the columns that exist.
//
// Handlers take their database and limiter as arguments so tests can use a fake.

import crypto from 'crypto'
import {
  canSeeResults, checkBallot, checkRespondent, checkSurveyAnswer, isLowScore, parsePollOptions, pollTypeOf, ratingTop,
  responseScore, scoreRange, settingsOf, statusOf, surveyModeOf, surveyQuestions, tallyPoll,
  type EngageKind, type EngageSettings, type EngageStatus, type PollTally, type VoteRow,
} from '@/lib/engage-core'

export const VOTER_COOKIE = 'colvy_voter'
export const VOTER_HEADER = 'x-colvy-voter'
/** Before V386: "this browser voted on this poll" when votes can't be matched to a voter. */
export const votedCookie = (kind: EngageKind, id: string) => `colvy_${kind === 'poll' ? 'pv' : 'sv'}_${id.replace(/-/g, '').slice(0, 20)}`
/** How many different people one connection can answer as, per poll or survey, per day. */
export const IP_DAILY_CAP = 30
/** Vote attempts per connection per minute (each server instance). */
export const BURST_PER_MIN = 20

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)
export const isVoterKey = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(v)
export const newVoterKey = () => crypto.randomBytes(18).toString('base64url')

export type EngageDb = { from: (table: string) => any }
export type Limiter = (key: string, max: number) => boolean
export type Notifier = (companyId: string, message: string) => Promise<void>
export type ClickLookup = (companyId: string, clickRef: unknown) => Promise<string | null>

export type Caller = {
  /** The voter id from the cookie or header (already checked with isVoterKey), if any. */
  voterKey: string | null
  ip: string
  /** ?clv= from a campaign or QR link. */
  clickRef?: unknown
  /** Cookie flags already set for this poll/survey (before V386). */
  votedFlag?: boolean
}

export type Deps = {
  db: EngageDb
  limit?: Limiter
  notify?: Notifier
  contactForClick?: ClickLookup
  now?: () => number
  secret?: string
}

type Out<T> = { status: number; body: T; setVoter?: string; setFlag?: boolean }

const NEW_VOTE_COLS = ['voter_key', 'contact_id', 'respondent', 'rank', 'ip_hash']
const NEW_RESPONSE_COLS = ['answers', 'voter_key', 'contact_id', 'respondent', 'ip_hash']

/** A database error that means "that column isn't there yet". */
export function isMissingColumn(error: any): boolean {
  if (!error) return false
  const msg = String(error.message || '')
  return error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist/i.test(msg) || /Could not find the '.*' column/i.test(msg)
}

export function ipHash(secret: string, kind: EngageKind, id: string, ip: string): string {
  return crypto.createHash('sha256').update(`${secret}|${kind}|${id}|${ip}`).digest('hex').slice(0, 32)
}

const pgQuote = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

/** The company's public face for the page header. */
async function companyFace(db: EngageDb, companyId: unknown): Promise<{ name: string; logo_url: string | null; accent_color: string | null; slug: string | null } | null> {
  if (!isUuid(companyId)) return null
  try {
    const { data } = await db.from('companies').select('name, logo_url, accent_color, slug').eq('id', companyId).maybeSingle()
    return data ? { name: String(data.name || ''), logo_url: data.logo_url || null, accent_color: data.accent_color || null, slug: data.slug || null } : null
  } catch { return null }
}

// ── Polls ───────────────────────────────────────────────────────────────────

export type PublicPoll = {
  id: string
  question: string
  description: string | null
  image_url: string | null
  type: ReturnType<typeof pollTypeOf>
  options: { text: string; image?: string; description?: string }[]
  scale: number
  status: EngageStatus
  closes_at: string | null
  allow_change: boolean
  show_results: EngageSettings['show_results']
  ask_name: EngageSettings['ask_name']
  ask_contact: EngageSettings['ask_contact']
  thank_you: string
  company: Awaited<ReturnType<typeof companyFace>>
}

export type PollView = {
  poll: PublicPoll | null
  /** Totals, when the visitor may see them. */
  results: PollTally | null
  /** What this visitor voted, when the server can tell. */
  myVote: string[] | null
  error?: string
}

async function loadPoll(db: EngageDb, id: string): Promise<any | null> {
  const { data } = await db.from('polls').select('*').eq('id', id).maybeSingle()
  return data || null
}

function publicPoll(p: any, now: number, company: PublicPoll['company']): PublicPoll {
  const s = settingsOf(p)
  return {
    id: p.id,
    question: String(p.question || ''),
    description: p.description || null,
    image_url: p.image_url || null,
    type: pollTypeOf(p),
    options: parsePollOptions(p.options),
    scale: ratingTop(p),
    status: statusOf(p, now),
    closes_at: s.closes_at,
    allow_change: s.allow_change,
    show_results: s.show_results,
    ask_name: s.ask_name,
    ask_contact: s.ask_contact,
    thank_you: s.thank_you,
    company,
  }
}

async function allVotes(db: EngageDb, pollId: string): Promise<VoteRow[]> {
  const out: VoteRow[] = []
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await db.from('poll_votes').select('*').eq('poll_id', pollId).order('created_at', { ascending: true }).range(from, from + 999)
    if (error || !data) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

type Who = { voterKey: string | null; contactId: string | null; contact: string | null }

/**
 * The rows this person already has on the poll/survey. `legacy` is true when
 * the table has no voter_key column yet (V386 not run): nothing can be matched.
 */
async function existingRows(db: EngageDb, table: 'poll_votes' | 'survey_responses', col: 'poll_id' | 'survey_id', id: string, who: Who): Promise<{ rows: any[]; legacy: boolean }> {
  const ors: string[] = []
  if (who.voterKey) ors.push(`voter_key.eq.${pgQuote(who.voterKey)}`)
  if (who.contactId) ors.push(`contact_id.eq.${who.contactId}`)
  if (who.contact) ors.push(`respondent->>contact.eq.${pgQuote(who.contact)}`)
  // Probe the column even with nothing to match, so callers know which mode they're in.
  if (!ors.length) {
    const { error } = await db.from(table).select('voter_key').eq(col, id).limit(1)
    return { rows: [], legacy: isMissingColumn(error) }
  }
  const { data, error } = await db.from(table).select('*').eq(col, id).or(ors.join(',')).order('created_at', { ascending: true }).limit(500)
  if (error) return { rows: [], legacy: isMissingColumn(error) }
  return { rows: data || [], legacy: false }
}

/** Different people this connection has answered as in the last day. */
async function peopleFromIp(db: EngageDb, table: 'poll_votes' | 'survey_responses', col: 'poll_id' | 'survey_id', id: string, hash: string, since: string): Promise<number> {
  const { data, error } = await db.from(table).select('voter_key, id').eq(col, id).eq('ip_hash', hash).gte('created_at', since).limit(1000)
  if (error || !data) return 0
  return new Set(data.map((r: any) => r.voter_key || r.id)).size
}

async function contactFor(deps: Deps, companyId: unknown, clickRef: unknown): Promise<string | null> {
  if (!deps.contactForClick || !isUuid(companyId) || !clickRef) return null
  try { return await deps.contactForClick(companyId, clickRef) } catch { return null }
}

/**
 * Insert, and if the table doesn't have the V386 columns yet, insert
 * `legacyRows` instead (or the same rows without those columns).
 */
async function insertWithFallback(db: EngageDb, table: string, rows: Record<string, unknown>[], newCols: string[], legacyRows?: Record<string, unknown>[]): Promise<{ error: any; legacy: boolean }> {
  const first = await db.from(table).insert(rows)
  if (!first.error) return { error: null, legacy: false }
  if (!isMissingColumn(first.error)) return { error: first.error, legacy: false }
  const stripped = (legacyRows || rows).map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !newCols.includes(k))))
  const second = await db.from(table).insert(stripped)
  return { error: second.error, legacy: true }
}

export async function getPollView(deps: Deps, id: unknown, caller: Caller): Promise<Out<PollView>> {
  const none = (status: number, error: string): Out<PollView> => ({ status, body: { poll: null, results: null, myVote: null, error } })
  if (!isUuid(id)) return none(404, 'Poll not found')
  const now = (deps.now || Date.now)()
  const p = await loadPoll(deps.db, id)
  if (!p) return none(404, 'Poll not found')
  const status = statusOf(p, now)
  if (status === 'draft') return none(404, 'Poll not found')
  const company = await companyFace(deps.db, p.company_id)
  const poll = publicPoll(p, now, company)

  const contactId = await contactFor(deps, p.company_id, caller.clickRef)
  const mine = await existingRows(deps.db, 'poll_votes', 'poll_id', id, { voterKey: caller.voterKey, contactId, contact: null })
  const myVote = mine.rows.length ? myVoteFrom(poll, mine.rows) : null
  const voted = !!myVote || !!caller.votedFlag
  const results = canSeeResults(poll.show_results, status, voted) ? tallyPoll(p, await allVotes(deps.db, id)) : null
  return { status: 200, body: { poll, results, myVote } }
}

function myVoteFrom(poll: PublicPoll, rows: any[]): string[] {
  // The latest ballot: rows sharing the newest voter_key / created_at batch.
  const sorted = rows.slice().sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
  const lastKey = sorted[sorted.length - 1]?.voter_key
  const ballot = lastKey ? sorted.filter(r => r.voter_key === lastKey) : sorted.slice(-1)
  if (poll.type === 'ranking') ballot.sort((a, b) => (Number(a.rank) || 99) - (Number(b.rank) || 99))
  const opts = poll.type === 'rating' ? Array.from({ length: poll.scale }, (_, i) => String(i + 1)) : poll.options.map(o => o.text)
  return Array.from(new Set(ballot.map(r => (typeof r.option === 'string' ? r.option : opts[Number(r.option_index)])).filter((o): o is string => !!o && opts.includes(o))))
}

export type VoteBody = { picks?: unknown; name?: unknown; contact?: unknown }

export async function castVote(deps: Deps, id: unknown, caller: Caller, body: VoteBody): Promise<Out<PollView & { ok?: boolean; changed?: boolean }>> {
  const fail = (status: number, error: string, extra: Partial<PollView> = {}): Out<PollView> => ({ status, body: { poll: null, results: null, myVote: null, ...extra, error } })
  if (!isUuid(id)) return fail(404, 'Poll not found')
  const limit = deps.limit || (() => true)
  if (!limit(`poll-vote:${caller.ip}`, BURST_PER_MIN)) return fail(429, 'Too many votes from here just now. Please wait a minute and try again.')

  const now = (deps.now || Date.now)()
  const p = await loadPoll(deps.db, id)
  if (!p) return fail(404, 'Poll not found')
  const status = statusOf(p, now)
  if (status === 'draft') return fail(404, 'Poll not found')
  if (status === 'closed') return fail(403, 'This poll has closed.')
  const settings = settingsOf(p)

  const ballot = checkBallot(p, body.picks)
  if ('error' in ballot) return fail(400, ballot.error)
  const who = checkRespondent(settings, body)
  if ('error' in who) return fail(400, who.error)

  const voterKey = caller.voterKey || newVoterKey()
  const contactId = await contactFor(deps, p.company_id, caller.clickRef)
  const contact = who.respondent?.contact || null
  const mine = await existingRows(deps.db, 'poll_votes', 'poll_id', id, { voterKey: caller.voterKey, contactId, contact })
  const company = await companyFace(deps.db, p.company_id)
  const poll = publicPoll(p, now, company)

  const already = mine.rows.length > 0 || (mine.legacy && !!caller.votedFlag)
  if (already && !(settings.allow_change && !mine.legacy && mine.rows.length)) {
    const myVote = mine.rows.length ? myVoteFrom(poll, mine.rows) : null
    const results = canSeeResults(poll.show_results, status, true) ? tallyPoll(p, await allVotes(deps.db, id)) : null
    return { status: 409, body: { poll, results, myVote, error: settings.allow_change ? 'You’ve already voted on this poll.' : 'You’ve already voted on this poll. Thanks for taking part.' }, setVoter: caller.voterKey ? undefined : voterKey }
  }

  const secret = deps.secret || 'colvy'
  const hash = ipHash(secret, 'poll', id, caller.ip)
  if (!mine.legacy && !mine.rows.length) {
    const since = new Date(now - 86_400_000).toISOString()
    if (await peopleFromIp(deps.db, 'poll_votes', 'poll_id', id, hash, since) >= IP_DAILY_CAP) {
      return fail(429, 'This poll has had a lot of votes from your connection today. Please try again tomorrow.')
    }
  }

  // Changing a vote: the old ballot goes, the new one is saved under the same voter.
  let changed = false
  const key = mine.rows.find(r => r.voter_key)?.voter_key || voterKey
  if (mine.rows.length && settings.allow_change) {
    const ids = mine.rows.map(r => r.id).filter(Boolean)
    if (ids.length) {
      const { error } = await deps.db.from('poll_votes').delete().in('id', ids)
      if (error) return fail(500, 'Couldn’t change your vote just now. Please try again.')
      changed = true
    }
  }

  const at = new Date(now).toISOString()
  const rows = ballot.rows.map(b => ({
    poll_id: id, option: b.option, created_at: at,
    voter_key: key, contact_id: contactId, respondent: who.respondent, rank: b.rank, ip_hash: hash,
  }))
  // Before V386 there's no rank (or voter) column, so a ranking can only be
  // kept as its first choice, which is how the old page counted it.
  const legacyRows = pollTypeOf(p) === 'ranking' ? rows.slice(0, 1) : rows
  const saved = await insertWithFallback(deps.db, 'poll_votes', mine.legacy ? legacyRows : rows, NEW_VOTE_COLS, legacyRows)
  if (saved.error) return fail(500, 'Couldn’t save your vote just now. Please try again.')

  const myVote = ballot.rows.map(b => b.option)
  if (deps.notify && isUuid(p.company_id) && settings.notify !== 'off' && limit(`poll-notify:${id}`, 1)) {
    const who2 = who.respondent?.name ? ` from ${who.respondent.name}` : ''
    await deps.notify(p.company_id, `New vote${who2} on “${String(p.question || 'your poll').slice(0, 80)}”: ${myVote.join(', ').slice(0, 120)}`).catch(() => {})
  }
  const results = canSeeResults(poll.show_results, status, true) ? tallyPoll(p, await allVotes(deps.db, id)) : null
  return { status: 200, body: { ok: true, changed, poll, results, myVote }, setVoter: voterKey === caller.voterKey ? undefined : voterKey, setFlag: true }
}

// ── Surveys ─────────────────────────────────────────────────────────────────

export type PublicSurvey = {
  id: string
  title: string
  question: string
  description: string | null
  mode: ReturnType<typeof surveyModeOf>
  type: string
  range: { min: number; max: number } | null
  low_label: string
  high_label: string
  follow_up: string
  questions: ReturnType<typeof surveyQuestions>
  status: EngageStatus
  closes_at: string | null
  ask_name: EngageSettings['ask_name']
  ask_contact: EngageSettings['ask_contact']
  thank_you: string
  allow_change: boolean
  company: Awaited<ReturnType<typeof companyFace>>
}

function publicSurvey(s: any, now: number, company: PublicSurvey['company']): PublicSurvey {
  const st = settingsOf(s)
  return {
    id: s.id,
    title: String(s.title || ''),
    question: String(s.question || ''),
    description: s.description || null,
    mode: surveyModeOf(s),
    type: String(s.type || 'nps'),
    range: scoreRange(s),
    low_label: st.low_label,
    high_label: st.high_label,
    follow_up: st.follow_up,
    questions: surveyQuestions(s),
    status: statusOf(s, now),
    closes_at: st.closes_at,
    ask_name: st.ask_name,
    ask_contact: st.ask_contact,
    thank_you: st.thank_you,
    allow_change: st.allow_change,
    company,
  }
}

export type SurveyView = { survey: PublicSurvey | null; answered: boolean; error?: string }

async function loadSurvey(db: EngageDb, id: string): Promise<any | null> {
  const { data } = await db.from('surveys').select('*').eq('id', id).maybeSingle()
  return data || null
}

/** A previous answer that still counts against this person (all of them, unless repeats are allowed after a day). */
function blocking(rows: any[], settings: EngageSettings, now: number): any[] {
  if (!settings.allow_repeat) return rows
  return rows.filter(r => now - Date.parse(String(r.created_at || '')) < 86_400_000)
}

export async function getSurveyView(deps: Deps, id: unknown, caller: Caller): Promise<Out<SurveyView>> {
  if (!isUuid(id)) return { status: 404, body: { survey: null, answered: false, error: 'Survey not found' } }
  const now = (deps.now || Date.now)()
  const s = await loadSurvey(deps.db, id)
  if (!s || statusOf(s, now) === 'draft') return { status: 404, body: { survey: null, answered: false, error: 'Survey not found' } }
  const company = await companyFace(deps.db, s.company_id)
  const contactId = await contactFor(deps, s.company_id, caller.clickRef)
  const mine = await existingRows(deps.db, 'survey_responses', 'survey_id', id, { voterKey: caller.voterKey, contactId, contact: null })
  const settings = settingsOf(s)
  const answered = blocking(mine.rows, settings, now).length > 0 || (mine.legacy && !!caller.votedFlag && !settings.allow_repeat)
  return { status: 200, body: { survey: publicSurvey(s, now, company), answered } }
}

export type RespondBody = { score?: unknown; comment?: unknown; answers?: unknown; name?: unknown; contact?: unknown }

export async function submitSurvey(deps: Deps, id: unknown, caller: Caller, body: RespondBody): Promise<Out<{ ok?: boolean; changed?: boolean; error?: string }>> {
  const fail = (status: number, error: string) => ({ status, body: { error } })
  if (!isUuid(id)) return fail(404, 'Survey not found')
  const limit = deps.limit || (() => true)
  if (!limit(`survey-respond:${caller.ip}`, BURST_PER_MIN)) return fail(429, 'Too many answers from here just now. Please wait a minute and try again.')
  const now = (deps.now || Date.now)()
  const s = await loadSurvey(deps.db, id)
  if (!s) return fail(404, 'Survey not found')
  const status = statusOf(s, now)
  if (status === 'draft') return fail(404, 'Survey not found')
  if (status === 'closed') return fail(403, 'This survey has closed.')
  const settings = settingsOf(s)

  const answer = checkSurveyAnswer(s, body)
  if ('error' in answer) return fail(400, answer.error)
  const who = checkRespondent(settings, body)
  if ('error' in who) return fail(400, who.error)

  const voterKey = caller.voterKey || newVoterKey()
  const contactId = await contactFor(deps, s.company_id, caller.clickRef)
  const contact = who.respondent?.contact || null
  const mine = await existingRows(deps.db, 'survey_responses', 'survey_id', id, { voterKey: caller.voterKey, contactId, contact })
  const live = blocking(mine.rows, settings, now)
  const legacyBlocked = mine.legacy && !!caller.votedFlag && !settings.allow_repeat
  if ((live.length && !settings.allow_change) || legacyBlocked) {
    return { status: 409, body: { error: 'You’ve already answered this survey. Thanks for your feedback.' }, setVoter: caller.voterKey ? undefined : voterKey }
  }

  const hash = ipHash(deps.secret || 'colvy', 'survey', id, caller.ip)
  if (!mine.legacy && !mine.rows.length) {
    const since = new Date(now - 86_400_000).toISOString()
    if (await peopleFromIp(deps.db, 'survey_responses', 'survey_id', id, hash, since) >= IP_DAILY_CAP) {
      return fail(429, 'This survey has had a lot of answers from your connection today. Please try again tomorrow.')
    }
  }

  let changed = false
  if (live.length && settings.allow_change) {
    const { error } = await deps.db.from('survey_responses').delete().in('id', live.map(r => r.id).filter(Boolean))
    if (error) return fail(500, 'Couldn’t update your answer just now. Please try again.')
    changed = true
  }

  const key = mine.rows.find(r => r.voter_key)?.voter_key || voterKey
  const row: Record<string, unknown> = {
    survey_id: id, answer: answer.answer, comment: answer.comment,
    answers: answer.answers, voter_key: key, contact_id: contactId, respondent: who.respondent, ip_hash: hash,
  }
  // Before V386 there's no answers column: a questions survey's answers are
  // kept readable in the comment instead.
  let legacyRow = row
  if (answer.answers) {
    const qs = surveyQuestions(s)
    const text = qs.filter(q => answer.answers![q.id] != null).map(q => `${q.title}: ${([] as unknown[]).concat(answer.answers![q.id]).join(', ')}`).join('\n')
    legacyRow = { ...row, comment: [text, answer.comment].filter(Boolean).join('\n\n') || null }
  }
  const saved = await insertWithFallback(deps.db, 'survey_responses', [mine.legacy ? legacyRow : row], NEW_RESPONSE_COLS, [legacyRow])
  if (saved.error) return fail(500, 'Couldn’t send your answer just now. Please try again.')

  if (deps.notify && isUuid(s.company_id) && settings.notify !== 'off') {
    const score = answer.score ?? responseScore({ answer: answer.answer })
    const low = isLowScore(s, score)
    if ((settings.notify === 'each' || low) && limit(`survey-notify:${id}${low ? ':low' : ''}`, low ? 5 : 1)) {
      const range = scoreRange(s)
      const scoreText = score != null && range ? ` scored ${score}/${range.max}` : ''
      const from = who.respondent?.name ? ` from ${who.respondent.name}` : ''
      const said = answer.comment || (surveyModeOf(s) === 'text' ? answer.answer : '')
      await deps.notify(s.company_id, `${low ? 'Low score' : 'New response'}${from} on “${String(s.title || 'your survey').slice(0, 80)}”${scoreText}${said ? `: “${String(said).slice(0, 140)}”` : ''}`).catch(() => {})
    }
  }
  return { status: 200, body: { ok: true, changed }, setVoter: voterKey === caller.voterKey ? undefined : voterKey, setFlag: true }
}
