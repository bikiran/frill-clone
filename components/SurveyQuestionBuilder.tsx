'use client'

import { useState } from 'react'

export interface SurveyQuestion {
  id: string
  type: 'text' | 'single_choice' | 'multiple_choice' | 'rating'
  title: string
  description?: string
  isRequired: boolean
  options?: string[]
  minRating?: number
  maxRating?: number
  ratingLabel?: string
}

export function SurveyQuestionBuilder({ 
  questions, 
  onQuestionsChange 
}: { 
  questions: SurveyQuestion[]
  onQuestionsChange: (questions: SurveyQuestion[]) => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)

  const addQuestion = () => {
    const newQuestion: SurveyQuestion = {
      id: `q_${Date.now()}`,
      type: 'text',
      title: '',
      isRequired: false,
      description: '',
    }
    onQuestionsChange([...questions, newQuestion])
    setActiveId(newQuestion.id)
  }

  const deleteQuestion = (id: string) => {
    onQuestionsChange(questions.filter(q => q.id !== id))
    if (activeId === id) setActiveId(null)
  }

  const updateQuestion = (id: string, updates: Partial<SurveyQuestion>) => {
    onQuestionsChange(
      questions.map(q => q.id === id ? { ...q, ...updates } : q)
    )
  }

  const reorderQuestions = (fromId: string, toId: string) => {
    const fromIdx = questions.findIndex(q => q.id === fromId)
    const toIdx = questions.findIndex(q => q.id === toId)
    if (fromIdx === -1 || toIdx === -1) return

    const newQuestions = [...questions]
    ;[newQuestions[fromIdx], newQuestions[toIdx]] = [newQuestions[toIdx], newQuestions[fromIdx]]
    onQuestionsChange(newQuestions)
  }

  const handleDragStart = (id: string) => {
    setDraggedId(id)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (targetId: string) => {
    if (draggedId && draggedId !== targetId) {
      reorderQuestions(draggedId, targetId)
    }
    setDraggedId(null)
  }

  const X = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
  const isChoice = (t: SurveyQuestion['type']) => t === 'single_choice' || t === 'multiple_choice'

  if (questions.length === 0) {
    return (
      <div className="sqb-empty">
        <b>No questions yet</b>
        <span>Add a question, then pick its type: text, a choice or a rating.</span>
        <button type="button" className="sqb-btn go" onClick={addQuestion}>+ Add question</button>
        <style>{SQB_CSS}</style>
      </div>
    )
  }

  return (
    <div className="sqb">
      {questions.map((q, idx) => (
        <div
          key={q.id}
          draggable={activeId !== q.id}
          onDragStart={() => handleDragStart(q.id)}
          onDragOver={handleDragOver}
          onDrop={() => handleDrop(q.id)}
          className={`sqb-q${activeId === q.id ? ' on' : ''}${draggedId === q.id ? ' drag' : ''}`}>
          <div className="sqb-head">
            <span className="sqb-n" title="Drag to reorder">Q{idx + 1}</span>
            <input
              type="text"
              value={q.title}
              onChange={(e) => updateQuestion(q.id, { title: e.target.value })}
              onFocus={() => setActiveId(q.id)}
              placeholder="Type the question…"
              className="sqb-title"
              aria-label={`Question ${idx + 1}`}
            />
            {activeId !== q.id && <span className="sqb-type">{TYPE_LABEL[q.type]}</span>}
            <button type="button" className="sqb-x" onClick={() => deleteQuestion(q.id)} title="Delete question" aria-label={`Delete question ${idx + 1}`}>{X}</button>
          </div>

          {activeId === q.id && (
            <div className="sqb-body">
              <div className="sqb-types" role="radiogroup" aria-label="Question type">
                {(Object.keys(TYPE_LABEL) as SurveyQuestion['type'][]).map(t => (
                  <button key={t} type="button" role="radio" aria-checked={q.type === t} className={q.type === t ? 'on' : ''}
                    onClick={() => updateQuestion(q.id, { type: t, options: isChoice(t) ? (q.options?.length ? q.options : ['', '']) : undefined })}>
                    {TYPE_LABEL[t]}
                  </button>
                ))}
              </div>

              <textarea
                value={q.description || ''}
                onChange={(e) => updateQuestion(q.id, { description: e.target.value })}
                placeholder="Description (optional)"
                rows={2}
                className="sqb-field"
              />

              {isChoice(q.type) && (
                <div className="sqb-opts">
                  {(q.options || []).map((opt, i) => (
                    <div key={i} className="sqb-opt">
                      <span className={`sqb-mark${q.type === 'multiple_choice' ? ' sq' : ''}`} aria-hidden />
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const newOpts = [...(q.options || [])]
                          newOpts[i] = e.target.value
                          updateQuestion(q.id, { options: newOpts })
                        }}
                        placeholder={`Option ${i + 1}`}
                        className="sqb-field"
                        aria-label={`Option ${i + 1}`}
                      />
                      {(q.options?.length || 0) > 1 && (
                        <button type="button" className="sqb-x" onClick={() => updateQuestion(q.id, { options: (q.options || []).filter((_, j) => j !== i) })} aria-label={`Remove option ${i + 1}`} title="Remove">{X}</button>
                      )}
                    </div>
                  ))}
                  <button type="button" className="sqb-btn sm" onClick={() => updateQuestion(q.id, { options: [...(q.options || []), ''] })}>+ Add option</button>
                </div>
              )}

              {q.type === 'rating' && (
                <div className="sqb-scale">
                  <span>Scale</span>
                  <select value={q.minRating || 1} onChange={(e) => updateQuestion(q.id, { minRating: parseInt(e.target.value) })} className="sqb-field sqb-select" aria-label="Lowest score">
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                  </select>
                  <span>to</span>
                  <select value={q.maxRating || 5} onChange={(e) => updateQuestion(q.id, { maxRating: parseInt(e.target.value) })} className="sqb-field sqb-select" aria-label="Highest score">
                    <option value="5">5</option>
                    <option value="10">10</option>
                  </select>
                </div>
              )}

              <label className="sqb-req">
                <input type="checkbox" checked={q.isRequired} onChange={(e) => updateQuestion(q.id, { isRequired: e.target.checked })} />
                <span className="sqb-sw" aria-hidden><i /></span>
                Required
              </label>
            </div>
          )}
        </div>
      ))}

      <button type="button" className="sqb-btn" onClick={addQuestion}>+ Add question</button>
      <style>{SQB_CSS}</style>
    </div>
  )
}

