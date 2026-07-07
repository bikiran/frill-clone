'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Terminology sections matching Frill's "Languages" page structure
const SECTIONS = [
  {
    id: 'main_menu',
    label: 'Main menu',
    desc: 'Labels shown in the public navigation',
    keys: ['ideas_label', 'roadmap_label', 'announcements_label', 'help_label'],
    defaults: { ideas_label: 'Ideas', roadmap_label: 'Roadmap', announcements_label: 'Announcements', help_label: 'Help' },
  },
  {
    id: 'ideas',
    label: 'Ideas',
    desc: 'Text on the ideas board',
    keys: ['submit_idea', 'vote_label', 'comment_label', 'subscribe_label', 'idea_label', 'ideas_plural'],
    defaults: { submit_idea: 'Submit Idea', vote_label: 'Vote', comment_label: 'Comment', subscribe_label: 'Subscribe', idea_label: 'Idea', ideas_plural: 'Ideas' },
  },
  {
    id: 'roadmap',
    label: 'Roadmap',
    desc: 'Column headings and roadmap labels',
    keys: ['roadmap_label', 'planned_label', 'in_progress_label', 'shipped_label'],
    defaults: { roadmap_label: 'Roadmap', planned_label: 'Planned', in_progress_label: 'In Development', shipped_label: 'Shipped' },
  },
  {
    id: 'statuses',
    label: 'Statuses / Topics',
    desc: 'Status names and topic labels',
    keys: ['under_consideration', 'planned_label', 'in_progress_label', 'shipped_label', 'rejected_label', 'no_status_label'],
    defaults: { under_consideration: 'Under Consideration', planned_label: 'Planned', in_progress_label: 'In Development', shipped_label: 'Shipped', rejected_label: 'Rejected', no_status_label: 'No Status' },
  },
  {
    id: 'comments',
    label: 'Comments',
    desc: 'Comment section text',
    keys: ['comment_label', 'add_comment', 'private_note', 'reply_label'],
    defaults: { comment_label: 'Comment', add_comment: 'Add comment', private_note: 'Private note', reply_label: 'Reply' },
  },
  {
    id: 'common',
    label: 'Common elements',
    desc: 'Shared UI labels',
    keys: ['save_label', 'cancel_label', 'delete_label', 'edit_label', 'share_label', 'search_label'],
    defaults: { save_label: 'Save', cancel_label: 'Cancel', delete_label: 'Delete', edit_label: 'Edit', share_label: 'Share', search_label: 'Search' },
  },
  {
    id: 'user_settings',
    label: 'User settings',
    desc: 'User account labels',
    keys: ['sign_in_label', 'sign_up_label', 'sign_out_label', 'profile_label', 'get_started_label'],
    defaults: { sign_in_label: 'Sign in', sign_up_label: 'Sign up', sign_out_label: 'Sign out', profile_label: 'Profile', get_started_label: 'Get started' },
  },
  {
    id: 'notifications',
    label: 'User notifications',
    desc: 'Notification messages',
    keys: ['notifications_label', 'mark_all_read', 'no_notifications'],
    defaults: { notifications_label: 'Notifications', mark_all_read: 'Mark all as read', no_notifications: 'No notifications' },
  },
  {
    id: 'forms',
    label: 'Forms',
    desc: 'Form field and submission text',
    keys: ['submit_label', 'next_label', 'required_label', 'thank_you_message'],
    defaults: { submit_label: 'Submit', next_label: 'Next', required_label: 'Required', thank_you_message: 'Thanks for your feedback!' },
  },
  {
    id: 'announcements',
    label: 'Announcements',
    desc: 'Updates / changelog labels',
    keys: ['announcements_label', 'updates_label', 'changelog_label', 'read_more'],
    defaults: { announcements_label: 'Announcements', updates_label: 'Updates', changelog_label: 'Changelog', read_more: 'Read more' },
  },
]

type TermMap = Record<string, string>

