// Rows for the Responses tab and the CSV export of polls and surveys. Pure.

import {
  groupVoters, pollChoices, pollTypeOf, respondentOf, responseAnswers, responseComment, responseScore, scoreRange,
  surveyModeOf, surveyQuestions, voteOption, type ResponseRow, type VoteRow,
} from '@/lib/engage-core'
import { dbTimeOr0, newestDbTime } from '@/lib/db-time'

export type AnswerLine = {
  /** Stable id for selection: the voter (poll) or the response id (survey). */
  key: string
  /** Database row ids behind this line (a poll ballot can be several rows). */
  ids: string[]
  at: string
  cells: string[]
  name: string
  contact: string
  fromCampaign: boolean
}

const textAt = (v: unknown) => (typeof v === 'string' ? v : '')
const newestFirst = (a: AnswerLine, b: AnswerLine) => dbTimeOr0(b.at) - dbTimeOr0(a.at)

/** One line per person's ballot, newest first. */
export function pollLines(poll: { poll_type?: unknown; options?: unknown; settings?: unknown }, votes: VoteRow[]): { header: string[]; lines: AnswerLine[] } {
  const type = pollTypeOf(poll)
  const choices = pollChoices(poll)
  const lines: AnswerLine[] = []
  for (const g of groupVoters(votes)) {
    const sorted = type === 'ranking' ? g.slice().sort((a, b) => (Number(a.rank) || 99) - (Number(b.rank) || 99)) : g
    const picks = Array.from(new Set(sorted.map(v => voteOption(v, choices)).filter((o): o is string => !!o)))
    const at = newestDbTime(g, v => v.created_at).at || ''
    const who = respondentOf(g.find(v => v.respondent) || {})
    lines.push({
      key: textAt(g[0].voter_key) || textAt(g[0].id),
      ids: g.map(v => textAt(v.id)).filter(Boolean),
      at,
      cells: [type === 'ranking' ? picks.map((p, i) => `${i + 1}. ${p}`).join('  ') : picks.join(', ')],
      name: who.name,
      contact: who.contact,
      fromCampaign: g.some(v => !!v.contact_id),
    })
  }
  lines.sort(newestFirst)
  return { header: [type === 'ranking' ? 'Ranking' : type === 'rating' ? 'Rating' : type === 'multiple_choice' ? 'Answers' : 'Answer'], lines }
}

/** One line per response, newest first, with a column per question for a questions survey. */
export function surveyLines(survey: { type?: unknown; questions?: unknown; settings?: unknown }, rows: ResponseRow[]): { header: string[]; lines: AnswerLine[] } {
  const mode = surveyModeOf(survey)
  const range = scoreRange(survey)
  const qs = surveyQuestions(survey)
  const header = mode === 'questions' ? [...qs.map(q => q.title), 'Comment'] : range ? ['Score', 'Comment'] : ['Answer']
  const lines = rows.map(r => {
    const who = respondentOf(r)
    let cells: string[]
    if (mode === 'questions') {
      const a = responseAnswers(r)
      cells = [...qs.map(q => {
        const v = a[q.id]
        return v == null ? '' : Array.isArray(v) ? v.join(', ') : String(v)
      }), responseComment(r)]
    } else if (range) {
      const s = responseScore(r)
      cells = [s == null ? '' : String(s), responseComment(r)]
    } else {
      cells = [responseComment(r)]
    }
    return { key: textAt(r.id), ids: [textAt(r.id)].filter(Boolean), at: textAt(r.created_at), cells, name: who.name, contact: who.contact, fromCampaign: !!r.contact_id }
  })
  lines.sort(newestFirst)
  return { header, lines }
}

/** Header and body for toCsv: When, the answer columns, Name, Contact, Source. */
export function exportRows(t: { header: string[]; lines: AnswerLine[] }, formatTime: (iso: string) => string): { header: string[]; body: string[][] } {
  return {
    header: ['Submitted', ...t.header, 'Name', 'Email or mobile', 'Source'],
    body: t.lines.map(l => [formatTime(l.at), ...l.cells, l.name, l.contact, l.fromCampaign ? 'SMS campaign' : 'Link']),
  }
}
