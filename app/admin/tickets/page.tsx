'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { SkeletonList } from '@/components/Skeleton'

const STATUS_COLORS: Record<string, { bg: string; c: string }> = {
  open: { bg: '#dbeafe', c: '#2563eb' },
  in_progress: { bg: '#fef3c7', c: '#d97706' },
  resolved: { bg: '#dcfce7', c: '#059669' },
  closed: { bg: '#f3f4f6', c: '#6b7280' },
}

export default function TicketsList() {
  const router = useRouter()
  const [tickets, setTickets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { router.push('/signin'); return }
      const { data: co } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
      let cid = co?.id
      if (!cid) {
        const { data: tm } = await (supabase as any).from('team_members').select('company_id').eq('user_id', session.user.id).maybeSingle()
        cid = tm?.company_id
      }
      if (cid) {
        const res = await fetch(`/api/tickets?companyId=${cid}`)
        const data = await res.json()
        setTickets(data.tickets || [])
      }
      setLoading(false)
    })()
  }, [])

  const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter)

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 24px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: '0 0 6px' }}>Support Tickets</h1>
      <p style={{ fontSize: 14, color: 'var(--slate)', margin: '0 0 20px' }}>Tickets raised from conversations.</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {['all', 'open', 'in_progress', 'resolved', 'closed'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{ padding: '7px 14px', borderRadius: 20, border: filter === s ? '2px solid var(--coral)' : '1px solid var(--border)', background: filter === s ? 'var(--peach)' : '#fff', color: filter === s ? 'var(--coral)' : 'var(--slate)', fontSize: 13, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading ? <SkeletonList rows={6} /> : filtered.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--slate)', padding: 40 }}>No tickets yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(t => {
            const sc = STATUS_COLORS[t.status] || STATUS_COLORS.open
            return (
              <button key={t.id} onClick={() => router.push(`/admin/tickets/${t.id}`)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', border: '1px solid var(--border)', borderRadius: 12, background: '#fff', cursor: 'pointer', textAlign: 'left' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--coral)' }}>{t.ticket_number}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{t.subject}</span>
                  </div>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--slate)' }}>{new Date(t.created_at).toLocaleDateString()}</p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: sc.bg, color: sc.c, textTransform: 'capitalize' }}>{t.status.replace('_', ' ')}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
