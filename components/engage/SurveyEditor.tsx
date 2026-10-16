'use client'

// The survey builder (detail page → Edit): type (NPS, satisfaction, an open
// question, or several questions), wording, scale labels, follow-up prompt,
// settings, and a live preview. The several-questions builder is the existing
// SurveyQuestionBuilder (also used when attaching a survey to an idea).

import { useMemo } from 'react'
import { SurveyQuestionBuilder, type SurveyQuestion as BuilderQuestion } from '@/components/SurveyQuestionBuilder'
import {
  DEFAULT_QUESTION, compactSettings, scoreRange, settingsOf, surveyModeOf, surveyQuestions,
  type EngageSettings, type EngageStatus,
} from '@/lib/engage-core'
import type { PublicSurvey } from '@/lib/engage-server'
import { PublicShell, PublicSurveyCard } from './PublicViews'
import { SettingsFields } from './SettingsFields'

export type SurveyKind = 'nps' | 'csat' | 'open_feedback' | 'questions'
export type SurveyDraft = { title: string; kind: SurveyKind; question: string; description: string; questions: BuilderQuestion[]; settings: EngageSettings; legacyType: string }

const KINDS: { key: SurveyKind; label: string; about: string }[] = [
  { key: 'nps', label: 'Net Promoter Score', about: '0 to 10, how likely to recommend' },
  { key: 'csat', label: 'Satisfaction', about: 'How happy, 1 to 5' },
  { key: 'open_feedback', label: 'Open question', about: 'One question, a written answer' },
  { key: 'questions', label: 'Several questions', about: 'Choices, ratings and text' },
]

export function surveyDraftOf(row: any): SurveyDraft {
  const mode = surveyModeOf(row)
  const kind: SurveyKind = mode === 'questions' ? 'questions' : mode === 'nps' ? 'nps' : mode === 'csat' ? 'csat' : row?.type === 'questions' ? 'questions' : 'open_feedback'
  return {
    title: String(row?.title || ''),
    kind,
    question: String(row?.question || ''),
    description: String(row?.description || ''),
    questions: surveyQuestions(row).map(q => ({ ...q, isRequired: q.isRequired })) as BuilderQuestion[],
    settings: settingsOf(row),
    legacyType: String(row?.type || ''),
  }
}

export function surveyFields(d: SurveyDraft): { fields: Record<string, any>; problems: string[] } {
  const problems: string[] = []
  if (!d.title.trim()) problems.push('Give the survey a name.')
  const questions = d.kind === 'questions'
    ? d.questions.filter(q => q.title.trim()).map(q => ({ ...q, title: q.title.trim(), options: q.options ? q.options.map(o => o.trim()).filter(Boolean) : undefined }))
    : []
  if (d.kind === 'questions') {
    if (!questions.length) problems.push('Add at least one question.')
    if (questions.some(q => (q.type === 'single_choice' || q.type === 'multiple_choice') && (q.options || []).length < 2)) problems.push('Each choice question needs at least two options.')
  } else if (!d.question.trim()) problems.push('Add a question.')
  // Older surveys keep their own type name (quick_poll, idea_poll) when it still fits.
  const type = d.kind === 'open_feedback' && ['quick_poll', 'idea_poll', 'open_feedback'].includes(d.legacyType) ? d.legacyType : d.kind
  const settings = d.kind === 'csat' ? compactSettings(d.settings, true) : compactSettings({ ...d.settings, scale: 10 })
  return {
    fields: { title: d.title.trim(), type, question: d.kind === 'questions' ? '' : d.question.trim(), description: d.description.trim() || null, questions, settings },
    problems,
  }
}

