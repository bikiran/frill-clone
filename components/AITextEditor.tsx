'use client'

import React, { useState } from 'react'

interface AITextEditorProps {
  /** Required so AI usage can be attributed and capped per workspace. */
  companyId?: string | null
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function AITextEditor({ value, onChange, placeholder, companyId }: AITextEditorProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  const callAI = async (task: string, params: Record<string, any> = {}) => {
    setLoading(task)
    setError('')
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, task, text: value, ...params }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'AI request failed')
      }

      const data = await res.json()
      if (task === 'suggest_tags') {
        // Tags would be handled differently - show as chip selection
        setError(`Suggested tags: ${data.result.join(', ')}`)
      } else if (typeof data.result === 'string') {
        onChange(data.result)
      }
    } catch (err: any) {
      setError(err.message)
    }
    setLoading(null)
  }

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          minHeight: 120,
          padding: 12,
          borderRadius: 12,
          border: '1px solid #e5e5e5',
          fontSize: 13,
          lineHeight: 1.5,
          fontFamily: 'inherit',
          resize: 'vertical',
          outline: 'none',
        }}
      />

      {/* AI Tools Bar */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button
          onClick={() => callAI('improve_writing', { tone: 'professional' })}
          disabled={!value || loading === 'improve_writing'}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #e5e5e5',
            background: loading === 'improve_writing' ? '#f3f4f6' : '#fff',
            cursor: loading ? 'default' : 'pointer',
            fontSize: 12,
            fontWeight: 500,
            color: '#0d0d0d',
            opacity: !value ? 0.5 : 1,
          }}
          title="Improve writing with AI">
          {loading === 'improve_writing' ? 'Improving...' : '✨ Improve'}
        </button>

        <button
          onClick={() => callAI('summarize')}
          disabled={!value || loading === 'summarize'}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #e5e5e5',
            background: loading === 'summarize' ? '#f3f4f6' : '#fff',
            cursor: loading ? 'default' : 'pointer',
            fontSize: 12,
            fontWeight: 500,
            color: '#0d0d0d',
            opacity: !value ? 0.5 : 1,
          }}
          title="Summarize with AI">
          {loading === 'summarize' ? 'Summarizing...' : '📝 Summarize'}
        </button>

        <button
          onClick={() => callAI('fix_formatting')}
          disabled={!value || loading === 'fix_formatting'}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #e5e5e5',
            background: loading === 'fix_formatting' ? '#f3f4f6' : '#fff',
            cursor: loading ? 'default' : 'pointer',
            fontSize: 12,
            fontWeight: 500,
            color: '#0d0d0d',
            opacity: !value ? 0.5 : 1,
          }}
          title="Fix formatting with AI">
          {loading === 'fix_formatting' ? 'Fixing...' : '🔧 Fix'}
        </button>

        <button
          onClick={() => callAI('suggest_tags')}
          disabled={!value || loading === 'suggest_tags'}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #e5e5e5',
            background: loading === 'suggest_tags' ? '#f3f4f6' : '#fff',
            cursor: loading ? 'default' : 'pointer',
            fontSize: 12,
            fontWeight: 500,
            color: '#0d0d0d',
            opacity: !value ? 0.5 : 1,
          }}
          title="Suggest tags with AI">
          {loading === 'suggest_tags' ? 'Suggesting...' : '🏷️ Tags'}
        </button>
      </div>

      {/* Error/Success messages */}
      {error && (
        <div style={{
          marginTop: 8,
          padding: '8px 12px',
          borderRadius: 8,
          background: error.startsWith('Suggested') ? '#dcfce7' : '#fee2e2',
          color: error.startsWith('Suggested') ? '#065f46' : '#991b1b',
          fontSize: 12,
        }}>
          {error}
        </div>
      )}
    </div>
  )
}
