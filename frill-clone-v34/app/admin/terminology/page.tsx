'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

interface Term {
  key: string
  label: string
  category: string
  description?: string
}

const CATEGORIES = ['main', 'ideas', 'admin', 'general', 'announcements']

export default function TerminologyPage() {
  const supabase = createClient()
  const [terms, setTerms] = useState<Term[]>([])
  const [loading, setLoading] = useState(true)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('main')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchTerminology()
  }, [])

  const fetchTerminology = async () => {
    try {
      const { data } = await supabase.from('terminology').select('*').order('category, key')
      if (data) {
        setTerms(data)
      }
    } catch (error) {
      console.error('Failed to fetch terminology:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (key: string) => {
    if (!editingLabel.trim()) return
    
    try {
      await supabase
        .from('terminology')
        .update({ label: editingLabel })
        .eq('key', key)
      
      setTerms(terms.map(t => t.key === key ? { ...t, label: editingLabel } : t))
      setEditingKey(null)
    } catch (error) {
      console.error('Failed to save:', error)
    }
  }

  const filteredTerms = terms.filter(t => {
    const matchesCategory = selectedCategory === 'all' || t.category === selectedCategory
    const matchesSearch = !searchQuery || t.key.includes(searchQuery.toLowerCase()) || t.label.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  const groupedByCategory = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = filteredTerms.filter(t => t.category === cat)
    return acc
  }, {} as Record<string, Term[]>)

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <Link href="/admin" className="text-sm text-blue-600 hover:underline mb-4 inline-block">
          ← Back to Admin
        </Link>
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Customize Terminology</h1>
        <p style={{ color: 'var(--slate)' }}>Change how terms appear throughout your app</p>
      </div>

      <div className="mb-6 flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search terms..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="px-3 py-2 rounded-lg border text-sm flex-1 min-w-[200px]"
          style={{ borderColor: 'var(--border)' }}
        />
        <select
          value={selectedCategory}
          onChange={e => setSelectedCategory(e.target.value)}
          className="px-3 py-2 rounded-lg border text-sm"
          style={{ borderColor: 'var(--border)' }}>
          <option value="all">All Categories</option>
          {CATEGORIES.map(cat => (
            <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-8">Loading...</div>
      ) : (
        <div className="space-y-6">
          {CATEGORIES.map(category => {
            const categoryTerms = groupedByCategory[category]
            if (categoryTerms.length === 0) return null
            
            return (
              <div key={category}>
                <h2 className="text-lg font-semibold mb-3 capitalize" style={{ color: 'var(--ink)' }}>
                  {category}
                </h2>
                <div className="space-y-2">
                  {categoryTerms.map(term => (
                    <div key={term.key} className="flex items-center gap-3 p-4 rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono text-gray-500 mb-1">{term.key}</p>
                        {editingKey === term.key ? (
                          <input
                            type="text"
                            value={editingLabel}
                            onChange={e => setEditingLabel(e.target.value)}
                            className="w-full px-2 py-1 rounded border text-sm"
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSave(term.key)
                              if (e.key === 'Escape') setEditingKey(null)
                            }}
                          />
                        ) : (
                          <span className="font-medium text-sm" style={{ color: 'var(--ink)' }}>
                            {term.label}
                          </span>
                        )}
                        {term.description && (
                          <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{term.description}</p>
                        )}
                      </div>
                      {editingKey === term.key ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSave(term.key)}
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
                          onClick={() => {
                            setEditingKey(term.key)
                            setEditingLabel(term.label)
                          }}
                          className="text-xs px-3 py-1 rounded transition-smooth hover:bg-gray-100"
                          style={{ color: 'var(--slate)' }}>
                          Edit
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-8 p-4 rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--peach)' }}>
        <p className="text-sm" style={{ color: 'var(--coral)' }}>
          <strong>💡 Tip:</strong> Use this page to customize terminology for different languages or business contexts. Changes apply instantly throughout the app.
        </p>
      </div>
    </div>
  )
}
