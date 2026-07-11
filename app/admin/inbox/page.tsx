'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import CallBar from '@/components/CallBar'
import MediaGallery, { MediaItem } from '@/components/MediaGallery'
import DoaPanel from '@/components/DoaPanel'
import CreateOrderPanel from '@/components/CreateOrderPanel'
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

// Inline SVG icons (replace emojis for a cleaner, consistent look).
const svg = (path: React.ReactNode, size = 15) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>{path}</svg>
)
const AiSparkIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/>
  </svg>
)
const Icon = {
  cart: (s?: number) => svg(<><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></>, s),
  poll: (s?: number) => svg(<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>, s),
  survey: (s?: number) => svg(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>, s),
  form: (s?: number) => svg(<><path d="M9 11H3v10h6zM21 3h-6v18h6zM15 7H9v14h6z"/></>, s),
  payment: (s?: number) => svg(<><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></>, s),
  coupon: (s?: number) => svg(<><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></>, s),
  ticket: (s?: number) => svg(<><path d="M3 5h18a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7a2 2 0 0 1 2-2z"/></>, s),
  edit: (s?: number) => svg(<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></>, s),
  media: (s?: number) => svg(<><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></>, s),
  box: (s?: number) => svg(<><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>, s),
  refund: (s?: number) => svg(<><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></>, s),
  shield: (s?: number) => svg(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>, s),
  calendar: (s?: number) => svg(<><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>, s),
  star: (s?: number) => svg(<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>, s),
  attach: (s?: number) => svg(<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>, s),
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
// Returns "Today" / "Yesterday" / "12 Jul 2026" for a date divider
function dayLabel(d: string | undefined | null) {
  if (!d) return ''
  const s = typeof d === 'string' ? d : String(d)
  const parsed = new Date(s.endsWith?.('Z') ? s : s + 'Z')
  if (isNaN(parsed.getTime())) return ''
  const today = new Date()
  const yest = new Date(); yest.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (sameDay(parsed, today)) return 'Today'
  if (sameDay(parsed, yest)) return 'Yesterday'
  return parsed.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtDateTime(d: string | undefined | null) {
  if (!d) return ''
  const parsed = new Date(d)
  if (isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString()
}

// Simple AI extraction — looks for phone, email, address patterns in message
function extractFromText(text: string) {
  // Strip out anything that looks like a UUID or long hex id first — interactive
  // form responses embed UUIDs (e.g. 848f5356-cfc5-4610-8076-89984eff0d9f) whose
  // digit runs were being misdetected as phone numbers.
  const cleaned = text
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ' ')
    .replace(/\b[0-9a-f]{16,}\b/gi, ' ')
  // Phone: Australian mobiles (0435 844 469 / +61 435 844 469), landlines.
  // Requires the candidate to be a plausible standalone phone, not embedded in
  // a longer alphanumeric token.
  let phone: string | null = null
  const phoneCandidates = cleaned.match(/(?:\+?\d[\d\s\-().]{6,18}\d)/g) || []
  for (const cand of phoneCandidates) {
    const digits = cand.replace(/\D/g, '')
    // AU numbers are 9 (landline w/o 0), 10 (04xx / 0x), or 11-12 (+61…). Reject
    // the odd lengths that hex fragments produce.
    if (digits.length < 8 || digits.length > 12) continue
    // Reject if the surrounding text shows it's part of a hex/UUID token
    if (/[a-f]/i.test(cand.replace(/[\s\-().+]/g, ''))) continue
    phone = cand.replace(/\s+/g, ' ').trim(); break
  }
  const email = cleaned.match(/[\w.+-]+@[\w-]+\.\w+/)?.[0] || null
  let address = cleaned.match(/\d+[A-Za-z]?[/-]?\d*\s+[A-Za-z0-9\s,.'-]+?(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Place|Pl|Court|Ct|Way|Boulevard|Blvd|Crescent|Cres|Terrace|Tce|Parade|Pde|Close|Cl|Highway|Hwy)\b[A-Za-z0-9\s,.'-]*/i)?.[0]?.trim() || null
  // If we found a street address, try to extend it with a trailing AU
  // suburb + state + 4-digit postcode (e.g. "Richmond VIC 3121").
  if (address) {
    const idx = cleaned.indexOf(address)
    if (idx !== -1) {
      const tail = cleaned.slice(idx, idx + address.length + 40)
      const withState = tail.match(new RegExp(address.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "[A-Za-z0-9\\s,.'-]*?\\b(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\\b\\s*\\d{4}", 'i'))
      if (withState?.[0]) address = withState[0].replace(/\s+/g, ' ').trim()
    }
  }
  return { phone: phone || null, email: email || null, address: address || null }
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function InboxPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [companyInfo, setCompanyInfo] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const selectedRef = useRef<Conversation | null>(null)
  const [showMergePicker, setShowMergePicker] = useState(false)
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null)
  const [showDoa, setShowDoa] = useState(false)
  const [doaMatch, setDoaMatch] = useState(false)
  const [convActions, setConvActions] = useState<Record<string, any>>({})
  const [showActionMenu, setShowActionMenu] = useState(false)
  const [showMediaRequest, setShowMediaRequest] = useState(false)
  const [mrPrompt, setMrPrompt] = useState('')
  const [mrAccept, setMrAccept] = useState<string[]>(['image', 'video', 'pdf'])
  const [mrMaxFiles, setMrMaxFiles] = useState('10')
  const [mrExpiry, setMrExpiry] = useState('168')
  const [mrSaving, setMrSaving] = useState(false)
  const [showTicketPanel, setShowTicketPanel] = useState(false)
  const [showCreateOrder, setShowCreateOrder] = useState(false)
  const [orderPrefillCart, setOrderPrefillCart] = useState<any>(null)
  const [showCoupon, setShowCoupon] = useState(false)
  const [editOrder, setEditOrder] = useState<any>(null)
  const [editOrderData, setEditOrderData] = useState<any>(null)
  const [editOrderLoading, setEditOrderLoading] = useState(false)
  const [editOrderSaving, setEditOrderSaving] = useState(false)
  const [showMediaPicker, setShowMediaPicker] = useState(false)
  const [galleryFolders, setGalleryFolders] = useState<any[]>([])
  const [galleryItems, setGalleryItems] = useState<any[]>([])
  const [galleryFolder, setGalleryFolder] = useState<string | null>(null)
  const [gallerySearch, setGallerySearch] = useState('')
  const [gallerySelected, setGallerySelected] = useState<Set<string>>(new Set())
  const [couponAmount, setCouponAmount] = useState('')
  const [couponType, setCouponType] = useState<'fixed' | 'percent'>('fixed')
  const [couponCode, setCouponCode] = useState('')
  const [couponOneTime, setCouponOneTime] = useState(true)
  const [couponExpiry, setCouponExpiry] = useState('')
  const [couponSaving, setCouponSaving] = useState(false)
  const [ticketSubject, setTicketSubject] = useState('')
  const [ticketDesc, setTicketDesc] = useState('')
  const [ticketPriority, setTicketPriority] = useState('normal')
  const [ticketSaving, setTicketSaving] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [contact, setContact] = useState<Contact | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [msgSearch, setMsgSearch] = useState('')
  const [showMsgSearch, setShowMsgSearch] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  // On phones we show one pane at a time: the conversation list, the open
  // thread, or the contact panel. Desktop shows all three side by side.
  const [mobilePane, setMobilePane] = useState<'list' | 'thread' | 'contact'>('list')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  const [replyChannel, setReplyChannel] = useState<'chat' | 'sms'>('chat')
  const [showSendMenu, setShowSendMenu] = useState(false)
  const [sendPicker, setSendPicker] = useState<'poll' | 'survey' | 'form' | 'payment' | null>(null)
  const [pickerItems, setPickerItems] = useState<any[]>([])
  const [payAmount, setPayAmount] = useState('')
  const [payDesc, setPayDesc] = useState('')
  const [toast, setToast] = useState('')
  const [editField, setEditField] = useState<string | null>(null)
  const [editFieldValue, setEditFieldValue] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'assigned' | 'resolved'>('open')
  const [showAssignMenu, setShowAssignMenu] = useState(false)
  const [showContactEdit, setShowContactEdit] = useState(false)
  const [editContact, setEditContact] = useState<Partial<Contact>>({})
  const [aiDetected, setAiDetected] = useState<{ phone?: string | null; email?: string | null; address?: string | null } | null>(null)
  const [aiSavedFields, setAiSavedFields] = useState<Set<string>>(new Set())
  const [savingContact, setSavingContact] = useState(false)
  const [activePanel, setActivePanel] = useState<'info' | 'timeline' | 'orders'>('info')
  const [wooCustomer, setWooCustomer] = useState<any>(null)
  const [wooOrders, setWooOrders] = useState<any[]>([])
  const [abandonedCarts, setAbandonedCarts] = useState<any[]>([])
  const [orderSearch, setOrderSearch] = useState('')
  const [orderDateFrom, setOrderDateFrom] = useState('')
  const [orderDateTo, setOrderDateTo] = useState('')
  const [showOrderSearch, setShowOrderSearch] = useState(false)
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
      const { data: ci } = await (supabase as any).from('companies').select('name, logo_url, accent_color, slug, conversation_actions').eq('id', cid).maybeSingle()
      if (ci) { setCompanyInfo(ci); setConvActions(ci.conversation_actions || {}) }
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
    // On first load (desktop), OPEN the top conversation — including its messages
    // and contact — instead of just highlighting it (which left the pane blank).
    if (data && data.length > 0 && !selectedRef.current && typeof window !== 'undefined' && window.innerWidth >= 768) {
      selectConversation(data[0])
    }
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
  const mergeConversation = async (sourceId: string) => {
    // Merge the picked conversation INTO the currently selected one: move its
    // messages over, then archive the source.
    if (!selected?.id || sourceId === selected.id) return
    try {
      await (supabase as any).from('messages').update({ conversation_id: selected.id }).eq('conversation_id', sourceId)
      await (supabase as any).from('conversations').update({ status: 'resolved', is_archived: true, merged_into: selected.id }).eq('id', sourceId)
      setShowMergePicker(false)
      showToast('Conversations merged')
      await loadConversations()
      selectConversation(selected)
    } catch (e: any) {
      showToast('Could not merge: ' + e.message)
    }
  }

  const selectConversation = async (conv: Conversation) => {
    setSelected(conv)
    selectedRef.current = conv
    setMobilePane('thread')
    setAiDetected(null)
    // Restore which fields AI auto-saved for this contact (for the badge).
    try {
      const store = JSON.parse(localStorage.getItem('colvy-ai-saved') || '{}')
      setAiSavedFields(new Set(store[conv.contact_id] || []))
    } catch { setAiSavedFields(new Set()) }
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
    setShowDoa(false); setDoaMatch(false)
    if (conv.contact_id) {
      const { data: c } = await (supabase as any).from('contacts').select('*').eq('id', conv.contact_id).maybeSingle()
      setContact(c || null)
      setEditContact(c || {})
      // Source of truth for the AI badge is the contact's ai_saved_fields column
      // (works across devices). Merge with any localStorage marks.
      try {
        const store = JSON.parse(localStorage.getItem('colvy-ai-saved') || '{}')
        const local = store[conv.contact_id] || []
        setAiSavedFields(new Set([...(c?.ai_saved_fields || []), ...local]))
      } catch { setAiSavedFields(new Set(c?.ai_saved_fields || [])) }
      // Does this contact match a WooCommerce order? If so, offer the DOA shortcut.
      if (c && (c.email || c.phone) && companyId) {
        try {
          const params = new URLSearchParams({ companyId })
          if (c.email) params.set('email', c.email)
          if (c.phone) params.set('phone', c.phone)
          const res = await fetch(`/api/doa/match?${params.toString()}`)
          const data = await res.json()
          if (data.match) setDoaMatch(true)
        } catch {}
      }
    } else {
      setContact(null)
      setEditContact({})
    }
    // Load timeline events, notes, tasks
    loadConversationExtras(conv.id)
    // Load WooCommerce data if the contact's email matches an order
    loadWooData(conv.contact_id)
    // Scan messages for AI-detected info — only real visitor text, never
    // system/interactive/payment messages (those contain UUIDs/JSON).
    setTimeout(() => {
      const allText = (msgs || [])
        .filter((m: Message) => m.sender_type === 'visitor' && !(m as any).message_type)
        .map((m: Message) => m.content).join(' ')
      const extracted = extractFromText(allText)
      // Honour anything the user already dismissed or saved for this conversation.
      let dismissed: Record<string, string[]> = {}
      try { dismissed = JSON.parse(localStorage.getItem('colvy-ai-dismissed') || '{}') } catch {}
      const convDismissed = dismissed[conv.id] || []
      const filtered: any = {}
      ;(['phone', 'email', 'address'] as const).forEach(k => {
        const v = (extracted as any)[k]
        if (v && !convDismissed.includes(v)) filtered[k] = v
      })
      if (filtered.phone || filtered.email || filtered.address) {
        // Auto-save any detected field the contact doesn't already have, and
        // remember which fields AI filled (to show the AI badge).
        ;(['phone', 'email', 'address'] as const).forEach(async (k) => {
          const val = filtered[k]
          if (!val) return
          const already = (conv.__contact && conv.__contact[k]) // may be undefined
          if (!already) {
            try { await autoSaveAiField(conv, k, val) } catch {}
          }
        })
        setAiDetected(filtered)
      }
      else setAiDetected(null)
    }, 300)
  }

  const loadWooData = async (contactId: string | null) => {
    setWooCustomer(null)
    setWooOrders([])
    setAbandonedCarts([])
    if (!companyId) return
    // Resolve the contact's email + phone
    let email: string | null = null
    let phone: string | null = null
    if (contactId) {
      const { data: c } = await (supabase as any).from('contacts').select('email, phone').eq('id', contactId).maybeSingle()
      email = c?.email || null
      phone = c?.phone || null
    }
    // Abandoned carts match by email or phone (independent of WooCommerce sync).
    try {
      if (email || phone) {
        const p = new URLSearchParams({ companyId })
        if (email) p.set('email', email); else if (phone) p.set('phone', phone)
        const res = await fetch(`/api/abandoned-carts?${p}`)
        const data = await res.json()
        setAbandonedCarts(data.carts || [])
      }
    } catch {}
    if (!email) return
    // Match WooCommerce customer by email
    const { data: woo } = await (supabase as any).from('woocommerce_customers')
      .select('*').eq('company_id', companyId).ilike('email', email).maybeSingle()
    if (woo) setWooCustomer(woo)
    // Orders by email (covers guest orders too) — synced table first for speed
    const { data: orders } = await (supabase as any).from('woocommerce_orders')
      .select('*').eq('company_id', companyId).ilike('customer_email', email)
      .order('order_date', { ascending: false }).limit(50)
    setWooOrders(orders || [])
    // Then fetch LIVE orders from WooCommerce (includes Colvy-created orders that
    // haven't synced yet) and merge, de-duplicated by order id/number.
    try {
      const res = await fetch(`/api/orders/list?companyId=${companyId}&email=${encodeURIComponent(email)}`)
      const data = await res.json()
      if (data.orders && data.orders.length > 0) {
        const seen = new Set((orders || []).map((o: any) => String(o.order_number || o.order_id)))
        const merged = [...(orders || [])]
        data.orders.forEach((o: any) => {
          const key = String(o.number)
          if (!seen.has(key)) {
            seen.add(key)
            merged.push({
              order_id: o.id, order_number: o.number, status: o.status, total: o.total,
              currency: o.currency, order_date: o.date, customer_email: email,
              line_items: o.items, integration_id: o.integration_id, store_url: o.store_url,
              order_key: o.order_key, payment_url: o.payment_url, _live: true,
            })
          }
        })
        merged.sort((a: any, b: any) => new Date(b.order_date || 0).getTime() - new Date(a.order_date || 0).getTime())
        setWooOrders(merged)
      }
    } catch {}
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

  const openMediaPicker = async () => {
    if (!companyId) return
    setGallerySelected(new Set()); setShowMediaPicker(true)
    try {
      const res = await fetch(`/api/media?companyId=${companyId}`)
      const data = await res.json()
      setGalleryFolders(data.folders || [])
      setGalleryItems(data.items || [])
    } catch {}
  }

  const loadGalleryFolder = async (folderId: string | null, q = '') => {
    if (!companyId) return
    setGalleryFolder(folderId)
    const params = new URLSearchParams({ companyId })
    if (folderId) params.set('folderId', folderId)
    if (q.trim()) params.set('q', q.trim())
    const res = await fetch(`/api/media?${params}`)
    const data = await res.json()
    setGalleryItems(data.items || [])
  }

  const sendGalleryMedia = async () => {
    if (!companyId || !selected || gallerySelected.size === 0) return
    const chosen = galleryItems.filter(it => gallerySelected.has(it.id))
    const me = user?.user_metadata?.display_name || user?.email?.split('@')[0]
    try {
      for (const item of chosen) {
        await (supabase as any).from('messages').insert({
          conversation_id: selected.id, company_id: companyId, sender_type: 'agent',
          sender_id: user.id, sender_name: me, sender_email: user.email,
          content: '', attachments: [{ url: item.url, name: item.title || 'media', type: item.kind === 'video' ? 'video/mp4' : 'image/jpeg', kind: item.kind, from_gallery: true }],
        })
      }
      await (supabase as any).from('conversations').update({ last_message: '🖼️ Media', last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', selected.id)
      const { data: msgs } = await (supabase as any).from('messages').select('*').eq('conversation_id', selected.id).order('created_at', { ascending: true })
      setMessages(msgs || [])
      setShowMediaPicker(false); scrollBottom()
    } catch (e: any) { showToast('Could not send media') }
  }

  // ── File upload ────────────────────────────────────────────────────────────
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !selected || !companyId) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('companyId', companyId)
        fd.append('conversationId', selected.id)
        const res = await fetch('/api/inbox/upload', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) { alert('Attachment failed: ' + (data.error || 'upload error')); continue }
        const me = user?.user_metadata?.display_name || user?.email?.split('@')[0]
        await (supabase as any).from('messages').insert({
          conversation_id: selected.id, company_id: companyId, sender_type: 'agent',
          sender_id: user.id, sender_name: me, sender_email: user.email,
          content: data.kind === 'file' ? `📎 ${data.name}` : '',
          attachments: [{ url: data.url, name: data.name, type: data.type, kind: data.kind }],
        })
      }
      await (supabase as any).from('conversations').update({ last_message: '📎 Attachment', last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', selected.id)
      const { data: msgs } = await (supabase as any).from('messages').select('*').eq('conversation_id', selected.id).order('created_at', { ascending: true })
      setMessages(msgs || [])
      scrollBottom()
    } catch (e: any) { alert('Attachment failed: ' + e.message) }
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
  // Open a picker for poll/survey/form, loading the company's items
  const openPicker = async (kind: 'poll' | 'survey' | 'form' | 'payment') => {
    setShowSendMenu(false)
    setSendPicker(kind)
    setPickerItems([])
    if (kind === 'payment') return
    const table = kind === 'poll' ? 'polls' : kind === 'survey' ? 'surveys' : 'forms'
    let q = (supabase as any).from(table).select('*').order('created_at', { ascending: false }).limit(30)
    // forms/surveys are company-scoped; polls are global in this schema
    if (kind !== 'poll' && companyId) q = q.eq('company_id', companyId)
    const { data } = await q
    setPickerItems(data || [])
  }

  const generateInvoice = async (payload: any) => {
    if (!companyId || !payload?.order_id) return
    try {
      const res = await fetch(`/api/orders/details?companyId=${companyId}&orderId=${payload.order_id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load order')
      const { order, company } = data
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF()
      let y = 18
      doc.setFontSize(18); doc.setFont(undefined, 'bold')
      doc.text(company.name || 'Invoice', 14, y); y += 8
      doc.setFontSize(10); doc.setFont(undefined, 'normal')
      if (company.business_address) { doc.text(String(company.business_address), 14, y); y += 5 }
      if (company.business_email) { doc.text(String(company.business_email), 14, y); y += 5 }
      if (company.abn_acn) { doc.text(`ABN/ACN: ${company.abn_acn}`, 14, y); y += 5 }
      y += 4
      doc.setFontSize(14); doc.setFont(undefined, 'bold')
      doc.text(`Invoice — Order #${order.number}`, 14, y); y += 7
      doc.setFontSize(10); doc.setFont(undefined, 'normal')
      doc.text(`Date: ${new Date(order.date).toLocaleDateString()}`, 14, y); y += 5
      doc.text(`Status: ${order.status}`, 14, y); y += 8
      // Bill to
      doc.setFont(undefined, 'bold'); doc.text('Bill to:', 14, y); y += 5; doc.setFont(undefined, 'normal')
      const b = order.billing || {}
      doc.text(`${b.first_name || ''} ${b.last_name || ''}`.trim(), 14, y); y += 5
      if (b.email) { doc.text(b.email, 14, y); y += 5 }
      const addr = [b.address_1, b.city, b.state, b.postcode].filter(Boolean).join(', ')
      if (addr) { doc.text(addr, 14, y); y += 5 }
      y += 4
      // Items table header
      doc.setFont(undefined, 'bold')
      doc.text('Item', 14, y); doc.text('Qty', 130, y); doc.text('Total', 170, y); y += 3
      doc.line(14, y, 196, y); y += 5
      doc.setFont(undefined, 'normal')
      ;(order.line_items || []).forEach((li: any) => {
        const name = doc.splitTextToSize(li.name, 100)
        doc.text(name, 14, y); doc.text(String(li.quantity), 130, y); doc.text(`$${li.total}`, 170, y)
        y += (name.length * 5) + 2
        if (y > 260) { doc.addPage(); y = 20 }
      })
      y += 2; doc.line(14, y, 196, y); y += 6
      const money = (v: any) => `$${parseFloat(v || 0).toFixed(2)}`
      const right = (label: string, val: string, bold = false) => { doc.setFont(undefined, bold ? 'bold' : 'normal'); doc.text(label, 130, y); doc.text(val, 170, y); y += 6 }
      if (parseFloat(order.discount_total) > 0) right('Discount', `-${money(order.discount_total)}`)
      if (parseFloat(order.shipping_total) > 0) right('Shipping', money(order.shipping_total))
      if (parseFloat(order.total_tax) > 0) right('Tax (incl.)', money(order.total_tax))
      right('Total', `${order.currency || 'AUD'} ${money(order.total)}`, true)
      doc.save(`invoice-${order.number}.pdf`)
      showToast('Invoice downloaded')
    } catch (e: any) { showToast(e.message || 'Could not generate invoice') }
  }

  const sendOrderPaymentRequest = async (payload: any) => {
    if (!companyId || !selected) return
    // Reuse the existing in-chat payment request feature, tagged to this order so
    // that when the customer pays, the order is marked processing.
    try {
      const amount = (parseFloat(payload.total) || 0).toFixed(2)
      const res = await fetch('/api/stripe/chat-payment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, conversationId: selected.id, amount, description: `Order #${payload.order_number}`, senderName: user?.user_metadata?.display_name || user?.email?.split('@')[0], orderId: payload.order_id, integrationId: payload.integration_id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not send payment request')
      showToast('Payment request sent')
      selectConversation(selected)
    } catch (e: any) { showToast(e.message || 'Failed to send payment request') }
  }

  const convertAbandonedCart = (cart: any) => {
    setOrderPrefillCart(cart)
    setShowCreateOrder(true)
  }

  const dismissAbandonedCart = async (cart: any) => {
    if (!companyId) return
    try {
      await (supabase as any).from('abandoned_carts').update({ status: 'dismissed' }).eq('id', cart.id)
      setAbandonedCarts(prev => prev.filter(c => c.id !== cart.id))
    } catch {}
  }

  const miniBtn = (color: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 600, color, background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' })

  const folderBtnInbox = (active: boolean): React.CSSProperties => ({ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 7, border: 'none', background: active ? 'var(--peach)' : 'transparent', color: active ? 'var(--coral)' : 'var(--ink)', fontSize: 12.5, fontWeight: active ? 700 : 500, cursor: 'pointer', marginBottom: 2 }) 

  const openOrderEditor = async (payload: any) => {
    if (!companyId || !payload?.order_id) return
    setEditOrder(payload); setEditOrderData(null); setEditOrderLoading(true)
    try {
      const res = await fetch(`/api/orders/details?companyId=${companyId}&orderId=${payload.order_id}${payload.integration_id ? `&integrationId=${payload.integration_id}` : ''}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load order')
      // Normalize into an editable structure
      setEditOrderData({
        order_id: payload.order_id,
        number: data.order.number,
        status: data.order.status,
        integration_id: payload.integration_id,
        items: (data.order.line_items || []).map((li: any, i: number) => ({ key: `i${i}`, id: li.id, name: li.name, quantity: li.quantity, total: li.total })),
        customerNote: '',
      })
    } catch (e: any) { showToast(e.message || 'Could not load order'); setEditOrder(null) } finally { setEditOrderLoading(false) }
  }

  const saveOrderEdit = async () => {
    if (!companyId || !editOrderData) return
    setEditOrderSaving(true)
    try {
      const res = await fetch('/api/orders/edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, integrationId: editOrderData.integration_id, orderId: editOrderData.order_id,
          status: editOrderData.status,
          items: editOrderData.items.map((it: any) => ({ id: it.id, quantity: it.quantity })),
          customerNote: editOrderData.customerNote,
          conversationId: selected?.id,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save order')
      showToast(`Order #${editOrderData.number} updated`)
      setEditOrder(null); setEditOrderData(null)
      if (selected) selectConversation(selected)
    } catch (e: any) { showToast(e.message || 'Failed to save') } finally { setEditOrderSaving(false) }
  }

  const updateOrderStatus = async (payload: any, status: string) => {
    if (!companyId || !payload?.order_id) return
    const verb = status === 'cancelled' ? 'cancel' : 'mark paid'
    if (!confirm(`Are you sure you want to ${verb} order #${payload.order_number}?${status !== 'cancelled' ? ' This records payment and reduces stock in WooCommerce.' : ''}`)) return
    try {
      const res = await fetch('/api/orders/status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, orderId: payload.order_id, status, conversationId: selected?.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not update order')
      showToast(`Order #${payload.order_number} updated`)
      if (selected) selectConversation(selected)
    } catch (e: any) { showToast(e.message || 'Failed to update order') }
  }

  const sendMediaRequest = async () => {
    if (!companyId || !selected) return
    if (mrAccept.length === 0) { showToast('Select at least one file type'); return }
    setMrSaving(true)
    try {
      const res = await fetch('/api/media-requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, conversationId: selected.id, contactId: contact?.id,
          prompt: mrPrompt.trim() || 'Please upload the requested files.',
          accept: mrAccept, maxFiles: parseInt(mrMaxFiles) || 10,
          expiryHours: mrExpiry ? parseInt(mrExpiry) : null,
          createdBy: user?.user_metadata?.display_name || user?.email?.split('@')[0],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not create request')
      setShowMediaRequest(false)
      showToast('Media request sent')
      selectConversation(selected)
    } catch (e: any) { showToast(e.message || 'Failed to send request') } finally { setMrSaving(false) }
  }

  const sendCoupon = async () => {
    if (!companyId || !selected || !couponAmount.trim()) return
    setCouponSaving(true)
    try {
      const res = await fetch('/api/coupons/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, conversationId: selected.id, contactId: contact?.id,
          email: contact?.email, amount: couponAmount.trim(),
          discountType: couponType === 'percent' ? 'percent' : 'fixed',
          code: couponCode.trim() || undefined, oneTime: couponOneTime,
          expiryDays: couponExpiry ? Number(couponExpiry) : undefined,
          createdByName: user?.user_metadata?.display_name || user?.email?.split('@')[0],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not create coupon')
      setShowCoupon(false)
      showToast(`Coupon ${data.code} sent`)
      selectConversation(selected)
    } catch (e: any) { showToast(e.message || 'Failed to send coupon') } finally { setCouponSaving(false) }
  }

  const createTicket = async () => {
    if (!companyId || !ticketSubject.trim()) return
    setTicketSaving(true)
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, conversationId: selected?.id, contactId: contact?.id,
          subject: ticketSubject.trim(), description: ticketDesc.trim(), priority: ticketPriority,
          createdBy: user?.id,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not create ticket')
      setShowTicketPanel(false)
      showToast(`Ticket ${data.ticket?.ticket_number} created`)
      if (selected) selectConversation(selected)
    } catch (e: any) {
      showToast(e.message || 'Failed to create ticket')
    } finally { setTicketSaving(false) }
  }

  // Send a poll/survey/form into the chat as an interactive message
  const sendInteractive = async (kind: 'poll' | 'survey' | 'form', item: any) => {
    if (!selected || !companyId) return
    const senderName = user?.user_metadata?.display_name || user?.email?.split('@')[0]
    const title = item.question || item.title || item.name || `${kind}`
    const smsNumber = (selected as any).sms_number
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const link = `${origin.replace(/admin\..*/, '')}/widget?slug=${(selected as any).company_slug || ''}&conversation=${selected.id}`

    await (supabase as any).from('messages').insert({
      conversation_id: selected.id, company_id: companyId, sender_type: 'agent',
      sender_id: user.id, sender_name: senderName,
      content: `📋 ${title}`,
      message_type: kind,
      message_payload: { kind, ref_id: item.id, title, options: item.options || null },
    })
    await (supabase as any).from('conversations').update({ last_message: `📋 ${title}`, last_message_at: new Date().toISOString() }).eq('id', selected.id)

    // For SMS conversations, also text a link to the widget + app download
    if (smsNumber) {
      const body = `${title}\nTap to respond: ${link}\n\nOr get our app: https://colvy.com/app`
      try { await fetch('/api/telnyx/sms/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, conversationId: selected.id, to: smsNumber, text: body, senderName }) }) } catch {}
    }
    setSendPicker(null)
    const { data: msgs } = await (supabase as any).from('messages').select('*').eq('conversation_id', selected.id).order('created_at', { ascending: true })
    setMessages(msgs || []); scrollBottom()
  }

  // Send a payment request into the chat
  const sendPayment = async () => {
    if (!selected || !companyId || !payAmount) return
    const senderName = user?.user_metadata?.display_name || user?.email?.split('@')[0]
    try {
      const res = await fetch('/api/stripe/chat-payment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, conversationId: selected.id, amount: payAmount, description: payDesc, senderName }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Could not create payment'); return }
      // For SMS, text the pay link + app
      const smsNumber = (selected as any).sms_number
      if (smsNumber && data.checkoutUrl) {
        const body = `Payment request: $${parseFloat(payAmount).toFixed(2)} AUD${payDesc ? ` — ${payDesc}` : ''}\nPay securely: ${data.checkoutUrl}`
        try { await fetch('/api/telnyx/sms/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, conversationId: selected.id, to: smsNumber, text: body, senderName }) }) } catch {}
      }
      setSendPicker(null); setPayAmount(''); setPayDesc('')
      const { data: msgs } = await (supabase as any).from('messages').select('*').eq('conversation_id', selected.id).order('created_at', { ascending: true })
      setMessages(msgs || []); scrollBottom()
    } catch (e: any) { alert('Payment error: ' + e.message) }
  }

  // Send the composer text (auto-routes chat vs SMS)
  const sendReply = async () => {
    if (!reply.trim() || !selected || !user) return
    setSending(true)
    const content = reply.trim()
    const senderName = user.user_metadata?.display_name || user.email?.split('@')[0]

    // Auto-route: send via chat by default. If the visitor gave a mobile and
    // isn't currently online (no activity in the last 2 minutes), also deliver
    // over SMS so they get the reply on their phone.
    const smsNumber = (selected as any).sms_number
    const lastSeen = (selected as any).visitor_last_seen || (selected as any).last_message_at
    const visitorOnline = lastSeen ? (Date.now() - new Date(String(lastSeen).endsWith('Z') ? lastSeen : lastSeen + 'Z').getTime()) < 120000 : false
    const shouldSms = smsNumber && !visitorOnline

    if (shouldSms) {
      try {
        const res = await fetch('/api/telnyx/sms/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, conversationId: selected.id, to: smsNumber, text: content, senderName }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'SMS failed')
        setReply(''); setReplyTo(null); setSending(false)
        const { data: msgs } = await (supabase as any).from('messages').select('*').eq('conversation_id', selected.id).order('created_at', { ascending: true })
        setMessages(msgs || [])
        scrollBottom()
      } catch (e: any) {
        // Fall back to chat if SMS fails
        console.warn('SMS failed, delivering via chat:', e.message)
        await deliverChat(content, senderName)
      }
      return
    }

    await deliverChat(content, senderName)
  }

  const deliverChat = async (content: string, senderName: string) => {
    if (!selected) return
    const msg = {
      conversation_id: selected.id,
      company_id: companyId,
      sender_type: 'agent',
      sender_id: user!.id,
      sender_name: senderName,
      sender_email: user!.email,
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
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2200) }

  const copyField = (value: string) => {
    try { navigator.clipboard.writeText(value); showToast('Copied to your clipboard') } catch {}
  }

  // Save a single contact field (inline row edit), also syncing to WooCommerce
  const saveSingleField = async (field: string, value: string) => {
    if (!contact?.id) return
    await (supabase as any).from('contacts').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', contact.id)
    setContact((c: any) => ({ ...c, [field]: value }))
    setEditField(null)
    showToast('Saved')
    // Push the change back to WooCommerce if this contact matches a woo customer
    try {
      if (companyId && contact.email) {
        fetch('/api/woocommerce/update-customer', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, email: contact.email, field, value }),
        })
      }
    } catch {}
  }

  const dismissAiField = (field: 'phone' | 'email' | 'address', value?: string | null) => {
    // Remember this value as dismissed for this conversation so it won't be
    // re-detected on the next open.
    if (selected?.id && value) {
      try {
        const all = JSON.parse(localStorage.getItem('colvy-ai-dismissed') || '{}')
        all[selected.id] = Array.from(new Set([...(all[selected.id] || []), value]))
        localStorage.setItem('colvy-ai-dismissed', JSON.stringify(all))
      } catch {}
    }
    setAiDetected(prev => prev ? { ...prev, [field]: null } : null)
  }

  const dismissAllAi = () => {
    if (selected?.id && aiDetected) {
      try {
        const all = JSON.parse(localStorage.getItem('colvy-ai-dismissed') || '{}')
        const vals = [aiDetected.phone, aiDetected.email, aiDetected.address].filter(Boolean) as string[]
        all[selected.id] = Array.from(new Set([...(all[selected.id] || []), ...vals]))
        localStorage.setItem('colvy-ai-dismissed', JSON.stringify(all))
      } catch {}
    }
    setAiDetected(null)
  }

  // Automatically save an AI-detected field to the contact when it's empty,
  // and record that AI filled it so we can show an AI badge next to it.
  const autoSaveAiField = async (conv: any, field: string, value: string) => {
    let contactId = conv.contact_id || conv.__contact?.id
    if (contactId) {
      const { data: existing } = await (supabase as any).from('contacts').select(`${field}, ai_saved_fields`).eq('id', contactId).maybeSingle()
      if (existing && existing[field]) return // already has a value — don't overwrite
      const marks = Array.from(new Set([...((existing?.ai_saved_fields as string[]) || []), field]))
      await (supabase as any).from('contacts').update({ [field]: value, ai_saved_fields: marks, updated_at: new Date().toISOString() }).eq('id', contactId)
    } else if (companyId) {
      const contactName = conv.subject || 'Visitor'
      const { data: newContact } = await (supabase as any).from('contacts').insert({ company_id: companyId, name: contactName, [field]: value, ai_saved_fields: [field] }).select().maybeSingle()
      if (newContact) { contactId = newContact.id; try { await (supabase as any).from('conversations').update({ contact_id: contactId }).eq('id', conv.id) } catch {} }
    }
    // Also keep a localStorage copy so the badge is instant even before reload.
    try {
      const store = JSON.parse(localStorage.getItem('colvy-ai-saved') || '{}')
      store[contactId] = Array.from(new Set([...(store[contactId] || []), field]))
      localStorage.setItem('colvy-ai-saved', JSON.stringify(store))
    } catch {}
    // Reflect in the open contact panel if it's this conversation.
    if (selected?.id === conv.id) {
      setContact((c: any) => c ? { ...c, [field]: value } : c)
      setAiSavedFields(prev => new Set([...Array.from(prev), field]))
    }
  }

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
    dismissAiField(field as any, value)
  }

  const filteredConvs = conversations.filter(c => {
    if (!searchTerm) return true
    const q = searchTerm.toLowerCase()
    return (c.last_message || '').toLowerCase().includes(q) || (c.subject || '').toLowerCase().includes(q)
  })

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--slate)' }}>Loading inbox…</div>

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }
  const fieldBtn = (color: string): React.CSSProperties => ({ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 })

  return (
    <div className={`inbox-root inbox-pane-${mobilePane}`} style={{ display: 'flex', height: '100vh', maxHeight: 'calc(100vh - 56px)', overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <style>{`
        /* ── Inbox mobile responsiveness ─────────────────────────────── */
        @media (max-width: 767px) {
          /* One pane at a time on phones */
          .inbox-root .inbox-col-list,
          .inbox-root .inbox-col-thread,
          .inbox-root .inbox-col-contact { display: none !important; }
          .inbox-root .inbox-col-list { width: 100% !important; flex: 1 1 100% !important; }
          .inbox-root .inbox-col-thread { width: 100% !important; flex: 1 1 100% !important; }
          .inbox-root .inbox-col-contact { width: 100% !important; flex: 1 1 100% !important; border-left: none !important; }

          .inbox-pane-list .inbox-col-list { display: flex !important; }
          .inbox-pane-thread .inbox-col-thread { display: flex !important; }
          .inbox-pane-contact .inbox-col-contact { display: flex !important; }

          /* The collapsed-sidebar rail is desktop-only */
          .inbox-root .inbox-collapsed-rail { display: none !important; }
          /* Back / nav buttons only on mobile */
          .inbox-mobile-only { display: flex !important; }
        }
        @media (min-width: 768px) {
          .inbox-mobile-only { display: none !important; }
        }
      `}</style>
      <IncomingCallListener companyId={companyId} agentName={user?.user_metadata?.display_name || user?.email?.split('@')[0]} />

      {/* Conversation action panels */}
      <style>{`@keyframes doaSlideIn { from { transform: translate(100%, -50%); } to { transform: translate(0, -50%); } }`}</style>

      {showDoa && selected && companyId && (
        <DoaPanel
          companyId={companyId}
          conversationId={selected.id}
          contactId={contact?.id}
          contact={contact}
          onClose={() => setShowDoa(false)}
          onDone={() => { if (selected) selectConversation(selected) }}
        />
      )}

      {showCreateOrder && selected && companyId && (
        <CreateOrderPanel
          companyId={companyId}
          conversationId={selected.id}
          contactId={contact?.id}
          contact={contact}
          staffName={user?.user_metadata?.display_name || user?.email?.split('@')[0]}
          staffId={user?.id}
          prefillCart={orderPrefillCart}
          onClose={() => { setShowCreateOrder(false); setOrderPrefillCart(null) }}
          onCreated={(order) => {
            if (orderPrefillCart?.id) { (supabase as any).from('abandoned_carts').update({ status: 'recovered', recovered_order_id: order?.id }).eq('id', orderPrefillCart.id); setAbandonedCarts(prev => prev.filter(c => c.id !== orderPrefillCart.id)) }
            if (selected) selectConversation(selected)
          }}
        />
      )}

      {/* Media gallery picker */}
      {showMediaPicker && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowMediaPicker(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 720, maxWidth: '92vw', height: 560, maxHeight: '86vh', background: '#fff', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>🖼️ Send from gallery</h2>
              <button onClick={() => setShowMediaPicker(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--slate)' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
              <div style={{ width: 170, borderRight: '1px solid var(--border)', padding: 12, overflowY: 'auto', flexShrink: 0 }}>
                <button onClick={() => loadGalleryFolder(null)} style={folderBtnInbox(galleryFolder === null)}>All media</button>
                {galleryFolders.map(f => (
                  <button key={f.id} onClick={() => loadGalleryFolder(f.id)} style={folderBtnInbox(galleryFolder === f.id)}>{f.name}</button>
                ))}
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                  <input value={gallerySearch} onChange={e => { setGallerySearch(e.target.value); loadGalleryFolder(galleryFolder, e.target.value) }} placeholder="Search media…" style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
                  {galleryItems.length === 0 ? (
                    <p style={{ color: 'var(--slate)', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>No media here. Add some in the Gallery.</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
                      {galleryItems.map(item => {
                        const sel = gallerySelected.has(item.id)
                        return (
                          <div key={item.id} onClick={() => setGallerySelected(prev => { const n = new Set(prev); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n })}
                            style={{ position: 'relative', paddingTop: '75%', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', border: sel ? '3px solid var(--coral)' : '1px solid var(--border)', background: 'var(--canvas)' }}>
                            {item.kind === 'video'
                              ? <video src={item.url} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                              : <img src={item.thumbnail_url || item.url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                            {sel && <div style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>✓</div>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>{gallerySelected.size} selected</span>
                  <button onClick={sendGalleryMedia} disabled={gallerySelected.size === 0}
                    style={{ padding: '9px 20px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 700, cursor: gallerySelected.size ? 'pointer' : 'not-allowed', opacity: gallerySelected.size ? 1 : 0.5 }}>
                    Send {gallerySelected.size > 0 ? gallerySelected.size : ''} to chat
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Order editor panel */}
      {editOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', justifyContent: 'flex-end' }} onClick={() => setEditOrder(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 420, maxWidth: '100%', height: '100%', background: '#fff', overflowY: 'auto', boxShadow: '-8px 0 32px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Edit order {editOrderData ? `#${editOrderData.number}` : ''}</h2>
              <button onClick={() => setEditOrder(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--slate)' }}>✕</button>
            </div>
            <div style={{ padding: 20 }}>
              {editOrderLoading || !editOrderData ? (
                <p style={{ color: 'var(--slate)', fontSize: 13.5 }}>Loading order…</p>
              ) : (
                <>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>Items (set quantity to 0 to remove)</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                    {editOrderData.items.map((it: any) => (
                      <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 9 }}>
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>{it.name}</span>
                        <input type="number" min={0} value={it.quantity} onChange={e => setEditOrderData((d: any) => ({ ...d, items: d.items.map((x: any) => x.key === it.key ? { ...x, quantity: Math.max(0, parseInt(e.target.value) || 0) } : x) }))}
                          style={{ width: 60, padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13 }} />
                        <span style={{ fontSize: 12.5, fontWeight: 600, width: 60, textAlign: 'right' }}>${it.total}</span>
                      </div>
                    ))}
                  </div>

                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 5 }}>Status</label>
                  <select value={editOrderData.status} onChange={e => setEditOrderData((d: any) => ({ ...d, status: e.target.value }))}
                    style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, marginBottom: 14 }}>
                    {['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>

                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 5 }}>Add a customer note (optional)</label>
                  <textarea value={editOrderData.customerNote} onChange={e => setEditOrderData((d: any) => ({ ...d, customerNote: e.target.value }))} rows={2}
                    style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box', marginBottom: 18, resize: 'vertical', fontFamily: 'inherit' }} />

                  <button onClick={saveOrderEdit} disabled={editOrderSaving}
                    style={{ width: '100%', padding: '12px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    {editOrderSaving ? 'Saving…' : 'Save changes'}
                  </button>
                  <p style={{ fontSize: 11, color: 'var(--slate)', marginTop: 10, lineHeight: 1.5 }}>WooCommerce recalculates totals and tax when items change. Changing an item's quantity may adjust stock.</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Request Media popup */}
      {showMediaRequest && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setShowMediaRequest(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: '100%', background: '#fff', borderRadius: 16, overflow: 'hidden', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ color: 'var(--coral)', display: 'inline-flex' }}>{Icon.media(17)}</span> Request Media</h2>
              <button onClick={() => setShowMediaRequest(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--slate)' }}>✕</button>
            </div>
            <div style={{ padding: 20 }}>
              <p style={{ fontSize: 12.5, color: 'var(--slate)', margin: '0 0 16px', lineHeight: 1.5 }}>Send a private upload link. The customer can upload photos, videos, or PDFs at full quality — no MMS compression.</p>

              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 5 }}>What do you need?</label>
              <textarea value={mrPrompt} onChange={e => setMrPrompt(e.target.value)} rows={2} placeholder="e.g. Please upload clear photos of the damaged item and the box."
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', marginBottom: 16 }} />

              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>Accept file types</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {[['image', 'Photos'], ['video', 'Videos'], ['pdf', 'PDFs'], ['audio', 'Audio']].map(([k, label]) => {
                  const on = mrAccept.includes(k)
                  return (
                    <button key={k} onClick={() => setMrAccept(prev => on ? prev.filter(x => x !== k) : [...prev, k])}
                      style={{ padding: '8px 14px', borderRadius: 9, border: on ? '2px solid var(--coral)' : '1px solid var(--border)', background: on ? 'var(--peach)' : '#fff', color: on ? 'var(--coral)' : 'var(--slate)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{label}</button>
                  )
                })}
              </div>

              <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 5 }}>Maximum files</label>
                  <input type="number" min={1} value={mrMaxFiles} onChange={e => setMrMaxFiles(e.target.value)}
                    style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 5 }}>Link expires in</label>
                  <select value={mrExpiry} onChange={e => setMrExpiry(e.target.value)}
                    style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box' }}>
                    <option value="24">24 hours</option>
                    <option value="72">3 days</option>
                    <option value="168">7 days</option>
                    <option value="720">30 days</option>
                    <option value="">Never</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowMediaRequest(false)} style={{ flex: 1, padding: '11px', borderRadius: 10, background: '#fff', color: 'var(--slate)', border: '1px solid var(--border)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button onClick={sendMediaRequest} disabled={mrSaving || mrAccept.length === 0} style={{ flex: 2, padding: '11px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', opacity: mrAccept.length === 0 ? 0.6 : 1 }}>{mrSaving ? 'Sending…' : 'Send Request'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send coupon panel */}
      {showCoupon && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', justifyContent: 'flex-end' }} onClick={() => setShowCoupon(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 400, maxWidth: '100%', height: '100%', background: '#fff', overflowY: 'auto', boxShadow: '-8px 0 32px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Send a coupon</h2>
              <button onClick={() => setShowCoupon(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--slate)' }}>✕</button>
            </div>
            <div style={{ padding: 20 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 5 }}>Discount</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <select value={couponType} onChange={e => setCouponType(e.target.value as any)} style={{ padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, width: 90 }}>
                  <option value="fixed">$ off</option>
                  <option value="percent">% off</option>
                </select>
                <input value={couponAmount} onChange={e => setCouponAmount(e.target.value)} placeholder={couponType === 'percent' ? '10' : '20.00'} autoFocus
                  style={{ flex: 1, padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5 }} />
              </div>

              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 5 }}>Code (leave blank to auto-generate)</label>
              <input value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())} placeholder="e.g. WELCOME10"
                style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box', marginBottom: 14 }} />

              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 5 }}>Expires in (days, optional)</label>
              <input value={couponExpiry} onChange={e => setCouponExpiry(e.target.value)} placeholder="e.g. 30" type="number"
                style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box', marginBottom: 14 }} />

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 8 }}>
                <input type="checkbox" checked={couponOneTime} onChange={e => setCouponOneTime(e.target.checked)} />
                One-time use{contact?.email ? `, restricted to ${contact.email}` : ''}
              </label>
              {!contact?.email && <p style={{ fontSize: 11.5, color: 'var(--slate)', marginBottom: 12 }}>No email on this contact — the coupon won't be email-restricted.</p>}

              <button onClick={sendCoupon} disabled={couponSaving || !couponAmount.trim()}
                style={{ width: '100%', padding: '12px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: couponAmount.trim() ? 'pointer' : 'not-allowed', opacity: couponAmount.trim() ? 1 : 0.6, marginTop: 8 }}>
                {couponSaving ? 'Creating…' : 'Create & send coupon'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create support ticket panel */}
      {showTicketPanel && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', justifyContent: 'flex-end' }} onClick={() => setShowTicketPanel(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 420, maxWidth: '100%', height: '100%', background: '#fff', overflowY: 'auto', boxShadow: '-8px 0 32px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>New Support Ticket</h2>
              <button onClick={() => setShowTicketPanel(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--slate)' }}>✕</button>
            </div>
            <div style={{ padding: 20 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 5 }}>Subject</label>
              <input value={ticketSubject} onChange={e => setTicketSubject(e.target.value)} placeholder="Brief summary of the issue" autoFocus
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box', marginBottom: 14 }} />

              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 5 }}>Description</label>
              <textarea value={ticketDesc} onChange={e => setTicketDesc(e.target.value)} placeholder="Details, context, what the customer needs…" rows={5}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box', marginBottom: 14, resize: 'vertical', fontFamily: 'inherit' }} />

              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 5 }}>Priority</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                {['low', 'normal', 'high', 'urgent'].map(p => (
                  <button key={p} onClick={() => setTicketPriority(p)}
                    style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: ticketPriority === p ? '2px solid var(--coral)' : '1px solid var(--border)', background: ticketPriority === p ? 'var(--peach)' : '#fff', color: ticketPriority === p ? 'var(--coral)' : 'var(--slate)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{p}</button>
                ))}
              </div>

              <button onClick={createTicket} disabled={ticketSaving || !ticketSubject.trim()}
                style={{ width: '100%', padding: '12px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: ticketSubject.trim() ? 'pointer' : 'not-allowed', opacity: ticketSubject.trim() ? 1 : 0.6 }}>
                {ticketSaving ? 'Creating…' : 'Create ticket'}
              </button>
              <p style={{ fontSize: 11.5, color: 'var(--slate)', marginTop: 10, lineHeight: 1.5 }}>A ticket number and link will be posted into this conversation.</p>
            </div>
          </div>
        </div>
      )}

      {/* Media gallery / lightbox */}
      {galleryIndex !== null && (() => {
        const media: MediaItem[] = []
        messages.forEach(m => (Array.isArray(m.attachments) ? m.attachments : []).forEach((a: any) => {
          { const isImg = a.kind === 'image' || String(a.type||'').startsWith('image'); const isVid = a.kind === 'video' || String(a.type||'').startsWith('video'); if ((isImg || isVid) && a.url) media.push({ url: a.url, name: a.name, kind: isVid ? 'video' : 'image' }) }
        }))
        return <MediaGallery items={media} index={galleryIndex} onClose={() => setGalleryIndex(null)} onIndex={setGalleryIndex} />
      })()}


      {/* Merge picker */}
      {showMergePicker && selected && (
        <div onClick={() => setShowMergePicker(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 420, maxWidth: '100%', maxHeight: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Merge a conversation into this one</p>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>Its messages move here; the other is archived.</p>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {conversations.filter(c => c.id !== selected.id).map(c => (
                <button key={c.id} type="button" onClick={() => mergeConversation(c.id)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 18px', border: 'none', borderBottom: '1px solid var(--border)', background: '#fff', cursor: 'pointer' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{c.subject || (c as any).sms_number || 'Visitor'}</div>
                  <div style={{ fontSize: 12, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.last_message || 'No messages'}</div>
                </button>
              ))}
              {conversations.filter(c => c.id !== selected.id).length === 0 && (
                <p style={{ padding: 24, textAlign: 'center', color: 'var(--slate)', fontSize: 13 }}>No other conversations to merge.</p>
              )}
            </div>
          </div>
        </div>
      )}


      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#0d0d0d', color: '#fff', padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          {toast}
        </div>
      )}

      {/* Interactive send picker modal */}
      {sendPicker && (
        <div onClick={() => setSendPicker(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: '100%', maxHeight: '80vh', overflowY: 'auto', background: '#fff', borderRadius: 16, padding: 22, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--ink)', textTransform: 'capitalize' }}>
                {sendPicker === 'payment' ? 'Request Payment' : `Send ${sendPicker}`}
              </h3>
              <button type="button" onClick={() => setSendPicker(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--slate)' }}>×</button>
            </div>

            {sendPicker === 'payment' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', display: 'block', marginBottom: 6 }}>Amount (AUD)</label>
                  <input type="number" min="1" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="49.00" style={{ ...inp, fontSize: 15 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', display: 'block', marginBottom: 6 }}>Description (optional)</label>
                  <input value={payDesc} onChange={e => setPayDesc(e.target.value)} placeholder="Deposit for booking" style={inp} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--slate)', background: 'var(--canvas)', padding: '8px 12px', borderRadius: 8 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  Secure payment via Stripe. Card details are never stored by Colvy.
                </div>
                <button type="button" onClick={sendPayment} disabled={!payAmount} style={{ padding: '11px 0', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  Send payment request
                </button>
              </div>
            ) : pickerItems.length === 0 ? (
              <p style={{ fontSize: 13.5, color: 'var(--slate)', textAlign: 'center', padding: '24px 0' }}>
                No {sendPicker}s found. Create one in the {sendPicker === 'poll' ? 'Polls' : sendPicker === 'survey' ? 'Surveys' : 'Forms'} section first.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pickerItems.map(item => (
                  <button key={item.id} type="button" onClick={() => sendInteractive(sendPicker as any, item)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{item.question || item.title || item.name || 'Untitled'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── LEFT: Conversation list ─────────────────────────────────────────── */}
      {sidebarCollapsed && !isMobile ? (
        <div className="inbox-collapsed-rail" style={{ width: 48, flexShrink: 0, borderRight: '1px solid var(--border)', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 14 }}>
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
      <div className="inbox-col-list" style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: '#fff' }}>
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--ink)' }}>Inbox</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--peach)', color: 'var(--coral)', padding: '2px 8px', borderRadius: 20 }}>
                {conversations.filter(c => c.is_unread).length} unread
              </span>
              <Link href="/admin/crm-settings/profile" title="Inbox settings"
                style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--slate)', textDecoration: 'none' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </Link>
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
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', paddingLeft: conv.is_unread && selected?.id !== conv.id ? 11 : 14, border: 'none', borderLeft: conv.is_unread && selected?.id !== conv.id ? '3px solid var(--coral)' : '3px solid transparent', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selected?.id === conv.id ? 'var(--peach)' : conv.is_unread ? '#fff6f4' : '#fff', transition: 'background 0.1s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {conv.is_unread && selected?.id !== conv.id && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--coral)', flexShrink: 0 }} />}
                  <span style={{ fontSize: 14 }}>{CHANNEL_ICON[conv.channel] || '💬'}</span>
                  <span style={{ fontSize: 13, fontWeight: conv.is_unread ? 700 : 600, color: 'var(--ink)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conv.subject || conv.visitor_id?.slice(0, 8) || 'Visitor'}
                  </span>
                </div>
                <span style={{ fontSize: 10, color: '#9ca3af', flexShrink: 0 }}>{timeAgo(conv.last_message_at)}</span>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: conv.is_unread ? 'var(--ink)' : '#6b7280', fontWeight: conv.is_unread ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
      <div className="inbox-col-thread" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f9f9f9', minWidth: 0 }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <p style={{ marginTop: 12, fontSize: 15 }}>Select a conversation</p>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#fff', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {/* Mobile: back to conversation list */}
              <button type="button" className="inbox-mobile-only" onClick={() => setMobilePane('list')} title="Back"
                style={{ display: 'none', width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', alignItems: 'center', justifyContent: 'center', color: 'var(--slate)', order: -2 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
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

              {/* Mobile: open contact panel */}
              <button type="button" className="inbox-mobile-only" onClick={() => setMobilePane('contact')} title="Contact info"
                style={{ display: 'none', width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', alignItems: 'center', justifyContent: 'center', color: 'var(--slate)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a8.38 8.38 0 0 1 13 0"/></svg>
              </button>

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
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Snooze
                    </button>
                    <button type="button" onClick={() => { copyChatLink(); setShowActions(false) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> {linkCopied ? 'Copied!' : 'Copy chat link'}
                    </button>
                    <button type="button" onClick={() => { setShowActions(false); setShowMergePicker(true) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8L22 12L18 16"/><path d="M2 12H22"/><path d="M6 8L2 12L6 16"/></svg> Merge conversation
                    </button>
                    <button type="button" onClick={() => { generateAiSummary(); setActivePanel('info'); setShowActions(false) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)', borderTop: '1px solid var(--border)' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/></svg> AI summary & to-dos
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
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700, color: '#d97706' }}><AiSparkIcon /> AI saved:</span>
                {aiDetected.phone && (
                  <span style={{ padding: '3px 10px', borderRadius: 8, background: '#fff', border: '1px solid #fde68a', fontSize: 12, color: '#d97706', fontWeight: 600 }}>{aiDetected.phone}</span>
                )}
                {aiDetected.email && (
                  <span style={{ padding: '3px 10px', borderRadius: 8, background: '#fff', border: '1px solid #fde68a', fontSize: 12, color: '#d97706', fontWeight: 600 }}>{aiDetected.email}</span>
                )}
                {aiDetected.address && (
                  <span style={{ padding: '3px 10px', borderRadius: 8, background: '#fff', border: '1px solid #fde68a', fontSize: 12, color: '#d97706', fontWeight: 600 }}>{aiDetected.address}</span>
                )}
                <button type="button" onClick={dismissAllAi} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 14 }}>✕</button>
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
              {(() => {
                const list = msgSearch ? messages.filter(m => (m.content || '').toLowerCase().includes(msgSearch.toLowerCase())) : messages
                // Flat list of all images/videos in the thread (for the gallery),
                // with a lookup from a message's attachment to its gallery index.
                const galleryMedia: MediaItem[] = []
                const mediaIndexOf: Record<string, number> = {}
                messages.forEach(m => {
                  const ma = Array.isArray(m.attachments) ? m.attachments : []
                  ma.forEach((a: any) => {
                    if (a.kind === 'image' || a.kind === 'video') {
                      mediaIndexOf[a.url] = galleryMedia.length
                      galleryMedia.push({ url: a.url, name: a.name, kind: a.kind })
                    }
                  })
                })
                let lastDay = ''
                return list.map(msg => {
                const thisDay = dayLabel(msg.created_at)
                const showDivider = thisDay && thisDay !== lastDay
                if (thisDay) lastDay = thisDay
                const isAgent = msg.sender_type === 'agent'
                const isSystem = msg.sender_type === 'system'
                const dateDivider = showDivider ? (
                  <div key={`div-${msg.id}`} style={{ textAlign: 'center', margin: '10px 0 4px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', background: '#eef0f2', padding: '3px 12px', borderRadius: 20 }}>{thisDay}</span>
                  </div>
                ) : null
                if (isSystem) return (
                  <div key={msg.id}>
                    {dateDivider}
                    <div style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', padding: '4px 0' }}>
                      <span style={{ background: '#f3f4f6', padding: '3px 10px', borderRadius: 20 }}>{msg.content}</span>
                    </div>
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
                  <div key={msg.id}>
                    {dateDivider}
                    <div className="chat-msg-row" style={{ display: 'flex', justifyContent: isAgent ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-end', position: 'relative' }}>
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
                              <img src={a.url} alt={a.name} style={{ maxWidth: 240, maxHeight: 240, borderRadius: 10, display: 'block', cursor: 'pointer' }} onClick={() => setGalleryIndex(mediaIndexOf[a.url] ?? 0)} />
                            ) : a.kind === 'video' ? (
                              <div style={{ position: 'relative', cursor: 'pointer', maxWidth: 240 }} onClick={() => setGalleryIndex(mediaIndexOf[a.url] ?? 0)}>
                                <video src={a.url} style={{ maxWidth: 240, borderRadius: 10, display: 'block', pointerEvents: 'none' }} />
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <div style={{ width: 44, height: 44, borderRadius: 22, background: 'rgba(0,0,0,0.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>▶</div>
                                </div>
                              </div>
                            ) : (
                              <a href={a.url} target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', gap: 8, color: isAgent ? '#fff' : 'var(--coral)', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
                                📎 {a.name}
                              </a>
                            )}
                          </div>
                        ))}
                        {msg.content && <div style={{ padding: atts.length && atts[0].kind !== 'file' ? '4px 10px 6px' : 0 }}>{msg.content}</div>}
                        {msg.message_type === 'payment' && msg.message_payload && (
                          <div style={{ marginTop: 6, padding: '10px 12px', borderRadius: 10, background: '#fff', border: '1px solid var(--border)', color: 'var(--ink)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={msg.message_payload.status === 'paid' ? '#059669' : '#635BFF'} strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                              <span style={{ fontSize: 13, fontWeight: 700 }}>${(msg.message_payload.amount_cents / 100).toFixed(2)} AUD</span>
                              <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 6, background: msg.message_payload.status === 'paid' ? '#dcfce7' : '#ede9fe', color: msg.message_payload.status === 'paid' ? '#059669' : '#635BFF', textTransform: 'uppercase' }}>{msg.message_payload.status || 'pending'}</span>
                            </div>
                            {msg.message_payload.description && <p style={{ margin: 0, fontSize: 12, color: 'var(--slate)' }}>{msg.message_payload.description}</p>}
                          </div>
                        )}
                        {['poll', 'survey', 'form'].includes(msg.message_type) && (
                          <div style={{ marginTop: 6, padding: '8px 12px', borderRadius: 10, background: '#fff', border: '1px solid var(--border)', color: 'var(--slate)', fontSize: 12 }}>
                            Interactive {msg.message_type} sent — the customer can respond in the widget.
                          </div>
                        )}
                        {msg.message_type === 'coupon' && msg.message_payload && (
                          <div style={{ marginTop: 6, padding: '14px 16px', borderRadius: 12, background: 'linear-gradient(135deg, #fff4f1, #fff)', border: '1.5px dashed var(--coral)', color: 'var(--ink)' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--coral)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 5 }}>{Icon.coupon(13)} Coupon sent</div>
                            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 1, margin: '4px 0' }}>{msg.message_payload.code}</div>
                            <div style={{ fontSize: 13, color: 'var(--slate)' }}>{msg.message_payload.display_amount}{msg.message_payload.expires ? ` · expires ${msg.message_payload.expires}` : ''}</div>
                          </div>
                        )}
                        {msg.message_type === 'media_request' && msg.message_payload && (
                          <div style={{ marginTop: 6, padding: '12px 14px', borderRadius: 12, background: '#fff', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, color: 'var(--coral)' }}>{Icon.media(15)}<span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Media requested</span></div>
                            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--ink)' }}>{msg.message_payload.prompt}</p>
                            <button type="button" onClick={() => { navigator.clipboard?.writeText(msg.message_payload.link); showToast('Upload link copied') }}
                              style={{ fontSize: 12, fontWeight: 600, color: 'var(--coral)', background: 'var(--peach)', border: '1px solid var(--coral)', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>Copy upload link</button>
                          </div>
                        )}
                        {msg.message_type === 'order' && msg.message_payload && (
                          <div style={{ marginTop: 6, padding: '12px 14px', borderRadius: 10, background: '#fff', border: '1px solid var(--border)', color: 'var(--ink)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <span style={{ color: "var(--coral)", display: "inline-flex" }}>{Icon.cart(15)}</span>
                              <span style={{ fontSize: 13.5, fontWeight: 700 }}>Order #{msg.message_payload.order_number}</span>
                              <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#eef2ff', color: '#4f46e5', textTransform: 'uppercase' }}>{msg.message_payload.status}</span>
                            </div>
                            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--slate)' }}>{msg.message_payload.currency || 'AUD'} ${msg.message_payload.total}</p>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <a href={`${msg.message_payload.store_url}/wp-admin/post.php?post=${msg.message_payload.order_id}&action=edit`} target="_blank" rel="noopener"
                                style={{ fontSize: 12, fontWeight: 600, color: 'var(--coral)', textDecoration: 'none', padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 7 }}>View order</a>
                              <button type="button" onClick={() => sendOrderPaymentRequest(msg.message_payload)}
                                style={{ fontSize: 12, fontWeight: 600, color: '#635BFF', background: '#fff', border: '1px solid #c7d2fe', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>Send payment request</button>
                              <button type="button" onClick={() => generateInvoice(msg.message_payload)}
                                style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', background: '#fff', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>Invoice PDF</button>
                              {msg.message_payload.pay_link && (
                                <button type="button" onClick={() => { navigator.clipboard?.writeText(msg.message_payload.pay_link); showToast('Payment link copied') }}
                                  style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', background: '#fff', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>Copy link</button>
                              )}
                              <button type="button" onClick={() => updateOrderStatus(msg.message_payload, 'processing')}
                                style={{ fontSize: 12, fontWeight: 600, color: '#4f46e5', background: '#fff', border: '1px solid #c7d2fe', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>Mark paid (bank/other)</button>
                              <button type="button" onClick={() => updateOrderStatus(msg.message_payload, 'completed')}
                                style={{ fontSize: 12, fontWeight: 600, color: '#059669', background: '#fff', border: '1px solid #bbf7d0', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>Mark completed</button>
                              <button type="button" onClick={() => updateOrderStatus(msg.message_payload, 'cancelled')}
                                style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', background: '#fff', border: '1px solid #fecaca', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>Cancel</button>
                            </div>
                          </div>
                        )}
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
                  </div>
                )
              })
              })()}
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
                  {/* Send poll/survey/form/payment */}
                  <div style={{ position: 'relative' }}>
                    <button type="button" onClick={() => setShowSendMenu(v => !v)} title="Send poll, survey, form or payment"
                      style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: showSendMenu ? 'var(--peach)' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--slate)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </button>
                    {showSendMenu && (
                      <div style={{ position: 'absolute', bottom: '120%', left: 0, width: 180, background: '#fff', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.12)', zIndex: 50, overflow: 'hidden' }}>
                        {[['poll', Icon.poll(), 'Send Poll'], ['survey', Icon.survey(), 'Send Survey'], ['form', Icon.form(), 'Send Form'], ['payment', Icon.payment(), 'Request Payment']].map(([k, icon, label]: any) => (
                          <button key={k} type="button" onClick={() => openPicker(k as any)}
                            style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}><span style={{ color: 'var(--slate)', display: 'inline-flex' }}>{icon}</span>{label}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Attach */}
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Attach file"
                    style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--slate)' }}>
                    {uploading ? '⏳' : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>}
                  </button>
                  {/* Gallery */}
                  <button type="button" onClick={openMediaPicker} title="Send from gallery"
                    style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--slate)' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                  </button>
                  {/* Emoji */}
                  <button type="button" onClick={() => setShowEmoji(v => !v)} title="Emoji"
                    style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: 15 }}>😊</button>
                  {/* Review request */}
                  <button type="button" onClick={sendReviewRequest} title="Send review request"
                    style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--slate)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Review
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
        <div className="inbox-col-contact" style={{ width: 280, flexShrink: 0, borderLeft: '1px solid var(--border)', background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Mobile: back to thread */}
          <button type="button" className="inbox-mobile-only" onClick={() => setMobilePane('thread')}
            style={{ display: 'none', alignItems: 'center', gap: 6, padding: '10px 14px', border: 'none', borderBottom: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--slate)', fontSize: 13, fontWeight: 600 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Back to conversation
          </button>
          {/* Panel tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            {(['info', 'timeline', ...(wooCustomer || wooOrders.length > 0 ? ['orders' as const] : [])] as const).map(p => (
              <button key={p} type="button" onClick={() => setActivePanel(p)}
                style={{ flex: 1, padding: '11px 0', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: activePanel === p ? 700 : 500, color: activePanel === p ? 'var(--coral)' : 'var(--slate)', borderBottom: activePanel === p ? '2px solid var(--coral)' : '2px solid transparent', textTransform: 'capitalize' }}>
                {p === 'info' ? 'Information' : p === 'timeline' ? 'Timeline' : 'Orders'}
              </button>
            ))}
          </div>

          {/* + Action button — shows enabled conversation actions */}
          {(() => {
            const enabledActions = Object.entries(convActions).filter(([, v]: any) => v?.enabled)
            if (enabledActions.length === 0) return null
            const ACTION_META: Record<string, { label: string; icon: (s?: number) => React.ReactNode }> = {
              doa: { label: 'DOA Claim', icon: Icon.box },
              warranty: { label: 'Warranty Claim', icon: Icon.shield },
              return_refund: { label: 'Return / Refund', icon: Icon.refund },
              create_order: { label: 'Create Order', icon: Icon.cart },
              send_coupon: { label: 'Send Coupon', icon: Icon.coupon },
              booking: { label: 'Booking', icon: Icon.calendar },
              support_ticket: { label: 'Support Ticket', icon: Icon.ticket },
              custom_form: { label: 'Custom Form', icon: Icon.form },
            }
            return (
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', position: 'relative' }}>
                <button type="button" onClick={() => setShowActionMenu(v => !v)}
                  style={{ width: '100%', padding: '9px 0', borderRadius: 9, background: 'var(--peach)', color: 'var(--coral)', border: '1px solid var(--coral)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  + Action
                </button>
                {showActionMenu && (
                  <div style={{ position: 'absolute', top: '100%', left: 14, right: 14, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', zIndex: 20, overflow: 'hidden', marginTop: 2 }}>
                    {enabledActions.map(([key, cfg]: any) => {
                      const meta = ACTION_META[key] || { label: key, icon: (s?: number) => <span>•</span> }
                      return (
                        <button key={key} type="button"
                          onClick={async () => {
                            setShowActionMenu(false)
                            if (key === 'doa' || key === 'return_refund') setShowDoa(true)
                            else if (key === 'create_order') setShowCreateOrder(true)
                            else if (key === 'send_coupon') { setCouponAmount(''); setCouponCode(''); setCouponType('fixed'); setCouponOneTime(true); setCouponExpiry(''); setShowCoupon(true) }
                            else if (key === 'support_ticket') { setTicketSubject(selected?.subject || ''); setTicketDesc(''); setTicketPriority('normal'); setShowTicketPanel(true) }
                            else if (cfg.form_id) {
                              const { data: form } = await (supabase as any).from('forms').select('*').eq('id', cfg.form_id).maybeSingle()
                              if (form) sendInteractive('form', form)
                              else showToast('The linked form was not found.')
                            }
                            else showToast(`"${meta.label}" isn't configured yet — set it up in Settings → Conversation Actions.`)
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px', border: 'none', borderBottom: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: 13.5, color: 'var(--ink)', textAlign: 'left' }}>
                          <span style={{ color: 'var(--coral)', display: 'inline-flex' }}>{meta.icon(16)}</span> {meta.label}
                        </button>
                      )
                    })}
                    <button type="button"
                      onClick={() => { setShowActionMenu(false); setShowMediaRequest(true) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px', border: 'none', background: '#fff', cursor: 'pointer', fontSize: 13.5, color: 'var(--ink)', textAlign: 'left' }}>
                      <span style={{ color: 'var(--coral)', display: 'inline-flex' }}>{Icon.media(16)}</span> Request Media
                    </button>
                  </div>
                )}
                {doaMatch && convActions.doa?.enabled && (
                  <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--coral)', fontWeight: 600 }}>💡 This customer matches an order — DOA claim available.</p>
                )}
              </div>
            )
          })()}

          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px' }}>
            {activePanel === 'info' && (
              <>
                {/* Contact card */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Contact</h3>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {contact && !showContactEdit && (
                      <button type="button" title="Edit all details" onClick={() => { setShowContactEdit(true); setEditContact(contact) }}
                        style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--slate)' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                    )}
                    <button type="button" onClick={() => { setShowContactEdit(v => !v); setEditContact(contact || {}) }}
                      style={{ fontSize: 11, color: 'var(--coral)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                      {showContactEdit ? 'Cancel' : (contact ? '' : '+ Create')}
                    </button>
                  </div>
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
                    {([
                      ['name', 'Name', contact.name],
                      ['company', 'Company', (contact as any).company],
                      ['email', 'Email', contact.email],
                      ['phone', 'Phone', contact.phone],
                      ['address', 'Address', [contact.address, contact.city, contact.country].filter(Boolean).join(', ')],
                    ] as [string, string, string][])
                      .map(([field, label, value]) => (
                        <div key={field} className="contact-field-row" style={{ position: 'relative' }}>
                          <p style={{ margin: '0 0 2px 0', fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                            {label}
                            {aiSavedFields.has(field as string) && value && (
                              <span title="Saved automatically by AI" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: '#8b5cf6', background: '#f3e8ff', padding: '1px 5px', borderRadius: 5, fontSize: 8.5 }}><AiSparkIcon size={9} /> AI</span>
                            )}
                          </p>
                          {editField === field ? (
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <input autoFocus value={editFieldValue} onChange={e => setEditFieldValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') saveSingleField(field, editFieldValue); if (e.key === 'Escape') setEditField(null) }}
                                style={{ ...inp, fontSize: 12, padding: '5px 8px' }} />
                              <button type="button" onClick={() => saveSingleField(field, editFieldValue)} style={fieldBtn('#059669')} title="Save">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                              </button>
                              <button type="button" onClick={() => setEditField(null)} style={fieldBtn('var(--slate)')} title="Cancel">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              </button>
                            </div>
                          ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <p style={{ margin: 0, fontSize: 13, color: value ? 'var(--ink)' : '#c0c0c5', flex: 1, wordBreak: 'break-word', fontStyle: value ? 'normal' : 'italic', cursor: value ? 'default' : 'pointer' }}
                               onClick={() => { if (!value) { setEditField(field); setEditFieldValue('') } }}>
                              {value || `Add ${label.toLowerCase()}`}
                            </p>
                            <div className="contact-field-actions" style={{ display: 'flex', gap: 3, opacity: 0, transition: 'opacity 0.12s' }}>
                              {field === 'phone' && (
                                <button type="button" title="Call" onClick={() => { const bar = document.querySelector('[data-callbar-btn]') as HTMLButtonElement; bar?.click() }}
                                  style={fieldBtn('#059669')}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                                </button>
                              )}
                              <button type="button" title="Edit" onClick={() => { setEditField(field); setEditFieldValue(value) }} style={fieldBtn('var(--slate)')}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                              <button type="button" title="Copy" onClick={() => copyField(value)} style={fieldBtn('var(--slate)')}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                              </button>
                              <button type="button" title="Delete" onClick={async () => { if (confirm(`Clear ${label.toLowerCase()}?`)) { await (supabase as any).from('contacts').update({ [field]: null }).eq('id', contact.id); setContact((c: any) => ({ ...c, [field]: null })); showToast('Cleared') } }} style={fieldBtn('#dc2626')}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                              </button>
                            </div>
                          </div>
                          )}
                        </div>
                      ))
                    }
                    {contact.subscribed_to_marketing && <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>✓ Subscribed to marketing</span>}
                    {contact.notes && <p style={{ margin: 0, fontSize: 12, color: 'var(--slate)', fontStyle: 'italic' }}>{contact.notes}</p>}
                    <Link href={`/admin/customers/profile?id=${contact.id}`}
                      style={{ fontSize: 12, color: 'var(--coral)', fontWeight: 600, textDecoration: 'none' }}>
                      View full profile →
                    </Link>
                    <style>{`.contact-field-row:hover .contact-field-actions { opacity: 1 !important; }`}</style>
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

                {/* Abandoned cart — what the customer was trying to buy */}
                {abandonedCarts.length > 0 && (
                  <div style={{ marginTop: 18 }}>
                    <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ color: 'var(--coral)', display: 'inline-flex' }}>{Icon.cart(15)}</span> Abandoned Cart <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 6, background: '#fef3c7', color: '#b45309' }}>{abandonedCarts.length}</span></h3>
                    {abandonedCarts.map(cart => (
                      <div key={cart.id} style={{ border: '1.5px solid #fde68a', borderRadius: 12, padding: 14, marginBottom: 10, background: 'linear-gradient(135deg,#fffbeb,#fff)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontSize: 11.5, color: 'var(--slate)' }}>{cart.created_at ? new Date(cart.created_at).toLocaleDateString('en-AU') : ''}</span>
                          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>${(parseFloat(cart.total) || 0).toFixed(2)}</span>
                        </div>
                        {Array.isArray(cart.items) && cart.items.length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            {cart.items.map((it: any, i: number) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink)', padding: '2px 0' }}>
                                <span>{it.quantity}× {it.name}{it.sku ? ` (${it.sku})` : ''}</span>
                                {it.price != null && <span style={{ color: 'var(--slate)' }}>${(parseFloat(it.price) || 0).toFixed(2)}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{ fontSize: 11.5, color: 'var(--slate)', lineHeight: 1.7, borderTop: '1px solid #fde68a', paddingTop: 8 }}>
                          {cart.coupon && <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ color: 'var(--coral)', display: 'inline-flex' }}>{Icon.coupon(12)}</span> Coupon: <strong>{cart.coupon}</strong></div>}
                          {cart.shipping?.label && <div>🚚 {cart.shipping.label}{cart.shipping.cost ? ` — $${cart.shipping.cost}` : ''}</div>}
                          {cart.address?.address_1 && <div>📍 {[cart.address.address_1, cart.address.city, cart.address.state, cart.address.postcode].filter(Boolean).join(', ')}</div>}
                          {cart.notes && <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}><span style={{ color: 'var(--slate)', display: 'inline-flex', marginTop: 2 }}>{Icon.survey(12)}</span> {cart.notes}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                          <button onClick={() => convertAbandonedCart(cart)} style={{ flex: 1, padding: '8px', borderRadius: 8, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Convert to order</button>
                          <button onClick={() => dismissAbandonedCart(cart)} title="Dismiss" style={{ padding: '8px 12px', borderRadius: 8, background: '#fff', color: 'var(--slate)', border: '1px solid var(--border)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Dismiss</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Shared Media — everything image/video shared in this conversation */}
                {(() => {
                  const media: any[] = []
                  messages.forEach(m => (Array.isArray(m.attachments) ? m.attachments : []).forEach((a: any) => {
                    { const isImg = a.kind === 'image' || String(a.type||'').startsWith('image'); const isVid = a.kind === 'video' || String(a.type||'').startsWith('video'); if ((isImg || isVid) && a.url) media.push({ ...a, kind: isVid ? 'video' : 'image' }) }
                  }))
                  if (media.length === 0) return null
                  return (
                    <div style={{ marginTop: 18 }}>
                      <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Shared Media ({media.length})</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                        {media.map((a, i) => (
                          <div key={i} onClick={() => setGalleryIndex(i)}
                            style={{ position: 'relative', paddingTop: '100%', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: 'var(--canvas)' }}>
                            {(a.kind === 'video' || String(a.type).startsWith('video'))
                              ? <video src={a.url} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                              : <img src={a.url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
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
                    <button type="button" onClick={sendReviewRequest} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--slate)', fontWeight: 600 }}>Send review request</button>
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
                      <span style={{ color: "var(--coral)", display: "inline-flex" }}>{Icon.cart(16)}</span>
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Order History ({wooOrders.length})</h3>
                  <button type="button" onClick={() => setShowOrderSearch(v => !v)} title="Search orders"
                    style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: showOrderSearch ? 'var(--peach)' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: showOrderSearch ? 'var(--coral)' : 'var(--slate)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  </button>
                </div>
                {showOrderSearch && (
                  <div style={{ marginBottom: 12, padding: 10, borderRadius: 10, background: 'var(--canvas)', border: '1px solid var(--border)' }}>
                    <input value={orderSearch} onChange={e => setOrderSearch(e.target.value)} placeholder="Order #, name, email, phone, address, item…"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, boxSizing: 'border-box', marginBottom: 8 }} />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, color: 'var(--slate)', fontWeight: 600 }}>From</label>
                        <input type="date" value={orderDateFrom} onChange={e => setOrderDateFrom(e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, color: 'var(--slate)', fontWeight: 600 }}>To</label>
                        <input type="date" value={orderDateTo} onChange={e => setOrderDateTo(e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12, boxSizing: 'border-box' }} />
                      </div>
                      {(orderSearch || orderDateFrom || orderDateTo) && (
                        <button onClick={() => { setOrderSearch(''); setOrderDateFrom(''); setOrderDateTo('') }} style={{ alignSelf: 'flex-end', fontSize: 11, color: 'var(--coral)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: '6px 4px' }}>Clear</button>
                      )}
                    </div>
                  </div>
                )}
                {(() => {
                  const q = orderSearch.trim().toLowerCase()
                  const from = orderDateFrom ? new Date(orderDateFrom).getTime() : null
                  const to = orderDateTo ? new Date(orderDateTo).getTime() + 86400000 : null
                  const filteredOrders = wooOrders.filter(o => {
                    if (from || to) {
                      const t = o.order_date ? new Date(o.order_date).getTime() : 0
                      if (from && t < from) return false
                      if (to && t > to) return false
                    }
                    if (!q) return true
                    const hay = [
                      o.order_number, o.order_id, o.woo_order_id, o.status, o.customer_email, o.customer_name,
                      o.billing?.first_name, o.billing?.last_name, o.billing?.phone, o.billing?.email,
                      o.billing?.address_1, o.billing?.city, o.billing?.postcode,
                      ...(Array.isArray(o.line_items) ? o.line_items.map((li: any) => li.name) : []),
                    ].filter(Boolean).join(' ').toLowerCase()
                    return hay.includes(q)
                  })
                  return filteredOrders.length === 0 ? (
                    <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>{wooOrders.length === 0 ? "No orders found for this customer's email." : 'No orders match your search.'}</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {filteredOrders.map(o => {
                      const oid = o.order_id || o.woo_order_id || o.id
                      const onum = o.order_number || o.woo_order_id || o.id
                      const payload = { order_id: oid, order_number: onum, total: o.total, currency: o.currency, status: o.status, pay_link: o.payment_url || (o.store_url && o.order_key ? `${o.store_url}/checkout/order-pay/${oid}/?pay_for_order=true&key=${o.order_key}` : null), store_url: o.store_url, integration_id: o.integration_id }
                      return (
                      <div key={oid} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>#{onum}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--coral)' }}>${(parseFloat(o.total) || 0).toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 6, background: o.status === 'completed' ? '#dcfce7' : o.status === 'processing' ? '#dbeafe' : o.status === 'cancelled' || o.status === 'failed' ? '#fee2e2' : '#fef3c7', color: o.status === 'completed' ? '#059669' : o.status === 'processing' ? '#2563eb' : o.status === 'cancelled' || o.status === 'failed' ? '#dc2626' : '#d97706', fontWeight: 600, textTransform: 'capitalize' }}>{o.status}</span>
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
                        {/* Per-order actions */}
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                          <button type="button" onClick={() => openOrderEditor(payload)} style={miniBtn('var(--coral)')}>Edit</button>
                          <button type="button" onClick={() => sendOrderPaymentRequest(payload)} style={miniBtn('#635BFF')}>Payment request</button>
                          <button type="button" onClick={() => generateInvoice(payload)} style={miniBtn('var(--ink)')}>Invoice</button>
                          {payload.pay_link && <button type="button" onClick={() => { navigator.clipboard?.writeText(payload.pay_link!); showToast('Pay link copied') }} style={miniBtn('var(--slate)')}>Copy link</button>}
                        </div>
                      </div>
                    )})}
                  </div>
                  )
                })()}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
