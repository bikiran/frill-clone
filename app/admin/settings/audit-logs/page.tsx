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
                  <span style={{ fontSize: 24 }}>{ACTIVITY_ICONS[log.activity_type] || '📋'}</span>
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
