'use client'

import { useState } from 'react'
import { useToast } from '@/components/ToastProvider'

interface AnnouncementSchedulerProps {
  title: string
  content: string
  onSchedule: (scheduledAt: Date, timezone: string) => Promise<void>
  onPublishNow: () => Promise<void>
}

export function AnnouncementScheduler({
  title,
  content,
  onSchedule,
  onPublishNow,
}: AnnouncementSchedulerProps) {
  const { addToast } = useToast()
  const [showScheduler, setShowScheduler] = useState(false)
  const [scheduledDate, setScheduledDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  )
  const [scheduledTime, setScheduledTime] = useState<string>('09:00')
  const [timezone, setTimezone] = useState<string>(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  )
  const [loading, setLoading] = useState(false)

  const timezones = [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Australia/Sydney',
  ]

  const handleSchedule = async () => {
    if (!scheduledDate || !scheduledTime) {
      addToast('Please select date and time', 'warning')
      return
    }

    setLoading(true)
    try {
      const dateTime = new Date(`${scheduledDate}T${scheduledTime}`)
      await onSchedule(dateTime, timezone)
      addToast('Announcement scheduled', 'success')
      setShowScheduler(false)
    } catch (err) {
      console.error('Error scheduling:', err)
      addToast('Failed to schedule', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handlePublishNow = async () => {
    setLoading(true)
    try {
      await onPublishNow()
      addToast('Announcement published', 'success')
    } catch (err) {
      console.error('Error publishing:', err)
      addToast('Failed to publish', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handlePublishNow}
          disabled={loading}
          className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-smooth cursor-pointer disabled:opacity-50"
          style={{ background: 'var(--coral)' }}>
          {loading ? 'Publishing...' : 'Publish Now'}
        </button>
        <button
          onClick={() => setShowScheduler(!showScheduler)}
          className="flex-1 px-4 py-2 rounded-lg border text-sm font-medium transition-smooth cursor-pointer hover:bg-gray-50"
          style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
          Schedule for Later
        </button>
      </div>

      {/* Scheduler Panel */}
      {showScheduler && (
        <div
          className="p-4 rounded-lg border space-y-4"
          style={{ borderColor: 'var(--border)', background: 'var(--canvas)' }}>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--ink)' }}>
              Date
            </label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none text-sm"
              style={{ borderColor: 'var(--border)' }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--ink)' }}>
              Time
            </label>
            <input
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none text-sm"
              style={{ borderColor: 'var(--border)' }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--ink)' }}>
              Timezone
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none text-sm"
              style={{ borderColor: 'var(--border)' }}>
              {timezones.map(tz => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>

          {/* Scheduled Time Display */}
          <div
            className="p-3 rounded text-sm"
            style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
            Will be published at:{' '}
            {new Date(`${scheduledDate}T${scheduledTime}`).toLocaleString()}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowScheduler(false)}
              className="flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-smooth cursor-pointer hover:bg-gray-100"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
              Cancel
            </button>
            <button
              onClick={handleSchedule}
              disabled={loading}
              className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-smooth cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--coral)' }}>
              {loading ? 'Scheduling...' : 'Schedule'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
