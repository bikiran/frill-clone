'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { SkeletonList } from '@/components/Skeleton'

function parseTs(d: string | null | undefined): Date | null {
  if (!d) return null
  let s = String(d).trim()
  if (!s) return null
  s = s.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) s += 'Z'
  const p = new Date(s)
  return isNaN(p.getTime()) ? null : p
}
const fmt = (d: string | null | undefined) => {
  const p = parseTs(d)
  if (!p) return ''
  const days = Math.round((Date.now() - p.getTime()) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return p.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

/**
 * Tasks across every conversation.
 *
 * Tasks previously only existed inside a conversation, so there was no way to
 * ask "what do I still have to do?" without opening threads one by one. This
 * gathers them into one list.
 */
export default function TasksPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [tasks, setTasks] = useState<any[]>([])
  const [convs, setConvs] = useState<Record<string, any>>({})
  const [team, setTeam] = useState<any[]>([])
  const [scope, setScope] = useState<'mine' | 'all' | 'unassigned'>('mine')
  const [showDone, setShowDone] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        let cid: string | null = null
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) setUserId(session.user.id)

        if (typeof window !== 'undefined') {
          const host = window.location.hostname
          if (host.endsWith('.colvy.com') && host !== 'colvy.com') {
            const slug = host.replace('.colvy.com', '')
            const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle()
            if (co) cid = co.id
          }
        }
        if (!cid && session?.user) {
          const { data: own } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
          if (own?.id) cid = own.id
          else {
            const { data: mem } = await (supabase as any).from('team_members').select('company_id').eq('user_id', session.user.id).limit(1)
            if (mem?.length) cid = mem[0].company_id
          }
        }
        if (!cid) { setLoading(false); return }
        setCompanyId(cid)
        await load(cid)

        const members: any[] = []
        const { data: co } = await (supabase as any).from('companies')
          .select('owner_id, name').eq('id', cid).maybeSingle()
        if (co?.owner_id) {
          members.push({ id: co.owner_id, user_id: co.owner_id, name: co.name ? `${co.name} (Owner)` : 'Owner' })
        }
        const { data: tm } = await (supabase as any).from('team_members')
          .select('id, user_id, name, display_name, email').eq('company_id', cid)
        for (const m of (tm || [])) {
          if (members.some(x => x.user_id === m.user_id)) continue
          members.push({ id: m.id, user_id: m.user_id, name: m.name || m.display_name || (m.email ? m.email.split('@')[0] : 'Team member') })
        }
        setTeam(members)
      } finally { setLoading(false) }
    })()
  }, [])

  const load = async (cid: string) => {
    const { data } = await (supabase as any).from('conversation_tasks')
      .select('*').eq('company_id', cid)
      .order('done', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(500)
    setTasks(data || [])

    const convIds = Array.from(new Set((data || []).map((t: any) => t.conversation_id).filter(Boolean)))
    if (convIds.length) {
      const m: Record<string, any> = {}
      for (let i = 0; i < convIds.length; i += 100) {
        const { data: cs } = await (supabase as any).from('conversations')
          .select('id, subject, contact_name, channel').in('id', convIds.slice(i, i + 100))
        for (const c of (cs || [])) m[c.id] = c
      }
      setConvs(m)
    }
  }

  const toggle = async (t: any) => {
    const next = !t.done
    setTasks(cur => cur.map(x => x.id === t.id ? { ...x, done: next } : x))
    try {
      await (supabase as any).from('conversation_tasks').update({
        done: next,
        completed_at: next ? new Date().toISOString() : null,
      }).eq('id', t.id)
    } catch {
      // Put it back if the write failed, rather than showing a state the
      // database doesn't agree with.
      setTasks(cur => cur.map(x => x.id === t.id ? { ...x, done: !next } : x))
    }
  }

  const myMemberIds = useMemo(
    () => team.filter(m => m.user_id === userId).map(m => m.id), [team, userId])

  const visible = useMemo(() => tasks.filter(t => {
    if (!showDone && t.done) return false
    if (scope === 'mine') {
      return t.assigned_to_id === userId
        || myMemberIds.includes(t.assigned_to_id)
        || (Array.isArray(t.mentions) && t.mentions.some((m: any) => myMemberIds.includes(m.id)))
    }
    if (scope === 'unassigned') return !t.assigned_to_id && !t.assigned_to
    return true
  }), [tasks, scope, showDone, userId, myMemberIds])

  const openCount = tasks.filter(t => !t.done).length

  const card: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 12, background: '#fff', padding: 14, marginBottom: 8 }

  if (loading) return <SkeletonList rows={6} />

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Tasks</h1>
        <p style={{ color: 'var(--slate)', fontSize: 13, margin: '4px 0 0' }}>
          {openCount} open across all conversations
        </p>
      </div>

      {/* Scope */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', paddingBottom: 2 }}>
        {([['mine', 'Mine'], ['all', 'Everyone'], ['unassigned', 'Unassigned']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setScope(k)}
            style={{
              padding: '7px 14px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              whiteSpace: 'nowrap', flexShrink: 0,
              border: '1px solid ' + (scope === k ? 'var(--coral)' : 'var(--border)'),
              background: scope === k ? 'var(--peach)' : '#fff',
              color: scope === k ? 'var(--coral)' : 'var(--slate)',
            }}>
            {label}
          </button>
        ))}
        <button onClick={() => setShowDone(v => !v)}
          style={{
            padding: '7px 14px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 'auto',
            border: '1px solid var(--border)', background: showDone ? 'var(--canvas)' : '#fff',
            color: 'var(--slate)',
          }}>
          {showDone ? 'Hide done' : 'Show done'}
        </button>
      </div>

      {visible.length === 0 && (
        <div style={{ ...card, textAlign: 'center', padding: 34, color: 'var(--slate)', fontSize: 13.5 }}>
          {scope === 'mine'
            ? 'Nothing assigned to you.'
            : scope === 'unassigned' ? 'No unassigned tasks.' : 'No tasks yet.'}
        </div>
      )}

      {visible.map(t => {
        const conv = convs[t.conversation_id]
        return (
          <div key={t.id} style={card}>
            <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
              <input type="checkbox" checked={!!t.done} onChange={() => toggle(t)}
                style={{ marginTop: 3, width: 17, height: 17, flexShrink: 0, cursor: 'pointer' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  margin: 0, fontSize: 14, lineHeight: 1.45, color: 'var(--ink)',
                  textDecoration: t.done ? 'line-through' : 'none', opacity: t.done ? 0.55 : 1,
                }}>
                  {t.text}
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                  <select
                    value={t.assigned_to_id || ''}
                    onChange={async (e) => {
                      const m = team.find(x => x.id === e.target.value)
                      setTasks(cur => cur.map(x => x.id === t.id ? { ...x, assigned_to_id: e.target.value || null, assigned_to: m?.name || null } : x))
                      try {
                        await (supabase as any).from('conversation_tasks')
                          .update({ assigned_to_id: e.target.value || null, assigned_to: m?.name || null })
                          .eq('id', t.id)
                        // Let the newly assigned person know.
                        if (m?.user_id && m.user_id !== userId) {
                          await (supabase as any).from('notifications').insert({
                            company_id: companyId, user_id: m.user_id, type: 'task_assigned',
                            title: 'You were assigned a task', body: t.text?.slice(0, 160),
                            link: `/admin/inbox?conversation=${t.conversation_id}`, is_read: false,
                          })
                        }
                      } catch { /* optimistic update stands */ }
                    }}
                    style={{ fontSize: 11.5, padding: '3px 8px', borderRadius: 20, border: '1px solid var(--border)', background: t.assigned_to ? 'var(--peach)' : '#fff', color: t.assigned_to ? 'var(--coral)' : 'var(--slate)', fontWeight: 700, cursor: 'pointer' }}>
                    <option value="">Unassigned</option>
                    {team.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  {conv && (
                    <button onClick={() => router.push(`/admin/inbox?conversation=${t.conversation_id}`)}
                      style={{ border: 'none', background: 'none', padding: 0, fontSize: 11.5, color: 'var(--slate)', cursor: 'pointer', textDecoration: 'underline' }}>
                      {conv.contact_name || conv.subject || 'Conversation'}
                    </button>
                  )}
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{fmt(t.created_at)}</span>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
