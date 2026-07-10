'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const STATUSES = ['open', 'in_progress', 'resolved', 'closed']
const PRIORITY_COLORS: Record<string, string> = { low: '#6b7280', normal: '#2563eb', high: '#d97706', urgent: '#dc2626' }

export default function TicketDetail() {
  const params = useParams()
  const router = useRouter()
  const ticketId = params.id as string
  const [ticket, setTicket] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const { data } = await (supabase as any).from('support_tickets').select('*').eq('id', ticketId).maybeSingle()
      setTicket(data); setLoading(false)
    })()
  }, [ticketId])

  const updateStatus = async (status: string) => {
    await (supabase as any).from('support_tickets').update({ status, updated_at: new Date().toISOString() }).eq('id', ticketId)
    setTicket((t: any) => ({ ...t, status }))
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--slate)' }}>Loading…</div>
  if (!ticket) return <div style={{ padding: 40, color: 'var(--slate)' }}>Ticket not found.</div>

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 24px' }}>
      <button onClick={() => router.push('/admin/tickets')} style={{ background: 'none', border: 'none', color: 'var(--slate)', fontSize: 13, cursor: 'pointer', marginBottom: 16, padding: 0 }}>← All tickets</button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>{ticket.ticket_number}</h1>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: '#f3f4f6', color: PRIORITY_COLORS[ticket.priority] || '#6b7280', textTransform: 'uppercase' }}>{ticket.priority}</span>
      </div>
      <h2 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 600, color: 'var(--ink)' }}>{ticket.subject}</h2>

      {ticket.description && <p style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.6, background: 'var(--canvas)', padding: 16, borderRadius: 10, whiteSpace: 'pre-wrap' }}>{ticket.description}</p>}

      <div style={{ marginTop: 20 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', marginBottom: 8 }}>Status</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {STATUSES.map(s => (
            <button key={s} onClick={() => updateStatus(s)}
              style={{ padding: '8px 16px', borderRadius: 8, border: ticket.status === s ? '2px solid var(--coral)' : '1px solid var(--border)', background: ticket.status === s ? 'var(--peach)' : '#fff', color: ticket.status === s ? 'var(--coral)' : 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {ticket.conversation_id && (
        <a href={`/admin/inbox?conversation=${ticket.conversation_id}`} style={{ display: 'inline-block', marginTop: 24, color: 'var(--coral)', fontWeight: 600, fontSize: 14 }}>← View the conversation</a>
      )}
      <p style={{ marginTop: 20, fontSize: 12, color: 'var(--slate)' }}>Created {new Date(ticket.created_at).toLocaleString()}</p>
    </div>
  )
}
