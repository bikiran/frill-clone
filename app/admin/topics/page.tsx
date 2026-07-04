'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { IconPencil, IconTrash, IconLock, IconUnlock } from '@/components/SvgIcons'

const DEFAULT_TOPICS = [
  { id: 'welcome', label: 'Welcome', emoji: '👋', isPrivate: false, order: 0 },
  { id: 'improvement', label: 'Improvement', emoji: '⬆️', isPrivate: false, order: 1 },
  { id: 'integrations', label: 'Integrations', emoji: '🔗', isPrivate: false, order: 2 },
  { id: 'styling', label: 'Styling', emoji: '🎨', isPrivate: false, order: 3 },
  { id: 'misc', label: 'Misc', emoji: '✨', isPrivate: false, order: 4 },
  { id: 'bug', label: 'Bug Report', emoji: '🐛', isPrivate: false, order: 5 },
]

export default function TopicsPage() {
  const [topics, setTopics] = useState(DEFAULT_TOPICS)
  const [newTopic, setNewTopic] = useState('')
  const [newEmoji, setNewEmoji] = useState('✨')
  const [user, setUser] = useState<any>(null)
  const [checking, setChecking] = useState(true)
  const [topicLimit, setTopicLimit] = useState(3)
  const [topicPermission, setTopicPermission] = useState<'everybody' | 'members'>('everybody')
  const [draggedItem, setDraggedItem] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const slug = searchParams.get('slug') || ''

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      if (!u) {
        router.push('/signin?next=/admin/topics')
        return
      }
      setUser(u)
      setChecking(false)
    })
  }, [router])

  const addTopic = () => {
    if (!newTopic.trim()) return
    const newOrder = Math.max(...topics.map(t => t.order), -1) + 1
    setTopics([...topics, {
      id: newTopic.toLowerCase().replace(/\s+/g, '_'),
      label: newTopic,
      emoji: newEmoji,
      isPrivate: false,
      order: newOrder,
    }])
    setNewTopic('')
    setNewEmoji('✨')
  }

  const removeTopic = (id: string) => {
    setTopics(topics.filter(t => t.id !== id))
  }

  const togglePrivate = (id: string) => {
    setTopics(topics.map(t => 
      t.id === id ? { ...t, isPrivate: !t.isPrivate } : t
    ))
  }

  const startEdit = (id: string, label: string) => {
    setEditingId(id)
    setEditingLabel(label)
  }

  const saveEdit = (id: string) => {
    if (!editingLabel.trim()) {
      setEditingId(null)
      return
    }
    setTopics(topics.map(t => 
      t.id === id ? { ...t, label: editingLabel } : t
    ))
    setEditingId(null)
  }

  const handleDragStart = (index: number) => {
    setDraggedItem(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedItem === null || draggedItem === index) return

    const newTopics = [...topics]
    const draggedTopic = newTopics[draggedItem]
    newTopics.splice(draggedItem, 1)
    newTopics.splice(index, 0, draggedTopic)
    
    // Update order values
    newTopics.forEach((topic, i) => {
      topic.order = i
    })
    
    setTopics(newTopics)
    setDraggedItem(index)
  }

  const handleDragEnd = () => {
    setDraggedItem(null)
  }

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p style={{ color: 'var(--slate)' }}>Checking permissions...</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-8">
        <Link href="/" className="text-sm font-medium" style={{ color: 'var(--coral)' }}>
          ← Back to Ideas
        </Link>
        <h1 className="text-3xl font-bold mt-4 mb-2" style={{ color: 'var(--ink)' }}>
          Topics
        </h1>
        <p style={{ color: 'var(--slate)' }}>
          Organize ideas with topics so users can filter by tags.
        </p>
      </div>

      {/* Private Topics Notice */}
      <div className="bg-blue-50 border-l-4 border-blue-500 rounded-lg p-4 mb-8" style={{ borderColor: '#3b82f6' }}>
        <h3 className="font-semibold text-sm mb-2" style={{ color: '#1e40af' }}>Remember: Private Topics are a paid feature</h3>
        <p className="text-sm mb-3" style={{ color: '#1e40af' }}>
          Private Topics are part of the Privacy Add-on. They will be converted to normal Topics at the end of your trial unless you purchase the Growth plan or Privacy Add-on.
        </p>
        <a href={`/admin/settings/billing?slug=${slug}`} className="text-sm font-medium hover:underline" style={{ color: '#3b82f6' }}>
          Compare plans →
        </a>
      </div>

      {/* Topic Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Topic Limit */}
        <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--ink)' }}>Topic Limit</h3>
          <p className="text-sm mb-4" style={{ color: 'var(--slate)' }}>The maximum number of topics on an Idea (set to 0 for unlimited).</p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={topicLimit}
              onChange={e => setTopicLimit(Math.max(0, parseInt(e.target.value) || 0))}
              min="0"
              className="w-20 px-4 py-2 border rounded-lg focus:outline-none text-sm"
              style={{ borderColor: 'var(--border)', fontSize: '16px' }}
            />
            <span style={{ color: 'var(--slate)' }} className="text-sm">topics per idea</span>
          </div>
        </div>

        {/* Topic Permissions */}
        <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--ink)' }}>Topic Permissions</h3>
          <p className="text-sm mb-4" style={{ color: 'var(--slate)' }}>Control who can assign topics to Ideas.</p>
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input 
                type="radio" 
                name="permission"
                checked={topicPermission === 'everybody'}
                onChange={() => setTopicPermission('everybody')}
                className="w-4 h-4"
              />
              <span className="text-sm" style={{ color: 'var(--ink)' }}>Everybody</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input 
                type="radio" 
                name="permission"
                checked={topicPermission === 'members'}
                onChange={() => setTopicPermission('members')}
                className="w-4 h-4"
              />
              <span className="text-sm" style={{ color: 'var(--ink)' }}>Company members</span>
            </label>
          </div>
        </div>
      </div>

      {/* Add Topic Form */}
      <div className="bg-white rounded-2xl border p-6 mb-8" style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--ink)' }}>
          Add Topic
        </h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={newTopic}
            onChange={e => setNewTopic(e.target.value)}
            placeholder="Topic name"
            className="flex-1 px-4 py-2.5 border rounded-lg text-sm focus:outline-none transition-smooth"
            style={{ borderColor: 'var(--border)', fontSize: '16px' }}
            onKeyPress={e => e.key === 'Enter' && addTopic()}
          />
          <input
            type="text"
            value={newEmoji}
            onChange={e => setNewEmoji(e.target.value)}
            maxLength={2}
            className="px-4 py-2.5 border rounded-lg text-sm focus:outline-none transition-smooth w-20 text-center"
            style={{ borderColor: 'var(--border)', fontSize: '16px' }}
          />
          <button
            onClick={addTopic}
            className="px-6 py-2.5 rounded-lg font-semibold text-white text-sm transition-smooth press-effect"
            style={{ background: 'var(--coral)' }}>
            Add Topic
          </button>
        </div>
      </div>

      {/* Topics List */}
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {topics.map((topic, index) => (
            <div
              key={topic.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className="p-4 flex items-center justify-between hover:bg-gray-50 transition-smooth cursor-move"
              style={{
                opacity: draggedItem === index ? 0.5 : 1,
                backgroundColor: draggedItem === index ? '#f0f0f0' : 'transparent'
              }}
            >
              <div className="flex items-center gap-3 flex-1">
                <span style={{ color: '#999', cursor: 'grab', fontSize: '18px' }} title="Drag to reorder">⋮⋮</span>
                <span className="text-2xl">{topic.emoji}</span>
                {editingId === topic.id ? (
                  <input
                    type="text"
                    value={editingLabel}
                    onChange={(e) => setEditingLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit(topic.id)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    onBlur={() => saveEdit(topic.id)}
                    autoFocus
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: '1px solid var(--border)',
                      fontSize: '14px'
                    }}
                  />
                ) : (
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                      {topic.label}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--slate)' }}>
                      #{topic.id}
                    </p>
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => togglePrivate(topic.id)}
                  title={topic.isPrivate ? 'Click to make public' : 'Click to make private'}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    color: topic.isPrivate ? '#dc2626' : '#666',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px'
                  }}
                >
                  {topic.isPrivate ? <IconLock /> : <IconUnlock />}
                </button>
                
                <button
                  onClick={() => startEdit(topic.id, topic.label)}
                  title="Edit topic"
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    color: '#666',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <IconPencil />
                </button>
                
                <button
                  onClick={() => removeTopic(topic.id)}
                  title="Delete topic"
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    color: '#dc2626'
                  }}
                >
                  <IconTrash />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-center mt-8" style={{ color: 'var(--slate)' }}>
        {topics.length} topic{topics.length !== 1 ? 's' : ''} total
      </p>
    </div>
  )
}
