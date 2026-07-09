'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import CallBar from '@/components/CallBar'
import IncomingCallListener from '@/components/IncomingCallListener'

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
  if (!d) return ''
  const parsed = new Date(d.endsWith?.('Z') ? d : d + 'Z')
  if (isNaN(parsed.getTime())) return ''
  const s = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 1000))
  if (s < 60) return 'now'; if (s < 3600) return `${Math.floor(s/60)}m`
  if (s < 86400) return `${Math.floor(s/3600)}h`; return `${Math.floor(s/86400)}d`
}

// Safe time formatter — handles null, undefined, and non-ISO timestamps
function fmtTime(d: string | undefined | null) {
  if (!d) return ''
  const s = typeof d === 'string' ? d : String(d)
  const parsed = new Date(s.endsWith?.('Z') ? s : s + 'Z')
  if (isNaN(parsed.getTime())) return ''
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
// Formats like "Received 7:18 PM | 08 Jul | Instagram" / "Delivered 2:03 PM | 09 Jul"
function fmtReceipt(d: string | undefined | null, isAgent: boolean, channel?: string) {
  if (!d) return ''
  const s = typeof d === 'string' ? d : String(d)
  const parsed = new Date(s.endsWith?.('Z') ? s : s + 'Z')
  if (isNaN(parsed.getTime())) return ''
  const time = parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const date = parsed.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })
  const label = isAgent ? 'Delivered' : 'Received'
  const chan = channel ? channel.charAt(0).toUpperCase() + channel.slice(1) : ''
  return `${label} ${time} | ${date}${!isAgent && chan ? ` | ${chan}` : ''}`
}
function fmtDateTime(d: string | undefined | null) {
  if (!d) return ''
  const parsed = new Date(d)
  if (isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString()
}

// Simple AI extraction — looks for phone, email, address patterns in message
function extractFromText(text: string) {
  // Phone: Australian mobiles (0435 844 469 / 0435844469 / +61 435 844 469),
  // landlines (02 1234 5678), international. Requires 8-15 digits total.
  let phone: string | null = null
  const phoneCandidates = text.match(/(?:\+?\d[\d\s\-().]{6,18}\d)/g) || []
  for (const cand of phoneCandidates) {
    const digits = cand.replace(/\D/g, '')
    if (digits.length >= 8 && digits.length <= 15) { phone = cand.replace(/\s+/g, ' ').trim(); break }
  }
  const email = text.match(/[\w.+-]+@[\w-]+\.\w+/)?.[0] || null
  const address = text.match(/\d+[A-Za-z]?[/-]?\d*\s+[A-Za-z0-9\s,.'-]+?(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Place|Pl|Court|Ct|Way|Boulevard|Blvd|Crescent|Cres|Terrace|Tce|Parade|Pde|Close|Cl|Highway|Hwy)\b[A-Za-z0-9\s,.'-]*/i)?.[0]?.trim() || null
  return { phone: phone || null, email: email || null, address: address || null }
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function InboxPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [companyInfo, setCompanyInfo] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [contact, setContact] = useState<Contact | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [msgSearch, setMsgSearch] = useState('')
  const [showMsgSearch, setShowMsgSearch] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [replyChannel, setReplyChannel] = useState<'chat' | 'sms'>('chat')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'assigned' | 'resolved'>('open')
  const [showAssignMenu, setShowAssignMenu] = useState(false)
  const [showContactEdit, setShowContactEdit] = useState(false)
  const [editContact, setEditContact] = useState<Partial<Contact>>({})
  const [aiDetected, setAiDetected] = useState<{ phone?: string | null; email?: string | null; address?: string | null } | null>(null)
  const [savingContact, setSavingContact] = useState(false)
  const [activePanel, setActivePanel] = useState<'info' | 'timeline' | 'orders'>('info')
  const [wooCustomer, setWooCustomer] = useState<any>(null)
  const [wooOrders, setWooOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  // New chat features
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [showEmoji, setShowEmoji] = useState(false)
  const [showReactPicker, setShowReactPicker] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [events, setEvents] = useState<any[]>([])
  const [notes, setNotes] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [newNote, setNewNote] = useState('')
  const [newTask, setNewTask] = useState('')
  const [aiSummary, setAiSummary] = useState('')
  const [aiTodos, setAiTodos] = useState<any[]>([])
  const [generatingAi, setGeneratingAi] = useState(false)
  const [showSnooze, setShowSnooze] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<any>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const EMOJIS = ['👍', '❤️', '😊', '🎉', '🙏', '😂', '🔥', '👀', '✅', '😢', '😮', '💯']

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
      // Load company logo/name/accent for agent message avatars
      const { data: ci } = await (supabase as any).from('companies').select('name, logo_url, accent_color, slug').eq('id', cid).maybeSingle()
      if (ci) setCompanyInfo(ci)
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

  // Deep-link: open a conversation from ?conversation=<id> (copy chat link)
  useEffect(() => {
    if (conversations.length === 0 || selected) return
    if (typeof window === 'undefined') return
    const convId = new URLSearchParams(window.location.search).get('conversation')
    if (convId) {
      const found = conversations.find(c => c.id === convId)
      if (found) selectConversation(found)
    }
  }, [conversations])

  // Close the assign dropdown / actions menu when clicking elsewhere
  useEffect(() => {
    if (!showAssignMenu && !showActions) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-assign-menu]')) setShowAssignMenu(false)
      if (!target.closest('[data-actions-menu]')) setShowActions(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showAssignMenu, showActions])

  // Realtime subscription to new messages / conversation updates
  useEffect(() => {
    if (!companyId) return
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    const ch = supabase.channel(`inbox-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `company_id=eq.${companyId}` }, () => loadConversations())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `company_id=eq.${companyId}` }, (payload: any) => {
        if (selected?.id === payload.new.conversation_id) {
          setMessages(prev => {
            if (prev.some((m: any) => m.id === payload.new.id)) return prev
            return [...prev, payload.new]
          })
          scrollBottom()
        }
        loadConversations()
      })
      .subscribe()
    channelRef.current = ch

    // Polling fallback — refresh the open thread every 4s in case realtime
    // isn't enabled on the messages table. Guarantees new messages appear
    // without a manual reload.
    const poll = setInterval(async () => {
      loadConversations()
      if (selected?.id) {
        const { data: msgs } = await (supabase as any).from('messages').select('*').eq('conversation_id', selected.id).order('created_at', { ascending: true })
        if (msgs) setMessages(prev => msgs.length !== prev.length ? msgs : prev)
      }
    }, 4000)

    return () => { supabase.removeChannel(ch); clearInterval(poll) }
  }, [companyId, selected?.id])

  const loadTeam = async (cid: string) => {
    const members: TeamMember[] = []
    // Company owner
    const { data: co } = await (supabase as any).from('companies').select('owner_id, name').eq('id', cid).maybeSingle()
    if (co?.owner_id) {
      members.push({ id: co.owner_id, user_id: co.owner_id, name: co.name ? `${co.name} (Owner)` : 'Owner', role: 'owner' })
    }
    // Team members
    const { data } = await (supabase as any).from('team_members').select('*').eq('company_id', cid)
    for (const m of data || []) {
      if (members.some(x => x.user_id === m.user_id)) continue
      members.push({
        id: m.id,
        user_id: m.user_id,
        name: m.name || m.display_name || m.email?.split('@')[0] || 'Team member',
        role: m.role || 'member',
      })
    }
    setTeamMembers(members)
  }

  // ── Select conversation ────────────────────────────────────────────────────
  const selectConversation = async (conv: Conversation) => {
    setSelected(conv)
    setAiDetected(null)
    setShowContactEdit(false)
    setReplyTo(null)
    setAiSummary((conv as any).ai_summary || '')
    setAiTodos((conv as any).ai_todos || [])
    // Load messages
    const { data: msgs } = await (supabase as any).from('messages').select('*').eq('conversation_id', conv.id).order('created_at', { ascending: true })
    setMessages(msgs || [])
    scrollBottom()
    // Mark read + stamp read receipt on visitor messages
    await (supabase as any).from('conversations').update({ is_unread: false, unread_count: 0 }).eq('id', conv.id)
    markMessagesRead(conv.id, msgs || [])
    // Load contact
    if (conv.contact_id) {
      const { data: c } = await (supabase as any).from('contacts').select('*').eq('id', conv.contact_id).maybeSingle()
      setContact(c || null)
      setEditContact(c || {})
    } else {
      setContact(null)
      setEditContact({})
    }
    // Load timeline events, notes, tasks
    loadConversationExtras(conv.id)
    // Load WooCommerce data if the contact's email matches an order
    loadWooData(conv.contact_id)
    // Scan messages for AI-detected info
    setTimeout(() => {
      const allText = (msgs || []).filter((m: Message) => m.sender_type === 'visitor').map((m: Message) => m.content).join(' ')
      const extracted = extractFromText(allText)
      if (extracted.phone || extracted.email || extracted.address) setAiDetected(extracted)
    }, 300)
  }

  const loadWooData = async (contactId: string | null) => {
    setWooCustomer(null)
    setWooOrders([])
    if (!companyId) return
    // Resolve the contact's email
    let email: string | null = null
    if (contactId) {
      const { data: c } = await (supabase as any).from('contacts').select('email').eq('id', contactId).maybeSingle()
      email = c?.email || null
    }
    if (!email) return
    // Match WooCommerce customer by email
    const { data: woo } = await (supabase as any).from('woocommerce_customers')
      .select('*').eq('company_id', companyId).ilike('email', email).maybeSingle()
    if (woo) setWooCustomer(woo)
    // Orders by email (covers guest orders too)
    const { data: orders } = await (supabase as any).from('woocommerce_orders')
      .select('*').eq('company_id', companyId).ilike('customer_email', email)
      .order('order_date', { ascending: false }).limit(50)
    setWooOrders(orders || [])
  }

  const loadConversationExtras = async (convId: string) => {
    const [{ data: evts }, { data: nts }, { data: tsks }] = await Promise.all([
      (supabase as any).from('conversation_events').select('*').eq('conversation_id', convId).order('created_at', { ascending: false }),
      (supabase as any).from('conversation_notes').select('*').eq('conversation_id', convId).order('created_at', { ascending: false }),
      (supabase as any).from('conversation_tasks').select('*').eq('conversation_id', convId).order('created_at', { ascending: false }),
    ])
    setEvents(evts || [])
    setNotes(nts || [])
    setTasks(tsks || [])
  }

  const logEvent = async (eventType: string, detail: string) => {
    if (!selected || !companyId) return
    const actorName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Agent'
    await (supabase as any).from('conversation_events').insert({
      conversation_id: selected.id, company_id: companyId, event_type: eventType, actor_name: actorName, detail,
    })
    loadConversationExtras(selected.id)
  }

  const markMessagesRead = async (convId: string, msgs: Message[]) => {
    const me = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Agent'
    const initial = me[0]?.toUpperCase() || 'A'
    // Stamp read_by on visitor messages that this agent hasn't marked yet
    for (const m of msgs) {
      if (m.sender_type !== 'visitor') continue
      const readBy = Array.isArray((m as any).read_by) ? (m as any).read_by : []
      if (readBy.some((r: any) => r.name === me)) continue
      const updated = [...readBy, { name: me, initial, at: new Date().toISOString() }]
      await (supabase as any).from('messages').update({ read_by: updated, is_read: true }).eq('id', m.id)
    }
  }

  // ── Reactions ──────────────────────────────────────────────────────────────
  const reactToMessage = async (msg: Message, emoji: string) => {
    const me = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Agent'
    const reactions = Array.isArray((msg as any).reactions) ? (msg as any).reactions : []
    const existing = reactions.findIndex((r: any) => r.emoji === emoji && r.by === me)
    let updated
    if (existing >= 0) {
      updated = reactions.filter((_: any, i: number) => i !== existing)
    } else {
      updated = [...reactions, { emoji, by: me, at: new Date().toISOString() }]
    }
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, reactions: updated } as any : m))
    setShowReactPicker(null)
    await (supabase as any).from('messages').update({ reactions: updated }).eq('id', msg.id)
  }

  // ── File upload ────────────────────────────────────────────────────────────
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !selected || !companyId) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const path = `${companyId}/${selected.id}/${Date.now()}-${file.name}`
        const { error: upErr } = await supabase.storage.from('chat-attachments').upload(path, file, { upsert: true })
        if (upErr) { console.error('Upload error:', upErr); continue }
        const { data: pub } = supabase.storage.from('chat-attachments').getPublicUrl(path)
        const url = pub.publicUrl
        const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file'
        const me = user?.user_metadata?.display_name || user?.email?.split('@')[0]
        await (supabase as any).from('messages').insert({
          conversation_id: selected.id, company_id: companyId, sender_type: 'agent',
          sender_id: user.id, sender_name: me, sender_email: user.email,
          content: kind === 'file' ? `📎 ${file.name}` : '',
          attachments: [{ url, name: file.name, type: file.type, kind }],
        })
      }
      await (supabase as any).from('conversations').update({ last_message: '📎 Attachment', last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', selected.id)
      const { data: msgs } = await (supabase as any).from('messages').select('*').eq('conversation_id', selected.id).order('created_at', { ascending: true })
      setMessages(msgs || [])
      scrollBottom()
    } catch (e) { console.error(e) }
    setUploading(false)
  }

  // ── Notes & Tasks ──────────────────────────────────────────────────────────
  const addNote = async () => {
    if (!newNote.trim() || !selected || !companyId) return
    const author = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Agent'
    await (supabase as any).from('conversation_notes').insert({ conversation_id: selected.id, company_id: companyId, author_name: author, content: newNote.trim() })
    setNewNote('')
    loadConversationExtras(selected.id)
  }
  const addTask = async () => {
    if (!newTask.trim() || !selected || !companyId) return
    await (supabase as any).from('conversation_tasks').insert({ conversation_id: selected.id, company_id: companyId, text: newTask.trim(), done: false })
    setNewTask('')
    loadConversationExtras(selected.id)
  }
  const toggleTask = async (task: any) => {
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, done: !t.done } : t))
    await (supabase as any).from('conversation_tasks').update({ done: !task.done }).eq('id', task.id)
  }

  // ── Sentiment ──────────────────────────────────────────────────────────────
  const setSentiment = async (sentiment: string) => {
    if (!selected) return
    setSelected(s => s ? { ...s, sentiment } as any : s)
    await (supabase as any).from('conversations').update({ sentiment }).eq('id', selected.id)
  }

  // ── Snooze ─────────────────────────────────────────────────────────────────
  const snoozeConversation = async (until: Date) => {
    if (!selected) return
    await (supabase as any).from('conversations').update({ snoozed_until: until.toISOString(), status: 'open' }).eq('id', selected.id)
    setShowSnooze(false)
    logEvent('snoozed', `Snoozed until ${until.toLocaleString()}`)
    loadConversations()
  }

  // ── Copy chat link ─────────────────────────────────────────────────────────
  const copyChatLink = () => {
    if (!selected) return
    const url = `${window.location.origin}/admin/inbox?conversation=${selected.id}`
    navigator.clipboard.writeText(url)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  // ── Send & close ───────────────────────────────────────────────────────────
  const sendAndClose = async () => {
    await sendReply()
    await setStatus('closed')
  }

  // ── Review request ─────────────────────────────────────────────────────────
  const sendReviewRequest = async () => {
    if (!selected || !companyId) return
    const me = user?.user_metadata?.display_name || user?.email?.split('@')[0]
    await (supabase as any).from('messages').insert({
      conversation_id: selected.id, company_id: companyId, sender_type: 'agent',
      sender_id: user.id, sender_name: me,
      content: "We'd love your feedback! Could you take a moment to leave us a review? ⭐",
    })
    await (supabase as any).from('conversations').update({ review_requested: true, last_message_at: new Date().toISOString() }).eq('id', selected.id)
    logEvent('review_request', 'Review request sent')
    const { data: msgs } = await (supabase as any).from('messages').select('*').eq('conversation_id', selected.id).order('created_at', { ascending: true })
    setMessages(msgs || [])
    scrollBottom()
  }

  // ── AI summary & todos ─────────────────────────────────────────────────────
  const generateAiSummary = async () => {
    if (!selected || messages.length === 0) return
    setGeneratingAi(true)
    try {
      const res = await fetch('/api/inbox/ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: selected.id,
          messages: messages.filter(m => m.sender_type !== 'system').map(m => ({ role: m.sender_type, content: m.content })),
        }),
      })
      const data = await res.json()
      if (data.summary) {
        setAiSummary(data.summary)
        setAiTodos(data.todos || [])
        await (supabase as any).from('conversations').update({ ai_summary: data.summary, ai_todos: data.todos || [] }).eq('id', selected.id)
      } else if (data.error) {
        setAiSummary('AI summary unavailable: ' + data.error)
      }
    } catch (e: any) {
      setAiSummary('Could not generate summary.')
    }
    setGeneratingAi(false)
  }

  // Re-scan messages for AI-detectable contact info whenever they change
  // (so a phone/address sent mid-conversation is picked up, not just on open)
  useEffect(() => {
    if (messages.length === 0) return
    const allText = messages.filter(m => m.sender_type === 'visitor').map(m => m.content).join(' ')
    const extracted = extractFromText(allText)
    // Only surface fields the contact doesn't already have
    const showPhone = extracted.phone && !contact?.phone
    const showEmail = extracted.email && !contact?.email
    const showAddress = extracted.address && !(contact as any)?.address
    if (showPhone || showEmail || showAddress) {
      setAiDetected({
        phone: showPhone ? extracted.phone : null,
        email: showEmail ? extracted.email : null,
        address: showAddress ? extracted.address : null,
      })
    }
  }, [messages, contact])

  const scrollBottom = () => setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)

  // ── Send reply ─────────────────────────────────────────────────────────────
  const sendReply = async () => {
    if (!reply.trim() || !selected || !user) return
    setSending(true)
    const content = reply.trim()
    const senderName = user.user_metadata?.display_name || user.email?.split('@')[0]

    // Send over SMS if the agent picked the SMS channel (visitor has a mobile)
    if (replyChannel === 'sms' && (selected as any).sms_number) {
      try {
        const res = await fetch('/api/telnyx/sms/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, conversationId: selected.id, to: (selected as any).sms_number, text: content, senderName }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'SMS failed')
        setReply(''); setReplyTo(null); setSending(false)
        // Reload messages (the send route logged it server-side)
        const { data: msgs } = await (supabase as any).from('messages').select('*').eq('conversation_id', selected.id).order('created_at', { ascending: true })
        setMessages(msgs || [])
        scrollBottom()
      } catch (e: any) {
        alert('SMS send failed: ' + e.message)
        setSending(false)
      }
      return
    }

    const msg = {
      conversation_id: selected.id,
      company_id: companyId,
      sender_type: 'agent',
      sender_id: user.id,
      sender_name: senderName,
      sender_email: user.email,
      content,
      attachments: [],
      metadata: {},
      reply_to: replyTo?.id || null,
      delivery_channel: 'chat',
    }
    await (supabase as any).from('messages').insert(msg)
    await (supabase as any).from('conversations').update({
      last_message: content,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', selected.id)
    setReply('')
    setReplyTo(null)
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
    if (member) logEvent('assigned', `Conversation assigned to ${member.name}`)
    else logEvent('assigned', 'Conversation unassigned')
    loadConversations()
  }

  // ── Update status ──────────────────────────────────────────────────────────
  const setStatus = async (status: string) => {
    if (!selected) return
    await (supabase as any).from('conversations').update({ status }).eq('id', selected.id)
    setSelected(s => s ? { ...s, status } : s)
    logEvent('status_change', `Status changed to ${status}`)
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
    } else if (selected && companyId) {
      // No contact record yet — create one so the detected field is saved
      const contactName = selected.subject || messages.find(m => m.sender_type === 'visitor')?.sender_name || 'Visitor'
      const { data: newContact } = await (supabase as any).from('contacts').insert({
        company_id: companyId,
        name: contactName,
        [field]: value,
      }).select().maybeSingle()
      if (newContact) {
        setContact(newContact)
        setEditContact(newContact)
        // Link the conversation to the new contact
        await (supabase as any).from('conversations').update({ contact_id: newContact.id }).eq('id', selected.id)
        setSelected(s => s ? { ...s, contact_id: newContact.id } as any : s)
      }
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
      <IncomingCallListener companyId={companyId} agentName={user?.user_metadata?.display_name || user?.email?.split('@')[0]} />

      {/* ── LEFT: Conversation list ─────────────────────────────────────────── */}
      {sidebarCollapsed ? (
        <div style={{ width: 48, flexShrink: 0, borderRight: '1px solid var(--border)', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 14 }}>
          <button type="button" onClick={() => setSidebarCollapsed(false)} title="Expand sidebar"
            style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--slate)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          {conversations.filter(c => c.is_unread).length > 0 && (
            <span style={{ marginTop: 10, fontSize: 10, fontWeight: 700, background: 'var(--coral)', color: '#fff', width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {conversations.filter(c => c.is_unread).length}
            </span>
          )}
        </div>
      ) : (
      <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: '#fff' }}>
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--ink)' }}>Inbox</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--peach)', color: 'var(--coral)', padding: '2px 8px', borderRadius: 20 }}>
                {conversations.filter(c => c.is_unread).length} unread
              </span>
              <button type="button" onClick={() => setSidebarCollapsed(true)} title="Collapse sidebar"
                style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--slate)' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
            </div>
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
      )}

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
              {/* Search messages toggle */}
              <button type="button" onClick={() => { setShowMsgSearch(v => !v); setMsgSearch('') }} title="Search messages"
                style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: showMsgSearch ? 'var(--peach)' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--slate)', order: -1 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {contact?.name || selected.subject || 'Visitor'}
                  {/* Sentiment badge */}
                  {(selected as any).sentiment && (
                    <span style={{ fontSize: 14 }} title={`${(selected as any).sentiment} experience`}>
                      {(selected as any).sentiment === 'positive' ? '😊' : (selected as any).sentiment === 'negative' ? '😞' : '😐'}
                    </span>
                  )}
                </p>
                {selected.page_title && <p style={{ margin: 0, fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>On: {selected.page_title}</p>}
              </div>

              {/* Browser calling (Telnyx WebRTC) */}
              {(contact?.phone || (selected as any).sms_number) && (
                <CallBar
                  companyId={companyId}
                  toNumber={contact?.phone || (selected as any).sms_number}
                  contactName={contact?.name}
                  contactId={contact?.id}
                  conversationId={selected.id}
                  agentName={user?.user_metadata?.display_name || user?.email?.split('@')[0]}
                />
              )}

              {/* Sentiment picker */}
              <div style={{ display: 'flex', gap: 2 }}>
                {[['positive', '😊'], ['neutral', '😐'], ['negative', '😞']].map(([s, e]) => (
                  <button key={s} type="button" onClick={() => setSentiment(s)} title={`Mark ${s}`}
                    style={{ width: 28, height: 28, borderRadius: 7, border: (selected as any).sentiment === s ? '1.5px solid var(--coral)' : '1px solid var(--border)', background: (selected as any).sentiment === s ? 'var(--peach)' : '#fff', cursor: 'pointer', fontSize: 14, padding: 0 }}>{e}</button>
                ))}
              </div>

              {/* Status pill */}
              <div style={{ position: 'relative' }}>
                <select value={selected.status} onChange={e => setStatus(e.target.value)}
                  style={{ fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 8, border: 'none', background: STATUS_COLOR[selected.status]?.bg || '#f3f4f6', color: STATUS_COLOR[selected.status]?.color || '#6b7280', cursor: 'pointer', appearance: 'none' }}>
                  {Object.entries(STATUS_COLOR).map(([k, v]) => <option key={k} value={k}>{v.color && k.charAt(0).toUpperCase() + k.slice(1)}</option>)}
                </select>
              </div>
              {/* Assign button */}
              <div style={{ position: 'relative' }} data-assign-menu>
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

              {/* More actions: snooze, copy link, merge */}
              <div style={{ position: 'relative' }} data-actions-menu>
                <button type="button" onClick={() => setShowActions(v => !v)} title="More actions"
                  style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--slate)', fontSize: 16, lineHeight: 1 }}>⋯</button>
                {showActions && (
                  <div style={{ position: 'absolute', top: '110%', right: 0, width: 190, background: '#fff', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.12)', zIndex: 50, overflow: 'hidden' }}>
                    <button type="button" onClick={() => { setShowActions(false); setShowSnooze(true) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                      💤 Snooze
                    </button>
                    <button type="button" onClick={() => { copyChatLink(); setShowActions(false) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                      🔗 {linkCopied ? 'Copied!' : 'Copy chat link'}
                    </button>
                    <button type="button" onClick={() => { setShowActions(false); alert('Select another conversation to merge into this one — coming from the list soon.') }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                      🔀 Merge conversation
                    </button>
                    <button type="button" onClick={() => { generateAiSummary(); setActivePanel('info'); setShowActions(false) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)', borderTop: '1px solid var(--border)' }}>
                      ✨ AI summary & to-dos
                    </button>
                  </div>
                )}
              </div>

              {/* Snooze menu */}
              {showSnooze && (
                <div style={{ position: 'absolute', top: 54, right: 16, width: 200, background: '#fff', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.14)', zIndex: 60, overflow: 'hidden' }}>
                  <p style={{ margin: 0, padding: '10px 14px 6px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Snooze until</p>
                  {[['1 hour', 1], ['3 hours', 3], ['Tomorrow', 24], ['Next week', 168]].map(([label, hrs]) => (
                    <button key={label as string} type="button" onClick={() => snoozeConversation(new Date(Date.now() + (hrs as number) * 3600000))}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                      {label}
                    </button>
                  ))}
                  <button type="button" onClick={() => setShowSnooze(false)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', borderTop: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: 13, color: '#9ca3af' }}>Cancel</button>
                </div>
              )}
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

            {/* Message search bar */}
            {showMsgSearch && (
              <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--canvas)' }}>
                <input autoFocus value={msgSearch} onChange={e => setMsgSearch(e.target.value)}
                  placeholder="Search in this conversation…"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none' }} />
                {msgSearch && (
                  <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--slate)' }}>
                    {messages.filter(m => (m.content || '').toLowerCase().includes(msgSearch.toLowerCase())).length} match(es)
                  </p>
                )}
              </div>
            )}

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {(msgSearch ? messages.filter(m => (m.content || '').toLowerCase().includes(msgSearch.toLowerCase())) : messages).map(msg => {
                const isAgent = msg.sender_type === 'agent'
                const isSystem = msg.sender_type === 'system'
                if (isSystem) return (
                  <div key={msg.id} style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', padding: '4px 0' }}>
                    <span style={{ background: '#f3f4f6', padding: '3px 10px', borderRadius: 20 }}>{msg.content}</span>
                  </div>
                )
                const reactions = Array.isArray((msg as any).reactions) ? (msg as any).reactions : []
                const readBy = Array.isArray((msg as any).read_by) ? (msg as any).read_by : []
                const atts = Array.isArray(msg.attachments) ? msg.attachments : []
                const repliedMsg = (msg as any).reply_to ? messages.find(m => m.id === (msg as any).reply_to) : null
                // Group reactions by emoji
                const reactionCounts: Record<string, number> = {}
                reactions.forEach((r: any) => { reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1 })
                return (
                  <div key={msg.id} className="chat-msg-row" style={{ display: 'flex', justifyContent: isAgent ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-end', position: 'relative' }}>
                    {!isAgent && (
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--peach)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--coral)', flexShrink: 0 }}>
                        {(contact?.name || msg.sender_name || 'V')[0].toUpperCase()}
                      </div>
                    )}
                    <div style={{ maxWidth: '70%', position: 'relative' }}
                      onMouseEnter={() => setShowReactPicker(null)}>
                      {!isAgent && <p style={{ margin: '0 0 3px 4px', fontSize: 10, color: '#9ca3af' }}>{msg.sender_name || 'Visitor'}</p>}

                      {/* Reply-to quote */}
                      {repliedMsg && (
                        <div style={{ fontSize: 11, color: '#6b7280', borderLeft: '3px solid var(--coral)', padding: '2px 8px', marginBottom: 3, background: 'var(--canvas)', borderRadius: 4, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          ↩ {repliedMsg.sender_name}: {repliedMsg.content.slice(0, 50)}
                        </div>
                      )}

                      <div style={{
                        padding: atts.length && atts[0].kind !== 'file' ? 4 : '10px 14px',
                        borderRadius: isAgent ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        background: isAgent ? 'var(--coral)' : '#fff',
                        color: isAgent ? '#fff' : 'var(--ink)',
                        fontSize: 13, lineHeight: 1.5,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                        border: isAgent ? 'none' : '1px solid var(--border)',
                        position: 'relative',
                      }}>
                        {/* Attachments */}
                        {atts.map((a: any, ai: number) => (
                          <div key={ai} style={{ marginBottom: a.kind !== 'file' && msg.content ? 6 : 0 }}>
                            {a.kind === 'image' ? (
                              <img src={a.url} alt={a.name} style={{ maxWidth: 240, maxHeight: 240, borderRadius: 10, display: 'block', cursor: 'pointer' }} onClick={() => window.open(a.url, '_blank')} />
                            ) : a.kind === 'video' ? (
                              <video src={a.url} controls style={{ maxWidth: 240, borderRadius: 10, display: 'block' }} />
                            ) : (
                              <a href={a.url} target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', gap: 8, color: isAgent ? '#fff' : 'var(--coral)', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
                                📎 {a.name}
                              </a>
                            )}
                          </div>
                        ))}
                        {msg.content && <div style={{ padding: atts.length && atts[0].kind !== 'file' ? '4px 10px 6px' : 0 }}>{msg.content}</div>}
                      </div>

                      {/* Reactions */}
                      {Object.keys(reactionCounts).length > 0 && (
                        <div style={{ display: 'flex', gap: 4, marginTop: 3, justifyContent: isAgent ? 'flex-end' : 'flex-start' }}>
                          {Object.entries(reactionCounts).map(([emoji, count]) => (
                            <span key={emoji} onClick={() => reactToMessage(msg, emoji)}
                              style={{ fontSize: 12, background: '#fff', border: '1px solid var(--border)', borderRadius: 20, padding: '1px 7px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
                              {emoji} {count > 1 ? count : ''}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Timestamp + read receipt */}
                      <p style={{ margin: '3px 0 0', fontSize: 10, color: '#9ca3af', textAlign: isAgent ? 'right' : 'left', display: 'flex', gap: 5, alignItems: 'center', justifyContent: isAgent ? 'flex-end' : 'flex-start' }}>
                        {fmtReceipt(msg.created_at, isAgent, selected.channel)}
                        {/* Read-by avatars on visitor messages */}
                        {!isAgent && readBy.length > 0 && (
                          <span style={{ display: 'inline-flex', gap: 2, marginLeft: 2 }}>
                            {readBy.slice(0, 3).map((r: any, ri: number) => (
                              <span key={ri} title={`Read by ${r.name}`} style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--coral)', color: '#fff', fontSize: 8, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                {r.initial}
                              </span>
                            ))}
                          </span>
                        )}
                      </p>

                      {/* Hover actions: react + reply */}
                      <div className="chat-msg-actions" style={{ position: 'absolute', top: -10, [isAgent ? 'left' : 'right']: -8, display: 'flex', gap: 2, background: '#fff', borderRadius: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.12)', padding: '2px 4px', opacity: 0, transition: 'opacity 0.12s', pointerEvents: 'none' } as any}>
                        <button type="button" onClick={() => setShowReactPicker(showReactPicker === msg.id ? null : msg.id)}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, padding: '2px 4px' }} title="React">😊</button>
                        <button type="button" onClick={() => { setReplyTo(msg); textareaRef.current?.focus() }}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, padding: '2px 4px' }} title="Reply">↩</button>
                      </div>

                      {/* Reaction picker */}
                      {showReactPicker === msg.id && (
                        <div data-react-picker style={{ position: 'absolute', top: -44, [isAgent ? 'right' : 'left']: 0, display: 'flex', gap: 2, background: '#fff', borderRadius: 24, boxShadow: '0 4px 16px rgba(0,0,0,0.16)', padding: '5px 8px', zIndex: 20 } as any}>
                          {EMOJIS.slice(0, 8).map(e => (
                            <button key={e} type="button" onClick={() => reactToMessage(msg, e)}
                              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 17, padding: 2, borderRadius: 6 }}
                              onMouseEnter={(ev: any) => ev.currentTarget.style.background = 'var(--canvas)'}
                              onMouseLeave={(ev: any) => ev.currentTarget.style.background = 'none'}>{e}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    {isAgent && (
                      companyInfo?.logo_url ? (
                        <img src={companyInfo.logo_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={(e: any) => { e.target.style.display = 'none' }} />
                      ) : (
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: companyInfo?.accent_color || 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                          {(companyInfo?.name || msg.sender_name || 'A')[0].toUpperCase()}
                        </div>
                      )
                    )}
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            <style>{`.chat-msg-row:hover .chat-msg-actions { opacity: 1 !important; pointer-events: auto !important; }`}</style>

            {/* Reply box */}
            <div style={{ padding: '10px 14px', background: '#fff', borderTop: '1px solid var(--border)', position: 'relative' }}>
              {/* Reply-to preview */}
              {replyTo && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--canvas)', borderRadius: 8, marginBottom: 8, borderLeft: '3px solid var(--coral)' }}>
                  <span style={{ fontSize: 12, color: '#6b7280', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    ↩ Replying to {replyTo.sender_name}: {replyTo.content.slice(0, 50)}
                  </span>
                  <button type="button" onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 14 }}>✕</button>
                </div>
              )}

              {/* Emoji picker */}
              {showEmoji && (
                <div style={{ position: 'absolute', bottom: '100%', left: 14, marginBottom: 8, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, background: '#fff', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', padding: 10, zIndex: 30 }}>
                  {EMOJIS.map(e => (
                    <button key={e} type="button" onClick={() => { setReply(r => r + e); setShowEmoji(false) }}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, padding: 4, borderRadius: 6 }}
                      onMouseEnter={(ev: any) => ev.currentTarget.style.background = 'var(--canvas)'}
                      onMouseLeave={(ev: any) => ev.currentTarget.style.background = 'none'}>{e}</button>
                  ))}
                </div>
              )}

              <textarea ref={textareaRef} value={reply} onChange={e => setReply(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                placeholder="Type a reply… (Enter to send, Shift+Enter for new line)"
                rows={3}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 8 }} />

              <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" style={{ display: 'none' }}
                onChange={e => { handleFileUpload(e.target.files); e.target.value = '' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {/* Channel toggle — appears when the visitor gave a mobile number */}
                  {(selected as any).sms_number && (
                    <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginRight: 4 }}>
                      <button type="button" onClick={() => setReplyChannel('chat')}
                        style={{ padding: '6px 10px', border: 'none', background: replyChannel === 'chat' ? 'var(--coral)' : '#fff', color: replyChannel === 'chat' ? '#fff' : 'var(--slate)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>💬 Chat</button>
                      <button type="button" onClick={() => setReplyChannel('sms')}
                        style={{ padding: '6px 10px', border: 'none', background: replyChannel === 'sms' ? 'var(--coral)' : '#fff', color: replyChannel === 'sms' ? '#fff' : 'var(--slate)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>📱 SMS</button>
                    </div>
                  )}
                  {/* Attach */}
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Attach file"
                    style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--slate)' }}>
                    {uploading ? '⏳' : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>}
                  </button>
                  {/* Emoji */}
                  <button type="button" onClick={() => setShowEmoji(v => !v)} title="Emoji"
                    style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: 15 }}>😊</button>
                  {/* Review request */}
                  <button type="button" onClick={sendReviewRequest} title="Send review request"
                    style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--slate)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    ⭐ Review
                  </button>
                  {/* Resolve */}
                  <button type="button" onClick={() => setStatus('resolved')}
                    style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid #059669', background: '#dcfce7', color: '#059669', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    ✓ Resolve
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" onClick={sendAndClose} disabled={sending || !reply.trim()}
                    style={{ padding: '8px 14px', borderRadius: 10, background: '#fff', color: reply.trim() ? 'var(--ink)' : '#9ca3af', border: '1px solid var(--border)', fontSize: 13, fontWeight: 600, cursor: reply.trim() ? 'pointer' : 'default' }}>
                    Send & Close
                  </button>
                  <button type="button" onClick={sendReply} disabled={sending || !reply.trim()}
                    style={{ padding: '8px 20px', borderRadius: 10, background: reply.trim() ? 'var(--coral)' : '#e5e7eb', color: reply.trim() ? '#fff' : '#9ca3af', border: 'none', fontSize: 13, fontWeight: 700, cursor: reply.trim() ? 'pointer' : 'default', transition: 'all 0.15s' }}>
                    {sending ? 'Sending…' : 'Send →'}
                  </button>
                </div>
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
            {(['info', 'timeline', ...(wooCustomer || wooOrders.length > 0 ? ['orders' as const] : [])] as const).map(p => (
              <button key={p} type="button" onClick={() => setActivePanel(p)}
                style={{ flex: 1, padding: '11px 0', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: activePanel === p ? 700 : 500, color: activePanel === p ? 'var(--coral)' : 'var(--slate)', borderBottom: activePanel === p ? '2px solid var(--coral)' : '2px solid transparent', textTransform: 'capitalize' }}>
                {p === 'info' ? 'Information' : p === 'timeline' ? 'Timeline' : '🛒 Orders'}
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
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--ink)' }}>{fmtDateTime(selected.updated_at)}</p>
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

            {activePanel === 'timeline' && (
              <>
                {/* AI Summary & To-dos */}
                <div style={{ marginBottom: 18, padding: '12px 14px', borderRadius: 10, background: 'linear-gradient(135deg, #faf5ff, #f3e8ff)', border: '1px solid #e9d5ff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#7c3aed' }}>✨ AI Summary</h3>
                    <button type="button" onClick={generateAiSummary} disabled={generatingAi}
                      style={{ fontSize: 11, color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                      {generatingAi ? 'Thinking…' : aiSummary ? 'Regenerate' : 'Generate'}
                    </button>
                  </div>
                  {aiSummary ? (
                    <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.5 }}>{aiSummary}</p>
                  ) : (
                    <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>Generate a summary and action items for this conversation.</p>
                  )}
                  {aiTodos.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <p style={{ margin: '0 0 5px', fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>To-dos</p>
                      {aiTodos.map((t: any, i: number) => (
                        <label key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 12, color: 'var(--ink)', marginBottom: 4, cursor: 'pointer' }}>
                          <input type="checkbox" checked={!!t.done} onChange={() => {
                            const upd = aiTodos.map((x: any, xi: number) => xi === i ? { ...x, done: !x.done } : x)
                            setAiTodos(upd)
                            ;(supabase as any).from('conversations').update({ ai_todos: upd }).eq('id', selected.id)
                          }} style={{ marginTop: 2 }} />
                          <span style={{ textDecoration: t.done ? 'line-through' : 'none', opacity: t.done ? 0.6 : 1 }}>{t.text}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* Timeline events */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Timeline</h3>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>Showing: All</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 18, position: 'relative' }}>
                  {/* Quick actions */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 12, marginTop: 6, flexWrap: 'wrap' }}>
                    <button type="button" onClick={sendReviewRequest} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--slate)', fontWeight: 600 }}>⭐ Send review request</button>
                  </div>
                  {events.length === 0 ? (
                    <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>No timeline events yet.</p>
                  ) : (
                    events.map((ev, i) => {
                      const d = new Date(ev.created_at)
                      return (
                        <div key={ev.id} style={{ display: 'flex', gap: 10, paddingBottom: 14, position: 'relative' }}>
                          {/* Timeline dot + line */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                            <div style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--coral)', marginTop: 3 }} />
                            {i < events.length - 1 && <div style={{ width: 1.5, flex: 1, background: 'var(--border)', marginTop: 2 }} />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 10, color: '#9ca3af' }}>{d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--ink)' }}>{ev.detail}</p>
                            {ev.actor_name && <p style={{ margin: '1px 0 0', fontSize: 11, color: '#9ca3af' }}>by {ev.actor_name}</p>}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                {/* Notes */}
                <div style={{ marginBottom: 18 }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Notes</h3>
                  {notes.length === 0 && <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 8px' }}>No notes.</p>}
                  {notes.map(n => (
                    <div key={n.id} style={{ padding: '8px 10px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', marginBottom: 6 }}>
                      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink)' }}>{n.content}</p>
                      <p style={{ margin: '3px 0 0', fontSize: 10, color: '#9ca3af' }}>{n.author_name} · {new Date(n.created_at).toLocaleDateString()}</p>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <input value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addNote() }}
                      placeholder="Add a note…" style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, outline: 'none' }} />
                    <button type="button" onClick={addNote} style={{ padding: '7px 12px', borderRadius: 8, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Add</button>
                  </div>
                </div>

                {/* Tasks */}
                <div style={{ marginBottom: 18 }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Tasks</h3>
                  {tasks.length === 0 && <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 8px' }}>No tasks.</p>}
                  {tasks.map(t => (
                    <label key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, marginBottom: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={t.done} onChange={() => toggleTask(t)} style={{ marginTop: 2 }} />
                      <span style={{ textDecoration: t.done ? 'line-through' : 'none', opacity: t.done ? 0.6 : 1, color: 'var(--ink)' }}>{t.text}</span>
                    </label>
                  ))}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <input value={newTask} onChange={e => setNewTask(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTask() }}
                      placeholder="Add a task…" style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, outline: 'none' }} />
                    <button type="button" onClick={addTask} style={{ padding: '7px 12px', borderRadius: 8, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Add</button>
                  </div>
                </div>

                {/* Page history */}
                <div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Page History</h3>
                  {(!selected.page_history || selected.page_history.length === 0) ? (
                    <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>No page history recorded yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[...selected.page_history].reverse().map((h: any, i: number) => (
                        <div key={i} style={{ padding: '9px 12px', borderRadius: 8, background: 'var(--canvas)', border: i === 0 ? '1.5px solid var(--coral)' : '1px solid var(--border)' }}>
                          {i === 0 && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--coral)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 3 }}>Current</span>}
                          <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.title || 'Untitled'}</p>
                          <a href={h.url} target="_blank" rel="noopener" style={{ fontSize: 11, color: 'var(--coral)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{h.url}</a>
                          <p style={{ margin: '3px 0 0', fontSize: 10, color: '#9ca3af' }}>{fmtTime(h.ts)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {activePanel === 'orders' && (
              <>
                {/* WooCommerce customer summary */}
                {wooCustomer && (
                  <div style={{ marginBottom: 16, padding: '14px 16px', borderRadius: 12, background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', border: '1px solid #ddd6fe' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 16 }}>🛒</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#6d28d9' }}>WooCommerce Customer</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Total Spend</p>
                        <p style={{ margin: '2px 0 0', fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>
                          {(() => {
                            const spend = (parseFloat(wooCustomer.total_spend) || 0) || wooOrders.reduce((s, o) => s + (parseFloat(o.total) || 0), 0)
                            return spend > 0 ? `$${spend.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A'
                          })()}
                        </p>
                      </div>
                      <div>
                        <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Orders</p>
                        <p style={{ margin: '2px 0 0', fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{wooCustomer.total_orders || wooOrders.length || 0}</p>
                      </div>
                    </div>
                    {contact?.id && (
                      <a href={`/admin/customers/profile?id=${contact.id}`} style={{ display: 'inline-block', marginTop: 10, fontSize: 12, color: '#6d28d9', fontWeight: 600, textDecoration: 'none' }}>
                        View full profile →
                      </a>
                    )}
                  </div>
                )}

                {/* Order history */}
                <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Order History ({wooOrders.length})</h3>
                {wooOrders.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>No orders found for this customer's email.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {wooOrders.map(o => (
                      <div key={o.id} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>#{o.woo_order_id}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--coral)' }}>${(parseFloat(o.total) || 0).toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 6, background: o.status === 'completed' ? '#dcfce7' : '#fef3c7', color: o.status === 'completed' ? '#059669' : '#d97706', fontWeight: 600, textTransform: 'capitalize' }}>{o.status}</span>
                          <span style={{ fontSize: 11, color: '#9ca3af' }}>{o.order_date ? new Date(o.order_date).toLocaleDateString('en-AU') : ''}</span>
                        </div>
                        {Array.isArray(o.line_items) && o.line_items.length > 0 && (
                          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                            {o.line_items.slice(0, 3).map((li: any, i: number) => (
                              <p key={i} style={{ margin: '2px 0', fontSize: 11, color: 'var(--slate)' }}>{li.quantity}× {li.name}</p>
                            ))}
                            {o.line_items.length > 3 && <p style={{ margin: '2px 0', fontSize: 11, color: '#9ca3af' }}>+{o.line_items.length - 3} more</p>}
                          </div>
                        )}
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
