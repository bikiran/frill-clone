// Staff-side server actions on polls and surveys that the browser can't do
// itself once V386 makes the answer tables server-write only:
//   • delete chosen votes / responses, or reset a poll's votes;
//   • gather a survey's written answers for "Summarise responses".
// The route checks the caller is staff of companyId (requireCompanyAccess);
// these check the poll / survey belongs to that company.

import { isUuid, type EngageDb } from '@/lib/engage-server'
import { responseComment, responseScore, scoreRange, surveyModeOf, surveyQuestions, responseAnswers } from '@/lib/engage-core'
import type { FeedbackItem } from '@/lib/engage-ai'

export type AnswerKind = 'poll' | 'survey'
const META = {
  poll: { parent: 'polls', table: 'poll_votes', col: 'poll_id' },
  survey: { parent: 'surveys', table: 'survey_responses', col: 'survey_id' },
} as const

export async function ownedBy(db: EngageDb, kind: AnswerKind, id: string, companyId: string): Promise<any | null> {
  if (!isUuid(id) || !isUuid(companyId)) return null
  const { data } = await db.from(META[kind].parent).select('*').eq('id', id).maybeSingle()
  return data && data.company_id === companyId ? data : null
}

/**
 * Delete votes / responses. `ids` deletes those rows (only ones on this poll /
 * survey); `all` deletes every row (Reset votes). Returns how many went.
 */
export async function deleteAnswers(db: EngageDb, args: { kind: unknown; id: unknown; companyId: unknown; ids?: unknown; all?: unknown }): Promise<{ status: number; body: { deleted?: number; error?: string } }> {
  const kind = args.kind === 'poll' || args.kind === 'survey' ? args.kind : null
  if (!kind || !isUuid(args.id) || !isUuid(args.companyId)) return { status: 400, body: { error: 'Bad request' } }
  const parent = await ownedBy(db, kind, args.id, args.companyId)
  if (!parent) return { status: 404, body: { error: kind === 'poll' ? 'Poll not found' : 'Survey not found' } }
  const { table, col } = META[kind]
  if (args.all === true) {
    const { data, error } = await db.from(table).delete().eq(col, args.id).select('id')
    if (error) return { status: 500, body: { error: 'Couldn’t delete them just now. Please try again.' } }
    return { status: 200, body: { deleted: (data || []).length } }
  }
  const ids = Array.from(new Set((Array.isArray(args.ids) ? args.ids : []).filter(isUuid))).slice(0, 1000)
  if (!ids.length) return { status: 400, body: { error: 'Nothing to delete' } }
  let deleted = 0
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from(table).delete().eq(col, args.id).in('id', ids.slice(i, i + 200)).select('id')
    if (error) return { status: 500, body: { deleted, error: 'Couldn’t delete them all just now. Please try again.' } }
    deleted += (data || []).length
  }
  return { status: 200, body: { deleted } }
}

/** A survey's written answers, newest first, for the AI summary. */
export async function feedbackItems(db: EngageDb, survey: any, max = 400): Promise<{ items: FeedbackItem[]; scoreLabel: string | null; question: string }> {
  const { data } = await db.from('survey_responses').select('*').eq('survey_id', survey.id).order('created_at', { ascending: false }).limit(2000)
  const rows: any[] = data || []
  const mode = surveyModeOf(survey)
  const range = scoreRange(survey)
  const items: FeedbackItem[] = []
  if (mode === 'questions') {
    const texts = surveyQuestions(survey).filter(q => q.type === 'text')
    for (const r of rows) {
      const a = responseAnswers(r)
      const parts = texts.map(q => (a[q.id] ? `${q.title}: ${String(a[q.id])}` : '')).filter(Boolean)
      const c = responseComment(r)
      if (c) parts.push(c)
      if (parts.length) items.push({ text: parts.join(' | '), score: null })
      if (items.length >= max) break
    }
  } else {
    for (const r of rows) {
      const text = responseComment(r)
      if (!text) continue
      const sc = responseScore(r)
      items.push({ text, score: range && sc != null && sc >= range.min && sc <= range.max ? sc : null })
      if (items.length >= max) break
    }
  }
  const scoreLabel = mode === 'nps' ? '0 to 10, how likely to recommend (9-10 promoters, 0-6 detractors)'
    : range ? `${range.min} to ${range.max} satisfaction, higher is happier` : null
  return { items, scoreLabel, question: mode === 'questions' ? surveyQuestions(survey).map(q => q.title).join(' / ') : String(survey.question || '') }
}
