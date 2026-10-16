// Starting points for a new poll or survey. Each becomes a draft the owner
// edits before publishing. Wording is plain Australian English and general
// enough for any small shop.

import { DEFAULT_QUESTION, compactSettings, statusFields, type EngageSettings, type PollType } from '@/lib/engage-core'

export type PollTemplate = { key: string; title: string; about: string; question: string; type: PollType; options: string[]; settings?: Partial<EngageSettings> }
export type SurveyTemplate = {
  key: string; title: string; about: string
  type: 'nps' | 'csat' | 'open_feedback' | 'questions'
  question?: string
  questions?: { id: string; type: 'text' | 'single_choice' | 'multiple_choice' | 'rating'; title: string; isRequired: boolean; options?: string[]; minRating?: number; maxRating?: number }[]
  settings?: Partial<EngageSettings>
}

export const POLL_TEMPLATES: PollTemplate[] = [
  { key: 'blank', title: 'Blank poll', about: 'Your own question and answers.', question: '', type: 'single_choice', options: ['', ''] },
  { key: 'stock', title: 'What should we stock next?', about: 'Let customers pick the next new line.', question: 'What would you like us to stock next?', type: 'multiple_choice', options: ['Option 1', 'Option 2', 'Option 3'] },
  { key: 'event', title: 'Best time for an event', about: 'Find the day most people can make.', question: 'Which day suits you best for our next workshop?', type: 'single_choice', options: ['Saturday morning', 'Saturday afternoon', 'Sunday morning', 'A weekday evening'] },
  { key: 'name', title: 'Help us name it', about: 'A fun vote that gets people talking.', question: 'Help us name our newest arrival!', type: 'single_choice', options: ['Name 1', 'Name 2', 'Name 3'], settings: { show_results: 'always' } },
  { key: 'rank', title: 'Rank what matters', about: 'Put options in order of importance.', question: 'What matters most to you when you shop with us?', type: 'ranking', options: ['Price', 'Range', 'Expert advice', 'Opening hours'] },
  { key: 'rate', title: 'Quick rating', about: 'One question, rated 1 to 5.', question: 'How would you rate our new layout?', type: 'rating', options: [] },
]

export const SURVEY_TEMPLATES: SurveyTemplate[] = [
  { key: 'nps', title: 'Net Promoter Score', about: 'How likely customers are to recommend you, 0 to 10, with a comment.', type: 'nps', question: DEFAULT_QUESTION.nps, settings: { follow_up: 'What’s the main reason for your score?', notify: 'low' } },
  { key: 'csat', title: 'Customer satisfaction', about: 'Rate the experience 1 to 5 after a visit, delivery or booking.', type: 'csat', question: 'How happy were you with your visit today?', settings: { scale: 5, follow_up: 'Anything we could have done better?', notify: 'low', allow_repeat: true } },
  { key: 'open', title: 'Open feedback', about: 'One open question and a comment box.', type: 'open_feedback', question: DEFAULT_QUESTION.open_feedback },
  {
    key: 'visit', title: 'Store visit', about: 'Four quick questions about a visit to one of your stores.', type: 'questions',
    questions: [
      { id: 'q_store', type: 'single_choice', title: 'Which store did you visit?', isRequired: false, options: ['Store 1', 'Store 2'] },
      { id: 'q_found', type: 'single_choice', title: 'Did you find what you were looking for?', isRequired: true, options: ['Yes', 'Partly', 'No'] },
      { id: 'q_staff', type: 'rating', title: 'How helpful was our team?', isRequired: false, minRating: 1, maxRating: 5 },
      { id: 'q_better', type: 'text', title: 'What could we do better?', isRequired: false },
    ],
    settings: { allow_repeat: true },
  },
  {
    key: 'product', title: 'Product feedback', about: 'How a product is working out after purchase.', type: 'questions',
    questions: [
      { id: 'q_product', type: 'text', title: 'Which product did you buy?', isRequired: false },
      { id: 'q_rating', type: 'rating', title: 'How happy are you with it?', isRequired: true, minRating: 1, maxRating: 5 },
      { id: 'q_again', type: 'single_choice', title: 'Would you buy it again?', isRequired: false, options: ['Yes', 'Maybe', 'No'] },
      { id: 'q_more', type: 'text', title: 'Anything else you’d like to tell us?', isRequired: false },
    ],
  },
]

/** The row a template creates (always a draft). */
export function pollFromTemplate(t: PollTemplate, companyId: string): Record<string, any> {
  return {
    company_id: companyId,
    question: t.question,
    options: t.type === 'rating' ? [] : t.options.map(text => ({ text, image: '', description: '' })),
    poll_type: t.type,
    settings: compactSettings({ ...(t.settings || {}) }),
    ...statusFields('draft'),
  }
}

export function surveyFromTemplate(t: SurveyTemplate, companyId: string): Record<string, any> {
  const row: Record<string, any> = {
    company_id: companyId,
    title: t.key === 'nps' ? 'Customer NPS' : t.title,
    settings: compactSettings({ ...(t.settings || {}) }),
    ...statusFields('draft'),
  }
  if (t.type === 'questions') {
    row.type = 'questions'
    row.question = ''
    // Fresh ids so two surveys from the same template never share question ids.
    const stamp = Date.now().toString(36)
    row.questions = (t.questions || []).map(q => ({ ...q, id: `${q.id}_${stamp}` }))
  } else {
    row.type = t.type
    row.question = t.question || DEFAULT_QUESTION[t.type] || ''
  }
  return row
}
