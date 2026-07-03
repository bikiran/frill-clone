'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ToastProvider'

const STATUS_OPTIONS = [
  { value: 'new', label: 'Under consideration' },
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In Development' },
  { value: 'shipped', label: 'Shipped' },
]

const DEFAULT_TOPICS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'improvement', label: 'Improvement' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'styling', label: 'Styling' },
  { id: 'misc', label: 'Misc' },
  { id: 'bug', label: 'Bug Report' },
]

interface BulkActionToolbarProps {
  selectedCount: number
  selectedIds: string[]
  onAction: (action: string, data?: any) => void
  onClose: () => void
}

export function BulkActionToolbar({
  selectedCount,
  selectedIds,
  onAction,
  onClose,
}: BulkActionToolbarProps) {
  const { addToast } = useToast()
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [showTopicMenu, setShowTopicMenu] = useState(false)

  const handleStatusChange = async (status: string) => {
    try {
      await supabase
        .from('ideas')
        .update({ status })
        .in('id', selectedIds)
      
      addToast(`Status changed for ${selectedCount} ideas`, 'success')
      onAction('statusChanged', { status })
      setShowStatusMenu(false)
    } catch (err) {
      console.error('Error updating status:', err)
      addToast('Failed to update status', 'error')
    }
  }

  const handleAddTopic = async (topicId: string) => {
    try {
      // Fetch current ideas with their topics
      const { data: ideas } = await supabase
        .from('ideas')
        .select('id, topics')
        .in('id', selectedIds)

      // Update each idea to include the new topic
      const updates = ideas?.map(idea => ({
        id: idea.id,
        topics: [...(idea.topics || []), topicId].slice(0, 3), // Max 3 topics
      })) || []

      for (const update of updates) {
        await supabase
          .from('ideas')
          .update({ topics: update.topics })
          .eq('id', update.id)
      }

      addToast(`Topic added to ${selectedCount} ideas`, 'success')
      onAction('topicAdded', { topic: topicId })
      setShowTopicMenu(false)
    } catch (err) {
      console.error('Error adding topic:', err)
      addToast('Failed to add topic', 'error')
    }
  }

  const handleArchive = async () => {
    try {
      await supabase
        .from('ideas')
        .update({ is_archived: true })
        .in('id', selectedIds)
      
      addToast(`${selectedCount} ideas archived`, 'success')
      onAction('archived')
    } catch (err) {
      console.error('Error archiving:', err)
      addToast('Failed to archive', 'error')
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Delete ${selectedCount} ideas? This cannot be undone.`)) return

    try {
      await supabase
        .from('ideas')
        .delete()
        .in('id', selectedIds)
      
      addToast(`${selectedCount} ideas deleted`, 'success')
      onAction('deleted')
    } catch (err) {
      console.error('Error deleting:', err)
      addToast('Failed to delete', 'error')
    }
  }

  const handleExport = async () => {
    try {
      const { data: ideas } = await supabase
        .from('ideas')
        .select('*')
        .in('id', selectedIds)

      if (!ideas) return

      const csv = [
        ['Title', 'Description', 'Status', 'Votes', 'Created At'],
        ...ideas.map(idea => [
          `"${idea.title}"`,
          `"${idea.description || ''}"`,
          idea.status,
          idea.votes,
          new Date(idea.created_at).toLocaleDateString(),
        ]),
      ]
        .map(row => row.join(','))
        .join('\n')

      const blob = new Blob([csv], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ideas-export-${Date.now()}.csv`
      a.click()
      window.URL.revokeObjectURL(url)

      addToast(`${selectedCount} ideas exported`, 'success')
      onAction('exported')
    } catch (err) {
      console.error('Error exporting:', err)
      addToast('Failed to export', 'error')
    }
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4 z-40"
      style={{ borderColor: 'var(--border)' }}>
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Selection Info */}
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {selectedCount} selected
          </span>

          {/* Status Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowStatusMenu(!showStatusMenu)}
              className="px-3 py-1 text-sm rounded border transition-smooth cursor-pointer hover:bg-gray-50"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
              Change Status
            </button>
            {showStatusMenu && (
              <div
                className="absolute bottom-full mb-2 bg-white rounded-lg shadow-lg border z-50 min-w-max"
                style={{ borderColor: 'var(--border)' }}>
                {STATUS_OPTIONS.map(status => (
                  <button
                    key={status.value}
                    onClick={() => handleStatusChange(status.value)}
                    className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                    style={{ color: 'var(--ink)' }}>
                    {status.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Topic Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowTopicMenu(!showTopicMenu)}
              className="px-3 py-1 text-sm rounded border transition-smooth cursor-pointer hover:bg-gray-50"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
              Add Topic
            </button>
            {showTopicMenu && (
              <div
                className="absolute bottom-full mb-2 bg-white rounded-lg shadow-lg border z-50 min-w-max"
                style={{ borderColor: 'var(--border)' }}>
                {DEFAULT_TOPICS.map(topic => (
                  <button
                    key={topic.id}
                    onClick={() => handleAddTopic(topic.id)}
                    className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                    style={{ color: 'var(--ink)' }}>
                    {topic.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Archive Button */}
          <button
            onClick={handleArchive}
            className="px-3 py-1 text-sm rounded border transition-smooth cursor-pointer hover:bg-gray-50"
            style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
            Archive
          </button>

          {/* Export Button */}
          <button
            onClick={handleExport}
            className="px-3 py-1 text-sm rounded border transition-smooth cursor-pointer hover:bg-gray-50"
            style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
            Export CSV
          </button>

          {/* Delete Button */}
          <button
            onClick={handleDelete}
            className="px-3 py-1 text-sm rounded border transition-smooth cursor-pointer hover:bg-red-50 text-red-600"
            style={{ borderColor: '#fca5a5' }}>
            Delete
          </button>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg border text-sm font-medium transition-smooth cursor-pointer hover:bg-gray-50"
          style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
          Done
        </button>
      </div>
    </div>
  )
}
