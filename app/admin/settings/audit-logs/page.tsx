'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { authFetch } from '@/lib/auth-fetch'
import EmptyScroll from '@/components/EmptyScroll'
import { resolveCompanyUser } from '@/lib/client-cache'
import { AdminPage, Panel } from '@/components/ui/AdminKit'


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
    case 'team_member_role_changed':
    case 'team_member_permissions_changed':
    case 'team_member_updated':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
    case 'team_member_invited':
    case 'team_member_invite_resent':
    case 'team_member_added':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
    case 'team_member_removed':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
    case 'settings_updated':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
    case 'integration_added':
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="8"/></svg>
    default:
      return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  }
}

// add_activity_logs.sql made created_at a TIMESTAMP with no time zone, so it
// comes back without an offset and new Date() would read it as local time (a
// 2pm change in Sydney listed at 3am). It's UTC. COLVY_V367 fixes the column;
// this keeps the times right until it has run.
const loggedAt = (v: string) => new Date(/Z$|[+-]\d{2}:?\d{2}$/.test(v) ? v : v.replace(' ', 'T') + 'Z')

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<string | null>(null)
  const [filterUser, setFilterUser] = useState<string | null>(null)
  const [users, setUsers] = useState<Map<string, string>>(new Map())
  const [allTypes, setAllTypes] = useState<string[]>([])

  useEffect(() => {
    loadData()
  }, [filterType, filterUser])

  const loadData = async () => {
    try {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      // The workspace you're signed in to (owner or team member; looking it
      // up by owner only left every other admin with an empty log).
      const { companyId } = await resolveCompanyUser()
      if (!companyId) return
      const co = { id: companyId }

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
      // Remember every type seen, so the filter keeps its choices once one is picked.
      setAllTypes(prev => Array.from(new Set([...prev, ...(logsData || []).map((l: any) => l.activity_type).filter(Boolean)])).sort())

      // Load user names
      if (logsData && logsData.length > 0) {
        const userIds = [...new Set(logsData.map((l: any) => l.user_id).filter(Boolean))] as string[]
        const userMap = new Map<string, string>()

        // supabase.auth.admin needs the service-role key, so calling it from the
        // browser always failed and every entry showed "System". Resolve the
        // emails server-side instead.
        try {
          const res = await authFetch('/api/team/names', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userIds }),
          })
          const { names } = await res.json()
          for (const uid of userIds) {
            const n = names?.[uid]
            if (n) userMap.set(uid, n.email || n.name || 'Unknown')
          }
        } catch { /* names are a nicety */ }
        setUsers(prev => new Map([...prev, ...userMap]))
      }
    } catch (error) {
      console.error('Failed to load audit logs:', error)
    } finally {
      setLoading(false)
    }
  }

  const label = (t: string) => { const x = String(t || '').replace(/_/g, ' '); return x.charAt(0).toUpperCase() + x.slice(1) }
  const tone = (t: string) => /deleted|removed/.test(t) ? '#ef4444' : /created|added|invited|published/.test(t) ? '#16a34a' : /team_member/.test(t) ? '#6366f1' : /settings|integration/.test(t) ? '#0ea5e9' : /response|announcement/.test(t) ? '#f59e0b' : '#71717a'
  const dayOf = (d: Date) => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const x = new Date(d); x.setHours(0, 0, 0, 0)
    const diff = Math.round((today.getTime() - x.getTime()) / 86400000)
    return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: today.getFullYear() === d.getFullYear() ? undefined : 'numeric' })
  }
  const groups: { day: string; items: any[] }[] = []
  for (const log of logs) {
    const day = dayOf(loggedAt(log.created_at))
    const g = groups[groups.length - 1]
    if (g && g.day === day) g.items.push(log); else groups.push({ day, items: [log] })
  }
  const people = Array.from(users.entries())

  return (
    <AdminPage width="md" title="Activity log" sub="What your team changed in Colvy, newest first. The last 100 entries are shown.">
      <div className="al-filters">
        <select className="ak-select" value={filterType || ''} onChange={e => setFilterType(e.target.value || null)} aria-label="Activity">
          <option value="">All activity</option>
          {allTypes.map(t => <option key={t} value={t}>{label(t)}</option>)}
        </select>
        {people.length > 0 && (
          <select className="ak-select" value={filterUser || ''} onChange={e => setFilterUser(e.target.value || null)} aria-label="Person">
            <option value="">Everyone</option>
            {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
        {(filterType || filterUser) && <button type="button" className="ak-btn ghost" onClick={() => { setFilterType(null); setFilterUser(null) }}>Clear</button>}
      </div>

      {loading ? (
        <Panel><div className="al-skel">{[0, 1, 2, 3, 4].map(i => <span key={i} />)}</div></Panel>
      ) : logs.length === 0 ? (
        <Panel>
          <EmptyScroll kinds={['note', 'contact', 'task']} title={filterType || filterUser ? 'Nothing matches' : 'No activity yet'}
            line={filterType || filterUser ? 'Try another filter, or clear it.' : 'What your team changes shows up here as they use Colvy.'} />
        </Panel>
      ) : groups.map(g => (
        <Panel key={g.day} title={g.day} flush>
          <ul className="al-list">
            {g.items.map((log: any) => {
              const t = loggedAt(log.created_at)
              return (
                <li key={log.id}>
                  <span className="al-ic" style={{ '--t': tone(log.activity_type) } as React.CSSProperties} aria-hidden>{getActivityIcon(log.activity_type)}</span>
                  <div className="al-t">
                    <p>{log.description}</p>
                    <small>
                      <b>{users.get(log.user_id) || 'System'}</b>
                      <span>{t.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}</span>
                      {log.ip_address && log.ip_address !== 'unknown' && <span>IP {log.ip_address}</span>}
                    </small>
                  </div>
                  <span className="ak-tag al-type">{label(log.activity_type)}</span>
                </li>
              )
            })}
          </ul>
        </Panel>
      ))}
      <style>{AL_CSS}</style>
    </AdminPage>
  )
}

const AL_CSS = `
.al-filters{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.al-filters .ak-select{width:auto;min-width:190px}
.al-list{list-style:none;margin:0;padding:0 8px 8px}
.al-list li{display:flex;align-items:flex-start;gap:12px;padding:11px 12px;border-radius:14px}
.al-list li+li{box-shadow:0 -1px 0 var(--line)}
.al-ic{width:34px;height:34px;flex-shrink:0;border-radius:11px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--t) 12%,var(--card,#fff));color:var(--t)}
.al-ic svg{width:16px;height:16px}
.al-t{flex:1;min-width:0}
.al-t p{margin:2px 0 0;font-size:14px;font-weight:550;line-height:1.45;color:var(--ink);overflow-wrap:anywhere}
.al-t small{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:3px;font-size:12.5px;color:var(--soft)}
.al-t small b{font-weight:600;color:var(--mut)}
.al-type{flex-shrink:0;margin-top:4px}
@media (max-width:640px){.al-type{display:none}}
.al-skel{display:flex;flex-direction:column;gap:10px}
.al-skel span{height:44px;border-radius:12px;background:linear-gradient(90deg,var(--f) 25%,var(--f2) 37%,var(--f) 63%);background-size:400% 100%;animation:alSk 1.2s ease infinite}
@keyframes alSk{0%{background-position:100% 50%}100%{background-position:0 50%}}
`
