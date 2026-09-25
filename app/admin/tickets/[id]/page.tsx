'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const STATUSES = ['open', 'in_progress', 'resolved', 'closed']
const STATUS_COLORS: Record<string, { bg: string; c: string }> = {
  open: { bg: '#dbeafe', c: '#2563eb' },
  in_progress: { bg: '#fef3c7', c: '#d97706' },
  resolved: { bg: '#dcfce7', c: '#059669' },
  closed: { bg: '#f3f4f6', c: '#6b7280' },
}
const PRIORITY_COLORS: Record<string, string> = { low: '#6b7280', normal: '#2563eb', high: '#d97706', urgent: '#dc2626' }

const initials = (name: string) => (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
const parseFrom = (desc: string) => { const m = /From:\s*([^<]+?)\s*<([^>]+)>/i.exec(desc || ''); return m ? { name: m[1].trim(), email: m[2].trim() } : null }
// The body without the trailing "— From: …" line the help form appends.
const cleanBody = (desc: string) => String(desc || '').replace(/\n*—?\s*From:\s*[^<]+?<[^>]+>.*$/is, '').trim()

export default function TicketDetail() {
  const params = useParams()
  const router = useRouter()
  const ticketId = params.id as string
  const [ticket, setTicket] = useState<any>(null)
  const [contact, setContact] = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [articles, setArticles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'reply' | 'note'>('reply')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState('')

  const loadThread = async () => {
    try { const r = await fetch(`/api/tickets/${ticketId}/reply`); const d = await r.json(); setMessages(d.messages || []) } catch {}
  }

  useEffect(() => {
    ;(async () => {
      const { data } = await (supabase as any).from('support_tickets').select('*').eq('id', ticketId).maybeSingle()
      setTicket(data)
      if (data?.contact_id) { try { const { data: c } = await (supabase as any).from('contacts').select('*').eq('id', data.contact_id).maybeSingle(); setContact(c) } catch {} }
      if (data?.company_id) {
        try { const { data: co } = await (supabase as any).from('companies').select('id,name,slug,accent_color').eq('id', data.company_id).maybeSingle(); setCompany(co) } catch {}
        try { const { data: arts } = await (supabase as any).from('help_articles').select('id,title,slug').eq('company_id', data.company_id).eq('status', 'published').limit(4); setArticles(arts || []) } catch {}
      }
      await loadThread()
      setLoading(false)
    })()
  }, [ticketId])

  // Poll for the customer's inbound replies (routed in via the email webhook)
  // so they appear in the ticket without a manual reload.
  useEffect(() => {
    if (!ticketId) return
    const iv = setInterval(loadThread, 15000)
    return () => clearInterval(iv)
  }, [ticketId])

  const updateStatus = async (status: string) => {
    await (supabase as any).from('support_tickets').update({ status, updated_at: new Date().toISOString() }).eq('id', ticketId)
    setTicket((t: any) => ({ ...t, status }))
  }

  const send = async () => {
    if (!draft.trim()) return
    setSending(true); setToast('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/tickets/${ticketId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ kind: tab, body: draft.trim(), authorName: session?.user?.email?.split('@')[0] || 'Agent' }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not send')
      setDraft('')
      if (tab === 'reply' && d.note) setToast(d.note)
      else if (tab === 'reply') setToast(d.emailed ? 'Reply sent to the customer by email.' : 'Reply saved.')
      else setToast('Internal note added.')
      await loadThread()
      setTimeout(() => setToast(''), 6000)
    } catch (e: any) { setToast(e.message) } finally { setSending(false) }
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--slate)' }}>Loading…</div>
  if (!ticket) return <div style={{ padding: 40, color: 'var(--slate)' }}>Ticket not found.</div>

  const from = parseFrom(ticket.description || '')
  const custName = contact?.name || from?.name || ticket.name || 'Customer'
  const custEmail = contact?.email || from?.email || ticket.email || ''
  const sc = STATUS_COLORS[ticket.status] || STATUS_COLORS.open
  const pr = ticket.priority || 'normal'
  const supportAddr = company?.support_email || `support@${company?.slug || 'company'}.com`

  const card: React.CSSProperties = { background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }
  const sideTitle: React.CSSProperties = { fontSize: 12.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '0 0 12px' }

  return (
    <div style={{ padding: '24px', maxWidth: 1280, margin: '0 auto' }}>
      <button onClick={() => router.push('/admin/tickets')} style={{ background: 'none', border: 'none', color: 'var(--slate)', fontSize: 13.5, cursor: 'pointer', marginBottom: 14, padding: 0, fontWeight: 600 }}>← All tickets</button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>{ticket.ticket_number}</h1>
            <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: sc.bg, color: sc.c, textTransform: 'capitalize' }}>{String(ticket.status).replace('_', ' ')}</span>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--slate)' }}>Created {new Date(ticket.created_at).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20, alignItems: 'start' }} className="ticket-grid">
        {/* Main column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {/* Original message */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{initials(custName)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>{custName}</span>
                  {custEmail && <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>&lt;{custEmail}&gt;</span>}
                </div>
                {custEmail && <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 2 }}>to {supportAddr}</div>}
                <h3 style={{ margin: '12px 0 6px', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{ticket.subject}</h3>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--ink)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{cleanBody(ticket.description) || '(no message)'}</p>
              </div>
            </div>
          </div>

          {/* Reply / note thread */}
          {messages.map(m => {
            const isNote = m.kind === 'note'
            const isInbound = m.direction === 'in'
            return (
              <div key={m.id} style={{ ...card, background: isNote ? '#fffdf5' : '#fff', borderColor: isNote ? '#fde68a' : 'var(--border)', marginLeft: (isNote || isInbound) ? 0 : 40 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{m.author_name || (isInbound ? 'Customer' : 'Agent')}</span>
                  {isNote
                    ? <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: '#fef3c7', color: '#b45309', textTransform: 'uppercase' }}>Internal note</span>
                    : isInbound
                      ? <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: '#dbeafe', color: '#2563eb' }}>From customer</span>
                      : m.emailed
                        ? <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: '#dcfce7', color: '#059669' }}>✓ Emailed to customer</span>
                        : <span title="This reply was saved but not delivered — no mailbox is connected for this workspace." style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: '#fef2f2', color: '#dc2626' }}>Saved · not emailed</span>}
                  <span style={{ fontSize: 12, color: 'var(--slate)', marginLeft: 'auto' }}>{new Date(m.created_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--ink)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{m.body}</p>
                {Array.isArray(m.attachments) && m.attachments.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                    {m.attachments.map((a: any, i: number) => {
                      const isImg = /^image\//.test(a.type || '') || /\.(png|jpe?g|gif|webp|avif)$/i.test(a.name || '')
                      return isImg ? (
                        <a key={i} href={a.url} target="_blank" rel="noreferrer" title={a.name}>
                          <img src={a.url} alt={a.name || 'attachment'} style={{ maxWidth: 160, maxHeight: 160, borderRadius: 8, border: '1px solid var(--border)', objectFit: 'cover', display: 'block' }} />
                        </a>
                      ) : (
                        <a key={i} href={a.url} target="_blank" rel="noreferrer" download
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--canvas)', fontSize: 13, color: 'var(--ink)', textDecoration: 'none', maxWidth: 240 }}>
                          <span aria-hidden>📎</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name || 'attachment'}</span>
                        </a>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {/* Composer */}
          <div style={card}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--border)' }}>
              {(['reply', 'note'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  style={{ padding: '8px 4px', marginRight: 16, background: 'none', border: 'none', borderBottom: tab === t ? '2px solid var(--coral)' : '2px solid transparent', color: tab === t ? 'var(--coral)' : 'var(--slate)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
                  {t === 'reply' ? '✉ Reply' : '🔒 Internal note'}
                </button>
              ))}
            </div>
            <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={4}
              placeholder={tab === 'reply' ? 'Write a reply — this is emailed to the customer…' : 'Add an internal note (only your team sees this)…'}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical', background: tab === 'note' ? '#fffdf5' : '#fff' }} />
            {toast && <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--slate)' }}>{toast}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={send} disabled={sending || !draft.trim()}
                style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: tab === 'reply' ? 'var(--coral)' : '#b45309', color: '#fff', fontWeight: 700, fontSize: 14, cursor: sending || !draft.trim() ? 'default' : 'pointer', opacity: sending || !draft.trim() ? 0.6 : 1 }}>
                {sending ? 'Sending…' : tab === 'reply' ? 'Send reply' : 'Add note'}
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={card}>
            <p style={sideTitle}>Ticket status</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {STATUSES.map(s => {
                const on = ticket.status === s
                const c = STATUS_COLORS[s]
                return (
                  <button key={s} onClick={() => updateStatus(s)}
                    style={{ padding: '8px 10px', borderRadius: 10, border: on ? `2px solid ${c.c}` : '1px solid var(--border)', background: on ? c.bg : '#fff', color: on ? c.c : 'var(--ink)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize' }}>
                    {s.replace('_', ' ')}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={card}>
            <p style={sideTitle}>Ticket details</p>
            {[
              ['Ticket ID', ticket.ticket_number],
              ['Created', new Date(ticket.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })],
              ['Last updated', new Date(ticket.updated_at || ticket.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })],
            ].map(([k, v]) => (
              <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', fontSize: 13 }}>
                <span style={{ color: 'var(--slate)' }}>{k}</span>
                <span style={{ color: 'var(--ink)', fontWeight: 600, textAlign: 'right' }}>{v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', fontSize: 13 }}>
              <span style={{ color: 'var(--slate)' }}>Priority</span>
              <span style={{ color: PRIORITY_COLORS[pr] || '#6b7280', fontWeight: 700, textTransform: 'capitalize' }}>⚑ {pr}</span>
            </div>
          </div>

          <div style={card}>
            <p style={sideTitle}>Customer</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>{initials(custName)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{custName}</div>
                {custEmail && <div style={{ fontSize: 12.5, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{custEmail}</div>}
              </div>
            </div>
            {contact?.id && (
              <button onClick={() => router.push(`/admin/contacts/${contact.id}`)} style={{ width: '100%', marginTop: 12, padding: '8px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--ink)' }}>View customer</button>
            )}
            {ticket.conversation_id && (
              <button onClick={() => router.push(`/admin/inbox?conversation=${ticket.conversation_id}`)} style={{ width: '100%', marginTop: 8, padding: '8px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--coral)' }}>View conversation</button>
            )}
          </div>

          {articles.length > 0 && (
            <div style={card}>
              <p style={sideTitle}>Related articles</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {articles.map(a => (
                  <a key={a.id} href={company?.slug ? `https://${company.slug}.colvy.com/help/${a.id}` : `/help/${a.id}`} target="_blank" rel="noreferrer"
                    style={{ fontSize: 13, color: 'var(--coral)', fontWeight: 600, textDecoration: 'none' }}>{a.title} ↗</a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`@media (max-width: 900px){ .ticket-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}
