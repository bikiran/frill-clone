'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

const PRIORITY_LEVELS = [
  { key: 'quick_wins', label: 'Quick Wins', color: '#10b981', bg: '#ecfdf5' },
  { key: 'high', label: 'High', color: '#f59e0b', bg: '#fffbeb' },
  { key: 'medium', label: 'Medium', color: '#8b5cf6', bg: '#faf5ff' },
  { key: 'low', label: 'Low', color: '#6b7280', bg: '#f9fafb' },
]

export default function PrioritiesPage() {
  const supabase = createClient()
  const [priorities, setPriorities] = useState(PRIORITY_LEVELS)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')

  const handleEdit = (key: string) => {
    const priority = priorities.find(p => p.key === key)
    if (priority) {
      setEditingKey(key)
      setEditingLabel(priority.label)
    }
  }

  const handleSave = (key: string) => {
    setPriorities(priorities.map(p => 
      p.key === key ? { ...p, label: editingLabel } : p
    ))
    setEditingKey(null)
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <Link href="/admin" className="text-sm text-blue-600 hover:underline mb-4 inline-block">
          ← Back to Admin
        </Link>
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Manage Priorities</h1>
        <p style={{ color: 'var(--slate)' }}>Customize priority levels for your ideas</p>
      </div>

      <div className="space-y-3">
        {priorities.map(priority => (
          <div key={priority.key} className="flex items-center gap-3 p-4 rounded-lg border" style={{ borderColor: 'var(--border)', background: priority.bg }}>
            <div className="w-3 h-3 rounded" style={{ background: priority.color }} />
            {editingKey === priority.key ? (
              <input
                type="text"
                value={editingLabel}
                onChange={e => setEditingLabel(e.target.value)}
                className="flex-1 px-3 py-1 rounded border text-sm"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSave(priority.key)
                  if (e.key === 'Escape') setEditingKey(null)
                }}
              />
            ) : (
              <span className="flex-1 font-medium text-sm" style={{ color: priority.color }}>
                {priority.label}
              </span>
            )}
            {editingKey === priority.key ? (
              <div className="flex gap-2">
                <button
                  onClick={() => handleSave(priority.key)}
                  className="text-xs px-2 py-1 rounded text-white transition-smooth"
                  style={{ background: 'var(--coral)' }}>
                  Save
                </button>
                <button
                  onClick={() => setEditingKey(null)}
                  className="text-xs px-2 py-1 rounded border transition-smooth"
                  style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleEdit(priority.key)}
                className="text-xs px-2 py-1 rounded transition-smooth hover:bg-gray-200"
                style={{ color: priority.color }}>
                Edit
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 p-4 rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--peach)' }}>
        <p className="text-sm" style={{ color: 'var(--coral)' }}>
          <strong>Note:</strong> Priority levels are built-in and cannot be added or removed. You can customize the labels to match your terminology.
        </p>
      </div>
    </div>
  )
}
