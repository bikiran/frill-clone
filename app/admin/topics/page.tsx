'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'


const DEFAULT_TOPICS = [
  { id: 'welcome', label: 'Welcome', emoji: '👋' },
  { id: 'improvement', label: 'Improvement', emoji: '⬆️' },
  { id: 'integrations', label: 'Integrations', emoji: '🔗' },
  { id: 'styling', label: 'Styling', emoji: '🎨' },
  { id: 'misc', label: 'Misc', emoji: '✨' },
  { id: 'bug', label: 'Bug Report', emoji: '🐛' },
]

export default function TopicsPage() {
  const [topics, setTopics] = useState(DEFAULT_TOPICS)
  const [newTopic, setNewTopic] = useState('')
  const [newEmoji, setNewEmoji] = useState('✨')
  const [user, setUser] = useState<any>(null)
  const [checking, setChecking] = useState(true)
  const [topicLimit, setTopicLimit] = useState(3)
  const [topicPermission, setTopicPermission] = useState<'everybody' | 'members'>('everybody')
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      if (!u) {
        // Not signed in - redirect to signin
        router.push('/signin?next=/admin/topics')
        return
      }
      setUser(u)
      setChecking(false)
    })
  }, [router])

  const addTopic = () => {
    if (!newTopic.trim()) return
    setTopics([...topics, {
      id: newTopic.toLowerCase().replace(/\s+/g, '_'),
      label: newTopic,
      emoji: newEmoji,
    }])
    setNewTopic('')
    setNewEmoji('✨')
  }

  const removeTopic = (id: string) => {
    setTopics(topics.filter(t => t.id !== id))
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
        <a href="https://colvy.com/settings/company/upgrade" className="text-sm font-medium hover:underline" style={{ color: '#3b82f6' }}>
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
          {topics.map(topic => (
            <div
              key={topic.id}
              className="p-4 flex items-center justify-between hover:bg-gray-50 transition-smooth"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{topic.emoji}</span>
                <div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                    {topic.label}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--slate)' }}>
                    #{topic.id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => removeTopic(topic.id)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium border transition-smooth press-effect text-red-600"
                style={{ borderColor: '#fca5a5' }}>
                Delete
              </button>
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
