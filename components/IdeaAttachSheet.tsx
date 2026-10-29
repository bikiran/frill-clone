'use client'

// Attach a poll or survey to an idea: pick one the workspace already has, or
// make a new one right here. A new one is saved exactly as the full Polls /
// Surveys editors save it (same types, same checks, same columns), so it
// shows, votes and reports the same way, and opens in those editors later.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useEntitlements } from '@/lib/entitlements-client'
import {
  DEFAULT_QUESTION, POLL_TYPES, parsePollOptions, statusFields, statusOf, surveyTypeLabel,
  type PollType,
} from '@/lib/engage-core'
import { insertItem } from '@/components/engage/data'
import { pollDraftOf, pollFields, type PollDraft } from '@/components/engage/PollEditor'
import { KINDS as SURVEY_KINDS, surveyDraftOf, surveyFields, type SurveyDraft, type SurveyKind } from '@/components/engage/SurveyEditor'
import { SurveyQuestionBuilder } from '@/components/SurveyQuestionBuilder'

type Kind = 'poll' | 'survey'
/** A row of the polls or surveys table. */
export type EngageRow = { id: string; question?: string; title?: string; poll_type?: string; options?: unknown; type?: unknown; questions?: unknown; status?: unknown; is_active?: unknown; settings?: unknown; [k: string]: unknown }

const STATUS_TAG: Record<string, { label: string; tone: string }> = {
  live: { label: 'Live', tone: 'green' },
  closed: { label: 'Closed', tone: '' },
  draft: { label: 'Draft', tone: 'amber' },
}

