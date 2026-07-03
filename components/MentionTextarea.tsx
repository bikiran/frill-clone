'use client'

import React, { useState, useRef, useEffect } from 'react'

interface MentionItem {
  type: 'user' | 'group'
  name: string
  email?: string
  role?: string
  description?: string
}

interface MentionTextareaProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  companyId?: string
  rows?: number
  style?: React.CSSProperties
}

export default function MentionTextarea({
  value,
  onChange,
  placeholder = 'Type @ to mention someone...',
  companyId,
  rows = 4,
  style = {},
}: MentionTextareaProps) {
  const [suggestions, setSuggestions] = useState<MentionItem[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [cursorPos, setCursorPos] = useState(0)
  const [query, setQuery] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Handle textarea input and detect @ mentions
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    onChange(text)
    setCursorPos(e.target.selectionStart || 0)

    // Look for @ in the text before cursor
    const textBeforeCursor = text.substring(0, e.target.selectionStart || 0)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')

    if (lastAtIndex !== -1) {
      const afterAt = textBeforeCursor.substring(lastAtIndex + 1)
      // If there's a space or line break after @, don't show suggestions
      if (!/\s/.test(afterAt)) {
        setQuery(afterAt)
        setShowSuggestions(true)
        fetchSuggestions(afterAt)
      } else {
        setShowSuggestions(false)
      }
    } else {
      setShowSuggestions(false)
    }
  }

  const fetchSuggestions = async (q: string) => {
    if (!companyId) return

    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}&company_id=${companyId}`)
      const data = await res.json()
      setSuggestions([...(data.specialGroups || []), ...(data.users || [])])
    } catch (e) {
      console.error('Fetch suggestions error:', e)
    }
  }

  const insertMention = (item: MentionItem) => {
    if (!textareaRef.current) return

    const text = value
    const textBeforeCursor = text.substring(0, cursorPos)
    const textAfterCursor = text.substring(cursorPos)

    // Find the @ and replace it with the mention
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')
    if (lastAtIndex === -1) return

    const beforeMention = textBeforeCursor.substring(0, lastAtIndex)
    const mention = item.type === 'group' ? item.name : `@${item.name}`
    const newText = beforeMention + mention + ' ' + textAfterCursor

    onChange(newText)
    setShowSuggestions(false)
    setQuery('')

    // Move cursor after the mention
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = beforeMention.length + mention.length + 1
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
        textareaRef.current.focus()
      }
    }, 0)
  }

  // Close suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        placeholder={placeholder}
        rows={rows}
        style={{
          width: '100%',
          padding: '12px',
          borderRadius: 12,
          border: '1px solid #e5e5e5',
          fontSize: 13,
          lineHeight: 1.5,
          resize: 'vertical',
          outline: 'none',
          fontFamily: 'inherit',
          fontColor: '#0d0d0d',
          ...style,
        }}
        onFocus={() => {
          if (value.includes('@')) {
            setShowSuggestions(true)
          }
        }}
      />

      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: 'white',
            borderRadius: 12,
            border: '1px solid #e5e5e5',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            maxHeight: 200,
            overflowY: 'auto',
            zIndex: 50,
          }}>
          {suggestions.map((item, idx) => (
            <button
              key={idx}
              onClick={() => insertMention(item)}
              style={{
                width: '100%',
                padding: '12px',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                borderBottom: idx < suggestions.length - 1 ? '1px solid #f0f0f0' : 'none',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f9f9f9')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#0d0d0d' }}>
                  {item.type === 'group' ? item.name : `@${item.name}`}
                </span>
                <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>
                  {item.type === 'group' ? item.description : item.role}
                </span>
              </div>
              {item.email && (
                <p style={{ fontSize: 11, color: '#6b6b70', marginTop: 2 }}>{item.email}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