export function SurveyEditor({ draft, onChange, hasResponses, hasSettingsColumn, status, company }: {
  draft: SurveyDraft
  onChange: (d: SurveyDraft) => void
  hasResponses: boolean
  hasSettingsColumn: boolean
  status: EngageStatus
  company: PublicSurvey['company']
}) {
  const set = <K extends keyof SurveyDraft>(k: K, v: SurveyDraft[K]) => onChange({ ...draft, [k]: v })
  const setS = <K extends keyof EngageSettings>(k: K, v: EngageSettings[K]) => onChange({ ...draft, settings: { ...draft.settings, [k]: v } })
  const pickKind = (k: SurveyKind) => {
    const next: SurveyDraft = { ...draft, kind: k }
    if (k !== 'questions' && (!draft.question.trim() || Object.values(DEFAULT_QUESTION).includes(draft.question))) next.question = DEFAULT_QUESTION[k] || ''
    if (k === 'csat' && !hasResponses) next.settings = { ...draft.settings, scale: 5 }
    onChange(next)
  }

  const rowLike = useMemo(() => {
    const { fields } = surveyFields(draft)
    return { ...fields, questions: draft.kind === 'questions' ? draft.questions : [], settings: { ...draft.settings } }
  }, [draft])
  const preview: PublicSurvey = useMemo(() => ({
    id: 'preview', title: draft.title, question: draft.question, description: draft.description || null,
    mode: draft.kind === 'questions' ? 'questions' : surveyModeOf(rowLike), type: draft.kind, range: scoreRange(rowLike),
    low_label: draft.settings.low_label, high_label: draft.settings.high_label, follow_up: draft.settings.follow_up,
    questions: surveyQuestions({ questions: draft.questions }), status: status === 'closed' ? 'closed' : 'live', closes_at: draft.settings.closes_at,
    ask_name: draft.settings.ask_name, ask_contact: draft.settings.ask_contact, thank_you: draft.settings.thank_you, allow_change: draft.settings.allow_change, company,
  }), [draft, rowLike, status, company])

  return (
    <div className="eg-editor">
      <div style={{ minWidth: 0 }}>
        <div className="eg-card">
          <label className="eg-field">
            <span className="eg-label">Survey name</span>
            <input className="eg-input" value={draft.title} maxLength={140} onChange={e => set('title', e.target.value)} placeholder="Customer feedback" style={{ fontSize: 16, height: 44 }} />
          </label>
          <span className="eg-label">Type</span>
          {hasResponses && <p className="eg-help">The type can&apos;t change once people have answered.</p>}
          <div className="eg-types">
            {KINDS.map(k => (
              <button key={k.key} type="button" className={`eg-type${draft.kind === k.key ? ' on' : ''}`} disabled={hasResponses && draft.kind !== k.key} onClick={() => pickKind(k.key)}>
                <b>{k.label}</b><span>{k.about}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="eg-card">
          {draft.kind === 'questions' ? (
            <>
              <label className="eg-field">
                <span className="eg-label">Introduction <small>(optional)</small></span>
                <textarea className="eg-input" rows={2} maxLength={500} value={draft.description} onChange={e => set('description', e.target.value)} placeholder="We’d love your feedback. It takes about a minute." />
              </label>
              <span className="eg-label">Questions</span>
              <SurveyQuestionBuilder questions={draft.questions} onQuestionsChange={qs => set('questions', qs)} />
            </>
          ) : (
            <>
              <label className="eg-field">
                <span className="eg-label">Question</span>
                <input className="eg-input" value={draft.question} maxLength={300} onChange={e => set('question', e.target.value)} placeholder={DEFAULT_QUESTION[draft.kind]} />
              </label>
              <label className="eg-field">
                <span className="eg-label">Description <small>(optional)</small></span>
                <textarea className="eg-input" rows={2} maxLength={500} value={draft.description} onChange={e => set('description', e.target.value)} />
              </label>
              {draft.kind === 'csat' && (
                <label className="eg-field">
                  <span className="eg-label">Scale</span>
                  <select className="eg-input eg-select" value={draft.settings.scale} disabled={hasResponses} onChange={e => setS('scale', Number(e.target.value) === 5 ? 5 : 10)} style={{ maxWidth: 320 }}>
                    <option value={5}>1 to 5, with faces</option>
                    <option value={10}>0 to 10</option>
                  </select>
                </label>
              )}
              {(draft.kind === 'nps' || (draft.kind === 'csat' && draft.settings.scale === 10)) && (
                <div className="eg-settings" style={{ marginBottom: 14 }}>
                  <label className="eg-field"><span className="eg-label">Low end label</span><input className="eg-input" value={draft.settings.low_label} maxLength={60} onChange={e => setS('low_label', e.target.value)} placeholder={draft.kind === 'nps' ? 'Not likely' : 'Very unhappy'} /></label>
                  <label className="eg-field"><span className="eg-label">High end label</span><input className="eg-input" value={draft.settings.high_label} maxLength={60} onChange={e => setS('high_label', e.target.value)} placeholder={draft.kind === 'nps' ? 'Very likely' : 'Very happy'} /></label>
                </div>
              )}
              {draft.kind !== 'open_feedback' && (
                <label className="eg-field">
                  <span className="eg-label">Follow-up question <small>(optional, shown above the comment box)</small></span>
                  <input className="eg-input" value={draft.settings.follow_up} maxLength={300} onChange={e => setS('follow_up', e.target.value)} placeholder="Tell us more (optional)" />
                </label>
              )}
            </>
          )}
        </div>

        <SettingsFields kind="survey" value={draft.settings} onChange={s => set('settings', s)} hasSettingsColumn={hasSettingsColumn} />
      </div>

      <div className="eg-preview-col" style={{ minWidth: 0 }}>
        <div className="eg-preview-frame">
          <div className="eg-preview-label"><span>Preview</span><span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>What customers see</span></div>
          <PublicShell company={company} embed accent={company?.accent_color && /^#[0-9a-f]{6}$/i.test(company.accent_color) ? company.accent_color : '#ff7a6b'}>
            <PublicSurveyCard key={`${draft.kind}|${draft.settings.scale}`} survey={preview} answered={false} preview />
          </PublicShell>
        </div>
      </div>
    </div>
  )
}
