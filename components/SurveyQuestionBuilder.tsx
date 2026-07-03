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

  if (questions.length === 0) {
    return (
      <div className="p-6 border-2 border-dashed rounded-lg text-center" style={{ borderColor: 'var(--border)' }}>
        <p className="text-sm mb-4" style={{ color: 'var(--slate)' }}>No questions yet</p>
        <button
          onClick={addQuestion}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-smooth cursor-pointer"
          style={{ background: 'var(--coral)' }}>
          + Add Question
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {questions.map((q, idx) => (
        <div
          key={q.id}
          draggable
          onDragStart={() => handleDragStart(q.id)}
          onDragOver={handleDragOver}
          onDrop={() => handleDrop(q.id)}
          className="border rounded-lg p-4 transition-all cursor-move"
          style={{
            borderColor: activeId === q.id ? 'var(--coral)' : 'var(--border)',
            background: draggedId === q.id ? 'var(--peach)' : 'white',
          }}>
          {/* Question Header */}
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs font-semibold px-2 py-1 rounded" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
              Q{idx + 1}
            </span>
            <input
              type="text"
              value={q.title}
              onChange={(e) => updateQuestion(q.id, { title: e.target.value })}
              onClick={() => setActiveId(q.id)}
              placeholder="Question text..."
              className="flex-1 text-sm font-medium border-0 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-2 py-1"
              style={{ borderColor: 'var(--border)' }}
            />
            <button
              onClick={() => deleteQuestion(q.id)}
              className="p-1 hover:bg-red-50 rounded text-red-600 transition-smooth cursor-pointer"
              title="Delete question">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Question Type & Settings */}
          {activeId === q.id && (
            <div className="space-y-3 p-3 rounded-lg" style={{ background: 'var(--canvas)' }}>
              {/* Type Selector */}
              <div>
                <label className="text-xs font-medium block mb-2" style={{ color: 'var(--ink)' }}>Type</label>
                <select
                  value={q.type}
                  onChange={(e) => updateQuestion(q.id, { type: e.target.value as any, options: undefined })}
                  className="w-full px-3 py-2 border rounded text-sm focus:outline-none"
                  style={{ borderColor: 'var(--border)' }}>
                  <option value="text">Short Text</option>
                  <option value="single_choice">Single Choice</option>
                  <option value="multiple_choice">Multiple Choice</option>
                  <option value="rating">Rating Scale</option>
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-medium block mb-2" style={{ color: 'var(--ink)' }}>Description (optional)</label>
                <textarea
                  value={q.description || ''}
                  onChange={(e) => updateQuestion(q.id, { description: e.target.value })}
                  placeholder="Add context..."
                  rows={2}
                  className="w-full px-3 py-2 border rounded text-sm focus:outline-none resize-none"
                  style={{ borderColor: 'var(--border)' }}
                />
              </div>

              {/* Required Toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={q.isRequired}
                  onChange={(e) => updateQuestion(q.id, { isRequired: e.target.checked })}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm" style={{ color: 'var(--ink)' }}>Required</span>
              </label>

              {/* Options for Choice Types */}
              {(q.type === 'single_choice' || q.type === 'multiple_choice') && (
                <div>
                  <label className="text-xs font-medium block mb-2" style={{ color: 'var(--ink)' }}>Options</label>
                  {(q.options || []).map((opt, i) => (
                    <div key={i} className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const newOpts = [...(q.options || [])]
                          newOpts[i] = e.target.value
                          updateQuestion(q.id, { options: newOpts })
                        }}
                        placeholder={`Option ${i + 1}`}
                        className="flex-1 px-3 py-2 border rounded text-sm focus:outline-none"
                        style={{ borderColor: 'var(--border)' }}
                      />
                      {(q.options?.length || 0) > 1 && (
                        <button
                          onClick={() => {
                            const newOpts = (q.options || []).filter((_, idx) => idx !== i)
                            updateQuestion(q.id, { options: newOpts })
                          }}
                          className="p-2 hover:bg-red-50 rounded text-red-600 transition-smooth cursor-pointer">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      const newOpts = [...(q.options || []), '']
                      updateQuestion(q.id, { options: newOpts })
                    }}
                    className="text-xs font-medium py-1 px-2 rounded hover:bg-gray-100 mt-2"
                    style={{ color: 'var(--coral)' }}>
                    + Add option
                  </button>
                </div>
              )}

              {/* Rating Scale */}
              {q.type === 'rating' && (
                <div className="space-y-2">
                  <label className="text-xs font-medium block" style={{ color: 'var(--ink)' }}>Scale</label>
                  <div className="flex gap-2 items-center">
                    <select
                      value={q.minRating || 1}
                      onChange={(e) => updateQuestion(q.id, { minRating: parseInt(e.target.value) })}
                      className="px-2 py-1 border rounded text-xs focus:outline-none"
                      style={{ borderColor: 'var(--border)' }}>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                    </select>
                    <span style={{ color: 'var(--slate)' }}>to</span>
                    <select
                      value={q.maxRating || 5}
                      onChange={(e) => updateQuestion(q.id, { maxRating: parseInt(e.target.value) })}
                      className="px-2 py-1 border rounded text-xs focus:outline-none"
                      style={{ borderColor: 'var(--border)' }}>
                      <option value="5">5</option>
                      <option value="10">10</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Add Question Button */}
      <button
        onClick={addQuestion}
        className="w-full py-2 rounded-lg border-2 border-dashed text-sm font-medium transition-smooth cursor-pointer hover:bg-gray-50"
        style={{ borderColor: 'var(--border)', color: 'var(--coral)' }}>
        + Add Question
      </button>
    </div>
  )
}
