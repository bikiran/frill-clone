'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────
type Conversation = {
  id: string; company_id: string; contact_id: string | null
  channel: string; status: string; assigned_to: string | null; assigned_name: string | null
  subject: string | null; visitor_id: string | null
  page_url: string | null; page_title: string | null; page_history: any[]
  last_message: string | null; last_message_at: string
  unread_count: number; is_unread: boolean; updated_at: string
  contact?: Contact | null
}
type Message = {
  id: string; conversation_id: string; sender_type: string
  sender_name: string | null; sender_email: string | null
  content: string; attachments: any[]; metadata: any; created_at: string; is_read: boolean
}
type Contact = {
  id: string; name: string | null; email: string | null; phone: string | null
  address: string | null; city: string | null; country: string | null
  source: string; tags: string[]; notes: string | null; subscribed_to_marketing: boolean
}
type TeamMember = { id: string; user_id: string; name: string; role: string; avatar?: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const CHANNEL_ICON: Record<string, string> = {
  widget: '💬', email: '✉️', sms: '📱', facebook: '🟦', instagram: '🟣', whatsapp: '🟢'
}
const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  open:     { bg: '#fef3c7', color: '#d97706' },
  assigned: { bg: '#dbeafe', color: '#2563eb' },
  resolved: { bg: '#dcfce7', color: '#059669' },
  closed:   { bg: '#f3f4f6', color: '#6b7280' },
}
function timeAgo(d: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(d.endsWith('Z') ? d : d + 'Z').getTime()) / 1000))
  if (s < 60) return 'now'; if (s < 3600) return `${Math.floor(s/60)}m`
  if (s < 86400) return `${Math.floor(s/3600)}h`; return `${Math.floor(s/86400)}d`
}