const TYPE_LABEL: Record<SurveyQuestion['type'], string> = {
  text: 'Short text',
  single_choice: 'Single choice',
  multiple_choice: 'Multiple choice',
  rating: 'Rating',
}

const SQB_CSS = `
.sqb{display:flex;flex-direction:column;gap:8px}
.sqb button::before,.sqb-empty button::before{display:none!important}
.sqb-empty{display:flex;flex-direction:column;align-items:center;gap:4px;padding:22px 16px;border-radius:18px;background:#f7f7f8;text-align:center}
.sqb-empty b{font-size:14px;font-weight:650;color:var(--ink)}
.sqb-empty span{margin-bottom:10px;font-size:12.5px;color:#8e8e93}
.sqb-q{padding:8px 8px 8px 10px;border-radius:18px;background:#f7f7f8;transition:background .15s,box-shadow .15s}
.sqb-q.on{background:var(--card,#fff);box-shadow:0 0 0 1.5px var(--ink)}
.sqb-q.drag{opacity:.55}
.sqb-head{display:flex;align-items:center;gap:8px}
.sqb-n{flex-shrink:0;height:24px;padding:0 8px;display:inline-flex;align-items:center;border-radius:999px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06);font-size:11.5px;font-weight:700;color:#6b6b72;cursor:grab}
.sqb-title{flex:1;min-width:0;height:34px;padding:0 6px;border:none;border-radius:10px;background:none;font:inherit;font-size:14.5px;font-weight:600;color:var(--ink);outline:none}
.sqb-title::placeholder{color:#a1a1aa;font-weight:500}
.sqb-title:focus,.sqb-title:focus-visible{outline:none;box-shadow:none!important}
.sqb-type{flex-shrink:0;font-size:12px;font-weight:600;color:#8e8e93}
.sqb-x{width:30px;height:30px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:50%;background:none;color:#a1a1aa;cursor:pointer}
.sqb-x:hover{background:#fef2f2;color:#dc2626}
.sqb-body{display:flex;flex-direction:column;gap:10px;padding:8px 4px 6px 2px}
.sqb-types{display:flex;flex-wrap:wrap;gap:6px}
.sqb-types button{height:30px;padding:0 12px;border:none;border-radius:999px;background:#f4f4f5;font:inherit;font-size:12.5px;font-weight:600;color:#52525b;cursor:pointer;transition:background .15s,color .15s}
.sqb-types button:hover{background:#ececef}
.sqb-types button.on{background:var(--ink);color:#fff}
.sqb-field{display:block;width:100%;min-height:40px;padding:9px 12px;border:none;border-radius:12px;background:#f4f4f5;font:inherit;font-size:14px;color:var(--ink);outline:none;resize:none}
.sqb-field::placeholder{color:#a1a1aa}
.sqb-field:focus,.sqb-field:focus-visible{background:#fff;box-shadow:0 0 0 1.5px var(--ink)!important;outline:none}
.sqb-opts{display:flex;flex-direction:column;gap:6px}
.sqb-opt{display:flex;align-items:center;gap:8px}
.sqb-mark{width:16px;height:16px;flex-shrink:0;border-radius:50%;box-shadow:inset 0 0 0 1.5px #c4c4cc}
.sqb-mark.sq{border-radius:5px}
.sqb-opts .sqb-btn{align-self:flex-start;margin-left:24px}
.sqb-scale{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#6b6b72}
.sqb-select{width:auto;min-width:72px;padding-right:28px;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;cursor:pointer}
.sqb-req{position:relative;display:inline-flex;align-items:center;gap:9px;align-self:flex-start;font-size:13.5px;font-weight:600;color:var(--ink);cursor:pointer}
.sqb-req input{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}
.sqb-sw{position:relative;width:36px;height:22px;border-radius:999px;background:#d4d4d8;transition:background .2s}
.sqb-sw i{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .2s}
.sqb-req input:checked+.sqb-sw{background:var(--coral)}
.sqb-req input:checked+.sqb-sw i{transform:translateX(14px)}
.sqb-req input:focus-visible+.sqb-sw{box-shadow:0 0 0 2px #fff,0 0 0 4px var(--ink)}
.sqb-btn{height:36px;padding:0 16px;border:none;border-radius:999px;background:#f4f4f5;font:inherit;font-size:13.5px;font-weight:600;color:var(--ink);cursor:pointer;transition:background .15s}
.sqb>.sqb-btn{align-self:flex-start}
.sqb-btn:hover{background:#ececef}
.sqb-btn.sm{height:30px;padding:0 12px;font-size:12.5px}
.sqb-btn.go{background:var(--coral);color:#fff}
.sqb-btn.go:hover{filter:brightness(1.05);background:var(--coral)}
[data-theme="dark"] .sqb-q,[data-theme="dark"] .sqb-empty{background:#232326}
[data-theme="dark"] .sqb-field,[data-theme="dark"] .sqb-types button,[data-theme="dark"] .sqb-btn:not(.go){background:#2e2e33}
`
