'use client'

import { useState } from 'react'

export default function SearchBar({ value, onChange, placeholder = 'Search ideas…' }: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const [focused, setFocused] = useState(false)

  return (
    <div className="relative flex-1">
      {/* SVG Icon */}
      <svg
        className="absolute left-3.5 top-1/2 -translate-y-1/2 transition-smooth"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke={focused ? 'var(--coral)' : 'var(--slate)'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>

      {/* Input */}
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        className="w-full pl-11 pr-4 py-2.5 rounded-xl border bg-white text-sm focus:outline-none transition-smooth"
        style={{
          borderColor: focused ? 'var(--coral)' : 'var(--border)',
          boxShadow: focused ? '0 0 0 3px rgba(255, 122, 107, 0.1)' : 'none',
          fontSize: '16px'
        }}
      />

      {/* Clear button */}
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-smooth"
          aria-label="Clear search"
        >
          ✕
        </button>
      )}
    </div>
  )
}