// Simple AI extraction — looks for phone, email, address patterns in message
function extractFromText(text: string) {
  const phone = text.match(/(\+?[\d\s\-().]{7,15}\d)/)?.[1]?.replace(/\s+/g, ' ').trim()
  const email = text.match(/[\w.+-]+@[\w-]+\.\w+/)?.[0]
  const address = text.match(/\d+\s+[A-Za-z0-9\s,.]+(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Place|Pl|Court|Ct|Way|Boulevard|Blvd)[A-Za-z0-9\s,.]*/i)?.[0]
  return { phone: phone || null, email: email || null, address: address || null }
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function InboxPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [contact, setContact] = useState<Contact | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'assigned' | 'resolved'>('open')
  const [showAssignMenu, setShowAssignMenu] = useState(false)
  const [showContactEdit, setShowContactEdit] = useState(false)
  const [editContact, setEditContact] = useState<Partial<Contact>>({})
  const [aiDetected, setAiDetected] = useState<{ phone?: string | null; email?: string | null; address?: string | null } | null>(null)
  const [savingContact, setSavingContact] = useState(false)
  const [activePanel, setActivePanel] = useState<'info' | 'history'>('info')
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<any>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return
      setUser(session.user)
      let cid: string | null = null
      if (typeof window !== 'undefined') {
        const h = window.location.hostname
        if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
          const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', h.replace('.colvy.com', '')).maybeSingle()
          if (co) cid = co.id
        }
      }
      if (!cid) {
        const { data: ownCo } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
        if (ownCo?.id) cid = ownCo.id
      }
      if (!cid) return
      setCompanyId(cid)
      loadTeam(cid)
      loadConversations(cid)
      setLoading(false)
    }
    init()
  }, [])

  const loadConversations = useCallback(async (cid?: string | null) => {
    const id = cid || companyId
    if (!id) return
    let q = (supabase as any).from('conversations').select('*').eq('company_id', id)
    if (statusFilter !== 'all') q = q.eq('status', statusFilter)
    const { data } = await q.order('last_message_at', { ascending: false }).limit(50)
    setConversations(data || [])
  }, [companyId, statusFilter])

  useEffect(() => { loadConversations() }, [statusFilter, loadConversations])

  // Realtime subscription to new messages / conversation updates
  useEffect(() => {
    if (!companyId) return
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    const ch = supabase.channel(`inbox-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `company_id=eq.${companyId}` }, () => loadConversations())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `company_id=eq.${companyId}` }, (payload: any) => {
        if (selected?.id === payload.new.conversation_id) {
          setMessages(prev => [...prev, payload.new])
          scrollBottom()
        }
        loadConversations()
      })
      .subscribe()
    channelRef.current = ch
    return () => { supabase.removeChannel(ch) }
  }, [companyId, selected?.id])

  const loadTeam = async (cid: string) => {
    const { data } = await (supabase as any).from('team_members').select('*').eq('company_id', cid)
    if (data) setTeamMembers(data)
  }

  // ── Select conversation ────────────────────────────────────────────────────
  const selectConversation = async (conv: Conversation) => {
    setSelected(conv)
    setAiDetected(null)
    setShowContactEdit(false)
    // Load messages
    const { data: msgs } = await (supabase as any).from('messages').select('*').eq('conversation_id', conv.id).order('created_at', { ascending: true })
    setMessages(msgs || [])
    scrollBottom()
    // Mark read
    await (supabase as any).from('conversations').update({ is_unread: false, unread_count: 0 }).eq('id', conv.id)
    // Load contact
    if (conv.contact_id) {
      const { data: c } = await (supabase as any).from('contacts').select('*').eq('id', conv.contact_id).maybeSingle()
      setContact(c || null)
      setEditContact(c || {})
    } else {
      setContact(null)
      setEditContact({})
    }
    // Scan messages for AI-detected info
    setTimeout(() => {
      const allText = (msgs || []).filter((m: Message) => m.sender_type === 'visitor').map((m: Message) => m.content).join(' ')
      const extracted = extractFromText(allText)
      if (extracted.phone || extracted.email || extracted.address) setAiDetected(extracted)
    }, 300)
  }

  const scrollBottom = () => setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)

  // ── Send reply ─────────────────────────────────────────────────────────────
  const sendReply = async () => {
    if (!reply.trim() || !selected || !user) return
    setSending(true)
    const msg = {
      conversation_id: selected.id,
      company_id: companyId,
      sender_type: 'agent',
      sender_id: user.id,
      sender_name: user.user_metadata?.display_name || user.email?.split('@')[0],
      sender_email: user.email,
      content: reply.trim(),
      attachments: [],
      metadata: {},
    }
    await (supabase as any).from('messages').insert(msg)
    await (supabase as any).from('conversations').update({
      last_message: reply.trim(),
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', selected.id)
    setReply('')
    setSending(false)
    scrollBottom()
  }

  // ── Assign ─────────────────────────────────────────────────────────────────
  const assignTo = async (member: TeamMember | null) => {
    if (!selected) return
    await (supabase as any).from('conversations').update({
      assigned_to: member?.user_id || null,
      assigned_name: member?.name || null,
      status: member ? 'assigned' : 'open',
    }).eq('id', selected.id)
    setSelected(s => s ? { ...s, assigned_to: member?.user_id || null, assigned_name: member?.name || null, status: member ? 'assigned' : 'open' } : s)
    setShowAssignMenu(false)
    loadConversations()
  }

  // ── Update status ──────────────────────────────────────────────────────────
  const setStatus = async (status: string) => {
    if (!selected) return
    await (supabase as any).from('conversations').update({ status }).eq('id', selected.id)
    setSelected(s => s ? { ...s, status } : s)
    loadConversations()
  }

  // ── Contact save ───────────────────────────────────────────────────────────
  const saveContact = async () => {
    if (!companyId) return
    setSavingContact(true)
    if (contact?.id) {
      await (supabase as any).from('contacts').update({ ...editContact, updated_at: new Date().toISOString() }).eq('id', contact.id)
      setContact(c => c ? { ...c, ...editContact } : c)
    } else {
      const { data: newContact } = await (supabase as any).from('contacts').insert({ ...editContact, company_id: companyId, source: 'widget' }).select().maybeSingle()
      if (newContact) {
        setContact(newContact)
        await (supabase as any).from('conversations').update({ contact_id: newContact.id }).eq('id', selected!.id)
      }
    }
    setShowContactEdit(false)
    setSavingContact(false)
  }

  // ── Accept AI-detected info ────────────────────────────────────────────────
  const acceptAiField = async (field: string, value: string) => {
    const updated = { ...editContact, [field]: value }
    setEditContact(updated)
    if (contact?.id) {
      await (supabase as any).from('contacts').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', contact.id)
      setContact(c => c ? { ...c, [field]: value } : c)
    }
    setAiDetected(prev => prev ? { ...prev, [field]: null } : null)
  }

  const filteredConvs = conversations.filter(c => {
    if (!searchTerm) return true
    const q = searchTerm.toLowerCase()
    return (c.last_message || '').toLowerCase().includes(q) || (c.subject || '').toLowerCase().includes(q)
  })

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--slate)' }}>Loading inbox…</div>

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }

  return (
    <div style={{ display: 'flex', height: '100vh', maxHeight: 'calc(100vh - 56px)', overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* ── LEFT: Conversation list ─────────────────────────────────────────── */}
      <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: '#fff' }}>
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--ink)' }}>Inbox</h2>
            <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--peach)', color: 'var(--coral)', padding: '2px 8px', borderRadius: 20 }}>
              {conversations.filter(c => c.is_unread).length} unread
            </span>
          </div>
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search conversations…"
            style={{ ...inp, background: 'var(--canvas)' }} />
          {/* Status filter */}
          <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
            {(['open', 'assigned', 'resolved', 'all'] as const).map(s => (
              <button key={s} type="button" onClick={() => setStatusFilter(s)}
                style={{ flex: 1, padding: '5px 4px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, textTransform: 'capitalize', background: statusFilter === s ? 'var(--coral)' : 'var(--canvas)', color: statusFilter === s ? '#fff' : 'var(--slate)' }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredConvs.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No conversations yet</div>
          )}
          {filteredConvs.map(conv => (
            <button key={conv.id} type="button" onClick={() => selectConversation(conv)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selected?.id === conv.id ? 'var(--peach)' : conv.is_unread ? '#fffbf0' : '#fff', transition: 'background 0.1s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>{CHANNEL_ICON[conv.channel] || '💬'}</span>
                  <span style={{ fontSize: 13, fontWeight: conv.is_unread ? 700 : 600, color: 'var(--ink)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conv.subject || conv.visitor_id?.slice(0, 8) || 'Visitor'}
                  </span>
                </div>
                <span style={{ fontSize: 10, color: '#9ca3af', flexShrink: 0 }}>{timeAgo(conv.last_message_at)}</span>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {conv.last_message || 'No messages yet'}
              </p>
              {conv.assigned_name && (
                <span style={{ fontSize: 10, color: '#2563eb', marginTop: 3, display: 'block' }}>Assigned: {conv.assigned_name}</span>
              )}
              {conv.unread_count > 0 && (
                <span style={{ float: 'right', marginTop: -14, fontSize: 10, fontWeight: 700, background: 'var(--coral)', color: '#fff', padding: '1px 6px', borderRadius: 20 }}>{conv.unread_count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── MIDDLE: Chat thread ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f9f9f9', minWidth: 0 }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <p style={{ marginTop: 12, fontSize: 15 }}>Select a conversation</p>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#fff', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16 }}>{CHANNEL_ICON[selected.channel]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {contact?.name || selected.subject || 'Visitor'}
                </p>
                {selected.page_title && <p style={{ margin: 0, fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>On: {selected.page_title}</p>}
              </div>
              {/* Status pill */}
              <div style={{ position: 'relative' }}>
                <select value={selected.status} onChange={e => setStatus(e.target.value)}
                  style={{ fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 8, border: 'none', background: STATUS_COLOR[selected.status]?.bg || '#f3f4f6', color: STATUS_COLOR[selected.status]?.color || '#6b7280', cursor: 'pointer', appearance: 'none' }}>
                  {Object.entries(STATUS_COLOR).map(([k, v]) => <option key={k} value={k}>{v.color && k.charAt(0).toUpperCase() + k.slice(1)}</option>)}
                </select>
              </div>
              {/* Assign button */}
              <div style={{ position: 'relative' }}>
                <button type="button" onClick={() => setShowAssignMenu(v => !v)}
                  style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--ink)' }}>
                  {selected.assigned_name ? `👤 ${selected.assigned_name}` : '+ Assign'}
                </button>
                {showAssignMenu && (
                  <div style={{ position: 'absolute', top: '110%', right: 0, width: 220, background: '#fff', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.12)', zIndex: 50, overflow: 'hidden' }}>
                    <p style={{ margin: 0, padding: '10px 14px 6px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Assign User</p>
                    <button type="button" onClick={() => assignTo(null)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: '#ef4444' }}>
                      Unassign
                    </button>
                    {teamMembers.map(m => (
                      <button key={m.id} type="button" onClick={() => assignTo(m)}
                        style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', background: selected.assigned_to === m.user_id ? 'var(--peach)' : 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                        <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                          {m.name?.charAt(0).toUpperCase()}
                        </span>
                        {m.name}
                        {selected.assigned_to === m.user_id && ' ✓'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* AI detection banner */}
            {aiDetected && (aiDetected.phone || aiDetected.email || aiDetected.address) && (
              <div style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: '#d97706' }}>✨ AI detected:</span>
                {aiDetected.phone && (
                  <button type="button" onClick={() => acceptAiField('phone', aiDetected.phone!)}
                    style={{ padding: '3px 10px', borderRadius: 8, background: '#fff', border: '1px solid #fde68a', cursor: 'pointer', fontSize: 12, color: '#d97706', fontWeight: 600 }}>
                    📱 {aiDetected.phone} — click to save
                  </button>
                )}
                {aiDetected.email && (
                  <button type="button" onClick={() => acceptAiField('email', aiDetected.email!)}
                    style={{ padding: '3px 10px', borderRadius: 8, background: '#fff', border: '1px solid #fde68a', cursor: 'pointer', fontSize: 12, color: '#d97706', fontWeight: 600 }}>
                    ✉️ {aiDetected.email} — click to save
                  </button>
                )}
                {aiDetected.address && (
                  <button type="button" onClick={() => acceptAiField('address', aiDetected.address!)}
                    style={{ padding: '3px 10px', borderRadius: 8, background: '#fff', border: '1px solid #fde68a', cursor: 'pointer', fontSize: 12, color: '#d97706', fontWeight: 600 }}>
                    📍 {aiDetected.address} — click to save
                  </button>
                )}
                <button type="button" onClick={() => setAiDetected(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 14 }}>✕</button>
              </div>
            )}

            {/* Page history banner */}
            {selected.page_url && (
              <div style={{ background: '#f0f9ff', borderBottom: '1px solid #bae6fd', padding: '6px 16px', fontSize: 11, color: '#0369a1', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                <span>Currently on:</span>
                <a href={selected.page_url} target="_blank" rel="noopener" style={{ color: '#0369a1', fontWeight: 600, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selected.page_title || selected.page_url}
                </a>
                {selected.page_history?.length > 1 && <span style={{ color: '#64748b' }}>({selected.page_history.length} pages visited)</span>}
              </div>
            )}

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {messages.map(msg => {
                const isAgent = msg.sender_type === 'agent'
                const isSystem = msg.sender_type === 'system'
                if (isSystem) return (
                  <div key={msg.id} style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', padding: '4px 0' }}>
                    <span style={{ background: '#f3f4f6', padding: '3px 10px', borderRadius: 20 }}>{msg.content}</span>
                  </div>
                )
                return (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: isAgent ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-end' }}>
                    {!isAgent && (
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--peach)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--coral)', flexShrink: 0 }}>
                        {(contact?.name || msg.sender_name || 'V')[0].toUpperCase()}
                      </div>
                    )}
                    <div style={{ maxWidth: '70%' }}>
                      {!isAgent && <p style={{ margin: '0 0 3px 4px', fontSize: 10, color: '#9ca3af' }}>{msg.sender_name || 'Visitor'}</p>}
                      <div style={{
                        padding: '10px 14px', borderRadius: isAgent ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        background: isAgent ? 'var(--coral)' : '#fff',
                        color: isAgent ? '#fff' : 'var(--ink)',
                        fontSize: 13, lineHeight: 1.5,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                        border: isAgent ? 'none' : '1px solid var(--border)',
                      }}>{msg.content}</div>
                      <p style={{ margin: '3px 0 0', fontSize: 10, color: '#9ca3af', textAlign: isAgent ? 'right' : 'left' }}>
                        {new Date(msg.created_at.endsWith('Z') ? msg.created_at : msg.created_at + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    {isAgent && (
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                        {(msg.sender_name || 'A')[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply box */}
            <div style={{ padding: '10px 14px', background: '#fff', borderTop: '1px solid var(--border)' }}>
              <textarea ref={textareaRef} value={reply} onChange={e => setReply(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                placeholder="Type a reply… (Enter to send, Shift+Enter for new line)"
                rows={3}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 8 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setStatus('resolved')}
                    style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #059669', background: '#dcfce7', color: '#059669', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    ✓ Resolve
                  </button>
                  <button type="button" onClick={() => setStatus('closed')}
                    style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--canvas)', color: 'var(--slate)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    Close
                  </button>
                </div>
                <button type="button" onClick={sendReply} disabled={sending || !reply.trim()}
                  style={{ padding: '8px 20px', borderRadius: 10, background: reply.trim() ? 'var(--coral)' : '#e5e7eb', color: reply.trim() ? '#fff' : '#9ca3af', border: 'none', fontSize: 13, fontWeight: 700, cursor: reply.trim() ? 'pointer' : 'default', transition: 'all 0.15s' }}>
                  {sending ? 'Sending…' : 'Send →'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── RIGHT: Contact info + Page history ─────────────────────────────── */}
      {selected && (
        <div style={{ width: 280, flexShrink: 0, borderLeft: '1px solid var(--border)', background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Panel tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            {(['info', 'history'] as const).map(p => (
              <button key={p} type="button" onClick={() => setActivePanel(p)}
                style={{ flex: 1, padding: '11px 0', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: activePanel === p ? 700 : 500, color: activePanel === p ? 'var(--coral)' : 'var(--slate)', borderBottom: activePanel === p ? '2px solid var(--coral)' : '2px solid transparent', textTransform: 'capitalize' }}>
                {p === 'info' ? 'Information' : 'Page History'}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px' }}>
            {activePanel === 'info' && (
              <>
                {/* Contact card */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Contact</h3>
                  <button type="button" onClick={() => { setShowContactEdit(v => !v); setEditContact(contact || {}) }}
                    style={{ fontSize: 11, color: 'var(--coral)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                    {showContactEdit ? 'Cancel' : (contact ? 'Edit' : '+ Create')}
                  </button>
                </div>

                {showContactEdit ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[['name', 'Name', 'text'], ['email', 'Email', 'email'], ['phone', 'Phone', 'tel'], ['address', 'Address', 'text'], ['city', 'City', 'text'], ['country', 'Country', 'text']].map(([field, label, type]) => (
                      <div key={field}>
                        <label style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 3 }}>{label}</label>
                        <input type={type} value={(editContact as any)[field] || ''} onChange={e => setEditContact(c => ({ ...c, [field]: e.target.value }))}
                          style={{ ...inp, fontSize: 12 }} />
                      </div>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" id="marketing" checked={!!editContact.subscribed_to_marketing} onChange={e => setEditContact(c => ({ ...c, subscribed_to_marketing: e.target.checked }))} />
                      <label htmlFor="marketing" style={{ fontSize: 12, color: 'var(--slate)' }}>Subscribed to marketing</label>
                    </div>
                    <textarea value={editContact.notes || ''} onChange={e => setEditContact(c => ({ ...c, notes: e.target.value }))} placeholder="Notes…" rows={2}
                      style={{ ...inp, resize: 'vertical', fontSize: 12 }} />
                    <button type="button" onClick={saveContact} disabled={savingContact}
                      style={{ padding: '8px 0', borderRadius: 8, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      {savingContact ? 'Saving…' : 'Save Contact'}
                    </button>
                  </div>
                ) : contact ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {[['👤 Name', contact.name], ['✉️ Email', contact.email], ['📱 Phone', contact.phone], ['📍 Address', [contact.address, contact.city, contact.country].filter(Boolean).join(', ')]]
                      .filter(([, v]) => v)
                      .map(([label, value]) => (
                        <div key={label as string}>
                          <p style={{ margin: '0 0 2px 0', fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>{label as string}</p>
                          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)' }}>{value as string}</p>
                        </div>
                      ))
                    }
                    {contact.subscribed_to_marketing && <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>✓ Subscribed to marketing</span>}
                    {contact.notes && <p style={{ margin: 0, fontSize: 12, color: 'var(--slate)', fontStyle: 'italic' }}>{contact.notes}</p>}
                    <Link href={`/admin/customers/profile?id=${contact.id}`}
                      style={{ fontSize: 12, color: 'var(--coral)', fontWeight: 600, textDecoration: 'none' }}>
                      View full profile →
                    </Link>
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>No contact linked yet. Click &ldquo;+ Create&rdquo; to create one.</p>
                )}

                {/* Conversation metadata */}
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 14 }}>
                  <h3 style={{ margin: '0 0 10px 0', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Details</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Channel</p>
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)' }}>{CHANNEL_ICON[selected.channel]} {selected.channel}</p>
                    </div>
                    <div>
                      <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Status</p>
                      <span style={{ ...STATUS_COLOR[selected.status], padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700, display: 'inline-block' }}>
                        {selected.status}
                      </span>
                    </div>
                    <div>
                      <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Started</p>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--ink)' }}>{new Date(selected.updated_at).toLocaleString()}</p>
                    </div>
                    {selected.assigned_name && (
                      <div>
                        <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Assigned to</p>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)' }}>👤 {selected.assigned_name}</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {activePanel === 'history' && (
              <>
                <h3 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Page History</h3>
                {(!selected.page_history || selected.page_history.length === 0) ? (
                  <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>No page history recorded yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[...selected.page_history].reverse().map((h: any, i: number) => (
                      <div key={i} style={{ padding: '9px 12px', borderRadius: 8, background: 'var(--canvas)', border: i === 0 ? '1.5px solid var(--coral)' : '1px solid var(--border)' }}>
                        {i === 0 && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--coral)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 3 }}>Current</span>}
                        <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.title || 'Untitled'}</p>
                        <a href={h.url} target="_blank" rel="noopener" style={{ fontSize: 11, color: 'var(--coral)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{h.url}</a>
                        <p style={{ margin: '3px 0 0', fontSize: 10, color: '#9ca3af' }}>{h.ts ? new Date(h.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