export default function TerminologyPage() {
  const [values, setValues] = useState<TermMap>({})
  const [saved, setSaved] = useState<TermMap>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedSection, setSelectedSection] = useState(SECTIONS[0].id)
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) return

        // Load from terminology table keyed by user's company
        const { data: rows } = await supabase.from('terminology').select('*')
        if (rows && rows.length > 0) {
          const map: TermMap = {}
          rows.forEach((r: any) => { map[r.key] = r.label })
          setValues(map)
          setSaved(map)
        } else {
          // Load defaults
          const defaults: TermMap = {}
          SECTIONS.forEach(s => Object.assign(defaults, s.defaults))
          setValues(defaults)
          setSaved(defaults)
        }
      } catch {}
      setLoading(false)
    }
    load()
  }, [])

  const section = SECTIONS.find(s => s.id === selectedSection)!

  const handleChange = (key: string, val: string) => {
    setValues(v => ({ ...v, [key]: val }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const upserts = section.keys.map(key => ({
        key,
        label: values[key] ?? section.defaults[key as keyof typeof section.defaults] ?? key,
        category: section.id,
        description: section.desc,
      }))
      await supabase.from('terminology').upsert(upserts, { onConflict: 'key' })
      setSaved({ ...saved, ...Object.fromEntries(section.keys.map(k => [k, values[k]])) })
      setSaveMsg('Saved!')
      setTimeout(() => setSaveMsg(''), 2500)
    } catch { setSaveMsg('Save failed') }
    setSaving(false)
  }

  const hasChanges = section.keys.some(k => values[k] !== saved[k])

  if (loading) return <div style={{ padding: 32, color: 'var(--slate)' }}>Loading...</div>

  return (
    <div style={{ display: 'flex', minHeight: '100%', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      {/* Left sidebar */}
      <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid var(--border)', padding: '20px 0', background: '#fafafa' }}>
        {SECTIONS.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSelectedSection(s.id)}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '8px 16px', background: selectedSection === s.id ? 'var(--peach)' : 'none',
              border: 'none', borderLeft: selectedSection === s.id ? '3px solid var(--coral)' : '3px solid transparent',
              fontSize: 13, fontWeight: selectedSection === s.id ? 700 : 500,
              color: selectedSection === s.id ? 'var(--coral)' : 'var(--slate)', cursor: 'pointer',
              transition: 'all 0.12s',
            }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: '32px 40px', maxWidth: 780 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 6px 0', color: 'var(--ink)' }}>
          {section.label}
        </h1>
        <p style={{ color: 'var(--slate)', fontSize: 14, margin: '0 0 28px 0' }}>{section.desc}</p>

        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
          {section.keys.map((key, idx) => {
            const label = key.replace(/_label$|_plural$/, '').replace(/_/g, ' ')
            const current = values[key] ?? (section.defaults as any)[key] ?? ''
            const original = (section.defaults as any)[key] ?? ''
            const changed = saved[key] !== undefined ? current !== saved[key] : current !== original
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', borderBottom: idx < section.keys.length - 1 ? '1px solid var(--border)' : 'none', background: changed ? 'var(--peach)' : '#fff', transition: 'background 0.15s' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 2px 0', fontSize: 13, fontWeight: 600, color: 'var(--ink)', textTransform: 'capitalize' }}>{label}</p>
                  <p style={{ margin: 0, fontSize: 11, color: '#aaa', fontFamily: 'monospace' }}>{key}</p>
                </div>
                <input
                  type="text"
                  value={current}
                  onChange={e => handleChange(key, e.target.value)}
                  placeholder={original}
                  style={{
                    width: 260, padding: '8px 12px', borderRadius: 8,
                    border: `1px solid ${changed ? 'var(--coral)' : 'var(--border)'}`,
                    fontSize: 13, outline: 'none', color: 'var(--ink)', background: '#fff',
                  }}
                />
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, justifyContent: 'flex-end' }}>
          {saveMsg && <span style={{ fontSize: 13, color: saveMsg.includes('fail') ? '#dc2626' : '#059669' }}>{saveMsg}</span>}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            style={{
              padding: '10px 24px', borderRadius: 10, background: hasChanges ? 'var(--coral)' : '#e5e7eb',
              color: hasChanges ? '#fff' : '#9ca3af', border: 'none', fontSize: 14, fontWeight: 700,
              cursor: hasChanges ? 'pointer' : 'default', transition: 'all 0.15s',
            }}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