export default function IdeaAttachSheet({ kind, companyId, items, selectedId, startInCreate, onPick, onCreated, onClose }: {
  kind: Kind
  companyId: string | null
  /** The workspace's polls (or surveys). */
  items: EngageRow[]
  selectedId: string | null
  startInCreate?: boolean
  onPick: (id: string) => void
  onCreated: (row: EngageRow) => void
  onClose: () => void
}) {
  const noun = kind === 'poll' ? 'poll' : 'survey'
  const [tab, setTab] = useState<'pick' | 'create'>(startInCreate || items.length === 0 ? 'create' : 'pick')
  const [poll, setPoll] = useState<PollDraft>(() => pollDraftOf({}))
  const [survey, setSurvey] = useState<SurveyDraft>(() => ({ ...surveyDraftOf({ type: 'nps' }), question: DEFAULT_QUESTION.nps }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [tried, setTried] = useState(false)
  const { limitOf } = useEntitlements()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // This sheet sits on top of the idea panel: Esc closes only the sheet.
      e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const { fields, problems } = useMemo(() => kind === 'poll' ? pollFields(poll) : surveyFields(survey), [kind, poll, survey])
  const limit = limitOf(kind === 'poll' ? 'polls' : 'surveys')
  const atCap = typeof limit === 'number' && isFinite(limit) && items.length >= limit

  const create = async () => {
    setTried(true)
    if (problems.length || saving || atCap) return
    if (!companyId) { setError('Couldn’t tell which workspace this is. Reload and try again.'); return }
    setSaving(true); setError('')
    const { data, error: err } = await insertItem(supabase as unknown as Parameters<typeof insertItem>[0], kind, { ...fields, company_id: companyId, ...statusFields('live') })
    setSaving(false)
    if (err || !data?.id) { setError(`Couldn’t create the ${noun}: ${err?.message || 'please try again'}`); return }
    onCreated(data)
  }

  const pickPollType = (t: PollType) => setPoll(p => ({
    ...p, poll_type: t,
    options: t === 'rating' ? p.options : p.options.length >= 2 ? p.options : [...p.options, { text: '' }, { text: '' }].slice(0, 2),
  }))
  const pickSurveyKind = (k: SurveyKind) => setSurvey(s => {
    const next: SurveyDraft = { ...s, kind: k }
    if (k !== 'questions' && (!s.question.trim() || Object.values(DEFAULT_QUESTION).includes(s.question))) next.question = DEFAULT_QUESTION[k] || ''
    if (k === 'csat') next.settings = { ...s.settings, scale: 5 }
    return next
  })
  const setOpt = (i: number, text: string) => setPoll(p => ({ ...p, options: p.options.map((o, j) => j === i ? { ...o, text } : o) }))

  return (
    <>
      <div className="ias-scrim" onClick={onClose} />
      <aside className="ias" role="dialog" aria-modal="true" aria-labelledby="ias-h">
        <header className="ias-head">
          <div>
            <h2 id="ias-h">{tab === 'create' ? `New ${noun}` : `Attach a ${noun}`}</h2>
            <p>{kind === 'poll' ? 'People vote on it right under the idea.' : 'People answer it right under the idea.'}</p>
          </div>
          <button type="button" className="ias-x" onClick={onClose} aria-label="Close" title="Close (Esc)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </header>

        {items.length > 0 && (
          <div className="ias-seg" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'pick'} className={tab === 'pick' ? 'on' : ''} onClick={() => setTab('pick')}>Your {noun}s <small>{items.length}</small></button>
            <button type="button" role="tab" aria-selected={tab === 'create'} className={tab === 'create' ? 'on' : ''} onClick={() => setTab('create')}>Create new</button>
          </div>
        )}

        <div className="ias-body">
          {tab === 'pick' ? (
            <div className="ias-list">
              {items.map(it => {
                const st = STATUS_TAG[statusOf(it)] || STATUS_TAG.live
                const meta = kind === 'poll'
                  ? `${POLL_TYPES.find(t => t.key === (it.poll_type || 'single_choice'))?.label || 'Poll'}${it.poll_type === 'rating' ? '' : ` · ${parsePollOptions(it.options).length} answers`}`
                  : surveyTypeLabel(it)
                const on = it.id === selectedId
                return (
                  <button key={it.id} type="button" className={`ias-item${on ? ' on' : ''}`} onClick={() => onPick(it.id)}>
                    <span className="ias-item-t">
                      <b>{(kind === 'poll' ? it.question : it.title) || `Untitled ${noun}`}</b>
                      <small>{meta}</small>
                    </span>
                    <span className={`ias-tag ${st.tone}`}>{st.label}</span>
                    <span className="ias-check" aria-hidden>{on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17 19 7" /></svg>}</span>
                  </button>
                )
              })}
            </div>
          ) : kind === 'poll' ? (
            <>
              <span className="ias-label">Type</span>
              <div className="ias-types">
                {POLL_TYPES.map(t => (
                  <button key={t.key} type="button" className={`ias-type${poll.poll_type === t.key ? ' on' : ''}`} onClick={() => pickPollType(t.key)}>
                    <b>{t.label}</b><span>{t.key === 'rating' ? `Rate from 1 to ${poll.scale === 10 ? 10 : 5}` : t.about}</span>
                  </button>
                ))}
              </div>
              <label className="ias-fieldset">
                <span className="ias-label">Question</span>
                <input className="ias-field" value={poll.question} maxLength={300} autoFocus onChange={e => setPoll(p => ({ ...p, question: e.target.value }))} placeholder="What should we build next?" />
              </label>
              <label className="ias-fieldset">
                <span className="ias-label">Description <small>optional</small></span>
                <textarea className="ias-field" rows={2} maxLength={500} value={poll.description} onChange={e => setPoll(p => ({ ...p, description: e.target.value }))} placeholder="A line of context for voters" />
              </label>
              {poll.poll_type === 'rating' ? (
                <div className="ias-fieldset">
                  <span className="ias-label">Scale</span>
                  <div className="ias-seg small">
                    {[5, 10].map(n => (
                      <button key={n} type="button" className={(poll.scale === 10 ? 10 : 5) === n ? 'on' : ''} onClick={() => setPoll(p => ({ ...p, scale: n }))}>1 to {n}</button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="ias-fieldset">
                  <span className="ias-label">Answers</span>
                  <div className="ias-opts">
                    {poll.options.map((o, i) => (
                      <div key={i} className="ias-opt">
                        <span className="ias-opt-n">{i + 1}</span>
                        <input className="ias-field" value={o.text} maxLength={200} onChange={e => setOpt(i, e.target.value)} placeholder={`Answer ${i + 1}`} aria-label={`Answer ${i + 1}`} />
                        {poll.options.length > 2 && (
                          <button type="button" className="ias-opt-x" onClick={() => setPoll(p => ({ ...p, options: p.options.filter((_, j) => j !== i) }))} aria-label={`Remove answer ${i + 1}`} title="Remove">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {poll.options.length < 10 && (
                    <button type="button" className="ias-add" onClick={() => setPoll(p => ({ ...p, options: [...p.options, { text: '' }] }))}>+ Add answer</button>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <label className="ias-fieldset">
                <span className="ias-label">Survey name</span>
                <input className="ias-field" value={survey.title} maxLength={140} autoFocus onChange={e => setSurvey(s => ({ ...s, title: e.target.value }))} placeholder="Customer feedback" />
              </label>
              <span className="ias-label">Type</span>
              <div className="ias-types">
                {SURVEY_KINDS.map(k => (
                  <button key={k.key} type="button" className={`ias-type${survey.kind === k.key ? ' on' : ''}`} onClick={() => pickSurveyKind(k.key)}>
                    <b>{k.label}</b><span>{k.about}</span>
                  </button>
                ))}
              </div>
              {survey.kind === 'questions' ? (
                <>
                  <label className="ias-fieldset">
                    <span className="ias-label">Introduction <small>optional</small></span>
                    <textarea className="ias-field" rows={2} maxLength={500} value={survey.description} onChange={e => setSurvey(s => ({ ...s, description: e.target.value }))} placeholder="We’d love your feedback. It takes about a minute." />
                  </label>
                  <span className="ias-label">Questions</span>
                  <SurveyQuestionBuilder questions={survey.questions} onQuestionsChange={qs => setSurvey(s => ({ ...s, questions: qs }))} />
                </>
              ) : (
                <>
                  <label className="ias-fieldset">
                    <span className="ias-label">Question</span>
                    <input className="ias-field" value={survey.question} maxLength={300} onChange={e => setSurvey(s => ({ ...s, question: e.target.value }))} placeholder={DEFAULT_QUESTION[survey.kind]} />
                  </label>
                  <label className="ias-fieldset">
                    <span className="ias-label">Description <small>optional</small></span>
                    <textarea className="ias-field" rows={2} maxLength={500} value={survey.description} onChange={e => setSurvey(s => ({ ...s, description: e.target.value }))} />
                  </label>
                </>
              )}
            </>
          )}
        </div>

        {tab === 'create' && (
          <footer className="ias-foot">
            {atCap ? (
              <p className="ias-note bad">You’ve reached your plan’s limit of {limit} {noun}{limit === 1 ? '' : 's'}. Pick one you have, or upgrade to add more.</p>
            ) : error ? (
              <p className="ias-note bad">{error}</p>
            ) : tried && problems.length > 0 ? (
              <p className="ias-note">{problems[0]}</p>
            ) : (
              <p className="ias-hint">It goes live straight away. Change it any time under {kind === 'poll' ? 'Polls' : 'Surveys'}.</p>
            )}
            <div className="ias-btns">
              <button type="button" className="ias-btn" onClick={onClose}>Cancel</button>
              <button type="button" className="ias-btn go" onClick={create} disabled={saving || atCap || (tried && problems.length > 0)}>
                {saving ? 'Creating…' : `Create & attach`}
              </button>
            </div>
          </footer>
        )}
      </aside>
      <style>{IAS_CSS}</style>
    </>
  )
}

const IAS_CSS = `
.ias-scrim{position:fixed;inset:0;z-index:60;background:rgba(15,15,20,.28);animation:ias-fade .2s ease-out}
.ias{position:fixed;top:10px;right:10px;bottom:10px;z-index:61;width:min(460px,calc(100vw - 20px));display:flex;flex-direction:column;overflow:hidden;border-radius:24px;background:var(--card,#fff);box-shadow:0 24px 60px -12px rgba(16,24,40,.32),0 0 0 1px rgba(0,0,0,.04);animation:ias-in .28s cubic-bezier(.2,.9,.3,1)}
@keyframes ias-in{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}
@keyframes ias-fade{from{opacity:0}}
.ias button::before{display:none!important}
.ias-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:22px 22px 14px}
.ias-head h2{margin:0;font-family:var(--font-display),-apple-system,"SF Pro Display",sans-serif;font-size:24px;font-weight:700;letter-spacing:-.03em;color:var(--ink)}
.ias-head p{margin:4px 0 0;font-size:13.5px;color:#8e8e93}
.ias-x{width:36px;height:36px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:50%;background:#f4f4f5;color:var(--ink);cursor:pointer;transition:background .15s}
.ias-x:hover{background:#e9e9ec}
.ias-seg{display:flex;gap:4px;margin:0 22px 6px;padding:4px;border-radius:999px;background:#f4f4f5}
.ias-seg button{flex:1;height:34px;border:none;border-radius:999px;background:none;font:inherit;font-size:13.5px;font-weight:600;color:#6b6b72;cursor:pointer;transition:background .15s,color .15s,box-shadow .15s}
.ias-seg button small{margin-left:4px;font-size:12px;font-weight:600;color:#a1a1aa}
.ias-seg button.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(16,24,40,.12)}
.ias-seg.small{display:inline-flex;margin:0}
.ias-seg.small button{flex:none;padding:0 16px}
.ias-body{flex:1;min-height:0;overflow-y:auto;padding:14px 22px 22px}
.ias-label{display:block;margin:0 0 8px;font-size:13.5px;font-weight:650;color:var(--ink)}
.ias-label small{margin-left:4px;font-size:12px;font-weight:500;color:#a1a1aa}
.ias-fieldset{display:block;margin-top:18px}
.ias-fieldset+.ias-label,.ias-types+.ias-label{margin-top:18px}
.ias-field{display:block;width:100%;min-height:44px;padding:11px 14px;border:none;border-radius:14px;background:#f4f4f5;font:inherit;font-size:15px;color:var(--ink);outline:none;resize:none;transition:background .15s,box-shadow .15s}
.ias-field::placeholder{color:#a1a1aa}
.ias-field:focus,.ias-field:focus-visible{background:#fff;box-shadow:0 0 0 1.5px var(--ink)!important;outline:none}
.ias-types{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ias-type{display:flex;flex-direction:column;gap:3px;padding:12px 14px;border:none;border-radius:16px;background:#f4f4f5;font:inherit;text-align:left;cursor:pointer;transition:background .15s,box-shadow .15s}
.ias-type b{font-size:14px;font-weight:650;color:var(--ink)}
.ias-type span{font-size:12.5px;line-height:1.35;color:#8e8e93}
.ias-type:hover{background:#ececef}
.ias-type.on{background:#fff;box-shadow:0 0 0 1.5px var(--ink)}
.ias-opts{display:flex;flex-direction:column;gap:8px}
.ias-opt{display:flex;align-items:center;gap:8px}
.ias-opt-n{width:24px;height:24px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:#f4f4f5;font-size:12px;font-weight:700;color:#8e8e93}
.ias-opt .ias-field{flex:1;min-width:0}
.ias-opt-x{width:32px;height:32px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:50%;background:none;color:#a1a1aa;cursor:pointer}
.ias-opt-x:hover{background:#fef2f2;color:#dc2626}
.ias-add{margin-top:10px;height:34px;padding:0 14px;border:none;border-radius:999px;background:#f4f4f5;font:inherit;font-size:13px;font-weight:600;color:var(--ink);cursor:pointer}
.ias-add:hover{background:#ececef}
.ias-list{display:flex;flex-direction:column;gap:6px}
.ias-item{display:flex;align-items:center;gap:10px;width:100%;padding:12px 12px 12px 14px;border:none;border-radius:16px;background:#f7f7f8;font:inherit;text-align:left;cursor:pointer;transition:background .15s,box-shadow .15s}
.ias-item:hover{background:#efeff1}
.ias-item.on{background:#fff;box-shadow:0 0 0 1.5px var(--ink)}
.ias-item-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.ias-item-t b{font-size:14px;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ias-item-t small{font-size:12.5px;color:#8e8e93}
.ias-tag{flex-shrink:0;height:22px;padding:0 9px;display:inline-flex;align-items:center;border-radius:999px;background:#ececef;font-size:11.5px;font-weight:650;color:#6b6b72}
.ias-tag.green{background:#dcfce7;color:#15803d}
.ias-tag.amber{background:#fef3c7;color:#b45309}
.ias-check{width:22px;height:22px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;box-shadow:inset 0 0 0 1.5px #d4d4d8;color:#fff}
.ias-item.on .ias-check{background:var(--ink);box-shadow:none}
.ias-foot{padding:14px 22px 18px;box-shadow:0 -1px 0 rgba(0,0,0,.06)}
.ias-hint{margin:0 0 12px;font-size:12.5px;color:#8e8e93}
.ias-note{margin:0 0 12px;padding:9px 12px;border-radius:12px;background:#fef3c7;font-size:13px;color:#92400e}
.ias-note.bad{background:#fef2f2;color:#b91c1c}
.ias-btns{display:flex;gap:8px}
.ias-btn{flex:1;height:44px;border:none;border-radius:999px;background:#f4f4f5;font:inherit;font-size:14.5px;font-weight:650;color:var(--ink);cursor:pointer;transition:background .15s,opacity .15s,transform .1s}
.ias-btn:hover{background:#ececef}
.ias-btn:active{transform:scale(.98)}
.ias-btn.go{background:var(--coral);color:#fff}
.ias-btn.go:hover{filter:brightness(1.05);background:var(--coral)}
.ias-btn:disabled{opacity:.45;cursor:not-allowed;transform:none}
[data-theme="dark"] .ias{background:#18181b}
[data-theme="dark"] .ias-field,[data-theme="dark"] .ias-type,[data-theme="dark"] .ias-seg,[data-theme="dark"] .ias-x,[data-theme="dark"] .ias-btn:not(.go),[data-theme="dark"] .ias-add,[data-theme="dark"] .ias-opt-n,[data-theme="dark"] .ias-item{background:#27272a}
[data-theme="dark"] .ias-seg button.on,[data-theme="dark"] .ias-type.on,[data-theme="dark"] .ias-item.on,[data-theme="dark"] .ias-field:focus{background:#3f3f46}
`
