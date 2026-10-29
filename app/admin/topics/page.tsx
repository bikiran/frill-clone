'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { AdminPage, Panel } from '@/components/ui/AdminKit'
import { TrashIcon } from '@/components/Icons'

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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const slug = searchParams.get('slug') || ''

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

  const saveEdit = (id: string) => {
    if (!editLabel.trim()) { setEditingId(null); return }
    setTopics(topics.map(t => t.id === id ? { ...t, label: editLabel.trim() } : t))
    setEditingId(null); setEditLabel('')
  }

  const reorder = (fromId: string, toId: string) => {
    if (fromId === toId) return
    const arr = [...topics]
    const from = arr.findIndex(t => t.id === fromId)
    const to = arr.findIndex(t => t.id === toId)
    if (from < 0 || to < 0) return
    const [moved] = arr.splice(from, 1)
    arr.splice(to, 0, moved)
    setTopics(arr)
  }

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p style={{ color: 'var(--slate)' }}>Checking permissions…</p>
      </div>
    )
  }

  return (
    <AdminPage width="sm" title="Topics" sub="Topics are tags on ideas, so people can filter the board by what they care about."
      back={{ href: '/admin/ideas', label: 'Ideas' }}>
      <p className="ak-note info">
        <span aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2 }}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
        </span>
        <span><b>Private topics are a paid feature.</b> They’re part of the Privacy add-on and turn into normal topics when your trial ends, unless you’re on Growth or have the add-on. <a href="/admin/billing">Compare plans</a></span>
      </p>

      <div className="ak-grid2" style={{ marginBottom: 14 }}>
        <Panel title="Topic limit" sub="The most topics one idea can have. 0 means no limit.">
          <div className="tp-limit">
            <input className="ak-field" type="number" min={0} value={topicLimit} aria-label="Topics per idea"
              onChange={e => setTopicLimit(Math.max(0, parseInt(e.target.value) || 0))} />
            <span>topics per idea</span>
          </div>
        </Panel>
        <Panel title="Who can add topics" sub="Who may tag an idea with a topic.">
          <div className="ak-seg" role="radiogroup" aria-label="Who can add topics">
            <button type="button" role="radio" aria-checked={topicPermission === 'everybody'} className={topicPermission === 'everybody' ? 'on' : ''} onClick={() => setTopicPermission('everybody')}>Everybody</button>
            <button type="button" role="radio" aria-checked={topicPermission === 'members'} className={topicPermission === 'members' ? 'on' : ''} onClick={() => setTopicPermission('members')}>Your team only</button>
          </div>
        </Panel>
      </div>

      <Panel title="Add a topic">
        <div className="tp-add">
          <input className="ak-field tp-emoji" type="text" value={newEmoji} onChange={e => setNewEmoji(e.target.value)} maxLength={2} aria-label="Emoji" />
          <input className="ak-field" type="text" value={newTopic} onChange={e => setNewTopic(e.target.value)} placeholder="e.g. Plants, Delivery, Website"
            aria-label="Topic name" onKeyDown={e => e.key === 'Enter' && addTopic()} />
          <button type="button" className="ak-btn go" onClick={addTopic} disabled={!newTopic.trim()}>Add topic</button>
        </div>
      </Panel>

      <Panel title="Your topics" sub={`${topics.length} topic${topics.length !== 1 ? 's' : ''} · drag to reorder`} flush>
        <div className="ak-list" style={{ padding: '0 8px 8px' }}>
          {topics.map(topic => (
            <div key={topic.id} className="ak-row tp-row" draggable
              onDragStart={() => setDraggedId(topic.id)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => { if (draggedId) reorder(draggedId, topic.id); setDraggedId(null) }}
              style={{ opacity: draggedId === topic.id ? 0.5 : 1 }}>
              <span className="tp-grip" title="Drag to reorder" aria-hidden>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
              </span>
              <span className="tp-emo" aria-hidden>{topic.emoji}</span>
              {editingId === topic.id ? (
                <>
                  <input className="ak-field sm" value={editLabel} onChange={e => setEditLabel(e.target.value)} autoFocus aria-label="Topic name"
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(topic.id); if (e.key === 'Escape') setEditingId(null) }} />
                  <button type="button" className="ak-btn go sm" onClick={() => saveEdit(topic.id)}>Save</button>
                  <button type="button" className="ak-btn ghost sm" onClick={() => setEditingId(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <span className="ak-row-t"><b>{topic.label}</b><small>#{topic.id}</small></span>
                  <button type="button" className="ak-icon-btn" onClick={() => { setEditingId(topic.id); setEditLabel(topic.label) }} title="Rename" aria-label={`Rename ${topic.label}`}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                  </button>
                  <button type="button" className="ak-icon-btn danger" onClick={() => removeTopic(topic.id)} title="Delete" aria-label={`Delete ${topic.label}`}>
                    <TrashIcon size={15} color="currentColor" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </Panel>
      <style>{TP_CSS}</style>
    </AdminPage>
  )
}

const TP_CSS = `
.tp-limit{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--mut)}
.tp-limit .ak-field{width:90px}
.tp-add{display:flex;gap:8px}
.ak .tp-emoji{width:64px;flex-shrink:0;text-align:center;font-size:20px;padding:0}
@media (max-width:560px){.tp-add{flex-wrap:wrap}.tp-add .ak-btn{width:100%}.tp-add .ak-field:not(.tp-emoji){flex:1;min-width:0}}
.tp-row{cursor:grab}
.tp-grip{color:var(--soft);display:inline-flex}
.tp-emo{width:36px;height:36px;flex-shrink:0;border-radius:12px;background:var(--f);display:inline-flex;align-items:center;justify-content:center;font-size:18px}
`
