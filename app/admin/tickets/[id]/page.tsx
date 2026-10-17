'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAiDraft, AiDraftButton, AiDraftInfo } from '@/components/AiDraft'
import { CheckIcon, ChevronDownIcon, ChevronLeftIcon, ClockIcon, ExternalLinkIcon, LockIcon, MailIcon, PaperclipIcon } from '@/components/Icons'
import { computeSla, clockLabel, CLOCK_COLORS, resolveSla, DEFAULT_SLA, type SlaSettings, type Clock } from '@/lib/ticket-sla'

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

// Phones (<=767px) read thread first, like the inbox:
//  • a compact actions card up top (status, priority, assignee, deadlines),
//  • the reply box folds to a one-line bar pinned above the bottom nav and
//    opens into the full composer when tapped (the draft is kept while folded),
//  • the sidebar's duplicate status/priority/assignee controls are hidden.
// Desktop keeps the two-column layout, now full width.
const DETAIL_CSS = `
  .tkd-page { padding: 24px; }
  .tkd-phone { display: none; }
  .tkd-out { margin-left: 40px; }
  .tkd-cmp-bar, .tkd-cmp-collapse { display: none; }
  /* Buttons size to their labels and share the spare width, so "In progress" isn't cut short. */
  .tkd-seg { display: flex; gap: 6px; }
  .tkd-seg button { flex: 1 1 auto; min-width: 0; height: 38px; padding: 0 8px; border-radius: 10px; border: 1px solid var(--border); background: #fff; color: var(--ink); font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; text-transform: capitalize; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; -webkit-tap-highlight-color: transparent; }
  .tkd-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; font-size: 11.5px; font-weight: 700; color: var(--slate); text-transform: uppercase; letter-spacing: .03em; }
  .tkd-field select { width: 100%; min-width: 0; height: 40px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--border); background: #fff; font: inherit; font-size: 16px; font-weight: 600; text-transform: none; letter-spacing: 0; color: var(--ink); }
  @media (max-width: 900px) { .ticket-grid { grid-template-columns: 1fr !important; } }
  @media (max-width: 767px) {
    .tkd-page { padding: 12px 16px 16px; }
    .tkd-desk { display: none !important; }
    .tkd-phone { display: block; }
    .tkd-head { margin-bottom: 12px !important; }
    .tkd-head h1 { font-size: 21px !important; }
    .ticket-grid { gap: 12px !important; }
    .ticket-grid > div { gap: 12px !important; }
    .tkd-card { padding: 14px !important; border-radius: 14px !important; }
    .tkd-out { margin-left: 18px; }

    /* The reply box: folded to a bar above the bottom nav; opens in place. */
    .tkd-cmp { position: fixed; left: 0; right: 0; bottom: calc(58px + env(safe-area-inset-bottom, 0px)); z-index: 880; padding: 10px 16px !important; border-radius: 16px 16px 0 0 !important; border-width: 1px 0 0 !important; box-shadow: 0 -10px 30px -16px rgba(16,24,40,.25); }
    .tkd-cmp.folded .tkd-cmp-body { display: none; }
    .tkd-cmp.folded .tkd-cmp-bar { display: flex; align-items: center; gap: 8px; }
    .tkd-cmp.open { max-height: 55vh; overflow-y: auto; overscroll-behavior: contain; }
    .tkd-cmp-collapse { display: flex; }
    .tkd-cmp textarea { font-size: 16px !important; }
    .tkd-cmp-send { flex: 1; }
    /* Room under the last card for the bar and the AI orb resting above it. */
    .colvy-mobile-pad:has(.tkd-cmp) { padding-bottom: calc(58px + 64px + 76px + env(safe-area-inset-bottom, 0px)) !important; }
    body:has(.tkd-cmp.folded) .colvy-ai-orb-wrap[data-default-pos] { bottom: calc(58px + env(safe-area-inset-bottom, 0px) + 74px) !important; }
    body:has(.tkd-cmp.open) .colvy-ai-orb-wrap { display: none !important; }
  }
`

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
  const [sla, setSla] = useState<SlaSettings>(DEFAULT_SLA)
  const [team, setTeam] = useState<{ userId: string; name: string }[]>([])
  const [tick, setTick] = useState(0)
  // Phones: is the reply box open (true) or folded to its one-line bar? Desktop ignores it.
  const [cmpOpen, setCmpOpen] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { const iv = setInterval(() => setTick(t => t + 1), 60000); return () => clearInterval(iv) }, [])
  // Draft reply: AI writes the next email from the help centre, products and orders.
  const aiDraft = useAiDraft({ companyId: ticket?.company_id || null, ticketId, onDraft: t => { setTab('reply'); setDraft(t); setCmpOpen(true) }, getText: () => draft })

  const authed = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) }
  }

  const loadThread = async () => {
    try { const r = await authFetch(`/api/tickets/${ticketId}/reply`); const d = await r.json(); setMessages(d.messages || []) } catch {}
  }

  useEffect(() => {
    ;(async () => {
      const { data } = await (supabase as any).from('support_tickets').select('*').eq('id', ticketId).maybeSingle()
      setTicket(data)
      if (data?.contact_id) { try { const { data: c } = await (supabase as any).from('contacts').select('*').eq('id', data.contact_id).maybeSingle(); setContact(c) } catch {} }
      if (data?.company_id) {
        try { const { data: co } = await (supabase as any).from('companies').select('id,name,slug,accent_color').eq('id', data.company_id).maybeSingle(); setCompany(co) } catch {}
        try {
          const r = await authFetch(`/api/tickets/settings?companyId=${data.company_id}`, { headers: await authed() })
          if (r.ok) { const d = await r.json(); setSla(resolveSla(d.sla)); setTeam(d.team || []) }
        } catch {}
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

  // Status / priority / assignee go through the API so the deadline timestamps
  // (resolved_at) stay right.
  const patchTicket = async (patch: Record<string, any>) => {
    const prev = ticket
    setTicket((t: any) => ({ ...t, ...patch }))
    try {
      const res = await authFetch(`/api/tickets/${ticketId}`, { method: 'PATCH', headers: await authed(), body: JSON.stringify(patch) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not update')
      if (d.ticket) setTicket(d.ticket)
    } catch (e: any) { setTicket(prev); setToast(e.message) }
  }
  const updateStatus = (status: string) => patchTicket({ status })

  // Phones: open the folded reply bar as a reply or a note and put the caret in it.
  const openComposer = (kind: 'reply' | 'note') => {
    setTab(kind); setCmpOpen(true)
    setTimeout(() => { const el = textRef.current; try { el?.focus({ preventScroll: true }) } catch { el?.focus() } }, 50)
  }
  const foldComposer = () => {
    setCmpOpen(false)
    if (document.activeElement instanceof HTMLElement && document.activeElement.closest('.tkd-cmp')) document.activeElement.blur()
  }

  const send = async () => {
    if (!draft.trim()) return
    setSending(true); setToast('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await authFetch(`/api/tickets/${ticketId}/reply`, {
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
      // Phones: fold back to the bar (it shows the result) so the thread has the screen.
      foldComposer()
      await loadThread()
      // Pick up first_response_at so the deadline card flips to "Met".
      try { const { data: fresh } = await (supabase as any).from('support_tickets').select('*').eq('id', ticketId).maybeSingle(); if (fresh) setTicket(fresh) } catch {}
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
  void tick
  const slaNow = sla.enabled ? computeSla(ticket, sla) : null

  const card: React.CSSProperties = { background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }
  const sideTitle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '0 0 12px' }
  const statusButton = (s: string) => {
    const on = ticket.status === s
    const c = STATUS_COLORS[s]
    return (
      <button key={s} type="button" aria-pressed={on} onClick={() => updateStatus(s)}
        style={{ padding: '8px 10px', borderRadius: 10, border: on ? `2px solid ${c.c}` : '1px solid var(--border)', background: on ? c.bg : '#fff', color: on ? c.c : 'var(--ink)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize' }}>
        {s.replace('_', ' ')}
      </button>
    )
  }
  const prioritySelect = (style?: React.CSSProperties) => (
    <select value={pr} aria-label="Priority" onChange={e => patchTicket({ priority: e.target.value })}
      style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px', fontSize: 13, fontWeight: 700, color: PRIORITY_COLORS[pr] || '#6b7280', background: '#fff', cursor: 'pointer', textTransform: 'capitalize', fontFamily: 'inherit', ...style }}>
      {['urgent', 'high', 'normal', 'low'].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
    </select>
  )
  const assigneeSelect = (style?: React.CSSProperties) => (
    <select value={ticket.assigned_to || ''} aria-label="Assignee" onChange={e => patchTicket({ assigned_to: e.target.value || null })}
      style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px', fontSize: 13, fontWeight: 600, color: 'var(--ink)', background: '#fff', cursor: 'pointer', maxWidth: 170, fontFamily: 'inherit', ...style }}>
      <option value="">Unassigned</option>
      {team.map(m => <option key={m.userId} value={m.userId}>{m.name}</option>)}
      {ticket.assigned_to && !team.some(m => m.userId === ticket.assigned_to) && <option value={ticket.assigned_to}>Teammate</option>}
    </select>
  )
  const clockChip = (c: Clock, what: 'Reply' | 'Resolve') => {
    const col = CLOCK_COLORS[c.state]
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: col.bg, color: col.c, whiteSpace: 'nowrap' }}>{clockLabel(c, what)}</span>
  }
  const barText = draft.trim() ? draft.trim().replace(/\s+/g, ' ') : toast || `Reply to ${custName}…`

  return (
    <div className="tkd-page">
      <style>{DETAIL_CSS}</style>
      <button type="button" onClick={() => router.push('/admin/tickets')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--slate)', fontSize: 13.5, cursor: 'pointer', marginBottom: 12, padding: '4px 0', fontWeight: 600, marginLeft: -3 }}>
        <ChevronLeftIcon size={16} /> All tickets
      </button>

      {/* Header */}
      <div className="tkd-head" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ minWidth: 0 }}>
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
          {/* Phones: the ticket's controls in one compact card above the thread. */}
          <div className="tkd-phone tkd-card" style={card} aria-label="Ticket actions">
            <div className="tkd-seg" role="group" aria-label="Ticket status">
              {STATUSES.map(s => {
                const on = ticket.status === s
                const c = STATUS_COLORS[s]
                return (
                  <button key={s} type="button" aria-pressed={on} onClick={() => updateStatus(s)}
                    style={on ? { borderColor: c.c, background: c.bg, color: c.c, boxShadow: `inset 0 0 0 1px ${c.c}` } : undefined}>
                    {s.replace('_', ' ')}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 12 }}>
              <label className="tkd-field">Priority{prioritySelect({ height: 40, borderRadius: 10, fontSize: 16, maxWidth: 'none', width: '100%' })}</label>
              <label className="tkd-field">Assignee{assigneeSelect({ height: 40, borderRadius: 10, fontSize: 16, maxWidth: 'none', width: '100%' })}</label>
            </div>
            {slaNow && (slaNow.firstResponse.state !== 'off' || slaNow.resolution.state !== 'off') && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 12 }}>
                <ClockIcon size={14} color="var(--slate)" />
                {slaNow.firstResponse.state !== 'off' && clockChip(slaNow.firstResponse, 'Reply')}
                {slaNow.resolution.state !== 'off' && clockChip(slaNow.resolution, 'Resolve')}
              </div>
            )}
          </div>

          {/* Original message */}
          <div className="tkd-card" style={card}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{initials(custName)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>{custName}</span>
                  {custEmail && <span style={{ fontSize: 12.5, color: 'var(--slate)', minWidth: 0, overflowWrap: 'anywhere' }}>&lt;{custEmail}&gt;</span>}
                </div>
                {custEmail && <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 2, overflowWrap: 'anywhere' }}>to {supportAddr}</div>}
                <h3 style={{ margin: '12px 0 6px', fontSize: 15, fontWeight: 700, color: 'var(--ink)', overflowWrap: 'anywhere' }}>{ticket.subject}</h3>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--ink)', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{cleanBody(ticket.description) || '(no message)'}</p>
              </div>
            </div>
          </div>

          {/* Reply / note thread */}
          {messages.map(m => {
            const isNote = m.kind === 'note'
            const isInbound = m.direction === 'in'
            return (
              <div key={m.id} className={`tkd-card${(isNote || isInbound) ? '' : ' tkd-out'}`} style={{ ...card, background: isNote ? '#fffdf5' : '#fff', borderColor: isNote ? '#fde68a' : 'var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{m.author_name || (isInbound ? 'Customer' : 'Agent')}</span>
                  {isNote
                    ? <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: '#fef3c7', color: '#b45309', textTransform: 'uppercase' }}>Internal note</span>
                    : isInbound
                      ? <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: '#dbeafe', color: '#2563eb' }}>From customer</span>
                      : m.emailed
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: '#dcfce7', color: '#059669' }}><CheckIcon size={11} /> Emailed to customer</span>
                        : <span title="This reply was saved but not delivered — no mailbox is connected for this workspace." style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: '#fef2f2', color: '#dc2626' }}>Saved · not emailed</span>}
                  <span style={{ fontSize: 12, color: 'var(--slate)', marginLeft: 'auto' }}>{new Date(m.created_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--ink)', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.body}</p>
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
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--canvas)', fontSize: 13, color: 'var(--ink)', textDecoration: 'none', maxWidth: '100%', boxSizing: 'border-box' }}>
                          <PaperclipIcon size={14} color="var(--slate)" />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{a.name || 'attachment'}</span>
                        </a>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {/* Composer. On phones it's pinned above the bottom nav and folds to a bar. */}
          <div className={`tkd-cmp ${cmpOpen ? 'open' : 'folded'}`} style={card}>
            <div className="tkd-cmp-bar">
              <button type="button" onClick={() => openComposer('reply')} aria-label={`Reply to ${custName}`}
                style={{ flex: 1, minWidth: 0, height: 42, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--canvas)', font: 'inherit', fontSize: 14, color: draft.trim() || toast ? 'var(--ink)' : 'var(--slate)', cursor: 'text', textAlign: 'left' }}>
                <MailIcon size={16} color="var(--coral)" />
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{barText}</span>
              </button>
              <button type="button" onClick={() => openComposer('note')}
                style={{ height: 42, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 12px', borderRadius: 12, border: '1px solid #fde68a', background: '#fffdf5', color: '#b45309', font: 'inherit', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                <LockIcon size={14} /> Note
              </button>
            </div>
            <div className="tkd-cmp-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--border)' }}>
                {(['reply', 'note'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setTab(t)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 4px', marginRight: 16, background: 'none', border: 'none', borderBottom: tab === t ? '2px solid var(--coral)' : '2px solid transparent', color: tab === t ? 'var(--coral)' : 'var(--slate)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
                    {t === 'reply' ? <><MailIcon size={15} /> Reply</> : <><LockIcon size={14} /> Internal note</>}
                  </button>
                ))}
                <button type="button" className="tkd-cmp-collapse" onClick={foldComposer} title="Fold the reply box" aria-label="Fold the reply box"
                  style={{ marginLeft: 'auto', width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: '1px solid var(--border)', background: '#fff', color: 'var(--slate)', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                  <ChevronDownIcon size={16} />
                </button>
              </div>
              {tab === 'reply' && <AiDraftInfo info={aiDraft.info} error={aiDraft.error} busy={aiDraft.busy} onRedo={i => aiDraft.run(i)} onClose={aiDraft.clear} />}
              <textarea ref={textRef} value={draft} onChange={e => setDraft(e.target.value)} rows={4} aria-label={tab === 'reply' ? 'Reply' : 'Internal note'}
                placeholder={tab === 'reply' ? 'Write a reply — this is emailed to the customer…' : 'Add an internal note (only your team sees this)…'}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical', background: tab === 'note' ? '#fffdf5' : '#fff' }} />
              {toast && <p role="status" style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--slate)' }}>{toast}</p>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 12 }}>
                {tab === 'reply' && <AiDraftButton busy={aiDraft.busy} onClick={() => aiDraft.run()} height={40} />}
                <button type="button" className="tkd-cmp-send" onClick={send} disabled={sending || !draft.trim()}
                  style={{ height: 40, padding: '0 20px', borderRadius: 10, border: 'none', background: tab === 'reply' ? 'var(--coral)' : '#b45309', color: '#fff', fontWeight: 700, fontSize: 14, cursor: sending || !draft.trim() ? 'default' : 'pointer', opacity: sending || !draft.trim() ? 0.6 : 1 }}>
                  {sending ? 'Sending…' : tab === 'reply' ? 'Send reply' : 'Add note'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div className="tkd-desk" style={card}>
            <p style={sideTitle}>Ticket status</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {STATUSES.map(statusButton)}
            </div>
          </div>

          {slaNow && (() => {
            const t = slaNow
            const row = (label: string, c: Clock, what: 'Reply' | 'Resolve') => {
              const when = c.doneAt || c.dueAt
              return (
                <div style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--slate)' }}>{label}</span>
                    {c.state === 'off'
                      ? <span style={{ fontSize: 12, color: '#94a3b8' }}>—</span>
                      : clockChip(c, what)}
                  </div>
                  {when && c.state !== 'off' && (
                    <div style={{ fontSize: 11.5, color: 'var(--slate)', marginTop: 3, textAlign: 'right' }}>
                      {c.doneAt ? 'Done' : 'Due'} {when.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              )
            }
            return (
              <div className="tkd-card" style={{ ...card, borderColor: t.worst === 'overdue' ? '#fecaca' : 'var(--border)' }}>
                <p style={sideTitle}><ClockIcon size={14} /> Deadlines</p>
                {row('First reply', t.firstResponse, 'Reply')}
                {row('Resolution', t.resolution, 'Resolve')}
              </div>
            )
          })()}

          <div className="tkd-card" style={card}>
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
            <div className="tkd-desk" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 13 }}>
              <span style={{ color: 'var(--slate)' }}>Priority</span>
              {prioritySelect()}
            </div>
            <div className="tkd-desk" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 13 }}>
              <span style={{ color: 'var(--slate)' }}>Assignee</span>
              {assigneeSelect()}
            </div>
          </div>

          <div className="tkd-card" style={card}>
            <p style={sideTitle}>Customer</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{initials(custName)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{custName}</div>
                {custEmail && <div style={{ fontSize: 12.5, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{custEmail}</div>}
              </div>
            </div>
            {contact?.id && (
              <button type="button" onClick={() => router.push(`/admin/customers/profile?id=${contact.id}`)} style={{ width: '100%', marginTop: 12, padding: '8px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--ink)' }}>View customer</button>
            )}
            {ticket.conversation_id && (
              <button type="button" onClick={() => router.push(`/admin/inbox?conversation=${ticket.conversation_id}`)} style={{ width: '100%', marginTop: 8, padding: '8px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--coral)' }}>View conversation</button>
            )}
          </div>

          {articles.length > 0 && (
            <div className="tkd-card" style={card}>
              <p style={sideTitle}>Related articles</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {articles.map(a => (
                  <a key={a.id} href={company?.slug ? `https://${company.slug}.colvy.com/help/${a.id}` : `/help/${a.id}`} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--coral)', fontWeight: 600, textDecoration: 'none' }}>{a.title} <ExternalLinkIcon size={12} /></a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
