'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

const ACTIVITY_ICONS: Record<string, string> = {
  form_created: '📝',
  form_updated: '✏️',
  form_deleted: '🗑️',
  form_published: '🚀',
  response_received: '📨',
  idea_created: '💡',
  idea_updated: '💭',
  announcement_created: '📢',
  announcement_deleted: '❌',
  team_member_invited: '👤',
  team_member_removed: '👋',
  settings_updated: '⚙️',
  integration_added: '🔗',
}

// SVG Icons for activity types
function getActivityIcon(type: string) {
  switch(type) {
    case 'form_created':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
    case 'form_updated':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
    case 'form_deleted':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
    case 'form_published':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
    case 'response_received':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    case 'idea_created':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
    case 'idea_updated':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
    case 'announcement_created':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    case 'announcement_deleted':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    case 'team_member_invited':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
    case 'team_member_removed':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
    case 'settings_updated':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m0 5.08l-4.24 4.24M1 12h6m6 0h6m-5.78-5.78l4.24-4.24m0 5.08l4.24 4.24"/></svg>
    case 'integration_added':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="8"/></svg>
    default:
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  }
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [company, setCompany] = useState<any>(null)
  const [filterType, setFilterType] = useState<string | null>(null)
  const [filterUser, setFilterUser] = useState<string | null>(null)
  const [users, setUsers] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    loadData()
  }, [filterType, filterUser])

  const loadData = async () => {
    try {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      // Get company
      const { data: co } = await (supabase as any)
        .from('companies')
        .select('*')
        .eq('owner_id', session.user.id)
        .maybeSingle()

      if (!co) return
      setCompany(co)

      // Build query
      let query = (supabase as any)
        .from('activity_logs')
        .select('*')
        .eq('company_id', co.id)
        .order('created_at', { ascending: false })
        .limit(100)

      if (filterType) query = query.eq('activity_type', filterType)
      if (filterUser) query = query.eq('user_id', filterUser)

      const { data: logsData } = await query

      setLogs(logsData || [])

      // Load user names
      if (logsData && logsData.length > 0) {
        const userIds = [...new Set(logsData.map((l: any) => l.user_id).filter(Boolean))]
        const userMap = new Map<string, string>()

        for (const uid of userIds) {
          const { data: userData } = await supabase.auth.admin.getUserById(uid)
          if (userData.user) {
            userMap.set(uid, userData.user.email || 'Unknown')
          }
        }
        setUsers(userMap)
      }
    } catch (error) {
      console.error('Failed to load audit logs:', error)
    } finally {
      setLoading(false)
    }
  }

  const activityTypes = [...new Set(logs.map((l: any) => l.activity_type))]

  return (
    <div className="min-h-screen p-8" style={{ background: 'var(--canvas)' }}>
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <Link href="/admin/settings" className="text-sm font-medium hover:opacity-70" style={{ color: 'var(--coral)' }}>
            ← Back to settings
          </Link>
          <h1 className="text-3xl font-bold mt-3 mb-2" style={{ color: 'var(--ink)' }}>Audit Logs</h1>
          <p style={{ color: 'var(--slate)' }}>Track all team activity and changes</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border p-4 mb-8" style={{ borderColor: 'var(--border)' }}>
          <div className="flex flex-wrap gap-3">
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: 6 }}>Activity Type</label>
              <select
                value={filterType || ''}
                onChange={e => setFilterType(e.target.value || null)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  fontSize: 13,
                  cursor: 'pointer',
                  minWidth: 150,
                }}>
                <option value="">All activities</option>
                {activityTypes.map(t => (
                  <option key={t} value={t}>{ACTIVITY_ICONS[t] || '•'} {t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            {filterType && (
              <button
                onClick={() => setFilterType(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'white',
                  fontSize: 13,
                  cursor: 'pointer',
                  alignSelf: 'flex-end',
                  marginTop: 20,
                  fontWeight: 600,
                }}>
                Clear filter
              </button>
            )}
          </div>
        </div>

        {/* Logs */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--slate)' }}>Loading...</div>
        ) : logs.length === 0 ? (
          <div className="bg-white rounded-2xl border p-8 text-center" style={{ borderColor: 'var(--border)' }}>
            <p style={{ color: 'var(--slate)', marginBottom: 16 }}>No activity logs yet</p>
            <p style={{ fontSize: 12, color: 'var(--slate)' }}>Activity logs appear here as your team uses the platform</p>
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log: any) => (
              <div
                key={log.id}
                className="bg-white rounded-2xl border p-4 hover:shadow-md transition-all"
                style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-start gap-3">
                  <div style={{ color: 'var(--slate)' }}>
                    {getActivityIcon(log.activity_type)}
                  </div>
                  <div className="flex-1">
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
                      {log.description}
                    </p>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, color: 'var(--slate)' }}>
                        {users.get(log.user_id) || 'System'}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--slate)' }}>
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          background: 'var(--canvas)',
                          padding: '2px 8px',
                          borderRadius: 4,
                          color: 'var(--slate)',
                          fontWeight: 600,
                        }}>
                        {log.activity_type.replace(/_/g, ' ')}
                      </span>
                    </div>
                    {log.ip_address && log.ip_address !== 'unknown' && (
                      <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>
                        IP: {log.ip_address}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
