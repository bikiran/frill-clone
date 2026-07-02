'use client'

import { useState } from 'react'

interface TypeformDisplayProps {
  question: any
  onAnswer: (answer: any) => void
  progress: number
  themeColor?: string
}

export default function TypeformDisplay({ question, onAnswer, progress, themeColor = '#ff7a6b' }: TypeformDisplayProps) {
  const [answer, setAnswer] = useState('')
  const [selectedOptions, setSelectedOptions] = useState<string[]>([])
  const [rating, setRating] = useState<number | null>(null)

  const handleSubmit = () => {
    let finalAnswer = answer
    if (question.type === 'multiple_choice' || question.type === 'checkbox') finalAnswer = selectedOptions.join(',')
    if (question.type === 'rating') finalAnswer = String(rating)
    onAnswer(finalAnswer)
  }

  const isAnswered = 
    (question.type === 'rating' && rating !== null) ||
    (question.type === 'checkbox' && selectedOptions.length > 0) ||
    (question.type === 'multiple_choice' && selectedOptions.length > 0) ||
    (question.type !== 'rating' && question.type !== 'checkbox' && question.type !== 'multiple_choice' && answer.trim())

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(135deg, ${themeColor}22 0%, ${themeColor}11 100%)`,
      padding: 40,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      {/* Progress bar */}
      <div style={{ width: '100%', maxWidth: 600, marginBottom: 40 }}>
        <div style={{ height: 3, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: themeColor, width: `${progress}%`, transition: 'width 0.3s' }} />
        </div>
        <p style={{ fontSize: 12, color: 'var(--slate)', marginTop: 8 }}>{Math.round(progress)}% complete</p>
      </div>

      {/* Question card */}
      <div style={{
        maxWidth: 600,
        background: '#fff',
        borderRadius: 16,
        padding: 40,
        boxShadow: '0 4px 6px rgba(0,0,0,0.07)',
      }}>
        <div style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--ink)', margin: '0 0 12px 0' }}>
            {question.title}
          </h2>
          {question.description && (
            <p style={{ fontSize: 15, color: 'var(--slate)', margin: 0 }}>
              {question.description}
            </p>
          )}
        </div>

        {/* Question input based on type */}
        <div style={{ marginBottom: 30 }}>
          {question.type === 'text' && (
            <input
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              placeholder="Type your answer..."
              onKeyPress={e => e.key === 'Enter' && isAnswered && handleSubmit()}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: 15,
                border: `2px solid ${answer ? themeColor : '#e5e7eb'}`,
                borderRadius: 8,
                outline: 'none',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box',
              }}
              autoFocus
            />
          )}

          {question.type === 'email' && (
            <input
              type="email"
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              placeholder="your@email.com"
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: 15,
                border: `2px solid ${answer ? themeColor : '#e5e7eb'}`,
                borderRadius: 8,
                outline: 'none',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box',
              }}
              autoFocus
            />
          )}

          {question.type === 'multiple_choice' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {question.options?.map((opt: string) => (
                <button
                  key={opt}
                  onClick={() => setSelectedOptions([opt])}
                  style={{
                    padding: 16,
                    textAlign: 'left',
                    border: `2px solid ${selectedOptions[0] === opt ? themeColor : '#e5e7eb'}`,
                    borderRadius: 8,
                    background: selectedOptions[0] === opt ? `${themeColor}11` : '#fff',
                    cursor: 'pointer',
                    fontSize: 15,
                    fontWeight: selectedOptions[0] === opt ? 600 : 500,
                    color: 'var(--ink)',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = themeColor}
                  onMouseLeave={e => e.currentTarget.style.borderColor = selectedOptions[0] === opt ? themeColor : '#e5e7eb'}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          {question.type === 'checkbox' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {question.options?.map((opt: string) => (
                <label
                  key={opt}
                  style={{
                    padding: 16,
                    border: `2px solid ${selectedOptions.includes(opt) ? themeColor : '#e5e7eb'}`,
                    borderRadius: 8,
                    background: selectedOptions.includes(opt) ? `${themeColor}11` : '#fff',
                    cursor: 'pointer',
                    fontSize: 15,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    transition: 'all 0.2s',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedOptions.includes(opt)}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedOptions([...selectedOptions, opt])
                      } else {
                        setSelectedOptions(selectedOptions.filter(o => o !== opt))
                      }
                    }}
                    style={{ width: 18, height: 18, cursor: 'pointer', accentColor: themeColor }}
                  />
                  {opt}
                </label>
              ))}
            </div>
          )}

          {question.type === 'rating' && (
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              {[1, 2, 3, 4, 5].map(num => (
                <button
                  key={num}
                  onClick={() => setRating(num)}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 8,
                    border: `2px solid ${rating === num ? themeColor : '#e5e7eb'}`,
                    background: rating === num ? themeColor : '#fff',
                    color: rating === num ? '#fff' : 'var(--slate)',
                    fontSize: 20,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  {num}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={!isAnswered}
          style={{
            width: '100%',
            padding: 14,
            borderRadius: 8,
            border: 'none',
            background: isAnswered ? themeColor : '#e5e7eb',
            color: '#fff',
            fontSize: 15,
            fontWeight: 600,
            cursor: isAnswered ? 'pointer' : 'default',
            transition: 'all 0.2s',
            opacity: isAnswered ? 1 : 0.6,
          }}
          onMouseEnter={e => isAnswered && (e.currentTarget.style.transform = 'translateY(-2px)')}
          onMouseLeave={e => isAnswered && (e.currentTarget.style.transform = 'translateY(0)')}
        >
          {question.required ? 'Next' : 'Skip or Next'} →
        </button>
      </div>
    </div>
  )
}
